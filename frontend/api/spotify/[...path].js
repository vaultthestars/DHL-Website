"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
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
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// scripts/spotify-handler.ts
var spotify_handler_exports = {};
__export(spotify_handler_exports, {
  default: () => handler
});
module.exports = __toCommonJS(spotify_handler_exports);

// server-lib/spotify/spotifyLibraryAssembly.ts
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
var filterReadablePlaylists = (playlists, profileId) => playlists.filter((playlist) => playlist.owner.id === profileId || playlist.collaborative);
var assembleSpotifyLibrary = (input) => {
  const playlistNames = {};
  const playlistCounts = {};
  const trackPlaylists = /* @__PURE__ */ new Map();
  const trackById = /* @__PURE__ */ new Map();
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
      const memberships = trackPlaylists.get(trackId) ?? /* @__PURE__ */ new Set();
      memberships.add(playlist.id);
      trackPlaylists.set(trackId, memberships);
    });
  });
  const songs = [...trackById.entries()].map(([trackId, track]) => {
    const primaryArtist = track.artists[0];
    const genres = primaryArtist ? input.genresByArtistId[primaryArtist.id] ?? [] : [];
    const savedItem = input.savedItems.find((item) => item.track?.id === trackId);
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
    contributor: input.contributor,
    songs,
    stats: {
      minYear: years.length ? Math.min(...years) : 1970,
      maxYear: years.length ? Math.max(...years) : (/* @__PURE__ */ new Date()).getFullYear(),
      genres: Object.keys(genreCounts).sort((left, right) => left.localeCompare(right)),
      genreCounts,
      maxPlayCount: songs.reduce((max, song) => Math.max(max, song.playCount), 1),
      playlistIds: input.readablePlaylists.map((playlist) => playlist.id),
      playlistNames,
      playlistCounts
    }
  };
};
var mapWithConcurrency = async (items, concurrency, mapper) => {
  if (items.length === 0) {
    return [];
  }
  const results = new Array(items.length);
  let nextIndex = 0;
  const worker = async () => {
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

// server-lib/spotify/spotifySession.ts
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

// server-lib/spotify/spotifyClient.ts
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
var NO_DEVICES_MESSAGE = "No Spotify devices found. Open the Spotify app, play any song once, then try Play again.";
var sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
var parseRetryAfterMs = (retryAfterHeader, attempt) => {
  if (retryAfterHeader) {
    const seconds = Number.parseInt(retryAfterHeader, 10);
    if (Number.isFinite(seconds) && seconds > 0) {
      return seconds * 1e3;
    }
  }
  return Math.min(1e3 * 2 ** attempt, 1e4);
};
var SPOTIFY_API_ORIGIN = "https://api.spotify.com";
var tryDecodeURIComponent = (value) => {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
};
var toSpotifyRelativePath = (raw) => {
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
var toSpotifyNextCursor = (next) => {
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
var resolveSpotifyPagePath = (nextPath, defaultPath, allowedPrefixes) => {
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
var formatSpotifyApiError = (status, path2, spotifyMessage) => {
  const normalizedMessage = spotifyMessage?.toLowerCase() ?? "";
  if (status === 429) {
    return "Spotify rate limit reached. Progress saved \u2014 wait a minute, then click Resume load & share.";
  }
  if (status === 504) {
    return "Spotify library import timed out. Try again in a moment.";
  }
  if (status === 403 && (normalizedMessage.includes("not registered") || normalizedMessage.includes("developer dashboard") || normalizedMessage.includes("check settings on developer.spotify.com"))) {
    return "This Spotify account is not allowlisted for this app yet. The site owner must add your Spotify email in the Spotify Developer Dashboard (User Management), then you can disconnect and connect again.";
  }
  if (spotifyMessage) {
    return `${spotifyMessage} (${path2})`;
  }
  return `Spotify API error (${status}) (${path2})`;
};
var pickPlaybackDevice = (devices) => {
  const available = devices.filter((device) => device.id && !device.is_restricted);
  if (available.length === 0) {
    return null;
  }
  return available.find((device) => device.is_active) ?? available.find((device) => device.type === "Computer") ?? available[0];
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
    const existing = store.getTokens();
    const nextTokens = {
      accessToken: payload.access_token,
      refreshToken: payload.refresh_token ?? refreshToken,
      expiresAt: Date.now() + payload.expires_in * 1e3 - 6e4,
      scope: payload.scope ?? existing?.scope ?? SPOTIFY_SCOPES,
      userId: existing?.userId,
      displayName: existing?.displayName
    };
    store.setTokens(nextTokens);
    return nextTokens;
  };
  const cacheProfileInSession = async () => {
    const tokens = store.getTokens();
    if (tokens?.userId) {
      return {
        id: tokens.userId,
        name: tokens.displayName?.trim() || "Spotify user"
      };
    }
    const profile = await spotifyFetch("/me");
    const contributor = {
      id: profile.id,
      name: profile.display_name?.trim() || "Spotify user"
    };
    if (tokens) {
      store.setTokens({
        ...tokens,
        userId: contributor.id,
        displayName: contributor.name
      });
    }
    return contributor;
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
  const spotifyFetch = async (path2, init, attempt = 0, startedAt = Date.now()) => {
    const accessToken = await getAccessToken();
    const response = await fetch(`${SPOTIFY_API_URL}${path2}`, {
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
    if (response.status === 429 && attempt < 2 && Date.now() - startedAt < 2e4) {
      await sleep(Math.min(parseRetryAfterMs(response.headers.get("Retry-After"), attempt), 4e3));
      return spotifyFetch(path2, init, attempt + 1, startedAt);
    }
    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      throw new Error(formatSpotifyApiError(response.status, path2, payload.error?.message));
    }
    return await response.json();
  };
  const fetchAllPages = async (firstPath, collect, nextPath) => {
    const items = [];
    let path2 = firstPath;
    while (path2) {
      const payload = await spotifyFetch(path2);
      items.push(...collect(payload));
      const next = nextPath(payload);
      path2 = next ?? "";
    }
    return items;
  };
  const verifyContributorId = async (contributorId) => {
    const profile = await cacheProfileInSession();
    if (profile.id !== contributorId) {
      throw new Error("Contributor id does not match connected Spotify account.");
    }
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
    await cacheProfileInSession();
  };
  const fetchContributorProfile = async () => {
    const contributor = await cacheProfileInSession();
    return contributor;
  };
  const fetchSavedTrackItems = async () => await fetchAllPages(
    "/me/tracks?limit=50",
    (payload) => payload.items,
    (payload) => payload.next ? toSpotifyNextCursor(payload.next) : null
  );
  const fetchSavedTracksPage = async (nextPath) => {
    const path2 = resolveSpotifyPagePath(nextPath, "/me/tracks?limit=50", ["/me/tracks"]);
    const payload = await spotifyFetch(path2);
    return {
      items: payload.items,
      next: toSpotifyNextCursor(payload.next)
    };
  };
  const fetchPlaylistSummaries = async () => await fetchAllPages(
    "/me/playlists?limit=50",
    (payload) => payload.items,
    (payload) => toSpotifyNextCursor(payload.next)
  );
  const fetchPlaylistsPage = async (nextPath) => {
    const path2 = resolveSpotifyPagePath(nextPath, "/me/playlists?limit=50", ["/me/playlists"]);
    const payload = await spotifyFetch(path2);
    return {
      items: payload.items,
      next: toSpotifyNextCursor(payload.next)
    };
  };
  const fetchPlaylistTrackItems = async (playlistId) => await fetchAllPages(
    `/playlists/${playlistId}/items?limit=50`,
    (payload) => payload.items,
    (payload) => toSpotifyNextCursor(payload.next)
  );
  const fetchPlaylistTracksPage = async (playlistId, nextPath) => {
    if (!playlistId || !/^[A-Za-z0-9]+$/.test(playlistId)) {
      throw new Error("Invalid playlistId.");
    }
    const defaultPath = `/playlists/${playlistId}/items?limit=50`;
    const path2 = resolveSpotifyPagePath(nextPath, defaultPath, [`/playlists/${playlistId}/`]);
    const payload = await spotifyFetch(path2);
    return {
      items: payload.items,
      next: toSpotifyNextCursor(payload.next)
    };
  };
  const fetchArtistGenreBatch = async (artistIds) => {
    const genresByArtistId = {};
    const chunk = [...new Set(artistIds)].slice(0, 50);
    if (chunk.length === 0) {
      return genresByArtistId;
    }
    try {
      const payload = await spotifyFetch(
        `/artists?ids=${chunk.join(",")}`
      );
      payload.artists.forEach((artist) => {
        genresByArtistId[artist.id] = artist.genres ?? [];
      });
    } catch {
    }
    return genresByArtistId;
  };
  const fetchArtistGenres = async (artistIds) => {
    const genresByArtistId = {};
    const uniqueArtistIds = [...new Set(artistIds)];
    for (let index = 0; index < uniqueArtistIds.length; index += 50) {
      const batch = await fetchArtistGenreBatch(uniqueArtistIds.slice(index, index + 50));
      Object.assign(genresByArtistId, batch);
    }
    return genresByArtistId;
  };
  const buildLibraryPayload = async (input) => {
    const artistIds = [
      ...input.savedItems.flatMap((item) => item.track ? item.track.artists.map((artist) => artist.id) : []),
      ...Object.values(input.playlistItemsByPlaylistId).flatMap(
        (entries) => entries.flatMap((entry) => {
          const track = entry.item ?? entry.track;
          return track ? track.artists.map((artist) => artist.id) : [];
        })
      )
    ];
    const genresByArtistId = await fetchArtistGenres(artistIds);
    return assembleSpotifyLibrary({
      contributor: input.contributor,
      savedItems: input.savedItems,
      readablePlaylists: input.readablePlaylists,
      playlistItemsByPlaylistId: input.playlistItemsByPlaylistId,
      genresByArtistId
    });
  };
  const fetchLibrary = async () => {
    const contributor = await fetchContributorProfile();
    const [savedItems, playlists] = await Promise.all([fetchSavedTrackItems(), fetchPlaylistSummaries()]);
    const readablePlaylists = filterReadablePlaylists(playlists, contributor.id);
    const playlistItemsByPlaylistId = {};
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
      playlistItemsByPlaylistId
    });
  };
  const resolvePlaybackDeviceId = async () => {
    const payload = await spotifyFetch("/me/player/devices");
    const device = pickPlaybackDevice(payload.devices ?? []);
    if (!device) {
      throw new Error(NO_DEVICES_MESSAGE);
    }
    if (!device.is_active) {
      await spotifyFetch("/me/player", {
        method: "PUT",
        body: JSON.stringify({ device_ids: [device.id], play: false })
      });
    }
    return device.id;
  };
  const startPlayback = async (body) => {
    const deviceId = await resolvePlaybackDeviceId();
    await spotifyFetch(`/me/player/play?device_id=${encodeURIComponent(deviceId)}`, {
      method: "PUT",
      body: JSON.stringify(body)
    });
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
        await startPlayback({ uris });
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
    await startPlayback({
      context_uri: `spotify:playlist:${playlist.playlistId}`,
      offset: { position: 0 }
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
  const getConnectionStatus = async () => {
    if (!isSpotifyConfigured()) {
      return {
        connected: false,
        configured: false,
        message: "Spotify credentials are not configured on the server."
      };
    }
    const tokens = store.getTokens();
    if (!tokens?.refreshToken) {
      return {
        connected: false,
        configured: true,
        message: "Not connected to Spotify."
      };
    }
    if (tokens.userId) {
      return {
        connected: true,
        configured: true,
        message: "Connected to Spotify.",
        displayName: tokens.displayName?.trim() || "Spotify user",
        userId: tokens.userId
      };
    }
    try {
      const contributor = await cacheProfileInSession();
      return {
        connected: true,
        configured: true,
        message: "Connected to Spotify.",
        displayName: contributor.name,
        userId: contributor.id
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Spotify connection could not be verified.";
      if (message.toLowerCase().includes("rate limit")) {
        return {
          connected: true,
          configured: true,
          message: "Spotify rate limited \u2014 wait a minute, then try again."
        };
      }
      return {
        connected: false,
        configured: true,
        message
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
    buildLibraryPayload,
    verifyContributorId,
    createPlaylist,
    playCue,
    getPlaybackState,
    disconnect: () => store.setTokens(null)
  };
};

// server-lib/spotify/sharedLibraryStore.ts
var import_node_fs = require("node:fs");
var import_node_path = __toESM(require("node:path"));

// server-lib/spotify/sharedLibraryRemoteStore.ts
var import_client_s3 = require("@aws-sdk/client-s3");
var isVercelProduction = () => process.env.VERCEL === "1";
var useS3Storage = () => {
  const override = process.env.SHARED_LIBRARY_STORAGE?.toLowerCase();
  if (override === "blob") {
    return false;
  }
  if (override === "s3" || override === "r2") {
    return Boolean(
      process.env.SHARED_LIBRARY_S3_BUCKET && process.env.SHARED_LIBRARY_S3_ACCESS_KEY_ID && process.env.SHARED_LIBRARY_S3_SECRET_ACCESS_KEY
    );
  }
  return Boolean(
    process.env.SHARED_LIBRARY_S3_BUCKET && process.env.SHARED_LIBRARY_S3_ACCESS_KEY_ID && process.env.SHARED_LIBRARY_S3_SECRET_ACCESS_KEY
  );
};
var useBlobStorage = () => {
  const override = process.env.SHARED_LIBRARY_STORAGE?.toLowerCase();
  if (override === "s3" || override === "r2") {
    return false;
  }
  if (override === "blob") {
    return Boolean(process.env.BLOB_READ_WRITE_TOKEN || isVercelProduction() && process.env.BLOB_STORE_ID);
  }
  if (useS3Storage()) {
    return false;
  }
  if (process.env.BLOB_READ_WRITE_TOKEN) {
    return true;
  }
  if (isVercelProduction() && process.env.BLOB_STORE_ID) {
    return true;
  }
  return false;
};
var streamToString = async (body) => {
  if (!body) {
    return "";
  }
  if (typeof body === "string") {
    return body;
  }
  if (body instanceof Uint8Array) {
    return new TextDecoder().decode(body);
  }
  if (typeof body.transformToByteArray === "function") {
    const bytes = await body.transformToByteArray();
    return new TextDecoder().decode(bytes);
  }
  const stream = body;
  if (stream && typeof stream[Symbol.asyncIterator] === "function") {
    const chunks = [];
    for await (const chunk of stream) {
      chunks.push(chunk);
    }
    if (chunks.length === 0) {
      return "";
    }
    const totalLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
    const merged = new Uint8Array(totalLength);
    let offset = 0;
    for (const chunk of chunks) {
      merged.set(chunk, offset);
      offset += chunk.length;
    }
    return new TextDecoder().decode(merged);
  }
  return "";
};
var s3Client = null;
var getS3Client = () => {
  if (s3Client) {
    return s3Client;
  }
  const endpoint = process.env.SHARED_LIBRARY_S3_ENDPOINT;
  s3Client = new import_client_s3.S3Client({
    region: process.env.SHARED_LIBRARY_S3_REGION ?? "auto",
    endpoint: endpoint || void 0,
    forcePathStyle: Boolean(endpoint),
    credentials: {
      accessKeyId: process.env.SHARED_LIBRARY_S3_ACCESS_KEY_ID,
      secretAccessKey: process.env.SHARED_LIBRARY_S3_SECRET_ACCESS_KEY
    }
  });
  return s3Client;
};
var createS3RemoteStore = () => {
  const bucket = process.env.SHARED_LIBRARY_S3_BUCKET;
  return {
    backend: "s3",
    readJson: async (key) => {
      try {
        const result = await getS3Client().send(
          new import_client_s3.GetObjectCommand({
            Bucket: bucket,
            Key: key
          })
        );
        const text = await streamToString(result.Body);
        if (!text) {
          return null;
        }
        return JSON.parse(text);
      } catch {
        return null;
      }
    },
    writeJson: async (key, payload) => {
      await getS3Client().send(
        new import_client_s3.PutObjectCommand({
          Bucket: bucket,
          Key: key,
          Body: JSON.stringify(payload),
          ContentType: "application/json"
        })
      );
    },
    listJsonKeys: async (prefix) => {
      const entries = [];
      let continuationToken;
      do {
        const result = await getS3Client().send(
          new import_client_s3.ListObjectsV2Command({
            Bucket: bucket,
            Prefix: prefix,
            ContinuationToken: continuationToken
          })
        );
        (result.Contents ?? []).forEach((object) => {
          if (!object.Key) {
            return;
          }
          entries.push({
            key: object.Key,
            updatedAt: object.LastModified ?? /* @__PURE__ */ new Date(0)
          });
        });
        continuationToken = result.IsTruncated ? result.NextContinuationToken : void 0;
      } while (continuationToken);
      return entries;
    }
  };
};
var getBlobModule = async () => import("@vercel/blob");
var createBlobRemoteStore = () => ({
  backend: "blob",
  readJson: async (key) => {
    const { get } = await getBlobModule();
    try {
      const result = await get(key, { access: "private", useCache: false });
      if (!result || result.statusCode !== 200 || !result.stream) {
        return null;
      }
      const text = await new Response(result.stream).text();
      return JSON.parse(text);
    } catch {
      return null;
    }
  },
  writeJson: async (key, payload) => {
    const { put } = await getBlobModule();
    await put(key, JSON.stringify(payload), {
      access: "private",
      addRandomSuffix: false,
      allowOverwrite: true,
      contentType: "application/json"
    });
  },
  listJsonKeys: async (prefix) => {
    const { list } = await getBlobModule();
    const { blobs } = await list({ prefix });
    return blobs.map((blob) => ({
      key: blob.pathname,
      updatedAt: blob.uploadedAt
    }));
  }
});
var getRemoteJsonStore = () => {
  if (useS3Storage()) {
    return createS3RemoteStore();
  }
  if (useBlobStorage()) {
    return createBlobRemoteStore();
  }
  return null;
};
var isRemoteStorageConfigured = () => getRemoteJsonStore() !== null;

// server-lib/spotify/sharedLibraryStore.ts
var LOCAL_LIBRARY_DIR = import_node_path.default.resolve(process.cwd(), ".data/shared-libraries");
var STORAGE_PREFIX = "music-cue/libraries";
var INDEX_KEY = `${STORAGE_PREFIX}/index.json`;
var SHARED_LIBRARY_STORAGE_ERROR = "Shared library storage is not configured. Set Cloudflare R2 / S3 env vars (SHARED_LIBRARY_S3_*) or reconnect Vercel Blob, then redeploy.";
var isVercelProduction2 = () => process.env.VERCEL === "1";
var isSharedLibraryStorageConfigured = () => {
  if (!isVercelProduction2()) {
    return true;
  }
  return isRemoteStorageConfigured();
};
var assertSharedLibraryStorageConfigured = () => {
  if (!isSharedLibraryStorageConfigured()) {
    throw new Error(SHARED_LIBRARY_STORAGE_ERROR);
  }
};
var snapshotKey = (contributorId) => `${STORAGE_PREFIX}/${contributorId}.json`;
var readLocalSnapshot = (contributorId) => {
  const filePath = import_node_path.default.join(LOCAL_LIBRARY_DIR, `${contributorId}.json`);
  if (!(0, import_node_fs.existsSync)(filePath)) {
    return null;
  }
  try {
    return JSON.parse((0, import_node_fs.readFileSync)(filePath, "utf8"));
  } catch {
    return null;
  }
};
var writeLocalSnapshot = (snapshot) => {
  (0, import_node_fs.mkdirSync)(LOCAL_LIBRARY_DIR, { recursive: true });
  (0, import_node_fs.writeFileSync)(
    import_node_path.default.join(LOCAL_LIBRARY_DIR, `${snapshot.contributor.id}.json`),
    `${JSON.stringify(snapshot, null, 2)}
`,
    "utf8"
  );
};
var readLocalIndex = () => {
  const contributors = [];
  if (!(0, import_node_fs.existsSync)(LOCAL_LIBRARY_DIR)) {
    return { contributors };
  }
  for (const fileName of (0, import_node_fs.readdirSync)(LOCAL_LIBRARY_DIR)) {
    if (!fileName.endsWith(".json") || fileName === "index.json") {
      continue;
    }
    const snapshot = readLocalSnapshot(fileName.replace(/\.json$/, ""));
    if (!snapshot) {
      continue;
    }
    contributors.push({
      id: snapshot.contributor.id,
      name: snapshot.contributor.name,
      updatedAt: snapshot.updatedAt,
      trackCount: snapshot.songs.length
    });
  }
  contributors.sort((left, right) => left.name.localeCompare(right.name));
  return { contributors };
};
var writeLocalIndex = (index) => {
  (0, import_node_fs.mkdirSync)(LOCAL_LIBRARY_DIR, { recursive: true });
  (0, import_node_fs.writeFileSync)(import_node_path.default.join(LOCAL_LIBRARY_DIR, "index.json"), `${JSON.stringify(index, null, 2)}
`, "utf8");
};
var upsertContributor = (index, snapshot) => {
  const contributor = {
    id: snapshot.contributor.id,
    name: snapshot.contributor.name,
    updatedAt: snapshot.updatedAt,
    trackCount: snapshot.songs.length
  };
  const contributors = index.contributors.filter((entry) => entry.id !== contributor.id);
  contributors.push(contributor);
  contributors.sort((left, right) => left.name.localeCompare(right.name));
  return { contributors };
};
var saveSharedLibrarySnapshot = async (snapshot) => {
  assertSharedLibraryStorageConfigured();
  const remote = getRemoteJsonStore();
  if (!remote) {
    writeLocalSnapshot(snapshot);
    const index = readLocalIndex();
    writeLocalIndex(upsertContributor(index, snapshot));
    return;
  }
  await remote.writeJson(snapshotKey(snapshot.contributor.id), snapshot);
  const currentIndex = await remote.readJson(INDEX_KEY) ?? { contributors: [] };
  await remote.writeJson(INDEX_KEY, upsertContributor(currentIndex, snapshot));
};

// server-lib/spotify/spotifyHandlers.ts
var getQueryValue = (query, key) => {
  const value = query?.[key];
  if (Array.isArray(value)) {
    return typeof value[0] === "string" ? value[0] : "";
  }
  return typeof value === "string" ? value : "";
};
var readNextCursor = (req) => {
  if (req.method === "POST" && req.body && typeof req.body === "object") {
    const next = req.body.next;
    if (typeof next === "string" && next.trim()) {
      return next.trim();
    }
  }
  const fromQuery = getQueryValue(req.query, "next");
  return fromQuery || null;
};
var isPublishedLibraryPayload = (body) => {
  if (!body || typeof body !== "object") {
    return false;
  }
  const candidate = body;
  return Boolean(candidate.contributor?.id && candidate.contributor?.name) && Array.isArray(candidate.songs) && Boolean(candidate.stats);
};
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
      finish(200, await client.getConnectionStatus());
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
    if (route === "profile" && req.method === "GET") {
      finish(200, await client.fetchContributorProfile());
      return;
    }
    if (route === "saved-tracks-page" && (req.method === "GET" || req.method === "POST")) {
      finish(200, await client.fetchSavedTracksPage(readNextCursor(req)));
      return;
    }
    if (route === "playlists-page" && (req.method === "GET" || req.method === "POST")) {
      finish(200, await client.fetchPlaylistsPage(readNextCursor(req)));
      return;
    }
    if (route === "playlist-tracks-page" && (req.method === "GET" || req.method === "POST")) {
      const playlistId = req.method === "POST" && req.body && typeof req.body === "object" ? typeof req.body.playlistId === "string" ? req.body.playlistId : "" : getQueryValue(req.query, "playlistId");
      if (!playlistId) {
        finish(400, { error: "playlistId is required." });
        return;
      }
      finish(200, await client.fetchPlaylistTracksPage(playlistId, readNextCursor(req)));
      return;
    }
    if (route === "saved-tracks" && req.method === "GET") {
      finish(200, { items: await client.fetchSavedTrackItems() });
      return;
    }
    if (route === "playlists" && req.method === "GET") {
      finish(200, { playlists: await client.fetchPlaylistSummaries() });
      return;
    }
    if (route === "playlist-tracks" && req.method === "GET") {
      const playlistId = getQueryValue(req.query, "playlistId");
      if (!playlistId) {
        finish(400, { error: "playlistId is required." });
        return;
      }
      finish(200, { items: await client.fetchPlaylistTrackItems(playlistId) });
      return;
    }
    if (route === "artist-genres" && req.method === "POST") {
      const body = req.body;
      const artistIds = Array.isArray(body?.artistIds) ? body.artistIds : [];
      finish(200, { genresByArtistId: await client.fetchArtistGenreBatch(artistIds) });
      return;
    }
    if (route === "publish-shared-library" && req.method === "POST") {
      const body = req.body;
      let library;
      if (isPublishedLibraryPayload(body)) {
        await client.verifyContributorId(body.contributor.id);
        library = body;
      } else {
        library = await client.fetchLibrary();
      }
      const updatedAt = (/* @__PURE__ */ new Date()).toISOString();
      await saveSharedLibrarySnapshot({
        contributor: library.contributor,
        updatedAt,
        songs: library.songs,
        stats: library.stats
      });
      finish(200, {
        ok: true,
        contributor: library.contributor,
        trackCount: library.songs.length,
        updatedAt
      });
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
    const rateLimited = message.toLowerCase().includes("rate limit");
    finish(rateLimited ? 429 : 500, { error: message });
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
