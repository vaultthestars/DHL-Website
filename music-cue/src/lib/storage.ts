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
import { isWebDeployment, isLocalDesktopApp } from "./runtime";

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
const CUE_LENGTH_KEY = "music-cue-cue-length";
const BUILD_MODE_KEY = "music-cue-build-mode";
const GRAPH_TOOL_KEY = "music-cue-graph-tool";
const PLAYLIST_GRAPH_VIEW_KEY = "music-cue-playlist-graph-view";
export const DEFAULT_PATH_THRESHOLD = 60;
export const DEFAULT_CUE_LENGTH = 100;

export const loadMusicService = (): MusicServiceId => {
  const stored = localStorage.getItem(MUSIC_SERVICE_KEY);
  if (stored === "spotify" || stored === "apple-music") {
    return stored;
  }
  return isWebDeployment ? "spotify" : "apple-music";
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

export const loadCueLength = (): number => {
  const raw = localStorage.getItem(CUE_LENGTH_KEY);
  if (raw === null) {
    return DEFAULT_CUE_LENGTH;
  }
  const stored = Number(raw);
  if (!Number.isFinite(stored) || stored < 0) {
    return DEFAULT_CUE_LENGTH;
  }
  return Math.floor(stored);
};

export const saveCueLength = (cueLength: number): void => {
  localStorage.setItem(CUE_LENGTH_KEY, String(Math.max(0, Math.floor(cueLength))));
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

export const loadPlaylistGraphView = (): boolean =>
  localStorage.getItem(PLAYLIST_GRAPH_VIEW_KEY) === "1";

export const savePlaylistGraphView = (enabled: boolean): void => {
  localStorage.setItem(PLAYLIST_GRAPH_VIEW_KEY, enabled ? "1" : "0");
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

const bundledClusterDefaults = (): ClusterCenterOverrides => ({
  genre: bundledClusterLayout.genre ?? {},
  playlist: bundledClusterLayout.playlist ?? {},
  custom: {},
});

const emptyClusterOverrides = (): ClusterCenterOverrides => ({
  genre: {},
  playlist: {},
  custom: {},
});

export const loadBundledClusterCenterOverrides = (): ClusterCenterOverrides =>
  normalizeClusterCenterOverrides(bundledClusterDefaults());

export const normalizeClusterCenterOverrides = (
  overrides: Partial<ClusterCenterOverrides> | ClusterCenterOverrides
): ClusterCenterOverrides => {
  const clampPoint = (point: NormalizedPoint): NormalizedPoint => ({
    x: Math.min(1.25, Math.max(-0.25, point.x)),
    y: Math.min(1.25, Math.max(-0.25, point.y)),
  });
  const clampMap = (map: Record<string, NormalizedPoint>): Record<string, NormalizedPoint> =>
    Object.fromEntries(Object.entries(map).map(([key, point]) => [key, clampPoint(point)]));

  return {
    genre: clampMap(overrides.genre ?? {}),
    playlist: clampMap(overrides.playlist ?? {}),
    custom: clampMap(overrides.custom ?? {}),
  };
};

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

  // Desktop app used unsuffixed keys before layout scopes were added for the website.
  if (isLocalDesktopApp && scope === "isolate") {
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
  const merged = normalizeClusterCenterOverrides({
    genre: mergeClusterCenterMaps(defaults.genre, stored.genre),
    playlist: mergeClusterCenterMaps(defaults.playlist, stored.playlist),
    custom: mergeClusterCenterMaps(defaults.custom, stored.custom),
  });

  if (isLocalDesktopApp && scope === "isolate") {
    const defaultGenreCount = Object.keys(defaults.genre).length;
    const storedGenreCount = Object.keys(stored.genre).length;
    if (defaultGenreCount > 0 && storedGenreCount > 0 && storedGenreCount < defaultGenreCount * 0.5) {
      return normalizeClusterCenterOverrides({
        genre: { ...defaults.genre, ...stored.genre },
        playlist: { ...defaults.playlist, ...stored.playlist },
        custom: merged.custom,
      });
    }
  }

  return merged;
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
