import type { GraphDimensions } from "./graphLayout";
import type { ClusterViewportHint } from "./clusterRegions";
import type { ViewTransform } from "./graphView";
import type { GraphPoint } from "./types";

export const GRAPH_NODE_CULLING_THRESHOLD = 120;
export const ABSOLUTE_MAX_RENDERED_NODES = 200;

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

const hashUnit = (seed: string, salt = ""): number => {
  let hash = 0;
  const value = salt ? `${salt}:${seed}` : seed;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash << 5) - hash + value.charCodeAt(index);
    hash |= 0;
  }
  return (Math.abs(hash) % 1000) / 1000;
};

export const getZoomNodeRenderBudget = (scale: number, inViewportCount: number): number => {
  if (inViewportCount <= 0) {
    return 0;
  }

  let budget = inViewportCount;
  if (scale >= 0.85) {
    budget = Math.min(inViewportCount, 150);
  } else if (scale >= 0.65) {
    budget = Math.min(inViewportCount, Math.floor(inViewportCount * scale * 0.85));
  } else if (scale >= 0.45) {
    budget = Math.min(inViewportCount, Math.floor(inViewportCount * scale * 0.7));
  } else {
    budget = Math.min(inViewportCount, Math.floor(inViewportCount * scale * 0.5));
  }

  return Math.min(Math.max(budget, scale < 0.45 ? 60 : 100), ABSOLUTE_MAX_RENDERED_NODES);
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

const clusterIntersectsViewport = (
  center: GraphPoint,
  memberCount: number,
  bounds: GraphViewportBounds
): boolean => {
  const pad = Math.max(48, Math.sqrt(memberCount) * 10);
  return (
    center.x + pad >= bounds.minX &&
    center.x - pad <= bounds.maxX &&
    center.y + pad >= bounds.minY &&
    center.y - pad <= bounds.maxY
  );
};

/** Compute layout positions only for viewport-visible songs (cluster hints avoid laying out the full library). */
export const buildCulledPositionedSongs = <T extends { id: string }>(
  songs: T[],
  dimensions: GraphDimensions,
  transform: ViewTransform,
  getPosition: (song: T) => GraphPoint,
  options?: {
    alwaysIncludeSongIds?: Set<string>;
    enableCulling?: boolean;
    clusterHints?: ClusterViewportHint[];
    cullSeed?: string;
  }
): PositionedGraphNode<T>[] => {
  if (songs.length === 0) {
    return [];
  }

  const enableCulling = options?.enableCulling ?? songs.length >= GRAPH_NODE_CULLING_THRESHOLD;
  if (!enableCulling) {
    return songs.map((song) => ({ song, position: getPosition(song) }));
  }

  const bounds = getGraphViewportBounds(dimensions, transform);
  const alwaysInclude = options?.alwaysIncludeSongIds;
  const cullSeed = options?.cullSeed;
  const hashSample = (songId: string): number => hashUnit(songId, cullSeed);
  const songById = new Map(songs.map((song) => [song.id, song]));
  const candidateIds = new Set<string>();

  alwaysInclude?.forEach((songId) => {
    if (songById.has(songId)) {
      candidateIds.add(songId);
    }
  });

  const clusterHints = options?.clusterHints;
  if (clusterHints && clusterHints.length > 0) {
    clusterHints.forEach((hint) => {
      if (!clusterIntersectsViewport(hint.center, hint.songIds.length, bounds)) {
        return;
      }
      hint.songIds.forEach((songId) => candidateIds.add(songId));
    });
  } else {
    songs.forEach((song) => candidateIds.add(song.id));
  }

  const budget = getZoomNodeRenderBudget(transform.scale, candidateIds.size);
  const required: T[] = [];
  const optional: T[] = [];

  candidateIds.forEach((songId) => {
    const song = songById.get(songId);
    if (!song) {
      return;
    }
    if (alwaysInclude?.has(songId)) {
      required.push(song);
    } else {
      optional.push(song);
    }
  });

  const optionalBudget = Math.max(0, budget - required.length);
  const sampledOptional =
    optionalBudget >= optional.length
      ? optional
      : optional
          .map((song) => ({ song, unit: hashSample(song.id) }))
          .sort((left, right) => left.unit - right.unit)
          .slice(0, optionalBudget)
          .map((entry) => entry.song);

  const seen = new Set<string>();
  const toPosition: T[] = [];
  [...required, ...sampledOptional].forEach((song) => {
    if (seen.has(song.id)) {
      return;
    }
    seen.add(song.id);
    toPosition.push(song);
  });

  return toPosition.map((song) => ({ song, position: getPosition(song) }));
};
