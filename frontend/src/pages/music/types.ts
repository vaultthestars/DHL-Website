export type Song = {
  id: string;
  title: string;
  artist: string;
  youtubeVideoId: string;
  energy: number;
  valence: number;
};

export type GraphPoint = { x: number; y: number };
export type NormalizedPoint = { x: number; y: number };
export type LayoutMode = "auto-sort" | "custom";
export type PositionResolver = (song: Song) => GraphPoint;

export type EncodedCue = {
  v: 1;
  seed: number;
  songIds: string[];
  stroke: [number, number][];
  startId?: string;
  endId?: string;
};

export type GeneratedCue = {
  seed: number;
  songs: Song[];
  stroke: GraphPoint[];
  startId?: string;
  endId?: string;
};
