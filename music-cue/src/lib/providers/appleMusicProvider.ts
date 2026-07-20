import {
  ConnectionStatus,
  CuePlaylistResult,
  LoadedLibrary,
  MusicProvider,
} from "../musicProvider";
import { isWebDeployment } from "../runtime";
import { parseLibraryXml } from "../parseLibraryXml";

const toCueResult = (result: {
  playlistName: string;
  matchedCount: number;
  requestedCount: number;
  matchedPersistentIds: string[];
}): CuePlaylistResult => ({
  playlistName: result.playlistName,
  matchedCount: result.matchedCount,
  requestedCount: result.requestedCount,
  matchedTrackIds: result.matchedPersistentIds,
});

const desktopOnlyError = (): Error =>
  new Error("Apple Music playback requires the desktop Music Cue app on macOS. You can still import Library.xml to explore your library.");

export const appleMusicProvider: MusicProvider = {
  id: "apple-music",
  displayName: "Apple Music",
  supportsLibraryFileImport: true,
  supportsPlaybackTracking: !isWebDeployment,

  async getConnectionStatus(): Promise<ConnectionStatus> {
    if (isWebDeployment) {
      return {
        connected: false,
        configured: false,
        message: "Apple Music playback is desktop-only. Import Library.xml to explore your library in-browser.",
      };
    }
    const { pingMusicApp } = await import("../musicApi");
    try {
      const trackName = await pingMusicApp();
      return {
        connected: true,
        configured: true,
        message: trackName ? `Music.app is available (${trackName}).` : "Music.app is available.",
      };
    } catch (error) {
      return {
        connected: false,
        configured: true,
        message: error instanceof Error ? error.message : "Music.app is not available.",
      };
    }
  },

  async loadLibraryFromFile(file: File): Promise<LoadedLibrary> {
    const xml = await file.text();
    return parseLibraryXml(xml);
  },

  async validateTracks(songs) {
    if (isWebDeployment) {
      return Object.fromEntries(songs.map((song) => [song.id, true]));
    }
    const { validateTracksInMusicApp } = await import("../musicApi");
    return validateTracksInMusicApp(songs);
  },

  async playCue(songs) {
    if (isWebDeployment) {
      throw desktopOnlyError();
    }
    const { playCueInMusicApp } = await import("../musicApi");
    return toCueResult(await playCueInMusicApp(songs));
  },

  async savePlaylist(songs, playlistName) {
    if (isWebDeployment) {
      throw desktopOnlyError();
    }
    const { saveCuePlaylistInMusicApp } = await import("../musicApi");
    return toCueResult(await saveCuePlaylistInMusicApp(songs, playlistName));
  },

  async getPlaybackState() {
    if (isWebDeployment) {
      return null;
    }
    const { getPlaybackState } = await import("../musicApi");
    return getPlaybackState();
  },
};
