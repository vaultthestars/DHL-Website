import { beginSpotifyAuth } from "../spotifyPkce";
import { ConnectionStatus, CuePlaylistResult, LoadedLibrary, MusicProvider } from "../musicProvider";

const fetchJson = async <T>(url: string, init?: RequestInit): Promise<T> => {
  const response = await fetch(url, {
    credentials: "include",
    ...init,
  });
  if (!response.ok) {
    const payload = (await response.json().catch(() => ({}))) as { error?: string };
    throw new Error(payload.error ?? `Request failed (${response.status}).`);
  }
  return (await response.json()) as T;
};

export const spotifyProvider: MusicProvider = {
  id: "spotify",
  displayName: "Spotify",
  supportsLibraryFileImport: false,
  supportsPlaybackTracking: true,

  async getConnectionStatus(): Promise<ConnectionStatus> {
    return fetchJson<ConnectionStatus>("/api/spotify/status");
  },

  async connect() {
    const { authorizeUrl } = await beginSpotifyAuth();
    window.location.assign(authorizeUrl);
  },

  async disconnect() {
    await fetchJson("/api/spotify/disconnect", { method: "POST" });
  },

  async loadLibrary(): Promise<LoadedLibrary> {
    return fetchJson<LoadedLibrary>("/api/spotify/library");
  },

  async validateTracks(songs) {
    const payload = await fetchJson<{ availability: Record<string, boolean> }>("/api/spotify/validate-tracks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ trackIds: songs.map((song) => song.id) }),
    });
    return payload.availability ?? {};
  },

  async playCue(songs) {
    return fetchJson<CuePlaylistResult>("/api/spotify/play-cue", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ trackIds: songs.map((song) => song.id) }),
    });
  },

  async savePlaylist(songs, playlistName) {
    return fetchJson<CuePlaylistResult>("/api/spotify/save-playlist", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        trackIds: songs.map((song) => song.id),
        playlistName: playlistName.trim(),
      }),
    });
  },

  async getPlaybackState(): Promise<PlaybackState | null> {
    const payload = await fetchJson<PlaybackState | { title?: string }>("/api/spotify/playback-state");
    if (!payload || !("title" in payload) || !payload.title) {
      return null;
    }
    return payload as PlaybackState;
  },
};

export const isSpotifySong = (song: Song): boolean => /^[A-Za-z0-9]{22}$/.test(song.id);
