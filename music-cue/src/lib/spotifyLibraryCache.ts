import type { LibraryStats, Song } from "./types";
import { getSongPlaylists, normalizeLibraryStatsFields } from "./arrayUtils";

const DB_NAME = "music-cue-spotify-library";
const DB_VERSION = 1;
const LIBRARY_STORE = "library";
const LIBRARY_KEY = "personal";

type CachedSpotifyLibrary = {
  songs: Song[];
  stats: LibraryStats;
  cachedAt: string;
};

const openLibraryDb = (): Promise<IDBDatabase> =>
  new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onerror = () => reject(request.error ?? new Error("Could not open Spotify library cache."));
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(LIBRARY_STORE)) {
        db.createObjectStore(LIBRARY_STORE);
      }
    };
    request.onsuccess = () => resolve(request.result);
  });

export const saveCachedSpotifyLibrary = async (
  songs: Song[],
  stats: LibraryStats
): Promise<void> => {
  const db = await openLibraryDb();
  const payload: CachedSpotifyLibrary = {
    songs,
    stats,
    cachedAt: new Date().toISOString(),
  };
  await new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(LIBRARY_STORE, "readwrite");
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error("Could not save Spotify library cache."));
    transaction.objectStore(LIBRARY_STORE).put(payload, LIBRARY_KEY);
  });
  db.close();
};

export const loadCachedSpotifyLibrary = async (): Promise<{
  songs: Song[];
  stats: LibraryStats | null;
} | null> => {
  const db = await openLibraryDb();
  const cached = await new Promise<CachedSpotifyLibrary | null>((resolve, reject) => {
    const transaction = db.transaction(LIBRARY_STORE, "readonly");
    transaction.onerror = () => reject(transaction.error ?? new Error("Could not load Spotify library cache."));
    const request = transaction.objectStore(LIBRARY_STORE).get(LIBRARY_KEY);
    request.onsuccess = () => resolve((request.result as CachedSpotifyLibrary | undefined) ?? null);
    request.onerror = () => reject(request.error ?? new Error("Could not load Spotify library cache."));
  });
  db.close();
  if (!cached?.songs?.length) {
    return null;
  }
  return {
    songs: cached.songs.map((song) => ({
      ...song,
      durationMs: song.durationMs ?? 0,
      playlists: getSongPlaylists(song),
    })),
    stats: cached.stats ? normalizeLibraryStatsFields(cached.stats) : null,
  };
};

export const clearCachedSpotifyLibrary = async (): Promise<void> => {
  const db = await openLibraryDb();
  await new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(LIBRARY_STORE, "readwrite");
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error("Could not clear Spotify library cache."));
    transaction.objectStore(LIBRARY_STORE).delete(LIBRARY_KEY);
  });
  db.close();
};
