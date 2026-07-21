import {
  SpotifyTokens,
  buildSpotifySessionSetCookie,
  getSpotifySessionCookie,
} from "./spotifySession.js";

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

type SpotifySavedTrackItem = {
  added_at: string;
  track: SpotifyTrack | null;
};

type SpotifyTrack = {
  id: string;
  name: string;
  duration_ms: number;
  popularity: number;
  artists: { id: string; name: string }[];
  album: { name: string; release_date: string };
};

type SpotifyPlaylistItem = {
  track?: SpotifyTrack | null;
  item?: SpotifyTrack | null;
};

type SpotifyPlaylistSummary = {
  id: string;
  name: string;
  owner: { id: string };
  collaborative?: boolean;
};

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

const formatSpotifyApiError = (status: number, path: string, spotifyMessage?: string): string => {
  const normalizedMessage = spotifyMessage?.toLowerCase() ?? "";
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
  audioFeatures?: {
    acousticness: number;
    danceability: number;
    energy: number;
    instrumentalness: number;
    liveness: number;
    tempo: number;
    valence: number;
  };
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

export type SpotifyLibraryPayload = {
  songs: SpotifyLibrarySong[];
  stats: SpotifyLibraryStats;
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
    const nextTokens: SpotifyTokens = {
      accessToken: payload.access_token,
      refreshToken: payload.refresh_token ?? refreshToken,
      expiresAt: Date.now() + payload.expires_in * 1000 - 60_000,
      scope: payload.scope ?? store.getTokens()?.scope ?? SPOTIFY_SCOPES,
    };
    store.setTokens(nextTokens);
    return nextTokens;
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
    const response = await fetch(`${SPOTIFY_API_URL}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        ...(init?.headers ?? {}),
      },
    });
    if (response.status === 204) {
      return {} as T;
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
      path = nextPath(payload) ?? "";
    }
    return items;
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
  };

  const fetchLibrary = async (): Promise<SpotifyLibraryPayload> => {
    const profile = await spotifyFetch<{ id: string }>("/me");

    const savedItems = (await fetchAllPages<{ items: SpotifySavedTrackItem[]; next: string | null }>(
      "/me/tracks?limit=50",
      (payload) => payload.items,
      (payload) => (payload.next ? payload.next.replace(SPOTIFY_API_URL, "") : null)
    )) as SpotifySavedTrackItem[];

    const playlists = (await fetchAllPages<{ items: SpotifyPlaylistSummary[]; next: string | null }>(
      "/me/playlists?limit=50",
      (payload) => payload.items,
      (payload) => (payload.next ? payload.next.replace(SPOTIFY_API_URL, "") : null)
    )) as SpotifyPlaylistSummary[];

    const readablePlaylists = playlists.filter(
      (playlist) => playlist.owner.id === profile.id || playlist.collaborative
    );

    const playlistNames: Record<string, string> = {};
    const playlistCounts: Record<string, number> = {};
    const trackPlaylists = new Map<string, Set<string>>();
    const trackById = new Map<string, SpotifyTrack>();

    savedItems.forEach((item) => {
      if (item.track?.id) {
        trackById.set(item.track.id, item.track);
      }
    });

    for (const playlist of readablePlaylists) {
      playlistNames[playlist.id] = playlist.name;
      playlistCounts[playlist.id] = 0;
      try {
        const playlistItems = (await fetchAllPages<{ items: SpotifyPlaylistItem[]; next: string | null }>(
          `/playlists/${playlist.id}/items?limit=50`,
          (payload) => payload.items,
          (payload) => (payload.next ? payload.next.replace(SPOTIFY_API_URL, "") : null)
        )) as SpotifyPlaylistItem[];
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
      } catch {
        // Skip playlists we cannot read (followed playlists, revoked access, etc.).
      }
    }

    const artistIds = [...trackById.values()].flatMap((track) => track.artists.map((artist) => artist.id));
    const genresByArtist = new Map<string, string[]>();
    const uniqueArtistIds = [...new Set(artistIds)];
    try {
      for (let index = 0; index < uniqueArtistIds.length; index += 50) {
        const chunk = uniqueArtistIds.slice(index, index + 50);
        const payload = await spotifyFetch<{ artists: { id: string; genres: string[] }[] }>(
          `/artists?ids=${chunk.join(",")}`
        );
        payload.artists.forEach((artist) => genresByArtist.set(artist.id, artist.genres ?? []));
      }
    } catch {
      // Genre lookup is optional; some Spotify app modes block /artists.
    }

    const songs: SpotifyLibrarySong[] = [...trackById.entries()].map(([trackId, track]) => {
      const primaryArtist = track.artists[0];
      const genres = primaryArtist ? genresByArtist.get(primaryArtist.id) ?? [] : [];
      const savedItem = savedItems.find((item) => item.track?.id === trackId);
      return {
        id: trackId,
        title: track.name,
        artist: track.artists.map((artist) => artist.name).join(", "),
        album: track.album.name,
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
      songs,
      stats: {
        minYear: years.length ? Math.min(...years) : 1970,
        maxYear: years.length ? Math.max(...years) : new Date().getFullYear(),
        genres: Object.keys(genreCounts).sort((left, right) => left.localeCompare(right)),
        genreCounts,
        maxPlayCount: songs.reduce((max, song) => Math.max(max, song.playCount), 1),
        playlistIds: readablePlaylists.map((playlist) => playlist.id),
        playlistNames,
        playlistCounts,
      },
    };
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
    try {
      await spotifyFetch<{ id: string }>("/me");
      return {
        connected: true,
        configured: true,
        message: "Connected to Spotify.",
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Spotify connection could not be verified.";
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
    createPlaylist,
    playCue,
    getPlaybackState,
    disconnect: () => store.setTokens(null),
  };
};
