import { beginSpotifyAuth } from "../spotifyPkce";
import {
  assembleSpotifyLibrary,
  filterReadablePlaylists,
  mapWithConcurrency,
  type SpotifyPlaylistItem,
  type SpotifyPlaylistSummary,
  type SpotifySavedTrackItem,
} from "../../../shared/spotifyLibraryAssembly";
import {
  ConnectionStatus,
  CuePlaylistResult,
  LibraryLoadProgress,
  LoadLibraryOptions,
  LoadedLibrary,
  MusicProvider,
} from "../musicProvider";
import { PlaybackState, Song } from "../types";

type SpotifyPage<T> = {
  items: T[];
  next: string | null;
};

const reportProgress = (
  onProgress: LoadLibraryOptions["onProgress"],
  progress: LibraryLoadProgress
): void => {
  onProgress?.(progress);
};

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

const fetchSpotifyPages = async <T>(
  buildUrl: (next: string | null) => string,
  onPage: (pageNumber: number) => void
): Promise<T[]> => {
  const items: T[] = [];
  let next: string | null = null;
  let pageNumber = 0;
  while (true) {
    const payload = await fetchJson<SpotifyPage<T>>(buildUrl(next));
    items.push(...payload.items);
    pageNumber += 1;
    onPage(pageNumber);
    next = payload.next;
    if (!next) {
      break;
    }
  }
  return items;
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

const loadLibraryInChunks = async (options?: LoadLibraryOptions): Promise<LoadedLibrary> => {
  const onProgress = options?.onProgress;

  reportProgress(onProgress, {
    phase: "profile",
    message: "Connecting to Spotify…",
    percent: 2,
  });
  const contributor = await fetchJson<{ id: string; name: string }>("/api/spotify/profile");

  const savedItems = await fetchSpotifyPages<SpotifySavedTrackItem>(
    (next) =>
      next
        ? `/api/spotify/saved-tracks-page?next=${encodeURIComponent(next)}`
        : "/api/spotify/saved-tracks-page",
    (pageNumber) => {
      reportProgress(onProgress, {
        phase: "saved-tracks",
        message: `Loading saved tracks (page ${pageNumber})…`,
        percent: Math.min(22, 3 + pageNumber * 2),
      });
    }
  );

  const playlists = await fetchSpotifyPages<SpotifyPlaylistSummary>(
    (next) =>
      next
        ? `/api/spotify/playlists-page?next=${encodeURIComponent(next)}`
        : "/api/spotify/playlists-page",
    (pageNumber) => {
      reportProgress(onProgress, {
        phase: "playlists",
        message: `Loading playlist list (page ${pageNumber})…`,
        percent: Math.min(28, 23 + pageNumber * 2),
      });
    }
  );

  const readablePlaylists = filterReadablePlaylists(playlists, contributor.id);
  const playlistItemsByPlaylistId: Record<string, SpotifyPlaylistItem[]> = {};
  let completedPlaylists = 0;

  await mapWithConcurrency(readablePlaylists, 3, async (playlist) => {
    const items = await fetchSpotifyPages<SpotifyPlaylistItem>(
      (next) => {
        const params = new URLSearchParams({ playlistId: playlist.id });
        if (next) {
          params.set("next", next);
        }
        return `/api/spotify/playlist-tracks-page?${params.toString()}`;
      },
      () => {
        reportProgress(onProgress, {
          phase: "playlist-tracks",
          message: `Loading playlist ${completedPlaylists + 1} of ${readablePlaylists.length}: ${playlist.name}`,
          percent:
            readablePlaylists.length === 0
              ? 90
              : 28 + ((completedPlaylists + 0.35) / readablePlaylists.length) * 62,
        });
      }
    );
    playlistItemsByPlaylistId[playlist.id] = items;
    completedPlaylists += 1;
    reportProgress(onProgress, {
      phase: "playlist-tracks",
      message: `Loaded playlist ${completedPlaylists} of ${readablePlaylists.length}`,
      percent:
        readablePlaylists.length === 0
          ? 90
          : 28 + (completedPlaylists / readablePlaylists.length) * 62,
    });
  });

  let genresByArtistId: Record<string, string[]> = {};
  const artistIds = collectArtistIds(savedItems, playlistItemsByPlaylistId);
  if (artistIds.length > 0) {
    const genreBatchCount = Math.ceil(artistIds.length / 50);
    for (let index = 0; index < artistIds.length; index += 50) {
      const batchIndex = Math.floor(index / 50) + 1;
      reportProgress(onProgress, {
        phase: "genres",
        message: `Looking up genres (batch ${batchIndex} of ${genreBatchCount})…`,
        percent: 90 + (batchIndex / genreBatchCount) * 8,
      });
      try {
        const genresPayload = await fetchJson<{ genresByArtistId: Record<string, string[]> }>(
          "/api/spotify/artist-genres",
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ artistIds: artistIds.slice(index, index + 50) }),
          }
        );
        genresByArtistId = { ...genresByArtistId, ...(genresPayload.genresByArtistId ?? {}) };
      } catch {
        // Genre lookup is optional.
      }
    }
  }

  reportProgress(onProgress, {
    phase: "assembling",
    message: "Building your library graph…",
    percent: 99,
  });

  const library = assembleSpotifyLibrary({
    contributor,
    savedItems,
    readablePlaylists,
    playlistItemsByPlaylistId,
    genresByArtistId,
  });

  reportProgress(onProgress, {
    phase: "assembling",
    message: `Loaded ${library.songs.length} tracks.`,
    percent: 100,
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

  async loadLibrary(options?: LoadLibraryOptions): Promise<LoadedLibrary> {
    return loadLibraryInChunks(options);
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
