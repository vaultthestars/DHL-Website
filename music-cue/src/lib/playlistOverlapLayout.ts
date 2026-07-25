import { asStringArray, getSongPlaylists } from "./arrayUtils";
import { ClusterCenterOverrides, GraphPoint, LibraryStats, Song } from "./types";
import { UNASSIGNED_PLAYLIST_CLUSTER_ID } from "./playlistConstants";
import { GraphDimensions, resolveClusterCenter } from "./graphLayout";

const GRAPH_PADDING = 48;

const hashUnit = (seed: string, salt = ""): number => {
  let hash = 0;
  for (let index = 0; index < `${seed}:${salt}`.length; index += 1) {
    hash = (hash << 5) - hash + `${seed}:${salt}`.charCodeAt(index);
    hash |= 0;
  }
  return (Math.abs(hash) % 1000) / 1000;
};

const scatterAroundCenter = (song: Song, center: GraphPoint, spread: number): GraphPoint => {
  const angle = hashUnit(song.id, "angle") * Math.PI * 2;
  const radius = Math.sqrt(hashUnit(song.id, "radius")) * spread;
  return {
    x: center.x + radius * Math.cos(angle),
    y: center.y + radius * Math.sin(angle),
  };
};

export type PlaylistOverlapLayoutContext = {
  playlistCenters: Map<string, GraphPoint>;
  unassignedCenter: GraphPoint;
  dimensions: GraphDimensions;
};

let cachedLayoutKey = "";
let cachedLayoutContext: PlaylistOverlapLayoutContext | null = null;

const getDefaultPlaylistCenter = (
  playlistIndex: number,
  playlistCount: number,
  dimensions: GraphDimensions,
  playlistId: string
): GraphPoint => {
  const usableWidth = dimensions.width - GRAPH_PADDING * 2;
  const usableHeight = dimensions.height - GRAPH_PADDING * 2;
  const centerX = GRAPH_PADDING + usableWidth / 2;
  const centerY = GRAPH_PADDING + usableHeight / 2;
  const orbitRadius = Math.min(usableWidth, usableHeight) * 0.48;
  const angle = (playlistIndex / Math.max(1, playlistCount)) * Math.PI * 2 - Math.PI / 2;
  const wobble = (hashUnit(playlistId, "wobble") - 0.5) * 4;
  return {
    x: centerX + orbitRadius * Math.cos(angle) + wobble,
    y: centerY + orbitRadius * Math.sin(angle) + (hashUnit(`${playlistId}-y`, "wobble") - 0.5) * 4,
  };
};

export const getDefaultUnassignedPlaylistCenter = (dimensions: GraphDimensions): GraphPoint => {
  const usableHeight = dimensions.height - GRAPH_PADDING * 2;
  return {
    x: GRAPH_PADDING - 12,
    y: GRAPH_PADDING + usableHeight / 2,
  };
};

const clusterSpread = (dimensions: GraphDimensions, membershipCount = 1): number => {
  const span = Math.min(dimensions.width, dimensions.height);
  return Math.min(span * 0.055, 10 + Math.sqrt(membershipCount) * 2.2);
};

/** Stable point along the segment between two cluster centers (overlap band). */
export const positionSongBetweenTwoClusters = (
  song: Song,
  left: GraphPoint,
  right: GraphPoint
): GraphPoint => {
  const along = 0.12 + hashUnit(song.id, "along") * 0.76;
  const base = {
    x: left.x + along * (right.x - left.x),
    y: left.y + along * (right.y - left.y),
  };
  const dx = right.x - left.x;
  const dy = right.y - left.y;
  const length = Math.hypot(dx, dy);
  if (length < 0.001) {
    return base;
  }
  const jitterAmount = Math.min(10, length * 0.08) * (hashUnit(song.id, "perp") - 0.5);
  return {
    x: base.x - (dy / length) * jitterAmount,
    y: base.y + (dx / length) * jitterAmount,
  };
};

/** Stable point inside the convex hull of 3+ cluster centers via normalized hash weights. */
export const positionSongInClusterSimplex = (song: Song, centers: GraphPoint[]): GraphPoint => {
  if (centers.length === 0) {
    return { x: 0, y: 0 };
  }
  if (centers.length === 1) {
    return centers[0];
  }
  if (centers.length === 2) {
    return positionSongBetweenTwoClusters(song, centers[0], centers[1]);
  }

  const weights = centers.map((_, index) => hashUnit(song.id, `w${index}`) + 0.04);
  const weightSum = weights.reduce((sum, weight) => sum + weight, 0);
  return {
    x: centers.reduce((sum, center, index) => sum + center.x * (weights[index] / weightSum), 0),
    y: centers.reduce((sum, center, index) => sum + center.y * (weights[index] / weightSum), 0),
  };
};

const buildLayoutKey = (
  stats: LibraryStats,
  songs: Song[],
  dimensions: GraphDimensions,
  clusterOverrides: ClusterCenterOverrides
): string =>
  JSON.stringify({
    playlistIds: asStringArray(stats.playlistIds),
    songCount: songs.length,
    dimensions,
    overrides: clusterOverrides.playlist,
  });

export const getPlaylistOverlapLayoutContext = (
  stats: LibraryStats,
  songs: Song[],
  dimensions: GraphDimensions,
  clusterOverrides: ClusterCenterOverrides
): PlaylistOverlapLayoutContext => {
  const layoutKey = buildLayoutKey(stats, songs, dimensions, clusterOverrides);
  if (cachedLayoutKey === layoutKey && cachedLayoutContext) {
    return cachedLayoutContext;
  }

  const playlistIds = asStringArray(stats.playlistIds).slice().sort((left, right) => left.localeCompare(right));
  const playlistCenters = new Map<string, GraphPoint>();

  playlistIds.forEach((playlistId, index) => {
    playlistCenters.set(
      playlistId,
      resolveClusterCenter(
        getDefaultPlaylistCenter(index, playlistIds.length, dimensions, playlistId),
        clusterOverrides.playlist[playlistId],
        dimensions
      )
    );
  });

  const unassignedCenter = resolveClusterCenter(
    getDefaultUnassignedPlaylistCenter(dimensions),
    clusterOverrides.playlist[UNASSIGNED_PLAYLIST_CLUSTER_ID],
    dimensions
  );

  cachedLayoutKey = layoutKey;
  cachedLayoutContext = {
    playlistCenters,
    unassignedCenter,
    dimensions,
  };
  return cachedLayoutContext;
};

export const layoutPlaylistOverlapSong = (
  song: Song,
  context: PlaylistOverlapLayoutContext
): GraphPoint => {
  const memberships = getSongPlaylists(song).filter((playlistId) => context.playlistCenters.has(playlistId));
  if (memberships.length === 0) {
    return scatterAroundCenter(
      song,
      context.unassignedCenter,
      clusterSpread(context.dimensions, 1) * 0.85
    );
  }

  const centers = memberships
    .map((playlistId) => context.playlistCenters.get(playlistId))
    .filter((center): center is GraphPoint => Boolean(center));

  if (centers.length === 0) {
    return scatterAroundCenter(
      song,
      context.unassignedCenter,
      clusterSpread(context.dimensions, 1) * 0.85
    );
  }

  if (centers.length === 1) {
    return scatterAroundCenter(song, centers[0], clusterSpread(context.dimensions, 1));
  }

  if (centers.length === 2) {
    return positionSongBetweenTwoClusters(song, centers[0], centers[1]);
  }

  return positionSongInClusterSimplex(song, centers);
};

export const getPlaylistOverlapLabelCenter = (
  playlistId: string,
  context: PlaylistOverlapLayoutContext
): GraphPoint | null => context.playlistCenters.get(playlistId) ?? null;

export const getPlaylistOverlapClusterCenter = (
  playlistId: string,
  context: PlaylistOverlapLayoutContext
): GraphPoint | null => context.playlistCenters.get(playlistId) ?? null;

export const getUnassignedOverlapCenter = (context: PlaylistOverlapLayoutContext): GraphPoint =>
  context.unassignedCenter;

export const invalidatePlaylistOverlapLayoutCache = (): void => {
  cachedLayoutKey = "";
  cachedLayoutContext = null;
};
