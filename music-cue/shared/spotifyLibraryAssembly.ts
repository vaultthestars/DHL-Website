export type SpotifyTrack = {
  id: string;
  name: string;
  duration_ms: number;
  popularity: number;
  artists: { id: string; name: string }[];
  album: { name: string; release_date: string };
  type?: string;
};

export type SpotifySavedTrackItem = {
  added_at: string;
  track: SpotifyTrack | null;
};

export type SpotifyPlaylistSummary = {
  id: string;
  name: string;
  owner: { id: string };
  collaborative?: boolean;
};

export type SpotifyPlaylistItem = {
  track?: SpotifyTrack | null;
  item?: SpotifyTrack | null;
};

export type SpotifyLibrarySong = {
  id: string;
  title: string;
  artist: string;
  album: string;
  genre: string;
  year: number;
  playCount: number;
  rating: number;
  loved: boolean;
  dateAdded: string;
  trackType: string;
  durationMs: number;
  playlists: string[];
};

export type SpotifyLibraryStats = {
  minYear: number;
  maxYear: number;
  genres: string[];
  genreCounts: Record<string, number>;
  maxPlayCount: number;
  playlistIds: string[];
  playlistNames: Record<string, string>;
  playlistCounts: Record<string, number>;
};

import { isExcludedPlaylistName } from "./playlistNames";

export type SpotifyLibraryPayload = {
  contributor: {
    id: string;
    name: string;
  };
  songs: SpotifyLibrarySong[];
  stats: SpotifyLibraryStats;
};

const getPlaylistItemTrack = (entry: SpotifyPlaylistItem): SpotifyTrack | null => {
  const candidate = (entry.item ?? entry.track) as (SpotifyTrack & { type?: string }) | null;
  if (!candidate?.id) {
    return null;
  }
  if (candidate.type && candidate.type !== "track") {
    return null;
  }
  return candidate;
};

export const filterReadablePlaylists = (
  playlists: SpotifyPlaylistSummary[],
  profileId: string
): SpotifyPlaylistSummary[] =>
  playlists.filter(
    (playlist) =>
      (playlist.owner.id === profileId || playlist.collaborative) && !isExcludedPlaylistName(playlist.name)
  );

export const assembleSpotifyLibrary = (input: {
  contributor: SpotifyLibraryPayload["contributor"];
  savedItems: SpotifySavedTrackItem[];
  readablePlaylists: SpotifyPlaylistSummary[];
  playlistItemsByPlaylistId: Record<string, SpotifyPlaylistItem[]>;
  genresByArtistId: Record<string, string[]>;
}): SpotifyLibraryPayload => {
  const playlistNames: Record<string, string> = {};
  const playlistCounts: Record<string, number> = {};
  const trackPlaylists = new Map<string, Set<string>>();
  const trackById = new Map<string, SpotifyTrack>();

  input.savedItems.forEach((item) => {
    if (item.track?.id) {
      trackById.set(item.track.id, item.track);
    }
  });

  input.readablePlaylists.forEach((playlist) => {
    playlistNames[playlist.id] = playlist.name;
    playlistCounts[playlist.id] = 0;
    const playlistItems = input.playlistItemsByPlaylistId[playlist.id] ?? [];
    playlistItems.forEach((entry) => {
      const track = getPlaylistItemTrack(entry);
      const trackId = track?.id;
      if (!trackId) {
        return;
      }
      trackById.set(trackId, track);
      playlistCounts[playlist.id] = (playlistCounts[playlist.id] ?? 0) + 1;
      const memberships = trackPlaylists.get(trackId) ?? new Set<string>();
      memberships.add(playlist.id);
      trackPlaylists.set(trackId, memberships);
    });
  });

  const songs: SpotifyLibrarySong[] = [...trackById.entries()].map(([trackId, track]) => {
    const primaryArtist = track.artists[0];
    const genres = primaryArtist ? input.genresByArtistId[primaryArtist.id] ?? [] : [];
    const savedItem = input.savedItems.find((item) => item.track?.id === trackId);
    return {
      id: trackId,
      title: track.name,
      artist: track.artists.map((artist) => artist.name).join(", "),
      album: track.album.name,
      // Store only the primary artist's first Spotify genre to keep snapshots small.
      genre: genres[0] ?? "Unknown",
      year: Number.parseInt(track.album.release_date.slice(0, 4), 10) || new Date().getFullYear(),
      playCount: track.popularity,
      rating: 0,
      loved: true,
      dateAdded: savedItem?.added_at ?? "",
      trackType: "File",
      durationMs: track.duration_ms,
      playlists: [...(trackPlaylists.get(trackId) ?? [])],
    };
  });

  const genreCounts: Record<string, number> = {};
  songs.forEach((song) => {
    genreCounts[song.genre] = (genreCounts[song.genre] ?? 0) + 1;
  });
  const years = songs.map((song) => song.year);

  return {
    contributor: input.contributor,
    songs,
    stats: {
      minYear: years.length ? Math.min(...years) : 1970,
      maxYear: years.length ? Math.max(...years) : new Date().getFullYear(),
      genres: Object.keys(genreCounts).sort((left, right) => left.localeCompare(right)),
      genreCounts,
      maxPlayCount: songs.reduce((max, song) => Math.max(max, song.playCount), 1),
      playlistIds: input.readablePlaylists.map((playlist) => playlist.id),
      playlistNames,
      playlistCounts,
    },
  };
};

export const mapWithConcurrency = async <T, R>(
  items: T[],
  concurrency: number,
  mapper: (item: T, index: number) => Promise<R>
): Promise<R[]> => {
  if (items.length === 0) {
    return [];
  }

  const results = new Array<R>(items.length);
  let nextIndex = 0;

  const worker = async (): Promise<void> => {
    while (nextIndex < items.length) {
      const currentIndex = nextIndex;
      nextIndex += 1;
      results[currentIndex] = await mapper(items[currentIndex], currentIndex);
    }
  };

  await Promise.all(
    Array.from({ length: Math.min(Math.max(1, concurrency), items.length) }, () => worker())
  );
  return results;
};
