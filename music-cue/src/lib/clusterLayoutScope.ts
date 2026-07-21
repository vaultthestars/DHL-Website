import type { LibraryScopeMode } from "./libraryScope";
import type { ClusterLayoutScope } from "./storage";
import type { SongSpaceMode } from "./sharedLibraryApi";

export const getActiveClusterLayoutScope = (
  songSpaceMode: SongSpaceMode,
  libraryScopeMode: LibraryScopeMode
): ClusterLayoutScope => {
  if (songSpaceMode === "mine") {
    return "isolate";
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
