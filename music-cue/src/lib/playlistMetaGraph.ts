import { buildLibraryStatsFromSongs } from "../../shared/sharedLibrary";
import { getPlaylistClusterCenter, type ClusterRegion } from "./clusterRegions";
import {
  getClusterOverridesForOwner,
  parseOwnerScopedRegionId,
  translateSoloLayoutToMetaCluster,
} from "./isolateClusterLayout";
import { scopeSongsForIsolateOwner } from "./isolateScopeSongs";
import { getEnabledOwnerMetaClusters, getSongScopeClusterId } from "./libraryScope";
import { GraphDimensions } from "./graphLayout";
import { UNASSIGNED_PLAYLIST_CLUSTER_ID } from "./playlistConstants";
import type { PlaylistMetaGraphEdge } from "./playlistMetaGraphEdges";
export type { PlaylistMetaGraphEdge } from "./playlistMetaGraphEdges";
export { buildPlaylistMetaGraphEdges, collectMetagraphNeighborRegionIds } from "./playlistMetaGraphEdges";
import type { ClusterCenterOverrides, GraphPoint, LayoutConfig, LibraryStats, Song } from "./types";

/** Playlist cluster labels in the meta-graph (excludes unassigned and per-owner contributor shells). */
export const isPlaylistMetaGraphClusterRegion = (regionId: string): boolean => {
  if (!regionId || regionId === UNASSIGNED_PLAYLIST_CLUSTER_ID) {
    return false;
  }
  if (!regionId.startsWith("owner:")) {
    return true;
  }
  const { ownerId, clusterId } = parseOwnerScopedRegionId(regionId);
  return Boolean(ownerId) && clusterId !== ownerId;
};

/** Graph-view playlist labels follow stored cluster overrides, not song-position centroids. */
export const resolvePlaylistGraphViewRegionCenter = (
  region: ClusterRegion,
  options: {
    graphSongs: Song[];
    stats: LibraryStats;
    dimensions: GraphDimensions;
    clusterOverrides: ClusterCenterOverrides;
    layoutConfig: LayoutConfig;
    activeContributorIds: string[];
    playlistOwners: Record<string, string>;
    playlistNames: Record<string, string>;
    isolateOwnerBounds?: Map<string, { centroid: GraphPoint; radius: number }>;
    getMetaClusterCenter?: (ownerId: string, defaultCenter: GraphPoint) => GraphPoint;
  }
): GraphPoint => {
  const { ownerId, clusterId } = parseOwnerScopedRegionId(region.id);
  if (ownerId) {
    const ownerSongs = scopeSongsForIsolateOwner(
      options.graphSongs.filter((song) => getSongScopeClusterId(song) === ownerId),
      ownerId,
      options.playlistOwners
    );
    const ownerPlaylistNames =
      Object.keys(options.playlistOwners).length === 0
        ? options.playlistNames
        : Object.fromEntries(
            Object.entries(options.playlistNames).filter(
              ([playlistId]) => options.playlistOwners[playlistId] === ownerId
            )
          );
    const ownerStats = buildLibraryStatsFromSongs(ownerSongs, ownerPlaylistNames);
    const ownerOverrides = getClusterOverridesForOwner(
      options.clusterOverrides,
      ownerId,
      options.layoutConfig
    );
    const soloCenter = getPlaylistClusterCenter(
      clusterId,
      ownerStats,
      options.dimensions,
      ownerOverrides,
      ownerSongs
    );
    const bounds = options.isolateOwnerBounds?.get(ownerId);
    const metaCenter = getEnabledOwnerMetaClusters(
      options.graphSongs,
      options.dimensions,
      options.activeContributorIds,
      { isAxisView: false, ownerBounds: options.isolateOwnerBounds }
    ).find((meta) => meta.id === ownerId)?.center;
    if (bounds && metaCenter) {
      const resolvedMetaCenter = options.getMetaClusterCenter?.(ownerId, metaCenter) ?? metaCenter;
      const displayCenter = translateSoloLayoutToMetaCluster(soloCenter, bounds, resolvedMetaCenter);
      if (region.displayOffset) {
        return {
          x: displayCenter.x + region.displayOffset.x,
          y: displayCenter.y + region.displayOffset.y,
        };
      }
      return displayCenter;
    }
    return soloCenter;
  }

  const overrideCenter = getPlaylistClusterCenter(
    clusterId,
    options.stats,
    options.dimensions,
    options.clusterOverrides,
    options.graphSongs
  );
  if (region.displayOffset) {
    return {
      x: overrideCenter.x + region.displayOffset.x,
      y: overrideCenter.y + region.displayOffset.y,
    };
  }
  return overrideCenter;
};

export const buildPlaylistMetaGraphCenterMap = (
  regions: Array<{ id: string; center: GraphPoint }>
): Map<string, GraphPoint> => {
  const centerByPlaylistId = new Map<string, GraphPoint>();
  regions.forEach((region) => {
    if (!isPlaylistMetaGraphClusterRegion(region.id)) {
      return;
    }
    const { clusterId } = parseOwnerScopedRegionId(region.id);
    centerByPlaylistId.set(clusterId, region.center);
  });
  return centerByPlaylistId;
};

export type PlaylistMetaGraphSegment = {
  leftId: string;
  rightId: string;
  sharedSongCount: number;
  start: GraphPoint;
  end: GraphPoint;
};

export const buildPlaylistMetaGraphSegments = (
  edges: PlaylistMetaGraphEdge[],
  centerByPlaylistId: Map<string, GraphPoint>
): PlaylistMetaGraphSegment[] => {
  const segments: PlaylistMetaGraphSegment[] = [];

  edges.forEach((edge) => {
    const start = centerByPlaylistId.get(edge.leftId);
    const end = centerByPlaylistId.get(edge.rightId);
    if (!start || !end) {
      return;
    }
    segments.push({
      leftId: edge.leftId,
      rightId: edge.rightId,
      sharedSongCount: edge.sharedSongCount,
      start,
      end,
    });
  });

  return segments;
};

export const playlistMetaGraphEdgeStyle = (
  sharedSongCount: number,
  maxSharedSongCount: number
): { strokeWidth: number; stroke: string } => {
  const weight =
    maxSharedSongCount > 0 ? Math.min(1, sharedSongCount / maxSharedSongCount) : 0;
  const strokeWidth = 0.55 + weight * 4.75;
  const opacity = 0.1 + weight * 0.86;
  return {
    strokeWidth,
    stroke: `rgba(28, 14, 62, ${opacity.toFixed(3)})`,
  };
};
