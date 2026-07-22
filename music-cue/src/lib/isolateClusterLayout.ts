import { isClusterView } from "./layoutMetrics";
import {
  getEnabledOwnerMetaClusters,
  getSongScopeClusterId,
  radiusForSongCount,
  songsForOwnerScope,
} from "./libraryScope";
import { LARGE_LIBRARY_LAYOUT_SNAP_THRESHOLD } from "./useLayoutTransition";
import { normalizeClusterCenterOverrides } from "./storage";
import {
  ClusterCenterOverrides,
  ClusterMode,
  GraphPoint,
  LayoutConfig,
  LibraryStats,
  NormalizedPoint,
  Song,
} from "./types";

type GraphDimensions = { width: number; height: number };

const META_LAYOUT_PADDING = 28;

export type IsolateOwnerLayoutBounds = {
  ownerId: string;
  centroid: GraphPoint;
  radius: number;
};

export const getIsolateOwnerIds = (
  songs: Array<{ id: string; owners?: Array<{ id: string; name: string }> }>,
  enabledOwnerIds?: string[]
): string[] => {
  const enabled = new Set(enabledOwnerIds ?? []);
  const ownersById = new Map<string, string>();

  songs.forEach((song) => {
    const ownerId = getSongScopeClusterId(song);
    const ownerName = song.owners?.find((owner) => owner.id === ownerId)?.name;
    if (ownerName && (enabled.size === 0 || enabled.has(ownerId))) {
      ownersById.set(ownerId, ownerName);
    }
  });

  return [...ownersById.keys()].sort((left, right) =>
    (ownersById.get(left) ?? left).localeCompare(ownersById.get(right) ?? right)
  );
};

export const parseOwnerScopedRegionId = (
  regionId: string
): { ownerId: string | null; clusterId: string } => {
  if (!regionId.startsWith("owner:")) {
    return { ownerId: null, clusterId: regionId };
  }
  const withoutPrefix = regionId.slice("owner:".length);
  const separator = withoutPrefix.indexOf(":");
  if (separator < 0) {
    return { ownerId: withoutPrefix, clusterId: withoutPrefix };
  }
  return {
    ownerId: withoutPrefix.slice(0, separator),
    clusterId: withoutPrefix.slice(separator + 1),
  };
};

export const ownerScopedOverrideKey = (ownerId: string, clusterId: string): string =>
  `${ownerId}::${clusterId}`;

const clusterModeForLayout = (layoutConfig: LayoutConfig): ClusterMode | null => {
  if (!isClusterView(layoutConfig)) {
    return null;
  }
  return layoutConfig.clusterMode;
};

export const getClusterOverridesForOwner = (
  clusterOverrides: ClusterCenterOverrides,
  ownerId: string,
  layoutConfig: LayoutConfig
): ClusterCenterOverrides => {
  const normalized = normalizeClusterCenterOverrides(clusterOverrides);
  const clusterMode = clusterModeForLayout(layoutConfig);
  if (!clusterMode) {
    return normalized;
  }

  const sourceMap =
    clusterMode === "genre"
      ? normalized.genre
      : clusterMode === "playlist"
        ? normalized.playlist
        : normalized.custom;
  const scopedMap: Record<string, GraphPoint> = {};

  Object.entries(sourceMap).forEach(([key, value]) => {
    const ownerPrefix = `${ownerId}::`;
    if (key.startsWith(ownerPrefix)) {
      scopedMap[key.slice(ownerPrefix.length)] = value;
      return;
    }
    if (!key.includes("::")) {
      scopedMap[key] = value;
    }
  });

  if (clusterMode === "genre") {
    return { ...normalized, genre: scopedMap };
  }
  if (clusterMode === "playlist") {
    return { ...normalized, playlist: scopedMap };
  }
  return { ...normalized, custom: scopedMap };
};

export const toOwnerScopedOverrideUpdates = (
  ownerId: string | null,
  clusterIds: string[],
  positions: Record<string, GraphPoint>
): Record<string, GraphPoint> => {
  if (!ownerId) {
    return positions;
  }
  const updates: Record<string, GraphPoint> = {};
  clusterIds.forEach((regionId) => {
    const position = positions[regionId];
    if (!position) {
      return;
    }
    const { clusterId } = parseOwnerScopedRegionId(regionId);
    updates[ownerScopedOverrideKey(ownerId, clusterId)] = position;
  });
  return updates;
};

const boundsFromPoints = (points: GraphPoint[], dimensions: GraphDimensions): IsolateOwnerLayoutBounds => {
  if (points.length === 0) {
    return {
      ownerId: "",
      centroid: { x: dimensions.width / 2, y: dimensions.height / 2 },
      radius: META_LAYOUT_PADDING,
    };
  }

  const centroid = points.reduce(
    (sum, point) => ({ x: sum.x + point.x, y: sum.y + point.y }),
    { x: 0, y: 0 }
  );
  centroid.x /= points.length;
  centroid.y /= points.length;

  let maxDistance = 0;
  points.forEach((point) => {
    maxDistance = Math.max(maxDistance, Math.hypot(point.x - centroid.x, point.y - centroid.y));
  });

  return {
    ownerId: "",
    centroid,
    radius: maxDistance + META_LAYOUT_PADDING,
  };
};

export const computeIsolateOwnerLayoutBounds = (
  ownerId: string,
  ownerSongs: Song[],
  dimensions: GraphDimensions,
  layoutConfig: LayoutConfig,
  stats: LibraryStats,
  clusterOverrides: ClusterCenterOverrides,
  computeSoloPosition: (song: Song, ownerSongs: Song[], ownerOverrides: ClusterCenterOverrides) => GraphPoint
): IsolateOwnerLayoutBounds => {
  const ownerOverrides = getClusterOverridesForOwner(clusterOverrides, ownerId, layoutConfig);
  const layoutPoints = ownerSongs.map((song) => computeSoloPosition(song, ownerSongs, ownerOverrides));

  const bounds = boundsFromPoints(layoutPoints, dimensions);
  return { ...bounds, ownerId };
};

/** Fast owner bounds from song counts + meta-cluster layout — avoids laying out every song. */
export const estimateIsolateOwnerBounds = (
  graphSongs: Song[],
  dimensions: GraphDimensions,
  enabledOwnerIds?: string[]
): Map<string, IsolateOwnerLayoutBounds> => {
  const minDimension = Math.min(dimensions.width, dimensions.height);
  const provisionalBounds = new Map<string, IsolateOwnerLayoutBounds>();

  getIsolateOwnerIds(graphSongs, enabledOwnerIds).forEach((ownerId) => {
    const ownerSongs = songsForOwnerScope(graphSongs, ownerId);
    const radius = radiusForSongCount(ownerSongs.length, minDimension);
    provisionalBounds.set(ownerId, {
      ownerId,
      centroid: { x: dimensions.width / 2, y: dimensions.height / 2 },
      radius,
    });
  });

  const metaClusters = getEnabledOwnerMetaClusters(graphSongs, dimensions, enabledOwnerIds, {
    isAxisView: false,
    ownerBounds: provisionalBounds,
  });

  metaClusters.forEach((meta) => {
    const existing = provisionalBounds.get(meta.id);
    if (!existing) {
      return;
    }
    provisionalBounds.set(meta.id, {
      ...existing,
      radius: Math.max(existing.radius, meta.radius),
    });
  });

  return provisionalBounds;
};

export const shouldUseEstimatedIsolateOwnerBounds = (songCount: number): boolean =>
  songCount >= LARGE_LIBRARY_LAYOUT_SNAP_THRESHOLD;

export const computeAllIsolateOwnerBounds = (
  graphSongs: Song[],
  dimensions: GraphDimensions,
  layoutConfig: LayoutConfig,
  stats: LibraryStats,
  clusterOverrides: ClusterCenterOverrides,
  enabledOwnerIds: string[] | undefined,
  computeSoloPosition: (song: Song, ownerSongs: Song[], ownerOverrides: ClusterCenterOverrides) => GraphPoint
): Map<string, IsolateOwnerLayoutBounds> => {
  const boundsByOwner = new Map<string, IsolateOwnerLayoutBounds>();
  getIsolateOwnerIds(graphSongs, enabledOwnerIds).forEach((ownerId) => {
    const ownerSongs = songsForOwnerScope(graphSongs, ownerId);
    boundsByOwner.set(
      ownerId,
      computeIsolateOwnerLayoutBounds(
        ownerId,
        ownerSongs,
        dimensions,
        layoutConfig,
        stats,
        clusterOverrides,
        computeSoloPosition
      )
    );
  });
  return boundsByOwner;
};

export const translateSoloLayoutToMetaCluster = (
  soloPosition: GraphPoint,
  bounds: IsolateOwnerLayoutBounds,
  metaCenter: GraphPoint
): GraphPoint => ({
  x: metaCenter.x + (soloPosition.x - bounds.centroid.x),
  y: metaCenter.y + (soloPosition.y - bounds.centroid.y),
});

export const displayPositionToSoloPosition = (
  displayPosition: GraphPoint,
  bounds: { centroid: GraphPoint },
  metaCenter: GraphPoint
): GraphPoint => ({
  x: displayPosition.x - metaCenter.x + bounds.centroid.x,
  y: displayPosition.y - metaCenter.y + bounds.centroid.y,
});

const toNormalizedPosition = (
  point: GraphPoint,
  dimensions: GraphDimensions
): NormalizedPoint => ({
  x: point.x / dimensions.width,
  y: point.y / dimensions.height,
});

export const getClusterOverrideLookupKey = (regionId: string): string => {
  const { ownerId, clusterId } = parseOwnerScopedRegionId(regionId);
  return ownerId ? ownerScopedOverrideKey(ownerId, clusterId) : clusterId;
};

export const getClusterDragDisplayNormalizedStart = (
  regionId: string,
  region: { center: GraphPoint } | undefined,
  overrideMap: Record<string, NormalizedPoint>,
  dimensions: GraphDimensions,
  options: {
    useDisplaySpace: boolean;
    bounds?: { centroid: GraphPoint };
    metaCenter?: GraphPoint;
  }
): NormalizedPoint => {
  const overrideKey = getClusterOverrideLookupKey(regionId);
  const stored = overrideMap[overrideKey];
  if (stored) {
    if (!options.useDisplaySpace || !options.bounds || !options.metaCenter) {
      return { ...stored };
    }
    return soloNormalizedToDisplayNormalized(stored, dimensions, options.bounds, options.metaCenter);
  }
  if (!region) {
    return { x: 0.5, y: 0.5 };
  }
  return toNormalizedPosition(region.center, dimensions);
};

/** @deprecated Use getClusterDragDisplayNormalizedStart */
export const getClusterDragNormalizedStart = getClusterDragDisplayNormalizedStart;

const fromNormalizedPosition = (
  point: NormalizedPoint,
  dimensions: GraphDimensions
): GraphPoint => ({
  x: point.x * dimensions.width,
  y: point.y * dimensions.height,
});

export const soloNormalizedToDisplayNormalized = (
  soloNorm: NormalizedPoint,
  dimensions: GraphDimensions,
  bounds: { centroid: GraphPoint },
  metaCenter: GraphPoint
): NormalizedPoint => {
  const solo = fromNormalizedPosition(soloNorm, dimensions);
  const display = translateSoloLayoutToMetaCluster(
    solo,
    { ownerId: "", centroid: bounds.centroid, radius: 0 },
    metaCenter
  );
  return toNormalizedPosition(display, dimensions);
};

export const displayNormalizedToSoloNormalized = (
  displayNorm: NormalizedPoint,
  dimensions: GraphDimensions,
  bounds: { centroid: GraphPoint },
  metaCenter: GraphPoint
): NormalizedPoint => {
  const display = fromNormalizedPosition(displayNorm, dimensions);
  const solo = displayPositionToSoloPosition(display, bounds, metaCenter);
  return toNormalizedPosition(solo, dimensions);
};
