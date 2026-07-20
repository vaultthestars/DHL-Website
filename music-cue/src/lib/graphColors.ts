import { LayoutMode, LibraryStats, Song } from "./types";

const NODE_SATURATION = 72;
const NODE_LIGHTNESS = 48;

const clamp01 = (value: number): number => Math.min(1, Math.max(0, value));

export const clusterHue = (index: number, clusterCount: number): number =>
  (index / Math.max(1, clusterCount)) * 300;

export const averageHue = (hues: number[]): number => {
  if (hues.length === 0) {
    return 0;
  }
  if (hues.length === 1) {
    return hues[0];
  }
  const radians = hues.map((hue) => (hue * Math.PI) / 180);
  const sinSum = radians.reduce((sum, radiansValue) => sum + Math.sin(radiansValue), 0);
  const cosSum = radians.reduce((sum, radiansValue) => sum + Math.cos(radiansValue), 0);
  const averaged = (Math.atan2(sinSum / hues.length, cosSum / hues.length) * 180) / Math.PI;
  return (averaged + 360) % 360;
};

export const hueToFill = (
  hue: number,
  saturation = NODE_SATURATION,
  lightness = NODE_LIGHTNESS,
  alpha = 1
): string => `hsl(${hue} ${saturation}% ${lightness}% / ${alpha})`;

export const valueToRainbowHue = (value: number, min: number, max: number): number => {
  const normalized = max === min ? 0 : clamp01((value - min) / (max - min));
  return normalized * 300;
};

const getGenreHue = (song: Song, stats: LibraryStats): number => {
  const genreIndex = Math.max(0, stats.genres.indexOf(song.genre));
  return clusterHue(genreIndex, stats.genres.length);
};

const getPlaylistHue = (song: Song, stats: LibraryStats): number => {
  const playlists = song.playlists ?? [];
  const playlistIds = stats.playlistIds ?? [];
  if (playlists.length === 0) {
    return 0;
  }
  const hues = playlists.map((playlistId) => {
    const playlistIndex = Math.max(0, playlistIds.indexOf(playlistId));
    return clusterHue(playlistIndex, playlistIds.length);
  });
  return averageHue(hues);
};

const getYearHue = (song: Song, stats: LibraryStats): number =>
  valueToRainbowHue(song.year, stats.minYear, stats.maxYear);

const getPlayCountHue = (song: Song, stats: LibraryStats): number => {
  const min = 0;
  const max = Math.log10(stats.maxPlayCount + 1);
  const value = Math.log10(song.playCount + 1);
  return valueToRainbowHue(value, min, max);
};

export const getSongNodeFill = (song: Song, layoutMode: LayoutMode, stats: LibraryStats): string => {
  let hue = 220;
  if (layoutMode === "year") {
    hue = getYearHue(song, stats);
  } else if (layoutMode === "plays") {
    hue = getPlayCountHue(song, stats);
  } else if (layoutMode === "playlist") {
    hue = getPlaylistHue(song, stats);
  } else {
    hue = getGenreHue(song, stats);
  }
  return hueToFill(hue);
};
