import { getRemoteJsonStore } from "./sharedLibraryRemoteStore.js";

const CACHE_PREFIX = "music-cue/artist-genres/by-id";

export type CachedArtistGenre = {
  genres: string[];
  updatedAt: string;
};

const cacheKey = (artistId: string): string => `${CACHE_PREFIX}/${artistId}.json`;

const readLocalGenreCache = (): Map<string, CachedArtistGenre> => {
  return new Map();
};

let localGenreCache: Map<string, CachedArtistGenre> | null = null;

const getLocalGenreCache = (): Map<string, CachedArtistGenre> => {
  if (!localGenreCache) {
    localGenreCache = readLocalGenreCache();
  }
  return localGenreCache;
};

export const getCachedArtistGenres = async (
  artistIds: string[]
): Promise<Record<string, string[]>> => {
  const uniqueIds = [...new Set(artistIds.filter((artistId) => artistId.trim()))];
  const genresByArtistId: Record<string, string[]> = {};
  if (uniqueIds.length === 0) {
    return genresByArtistId;
  }

  const remote = getRemoteJsonStore();
  if (!remote) {
    const local = getLocalGenreCache();
    uniqueIds.forEach((artistId) => {
      const cached = local.get(artistId);
      if (cached) {
        genresByArtistId[artistId] = cached.genres;
      }
    });
    return genresByArtistId;
  }

  await Promise.all(
    uniqueIds.map(async (artistId) => {
      const cached = await remote.readJson<CachedArtistGenre>(cacheKey(artistId));
      if (cached && Array.isArray(cached.genres)) {
        genresByArtistId[artistId] = cached.genres;
      }
    })
  );

  return genresByArtistId;
};

export const saveCachedArtistGenres = async (genresByArtistId: Record<string, string[]>): Promise<void> => {
  const entries = Object.entries(genresByArtistId);
  if (entries.length === 0) {
    return;
  }

  const updatedAt = new Date().toISOString();
  const remote = getRemoteJsonStore();
  if (!remote) {
    const local = getLocalGenreCache();
    entries.forEach(([artistId, genres]) => {
      local.set(artistId, { genres, updatedAt });
    });
    return;
  }

  await Promise.all(
    entries.map(([artistId, genres]) =>
      remote.writeJson(cacheKey(artistId), {
        genres,
        updatedAt,
      } satisfies CachedArtistGenre)
    )
  );
};
