import type {
  SpotifyPlaylistItem,
  SpotifyPlaylistSummary,
  SpotifySavedTrackItem,
} from "../../shared/spotifyLibraryAssembly";

const SESSION_KEY = "music-cue-spotify-import-session";

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

export const loadSpotifyImportSession = (): SpotifyImportSession | null => {
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

export const saveSpotifyImportSession = (session: SpotifyImportSession): void => {
  localStorage.setItem(
    SESSION_KEY,
    JSON.stringify({
      ...session,
      updatedAt: new Date().toISOString(),
    })
  );
};

export const clearSpotifyImportSession = (): void => {
  localStorage.removeItem(SESSION_KEY);
};

export const hasResumableSpotifyImport = (contributorId?: string): boolean => {
  const session = loadSpotifyImportSession();
  if (!session) {
    return false;
  }
  if (contributorId && session.contributor.id !== contributorId) {
    return false;
  }
  if (!session.savedTracksComplete) {
    return true;
  }
  if (!session.playlistsListLoaded) {
    return true;
  }
  return session.completedPlaylistIds.length < session.readablePlaylistIds.length;
};

export const getSpotifyImportResumeLabel = (): string | null => {
  const session = loadSpotifyImportSession();
  if (!session) {
    return null;
  }
  const trackEstimate = session.savedItems.length;
  if (session.phase === "saved-tracks") {
    return `Resume saved tracks (${trackEstimate.toLocaleString()} loaded)`;
  }
  if (session.phase === "playlists") {
    return `Resume playlist list (${session.playlists.length} playlists, ${trackEstimate.toLocaleString()} tracks)`;
  }
  if (session.phase === "playlist-tracks") {
    return `Resume playlists (${session.completedPlaylistIds.length}/${session.readablePlaylistIds.length} done)`;
  }
  return "Resume library import";
};

export class SpotifyImportRateLimitError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SpotifyImportRateLimitError";
  }
}
