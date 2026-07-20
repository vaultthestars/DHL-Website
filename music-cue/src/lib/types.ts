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
};

export type GraphPoint = { x: number; y: number };
export type NormalizedPoint = { x: number; y: number };
export type ClusterCenterOverrides = {
  genre: Record<string, NormalizedPoint>;
  playlist: Record<string, NormalizedPoint>;
};
export type LayoutMode = "genre" | "year" | "plays" | "playlist";
export type CueBuildMode = "path" | "manual";
export type PositionResolver = (song: Song) => GraphPoint;

export type GeneratedCue = {
  seed: number;
  songs: Song[];
  stroke: GraphPoint[];
  layoutMode: LayoutMode;
  pathThreshold?: number;
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
