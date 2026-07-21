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
};

export type ConnectionStatus = {
  connected: boolean;
  configured: boolean;
  message?: string;
  displayName?: string;
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
  loadLibrary?(): Promise<LoadedLibrary>;
  validateTracks(songs: Song[]): Promise<Record<string, boolean>>;
  playCue(songs: Song[]): Promise<CuePlaylistResult>;
  savePlaylist(songs: Song[], playlistName: string): Promise<CuePlaylistResult>;
  getPlaybackState(): Promise<PlaybackState | null>;
}
