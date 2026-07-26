import { buildLibraryStatsFromSongs } from "../../shared/sharedLibrary";
import { asStringArray, getSongPlaylists } from "./arrayUtils";
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

export type PlaylistMetaGraphEdge = {
  leftId: string;
  rightId: string;
  sharedSongCount: number;
};

const edgeKey = (leftId: string, rightId: string): string =>
  leftId < rightId ? `${leftId}|${rightId}` : `${rightId}|${leftId}`;

/** Region ids for dragged clusters plus direct meta-graph neighbors (same owner scope). */
export const collectMetagraphNeighborRegionIds = (
  seedRegionIds: readonly string[],
  edges: readonly PlaylistMetaGraphEdge[],
  allRegionIds: readonly string[]
): Set<string> => {
  const affected = new Set(seedRegionIds);
  const seedPlaylistIdsByOwner = new Map<string, Set<string>>();

  seedRegionIds.forEach((regionId) => {
    const { ownerId, clusterId } = parseOwnerScopedRegionId(regionId);
    const ownerKey = ownerId ?? "";
    const playlistIds = seedPlaylistIdsByOwner.get(ownerKey) ?? new Set<string>();
    playlistIds.add(clusterId);
    seedPlaylistIdsByOwner.set(ownerKey, playlistIds);
  });

  const regionByOwnerPlaylist = new Map<string, string>();
  allRegionIds.forEach((regionId) => {
    const { ownerId, clusterId } = parseOwnerScopedRegionId(regionId);
    regionByOwnerPlaylist.set(`${ownerId ?? ""}:${clusterId}`, regionId);
  });

  seedPlaylistIdsByOwner.forEach((playlistIds, ownerKey) => {
    playlistIds.forEach((playlistId) => {
      edges.forEach((edge) => {
        let neighborPlaylistId: string | null = null;
        if (edge.leftId === playlistId) {
          neighborPlaylistId = edge.rightId;
        } else if (edge.rightId === playlistId) {
          neighborPlaylistId = edge.leftId;
        }
        if (!neighborPlaylistId) {
          return;
        }
        const neighborRegionId = regionByOwnerPlaylist.get(`${ownerKey}:${neighborPlaylistId}`);
        if (neighborRegionId) {
          affected.add(neighborRegionId);
        }
      });
    });
  });

  return affected;
};

export const buildPlaylistMetaGraphEdges = (
  playlistIds: string[],
  songs: Song[]
): PlaylistMetaGraphEdge[] => {
  const allowedIds = new Set(asStringArray(playlistIds));
  const edgeCounts = new Map<string, { leftId: string; rightId: string; sharedSongCount: number }>();

  songs.forEach((song) => {
    const memberships = getSongPlaylists(song).filter((playlistId) => allowedIds.has(playlistId));
    for (let leftIndex = 0; leftIndex < memberships.length; leftIndex += 1) {
      for (let rightIndex = leftIndex + 1; rightIndex < memberships.length; rightIndex += 1) {
        const leftId = memberships[leftIndex];
        const rightId = memberships[rightIndex];
        const key = edgeKey(leftId, rightId);
        const existing = edgeCounts.get(key);
        if (existing) {
          existing.sharedSongCount += 1;
        } else {
          edgeCounts.set(key, { leftId, rightId, sharedSongCount: 1 });
        }
      }
    }
  });

  return [...edgeCounts.values()].sort(
    (left, right) => right.sharedSongCount - left.sharedSongCount
  );
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
