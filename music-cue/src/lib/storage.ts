import bundledClusterLayout from "../data/cluster-layout.json";
import type { LibraryScopeMode } from "./libraryScope";

export type ClusterLayoutScope = LibraryScopeMode | "custom";
import { MusicServiceId } from "./musicProvider";
import {
  ClusterCenterOverrides,
  CueBuildMode,
  LayoutConfig,
  LibraryStats,
  NormalizedPoint,
  Song,
} from "./types";
import { defaultLayoutConfig, migrateLegacyLayoutMode } from "./layoutMetrics";
import { isWebDeployment } from "./runtime";

const MUSIC_SERVICE_KEY = "music-cue-music-service";
const libraryKey = (serviceId: MusicServiceId): string => `music-cue-library-${serviceId}`;
const statsKey = (serviceId: MusicServiceId): string => `music-cue-library-stats-${serviceId}`;
const CUSTOM_LAYOUT_KEY = "music-cue-custom-layout";
const GENRE_CLUSTER_LAYOUT_KEY = "music-cue-genre-cluster-layout";
const PLAYLIST_CLUSTER_LAYOUT_KEY = "music-cue-playlist-cluster-layout";

const genreClusterLayoutKey = (scope: ClusterLayoutScope): string =>
  `${GENRE_CLUSTER_LAYOUT_KEY}-${scope}`;
const playlistClusterLayoutKey = (scope: ClusterLayoutScope): string =>
  `${PLAYLIST_CLUSTER_LAYOUT_KEY}-${scope}`;
const LAYOUT_CONFIG_KEY = "music-cue-layout-config";
const LAYOUT_MODE_KEY = "music-cue-layout-mode";
const PATH_THRESHOLD_KEY = "music-cue-path-threshold";
const BUILD_MODE_KEY = "music-cue-build-mode";
export const DEFAULT_PATH_THRESHOLD = 60;

export const loadMusicService = (): MusicServiceId => {
  const stored = localStorage.getItem(MUSIC_SERVICE_KEY);
  if (stored === "spotify" || stored === "apple-music") {
    return stored;
  }
  return import.meta.env.VITE_APP_MODE === "web" ? "spotify" : "apple-music";
};

export const saveMusicService = (serviceId: MusicServiceId): void => {
  localStorage.setItem(MUSIC_SERVICE_KEY, serviceId);
};

export const loadLayoutConfig = (serviceId: MusicServiceId = loadMusicService()): LayoutConfig => {
  const storedConfig = localStorage.getItem(LAYOUT_CONFIG_KEY);
  if (storedConfig) {
    return migrateLegacyLayoutMode(storedConfig, serviceId);
  }
  return migrateLegacyLayoutMode(localStorage.getItem(LAYOUT_MODE_KEY), serviceId);
};

export const saveLayoutConfig = (config: LayoutConfig): void => {
  localStorage.setItem(LAYOUT_CONFIG_KEY, JSON.stringify(config));
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

const mergeClusterCenterMaps = (
  base: Record<string, NormalizedPoint>,
  overrides: Record<string, NormalizedPoint>
): Record<string, NormalizedPoint> => ({
  ...base,
  ...overrides,
});

const bundledClusterDefaults = (): ClusterCenterOverrides =>
  isWebDeployment
    ? {
        genre: bundledClusterLayout.genre,
        playlist: bundledClusterLayout.playlist,
      }
    : { genre: {}, playlist: {} };

export const loadClusterCenterOverrides = (scope: ClusterLayoutScope = "conglomerate"): ClusterCenterOverrides => {
  let genreStored = loadClusterCenterMap(genreClusterLayoutKey(scope));
  let playlistStored = loadClusterCenterMap(playlistClusterLayoutKey(scope));

  if (scope === "conglomerate") {
    if (Object.keys(genreStored).length === 0) {
      genreStored = loadClusterCenterMap(GENRE_CLUSTER_LAYOUT_KEY);
    }
    if (Object.keys(playlistStored).length === 0) {
      playlistStored = loadClusterCenterMap(PLAYLIST_CLUSTER_LAYOUT_KEY);
    }
  }

  const stored: ClusterCenterOverrides = {
    genre: genreStored,
    playlist: playlistStored,
  };
  const defaults = bundledClusterDefaults();
  return {
    genre: mergeClusterCenterMaps(defaults.genre, stored.genre),
    playlist: mergeClusterCenterMaps(defaults.playlist, stored.playlist),
  };
};

export const saveClusterCenterOverridesForScope = (
  scope: ClusterLayoutScope,
  overrides: ClusterCenterOverrides
): void => {
  localStorage.setItem(genreClusterLayoutKey(scope), JSON.stringify(overrides.genre));
  localStorage.setItem(playlistClusterLayoutKey(scope), JSON.stringify(overrides.playlist));
};

export const saveGenreClusterCenterOverrides = (
  positions: Record<string, NormalizedPoint>,
  scope: ClusterLayoutScope = "conglomerate"
): void => {
  localStorage.setItem(genreClusterLayoutKey(scope), JSON.stringify(positions));
};

export const savePlaylistClusterCenterOverrides = (
  positions: Record<string, NormalizedPoint>,
  scope: ClusterLayoutScope = "conglomerate"
): void => {
  localStorage.setItem(playlistClusterLayoutKey(scope), JSON.stringify(positions));
};

export const saveLibrary = (serviceId: MusicServiceId, songs: Song[], stats: LibraryStats): void => {
  localStorage.setItem(libraryKey(serviceId), JSON.stringify(songs));
  localStorage.setItem(statsKey(serviceId), JSON.stringify(stats));
};

export const loadLibrary = (
  serviceId: MusicServiceId
): { songs: Song[]; stats: LibraryStats | null } => {
  try {
    let songsRaw = localStorage.getItem(libraryKey(serviceId));
    let statsRaw = localStorage.getItem(statsKey(serviceId));
    if (!songsRaw && serviceId === "apple-music") {
      songsRaw = localStorage.getItem("music-cue-library");
      statsRaw = localStorage.getItem("music-cue-library-stats");
    }
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

export { defaultLayoutConfig };
