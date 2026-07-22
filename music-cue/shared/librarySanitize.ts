import type { LibraryStats, Song } from "../src/lib/types";
import { isExcludedPlaylistName } from "./playlistNames";
import { buildLibraryStatsFromSongs } from "./sharedLibrary";

export const sanitizeLibraryPayload = <T extends { songs: Song[]; stats: LibraryStats }>(
  payload: T
): T => {
  const playlistNames = payload.stats.playlistNames ?? {};
  const keptNames: Record<string, string> = {};

  Object.entries(playlistNames).forEach(([playlistId, name]) => {
    if (!isExcludedPlaylistName(name)) {
      keptNames[playlistId] = name;
    }
  });

  const songs = payload.songs.map((song) => ({
    ...song,
    playlists: (song.playlists ?? []).filter((playlistId) => Boolean(keptNames[playlistId])),
  }));

  return {
    ...payload,
    songs,
    stats: buildLibraryStatsFromSongs(songs, keptNames),
  };
};
