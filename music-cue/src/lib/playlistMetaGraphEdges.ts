import { asStringArray, getSongPlaylists } from "./arrayUtils";
import { parseOwnerScopedRegionId } from "./clusterRegionIds";
import type { Song } from "./types";

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

/** Undirected edges between playlists that share at least one song. */
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
