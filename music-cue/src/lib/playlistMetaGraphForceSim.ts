import {
  displayNormalizedToSoloNormalized,
  ownerScopedOverrideKey,
  parseOwnerScopedRegionId,
} from "./isolateClusterLayout";
import type { GraphPoint, NormalizedPoint } from "./types";
import type { PlaylistMetaGraphEdge } from "./playlistMetaGraph";

export type MetaGraphForceNode = {
  regionId: string;
  playlistId: string;
  ownerId: string | null;
  x: number;
  y: number;
  vx: number;
  vy: number;
};

export type MetaGraphForceEdge = {
  sourceIndex: number;
  targetIndex: number;
  weight: number;
};

export type MetaGraphForceSimOptions = {
  repulsionStrength?: number;
  repulsionDistanceScale?: number;
  attractionStrength?: number;
  idealEdgeLength?: number;
  damping?: number;
  maxSpeed?: number;
  centerGravity?: number;
};

const DEFAULT_OPTIONS: Required<MetaGraphForceSimOptions> = {
  repulsionStrength: 42,
  repulsionDistanceScale: 72,
  attractionStrength: 0.018,
  idealEdgeLength: 96,
  damping: 0.9,
  maxSpeed: 14,
  centerGravity: 0.0025,
};

const sech = (value: number): number => 1 / Math.cosh(value);

export const getMetaGraphRegionDisplayCenter = (region: {
  center: GraphPoint;
  displayOffset?: GraphPoint;
}): GraphPoint => ({
  x: region.center.x + (region.displayOffset?.x ?? 0),
  y: region.center.y + (region.displayOffset?.y ?? 0),
});

export const createMetaGraphForceNodes = (
  regions: Array<{ id: string; center: GraphPoint; displayOffset?: GraphPoint }>
): MetaGraphForceNode[] =>
  regions.map((region) => {
    const { ownerId, clusterId } = parseOwnerScopedRegionId(region.id);
    const center = getMetaGraphRegionDisplayCenter(region);
    return {
      regionId: region.id,
      playlistId: clusterId,
      ownerId,
      x: center.x,
      y: center.y,
      vx: 0,
      vy: 0,
    };
  });

export const buildMetaGraphForceEdges = (
  nodes: MetaGraphForceNode[],
  edges: PlaylistMetaGraphEdge[]
): MetaGraphForceEdge[] => {
  const playlistToIndex = new Map<string, number>();
  nodes.forEach((node, index) => {
    playlistToIndex.set(node.playlistId, index);
  });

  const forceEdges: MetaGraphForceEdge[] = [];
  edges.forEach((edge) => {
    const sourceIndex = playlistToIndex.get(edge.leftId);
    const targetIndex = playlistToIndex.get(edge.rightId);
    if (sourceIndex === undefined || targetIndex === undefined || sourceIndex === targetIndex) {
      return;
    }
    forceEdges.push({
      sourceIndex,
      targetIndex,
      weight: edge.sharedSongCount,
    });
  });
  return forceEdges;
};

export const stepMetaGraphForceSim = (
  nodes: MetaGraphForceNode[],
  edges: MetaGraphForceEdge[],
  options: MetaGraphForceSimOptions = {}
): void => {
  const config = { ...DEFAULT_OPTIONS, ...options };
  const count = nodes.length;
  if (count === 0) {
    return;
  }

  const ax = new Float64Array(count);
  const ay = new Float64Array(count);

  let centroidX = 0;
  let centroidY = 0;
  nodes.forEach((node) => {
    centroidX += node.x;
    centroidY += node.y;
  });
  centroidX /= count;
  centroidY /= count;

  for (let leftIndex = 0; leftIndex < count; leftIndex += 1) {
    ax[leftIndex] += (centroidX - nodes[leftIndex].x) * config.centerGravity;
    ay[leftIndex] += (centroidY - nodes[leftIndex].y) * config.centerGravity;
  }

  for (let leftIndex = 0; leftIndex < count; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < count; rightIndex += 1) {
      const dx = nodes[rightIndex].x - nodes[leftIndex].x;
      const dy = nodes[rightIndex].y - nodes[leftIndex].y;
      const distance = Math.hypot(dx, dy) + 0.001;
      const repulsion =
        config.repulsionStrength * sech(distance / config.repulsionDistanceScale);
      const forceX = (repulsion * dx) / distance;
      const forceY = (repulsion * dy) / distance;
      ax[leftIndex] -= forceX;
      ay[leftIndex] -= forceY;
      ax[rightIndex] += forceX;
      ay[rightIndex] += forceY;
    }
  }

  edges.forEach((edge) => {
    const source = nodes[edge.sourceIndex];
    const target = nodes[edge.targetIndex];
    const dx = target.x - source.x;
    const dy = target.y - source.y;
    const distance = Math.hypot(dx, dy) + 0.001;
    const displacement = distance - config.idealEdgeLength;
    const attraction = (config.attractionStrength * edge.weight * displacement) / distance;
    const forceX = attraction * dx;
    const forceY = attraction * dy;
    ax[edge.sourceIndex] += forceX;
    ay[edge.sourceIndex] += forceY;
    ax[edge.targetIndex] -= forceX;
    ay[edge.targetIndex] -= forceY;
  });

  for (let index = 0; index < count; index += 1) {
    let vx = (nodes[index].vx + ax[index]) * config.damping;
    let vy = (nodes[index].vy + ay[index]) * config.damping;
    const speed = Math.hypot(vx, vy);
    if (speed > config.maxSpeed) {
      const scale = config.maxSpeed / speed;
      vx *= scale;
      vy *= scale;
    }
    nodes[index].vx = vx;
    nodes[index].vy = vy;
    nodes[index].x += vx;
    nodes[index].y += vy;
  }
};

type OwnerForceSimContext = {
  bounds: { centroid: GraphPoint; radius: number };
  metaCenter: GraphPoint;
};

export const buildMetaGraphForceSimPlaylistOverrides = (
  nodes: MetaGraphForceNode[],
  dimensions: { width: number; height: number },
  getOwnerContext: (ownerId: string) => OwnerForceSimContext | null
): Record<string, NormalizedPoint> => {
  const updates: Record<string, NormalizedPoint> = {};

  nodes.forEach((node) => {
    const displayNorm: NormalizedPoint = {
      x: node.x / dimensions.width,
      y: node.y / dimensions.height,
    };
    if (node.ownerId) {
      const context = getOwnerContext(node.ownerId);
      if (context) {
        updates[ownerScopedOverrideKey(node.ownerId, node.playlistId)] = displayNormalizedToSoloNormalized(
          displayNorm,
          dimensions,
          context.bounds,
          context.metaCenter
        );
        return;
      }
    }
    updates[node.playlistId] = displayNorm;
  });

  return updates;
};

export const applyMetaGraphForceSimToClusterOverrides = (
  current: ClusterCenterOverrides,
  nodes: MetaGraphForceNode[],
  dimensions: { width: number; height: number },
  getOwnerContext: (ownerId: string) => OwnerForceSimContext | null
): ClusterCenterOverrides => {
  const playlistUpdates = buildMetaGraphForceSimPlaylistOverrides(nodes, dimensions, getOwnerContext);
  return {
    ...current,
    playlist: { ...current.playlist, ...playlistUpdates },
  };
};
