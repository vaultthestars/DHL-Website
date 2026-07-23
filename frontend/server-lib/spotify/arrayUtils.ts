import type { LibraryStats } from "./types";

export const asStringArray = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string") : [];

export const getSongPlaylists = (song: { playlists?: unknown }): string[] =>
  asStringArray(song.playlists);

/** Coerce persisted or API stats fields that must be string arrays. */
export const normalizeLibraryStatsFields = (stats: LibraryStats | null): LibraryStats | null => {
  if (!stats) {
    return null;
  }
  return {
    ...stats,
    genres: asStringArray(stats.genres),
    playlistIds: asStringArray(stats.playlistIds),
  };
};
