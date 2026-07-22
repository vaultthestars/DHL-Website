import type { LibraryScopeMode } from "./libraryScope";
import type { ClusterLayoutScope } from "./storage";
import type { SongSpaceMode } from "./sharedLibraryApi";

/** Per-owner solo cluster positions (my song space canonical store). */
export const MINE_CLUSTER_LAYOUT_SCOPE: ClusterLayoutScope = "isolate";

/** Merged shared layout when multiple contributors use conglomerate view. */
export const SHARED_CONGLOMERATE_LAYOUT_SCOPE: ClusterLayoutScope = "conglomerate";

export const isSingleContributorSharedLibrary = (sharedContributorCount: number): boolean =>
  sharedContributorCount <= 1;

export const getActiveClusterLayoutScope = (
  songSpaceMode: SongSpaceMode,
  libraryScopeMode: LibraryScopeMode,
  sharedContributorCount = 0
): ClusterLayoutScope => {
  if (songSpaceMode === "mine") {
    return MINE_CLUSTER_LAYOUT_SCOPE;
  }
  // One published library: mine and shared share the same per-owner position store.
  if (isSingleContributorSharedLibrary(sharedContributorCount)) {
    return MINE_CLUSTER_LAYOUT_SCOPE;
  }
  return libraryScopeMode;
};

export const getEffectiveLibraryScopeMode = (
  songSpaceMode: SongSpaceMode,
  libraryScopeMode: LibraryScopeMode
): LibraryScopeMode => {
  if (songSpaceMode === "mine") {
    return "conglomerate";
  }
  return libraryScopeMode;
};
