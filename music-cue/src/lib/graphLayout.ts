import { ClusterCenterOverrides, LayoutConfig, LibraryStats, NormalizedPoint, Song } from "./types";
import {
  getAxisMetricLabel,
  getMetricRange,
  getMetricValue,
  isClusterView,
  normalizeMetricValue,
} from "./layoutMetrics";
import {
  getPlaylistOverlapLayoutContext,
  layoutPlaylistOverlapSong,
} from "./playlistOverlapLayout";

const GRAPH_PADDING = 48;

export type GraphDimensions = {
  width: number;
  height: number;
};

const clamp01 = (value: number): number => Math.min(1, Math.max(0, value));

const hashString = (value: string): number => {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash << 5) - hash + value.charCodeAt(index);
    hash |= 0;
  }
  return Math.abs(hash);
};

const jitter = (seed: string, amplitude: number): number => {
  const unit = (hashString(seed) % 1000) / 1000;
  return (unit - 0.5) * amplitude;
};

const hashUnit = (seed: string, salt = ""): number => (hashString(`${seed}:${salt}`) % 1000) / 1000;

export const toNormalizedPosition = (point: { x: number; y: number }, dimensions: GraphDimensions): NormalizedPoint => {
  const usableWidth = dimensions.width - GRAPH_PADDING * 2;
  const usableHeight = dimensions.height - GRAPH_PADDING * 2;
  return {
    x: (point.x - GRAPH_PADDING) / usableWidth,
    y: (point.y - GRAPH_PADDING) / usableHeight,
  };
};

export const fromNormalizedPosition = (point: NormalizedPoint, dimensions: GraphDimensions): { x: number; y: number } => {
  const usableWidth = dimensions.width - GRAPH_PADDING * 2;
  const usableHeight = dimensions.height - GRAPH_PADDING * 2;
  return {
    x: GRAPH_PADDING + point.x * usableWidth,
    y: GRAPH_PADDING + point.y * usableHeight,
  };
};

export const resolveClusterCenter = (
  defaultCenter: { x: number; y: number },
  override: NormalizedPoint | undefined,
  dimensions: GraphDimensions
): { x: number; y: number } => (override ? fromNormalizedPosition(override, dimensions) : defaultCenter);

export const clampGraphPoint = (point: { x: number; y: number }, dimensions: GraphDimensions): { x: number; y: number } => ({
  x: Math.min(dimensions.width - GRAPH_PADDING, Math.max(GRAPH_PADDING, point.x)),
  y: Math.min(dimensions.height - GRAPH_PADDING, Math.max(GRAPH_PADDING, point.y)),
});

const yearToX = (year: number, stats: LibraryStats, dimensions: GraphDimensions): number => {
  const usableWidth = dimensions.width - GRAPH_PADDING * 2;
  const span = Math.max(1, stats.maxYear - stats.minYear);
  return GRAPH_PADDING + ((year - stats.minYear) / span) * usableWidth;
};

const playCountToX = (playCount: number, stats: LibraryStats, dimensions: GraphDimensions): number => {
  const usableWidth = dimensions.width - GRAPH_PADDING * 2;
  const normalized = Math.log10(playCount + 1) / Math.log10(stats.maxPlayCount + 1);
  return GRAPH_PADDING + normalized * usableWidth;
};

const playsTimelinePosition = (
  song: Song,
  stats: LibraryStats,
  dimensions: GraphDimensions
): { x: number; y: number } => {
  const usableHeight = dimensions.height - GRAPH_PADDING * 2;
  return {
    x: playCountToX(song.playCount, stats, dimensions),
    y: GRAPH_PADDING + usableHeight / 2 + jitter(song.id, usableHeight * 0.42),
  };
};

const getClusterCenter = (
  clusterIndex: number,
  clusterCount: number,
  dimensions: GraphDimensions,
  wobbleSeed: string,
  options?: { orbitScale?: number; wobbleScale?: number }
): { x: number; y: number } => {
  const usableWidth = dimensions.width - GRAPH_PADDING * 2;
  const usableHeight = dimensions.height - GRAPH_PADDING * 2;
  const centerX = GRAPH_PADDING + usableWidth / 2;
  const centerY = GRAPH_PADDING + usableHeight / 2;
  const orbitScale = options?.orbitScale ?? 0.34;
  const wobbleScale = options?.wobbleScale ?? 1;
  const orbitRadius = Math.min(usableWidth, usableHeight) * orbitScale;
  const angle = (clusterIndex / Math.max(1, clusterCount)) * Math.PI * 2 - Math.PI / 2;
  const wobble = jitter(wobbleSeed, 18 * wobbleScale);
  return {
    x: centerX + orbitRadius * Math.cos(angle) + wobble,
    y: centerY + orbitRadius * Math.sin(angle) + jitter(`${wobbleSeed}-y`, 18 * wobbleScale),
  };
};

export const getDefaultGenreClusterCenter = (
  genre: string,
  stats: LibraryStats,
  dimensions: GraphDimensions
): { x: number; y: number } => {
  const genreIndex = Math.max(0, stats.genres.indexOf(genre));
  return getClusterCenter(genreIndex, stats.genres.length, dimensions, genre, {
    orbitScale: 0.44,
    wobbleScale: 0.45,
  });
};

export const getDefaultPlaylistClusterCenter = (
  playlistId: string,
  stats: LibraryStats,
  dimensions: GraphDimensions
): { x: number; y: number } => {
  const playlistIds = stats.playlistIds ?? [];
  const playlistIndex = Math.max(0, playlistIds.indexOf(playlistId));
  const wobbleSeed = stats.playlistNames?.[playlistId] ?? playlistId;
  return getClusterCenter(playlistIndex, playlistIds.length, dimensions, wobbleSeed, {
    orbitScale: 0.46,
    wobbleScale: 0.35,
  });
};

const getResolvedGenreClusterCenter = (
  genre: string,
  stats: LibraryStats,
  dimensions: GraphDimensions,
  clusterOverrides: ClusterCenterOverrides
): { x: number; y: number } =>
  resolveClusterCenter(
    getDefaultGenreClusterCenter(genre, stats, dimensions),
    clusterOverrides.genre[genre],
    dimensions
  );

const getClusterSpread = (
  memberCount: number,
  dimensions: GraphDimensions,
  options?: { baseScale?: number; maxScale?: number; sizeBoostScale?: number }
): number => {
  const usableWidth = dimensions.width - GRAPH_PADDING * 2;
  const usableHeight = dimensions.height - GRAPH_PADDING * 2;
  const baseScale = options?.baseScale ?? 0.08;
  const maxScale = options?.maxScale ?? 0.16;
  const sizeBoostScale = options?.sizeBoostScale ?? 4;
  const base = Math.min(usableWidth, usableHeight) * baseScale;
  const sizeBoost = Math.sqrt(memberCount) * sizeBoostScale;
  return Math.min(base + sizeBoost, Math.min(usableWidth, usableHeight) * maxScale);
};

const getGenreClusterSpread = (genre: string, stats: LibraryStats, dimensions: GraphDimensions): number =>
  getClusterSpread(stats.genreCounts[genre] ?? 1, dimensions, {
    baseScale: 0.11,
    maxScale: 0.22,
    sizeBoostScale: 5.5,
  });

const scatterAroundCenter = (
  song: Song,
  center: { x: number; y: number },
  spread: number
): { x: number; y: number } => {
  const angle = hashUnit(song.id, "angle") * Math.PI * 2;
  const radius = Math.sqrt(hashUnit(song.id, "radius")) * spread;
  return {
    x: center.x + radius * Math.cos(angle),
    y: center.y + radius * Math.sin(angle),
  };
};

const genreClusterPosition = (
  song: Song,
  stats: LibraryStats,
  dimensions: GraphDimensions,
  clusterOverrides: ClusterCenterOverrides
): { x: number; y: number } => {
  const center = getResolvedGenreClusterCenter(song.genre, stats, dimensions, clusterOverrides);
  const spread = getGenreClusterSpread(song.genre, stats, dimensions);
  return scatterAroundCenter(song, center, spread);
};

export const getUnassignedPlaylistCenter = (dimensions: GraphDimensions): { x: number; y: number } => {
  const usableHeight = dimensions.height - GRAPH_PADDING * 2;
  return {
    x: GRAPH_PADDING - 12,
    y: GRAPH_PADDING + usableHeight / 2,
  };
};

const playlistClusterPosition = (
  song: Song,
  stats: LibraryStats,
  dimensions: GraphDimensions,
  clusterOverrides: ClusterCenterOverrides,
  songs: Song[]
): { x: number; y: number } => {
  const context = getPlaylistOverlapLayoutContext(stats, songs, dimensions, clusterOverrides);
  return layoutPlaylistOverlapSong(song, context);
};

const yearTimelinePosition = (
  song: Song,
  stats: LibraryStats,
  dimensions: GraphDimensions
): { x: number; y: number } => {
  const usableHeight = dimensions.height - GRAPH_PADDING * 2;
  return {
    x: yearToX(song.year, stats, dimensions),
    y: GRAPH_PADDING + usableHeight / 2 + jitter(song.id, usableHeight * 0.42),
  };
};

export const EMPTY_CLUSTER_OVERRIDES: ClusterCenterOverrides = {
  genre: {},
  playlist: {},
};

const axisMetricPosition = (
  song: Song,
  layoutConfig: LayoutConfig,
  stats: LibraryStats,
  dimensions: GraphDimensions,
  songs: Song[]
): { x: number; y: number } => {
  if (layoutConfig.axisX === "year" && layoutConfig.axisY === "year") {
    return yearTimelinePosition(song, stats, dimensions);
  }

  const usableWidth = dimensions.width - GRAPH_PADDING * 2;
  const usableHeight = dimensions.height - GRAPH_PADDING * 2;
  const xRange = getMetricRange(songs, layoutConfig.axisX, stats);
  const yRange = getMetricRange(songs, layoutConfig.axisY, stats);
  const rawX = getMetricValue(song, layoutConfig.axisX);
  const rawY = getMetricValue(song, layoutConfig.axisY);
  const normalizedX =
    rawX === null ? hashUnit(song.id, "missing-x") : normalizeMetricValue(rawX, layoutConfig.axisX, xRange);
  const normalizedY =
    rawY === null ? hashUnit(song.id, "missing-y") : normalizeMetricValue(rawY, layoutConfig.axisY, yRange);
  const jitterScale = 0.025;
  return {
    x: GRAPH_PADDING + normalizedX * usableWidth + jitter(song.id, usableWidth * jitterScale),
    y: GRAPH_PADDING + (1 - normalizedY) * usableHeight + jitter(`${song.id}-y`, usableHeight * jitterScale),
  };
};

export const layoutSongPosition = (
  song: Song,
  dimensions: GraphDimensions,
  layoutConfig: LayoutConfig,
  stats: LibraryStats,
  customPositions: Record<string, NormalizedPoint>,
  clusterOverrides: ClusterCenterOverrides = EMPTY_CLUSTER_OVERRIDES,
  songs: Song[] = []
): { x: number; y: number } => {
  if (!isClusterView(layoutConfig)) {
    return axisMetricPosition(song, layoutConfig, stats, dimensions, songs);
  }

  if (layoutConfig.clusterMode === "playlist") {
    return playlistClusterPosition(song, stats, dimensions, clusterOverrides, songs);
  }

  return genreClusterPosition(song, stats, dimensions, clusterOverrides);
};

export const buildInitialCustomPositions = (
  songs: Song[],
  dimensions: GraphDimensions,
  stats: LibraryStats
): Record<string, NormalizedPoint> => {
  const positions: Record<string, NormalizedPoint> = {};
  songs.forEach((song) => {
    const point = layoutSongPosition(
      song,
      dimensions,
      { viewMode: "cluster", clusterMode: "genre", axisX: "year", axisY: "plays" },
      stats,
      {},
      EMPTY_CLUSTER_OVERRIDES
    );
    positions[song.id] = toNormalizedPosition(point, dimensions);
  });
  return positions;
};

export const getLayoutAxisLabels = (
  layoutConfig: LayoutConfig,
  serviceId: MusicServiceId = "apple-music"
): { x: string; y: string } => {
  if (isClusterView(layoutConfig)) {
    return {
      x: layoutConfig.clusterMode === "playlist" ? "playlist overlap clusters" : "",
      y: "",
    };
  }
  if (layoutConfig.axisX === "year" && layoutConfig.axisY === "year") {
    return { x: "Year →", y: "" };
  }
  return {
    x: `${getAxisMetricLabel(layoutConfig.axisX, serviceId)} →`,
    y: `${getAxisMetricLabel(layoutConfig.axisY, serviceId)} →`,
  };
};
