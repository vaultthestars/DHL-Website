import { ClusterCenterOverrides, CueBuildMode, LayoutMode, LibraryStats, NormalizedPoint, Song } from "./types";

const LIBRARY_KEY = "music-cue-library";
const STATS_KEY = "music-cue-library-stats";
const CUSTOM_LAYOUT_KEY = "music-cue-custom-layout";
const GENRE_CLUSTER_LAYOUT_KEY = "music-cue-genre-cluster-layout";
const PLAYLIST_CLUSTER_LAYOUT_KEY = "music-cue-playlist-cluster-layout";
const LAYOUT_MODE_KEY = "music-cue-layout-mode";
const PATH_THRESHOLD_KEY = "music-cue-path-threshold";
const BUILD_MODE_KEY = "music-cue-build-mode";
export const DEFAULT_PATH_THRESHOLD = 60;

export const loadLayoutMode = (): LayoutMode => {
  const stored = localStorage.getItem(LAYOUT_MODE_KEY);
  if (stored === "genre-year") {
    return "genre";
  }
  if (stored === "year-playcount") {
    return "plays";
  }
  if (stored === "year" || stored === "plays" || stored === "playlist" || stored === "genre") {
    return stored;
  }
  if (stored === "custom") {
    return "genre";
  }
  return "genre";
};

export const saveLayoutMode = (mode: LayoutMode): void => {
  localStorage.setItem(LAYOUT_MODE_KEY, mode);
};

export const loadPathThreshold = (): number => {
  const stored = Number(localStorage.getItem(PATH_THRESHOLD_KEY));
  if (!Number.isFinite(stored)) {
    return DEFAULT_PATH_THRESHOLD;
  }
  return Math.min(150, Math.max(20, stored));
};

export const savePathThreshold = (threshold: number): void => {
  localStorage.setItem(PATH_THRESHOLD_KEY, String(threshold));
};

export const loadBuildMode = (): CueBuildMode => {
  const stored = localStorage.getItem(BUILD_MODE_KEY);
  return stored === "manual" ? "manual" : "path";
};

export const saveBuildMode = (mode: CueBuildMode): void => {
  localStorage.setItem(BUILD_MODE_KEY, mode);
};

export const loadCustomPositions = (): Record<string, NormalizedPoint> => {
  try {
    const stored = localStorage.getItem(CUSTOM_LAYOUT_KEY);
    return stored ? (JSON.parse(stored) as Record<string, NormalizedPoint>) : {};
  } catch {
    return {};
  }
};

export const saveCustomPositions = (positions: Record<string, NormalizedPoint>): void => {
  localStorage.setItem(CUSTOM_LAYOUT_KEY, JSON.stringify(positions));
};

const loadClusterCenterMap = (key: string): Record<string, NormalizedPoint> => {
  try {
    const stored = localStorage.getItem(key);
    return stored ? (JSON.parse(stored) as Record<string, NormalizedPoint>) : {};
  } catch {
    return {};
  }
};

export const loadClusterCenterOverrides = (): ClusterCenterOverrides => ({
  genre: loadClusterCenterMap(GENRE_CLUSTER_LAYOUT_KEY),
  playlist: loadClusterCenterMap(PLAYLIST_CLUSTER_LAYOUT_KEY),
});

export const saveGenreClusterCenterOverrides = (positions: Record<string, NormalizedPoint>): void => {
  localStorage.setItem(GENRE_CLUSTER_LAYOUT_KEY, JSON.stringify(positions));
};

export const savePlaylistClusterCenterOverrides = (positions: Record<string, NormalizedPoint>): void => {
  localStorage.setItem(PLAYLIST_CLUSTER_LAYOUT_KEY, JSON.stringify(positions));
};

export const saveLibrary = (songs: Song[], stats: LibraryStats): void => {
  localStorage.setItem(LIBRARY_KEY, JSON.stringify(songs));
  localStorage.setItem(STATS_KEY, JSON.stringify(stats));
};

export const loadLibrary = (): { songs: Song[]; stats: LibraryStats | null } => {
  try {
    const songsRaw = localStorage.getItem(LIBRARY_KEY);
    const statsRaw = localStorage.getItem(STATS_KEY);
    if (!songsRaw) {
      return { songs: [], stats: null };
    }
    return {
      songs: (JSON.parse(songsRaw) as Song[]).map((song) => ({
        ...song,
        durationMs: song.durationMs ?? 0,
        playlists: song.playlists ?? [],
      })),
      stats: statsRaw ? (JSON.parse(statsRaw) as LibraryStats) : null,
    };
  } catch {
    return { songs: [], stats: null };
  }
};

export const exportCustomLayoutJson = (positions: Record<string, NormalizedPoint>): string =>
  JSON.stringify(positions, null, 2);
