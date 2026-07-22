import type { GraphDimensions } from "./graphLayout";
import type { GraphPoint, Song } from "./types";

const GRAPH_PADDING = 48;

const hashUnit = (seed: string, salt = ""): number => {
  let hash = 0;
  const value = `${seed}:${salt}`;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash << 5) - hash + value.charCodeAt(index);
    hash |= 0;
  }
  return (Math.abs(hash) % 1000) / 1000;
};

export type PlaylistMetaGraphLayoutOptions = {
  spreadFactor?: number;
  forceIterations?: number;
};

const degree = (adjacency: Map<string, Set<string>>, playlistId: string): number =>
  adjacency.get(playlistId)?.size ?? 0;

/** Undirected graph: edge between playlists that share at least one song. */
export const buildPlaylistCooccurrenceGraph = (
  playlistIds: string[],
  songs: Song[]
): Map<string, Set<string>> => {
  const adjacency = new Map<string, Set<string>>();
  playlistIds.forEach((playlistId) => adjacency.set(playlistId, new Set()));

  songs.forEach((song) => {
    const memberships = (song.playlists ?? []).filter((playlistId) => adjacency.has(playlistId));
    for (let leftIndex = 0; leftIndex < memberships.length; leftIndex += 1) {
      for (let rightIndex = leftIndex + 1; rightIndex < memberships.length; rightIndex += 1) {
        const leftId = memberships[leftIndex];
        const rightId = memberships[rightIndex];
        adjacency.get(leftId)?.add(rightId);
        adjacency.get(rightId)?.add(leftId);
      }
    }
  });

  return adjacency;
};

const walkAppendageSubtree = (
  leafId: string,
  adjacency: Map<string, Set<string>>,
  coreNodes: Set<string>
): string[] => {
  const subtree: string[] = [];
  let current: string | null = leafId;
  const visited = new Set<string>();

  while (current && !visited.has(current)) {
    visited.add(current);
    subtree.push(current);
    const neighbors = [...(adjacency.get(current) ?? [])].filter((neighbor) => !visited.has(neighbor));
    if (neighbors.length === 0) {
      break;
    }
    if (neighbors.length > 1) {
      break;
    }
    const next = neighbors[0];
    if (coreNodes.has(next) || degree(adjacency, next) > 2) {
      break;
    }
    current = next;
  }

  return subtree;
};

const identifyCoreNodes = (
  adjacency: Map<string, Set<string>>,
  playlistIds: string[]
): Set<string> => {
  const coreNodes = new Set<string>();
  playlistIds.forEach((playlistId) => {
    if (degree(adjacency, playlistId) >= 3) {
      coreNodes.add(playlistId);
    }
  });

  const appendageNodes = new Set<string>();
  playlistIds
    .filter((playlistId) => degree(adjacency, playlistId) === 1)
    .forEach((leafId) => {
      if (coreNodes.has(leafId)) {
        return;
      }
      const subtree = walkAppendageSubtree(leafId, adjacency, coreNodes);
      if (subtree.length <= 1) {
        return;
      }
      subtree.slice(0, -1).forEach((nodeId) => appendageNodes.add(nodeId));
      const attachment = subtree[subtree.length - 1];
      if (!coreNodes.has(attachment) && degree(adjacency, attachment) <= 2) {
        appendageNodes.add(attachment);
      }
    });

  playlistIds.forEach((playlistId) => {
    if (!appendageNodes.has(playlistId)) {
      coreNodes.add(playlistId);
    }
  });

  return coreNodes;
};

const initialCircularPositions = (
  playlistIds: string[],
  dimensions: GraphDimensions,
  center: GraphPoint,
  radius: number
): Map<string, GraphPoint> => {
  const positions = new Map<string, GraphPoint>();
  playlistIds.forEach((playlistId, index) => {
    const angle = (index / Math.max(1, playlistIds.length)) * Math.PI * 2 - Math.PI / 2;
    const wobble = (hashUnit(playlistId, "wobble") - 0.5) * radius * 0.08;
    positions.set(playlistId, {
      x: center.x + (radius + wobble) * Math.cos(angle),
      y: center.y + (radius + wobble) * Math.sin(angle),
    });
  });
  return positions;
};

const centroidOf = (positions: Map<string, GraphPoint>, playlistIds: string[]): GraphPoint => {
  if (playlistIds.length === 0) {
    return { x: 0, y: 0 };
  }
  let x = 0;
  let y = 0;
  playlistIds.forEach((playlistId) => {
    const point = positions.get(playlistId);
    if (!point) {
      return;
    }
    x += point.x;
    y += point.y;
  });
  return { x: x / playlistIds.length, y: y / playlistIds.length };
};

const flipAppendagesOutward = (
  positions: Map<string, GraphPoint>,
  adjacency: Map<string, Set<string>>,
  playlistIds: string[],
  coreNodes: Set<string>,
  coreCentroid: GraphPoint,
  dimensions: GraphDimensions,
  spreadFactor: number
): void => {
  const minSpan = Math.min(
    dimensions.width - GRAPH_PADDING * 2,
    dimensions.height - GRAPH_PADDING * 2
  );
  const pushDistance = minSpan * 0.08 * spreadFactor;

  playlistIds
    .filter((playlistId) => degree(adjacency, playlistId) === 1 && !coreNodes.has(playlistId))
    .forEach((leafId) => {
      const subtree = walkAppendageSubtree(leafId, adjacency, coreNodes);
      if (subtree.length < 2) {
        return;
      }

      const anchorId = subtree[subtree.length - 1];
      const anchorPosition = positions.get(anchorId) ?? coreCentroid;
      const direction = normalizeVector({
        x: anchorPosition.x - coreCentroid.x,
        y: anchorPosition.y - coreCentroid.y,
      });
      if (direction.x === 0 && direction.y === 0) {
        const angle = hashUnit(leafId, "appendage") * Math.PI * 2;
        direction.x = Math.cos(angle);
        direction.y = Math.sin(angle);
      }

      subtree.slice(0, -1).forEach((nodeId, depth) => {
        const point = positions.get(nodeId);
        if (!point) {
          return;
        }
        const scale = pushDistance * (1 + depth * 0.65);
        positions.set(nodeId, {
          x: point.x + direction.x * scale,
          y: point.y + direction.y * scale,
        });
      });
    });
};

const normalizeVector = (vector: GraphPoint): GraphPoint => {
  const length = Math.hypot(vector.x, vector.y);
  if (length < 0.001) {
    return { x: 0, y: 0 };
  }
  return { x: vector.x / length, y: vector.y / length };
};

const runForceSimulation = (
  positions: Map<string, GraphPoint>,
  adjacency: Map<string, Set<string>>,
  playlistIds: string[],
  dimensions: GraphDimensions,
  iterations: number,
  spreadFactor: number
): void => {
  const minDimension = Math.min(dimensions.width, dimensions.height);
  const repulsion = minDimension * 0.022 * spreadFactor;
  const attraction = 0.085;
  const idealLength = minDimension * 0.14 * spreadFactor;
  const damping = 0.28;

  for (let iteration = 0; iteration < iterations; iteration += 1) {
    const forces = new Map<string, GraphPoint>();
    playlistIds.forEach((playlistId) => forces.set(playlistId, { x: 0, y: 0 }));

    for (let leftIndex = 0; leftIndex < playlistIds.length; leftIndex += 1) {
      for (let rightIndex = leftIndex + 1; rightIndex < playlistIds.length; rightIndex += 1) {
        const leftId = playlistIds[leftIndex];
        const rightId = playlistIds[rightIndex];
        const leftPosition = positions.get(leftId);
        const rightPosition = positions.get(rightId);
        if (!leftPosition || !rightPosition) {
          continue;
        }
        const dx = leftPosition.x - rightPosition.x;
        const dy = leftPosition.y - rightPosition.y;
        const distance = Math.hypot(dx, dy) || 1;
        const force = repulsion / (distance * distance);
        const fx = (dx / distance) * force;
        const fy = (dy / distance) * force;
        forces.get(leftId)!.x += fx;
        forces.get(leftId)!.y += fy;
        forces.get(rightId)!.x -= fx;
        forces.get(rightId)!.y -= fy;
      }
    }

    playlistIds.forEach((playlistId) => {
      const neighbors = adjacency.get(playlistId) ?? new Set<string>();
      neighbors.forEach((neighborId) => {
        if (playlistId >= neighborId) {
          return;
        }
        const leftPosition = positions.get(playlistId);
        const rightPosition = positions.get(neighborId);
        if (!leftPosition || !rightPosition) {
          return;
        }
        const dx = rightPosition.x - leftPosition.x;
        const dy = rightPosition.y - leftPosition.y;
        const distance = Math.hypot(dx, dy) || 1;
        const force = (distance - idealLength) * attraction;
        const fx = (dx / distance) * force;
        const fy = (dy / distance) * force;
        forces.get(playlistId)!.x += fx;
        forces.get(playlistId)!.y += fy;
        forces.get(neighborId)!.x -= fx;
        forces.get(neighborId)!.y -= fy;
      });
    });

    playlistIds.forEach((playlistId) => {
      const position = positions.get(playlistId);
      const force = forces.get(playlistId);
      if (!position || !force) {
        return;
      }
      positions.set(playlistId, {
        x: clamp(position.x + force.x * damping, GRAPH_PADDING, dimensions.width - GRAPH_PADDING),
        y: clamp(position.y + force.y * damping, GRAPH_PADDING, dimensions.height - GRAPH_PADDING),
      });
    });
  }
};

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

/**
 * Suggested playlist cluster centers from co-occurrence meta-graph:
 * seed layout → flip pendant appendages outward → light force repulsion.
 * Polynomial time (~51 playlists max for most users).
 */
export const computeSpacedPlaylistCenters = (
  playlistIds: string[],
  songs: Song[],
  dimensions: GraphDimensions,
  options: PlaylistMetaGraphLayoutOptions = {}
): Map<string, GraphPoint> => {
  const spreadFactor = options.spreadFactor ?? 1.35;
  const forceIterations = options.forceIterations ?? 14;

  if (playlistIds.length === 0) {
    return new Map();
  }

  if (playlistIds.length === 1) {
    const center = {
      x: dimensions.width / 2,
      y: dimensions.height / 2,
    };
    return new Map([[playlistIds[0], center]]);
  }

  const adjacency = buildPlaylistCooccurrenceGraph(playlistIds, songs);
  const coreNodes = identifyCoreNodes(adjacency, playlistIds);
  const corePlaylistIds = playlistIds.filter((playlistId) => coreNodes.has(playlistId));
  const layoutCenter = {
    x: dimensions.width / 2,
    y: dimensions.height / 2,
  };
  const orbitRadius =
    Math.min(dimensions.width - GRAPH_PADDING * 2, dimensions.height - GRAPH_PADDING * 2) *
    0.34 *
    spreadFactor;

  const positions = initialCircularPositions(playlistIds, dimensions, layoutCenter, orbitRadius);
  const coreCentroid = centroidOf(positions, corePlaylistIds.length > 0 ? corePlaylistIds : playlistIds);

  flipAppendagesOutward(positions, adjacency, playlistIds, coreNodes, coreCentroid, dimensions, spreadFactor);
  runForceSimulation(positions, adjacency, playlistIds, dimensions, forceIterations, spreadFactor);

  return positions;
};
