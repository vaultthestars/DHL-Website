import { PlaybackState, Song } from "./types";

export const NOW_PLAYING_PLAYLIST_NAME = "MusicCue — Now Playing";

export type PlayCueResult = {
  playlistName: string;
  matchedCount: number;
  requestedCount: number;
  matchedPersistentIds: string[];
};

export type SaveCuePlaylistResult = PlayCueResult;

const toTrackPayload = (song: Song) => ({
  artist: song.artist,
  title: song.title,
  persistentId: song.id,
});

export const validateTracksInMusicApp = async (songs: Song[]): Promise<Record<string, boolean>> => {
  const response = await fetch("/api/music/validate-tracks", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      tracks: songs.map(toTrackPayload),
    }),
  });

  if (!response.ok) {
    const payload = (await response.json().catch(() => ({}))) as { error?: string };
    throw new Error(payload.error ?? "Could not validate tracks in Music.app.");
  }

  const payload = (await response.json()) as { availability: Record<string, boolean> };
  return payload.availability ?? {};
};

export const playCueInMusicApp = async (songs: Song[]): Promise<PlayCueResult> => {
  const response = await fetch("/api/music/play-cue", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      tracks: songs.map(toTrackPayload),
    }),
  });

  if (!response.ok) {
    const payload = (await response.json().catch(() => ({}))) as { error?: string };
    throw new Error(payload.error ?? "Could not play cue in Music.app.");
  }

  return (await response.json()) as PlayCueResult;
};

export const saveCuePlaylistInMusicApp = async (
  songs: Song[],
  playlistName: string
): Promise<SaveCuePlaylistResult> => {
  const response = await fetch("/api/music/save-cue-playlist", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      tracks: songs.map(toTrackPayload),
      playlistName: playlistName.trim(),
    }),
  });

  if (!response.ok) {
    const payload = (await response.json().catch(() => ({}))) as { error?: string };
    throw new Error(payload.error ?? "Could not save playlist in Music.app.");
  }

  return (await response.json()) as SaveCuePlaylistResult;
};

export const getCuePlaylistTrackIds = async (playlistName: string): Promise<string[]> => {
  const response = await fetch(
    `/api/music/cue-playlist-tracks?playlistName=${encodeURIComponent(playlistName)}`
  );
  if (!response.ok) {
    return [];
  }
  const payload = (await response.json()) as { persistentIds?: string[] };
  return payload.persistentIds ?? [];
};

export const removeTrackFromCuePlaylist = async (song: Song): Promise<void> => {
  const response = await fetch("/api/music/remove-from-cue-playlist", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ persistentId: song.id }),
  });

  if (!response.ok) {
    const payload = (await response.json().catch(() => ({}))) as { error?: string };
    throw new Error(payload.error ?? "Could not remove track from Music.app cue playlist.");
  }
};

export const syncCuePlaylistInMusicApp = async (
  songs: Song[],
  resumePersistentId?: string | null
): Promise<PlayCueResult> => {
  const response = await fetch("/api/music/sync-cue-playlist", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      tracks: songs.map(toTrackPayload),
      resumePersistentId: resumePersistentId ?? undefined,
    }),
  });

  if (!response.ok) {
    const payload = (await response.json().catch(() => ({}))) as { error?: string };
    throw new Error(payload.error ?? "Could not sync cue playlist in Music.app.");
  }

  return (await response.json()) as PlayCueResult;
};

export const playTrackNextInMusicApp = async (song: Song): Promise<"queued" | "playing"> => {
  const response = await fetch("/api/music/play-track-next", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(toTrackPayload(song)),
  });

  if (!response.ok) {
    const payload = (await response.json().catch(() => ({}))) as { error?: string };
    throw new Error(payload.error ?? "Could not queue track in Music.app.");
  }

  const payload = (await response.json()) as { mode?: string };
  return payload.mode === "queued" ? "queued" : "playing";
};

export const playTrackInMusicApp = async (song: Song): Promise<void> => {
  const response = await fetch("/api/music/play-track", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(toTrackPayload(song)),
  });

  if (!response.ok) {
    const payload = (await response.json().catch(() => ({}))) as { error?: string };
    throw new Error(payload.error ?? "Could not play track in Music.app.");
  }
};

export const skipToNextTrack = async (): Promise<void> => {
  const response = await fetch("/api/music/next", { method: "POST" });
  if (!response.ok) {
    const payload = (await response.json().catch(() => ({}))) as { error?: string };
    throw new Error(payload.error ?? "Could not skip to next track.");
  }
};

export const skipToPreviousTrack = async (): Promise<void> => {
  const response = await fetch("/api/music/previous", { method: "POST" });
  if (!response.ok) {
    const payload = (await response.json().catch(() => ({}))) as { error?: string };
    throw new Error(payload.error ?? "Could not skip to previous track.");
  }
};

export const getPlaybackState = async (): Promise<PlaybackState | null> => {
  const response = await fetch("/api/music/playback-state");
  if (!response.ok) {
    return null;
  }
  const payload = (await response.json()) as PlaybackState;
  if (!payload.persistentId && !payload.title) {
    return null;
  }
  return payload;
};

export const pingMusicApp = async (): Promise<string> => {
  const response = await fetch("/api/music/ping");
  if (!response.ok) {
    const payload = (await response.json().catch(() => ({}))) as { error?: string };
    throw new Error(payload.error ?? "Music.app is not available.");
  }
  const payload = (await response.json()) as { currentTrack?: string };
  return payload.currentTrack ?? "unknown";
};
