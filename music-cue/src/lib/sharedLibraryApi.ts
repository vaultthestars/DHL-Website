import type { LibraryContributor, MergedLibrary } from "../../shared/sharedLibrary";
import type { LoadedLibrary } from "./musicProvider";

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

export const listSharedContributors = async (): Promise<LibraryContributor[]> => {
  const payload = await fetchJson<SharedLibraryIndexResponse>("/api/shared-libraries");
  return payload.contributors ?? [];
};

export const loadMergedSharedLibrary = async (contributorIds: string[]): Promise<MergedSharedLibraryResponse> => {
  const query = contributorIds.length > 0 ? `?contributors=${encodeURIComponent(contributorIds.join(","))}` : "";
  return fetchJson<MergedSharedLibraryResponse>(`/api/shared-libraries/merge${query}`);
};

export const publishSharedLibrary = async (): Promise<{ contributor: { id: string; name: string }; trackCount: number }> => {
  return fetchJson("/api/spotify/publish-shared-library", { method: "POST" });
};

export const toLoadedLibrary = (merged: MergedSharedLibraryResponse): LoadedLibrary => ({
  songs: merged.songs,
  stats: merged.stats,
});

const ENABLED_CONTRIBUTORS_KEY = "music-cue-enabled-contributors";

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

export const saveEnabledContributorIds = (contributorIds: string[]): void => {
  localStorage.setItem(ENABLED_CONTRIBUTORS_KEY, JSON.stringify(contributorIds));
};
