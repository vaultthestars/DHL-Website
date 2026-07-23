import { buildLibraryStatsFromSongs } from "../../shared/sharedLibrary";
import { asStringArray, getSongPlaylists } from "./arrayUtils";
import type { LoadedLibrary } from "./musicProvider";
import type { LibraryStats, Song } from "./types";

const mergeSong = (left: Song, right: Song): Song => {
  const playlistSet = new Set([...getSongPlaylists(left), ...getSongPlaylists(right)]);
  return {
    ...left,
    ...right,
    playCount: Math.max(left.playCount, right.playCount),
    loved: left.loved || right.loved,
    playlists: [...playlistSet],
  };
};

export const mergeLoadedLibraries = (existing: LoadedLibrary, incoming: LoadedLibrary): LoadedLibrary => {
  const songsById = new Map<string, Song>();
  existing.songs.forEach((song) => songsById.set(song.id, song));
  incoming.songs.forEach((song) => {
    const current = songsById.get(song.id);
    songsById.set(song.id, current ? mergeSong(current, song) : song);
  });

  const songs = [...songsById.values()];
  const playlistNames = {
    ...(existing.stats.playlistNames ?? {}),
    ...(incoming.stats.playlistNames ?? {}),
  };
  const stats = buildLibraryStatsFromSongs(songs, playlistNames);
  const playlistOwners = {
    ...(existing.playlistOwners ?? {}),
    ...(incoming.playlistOwners ?? {}),
  };

  return {
    songs,
    stats,
    playlistOwners,
    contributor: incoming.contributor ?? existing.contributor,
  };
};

export const diffPlaylistCatalog = (
  remotePlaylists: Array<{ id: string; name: string }>,
  localStats: LibraryStats | null
): {
  newPlaylists: Array<{ id: string; name: string }>;
  existingPlaylists: Array<{ id: string; name: string }>;
} => {
  const localIds = new Set(asStringArray(localStats?.playlistIds));
  const newPlaylists: Array<{ id: string; name: string }> = [];
  const existingPlaylists: Array<{ id: string; name: string }> = [];

  remotePlaylists.forEach((playlist) => {
    if (localIds.has(playlist.id)) {
      existingPlaylists.push(playlist);
    } else {
      newPlaylists.push(playlist);
    }
  });

  newPlaylists.sort((left, right) => left.name.localeCompare(right.name));
  existingPlaylists.sort((left, right) => left.name.localeCompare(right.name));

  return { newPlaylists, existingPlaylists };
};
