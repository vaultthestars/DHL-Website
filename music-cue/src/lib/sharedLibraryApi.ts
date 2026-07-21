import type { LibraryContributor, MergedLibrary, SharedLibrarySnapshot } from "../../shared/sharedLibrary";
import { mergeSharedLibrarySnapshots } from "../../shared/sharedLibrary";
import type { LoadedLibrary } from "./musicProvider";
import { isMockContributorId } from "./libraryScope";
import { isWebDeployment } from "./runtime";

const fetchJson = async <T>(url: string, init?: RequestInit): Promise<T> => {
  const response = await fetch(url, {
    credentials: "include",
    ...init,
  });
  if (!response.ok) {
    const payload = (await response.json().catch(() => ({}))) as { error?: string };
    throw new Error(payload.error ?? `Request failed (${response.status}).`);
  }
  return (await response.json()) as T;
};

export type SharedLibraryIndexResponse = {
  contributors: LibraryContributor[];
};

export type MergedSharedLibraryResponse = MergedLibrary & {
  contributors: LibraryContributor[];
};

const canUseClientMocks = (includeMockUsers: boolean): boolean =>
  includeMockUsers && !isWebDeployment;

export const listSharedContributors = async (includeMockUsers = false): Promise<LibraryContributor[]> => {
  const payload = await fetchJson<SharedLibraryIndexResponse>("/api/shared-libraries");
  const contributors = payload.contributors ?? [];
  if (!canUseClientMocks(includeMockUsers)) {
    return contributors.filter((contributor) => !isMockContributorId(contributor.id));
  }
  const { getMockContributors } = await import("./mockLibraries");
  const merged = [...contributors, ...getMockContributors()];
  const byId = new Map(merged.map((contributor) => [contributor.id, contributor]));
  return [...byId.values()]
    .filter((contributor) => !isMockContributorId(contributor.id) || canUseClientMocks(includeMockUsers))
    .sort((left, right) => left.name.localeCompare(right.name));
};

export const fetchSharedLibrarySnapshot = async (contributorId: string): Promise<SharedLibrarySnapshot | null> => {
  if (isMockContributorId(contributorId)) {
    if (isWebDeployment) {
      return null;
    }
    const { getMockSnapshots } = await import("./mockLibraries");
    return getMockSnapshots([contributorId])[0] ?? null;
  }
  return fetchJson<SharedLibrarySnapshot>(
    `/api/shared-libraries/snapshot/${encodeURIComponent(contributorId)}`
  );
};

export const loadMergedSharedLibrary = async (
  contributorIds: string[],
  includeMockUsers = false
): Promise<MergedSharedLibraryResponse> => {
  const selectedIds = canUseClientMocks(includeMockUsers)
    ? contributorIds
    : contributorIds.filter((contributorId) => !isMockContributorId(contributorId));

  const realIds = selectedIds.filter((contributorId) => !isMockContributorId(contributorId));
  const mockIds = selectedIds.filter((contributorId) => isMockContributorId(contributorId));

  let mergedFromServer: MergedLibrary | null = null;
  if (realIds.length > 0) {
    mergedFromServer = await fetchJson<MergedLibrary>(
      `/api/shared-libraries/merge?contributors=${encodeURIComponent(realIds.join(","))}`
    );
    if (mergedFromServer.songs.length === 0) {
      throw new Error(
        "Shared library is listed but could not be loaded. Ask the owner to re-share, or try Refresh shared."
      );
    }
  }

  const snapshots: SharedLibrarySnapshot[] = [];
  if (mockIds.length > 0 && canUseClientMocks(includeMockUsers)) {
    const { getMockSnapshots } = await import("./mockLibraries");
    snapshots.push(...getMockSnapshots(mockIds));
  }

  if (snapshots.length === 0) {
    if (!mergedFromServer) {
      return {
        songs: [],
        stats: {
          minYear: 1970,
          maxYear: new Date().getFullYear(),
          genres: [],
          genreCounts: {},
          maxPlayCount: 1,
          playlistIds: [],
          playlistNames: {},
          playlistCounts: {},
        },
        sharedTrackCount: 0,
        playlistOwners: {},
        contributors: [],
      };
    }
    const contributors = await listSharedContributors(includeMockUsers);
    return {
      ...mergedFromServer,
      contributors: contributors.filter((contributor) => selectedIds.includes(contributor.id)),
    };
  }

  const merged = mergeSharedLibrarySnapshots(snapshots);
  if (mergedFromServer) {
    const combined = mergeSharedLibrarySnapshots([
      {
        contributor: { id: "server-merge", name: "Shared" },
        updatedAt: new Date().toISOString(),
        songs: mergedFromServer.songs,
        stats: mergedFromServer.stats,
      },
      ...snapshots,
    ]);
    const contributors = await listSharedContributors(includeMockUsers);
    return {
      ...combined,
      contributors: contributors.filter((contributor) => selectedIds.includes(contributor.id)),
    };
  }

  const contributors = await listSharedContributors(includeMockUsers);
  return {
    ...merged,
    contributors: contributors.filter((contributor) => selectedIds.includes(contributor.id)),
  };
};

export const publishSharedLibrary = async (library?: {
  contributor: { id: string; name: string };
  songs: LoadedLibrary["songs"];
  stats: LoadedLibrary["stats"];
}): Promise<{ contributor: { id: string; name: string }; trackCount: number }> => {
  return fetchJson("/api/spotify/publish-shared-library", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(library ?? {}),
  });
};

export const toLoadedLibrary = (merged: MergedSharedLibraryResponse): LoadedLibrary => ({
  songs: merged.songs,
  stats: merged.stats,
  playlistOwners: merged.playlistOwners,
});

const ENABLED_CONTRIBUTORS_KEY = "music-cue-enabled-contributors";
const LOCAL_CONTRIBUTOR_ID_KEY = "music-cue-local-contributor-id";
const SONG_SPACE_MODE_KEY = "music-cue-song-space-mode";

export type SongSpaceMode = "mine" | "shared";

export const loadEnabledContributorIds = (): string[] => {
  try {
    const stored = localStorage.getItem(ENABLED_CONTRIBUTORS_KEY);
    if (!stored) {
      return [];
    }
    const parsed = JSON.parse(stored) as string[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

export const loadSongSpaceMode = (): SongSpaceMode => {
  const stored = localStorage.getItem(SONG_SPACE_MODE_KEY);
  if (stored === "mine" || stored === "shared") {
    return stored;
  }
  return "shared";
};

export const saveSongSpaceMode = (mode: SongSpaceMode): void => {
  localStorage.setItem(SONG_SPACE_MODE_KEY, mode);
};

export const saveLocalContributorId = (contributorId: string): void => {
  localStorage.setItem(LOCAL_CONTRIBUTOR_ID_KEY, contributorId);
};

export const loadLocalContributorId = (): string | null => {
  try {
    return localStorage.getItem(LOCAL_CONTRIBUTOR_ID_KEY);
  } catch {
    return null;
  }
};

export const resolveLocalContributorId = (
  includeMockUsers: boolean,
  contributors: LibraryContributor[]
): string | null => {
  if (includeMockUsers && !isWebDeployment) {
    return "mock-user-august";
  }
  const stored = loadLocalContributorId();
  if (stored && isMockContributorId(stored)) {
    return null;
  }
  if (stored && contributors.some((contributor) => contributor.id === stored)) {
    return stored;
  }
  return stored;
};

export const resolveActiveContributorIds = (
  songSpaceMode: SongSpaceMode,
  localContributorId: string | null,
  contributors: LibraryContributor[]
): string[] => {
  if (songSpaceMode === "mine") {
    return localContributorId && !isMockContributorId(localContributorId) ? [localContributorId] : [];
  }
  return contributors
    .map((contributor) => contributor.id)
    .filter((contributorId) => !isMockContributorId(contributorId));
};

export const filterSongsForSongSpace = (
  songs: Array<{ id: string; owners?: Array<{ id: string }> }>,
  songSpaceMode: SongSpaceMode,
  localContributorId: string | null
): typeof songs => {
  if (songSpaceMode !== "mine") {
    return songs;
  }
  if (!localContributorId) {
    return songs.filter((song) => (song.owners ?? []).length === 0);
  }
  return songs.filter((song) => {
    const owners = song.owners ?? [];
    if (owners.length === 0) {
      return true;
    }
    return owners.some((owner) => owner.id === localContributorId);
  });
};

export const getAllContributorIds = (contributors: LibraryContributor[]): string[] =>
  contributors.map((contributor) => contributor.id).filter((id) => !isMockContributorId(id));

export const saveEnabledContributorIds = (contributorIds: string[]): void => {
  localStorage.setItem(ENABLED_CONTRIBUTORS_KEY, JSON.stringify(contributorIds));
};

const INCLUDE_MOCK_USERS_KEY = "music-cue-include-mock-users";
const LIBRARY_SCOPE_MODE_KEY = "music-cue-library-scope-mode";

export const loadIncludeMockUsers = (): boolean => {
  try {
    return localStorage.getItem(INCLUDE_MOCK_USERS_KEY) === "true";
  } catch {
    return false;
  }
};

/** Persist mock-user preference (desktop/dev only; web deployment ignores mocks). */
export const saveIncludeMockUsers = (includeMockUsers: boolean): void => {
  localStorage.setItem(INCLUDE_MOCK_USERS_KEY, includeMockUsers ? "true" : "false");
};

export const disableMockUsersForWeb = (): void => {
  saveIncludeMockUsers(false);
};

export type LibraryScopeMode = "conglomerate" | "isolate";

export const loadLibraryScopeMode = (): LibraryScopeMode => {
  const stored = localStorage.getItem(LIBRARY_SCOPE_MODE_KEY);
  return stored === "isolate" ? "isolate" : "conglomerate";
};

export const saveLibraryScopeMode = (mode: LibraryScopeMode): void => {
  localStorage.setItem(LIBRARY_SCOPE_MODE_KEY, mode);
};
