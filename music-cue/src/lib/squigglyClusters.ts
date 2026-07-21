import { GraphDimensions } from "./graphLayout";
import { CustomClusterCatalog, CustomClusterDefinition, NormalizedPoint, Song } from "./types";
import { createCustomClusterId } from "./customClusters";
import {
  findSongIdsInsideHull,
  isValidSquigglyHull,
  nextSquigglyClusterColor,
  pointInPolygon,
  simplifyPolygon,
  toGraphPoints,
  translatePolygon,
} from "./squigglyClusterGeometry";

export const isSquigglyCluster = (cluster: CustomClusterDefinition): boolean =>
  cluster.kind === "squiggly" && Array.isArray(cluster.hull) && cluster.hull.length >= 3;

export const isRenderableSquigglyCluster = (
  cluster: CustomClusterDefinition,
  dimensions: GraphDimensions
): boolean => isSquigglyCluster(cluster) && isValidSquigglyHull(cluster.hull, dimensions);

export const getSquigglyClusters = (
  catalog: CustomClusterCatalog,
  dimensions?: GraphDimensions
): CustomClusterDefinition[] =>
  catalog.clusters.filter((cluster) =>
    dimensions ? isRenderableSquigglyCluster(cluster, dimensions) : isSquigglyCluster(cluster)
  );

export const pruneInvalidSquigglyClusters = (
  catalog: CustomClusterCatalog,
  dimensions: GraphDimensions
): CustomClusterCatalog => ({
  clusters: catalog.clusters.filter(
    (cluster) => !isSquigglyCluster(cluster) || isValidSquigglyHull(cluster.hull, dimensions)
  ),
});

export const createSquigglyCluster = (
  hull: NormalizedPoint[],
  label: string,
  color?: string
): CustomClusterDefinition => ({
  id: createCustomClusterId(),
  label,
  songIds: [],
  kind: "squiggly",
  hull: simplifyPolygon(hull),
  color: color ?? nextSquigglyClusterColor(),
});

export const addSquigglyCluster = (
  catalog: CustomClusterCatalog,
  cluster: CustomClusterDefinition
): CustomClusterCatalog => ({
  clusters: [...catalog.clusters, cluster],
});

export const updateSquigglyCluster = (
  catalog: CustomClusterCatalog,
  clusterId: string,
  updates: Partial<CustomClusterDefinition>
): CustomClusterCatalog => ({
  clusters: catalog.clusters.map((cluster) =>
    cluster.id === clusterId ? { ...cluster, ...updates } : cluster
  ),
});

export const removeSquigglyCluster = (
  catalog: CustomClusterCatalog,
  clusterId: string
): CustomClusterCatalog => ({
  clusters: catalog.clusters.filter((cluster) => cluster.id !== clusterId),
});

export const renameSquigglyCluster = (
  catalog: CustomClusterCatalog,
  clusterId: string,
  label: string
): CustomClusterCatalog => updateSquigglyCluster(catalog, clusterId, { label });

export const setSquigglyClusterHull = (
  catalog: CustomClusterCatalog,
  clusterId: string,
  hull: NormalizedPoint[]
): CustomClusterCatalog => updateSquigglyCluster(catalog, clusterId, { hull: simplifyPolygon(hull) });

export const setSquigglyClusterColor = (
  catalog: CustomClusterCatalog,
  clusterId: string,
  color: string
): CustomClusterCatalog => updateSquigglyCluster(catalog, clusterId, { color });

export const assignSongsToSquigglyCluster = (
  catalog: CustomClusterCatalog,
  clusterId: string,
  songIds: string[],
  exclusive = false
): CustomClusterCatalog => {
  const targetIds = new Set(songIds);
  return {
    clusters: catalog.clusters.map((cluster) => {
      if (cluster.id === clusterId) {
        const merged = new Set([...cluster.songIds, ...songIds]);
        return { ...cluster, songIds: [...merged] };
      }
      if (!exclusive) {
        return cluster;
      }
      return {
        ...cluster,
        songIds: cluster.songIds.filter((songId) => !targetIds.has(songId)),
      };
    }),
  };
};

export const removeSongFromSquigglyCluster = (
  catalog: CustomClusterCatalog,
  clusterId: string,
  songId: string
): CustomClusterCatalog =>
  updateSquigglyCluster(catalog, clusterId, {
    songIds: catalog.clusters.find((cluster) => cluster.id === clusterId)?.songIds.filter((id) => id !== songId) ?? [],
  });

export const syncSongMembershipForPosition = (
  catalog: CustomClusterCatalog,
  songId: string,
  position: NormalizedPoint,
  dimensions: GraphDimensions,
  priorityClusterId?: string
): CustomClusterCatalog => {
  const graphPoint = toGraphPoints([position], dimensions)[0];
  const squigglyClusters = getSquigglyClusters(catalog);

  const containingIds = squigglyClusters
    .filter((cluster) => pointInPolygon(graphPoint, toGraphPoints(cluster.hull ?? [], dimensions)))
    .map((cluster) => cluster.id);

  const keepClusterId =
    priorityClusterId && containingIds.includes(priorityClusterId)
      ? priorityClusterId
      : containingIds[containingIds.length - 1];

  return {
    clusters: catalog.clusters.map((cluster) => {
      if (!isSquigglyCluster(cluster)) {
        return cluster;
      }
      const hasSong = cluster.songIds.includes(songId);
      const shouldHave = cluster.id === keepClusterId;
      if (hasSong === shouldHave) {
        return cluster;
      }
      if (shouldHave) {
        return { ...cluster, songIds: [...cluster.songIds, songId] };
      }
      return { ...cluster, songIds: cluster.songIds.filter((id) => id !== songId) };
    }),
  };
};

export const applyDraggedClusterMembershipPriority = (
  catalog: CustomClusterCatalog,
  draggedClusterId: string
): CustomClusterCatalog => {
  const dragged = catalog.clusters.find((cluster) => cluster.id === draggedClusterId);
  if (!dragged) {
    return catalog;
  }
  const prioritySongs = new Set(dragged.songIds);
  return {
    clusters: catalog.clusters.map((cluster) => {
      if (cluster.id === draggedClusterId || !isSquigglyCluster(cluster)) {
        return cluster;
      }
      return {
        ...cluster,
        songIds: cluster.songIds.filter((songId) => !prioritySongs.has(songId)),
      };
    }),
  };
};

export const translateSquigglyCluster = (
  catalog: CustomClusterCatalog,
  clusterId: string,
  delta: NormalizedPoint
): CustomClusterCatalog => {
  const cluster = catalog.clusters.find((entry) => entry.id === clusterId);
  if (!cluster?.hull) {
    return catalog;
  }
  return updateSquigglyCluster(catalog, clusterId, {
    hull: translatePolygon(cluster.hull, delta),
    labelPosition: cluster.labelPosition
      ? { x: cluster.labelPosition.x + delta.x, y: cluster.labelPosition.y + delta.y }
      : undefined,
  });
};

export const translateSquigglyClusters = (
  catalog: CustomClusterCatalog,
  clusterIds: string[],
  delta: NormalizedPoint
): CustomClusterCatalog =>
  clusterIds.reduce((nextCatalog, clusterId) => translateSquigglyCluster(nextCatalog, clusterId, delta), catalog);

export const createSquigglyClusterFromStroke = (
  catalog: CustomClusterCatalog,
  stroke: NormalizedPoint[],
  songs: Array<{ id: string; position: { x: number; y: number } }>,
  dimensions: GraphDimensions,
  color?: string
): { catalog: CustomClusterCatalog; cluster: CustomClusterDefinition } | null => {
  const hull = simplifyPolygon(stroke);
  if (!isValidSquigglyHull(hull, dimensions)) {
    return null;
  }
  const label = `Cluster ${getSquigglyClusters(catalog, dimensions).length + 1}`;
  const memberIds = findSongIdsInsideHull(hull, songs, dimensions);
  const cluster = {
    ...createSquigglyCluster(hull, label, color),
    songIds: memberIds,
  };
  return {
    catalog: addSquigglyCluster(catalog, cluster),
    cluster,
  };
};

export const resolveSquigglySongColor = (
  songId: string,
  catalog: CustomClusterCatalog
): string | null => {
  for (let index = catalog.clusters.length - 1; index >= 0; index -= 1) {
    const cluster = catalog.clusters[index];
    if (isSquigglyCluster(cluster) && cluster.songIds.includes(songId) && cluster.color) {
      return cluster.color;
    }
  }
  return null;
};

export const seedSquigglyMembershipFromHulls = (
  catalog: CustomClusterCatalog,
  songs: Song[],
  getPosition: (song: Song) => { x: number; y: number },
  dimensions: GraphDimensions
): CustomClusterCatalog => {
  const positioned = songs.map((song) => ({ id: song.id, position: getPosition(song) }));
  return {
    clusters: catalog.clusters.map((cluster) => {
      if (!isSquigglyCluster(cluster) || cluster.songIds.length > 0) {
        return cluster;
      }
      return {
        ...cluster,
        songIds: findSongIdsInsideHull(cluster.hull ?? [], positioned, dimensions),
      };
    }),
  };
};
