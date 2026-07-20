import { MusicServiceId } from "./musicProvider";
import { AxisMetric, ClusterMode, LayoutConfig, LibraryStats, Song } from "./types";

export const APPLE_AXIS_METRICS: AxisMetric[] = ["year", "plays"];
export const SPOTIFY_AXIS_METRICS: AxisMetric[] = ["year"];

export const AXIS_METRIC_LABELS: Record<AxisMetric, string> = {
  year: "Year",
  plays: "Plays",
  acousticness: "Acousticness",
  danceability: "Danceability",
  energy: "Energy",
  instrumentalness: "Instrumentalness",
  liveness: "Liveness",
  tempo: "Tempo",
  valence: "Valence",
};

export const getAxisMetricLabel = (metric: AxisMetric, serviceId: MusicServiceId): string =>
  AXIS_METRIC_LABELS[metric];

export const getAxisMetricsForService = (serviceId: MusicServiceId): AxisMetric[] =>
  serviceId === "spotify" ? SPOTIFY_AXIS_METRICS : APPLE_AXIS_METRICS;

export const getClusterModesForService = (serviceId: MusicServiceId): ClusterMode[] =>
  serviceId === "spotify" ? ["playlist"] : ["genre", "playlist"];

export const defaultLayoutConfig = (serviceId: MusicServiceId): LayoutConfig =>
  serviceId === "spotify"
    ? { viewMode: "cluster", clusterMode: "playlist", axisX: "year", axisY: "year" }
    : { viewMode: "cluster", clusterMode: "genre", axisX: "year", axisY: "plays" };

export const layoutConfigKey = (config: LayoutConfig): string =>
  `${config.viewMode}:${config.clusterMode}:${config.axisX}:${config.axisY}`;

export const isClusterView = (config: LayoutConfig): boolean => config.viewMode === "cluster";

export const getMetricValue = (song: Song, metric: AxisMetric): number | null => {
  if (metric === "year") {
    return song.year;
  }
  if (metric === "plays") {
    return song.playCount;
  }
  const features = song.audioFeatures;
  if (!features) {
    return null;
  }
  return features[metric];
};

export const getMetricRange = (
  songs: Song[],
  metric: AxisMetric,
  stats: LibraryStats
): { min: number; max: number } => {
  if (metric === "year") {
    return { min: stats.minYear, max: stats.maxYear };
  }
  if (metric === "plays") {
    return { min: 0, max: Math.max(1, stats.maxPlayCount) };
  }
  const values = songs
    .map((song) => getMetricValue(song, metric))
    .filter((value): value is number => value !== null && Number.isFinite(value));
  if (values.length === 0) {
    return metric === "tempo" ? { min: 60, max: 180 } : { min: 0, max: 1 };
  }
  return { min: Math.min(...values), max: Math.max(...values) };
};

export const normalizeMetricValue = (
  value: number,
  metric: AxisMetric,
  range: { min: number; max: number }
): number => {
  const span = Math.max(range.max - range.min, metric === "tempo" ? 1 : 0.001);
  return Math.min(1, Math.max(0, (value - range.min) / span));
};

export const migrateLegacyLayoutMode = (
  stored: string | null,
  serviceId: MusicServiceId
): LayoutConfig => {
  const defaults = defaultLayoutConfig(serviceId);
  if (!stored) {
    return defaults;
  }
  if (stored.startsWith("{")) {
    try {
      const parsed = JSON.parse(stored) as Partial<LayoutConfig>;
      const allowedMetrics = getAxisMetricsForService(serviceId);
      return {
        viewMode: parsed.viewMode === "axis" ? "axis" : "cluster",
        clusterMode:
          parsed.clusterMode === "playlist" || (serviceId === "spotify" && parsed.clusterMode !== "genre")
            ? "playlist"
            : "genre",
        axisX: allowedMetrics.includes(parsed.axisX as AxisMetric)
          ? (parsed.axisX as AxisMetric)
          : defaults.axisX,
        axisY: allowedMetrics.includes(parsed.axisY as AxisMetric)
          ? (parsed.axisY as AxisMetric)
          : defaults.axisY,
      };
    } catch {
      return defaults;
    }
  }
  if (stored === "genre" || stored === "genre-year" || stored === "custom") {
    return { ...defaults, viewMode: "cluster", clusterMode: "genre" };
  }
  if (stored === "playlist") {
    return { ...defaults, viewMode: "cluster", clusterMode: "playlist" };
  }
  if (stored === "year" || stored === "year-playcount") {
    return {
      ...defaults,
      viewMode: "axis",
      axisX: "year",
      axisY: serviceId === "spotify" ? "year" : "plays",
    };
  }
  if (stored === "plays") {
    return {
      ...defaults,
      viewMode: "axis",
      axisX: serviceId === "spotify" ? "year" : "plays",
      axisY: serviceId === "spotify" ? "year" : "year",
    };
  }
  return defaults;
};
