import type { GraphPoint, Song } from "./types";

export type PlaylistMetaGraphEdge = {
  leftId: string;
  rightId: string;
  sharedSongCount: number;
};

const edgeKey = (leftId: string, rightId: string): string =>
  leftId < rightId ? `${leftId}|${rightId}` : `${rightId}|${leftId}`;

/** Undirected edges between playlists that share at least one song. */
export const buildPlaylistMetaGraphEdges = (
  playlistIds: string[],
  songs: Song[]
): PlaylistMetaGraphEdge[] => {
  const allowedIds = new Set(playlistIds);
  const edgeCounts = new Map<string, { leftId: string; rightId: string; sharedSongCount: number }>();

  songs.forEach((song) => {
    const memberships = (song.playlists ?? []).filter((playlistId) => allowedIds.has(playlistId));
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
