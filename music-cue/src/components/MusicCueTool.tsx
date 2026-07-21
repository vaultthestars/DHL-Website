import { startTransition, useCallback, useDeferredValue, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { buildClusterRegions, buildIsolateScopedClusterRegions, buildOwnerMetaRegions, ClusterRegion } from "../lib/clusterRegions";
import { syncClusterLayoutToServer } from "../lib/clusterLayoutSync";
import {
  fromNormalizedPosition,
  getIsolateOwnerBoundsForLayout,
  getLayoutAxisLabels,
  GraphDimensions,
  layoutSongPosition,
  toNormalizedPosition,
} from "../lib/graphLayout";
import { invalidatePlaylistOverlapLayoutCache } from "../lib/playlistOverlapLayout";
import { UNASSIGNED_PLAYLIST_CLUSTER_ID, EXCLUDED_PLAYLIST_NAMES } from "../lib/playlistConstants";
import { applyPlaybackAdvance } from "../lib/cuePlaybackTracking";
import { formatDuration, sumDuration } from "../lib/formatDuration";
import { getSongNodeFill } from "../lib/graphColors";
import { generateCueFromStroke, generateCueFromStrokes } from "../lib/pathGenerator";
import {
  buildTerminalPlayCueCommand,
  buildTerminalSavePlaylistCommand,
  CueTrack,
} from "../lib/appleMusicScript";
import {
  buildSpotifyCueCsv,
  buildSpotifyCueDownloadText,
  buildSpotifyCueUrlList,
  buildTerminalPlaySpotifyCueCommand,
  toSpotifyCueTracks,
} from "../lib/spotifyCueExport";
import { isWebDeployment, areMockUsersEnabled } from "../lib/runtime";
import {
  ClusterLayoutPublisher,
  CollaborativeLayoutProvider,
} from "../lib/collaborativeLayout";
import {
  CollaborativeCursorsOverlay,
  CollaborativeParticipantsPanel,
  CollaborativeSessionProvider,
  GraphCursorPublisherBridge,
  type CollaborativeViewSettings,
} from "../lib/collaborativeSession";
import { getMusicProvider } from "../lib/providers";
import {
  clearSpotifyImportSession,
  getSpotifyImportContributorHint,
  getSpotifyImportResumeLabel,
  hasResumableSpotifyImport,
  saveConnectedSpotifyUser,
  SpotifyImportRateLimitError,
} from "../lib/providers/spotifyProvider";
import type { LibraryLoadProgress } from "../lib/musicProvider";
import {
  DEFAULT_VIEW_TRANSFORM,
  MIN_ZOOM,
  screenToGraphPoint,
  toViewTransformString,
  ViewTransform,
  zoomAtPoint,
} from "../lib/graphView";
import {
  loadBuildMode,
  loadClusterCenterOverrides,
  loadCustomClusterCatalogState,
  loadGraphTool,
  loadLayoutConfig,
  loadLibrary,
  loadPersonalSpotifyLibrary,
  loadMusicService,
  loadPathThreshold,
  loadCustomPositions,
  saveCustomPositions,
  saveBuildMode,
  saveClusterCenterOverridesForScope,
  saveCustomClusterCatalogForScope,
  saveCustomClusterCenterOverrides,
  saveGenreClusterCenterOverrides,
  saveGraphTool,
  saveLayoutConfig,
  saveLibrary,
  saveMusicService,
  savePathThreshold,
  savePlaylistClusterCenterOverrides,
  type ClusterLayoutScope,
} from "../lib/storage";
import { getActiveClusterLayoutScope, getEffectiveLibraryScopeMode } from "../lib/clusterLayoutScope";
import { defaultCustomClusterCatalog } from "../lib/customClusters";
import {
  applyDraggedClusterMembershipPriority,
  createSquigglyClusterFromStroke,
  getSquigglyClusters,
  pruneInvalidSquigglyClusters,
  removeSquigglyCluster,
  renameSquigglyCluster,
  setSquigglyClusterHull,
  setSquigglyClusterColor,
  syncSongMembershipForPosition,
  translateSquigglyClusters,
} from "../lib/squigglyClusters";
import { findSquigglyClusterIdsAtPoint, isValidSquigglyHull, nextSquigglyClusterColor, simplifyPolygon } from "../lib/squigglyClusterGeometry";
import { SquigglyClusterLayer } from "./SquigglyClusterLayer";
import {
  getAxisMetricLabel,
  getAxisMetricsForService,
  getClusterModesForService,
  isClusterView,
  layoutConfigKey,
  migrateLegacyLayoutMode,
  normalizeLayoutConfigForService,
} from "../lib/layoutMetrics";
import {
  fetchAllMergedSharedLibrary,
  filterSongsForSongSpace,
  getAllContributorIds,
  listSharedContributors,
  disableMockUsersForWeb,
  loadMergedSharedLibrary,
  loadSongSpaceMode,
  loadLibraryScopeMode,
  publishSharedLibrary,
  resolveActiveContributorIds,
  resolveLocalContributorId,
  saveLocalContributorId,
  saveLibraryScopeMode,
  saveSongSpaceMode,
  toLoadedLibrary,
  type SongSpaceMode,
} from "../lib/sharedLibraryApi";
import type { LibraryScopeMode } from "../lib/libraryScope";
import type { LibraryContributor } from "../../shared/sharedLibrary";
import {
  AxisMetric,
  ClusterCenterOverrides,
  ClusterMode,
  CueBuildMode,
  CustomClusterCatalog,
  CustomClusterDefinition,
  GeneratedCue,
  GraphPoint,
  GraphToolMode,
  LayoutConfig,
  LibraryStats,
  NormalizedPoint,
  Song,
  ViewMode,
} from "../lib/types";
import {
  isClusterLayoutConfig,
  LARGE_LIBRARY_LAYOUT_SNAP_THRESHOLD,
  useLayoutTransition,
} from "../lib/useLayoutTransition";
import { useMetaClusterCenterTransition } from "../lib/useMetaClusterCenterTransition";
import {
  canonicalizeGeneratedCue,
  getCanonicalSongId,
  prepareGraphSongsForIsolate,
  resolveCanonicalSong,
} from "../lib/isolateScopeSongs";
import {
  displayNormalizedToSoloNormalized,
  getClusterDragDisplayNormalizedStart,
  getClusterOverridesForOwner,
  getIsolateOwnerIds,
  parseOwnerScopedRegionId,
  toOwnerScopedOverrideUpdates,
} from "../lib/isolateClusterLayout";
import { getEnabledOwnerMetaClusters, hasMultipleLibraryOwners } from "../lib/libraryScope";

const getGraphDimensions = (panel: HTMLDivElement | null): GraphDimensions => ({
  width: Math.max(320, panel?.clientWidth ?? 800),
  height: Math.max(280, panel?.clientHeight ?? 600),
});

const LIBRARY_VALIDATE_CHUNK = 80;
const META_BOUNDS_RECOMPUTE_DELAY_MS = 3000;

const getLocalPoint = (
  event: React.PointerEvent<Element>,
  svg: SVGSVGElement,
  contentGroup: SVGGElement | null
): GraphPoint => screenToGraphPoint(event.clientX, event.clientY, svg, contentGroup);

const DRAG_THRESHOLD = 10;
const LABEL_THRESHOLD = 250;
const CLUSTER_FADE_MS = 600;

const defaultExportPlaylistName = (): string => {
  const dateLabel = new Date().toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
  return `MusicCue ${dateLabel}`;
};

const resolveCueLayoutConfig = (cue: GeneratedCue, serviceId: MusicServiceId): LayoutConfig => {
  if (cue.layoutConfig) {
    return cue.layoutConfig;
  }
  if (cue.layoutMode) {
    return migrateLegacyLayoutMode(cue.layoutMode, serviceId);
  }
  return loadLayoutConfig(serviceId);
};

const toCueTracks = (songs: Song[]): CueTrack[] =>
  songs.map((song) => ({
    artist: song.artist,
    title: song.title,
    persistentId: song.id,
  }));

const copyTextToClipboard = async (text: string): Promise<void> => {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }
  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.style.position = "fixed";
  textarea.style.left = "-9999px";
  document.body.appendChild(textarea);
  textarea.select();
  document.execCommand("copy");
  document.body.removeChild(textarea);
};

const downloadTextFile = (filename: string, content: string): void => {
  const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
};

const DESKTOP_APP_STEPS = [
  "Download or clone the music-cue folder from this site's repo.",
  "Double-click Start Music Cue.command (macOS only).",
  "If prompted, install Node.js from nodejs.org, then try again.",
  "Music Cue opens in your browser with full Music.app play, export, and tracking.",
];

type BoxSelectRect = {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
};

const defaultStats = (): LibraryStats => ({
  minYear: 1970,
  maxYear: new Date().getFullYear(),
  genres: [],
  genreCounts: {},
  maxPlayCount: 1,
  playlistIds: [],
  playlistNames: {},
  playlistCounts: {},
});

const getSongPlaylists = (song: Song): string[] => song.playlists ?? [];

const filterExcludedPlaylists = (stats: LibraryStats): LibraryStats => {
  const playlistIds = (stats.playlistIds ?? []).filter(
    (playlistId) => !EXCLUDED_PLAYLIST_NAMES.has(stats.playlistNames?.[playlistId] ?? "")
  );
  const playlistNames: Record<string, string> = {};
  const playlistCounts: Record<string, number> = {};
  playlistIds.forEach((playlistId) => {
    playlistNames[playlistId] = stats.playlistNames?.[playlistId] ?? playlistId;
    playlistCounts[playlistId] = stats.playlistCounts?.[playlistId] ?? 0;
  });
  return { ...stats, playlistIds, playlistNames, playlistCounts };
};

const normalizeStats = (stats: LibraryStats | null, songs: Song[]): LibraryStats => {
  if (!stats) {
    return defaultStats();
  }
  const filteredStats = filterExcludedPlaylists(stats);
  const genreCounts =
    filteredStats.genreCounts ??
    songs.reduce<Record<string, number>>((counts, song) => {
      counts[song.genre] = (counts[song.genre] ?? 0) + 1;
      return counts;
    }, {});
  const playlistIds =
    filteredStats.playlistIds ??
    [...new Set(songs.flatMap((song) => getSongPlaylists(song)))].sort((left, right) =>
      (filteredStats.playlistNames?.[left] ?? left).localeCompare(filteredStats.playlistNames?.[right] ?? right)
    );
  const playlistCounts =
    filteredStats.playlistCounts ??
    songs.reduce<Record<string, number>>((counts, song) => {
      getSongPlaylists(song).forEach((playlistId) => {
        counts[playlistId] = (counts[playlistId] ?? 0) + 1;
      });
      return counts;
    }, {});
  return {
    ...defaultStats(),
    ...filteredStats,
    genreCounts,
    playlistIds,
    playlistNames: filteredStats.playlistNames ?? {},
    playlistCounts,
  };
};

const normalizeSong = (song: Song, stats: LibraryStats | null): Song => {
  const allowedPlaylistIds = new Set(stats?.playlistIds ?? []);
  return {
    ...song,
    durationMs: song.durationMs ?? 0,
    playlists: (song.playlists ?? []).filter((playlistId) => allowedPlaylistIds.has(playlistId)),
  };
};

const normalizeSongs = (librarySongs: Song[], stats: LibraryStats | null): Song[] =>
  librarySongs.map((song) => normalizeSong(song, stats));

export type MusicCueToolProps = {
  onWelcomeNameChange?: (name: string | null) => void;
};

export const MusicCueTool = ({ onWelcomeNameChange }: MusicCueToolProps = {}) => {
  const graphPanelRef = useRef<HTMLDivElement | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const contentGroupRef = useRef<SVGGElement | null>(null);
  const bgRectRef = useRef<SVGRectElement | null>(null);
  const strokeRef = useRef<NormalizedPoint[]>([]);
  const completedStrokesRef = useRef<NormalizedPoint[][]>([]);
  const pointerPositionsRef = useRef(new Map<number, { x: number; y: number }>());
  const pinchSessionRef = useRef<{
    startDistance: number;
    startScale: number;
    startPanX: number;
    startPanY: number;
    startMidX: number;
    startMidY: number;
  } | null>(null);
  const isDrawingRef = useRef(false);
  const guestMergeLoadRef = useRef<"idle" | "loading" | "done">("idle");
  const draggingClusterIdRef = useRef<string | null>(null);
  const publishClusterLayoutRef = useRef<(overrides: ClusterCenterOverrides) => void>(() => {});
  const setGraphCursorRef = useRef<(cursor: NormalizedPoint | null) => void>(() => {});
  const clusterDragSessionRef = useRef<{
    clusterIds: string[];
    startPositions: Record<string, NormalizedPoint>;
    anchorStart: NormalizedPoint;
    useDisplaySpace: boolean;
    bounds?: { centroid: GraphPoint };
    metaCenter?: GraphPoint;
  } | null>(null);
  const nodePointerStartRef = useRef<{ songId: string; clientX: number; clientY: number } | null>(null);
  const cueRef = useRef<GeneratedCue | null>(null);
  const songsRef = useRef<Song[]>([]);
  const playbackTrackingRef = useRef<{ persistentId: string | null; cueIndex: number }>({
    persistentId: null,
    cueIndex: -1,
  });
  const panSessionRef = useRef<{
    pointerId: number;
    clientX: number;
    clientY: number;
    panX: number;
    panY: number;
    graphStart: GraphPoint;
    shiftHeld: boolean;
    metaShiftHeld: boolean;
    boxEnd?: GraphPoint;
    mode: "pending" | "pan" | "draw" | "draw-cluster" | "box-select";
  } | null>(null);
  const viewTransformRef = useRef<ViewTransform>(DEFAULT_VIEW_TRANSFORM);
  const undoStackRef = useRef<
    Array<{
      cue: GeneratedCue | null;
      completedStrokes?: NormalizedPoint[][];
      action?: "stroke" | "node" | "manual";
    }>
  >([]);
  const handleUndoRef = useRef<() => void>(() => {});

  const initialMusicService = loadMusicService();
  const initialSongSpaceMode = loadSongSpaceMode();
  const initialLibrary =
    isWebDeployment && initialMusicService === "spotify"
      ? initialSongSpaceMode === "mine"
        ? loadPersonalSpotifyLibrary()
        : { songs: [], stats: null }
      : loadLibrary(initialMusicService);
  const initialSongs = normalizeSongs(initialLibrary.songs, initialLibrary.stats);
  const [musicService, setMusicService] = useState<MusicServiceId>(initialMusicService);
  const musicProvider = useMemo(() => getMusicProvider(musicService), [musicService]);
  const [spotifyStatus, setSpotifyStatus] = useState<{
    connected: boolean;
    configured: boolean;
    message?: string;
    displayName?: string;
    userId?: string;
  } | null>(null);
  const [spotifyUseLocalExport, setSpotifyUseLocalExport] = useState(false);
  const [sharedContributors, setSharedContributors] = useState<LibraryContributor[]>([]);
  const [songSpaceMode, setSongSpaceMode] = useState<SongSpaceMode>(() => loadSongSpaceMode());
  const [libraryScopeMode, setLibraryScopeMode] = useState<LibraryScopeMode>(() => loadLibraryScopeMode());
  const includeMockUsers = areMockUsersEnabled();
  const localContributorId = useMemo(
    () => resolveLocalContributorId(includeMockUsers, sharedContributors),
    [includeMockUsers, sharedContributors]
  );
  const isSpotifyGuest =
    isWebDeployment && musicService === "spotify" && spotifyStatus !== null && !spotifyStatus.connected;
  const isGuestViewOnly = isSpotifyGuest;
  const effectiveSongSpaceMode = useMemo(
    (): SongSpaceMode => (isSpotifyGuest ? "shared" : songSpaceMode),
    [isSpotifyGuest, songSpaceMode]
  );
  const activeLayoutScope = useMemo(
    () => getActiveClusterLayoutScope(effectiveSongSpaceMode, libraryScopeMode),
    [effectiveSongSpaceMode, libraryScopeMode]
  );
  const effectiveLibraryScopeMode = useMemo(
    () => getEffectiveLibraryScopeMode(effectiveSongSpaceMode, libraryScopeMode),
    [effectiveSongSpaceMode, libraryScopeMode]
  );
  const activeContributorIds = useMemo(
    () => resolveActiveContributorIds(effectiveSongSpaceMode, localContributorId, sharedContributors),
    [effectiveSongSpaceMode, localContributorId, sharedContributors]
  );
  const [sharedTrackCount, setSharedTrackCount] = useState(0);
  const [isLoadingSharedLibrary, setIsLoadingSharedLibrary] = useState(false);
  const [dimensions, setDimensions] = useState<GraphDimensions>(() => getGraphDimensions(null));
  const [viewTransform, setViewTransform] = useState<ViewTransform>(DEFAULT_VIEW_TRANSFORM);
  const [buildMode, setBuildMode] = useState<CueBuildMode>(() => loadBuildMode());
  const [graphTool, setGraphTool] = useState<GraphToolMode>(() => loadGraphTool());
  const [canUndo, setCanUndo] = useState(false);
  const [songs, setSongs] = useState<Song[]>(() => initialSongs);
  const [playlistOwners, setPlaylistOwners] = useState<Record<string, string>>({});
  const [stats, setStats] = useState<LibraryStats>(() => normalizeStats(initialLibrary.stats, initialSongs));
  const [layoutConfig, setLayoutConfig] = useState<LayoutConfig>(() => loadLayoutConfig(initialMusicService));
  const [clusterOverrides, setClusterOverrides] = useState<ClusterCenterOverrides>(() =>
    loadClusterCenterOverrides(getActiveClusterLayoutScope(loadSongSpaceMode(), loadLibraryScopeMode()))
  );
  const [customClusterCatalogState, setCustomClusterCatalogState] = useState(() => loadCustomClusterCatalogState());
  const reloadLayoutCaches = useCallback((scope: ClusterLayoutScope) => {
    setClusterOverrides(loadClusterCenterOverrides(scope));
    setCustomClusterCatalogState(loadCustomClusterCatalogState());
  }, []);

  const customCatalogForOwner = useCallback(
    (ownerId: string): CustomClusterCatalog => {
      if (activeLayoutScope === "conglomerate") {
        return customClusterCatalogState.conglomerate;
      }
      return customClusterCatalogState.isolateByOwner[ownerId] ?? defaultCustomClusterCatalog();
    },
    [activeLayoutScope, customClusterCatalogState]
  );

  const activeCustomCatalog = useMemo((): CustomClusterCatalog => {
    if (activeLayoutScope === "conglomerate") {
      return customClusterCatalogState.conglomerate;
    }
    if (!localContributorId) {
      return defaultCustomClusterCatalog();
    }
    return customClusterCatalogState.isolateByOwner[localContributorId] ?? defaultCustomClusterCatalog();
  }, [activeLayoutScope, customClusterCatalogState, localContributorId]);

  const layoutClusterOverrides = useMemo(() => {
    if (songSpaceMode === "mine" && localContributorId) {
      return getClusterOverridesForOwner(clusterOverrides, localContributorId, layoutConfig);
    }
    return clusterOverrides;
  }, [clusterOverrides, layoutConfig, localContributorId, songSpaceMode]);

  const persistCustomCatalog = useCallback(
    (catalog: CustomClusterCatalog, ownerId?: string | null) => {
      if (activeLayoutScope === "conglomerate") {
        setCustomClusterCatalogState((current) => ({ ...current, conglomerate: catalog }));
        saveCustomClusterCatalogForScope("conglomerate", catalog);
        return;
      }
      const resolvedOwnerId = ownerId ?? localContributorId;
      if (!resolvedOwnerId) {
        return;
      }
      setCustomClusterCatalogState((current) => ({
        ...current,
        isolateByOwner: { ...current.isolateByOwner, [resolvedOwnerId]: catalog },
      }));
      saveCustomClusterCatalogForScope("isolate", catalog, resolvedOwnerId);
    },
    [activeLayoutScope, localContributorId]
  );

  const resolveOverrideOwnerId = useCallback(
    (regionOwnerId: string | null): string | null => {
      if (regionOwnerId) {
        return regionOwnerId;
      }
      if (activeLayoutScope === "isolate" && localContributorId) {
        return localContributorId;
      }
      return null;
    },
    [activeLayoutScope, localContributorId]
  );
  const [pathThreshold, setPathThreshold] = useState(() => loadPathThreshold());
  const [completedStrokes, setCompletedStrokes] = useState<NormalizedPoint[][]>([]);
  const [activeStroke, setActiveStroke] = useState<NormalizedPoint[]>([]);
  const [strokeLayoutConfig, setStrokeLayoutConfig] = useState<LayoutConfig | null>(null);
  const [isDrawingNewPath, setIsDrawingNewPath] = useState(false);
  const [cue, setCue] = useState<GeneratedCue | null>(null);
  const [hoveredSongId, setHoveredSongId] = useState<string | null>(null);
  const [activePlaylistName, setActivePlaylistName] = useState<string | null>(null);
  const [activePersistentId, setActivePersistentId] = useState<string | null>(null);
  const [playbackTrackingEnabled, setPlaybackTrackingEnabled] = useState(false);
  const frozenIsolateBoundsRef = useRef<Map<string, { centroid: GraphPoint; radius: number }> | null>(null);
  const [isolateBoundsRevision, setIsolateBoundsRevision] = useState(0);
  const metaBoundsDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [fadingClusterSnapshot, setFadingClusterSnapshot] = useState<{
    id: number;
    regions: ClusterRegion[];
    opacity: number;
  } | null>(null);
  const [clusterRevealOpacity, setClusterRevealOpacity] = useState(1);
  const [clusterRevealFadeTrigger, setClusterRevealFadeTrigger] = useState(0);
  const clusterRevealFadeIdRef = useRef(0);
  const prevLayoutForClustersRef = useRef(layoutConfigKey(layoutConfig));
  const clusterFadeOutIdRef = useRef(0);
  const [selectedSongId, setSelectedSongId] = useState<string | null>(null);
  const [unavailableSongIds, setUnavailableSongIds] = useState<Set<string>>(() => new Set());
  const [isValidatingLibrary, setIsValidatingLibrary] = useState(false);
  const [statusMessage, setStatusMessage] = useState(() =>
    initialMusicService === "spotify"
      ? "Connect to Spotify and load your saved tracks to begin."
      : "Load your Apple Music Library.xml to begin."
  );
  const [genreFilter, setGenreFilter] = useState("");
  const [searchFilter, setSearchFilter] = useState("");
  const [minPlayCount, setMinPlayCount] = useState("0");
  const [exportDialogOpen, setExportDialogOpen] = useState(false);
  const [desktopHelpOpen, setDesktopHelpOpen] = useState(false);
  const [exportPlaylistName, setExportPlaylistName] = useState(() => defaultExportPlaylistName());
  const [isExportingPlaylist, setIsExportingPlaylist] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const isImportingRef = useRef(false);
  const [importProgress, setImportProgress] = useState<LibraryLoadProgress | null>(null);
  const [importResumeRevision, setImportResumeRevision] = useState(0);
  const [isPanning, setIsPanning] = useState(false);
  const [shiftHeld, setShiftHeld] = useState(false);
  const [boxSelectRect, setBoxSelectRect] = useState<BoxSelectRect | null>(null);
  const [selectedClusterIds, setSelectedClusterIds] = useState<Set<string>>(() => new Set());
  const clusterOverridesRef = useRef(clusterOverrides);
  const [squigglySongPositions, setSquigglySongPositions] = useState<Record<string, NormalizedPoint>>(() =>
    loadCustomPositions()
  );
  const squigglySongPositionsRef = useRef(squigglySongPositions);
  const [clusterDrawStroke, setClusterDrawStroke] = useState<NormalizedPoint[]>([]);
  const clusterDrawStrokeRef = useRef<NormalizedPoint[]>([]);
  const [squigglyHullPreview, setSquigglyHullPreview] = useState<Record<string, NormalizedPoint[]>>({});
  const [hoveredSquigglyClusterId, setHoveredSquigglyClusterId] = useState<string | null>(null);
  const [squigglyPenColor, setSquigglyPenColor] = useState(() => nextSquigglyClusterColor());
  const [clusterNameDraft, setClusterNameDraft] = useState("");
  const [redrawDraft, setRedrawDraft] = useState<{
    clusterId: string;
    previousHull: NormalizedPoint[];
    draftHull: NormalizedPoint[];
  } | null>(null);
  const redrawClusterIdRef = useRef<string | null>(null);
  const draggingSquigglyClusterRef = useRef<{
    clusterIds: string[];
    primaryClusterId: string;
    startHulls: Record<string, NormalizedPoint[]>;
    memberSongIds: string[];
    startSongPositions: Record<string, NormalizedPoint>;
    anchor: NormalizedPoint;
  } | null>(null);
  const pendingSquigglyClusterDragRef = useRef<{
    clusterIds: string[];
    primaryClusterId: string;
    startHulls: Record<string, NormalizedPoint[]>;
    memberSongIds: string[];
    startSongPositions: Record<string, NormalizedPoint>;
    anchor: NormalizedPoint;
    clientX: number;
    clientY: number;
    pointerId: number;
  } | null>(null);
  const draggingSongRef = useRef<{
    songId: string;
    start: NormalizedPoint;
    anchor: NormalizedPoint;
  } | null>(null);
  const pendingSongDragRef = useRef<{
    songId: string;
    start: NormalizedPoint;
    anchor: NormalizedPoint;
    clientX: number;
    clientY: number;
    pointerId: number;
  } | null>(null);

  const isSquigglyCustomMode =
    layoutConfig.viewMode === "cluster" && layoutConfig.clusterMode === "custom";
  const squigglyClusters = useMemo(
    () => getSquigglyClusters(activeCustomCatalog, dimensions),
    [activeCustomCatalog, dimensions]
  );
  const selectedSquigglyCluster = useMemo(() => {
    const selectedId = [...selectedClusterIds].find((id) =>
      squigglyClusters.some((cluster) => cluster.id === id)
    );
    return selectedId ? squigglyClusters.find((cluster) => cluster.id === selectedId) : undefined;
  }, [selectedClusterIds, squigglyClusters]);
  const showToolSidebar =
    graphTool === "draw" || (graphTool === "draw-cluster" && isSquigglyCustomMode);

  useEffect(() => {
    setClusterNameDraft(selectedSquigglyCluster?.label ?? "");
  }, [selectedSquigglyCluster?.id, selectedSquigglyCluster?.label]);

  useEffect(() => {
    if (dimensions.width <= 0 || dimensions.height <= 0) {
      return;
    }
    const pruned = pruneInvalidSquigglyClusters(activeCustomCatalog, dimensions);
    if (pruned.clusters.length === activeCustomCatalog.clusters.length) {
      return;
    }
    persistCustomCatalog(pruned);
    setSelectedClusterIds((current) => {
      const validIds = new Set(getSquigglyClusters(pruned, dimensions).map((cluster) => cluster.id));
      return new Set([...current].filter((id) => validIds.has(id)));
    });
    setStatusMessage("Removed invalid empty cluster.");
  }, [activeCustomCatalog, dimensions, persistCustomCatalog]);

  useEffect(() => {
    squigglySongPositionsRef.current = squigglySongPositions;
  }, [squigglySongPositions]);

  useEffect(() => {
    cueRef.current = cue;
  }, [cue]);

  useEffect(() => {
    clusterOverridesRef.current = clusterOverrides;
  }, [clusterOverrides]);

  useEffect(() => {
    if (isWebDeployment) {
      return;
    }
    const hasStoredLayout =
      localStorage.getItem("music-cue-genre-cluster-layout") ||
      localStorage.getItem("music-cue-playlist-cluster-layout");
    if (!hasStoredLayout) {
      return;
    }
    void syncClusterLayoutToServer(clusterOverridesRef.current);
  }, []);

  useEffect(() => {
    if (musicService !== "spotify") {
      setSpotifyStatus(null);
      return;
    }

    void musicProvider
      .getConnectionStatus()
      .then(setSpotifyStatus)
      .catch(() => {
        setSpotifyStatus({
          connected: false,
          configured: true,
          message: "Could not verify Spotify connection.",
        });
      });
  }, [musicProvider, musicService]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("spotify") === "connected" && musicService === "spotify") {
      setStatusMessage("Spotify connected. Load your library to begin.");
      window.history.replaceState({}, "", window.location.pathname);
      void musicProvider
        .getConnectionStatus()
        .then(setSpotifyStatus)
        .catch(() => {
          setSpotifyStatus({
            connected: false,
            configured: true,
            message: "Could not verify Spotify connection.",
          });
        });
    }
  }, [musicProvider, musicService]);

  useEffect(() => {
    if (!isWebDeployment) {
      return;
    }
    disableMockUsersForWeb();
  }, []);

  useEffect(() => {
    if (!onWelcomeNameChange) {
      return;
    }
    if (musicService === "spotify" && spotifyStatus?.connected) {
      onWelcomeNameChange(spotifyStatus.displayName?.trim() || null);
      return;
    }
    onWelcomeNameChange(null);
  }, [musicService, onWelcomeNameChange, spotifyStatus]);

  useEffect(() => {
    if (spotifyStatus?.connected) {
      return;
    }
    setSpotifyUseLocalExport(false);
  }, [spotifyStatus?.connected]);

  useEffect(() => {
    if (musicService !== "spotify" || !spotifyStatus?.connected || !spotifyStatus.userId) {
      return;
    }
    saveConnectedSpotifyUser({
      id: spotifyStatus.userId,
      name: spotifyStatus.displayName || "Spotify user",
    });
  }, [musicService, spotifyStatus]);

  const spotifyStatusLoading = musicService === "spotify" && spotifyStatus === null;
  const spotifyCanLoadLibrary = spotifyStatus?.connected === true;

  const spotifyImportResumeLabel = useMemo(() => {
    void importResumeRevision;
    if (musicService !== "spotify") {
      return null;
    }
    return hasResumableSpotifyImport() ? getSpotifyImportResumeLabel() : null;
  }, [importResumeRevision, musicService]);

  useEffect(() => {
    songsRef.current = songs;
  }, [songs]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Shift") {
        setShiftHeld(true);
        return;
      }

      const target = event.target;
      const isTyping =
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement;

      if (isTyping) {
        return;
      }

      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "z" && !event.shiftKey) {
        if ((buildMode === "manual" || graphTool === "draw") && undoStackRef.current.length > 0) {
          event.preventDefault();
          handleUndoRef.current();
        }
      }

      if (event.key === "Escape") {
        setSelectedClusterIds(new Set());
        setBoxSelectRect(null);
      }
    };
    const handleKeyUp = (event: KeyboardEvent) => {
      if (event.key === "Shift") {
        setShiftHeld(false);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
    };
  }, [buildMode, graphTool]);

  useEffect(() => {
    viewTransformRef.current = viewTransform;
  }, [viewTransform]);

  useEffect(() => {
    const panel = graphPanelRef.current;
    if (!panel) {
      return undefined;
    }

    const observer = new ResizeObserver(() => {
      setDimensions(getGraphDimensions(graphPanelRef.current));
    });
    observer.observe(panel);
    setDimensions(getGraphDimensions(panel));

    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const handleWheel = (event: WheelEvent) => {
      const panel = graphPanelRef.current;
      if (!panel || !(event.target instanceof Node) || !panel.contains(event.target)) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      const svg = svgRef.current;
      if (svg) {
        setViewTransform((current) => zoomAtPoint(current, event.clientX, event.clientY, svg, event.deltaY));
      }
    };

    document.addEventListener("wheel", handleWheel, { passive: false, capture: true });
    return () => document.removeEventListener("wheel", handleWheel, { capture: true });
  }, []);

  useEffect(() => {
    if (songs.length === 0) {
      setUnavailableSongIds(new Set());
      return undefined;
    }

    if (
      isWebDeployment &&
      musicService === "spotify" &&
      (!spotifyStatus?.connected || spotifyUseLocalExport)
    ) {
      setUnavailableSongIds(new Set());
      setIsValidatingLibrary(false);
      return undefined;
    }

    let cancelled = false;

    const validateLibrary = async () => {
      setIsValidatingLibrary(true);
      const unavailable = new Set<string>();

      for (let index = 0; index < songs.length; index += LIBRARY_VALIDATE_CHUNK) {
        if (cancelled) {
          return;
        }

        const chunk = songs.slice(index, index + LIBRARY_VALIDATE_CHUNK);
        try {
          const availability = await musicProvider.validateTracks(chunk);
          chunk.forEach((song) => {
            if (availability[song.id] === false) {
              unavailable.add(song.id);
            }
          });
          setUnavailableSongIds(new Set(unavailable));
        } catch {
          break;
        }
      }

      if (!cancelled) {
        setIsValidatingLibrary(false);
        if (unavailable.size > 0) {
          setStatusMessage(
            `${unavailable.size} tracks are unavailable in ${musicProvider.displayName} (shown in red).`
          );
        }
      }
    };

    void validateLibrary();

    return () => {
      cancelled = true;
    };
  }, [musicProvider, musicService, songs, spotifyStatus?.connected, spotifyUseLocalExport]);

  const songSpaceSongs = useMemo(
    () => filterSongsForSongSpace(songs, effectiveSongSpaceMode, localContributorId),
    [effectiveSongSpaceMode, localContributorId, songs]
  );

  const visibleSongs = useMemo(() => {
    const query = searchFilter.trim().toLowerCase();
    const minPlays = Number(minPlayCount) || 0;
    return songSpaceSongs.filter((song) => {
      if (musicService === "apple-music" && genreFilter && song.genre !== genreFilter) {
        return false;
      }
      if (musicService === "apple-music" && song.playCount < minPlays) {
        return false;
      }
      if (!query) {
        return true;
      }
      const haystack = `${song.title} ${song.artist} ${song.album} ${song.genre}`.toLowerCase();
      return haystack.includes(query);
    });
  }, [genreFilter, minPlayCount, musicService, searchFilter, songSpaceSongs]);

  const isolateGraphSongs = useCallback(
    (sourceSongs: Song[]) => {
      if (effectiveLibraryScopeMode !== "isolate" || !hasMultipleLibraryOwners(sourceSongs)) {
        return sourceSongs;
      }
      return prepareGraphSongsForIsolate(sourceSongs, activeContributorIds, playlistOwners);
    },
    [activeContributorIds, effectiveLibraryScopeMode, playlistOwners]
  );

  const graphSongs = useMemo(
    () => isolateGraphSongs(visibleSongs),
    [isolateGraphSongs, visibleSongs]
  );
  const deferredGraphSongs = useDeferredValue(graphSongs);

  const liveIsolateOwnerBounds = useMemo(() => {
    if (effectiveLibraryScopeMode !== "isolate" || !isClusterView(layoutConfig)) {
      return undefined;
    }
    return getIsolateOwnerBoundsForLayout(
      graphSongs,
      dimensions,
      layoutConfig,
      stats,
      clusterOverrides,
      activeContributorIds,
      customCatalogForOwner
    );
  }, [
    clusterOverrides,
    customCatalogForOwner,
    dimensions,
    activeContributorIds,
    graphSongs,
    layoutConfig,
    effectiveLibraryScopeMode,
    stats,
  ]);

  const isolateOwnerIds = useMemo(
    () =>
      effectiveLibraryScopeMode === "isolate"
        ? getIsolateOwnerIds(graphSongs, activeContributorIds)
        : [],
    [activeContributorIds, graphSongs, effectiveLibraryScopeMode]
  );
  const isolateOwnerCount = isolateOwnerIds.length;
  const skipIsolateCentroidTranslation = isolateOwnerCount <= 1;

  const clearFrozenIsolateBounds = useCallback(() => {
    frozenIsolateBoundsRef.current = null;
    if (metaBoundsDebounceRef.current) {
      clearTimeout(metaBoundsDebounceRef.current);
      metaBoundsDebounceRef.current = null;
    }
  }, []);

  const beginIsolateClusterDrag = useCallback(() => {
    if (skipIsolateCentroidTranslation || !liveIsolateOwnerBounds) {
      return;
    }
    if (metaBoundsDebounceRef.current) {
      clearTimeout(metaBoundsDebounceRef.current);
      metaBoundsDebounceRef.current = null;
    }
    if (!frozenIsolateBoundsRef.current) {
      frozenIsolateBoundsRef.current = liveIsolateOwnerBounds;
      setIsolateBoundsRevision((value) => value + 1);
    }
  }, [liveIsolateOwnerBounds, skipIsolateCentroidTranslation]);

  const isolateOwnerBounds = useMemo(() => {
    if (!liveIsolateOwnerBounds) {
      return undefined;
    }
    if (skipIsolateCentroidTranslation) {
      return liveIsolateOwnerBounds;
    }
    return frozenIsolateBoundsRef.current ?? liveIsolateOwnerBounds;
  }, [isolateBoundsRevision, liveIsolateOwnerBounds, skipIsolateCentroidTranslation]);

  const { getMetaClusterCenter, startMetaClusterCenterTransition } = useMetaClusterCenterTransition(
    graphSongs,
    dimensions,
    activeContributorIds,
    isolateOwnerBounds
  );

  const endIsolateClusterDrag = useCallback(() => {
    if (skipIsolateCentroidTranslation) {
      return;
    }
    if (metaBoundsDebounceRef.current) {
      clearTimeout(metaBoundsDebounceRef.current);
    }
    metaBoundsDebounceRef.current = setTimeout(() => {
      const frozenBounds = frozenIsolateBoundsRef.current;
      if (!frozenBounds) {
        return;
      }
      startMetaClusterCenterTransition(frozenBounds, () => {
        frozenIsolateBoundsRef.current = null;
        setIsolateBoundsRevision((value) => value + 1);
      });
      metaBoundsDebounceRef.current = null;
    }, META_BOUNDS_RECOMPUTE_DELAY_MS);
  }, [skipIsolateCentroidTranslation, startMetaClusterCenterTransition]);

  const computeLayoutPosition = useCallback(
    (
      song: Song,
      config: LayoutConfig,
      scopeMode: LibraryScopeMode = effectiveLibraryScopeMode,
      layoutSongs: Song[] = isolateGraphSongs(visibleSongs),
      ownerBounds = isolateOwnerBounds
    ): GraphPoint =>
      layoutSongPosition(song, dimensions, config, stats, isSquigglyCustomMode ? squigglySongPositions : {}, layoutClusterOverrides, layoutSongs, {
        libraryScopeMode: scopeMode,
        enabledOwnerIds: activeContributorIds,
        isolateOwnerBounds: ownerBounds,
        skipIsolateCentroidTranslation,
        metaClusterCenterForOwner: getMetaClusterCenter,
        customClusterCatalog: activeCustomCatalog,
        customCatalogForOwner,
      }),
    [
      activeContributorIds,
      activeCustomCatalog,
      customCatalogForOwner,
      dimensions,
      effectiveLibraryScopeMode,
      getMetaClusterCenter,
      isolateGraphSongs,
      isolateOwnerBounds,
      layoutClusterOverrides,
      skipIsolateCentroidTranslation,
      isSquigglyCustomMode,
      squigglySongPositions,
      stats,
      visibleSongs,
    ]
  );

  const clusterSnapshotInputsRef = useRef({
    graphSongs,
    visibleSongs,
    stats,
    dimensions,
    clusterOverrides,
    layoutClusterOverrides,
    computeLayoutPosition,
    libraryScopeMode: effectiveLibraryScopeMode,
    activeContributorIds,
    activeCustomCatalog,
    customCatalogForOwner,
  });
  clusterSnapshotInputsRef.current = {
    graphSongs,
    visibleSongs,
    stats,
    dimensions,
    clusterOverrides,
    layoutClusterOverrides,
    computeLayoutPosition,
    libraryScopeMode: effectiveLibraryScopeMode,
    activeContributorIds,
    activeCustomCatalog,
    customCatalogForOwner,
  };

  const buildRegionSnapshot = useCallback(
    (
      scope: LibraryScopeMode,
      config: LayoutConfig,
      positionForSong: (song: Song) => GraphPoint
    ): ClusterRegion[] => {
      const layoutSongs = isolateGraphSongs(visibleSongs);
      const overridesForScope =
        scope === "isolate" ? clusterOverrides : layoutClusterOverrides;
      const snapshotOwnerBounds =
        scope === "isolate" && isClusterView(config)
          ? getIsolateOwnerBoundsForLayout(
              layoutSongs,
              dimensions,
              config,
              stats,
              clusterOverrides,
              activeContributorIds,
              customCatalogForOwner
            )
          : undefined;
      const ownerRegions =
        scope === "isolate"
          ? buildOwnerMetaRegions(
              layoutSongs,
              dimensions,
              scope,
              activeContributorIds,
              positionForSong,
              config,
              snapshotOwnerBounds
            )
          : [];

      if (!isClusterView(config)) {
        return ownerRegions;
      }

      const useIsolateScopedClusters =
        scope === "isolate" && getIsolateOwnerIds(layoutSongs, activeContributorIds).length > 0;

      const innerRegions = useIsolateScopedClusters
          ? buildIsolateScopedClusterRegions(
              layoutSongs,
              config.clusterMode,
              config,
              positionForSong,
              dimensions,
              clusterOverrides,
              activeContributorIds,
              stats.playlistNames,
              snapshotOwnerBounds,
              customCatalogForOwner
            )
          : buildClusterRegions(
              config.clusterMode,
              layoutSongs,
              positionForSong,
              stats,
              dimensions,
              overridesForScope,
              activeCustomCatalog
            );

      return [...ownerRegions, ...innerRegions];
    },
    [
      activeCustomCatalog,
      clusterOverrides,
      customCatalogForOwner,
      layoutClusterOverrides,
      dimensions,
      activeContributorIds,
      isolateGraphSongs,
      stats,
      visibleSongs,
    ]
  );

  const getPosition = useCallback(
    (song: Song): GraphPoint => computeLayoutPosition(song, layoutConfig),
    [computeLayoutPosition, layoutConfig]
  );

  const layoutTransitionKey = `${effectiveSongSpaceMode}:${libraryScopeMode}`;

  const { getDisplayPosition, transition } = useLayoutTransition(
    layoutConfig,
    deferredGraphSongs,
    dimensions,
    computeLayoutPosition,
    layoutTransitionKey
  );

  const isLayoutTransitioning = transition.isAnimating;
  const isScopeMergeTransition = false;

  const renderGraphSongs = useMemo(() => {
    if (!isScopeMergeTransition) {
      return deferredGraphSongs;
    }
    return prepareGraphSongsForIsolate(visibleSongs, activeContributorIds, playlistOwners);
  }, [activeContributorIds, deferredGraphSongs, isScopeMergeTransition, playlistOwners, visibleSongs]);

  const getRenderablePosition = useCallback(
    (song: Song): GraphPoint => getDisplayPosition(song),
    [getDisplayPosition]
  );
  const effectiveClusterRevealOpacity = clusterRevealOpacity;

  const positionedSongs = useMemo(
    () => renderGraphSongs.map((song) => ({ song, position: getRenderablePosition(song) })),
    [getRenderablePosition, renderGraphSongs]
  );

  const songNodeFills = useMemo(() => {
    const fills = new Map<string, string>();
    renderGraphSongs.forEach((song) => {
      fills.set(
        song.id,
        getSongNodeFill(song, layoutConfig, stats, visibleSongs, activeCustomCatalog)
      );
    });
    return fills;
  }, [activeCustomCatalog, layoutConfig, renderGraphSongs, stats, visibleSongs]);

  const useAnimatedClusterPositions =
    isLayoutTransitioning && visibleSongs.length < LARGE_LIBRARY_LAYOUT_SNAP_THRESHOLD;
  const positionForClusterRegions = useAnimatedClusterPositions ? getRenderablePosition : getPosition;

  const clusterRegions = useMemo(() => {
    const ownerRegions =
      effectiveLibraryScopeMode === "isolate"
        ? buildOwnerMetaRegions(
            graphSongs,
            dimensions,
            effectiveLibraryScopeMode,
            activeContributorIds,
            positionForClusterRegions,
            layoutConfig,
            isolateOwnerBounds
          )
        : [];

    if (!isClusterView(layoutConfig)) {
      return ownerRegions;
    }

    if (layoutConfig.clusterMode === "custom") {
      return ownerRegions;
    }

    const useIsolateScopedClusters =
      effectiveLibraryScopeMode === "isolate" &&
      getIsolateOwnerIds(graphSongs, activeContributorIds).length > 0;

    const innerClusterRegions = useIsolateScopedClusters
        ? buildIsolateScopedClusterRegions(
            graphSongs,
            layoutConfig.clusterMode,
            layoutConfig,
            positionForClusterRegions,
            dimensions,
            clusterOverrides,
            activeContributorIds,
            stats.playlistNames,
            isolateOwnerBounds,
            customCatalogForOwner
          )
        : buildClusterRegions(
            layoutConfig.clusterMode,
            graphSongs,
            positionForClusterRegions,
            stats,
            dimensions,
            layoutClusterOverrides,
            activeCustomCatalog
          );

    return [...ownerRegions, ...innerClusterRegions];
  }, [
    activeCustomCatalog,
    clusterOverrides,
    customCatalogForOwner,
    layoutClusterOverrides,
    dimensions,
    activeContributorIds,
    effectiveLibraryScopeMode,
    positionForClusterRegions,
    graphSongs,
    isolateOwnerBounds,
    layoutConfig,
    stats,
  ]);

  useLayoutEffect(() => {
    const previousKey = prevLayoutForClustersRef.current;
    const currentKey = layoutConfigKey(layoutConfig);
    if (previousKey === currentKey) {
      return;
    }

    const previousLayout = transition.fromLayout;
    const skipClusterFade = visibleSongs.length >= LARGE_LIBRARY_LAYOUT_SNAP_THRESHOLD;

    if (skipClusterFade) {
      setFadingClusterSnapshot(null);
      setClusterRevealOpacity(isClusterView(layoutConfig) ? 1 : 0);
    } else {
      const { computeLayoutPosition: computePosition, libraryScopeMode: scopeMode } =
        clusterSnapshotInputsRef.current;
      clusterFadeOutIdRef.current += 1;
      setFadingClusterSnapshot({
        id: clusterFadeOutIdRef.current,
        regions: buildRegionSnapshot(scopeMode, previousLayout, (song) =>
          computePosition(song, previousLayout, scopeMode)
        ),
        opacity: 1,
      });

      if (isClusterView(layoutConfig) && !isClusterView(previousLayout)) {
        clusterRevealFadeIdRef.current += 1;
        setClusterRevealOpacity(0);
        setClusterRevealFadeTrigger(clusterRevealFadeIdRef.current);
      }
    }

    prevLayoutForClustersRef.current = currentKey;
  }, [buildRegionSnapshot, layoutConfig, transition.fromLayout, visibleSongs.length]);

  useEffect(() => {
    if (clusterRevealFadeTrigger === 0) {
      return undefined;
    }

    const fadeId = clusterRevealFadeTrigger;
    const startTime = performance.now();
    let frameId = 0;

    const tick = (now: number) => {
      const progress = Math.min(1, (now - startTime) / CLUSTER_FADE_MS);
      if (fadeId !== clusterRevealFadeIdRef.current) {
        return;
      }
      setClusterRevealOpacity(progress);
      if (progress < 1) {
        frameId = requestAnimationFrame(tick);
      }
    };

    frameId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frameId);
  }, [clusterRevealFadeTrigger]);

  useEffect(() => {
    if (!fadingClusterSnapshot || fadingClusterSnapshot.opacity <= 0) {
      return undefined;
    }

    const fadeId = fadingClusterSnapshot.id;
    const startTime = performance.now();
    let frameId = 0;

    const tick = (now: number) => {
      const progress = Math.min(1, (now - startTime) / CLUSTER_FADE_MS);
      const opacity = 1 - progress;
      if (progress < 1) {
        setFadingClusterSnapshot((current) =>
          current && current.id === fadeId ? { ...current, opacity } : current
        );
        frameId = requestAnimationFrame(tick);
      } else {
        setFadingClusterSnapshot((current) => (current && current.id === fadeId ? null : current));
      }
    };

    frameId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frameId);
  }, [fadingClusterSnapshot?.id]);

  const isClusterLayout = isClusterLayoutConfig(layoutConfig);
  const showClusterDecorations =
    isClusterLayout || Boolean(fadingClusterSnapshot && fadingClusterSnapshot.opacity > 0);
  const activePathLayoutConfig =
    (cue ? resolveCueLayoutConfig(cue, musicService) : null) ?? strokeLayoutConfig;
  const showPathOverlays =
    activePathLayoutConfig !== null &&
    layoutConfigKey(layoutConfig) === layoutConfigKey(activePathLayoutConfig);

  const axisLabels = getLayoutAxisLabels(layoutConfig, musicService);
  const showLabels = visibleSongs.length <= LABEL_THRESHOLD;

  const cueEdgePath = useMemo(() => {
    if (!cue || cue.songs.length < 2) {
      return "";
    }
    return cue.songs
      .map((song, index) => {
        const position = getDisplayPosition(song);
        return `${index === 0 ? "M" : "L"} ${position.x.toFixed(1)} ${position.y.toFixed(1)}`;
      })
      .join(" ");
  }, [cue, getDisplayPosition]);

  const regenerateCueFromStroke = useCallback(
    (currentStroke: GraphPoint[], threshold: number) => {
      if (currentStroke.length < 2) {
        return null;
      }
      return canonicalizeGeneratedCue(
        generateCueFromStroke(graphSongs, currentStroke, getPosition, threshold, layoutConfig),
        songs
      );
    },
    [getPosition, graphSongs, layoutConfig, songs]
  );

  const regenerateCueFromStrokes = useCallback(
    (strokes: NormalizedPoint[][], threshold: number) => {
      if (strokes.length === 0) {
        return null;
      }
      const graphStrokes = strokes.map((segment) =>
        segment.map((point) => fromNormalizedPosition(point, dimensions))
      );
      return canonicalizeGeneratedCue(
        generateCueFromStrokes(graphSongs, graphStrokes, getPosition, threshold, layoutConfig),
        songs
      );
    },
    [dimensions, getPosition, graphSongs, layoutConfig, songs]
  );

  const selectedSong = useMemo(() => {
    if (!selectedSongId) {
      return undefined;
    }
    const canonicalId = getCanonicalSongId(selectedSongId);
    return songs.find((song) => song.id === canonicalId);
  }, [selectedSongId, songs]);

  const createBaseCue = useCallback(
    (initialSongs: Song[] = []): GeneratedCue => ({
      seed: initialSongs[0]?.id.charCodeAt(0) ?? 0,
      songs: initialSongs,
      stroke: strokeRef.current.map((point) => fromNormalizedPosition(point, dimensions)),
      layoutConfig,
      pathThreshold,
      buildMode,
    }),
    [buildMode, dimensions, layoutConfig, pathThreshold]
  );

  const applyUndoEntry = useCallback((entry: {
    cue: GeneratedCue | null;
    completedStrokes?: NormalizedPoint[][];
    action?: "stroke" | "node" | "manual";
  } | null) => {
    setCue(entry?.cue ?? null);
    if (entry?.completedStrokes !== undefined) {
      completedStrokesRef.current = entry.completedStrokes.map((stroke) => [...stroke]);
      setCompletedStrokes(completedStrokesRef.current);
    }
    if (entry?.action === "stroke" || entry?.action === "node") {
      strokeRef.current = [];
      setActiveStroke([]);
      isDrawingRef.current = false;
      setIsDrawingNewPath(false);
    }
    if (!entry?.cue) {
      setSelectedSongId(null);
    }
  }, []);

  const snapshotCue = (value: GeneratedCue | null): GeneratedCue | null =>
    value ? { ...value, songs: [...value.songs], stroke: [...value.stroke] } : null;

  const pushUndo = useCallback(
    (
      snapshot: GeneratedCue | null,
      options?: { includeStrokes?: boolean; action?: "stroke" | "node" | "manual" }
    ) => {
      undoStackRef.current = [
        ...undoStackRef.current,
        {
          cue: snapshotCue(snapshot),
          completedStrokes: options?.includeStrokes
            ? completedStrokesRef.current.map((stroke) => [...stroke])
            : undefined,
          action: options?.action,
        },
      ];
      setCanUndo(true);
    },
    []
  );

  const clearUndo = useCallback(() => {
    undoStackRef.current = [];
    setCanUndo(false);
  }, []);

  const insertSongAt = useCallback(
    (song: Song, index: number, options?: { recordUndo?: boolean }) => {
      if (options?.recordUndo && buildMode === "manual") {
        pushUndo(cue, { action: "manual" });
      }

      const nextSongs = cue ? [...cue.songs] : [];
      const clampedIndex = Math.max(0, Math.min(index, nextSongs.length));
      nextSongs.splice(clampedIndex, 0, song);

      setCue({
        ...(cue ?? createBaseCue()),
        songs: nextSongs,
        buildMode,
      });
    },
    [buildMode, createBaseCue, cue, pushUndo]
  );

  const handleNodeSelect = useCallback(
    (song: Song) => {
      const canonicalSong = resolveCanonicalSong(song, songs);
      setSelectedSongId(canonicalSong.id);

      if (isGuestViewOnly && graphTool !== "draw") {
        setStatusMessage(`Selected ${canonicalSong.artist} — ${canonicalSong.title}.`);
        return;
      }

      if (graphTool === "draw") {
        pushUndo(cue, { includeStrokes: true, action: "node" });
        const nextSongs = [...(cue?.songs ?? [])];
        nextSongs.push(canonicalSong);
        setCue({
          ...(cue ?? createBaseCue()),
          songs: nextSongs,
          buildMode: "path",
        });
        setStatusMessage(
          `Added ${canonicalSong.artist} — ${canonicalSong.title} to cue. Draw another path or click more nodes.`
        );
        return;
      }

      if (buildMode === "manual") {
        insertSongAt(canonicalSong, cue?.songs.length ?? 0, { recordUndo: true });
        setStatusMessage(`Added ${canonicalSong.artist} — ${canonicalSong.title} to cue.`);
        return;
      }

      setStatusMessage(`Selected ${canonicalSong.artist} — ${canonicalSong.title}.`);
    },
    [buildMode, createBaseCue, cue, graphTool, insertSongAt, isGuestViewOnly, pushUndo, songs]
  );

  useEffect(() => {
    if (!isGuestViewOnly) {
      return;
    }
    if (graphTool === "draw-cluster") {
      setGraphTool("navigate");
      saveGraphTool("navigate");
    }
    if (buildMode === "manual") {
      setBuildMode("path");
      saveBuildMode("path");
    }
  }, [buildMode, graphTool, isGuestViewOnly]);

  const handleUndo = useCallback(() => {
    if (undoStackRef.current.length === 0) {
      return;
    }
    if (buildMode !== "manual" && graphTool !== "draw") {
      return;
    }
    const previous = undoStackRef.current.pop() ?? null;
    setCanUndo(undoStackRef.current.length > 0);
    applyUndoEntry(previous);
    setStatusMessage(
      previous?.action === "stroke" ? "Removed last path segment." : "Undid last change."
    );
  }, [applyUndoEntry, buildMode, graphTool]);

  useEffect(() => {
    handleUndoRef.current = handleUndo;
  }, [handleUndo]);

  const handleBuildModeChange = useCallback(
    (mode: CueBuildMode) => {
      setBuildMode(mode);
      saveBuildMode(mode);
      clearUndo();
      setSelectedSongId(null);

      if (mode === "manual") {
        clearDrawnPath();
        setStatusMessage("Manual mode: click nodes to add tracks. ⌘Z to undo.");
        return;
      }

      setStatusMessage("Use Draw path to sketch on the graph, or switch to Navigate to pan.");
    },
    [clearUndo]
  );

  const handleGraphToolChange = useCallback(
    (tool: GraphToolMode) => {
      if (isGuestViewOnly && tool === "draw-cluster") {
        return;
      }
      setGraphTool(tool);
      saveGraphTool(tool);
      if (tool === "navigate") {
        setStatusMessage(
          isGuestViewOnly
            ? "Navigate: drag to pan · scroll or pinch to zoom."
            : "Navigate: drag to pan · scroll or pinch to zoom · drag cluster labels to move them."
        );
        return;
      }
      if (tool === "draw-cluster") {
        setStatusMessage("Draw cluster: sketch a loop to create a cluster, or click one to edit it.");
        return;
      }
      setStatusMessage(
        "Draw path: drag on the graph or click nodes to add tracks. ⌘Z to undo. Switch to Navigate to pan."
      );
    },
    [isGuestViewOnly]
  );

  const cueSummary = useMemo(() => {
    if (!cue) {
      return null;
    }
    const playableSongs = cue.songs.filter((song) => !unavailableSongIds.has(song.id));
    const missingInCue = cue.songs.filter((song) => unavailableSongIds.has(song.id)).length;
    return {
      trackCount: cue.songs.length,
      playableCount: playableSongs.length,
      missingCount: missingInCue,
      totalMs: sumDuration(cue.songs),
      playableMs: sumDuration(playableSongs),
    };
  }, [cue, unavailableSongIds]);

  useEffect(() => {
    if (!musicProvider.supportsPlaybackTracking || !playbackTrackingEnabled || !cue?.songs.length) {
      return undefined;
    }

    const pollPlayback = async () => {
      const state = await musicProvider.getPlaybackState();
      if (!state?.persistentId) {
        return;
      }

      setActivePersistentId(state.persistentId);

      if (state.persistentId === playbackTrackingRef.current.persistentId) {
        return;
      }

      const currentCue = cueRef.current;
      if (!currentCue) {
        return;
      }

      const result = applyPlaybackAdvance(
        currentCue,
        songsRef.current,
        state.persistentId,
        playbackTrackingRef.current.persistentId,
        playbackTrackingRef.current.cueIndex
      );

      if (result.nextCue !== currentCue) {
        setCue(result.nextCue);
        if (result.message) {
          setStatusMessage(result.message);
        }
      }

      playbackTrackingRef.current = {
        persistentId: state.persistentId,
        cueIndex: result.cueIndex,
      };
    };

    void pollPlayback();
    const intervalId = window.setInterval(() => {
      void pollPlayback();
    }, 2000);

    return () => window.clearInterval(intervalId);
  }, [cue, musicProvider, playbackTrackingEnabled]);

  const resetPanSession = () => {
    panSessionRef.current = null;
    setIsPanning(false);
  };

  const trackPointer = (event: React.PointerEvent<Element>) => {
    pointerPositionsRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pointerPositionsRef.current.size === 2) {
      const svg = svgRef.current;
      if (!svg) {
        return;
      }
      const points = [...pointerPositionsRef.current.values()];
      const distance = Math.hypot(points[1].x - points[0].x, points[1].y - points[0].y);
      const midClientX = (points[0].x + points[1].x) / 2;
      const midClientY = (points[0].y + points[1].y) / 2;
      const rect = svg.getBoundingClientRect();
      const transform = viewTransformRef.current;
      pinchSessionRef.current = {
        startDistance: Math.max(distance, 1),
        startScale: transform.scale,
        startPanX: transform.panX,
        startPanY: transform.panY,
        startMidX: midClientX - rect.left,
        startMidY: midClientY - rect.top,
      };
      const session = panSessionRef.current;
      if (session && svgRef.current?.hasPointerCapture(session.pointerId)) {
        svgRef.current.releasePointerCapture(session.pointerId);
      }
      resetPanSession();
    }
  };

  const releasePointer = (event: React.PointerEvent<Element>) => {
    pointerPositionsRef.current.delete(event.pointerId);
    if (pointerPositionsRef.current.size < 2) {
      pinchSessionRef.current = null;
    }
  };

  const updatePinchTransform = () => {
    const session = pinchSessionRef.current;
    const svg = svgRef.current;
    if (!session || !svg || pointerPositionsRef.current.size < 2) {
      return;
    }
    const points = [...pointerPositionsRef.current.values()];
    const distance = Math.hypot(points[1].x - points[0].x, points[1].y - points[0].y);
    const midClientX = (points[0].x + points[1].x) / 2;
    const midClientY = (points[0].y + points[1].y) / 2;
    const rect = svg.getBoundingClientRect();
    const nextScale = Math.max(MIN_ZOOM, session.startScale * (distance / session.startDistance));
    const graphX = (session.startMidX - session.startPanX) / session.startScale;
    const graphY = (session.startMidY - session.startPanY) / session.startScale;
    const screenMidX = midClientX - rect.left;
    const screenMidY = midClientY - rect.top;
    setViewTransform({
      scale: nextScale,
      panX: screenMidX - graphX * nextScale,
      panY: screenMidY - graphY * nextScale,
    });
  };

  const beginNewStroke = (point: GraphPoint) => {
    const normalized = toNormalizedPosition(point, dimensions);
    const lastCompleted = completedStrokesRef.current[completedStrokesRef.current.length - 1];
    const lastPoint = lastCompleted?.[lastCompleted.length - 1];
    isDrawingRef.current = true;
    setIsDrawingNewPath(true);
    setStrokeLayoutConfig(layoutConfig);
    strokeRef.current = lastPoint ? [lastPoint, normalized] : [normalized];
    setActiveStroke([...strokeRef.current]);
    setStatusMessage("Drawing path… release to finish this segment.");
  };

  const appendStrokePoint = (point: GraphPoint) => {
    const normalized = toNormalizedPosition(point, dimensions);
    setActiveStroke((current) => {
      const last = current[current.length - 1];
      if (!last || Math.hypot(normalized.x - last.x, normalized.y - last.y) < 0.004) {
        return current;
      }
      const next = [...current, normalized];
      strokeRef.current = next;
      return next;
    });
  };

  const beginClusterStroke = (point: GraphPoint) => {
    const normalized = toNormalizedPosition(point, dimensions);
    clusterDrawStrokeRef.current = [normalized];
    setClusterDrawStroke([normalized]);
    setStatusMessage(
      redrawClusterIdRef.current
        ? "Redraw cluster shape… release to preview, then accept or reject."
        : "Draw cluster loop… release to close the shape."
    );
  };

  const appendClusterStrokePoint = (point: GraphPoint) => {
    const normalized = toNormalizedPosition(point, dimensions);
    setClusterDrawStroke((current) => {
      const last = current[current.length - 1];
      if (!last || Math.hypot(normalized.x - last.x, normalized.y - last.y) < 0.004) {
        return current;
      }
      const next = [...current, normalized];
      clusterDrawStrokeRef.current = next;
      return next;
    });
  };

  const finishClusterDrawing = () => {
    if (isGuestViewOnly) {
      clusterDrawStrokeRef.current = [];
      setClusterDrawStroke([]);
      return;
    }
    const stroke = clusterDrawStrokeRef.current;
    clusterDrawStrokeRef.current = [];
    setClusterDrawStroke([]);

    if (stroke.length < 3) {
      setStatusMessage("Draw a longer loop to create a cluster.");
      return;
    }

    const hull = simplifyPolygon(stroke);
    if (!isValidSquigglyHull(hull, dimensions)) {
      setStatusMessage("Draw a larger loop — the cluster needs visible area.");
      return;
    }

    const positionedSongs = graphSongs.map((song) => ({
      id: getCanonicalSongId(song.id),
      position: computeLayoutPosition(song, layoutConfig),
    }));

    if (redrawClusterIdRef.current) {
      const clusterId = redrawClusterIdRef.current;
      const existing = squigglyClusters.find((cluster) => cluster.id === clusterId);
      if (!existing?.hull) {
        redrawClusterIdRef.current = null;
        return;
      }
      setRedrawDraft({
        clusterId,
        previousHull: existing.hull,
        draftHull: hull,
      });
      setStatusMessage("Previewing redraw — accept to keep or reject to undo.");
      return;
    }

    const created = createSquigglyClusterFromStroke(
      activeCustomCatalog,
      hull,
      positionedSongs,
      dimensions,
      squigglyPenColor
    );
    if (!created) {
      setStatusMessage("Draw a larger loop — the cluster needs visible area.");
      return;
    }
    const { catalog: nextCatalog, cluster } = created;
    persistCustomCatalog(nextCatalog);
    setSquigglyPenColor(nextSquigglyClusterColor());
    setStatusMessage(`Created ${cluster.label} with ${cluster.songIds.length} songs.`);
  };

  const acceptRedrawDraft = () => {
    if (!redrawDraft) {
      return;
    }
    if (!isValidSquigglyHull(redrawDraft.draftHull, dimensions)) {
      setStatusMessage("Draw a larger loop — the cluster needs visible area.");
      return;
    }
    const nextCatalog = setSquigglyClusterHull(
      activeCustomCatalog,
      redrawDraft.clusterId,
      redrawDraft.draftHull
    );
    persistCustomCatalog(nextCatalog);
    setRedrawDraft(null);
    redrawClusterIdRef.current = null;
    setStatusMessage("Cluster shape updated.");
  };

  const rejectRedrawDraft = () => {
    setRedrawDraft(null);
    redrawClusterIdRef.current = null;
    setStatusMessage("Cluster redraw cancelled.");
  };

  const buildSquigglyDragSession = (
    clusterIds: string[],
    primaryClusterId: string,
    anchor: NormalizedPoint,
    hullSource: Array<{ id: string; hull?: NormalizedPoint[]; songIds: string[] }>
  ) => {
    const memberSongIds = new Set<string>();
    const startHulls: Record<string, NormalizedPoint[]> = {};
    const startSongPositions: Record<string, NormalizedPoint> = {};

    clusterIds.forEach((clusterId) => {
      const cluster = hullSource.find((entry) => entry.id === clusterId);
      if (!cluster?.hull) {
        return;
      }
      startHulls[clusterId] = cluster.hull.map((vertex) => ({ ...vertex }));
      cluster.songIds.forEach((songId) => memberSongIds.add(getCanonicalSongId(songId)));
    });

    memberSongIds.forEach((songId) => {
      const stored = squigglySongPositionsRef.current[songId];
      if (stored) {
        startSongPositions[songId] = { ...stored };
      }
    });

    return {
      clusterIds,
      primaryClusterId,
      startHulls,
      memberSongIds: [...memberSongIds],
      startSongPositions,
      anchor,
    };
  };

  const getSquigglyClustersForHitTest = () =>
    squigglyClusters.map((cluster) => ({
      id: cluster.id,
      hull:
        squigglyHullPreview[cluster.id] ??
        (redrawDraft?.clusterId === cluster.id ? redrawDraft.draftHull : cluster.hull),
      songIds: cluster.songIds,
    }));

  const startClusterShapeEdit = useCallback(
    (cluster: CustomClusterDefinition) => {
      setGraphTool("draw-cluster");
      saveGraphTool("draw-cluster");
      setSelectedClusterIds(new Set([cluster.id]));
      redrawClusterIdRef.current = cluster.id;
      setRedrawDraft(null);
      setStatusMessage(`Redraw ${cluster.label}: draw a new loop on the graph.`);
    },
    []
  );

  const handleSquigglyClusterPointerDown = (
    event: React.PointerEvent<SVGPathElement>,
    cluster: CustomClusterDefinition
  ) => {
    if (isGuestViewOnly) {
      return;
    }
    if (redrawDraft) {
      return;
    }
    event.stopPropagation();

    if (graphTool === "draw-cluster") {
      setSelectedClusterIds(new Set([cluster.id]));
      return;
    }

    if (graphTool !== "navigate") {
      return;
    }

    const graphPoint = getLocalPoint(event, event.currentTarget.ownerSVGElement!, contentGroupRef.current);
    const anchor = toNormalizedPosition(graphPoint, dimensions);
    const hullSource = getSquigglyClustersForHitTest();
    const clusterIds = findSquigglyClusterIdsAtPoint(graphPoint, hullSource, dimensions);
    const hitClusterIds = clusterIds.length > 0 ? clusterIds : [cluster.id];
    pendingSquigglyClusterDragRef.current = {
      ...buildSquigglyDragSession(hitClusterIds, cluster.id, anchor, hullSource),
      clientX: event.clientX,
      clientY: event.clientY,
      pointerId: event.pointerId,
    };
    setSelectedClusterIds(new Set(hitClusterIds));
  };

  const handleSquigglyClusterDoubleClick = (
    event: React.MouseEvent<SVGPathElement>,
    cluster: CustomClusterDefinition
  ) => {
    if (isGuestViewOnly) {
      return;
    }
    event.stopPropagation();
    if (draggingSquigglyClusterRef.current) {
      return;
    }
    pendingSquigglyClusterDragRef.current = null;
    startClusterShapeEdit(cluster);
  };

  const handleBeginEditClusterShape = () => {
    if (!selectedSquigglyCluster) {
      return;
    }
    startClusterShapeEdit(selectedSquigglyCluster);
  };

  const handleClusterNameCommit = () => {
    if (!selectedSquigglyCluster) {
      return;
    }
    const nextLabel = clusterNameDraft.trim();
    if (!nextLabel || nextLabel === selectedSquigglyCluster.label) {
      setClusterNameDraft(selectedSquigglyCluster.label);
      return;
    }
    persistCustomCatalog(renameSquigglyCluster(activeCustomCatalog, selectedSquigglyCluster.id, nextLabel));
    setStatusMessage(`Renamed cluster to ${nextLabel}.`);
  };

  const handleSelectedClusterColorChange = (color: string) => {
    if (!selectedSquigglyCluster) {
      return;
    }
    persistCustomCatalog(setSquigglyClusterColor(activeCustomCatalog, selectedSquigglyCluster.id, color));
  };

  const handleDeleteCluster = () => {
    if (!selectedSquigglyCluster) {
      return;
    }
    const clusterLabel = selectedSquigglyCluster.label;
    if (
      !window.confirm(
        `Delete "${clusterLabel}"? Songs will stay on the graph but won't belong to any cluster.`
      )
    ) {
      return;
    }
    persistCustomCatalog(removeSquigglyCluster(activeCustomCatalog, selectedSquigglyCluster.id));
    setSelectedClusterIds(new Set());
    setClusterNameDraft("");
    if (redrawDraft?.clusterId === selectedSquigglyCluster.id) {
      setRedrawDraft(null);
      redrawClusterIdRef.current = null;
    }
    setStatusMessage(`Deleted ${clusterLabel}.`);
  };

  const finishStrokeDrawing = () => {
    const currentStroke = strokeRef.current;
    isDrawingRef.current = false;
    setIsDrawingNewPath(false);

    if (currentStroke.length < 2) {
      strokeRef.current = [];
      setActiveStroke([]);
      setStatusMessage("Draw a longer path to generate a cue.");
      return;
    }

    const nextCompleted = [...completedStrokesRef.current, currentStroke];
    const segmentGraphStroke = currentStroke.map((point) => fromNormalizedPosition(point, dimensions));
    const segmentCue = canonicalizeGeneratedCue(
      generateCueFromStroke(graphSongs, segmentGraphStroke, getPosition, pathThreshold, layoutConfig),
      songs
    );

    if (!segmentCue || segmentCue.songs.length === 0) {
      strokeRef.current = [];
      setActiveStroke([]);
      setStatusMessage("No songs matched that path. Widen the path threshold or draw closer to nodes.");
      return;
    }

    pushUndo(cue, { includeStrokes: true, action: "stroke" });

    completedStrokesRef.current = nextCompleted;
    setCompletedStrokes(nextCompleted);
    strokeRef.current = [];
    setActiveStroke([]);

    const existingSongs = cue?.songs ?? [];
    const mergedSongs = [...existingSongs];
    segmentCue.songs.forEach((song) => {
      if (!mergedSongs.some((entry) => entry.id === song.id)) {
        mergedSongs.push(song);
      }
    });

    setCue({
      ...(cue ?? createBaseCue()),
      songs: mergedSongs,
      stroke: [...(cue?.stroke ?? []), ...segmentGraphStroke],
      layoutConfig,
      pathThreshold,
      buildMode: "path",
      seed: mergedSongs.reduce((sum, entry, index) => sum + entry.id.charCodeAt(0) * (index + 1), 0),
    });
    setStrokeLayoutConfig(layoutConfig);
    setStatusMessage(
      `Added segment · ${mergedSongs.length} songs in cue. Draw another path or click nodes. ⌘Z to undo.`
    );
  };

  const handleClusterLabelPointerDown = (
    event: React.PointerEvent<SVGTextElement>,
    clusterId: string,
    label: string
  ) => {
    if (isGuestViewOnly || !isClusterLayout) {
      return;
    }
    event.stopPropagation();
    beginIsolateClusterDrag();
    const activeOverrides =
      songSpaceMode === "mine" && localContributorId ? layoutClusterOverrides : clusterOverrides;
    const overrideMap =
      layoutConfig.clusterMode === "genre"
        ? activeOverrides.genre
        : layoutConfig.clusterMode === "playlist"
          ? activeOverrides.playlist
          : activeOverrides.custom;
    const clustersToMove =
      selectedClusterIds.size > 0 && selectedClusterIds.has(clusterId)
        ? [...selectedClusterIds]
        : [clusterId];
    const startPositions: Record<string, NormalizedPoint> = {};
    const { ownerId } = parseOwnerScopedRegionId(clusterId);
    const ownerBounds = ownerId && isolateOwnerBounds ? isolateOwnerBounds.get(ownerId) : undefined;
    const defaultMetaCenter =
      ownerId && isolateOwnerBounds
        ? getEnabledOwnerMetaClusters(graphSongs, dimensions, activeContributorIds, {
            isAxisView: false,
            ownerBounds: isolateOwnerBounds,
          }).find((meta) => meta.id === ownerId)?.center
        : undefined;
    const metaCenter =
      ownerId && defaultMetaCenter ? getMetaClusterCenter(ownerId, defaultMetaCenter) : defaultMetaCenter;
    const useDisplaySpace = !skipIsolateCentroidTranslation && Boolean(ownerBounds && metaCenter);
    const dragSpaceOptions = {
      useDisplaySpace,
      bounds: ownerBounds,
      metaCenter,
    };

    clustersToMove.forEach((id) => {
      startPositions[id] = getClusterDragDisplayNormalizedStart(
        id,
        clusterRegions.find((entry) => entry.id === id),
        overrideMap,
        dimensions,
        dragSpaceOptions
      );
    });

    const anchorRegion = clusterRegions.find((entry) => entry.id === clusterId);
    const anchorStart = svgRef.current
      ? toNormalizedPosition(getLocalPoint(event, svgRef.current, contentGroupRef.current), dimensions)
      : startPositions[clusterId] ??
        getClusterDragDisplayNormalizedStart(clusterId, anchorRegion, overrideMap, dimensions, dragSpaceOptions);

    clusterDragSessionRef.current = {
      clusterIds: clustersToMove,
      startPositions,
      anchorStart,
      useDisplaySpace,
      bounds: ownerBounds,
      metaCenter,
    };
    draggingClusterIdRef.current = clusterId;
    event.currentTarget.setPointerCapture(event.pointerId);
    setStatusMessage(
      clustersToMove.length > 1 ? `Dragging ${clustersToMove.length} clusters…` : `Dragging ${label}…`
    );
  };

  const handleNodePointerDown = (event: React.PointerEvent<SVGCircleElement>, song: Song) => {
    event.stopPropagation();
    if (
      isSquigglyCustomMode &&
      graphTool === "navigate" &&
      !redrawDraft &&
      !isGuestViewOnly
    ) {
      const canonicalId = getCanonicalSongId(song.id);
      let start = squigglySongPositionsRef.current[canonicalId];
      if (!start) {
        const position = computeLayoutPosition(song, layoutConfig);
        start = toNormalizedPosition(position, dimensions);
        const seeded = { ...squigglySongPositionsRef.current, [canonicalId]: start };
        squigglySongPositionsRef.current = seeded;
        setSquigglySongPositions(seeded);
      }
      pendingSongDragRef.current = {
        songId: canonicalId,
        start: { ...start },
        anchor: toNormalizedPosition(
          getLocalPoint(event, event.currentTarget.ownerSVGElement!, contentGroupRef.current),
          dimensions
        ),
        clientX: event.clientX,
        clientY: event.clientY,
        pointerId: event.pointerId,
      };
      return;
    }
    nodePointerStartRef.current = {
      songId: song.id,
      clientX: event.clientX,
      clientY: event.clientY,
    };
  };

  const handleNodePointerUp = (event: React.PointerEvent<SVGCircleElement>, song: Song) => {
    event.stopPropagation();
    const canonicalId = getCanonicalSongId(song.id);
    if (draggingSongRef.current?.songId === canonicalId) {
      return;
    }
    if (pendingSongDragRef.current?.songId === canonicalId) {
      pendingSongDragRef.current = null;
      void handleNodeSelect(song);
      return;
    }
    const start = nodePointerStartRef.current;
    nodePointerStartRef.current = null;

    if (!start || start.songId !== song.id) {
      return;
    }

    const moved = Math.hypot(event.clientX - start.clientX, event.clientY - start.clientY);
    if (moved < DRAG_THRESHOLD) {
      void handleNodeSelect(song);
    }
  };

  const isInteractiveGraphTarget = (target: EventTarget | null): boolean => {
    if (!(target instanceof Element)) {
      return false;
    }
    return Boolean(
      target.closest(".music-cue-node-hit") ||
        target.closest(".music-cue-cluster-label-draggable") ||
        target.closest(".music-cue-squiggly-cluster-fill")
    );
  };

  const handleGraphPointerDown = (event: React.PointerEvent<SVGSVGElement>) => {
    if (!svgRef.current || event.button !== 0) {
      return;
    }
    if (isInteractiveGraphTarget(event.target)) {
      return;
    }
    if (pinchSessionRef.current) {
      return;
    }

    if (graphTool === "navigate") {
      event.preventDefault();
    }

    trackPointer(event);

    const point = getLocalPoint(event, svgRef.current, contentGroupRef.current);
    const startPanImmediately = graphTool === "navigate" && event.pointerType === "touch";
    panSessionRef.current = {
      pointerId: event.pointerId,
      clientX: event.clientX,
      clientY: event.clientY,
      panX: viewTransformRef.current.panX,
      panY: viewTransformRef.current.panY,
      graphStart: point,
      shiftHeld: event.shiftKey,
      metaShiftHeld: (event.metaKey || event.ctrlKey) && event.shiftKey,
      mode: startPanImmediately ? "pan" : "pending",
    };
    if (startPanImmediately) {
      setIsPanning(true);
    }
    svgRef.current.setPointerCapture(event.pointerId);
  };

  const handleBackgroundPointerDown = (event: React.PointerEvent<SVGRectElement>) => {
    event.stopPropagation();
    handleGraphPointerDown(event as unknown as React.PointerEvent<SVGSVGElement>);
  };

  const handlePointerMove = (event: React.PointerEvent<SVGSVGElement>) => {
    if (!svgRef.current) {
      return;
    }

    if (pointerPositionsRef.current.has(event.pointerId)) {
      pointerPositionsRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    }

    if (pinchSessionRef.current && pointerPositionsRef.current.size >= 2) {
      updatePinchTransform();
      return;
    }

    if (isWebDeployment && !draggingClusterIdRef.current && !draggingSquigglyClusterRef.current && !draggingSongRef.current) {
      const point = getLocalPoint(event, svgRef.current, contentGroupRef.current);
      setGraphCursorRef.current(toNormalizedPosition(point, dimensions));
    }

    if (pendingSquigglyClusterDragRef.current && !draggingSquigglyClusterRef.current) {
      const pending = pendingSquigglyClusterDragRef.current;
      if (pending.pointerId === event.pointerId) {
        const moved = Math.hypot(event.clientX - pending.clientX, event.clientY - pending.clientY);
        if (moved >= DRAG_THRESHOLD) {
          const { clientX: _clientX, clientY: _clientY, pointerId: _pointerId, ...session } = pending;
          draggingSquigglyClusterRef.current = session;
          pendingSquigglyClusterDragRef.current = null;
          svgRef.current.setPointerCapture(event.pointerId);
          setStatusMessage(`Dragging ${session.clusterIds.length} cluster(s)…`);
        }
      }
    }

    if (pendingSongDragRef.current && !draggingSongRef.current) {
      const pending = pendingSongDragRef.current;
      if (pending.pointerId === event.pointerId) {
        const moved = Math.hypot(event.clientX - pending.clientX, event.clientY - pending.clientY);
        if (moved >= DRAG_THRESHOLD) {
          const { clientX: _clientX, clientY: _clientY, pointerId: _pointerId, ...session } = pending;
          draggingSongRef.current = session;
          pendingSongDragRef.current = null;
          svgRef.current.setPointerCapture(event.pointerId);
        }
      }
    }

    if (draggingSquigglyClusterRef.current) {
      const point = getLocalPoint(event, svgRef.current, contentGroupRef.current);
      const normalized = toNormalizedPosition(point, dimensions);
      const session = draggingSquigglyClusterRef.current;
      const delta = {
        x: normalized.x - session.anchor.x,
        y: normalized.y - session.anchor.y,
      };
      const nextPreview: Record<string, NormalizedPoint[]> = {};
      session.clusterIds.forEach((clusterId) => {
        const startHull = session.startHulls[clusterId];
        if (!startHull) {
          return;
        }
        nextPreview[clusterId] = startHull.map((vertex) => ({
          x: vertex.x + delta.x,
          y: vertex.y + delta.y,
        }));
      });
      setSquigglyHullPreview(nextPreview);
      const nextPositions = { ...squigglySongPositionsRef.current };
      session.memberSongIds.forEach((songId) => {
        const start = session.startSongPositions[songId];
        if (start) {
          nextPositions[songId] = { x: start.x + delta.x, y: start.y + delta.y };
        }
      });
      squigglySongPositionsRef.current = nextPositions;
      setSquigglySongPositions(nextPositions);
      return;
    }

    if (draggingSongRef.current) {
      const point = getLocalPoint(event, svgRef.current, contentGroupRef.current);
      const normalized = toNormalizedPosition(point, dimensions);
      const session = draggingSongRef.current;
      const delta = {
        x: normalized.x - session.anchor.x,
        y: normalized.y - session.anchor.y,
      };
      const nextPositions = {
        ...squigglySongPositionsRef.current,
        [session.songId]: {
          x: session.start.x + delta.x,
          y: session.start.y + delta.y,
        },
      };
      squigglySongPositionsRef.current = nextPositions;
      setSquigglySongPositions(nextPositions);
      return;
    }

    if (draggingClusterIdRef.current) {
      const point = getLocalPoint(event, svgRef.current, contentGroupRef.current);
      const normalized = toNormalizedPosition(point, dimensions);
      const session = clusterDragSessionRef.current;
      if (!session) {
        return;
      }
      const delta = {
        x: normalized.x - session.anchorStart.x,
        y: normalized.y - session.anchorStart.y,
      };
      const clusterId = draggingClusterIdRef.current;
      const { ownerId } = parseOwnerScopedRegionId(clusterId);
      const resolvedOwnerId = resolveOverrideOwnerId(ownerId);
      setClusterOverrides((current) => {
        const updates: Record<string, NormalizedPoint> = {};
        session.clusterIds.forEach((id) => {
          const start = session.startPositions[id];
          const displayNorm = { x: start.x + delta.x, y: start.y + delta.y };
          if (session.useDisplaySpace && session.bounds && session.metaCenter) {
            updates[id] = displayNormalizedToSoloNormalized(
              displayNorm,
              dimensions,
              session.bounds,
              session.metaCenter
            );
          } else {
            updates[id] = displayNorm;
          }
        });
        const scopedUpdates = toOwnerScopedOverrideUpdates(resolvedOwnerId, session.clusterIds, updates);
        if (layoutConfig.viewMode === "cluster" && layoutConfig.clusterMode === "genre") {
          const next = { ...current, genre: { ...current.genre, ...scopedUpdates } };
          saveGenreClusterCenterOverrides(next.genre, activeLayoutScope);
          clusterOverridesRef.current = next;
          return next;
        }
        if (layoutConfig.viewMode === "cluster" && layoutConfig.clusterMode === "playlist") {
          const next = {
            ...current,
            playlist: { ...current.playlist, ...scopedUpdates },
          };
          savePlaylistClusterCenterOverrides(next.playlist, activeLayoutScope);
          invalidatePlaylistOverlapLayoutCache();
          clusterOverridesRef.current = next;
          return next;
        }
        if (layoutConfig.viewMode === "cluster" && layoutConfig.clusterMode === "custom") {
          const next = {
            ...current,
            custom: { ...current.custom, ...scopedUpdates },
          };
          saveCustomClusterCenterOverrides(next.custom, activeLayoutScope);
          clusterOverridesRef.current = next;
          return next;
        }
        return current;
      });
      return;
    }

    const session = panSessionRef.current;
    if (!session || session.pointerId !== event.pointerId) {
      return;
    }

    if (session.mode === "pending") {
      const screenDistance = Math.hypot(event.clientX - session.clientX, event.clientY - session.clientY);
      if (screenDistance < DRAG_THRESHOLD) {
        return;
      }

      if (session.metaShiftHeld && isClusterLayout && !isGuestViewOnly) {
        session.mode = "box-select";
        const point = getLocalPoint(event, svgRef.current, contentGroupRef.current);
        session.boxEnd = point;
        setBoxSelectRect({
          x1: session.graphStart.x,
          y1: session.graphStart.y,
          x2: point.x,
          y2: point.y,
        });
      } else if (graphTool === "draw-cluster" && isSquigglyCustomMode && !isGuestViewOnly) {
        session.mode = "draw-cluster";
        beginClusterStroke(session.graphStart);
        appendClusterStrokePoint(getLocalPoint(event, svgRef.current, contentGroupRef.current));
      } else if (graphTool === "draw" && graphSongs.length > 0) {
        session.mode = "draw";
        beginNewStroke(session.graphStart);
        appendStrokePoint(getLocalPoint(event, svgRef.current, contentGroupRef.current));
      } else if (graphTool === "navigate") {
        session.mode = "pan";
        setIsPanning(true);
      } else {
        session.mode = "pan";
      }
    }

    if (session.mode === "box-select" && session.boxEnd) {
      const point = getLocalPoint(event, svgRef.current, contentGroupRef.current);
      session.boxEnd = point;
      setBoxSelectRect({
        x1: session.graphStart.x,
        y1: session.graphStart.y,
        x2: point.x,
        y2: point.y,
      });
      return;
    }

    if (session.mode === "pan") {
      event.preventDefault();
      setViewTransform({
        scale: viewTransformRef.current.scale,
        panX: session.panX + (event.clientX - session.clientX),
        panY: session.panY + (event.clientY - session.clientY),
      });
      return;
    }

    if (session.mode === "draw-cluster") {
      appendClusterStrokePoint(getLocalPoint(event, svgRef.current, contentGroupRef.current));
      return;
    }

    if (session.mode === "draw" && isDrawingRef.current) {
      appendStrokePoint(getLocalPoint(event, svgRef.current, contentGroupRef.current));
    }
  };

  const finishPointerInteraction = (event?: React.PointerEvent<SVGSVGElement>) => {
    if (event) {
      releasePointer(event);
    }

    pendingSquigglyClusterDragRef.current = null;
    pendingSongDragRef.current = null;

    if (draggingSquigglyClusterRef.current) {
      const session = draggingSquigglyClusterRef.current;
      const previewClusterId = session.clusterIds[0];
      const previewHull = previewClusterId ? squigglyHullPreview[previewClusterId] : undefined;
      const startHull = previewClusterId ? session.startHulls[previewClusterId] : undefined;
      const delta =
        previewHull && startHull && previewHull.length > 0 && startHull.length > 0
          ? {
              x: previewHull[0].x - startHull[0].x,
              y: previewHull[0].y - startHull[0].y,
            }
          : { x: 0, y: 0 };
      let nextCatalog = translateSquigglyClusters(activeCustomCatalog, session.clusterIds, delta);
      nextCatalog = applyDraggedClusterMembershipPriority(nextCatalog, session.primaryClusterId);
      persistCustomCatalog(nextCatalog);
      saveCustomPositions(squigglySongPositionsRef.current);
      draggingSquigglyClusterRef.current = null;
      setSquigglyHullPreview({});
      setStatusMessage("Squiggly cluster moved.");
      if (event && svgRef.current?.hasPointerCapture(event.pointerId)) {
        svgRef.current.releasePointerCapture(event.pointerId);
      }
      return;
    }

    if (draggingSongRef.current) {
      const dragSession = draggingSongRef.current;
      draggingSongRef.current = null;
      const finalPosition = squigglySongPositionsRef.current[dragSession.songId];
      if (finalPosition) {
        saveCustomPositions(squigglySongPositionsRef.current);
        persistCustomCatalog(
          syncSongMembershipForPosition(
            activeCustomCatalog,
            dragSession.songId,
            finalPosition,
            dimensions
          )
        );
      }
      if (event && svgRef.current?.hasPointerCapture(event.pointerId)) {
        svgRef.current.releasePointerCapture(event.pointerId);
      }
      return;
    }

    if (draggingClusterIdRef.current) {
      draggingClusterIdRef.current = null;
      clusterDragSessionRef.current = null;
      endIsolateClusterDrag();
      setStatusMessage(
        skipIsolateCentroidTranslation
          ? "Cluster position saved."
          : "Cluster position saved. Metacluster layout will refresh after 3s of inactivity."
      );
      saveClusterCenterOverridesForScope(activeLayoutScope, clusterOverridesRef.current);
      if (isWebDeployment) {
        publishClusterLayoutRef.current(clusterOverridesRef.current);
      } else {
        void syncClusterLayoutToServer(clusterOverridesRef.current);
      }
      return;
    }

    const session = panSessionRef.current;
    if (session && svgRef.current?.hasPointerCapture(session.pointerId)) {
      svgRef.current.releasePointerCapture(session.pointerId);
    }

    if (!session) {
      return;
    }

    if (session.mode === "box-select" && session.boxEnd) {
      const minX = Math.min(session.graphStart.x, session.boxEnd.x);
      const maxX = Math.max(session.graphStart.x, session.boxEnd.x);
      const minY = Math.min(session.graphStart.y, session.boxEnd.y);
      const maxY = Math.max(session.graphStart.y, session.boxEnd.y);
      const selected = clusterRegions
        .filter(
          (region) =>
            region.center.x >= minX &&
            region.center.x <= maxX &&
            region.center.y >= minY &&
            region.center.y <= maxY
        )
        .map((region) => region.id);
      setSelectedClusterIds(new Set(selected));
      setBoxSelectRect(null);
      setStatusMessage(
        selected.length > 0 ? `Selected ${selected.length} cluster(s).` : "No clusters in selection."
      );
      resetPanSession();
      return;
    }

    if (session.mode === "draw") {
      finishStrokeDrawing();
    }

    if (session.mode === "draw-cluster") {
      finishClusterDrawing();
    }

    resetPanSession();
  };

  const handlePathThresholdChange = (value: number) => {
    setPathThreshold(value);
    savePathThreshold(value);
    if (completedStrokesRef.current.length > 0) {
      const generated = regenerateCueFromStrokes(completedStrokesRef.current, value);
      if (generated) {
        setCue(generated);
        setStatusMessage(`Path threshold ${value}px · ${generated.songs.length} songs in cue.`);
      }
    }
  };

  const applyLoadedLibrary = useCallback(
    (
      loadedSongs: Song[],
      loadedStats: LibraryStats,
      message: string,
      owners: Record<string, string> = {},
      options?: { persist?: boolean }
    ) => {
    const apply = () => {
      invalidatePlaylistOverlapLayoutCache();
      const normalized = normalizeSongs(loadedSongs, loadedStats);
      setSongs(normalized);
      setPlaylistOwners(owners);
      setStats(normalizeStats(loadedStats, normalized));
      if (options?.persist !== false) {
        saveLibrary(musicService, loadedSongs, loadedStats);
      }
      setCue(null);
      setCompletedStrokes([]);
      completedStrokesRef.current = [];
      setActiveStroke([]);
      setStrokeLayoutConfig(null);
      setActivePlaylistName(null);
      setActivePersistentId(null);
      setSelectedSongId(null);
      setPlaybackTrackingEnabled(false);
      playbackTrackingRef.current = { persistentId: null, cueIndex: -1 };
      setStatusMessage(message);
    };

    if (loadedSongs.length >= 500) {
      startTransition(apply);
    } else {
      apply();
    }
  },
  [musicService]
);

  const applyMergedSharedLibrary = useCallback(
    async (contributorIds: string[], contributors: LibraryContributor[]) => {
      if (contributorIds.length === 0) {
        setSharedTrackCount(0);
        return;
      }
      setIsLoadingSharedLibrary(true);
      try {
        const merged = await loadMergedSharedLibrary(contributorIds, includeMockUsers);
        const loaded = toLoadedLibrary(merged);
        setSharedTrackCount(merged.sharedTrackCount);
        const contributorNames = contributors
          .filter((contributor) => contributorIds.includes(contributor.id))
          .map((contributor) => contributor.name)
          .join(" + ");
        const sharedLabel =
          merged.sharedTrackCount > 0 ? ` · ${merged.sharedTrackCount} tracks in common` : "";
        applyLoadedLibrary(
          loaded.songs,
          loaded.stats,
          `Loaded shared library from ${contributorNames} (${loaded.songs.length} tracks${sharedLabel}).`,
          merged.playlistOwners,
          { persist: false }
        );
      } catch (error) {
        setStatusMessage(error instanceof Error ? error.message : "Could not load shared library.");
      } finally {
        setIsLoadingSharedLibrary(false);
      }
    },
    [applyLoadedLibrary, includeMockUsers]
  );

  const applyMergedSharedLibraryPayload = useCallback(
    (merged: Awaited<ReturnType<typeof fetchAllMergedSharedLibrary>>, message: string) => {
      const loaded = toLoadedLibrary(merged);
      startTransition(() => {
        setSharedContributors(merged.contributors);
        setSharedTrackCount(merged.sharedTrackCount);
        applyLoadedLibrary(loaded.songs, loaded.stats, message, merged.playlistOwners, { persist: false });
      });
    },
    [applyLoadedLibrary]
  );

  const loadGuestMergedLibrary = useCallback(
    async (options?: { forceRefresh?: boolean }) => {
      if (!isWebDeployment || musicService !== "spotify") {
        return [];
      }
      if (options?.forceRefresh) {
        guestMergeLoadRef.current = "idle";
      }
      if (guestMergeLoadRef.current === "loading" || guestMergeLoadRef.current === "done") {
        return [];
      }

      guestMergeLoadRef.current = "loading";
      setIsLoadingSharedLibrary(true);
      try {
        const merged = await fetchAllMergedSharedLibrary();
        if (merged.contributors.length === 0) {
          guestMergeLoadRef.current = "idle";
          setSharedTrackCount(0);
          setStatusMessage("No shared libraries published yet.");
          return [];
        }
        const contributorNames = merged.contributors.map((contributor) => contributor.name).join(" + ");
        applyMergedSharedLibraryPayload(
          merged,
          `Loaded shared library from ${contributorNames} (${merged.songs.length} tracks).`
        );
        guestMergeLoadRef.current = "done";
        return merged.contributors;
      } catch (error) {
        guestMergeLoadRef.current = "idle";
        setStatusMessage(error instanceof Error ? error.message : "Could not load shared library.");
        return [];
      } finally {
        setIsLoadingSharedLibrary(false);
      }
    },
    [applyMergedSharedLibraryPayload, musicService]
  );

  useEffect(
    () => () => {
      if (metaBoundsDebounceRef.current) {
        clearTimeout(metaBoundsDebounceRef.current);
      }
    },
    []
  );

  useEffect(() => {
    clearFrozenIsolateBounds();
    setIsolateBoundsRevision((value) => value + 1);
  }, [clearFrozenIsolateBounds, layoutConfig.clusterMode, layoutConfig.viewMode]);

  const refreshSharedContributors = useCallback(
    async (options?: { loadLibrary?: boolean; forceRefresh?: boolean }) => {
      try {
        const isGuest = spotifyStatus?.connected !== true;
        const shouldLoadLibrary =
          options?.loadLibrary ?? (isGuest || songSpaceMode === "shared");

        if (
          isWebDeployment &&
          musicService === "spotify" &&
          isGuest &&
          shouldLoadLibrary
        ) {
          return loadGuestMergedLibrary({ forceRefresh: options?.forceRefresh });
        }

        if (spotifyStatus === null) {
          const contributors = await listSharedContributors(includeMockUsers);
          setSharedContributors(contributors);
          return contributors;
        }

        const contributors = await listSharedContributors(includeMockUsers);
        setSharedContributors(contributors);
        const contributorIds = getAllContributorIds(contributors);

        if (
          isWebDeployment &&
          musicService === "spotify" &&
          contributorIds.length > 0 &&
          shouldLoadLibrary
        ) {
          await applyMergedSharedLibrary(contributorIds, contributors);
        } else if (
          isWebDeployment &&
          musicService === "spotify" &&
          shouldLoadLibrary &&
          contributorIds.length === 0 &&
          !isImportingRef.current
        ) {
          setSharedTrackCount(0);
          setStatusMessage(
            isGuest
              ? "No shared libraries published yet."
              : spotifyStatus?.connected
                ? "No shared libraries published yet. Click Load & share library to publish yours."
                : "No shared libraries published yet. Connect Spotify and use Load & share library."
          );
        } else if (
          isWebDeployment &&
          musicService === "spotify" &&
          spotifyStatus?.connected &&
          songSpaceMode === "mine" &&
          songsRef.current.length === 0
        ) {
          const stored = loadPersonalSpotifyLibrary();
          if (stored.songs.length > 0) {
            applyLoadedLibrary(
              stored.songs,
              stored.stats ?? normalizeStats(null, stored.songs),
              `Restored your library (${stored.songs.length} tracks).`,
              {},
              { persist: true }
            );
          }
        }
        return contributors;
      } catch (error) {
        setStatusMessage(
          error instanceof Error
            ? `Could not load shared libraries: ${error.message}`
            : "Could not load shared libraries."
        );
        return [];
      }
    },
    [
      applyLoadedLibrary,
      applyMergedSharedLibrary,
      includeMockUsers,
      loadGuestMergedLibrary,
      musicService,
      songSpaceMode,
      spotifyStatus,
    ]
  );

  useEffect(() => {
    if (!isWebDeployment || musicService !== "spotify") {
      guestMergeLoadRef.current = "idle";
      return;
    }
    if (spotifyStatus?.connected === true) {
      return;
    }
    const hasPersonalLibrary = loadPersonalSpotifyLibrary().songs.length > 0;
    if (hasPersonalLibrary && songSpaceMode === "mine") {
      return;
    }
    void loadGuestMergedLibrary();
  }, [loadGuestMergedLibrary, musicService, songSpaceMode, spotifyStatus?.connected]);

  useEffect(() => {
    if (
      !isWebDeployment ||
      musicService !== "spotify" ||
      spotifyStatus === null ||
      spotifyStatus.connected
    ) {
      return;
    }
    if (songSpaceMode !== "shared") {
      clearFrozenIsolateBounds();
      setSongSpaceMode("shared");
      saveSongSpaceMode("shared");
      reloadLayoutCaches(getActiveClusterLayoutScope("shared", libraryScopeMode));
    }
  }, [
    clearFrozenIsolateBounds,
    libraryScopeMode,
    musicService,
    reloadLayoutCaches,
    songSpaceMode,
    spotifyStatus,
  ]);

  useEffect(() => {
    if (!isWebDeployment || musicService !== "spotify" || spotifyStatus === null) {
      return;
    }
    void refreshSharedContributors().catch(() => {
      // refreshSharedContributors already surfaces errors in the status line.
    });
  }, [musicService, refreshSharedContributors, spotifyStatus]);

  const handleSongSpaceChange = (mode: SongSpaceMode) => {
    if (mode === songSpaceMode) {
      return;
    }
    if (mode === "mine" && isWebDeployment && musicService === "spotify" && !spotifyStatus?.connected) {
      return;
    }
    clearFrozenIsolateBounds();
    setSongSpaceMode(mode);
    saveSongSpaceMode(mode);
    reloadLayoutCaches(getActiveClusterLayoutScope(mode, libraryScopeMode));
    if (mode === "shared") {
      void refreshSharedContributors({ loadLibrary: true });
    } else if (isWebDeployment && musicService === "spotify") {
      const stored = loadPersonalSpotifyLibrary();
      if (stored.songs.length > 0) {
        applyLoadedLibrary(
          stored.songs,
          stored.stats ?? normalizeStats(null, stored.songs),
          `My song space — ${stored.songs.length} tracks.`,
          {},
          { persist: true }
        );
      } else {
        setSongs([]);
        setStats(normalizeStats(null, []));
        setStatusMessage("My song space — load your library from Spotify to begin.");
      }
    }
    setStatusMessage(
      mode === "mine"
        ? "My song space — your library layout and clusters."
        : "Shared song space — collaborative library view."
    );
  };

  const handleIsolateToggle = () => {
    const nextMode: LibraryScopeMode = libraryScopeMode === "isolate" ? "conglomerate" : "isolate";
    clearFrozenIsolateBounds();
    setLibraryScopeMode(nextMode);
    saveLibraryScopeMode(nextMode);
    reloadLayoutCaches(getActiveClusterLayoutScope(songSpaceMode, nextMode));
    setStatusMessage(
      nextMode === "isolate"
        ? "Isolate on — each contributor keeps their own cluster room inside metaclusters."
        : "Isolate off — one shared conglomerate cluster layout for everyone."
    );
  };

  const handleRefreshSharedLibrary = () => {
    void refreshSharedContributors({ loadLibrary: true, forceRefresh: true });
  };

  const handlePublishSharedLibrary = async () => {
    if (songs.length === 0) {
      setStatusMessage("Load your library before sharing.");
      return;
    }
    const contributor = spotifyStatus?.userId
      ? { id: spotifyStatus.userId, name: spotifyStatus.displayName || "Spotify user" }
      : null;
    if (!contributor) {
      setStatusMessage("Connect Spotify before sharing your library.");
      return;
    }
    setIsImporting(true);
    try {
      const published = await publishSharedLibrary({
        contributor,
        songs,
        stats,
      });
      saveLocalContributorId(published.contributor.id);
      await refreshSharedContributors({ loadLibrary: songSpaceMode === "shared" });
      setStatusMessage(
        `Published ${published.trackCount} tracks as ${published.contributor.name} to the shared library.`
      );
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : "Could not publish shared library.");
    } finally {
      setIsImporting(false);
    }
  };

  const handleMusicServiceChange = (serviceId: MusicServiceId) => {
    if (serviceId === musicService) {
      return;
    }
    setMusicService(serviceId);
    saveMusicService(serviceId);
    const nextLayoutConfig = normalizeLayoutConfigForService(loadLayoutConfig(serviceId), serviceId);
    setLayoutConfig(nextLayoutConfig);
    saveLayoutConfig(nextLayoutConfig);
    setGenreFilter("");
    const library = loadLibrary(serviceId);
    const nextSongs = normalizeSongs(library.songs, library.stats);
    setSongs(nextSongs);
    setStats(normalizeStats(library.stats, nextSongs));
    setCue(null);
    setCompletedStrokes([]);
    completedStrokesRef.current = [];
    setActiveStroke([]);
    setStrokeLayoutConfig(null);
    setActivePlaylistName(null);
    setActivePersistentId(null);
    setSelectedSongId(null);
    setPlaybackTrackingEnabled(false);
    playbackTrackingRef.current = { persistentId: null, cueIndex: -1 };
    setStatusMessage(
      serviceId === "spotify"
        ? "Spotify selected. Connect and load your saved tracks."
        : "Apple Music selected. Load your Library.xml to begin."
    );
  };

  const handleConnectSpotify = async () => {
    if (!musicProvider.connect) {
      return;
    }
    try {
      await musicProvider.connect();
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : "Could not connect to Spotify.");
    }
  };

  const handleLoadSpotifyLibrary = async (options?: { fresh?: boolean }) => {
    if (!musicProvider.loadLibrary) {
      return;
    }
    if (!spotifyCanLoadLibrary) {
      setStatusMessage("Connect Spotify before loading your library.");
      return;
    }
    if (options?.fresh) {
      await clearSpotifyImportSession();
      setImportResumeRevision((revision) => revision + 1);
    }
    setIsImporting(true);
    isImportingRef.current = true;
    if (!options?.fresh && hasResumableSpotifyImport()) {
      setImportProgress({
        phase: "saved-tracks",
        message: getSpotifyImportResumeLabel() ?? "Resuming Spotify import…",
        percent: 15,
      });
      setStatusMessage(getSpotifyImportResumeLabel() ?? "Resuming Spotify import…");
    } else {
      setImportProgress({
        phase: "saved-tracks",
        message: "Loading saved tracks…",
        percent: 3,
      });
    }
    let keepProgress = false;
    try {
      const loaded = await musicProvider.loadLibrary({
        fresh: options?.fresh,
        knownContributor:
          spotifyStatus?.userId
            ? { id: spotifyStatus.userId, name: spotifyStatus.displayName || "Spotify user" }
            : getSpotifyImportContributorHint() ?? undefined,
        onProgress: (progress) => {
          setImportProgress(progress);
          setStatusMessage(progress.message);
        },
      });
      applyLoadedLibrary(
        loaded.songs,
        loaded.stats,
        `Loaded ${loaded.songs.length} saved tracks and ${loaded.stats.playlistIds.length} playlists from Spotify.`,
        loaded.playlistOwners ?? {}
      );
      if (isWebDeployment) {
        try {
          const published = await publishSharedLibrary(
            loaded.contributor
              ? {
                  contributor: loaded.contributor,
                  songs: loaded.songs,
                  stats: loaded.stats,
                }
              : undefined
          );
          saveLocalContributorId(published.contributor.id);
          await refreshSharedContributors({ loadLibrary: songSpaceMode === "shared" });
          setStatusMessage(
            `Loaded and shared ${published.trackCount} tracks as ${published.contributor.name}.`
          );
        } catch (error) {
          setStatusMessage(
            error instanceof Error
              ? `Loaded your library, but sharing failed: ${error.message}`
              : "Loaded your library, but sharing failed."
          );
        }
      }
    } catch (error) {
      if (error instanceof SpotifyImportRateLimitError) {
        keepProgress = true;
        setStatusMessage(error.message);
      } else {
        setStatusMessage(error instanceof Error ? error.message : "Could not load Spotify library.");
      }
    } finally {
      isImportingRef.current = false;
      setIsImporting(false);
      if (!keepProgress) {
        setImportProgress(null);
      }
      setImportResumeRevision((revision) => revision + 1);
    }
  };

  const handleImportFile = async (file: File) => {
    if (!musicProvider.loadLibraryFromFile) {
      return;
    }
    setIsImporting(true);
    try {
      const parsed = await musicProvider.loadLibraryFromFile(file);
      applyLoadedLibrary(
        parsed.songs,
        parsed.stats,
        `Loaded ${parsed.songs.length} tracks and ${parsed.stats.playlistIds.length} playlists from ${file.name}.`
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : "Import failed.";
      setStatusMessage(message);
    } finally {
      setIsImporting(false);
    }
  };

  const clearDrawnPath = () => {
    strokeRef.current = [];
    completedStrokesRef.current = [];
    setCompletedStrokes([]);
    setActiveStroke([]);
    setStrokeLayoutConfig(null);
    setIsDrawingNewPath(false);
    isDrawingRef.current = false;
  };

  const handleClearPaths = () => {
    clearDrawnPath();
    setCue(null);
    setSelectedSongId(null);
    clearUndo();
    setStatusMessage("Cleared drawn paths.");
  };

  const updateLayoutConfig = (nextConfig: LayoutConfig, message?: string) => {
    if (layoutConfigKey(layoutConfig) !== layoutConfigKey(nextConfig)) {
      clearDrawnPath();
    }
    setLayoutConfig(nextConfig);
    saveLayoutConfig(nextConfig);
    if (message) {
      setStatusMessage(message);
    }
  };

  const handleViewModeChange = (viewMode: ViewMode) => {
    const nextConfig = { ...layoutConfig, viewMode };
    if (viewMode === "cluster") {
      const clusterModes = getClusterModesForService(musicService);
      if (!clusterModes.includes(nextConfig.clusterMode)) {
        nextConfig.clusterMode = clusterModes[0];
      }
      updateLayoutConfig(
        nextConfig,
        nextConfig.clusterMode === "playlist"
          ? `Playlist overlap layout (${stats.playlistIds.length} playlists).`
          : "Genre cluster layout — drag labels to move groups."
      );
      return;
    }
    if (musicService === "spotify") {
      updateLayoutConfig(
        { ...nextConfig, axisX: "year", axisY: "year" },
        "Axis layout — year timeline."
      );
      return;
    }
    updateLayoutConfig(nextConfig, "Axis layout — pick X and Y metrics below.");
  };

  const squigglyClustersForRender = useMemo(
    () =>
      squigglyClusters.map((cluster) => ({
        ...cluster,
        hull:
          squigglyHullPreview[cluster.id] ??
          (redrawDraft?.clusterId === cluster.id ? redrawDraft.draftHull : cluster.hull),
      })),
    [redrawDraft, squigglyClusters, squigglyHullPreview]
  );

  const handleClusterModeChange = (clusterMode: ClusterMode) => {
    if (clusterMode !== "custom" && graphTool === "draw-cluster") {
      handleGraphToolChange("navigate");
    }
    const message =
      clusterMode === "playlist"
        ? `Playlist overlap layout (${stats.playlistIds.length} playlists).`
        : clusterMode === "custom"
          ? "Custom clusters — create groups and assign songs."
          : "Genre cluster layout — drag labels to move groups.";
    updateLayoutConfig({ ...layoutConfig, viewMode: "cluster", clusterMode }, message);
  };

  const handleAxisMetricChange = (axis: "axisX" | "axisY", metric: AxisMetric) => {
    const allowedMetrics = getAxisMetricsForService(musicService);
    if (!allowedMetrics.includes(metric)) {
      return;
    }
    const nextConfig = { ...layoutConfig, viewMode: "axis" as const, [axis]: metric };
    updateLayoutConfig(
      nextConfig,
      `Axis layout: ${getAxisMetricLabel(nextConfig.axisX, musicService)} × ${getAxisMetricLabel(nextConfig.axisY, musicService)}.`
    );
  };

  const handleOpenExportDialog = () => {
    if (!cue) {
      return;
    }
    setExportPlaylistName(defaultExportPlaylistName());
    setExportDialogOpen(true);
  };

  const handleCloseExportDialog = () => {
    if (isExportingPlaylist) {
      return;
    }
    setExportDialogOpen(false);
  };

  const isWebAppleMusic = isWebDeployment && musicService === "apple-music";
  const isWebSpotify = isWebDeployment && musicService === "spotify";
  const canUseSpotifyApi = !isWebSpotify || (spotifyStatus?.connected === true && !spotifyUseLocalExport);
  const useSpotifyLocalExport = isWebSpotify && !canUseSpotifyApi;
  const showMySongSpace = !isWebSpotify || spotifyStatus?.connected === true;

  const exportTerminalCommand = useMemo(() => {
    if (!cue || !isWebAppleMusic) {
      return "";
    }
    const playlistName = exportPlaylistName.trim() || defaultExportPlaylistName();
    return buildTerminalSavePlaylistCommand(toCueTracks(cue.songs), playlistName);
  }, [cue, exportPlaylistName, isWebAppleMusic]);

  const exportSpotifyLinksText = useMemo(() => {
    if (!cue || !useSpotifyLocalExport) {
      return "";
    }
    return buildSpotifyCueUrlList(cue.songs);
  }, [cue, useSpotifyLocalExport]);

  const exportSpotifyTerminalCommand = useMemo(() => {
    if (!cue || !useSpotifyLocalExport) {
      return "";
    }
    return buildTerminalPlaySpotifyCueCommand(cue.songs);
  }, [cue, useSpotifyLocalExport]);

  const handleCopyExportCommand = async () => {
    if (useSpotifyLocalExport) {
      if (!exportSpotifyLinksText) {
        return;
      }
      await copyTextToClipboard(exportSpotifyLinksText);
      setStatusMessage("Copied Spotify track links. Import them at tunemymusic.com to play in your account.");
      return;
    }
    if (!exportTerminalCommand) {
      return;
    }
    await copyTextToClipboard(exportTerminalCommand);
    setStatusMessage("Copied Music.app playlist command. Paste into Terminal on your Mac.");
  };

  const handleCopySpotifyPlayCommand = async () => {
    if (!exportSpotifyTerminalCommand) {
      return;
    }
    await copyTextToClipboard(exportSpotifyTerminalCommand);
    setStatusMessage("Copied Spotify play command. Paste into Terminal on your Mac (starts the cue in the desktop app).");
  };

  const handleDownloadSpotifyCue = () => {
    if (!cue) {
      return;
    }
    const content = buildSpotifyCueDownloadText(cue.songs);
    if (!content.trim()) {
      setStatusMessage("No Spotify track IDs in this cue.");
      return;
    }
    downloadTextFile("music-cue-spotify.txt", content);
    setStatusMessage("Downloaded Spotify cue file with import instructions and track links.");
  };

  const handleDownloadSpotifyCueCsv = () => {
    if (!cue) {
      return;
    }
    const content = buildSpotifyCueCsv(cue.songs);
    if (!content.trim()) {
      setStatusMessage("No Spotify track IDs in this cue.");
      return;
    }
    downloadTextFile("music-cue-spotify.csv", content);
    setStatusMessage("Downloaded CSV for playlist import tools (e.g. TuneMyMusic).");
  };

  const handleSavePlaylist = async () => {
    if (!cue) {
      return;
    }
    const playlistName = exportPlaylistName.trim();
    if (!playlistName) {
      setStatusMessage("Enter a playlist name.");
      return;
    }

    if (isWebAppleMusic) {
      await copyTextToClipboard(exportTerminalCommand);
      setStatusMessage(`Copied terminal command for playlist "${playlistName}". Paste into Terminal on your Mac.`);
      setExportDialogOpen(false);
      return;
    }

    if (useSpotifyLocalExport) {
      if (!exportSpotifyLinksText) {
        setStatusMessage("No Spotify track IDs in this cue.");
        return;
      }
      await copyTextToClipboard(exportSpotifyLinksText);
      setStatusMessage(
        `Copied ${cue.songs.length} Spotify links for "${playlistName}". Import at tunemymusic.com to add them to your account.`
      );
      setExportDialogOpen(false);
      return;
    }

    setIsExportingPlaylist(true);
    try {
      const result = await musicProvider.savePlaylist(cue.songs, playlistName);
      const missing = new Set(
        cue.songs.filter((song) => !result.matchedTrackIds.includes(song.id)).map((song) => song.id)
      );
      setUnavailableSongIds((current) => new Set([...current, ...missing]));
      const missingCount = result.requestedCount - result.matchedCount;
      if (missingCount > 0) {
        setStatusMessage(
          `Exported playlist "${result.playlistName}" with ${result.matchedCount} of ${result.requestedCount} tracks (${missingCount} not in library).`
        );
      } else {
        setStatusMessage(`Exported playlist "${result.playlistName}" with ${result.matchedCount} tracks.`);
      }
      setExportDialogOpen(false);
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : "Could not save playlist.");
    } finally {
      setIsExportingPlaylist(false);
    }
  };

  const handlePlayCue = async () => {
    if (!cue) {
      return;
    }
    if (isWebAppleMusic) {
      try {
        const command = buildTerminalPlayCueCommand(toCueTracks(cue.songs));
        await copyTextToClipboard(command);
        setStatusMessage(
          `Copied play command for ${cue.songs.length} tracks. Paste into Terminal on your Mac (Music.app will open).`
        );
      } catch (error) {
        setStatusMessage(error instanceof Error ? error.message : "Could not copy play command.");
      }
      return;
    }
    if (useSpotifyLocalExport) {
      const links = buildSpotifyCueUrlList(cue.songs);
      if (!links) {
        setStatusMessage("No Spotify track IDs in this cue.");
        return;
      }
      await copyTextToClipboard(links);
      setStatusMessage(
        `Copied ${cue.songs.length} Spotify links. Paste into TuneMyMusic (tunemymusic.com) to create a playlist in your account, then play it in Spotify.`
      );
      return;
    }
    try {
      const result = await musicProvider.playCue(cue.songs);
      setActivePlaylistName(result.playlistName);
      const firstTrackId = result.matchedTrackIds[0] ?? null;
      setActivePersistentId(firstTrackId);
      setPlaybackTrackingEnabled(musicProvider.supportsPlaybackTracking);
      playbackTrackingRef.current = {
        persistentId: firstTrackId,
        cueIndex: firstTrackId ? cue.songs.findIndex((song) => song.id === firstTrackId) : -1,
      };
      const missing = new Set(
        cue.songs.filter((song) => !result.matchedTrackIds.includes(song.id)).map((song) => song.id)
      );
      setUnavailableSongIds((current) => new Set([...current, ...missing]));
      const missingCount = result.requestedCount - result.matchedCount;
      if (missingCount > 0) {
        setStatusMessage(
          `Playing ${result.matchedCount} of ${result.requestedCount} tracks in ${musicProvider.displayName} (${missingCount} unavailable).`
        );
      } else {
        setStatusMessage(
          musicService === "spotify"
            ? `Playing ${result.matchedCount} tracks in Spotify. Queue editing is limited — export when done.`
            : `Playing ${result.matchedCount} tracks in Music.app. Edit the queue in Music; export when done.`
        );
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not play cue.";
      if (isWebSpotify && message.toLowerCase().includes("allowlist")) {
        const links = buildSpotifyCueUrlList(cue.songs);
        if (links) {
          await copyTextToClipboard(links);
          setSpotifyUseLocalExport(true);
          setStatusMessage(
            "This Spotify account isn't allowlisted for in-browser playback yet. Copied track links — import at tunemymusic.com or use Export for Spotify."
          );
          return;
        }
      }
      setStatusMessage(message);
    }
  };

  const handleClear = () => {
    handleClearPaths();
    setActivePlaylistName(null);
    setActivePersistentId(null);
    setPlaybackTrackingEnabled(false);
    playbackTrackingRef.current = { persistentId: null, cueIndex: -1 };
    setStatusMessage("Cleared graph path and cue.");
  };

  const strokePaths = useMemo(() => {
    const segments = [...completedStrokes];
    if (activeStroke.length > 0) {
      segments.push(activeStroke);
    }

    const paths: string[] = [];
    let connectedPoints: NormalizedPoint[] = [];

    const pointsEquivalent = (a: NormalizedPoint, b: NormalizedPoint) =>
      Math.hypot(a.x - b.x, a.y - b.y) < 0.002;

    const flushPath = () => {
      if (connectedPoints.length < 2) {
        connectedPoints = [];
        return;
      }
      paths.push(
        connectedPoints
          .map((point, index) => {
            const graphPoint = fromNormalizedPosition(point, dimensions);
            return `${index === 0 ? "M" : "L"} ${graphPoint.x.toFixed(1)} ${graphPoint.y.toFixed(1)}`;
          })
          .join(" ")
      );
      connectedPoints = [];
    };

    segments.forEach((segment) => {
      if (segment.length === 0) {
        return;
      }
      if (connectedPoints.length === 0) {
        connectedPoints = [...segment];
        return;
      }
      const last = connectedPoints[connectedPoints.length - 1];
      const first = segment[0];
      if (pointsEquivalent(last, first)) {
        connectedPoints.push(...segment.slice(1));
      } else {
        flushPath();
        connectedPoints = [...segment];
      }
    });
    flushPath();
    return paths;
  }, [activeStroke, completedStrokes, dimensions]);

  const hoveredSong = hoveredSongId
    ? songs.find((song) => song.id === getCanonicalSongId(hoveredSongId))
    : undefined;

  const collaboratorDisplayName = spotifyStatus?.displayName?.trim() || "Guest";
  const isLikelySpotifyGuest =
    isWebDeployment && musicService === "spotify" && spotifyStatus?.connected !== true;
  const guestGraphBusy = isLikelySpotifyGuest && isLoadingSharedLibrary;

  const collaborativeViewSettings = useMemo<CollaborativeViewSettings>(
    () => ({
      layoutConfig,
      libraryScopeMode,
      songSpaceMode,
      includeMockUsers,
      viewTransform,
    }),
    [includeMockUsers, layoutConfig, libraryScopeMode, songSpaceMode, viewTransform]
  );

  const applySyncViewSettings = useCallback(
    (settings: CollaborativeViewSettings) => {
      const isSpotifyGuest =
        isWebDeployment && musicService === "spotify" && spotifyStatus !== null && !spotifyStatus.connected;
      const resolvedSongSpaceMode =
        isSpotifyGuest && settings.songSpaceMode !== "shared" ? "shared" : settings.songSpaceMode;
      const nextLayoutConfig = normalizeLayoutConfigForService(settings.layoutConfig, musicService);

      startTransition(() => {
        setLayoutConfig(nextLayoutConfig);
        saveLayoutConfig(nextLayoutConfig);
        setViewTransform(settings.viewTransform);

        if (resolvedSongSpaceMode !== songSpaceMode) {
          clearFrozenIsolateBounds();
          setSongSpaceMode(resolvedSongSpaceMode);
          saveSongSpaceMode(resolvedSongSpaceMode);
        }
        if (settings.libraryScopeMode !== libraryScopeMode) {
          clearFrozenIsolateBounds();
          setLibraryScopeMode(settings.libraryScopeMode);
          saveLibraryScopeMode(settings.libraryScopeMode);
        }
        reloadLayoutCaches(
          getActiveClusterLayoutScope(resolvedSongSpaceMode, settings.libraryScopeMode)
        );
      });

      setStatusMessage("Synced view with collaborator.");
    },
    [
      clearFrozenIsolateBounds,
      libraryScopeMode,
      musicService,
      reloadLayoutCaches,
      songSpaceMode,
      spotifyStatus,
    ]
  );

  return (
    <CollaborativeLayoutProvider
      clusterOverrides={clusterOverrides}
      setClusterOverrides={setClusterOverrides}
      draggingClusterIdRef={draggingClusterIdRef}
      layoutScope={activeLayoutScope === "custom" ? "isolate" : activeLayoutScope}
      enableRemoteClusterPublish={!isSpotifyGuest}
    >
      <CollaborativeSessionProvider
        displayName={collaboratorDisplayName}
        viewSettings={collaborativeViewSettings}
        onSyncViewSettings={applySyncViewSettings}
        enabled={!isSpotifyGuest || songs.length > 0}
      >
      <ClusterLayoutPublisher publishRef={publishClusterLayoutRef} />
      <GraphCursorPublisherBridge publishRef={setGraphCursorRef} />
      <div className="music-cue-layout">
      {exportDialogOpen && (
        <div className="music-cue-modal-backdrop" onClick={handleCloseExportDialog}>
          <div
            className="music-cue-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="music-cue-export-dialog-title"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="music-cue-modal-titlebar">
              <span id="music-cue-export-dialog-title" className="music-cue-modal-title">
                {isWebAppleMusic
                  ? "Copy Music.app command"
                  : useSpotifyLocalExport
                    ? "Export cue to your Spotify"
                    : "Export playlist"}
              </span>
            </div>
            <div className="music-cue-modal-body">
              <label className="music-cue-modal-field">
                Playlist name
                <input
                  type="text"
                  value={exportPlaylistName}
                  onChange={(event) => setExportPlaylistName(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && !isExportingPlaylist) {
                      event.preventDefault();
                      void handleSavePlaylist();
                    }
                  }}
                  autoFocus
                  disabled={isExportingPlaylist}
                />
              </label>
              {isWebAppleMusic && (
                <>
                  <p className="music-cue-modal-hint">
                    Paste this into Terminal on your Mac. It creates the playlist in Music.app using the
                    persistent IDs from your Library.xml import.
                  </p>
                  <textarea
                    className="music-cue-terminal-command"
                    readOnly
                    value={exportTerminalCommand}
                    rows={10}
                    onFocus={(event) => event.currentTarget.select()}
                  />
                </>
              )}
              {useSpotifyLocalExport ? (
                <>
                  <p className="music-cue-modal-hint">
                    Spotify&apos;s developer allowlist blocks in-browser playback for guests. Copy the track
                    links below and import them at{" "}
                    <a href="https://www.tunemymusic.com/transfer" target="_blank" rel="noreferrer">
                      TuneMyMusic
                    </a>{" "}
                    to create a playlist in your own Spotify account. On a Mac with the Spotify desktop app,
                    you can also copy the Terminal play command to start the first track.
                  </p>
                  <textarea
                    className="music-cue-terminal-command"
                    readOnly
                    value={exportSpotifyLinksText}
                    rows={10}
                    onFocus={(event) => event.currentTarget.select()}
                  />
                  {exportSpotifyTerminalCommand ? (
                    <textarea
                      className="music-cue-terminal-command"
                      readOnly
                      value={exportSpotifyTerminalCommand}
                      rows={6}
                      onFocus={(event) => event.currentTarget.select()}
                    />
                  ) : null}
                </>
              ) : null}
            </div>
            <div className="music-cue-modal-actions">
              {isWebAppleMusic ? (
                <button
                  type="button"
                  onClick={() => void handleCopyExportCommand()}
                  disabled={!exportTerminalCommand}
                >
                  Copy command
                </button>
              ) : useSpotifyLocalExport ? (
                <>
                  <button
                    type="button"
                    onClick={() => void handleCopyExportCommand()}
                    disabled={!exportSpotifyLinksText}
                  >
                    Copy links
                  </button>
                  <button type="button" onClick={handleDownloadSpotifyCue} disabled={!exportSpotifyLinksText}>
                    Download .txt
                  </button>
                  <button type="button" onClick={handleDownloadSpotifyCueCsv} disabled={!exportSpotifyLinksText}>
                    Download .csv
                  </button>
                  {exportSpotifyTerminalCommand ? (
                    <button type="button" onClick={() => void handleCopySpotifyPlayCommand()}>
                      Copy Mac play command
                    </button>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => void handleSavePlaylist()}
                    disabled={!exportPlaylistName.trim() || !exportSpotifyLinksText}
                  >
                    Copy links &amp; close
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  onClick={() => void handleSavePlaylist()}
                  disabled={isExportingPlaylist || !exportPlaylistName.trim()}
                >
                  {isExportingPlaylist ? "Exporting…" : "OK"}
                </button>
              )}
              <button type="button" onClick={handleCloseExportDialog} disabled={isExportingPlaylist}>
                {isWebAppleMusic || useSpotifyLocalExport ? "Close" : "Cancel"}
              </button>
            </div>
          </div>
        </div>
      )}

      {desktopHelpOpen && (
        <div className="music-cue-modal-backdrop" onClick={() => setDesktopHelpOpen(false)}>
          <div
            className="music-cue-modal music-cue-modal-wide"
            role="dialog"
            aria-modal="true"
            aria-labelledby="music-cue-desktop-help-title"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="music-cue-modal-titlebar">
              <span id="music-cue-desktop-help-title" className="music-cue-modal-title">
                Music Cue for Mac
              </span>
            </div>
            <div className="music-cue-modal-body">
              <p className="music-cue-modal-hint">
                The website can visualize your library and build cues. The Mac app adds one-click play,
                export, and live playback tracking in Music.app.
              </p>
              <ol className="music-cue-desktop-steps">
                {DESKTOP_APP_STEPS.map((step) => (
                  <li key={step}>{step}</li>
                ))}
              </ol>
              <p className="music-cue-modal-hint">
                On the web, use <strong>Copy play command</strong> or <strong>Copy playlist command</strong>{" "}
                to run a cue in Terminal without installing anything.
              </p>
            </div>
            <div className="music-cue-modal-actions">
              <button type="button" onClick={() => setDesktopHelpOpen(false)}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="music-cue-toolbar">
        <div className="music-cue-toolbar-row">
          <div className="music-cue-toolbar-primary">
            <p className="music-cue-status">
              {statusMessage}
              <CollaborativeParticipantsPanel />
            </p>
            <p className="music-cue-meta">
              Showing {visibleSongs.length} of {songs.length} tracks
              {isValidatingLibrary
                ? ` · checking ${musicProvider.displayName} library…`
                : unavailableSongIds.size > 0
                  ? ` · ${unavailableSongIds.size} unavailable (red)`
                  : ""}
              {sharedTrackCount > 0 ? ` · ${sharedTrackCount} in common` : ""}
              {isLoadingSharedLibrary ? " · refreshing shared library…" : ""}
              {musicService === "spotify" && spotifyStatus
                ? spotifyStatus.connected
                  ? " · Spotify connected"
                  : spotifyStatus.configured
                    ? " · Spotify not connected"
                    : " · Spotify not configured on server"
                : ""}
              {visibleSongs.length > LABEL_THRESHOLD ? " · hover nodes for titles" : ""}
              {graphTool === "draw"
                ? " · drag to draw path · scroll or pinch to zoom"
                : graphTool === "draw-cluster"
                  ? " · drag to draw squiggly cluster loop · scroll or pinch to zoom"
                  : " · drag to pan · scroll or pinch to zoom"}
              {graphTool === "navigate" && isClusterLayout && !isSquigglyCustomMode && !isGuestViewOnly
                ? " · drag labels to move clusters · ⌘⇧ drag to box-select"
                : ""}
            </p>
          </div>

          <div className="music-cue-service-toggle" role="group" aria-label="Music service">
            <button
              type="button"
              className={musicService === "apple-music" ? "music-cue-layout-active" : ""}
              onClick={() => handleMusicServiceChange("apple-music")}
            >
              Apple Music
            </button>
            <button
              type="button"
              className={musicService === "spotify" ? "music-cue-layout-active" : ""}
              onClick={() => handleMusicServiceChange("spotify")}
            >
              Spotify
            </button>
          </div>

          {musicService === "apple-music" ? (
            <>
              <label className="music-cue-file-button">
                {isImporting ? "Importing…" : "Load Library.xml"}
                <input
                  type="file"
                  accept=".xml,text/xml"
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (file) {
                      void handleImportFile(file);
                    }
                    event.currentTarget.value = "";
                  }}
                />
              </label>
              {isWebAppleMusic && (
                <button type="button" onClick={() => setDesktopHelpOpen(true)}>
                  Mac app setup
                </button>
              )}
            </>
          ) : (
            <div className="music-cue-spotify-actions">
              <button
                type="button"
                onClick={() => void handleConnectSpotify()}
                disabled={spotifyStatus?.configured === false}
              >
                {spotifyStatus?.connected ? "Reconnect Spotify" : "Connect Spotify"}
              </button>
              <button
                type="button"
                onClick={() => void handleLoadSpotifyLibrary()}
                disabled={isImporting || spotifyStatusLoading || !spotifyCanLoadLibrary}
                title={
                  spotifyStatusLoading
                    ? "Checking Spotify connection…"
                    : !spotifyCanLoadLibrary
                      ? "Connect Spotify first"
                      : spotifyImportResumeLabel ?? undefined
                }
              >
                {isImporting
                  ? "Loading…"
                  : spotifyStatusLoading
                    ? "Checking Spotify…"
                    : spotifyImportResumeLabel
                      ? "Resume load & share"
                      : "Load & share library"}
              </button>
              {spotifyImportResumeLabel && !isImporting && spotifyCanLoadLibrary ? (
                <button
                  type="button"
                  onClick={() => void handleLoadSpotifyLibrary({ fresh: true })}
                  disabled={!spotifyCanLoadLibrary}
                  title={spotifyImportResumeLabel}
                >
                  Start fresh
                </button>
              ) : null}
              {isWebDeployment && spotifyStatus?.connected ? (
                <button type="button" onClick={() => void handlePublishSharedLibrary()} disabled={isImporting}>
                  {isImporting ? "Publishing…" : "Re-share library"}
                </button>
              ) : null}
              {isWebDeployment ? (
                <button type="button" onClick={handleRefreshSharedLibrary} disabled={isLoadingSharedLibrary}>
                  {isLoadingSharedLibrary ? "Refreshing…" : "Refresh shared"}
                </button>
              ) : null}
            </div>
          )}

          {musicService === "spotify" && importProgress ? (
            <div className="music-cue-import-progress" aria-live="polite">
              <div className="music-cue-import-progress__track">
                <div
                  className="music-cue-import-progress__bar"
                  style={{ width: `${Math.max(4, Math.min(100, importProgress.percent))}%` }}
                />
              </div>
              <div className="music-cue-import-progress__label">
                {importProgress.message} ({Math.round(importProgress.percent)}%)
              </div>
            </div>
          ) : null}

          {isWebDeployment && musicService === "spotify" ? (
            <div className="music-cue-shared-controls">
              <div className="music-cue-layout-toggle music-cue-scope-toggle" role="group" aria-label="Song space">
                {showMySongSpace ? (
                  <button
                    type="button"
                    className={songSpaceMode === "mine" ? "music-cue-layout-active" : ""}
                    onClick={() => handleSongSpaceChange("mine")}
                  >
                    My song space
                  </button>
                ) : null}
                <button
                  type="button"
                  className={songSpaceMode === "shared" ? "music-cue-layout-active" : ""}
                  onClick={() => handleSongSpaceChange("shared")}
                >
                  Shared song space
                </button>
              </div>
              {songSpaceMode === "shared" ? (
                <label className="music-cue-contributor-option">
                  <input
                    type="checkbox"
                    checked={libraryScopeMode === "isolate"}
                    onChange={handleIsolateToggle}
                  />
                  <span>Isolate contributors</span>
                </label>
              ) : null}
            </div>
          ) : null}

          <div className="music-cue-layout-toggle" role="group" aria-label="View mode">
            <button
              type="button"
              className={layoutConfig.viewMode === "cluster" ? "music-cue-layout-active" : ""}
              onClick={() => handleViewModeChange("cluster")}
            >
              Cluster
            </button>
            <button
              type="button"
              className={layoutConfig.viewMode === "axis" ? "music-cue-layout-active" : ""}
              onClick={() => handleViewModeChange("axis")}
            >
              Axis
            </button>
          </div>

          {layoutConfig.viewMode === "cluster" ? (
            <>
              <div className="music-cue-layout-toggle" role="group" aria-label="Cluster grouping">
                {getClusterModesForService(musicService).map((clusterMode) => (
                  <button
                    key={clusterMode}
                    type="button"
                    className={layoutConfig.clusterMode === clusterMode ? "music-cue-layout-active" : ""}
                    onClick={() => handleClusterModeChange(clusterMode)}
                  >
                    {clusterMode === "genre"
                      ? "Genre"
                      : clusterMode === "playlist"
                        ? "Playlists"
                        : "Custom"}
                  </button>
                ))}
              </div>
              {layoutConfig.clusterMode === "custom" && isSquigglyCustomMode ? (
                <span className="music-cue-axis-note">
                  {isGuestViewOnly
                    ? "Custom clusters are view-only for guests."
                    : "Use the square tool to draw clusters · click a cluster to edit it in the side panel"}
                </span>
              ) : null}
            </>
          ) : musicService === "spotify" ? (
            <p className="music-cue-axis-note">Year timeline — songs spread left to right by release year.</p>
          ) : (
            <div className="music-cue-filters music-cue-axis-selectors">
              <label>
                X axis
                <select
                  value={layoutConfig.axisX}
                  onChange={(event) => handleAxisMetricChange("axisX", event.target.value as AxisMetric)}
                >
                  {getAxisMetricsForService(musicService).map((metric) => (
                    <option key={metric} value={metric}>
                      {getAxisMetricLabel(metric, musicService)}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Y axis
                <select
                  value={layoutConfig.axisY}
                  onChange={(event) => handleAxisMetricChange("axisY", event.target.value as AxisMetric)}
                >
                  {getAxisMetricsForService(musicService).map((metric) => (
                    <option key={metric} value={metric}>
                      {getAxisMetricLabel(metric, musicService)}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          )}
        </div>

        <div className="music-cue-toolbar-row music-cue-toolbar-row-filters">
          <div className="music-cue-filters music-cue-toolbar-filters">
            <label>
              Search
              <input value={searchFilter} onChange={(event) => setSearchFilter(event.target.value)} placeholder="title, artist, album" />
            </label>
            {musicService === "apple-music" && (
              <label>
                Genre
                <select value={genreFilter} onChange={(event) => setGenreFilter(event.target.value)}>
                  <option value="">All genres</option>
                  {stats.genres.map((genre) => (
                    <option key={genre} value={genre}>
                      {genre}
                    </option>
                  ))}
                </select>
              </label>
            )}
            {musicService === "apple-music" && (
              <label>
                Min plays
                <input
                  type="number"
                  min="0"
                  value={minPlayCount}
                  onChange={(event) => setMinPlayCount(event.target.value)}
                />
              </label>
            )}
          </div>
        </div>
      </div>

      <div className="music-cue-workspace">
        <div className="music-cue-graph-panel" ref={graphPanelRef}>
          {guestGraphBusy ? (
            <div className="music-cue-graph-loading-overlay" aria-live="polite">
              {isLoadingSharedLibrary ? "Loading shared library…" : "Preparing graph…"}
            </div>
          ) : null}
          <div className="music-cue-graph-tools-overlay" role="toolbar" aria-label="Graph tools">
            <button
              type="button"
              className={`music-cue-graph-tool-btn ${graphTool === "navigate" ? "is-active" : ""}`}
              onClick={() => handleGraphToolChange("navigate")}
              title="Navigate"
              aria-label="Navigate"
              aria-pressed={graphTool === "navigate"}
            >
              <svg viewBox="0 0 16 16" aria-hidden>
                <path
                  d="M5.5 7.5V4.8c0-.7.6-1.3 1.3-1.3.4 0 .8.2 1 .5.2-.3.6-.5 1-.5.7 0 1.3.6 1.3 1.3V7.5M8.5 7.5V4.3c0-.7.6-1.3 1.3-1.3.7 0 1.3.6 1.3 1.3v4.2c0 2.2-1.8 4-4 4s-4-1.8-4-4V6.8c0-.7.6-1.3 1.3-1.3.7 0 1.3.6 1.3 1.3v.7"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.1"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>
            <button
              type="button"
              className={`music-cue-graph-tool-btn ${graphTool === "draw" ? "is-active" : ""}`}
              onClick={() => handleGraphToolChange("draw")}
              title="Draw path"
              aria-label="Draw path"
              aria-pressed={graphTool === "draw"}
            >
              <svg viewBox="0 0 16 16" aria-hidden>
                <path
                  d="M11.8 2.2 13.8 4.2 5.6 12.4 2.4 13.6 3.6 10.4 11.8 2.2z"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.2"
                  strokeLinejoin="round"
                />
                <path d="M10.6 3.4 12.6 5.4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
              </svg>
            </button>
            {graphTool === "draw" ? (
              <button
                type="button"
                className="music-cue-graph-tool-btn"
                onClick={handleUndo}
                disabled={!canUndo}
                title="Undo ⌘Z"
                aria-label="Undo"
              >
                <svg viewBox="0 0 16 16" aria-hidden>
                  <path
                    d="M3.5 4.5H10a3.5 3.5 0 1 1 0 7H8.5M3.5 4.5 5.5 2.5M3.5 4.5 5.5 6.5"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </button>
            ) : null}
            {isSquigglyCustomMode && !isGuestViewOnly ? (
              <>
                <button
                  type="button"
                  className={`music-cue-graph-tool-btn ${graphTool === "draw-cluster" ? "is-active" : ""}`}
                  onClick={() => handleGraphToolChange("draw-cluster")}
                  title="Draw squiggly cluster"
                  aria-label="Draw squiggly cluster"
                  aria-pressed={graphTool === "draw-cluster"}
                >
                  <svg viewBox="0 0 16 16" aria-hidden>
                    <polygon
                      points="8,2.8 12.2,5.8 10.8,11.2 5.2,11.2 3.8,5.8"
                      fill="currentColor"
                      fillOpacity="0.12"
                      stroke="currentColor"
                      strokeWidth="1.2"
                      strokeLinejoin="round"
                    />
                    <circle cx="8" cy="2.8" r="0.9" fill="currentColor" />
                    <circle cx="12.2" cy="5.8" r="0.9" fill="currentColor" />
                    <circle cx="10.8" cy="11.2" r="0.9" fill="currentColor" />
                    <circle cx="5.2" cy="11.2" r="0.9" fill="currentColor" />
                    <circle cx="3.8" cy="5.8" r="0.9" fill="currentColor" />
                  </svg>
                </button>
              </>
            ) : null}
          </div>
          {graphTool === "draw" ? (
            <button
              type="button"
              className="music-cue-graph-tool-btn music-cue-graph-clear-btn"
              onClick={handleClearPaths}
              title="Clear paths"
              aria-label="Clear paths"
            >
              <svg viewBox="0 0 16 16" aria-hidden>
                <path d="M4 4 12 12M12 4 4 12" stroke="#c00000" strokeWidth="1.6" strokeLinecap="round" />
              </svg>
            </button>
          ) : null}
          <CollaborativeCursorsOverlay
            graphPanelRef={graphPanelRef}
            svgRef={svgRef}
            dimensions={dimensions}
            viewTransform={viewTransform}
          />
          <svg
            ref={svgRef}
            className={`music-cue-graph music-cue-graph-${graphTool} ${isPanning ? "music-cue-graph-panning" : ""}`}
            width={dimensions.width}
            height={dimensions.height}
            onPointerDown={handleGraphPointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={(event) => finishPointerInteraction(event)}
            onPointerCancel={(event) => finishPointerInteraction(event)}
            onPointerLeave={(event) => {
              if (event.buttons === 0) {
                finishPointerInteraction(event);
              }
            }}
          >
            <g ref={contentGroupRef} transform={toViewTransformString(viewTransform)}>
              <rect
                ref={bgRectRef}
                width={dimensions.width}
                height={dimensions.height}
                fill="#ffffff"
                onPointerDown={handleBackgroundPointerDown}
              />
              <text x={dimensions.width / 2} y={22} className="music-cue-axis-label">
                {axisLabels.x}
              </text>
              {axisLabels.y && (
                <text x={16} y={dimensions.height / 2} className="music-cue-axis-label music-cue-axis-label-vertical">
                  {axisLabels.y}
                </text>
              )}

              {boxSelectRect && (
                <rect
                  x={Math.min(boxSelectRect.x1, boxSelectRect.x2)}
                  y={Math.min(boxSelectRect.y1, boxSelectRect.y2)}
                  width={Math.abs(boxSelectRect.x2 - boxSelectRect.x1)}
                  height={Math.abs(boxSelectRect.y2 - boxSelectRect.y1)}
                  className="music-cue-box-select"
                  pointerEvents="none"
                />
              )}

              {showClusterDecorations && fadingClusterSnapshot?.regions.map((region) => (
                <path
                  key={`fading-region-${region.id}`}
                  d={region.hullPath}
                  className="music-cue-cluster-region"
                  fill={region.fill}
                  stroke={region.stroke}
                  opacity={fadingClusterSnapshot.opacity}
                  pointerEvents="none"
                />
              ))}

              {isClusterLayout &&
                clusterRegions.map((region) => (
                  <path
                    key={`region-${region.id}`}
                    d={region.hullPath}
                    className="music-cue-cluster-region"
                    fill={region.fill}
                    stroke={region.stroke}
                    opacity={effectiveClusterRevealOpacity}
                    pointerEvents="none"
                  />
                ))}

              {strokePaths.map((path, index) => (
                <path
                  key={`stroke-${index}`}
                  d={path}
                  className={`music-cue-stroke ${
                    isDrawingNewPath && index === strokePaths.length - 1 ? "music-cue-stroke-drafting" : ""
                  }`}
                />
              ))}
              {showPathOverlays && cueEdgePath && !isDrawingNewPath && (
                <path d={cueEdgePath} className="music-cue-edge-path" />
              )}

              {isSquigglyCustomMode ? (
                <SquigglyClusterLayer
                  clusters={squigglyClustersForRender}
                  dimensions={dimensions}
                  hoveredClusterId={hoveredSquigglyClusterId}
                  selectedClusterIds={selectedClusterIds}
                  redrawDraft={redrawDraft}
                  activeDrawStroke={clusterDrawStroke}
                  readOnly={isGuestViewOnly}
                  onClusterPointerDown={handleSquigglyClusterPointerDown}
                  onClusterDoubleClick={handleSquigglyClusterDoubleClick}
                  onClusterHover={setHoveredSquigglyClusterId}
                  onAcceptRedraw={acceptRedrawDraft}
                  onRejectRedraw={rejectRedrawDraft}
                />
              ) : null}

              {positionedSongs.map(({ song, position }) => {
                const canonicalId = getCanonicalSongId(song.id);
                const inCue = cue?.songs.some((entry) => entry.id === canonicalId);
                const isUnavailable = unavailableSongIds.has(canonicalId);
                const isSelected = selectedSongId === canonicalId;
                const nodeFill = songNodeFills.get(song.id) ?? "#000080";
                const radius = renderGraphSongs.length > 1000 ? 2 : renderGraphSongs.length > 400 ? 2 : 3;
                const isLargeLibrary = renderGraphSongs.length >= 500;
                return (
                  <g
                    key={song.id}
                    transform={`translate(${position.x}, ${position.y})`}
                    onMouseEnter={
                      isLargeLibrary ? undefined : () => setHoveredSongId(song.id)
                    }
                    onMouseLeave={
                      isLargeLibrary
                        ? undefined
                        : () => setHoveredSongId((current) => (current === song.id ? null : current))
                    }
                  >
                    <circle
                      r={radius + 3}
                      className="music-cue-node-hit music-cue-node-clickable"
                      onPointerDown={(event) => handleNodePointerDown(event, song)}
                      onPointerUp={(event) => handleNodePointerUp(event, song)}
                    />
                    <circle
                      r={radius}
                      fill={isUnavailable ? undefined : nodeFill}
                      className={`music-cue-node ${
                        inCue && !isUnavailable ? "music-cue-node-active" : ""
                      } ${isUnavailable ? "music-cue-node-missing" : ""} ${isSelected ? "music-cue-node-selected" : ""}`}
                      pointerEvents="none"
                    />
                    {showLabels && (
                      <text y={radius + 10} className="music-cue-node-label" pointerEvents="none">
                        {song.title}
                      </text>
                    )}
                  </g>
                );
              })}

              {showClusterDecorations &&
                fadingClusterSnapshot?.regions.map((region) => (
                  <text
                    key={`fading-label-${region.id}`}
                    x={region.center.x}
                    y={region.center.y}
                    className="music-cue-cluster-label"
                    opacity={fadingClusterSnapshot.opacity}
                    pointerEvents="none"
                  >
                    {region.label}
                  </text>
                ))}

              {isClusterLayout &&
                !isSquigglyCustomMode &&
                clusterRegions.map((region) => (
                  <text
                    key={`label-${region.id}`}
                    x={region.center.x}
                    y={region.center.y}
                    className={`music-cue-cluster-label ${
                      effectiveClusterRevealOpacity >= 1 && !isGuestViewOnly
                        ? "music-cue-cluster-label-draggable"
                        : ""
                    } ${selectedClusterIds.has(region.id) ? "music-cue-cluster-label-selected" : ""}`}
                    opacity={effectiveClusterRevealOpacity}
                    pointerEvents={effectiveClusterRevealOpacity >= 1 && !isGuestViewOnly ? undefined : "none"}
                    onPointerDown={
                      isGuestViewOnly
                        ? undefined
                        : (event) => handleClusterLabelPointerDown(event, region.id, region.label)
                    }
                    onPointerUp={(event) => {
                      if (!draggingClusterIdRef.current) {
                        return;
                      }
                      event.stopPropagation();
                      finishPointerInteraction();
                    }}
                  >
                    {region.label}
                  </text>
                ))}

              {!showLabels && hoveredSong && (
                <text
                  x={getDisplayPosition(hoveredSong).x}
                  y={getDisplayPosition(hoveredSong).y - 12}
                  className="music-cue-hover-label"
                >
                  {hoveredSong.artist} — {hoveredSong.title}
                  {unavailableSongIds.has(hoveredSong.id) ? " (not in library)" : ""}
                </text>
              )}
            </g>
          </svg>
        </div>

        {showToolSidebar ? (
        <aside
          className={`music-cue-cue-sidebar ${
            graphTool === "draw-cluster" ? "music-cue-cluster-sidebar" : ""
          }`}
        >
          {graphTool === "draw-cluster" && isSquigglyCustomMode ? (
            <>
              <h2 className="music-cue-cluster-panel-title">Cluster</h2>
              {selectedSquigglyCluster ? (
                <>
                  <label className="music-cue-cluster-panel-field">
                    Name
                    <input
                      type="text"
                      value={clusterNameDraft}
                      onChange={(event) => setClusterNameDraft(event.target.value)}
                      onBlur={handleClusterNameCommit}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") {
                          event.currentTarget.blur();
                        }
                      }}
                    />
                  </label>
                  <button
                    type="button"
                    className="music-cue-cluster-edit-shape-btn"
                    onClick={handleBeginEditClusterShape}
                  >
                    Edit cluster shape
                  </button>
                  <label className="music-cue-cluster-panel-field">
                    Color
                    <input
                      type="color"
                      value={selectedSquigglyCluster.color ?? "#4a90d9"}
                      onChange={(event) => handleSelectedClusterColorChange(event.target.value)}
                    />
                  </label>
                  <button
                    type="button"
                    className="music-cue-cluster-delete-btn"
                    onClick={handleDeleteCluster}
                  >
                    Delete cluster
                  </button>
                  {redrawDraft?.clusterId === selectedSquigglyCluster.id ? (
                    <p className="music-cue-cluster-panel-note">
                      Draw the new shape on the graph, then accept or reject using the prompt below the cluster
                      label.
                    </p>
                  ) : null}
                </>
              ) : (
                <>
                  <p className="music-cue-cluster-panel-note">
                    Draw a loop on the graph to create a cluster, or click an existing cluster to edit it.
                  </p>
                  <label className="music-cue-cluster-panel-field">
                    New cluster color
                    <input
                      type="color"
                      value={squigglyPenColor}
                      onChange={(event) => setSquigglyPenColor(event.target.value)}
                    />
                  </label>
                </>
              )}
            </>
          ) : null}

          {graphTool === "draw" ? (
            <>
          <label className="music-cue-slider-label music-cue-cue-path-slider music-cue-cue-path-slider-sidebar">
              Path threshold ({pathThreshold}px)
              <input
                type="range"
                min={20}
                max={150}
                step={5}
                value={pathThreshold}
                onChange={(event) => handlePathThresholdChange(Number(event.target.value))}
              />
            </label>

          <div className="music-cue-cue-header">
            <h2 className="music-cue-cue-title">Cue</h2>
            <div className="music-cue-actions music-cue-cue-actions">
              <button
                type="button"
                onClick={handlePlayCue}
                disabled={
                  !cue ||
                  (useSpotifyLocalExport
                    ? toSpotifyCueTracks(cue.songs).length === 0
                    : !isValidatingLibrary && cueSummary?.playableCount === 0)
                }
              >
                {isWebAppleMusic
                  ? "Copy play command"
                  : useSpotifyLocalExport
                    ? "Copy Spotify links"
                    : "Play"}
              </button>
              <button type="button" onClick={handleOpenExportDialog} disabled={!cue}>
                {isWebAppleMusic
                  ? "Copy playlist command"
                  : useSpotifyLocalExport
                    ? "Export for Spotify"
                    : "Export playlist"}
              </button>
              {buildMode === "manual" && (
                <button type="button" onClick={handleUndo} disabled={!canUndo}>
                  Undo ⌘Z
                </button>
              )}
            </div>
          </div>

          {playbackTrackingEnabled && (
            <p className="music-cue-cue-meta music-cue-cue-tracking-hint">
              {musicService === "spotify"
                ? "Tracking playback from Spotify — export when finished."
                : "Tracking playback from Music.app — edit the queue there; export when finished."}
            </p>
          )}

          {cueSummary ? (
            <p className="music-cue-cue-meta">
              {cueSummary.trackCount} tracks · {formatDuration(cueSummary.totalMs)}
              {cueSummary.totalMs === 0 ? ` · reload library for durations` : ""}
              {isValidatingLibrary
                ? ` · checking ${musicProvider.displayName}…`
                : cueSummary.missingCount > 0
                  ? ` · ${cueSummary.missingCount} unavailable · ${formatDuration(cueSummary.playableMs)} playable`
                  : ""}
            </p>
          ) : (
            <p className="music-cue-cue-meta music-cue-cue-meta-empty">
              {graphTool === "draw"
                ? "Drag paths on the graph or click nodes to build a cue."
                : isGuestViewOnly
                  ? "Switch to Draw path to build a cue, or pan around to explore."
                  : "Click nodes on the graph to build a cue track by track."}
            </p>
          )}

          <div className="music-cue-list-panel">
            {cue ? (
              <ol className="music-cue-list">
                {cue.songs.map((song, index) => {
                  const isUnavailable = unavailableSongIds.has(song.id);
                  const isActive = activePersistentId === song.id;
                  return (
                    <li
                      key={`${song.id}-${index}`}
                      className={isActive ? "music-cue-track-active" : isUnavailable ? "music-cue-track-missing" : ""}
                    >
                      {song.artist} — {song.title}
                      {isUnavailable ? " (not in library)" : ""}
                    </li>
                  );
                })}
              </ol>
            ) : (
              <p className="music-cue-list-empty">No tracks in cue yet.</p>
            )}
          </div>
            </>
          ) : null}
        </aside>
        ) : null}
      </div>
    </div>
      </CollaborativeSessionProvider>
    </CollaborativeLayoutProvider>
  );
};
