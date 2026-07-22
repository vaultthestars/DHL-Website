import type { GraphDimensions } from "./graphLayout";
import type { ViewTransform } from "./graphView";
import type { GraphPoint } from "./types";

export const GRAPH_NODE_CULLING_THRESHOLD = 200;

export type GraphViewportBounds = {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
};

export type PositionedGraphNode<T> = {
  song: T;
  position: GraphPoint;
};

const VIEWPORT_PADDING_PX = 28;

export const getGraphViewportBounds = (
  dimensions: GraphDimensions,
  transform: ViewTransform,
  paddingPx = VIEWPORT_PADDING_PX
): GraphViewportBounds => {
  const scale = Math.max(transform.scale, 0.001);
  const padGraph = paddingPx / scale;
  return {
    minX: -transform.panX / scale - padGraph,
    minY: -transform.panY / scale - padGraph,
    maxX: (dimensions.width - transform.panX) / scale + padGraph,
    maxY: (dimensions.height - transform.panY) / scale + padGraph,
  };
};

export const isPointInGraphViewport = (point: GraphPoint, bounds: GraphViewportBounds): boolean =>
  point.x >= bounds.minX &&
  point.x <= bounds.maxX &&
  point.y >= bounds.minY &&
  point.y <= bounds.maxY;

const hashUnit = (seed: string): number => {
  let hash = 0;
  for (let index = 0; index < seed.length; index += 1) {
    hash = (hash << 5) - hash + seed.charCodeAt(index);
    hash |= 0;
  }
  return (Math.abs(hash) % 1000) / 1000;
};

export const getZoomNodeRenderBudget = (scale: number, inViewportCount: number): number => {
  if (inViewportCount <= 0) {
    return 0;
  }
  if (scale >= 0.9) {
    return inViewportCount;
  }
  if (scale >= 0.7) {
    return Math.min(inViewportCount, Math.max(350, Math.floor(inViewportCount * scale)));
  }
  if (scale >= 0.5) {
    return Math.min(inViewportCount, Math.max(220, Math.floor(inViewportCount * scale * 0.85)));
  }
  return Math.min(inViewportCount, Math.max(120, Math.floor(inViewportCount * scale * 0.65)));
};

export const cullPositionedGraphNodes = <T extends { id: string }>(
  nodes: PositionedGraphNode<T>[],
  dimensions: GraphDimensions,
  transform: ViewTransform,
  options?: {
    alwaysIncludeSongIds?: Set<string>;
    enableCulling?: boolean;
  }
): PositionedGraphNode<T>[] => {
  if (nodes.length === 0) {
    return nodes;
  }

  const enableCulling = options?.enableCulling ?? nodes.length >= GRAPH_NODE_CULLING_THRESHOLD;
  if (!enableCulling) {
    return nodes;
  }

  const bounds = getGraphViewportBounds(dimensions, transform);
  const alwaysInclude = options?.alwaysIncludeSongIds;
  const inViewport: PositionedGraphNode<T>[] = [];

  nodes.forEach((node) => {
    if (isPointInGraphViewport(node.position, bounds) || alwaysInclude?.has(node.song.id)) {
      inViewport.push(node);
    }
  });

  const budget = getZoomNodeRenderBudget(transform.scale, inViewport.length);
  if (inViewport.length <= budget) {
    return inViewport;
  }

  const required: PositionedGraphNode<T>[] = [];
  const optional: PositionedGraphNode<T>[] = [];
  inViewport.forEach((node) => {
    if (alwaysInclude?.has(node.song.id)) {
      required.push(node);
    } else {
      optional.push(node);
    }
  });

  const optionalBudget = Math.max(0, budget - required.length);
  if (optionalBudget >= optional.length) {
    return [...required, ...optional];
  }

  const sampledOptional = optional
    .map((node) => ({ node, unit: hashUnit(node.song.id) }))
    .sort((left, right) => left.unit - right.unit)
    .slice(0, optionalBudget)
    .map((entry) => entry.node);

  return [...required, ...sampledOptional];
};
