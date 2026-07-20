import { createCookieSessionStore, createSpotifyClient, isSpotifyConfigured } from "./spotifyClient";

type HandlerRequest = {
  method?: string;
  body?: unknown;
  headers?: { cookie?: string };
};

type HandlerResponse = {
  status: (code: number) => HandlerResponse;
  json: (body: unknown) => void;
  setHeader: (name: string, value: string | string[]) => void;
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
      finish(200, client.getConnectionStatus());
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

    if (route === "auth/callback" && req.method === "POST") {
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
    finish(500, { error: message });
  }
};
