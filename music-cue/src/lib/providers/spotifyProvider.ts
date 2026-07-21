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

const PAGE_REQUEST_DELAY_MS = 320;
const PAGE_BURST_DELAY_MS = 900;
const PAGE_BURST_INTERVAL = 8;
const PLAYLIST_FETCH_CONCURRENCY = 2;

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

const reportProgress = (
  onProgress: LoadLibraryOptions["onProgress"],
  progress: LibraryLoadProgress
): void => {
  onProgress?.(progress);
};

const paginatedPhasePercent = (pageNumber: number, startPercent: number, endPercent: number): number => {
  const span = endPercent - startPercent;
  const progress = 1 - 1 / (1 + pageNumber / 12);
  return Math.min(endPercent - 1, startPercent + span * progress);
};

const fetchJson = async <T>(url: string, init?: RequestInit, attempt = 0): Promise<T> => {
  const response = await fetch(url, {
    credentials: "include",
    ...init,
  });
  const payload = (await response.json().catch(() => ({}))) as T & { error?: string };

  if (!response.ok) {
    const errorMessage = typeof payload.error === "string" ? payload.error : "";
    const isRateLimited = errorMessage.toLowerCase().includes("rate limit");
    const isRetryable = response.status === 429 || response.status === 504 || isRateLimited;

    if (isRetryable && attempt < 8) {
      const waitMs = Math.min(1_500 * 2 ** attempt, 12_000);
      await sleep(waitMs);
      return fetchJson<T>(url, init, attempt + 1);
    }

    if (response.status === 504) {
      throw new Error("Spotify import timed out. Wait a minute and try again.");
    }
    throw new Error(errorMessage || `Request failed (${response.status}).`);
  }

  return payload;
};

const fetchSpotifyPages = async <T>(
  endpoint: string,
  onPage: (pageNumber: number, itemCount: number) => void,
  bodyFields?: Record<string, string>
): Promise<T[]> => {
  const items: T[] = [];
  let next: string | null = null;
  let pageNumber = 0;

  while (true) {
    const payload = await fetchJson<SpotifyPage<T>>(
      endpoint,
      next || bodyFields
        ? {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              ...(bodyFields ?? {}),
              ...(next ? { next } : {}),
            }),
          }
        : undefined
    );
    items.push(...payload.items);
    pageNumber += 1;
    onPage(pageNumber, items.length);
    next = payload.next;
    if (!next) {
      break;
    }
    if (pageNumber % PAGE_BURST_INTERVAL === 0) {
      await sleep(PAGE_BURST_DELAY_MS);
    } else {
      await sleep(PAGE_REQUEST_DELAY_MS);
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
    "/api/spotify/saved-tracks-page",
    (pageNumber, itemCount) => {
      reportProgress(onProgress, {
        phase: "saved-tracks",
        message: `Loading saved tracks (page ${pageNumber}, ${itemCount.toLocaleString()} so far)…`,
        percent: paginatedPhasePercent(pageNumber, 3, 25),
      });
    }
  );

  const playlists = await fetchSpotifyPages<SpotifyPlaylistSummary>(
    "/api/spotify/playlists-page",
    (pageNumber, itemCount) => {
      reportProgress(onProgress, {
        phase: "playlists",
        message: `Loading playlist list (page ${pageNumber}, ${itemCount.toLocaleString()} playlists)…`,
        percent: paginatedPhasePercent(pageNumber, 25, 30),
      });
    }
  );

  const readablePlaylists = filterReadablePlaylists(playlists, contributor.id);
  const playlistItemsByPlaylistId: Record<string, SpotifyPlaylistItem[]> = {};
  let completedPlaylists = 0;

  await mapWithConcurrency(readablePlaylists, PLAYLIST_FETCH_CONCURRENCY, async (playlist) => {
    const items = await fetchSpotifyPages<SpotifyPlaylistItem>(
      "/api/spotify/playlist-tracks-page",
      (pageNumber, itemCount) => {
        reportProgress(onProgress, {
          phase: "playlist-tracks",
          message: `Playlist ${completedPlaylists + 1}/${readablePlaylists.length}: ${playlist.name} (page ${pageNumber}, ${itemCount} tracks)`,
          percent:
            readablePlaylists.length === 0
              ? 90
              : 30 + ((completedPlaylists + pageNumber / 20) / readablePlaylists.length) * 58,
        });
      },
      { playlistId: playlist.id }
    );
    playlistItemsByPlaylistId[playlist.id] = items;
    completedPlaylists += 1;
    reportProgress(onProgress, {
      phase: "playlist-tracks",
      message: `Loaded playlist ${completedPlaylists} of ${readablePlaylists.length}`,
      percent:
        readablePlaylists.length === 0
          ? 90
          : 30 + (completedPlaylists / readablePlaylists.length) * 58,
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
        percent: 88 + (batchIndex / genreBatchCount) * 10,
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
      if (batchIndex < genreBatchCount) {
        await sleep(PAGE_REQUEST_DELAY_MS);
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
    message: `Loaded ${library.songs.length.toLocaleString()} tracks.`,
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
