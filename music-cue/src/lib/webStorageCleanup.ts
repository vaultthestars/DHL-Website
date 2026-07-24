const LEGACY_SPOTIFY_LIBRARY_KEY = "music-cue-library-spotify";
const LEGACY_SPOTIFY_STATS_KEY = "music-cue-library-stats-spotify";
const LEGACY_IMPORT_SESSION_KEY = "music-cue-spotify-import-session";

/** Drop oversized legacy Spotify blobs from localStorage (web builds use IndexedDB instead). */
export const reclaimSpotifyWebStorageQuota = (): void => {
  try {
    localStorage.removeItem(LEGACY_SPOTIFY_LIBRARY_KEY);
    localStorage.removeItem(LEGACY_SPOTIFY_STATS_KEY);
    localStorage.removeItem(LEGACY_IMPORT_SESSION_KEY);
    localStorage.removeItem("music-cue-library");
    localStorage.removeItem("music-cue-library-stats");
  } catch {
    // Ignore storage errors during cleanup.
  }
};
