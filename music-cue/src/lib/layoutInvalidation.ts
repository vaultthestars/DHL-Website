import { invalidateAllPlaylistHullCaches } from "./clusterHullCache";
import { invalidateGraphLayoutPositionCaches } from "./graphLayout";

/** Clears graph layout caches and playlist hull path caches. */
export const invalidateLayoutPositionCaches = (): void => {
  invalidateGraphLayoutPositionCaches();
  invalidateAllPlaylistHullCaches();
};
