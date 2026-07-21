import type { GeneratedCue, Song } from "./types";

export const ISOLATE_SCOPE_ID_SEPARATOR = "::isolate::";

export const getCanonicalSongId = (songId: string): string => {
  const separatorIndex = songId.indexOf(ISOLATE_SCOPE_ID_SEPARATOR);
  return separatorIndex >= 0 ? songId.slice(0, separatorIndex) : songId;
};

export const getIsolateScopeOwnerIdFromSongId = (songId: string): string | null => {
  const separatorIndex = songId.indexOf(ISOLATE_SCOPE_ID_SEPARATOR);
  if (separatorIndex < 0) {
    return null;
  }
  return songId.slice(separatorIndex + ISOLATE_SCOPE_ID_SEPARATOR.length) || null;
};

export const makeIsolateScopedSongId = (canonicalId: string, ownerId: string): string =>
  `${canonicalId}${ISOLATE_SCOPE_ID_SEPARATOR}${ownerId}`;

export const isIsolateScopedSongId = (songId: string): boolean =>
  songId.includes(ISOLATE_SCOPE_ID_SEPARATOR);

export const hasMultipleLibraryOwners = (songs: Array<{ owners?: Array<{ id: string }> }>): boolean => {
  const ownerIds = new Set<string>();
  songs.forEach((song) => {
    (song.owners ?? []).forEach((owner) => ownerIds.add(owner.id));
  });
  return ownerIds.size > 1;
};

export const getSongOwnerId = (song: Song): string | null => {
  if (song.owners?.length === 1) {
    return song.owners[0].id;
  }
  return getIsolateScopeOwnerIdFromSongId(song.id) ?? song.owners?.[0]?.id ?? null;
};

export const filterPlaylistsForOwner = (
  playlists: string[] | undefined,
  ownerId: string,
  playlistOwners: Record<string, string>
): string[] =>
  (playlists ?? []).filter((playlistId) => playlistOwners[playlistId] === ownerId);

export const scopeSongPlaylistsForOwner = (
  song: Song,
  playlistOwners: Record<string, string>
): Song => {
  if (Object.keys(playlistOwners).length === 0) {
    return song;
  }
  const ownerId = getSongOwnerId(song);
  if (!ownerId) {
    return song;
  }
  const playlists = filterPlaylistsForOwner(song.playlists, ownerId, playlistOwners);
  if (playlists.length === (song.playlists ?? []).length) {
    return song;
  }
  return { ...song, playlists };
};

export const expandSongsForIsolateScope = (songs: Song[], enabledOwnerIds?: string[]): Song[] => {
  const enabled = new Set(enabledOwnerIds ?? []);

  return songs.flatMap((song) => {
    const owners = (song.owners ?? []).filter((owner) => enabled.size === 0 || enabled.has(owner.id));
    if (owners.length <= 1) {
      return [song];
    }

    return owners.map((owner) => ({
      ...song,
      id: makeIsolateScopedSongId(getCanonicalSongId(song.id), owner.id),
      owners: [owner],
      ownerCount: 1,
    }));
  });
};

export const prepareGraphSongsForIsolate = (
  songs: Song[],
  enabledOwnerIds: string[] | undefined,
  playlistOwners: Record<string, string>
): Song[] =>
  expandSongsForIsolateScope(songs, enabledOwnerIds).map((song) =>
    scopeSongPlaylistsForOwner(song, playlistOwners)
  );

export const resolveCanonicalSong = (song: Song, canonicalSongs: Song[]): Song => {
  const canonicalId = getCanonicalSongId(song.id);
  return canonicalSongs.find((entry) => entry.id === canonicalId) ?? song;
};

export const canonicalizeGeneratedCue = (cue: GeneratedCue | null, canonicalSongs: Song[]): GeneratedCue | null => {
  if (!cue) {
    return null;
  }

  const seen = new Set<string>();
  const songs: Song[] = [];
  cue.songs.forEach((song) => {
    const canonicalSong = resolveCanonicalSong(song, canonicalSongs);
    if (seen.has(canonicalSong.id)) {
      return;
    }
    seen.add(canonicalSong.id);
    songs.push(canonicalSong);
  });

  if (songs.length === 0) {
    return null;
  }

  return {
    ...cue,
    songs,
  };
};
