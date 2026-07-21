import type { LibraryContributor, MergedLibrary, SharedLibrarySnapshot } from "../../shared/sharedLibrary";
import { mergeSharedLibrarySnapshots } from "../../shared/sharedLibrary";
import type { LoadedLibrary } from "./musicProvider";
import { isMockContributorId } from "./libraryScope";
import { MOCK_CONTRIBUTOR_IDS, getMockContributors, getMockSnapshots } from "./mockLibraries";

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

export const listSharedContributors = async (includeMockUsers = false): Promise<LibraryContributor[]> => {
  const payload = await fetchJson<SharedLibraryIndexResponse>("/api/shared-libraries").catch(() => ({
    contributors: [],
  }));
  const contributors = payload.contributors ?? [];
  if (!includeMockUsers) {
    return contributors;
  }
  const merged = [...contributors, ...getMockContributors()];
  const byId = new Map(merged.map((contributor) => [contributor.id, contributor]));
  return [...byId.values()].sort((left, right) => left.name.localeCompare(right.name));
};

export const fetchSharedLibrarySnapshot = async (contributorId: string): Promise<SharedLibrarySnapshot | null> => {
  if (isMockContributorId(contributorId)) {
    return getMockSnapshots([contributorId])[0] ?? null;
  }
  return fetchJson<SharedLibrarySnapshot>(`/api/shared-libraries/snapshot/${encodeURIComponent(contributorId)}`).catch(
    () => null
  );
};

export const loadMergedSharedLibrary = async (
  contributorIds: string[],
  includeMockUsers = false
): Promise<MergedSharedLibraryResponse> => {
  const selectedIds = includeMockUsers
    ? contributorIds
    : contributorIds.filter((contributorId) => !isMockContributorId(contributorId));

  const realIds = selectedIds.filter((contributorId) => !isMockContributorId(contributorId));
  const mockIds = selectedIds.filter((contributorId) => isMockContributorId(contributorId));

  const snapshots: SharedLibrarySnapshot[] = [];
  if (realIds.length > 0) {
    const realSnapshots = await Promise.all(realIds.map((contributorId) => fetchSharedLibrarySnapshot(contributorId)));
    snapshots.push(...realSnapshots.filter((snapshot): snapshot is SharedLibrarySnapshot => snapshot !== null));
  }
  snapshots.push(...getMockSnapshots(mockIds));

  if (snapshots.length === 0) {
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

  const merged = mergeSharedLibrarySnapshots(snapshots);
  const contributors = await listSharedContributors(includeMockUsers);
  return {
    ...merged,
    contributors: contributors.filter((contributor) => selectedIds.includes(contributor.id)),
  };
};

export const publishSharedLibrary = async (): Promise<{ contributor: { id: string; name: string }; trackCount: number }> => {
  return fetchJson("/api/spotify/publish-shared-library", { method: "POST" });
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
  const enabled = loadEnabledContributorIds();
  return enabled.length <= 1 ? "mine" : "shared";
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
  if (includeMockUsers) {
    return MOCK_CONTRIBUTOR_IDS.august;
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
