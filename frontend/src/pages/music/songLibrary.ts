import songsData from "../../data/songs.json";
import { Song } from "./types";

const CUSTOM_SONGS_KEY = "music-cue-custom-songs";

const baseSongs = songsData as Song[];

const mergeLibraries = (base: Song[], custom: Song[]): Song[] => {
  const byVideoId = new Map<string, Song>();
  base.forEach((song) => byVideoId.set(song.youtubeVideoId, song));
  custom.forEach((song) => byVideoId.set(song.youtubeVideoId, song));
  return Array.from(byVideoId.values());
};

export const loadSongLibrary = (): Song[] => {
  try {
    const stored = localStorage.getItem(CUSTOM_SONGS_KEY);
    if (!stored) {
      return [...baseSongs];
    }
    const custom = JSON.parse(stored) as Song[];
    return mergeLibraries(baseSongs, custom);
  } catch {
    return [...baseSongs];
  }
};

export const loadCustomSongs = (): Song[] => {
  try {
    const stored = localStorage.getItem(CUSTOM_SONGS_KEY);
    if (!stored) {
      return [];
    }
    return JSON.parse(stored) as Song[];
  } catch {
    return [];
  }
};

export const saveCustomSongs = (customSongs: Song[]): void => {
  localStorage.setItem(CUSTOM_SONGS_KEY, JSON.stringify(customSongs, null, 2));
};

export const addCustomSongs = (incoming: Song[]): Song[] => {
  const customSongs = loadCustomSongs();
  const mergedCustom = mergeLibraries(customSongs, incoming);
  saveCustomSongs(mergedCustom);
  return mergeLibraries(baseSongs, mergedCustom);
};

export const exportSongLibraryJson = (library: Song[]): string =>
  JSON.stringify(library, null, 2);

export const getBaseSongs = (): Song[] => [...baseSongs];
