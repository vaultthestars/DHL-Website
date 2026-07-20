import { GraphPoint, LayoutMode, NormalizedPoint } from "./types";

const GRAPH_PADDING = 48;

export type GraphDimensions = {
  width: number;
  height: number;
};

export const autoSortSongPosition = (
  song: { energy: number; valence: number },
  dimensions: GraphDimensions
): GraphPoint => {
  const usableWidth = dimensions.width - GRAPH_PADDING * 2;
  const usableHeight = dimensions.height - GRAPH_PADDING * 2;
  return {
    x: GRAPH_PADDING + song.valence * usableWidth,
    y: GRAPH_PADDING + (1 - song.energy) * usableHeight,
  };
};

export const toNormalizedPosition = (point: GraphPoint, dimensions: GraphDimensions): NormalizedPoint => {
  const usableWidth = dimensions.width - GRAPH_PADDING * 2;
  const usableHeight = dimensions.height - GRAPH_PADDING * 2;
  return {
    x: Math.min(1, Math.max(0, (point.x - GRAPH_PADDING) / usableWidth)),
    y: Math.min(1, Math.max(0, (point.y - GRAPH_PADDING) / usableHeight)),
  };
};

export const fromNormalizedPosition = (
  point: NormalizedPoint,
  dimensions: GraphDimensions
): GraphPoint => {
  const usableWidth = dimensions.width - GRAPH_PADDING * 2;
  const usableHeight = dimensions.height - GRAPH_PADDING * 2;
  return {
    x: GRAPH_PADDING + point.x * usableWidth,
    y: GRAPH_PADDING + point.y * usableHeight,
  };
};

export const resolveSongPosition = (
  song: { id: string; energy: number; valence: number },
  dimensions: GraphDimensions,
  layoutMode: LayoutMode,
  customPositions: Record<string, NormalizedPoint>
): GraphPoint => {
  if (layoutMode === "custom" && customPositions[song.id]) {
    return fromNormalizedPosition(customPositions[song.id], dimensions);
  }
  return autoSortSongPosition(song, dimensions);
};

export const buildInitialCustomPositions = (
  songs: { id: string; energy: number; valence: number }[],
  dimensions: GraphDimensions
): Record<string, NormalizedPoint> => {
  const positions: Record<string, NormalizedPoint> = {};
  songs.forEach((song) => {
    positions[song.id] = toNormalizedPosition(autoSortSongPosition(song, dimensions), dimensions);
  });
  return positions;
};

export const clampGraphPoint = (point: GraphPoint, dimensions: GraphDimensions): GraphPoint => ({
  x: Math.min(dimensions.width - GRAPH_PADDING, Math.max(GRAPH_PADDING, point.x)),
  y: Math.min(dimensions.height - GRAPH_PADDING, Math.max(GRAPH_PADDING, point.y)),
});
