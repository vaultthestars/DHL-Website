import type { LibraryStats, Song } from "../src/lib/types";

export type LibraryContributor = {
  id: string;
  name: string;
  updatedAt: string;
  trackCount: number;
};

export type SharedLibraryIndex = {
  contributors: LibraryContributor[];
};

export type SharedLibrarySnapshot = {
  contributor: {
    id: string;
    name: string;
  };
  updatedAt: string;
  songs: Song[];
  stats: LibraryStats;
};

export type MergedLibrary = {
  songs: Song[];
  stats: LibraryStats;
  sharedTrackCount: number;
};

const defaultStats = (): LibraryStats => ({
  minYear: 1970,
  maxYear: new Date().getFullYear(),
  genres: [],
  genreCounts: {},
  maxPlayCount: 1,
  playlistIds: [],
  playlistNames: {},
  playlistCounts: {},
});

export const buildLibraryStatsFromSongs = (
  songs: Song[],
  playlistNames: Record<string, string> = {}
): LibraryStats => {
  if (songs.length === 0) {
    return defaultStats();
  }

  const genreCounts: Record<string, number> = {};
  const playlistCounts: Record<string, number> = {};
  const playlistIdSet = new Set<string>();
  let minYear = songs[0].year;
  let maxYear = songs[0].year;
  let maxPlayCount = 1;

  songs.forEach((song) => {
    genreCounts[song.genre] = (genreCounts[song.genre] ?? 0) + 1;
    minYear = Math.min(minYear, song.year);
    maxYear = Math.max(maxYear, song.year);
    maxPlayCount = Math.max(maxPlayCount, song.playCount);
    (song.playlists ?? []).forEach((playlistId) => {
      playlistIdSet.add(playlistId);
      playlistCounts[playlistId] = (playlistCounts[playlistId] ?? 0) + 1;
    });
  });

  const mergedPlaylistNames = { ...playlistNames };
  playlistIdSet.forEach((playlistId) => {
    if (!mergedPlaylistNames[playlistId]) {
      mergedPlaylistNames[playlistId] = playlistId;
    }
  });

  return {
    minYear,
    maxYear,
    genres: Object.keys(genreCounts).sort((left, right) => left.localeCompare(right)),
    genreCounts,
    maxPlayCount,
    playlistIds: [...playlistIdSet].sort((left, right) =>
      (mergedPlaylistNames[left] ?? left).localeCompare(mergedPlaylistNames[right] ?? right)
    ),
    playlistNames: mergedPlaylistNames,
    playlistCounts,
  };
};

const mergeSongOwners = (left: Song, right: Song): Song => {
  const ownersById = new Map<string, { id: string; name: string }>();
  (left.owners ?? []).forEach((owner) => ownersById.set(owner.id, owner));
  (right.owners ?? []).forEach((owner) => ownersById.set(owner.id, owner));
  const owners = [...ownersById.values()].sort((leftOwner, rightOwner) =>
    leftOwner.name.localeCompare(rightOwner.name)
  );

  const playlistSet = new Set([...(left.playlists ?? []), ...(right.playlists ?? [])]);
  return {
    ...left,
    playCount: Math.max(left.playCount, right.playCount),
    loved: left.loved || right.loved,
    playlists: [...playlistSet],
    owners,
    ownerCount: owners.length,
  };
};

const tagSongsForContributor = (
  songs: Song[],
  contributor: SharedLibrarySnapshot["contributor"]
): Song[] =>
  songs.map((song) => ({
    ...song,
    owners: [{ id: contributor.id, name: contributor.name }],
    ownerCount: 1,
  }));

export const mergeSharedLibrarySnapshots = (snapshots: SharedLibrarySnapshot[]): MergedLibrary => {
  const songMap = new Map<string, Song>();
  const playlistNames: Record<string, string> = {};

  snapshots.forEach((snapshot) => {
    Object.assign(playlistNames, snapshot.stats.playlistNames ?? {});
    const taggedSongs = tagSongsForContributor(snapshot.songs, snapshot.contributor);
    taggedSongs.forEach((song) => {
      const existing = songMap.get(song.id);
      songMap.set(song.id, existing ? mergeSongOwners(existing, song) : song);
    });
  });

  const songs = [...songMap.values()];
  const stats = buildLibraryStatsFromSongs(songs, playlistNames);

  return {
    songs,
    stats,
    sharedTrackCount: songs.filter((song) => (song.ownerCount ?? 1) > 1).length,
  };
};
