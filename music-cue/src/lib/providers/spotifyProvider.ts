import { beginSpotifyAuth } from "../spotifyPkce";
import {
  assembleSpotifyLibrary,
  filterReadablePlaylists,
  mapWithConcurrency,
  type SpotifyPlaylistItem,
  type SpotifyPlaylistSummary,
  type SpotifySavedTrackItem,
} from "../../../shared/spotifyLibraryAssembly";
import { ConnectionStatus, CuePlaylistResult, LoadedLibrary, MusicProvider } from "../musicProvider";
import { PlaybackState, Song } from "../types";

const fetchJson = async <T>(url: string, init?: RequestInit): Promise<T> => {
  const response = await fetch(url, {
    credentials: "include",
    ...init,
  });
  if (!response.ok) {
    const payload = (await response.json().catch(() => ({}))) as { error?: string };
    if (response.status === 504) {
      throw new Error("Spotify import timed out. Try again in a moment.");
    }
    throw new Error(payload.error ?? `Request failed (${response.status}).`);
  }
  return (await response.json()) as T;
};

const collectArtistIds = (
  savedItems: SpotifySavedTrackItem[],
  playlistItemsByPlaylistId: Record<string, SpotifyPlaylistItem[]>
): string[] => {
  const artistIds = savedItems.flatMap((item) =>
    item.track ? item.track.artists.map((artist) => artist.id) : []
  );
  Object.values(playlistItemsByPlaylistId).forEach((entries) => {
    entries.forEach((entry) => {
      const track = entry.item ?? entry.track;
      if (track) {
        artistIds.push(...track.artists.map((artist) => artist.id));
      }
    });
  });
  return [...new Set(artistIds)];
};

const loadLibraryInChunks = async (): Promise<LoadedLibrary> => {
  const [contributor, savedPayload, playlistsPayload] = await Promise.all([
    fetchJson<{ id: string; name: string }>("/api/spotify/profile"),
    fetchJson<{ items: SpotifySavedTrackItem[] }>("/api/spotify/saved-tracks"),
    fetchJson<{ playlists: SpotifyPlaylistSummary[] }>("/api/spotify/playlists"),
  ]);

  const readablePlaylists = filterReadablePlaylists(playlistsPayload.playlists, contributor.id);
  const playlistItemsByPlaylistId: Record<string, SpotifyPlaylistItem[]> = {};

  await mapWithConcurrency(readablePlaylists, 3, async (playlist) => {
    try {
      const payload = await fetchJson<{ items: SpotifyPlaylistItem[] }>(
        `/api/spotify/playlist-tracks?playlistId=${encodeURIComponent(playlist.id)}`
      );
      playlistItemsByPlaylistId[playlist.id] = payload.items;
    } catch {
      playlistItemsByPlaylistId[playlist.id] = [];
    }
  });

  let genresByArtistId: Record<string, string[]> = {};
  const artistIds = collectArtistIds(savedPayload.items, playlistItemsByPlaylistId);
  if (artistIds.length > 0) {
    try {
      const genresPayload = await fetchJson<{ genresByArtistId: Record<string, string[]> }>(
        "/api/spotify/artist-genres",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ artistIds }),
        }
      );
      genresByArtistId = genresPayload.genresByArtistId ?? {};
    } catch {
      // Genre lookup is optional.
    }
  }

  const library = assembleSpotifyLibrary({
    contributor,
    savedItems: savedPayload.items,
    readablePlaylists,
    playlistItemsByPlaylistId,
    genresByArtistId,
  });

  return {
    songs: library.songs,
    stats: library.stats,
    contributor: library.contributor,
  };
};

export const spotifyProvider: MusicProvider = {
  id: "spotify",
  displayName: "Spotify",
  supportsLibraryFileImport: false,
  supportsPlaybackTracking: true,

  async getConnectionStatus(): Promise<ConnectionStatus> {
    return fetchJson<ConnectionStatus>("/api/spotify/status");
  },

  async connect() {
    const { authorizeUrl } = await beginSpotifyAuth();
    // Spotify blocks login inside iframes; use the top window on mobile embeds.
    const target = window.top ?? window;
    target.location.href = authorizeUrl;
  },

  async disconnect() {
    await fetchJson("/api/spotify/disconnect", { method: "POST" });
  },

  async loadLibrary(): Promise<LoadedLibrary> {
    return loadLibraryInChunks();
  },

  async validateTracks(songs) {
    const payload = await fetchJson<{ availability: Record<string, boolean> }>("/api/spotify/validate-tracks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ trackIds: songs.map((song) => song.id) }),
    });
    return payload.availability ?? {};
  },

  async playCue(songs) {
    return fetchJson<CuePlaylistResult>("/api/spotify/play-cue", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ trackIds: songs.map((song) => song.id) }),
    });
  },

  async savePlaylist(songs, playlistName) {
    return fetchJson<CuePlaylistResult>("/api/spotify/save-playlist", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        trackIds: songs.map((song) => song.id),
        playlistName: playlistName.trim(),
      }),
    });
  },

  async getPlaybackState(): Promise<PlaybackState | null> {
    const payload = await fetchJson<PlaybackState | { title?: string }>("/api/spotify/playback-state");
    if (!payload || !("title" in payload) || !payload.title) {
      return null;
    }
    return payload as PlaybackState;
  },
};

export const isSpotifySong = (song: Song): boolean => /^[A-Za-z0-9]{22}$/.test(song.id);
