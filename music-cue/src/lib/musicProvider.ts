import { LibraryStats, PlaybackState, Song } from "./types";

export type MusicServiceId = "apple-music" | "spotify";

export type CuePlaylistResult = {
  playlistName: string;
  matchedCount: number;
  requestedCount: number;
  matchedTrackIds: string[];
};

export type LoadedLibrary = {
  songs: Song[];
  stats: LibraryStats;
  playlistOwners?: Record<string, string>;
  contributor?: { id: string; name: string };
};

export type LibraryLoadPhase =
  | "profile"
  | "saved-tracks"
  | "playlists"
  | "playlist-tracks"
  | "genres"
  | "assembling";

export type LibraryLoadProgress = {
  phase: LibraryLoadPhase;
  message: string;
  percent: number;
};

export type LoadLibraryOptions = {
  onProgress?: (progress: LibraryLoadProgress) => void;
  fresh?: boolean;
  knownContributor?: { id: string; name: string };
};

export type ConnectionStatus = {
  connected: boolean;
  configured: boolean;
  message?: string;
  displayName?: string;
  userId?: string;
};

export interface MusicProvider {
  id: MusicServiceId;
  displayName: string;
  supportsLibraryFileImport: boolean;
  supportsPlaybackTracking: boolean;
  getConnectionStatus(): Promise<ConnectionStatus>;
  connect?(): Promise<void>;
  disconnect?(): Promise<void>;
  loadLibraryFromFile?(file: File): Promise<LoadedLibrary>;
  loadLibrary?(options?: LoadLibraryOptions): Promise<LoadedLibrary>;
  validateTracks(songs: Song[]): Promise<Record<string, boolean>>;
  playCue(songs: Song[]): Promise<CuePlaylistResult>;
  savePlaylist(songs: Song[], playlistName: string): Promise<CuePlaylistResult>;
  getPlaybackState(): Promise<PlaybackState | null>;
}
