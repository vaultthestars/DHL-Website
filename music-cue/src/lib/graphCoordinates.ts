import type { NormalizedPoint } from "./types";

export const GRAPH_PADDING = 48;

export type GraphDimensions = {
  width: number;
  height: number;
};

export const isFiniteGraphPoint = (
  point: { x: number; y: number } | null | undefined
): point is { x: number; y: number } =>
  Boolean(point && Number.isFinite(point.x) && Number.isFinite(point.y));

export const toNormalizedPosition = (
  point: { x: number; y: number },
  dimensions: GraphDimensions
): NormalizedPoint => {
  const usableWidth = dimensions.width - GRAPH_PADDING * 2;
  const usableHeight = dimensions.height - GRAPH_PADDING * 2;
  return {
    x: (point.x - GRAPH_PADDING) / usableWidth,
    y: (point.y - GRAPH_PADDING) / usableHeight,
  };
};

export const fromNormalizedPosition = (
  point: NormalizedPoint,
  dimensions: GraphDimensions
): { x: number; y: number } => {
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

export const clampGraphPoint = (
  point: { x: number; y: number },
  dimensions: GraphDimensions
): { x: number; y: number } => ({
  x: Math.min(dimensions.width - GRAPH_PADDING, Math.max(GRAPH_PADDING, point.x)),
  y: Math.min(dimensions.height - GRAPH_PADDING, Math.max(GRAPH_PADDING, point.y)),
});
