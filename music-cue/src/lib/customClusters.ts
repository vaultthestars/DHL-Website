import { resolveClusterCenter, GraphDimensions } from "./graphLayout";
import { ClusterCenterOverrides, CustomClusterCatalog, CustomClusterDefinition, Song } from "./types";

export const UNASSIGNED_CUSTOM_CLUSTER_ID = "__custom_unassigned__";

export const defaultCustomClusterCatalog = (): CustomClusterCatalog => ({
  clusters: [],
});

export const createCustomClusterId = (): string =>
  `custom-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

export const createCustomCluster = (label: string): CustomClusterDefinition => ({
  id: createCustomClusterId(),
  label,
  songIds: [],
});

const hashUnit = (value: string, salt: string): number => {
  let hash = 0;
  const input = `${value}:${salt}`;
  for (let index = 0; index < input.length; index += 1) {
    hash = (hash * 31 + input.charCodeAt(index)) >>> 0;
  }
  return (hash % 10000) / 10000;
};

const scatterAroundCenter = (
  song: Song,
  center: { x: number; y: number },
  spread: number
): { x: number; y: number } => {
  const angle = hashUnit(song.id, "custom-angle") * Math.PI * 2;
  const radius = Math.sqrt(hashUnit(song.id, "custom-radius")) * spread;
  return {
    x: center.x + radius * Math.cos(angle),
    y: center.y + radius * Math.sin(angle),
  };
};

const getClusterSpread = (memberCount: number, dimensions: GraphDimensions): number => {
  const base = Math.min(dimensions.width, dimensions.height) * 0.11;
  const max = Math.min(dimensions.width, dimensions.height) * 0.22;
  return Math.min(max, base + Math.sqrt(memberCount) * 5.5);
};

export const getUnassignedCustomClusterCenter = (dimensions: GraphDimensions): { x: number; y: number } => {
  const padding = 48;
  const usableHeight = dimensions.height - padding * 2;
  return {
    x: padding - 12,
    y: padding + usableHeight / 2,
  };
};

export const getDefaultCustomClusterCenter = (
  clusterIndex: number,
  clusterCount: number,
  dimensions: GraphDimensions
): { x: number; y: number } => {
  const padding = 48;
  const usableWidth = dimensions.width - padding * 2;
  const usableHeight = dimensions.height - padding * 2;
  const columns = Math.max(1, Math.ceil(Math.sqrt(clusterCount)));
  const row = Math.floor(clusterIndex / columns);
  const column = clusterIndex % columns;
  const rows = Math.max(1, Math.ceil(clusterCount / columns));
  return {
    x: padding + ((column + 0.5) / columns) * usableWidth,
    y: padding + ((row + 0.5) / rows) * usableHeight,
  };
};

export const resolveSongCustomClusterId = (songId: string, catalog: CustomClusterCatalog): string => {
  for (const cluster of catalog.clusters) {
    if (cluster.songIds.includes(songId)) {
      return cluster.id;
    }
  }
  return UNASSIGNED_CUSTOM_CLUSTER_ID;
};

export const getCustomClusterMemberCount = (
  clusterId: string,
  catalog: CustomClusterCatalog,
  visibleSongIds: Set<string>
): number => {
  if (clusterId === UNASSIGNED_CUSTOM_CLUSTER_ID) {
    const assigned = new Set(catalog.clusters.flatMap((cluster) => cluster.songIds));
    return [...visibleSongIds].filter((songId) => !assigned.has(songId)).length;
  }
  const cluster = catalog.clusters.find((entry) => entry.id === clusterId);
  if (!cluster) {
    return 0;
  }
  return cluster.songIds.filter((songId) => visibleSongIds.has(songId)).length;
};

export const syncCatalogWithSongIds = (
  catalog: CustomClusterCatalog,
  songIds: string[]
): CustomClusterCatalog => {
  const validIds = new Set(songIds);
  return {
    clusters: catalog.clusters.map((cluster) => ({
      ...cluster,
      songIds: cluster.songIds.filter((songId) => validIds.has(songId)),
    })),
  };
};

export const assignSongsToCustomCluster = (
  catalog: CustomClusterCatalog,
  clusterId: string,
  songIds: string[]
): CustomClusterCatalog => {
  const targetIds = new Set(songIds);
  const clusters = catalog.clusters.map((cluster) => {
    if (cluster.id === clusterId) {
      const merged = new Set([...cluster.songIds, ...songIds]);
      return { ...cluster, songIds: [...merged] };
    }
    return {
      ...cluster,
      songIds: cluster.songIds.filter((songId) => !targetIds.has(songId)),
    };
  });
  return { clusters };
};

export const customClusterPosition = (
  song: Song,
  catalog: CustomClusterCatalog,
  dimensions: GraphDimensions,
  clusterOverrides: ClusterCenterOverrides,
  visibleSongs: Song[]
): { x: number; y: number } => {
  const overrides = clusterOverrides.custom ?? {};
  const visibleSongIds = new Set(visibleSongs.map((entry) => entry.id));
  const clusterId = resolveSongCustomClusterId(song.id, catalog);
  const clusterCount = catalog.clusters.length + (getCustomClusterMemberCount(UNASSIGNED_CUSTOM_CLUSTER_ID, catalog, visibleSongIds) > 0 ? 1 : 0);
  const clusterIndex =
    clusterId === UNASSIGNED_CUSTOM_CLUSTER_ID
      ? catalog.clusters.length
      : Math.max(0, catalog.clusters.findIndex((entry) => entry.id === clusterId));

  const defaultCenter =
    clusterId === UNASSIGNED_CUSTOM_CLUSTER_ID
      ? getUnassignedCustomClusterCenter(dimensions)
      : getDefaultCustomClusterCenter(clusterIndex, Math.max(1, clusterCount), dimensions);

  const center = resolveClusterCenter(defaultCenter, overrides[clusterId], dimensions);
  const memberCount = getCustomClusterMemberCount(clusterId, catalog, visibleSongIds);
  const spread = getClusterSpread(Math.max(1, memberCount), dimensions);
  return scatterAroundCenter(song, center, spread);
};

export const getCustomClusterHue = (clusterId: string, catalog: CustomClusterCatalog): number => {
  if (clusterId === UNASSIGNED_CUSTOM_CLUSTER_ID) {
    return 0;
  }
  const index = catalog.clusters.findIndex((entry) => entry.id === clusterId);
  return index < 0 ? 0 : (index / Math.max(1, catalog.clusters.length)) * 300;
};
