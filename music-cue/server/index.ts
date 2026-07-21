import cors from "cors";
import express from "express";
import { execFile } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildNextTrackScript,
  buildPingScript,
  buildPlaybackStateScript,
  buildPlayCueScript,
  buildPlayTrackNextScript,
  buildPlayTrackScript,
  buildPreviousTrackScript,
  buildGetPlaylistTrackIdsScript,
  buildRemoveTrackFromCuePlaylistScript,
  buildSaveCuePlaylistScript,
  buildSyncCuePlaylistScript,
  buildValidateTracksScript,
  CueTrack,
  NOW_PLAYING_PLAYLIST_NAME,
  parsePlayCueResult,
  parsePlaylistTrackIdsResult,
  parseSaveCuePlaylistResult,
  parseValidateTracksResult,
} from "./musicApp.js";

import { readClusterLayoutFile, writeClusterLayoutFile } from "./clusterLayout.js";
import { handleSharedLibraryRoute } from "./sharedLibraryHandlers.js";
import { spotifyRouter } from "./spotifyRoutes.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const loadEnvFile = (): void => {
  const envPath = path.resolve(__dirname, "../.env");
  if (!existsSync(envPath)) {
    return;
  }
  const contents = readFileSync(envPath, "utf8");
  contents.split("\n").forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      return;
    }
    const separator = trimmed.indexOf("=");
    if (separator === -1) {
      return;
    }
    const key = trimmed.slice(0, separator).trim();
    const value = trimmed.slice(separator + 1).trim();
    if (key && process.env[key] === undefined) {
      process.env[key] = value;
    }
  });
};

loadEnvFile();
const PORT = Number(process.env.PORT ?? 3847);
const isProduction = process.env.NODE_ENV === "production";

const runAppleScript = (source: string): Promise<string> =>
  new Promise((resolve, reject) => {
    execFile("osascript", ["-e", source], { timeout: 120_000 }, (error, stdout, stderr) => {
      if (error) {
        reject(new Error(stderr || error.message));
        return;
      }
      resolve(stdout.trim());
    });
  });

const app = express();
app.use(cors());
app.use(express.json({ limit: "2mb" }));

app.use("/api/spotify", spotifyRouter);

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, platform: process.platform });
});

app.get("/api/cluster-layout", (_req, res) => {
  res.json(readClusterLayoutFile());
});

app.put("/api/cluster-layout", (req, res) => {
  const genre = req.body?.genre;
  const playlist = req.body?.playlist;
  if (!genre || typeof genre !== "object" || !playlist || typeof playlist !== "object") {
    res.status(400).json({ error: "genre and playlist objects are required." });
    return;
  }
  writeClusterLayoutFile({ genre, playlist });
  res.json({ ok: true });
});

app.all("/api/shared-libraries/*", async (req, res) => {
  const route = req.path.replace(/^\/api\/shared-libraries\/?/, "");
  await handleSharedLibraryRoute(route, req, res);
});

app.get("/api/shared-libraries", async (req, res) => {
  await handleSharedLibraryRoute("", req, res);
});

app.get("/api/music/ping", async (_req, res) => {
  if (process.platform !== "darwin") {
    res.status(400).json({ error: "Music.app control only works on macOS." });
    return;
  }
  try {
    const trackName = await runAppleScript(buildPingScript());
    res.json({ ok: true, currentTrack: trackName });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Music.app is not available.";
    res.status(500).json({ error: message });
  }
});

app.post("/api/music/play-track-next", async (req, res) => {
  if (process.platform !== "darwin") {
    res.status(400).json({ error: "Music.app control only works on macOS." });
    return;
  }

  const track = req.body as CueTrack;
  if (!track?.artist || !track?.title) {
    res.status(400).json({ error: "artist and title are required." });
    return;
  }

  try {
    const result = await runAppleScript(buildPlayTrackNextScript(track));
    if (result === "not found") {
      res.status(404).json({ error: "Track not found in Music.app." });
      return;
    }
    res.json({ ok: true, mode: result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not queue track.";
    res.status(500).json({ error: message });
  }
});

app.post("/api/music/play-track", async (req, res) => {
  if (process.platform !== "darwin") {
    res.status(400).json({ error: "Music.app control only works on macOS." });
    return;
  }

  const track = req.body as CueTrack;
  if (!track?.artist || !track?.title) {
    res.status(400).json({ error: "artist and title are required." });
    return;
  }

  try {
    await runAppleScript(buildPlayTrackScript(track));
    res.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not play track.";
    res.status(500).json({ error: message });
  }
});

app.post("/api/music/validate-tracks", async (req, res) => {
  if (process.platform !== "darwin") {
    res.status(400).json({ error: "Music.app control only works on macOS." });
    return;
  }

  const tracks = req.body?.tracks as CueTrack[] | undefined;
  if (!tracks || tracks.length === 0) {
    res.json({ availability: {} });
    return;
  }

  try {
    const raw = await runAppleScript(buildValidateTracksScript(tracks));
    res.json({ availability: parseValidateTracksResult(raw) });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not validate tracks.";
    res.status(500).json({ error: message });
  }
});

app.post("/api/music/play-cue", async (req, res) => {
  if (process.platform !== "darwin") {
    res.status(400).json({ error: "Music.app control only works on macOS." });
    return;
  }

  const tracks = req.body?.tracks as CueTrack[] | undefined;
  if (!tracks || tracks.length === 0) {
    res.status(400).json({ error: "tracks array is required." });
    return;
  }

  try {
    const raw = await runAppleScript(buildPlayCueScript(tracks));
    const { matchedCount, matchedPersistentIds } = parsePlayCueResult(raw);
    if (matchedCount <= 0) {
      res.status(404).json({ error: "No tracks from this cue were found in Music.app." });
      return;
    }
    res.json({
      ok: true,
      playlistName: NOW_PLAYING_PLAYLIST_NAME,
      matchedCount,
      requestedCount: tracks.length,
      matchedPersistentIds,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not play cue.";
    res.status(500).json({ error: message });
  }
});

app.post("/api/music/save-cue-playlist", async (req, res) => {
  if (process.platform !== "darwin") {
    res.status(400).json({ error: "Music.app control only works on macOS." });
    return;
  }

  const tracks = req.body?.tracks as CueTrack[] | undefined;
  if (!tracks || tracks.length === 0) {
    res.status(400).json({ error: "tracks array is required." });
    return;
  }

  const requestedName = typeof req.body?.playlistName === "string" ? req.body.playlistName.trim() : "";
  if (!requestedName) {
    res.status(400).json({ error: "playlistName is required." });
    return;
  }

  const playlistName = requestedName;
  try {
    const raw = await runAppleScript(buildSaveCuePlaylistScript(tracks, playlistName));
    const { matchedCount, matchedPersistentIds, playlistName: savedName } = parseSaveCuePlaylistResult(raw);
    if (matchedCount <= 0) {
      res.status(404).json({ error: "No tracks from this cue were found in Music.app." });
      return;
    }
    res.json({
      ok: true,
      playlistName: savedName || playlistName,
      matchedCount,
      requestedCount: tracks.length,
      matchedPersistentIds,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not play cue.";
    res.status(500).json({ error: message });
  }
});

app.get("/api/music/cue-playlist-tracks", async (req, res) => {
  if (process.platform !== "darwin") {
    res.status(400).json({ error: "Music.app control only works on macOS." });
    return;
  }

  const playlistName = typeof req.query.playlistName === "string" ? req.query.playlistName : NOW_PLAYING_PLAYLIST_NAME;
  try {
    const raw = await runAppleScript(buildGetPlaylistTrackIdsScript(playlistName));
    res.json({ persistentIds: parsePlaylistTrackIdsResult(raw) });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not read playlist tracks.";
    res.status(500).json({ error: message });
  }
});

app.post("/api/music/remove-from-cue-playlist", async (req, res) => {
  if (process.platform !== "darwin") {
    res.status(400).json({ error: "Music.app control only works on macOS." });
    return;
  }

  const persistentId = req.body?.persistentId as string | undefined;
  if (!persistentId) {
    res.status(400).json({ error: "persistentId is required." });
    return;
  }

  try {
    const result = await runAppleScript(buildRemoveTrackFromCuePlaylistScript(persistentId));
    if (result === "no playlist") {
      res.status(404).json({ error: "Now-playing cue playlist not found in Music.app." });
      return;
    }
    res.json({ ok: true, result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not remove track from cue playlist.";
    res.status(500).json({ error: message });
  }
});

app.post("/api/music/sync-cue-playlist", async (req, res) => {
  if (process.platform !== "darwin") {
    res.status(400).json({ error: "Music.app control only works on macOS." });
    return;
  }

  const tracks = req.body?.tracks as CueTrack[] | undefined;
  if (!tracks) {
    res.status(400).json({ error: "tracks array is required." });
    return;
  }

  const resumePersistentId =
    typeof req.body?.resumePersistentId === "string" ? req.body.resumePersistentId : undefined;

  try {
    const raw = await runAppleScript(buildSyncCuePlaylistScript(tracks, resumePersistentId));
    const { matchedCount, matchedPersistentIds } = parsePlayCueResult(raw);
    res.json({
      ok: true,
      playlistName: NOW_PLAYING_PLAYLIST_NAME,
      matchedCount,
      requestedCount: tracks.length,
      matchedPersistentIds,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not sync cue playlist.";
    res.status(500).json({ error: message });
  }
});

app.post("/api/music/next", async (_req, res) => {
  if (process.platform !== "darwin") {
    res.status(400).json({ error: "Music.app control only works on macOS." });
    return;
  }
  try {
    await runAppleScript(buildNextTrackScript());
    res.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not skip track.";
    res.status(500).json({ error: message });
  }
});

app.post("/api/music/previous", async (_req, res) => {
  if (process.platform !== "darwin") {
    res.status(400).json({ error: "Music.app control only works on macOS." });
    return;
  }
  try {
    await runAppleScript(buildPreviousTrackScript());
    res.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not skip track.";
    res.status(500).json({ error: message });
  }
});

app.get("/api/music/playback-state", async (_req, res) => {
  if (process.platform !== "darwin") {
    res.status(400).json({ error: "Music.app control only works on macOS." });
    return;
  }
  try {
    const raw = await runAppleScript(buildPlaybackStateScript());
    const [artist = "", title = "", trackIndex = "0", playlistName = "", persistentId = "", playerPosition = "0"] =
      raw.split("|||");
    res.json({
      artist,
      title,
      trackIndex: Number(trackIndex) || 0,
      playlistName,
      persistentId,
      playerPosition: Number(playerPosition) || 0,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not read playback state.";
    res.status(500).json({ error: message });
  }
});

if (isProduction) {
  const distPath = path.resolve(__dirname, "../dist");
  app.use(express.static(distPath));
  app.get("*", (_req, res) => {
    res.sendFile(path.join(distPath, "index.html"));
  });
}

app.listen(PORT, () => {
  console.log(`Music Cue server listening on http://localhost:${PORT}`);
});
