import { startTransition, useCallback, useDeferredValue, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";
import {
  buildClusterMemberIndex,
  buildClusterRegions,
  buildClusterViewportHints,
  buildIsolateScopedClusterRegions,
  ClusterRegion,
  getClusterMemberSongs,
  getClusterRegionDisplayCenter,
  getPlaylistClusterCenter,
} from "../lib/clusterRegions";
import { syncClusterLayoutToServer } from "../lib/clusterLayoutSync";
import { buildLibraryStatsFromSongs } from "../../shared/sharedLibrary";
import {
  fromNormalizedPosition,
  getIsolateOwnerBoundsForLayout,
  getLayoutAxisLabels,
  GraphDimensions,
  layoutSongPosition,
  toNormalizedPosition,
} from "../lib/graphLayout";
import { invalidateLayoutPositionCaches } from "../lib/layoutInvalidation";
import { invalidatePlaylistOverlapLayoutCache } from "../lib/playlistOverlapLayout";
import {
  buildPlaylistMetaGraphCenterMap,
  buildPlaylistMetaGraphSegments,
  isPlaylistMetaGraphClusterRegion,
  resolvePlaylistGraphViewRegionCenter,
} from "../lib/playlistMetaGraph";
import {
  buildPlaylistMetaGraphEdges,
  collectMetagraphNeighborRegionIds,
} from "../lib/playlistMetaGraphEdges";
import {
  buildMetaGraphForceEdges,
  createMetaGraphForceNodes,
  filterPlaylistOverridesForLayoutScope,
  mergeMetaGraphForceSimIntoClusterOverrides,
  type MetaGraphForceEdge,
  type MetaGraphForceSimPersistContext,
  type MetaGraphForceNode,
} from "../lib/playlistMetaGraphForceSim";
import { isExcludedPlaylistName } from "../lib/playlistConstants";
import { asStringArray } from "../lib/arrayUtils";
import { applyPlaybackAdvance } from "../lib/cuePlaybackTracking";
import { formatDuration, sumDuration } from "../lib/formatDuration";
import { getSongNodeFill } from "../lib/graphColors";
import {
  generateCueFromStroke,
  generateCueFromStrokes,
  getSongIdsNearStrokes,
} from "../lib/pathGenerator";
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
import { isWebDeployment, areMockUsersEnabled, useWebPerformanceOptimizations, isLocalDesktopApp } from "../lib/runtime";
import {
  CollaborativeLayoutProvider,
  CollaborativePlayProvider,
  PLAYHTML_ROOM,
  type ClusterLayoutSyncMode,
} from "../lib/collaborativeLayout";
import {
  CollaborativeSessionProvider,
  CollaborativeSessionUi,
  type CollaborativePresenceLayout,
} from "../lib/collaborativeSession";
import { getMusicProvider } from "../lib/providers";
import {
  clearSpotifyImportSession,
  fetchSpotifyPlaylistCatalog,
  getSpotifyImportContributorHint,
  getSpotifyImportResumeLabel,
  hasResumableSpotifyImport,
  saveConnectedSpotifyUser,
  SpotifyImportPausedError,
  SpotifyImportRateLimitError,
} from "../lib/providers/spotifyProvider";
import { filterReadablePlaylists } from "../../shared/spotifyLibraryAssembly";
import type { SpotifyPlaylistSummary } from "../../shared/spotifyLibraryAssembly";
import {
  formatSpotifyRateLimitCooldown,
  getSpotifyImportRateLimitCooldownMs,
} from "../lib/spotifyImportSession";
import type { LibraryLoadProgress } from "../lib/musicProvider";
import {
  DEFAULT_VIEW_TRANSFORM,
  MIN_ZOOM,
  screenToGraphPoint,
  toSvgViewBox,
  ViewTransform,
  zoomAtPoint,
} from "../lib/graphView";
import {
  cullGraphSongsWithLazyPositions,
  cullPositionedGraphNodes,
  getCullingViewportPadding,
  getGraphViewportBounds,
  GRAPH_NODE_CULLING_THRESHOLD,
  isPointInGraphViewport,
} from "../lib/graphViewportCulling";
import {
  loadBuildMode,
  loadClusterCenterOverrides,
  loadGraphTool,
  loadLayoutConfig,
  loadLibrary,
  loadPersonalSpotifyLibrary,
  loadMusicService,
  loadPathThreshold,
  loadCueLength,
  loadPlaylistGraphView,
  saveBuildMode,
  saveClusterCenterOverridesForScope,
  saveGenreClusterCenterOverrides,
  saveGraphTool,
  saveLayoutConfig,
  saveLibrary,
  saveMusicService,
  savePathThreshold,
  saveCueLength,
  savePlaylistClusterCenterOverrides,
  savePlaylistGraphView,
  type ClusterLayoutScope,
} from "../lib/storage";
import { getActiveClusterLayoutScope, getEffectiveLibraryScopeMode, isSingleContributorSharedLibrary } from "../lib/clusterLayoutScope";
import { SpotifySyncDialog } from "./SpotifySyncDialog";
import { ClusterDragPreviewLayer, type ClusterDragSnapshot } from "./ClusterDragPreviewLayer";
import { MusicCueGraphLayer, type MusicCueGraphLayerRef } from "./MusicCueGraphLayer";
import type { MusicCueGraphCanvasHandlers } from "./MusicCueGraphCanvas";
import { SpotifyLibraryActions } from "./SpotifyLibraryActions";
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
  buildSharedContributorFingerprint,
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
} from "../lib/useLayoutTransition";
import { useMetaClusterCenterTransition } from "../lib/useMetaClusterCenterTransition";
import {
  canonicalizeGeneratedCue,
  getCanonicalSongId,
  prepareGraphSongsForIsolate,
  resolveCanonicalSong,
  scopeSongsForIsolateOwner,
} from "../lib/isolateScopeSongs";
import {
  displayNormalizedToSoloNormalized,
  getClusterDragDisplayNormalizedStart,
  getClusterOverridesForOwner,
  getIsolateOwnerBoundsFromConglomeratePositions,
  getIsolateOwnerIds,
  parseOwnerScopedRegionId,
  toOwnerScopedOverrideUpdates,
} from "../lib/isolateClusterLayout";
import {
  buildWebDisplayPositionCache,
  compressSharedAxisConglomerateBandGap,
  computeIsolateDisplayContext,
} from "../lib/isolateDisplayTransform";
import { loadCachedSpotifyLibrary } from "../lib/spotifyLibraryCache";
import { reclaimSpotifyWebStorageQuota } from "../lib/webStorageCleanup";
import {
  getEnabledOwnerMetaClusters,
  hasMultipleLibraryOwners,
  resolveIsolateDisplayOwnerId,
} from "../lib/libraryScope";

const getGraphDimensions = (panel: HTMLDivElement | null): GraphDimensions => ({
  width: Math.max(320, panel?.clientWidth ?? 800),
  height: Math.max(280, panel?.clientHeight ?? 600),
});

const LIBRARY_VALIDATE_CHUNK = 80;
const META_BOUNDS_RECOMPUTE_DELAY_MS = 3000;

const getLocalPoint = (
  event: { clientX: number; clientY: number },
  svg: SVGSVGElement,
  viewTransform: ViewTransform
): GraphPoint => screenToGraphPoint(event.clientX, event.clientY, svg, viewTransform);

const DRAG_THRESHOLD = 10;
const LABEL_THRESHOLD = 250;
const CLUSTER_FADE_MS = 600;
/** Perf experiment: in path build mode, only render nodes within the path threshold of drawn strokes. */
const PATH_ONLY_SONG_NODE_RENDER = true;

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

const getSongPlaylists = (song: Song): string[] => asStringArray(song.playlists);

const filterExcludedPlaylists = (stats: LibraryStats): LibraryStats => {
  const playlistIds = asStringArray(stats.playlistIds).filter(
    (playlistId) => !isExcludedPlaylistName(stats.playlistNames?.[playlistId] ?? "")
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
    asStringArray(filteredStats.playlistIds).length > 0
      ? asStringArray(filteredStats.playlistIds)
      : [...new Set(songs.flatMap((song) => getSongPlaylists(song)))].sort((left, right) =>
          (filteredStats.playlistNames?.[left] ?? left).localeCompare(filteredStats.playlistNames?.[right] ?? right)
        );
  const genres =
    asStringArray(filteredStats.genres).length > 0
      ? asStringArray(filteredStats.genres)
      : Object.keys(genreCounts).sort((left, right) => left.localeCompare(right));
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
    genres,
    genreCounts,
    playlistIds,
    playlistNames: filteredStats.playlistNames ?? {},
    playlistCounts,
  };
};

const normalizeSong = (song: Song, stats: LibraryStats | null): Song => {
  const allowedPlaylistIds = new Set(asStringArray(stats?.playlistIds));
  return {
    ...song,
    durationMs: song.durationMs ?? 0,
    playlists: getSongPlaylists(song).filter((playlistId) => allowedPlaylistIds.has(playlistId)),
  };
};

const normalizeSongs = (librarySongs: Song[], stats: LibraryStats | null): Song[] =>
  librarySongs.map((song) => normalizeSong(song, stats));

export type MusicCueToolProps = {
  onWelcomeNameChange?: (name: string | null) => void;
};

export const MusicCueTool = ({ onWelcomeNameChange }: MusicCueToolProps = {}) => {
  const graphPanelRef = useRef<HTMLDivElement | null>(null);
  const participantsHostRef = useRef<HTMLSpanElement | null>(null);
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
  const lastMergedSharedFingerprintRef = useRef<string | null>(null);
  const draggingClusterIdRef = useRef<string | null>(null);
  const layoutSyncPausedRef = useRef(false);
  const layoutSyncPauseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const pauseLayoutSync = useCallback((durationMs = 600) => {
    layoutSyncPausedRef.current = true;
    if (layoutSyncPauseTimerRef.current) {
      clearTimeout(layoutSyncPauseTimerRef.current);
    }
    layoutSyncPauseTimerRef.current = setTimeout(() => {
      layoutSyncPausedRef.current = false;
      layoutSyncPauseTimerRef.current = null;
    }, durationMs);
  }, []);
  const publishClusterLayoutRef = useRef<(overrides: ClusterCenterOverrides) => void>(() => {});
  const collaborativeGraphCursorRef = useRef<(cursor: NormalizedPoint | null) => void>(() => {});
  const setGraphCursorRef = useRef<(cursor: NormalizedPoint | null) => void>(() => {});
  const graphInteractionActiveRef = useRef(false);
  const pauseGraphAnimationsRef = useRef(false);
  const updatePauseGraphAnimations = useCallback(() => {
    pauseGraphAnimationsRef.current =
      isViewGesturingRef.current || graphInteractionActiveRef.current;
  }, []);
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
    lastClientX: number;
    lastClientY: number;
    panX: number;
    panY: number;
    startScale: number;
    graphStart: GraphPoint;
    shiftHeld: boolean;
    metaShiftHeld: boolean;
    boxEnd?: GraphPoint;
    mode: "pending" | "pan" | "draw" | "box-select";
  } | null>(null);
  const viewTransformRef = useRef<ViewTransform>(DEFAULT_VIEW_TRANSFORM);
  const committedViewTransformRef = useRef<ViewTransform>(DEFAULT_VIEW_TRANSFORM);
  const isViewGesturingRef = useRef(false);
  const pendingViewTransformRef = useRef<ViewTransform | null>(null);
  const viewTransformRafRef = useRef<number>(0);
  const gestureVisualRafRef = useRef<number>(0);
  const pendingLiveTransformRef = useRef<ViewTransform | null>(null);
  const viewGestureSettleTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const viewGestureVisualEndTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const panCommitDebounceTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const nodeCullIdleTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const VIEW_GESTURE_SYNC_MS = 150;
  const VIEW_GESTURE_VISUAL_END_MS = 350;
  const NODE_CULL_IDLE_MS = 1800;
  const PAN_COMMIT_DEBOUNCE_MS = 280;
  const graphLayerRef = useRef<MusicCueGraphLayerRef | null>(null);
  const visibleNodeCountRef = useRef(0);
  const culledNodeCountRef = useRef(0);
  const viewPresencePublishRef = useRef<() => void>(() => {});
  const [dimensions, setDimensions] = useState<GraphDimensions>(() => getGraphDimensions(null));

  const setViewGesturingClass = useCallback((active: boolean) => {
    graphPanelRef.current?.classList.toggle("music-cue-view-gesturing", active);
  }, []);

  const flushViewTransform = useCallback(() => {
    viewTransformRafRef.current = 0;
    const transform = pendingViewTransformRef.current ?? viewTransformRef.current;
    pendingViewTransformRef.current = null;
    viewTransformRef.current = transform;
    committedViewTransformRef.current = { ...transform };
    const svg = svgRef.current;
    if (svg) {
      svg.style.transform = "";
      if (dimensions.width > 0 && dimensions.height > 0) {
        svg.setAttribute("viewBox", toSvgViewBox(transform, dimensions.width, dimensions.height));
      }
    }
    contentGroupRef.current?.removeAttribute("transform");
  }, [dimensions.height, dimensions.width]);

  const applyLiveViewGesture = useCallback((live: ViewTransform) => {
    viewTransformRef.current = live;
    const svg = svgRef.current;
    if (!svg) {
      return;
    }
    svg.style.transform = "";
    if (dimensions.width > 0 && dimensions.height > 0) {
      svg.setAttribute("viewBox", toSvgViewBox(live, dimensions.width, dimensions.height));
    }
  }, [dimensions.height, dimensions.width]);

  const scheduleLiveViewGesture = useCallback(
    (live: ViewTransform) => {
      pendingLiveTransformRef.current = live;
      if (gestureVisualRafRef.current) {
        return;
      }
      gestureVisualRafRef.current = requestAnimationFrame(() => {
        gestureVisualRafRef.current = 0;
        const pending = pendingLiveTransformRef.current;
        if (!pending) {
          return;
        }
        applyLiveViewGesture(pending);
        pendingLiveTransformRef.current = null;
      });
    },
    [applyLiveViewGesture]
  );

  const clearViewGestureTimers = useCallback(() => {
    if (viewGestureSettleTimeoutRef.current) {
      clearTimeout(viewGestureSettleTimeoutRef.current);
      viewGestureSettleTimeoutRef.current = null;
    }
    if (viewGestureVisualEndTimeoutRef.current) {
      clearTimeout(viewGestureVisualEndTimeoutRef.current);
      viewGestureVisualEndTimeoutRef.current = null;
    }
  }, []);

  const cancelDeferredPanCommit = useCallback(() => {
    if (panCommitDebounceTimeoutRef.current) {
      clearTimeout(panCommitDebounceTimeoutRef.current);
      panCommitDebounceTimeoutRef.current = null;
    }
  }, []);

  const commitViewGesture = useCallback(
    (transform?: ViewTransform) => {
      if (transform) {
        viewTransformRef.current = transform;
      }
      clearViewGestureTimers();
      if (gestureVisualRafRef.current) {
        cancelAnimationFrame(gestureVisualRafRef.current);
        gestureVisualRafRef.current = 0;
      }
      pendingLiveTransformRef.current = null;
      isViewGesturingRef.current = false;
      setViewGesturingClass(false);
      updatePauseGraphAnimations();
      flushViewTransform();
    },
    [clearViewGestureTimers, flushViewTransform, setViewGesturingClass, updatePauseGraphAnimations]
  );

  const syncViewGestureTransform = useCallback(() => {
    if (!isViewGesturingRef.current) {
      return;
    }
    if (gestureVisualRafRef.current) {
      cancelAnimationFrame(gestureVisualRafRef.current);
      gestureVisualRafRef.current = 0;
    }
    pendingLiveTransformRef.current = null;
    committedViewTransformRef.current = { ...viewTransformRef.current };
    flushViewTransform();
  }, [flushViewTransform]);

  const beginViewGesture = useCallback(() => {
    if (!isViewGesturingRef.current) {
      committedViewTransformRef.current = { ...viewTransformRef.current };
      isViewGesturingRef.current = true;
      setViewGesturingClass(true);
      updatePauseGraphAnimations();
    }
  }, [setViewGesturingClass, updatePauseGraphAnimations]);

  const applyViewTransformLive = useCallback(
    (transform: ViewTransform) => {
      viewTransformRef.current = transform;
      pendingViewTransformRef.current = transform;
      if (!viewTransformRafRef.current) {
        viewTransformRafRef.current = requestAnimationFrame(flushViewTransform);
      }
    },
    [flushViewTransform]
  );

  const scheduleViewPresencePublish = useCallback(() => {
    viewPresencePublishRef.current();
  }, []);

  const scheduleDeferredNodeCullRefresh = useCallback(() => {
    graphLayerRef.current?.scheduleCullRefresh();
  }, []);

  const shouldSkipGraphPresenceUpdates = useCallback(() => {
    return (
      graphInteractionActiveRef.current ||
      isViewGesturingRef.current ||
      Boolean(panSessionRef.current) ||
      Boolean(pinchSessionRef.current) ||
      Boolean(draggingClusterIdRef.current)
    );
  }, []);

  const scheduleNodeCullIdle = useCallback(() => {
    if (nodeCullIdleTimeoutRef.current) {
      clearTimeout(nodeCullIdleTimeoutRef.current);
    }
    nodeCullIdleTimeoutRef.current = setTimeout(() => {
      nodeCullIdleTimeoutRef.current = null;
      if (shouldSkipGraphPresenceUpdates()) {
        scheduleNodeCullIdle();
        return;
      }
      scheduleDeferredNodeCullRefresh();
      scheduleViewPresencePublish();
    }, NODE_CULL_IDLE_MS);
  }, [NODE_CULL_IDLE_MS, scheduleDeferredNodeCullRefresh, scheduleViewPresencePublish, shouldSkipGraphPresenceUpdates]);

  const scheduleViewGestureVisualEnd = useCallback(() => {
    if (viewGestureVisualEndTimeoutRef.current) {
      clearTimeout(viewGestureVisualEndTimeoutRef.current);
    }
    viewGestureVisualEndTimeoutRef.current = setTimeout(() => {
      viewGestureVisualEndTimeoutRef.current = null;
      if (!isViewGesturingRef.current) {
        return;
      }
      commitViewGesture();
    }, VIEW_GESTURE_VISUAL_END_MS);
  }, [VIEW_GESTURE_VISUAL_END_MS, commitViewGesture]);

  const scheduleViewGestureSettle = useCallback(() => {
    if (viewGestureSettleTimeoutRef.current) {
      clearTimeout(viewGestureSettleTimeoutRef.current);
    }
    viewGestureSettleTimeoutRef.current = setTimeout(() => {
      viewGestureSettleTimeoutRef.current = null;
      syncViewGestureTransform();
    }, VIEW_GESTURE_SYNC_MS);
    scheduleViewGestureVisualEnd();
    scheduleNodeCullIdle();
  }, [
    VIEW_GESTURE_SYNC_MS,
    scheduleNodeCullIdle,
    scheduleViewGestureVisualEnd,
    syncViewGestureTransform,
  ]);

  const setGraphPanningClass = useCallback((active: boolean) => {
    svgRef.current?.classList.toggle("music-cue-graph-panning", active);
  }, []);
  const undoStackRef = useRef<
    Array<{
      cue: GeneratedCue | null;
      completedStrokes?: NormalizedPoint[][];
      action?: "stroke" | "node" | "manual";
    }>
  >([]);
  const handleUndoRef = useRef<() => void>(() => {});

  const initialMusicService = (() => {
    if (
      isWebDeployment &&
      typeof window !== "undefined" &&
      window.matchMedia("(max-width: 640px)").matches
    ) {
      return "spotify" as MusicServiceId;
    }
    return loadMusicService();
  })();
  const initialSongSpaceMode = loadSongSpaceMode();
  const initialPersonalSpotifyLibrary =
    isWebDeployment && initialMusicService === "spotify" ? loadPersonalSpotifyLibrary() : null;
  const initialLibrary =
    initialPersonalSpotifyLibrary && initialPersonalSpotifyLibrary.songs.length > 0
      ? initialPersonalSpotifyLibrary
      : isWebDeployment && initialMusicService === "spotify"
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
  const sharedContributorCount = sharedContributors.length;
  const [songSpaceMode, setSongSpaceMode] = useState<SongSpaceMode>(() => loadSongSpaceMode());
  const [guestViewContributorId, setGuestViewContributorId] = useState<string | null>(null);
  const [clusterLayoutSyncRevision, setClusterLayoutSyncRevision] = useState(0);
  const publishedRoomClusterRef = useRef(false);
  const [libraryScopeMode, setLibraryScopeMode] = useState<LibraryScopeMode>(() =>
    loadLibraryScopeMode(loadSongSpaceMode())
  );
  const includeMockUsers = areMockUsersEnabled();
  const localContributorId = useMemo(
    () => resolveLocalContributorId(includeMockUsers, sharedContributors),
    [includeMockUsers, sharedContributors]
  );
  const isSpotifyGuest =
    isWebDeployment && musicService === "spotify" && spotifyStatus !== null && !spotifyStatus.connected;
  const isGuestViewOnly = isSpotifyGuest;
  const songSpaceContributorId = useMemo(() => {
    if (isSpotifyGuest && songSpaceMode === "mine") {
      return guestViewContributorId;
    }
    return localContributorId;
  }, [guestViewContributorId, isSpotifyGuest, localContributorId, songSpaceMode]);
  const activeLayoutScope = useMemo(
    () => getActiveClusterLayoutScope(songSpaceMode, libraryScopeMode, sharedContributorCount),
    [libraryScopeMode, sharedContributorCount, songSpaceMode]
  );
  const effectiveLibraryScopeMode = useMemo(
    () => getEffectiveLibraryScopeMode(songSpaceMode, libraryScopeMode),
    [libraryScopeMode, songSpaceMode]
  );
  const layoutLibraryScopeMode = useDeferredValue(
    isLocalDesktopApp ? "conglomerate" : effectiveLibraryScopeMode
  );
  const activeContributorIds = useMemo(
    () =>
      resolveActiveContributorIds(
        songSpaceMode,
        localContributorId,
        sharedContributors,
        songSpaceContributorId
      ),
    [localContributorId, sharedContributors, songSpaceContributorId, songSpaceMode]
  );
  const [sharedTrackCount, setSharedTrackCount] = useState(0);
  const [isLoadingSharedLibrary, setIsLoadingSharedLibrary] = useState(false);
  const [buildMode, setBuildMode] = useState<CueBuildMode>(() => loadBuildMode());
  const [graphTool, setGraphTool] = useState<GraphToolMode>(() => loadGraphTool());
  const [canUndo, setCanUndo] = useState(false);
  const [songs, setSongs] = useState<Song[]>(() => initialSongs);
  const [playlistOwners, setPlaylistOwners] = useState<Record<string, string>>({});
  const [stats, setStats] = useState<LibraryStats>(() => normalizeStats(initialLibrary.stats, initialSongs));
  const [layoutConfig, setLayoutConfig] = useState<LayoutConfig>(() =>
    normalizeLayoutConfigForService(loadLayoutConfig(initialMusicService), initialMusicService)
  );
  const [clusterOverrides, setClusterOverrides] = useState<ClusterCenterOverrides>(() =>
    loadClusterCenterOverrides(
      getActiveClusterLayoutScope(
        loadSongSpaceMode(),
        loadLibraryScopeMode(loadSongSpaceMode())
      )
    )
  );
  const conglomerateClusterOverridesRef = useRef<ClusterCenterOverrides>(
    loadClusterCenterOverrides(getActiveClusterLayoutScope(songSpaceMode, "conglomerate", sharedContributorCount))
  );
  const isolateClusterOverridesRef = useRef<ClusterCenterOverrides>(
    loadClusterCenterOverrides("isolate")
  );
  const usesSplitClusterLayoutScopes =
    useWebPerformanceOptimizations &&
    songSpaceMode === "shared" &&
    !isSingleContributorSharedLibrary(sharedContributorCount);
  const reloadLayoutCaches = useCallback((scope: ClusterLayoutScope) => {
    if (!isSpotifyGuest) {
      const loaded = loadClusterCenterOverrides(scope);
      clusterOverridesRef.current = loaded;
      setClusterOverrides(loaded);
      if (scope === "conglomerate") {
        conglomerateClusterOverridesRef.current = loaded;
      } else {
        isolateClusterOverridesRef.current = loaded;
      }
    }
  }, [isSpotifyGuest]);

  const previousLayoutScopeRef = useRef(activeLayoutScope);
  useEffect(() => {
    if (previousLayoutScopeRef.current === activeLayoutScope) {
      return;
    }
    const previousScope = previousLayoutScopeRef.current;
    previousLayoutScopeRef.current = activeLayoutScope;
    if (isSpotifyGuest) {
      return;
    }
    if (
      usesSplitClusterLayoutScopes &&
      ((previousScope === "conglomerate" && activeLayoutScope === "isolate") ||
        (previousScope === "isolate" && activeLayoutScope === "conglomerate"))
    ) {
      if (previousScope === "conglomerate" && activeLayoutScope === "isolate") {
        conglomerateClusterOverridesRef.current = clusterOverridesRef.current;
        const nextOverrides = isolateClusterOverridesRef.current;
        clusterOverridesRef.current = nextOverrides;
        setClusterOverrides(nextOverrides);
      } else {
        isolateClusterOverridesRef.current = clusterOverridesRef.current;
        const nextOverrides = conglomerateClusterOverridesRef.current;
        clusterOverridesRef.current = nextOverrides;
        setClusterOverrides(nextOverrides);
      }
      invalidatePlaylistOverlapLayoutCache();
      invalidateLayoutPositionCaches();
      return;
    }
    pauseLayoutSync();
    reloadLayoutCaches(activeLayoutScope);
  }, [
    activeLayoutScope,
    isSpotifyGuest,
    pauseLayoutSync,
    reloadLayoutCaches,
    sharedContributorCount,
    songSpaceMode,
    usesSplitClusterLayoutScopes,
  ]);

  const layoutClusterOverrides = useMemo(() => {
    if (songSpaceMode === "mine" && songSpaceContributorId) {
      return getClusterOverridesForOwner(clusterOverrides, songSpaceContributorId, layoutConfig);
    }
    if (
      songSpaceMode === "shared" &&
      isSingleContributorSharedLibrary(sharedContributorCount) &&
      localContributorId &&
      layoutLibraryScopeMode === "conglomerate"
    ) {
      return getClusterOverridesForOwner(clusterOverrides, localContributorId, layoutConfig);
    }
    return clusterOverrides;
  }, [
    clusterOverrides,
    layoutConfig,
    layoutLibraryScopeMode,
    localContributorId,
    sharedContributorCount,
    songSpaceContributorId,
    songSpaceMode,
  ]);

  useEffect(() => {
    if (activeLayoutScope === "conglomerate") {
      conglomerateClusterOverridesRef.current = clusterOverrides;
      return;
    }
    isolateClusterOverridesRef.current = clusterOverrides;
    if (songSpaceMode === "mine" || isSingleContributorSharedLibrary(sharedContributorCount)) {
      conglomerateClusterOverridesRef.current = layoutClusterOverrides;
    }
  }, [activeLayoutScope, clusterOverrides, layoutClusterOverrides, sharedContributorCount, songSpaceMode]);

  const forceSimPersistContext = useMemo(
    (): MetaGraphForceSimPersistContext => ({
      layoutScope: activeLayoutScope,
      mineContributorId:
        songSpaceMode === "mine" && localContributorId ? localContributorId : null,
    }),
    [activeLayoutScope, localContributorId, songSpaceMode]
  );

  const resolveForceSimOverrideBase = useCallback((): ClusterCenterOverrides => {
    if (usesSplitClusterLayoutScopes) {
      return activeLayoutScope === "conglomerate"
        ? conglomerateClusterOverridesRef.current
        : isolateClusterOverridesRef.current;
    }
    return clusterOverridesRef.current;
  }, [activeLayoutScope, usesSplitClusterLayoutScopes]);

  const commitForceSimOverrideBase = useCallback(
    (overrides: ClusterCenterOverrides) => {
      clusterOverridesRef.current = overrides;
      if (activeLayoutScope === "conglomerate") {
        conglomerateClusterOverridesRef.current = overrides;
      } else {
        isolateClusterOverridesRef.current = overrides;
      }
    },
    [activeLayoutScope]
  );

  const buildClusterDragOverrides = useCallback(
    (
      current: ClusterCenterOverrides,
      session: NonNullable<typeof clusterDragSessionRef.current>,
      delta: NormalizedPoint,
      resolvedOwnerId: string | null
    ): ClusterCenterOverrides => {
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
        return { ...current, genre: { ...current.genre, ...scopedUpdates } };
      }
      if (layoutConfig.viewMode === "cluster" && layoutConfig.clusterMode === "playlist") {
        return { ...current, playlist: { ...current.playlist, ...scopedUpdates } };
      }
      return current;
    },
    [dimensions, layoutConfig]
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
  const [cueLength, setCueLength] = useState(() => loadCueLength());
  const [completedStrokes, setCompletedStrokes] = useState<NormalizedPoint[][]>([]);
  const [completedStrokesRevision, setCompletedStrokesRevision] = useState(0);
  const [strokeLayoutConfig, setStrokeLayoutConfig] = useState<LayoutConfig | null>(null);
  const [cue, setCue] = useState<GeneratedCue | null>(null);
  const [hoveredClusterRegionId, setHoveredClusterRegionId] = useState<string | null>(null);
  const [hoveredSongId, setHoveredSongId] = useState<string | null>(null);
  const [activePlaylistName, setActivePlaylistName] = useState<string | null>(null);
  const [activePersistentId, setActivePersistentId] = useState<string | null>(null);
  const [playbackTrackingEnabled, setPlaybackTrackingEnabled] = useState(false);
  const frozenIsolateBoundsRef = useRef<Map<string, { centroid: GraphPoint; radius: number }> | null>(null);
  const [isolateBoundsRevision, setIsolateBoundsRevision] = useState(0);
  const metaBoundsDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cancelMetaClusterTransitionRef = useRef<() => void>(() => {});
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
  const [spotifySyncOpen, setSpotifySyncOpen] = useState(false);
  const [spotifySyncLoading, setSpotifySyncLoading] = useState(false);
  const [spotifySyncError, setSpotifySyncError] = useState<string | null>(null);
  const [spotifySyncPlaylists, setSpotifySyncPlaylists] = useState<SpotifyPlaylistSummary[]>([]);
  const [importResumeRevision, setImportResumeRevision] = useState(0);
  const [playlistGraphView, setPlaylistGraphView] = useState(() => loadPlaylistGraphView());
  const [playlistGraphForceSim, setPlaylistGraphForceSim] = useState(false);
  const [shiftHeld, setShiftHeld] = useState(false);
  const [boxSelectRect, setBoxSelectRect] = useState<BoxSelectRect | null>(null);
  const [selectedClusterIds, setSelectedClusterIds] = useState<Set<string>>(() => new Set());
  const clusterOverridesRef = useRef(clusterOverrides);
  const metaGraphForceSimActiveRef = useRef(false);
  const metaGraphForceNodesRef = useRef<MetaGraphForceNode[]>([]);
  const metaGraphForceEdgesRef = useRef<MetaGraphForceEdge[]>([]);
  const personalLibrarySnapshotRef = useRef<{
    songs: Song[];
    stats: LibraryStats;
    playlistOwners: Record<string, string>;
  } | null>(null);
  const sharedLibrarySnapshotRef = useRef<{
    songs: Song[];
    stats: LibraryStats;
    playlistOwners: Record<string, string>;
  } | null>(null);
  const hoverProbeRafRef = useRef(0);
  const pendingHoverPointRef = useRef<GraphPoint | null>(null);
  const [isClusterDragging, setIsClusterDragging] = useState(false);
  const [clusterDragSnapshotRevision, setClusterDragSnapshotRevision] = useState(0);
  const clusterDragSnapshotRef = useRef<ClusterDragSnapshot | null>(null);
  const clusterDragGraphDeltaRef = useRef<GraphPoint>({ x: 0, y: 0 });
  const clusterDragPreviewScheduleRef = useRef<(() => void) | null>(null);
  const draftStrokeScheduleRef = useRef<(() => void) | null>(null);
  const isDrawingNewPathRef = useRef(false);
  const draftStrokeActiveRef = useRef(false);
  const [isMobileWebLayout, setIsMobileWebLayout] = useState(
    () =>
      isWebDeployment &&
      typeof window !== "undefined" &&
      window.matchMedia("(max-width: 640px)").matches
  );
  const [cueSidebarCollapsed, setCueSidebarCollapsed] = useState(true);

  useEffect(() => {
    if (!isWebDeployment) {
      return undefined;
    }
    const mediaQuery = window.matchMedia("(max-width: 640px)");
    const onChange = () => setIsMobileWebLayout(mediaQuery.matches);
    mediaQuery.addEventListener("change", onChange);
    return () => mediaQuery.removeEventListener("change", onChange);
  }, []);

  const showToolSidebar = graphTool === "draw";
  const showCueSidebar = showToolSidebar || (isMobileWebLayout && isWebDeployment);

  useEffect(() => {
    if (!isMobileWebLayout || !isWebDeployment || musicService === "spotify") {
      return;
    }
    setMusicService("spotify");
    saveMusicService("spotify");
  }, [isMobileWebLayout, musicService]);

  useEffect(() => {
    cueRef.current = cue;
  }, [cue]);

  useEffect(() => {
    clusterOverridesRef.current = clusterOverrides;
  }, [clusterOverrides]);

  const applyClusterOverrides = useCallback((overrides: ClusterCenterOverrides) => {
    setClusterOverrides(overrides);
    invalidatePlaylistOverlapLayoutCache();
    invalidateLayoutPositionCaches();
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

  useLayoutEffect(() => {
    pendingViewTransformRef.current = null;
    if (viewTransformRafRef.current) {
      cancelAnimationFrame(viewTransformRafRef.current);
      viewTransformRafRef.current = 0;
    }
    flushViewTransform();
  }, [dimensions.width, dimensions.height, flushViewTransform]);

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
        if (!isViewGesturingRef.current) {
          beginViewGesture();
        }
        const next = zoomAtPoint(viewTransformRef.current, event.clientX, event.clientY, svg, event.deltaY);
        scheduleLiveViewGesture(next);
        scheduleViewGestureSettle();
      }
    };

    document.addEventListener("wheel", handleWheel, { passive: false, capture: true });
    return () => document.removeEventListener("wheel", handleWheel, { capture: true });
  }, [beginViewGesture, scheduleLiveViewGesture, scheduleViewGestureSettle]);

  useEffect(() => {
    setGraphCursorRef.current = (cursor) => {
      if (shouldSkipGraphPresenceUpdates()) {
        return;
      }
      collaborativeGraphCursorRef.current(cursor);
    };
  }, [shouldSkipGraphPresenceUpdates]);

  useEffect(
    () => () => {
      clearViewGestureTimers();
      cancelDeferredPanCommit();
      if (nodeCullIdleTimeoutRef.current) {
        clearTimeout(nodeCullIdleTimeoutRef.current);
      }
    },
    [cancelDeferredPanCommit, clearViewGestureTimers]
  );

  const handlePointerMoveRef = useRef<(event: PointerEvent) => void>(() => {});

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) {
      return undefined;
    }

    const onPointerMove = (event: PointerEvent) => {
      handlePointerMoveRef.current(event);
    };

    svg.addEventListener("pointermove", onPointerMove, { passive: false });
    return () => {
      svg.removeEventListener("pointermove", onPointerMove);
    };
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

    if (songs.length >= LARGE_LIBRARY_LAYOUT_SNAP_THRESHOLD) {
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
    () => filterSongsForSongSpace(songs, songSpaceMode, localContributorId, songSpaceContributorId),
    [localContributorId, songSpaceContributorId, songSpaceMode, songs]
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

  const showIsolateContributorView =
    libraryScopeMode === "isolate" && hasMultipleLibraryOwners(visibleSongs);
  const layoutShowIsolateContributorView = useDeferredValue(showIsolateContributorView);
  const playlistGraphViewActive =
    playlistGraphView && isClusterView(layoutConfig) && layoutConfig.clusterMode === "playlist";
  const isSharedIsolateClusterDragDisabled =
    songSpaceMode === "shared" && libraryScopeMode === "isolate" && !playlistGraphViewActive;


  const isolateGraphSongs = useCallback(
    (sourceSongs: Song[]) => {
      if (layoutLibraryScopeMode !== "isolate" || !hasMultipleLibraryOwners(sourceSongs)) {
        return sourceSongs;
      }
      return prepareGraphSongsForIsolate(sourceSongs, activeContributorIds, playlistOwners);
    },
    [activeContributorIds, layoutLibraryScopeMode, playlistOwners]
  );

  const graphSongs = useMemo(
    () => isolateGraphSongs(visibleSongs),
    [isolateGraphSongs, visibleSongs]
  );
  const graphSongsRef = useRef(graphSongs);
  graphSongsRef.current = graphSongs;
  const enableGraphNodeCulling =
    useWebPerformanceOptimizations && graphSongs.length >= GRAPH_NODE_CULLING_THRESHOLD;

  const liveIsolateOwnerBounds = useMemo(() => {
    if (useWebPerformanceOptimizations) {
      return undefined;
    }
    if (layoutLibraryScopeMode !== "isolate" || !isClusterView(layoutConfig)) {
      return undefined;
    }
    return getIsolateOwnerBoundsForLayout(
      graphSongs,
      dimensions,
      layoutConfig,
      stats,
      clusterOverrides,
      activeContributorIds,
    );
  }, [
    activeContributorIds,
    dimensions,
    graphSongs,
    layoutConfig,
    layoutLibraryScopeMode,
    stats,
    useWebPerformanceOptimizations,
  ]);

  const isolateOwnerIds = useMemo(
    () =>
      showIsolateContributorView || layoutLibraryScopeMode === "isolate"
        ? getIsolateOwnerIds(graphSongs, activeContributorIds)
        : [],
    [activeContributorIds, graphSongs, layoutLibraryScopeMode, showIsolateContributorView]
  );
  const isolateOwnerCount = isolateOwnerIds.length;
  const isLargeLibrary =
    useWebPerformanceOptimizations && graphSongs.length >= LARGE_LIBRARY_LAYOUT_SNAP_THRESHOLD;
  const deferredLayoutConfig = useDeferredValue(layoutConfig);
  const coldLayoutConfig = isLargeLibrary ? deferredLayoutConfig : layoutConfig;
  const skipIsolateCentroidTranslation = isolateOwnerCount <= 1;

  const layoutTransitionKey = `${songSpaceMode}:${libraryScopeMode}`;
  const layoutColdKey = `${layoutConfigKey(coldLayoutConfig)}|${layoutTransitionKey}|${graphSongs.length}|${dimensions.width}x${dimensions.height}`;
  const graphStructureKey = layoutColdKey;
  const interactionRevisionKey = [
    songSpaceMode,
    libraryScopeMode,
    hoveredSongId ?? "",
    hoveredClusterRegionId ?? "",
    selectedSongId ?? "",
    activePersistentId ?? "",
    cue?.songs.length ?? 0,
    completedStrokesRevision,
    isClusterDragging ? 1 : 0,
    clusterDragSnapshotRevision,
    playlistGraphViewActive ? 1 : 0,
    playlistGraphForceSim ? 1 : 0,
    isolateBoundsRevision,
    boxSelectRect
      ? `${boxSelectRect.x1},${boxSelectRect.y1},${boxSelectRect.x2},${boxSelectRect.y2}`
      : "",
  ].join("|");

  const getPosition = useCallback(
    (song: Song): GraphPoint => graphLayerRef.current?.getPosition(song) ?? { x: 0, y: 0 },
    []
  );

  const getClusterRegions = useCallback(
    () => graphLayerRef.current?.getClusterRegions() ?? [],
    []
  );

  const getGraphViewClusterRegions = useCallback(
    () => graphLayerRef.current?.getGraphViewClusterRegions() ?? [],
    []
  );

  const scheduleHoverProbe = useCallback(
    (graphPoint: GraphPoint) => {
      if (shouldSkipGraphPresenceUpdates()) {
        return;
      }
      pendingHoverPointRef.current = graphPoint;
      if (hoverProbeRafRef.current) {
        return;
      }
      hoverProbeRafRef.current = requestAnimationFrame(() => {
        hoverProbeRafRef.current = 0;
        if (shouldSkipGraphPresenceUpdates()) {
          return;
        }
        const point = pendingHoverPointRef.current;
        if (!point) {
          return;
        }
        const nextHoveredId = graphLayerRef.current?.findHoveredSongAtPoint(point) ?? null;
        startTransition(() => {
          setHoveredSongId((current) => (current === nextHoveredId ? current : nextHoveredId));
        });
      });
    },
    [shouldSkipGraphPresenceUpdates]
  );

  const clearFrozenIsolateBounds = useCallback(() => {
    frozenIsolateBoundsRef.current = null;
    if (metaBoundsDebounceRef.current) {
      clearTimeout(metaBoundsDebounceRef.current);
      metaBoundsDebounceRef.current = null;
    }
    cancelMetaClusterTransitionRef.current();
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

  const isolateOwnerBoundsRef = useRef(isolateOwnerBounds);
  isolateOwnerBoundsRef.current = isolateOwnerBounds;

  const { getMetaClusterCenter, startMetaClusterCenterTransition, cancelMetaClusterCenterTransition } =
    useMetaClusterCenterTransition(graphSongs, dimensions, activeContributorIds, isolateOwnerBounds);

  const getOwnerForceSimContext = useCallback(
    (ownerId: string) => {
      const bounds = isolateOwnerBounds?.get(ownerId);
      if (!bounds) {
        return null;
      }
      const metaCenter = getEnabledOwnerMetaClusters(graphSongs, dimensions, activeContributorIds, {
        isAxisView: false,
        ownerBounds: isolateOwnerBounds,
      }).find((meta) => meta.id === ownerId)?.center;
      if (!metaCenter) {
        return null;
      }
      return {
        bounds,
        metaCenter: getMetaClusterCenter(ownerId, metaCenter),
      };
    },
    [activeContributorIds, dimensions, getMetaClusterCenter, graphSongs, isolateOwnerBounds]
  );

  const persistClusterLayoutOverrides = useCallback((overrides?: ClusterCenterOverrides) => {
    const nextOverrides = overrides ?? clusterOverridesRef.current;
    const scopedOverrides: ClusterCenterOverrides = {
      ...nextOverrides,
      playlist: filterPlaylistOverridesForLayoutScope(nextOverrides.playlist, activeLayoutScope),
    };
    commitForceSimOverrideBase(scopedOverrides);
    if (!overrides) {
      setClusterOverrides(scopedOverrides);
    }
    saveGenreClusterCenterOverrides(scopedOverrides.genre, activeLayoutScope);
    savePlaylistClusterCenterOverrides(scopedOverrides.playlist, activeLayoutScope);
    invalidatePlaylistOverlapLayoutCache();
    invalidateLayoutPositionCaches();
    saveClusterCenterOverridesForScope(activeLayoutScope, scopedOverrides);
    if (isWebDeployment) {
      publishClusterLayoutRef.current(scopedOverrides);
    } else {
      void syncClusterLayoutToServer(scopedOverrides);
    }
  }, [activeLayoutScope, commitForceSimOverrideBase]);

  const stopMetaGraphForceSim = useCallback(
    (options?: { persist?: boolean }) => {
      const nodes = [...metaGraphForceNodesRef.current];
      let nextOverrides = resolveForceSimOverrideBase();
      if (nodes.length > 0) {
        nextOverrides = mergeMetaGraphForceSimIntoClusterOverrides(
          nextOverrides,
          nodes,
          dimensions,
          getOwnerForceSimContext,
          forceSimPersistContext
        );
        commitForceSimOverrideBase(nextOverrides);
      }

      if (options?.persist !== false && nodes.length > 0) {
        invalidatePlaylistOverlapLayoutCache();
        invalidateLayoutPositionCaches();
        flushSync(() => {
          metaGraphForceSimActiveRef.current = false;
          applyClusterOverrides(nextOverrides);
        });
        persistClusterLayoutOverrides(nextOverrides);
        pauseLayoutSync(3_000);
      } else {
        metaGraphForceSimActiveRef.current = false;
      }

      setPlaylistGraphForceSim(false);
      metaGraphForceNodesRef.current = [];
      metaGraphForceEdgesRef.current = [];
    },
    [
      applyClusterOverrides,
      commitForceSimOverrideBase,
      dimensions,
      forceSimPersistContext,
      getOwnerForceSimContext,
      pauseLayoutSync,
      persistClusterLayoutOverrides,
      resolveForceSimOverrideBase,
    ]
  );

  useEffect(() => {
    cancelMetaClusterTransitionRef.current = cancelMetaClusterCenterTransition;
  }, [cancelMetaClusterCenterTransition]);

  useEffect(() => {
    clearFrozenIsolateBounds();
  }, [clearFrozenIsolateBounds]);

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


  useLayoutEffect(() => {
    const previousKey = prevLayoutForClustersRef.current;
    const currentKey = layoutConfigKey(layoutConfig);
    if (previousKey === currentKey) {
      return;
    }

    const previousLayout = graphLayerRef.current?.getTransition().fromLayout ?? layoutConfig;
    const skipClusterFade = visibleSongs.length >= LARGE_LIBRARY_LAYOUT_SNAP_THRESHOLD;

    if (skipClusterFade) {
      setFadingClusterSnapshot(null);
      setClusterRevealOpacity(isClusterView(layoutConfig) ? 1 : 0);
    } else {
      const scopeMode = layoutLibraryScopeMode;
      const buildSnapshot = graphLayerRef.current?.buildRegionSnapshot;
      clusterFadeOutIdRef.current += 1;
      setFadingClusterSnapshot({
        id: clusterFadeOutIdRef.current,
        regions:
          buildSnapshot?.(scopeMode, previousLayout, (song) =>
            graphLayerRef.current?.computeLayoutPosition(song, previousLayout, scopeMode) ?? { x: 0, y: 0 }
          ) ?? [],
        opacity: 1,
      });

      if (isClusterView(layoutConfig) && !isClusterView(previousLayout)) {
        clusterRevealFadeIdRef.current += 1;
        setClusterRevealOpacity(0);
        setClusterRevealFadeTrigger(clusterRevealFadeIdRef.current);
      }
    }

    prevLayoutForClustersRef.current = currentKey;
  }, [layoutConfig, layoutLibraryScopeMode, visibleSongs.length]);

  useEffect(() => {
    if (clusterRevealFadeTrigger === 0) {
      return undefined;
    }

    const fadeId = clusterRevealFadeTrigger;
    const startTime = performance.now();
    let frameId = 0;

    const tick = (now: number) => {
      if (pauseGraphAnimationsRef.current) {
        frameId = requestAnimationFrame(tick);
        return;
      }
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
      if (pauseGraphAnimationsRef.current) {
        frameId = requestAnimationFrame(tick);
        return;
      }
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
  const showPlaylistMetaGraph = playlistGraphViewActive;

  useEffect(() => {
    if (!showPlaylistMetaGraph && playlistGraphForceSim) {
      stopMetaGraphForceSim();
    }
  }, [playlistGraphForceSim, showPlaylistMetaGraph, stopMetaGraphForceSim]);

  useEffect(() => {
    if (showPlaylistMetaGraph) {
      startTransition(() => setHoveredSongId(null));
    }
  }, [showPlaylistMetaGraph]);

  const showPlaylistClusterHulls =
    (isClusterLayout || Boolean(fadingClusterSnapshot && fadingClusterSnapshot.opacity > 0)) &&
    !showPlaylistMetaGraph;

  const regenerateCueFromStroke = useCallback(
    (currentStroke: GraphPoint[], threshold: number, length: number = cueLength) => {
      if (currentStroke.length < 2) {
        return null;
      }
      return canonicalizeGeneratedCue(
        generateCueFromStroke(graphSongs, currentStroke, getPosition, threshold, layoutConfig, length),
        songs
      );
    },
    [cueLength, getPosition, graphSongs, layoutConfig, songs]
  );

  const regenerateCueFromStrokes = useCallback(
    (strokes: NormalizedPoint[][], threshold: number, length: number = cueLength) => {
      if (strokes.length === 0) {
        return null;
      }
      const graphStrokes = strokes.map((segment) =>
        segment.map((point) => fromNormalizedPosition(point, dimensions))
      );
      return canonicalizeGeneratedCue(
        generateCueFromStrokes(graphSongs, graphStrokes, getPosition, threshold, layoutConfig, length),
        songs
      );
    },
    [cueLength, dimensions, getPosition, graphSongs, layoutConfig, songs]
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
      cueLength: cueLength > 0 ? cueLength : undefined,
      buildMode,
    }),
    [buildMode, cueLength, dimensions, layoutConfig, pathThreshold]
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
      setCompletedStrokesRevision((value) => value + 1);
    }
    if (entry?.action === "stroke" || entry?.action === "node") {
      strokeRef.current = [];
      isDrawingRef.current = false;
      setIsDrawingNewPath(false);
      draftStrokeScheduleRef.current?.();
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
      const svg = svgRef.current;
      if (svg) {
        svg.classList.remove("music-cue-graph-navigate", "music-cue-graph-draw");
        svg.classList.add(`music-cue-graph-${tool}`);
      }
      startTransition(() => {
        setGraphTool(tool);
        saveGraphTool(tool);
      });
      if (tool === "navigate") {
        setStatusMessage(
          isGuestViewOnly
            ? "Navigate: drag to pan · scroll or pinch to zoom."
            : "Navigate: drag to pan · scroll or pinch to zoom · drag cluster labels to move them."
        );
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
    const session = panSessionRef.current;
    const wasPanning = session?.mode === "pan";
    panSessionRef.current = null;
    setGraphPanningClass(false);
    if (wasPanning && session) {
      const transform = {
        scale: session.startScale,
        panX: session.panX + (session.lastClientX - session.clientX),
        panY: session.panY + (session.lastClientY - session.clientY),
      };
      viewTransformRef.current = transform;
      cancelDeferredPanCommit();
      panCommitDebounceTimeoutRef.current = setTimeout(() => {
        panCommitDebounceTimeoutRef.current = null;
        commitViewGesture(transform);
        scheduleNodeCullIdle();
      }, PAN_COMMIT_DEBOUNCE_MS);
    }
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
      beginViewGesture();
      const session = panSessionRef.current;
      if (session && svgRef.current?.hasPointerCapture(session.pointerId)) {
        svgRef.current.releasePointerCapture(session.pointerId);
      }
      resetPanSession();
    }
  };

  const releasePointer = (event: React.PointerEvent<Element>) => {
    const wasPinching = Boolean(pinchSessionRef.current);
    pointerPositionsRef.current.delete(event.pointerId);
    if (pointerPositionsRef.current.size < 2) {
      pinchSessionRef.current = null;
      if (wasPinching && isViewGesturingRef.current) {
        commitViewGesture();
        scheduleNodeCullIdle();
      }
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
    scheduleLiveViewGesture({
      scale: nextScale,
      panX: screenMidX - graphX * nextScale,
      panY: screenMidY - graphY * nextScale,
    });
    scheduleViewGestureSettle();
  };

  const beginNewStroke = (point: GraphPoint) => {
    const normalized = toNormalizedPosition(point, dimensions);
    const lastCompleted = completedStrokesRef.current[completedStrokesRef.current.length - 1];
    const lastPoint = lastCompleted?.[lastCompleted.length - 1];
    isDrawingRef.current = true;
    isDrawingNewPathRef.current = true;
    draftStrokeActiveRef.current = true;
    strokeRef.current = lastPoint ? [lastPoint, normalized] : [normalized];
    draftStrokeScheduleRef.current?.();
    setStatusMessage("Drawing path… release to finish this segment.");
  };

  const appendStrokePoint = (point: GraphPoint) => {
    const normalized = toNormalizedPosition(point, dimensions);
    const last = strokeRef.current[strokeRef.current.length - 1];
    if (!last || Math.hypot(normalized.x - last.x, normalized.y - last.y) < 0.004) {
      return;
    }
    strokeRef.current = [...strokeRef.current, normalized];
    draftStrokeScheduleRef.current?.();
  };

  const finishStrokeDrawing = () => {
    const currentStroke = strokeRef.current;
    isDrawingRef.current = false;
    isDrawingNewPathRef.current = false;
    draftStrokeActiveRef.current = false;
    draftStrokeScheduleRef.current?.();

    if (currentStroke.length < 2) {
      strokeRef.current = [];
      setStatusMessage("Draw a longer path to generate a cue.");
      return;
    }

    const nextCompleted = [...completedStrokesRef.current, currentStroke];
    const generated = regenerateCueFromStrokes(nextCompleted, pathThreshold, cueLength);
    if (!generated || generated.songs.length === 0) {
      strokeRef.current = [];
      setStatusMessage("No songs matched that path. Widen the path threshold or draw closer to nodes.");
      return;
    }

    pushUndo(cue, { includeStrokes: true, action: "stroke" });

    completedStrokesRef.current = nextCompleted;
    setCompletedStrokes(nextCompleted);
    setCompletedStrokesRevision((value) => value + 1);
    strokeRef.current = [];
    setStrokeLayoutConfig(layoutConfig);

    setCue({
      ...generated,
      buildMode: "path",
    });
    setStatusMessage(
      `Added segment · ${generated.songs.length} song${generated.songs.length === 1 ? "" : "s"} in cue. Draw another path or click nodes. ⌘Z to undo.`
    );
  };

  const handleClusterLabelPointerDown = (
    event: React.PointerEvent<SVGTextElement>,
    clusterId: string,
    label: string
  ) => {
    if (isGuestViewOnly || !isClusterLayout || isSharedIsolateClusterDragDisabled) {
      return;
    }
    graphInteractionActiveRef.current = true;
    updatePauseGraphAnimations();
    event.stopPropagation();

    const clustersToMove =
      selectedClusterIds.size > 0 && selectedClusterIds.has(clusterId)
        ? [...selectedClusterIds]
        : [clusterId];
    const anchorStart = svgRef.current
      ? toNormalizedPosition(
          getLocalPoint(event, svgRef.current, viewTransformRef.current),
          dimensions
        )
      : { x: 0.5, y: 0.5 };
    const anchorRegion = getClusterRegions().find((entry) => entry.id === clusterId);
    const initialMovedRegions = anchorRegion
      ? [
          {
            ...anchorRegion,
            labelCenter: getClusterRegionDisplayCenter(anchorRegion),
          },
        ]
      : [];
    const initialSongIds = new Set<string>();
    const clusterMode = layoutConfig.clusterMode;
    if (clusterMode === "genre" || clusterMode === "playlist") {
      clustersToMove.forEach((regionId) => {
        const { ownerId, clusterId: innerClusterId } = parseOwnerScopedRegionId(regionId);
        let pool = graphSongsRef.current;
        if (ownerId) {
          pool = scopeSongsForIsolateOwner(
            graphSongsRef.current.filter(
              (song) => resolveIsolateDisplayOwnerId(song, activeContributorIds) === ownerId
            ),
            ownerId,
            playlistOwners
          );
        }
        const memberIndex = buildClusterMemberIndex(pool);
        getClusterMemberSongs(innerClusterId, clusterMode, pool, memberIndex).forEach((song) => {
          initialSongIds.add(song.id);
        });
      });
    }

    draggingClusterIdRef.current = clusterId;
    clusterDragGraphDeltaRef.current = { x: 0, y: 0 };
    clusterDragSessionRef.current = {
      clusterIds: clustersToMove,
      startPositions: {},
      anchorStart,
      useDisplaySpace: false,
    };
    clusterDragSnapshotRef.current = {
      movedRegionIds: new Set(clustersToMove),
      previewRegionIds: new Set(clustersToMove),
      songIds: initialSongIds,
      movedRegions: initialMovedRegions,
      neighborRegions: [],
      songs: [],
      showClusterHulls: showPlaylistClusterHulls,
      hullContext: null,
    };
    setIsClusterDragging(true);
    setClusterDragSnapshotRevision((value) => value + 1);
    svgRef.current?.setPointerCapture(event.pointerId);
    setStatusMessage(
      clustersToMove.length > 1 ? `Dragging ${clustersToMove.length} clusters…` : `Dragging ${label}…`
    );

    requestAnimationFrame(() => {
      if (!draggingClusterIdRef.current) {
        return;
      }
      if (playlistGraphForceSim) {
        stopMetaGraphForceSim();
      }
      beginIsolateClusterDrag();
      const activeOverrides =
        songSpaceMode === "mine" && localContributorId ? layoutClusterOverrides : clusterOverrides;
      const overrideMap =
        layoutConfig.clusterMode === "genre" ? activeOverrides.genre : activeOverrides.playlist;
      const clusterMode = layoutConfig.clusterMode;
      const draggedRegionSet = new Set(clustersToMove);
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
      const startPositions: Record<string, NormalizedPoint> = {};
      const regions = getClusterRegions();
      clustersToMove.forEach((id) => {
        startPositions[id] = getClusterDragDisplayNormalizedStart(
          id,
          regions.find((entry) => entry.id === id),
          overrideMap,
          dimensions,
          dragSpaceOptions
        );
      });
      clusterDragSessionRef.current = {
        clusterIds: clustersToMove,
        startPositions,
        anchorStart,
        useDisplaySpace,
        bounds: ownerBounds,
        metaCenter,
      };

      const regionLookup = new Map<string, ClusterRegion>();
      regions.forEach((region) => regionLookup.set(region.id, region));
      getGraphViewClusterRegions().forEach((region) => {
        if (!regionLookup.has(region.id)) {
          regionLookup.set(region.id, region);
        }
      });
      const movedRegions = clustersToMove
        .map((regionId) => regionLookup.get(regionId))
        .filter((region): region is ClusterRegion => Boolean(region))
        .map((region) => ({
          ...region,
          labelCenter:
            layoutConfig.clusterMode === "playlist"
              ? graphLayerRef.current?.resolveClusterLabelCenter(region) ??
                getClusterRegionDisplayCenter(region)
              : getClusterRegionDisplayCenter(region),
        }));
      const snapshotSongIds = new Set<string>();
      const snapshotSongs: Array<{ song: Song; position: GraphPoint }> = [];
      if (clusterMode === "genre" || clusterMode === "playlist") {
        clustersToMove.forEach((regionId) => {
          const { ownerId, clusterId: innerClusterId } = parseOwnerScopedRegionId(regionId);
          let pool = graphSongs;
          if (ownerId) {
            pool = scopeSongsForIsolateOwner(
              graphSongs.filter(
                (song) => resolveIsolateDisplayOwnerId(song, activeContributorIds) === ownerId
              ),
              ownerId,
              playlistOwners
            );
          }
          const memberIndex = buildClusterMemberIndex(pool);
          getClusterMemberSongs(innerClusterId, clusterMode, pool, memberIndex).forEach((song) => {
            if (snapshotSongIds.has(song.id)) {
              return;
            }
            snapshotSongIds.add(song.id);
            snapshotSongs.push({ song, position: getPosition(song) });
          });
        });
      }
      const resolveDragMetaGraphEdges = (scopeOwnerId: string | null) => {
        if (clusterMode !== "playlist") {
          return [];
        }
        if (scopeOwnerId) {
          const ownerSongs = scopeSongsForIsolateOwner(
            graphSongs.filter(
              (song) => resolveIsolateDisplayOwnerId(song, activeContributorIds) === scopeOwnerId
            ),
            scopeOwnerId,
            playlistOwners
          );
          if (ownerSongs.length === 0) {
            return [];
          }
          const ownerPlaylistNames =
            Object.keys(playlistOwners).length === 0
              ? stats.playlistNames
              : Object.fromEntries(
                  Object.entries(stats.playlistNames).filter(
                    ([playlistId]) => playlistOwners[playlistId] === scopeOwnerId
                  )
                );
          const ownerStats = buildLibraryStatsFromSongs(ownerSongs, ownerPlaylistNames);
          return buildPlaylistMetaGraphEdges(asStringArray(ownerStats.playlistIds), ownerSongs);
        }
        return buildPlaylistMetaGraphEdges(asStringArray(stats.playlistIds), graphSongs);
      };
      const dragOwnerIds = new Set(
        clustersToMove.map((regionId) => parseOwnerScopedRegionId(regionId).ownerId)
      );
      const edgesForDrag = [...dragOwnerIds].flatMap((scopeOwnerId) =>
        resolveDragMetaGraphEdges(scopeOwnerId)
      );
      const previewRegionIds = collectMetagraphNeighborRegionIds(
        clustersToMove,
        edgesForDrag,
        getClusterRegions().map((region) => region.id)
      );
      const neighborRegionIds = [...previewRegionIds].filter(
        (regionId) => !draggedRegionSet.has(regionId)
      );
      const regionCentersByRegionId = new Map<string, GraphPoint>();
      const playlistCenters = new Map<string, GraphPoint>();
      const paddingByRegionId = new Map<string, number>();
      const memberCountByRegionId = new Map<string, number>();
      const resolveRegionHullCenter = (region: ClusterRegion): GraphPoint => {
        if (clusterMode !== "playlist") {
          return getClusterRegionDisplayCenter(region);
        }
        const { ownerId, clusterId: innerClusterId } = parseOwnerScopedRegionId(region.id);
        if (ownerId) {
          const ownerSongs = scopeSongsForIsolateOwner(
            graphSongs.filter(
              (song) => resolveIsolateDisplayOwnerId(song, activeContributorIds) === ownerId
            ),
            ownerId,
            playlistOwners
          );
          const ownerPlaylistNames =
            Object.keys(playlistOwners).length === 0
              ? stats.playlistNames
              : Object.fromEntries(
                  Object.entries(stats.playlistNames).filter(
                    ([playlistId]) => playlistOwners[playlistId] === ownerId
                  )
                );
          const ownerStats = buildLibraryStatsFromSongs(ownerSongs, ownerPlaylistNames);
          const ownerOverrides = getClusterOverridesForOwner(
            layoutClusterOverrides,
            ownerId,
            layoutConfig
          );
          return getPlaylistClusterCenter(
            innerClusterId,
            ownerStats,
            dimensions,
            ownerOverrides,
            ownerSongs
          );
        }
        return getPlaylistClusterCenter(
          innerClusterId,
          stats,
          dimensions,
          layoutClusterOverrides,
          graphSongs
        );
      };
      regionLookup.forEach((region) => {
        if (!previewRegionIds.has(region.id)) {
          return;
        }
        const { clusterId: innerClusterId } = parseOwnerScopedRegionId(region.id);
        const hullCenter = resolveRegionHullCenter(region);
        regionCentersByRegionId.set(region.id, hullCenter);
        playlistCenters.set(innerClusterId, hullCenter);
        paddingByRegionId.set(
          region.id,
          Math.max(20, Math.min(42, 14 + Math.sqrt(region.memberCount) * 3))
        );
        memberCountByRegionId.set(region.id, region.memberCount);
      });
      clusterDragSnapshotRef.current = {
        movedRegionIds: draggedRegionSet,
        previewRegionIds,
        songIds: snapshotSongIds,
        movedRegions,
        neighborRegions: neighborRegionIds
          .map((regionId) => regionLookup.get(regionId))
          .filter((region): region is ClusterRegion => Boolean(region)),
        songs: snapshotSongs,
        showClusterHulls: showPlaylistClusterHulls,
        hullContext:
          clusterMode === "playlist"
            ? {
                edges: edgesForDrag,
                regionCentersByRegionId,
                playlistCenters,
                paddingByRegionId,
                memberCountByRegionId,
              }
            : null,
      };
      clusterDragPreviewScheduleRef.current?.();
      setClusterDragSnapshotRevision((value) => value + 1);
    });
  };

  const handleNodePointerDown = (event: React.PointerEvent<SVGCircleElement>, song: Song) => {
    event.stopPropagation();
    graphInteractionActiveRef.current = true;
    updatePauseGraphAnimations();
    nodePointerStartRef.current = {
      songId: song.id,
      clientX: event.clientX,
      clientY: event.clientY,
    };
  };

  const handleNodePointerUp = (event: React.PointerEvent<SVGCircleElement>, song: Song) => {
    event.stopPropagation();
    const canonicalId = getCanonicalSongId(song.id);
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
        target.closest(".music-cue-cluster-label-draggable")
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

    cancelDeferredPanCommit();
    graphInteractionActiveRef.current = true;
    updatePauseGraphAnimations();

    trackPointer(event);

    const point = getLocalPoint(event, svgRef.current, viewTransformRef.current);
    const startPanImmediately = graphTool === "navigate" && event.pointerType === "touch";
    panSessionRef.current = {
      pointerId: event.pointerId,
      clientX: event.clientX,
      clientY: event.clientY,
      lastClientX: event.clientX,
      lastClientY: event.clientY,
      panX: viewTransformRef.current.panX,
      panY: viewTransformRef.current.panY,
      startScale: viewTransformRef.current.scale,
      graphStart: point,
      shiftHeld: event.shiftKey,
      metaShiftHeld: (event.metaKey || event.ctrlKey) && event.shiftKey,
      mode: startPanImmediately ? "pan" : "pending",
    };
    if (startPanImmediately) {
      beginViewGesture();
      setGraphPanningClass(true);
    }
    svgRef.current.setPointerCapture(event.pointerId);
  };

  const handleBackgroundPointerDown = (event: React.PointerEvent<SVGRectElement>) => {
    event.stopPropagation();
    handleGraphPointerDown(event as unknown as React.PointerEvent<SVGSVGElement>);
  };

  const handlePointerMove = useCallback((event: PointerEvent) => {
    const svg = svgRef.current;
    if (!svg) {
      return;
    }

    const activePanSession = panSessionRef.current;
    if (activePanSession?.mode === "pan" && activePanSession.pointerId === event.pointerId) {
      event.preventDefault();
      activePanSession.lastClientX = event.clientX;
      activePanSession.lastClientY = event.clientY;
      scheduleLiveViewGesture({
        scale: activePanSession.startScale,
        panX: activePanSession.panX + (activePanSession.lastClientX - activePanSession.clientX),
        panY: activePanSession.panY + (activePanSession.lastClientY - activePanSession.clientY),
      });
      return;
    }

    if (pointerPositionsRef.current.has(event.pointerId)) {
      pointerPositionsRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    }

    if (pinchSessionRef.current && pointerPositionsRef.current.size >= 2) {
      updatePinchTransform();
      return;
    }

    if (
      isWebDeployment &&
      !shouldSkipGraphPresenceUpdates()
    ) {
      const point = getLocalPoint(event, svg, viewTransformRef.current);
      setGraphCursorRef.current(toNormalizedPosition(point, dimensions));
    }

    if (draggingClusterIdRef.current) {
      const point = getLocalPoint(event, svg, viewTransformRef.current);
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
      const nextOverrides = buildClusterDragOverrides(
        clusterOverridesRef.current,
        session,
        delta,
        resolvedOwnerId
      );
      clusterOverridesRef.current = nextOverrides;
      clusterDragGraphDeltaRef.current = {
        x: delta.x * dimensions.width,
        y: delta.y * dimensions.height,
      };
      clusterDragPreviewScheduleRef.current?.();
      return;
    }

    if (
      (enableGraphNodeCulling || isLocalDesktopApp) &&
      !shouldSkipGraphPresenceUpdates() &&
      graphTool === "navigate" &&
      !showPlaylistMetaGraph
    ) {
      const point = getLocalPoint(event, svg, viewTransformRef.current);
      scheduleHoverProbe(point);
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

      if (session.metaShiftHeld && isClusterLayout && !isGuestViewOnly && !isSharedIsolateClusterDragDisabled) {
        session.mode = "box-select";
        const point = getLocalPoint(event, svg, viewTransformRef.current);
        session.boxEnd = point;
        setBoxSelectRect({
          x1: session.graphStart.x,
          y1: session.graphStart.y,
          x2: point.x,
          y2: point.y,
        });
      } else if (graphTool === "draw" && graphSongs.length > 0) {
        session.mode = "draw";
        beginNewStroke(session.graphStart);
        appendStrokePoint(getLocalPoint(event, svg, viewTransformRef.current));
      } else {
        session.mode = "pan";
        session.lastClientX = event.clientX;
        session.lastClientY = event.clientY;
        beginViewGesture();
        setGraphPanningClass(true);
      }
    }

    if (session.mode === "box-select" && session.boxEnd) {
      const point = getLocalPoint(event, svg, viewTransformRef.current);
      session.boxEnd = point;
      setBoxSelectRect({
        x1: session.graphStart.x,
        y1: session.graphStart.y,
        x2: point.x,
        y2: point.y,
      });
      return;
    }

    if (session.mode === "draw" && isDrawingRef.current) {
      appendStrokePoint(getLocalPoint(event, svg, viewTransformRef.current));
    }
  }, [
    appendStrokePoint,
    beginNewStroke,
    beginViewGesture,
    buildClusterDragOverrides,
    dimensions,
    enableGraphNodeCulling,
    graphSongs.length,
    graphTool,
    isClusterLayout,
    isGuestViewOnly,
    isSharedIsolateClusterDragDisabled,
    resolveOverrideOwnerId,
    scheduleHoverProbe,
    scheduleLiveViewGesture,
    setGraphPanningClass,
    shouldSkipGraphPresenceUpdates,
    showPlaylistMetaGraph,
    updatePinchTransform,
  ]);

  useEffect(() => {
    handlePointerMoveRef.current = handlePointerMove;
  }, [handlePointerMove]);

  const finishPointerInteraction = (event?: React.PointerEvent<SVGSVGElement>) => {
    if (event) {
      releasePointer(event);
    }

    if (draggingClusterIdRef.current) {
      if (event && svgRef.current?.hasPointerCapture(event.pointerId)) {
        svgRef.current.releasePointerCapture(event.pointerId);
      }
      draggingClusterIdRef.current = null;
      clusterDragSessionRef.current = null;
      clusterDragSnapshotRef.current = null;
      clusterDragGraphDeltaRef.current = { x: 0, y: 0 };
      setIsClusterDragging(false);
      setClusterDragSnapshotRevision(0);
      endIsolateClusterDrag();
      const nextOverrides = clusterOverridesRef.current;
      setClusterOverrides(nextOverrides);
      if (layoutConfig.viewMode === "cluster" && layoutConfig.clusterMode === "genre") {
        saveGenreClusterCenterOverrides(nextOverrides.genre, activeLayoutScope);
      } else if (layoutConfig.viewMode === "cluster" && layoutConfig.clusterMode === "playlist") {
        savePlaylistClusterCenterOverrides(nextOverrides.playlist, activeLayoutScope);
        invalidatePlaylistOverlapLayoutCache();
      }
      invalidateLayoutPositionCaches();
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
      graphInteractionActiveRef.current = false;
      updatePauseGraphAnimations();
      return;
    }

    const session = panSessionRef.current;
    if (session && svgRef.current?.hasPointerCapture(session.pointerId)) {
      svgRef.current.releasePointerCapture(session.pointerId);
    }

    if (!session) {
      graphInteractionActiveRef.current = false;
      updatePauseGraphAnimations();
      return;
    }

    if (session.mode === "box-select" && session.boxEnd) {
      const minX = Math.min(session.graphStart.x, session.boxEnd.x);
      const maxX = Math.max(session.graphStart.x, session.boxEnd.x);
      const minY = Math.min(session.graphStart.y, session.boxEnd.y);
      const maxY = Math.max(session.graphStart.y, session.boxEnd.y);
      const selected = getClusterRegions()
        .filter((region) => {
          const center = getClusterRegionDisplayCenter(region);
          return center.x >= minX && center.x <= maxX && center.y >= minY && center.y <= maxY;
        })
        .map((region) => region.id);
      setSelectedClusterIds(new Set(selected));
      setBoxSelectRect(null);
      setStatusMessage(
        selected.length > 0 ? `Selected ${selected.length} cluster(s).` : "No clusters in selection."
      );
      resetPanSession();
      graphInteractionActiveRef.current = false;
      updatePauseGraphAnimations();
      return;
    }

    if (session.mode === "draw") {
      finishStrokeDrawing();
    }

    resetPanSession();
    graphInteractionActiveRef.current = false;
    updatePauseGraphAnimations();
  };

  useEffect(() => {
    if (!isMobileWebLayout) {
      return undefined;
    }

    const handleGlobalPointerEnd = (event: PointerEvent) => {
      const session = panSessionRef.current;
      const hasActiveGesture =
        Boolean(session) || Boolean(draggingClusterIdRef.current) || isDrawingRef.current;
      if (!hasActiveGesture) {
        return;
      }
      if (session && session.pointerId !== event.pointerId) {
        return;
      }
      if (
        draggingClusterIdRef.current &&
        svgRef.current &&
        !svgRef.current.hasPointerCapture(event.pointerId)
      ) {
        return;
      }
      finishPointerInteraction();
    };

    window.addEventListener("pointerup", handleGlobalPointerEnd);
    window.addEventListener("pointercancel", handleGlobalPointerEnd);
    return () => {
      window.removeEventListener("pointerup", handleGlobalPointerEnd);
      window.removeEventListener("pointercancel", handleGlobalPointerEnd);
    };
  }, [isMobileWebLayout]);

  const handlePathThresholdChange = (value: number) => {
    setPathThreshold(value);
    savePathThreshold(value);
    if (completedStrokesRef.current.length > 0) {
      const generated = regenerateCueFromStrokes(completedStrokesRef.current, value, cueLength);
      if (generated) {
        setCue({ ...generated, buildMode: "path" });
        setStatusMessage(`Path threshold ${value}px · ${generated.songs.length} songs in cue.`);
      }
    }
  };

  const handleCueLengthChange = (value: number) => {
    const nextLength = Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
    setCueLength(nextLength);
    saveCueLength(nextLength);
    if (completedStrokesRef.current.length > 0) {
      const generated = regenerateCueFromStrokes(completedStrokesRef.current, pathThreshold, nextLength);
      if (generated) {
        setCue({ ...generated, buildMode: "path" });
        const lengthLabel = nextLength > 0 ? `${nextLength} songs` : "all matching songs";
        setStatusMessage(`Cue length ${lengthLabel} · ${generated.songs.length} in cue.`);
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
      invalidateLayoutPositionCaches();
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
      setCompletedStrokesRevision((value) => value + 1);
      strokeRef.current = [];
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

  useEffect(() => {
    if (!isWebDeployment || musicService !== "spotify") {
      return;
    }
    reclaimSpotifyWebStorageQuota();
    let cancelled = false;
    void loadCachedSpotifyLibrary().then((cached) => {
      if (cancelled || !cached || cached.songs.length === 0 || songsRef.current.length > 0) {
        return;
      }
      if (songSpaceMode !== "mine") {
        return;
      }
      applyLoadedLibrary(
        cached.songs,
        cached.stats ?? normalizeStats(null, cached.songs),
        `My song space — ${cached.songs.length} tracks (cached).`,
        {},
        { persist: false }
      );
    });
    return () => {
      cancelled = true;
    };
  }, [applyLoadedLibrary, musicService, songSpaceMode]);

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
        lastMergedSharedFingerprintRef.current = buildSharedContributorFingerprint(
          contributors.filter((contributor) => contributorIds.includes(contributor.id))
        );
      } catch (error) {
        setStatusMessage(error instanceof Error ? error.message : "Could not load shared library.");
      } finally {
        setIsLoadingSharedLibrary(false);
      }
    },
    [applyLoadedLibrary, includeMockUsers]
  );

  const loadGuestMergedLibrary = useCallback(async (options?: { forceRefresh?: boolean }) => {
    if (!isWebDeployment || musicService !== "spotify") {
      return [];
    }
    if (options?.forceRefresh) {
      guestMergeLoadRef.current = "idle";
    }
    if (guestMergeLoadRef.current === "loading") {
      return [];
    }
    if (guestMergeLoadRef.current === "done" && !options?.forceRefresh) {
      try {
        const contributors = await listSharedContributors(includeMockUsers);
        const fingerprint = buildSharedContributorFingerprint(contributors);
        if (fingerprint === lastMergedSharedFingerprintRef.current) {
          return sharedContributors;
        }
      } catch {
        return [];
      }
    }

    guestMergeLoadRef.current = "loading";
    setIsLoadingSharedLibrary(true);
    try {
      const merged = await fetchAllMergedSharedLibrary();
      if (merged.contributors.length === 0) {
        guestMergeLoadRef.current = "idle";
        setSharedTrackCount(0);
        setSharedContributors([]);
        setStatusMessage("No shared libraries published yet.");
        return [];
      }
      const contributorNames = merged.contributors.map((contributor) => contributor.name).join(" + ");
      setSharedContributors(merged.contributors);
      setSharedTrackCount(merged.sharedTrackCount);
      applyLoadedLibrary(
        merged.songs,
        merged.stats,
        `Loaded shared library from ${contributorNames} (${merged.songs.length} tracks).`,
        merged.playlistOwners,
        { persist: false }
      );
      lastMergedSharedFingerprintRef.current = buildSharedContributorFingerprint(merged.contributors);
      guestMergeLoadRef.current = "done";
      return merged.contributors;
    } catch (error) {
      guestMergeLoadRef.current = "idle";
      setStatusMessage(error instanceof Error ? error.message : "Could not load shared library.");
      return [];
    } finally {
      setIsLoadingSharedLibrary(false);
    }
  }, [applyLoadedLibrary, includeMockUsers, musicService, sharedContributors]);

  useEffect(
    () => () => {
      if (viewTransformRafRef.current) {
        cancelAnimationFrame(viewTransformRafRef.current);
      }
      if (gestureVisualRafRef.current) {
        cancelAnimationFrame(gestureVisualRafRef.current);
      }
      if (viewGestureSettleTimeoutRef.current) {
        clearTimeout(viewGestureSettleTimeoutRef.current);
      }
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
        const isGuest = spotifyStatus !== null && !spotifyStatus.connected;
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

        const contributors = await listSharedContributors(includeMockUsers);
        setSharedContributors(contributors);

        if (spotifyStatus === null) {
          return contributors;
        }

        const contributorIds = getAllContributorIds(contributors);
        const contributorFingerprint = buildSharedContributorFingerprint(contributors);
        const sharedLibraryIsStale =
          lastMergedSharedFingerprintRef.current === null ||
          lastMergedSharedFingerprintRef.current !== contributorFingerprint;
        const shouldFetchMergedLibrary =
          isWebDeployment &&
          musicService === "spotify" &&
          contributorIds.length > 0 &&
          shouldLoadLibrary &&
          (options?.forceRefresh || sharedLibraryIsStale);

        if (shouldFetchMergedLibrary) {
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
        } else         if (
          isWebDeployment &&
          musicService === "spotify" &&
          spotifyStatus?.connected &&
          songSpaceMode === "mine" &&
          songsRef.current.length === 0
        ) {
          void loadCachedSpotifyLibrary().then((stored) => {
            if (!stored || stored.songs.length === 0) {
              return;
            }
            applyLoadedLibrary(
              stored.songs,
              stored.stats ?? normalizeStats(null, stored.songs),
              `Restored your library (${stored.songs.length} tracks).`,
              {},
              { persist: false }
            );
          });
        }
        return contributors;
      } catch (error) {
        const message = error instanceof Error ? error.message : "Could not load shared libraries.";
        if (message.includes("404")) {
          setStatusMessage(
            "Shared library API is unavailable. Redeploy the site, then use Load & share library to publish again."
          );
        } else {
          setStatusMessage(`Could not load shared libraries: ${message}`);
        }
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
    const hasPersonalLibrary = songs.length > 0;
    if (hasPersonalLibrary && songSpaceMode === "mine") {
      return;
    }
    void loadGuestMergedLibrary();
    // Guest library: one fetch on mount — not tied to Spotify status polling.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [musicService]);

  useEffect(() => {
    if (!isSpotifyGuest || guestViewContributorId) {
      return;
    }
    if (songSpaceMode !== "shared") {
      clearFrozenIsolateBounds();
      setSongSpaceMode("shared");
      reloadLayoutCaches(getActiveClusterLayoutScope("shared", libraryScopeMode, sharedContributorCount));
    }
  }, [
    clearFrozenIsolateBounds,
    guestViewContributorId,
    isSpotifyGuest,
    libraryScopeMode,
    reloadLayoutCaches,
    songSpaceMode,
  ]);

  useEffect(() => {
    if (!isWebDeployment || musicService !== "spotify" || spotifyStatus === null) {
      return;
    }
    if (!spotifyStatus.connected) {
      return;
    }
    const shouldLoadSharedLibrary = songSpaceMode === "shared";
    void refreshSharedContributors({ loadLibrary: shouldLoadSharedLibrary }).catch(() => {
      // refreshSharedContributors already surfaces errors in the status line.
    });
  }, [musicService, refreshSharedContributors, songSpaceMode, spotifyStatus?.connected]);

  useEffect(() => {
    if (!isWebDeployment || musicService !== "spotify" || songSpaceMode !== "shared") {
      return undefined;
    }

    const refreshContributors = () => {
      void refreshSharedContributors({ loadLibrary: true });
    };

    const intervalId = window.setInterval(refreshContributors, 120_000);
    window.addEventListener("focus", refreshContributors);
    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener("focus", refreshContributors);
    };
  }, [musicService, refreshSharedContributors, songSpaceMode]);

  useEffect(() => {
    if (!isWebDeployment || musicService !== "spotify" || !spotifyStatus?.connected || isSpotifyGuest) {
      publishedRoomClusterRef.current = false;
      return;
    }
    if (songs.length === 0 || publishedRoomClusterRef.current) {
      return;
    }
    publishedRoomClusterRef.current = true;
    publishClusterLayoutRef.current(clusterOverridesRef.current);
  }, [isSpotifyGuest, musicService, songs.length, spotifyStatus?.connected]);

  useEffect(() => {
    if (!isWebDeployment || songSpaceMode !== "mine" || libraryScopeMode === "isolate") {
      return;
    }
    setLibraryScopeMode("isolate");
    saveLibraryScopeMode("isolate");
    reloadLayoutCaches(
      getActiveClusterLayoutScope(songSpaceMode, "isolate", sharedContributorCount)
    );
    invalidateLayoutPositionCaches();
  }, [isWebDeployment, libraryScopeMode, reloadLayoutCaches, sharedContributorCount, songSpaceMode]);

  const handleSongSpaceChange = (mode: SongSpaceMode) => {
    if (mode === songSpaceMode) {
      return;
    }
    if (mode === "mine" && isWebDeployment && musicService === "spotify" && !spotifyStatus?.connected) {
      return;
    }
    if (playlistGraphForceSim) {
      stopMetaGraphForceSim();
    }
    if (mode === "shared" && songSpaceMode === "mine" && songs.length > 0) {
      personalLibrarySnapshotRef.current = {
        songs,
        stats,
        playlistOwners: { ...playlistOwners },
      };
    }
    if (mode === "mine" && songSpaceMode === "shared" && songs.length > 0) {
      sharedLibrarySnapshotRef.current = {
        songs,
        stats,
        playlistOwners: { ...playlistOwners },
      };
    }
    pauseLayoutSync();
    clearFrozenIsolateBounds();
    invalidatePlaylistOverlapLayoutCache();
    invalidateLayoutPositionCaches();

    const nextLibraryScopeMode: LibraryScopeMode =
      mode === "mine" && isWebDeployment ? "isolate" : libraryScopeMode;
    if (nextLibraryScopeMode !== libraryScopeMode) {
      setLibraryScopeMode(nextLibraryScopeMode);
      saveLibraryScopeMode(nextLibraryScopeMode);
    }

    setSongSpaceMode(mode);
    saveSongSpaceMode(mode);
    reloadLayoutCaches(
      getActiveClusterLayoutScope(mode, nextLibraryScopeMode, sharedContributorCount)
    );

    const restorePersonalLibrary = () => {
      const personal = loadPersonalSpotifyLibrary();
      if (personal.songs.length > 0) {
        applyLoadedLibrary(
          personal.songs,
          personal.stats ?? normalizeStats(null, personal.songs),
          `My song space — ${personal.songs.length} tracks.`,
          {},
          { persist: false }
        );
        return true;
      }
      const snapshot = personalLibrarySnapshotRef.current;
      if (!snapshot || snapshot.songs.length === 0) {
        return false;
      }
      applyLoadedLibrary(
        snapshot.songs,
        snapshot.stats,
        `My song space — ${snapshot.songs.length} tracks.`,
        snapshot.playlistOwners,
        { persist: false }
      );
      return true;
    };

    if (mode === "shared") {
      const sharedSnapshot = sharedLibrarySnapshotRef.current;
      if (sharedSnapshot && sharedSnapshot.songs.length > 0) {
        applyLoadedLibrary(
          sharedSnapshot.songs,
          sharedSnapshot.stats,
          `Shared song space — ${sharedSnapshot.songs.length} tracks.`,
          sharedSnapshot.playlistOwners,
          { persist: false }
        );
      } else {
        startTransition(() => {
          void refreshSharedContributors({ loadLibrary: true, forceRefresh: true });
        });
      }
      setStatusMessage("Shared song space — collaborative library view.");
      return;
    }

    if (isWebDeployment && musicService === "spotify") {
      if (!restorePersonalLibrary()) {
        void (async () => {
          const cached = await loadCachedSpotifyLibrary();
          if (cached && cached.songs.length > 0) {
            applyLoadedLibrary(
              cached.songs,
              cached.stats ?? normalizeStats(null, cached.songs),
              `My song space — ${cached.songs.length} tracks.`,
              {},
              { persist: false }
            );
            return;
          }
          if (songsRef.current.length === 0) {
            setStatusMessage("My song space — load your library from Spotify to begin.");
          } else {
            setStatusMessage("My song space — your library layout and clusters.");
          }
        })();
      } else {
        setStatusMessage("My song space — your library layout and clusters.");
      }
      return;
    }

    setStatusMessage("My song space — your library layout and clusters.");
  };

  const handleIsolateToggle = () => {
    const nextMode: LibraryScopeMode = libraryScopeMode === "isolate" ? "conglomerate" : "isolate";
    pauseLayoutSync();
    clearFrozenIsolateBounds();
    startTransition(() => {
      setLibraryScopeMode(nextMode);
      saveLibraryScopeMode(nextMode);
      reloadLayoutCaches(
        getActiveClusterLayoutScope(songSpaceMode, nextMode, sharedContributorCount)
      );
      invalidateLayoutPositionCaches();
    });
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
    if (!spotifyStatus?.connected || !spotifyStatus.userId) {
      setStatusMessage("Connect Spotify before sharing your library.");
      return;
    }
    reclaimSpotifyWebStorageQuota();
    setIsImporting(true);
    try {
      const published = await publishSharedLibrary();
      saveLocalContributorId(published.contributor.id);
      await clearSpotifyImportSession();
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
    setCompletedStrokesRevision((value) => value + 1);
    strokeRef.current = [];
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
    if (isImportingRef.current) {
      return;
    }
    if (!spotifyCanLoadLibrary) {
      setStatusMessage("Connect Spotify before loading your library.");
      return;
    }
    reclaimSpotifyWebStorageQuota();
    const cooldownMs = getSpotifyImportRateLimitCooldownMs();
    if (cooldownMs > 0) {
      setStatusMessage(
        `Spotify rate limit — wait ${formatSpotifyRateLimitCooldown(cooldownMs)} before resuming. Progress is saved.`
      );
      return;
    }
    if (
      !options?.fresh &&
      !hasResumableSpotifyImport() &&
      (songs.length > 0 || (getLocalSpotifyLibraryForMerge()?.songs.length ?? 0) > 0)
    ) {
      await handleOpenSpotifySync();
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
          const published = await publishSharedLibrary();
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
      if (error instanceof SpotifyImportPausedError) {
        keepProgress = true;
        setImportProgress({
          phase: "saved-tracks",
          message: error.message,
          percent: error.percent,
        });
        setStatusMessage(error.message);
      } else if (error instanceof SpotifyImportRateLimitError) {
        keepProgress = true;
        const cooldownMs = getSpotifyImportRateLimitCooldownMs();
        setStatusMessage(
          cooldownMs > 0
            ? `Spotify is rate-limiting this app. Wait ${formatSpotifyRateLimitCooldown(cooldownMs)} before resuming — progress is saved.`
            : error.message
        );
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

  const getLocalSpotifyLibraryForMerge = useCallback((): {
    songs: Song[];
    stats: LibraryStats;
  } | null => {
    if (songs.length > 0 && stats) {
      return { songs, stats };
    }
    return null;
  }, [songs, stats]);

  const handleOpenSpotifySync = async () => {
    if (!spotifyCanLoadLibrary || isImportingRef.current) {
      return;
    }
    const cooldownMs = getSpotifyImportRateLimitCooldownMs();
    if (cooldownMs > 0) {
      setStatusMessage(
        `Spotify rate limit — wait ${formatSpotifyRateLimitCooldown(cooldownMs)} before syncing.`
      );
      return;
    }
    setSpotifySyncOpen(true);
    setSpotifySyncLoading(true);
    setSpotifySyncError(null);
    try {
      const catalog = await fetchSpotifyPlaylistCatalog();
      const filtered = spotifyStatus?.userId
        ? filterReadablePlaylists(catalog, spotifyStatus.userId)
        : catalog;
      setSpotifySyncPlaylists(filtered);
    } catch (error) {
      setSpotifySyncError(error instanceof Error ? error.message : "Could not fetch playlists.");
    } finally {
      setSpotifySyncLoading(false);
    }
  };

  const handleConfirmSpotifySync = async ({
    playlistIds,
    includeSavedTracks,
  }: {
    playlistIds: string[];
    includeSavedTracks: boolean;
  }) => {
    if (!musicProvider.loadLibrary) {
      setSpotifySyncOpen(false);
      return;
    }
    if (playlistIds.length === 0 && !includeSavedTracks) {
      return;
    }
    setSpotifySyncOpen(false);
    if (isImportingRef.current) {
      return;
    }
    const cooldownMs = getSpotifyImportRateLimitCooldownMs();
    if (cooldownMs > 0) {
      setStatusMessage(
        `Spotify rate limit — wait ${formatSpotifyRateLimitCooldown(cooldownMs)} before syncing.`
      );
      return;
    }

    const existing = getLocalSpotifyLibraryForMerge();
    setIsImporting(true);
    isImportingRef.current = true;
    setImportProgress({
      phase: "saved-tracks",
      message: includeSavedTracks ? "Refreshing Liked Songs…" : "Syncing selected playlists…",
      percent: 5,
    });
    let keepProgress = false;
    try {
      const loaded = await musicProvider.loadLibrary({
        selectedPlaylistIds: playlistIds,
        includeSavedTracks,
        playlistCatalog: spotifySyncPlaylists,
        mergeWithExisting: existing
          ? {
              songs: existing.songs,
              stats: existing.stats,
              playlistOwners,
            }
          : undefined,
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
        `Synced ${playlistIds.length} playlist${playlistIds.length === 1 ? "" : "s"}${
          includeSavedTracks ? " and Liked Songs" : ""
        } · ${loaded.songs.length.toLocaleString()} tracks total.`,
        loaded.playlistOwners ?? playlistOwners
      );
      if (isWebDeployment) {
        try {
          const published = await publishSharedLibrary();
          saveLocalContributorId(published.contributor.id);
          await refreshSharedContributors({ loadLibrary: songSpaceMode === "shared" });
          setStatusMessage(
            `Synced and shared ${published.trackCount} tracks as ${published.contributor.name}.`
          );
        } catch (error) {
          setStatusMessage(
            error instanceof Error
              ? `Synced your library, but sharing failed: ${error.message}`
              : "Synced your library, but sharing failed."
          );
        }
      }
    } catch (error) {
      if (error instanceof SpotifyImportPausedError) {
        keepProgress = true;
        setImportProgress({
          phase: "saved-tracks",
          message: error.message,
          percent: error.percent,
        });
        setStatusMessage(error.message);
      } else if (error instanceof SpotifyImportRateLimitError) {
        keepProgress = true;
        const nextCooldownMs = getSpotifyImportRateLimitCooldownMs();
        setStatusMessage(
          nextCooldownMs > 0
            ? `Spotify is rate-limiting this app. Wait ${formatSpotifyRateLimitCooldown(nextCooldownMs)} before resuming — progress is saved.`
            : error.message
        );
      } else {
        setStatusMessage(error instanceof Error ? error.message : "Could not sync Spotify library.");
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
    setCompletedStrokesRevision((value) => value + 1);
    setStrokeLayoutConfig(null);
    setIsDrawingNewPath(false);
    isDrawingRef.current = false;
    draftStrokeScheduleRef.current?.();
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
      invalidateLayoutPositionCaches();
    }
    const applyLayoutConfig = () => {
      setLayoutConfig(nextConfig);
      saveLayoutConfig(nextConfig);
      if (message) {
        setStatusMessage(message);
      }
    };
    if (isLargeLibrary) {
      startTransition(applyLayoutConfig);
    } else {
      applyLayoutConfig();
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

  const handleClusterModeChange = (clusterMode: ClusterMode) => {
    const message =
      clusterMode === "playlist"
        ? `Playlist overlap layout (${stats.playlistIds.length} playlists).`
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


  const hoveredSong = hoveredSongId
    ? songs.find((song) => song.id === getCanonicalSongId(hoveredSongId))
    : undefined;

  const collaboratorDisplayName = spotifyStatus?.displayName?.trim() || "Guest";
  const isSharedSongSpace = songSpaceMode === "shared";
  const clusterLayoutSyncMode = useMemo((): ClusterLayoutSyncMode => {
    if (!isWebDeployment || !isSharedSongSpace) {
      return "off";
    }
    if (isSingleContributorSharedLibrary(sharedContributorCount)) {
      return "off";
    }
    return "snapshot";
  }, [isSharedSongSpace, sharedContributorCount]);

  const roomClusterLayoutSeed = useMemo(
    () => loadClusterCenterOverrides(activeLayoutScope),
    [activeLayoutScope]
  );

  const presenceLayout = useMemo<CollaborativePresenceLayout>(
    () => ({
      layoutConfig,
      libraryScopeMode,
      songSpaceMode,
      includeMockUsers,
      viewContributorId:
        songSpaceMode === "mine" && spotifyStatus?.userId ? spotifyStatus.userId : null,
    }),
    [includeMockUsers, layoutConfig, libraryScopeMode, songSpaceMode, spotifyStatus?.userId]
  );

  const applySyncPresenceLayout = useCallback(
    (layout: CollaborativePresenceLayout, syncedViewTransform?: ViewTransform) => {
      const isGuest =
        isWebDeployment && musicService === "spotify" && spotifyStatus !== null && !spotifyStatus.connected;
      const nextLayoutConfig = normalizeLayoutConfigForService(layout.layoutConfig, musicService);
      const nextViewContributorId =
        layout.songSpaceMode === "mine" ? layout.viewContributorId ?? null : null;

      if (syncedViewTransform) {
        applyViewTransformLive(syncedViewTransform);
        scheduleNodeCullIdle();
      }

      startTransition(() => {
        setLayoutConfig(nextLayoutConfig);
        saveLayoutConfig(nextLayoutConfig);

        if (layout.songSpaceMode !== songSpaceMode) {
          clearFrozenIsolateBounds();
          setSongSpaceMode(layout.songSpaceMode);
          if (!isGuest) {
            saveSongSpaceMode(layout.songSpaceMode);
          }
        }
        if (layout.libraryScopeMode !== libraryScopeMode) {
          clearFrozenIsolateBounds();
          setLibraryScopeMode(layout.libraryScopeMode);
          if (!isGuest) {
            saveLibraryScopeMode(layout.libraryScopeMode);
          }
        }
        if (isGuest) {
          setGuestViewContributorId(nextViewContributorId);
          setClusterLayoutSyncRevision((value) => value + 1);
        }
        reloadLayoutCaches(
          getActiveClusterLayoutScope(
            layout.songSpaceMode,
            layout.libraryScopeMode,
            sharedContributorCount
          )
        );
      });

      const syncedName =
        layout.songSpaceMode === "mine" && nextViewContributorId
          ? "Synced view — viewing their song space."
          : "Synced view with collaborator.";
      setStatusMessage(syncedName);
    },
    [
      applyViewTransformLive,
      clearFrozenIsolateBounds,
      libraryScopeMode,
      musicService,
      scheduleDeferredNodeCullRefresh,
      scheduleNodeCullIdle,
      reloadLayoutCaches,
      sharedContributorCount,
      songSpaceMode,
      spotifyStatus,
    ]
  );

  const graphCanvasHandlersRef = useRef<MusicCueGraphCanvasHandlers>({
    onGraphPointerDown: () => {},
    onGraphPointerUp: () => {},
    onGraphPointerCancel: () => {},
    onGraphPointerLeave: () => {},
    onBackgroundPointerDown: () => {},
    onClusterLabelPointerDown: () => {},
    onClusterLabelPointerUp: () => {},
    onClusterLabelPointerEnter: () => {},
    onClusterLabelPointerLeave: () => {},
    onNodePointerDown: () => {},
    onNodePointerUp: () => {},
    onHoverSongEnter: () => {},
    onHoverSongLeave: () => {},
  });
  graphCanvasHandlersRef.current = {
    onGraphPointerDown: handleGraphPointerDown,
    onGraphPointerUp: (event) => finishPointerInteraction(event),
    onGraphPointerCancel: (event) => finishPointerInteraction(event),
    onGraphPointerLeave: (event) => {
      if (event.pointerType === "touch" || event.pointerType === "pen") {
        return;
      }
      if (event.buttons === 0) {
        setHoveredSongId(null);
        setHoveredClusterRegionId(null);
        finishPointerInteraction(event);
      }
    },
    onBackgroundPointerDown: handleBackgroundPointerDown,
    onClusterLabelPointerDown: handleClusterLabelPointerDown,
    onClusterLabelPointerUp: (event) => {
      if (!draggingClusterIdRef.current) {
        return;
      }
      event.stopPropagation();
      finishPointerInteraction(event);
    },
    onClusterLabelPointerEnter: (regionId) => {
      if (shouldSkipGraphPresenceUpdates()) {
        return;
      }
      setHoveredClusterRegionId(regionId);
    },
    onClusterLabelPointerLeave: (regionId) => {
      setHoveredClusterRegionId((current) => (current === regionId ? null : current));
    },
    onNodePointerDown: handleNodePointerDown,
    onNodePointerUp: handleNodePointerUp,
    onHoverSongEnter: (songId) => {
      if (shouldSkipGraphPresenceUpdates()) {
        return;
      }
      startTransition(() => setHoveredSongId(songId));
    },
    onHoverSongLeave: (songId) => {
      if (shouldSkipGraphPresenceUpdates()) {
        return;
      }
      startTransition(() =>
        setHoveredSongId((current) => (current === songId ? null : current))
      );
    },
  };

  return (
    <>
      <div className={`music-cue-layout${isMobileWebLayout ? " music-cue-layout--mobile-web" : ""}`}>
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
              <span ref={participantsHostRef} className="music-cue-live-host" />
            </p>
            <p className="music-cue-meta">
              Showing {visibleSongs.length} of {songs.length} tracks
              {isValidatingLibrary
                ? ` · checking ${musicProvider.displayName} library…`
                : unavailableSongIds.size > 0
                  ? ` · ${unavailableSongIds.size} unavailable (red)`
                  : ""}
              {culledNodeCountRef.current > 0
                ? ` · showing ${visibleNodeCountRef.current} nodes (zoom/pan for detail)`
                : ""}
              {sharedTrackCount > 0 ? ` · ${sharedTrackCount} in common` : ""}
              {songSpaceMode === "shared" && sharedContributors.length > 0
                ? ` · ${sharedContributors.map((contributor) => contributor.name).join(" + ")}`
                : ""}
              {isLoadingSharedLibrary
                ? isSpotifyGuest && songs.length === 0
                  ? " · loading shared library…"
                  : " · refreshing shared library…"
                : ""}
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
                : " · drag to pan · scroll or pinch to zoom"}
              {graphTool === "navigate" && isClusterLayout && !isGuestViewOnly
                ? " · drag labels to move clusters · ⌘⇧ drag to box-select"
                : ""}
            </p>
          </div>

          <div className="music-cue-service-toggle" role="group" aria-label="Music service" hidden={isMobileWebLayout}>
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
            <SpotifyLibraryActions
              musicService={musicService}
              importResumeRevision={importResumeRevision}
              isImporting={isImporting}
              spotifyStatusLoading={spotifyStatusLoading}
              spotifyCanLoadLibrary={spotifyCanLoadLibrary}
              spotifyStatus={spotifyStatus}
              spotifyImportResumeLabel={spotifyImportResumeLabel}
              hasLocalLibrary={
                songs.length > 0 || (getLocalSpotifyLibraryForMerge()?.songs.length ?? 0) > 0
              }
              isLoadingSharedLibrary={isLoadingSharedLibrary}
              onConnect={() => void handleConnectSpotify()}
              onLoadLibrary={() => void handleLoadSpotifyLibrary()}
              onLoadLibraryFresh={() => void handleLoadSpotifyLibrary({ fresh: true })}
              onPublishSharedLibrary={() => void handlePublishSharedLibrary()}
              onRefreshSharedLibrary={handleRefreshSharedLibrary}
            />
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
              {isSpotifyGuest ? (
                <p className="music-cue-guest-view-note">
                  {songSpaceMode === "mine" && guestViewContributorId
                    ? `Viewing ${
                        sharedContributors.find((contributor) => contributor.id === guestViewContributorId)
                          ?.name ?? "collaborator"
                      }'s song space`
                    : "Shared song space — use Sync view on a participant to follow them"}
                </p>
              ) : (
                <>
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
                </>
              )}
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
                    {clusterMode === "genre" ? "Genre" : "Playlists"}
                  </button>
                ))}
              </div>
              {layoutConfig.clusterMode === "playlist" ? (
                <button
                  type="button"
                  className={playlistGraphView ? "music-cue-layout-active" : ""}
                  onClick={() => {
                    const enabled = !playlistGraphView;
                    startTransition(() => {
                      setPlaylistGraphView(enabled);
                      savePlaylistGraphView(enabled);
                    });
                    setStatusMessage(
                      enabled
                        ? "Graph view on — playlist nodes and overlap lines only. Drag labels to untangle."
                        : "Graph view off."
                    );
                  }}
                >
                  Graph view
                </button>
              ) : null}
              {showPlaylistMetaGraph ? (
                <span className="music-cue-axis-note">
                  Playlist nodes and overlap lines only. Drag labels to rearrange.
                </span>
              ) : null}
              {showPlaylistMetaGraph ? (
                <button
                  type="button"
                  className={playlistGraphForceSim ? "music-cue-layout-active" : ""}
                  onClick={() => {
                    if (playlistGraphForceSim) {
                      stopMetaGraphForceSim();
                      setStatusMessage("Force simulation stopped — cluster positions saved.");
                      return;
                    }
                    metaGraphForceNodesRef.current = createMetaGraphForceNodes(getGraphViewClusterRegions());
                    metaGraphForceEdgesRef.current = buildMetaGraphForceEdges(
                      metaGraphForceNodesRef.current,
                      graphLayerRef.current?.getPlaylistMetaGraphEdges() ?? []
                    );
                    layoutSyncPausedRef.current = true;
                    metaGraphForceSimActiveRef.current = true;
                    setPlaylistGraphForceSim(true);
                    setStatusMessage(
                      "Force simulation running — shared playlists attract, all nodes repel. Drag labels to nudge."
                    );
                  }}
                >
                  Force sim
                </button>
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

        <div className="music-cue-toolbar-row music-cue-toolbar-row-filters" hidden={isMobileWebLayout}>
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
                  {asStringArray(stats.genres).map((genre) => (
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
          <MusicCueGraphLayer
            structureKey={graphStructureKey}
            interactionRevisionKey={interactionRevisionKey}
            layerRef={graphLayerRef}
            visibleNodeCountRef={visibleNodeCountRef}
            culledNodeCountRef={culledNodeCountRef}
            visibleSongs={visibleSongs}
            graphSongs={graphSongs}
            songs={songs}
            stats={stats}
            playlistOwners={playlistOwners}
            layoutConfig={layoutConfig}
            layoutLibraryScopeMode={layoutLibraryScopeMode}
            libraryScopeMode={libraryScopeMode}
            songSpaceMode={songSpaceMode}
            activeContributorIds={activeContributorIds}
            clusterOverrides={clusterOverrides}
            layoutClusterOverrides={layoutClusterOverrides}
            activeLayoutScope={activeLayoutScope}
            sharedContributorCount={sharedContributorCount}
            dimensions={dimensions}
            musicService={musicService}
            isolateBoundsRevision={isolateBoundsRevision}
            isolateOwnerBounds={isolateOwnerBounds}
            skipIsolateCentroidTranslation={skipIsolateCentroidTranslation}
            getMetaClusterCenter={getMetaClusterCenter}
            isolateGraphSongs={isolateGraphSongs}
            conglomerateClusterOverridesRef={conglomerateClusterOverridesRef}
            showIsolateContributorView={showIsolateContributorView}
            layoutShowIsolateContributorView={layoutShowIsolateContributorView}
            playlistGraphViewActive={playlistGraphViewActive}
            useWebPerformanceOptimizations={useWebPerformanceOptimizations}
            viewTransformRef={viewTransformRef}
            pauseGraphAnimationsRef={pauseGraphAnimationsRef}
            hoveredSongId={hoveredSongId}
            hoveredClusterRegionId={hoveredClusterRegionId}
            selectedSongId={selectedSongId}
            activePersistentId={activePersistentId}
            cue={cue}
            buildMode={buildMode}
            completedStrokes={completedStrokes}
            pathThreshold={pathThreshold}
            graphTool={graphTool}
            svgRef={svgRef}
            contentGroupRef={contentGroupRef}
            bgRectRef={bgRectRef}
            handlersRef={graphCanvasHandlersRef}
            boxSelectRect={boxSelectRect}
            fadingClusterSnapshot={fadingClusterSnapshot}
            clusterRevealOpacity={clusterRevealOpacity}
            playlistGraphForceSim={playlistGraphForceSim}
            isClusterDragging={isClusterDragging}
            clusterDragSnapshotRef={clusterDragSnapshotRef}
            clusterDragGraphDeltaRef={clusterDragGraphDeltaRef}
            clusterDragPreviewScheduleRef={clusterDragPreviewScheduleRef}
            unavailableSongIds={unavailableSongIds}
            selectedClusterIds={selectedClusterIds}
            isGuestViewOnly={isGuestViewOnly}
            isSharedIsolateClusterDragDisabled={isSharedIsolateClusterDragDisabled}
            metaGraphForceNodesRef={metaGraphForceNodesRef}
            metaGraphForceEdgesRef={metaGraphForceEdgesRef}
            isDrawingNewPathRef={isDrawingNewPathRef}
            draftStrokeActiveRef={draftStrokeActiveRef}
            draftStrokeRef={strokeRef}
            draftStrokeScheduleRef={draftStrokeScheduleRef}
            strokeLayoutConfig={strokeLayoutConfig}
            viewTransformForHoverRef={viewTransformRef}
            hoveredSong={hoveredSong}
          />
        </div>

        {showCueSidebar ? (
        <aside
          className={`music-cue-cue-sidebar${
            isMobileWebLayout ? " music-cue-cue-sidebar--mobile" : ""
          }${isMobileWebLayout && cueSidebarCollapsed ? " is-collapsed" : ""}`}
        >
          {isMobileWebLayout ? (
            <div className="music-cue-cue-sidebar-mobile-bar">
              <button
                type="button"
                className="music-cue-cue-sidebar-toggle"
                onClick={() => setCueSidebarCollapsed((collapsed) => !collapsed)}
                aria-expanded={!cueSidebarCollapsed}
              >
                {cueSidebarCollapsed ? "Cue" : "Hide"}
                {cue?.songs.length ? ` (${cue.songs.length})` : ""}
              </button>
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
                {useSpotifyLocalExport ? "Play" : "Play"}
              </button>
            </div>
          ) : null}
          {(graphTool === "draw" && !isMobileWebLayout) ||
          (isMobileWebLayout && !cueSidebarCollapsed) ? (
            <>
          {!isMobileWebLayout && graphTool === "draw" ? (
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
          ) : null}

          {!isMobileWebLayout && graphTool === "draw" ? (
          <label className="music-cue-slider-label music-cue-cue-path-slider music-cue-cue-path-slider-sidebar">
              Cue length
              <input
                type="number"
                className="music-cue-cue-length-input"
                min={0}
                step={1}
                value={cueLength}
                placeholder="All"
                onChange={(event) => handleCueLengthChange(Number(event.target.value))}
              />
              <span className="music-cue-cue-length-hint">0 = all songs along path</span>
            </label>
          ) : null}

          <div className="music-cue-cue-header">
            <h2 className="music-cue-cue-title">Cue</h2>
            {!isMobileWebLayout ? (
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
            ) : (
            <div className="music-cue-actions music-cue-cue-actions music-cue-cue-actions--mobile">
              <button type="button" onClick={handleOpenExportDialog} disabled={!cue}>
                Export
              </button>
              {buildMode === "manual" ? (
                <button type="button" onClick={handleUndo} disabled={!canUndo}>
                  Undo
                </button>
              ) : null}
            </div>
            )}
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
      <SpotifySyncDialog
        open={spotifySyncOpen}
        loading={spotifySyncLoading}
        error={spotifySyncError}
        playlists={spotifySyncPlaylists}
        localStats={stats}
        onClose={() => {
          if (!spotifySyncLoading) {
            setSpotifySyncOpen(false);
          }
        }}
        onConfirm={(selection) => void handleConfirmSpotifySync(selection)}
      />
      <CollaborativePlayProvider>
        <CollaborativeLayoutProvider
          clusterOverrides={clusterOverrides}
          setClusterOverrides={applyClusterOverrides}
          draggingClusterIdRef={draggingClusterIdRef}
          metaGraphForceSimActiveRef={metaGraphForceSimActiveRef}
          layoutSyncPausedRef={layoutSyncPausedRef}
          layoutScope={activeLayoutScope}
          roomLayoutSeed={roomClusterLayoutSeed}
          clusterLayoutSyncMode={clusterLayoutSyncMode}
          enableRemoteClusterPublish={isSharedSongSpace && !isSpotifyGuest}
          publishRef={publishClusterLayoutRef}
          clusterLayoutSyncRevision={clusterLayoutSyncRevision}
        >
          <CollaborativeSessionProvider
            displayName={collaboratorDisplayName}
            presenceLayout={presenceLayout}
            onSyncPresenceLayout={applySyncPresenceLayout}
            viewTransformRef={viewTransformRef}
            enabled={!isSpotifyGuest || songs.length > 0}
          >
            <CollaborativeSessionUi
              publishRef={collaborativeGraphCursorRef}
              viewPresencePublishRef={viewPresencePublishRef}
              contentGroupRef={contentGroupRef}
              dimensions={dimensions}
              participantsHostRef={participantsHostRef}
            />
          </CollaborativeSessionProvider>
        </CollaborativeLayoutProvider>
      </CollaborativePlayProvider>
    </>
  );
};
