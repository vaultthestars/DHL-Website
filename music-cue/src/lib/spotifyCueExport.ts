import type { Song } from "./types";

export const SPOTIFY_NOW_PLAYING_PLAYLIST_NAME = "Music Cue — Now Playing";

export type SpotifyCueTrack = {
  trackId: string;
  artist: string;
  title: string;
};

export const isSpotifyTrackId = (songId: string): boolean => /^[A-Za-z0-9]{22}$/.test(songId);

export const toSpotifyTrackUri = (trackId: string): string => `spotify:track:${trackId}`;

export const toSpotifyTrackUrl = (trackId: string): string => `https://open.spotify.com/track/${trackId}`;

export const toSpotifyCueTracks = (songs: Song[]): SpotifyCueTrack[] =>
  songs
    .filter((song) => isSpotifyTrackId(song.id))
    .map((song) => ({
      trackId: song.id,
      artist: song.artist,
      title: song.title,
    }));

const escapeCsv = (value: string): string => value.replace(/"/g, '""');

export const buildSpotifyCueLinksText = (songs: Song[]): string => {
  const tracks = toSpotifyCueTracks(songs);
  if (tracks.length === 0) {
    return "";
  }
  return tracks
    .map((track) => `${track.artist} — ${track.title}\n${toSpotifyTrackUrl(track.trackId)}`)
    .join("\n\n");
};

export const buildSpotifyCueUrlList = (songs: Song[]): string =>
  toSpotifyCueTracks(songs)
    .map((track) => toSpotifyTrackUrl(track.trackId))
    .join("\n");

export const buildSpotifyCueCsv = (songs: Song[]): string => {
  const tracks = toSpotifyCueTracks(songs);
  const header = "Track URI,Track Name,Artist Name";
  const rows = tracks.map(
    (track) =>
      `"${toSpotifyTrackUri(track.trackId)}","${escapeCsv(track.title)}","${escapeCsv(track.artist)}"`
  );
  return [header, ...rows].join("\n");
};

const escapeAppleScriptString = (value: string): string =>
  value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');

export const buildPlaySpotifyCueScript = (songs: Song[]): string => {
  const tracks = toSpotifyCueTracks(songs);
  if (tracks.length === 0) {
    return "";
  }

  const uriLines = tracks
    .map((track) => `  set end of cueUris to "${escapeAppleScriptString(toSpotifyTrackUri(track.trackId))}"`)
    .join("\n");

  return `tell application "Spotify"
  activate
  set cueUris to {}
${uriLines}
  play track (item 1 of cueUris)
  return (count of cueUris) as text
end tell`;
};

export const wrapTerminalAppleScriptCommand = (script: string): string =>
  `osascript <<'APPLESCRIPT'\n${script}\nAPPLESCRIPT`;

export const buildTerminalPlaySpotifyCueCommand = (songs: Song[]): string =>
  wrapTerminalAppleScriptCommand(buildPlaySpotifyCueScript(songs));

export const buildSpotifyImportInstructions = (trackCount: number): string =>
  [
    `Music Cue — ${trackCount} track${trackCount === 1 ? "" : "s"}`,
    "",
    "Import into your Spotify account:",
    "1. Copy the track links below (or download this file).",
    "2. Open https://www.tunemymusic.com/transfer",
    "3. Choose Spotify → Spotify (or “Free text” / “Other”).",
    "4. Paste the links and transfer to your account.",
    "5. Play the new playlist in Spotify.",
    "",
    "On a Mac with the Spotify desktop app, you can also paste the Terminal play command from Music Cue to start the first track.",
    "",
    "--- Track links ---",
    "",
  ].join("\n");

export const buildSpotifyCueDownloadText = (songs: Song[]): string => {
  const tracks = toSpotifyCueTracks(songs);
  const links = tracks.map((track) => toSpotifyTrackUrl(track.trackId)).join("\n");
  return `${buildSpotifyImportInstructions(tracks.length)}${links}\n`;
};
