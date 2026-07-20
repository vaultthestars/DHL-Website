"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// scripts/spotify-handler.ts
var spotify_handler_exports = {};
__export(spotify_handler_exports, {
  default: () => handler
});
module.exports = __toCommonJS(spotify_handler_exports);

// api/lib/spotify/spotifySession.ts
var import_node_crypto = require("node:crypto");
var SPOTIFY_SESSION_COOKIE = "music_cue_spotify_session";
var getSessionSecret = () => {
  const secret = process.env.SPOTIFY_SESSION_SECRET;
  if (secret) {
    return secret;
  }
  if (process.env.NODE_ENV === "production") {
    throw new Error("SPOTIFY_SESSION_SECRET is required in production.");
  }
  return "music-cue-dev-session-secret";
};
var sealSpotifySession = (tokens) => {
  const payload = Buffer.from(JSON.stringify(tokens), "utf8").toString("base64url");
  const signature = (0, import_node_crypto.createHmac)("sha256", getSessionSecret()).update(payload).digest("base64url");
  return `${payload}.${signature}`;
};
var unsealSpotifySession = (value) => {
  if (!value) {
    return null;
  }
  const [payload, signature] = value.split(".");
  if (!payload || !signature) {
    return null;
  }
  const expected = (0, import_node_crypto.createHmac)("sha256", getSessionSecret()).update(payload).digest("base64url");
  const signatureBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  if (signatureBuffer.length !== expectedBuffer.length || !(0, import_node_crypto.timingSafeEqual)(signatureBuffer, expectedBuffer)) {
    return null;
  }
  try {
    return JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
  } catch {
    return null;
  }
};
var parseCookieHeader = (cookieHeader) => {
  if (!cookieHeader) {
    return {};
  }
  return cookieHeader.split(";").reduce((cookies, part) => {
    const [rawKey, ...rawValue] = part.trim().split("=");
    if (!rawKey) {
      return cookies;
    }
    cookies[rawKey] = decodeURIComponent(rawValue.join("="));
    return cookies;
  }, {});
};
var getSpotifySessionCookie = (cookieHeader) => unsealSpotifySession(parseCookieHeader(cookieHeader)[SPOTIFY_SESSION_COOKIE]);
var buildSpotifySessionSetCookie = (tokens) => {
  if (!tokens?.refreshToken) {
    return `${SPOTIFY_SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;
  }
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `${SPOTIFY_SESSION_COOKIE}=${sealSpotifySession(tokens)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${60 * 60 * 24 * 30}${secure}`;
};

// api/lib/spotify/spotifyClient.ts
var SPOTIFY_ACCOUNTS_URL = "https://accounts.spotify.com";
var SPOTIFY_API_URL = "https://api.spotify.com/v1";
var SPOTIFY_NOW_PLAYING_PLAYLIST_NAME = "MusicCue \u2014 Now Playing";
var SPOTIFY_SCOPES = [
  "user-library-read",
  "playlist-read-private",
  "playlist-modify-private",
  "user-read-playback-state",
  "user-modify-playback-state"
].join(" ");
var getPlaylistItemTrack = (entry) => {
  const candidate = entry.item ?? entry.track;
  if (!candidate?.id) {
    return null;
  }
  if (candidate.type && candidate.type !== "track") {
    return null;
  }
  return candidate;
};
var getSpotifyRedirectUri = () => {
  if (process.env.SPOTIFY_REDIRECT_URI) {
    return process.env.SPOTIFY_REDIRECT_URI;
  }
  if (process.env.SITE_URL) {
    return `${process.env.SITE_URL.replace(/\/$/, "")}/music-cue/spotify/callback`;
  }
  return "http://127.0.0.1:5174/spotify/callback";
};
var isSpotifyConfigured = () => Boolean(process.env.SPOTIFY_CLIENT_ID && process.env.SPOTIFY_CLIENT_SECRET);
var createCookieSessionStore = (cookieHeader, setCookie) => {
  let tokens = getSpotifySessionCookie(cookieHeader);
  return {
    getTokens: () => tokens,
    setTokens: (nextTokens) => {
      tokens = nextTokens;
      setCookie(buildSpotifySessionSetCookie(nextTokens));
    }
  };
};
var createSpotifyClient = (store) => {
  const getConnectionStatus = () => {
    if (!isSpotifyConfigured()) {
      return {
        connected: false,
        configured: false,
        message: "Spotify credentials are not configured on the server."
      };
    }
    const tokens = store.getTokens();
    return {
      connected: Boolean(tokens?.refreshToken),
      configured: true,
      message: tokens?.refreshToken ? "Connected to Spotify." : "Not connected to Spotify."
    };
  };
  const buildAuthorizeUrl = (codeChallenge, state) => {
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
      state
    });
    return `${SPOTIFY_ACCOUNTS_URL}/authorize?${params.toString()}`;
  };
  const refreshAccessToken = async (refreshToken) => {
    const clientId = process.env.SPOTIFY_CLIENT_ID;
    const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;
    if (!clientId || !clientSecret) {
      throw new Error("Spotify credentials are not configured.");
    }
    const body = new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      client_id: clientId,
      client_secret: clientSecret
    });
    const response = await fetch(`${SPOTIFY_ACCOUNTS_URL}/api/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body
    });
    if (!response.ok) {
      store.setTokens(null);
      throw new Error("Spotify session expired. Connect again.");
    }
    const payload = await response.json();
    const nextTokens = {
      accessToken: payload.access_token,
      refreshToken: payload.refresh_token ?? refreshToken,
      expiresAt: Date.now() + payload.expires_in * 1e3 - 6e4,
      scope: payload.scope ?? store.getTokens()?.scope ?? SPOTIFY_SCOPES
    };
    store.setTokens(nextTokens);
    return nextTokens;
  };
  const getAccessToken = async () => {
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
  const spotifyFetch = async (path, init) => {
    const accessToken = await getAccessToken();
    const response = await fetch(`${SPOTIFY_API_URL}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        ...init?.headers ?? {}
      }
    });
    if (response.status === 204) {
      return {};
    }
    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      const message = payload.error?.message ?? `Spotify API error (${response.status}).`;
      throw new Error(`${message} (${path})`);
    }
    return await response.json();
  };
  const fetchAllPages = async (firstPath, collect, nextPath) => {
    const items = [];
    let path = firstPath;
    while (path) {
      const payload = await spotifyFetch(path);
      items.push(...collect(payload));
      path = nextPath(payload) ?? "";
    }
    return items;
  };
  const exchangeAuthCode = async (code, codeVerifier) => {
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
      code_verifier: codeVerifier
    });
    const response = await fetch(`${SPOTIFY_ACCOUNTS_URL}/api/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body
    });
    if (!response.ok) {
      const payload2 = await response.json().catch(() => ({}));
      throw new Error(payload2.error_description ?? payload2.error ?? "Spotify token exchange failed.");
    }
    const payload = await response.json();
    const existing = store.getTokens();
    store.setTokens({
      accessToken: payload.access_token,
      refreshToken: payload.refresh_token ?? existing?.refreshToken ?? "",
      expiresAt: Date.now() + payload.expires_in * 1e3 - 6e4,
      scope: payload.scope
    });
  };
  const fetchLibrary = async () => {
    const profile = await spotifyFetch("/me");
    const savedItems = await fetchAllPages(
      "/me/tracks?limit=50",
      (payload) => payload.items,
      (payload) => payload.next ? payload.next.replace(SPOTIFY_API_URL, "") : null
    );
    const playlists = await fetchAllPages(
      "/me/playlists?limit=50",
      (payload) => payload.items,
      (payload) => payload.next ? payload.next.replace(SPOTIFY_API_URL, "") : null
    );
    const readablePlaylists = playlists.filter(
      (playlist) => playlist.owner.id === profile.id || playlist.collaborative
    );
    const playlistNames = {};
    const playlistCounts = {};
    const trackPlaylists = /* @__PURE__ */ new Map();
    const trackById = /* @__PURE__ */ new Map();
    savedItems.forEach((item) => {
      if (item.track?.id) {
        trackById.set(item.track.id, item.track);
      }
    });
    for (const playlist of readablePlaylists) {
      playlistNames[playlist.id] = playlist.name;
      playlistCounts[playlist.id] = 0;
      try {
        const playlistItems = await fetchAllPages(
          `/playlists/${playlist.id}/items?limit=50`,
          (payload) => payload.items,
          (payload) => payload.next ? payload.next.replace(SPOTIFY_API_URL, "") : null
        );
        playlistItems.forEach((entry) => {
          const track = getPlaylistItemTrack(entry);
          const trackId = track?.id;
          if (!trackId) {
            return;
          }
          trackById.set(trackId, track);
          playlistCounts[playlist.id] = (playlistCounts[playlist.id] ?? 0) + 1;
          const memberships = trackPlaylists.get(trackId) ?? /* @__PURE__ */ new Set();
          memberships.add(playlist.id);
          trackPlaylists.set(trackId, memberships);
        });
      } catch {
      }
    }
    const artistIds = [...trackById.values()].flatMap((track) => track.artists.map((artist) => artist.id));
    const genresByArtist = /* @__PURE__ */ new Map();
    const uniqueArtistIds = [...new Set(artistIds)];
    try {
      for (let index = 0; index < uniqueArtistIds.length; index += 50) {
        const chunk = uniqueArtistIds.slice(index, index + 50);
        const payload = await spotifyFetch(
          `/artists?ids=${chunk.join(",")}`
        );
        payload.artists.forEach((artist) => genresByArtist.set(artist.id, artist.genres ?? []));
      }
    } catch {
    }
    const songs = [...trackById.entries()].map(([trackId, track]) => {
      const primaryArtist = track.artists[0];
      const genres = primaryArtist ? genresByArtist.get(primaryArtist.id) ?? [] : [];
      const savedItem = savedItems.find((item) => item.track?.id === trackId);
      return {
        id: trackId,
        title: track.name,
        artist: track.artists.map((artist) => artist.name).join(", "),
        album: track.album.name,
        genre: genres[0] ?? "Unknown",
        year: Number.parseInt(track.album.release_date.slice(0, 4), 10) || (/* @__PURE__ */ new Date()).getFullYear(),
        playCount: track.popularity,
        rating: 0,
        loved: true,
        dateAdded: savedItem?.added_at ?? "",
        trackType: "File",
        durationMs: track.duration_ms,
        playlists: [...trackPlaylists.get(trackId) ?? []]
      };
    });
    const genreCounts = {};
    songs.forEach((song) => {
      genreCounts[song.genre] = (genreCounts[song.genre] ?? 0) + 1;
    });
    const years = songs.map((song) => song.year);
    return {
      songs,
      stats: {
        minYear: years.length ? Math.min(...years) : 1970,
        maxYear: years.length ? Math.max(...years) : (/* @__PURE__ */ new Date()).getFullYear(),
        genres: Object.keys(genreCounts).sort((left, right) => left.localeCompare(right)),
        genreCounts,
        maxPlayCount: songs.reduce((max, song) => Math.max(max, song.playCount), 1),
        playlistIds: readablePlaylists.map((playlist) => playlist.id),
        playlistNames,
        playlistCounts
      }
    };
  };
  const createPlaylist = async (name, trackIds) => {
    const created = await spotifyFetch("/me/playlists", {
      method: "POST",
      body: JSON.stringify({ name, public: false, description: "Created by Music Cue" })
    });
    const uris = trackIds.map((id) => `spotify:track:${id}`);
    for (let index = 0; index < uris.length; index += 100) {
      await spotifyFetch(`/playlists/${created.id}/items`, {
        method: "POST",
        body: JSON.stringify({ uris: uris.slice(index, index + 100) })
      });
    }
    return {
      playlistId: created.id,
      playlistName: created.name,
      matchedCount: trackIds.length,
      matchedTrackIds: trackIds
    };
  };
  const playCue = async (trackIds) => {
    if (trackIds.length === 0) {
      throw new Error("No tracks to play.");
    }
    const uris = trackIds.map((id) => `spotify:track:${id}`);
    if (trackIds.length <= 100) {
      try {
        await spotifyFetch("/me/player/play", {
          method: "PUT",
          body: JSON.stringify({ uris })
        });
        return {
          playlistName: SPOTIFY_NOW_PLAYING_PLAYLIST_NAME,
          matchedCount: trackIds.length,
          requestedCount: trackIds.length,
          matchedTrackIds: trackIds
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : "Could not start playback.";
        if (!message.includes("403") && !message.includes("404")) {
          throw error;
        }
      }
    }
    const playlist = await createPlaylist(SPOTIFY_NOW_PLAYING_PLAYLIST_NAME, trackIds);
    await spotifyFetch("/me/player/play", {
      method: "PUT",
      body: JSON.stringify({
        context_uri: `spotify:playlist:${playlist.playlistId}`,
        offset: { position: 0 }
      })
    });
    return {
      playlistName: playlist.playlistName,
      matchedCount: playlist.matchedCount,
      requestedCount: trackIds.length,
      matchedTrackIds: playlist.matchedTrackIds
    };
  };
  const getPlaybackState = async () => {
    try {
      const payload = await spotifyFetch("/me/player/currently-playing");
      if (!payload.item) {
        return null;
      }
      return {
        artist: payload.item.artists.map((artist) => artist.name).join(", "),
        title: payload.item.name,
        trackIndex: 0,
        playlistName: payload.context?.uri?.includes("playlist") ? SPOTIFY_NOW_PLAYING_PLAYLIST_NAME : "",
        persistentId: payload.item.id,
        playerPosition: payload.progress_ms ?? 0
      };
    } catch {
      return null;
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
    disconnect: () => store.setTokens(null)
  };
};

// api/lib/spotify/spotifyHandlers.ts
var handleSpotifyRoute = async (route, req, res) => {
  const cookiesToSet = [];
  const store = createCookieSessionStore(req.headers?.cookie, (cookie) => {
    cookiesToSet.push(cookie);
  });
  const client = createSpotifyClient(store);
  const finish = (statusCode, body) => {
    if (cookiesToSet.length > 0) {
      res.setHeader("Set-Cookie", cookiesToSet.length === 1 ? cookiesToSet[0] : cookiesToSet);
    }
    res.status(statusCode).json(body);
  };
  try {
    if (route === "status" && req.method === "GET") {
      finish(200, client.getConnectionStatus());
      return;
    }
    if (route === "auth-url" && req.method === "POST") {
      if (!isSpotifyConfigured()) {
        finish(400, { error: "Spotify is not configured on the server." });
        return;
      }
      const body = req.body;
      const codeChallenge = typeof body?.codeChallenge === "string" ? body.codeChallenge : "";
      const state = typeof body?.state === "string" ? body.state : "";
      if (!codeChallenge || !state) {
        finish(400, { error: "codeChallenge and state are required." });
        return;
      }
      finish(200, { authorizeUrl: client.buildAuthorizeUrl(codeChallenge, state), state });
      return;
    }
    if (route === "auth-callback" && req.method === "POST") {
      const body = req.body;
      const code = typeof body?.code === "string" ? body.code : "";
      const codeVerifier = typeof body?.codeVerifier === "string" ? body.codeVerifier : "";
      if (!code || !codeVerifier) {
        finish(400, { error: "code and codeVerifier are required." });
        return;
      }
      await client.exchangeAuthCode(code, codeVerifier);
      finish(200, { ok: true });
      return;
    }
    if (route === "disconnect" && req.method === "POST") {
      client.disconnect();
      finish(200, { ok: true });
      return;
    }
    if (route === "library" && req.method === "GET") {
      finish(200, await client.fetchLibrary());
      return;
    }
    if (route === "validate-tracks" && req.method === "POST") {
      const body = req.body;
      const trackIds = Array.isArray(body?.trackIds) ? body.trackIds : [];
      const availability = {};
      trackIds.forEach((trackId) => {
        availability[trackId] = true;
      });
      finish(200, { availability });
      return;
    }
    if (route === "play-cue" && req.method === "POST") {
      const body = req.body;
      const trackIds = Array.isArray(body?.trackIds) ? body.trackIds : [];
      if (trackIds.length === 0) {
        finish(400, { error: "trackIds array is required." });
        return;
      }
      finish(200, await client.playCue(trackIds));
      return;
    }
    if (route === "save-playlist" && req.method === "POST") {
      const body = req.body;
      const trackIds = Array.isArray(body?.trackIds) ? body.trackIds : [];
      const playlistName = typeof body?.playlistName === "string" ? body.playlistName.trim() : "";
      if (!trackIds.length || !playlistName) {
        finish(400, { error: "trackIds and playlistName are required." });
        return;
      }
      const result = await client.createPlaylist(playlistName, trackIds);
      finish(200, {
        playlistName: result.playlistName,
        matchedCount: result.matchedCount,
        requestedCount: trackIds.length,
        matchedTrackIds: result.matchedTrackIds
      });
      return;
    }
    if (route === "playback-state" && req.method === "GET") {
      const state = await client.getPlaybackState();
      finish(200, state ?? { title: "" });
      return;
    }
    finish(404, { error: `Unknown Spotify route: ${route}` });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Spotify request failed.";
    finish(500, { error: message });
  }
};

// scripts/spotify-handler.ts
var getSpotifyRoute = (req) => {
  const pathParts = req.query.path;
  if (pathParts) {
    return Array.isArray(pathParts) ? pathParts.join("/") : pathParts;
  }
  const requestUrl = req.url ?? "";
  const match = requestUrl.match(/\/api\/spotify\/?([^?]*)/);
  return match?.[1] ?? "";
};
async function handler(req, res) {
  await handleSpotifyRoute(getSpotifyRoute(req), req, res);
}
