import type { GraphPoint } from "./types";
import type { PlaylistMetaGraphEdge } from "./playlistMetaGraph";

const hullPathCache = new Map<string, string>();

const formatPoint = (point: GraphPoint): string =>
  `${point.x.toFixed(1)},${point.y.toFixed(1)}`;

export const buildPlaylistHullCacheKey = (
  playlistId: string,
  center: GraphPoint,
  playlistCenters: Map<string, GraphPoint>,
  edges: PlaylistMetaGraphEdge[],
  memberCount: number,
  padding: number
): string => {
  const neighborParts: string[] = [];
  edges.forEach((edge) => {
    if (edge.leftId === playlistId) {
      const neighbor = playlistCenters.get(edge.rightId);
      if (neighbor) {
        neighborParts.push(`${edge.rightId}:${formatPoint(neighbor)}`);
      }
      return;
    }
    if (edge.rightId === playlistId) {
      const neighbor = playlistCenters.get(edge.leftId);
      if (neighbor) {
        neighborParts.push(`${edge.leftId}:${formatPoint(neighbor)}`);
      }
    }
  });
  neighborParts.sort();
  return [
    playlistId,
    formatPoint(center),
    memberCount,
    padding.toFixed(1),
    neighborParts.join(";"),
  ].join("|");
};

export const getCachedPlaylistHullPath = (cacheKey: string): string | undefined =>
  hullPathCache.get(cacheKey);

export const setCachedPlaylistHullPath = (cacheKey: string, hullPath: string): void => {
  hullPathCache.set(cacheKey, hullPath);
};

export const invalidateAllPlaylistHullCaches = (): void => {
  hullPathCache.clear();
};
