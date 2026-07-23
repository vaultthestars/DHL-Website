import { beginSpotifyAuth } from "../spotifyPkce";
import {
  assembleSpotifyLibrary,
  filterReadablePlaylists,
  type SpotifyPlaylistItem,
  type SpotifyPlaylistSummary,
  type SpotifySavedTrackItem,
} from "../../../shared/spotifyLibraryAssembly";
import { sanitizeLibraryPayload } from "../../../shared/librarySanitize";
import {
  clearSpotifyImportSession,
  computeSpotifyImportPercent,
  createSpotifyImportSession,
  clearSpotifyRateLimitCooldown,
  formatSpotifyRateLimitCooldown,
  getSpotifyImportContributorHint,
  getSpotifyImportRateLimitCooldownMs,
  loadConnectedSpotifyUser,
  loadSpotifyImportSession,
  markSpotifyImportRateLimited,
  saveSpotifyImportSession,
  SpotifyImportPausedError,
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
import { mergeLoadedLibraries } from "../spotifyLibraryMerge";
import { PlaybackState, Song } from "../types";

type SpotifyPage<T> = {
  items: T[];
  next: string | null;
};

const PAGE_REQUEST_DELAY_MS = 750;
const PHASE_COOLDOWN_MS = 4_000;
const POST_COOLDOWN_BUFFER_MS = 3_000;
/** When true, each loadLibrary() call performs one Spotify request then pauses (manual resume). */
const SINGLE_STEP_IMPORT = false;

let spotifyImportInFlight = false;

type SpotifyFetchOptions = {
  /** Only successful library-import calls should clear a Spotify rate-limit cooldown. */
  clearsRateLimit?: boolean;
  /** Only library-import API calls should extend the import resume cooldown. */
  marksImportRateLimit?: boolean;
};

const isSpotifyImportApiRequest = (url: string): boolean =>
  /\/api\/spotify\/(saved-tracks-page|playlists-page|playlist-tracks-page|library)(\/|$|\?)/.test(
    url
  );

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

const fetchJson = async <T>(
  url: string,
  init?: RequestInit,
  attempt = 0,
  options: SpotifyFetchOptions = {}
): Promise<T> => {
  const clearsRateLimit = options.clearsRateLimit ?? true;
  let response: Response;
  try {
    response = await fetch(url, {
      credentials: "include",
      ...init,
    });
  } catch (error) {
    if (isNetworkError(error) && attempt < 3) {
      await sleep(1_500 * (attempt + 1));
      return fetchJson<T>(url, init, attempt + 1, options);
    }
    throw new Error("Network error while talking to Spotify. Check your connection and try again.");
  }

  const payload = (await response.json().catch(() => ({}))) as T & {
    error?: string;
    retryAfterSeconds?: number;
  };

  if (!response.ok) {
    const errorMessage = typeof payload.error === "string" ? payload.error : "";
    const rateLimited = response.status === 429 || isRateLimitMessage(errorMessage);

    if (rateLimited) {
      const retryAfterSeconds =
        typeof payload.retryAfterSeconds === "number" && payload.retryAfterSeconds > 0
          ? payload.retryAfterSeconds
          : undefined;
      if (options.marksImportRateLimit ?? isSpotifyImportApiRequest(url)) {
        markSpotifyImportRateLimited(retryAfterSeconds);
        const cooldownMs = getSpotifyImportRateLimitCooldownMs();
        throw new SpotifyImportRateLimitError(
          errorMessage ||
            `Spotify is rate-limiting this app. Wait ${formatSpotifyRateLimitCooldown(cooldownMs)} before resuming — progress is saved.`
        );
      }
      const waitLabel =
        retryAfterSeconds !== undefined
          ? formatSpotifyRateLimitCooldown(retryAfterSeconds * 1000)
          : "a bit";
      throw new Error(errorMessage || `Spotify is rate-limiting requests. Wait ${waitLabel} and try again.`);
    }

    if (response.status === 504) {
      throw new Error(
        "Server timed out loading from Spotify (Vercel Hobby 10s limit). Wait 30s, then click Resume load & share."
      );
    }

    if ((response.status === 502 || response.status === 503) && attempt < 2) {
      await sleep(2_000 * (attempt + 1));
      return fetchJson<T>(url, init, attempt + 1, options);
    }

    throw new Error(errorMessage || `Request failed (${response.status}).`);
  }

  if (clearsRateLimit) {
    clearSpotifyRateLimitCooldown();
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

const warmupSpotifyApi = async (): Promise<void> => {
  await fetchJson<{ ok: true }>("/api/spotify/warmup", undefined, 0, { clearsRateLimit: false });
};

const pauseImportAfterStep = (
  session: SpotifyImportSession,
  message: string,
  onProgress?: LoadLibraryOptions["onProgress"]
): never => {
  const percent = computeSpotifyImportPercent(session);
  reportProgress(onProgress, {
    phase: session.phase,
    message,
    percent,
  });
  throw new SpotifyImportPausedError(message, percent);
};

const persistSession = (session: SpotifyImportSession): void => {
  void saveSpotifyImportSession(session);
};

const resolveImportContributor = async (
  session: SpotifyImportSession | null,
  options?: LoadLibraryOptions
): Promise<{ id: string; name: string }> => {
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
  const connectedContributor = loadConnectedSpotifyUser();
  if (connectedContributor?.id) {
    return connectedContributor;
  }
  throw new Error(
    "Spotify account id is not available yet. Reconnect Spotify, or wait a minute if you were rate limited."
  );
};

const waitBetweenPages = async (): Promise<void> => {
  await sleep(PAGE_REQUEST_DELAY_MS);
};

const waitBetweenPhases = async (): Promise<void> => {
  await sleep(PHASE_COOLDOWN_MS);
};

export const fetchSpotifyPlaylistCatalog = async (): Promise<SpotifyPlaylistSummary[]> => {
  const playlists: SpotifyPlaylistSummary[] = [];
  let cursor: string | null = null;

  while (true) {
    const page = await fetchSpotifyPage<SpotifyPlaylistSummary>("/api/spotify/playlists-page", cursor);
    playlists.push(...page.items);
    if (!page.next) {
      break;
    }
    cursor = page.next;
    await waitBetweenPages();
  }

  return playlists;
};

const loadSelectedPlaylists = async (
  options: LoadLibraryOptions & { selectedPlaylistIds: string[] },
  onProgress?: LoadLibraryOptions["onProgress"]
): Promise<LoadedLibrary> => {
  const profile = await resolveImportContributor(null, options);
  const session = createSpotifyImportSession(profile);

  if (options.includeSavedTracks) {
    reportProgress(onProgress, {
      phase: "saved-tracks",
      message: "Loading saved tracks…",
      percent: 5,
    });
    await loadSavedTracksPhase(session, onProgress);
    await waitBetweenPhases();
  } else {
    session.savedTracksComplete = true;
    persistSession(session);
  }

  const catalog = options.playlistCatalog ?? (await fetchSpotifyPlaylistCatalog());
  session.playlists = catalog;
  session.playlistsListLoaded = true;
  const readable = filterReadablePlaylists(catalog, profile.id);
  session.readablePlaylistIds = readable
    .map((playlist) => playlist.id)
    .filter((playlistId) => options.selectedPlaylistIds.includes(playlistId));
  persistSession(session);

  if (session.readablePlaylistIds.length === 0 && !options.includeSavedTracks) {
    throw new Error("Select at least one playlist or refresh Liked Songs.");
  }

  if (session.readablePlaylistIds.length > 0) {
    session.phase = "playlist-tracks";
    persistSession(session);
    await loadPlaylistTracksPhase(session, onProgress);
    await waitBetweenPhases();
  } else {
    session.playlistTracksComplete = true;
    persistSession(session);
  }

  const genresByArtistId: Record<string, string[]> = {};

  reportProgress(onProgress, {
    phase: "assembling",
    message: "Merging library updates…",
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

  const sanitized = sanitizeLibraryPayload(library);
  await clearSpotifyImportSession();

  const loaded: LoadedLibrary = {
    songs: sanitized.songs,
    stats: sanitized.stats,
    contributor: sanitized.contributor,
  };

  if (options.mergeWithExisting) {
    const merged = mergeLoadedLibraries(options.mergeWithExisting, loaded);
    reportProgress(onProgress, {
      phase: "assembling",
      message: `Merged ${merged.songs.length.toLocaleString()} tracks.`,
      percent: 100,
    });
    return merged;
  }

  reportProgress(onProgress, {
    phase: "assembling",
    message: `Loaded ${loaded.songs.length.toLocaleString()} tracks.`,
    percent: 100,
  });

  return loaded;
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
  const nextCursor = session.savedTracksNext;

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
  }

  if (SINGLE_STEP_IMPORT) {
    pauseImportAfterStep(
      session,
      session.savedTracksComplete
        ? `Saved tracks complete (${session.savedItems.length.toLocaleString()} tracks) — loading playlists…`
        : `Loaded saved tracks page ${pageNumber} (${session.savedItems.length.toLocaleString()} so far)…`,
      onProgress
    );
  }

  if (!page.next) {
    return;
  }

  let cursor = page.next;
  pageNumber += 1;
  while (true) {
    reportProgress(onProgress, {
      phase: "saved-tracks",
      message: `Loading saved tracks (page ${pageNumber}, ${session.savedItems.length.toLocaleString()} so far)…`,
      percent: computeSpotifyImportPercent({
        ...session,
        savedTracksComplete: false,
      }),
    });

    const nextPage = await fetchSpotifyPage<SpotifySavedTrackItem>(
      "/api/spotify/saved-tracks-page",
      cursor,
    );
    session.savedItems.push(...nextPage.items);
    session.savedTracksNext = nextPage.next;
    persistSession(session);

    if (!nextPage.next) {
      session.savedTracksNext = null;
      session.savedTracksComplete = true;
      persistSession(session);
      break;
    }

    cursor = nextPage.next;
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
  const nextCursor = session.playlistsNext;

  const progressMessage = `Loading playlist list (page ${pageNumber}, ${session.playlists.length.toLocaleString()} playlists)`;
  reportProgress(onProgress, {
    phase: "playlists",
    message: `${progressMessage}…`,
    percent: paginatedPhasePercent(pageNumber, 25, 30),
  });

  const page = await fetchSpotifyPage<SpotifyPlaylistSummary>(
    "/api/spotify/playlists-page",
    nextCursor
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
  }

  if (SINGLE_STEP_IMPORT) {
    pauseImportAfterStep(
      session,
      session.playlistsListLoaded
        ? `Playlist list complete (${session.playlists.length.toLocaleString()} playlists) — loading playlist tracks…`
        : `Loaded playlist list page ${pageNumber} (${session.playlists.length.toLocaleString()} playlists)…`,
      onProgress
    );
  }

  if (page.next) {
    let cursor = page.next;
    pageNumber += 1;
    while (true) {
      const nextProgressMessage = `Loading playlist list (page ${pageNumber}, ${session.playlists.length.toLocaleString()} playlists)`;
      reportProgress(onProgress, {
        phase: "playlists",
        message: `${nextProgressMessage}…`,
        percent: paginatedPhasePercent(pageNumber, 25, 30),
      });

      const nextPage = await fetchSpotifyPage<SpotifyPlaylistSummary>(
        "/api/spotify/playlists-page",
        cursor
      );
      session.playlists.push(...nextPage.items);
      session.playlistsNext = nextPage.next;
      persistSession(session);

      if (!nextPage.next) {
        session.playlistsNext = null;
        session.playlistsListLoaded = true;
        const readable = filterReadablePlaylists(session.playlists, session.contributor.id);
        session.readablePlaylistIds = readable.map((playlist) => playlist.id);
        persistSession(session);
        break;
      }

      cursor = nextPage.next;
      pageNumber += 1;
      await waitBetweenPages();
    }
  }
};

const completeActivePlaylist = (
  session: SpotifyImportSession,
  playlist: SpotifyPlaylistSummary,
  playlistIndex: number,
  totalPlaylists: number,
  onProgress?: LoadLibraryOptions["onProgress"]
): void => {
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
  let pageNext: string | null = session.activePlaylistNext;

  while (pageNext !== null || session.activePlaylistItems.length === 0) {
    reportProgress(onProgress, {
      phase: "playlist-tracks",
      message: `Playlist ${playlistIndex + 1}/${totalPlaylists}: ${playlist.name} (page ${pageNumber}, ${session.activePlaylistItems.length} tracks)`,
      percent: 30 + ((playlistIndex + pageNumber / 20) / Math.max(1, totalPlaylists)) * 58,
    });

    const page = await fetchSpotifyPage<SpotifyPlaylistItem>(
      "/api/spotify/playlist-tracks-page",
      pageNext,
      { playlistId: playlist.id }
    );
    session.activePlaylistItems.push(...page.items);
    session.activePlaylistNext = page.next;
    pageNext = page.next;
    persistSession(session);

    if (!page.next) {
      completeActivePlaylist(session, playlist, playlistIndex, totalPlaylists, onProgress);
    }

    if (SINGLE_STEP_IMPORT) {
      pauseImportAfterStep(
        session,
        page.next
          ? `Loaded ${playlist.name} page ${pageNumber}…`
          : `Loaded playlist ${playlistIndex + 1}/${totalPlaylists} (${playlist.name})…`,
        onProgress
      );
    }

    if (!page.next) {
      break;
    }

    pageNumber += 1;
    await waitBetweenPages();
  }

  await waitBetweenPages();
};

/** Re-fetch the Spotify playlist list so deleted playlists drop off before assembly. */
const refreshSessionPlaylistCatalog = async (session: SpotifyImportSession): Promise<void> => {
  const playlists: SpotifyPlaylistSummary[] = [];
  let cursor: string | null = null;

  while (true) {
    const page = await fetchSpotifyPage<SpotifyPlaylistSummary>("/api/spotify/playlists-page", cursor);
    playlists.push(...page.items);
    if (!page.next) {
      break;
    }
    cursor = page.next;
    await waitBetweenPages();
  }

  session.playlists = playlists;
  session.playlistsNext = null;
  session.playlistsListLoaded = true;

  const readable = filterReadablePlaylists(playlists, session.contributor.id);
  const readableIds = new Set(readable.map((playlist) => playlist.id));
  session.readablePlaylistIds = readable.map((playlist) => playlist.id);

  Object.keys(session.playlistItemsByPlaylistId).forEach((playlistId) => {
    if (!readableIds.has(playlistId)) {
      delete session.playlistItemsByPlaylistId[playlistId];
    }
  });
  session.completedPlaylistIds = session.completedPlaylistIds.filter((playlistId) => readableIds.has(playlistId));

  if (session.activePlaylistId && !readableIds.has(session.activePlaylistId)) {
    session.activePlaylistId = null;
    session.activePlaylistItems = [];
    session.activePlaylistNext = null;
  }

  persistSession(session);
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

const loadLibraryInChunks = async (options?: LoadLibraryOptions): Promise<LoadedLibrary> => {
  if (spotifyImportInFlight) {
    throw new Error("Spotify import is already running. Wait for it to finish before clicking Resume again.");
  }
  spotifyImportInFlight = true;

  const onProgress = options?.onProgress;

  try {
    if (options?.includeSavedTracks || (options?.selectedPlaylistIds && options.selectedPlaylistIds.length > 0)) {
      return await loadSelectedPlaylists(
        {
          ...options,
          selectedPlaylistIds: options.selectedPlaylistIds ?? [],
        } as LoadLibraryOptions & { selectedPlaylistIds: string[] },
        onProgress
      );
    }

    if (options?.fresh) {
      await clearSpotifyImportSession();
    }

    const cooldownMs = getSpotifyImportRateLimitCooldownMs();
    if (cooldownMs > 0) {
      reportProgress(onProgress, {
        phase: "profile",
        message: `Waiting for Spotify rate limit to clear (${formatSpotifyRateLimitCooldown(cooldownMs)})…`,
        percent: 1,
      });
      await sleep(cooldownMs);
      await sleep(POST_COOLDOWN_BUFFER_MS);
    }

    let session = options?.fresh ? null : await loadSpotifyImportSession();
    const profile = await resolveImportContributor(session, options);

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

    if (!session.savedTracksComplete) {
      if (!SINGLE_STEP_IMPORT && session.savedItems.length === 0) {
        await warmupSpotifyApi();
      }
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

    await refreshSessionPlaylistCatalog(session);

    const genresByArtistId: Record<string, string[]> = {};

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

    const sanitized = sanitizeLibraryPayload(library);

    await clearSpotifyImportSession();

    reportProgress(onProgress, {
      phase: "assembling",
      message: `Loaded ${sanitized.songs.length.toLocaleString()} tracks.`,
      percent: 100,
    });

    return {
      songs: sanitized.songs,
      stats: sanitized.stats,
      contributor: sanitized.contributor,
    };
  } catch (error) {
    const session = await loadSpotifyImportSession();
    if (session) {
      persistSession(session);
    }
    throw error;
  } finally {
    spotifyImportInFlight = false;
  }
};

export const spotifyProvider: MusicProvider = {
  id: "spotify",
  displayName: "Spotify",
  supportsLibraryFileImport: false,
  supportsPlaybackTracking: true,

  async getConnectionStatus(): Promise<ConnectionStatus> {
    return fetchJson<ConnectionStatus>("/api/spotify/status", undefined, 0, { clearsRateLimit: false });
  },

  async connect() {
    const { authorizeUrl } = await beginSpotifyAuth();
    const target = window.top ?? window;
    target.location.href = authorizeUrl;
  },

  async disconnect() {
    await fetchJson("/api/spotify/disconnect", { method: "POST" }, 0, { clearsRateLimit: false });
  },

  async loadLibrary(options?: LoadLibraryOptions): Promise<LoadedLibrary> {
    return loadLibraryInChunks(options);
  },

  async validateTracks(songs) {
    const payload = await fetchJson<{ availability: Record<string, boolean> }>(
      "/api/spotify/validate-tracks",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ trackIds: songs.map((song) => song.id) }),
      },
      0,
      { clearsRateLimit: false, marksImportRateLimit: false }
    );
    return payload.availability ?? {};
  },

  async playCue(songs) {
    return fetchJson<CuePlaylistResult>(
      "/api/spotify/play-cue",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ trackIds: songs.map((song) => song.id) }),
      },
      0,
      { clearsRateLimit: false, marksImportRateLimit: false }
    );
  },

  async savePlaylist(songs, playlistName) {
    return fetchJson<CuePlaylistResult>(
      "/api/spotify/save-playlist",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          trackIds: songs.map((song) => song.id),
          playlistName: playlistName.trim(),
        }),
      },
      0,
      { clearsRateLimit: false, marksImportRateLimit: false }
    );
  },

  async getPlaybackState(): Promise<PlaybackState | null> {
    const payload = await fetchJson<PlaybackState | { title?: string }>(
      "/api/spotify/playback-state",
      undefined,
      0,
      { clearsRateLimit: false, marksImportRateLimit: false }
    );
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
  saveConnectedSpotifyUser,
  SpotifyImportPausedError,
  SpotifyImportRateLimitError,
} from "../spotifyImportSession";
