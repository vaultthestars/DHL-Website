import type {
  SpotifyPlaylistItem,
  SpotifyPlaylistSummary,
  SpotifySavedTrackItem,
} from "../../shared/spotifyLibraryAssembly";
import {
  clearImportSessionFromIndexedDb,
  loadImportSessionFromIndexedDb,
  saveImportSessionToIndexedDb,
} from "./spotifyImportStorage";

const CONNECTED_USER_KEY = "music-cue-spotify-connected-user";
const SESSION_KEY = "music-cue-spotify-import-session";
const HINT_KEY = "music-cue-spotify-import-hint";
const RATE_LIMIT_UNTIL_KEY = "music-cue-spotify-rate-limit-until-ms";

const DEFAULT_RATE_LIMIT_SECONDS = 60;
const MIN_RATE_LIMIT_SECONDS = 60;
/** Client-side cap — Spotify may return multi-hour Retry-After after heavy abuse. */
const MAX_RATE_LIMIT_SECONDS = 3_600;

export const saveConnectedSpotifyUser = (contributor: { id: string; name: string }): void => {
  localStorage.setItem(CONNECTED_USER_KEY, JSON.stringify(contributor));
};

export const loadConnectedSpotifyUser = (): { id: string; name: string } | null => {
  try {
    const raw = localStorage.getItem(CONNECTED_USER_KEY);
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw) as { id?: string; name?: string };
    if (!parsed?.id) {
      return null;
    }
    return { id: parsed.id, name: parsed.name?.trim() || "Spotify user" };
  } catch {
    return null;
  }
};

export const clearConnectedSpotifyUser = (): void => {
  localStorage.removeItem(CONNECTED_USER_KEY);
};

export type SpotifyImportPhase = "saved-tracks" | "playlists" | "playlist-tracks" | "genres";

export type SpotifyImportSession = {
  version: 1;
  contributor: { id: string; name: string };
  updatedAt: string;
  phase: SpotifyImportPhase;
  savedItems: SpotifySavedTrackItem[];
  savedTracksNext: string | null;
  savedTracksComplete: boolean;
  playlists: SpotifyPlaylistSummary[];
  playlistsNext: string | null;
  playlistsListLoaded: boolean;
  readablePlaylistIds: string[];
  playlistItemsByPlaylistId: Record<string, SpotifyPlaylistItem[]>;
  completedPlaylistIds: string[];
  activePlaylistId: string | null;
  activePlaylistItems: SpotifyPlaylistItem[];
  activePlaylistNext: string | null;
  genresByArtistId?: Record<string, string[]>;
  genresNextArtistIndex?: number;
  genresArtistCount?: number;
  /** Artists still needing lookup when genre phase started (subset of genresArtistCount). */
  genresPendingArtistCount?: number;
};

type SpotifyImportHint = {
  contributorId: string;
  contributorName: string;
  resumable: boolean;
  label: string;
  lastRateLimitedAt?: string;
};

export const createSpotifyImportSession = (contributor: {
  id: string;
  name: string;
}): SpotifyImportSession => ({
  version: 1,
  contributor,
  updatedAt: new Date().toISOString(),
  phase: "saved-tracks",
  savedItems: [],
  savedTracksNext: null,
  savedTracksComplete: false,
  playlists: [],
  playlistsNext: null,
  playlistsListLoaded: false,
  readablePlaylistIds: [],
  playlistItemsByPlaylistId: {},
  completedPlaylistIds: [],
  activePlaylistId: null,
  activePlaylistItems: [],
  activePlaylistNext: null,
});

const isSessionResumable = (session: SpotifyImportSession): boolean => {
  if (!session.savedTracksComplete) {
    return true;
  }
  if (!session.playlistsListLoaded) {
    return true;
  }
  if (session.completedPlaylistIds.length < session.readablePlaylistIds.length) {
    return true;
  }
  return false;
};

const buildResumeLabel = (session: SpotifyImportSession): string => {
  const trackEstimate = session.savedItems.length;
  if (!session.savedTracksComplete) {
    return `Resume saved tracks (${trackEstimate.toLocaleString()} loaded)`;
  }
  if (!session.playlistsListLoaded) {
    return `Resume playlist list (${session.playlists.length} playlists, ${trackEstimate.toLocaleString()} tracks)`;
  }
  if (session.phase === "playlist-tracks") {
    return `Resume playlists (${session.completedPlaylistIds.length}/${session.readablePlaylistIds.length} done)`;
  }
  return "Resume library import";
};

const saveSpotifyImportHint = (session: SpotifyImportSession, lastRateLimitedAt?: string): void => {
  const existing = loadSpotifyImportHint();
  const hint: SpotifyImportHint = {
    contributorId: session.contributor.id,
    contributorName: session.contributor.name,
    resumable: isSessionResumable(session),
    label: buildResumeLabel(session),
    lastRateLimitedAt: lastRateLimitedAt ?? existing?.lastRateLimitedAt,
  };
  localStorage.setItem(HINT_KEY, JSON.stringify(hint));
};

const loadSpotifyImportHint = (): SpotifyImportHint | null => {
  try {
    const raw = localStorage.getItem(HINT_KEY);
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw) as SpotifyImportHint;
    if (!parsed?.contributorId) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
};

export const getSpotifyImportContributorHint = (): { id: string; name: string } | null => {
  const hint = loadSpotifyImportHint();
  if (!hint?.contributorId) {
    return null;
  }
  return {
    id: hint.contributorId,
    name: hint.contributorName || "Spotify user",
  };
};

export const formatSpotifyRateLimitCooldown = (cooldownMs: number): string => {
  const seconds = Math.ceil(cooldownMs / 1000);
  if (seconds >= 120) {
    return `${Math.ceil(seconds / 60)} min`;
  }
  return `${seconds}s`;
};

export const markSpotifyImportRateLimited = (retryAfterSeconds?: number): void => {
  const waitSeconds = Math.min(
    Math.max(retryAfterSeconds ?? DEFAULT_RATE_LIMIT_SECONDS, MIN_RATE_LIMIT_SECONDS),
    MAX_RATE_LIMIT_SECONDS
  );
  const proposedUntil = Date.now() + waitSeconds * 1000;
  const existingUntil = Number.parseInt(localStorage.getItem(RATE_LIMIT_UNTIL_KEY) ?? "0", 10);
  const rateLimitUntilMs = Math.max(
    proposedUntil,
    Number.isFinite(existingUntil) ? existingUntil : 0
  );
  localStorage.setItem(RATE_LIMIT_UNTIL_KEY, String(rateLimitUntilMs));

  const hint = loadSpotifyImportHint();
  if (hint) {
    localStorage.setItem(
      HINT_KEY,
      JSON.stringify({
        ...hint,
        lastRateLimitedAt: new Date().toISOString(),
      })
    );
  }
};

export const clearSpotifyRateLimitCooldown = (): void => {
  localStorage.removeItem(RATE_LIMIT_UNTIL_KEY);
};

export const getSpotifyImportRateLimitCooldownMs = (): number => {
  const until = Number.parseInt(localStorage.getItem(RATE_LIMIT_UNTIL_KEY) ?? "0", 10);
  if (!Number.isFinite(until) || until <= 0) {
    return 0;
  }
  const remaining = until - Date.now();
  if (remaining <= 0) {
    clearSpotifyRateLimitCooldown();
    return 0;
  }
  return remaining;
};

const normalizeSpotifyImportSession = (session: SpotifyImportSession): SpotifyImportSession => {
  const savedTracksComplete =
    session.savedTracksComplete ??
    (session.savedTracksNext === null &&
      session.savedItems.length > 0 &&
      (session.phase !== "saved-tracks" ||
        session.playlists.length > 0 ||
        session.playlistsListLoaded === true));

  const playlistsListLoaded =
    session.playlistsListLoaded ??
    (session.playlistsNext === null &&
      session.readablePlaylistIds.length > 0 &&
      session.phase !== "saved-tracks" &&
      session.phase !== "playlists");

  return {
    ...session,
    savedTracksComplete,
    playlistsListLoaded,
    savedTracksNext: savedTracksComplete ? null : session.savedTracksNext,
    playlistsNext: playlistsListLoaded ? null : session.playlistsNext,
    readablePlaylistIds: session.readablePlaylistIds ?? [],
    playlistItemsByPlaylistId: session.playlistItemsByPlaylistId ?? {},
    completedPlaylistIds: session.completedPlaylistIds ?? [],
    activePlaylistId: session.activePlaylistId ?? null,
    activePlaylistItems: session.activePlaylistItems ?? [],
    activePlaylistNext: session.activePlaylistNext ?? null,
  };
};

const loadLegacyLocalStorageSession = (): SpotifyImportSession | null => {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw) as SpotifyImportSession;
    if (parsed?.version !== 1 || !parsed.contributor?.id) {
      return null;
    }
    return normalizeSpotifyImportSession(parsed);
  } catch {
    return null;
  }
};

export const loadSpotifyImportSession = async (): Promise<SpotifyImportSession | null> => {
  try {
    const fromIndexedDb = await loadImportSessionFromIndexedDb();
    if (fromIndexedDb?.version === 1 && fromIndexedDb.contributor?.id) {
      const session = repairImportSession(normalizeSpotifyImportSession(fromIndexedDb));
      saveSpotifyImportHint(session);
      return session;
    }
  } catch {
    // Fall back to legacy localStorage below.
  }

  const legacy = loadLegacyLocalStorageSession();
  if (legacy) {
    const session = repairImportSession(legacy);
    saveSpotifyImportHint(session);
    try {
      await saveImportSessionToIndexedDb(session);
    } catch {
      // IndexedDB may be unavailable; legacy session still works for this run.
    }
    return session;
  }
  return legacy;
};

export const saveSpotifyImportSession = async (session: SpotifyImportSession): Promise<void> => {
  const payload = {
    ...session,
    updatedAt: new Date().toISOString(),
  };
  saveSpotifyImportHint(payload);
  try {
    await saveImportSessionToIndexedDb(payload);
  } catch {
    // IndexedDB failed; try legacy localStorage as a last resort.
  }
  try {
    localStorage.setItem(SESSION_KEY, JSON.stringify(payload));
  } catch {
    // Full session can exceed localStorage quota on very large libraries.
  }
};

export const clearSpotifyImportSession = async (): Promise<void> => {
  localStorage.removeItem(SESSION_KEY);
  localStorage.removeItem(HINT_KEY);
  try {
    await clearImportSessionFromIndexedDb();
  } catch {
    // Ignore IndexedDB cleanup failures.
  }
};

const repairImportSession = (session: SpotifyImportSession): SpotifyImportSession => {
  if (session.savedTracksComplete && session.savedItems.length === 0) {
    return {
      ...session,
      savedTracksComplete: false,
      savedTracksNext: null,
      phase: "saved-tracks",
    };
  }
  if (
    session.playlistsListLoaded &&
    session.playlists.length === 0 &&
    session.readablePlaylistIds.length === 0 &&
    session.completedPlaylistIds.length === 0
  ) {
    return {
      ...session,
      playlistsListLoaded: false,
      playlistsNext: null,
      phase: session.savedTracksComplete ? "playlists" : "saved-tracks",
    };
  }
  return session;
};

export const hasResumableSpotifyImport = (contributorId?: string): boolean => {
  const hint = loadSpotifyImportHint();
  if (hint) {
    if (contributorId && hint.contributorId !== contributorId) {
      return false;
    }
    return hint.resumable;
  }
  return Boolean(localStorage.getItem(SESSION_KEY));
};

export const getSpotifyImportResumeLabel = (): string | null => {
  const hint = loadSpotifyImportHint();
  if (hint?.resumable) {
    return hint.label;
  }
  if (localStorage.getItem(SESSION_KEY)) {
    return "Resume library import";
  }
  return null;
};

export const computeSpotifyImportPercent = (session: SpotifyImportSession): number => {
  if (!session.savedTracksComplete) {
    const pageNumber = Math.max(1, Math.ceil(session.savedItems.length / 50) || 1);
    const span = 22;
    const progress = 1 - 1 / (1 + pageNumber / 12);
    return Math.min(24, 3 + span * progress);
  }
  if (!session.playlistsListLoaded) {
    const pageNumber = Math.max(1, Math.ceil(session.playlists.length / 50) || 1);
    const span = 5;
    const progress = 1 - 1 / (1 + pageNumber / 12);
    return Math.min(29, 25 + span * progress);
  }
  if (session.completedPlaylistIds.length < session.readablePlaylistIds.length) {
    const total = Math.max(1, session.readablePlaylistIds.length);
    const done = session.completedPlaylistIds.length;
    return 30 + (done / total) * 58;
  }
  return 88;
};

export class SpotifyImportRateLimitError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SpotifyImportRateLimitError";
  }
}

export class SpotifyImportPausedError extends Error {
  readonly percent: number;

  constructor(message: string, percent: number) {
    super(message);
    this.name = "SpotifyImportPausedError";
    this.percent = percent;
  }
}
