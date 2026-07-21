import { beginSpotifyAuth } from "../spotifyPkce";
import {
  assembleSpotifyLibrary,
  filterReadablePlaylists,
  type SpotifyPlaylistItem,
  type SpotifyPlaylistSummary,
  type SpotifySavedTrackItem,
} from "../../../shared/spotifyLibraryAssembly";
import {
  clearSpotifyImportSession,
  computeSpotifyImportPercent,
  createSpotifyImportSession,
  getSpotifyImportContributorHint,
  getSpotifyImportRateLimitCooldownMs,
  loadSpotifyImportSession,
  markSpotifyImportRateLimited,
  saveSpotifyImportSession,
  SpotifyImportRateLimitError,
  type SpotifyImportSession,
} from "../spotifyImportSession";
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

const PAGE_REQUEST_DELAY_MS = 750;
const PHASE_COOLDOWN_MS = 4_000;

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

const isRateLimitMessage = (message: string): boolean => message.toLowerCase().includes("rate limit");

const isNetworkError = (error: unknown): boolean => {
  if (!(error instanceof Error)) {
    return false;
  }
  const message = error.message.toLowerCase();
  return (
    error.name === "TypeError" ||
    message.includes("failed to fetch") ||
    message.includes("network") ||
    message.includes("load failed")
  );
};

const fetchJson = async <T>(url: string, init?: RequestInit, attempt = 0): Promise<T> => {
  let response: Response;
  try {
    response = await fetch(url, {
      credentials: "include",
      ...init,
    });
  } catch (error) {
    if (isNetworkError(error) && attempt < 3) {
      await sleep(1_500 * (attempt + 1));
      return fetchJson<T>(url, init, attempt + 1);
    }
    throw new Error("Network error while talking to Spotify. Check your connection and try again.");
  }

  const payload = (await response.json().catch(() => ({}))) as T & { error?: string };

  if (!response.ok) {
    const errorMessage = typeof payload.error === "string" ? payload.error : "";
    const rateLimited = response.status === 429 || isRateLimitMessage(errorMessage);

    if (rateLimited) {
      markSpotifyImportRateLimited();
      throw new SpotifyImportRateLimitError(
        errorMessage || "Spotify rate limit reached. Progress saved — wait a minute, then click Load again to resume."
      );
    }

    if ((response.status === 504 || response.status >= 500) && attempt < 3) {
      await sleep(2_000 * (attempt + 1));
      return fetchJson<T>(url, init, attempt + 1);
    }

    if (response.status === 504) {
      throw new Error("Spotify import timed out. Progress was saved — click Load again to resume.");
    }
    throw new Error(errorMessage || `Request failed (${response.status}).`);
  }

  return payload;
};

const fetchSpotifyPage = async <T>(
  endpoint: string,
  next: string | null,
  bodyFields?: Record<string, string>
): Promise<SpotifyPage<T>> => {
  if (!next && !bodyFields) {
    return fetchJson<SpotifyPage<T>>(endpoint);
  }
  return fetchJson<SpotifyPage<T>>(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      ...(bodyFields ?? {}),
      ...(next ? { next } : {}),
    }),
  });
};

const persistSession = (session: SpotifyImportSession): void => {
  void saveSpotifyImportSession(session);
};

const resolveImportContributor = (
  session: SpotifyImportSession | null,
  options?: LoadLibraryOptions
): { id: string; name: string } => {
  if (session?.contributor?.id) {
    return session.contributor;
  }
  if (options?.knownContributor?.id) {
    return options.knownContributor;
  }
  const hintContributor = getSpotifyImportContributorHint();
  if (hintContributor?.id) {
    return hintContributor;
  }
  throw new Error("Connect Spotify before loading your library.");
};

const waitBetweenPages = async (): Promise<void> => {
  await sleep(PAGE_REQUEST_DELAY_MS);
};

const waitBetweenPhases = async (): Promise<void> => {
  await sleep(PHASE_COOLDOWN_MS);
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

const loadSavedTracksPhase = async (
  session: SpotifyImportSession,
  onProgress?: LoadLibraryOptions["onProgress"]
): Promise<void> => {
  if (session.savedTracksComplete) {
    return;
  }

  session.phase = "saved-tracks";
  let pageNumber = Math.max(1, Math.ceil(session.savedItems.length / 50) || 1);
  let nextCursor = session.savedTracksNext;

  while (true) {
    reportProgress(onProgress, {
      phase: "saved-tracks",
      message: `Loading saved tracks (page ${pageNumber}, ${session.savedItems.length.toLocaleString()} so far)…`,
      percent: computeSpotifyImportPercent({
        ...session,
        savedTracksComplete: false,
      }),
    });

    const page = await fetchSpotifyPage<SpotifySavedTrackItem>(
      "/api/spotify/saved-tracks-page",
      nextCursor,
    );
    session.savedItems.push(...page.items);
    session.savedTracksNext = page.next;
    persistSession(session);

    if (!page.next) {
      session.savedTracksNext = null;
      session.savedTracksComplete = true;
      persistSession(session);
      break;
    }

    nextCursor = page.next;
    pageNumber += 1;
    await waitBetweenPages();
  }
};

const loadPlaylistsPhase = async (
  session: SpotifyImportSession,
  onProgress?: LoadLibraryOptions["onProgress"]
): Promise<void> => {
  if (session.playlistsListLoaded) {
    return;
  }

  session.phase = "playlists";
  let pageNumber = Math.max(1, Math.ceil(session.playlists.length / 50) || 1);
  let nextCursor = session.playlistsNext;

  while (true) {
    reportProgress(onProgress, {
      phase: "playlists",
      message: `Loading playlist list (page ${pageNumber}, ${session.playlists.length.toLocaleString()} playlists)…`,
      percent: paginatedPhasePercent(pageNumber, 25, 30),
    });

    const page = await fetchSpotifyPage<SpotifyPlaylistSummary>(
      "/api/spotify/playlists-page",
      nextCursor,
    );
    session.playlists.push(...page.items);
    session.playlistsNext = page.next;
    persistSession(session);

    if (!page.next) {
      session.playlistsNext = null;
      session.playlistsListLoaded = true;
      const readable = filterReadablePlaylists(session.playlists, session.contributor.id);
      session.readablePlaylistIds = readable.map((playlist) => playlist.id);
      persistSession(session);
      break;
    }

    nextCursor = page.next;
    pageNumber += 1;
    await waitBetweenPages();
  }
};

const loadOnePlaylist = async (
  session: SpotifyImportSession,
  playlist: SpotifyPlaylistSummary,
  playlistIndex: number,
  totalPlaylists: number,
  onProgress?: LoadLibraryOptions["onProgress"]
): Promise<void> => {
  const isResume =
    session.activePlaylistId === playlist.id &&
    (session.activePlaylistItems.length > 0 || session.activePlaylistNext !== null);

  if (!isResume) {
    session.activePlaylistId = playlist.id;
    session.activePlaylistItems = [];
    session.activePlaylistNext = null;
    persistSession(session);
  }

  let pageNumber = Math.max(1, Math.ceil(session.activePlaylistItems.length / 50));

  while (session.activePlaylistNext !== null || session.activePlaylistItems.length === 0) {
    reportProgress(onProgress, {
      phase: "playlist-tracks",
      message: `Playlist ${playlistIndex + 1}/${totalPlaylists}: ${playlist.name} (page ${pageNumber}, ${session.activePlaylistItems.length} tracks)`,
      percent: 30 + ((playlistIndex + pageNumber / 20) / Math.max(1, totalPlaylists)) * 58,
    });

    const page = await fetchSpotifyPage<SpotifyPlaylistItem>(
      "/api/spotify/playlist-tracks-page",
      session.activePlaylistNext,
      { playlistId: playlist.id }
    );
    session.activePlaylistItems.push(...page.items);
    session.activePlaylistNext = page.next;
    persistSession(session);

    if (!page.next) {
      break;
    }

    pageNumber += 1;
    await waitBetweenPages();
  }

  session.playlistItemsByPlaylistId[playlist.id] = session.activePlaylistItems;
  session.completedPlaylistIds.push(playlist.id);
  session.activePlaylistId = null;
  session.activePlaylistItems = [];
  session.activePlaylistNext = null;
  persistSession(session);

  reportProgress(onProgress, {
    phase: "playlist-tracks",
    message: `Loaded playlist ${playlistIndex + 1} of ${totalPlaylists}`,
    percent: 30 + ((playlistIndex + 1) / Math.max(1, totalPlaylists)) * 58,
  });

  await waitBetweenPages();
};

const loadPlaylistTracksPhase = async (
  session: SpotifyImportSession,
  onProgress?: LoadLibraryOptions["onProgress"]
): Promise<void> => {
  session.phase = "playlist-tracks";
  persistSession(session);

  const playlistsById = new Map(session.playlists.map((playlist) => [playlist.id, playlist]));
  const totalPlaylists = session.readablePlaylistIds.length;

  for (let index = 0; index < session.readablePlaylistIds.length; index += 1) {
    const playlistId = session.readablePlaylistIds[index];
    if (session.completedPlaylistIds.includes(playlistId)) {
      continue;
    }

    const playlist = playlistsById.get(playlistId);
    if (!playlist) {
      session.completedPlaylistIds.push(playlistId);
      persistSession(session);
      continue;
    }

    await loadOnePlaylist(session, playlist, index, totalPlaylists, onProgress);
  }
};

const loadGenresPhase = async (
  session: SpotifyImportSession,
  onProgress?: LoadLibraryOptions["onProgress"]
): Promise<Record<string, string[]>> => {
  session.phase = "genres";
  persistSession(session);

  let genresByArtistId: Record<string, string[]> = {};
  const artistIds = collectArtistIds(session.savedItems, session.playlistItemsByPlaylistId);
  if (artistIds.length === 0) {
    return genresByArtistId;
  }

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
    } catch (error) {
      if (error instanceof SpotifyImportRateLimitError) {
        throw error;
      }
    }

    if (batchIndex < genreBatchCount) {
      await waitBetweenPages();
    }
  }

  return genresByArtistId;
};

const loadLibraryInChunks = async (options?: LoadLibraryOptions): Promise<LoadedLibrary> => {
  const onProgress = options?.onProgress;

  if (options?.fresh) {
    await clearSpotifyImportSession();
  }

  const cooldownMs = getSpotifyImportRateLimitCooldownMs();
  if (cooldownMs > 0) {
    reportProgress(onProgress, {
      phase: "profile",
      message: `Waiting for Spotify rate limit to clear (${Math.ceil(cooldownMs / 1000)}s)…`,
      percent: 1,
    });
    await sleep(cooldownMs);
  }

  let session = options?.fresh ? null : await loadSpotifyImportSession();
  const profile = resolveImportContributor(session, options);

  if (session && session.contributor.id !== profile.id) {
    await clearSpotifyImportSession();
    session = null;
  }

  if (session) {
    reportProgress(onProgress, {
      phase: session.phase,
      message: `Resuming import (${session.savedItems.length.toLocaleString()} saved tracks loaded)…`,
      percent: computeSpotifyImportPercent(session),
    });
  } else {
    session = createSpotifyImportSession(profile);
    persistSession(session);
    reportProgress(onProgress, {
      phase: "saved-tracks",
      message: "Loading saved tracks…",
      percent: 3,
    });
  }

  try {
    if (!session.savedTracksComplete) {
      await loadSavedTracksPhase(session, onProgress);
      await waitBetweenPhases();
    }

    if (!session.playlistsListLoaded) {
      await loadPlaylistsPhase(session, onProgress);
      await waitBetweenPhases();
    }

    if (session.completedPlaylistIds.length < session.readablePlaylistIds.length) {
      session.phase = "playlist-tracks";
      persistSession(session);
      await loadPlaylistTracksPhase(session, onProgress);
      await waitBetweenPhases();
    }

    const genresByArtistId = await loadGenresPhase(session, onProgress);

    reportProgress(onProgress, {
      phase: "assembling",
      message: "Building your library graph…",
      percent: 99,
    });

    const readablePlaylists = session.readablePlaylistIds
      .map((playlistId) => session.playlists.find((playlist) => playlist.id === playlistId))
      .filter((playlist): playlist is SpotifyPlaylistSummary => Boolean(playlist));

    const library = assembleSpotifyLibrary({
      contributor: session.contributor,
      savedItems: session.savedItems,
      readablePlaylists,
      playlistItemsByPlaylistId: session.playlistItemsByPlaylistId,
      genresByArtistId,
    });

    await clearSpotifyImportSession();

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
  } catch (error) {
    persistSession(session);
    if (error instanceof SpotifyImportRateLimitError) {
      throw error;
    }
    throw error;
  }
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

export {
  clearSpotifyImportSession,
  getSpotifyImportContributorHint,
  getSpotifyImportResumeLabel,
  hasResumableSpotifyImport,
  SpotifyImportRateLimitError,
} from "../spotifyImportSession";
