import {
  createCookieSessionStore,
  createSpotifyClient,
  isSpotifyConfigured,
  type SpotifyLibraryPayload,
} from "./spotifyClient.js";
import { saveSharedLibrarySnapshot } from "./sharedLibraryStore.js";

type HandlerRequest = {
  method?: string;
  body?: unknown;
  headers?: { cookie?: string };
  query?: Record<string, unknown>;
};

type HandlerResponse = {
  status: (code: number) => HandlerResponse;
  json: (body: unknown) => void;
  setHeader: (name: string, value: string | string[]) => void;
};

const getQueryValue = (query: HandlerRequest["query"], key: string): string => {
  const value = query?.[key];
  if (Array.isArray(value)) {
    return typeof value[0] === "string" ? value[0] : "";
  }
  return typeof value === "string" ? value : "";
};

const readNextCursor = (req: HandlerRequest): string | null => {
  if (req.method === "POST" && req.body && typeof req.body === "object") {
    const next = (req.body as { next?: string }).next;
    if (typeof next === "string" && next.trim()) {
      return next.trim();
    }
  }
  const fromQuery = getQueryValue(req.query, "next");
  return fromQuery || null;
};

const isPublishedLibraryPayload = (body: unknown): body is SpotifyLibraryPayload => {
  if (!body || typeof body !== "object") {
    return false;
  }
  const candidate = body as Partial<SpotifyLibraryPayload>;
  return (
    Boolean(candidate.contributor?.id && candidate.contributor?.name) &&
    Array.isArray(candidate.songs) &&
    Boolean(candidate.stats)
  );
};

export const handleSpotifyRoute = async (
  route: string,
  req: HandlerRequest,
  res: HandlerResponse
): Promise<void> => {
  const cookiesToSet: string[] = [];
  const store = createCookieSessionStore(req.headers?.cookie, (cookie) => {
    cookiesToSet.push(cookie);
  });
  const client = createSpotifyClient(store);

  const finish = (statusCode: number, body: unknown) => {
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
      const body = req.body as { codeChallenge?: string; state?: string };
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
      const body = req.body as { code?: string; codeVerifier?: string };
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

    if (route === "warmup" && req.method === "GET") {
      finish(200, await client.warmupAccessToken());
      return;
    }

    if (route === "playlists-page" && (req.method === "GET" || req.method === "POST")) {
      finish(200, await client.fetchPlaylistsPage(readNextCursor(req)));
      return;
    }

    if (route === "playlist-tracks-page" && (req.method === "GET" || req.method === "POST")) {
      const playlistId =
        req.method === "POST" && req.body && typeof req.body === "object"
          ? typeof (req.body as { playlistId?: string }).playlistId === "string"
            ? (req.body as { playlistId: string }).playlistId
            : ""
          : getQueryValue(req.query, "playlistId");
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
      const body = req.body as { artistIds?: string[] };
      const artistIds = Array.isArray(body?.artistIds) ? body.artistIds : [];
      finish(200, { genresByArtistId: await client.fetchArtistGenreBatch(artistIds) });
      return;
    }

    if (route === "publish-shared-library" && req.method === "POST") {
      const body = req.body;
      let library: SpotifyLibraryPayload;
      if (isPublishedLibraryPayload(body)) {
        await client.verifyContributorId(body.contributor.id);
        library = body;
      } else {
        library = await client.fetchLibrary();
      }
      const updatedAt = new Date().toISOString();
      await saveSharedLibrarySnapshot({
        contributor: library.contributor,
        updatedAt,
        songs: library.songs,
        stats: library.stats,
      });
      finish(200, {
        ok: true,
        contributor: library.contributor,
        trackCount: library.songs.length,
        updatedAt,
      });
      return;
    }

    if (route === "validate-tracks" && req.method === "POST") {
      const body = req.body as { trackIds?: string[] };
      const trackIds = Array.isArray(body?.trackIds) ? body.trackIds : [];
      const availability: Record<string, boolean> = {};
      trackIds.forEach((trackId) => {
        availability[trackId] = true;
      });
      finish(200, { availability });
      return;
    }

    if (route === "play-cue" && req.method === "POST") {
      const body = req.body as { trackIds?: string[] };
      const trackIds = Array.isArray(body?.trackIds) ? body.trackIds : [];
      if (trackIds.length === 0) {
        finish(400, { error: "trackIds array is required." });
        return;
      }
      finish(200, await client.playCue(trackIds));
      return;
    }

    if (route === "save-playlist" && req.method === "POST") {
      const body = req.body as { trackIds?: string[]; playlistName?: string };
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
        matchedTrackIds: result.matchedTrackIds,
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
