export const NOW_PLAYING_PLAYLIST_NAMES = [
  "MusicCue — Now Playing",
  "MusicCue-Now Playing",
  "Music Cue — Now Playing",
] as const;

export const EXCLUDED_PLAYLIST_NAMES = new Set([
  "Library",
  "Music",
  "Downloaded",
  "every song in my library atm",
  ...NOW_PLAYING_PLAYLIST_NAMES,
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

export const isNowPlayingPlaylistName = (name: string): boolean =>
  (NOW_PLAYING_PLAYLIST_NAMES as readonly string[]).includes(name);
