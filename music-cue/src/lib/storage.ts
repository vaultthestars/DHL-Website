import bundledClusterLayout from "../data/cluster-layout.json";
import type { LibraryScopeMode } from "./libraryScope";
import { defaultCustomClusterCatalog } from "./customClusters";

export type ClusterLayoutScope = LibraryScopeMode | "custom";
import { MusicServiceId } from "./musicProvider";
import { isMockContributorId } from "./libraryScope";
import {
  ClusterCenterOverrides,
  CueBuildMode,
  CustomClusterCatalog,
  GraphToolMode,
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
const CUSTOM_CLUSTER_LAYOUT_KEY = "music-cue-custom-cluster-layout";
const CUSTOM_CLUSTER_CATALOG_KEY = "music-cue-custom-cluster-catalog";

const genreClusterLayoutKey = (scope: ClusterLayoutScope): string =>
  `${GENRE_CLUSTER_LAYOUT_KEY}-${scope}`;
const playlistClusterLayoutKey = (scope: ClusterLayoutScope): string =>
  `${PLAYLIST_CLUSTER_LAYOUT_KEY}-${scope}`;
const customClusterLayoutKey = (scope: ClusterLayoutScope): string =>
  `${CUSTOM_CLUSTER_LAYOUT_KEY}-${scope}`;
const customClusterCatalogKey = (scope: ClusterLayoutScope): string =>
  `${CUSTOM_CLUSTER_CATALOG_KEY}-${scope}`;
const LAYOUT_CONFIG_KEY = "music-cue-layout-config";
const LAYOUT_MODE_KEY = "music-cue-layout-mode";
const PATH_THRESHOLD_KEY = "music-cue-path-threshold";
const BUILD_MODE_KEY = "music-cue-build-mode";
const GRAPH_TOOL_KEY = "music-cue-graph-tool";
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

export const loadGraphTool = (): GraphToolMode => {
  const stored = localStorage.getItem(GRAPH_TOOL_KEY);
  if (stored === "draw" || stored === "draw-cluster") {
    return stored;
  }
  return "navigate";
};

export const saveGraphTool = (tool: GraphToolMode): void => {
  localStorage.setItem(GRAPH_TOOL_KEY, tool);
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
        custom: {},
      }
    : { genre: {}, playlist: {}, custom: {} };

const emptyClusterOverrides = (): ClusterCenterOverrides => ({
  genre: {},
  playlist: {},
  custom: {},
});

export const loadBundledClusterCenterOverrides = (): ClusterCenterOverrides =>
  normalizeClusterCenterOverrides(bundledClusterDefaults());

export const normalizeClusterCenterOverrides = (
  overrides: Partial<ClusterCenterOverrides> | ClusterCenterOverrides
): ClusterCenterOverrides => ({
  genre: overrides.genre ?? {},
  playlist: overrides.playlist ?? {},
  custom: overrides.custom ?? {},
});

export const loadClusterCenterOverrides = (scope: ClusterLayoutScope = "isolate"): ClusterCenterOverrides => {
  let genreStored = loadClusterCenterMap(genreClusterLayoutKey(scope));
  let playlistStored = loadClusterCenterMap(playlistClusterLayoutKey(scope));
  let customStored = loadClusterCenterMap(customClusterLayoutKey(scope));

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
    custom: customStored,
  };
  const defaults = bundledClusterDefaults();
  return normalizeClusterCenterOverrides({
    genre: mergeClusterCenterMaps(defaults.genre, stored.genre),
    playlist: mergeClusterCenterMaps(defaults.playlist, stored.playlist),
    custom: mergeClusterCenterMaps(defaults.custom, stored.custom),
  });
};

export const saveClusterCenterOverridesForScope = (
  scope: ClusterLayoutScope,
  overrides: ClusterCenterOverrides
): void => {
  const normalized = normalizeClusterCenterOverrides(overrides);
  localStorage.setItem(genreClusterLayoutKey(scope), JSON.stringify(normalized.genre));
  localStorage.setItem(playlistClusterLayoutKey(scope), JSON.stringify(normalized.playlist));
  localStorage.setItem(customClusterLayoutKey(scope), JSON.stringify(normalized.custom));
};

export const saveGenreClusterCenterOverrides = (
  positions: Record<string, NormalizedPoint>,
  scope: ClusterLayoutScope = "isolate"
): void => {
  localStorage.setItem(genreClusterLayoutKey(scope), JSON.stringify(positions));
};

export const savePlaylistClusterCenterOverrides = (
  positions: Record<string, NormalizedPoint>,
  scope: ClusterLayoutScope = "isolate"
): void => {
  localStorage.setItem(playlistClusterLayoutKey(scope), JSON.stringify(positions));
};

export const saveCustomClusterCenterOverrides = (
  positions: Record<string, NormalizedPoint>,
  scope: ClusterLayoutScope = "isolate"
): void => {
  localStorage.setItem(customClusterLayoutKey(scope), JSON.stringify(positions));
};

const parseCustomClusterCatalog = (raw: string | null): CustomClusterCatalog => {
  if (!raw) {
    return defaultCustomClusterCatalog();
  }
  try {
    const parsed = JSON.parse(raw) as CustomClusterCatalog;
    if (!parsed || !Array.isArray(parsed.clusters)) {
      return defaultCustomClusterCatalog();
    }
    return parsed;
  } catch {
    return defaultCustomClusterCatalog();
  }
};

export const loadIsolateCustomClusterCatalogStore = (): Record<string, CustomClusterCatalog> => {
  try {
    const stored = localStorage.getItem(customClusterCatalogKey("isolate"));
    if (!stored) {
      return {};
    }
    const parsed = JSON.parse(stored) as Record<string, CustomClusterCatalog>;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
};

export const saveIsolateCustomClusterCatalogStore = (
  catalogs: Record<string, CustomClusterCatalog>
): void => {
  localStorage.setItem(customClusterCatalogKey("isolate"), JSON.stringify(catalogs));
};

export const loadCustomClusterCatalogForScope = (
  scope: ClusterLayoutScope,
  ownerId?: string | null
): CustomClusterCatalog => {
  if (scope === "conglomerate") {
    return parseCustomClusterCatalog(localStorage.getItem(customClusterCatalogKey("conglomerate")));
  }
  if (!ownerId) {
    return defaultCustomClusterCatalog();
  }
  const store = loadIsolateCustomClusterCatalogStore();
  return store[ownerId] ?? defaultCustomClusterCatalog();
};

export const saveCustomClusterCatalogForScope = (
  scope: ClusterLayoutScope,
  catalog: CustomClusterCatalog,
  ownerId?: string | null
): void => {
  if (scope === "conglomerate") {
    localStorage.setItem(customClusterCatalogKey("conglomerate"), JSON.stringify(catalog));
    return;
  }
  if (!ownerId) {
    return;
  }
  const store = loadIsolateCustomClusterCatalogStore();
  store[ownerId] = catalog;
  saveIsolateCustomClusterCatalogStore(store);
};

export const loadCustomClusterCatalogState = (): {
  conglomerate: CustomClusterCatalog;
  isolateByOwner: Record<string, CustomClusterCatalog>;
} => ({
  conglomerate: loadCustomClusterCatalogForScope("conglomerate"),
  isolateByOwner: loadIsolateCustomClusterCatalogStore(),
});

export { emptyClusterOverrides };

export const saveLibrary = (serviceId: MusicServiceId, songs: Song[], stats: LibraryStats): void => {
  localStorage.setItem(libraryKey(serviceId), JSON.stringify(songs));
  localStorage.setItem(statsKey(serviceId), JSON.stringify(stats));
};

export const clearStoredLibrary = (serviceId: MusicServiceId): void => {
  localStorage.removeItem(libraryKey(serviceId));
  localStorage.removeItem(statsKey(serviceId));
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

/** Load a cached personal Spotify library, discarding any legacy mock/shared snapshot data. */
export const loadPersonalSpotifyLibrary = (): { songs: Song[]; stats: LibraryStats | null } => {
  const library = loadLibrary("spotify");
  const hasMockOwners = library.songs.some((song) =>
    (song.owners ?? []).some((owner) => isMockContributorId(owner.id))
  );
  if (hasMockOwners) {
    clearStoredLibrary("spotify");
    return { songs: [], stats: null };
  }
  return library;
};

export const exportCustomLayoutJson = (positions: Record<string, NormalizedPoint>): string =>
  JSON.stringify(positions, null, 2);

export { defaultLayoutConfig };
