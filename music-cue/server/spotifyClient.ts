import {
  assembleSpotifyLibrary,
  filterReadablePlaylists,
  mapWithConcurrency,
  type SpotifyLibraryPayload,
  type SpotifyPlaylistItem,
  type SpotifyPlaylistSummary,
  type SpotifySavedTrackItem,
} from "../shared/spotifyLibraryAssembly.js";
import {
  SpotifyTokens,
  buildSpotifySessionSetCookie,
  getSpotifySessionCookie,
} from "./spotifySession.js";

export type { SpotifyLibraryPayload, SpotifyLibrarySong, SpotifyLibraryStats } from "../shared/spotifyLibraryAssembly.js";

export class SpotifyRateLimitError extends Error {
  readonly retryAfterSeconds: number;

  constructor(message: string, retryAfterSeconds: number) {
    super(message);
    this.name = "SpotifyRateLimitError";
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

const SPOTIFY_ACCOUNTS_URL = "https://accounts.spotify.com";
const SPOTIFY_API_URL = "https://api.spotify.com/v1";
export const SPOTIFY_NOW_PLAYING_PLAYLIST_NAME = "MusicCue — Now Playing";

const SPOTIFY_SCOPES = [
  "user-library-read",
  "playlist-read-private",
  "playlist-modify-private",
  "user-read-playback-state",
  "user-modify-playback-state",
].join(" ");

type SpotifyDevice = {
  id: string;
  is_active: boolean;
  is_restricted: boolean;
  name: string;
  type: string;
  volume_percent: number | null;
};

const NO_DEVICES_MESSAGE =
  "No Spotify devices found. Open the Spotify app, play any song once, then try Play again.";

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

const parseRetryAfterMs = (retryAfterHeader: string | null, attempt: number): number => {
  if (retryAfterHeader) {
    const seconds = Number.parseInt(retryAfterHeader, 10);
    if (Number.isFinite(seconds) && seconds > 0) {
      return seconds * 1000;
    }
  }
  return Math.min(1000 * 2 ** attempt, 10_000);
};

const SPOTIFY_API_ORIGIN = "https://api.spotify.com";
/** Keep each serverless invocation under Vercel Hobby's 10s limit. */
const SPOTIFY_REQUEST_TIMEOUT_MS = 6_000;
const SPOTIFY_TOKEN_TIMEOUT_MS = 4_000;
const PLAYLISTS_PAGE_DEFAULT_PATH = "/me/playlists?limit=50";

const tryDecodeURIComponent = (value: string): string => {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
};

const toSpotifyRelativePath = (raw: string | null | undefined): string => {
  const trimmed = tryDecodeURIComponent(raw?.trim() ?? "");
  if (!trimmed) {
    return "";
  }
  if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
    const url = new URL(trimmed);
    if (url.origin !== SPOTIFY_API_ORIGIN) {
      throw new Error("Invalid Spotify pagination path.");
    }
    const pathname = url.pathname.startsWith("/v1") ? url.pathname.slice(3) : url.pathname;
    return `${pathname}${url.search}`;
  }
  return trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
};

const toSpotifyNextCursor = (next: string | null | undefined): string | null => {
  if (!next) {
    return null;
  }
  try {
    const relative = toSpotifyRelativePath(next);
    return relative || null;
  } catch {
    return null;
  }
};

const resolveSpotifyPagePath = (
  nextPath: string | null | undefined,
  defaultPath: string,
  allowedPrefixes: string[]
): string => {
  const normalized = toSpotifyRelativePath(nextPath);
  if (!normalized) {
    return defaultPath;
  }
  if (normalized.includes("..")) {
    throw new Error("Invalid Spotify pagination path.");
  }
  if (!allowedPrefixes.some((prefix) => normalized.startsWith(prefix))) {
    throw new Error("Invalid Spotify pagination path.");
  }
  return normalized;
};

const formatSpotifyApiError = (status: number, path: string, spotifyMessage?: string): string => {
  const normalizedMessage = spotifyMessage?.toLowerCase() ?? "";
  if (status === 429) {
    return "Spotify rate limit reached. Progress saved — wait for the countdown, then click Resume load & share.";
  }
  if (status === 504) {
    return "Spotify library import timed out. Try again in a moment.";
  }
  if (normalizedMessage.includes("timed out") || normalizedMessage.includes("timeout")) {
    return "Spotify API timed out. Progress saved — wait a moment, then click Resume load & share.";
  }
  if (
    status === 403 &&
    (normalizedMessage.includes("not registered") ||
      normalizedMessage.includes("developer dashboard") ||
      normalizedMessage.includes("check settings on developer.spotify.com"))
  ) {
    return (
      "This Spotify account is not allowlisted for this app yet. The site owner must add your Spotify " +
      "email in the Spotify Developer Dashboard (User Management), then you can disconnect and connect again."
    );
  }
  if (spotifyMessage) {
    return `${spotifyMessage} (${path})`;
  }
  return `Spotify API error (${status}) (${path})`;
};

const pickPlaybackDevice = (devices: SpotifyDevice[]): SpotifyDevice | null => {
  const available = devices.filter((device) => device.id && !device.is_restricted);
  if (available.length === 0) {
    return null;
  }
  return (
    available.find((device) => device.is_active) ??
    available.find((device) => device.type === "Computer") ??
    available[0]
  );
};

export type SpotifySessionStore = {
  getTokens: () => SpotifyTokens | null;
  setTokens: (tokens: SpotifyTokens | null) => void;
};

export const getSpotifyRedirectUri = (): string => {
  if (process.env.SPOTIFY_REDIRECT_URI) {
    return process.env.SPOTIFY_REDIRECT_URI;
  }
  if (process.env.SITE_URL) {
    return `${process.env.SITE_URL.replace(/\/$/, "")}/music-cue/spotify/callback`;
  }
  return "http://127.0.0.1:5174/spotify/callback";
};

export const isSpotifyConfigured = (): boolean =>
  Boolean(process.env.SPOTIFY_CLIENT_ID && process.env.SPOTIFY_CLIENT_SECRET);

export const createCookieSessionStore = (
  cookieHeader: string | undefined,
  setCookie: (value: string) => void
): SpotifySessionStore => {
  let tokens = getSpotifySessionCookie(cookieHeader);
  return {
    getTokens: () => tokens,
    setTokens: (nextTokens) => {
      tokens = nextTokens;
      setCookie(buildSpotifySessionSetCookie(nextTokens));
    },
  };
};

export const createSpotifyClient = (store: SpotifySessionStore) => {
  const buildAuthorizeUrl = (codeChallenge: string, state: string): string => {
    const clientId = process.env.SPOTIFY_CLIENT_ID;
    if (!clientId) {
      throw new Error("SPOTIFY_CLIENT_ID is not configured.");
    }
    const params = new URLSearchParams({
      client_id: clientId,
      response_type: "code",
      redirect_uri: getSpotifyRedirectUri(),
      scope: SPOTIFY_SCOPES,
      code_challenge_method: "S256",
      code_challenge: codeChallenge,
      state,
    });
    return `${SPOTIFY_ACCOUNTS_URL}/authorize?${params.toString()}`;
  };

  const refreshAccessToken = async (refreshToken: string): Promise<SpotifyTokens> => {
    const clientId = process.env.SPOTIFY_CLIENT_ID;
    const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;
    if (!clientId || !clientSecret) {
      throw new Error("Spotify credentials are not configured.");
    }
    const body = new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      client_id: clientId,
      client_secret: clientSecret,
    });
    const response = await fetch(`${SPOTIFY_ACCOUNTS_URL}/api/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
      signal: AbortSignal.timeout(SPOTIFY_TOKEN_TIMEOUT_MS),
    });
    if (!response.ok) {
      store.setTokens(null);
      throw new Error("Spotify session expired. Connect again.");
    }
    const payload = (await response.json()) as {
      access_token: string;
      refresh_token?: string;
      expires_in: number;
      scope?: string;
    };
    const existing = store.getTokens();
    const nextTokens: SpotifyTokens = {
      accessToken: payload.access_token,
      refreshToken: payload.refresh_token ?? refreshToken,
      expiresAt: Date.now() + payload.expires_in * 1000 - 60_000,
      scope: payload.scope ?? existing?.scope ?? SPOTIFY_SCOPES,
      userId: existing?.userId,
      displayName: existing?.displayName,
    };
    store.setTokens(nextTokens);
    return nextTokens;
  };

  const cacheProfileInSession = async (): Promise<{ id: string; name: string }> => {
    const tokens = store.getTokens();
    if (tokens?.userId) {
      return {
        id: tokens.userId,
        name: tokens.displayName?.trim() || "Spotify user",
      };
    }
    const profile = await spotifyFetch<{ id: string; display_name?: string }>("/me");
    const contributor = {
      id: profile.id,
      name: profile.display_name?.trim() || "Spotify user",
    };
    if (tokens) {
      store.setTokens({
        ...tokens,
        userId: contributor.id,
        displayName: contributor.name,
      });
    }
    return contributor;
  };

  const getAccessToken = async (): Promise<string> => {
    const tokens = store.getTokens();
    if (!tokens?.refreshToken) {
      throw new Error("Not connected to Spotify.");
    }
    if (tokens.expiresAt > Date.now()) {
      return tokens.accessToken;
    }
    const refreshed = await refreshAccessToken(tokens.refreshToken);
    return refreshed.accessToken;
  };

  const spotifyFetch = async <T>(path: string, init?: RequestInit): Promise<T> => {
    const accessToken = await getAccessToken();
    let response: Response;
    try {
      response = await fetch(`${SPOTIFY_API_URL}${path}`, {
        ...init,
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
          ...(init?.headers ?? {}),
        },
        signal: AbortSignal.timeout(SPOTIFY_REQUEST_TIMEOUT_MS),
      });
    } catch (error) {
      const timedOut =
        error instanceof Error &&
        (error.name === "TimeoutError" || error.name === "AbortError" || error.message.includes("timeout"));
      if (timedOut) {
        throw new Error("Spotify API timed out. Progress saved — wait a moment, then click Resume load & share.");
      }
      throw error;
    }
    if (response.status === 204) {
      return {} as T;
    }
    if (response.status === 429) {
      const payload = (await response.json().catch(() => ({}))) as { error?: { message?: string } };
      const retryAfterRaw = response.headers.get("Retry-After");
      const parsedRetryAfter = retryAfterRaw ? Number.parseInt(retryAfterRaw, 10) : Number.NaN;
      const retryAfterSeconds = Number.isFinite(parsedRetryAfter) && parsedRetryAfter > 0 ? parsedRetryAfter : 300;
      throw new SpotifyRateLimitError(
        formatSpotifyApiError(429, path, payload.error?.message),
        retryAfterSeconds
      );
    }
    if (!response.ok) {
      const payload = (await response.json().catch(() => ({}))) as { error?: { message?: string } };
      throw new Error(formatSpotifyApiError(response.status, path, payload.error?.message));
    }
    return (await response.json()) as T;
  };

  const fetchAllPages = async <T>(
    firstPath: string,
    collect: (payload: T) => unknown[],
    nextPath: (payload: T) => string | null
  ): Promise<unknown[]> => {
    const items: unknown[] = [];
    let path = firstPath;
    while (path) {
      const payload = await spotifyFetch<T>(path);
      items.push(...collect(payload));
      const next = nextPath(payload);
      path = next ?? "";
    }
    return items;
  };

  const verifyContributorId = async (contributorId: string): Promise<void> => {
    const profile = await cacheProfileInSession();
    if (profile.id !== contributorId) {
      throw new Error("Contributor id does not match connected Spotify account.");
    }
  };

  const exchangeAuthCode = async (code: string, codeVerifier: string): Promise<void> => {
    const clientId = process.env.SPOTIFY_CLIENT_ID;
    const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;
    if (!clientId || !clientSecret) {
      throw new Error("Spotify credentials are not configured.");
    }
    const body = new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: getSpotifyRedirectUri(),
      client_id: clientId,
      client_secret: clientSecret,
      code_verifier: codeVerifier,
    });
    const response = await fetch(`${SPOTIFY_ACCOUNTS_URL}/api/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    });
    if (!response.ok) {
      const payload = (await response.json().catch(() => ({}))) as { error_description?: string; error?: string };
      throw new Error(payload.error_description ?? payload.error ?? "Spotify token exchange failed.");
    }
    const payload = (await response.json()) as {
      access_token: string;
      refresh_token?: string;
      expires_in: number;
      scope: string;
    };
    const existing = store.getTokens();
    store.setTokens({
      accessToken: payload.access_token,
      refreshToken: payload.refresh_token ?? existing?.refreshToken ?? "",
      expiresAt: Date.now() + payload.expires_in * 1000 - 60_000,
      scope: payload.scope,
    });
    await cacheProfileInSession();
  };

  const fetchContributorProfile = async (): Promise<SpotifyLibraryPayload["contributor"]> => {
    const contributor = await cacheProfileInSession();
    return contributor;
  };

  const fetchSavedTrackItems = async (): Promise<SpotifySavedTrackItem[]> =>
    (await fetchAllPages<{ items: SpotifySavedTrackItem[]; next: string | null }>(
      "/me/tracks?limit=50",
      (payload) => payload.items,
      (payload) => (payload.next ? toSpotifyNextCursor(payload.next) : null)
    )) as SpotifySavedTrackItem[];

  const fetchSavedTracksPage = async (
    nextPath?: string | null
  ): Promise<{ items: SpotifySavedTrackItem[]; next: string | null }> => {
    const path = resolveSpotifyPagePath(nextPath, "/me/tracks?limit=50", ["/me/tracks"]);
    const payload = await spotifyFetch<{ items: SpotifySavedTrackItem[]; next: string | null }>(path);
    return {
      items: payload.items,
      next: toSpotifyNextCursor(payload.next),
    };
  };

  const fetchPlaylistSummaries = async (): Promise<SpotifyPlaylistSummary[]> =>
    (await fetchAllPages<{ items: SpotifyPlaylistSummary[]; next: string | null }>(
      PLAYLISTS_PAGE_DEFAULT_PATH,
      (payload) => payload.items,
      (payload) => toSpotifyNextCursor(payload.next)
    )) as SpotifyPlaylistSummary[];

  const fetchPlaylistsPage = async (
    nextPath?: string | null
  ): Promise<{ items: SpotifyPlaylistSummary[]; next: string | null }> => {
    const path = resolveSpotifyPagePath(nextPath, PLAYLISTS_PAGE_DEFAULT_PATH, ["/me/playlists"]);
    const payload = await spotifyFetch<{ items: SpotifyPlaylistSummary[]; next: string | null }>(path);
    return {
      items: payload.items ?? [],
      next: toSpotifyNextCursor(payload.next),
    };
  };

  const warmupAccessToken = async (): Promise<{ ok: true }> => {
    const tokens = store.getTokens();
    if (!tokens?.refreshToken) {
      throw new Error("Not connected to Spotify.");
    }
    if (tokens.expiresAt <= Date.now() + 60_000) {
      await refreshAccessToken(tokens.refreshToken);
    }
    return { ok: true };
  };

  const fetchPlaylistTrackItems = async (playlistId: string): Promise<SpotifyPlaylistItem[]> =>
    (await fetchAllPages<{ items: SpotifyPlaylistItem[]; next: string | null }>(
      `/playlists/${playlistId}/items?limit=50`,
      (payload) => payload.items,
      (payload) => toSpotifyNextCursor(payload.next)
    )) as SpotifyPlaylistItem[];

  const fetchPlaylistTracksPage = async (
    playlistId: string,
    nextPath?: string | null
  ): Promise<{ items: SpotifyPlaylistItem[]; next: string | null }> => {
    if (!playlistId || !/^[A-Za-z0-9]+$/.test(playlistId)) {
      throw new Error("Invalid playlistId.");
    }
    const defaultPath = `/playlists/${playlistId}/items?limit=50`;
    const path = resolveSpotifyPagePath(nextPath, defaultPath, [`/playlists/${playlistId}/`]);
    const payload = await spotifyFetch<{ items: SpotifyPlaylistItem[]; next: string | null }>(path);
    return {
      items: payload.items,
      next: toSpotifyNextCursor(payload.next),
    };
  };

  const fetchArtistGenreBatch = async (artistIds: string[]): Promise<Record<string, string[]>> => {
    const genresByArtistId: Record<string, string[]> = {};
    const chunk = [...new Set(artistIds)].slice(0, 50);
    if (chunk.length === 0) {
      return genresByArtistId;
    }
    try {
      const payload = await spotifyFetch<{ artists: { id: string; genres: string[] }[] }>(
        `/artists?ids=${chunk.join(",")}`
      );
      payload.artists.forEach((artist) => {
        genresByArtistId[artist.id] = artist.genres ?? [];
      });
    } catch {
      // Genre lookup is optional; some Spotify app modes block /artists.
    }
    return genresByArtistId;
  };

  const fetchArtistGenres = async (artistIds: string[]): Promise<Record<string, string[]>> => {
    const genresByArtistId: Record<string, string[]> = {};
    const uniqueArtistIds = [...new Set(artistIds)];
    for (let index = 0; index < uniqueArtistIds.length; index += 50) {
      const batch = await fetchArtistGenreBatch(uniqueArtistIds.slice(index, index + 50));
      Object.assign(genresByArtistId, batch);
    }
    return genresByArtistId;
  };

  const buildLibraryPayload = async (input: {
    contributor: SpotifyLibraryPayload["contributor"];
    savedItems: SpotifySavedTrackItem[];
    readablePlaylists: SpotifyPlaylistSummary[];
    playlistItemsByPlaylistId: Record<string, SpotifyPlaylistItem[]>;
  }): Promise<SpotifyLibraryPayload> => {
    const artistIds = [
      ...input.savedItems.flatMap((item) => (item.track ? item.track.artists.map((artist) => artist.id) : [])),
      ...Object.values(input.playlistItemsByPlaylistId).flatMap((entries) =>
        entries.flatMap((entry) => {
          const track = entry.item ?? entry.track;
          return track ? track.artists.map((artist) => artist.id) : [];
        })
      ),
    ];
    const genresByArtistId = await fetchArtistGenres(artistIds);
    return assembleSpotifyLibrary({
      contributor: input.contributor,
      savedItems: input.savedItems,
      readablePlaylists: input.readablePlaylists,
      playlistItemsByPlaylistId: input.playlistItemsByPlaylistId,
      genresByArtistId,
    });
  };

  const fetchLibrary = async (): Promise<SpotifyLibraryPayload> => {
    const contributor = await fetchContributorProfile();
    const [savedItems, playlists] = await Promise.all([fetchSavedTrackItems(), fetchPlaylistSummaries()]);
    const readablePlaylists = filterReadablePlaylists(playlists, contributor.id);
    const playlistItemsByPlaylistId: Record<string, SpotifyPlaylistItem[]> = {};
    await mapWithConcurrency(readablePlaylists, 4, async (playlist) => {
      try {
        playlistItemsByPlaylistId[playlist.id] = await fetchPlaylistTrackItems(playlist.id);
      } catch {
        playlistItemsByPlaylistId[playlist.id] = [];
      }
    });
    return buildLibraryPayload({
      contributor,
      savedItems,
      readablePlaylists,
      playlistItemsByPlaylistId,
    });
  };

  const resolvePlaybackDeviceId = async (): Promise<string> => {
    const payload = await spotifyFetch<{ devices: SpotifyDevice[] }>("/me/player/devices");
    const device = pickPlaybackDevice(payload.devices ?? []);
    if (!device) {
      throw new Error(NO_DEVICES_MESSAGE);
    }

    if (!device.is_active) {
      await spotifyFetch("/me/player", {
        method: "PUT",
        body: JSON.stringify({ device_ids: [device.id], play: false }),
      });
    }

    return device.id;
  };

  const startPlayback = async (body: Record<string, unknown>): Promise<void> => {
    const deviceId = await resolvePlaybackDeviceId();
    await spotifyFetch(`/me/player/play?device_id=${encodeURIComponent(deviceId)}`, {
      method: "PUT",
      body: JSON.stringify(body),
    });
  };

  const createPlaylist = async (name: string, trackIds: string[]) => {
    const created = await spotifyFetch<{ id: string; name: string }>("/me/playlists", {
      method: "POST",
      body: JSON.stringify({ name, public: false, description: "Created by Music Cue" }),
    });
    const uris = trackIds.map((id) => `spotify:track:${id}`);
    for (let index = 0; index < uris.length; index += 100) {
      await spotifyFetch(`/playlists/${created.id}/items`, {
        method: "POST",
        body: JSON.stringify({ uris: uris.slice(index, index + 100) }),
      });
    }
    return {
      playlistId: created.id,
      playlistName: created.name,
      matchedCount: trackIds.length,
      matchedTrackIds: trackIds,
    };
  };

  const playCue = async (trackIds: string[]) => {
    if (trackIds.length === 0) {
      throw new Error("No tracks to play.");
    }

    const uris = trackIds.map((id) => `spotify:track:${id}`);

    if (trackIds.length <= 100) {
      try {
        await startPlayback({ uris });
        return {
          playlistName: SPOTIFY_NOW_PLAYING_PLAYLIST_NAME,
          matchedCount: trackIds.length,
          requestedCount: trackIds.length,
          matchedTrackIds: trackIds,
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : "Could not start playback.";
        if (!message.includes("403") && !message.includes("404")) {
          throw error;
        }
        // Fall back to playlist context for devices that reject direct URIs.
      }
    }

    const playlist = await createPlaylist(SPOTIFY_NOW_PLAYING_PLAYLIST_NAME, trackIds);
    await startPlayback({
      context_uri: `spotify:playlist:${playlist.playlistId}`,
      offset: { position: 0 },
    });
    return {
      playlistName: playlist.playlistName,
      matchedCount: playlist.matchedCount,
      requestedCount: trackIds.length,
      matchedTrackIds: playlist.matchedTrackIds,
    };
  };

  const getPlaybackState = async () => {
    try {
      const payload = await spotifyFetch<{
        item: { id: string; name: string; artists: { name: string }[] } | null;
        progress_ms: number;
        context: { uri: string } | null;
      }>("/me/player/currently-playing");
      if (!payload.item) {
        return null;
      }
      return {
        artist: payload.item.artists.map((artist) => artist.name).join(", "),
        title: payload.item.name,
        trackIndex: 0,
        playlistName: payload.context?.uri?.includes("playlist") ? SPOTIFY_NOW_PLAYING_PLAYLIST_NAME : "",
        persistentId: payload.item.id,
        playerPosition: payload.progress_ms ?? 0,
      };
    } catch {
      return null;
    }
  };

  const getConnectionStatus = async () => {
    if (!isSpotifyConfigured()) {
      return {
        connected: false,
        configured: false,
        message: "Spotify credentials are not configured on the server.",
      };
    }
    const tokens = store.getTokens();
    if (!tokens?.refreshToken) {
      return {
        connected: false,
        configured: true,
        message: "Not connected to Spotify.",
      };
    }
    if (tokens.userId) {
      return {
        connected: true,
        configured: true,
        message: "Connected to Spotify.",
        displayName: tokens.displayName?.trim() || "Spotify user",
        userId: tokens.userId,
      };
    }
    try {
      const contributor = await cacheProfileInSession();
      return {
        connected: true,
        configured: true,
        message: "Connected to Spotify.",
        displayName: contributor.name,
        userId: contributor.id,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Spotify connection could not be verified.";
      if (message.toLowerCase().includes("rate limit")) {
        return {
          connected: true,
          configured: true,
          message: "Spotify rate limited — wait a minute, then try again.",
        };
      }
      return {
        connected: false,
        configured: true,
        message,
      };
    }
  };

  return {
    getConnectionStatus,
    buildAuthorizeUrl,
    exchangeAuthCode,
    fetchLibrary,
    fetchContributorProfile,
    fetchSavedTrackItems,
    fetchSavedTracksPage,
    fetchPlaylistSummaries,
    fetchPlaylistsPage,
    fetchPlaylistTrackItems,
    fetchPlaylistTracksPage,
    fetchArtistGenres,
    fetchArtistGenreBatch,
    warmupAccessToken,
    buildLibraryPayload,
    verifyContributorId,
    createPlaylist,
    playCue,
    getPlaybackState,
    disconnect: () => store.setTokens(null),
  };
};
