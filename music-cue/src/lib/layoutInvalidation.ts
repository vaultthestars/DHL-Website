import { invalidateAllPlaylistHullCaches } from "./clusterHullCache";
import {
  invalidateGraphLayoutPositionCaches,
  invalidateIsolateLayoutCache,
} from "./graphLayout";

/** Clears graph layout caches and playlist hull path caches. */
export const invalidateLayoutPositionCaches = (): void => {
  invalidateGraphLayoutPositionCaches();
  invalidateAllPlaylistHullCaches();
};

/** Clears only per-owner isolate layout memoization (keeps axis range cache). */
export const invalidateIsolateLayoutPositionCaches = (): void => {
  invalidateIsolateLayoutCache();
};
