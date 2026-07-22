export type AudioFeatures = {
  acousticness: number;
  danceability: number;
  energy: number;
  instrumentalness: number;
  liveness: number;
  tempo: number;
  valence: number;
};

export type Song = {
  id: string;
  title: string;
  artist: string;
  album: string;
  genre: string;
  year: number;
  yearFromDateAdded?: boolean;
  playCount: number;
  rating: number;
  loved: boolean;
  dateAdded: string;
  trackType: string;
  durationMs: number;
  playlists: string[];
  audioFeatures?: AudioFeatures;
  owners?: Array<{ id: string; name: string }>;
  ownerCount?: number;
};

export type GraphPoint = { x: number; y: number };
export type NormalizedPoint = { x: number; y: number };
export type ClusterCenterOverrides = {
  genre: Record<string, NormalizedPoint>;
  playlist: Record<string, NormalizedPoint>;
  custom: Record<string, NormalizedPoint>;
};

export type ViewMode = "cluster" | "axis";
export type ClusterMode = "genre" | "playlist" | "custom";

export type CustomClusterDefinition = {
  id: string;
  label: string;
  songIds: string[];
  kind?: "label" | "squiggly";
  hull?: NormalizedPoint[];
  color?: string;
  labelPosition?: NormalizedPoint;
};

export type CustomClusterCatalog = {
  clusters: CustomClusterDefinition[];
};
export type AxisMetric =
  | "year"
  | "plays"
  | "acousticness"
  | "danceability"
  | "energy"
  | "instrumentalness"
  | "liveness"
  | "tempo"
  | "valence";

/** @deprecated Use LayoutConfig instead. Kept for stored cue compatibility. */
export type LayoutMode = "genre" | "year" | "plays" | "playlist";

export type LayoutConfig = {
  viewMode: ViewMode;
  clusterMode: ClusterMode;
  axisX: AxisMetric;
  axisY: AxisMetric;
};

export type CueBuildMode = "path" | "manual";
export type GraphToolMode = "navigate" | "draw" | "draw-cluster";
export type PositionResolver = (song: Song) => GraphPoint;

export type GeneratedCue = {
  seed: number;
  songs: Song[];
  stroke: GraphPoint[];
  layoutConfig: LayoutConfig;
  /** @deprecated Use layoutConfig. Kept for in-session cue compatibility. */
  layoutMode?: LayoutMode;
  pathThreshold?: number;
  /** Max songs sampled along the drawn path. Omitted or 0 keeps every match. */
  cueLength?: number;
  buildMode?: CueBuildMode;
};

export type LibraryStats = {
  minYear: number;
  maxYear: number;
  genres: string[];
  genreCounts: Record<string, number>;
  maxPlayCount: number;
  playlistIds: string[];
  playlistNames: Record<string, string>;
  playlistCounts: Record<string, number>;
};

export type PlaybackState = {
  artist: string;
  title: string;
  trackIndex: number;
  playlistName: string;
  persistentId: string;
  playerPosition: number;
};
