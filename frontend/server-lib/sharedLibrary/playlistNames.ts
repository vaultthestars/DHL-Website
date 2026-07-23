export const EXCLUDED_PLAYLIST_NAMES = new Set([
  "Library",
  "Music",
  "Downloaded",
  "every song in my library atm",
  "MusicCue — Now Playing",
  "MusicCue-Now Playing",
]);

export const isExcludedPlaylistName = (name: string): boolean => {
  if (!name) {
    return false;
  }
  if (EXCLUDED_PLAYLIST_NAMES.has(name)) {
    return true;
  }
  return name.startsWith("MusicCue-") || name.startsWith("MusicCue —");
};
