import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { buildClusterRegions, ClusterRegion } from "../lib/clusterRegions";
import { syncClusterLayoutToServer } from "../lib/clusterLayoutSync";
import {
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
import { generateCueFromStroke } from "../lib/pathGenerator";
import {
  buildTerminalPlayCueCommand,
  buildTerminalSavePlaylistCommand,
  CueTrack,
} from "../lib/appleMusicScript";
import { MusicServiceId } from "../lib/musicProvider";
import { isWebDeployment } from "../lib/runtime";
import { getMusicProvider } from "../lib/providers";
import {
  DEFAULT_VIEW_TRANSFORM,
  screenToGraphPoint,
  toViewTransformString,
  ViewTransform,
  zoomAtPoint,
} from "../lib/graphView";
import {
  loadBuildMode,
  loadClusterCenterOverrides,
  loadLayoutConfig,
  loadLibrary,
  loadMusicService,
  loadPathThreshold,
  saveBuildMode,
  saveGenreClusterCenterOverrides,
  saveLayoutConfig,
  saveLibrary,
  saveMusicService,
  savePathThreshold,
  savePlaylistClusterCenterOverrides,
} from "../lib/storage";
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
  listSharedContributors,
  loadEnabledContributorIds,
  loadMergedSharedLibrary,
  publishSharedLibrary,
  saveEnabledContributorIds,
  toLoadedLibrary,
} from "../lib/sharedLibraryApi";
import type { LibraryContributor } from "../../shared/sharedLibrary";
import {
  AxisMetric,
  ClusterCenterOverrides,
  ClusterMode,
  CueBuildMode,
  GeneratedCue,
  GraphPoint,
  LayoutConfig,
  LibraryStats,
  NormalizedPoint,
  Song,
  ViewMode,
} from "../lib/types";
import { isClusterLayoutConfig, useLayoutTransition } from "../lib/useLayoutTransition";

const getGraphDimensions = (panel: HTMLDivElement | null): GraphDimensions => ({
  width: Math.max(320, panel?.clientWidth ?? 800),
  height: Math.max(280, panel?.clientHeight ?? 600),
});

const LIBRARY_VALIDATE_CHUNK = 80;

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

export const MusicCueTool = () => {
  const graphPanelRef = useRef<HTMLDivElement | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const contentGroupRef = useRef<SVGGElement | null>(null);
  const bgRectRef = useRef<SVGRectElement | null>(null);
  const strokeRef = useRef<GraphPoint[]>([]);
  const isDrawingRef = useRef(false);
  const savedStrokeRef = useRef<GraphPoint[]>([]);
  const draggingClusterIdRef = useRef<string | null>(null);
  const clusterDragSessionRef = useRef<{
    clusterIds: string[];
    startPositions: Record<string, NormalizedPoint>;
    anchorStart: NormalizedPoint;
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
    spaceHeld: boolean;
    boxEnd?: GraphPoint;
    mode: "pending" | "pan" | "draw" | "box-select";
  } | null>(null);
  const viewTransformRef = useRef<ViewTransform>(DEFAULT_VIEW_TRANSFORM);
  const undoStackRef = useRef<(GeneratedCue | null)[]>([]);

  const initialMusicService = loadMusicService();
  const initialLibrary = loadLibrary(initialMusicService);
  const initialSongs = normalizeSongs(initialLibrary.songs, initialLibrary.stats);
  const [musicService, setMusicService] = useState<MusicServiceId>(initialMusicService);
  const musicProvider = useMemo(() => getMusicProvider(musicService), [musicService]);
  const [spotifyStatus, setSpotifyStatus] = useState<{ connected: boolean; configured: boolean; message?: string } | null>(
    null
  );
  const [sharedContributors, setSharedContributors] = useState<LibraryContributor[]>([]);
  const [enabledContributorIds, setEnabledContributorIds] = useState<string[]>(() => loadEnabledContributorIds());
  const [sharedTrackCount, setSharedTrackCount] = useState(0);
  const [isLoadingSharedLibrary, setIsLoadingSharedLibrary] = useState(false);
  const [dimensions, setDimensions] = useState<GraphDimensions>(() => getGraphDimensions(null));
  const [viewTransform, setViewTransform] = useState<ViewTransform>(DEFAULT_VIEW_TRANSFORM);
  const [buildMode, setBuildMode] = useState<CueBuildMode>(() => loadBuildMode());
  const [canUndo, setCanUndo] = useState(false);
  const [songs, setSongs] = useState<Song[]>(() => initialSongs);
  const [stats, setStats] = useState<LibraryStats>(() => normalizeStats(initialLibrary.stats, initialSongs));
  const [layoutConfig, setLayoutConfig] = useState<LayoutConfig>(() => loadLayoutConfig(initialMusicService));
  const [clusterOverrides, setClusterOverrides] = useState<ClusterCenterOverrides>(() => loadClusterCenterOverrides());
  const clusterOverridesRef = useRef(clusterOverrides);
  const [pathThreshold, setPathThreshold] = useState(() => loadPathThreshold());
  const [stroke, setStroke] = useState<GraphPoint[]>([]);
  const [strokeLayoutConfig, setStrokeLayoutConfig] = useState<LayoutConfig | null>(null);
  const [isDrawingNewPath, setIsDrawingNewPath] = useState(false);
  const [cue, setCue] = useState<GeneratedCue | null>(null);
  const [hoveredSongId, setHoveredSongId] = useState<string | null>(null);
  const [activePlaylistName, setActivePlaylistName] = useState<string | null>(null);
  const [activePersistentId, setActivePersistentId] = useState<string | null>(null);
  const [playbackTrackingEnabled, setPlaybackTrackingEnabled] = useState(false);
  const [fadingClusterSnapshot, setFadingClusterSnapshot] = useState<{
    id: number;
    regions: ClusterRegion[];
    opacity: number;
  } | null>(null);
  const [clusterRevealOpacity, setClusterRevealOpacity] = useState(1);
  const prevLayoutForClustersRef = useRef(layoutConfigKey(layoutConfig));
  const wasLayoutTransitioningRef = useRef(false);
  const clusterFadeInFrameRef = useRef(0);
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
  const [isPanning, setIsPanning] = useState(false);
  const [shiftHeld, setShiftHeld] = useState(false);
  const [spaceHeld, setSpaceHeld] = useState(false);
  const [boxSelectRect, setBoxSelectRect] = useState<BoxSelectRect | null>(null);
  const [selectedClusterIds, setSelectedClusterIds] = useState<Set<string>>(() => new Set());

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

    void musicProvider.getConnectionStatus().then(setSpotifyStatus);
  }, [musicProvider, musicService]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("spotify") === "connected" && musicService === "spotify") {
      setStatusMessage("Spotify connected. Load your library to begin.");
      window.history.replaceState({}, "", window.location.pathname);
      void musicProvider.getConnectionStatus().then(setSpotifyStatus);
    }
  }, [musicProvider, musicService]);

  useEffect(() => {
    songsRef.current = songs;
  }, [songs]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Shift") {
        setShiftHeld(true);
        return;
      }
      if (event.key === " " || event.code === "Space") {
        const target = event.target;
        const isTyping =
          target instanceof HTMLInputElement ||
          target instanceof HTMLTextAreaElement ||
          target instanceof HTMLSelectElement;
        if (!isTyping) {
          event.preventDefault();
          setSpaceHeld(true);
        }
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
        if (buildMode === "manual" && undoStackRef.current.length > 0) {
          event.preventDefault();
          const previous = undoStackRef.current.pop() ?? null;
          setCanUndo(undoStackRef.current.length > 0);
          setCue(previous);
          if (!previous) {
            setSelectedSongId(null);
          }
          setStatusMessage("Undid last add.");
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
      if (event.key === " " || event.code === "Space") {
        setSpaceHeld(false);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
    };
  }, [buildMode]);

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
    const svg = svgRef.current;
    if (!svg) {
      return undefined;
    }

    const handleWheel = (event: WheelEvent) => {
      event.preventDefault();
      setViewTransform((current) => zoomAtPoint(current, event.clientX, event.clientY, svg, event.deltaY));
    };

    svg.addEventListener("wheel", handleWheel, { passive: false });
    return () => svg.removeEventListener("wheel", handleWheel);
  }, []);

  useEffect(() => {
    if (songs.length === 0) {
      setUnavailableSongIds(new Set());
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
  }, [musicProvider, songs]);

  const visibleSongs = useMemo(() => {
    const query = searchFilter.trim().toLowerCase();
    const minPlays = Number(minPlayCount) || 0;
    return songs.filter((song) => {
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
  }, [genreFilter, minPlayCount, musicService, searchFilter, songs]);

  const computeLayoutPosition = useCallback(
    (song: Song, config: LayoutConfig): GraphPoint =>
      layoutSongPosition(song, dimensions, config, stats, {}, clusterOverrides, visibleSongs),
    [clusterOverrides, dimensions, stats, visibleSongs]
  );

  const clusterSnapshotInputsRef = useRef({
    visibleSongs,
    stats,
    dimensions,
    clusterOverrides,
    computeLayoutPosition,
  });
  clusterSnapshotInputsRef.current = {
    visibleSongs,
    stats,
    dimensions,
    clusterOverrides,
    computeLayoutPosition,
  };

  const getPosition = useCallback(
    (song: Song): GraphPoint => computeLayoutPosition(song, layoutConfig),
    [computeLayoutPosition, layoutConfig]
  );

  const { getDisplayPosition, transition } = useLayoutTransition(
    layoutConfig,
    visibleSongs,
    dimensions,
    computeLayoutPosition
  );

  const isLayoutTransitioning =
    transition.isAnimating || layoutConfigKey(layoutConfig) !== layoutConfigKey(transition.toLayout);
  const effectiveClusterRevealOpacity =
    isLayoutTransitioning && isClusterView(layoutConfig) ? 0 : clusterRevealOpacity;

  const positionedSongs = useMemo(
    () => visibleSongs.map((song) => ({ song, position: getDisplayPosition(song) })),
    [visibleSongs, getDisplayPosition]
  );

  const songNodeFills = useMemo(() => {
    const fills = new Map<string, string>();
    visibleSongs.forEach((song) => {
      fills.set(song.id, getSongNodeFill(song, layoutConfig, stats, visibleSongs));
    });
    return fills;
  }, [layoutConfig, stats, visibleSongs]);

  const clusterRegions = useMemo(() => {
    if (!isClusterView(layoutConfig) || isLayoutTransitioning) {
      return [];
    }
    return buildClusterRegions(
      layoutConfig.clusterMode,
      visibleSongs,
      getDisplayPosition,
      stats,
      dimensions,
      clusterOverrides
    );
  }, [clusterOverrides, dimensions, getDisplayPosition, isLayoutTransitioning, layoutConfig, stats, visibleSongs]);

  useEffect(() => {
    const wasTransitioning = wasLayoutTransitioningRef.current;
    const isTransitioning = isLayoutTransitioning;
    wasLayoutTransitioningRef.current = isTransitioning;

    if (clusterFadeInFrameRef.current) {
      cancelAnimationFrame(clusterFadeInFrameRef.current);
      clusterFadeInFrameRef.current = 0;
    }

    if (isTransitioning) {
      if (isClusterView(layoutConfig) || isClusterView(transition.fromLayout)) {
        setClusterRevealOpacity(0);
      }
      return undefined;
    }

    if (!isClusterView(layoutConfig)) {
      setClusterRevealOpacity(1);
      return undefined;
    }

    if (!wasTransitioning) {
      return undefined;
    }

    const startTime = performance.now();
    const tick = (now: number) => {
      const progress = Math.min(1, (now - startTime) / CLUSTER_FADE_MS);
      setClusterRevealOpacity(progress);
      if (progress < 1) {
        clusterFadeInFrameRef.current = requestAnimationFrame(tick);
      } else {
        clusterFadeInFrameRef.current = 0;
      }
    };

    clusterFadeInFrameRef.current = requestAnimationFrame(tick);
    return () => {
      if (clusterFadeInFrameRef.current) {
        cancelAnimationFrame(clusterFadeInFrameRef.current);
        clusterFadeInFrameRef.current = 0;
      }
    };
  }, [isLayoutTransitioning, layoutConfig, transition.fromLayout]);

  useLayoutEffect(() => {
    const previousKey = prevLayoutForClustersRef.current;
    const currentKey = layoutConfigKey(layoutConfig);
    if (previousKey === currentKey) {
      return;
    }

    if (clusterFadeInFrameRef.current) {
      cancelAnimationFrame(clusterFadeInFrameRef.current);
      clusterFadeInFrameRef.current = 0;
    }

    const previousLayout = transition.fromLayout;
    if (isClusterView(previousLayout)) {
      const { visibleSongs: songs, stats: libraryStats, dimensions: graphDimensions, clusterOverrides: overrides, computeLayoutPosition } =
        clusterSnapshotInputsRef.current;
      clusterFadeOutIdRef.current += 1;
      setFadingClusterSnapshot({
        id: clusterFadeOutIdRef.current,
        regions: buildClusterRegions(
          previousLayout.clusterMode,
          songs,
          (song) => computeLayoutPosition(song, previousLayout),
          libraryStats,
          graphDimensions,
          overrides
        ),
        opacity: 1,
      });
    } else {
      setFadingClusterSnapshot(null);
    }

    prevLayoutForClustersRef.current = currentKey;
  }, [layoutConfig, transition.fromLayout]);

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
      return generateCueFromStroke(visibleSongs, currentStroke, getPosition, threshold, layoutConfig);
    },
    [getPosition, layoutConfig, visibleSongs]
  );

  const selectedSong = useMemo(
    () => (selectedSongId ? songs.find((song) => song.id === selectedSongId) : undefined),
    [selectedSongId, songs]
  );

  const createBaseCue = useCallback(
    (initialSongs: Song[] = []): GeneratedCue => ({
      seed: initialSongs[0]?.id.charCodeAt(0) ?? 0,
      songs: initialSongs,
      stroke: strokeRef.current,
      layoutConfig,
      pathThreshold,
      buildMode,
    }),
    [buildMode, layoutConfig, pathThreshold]
  );

  const snapshotCue = (value: GeneratedCue | null): GeneratedCue | null =>
    value ? { ...value, songs: [...value.songs], stroke: [...value.stroke] } : null;

  const pushUndo = useCallback((snapshot: GeneratedCue | null) => {
    undoStackRef.current = [...undoStackRef.current, snapshotCue(snapshot)];
    setCanUndo(true);
  }, []);

  const clearUndo = useCallback(() => {
    undoStackRef.current = [];
    setCanUndo(false);
  }, []);

  const insertSongAt = useCallback(
    (song: Song, index: number, options?: { recordUndo?: boolean }) => {
      if (options?.recordUndo && buildMode === "manual") {
        pushUndo(cue);
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
      setSelectedSongId(song.id);

      if (buildMode === "manual") {
        insertSongAt(song, cue?.songs.length ?? 0, { recordUndo: true });
        setStatusMessage(`Added ${song.artist} — ${song.title} to cue.`);
        return;
      }

      setStatusMessage(`Selected ${song.artist} — ${song.title}. Use Add to end or Add next.`);
    },
    [buildMode, cue, insertSongAt]
  );

  const handleAddToEnd = useCallback(() => {
    if (!selectedSong) {
      return;
    }
    insertSongAt(selectedSong, cue?.songs.length ?? 0);
    setStatusMessage(`Added ${selectedSong.title} to end of cue.`);
  }, [cue, insertSongAt, selectedSong]);

  const handleAddNext = useCallback(() => {
    if (!selectedSong) {
      return;
    }

    const baseSongs = cue?.songs ?? [];
    let insertIndex = baseSongs.length;
    if (baseSongs.length > 0 && activePersistentId) {
      const playingIndex = baseSongs.findIndex((song) => song.id === activePersistentId);
      insertIndex = playingIndex >= 0 ? playingIndex + 1 : baseSongs.length;
    }

    insertSongAt(selectedSong, insertIndex);
    setStatusMessage(`Added ${selectedSong.title} next in cue.`);
  }, [activePersistentId, cue, insertSongAt, selectedSong]);

  const handleUndo = useCallback(() => {
    if (buildMode !== "manual" || undoStackRef.current.length === 0) {
      return;
    }
    const previous = undoStackRef.current.pop() ?? null;
    setCanUndo(undoStackRef.current.length > 0);
    setCue(previous);
    if (!previous) {
      setSelectedSongId(null);
    }
    setStatusMessage("Undid last add.");
  }, [buildMode]);

  const handleBuildModeChange = useCallback(
    (mode: CueBuildMode) => {
      setBuildMode(mode);
      saveBuildMode(mode);
      clearUndo();
      setSelectedSongId(null);

      if (mode === "manual") {
        setStroke([]);
        setStrokeLayoutConfig(null);
        strokeRef.current = [];
        savedStrokeRef.current = [];
        setIsDrawingNewPath(false);
        setStatusMessage("Manual mode: click nodes to add tracks. ⌘Z to undo.");
        return;
      }

      setStatusMessage("Path mode: drag on the graph to draw a path. Hold space while dragging to pan.");
    },
    [clearUndo]
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

  const beginNewStroke = (point: GraphPoint) => {
    isDrawingRef.current = true;
    setIsDrawingNewPath(true);
    setStrokeLayoutConfig(layoutConfig);
    savedStrokeRef.current = stroke;
    strokeRef.current = [point];
    setStroke([point]);
    setStatusMessage("Drawing path… release to generate cue.");
  };

  const appendStrokePoint = (point: GraphPoint) => {
    setStroke((current) => {
      const last = current[current.length - 1];
      if (!last || Math.hypot(point.x - last.x, point.y - last.y) < 4) {
        return current;
      }
      const next = [...current, point];
      strokeRef.current = next;
      return next;
    });
  };

  const finishStrokeDrawing = () => {
    const currentStroke = strokeRef.current;
    isDrawingRef.current = false;
    setIsDrawingNewPath(false);

    if (currentStroke.length < 2) {
      strokeRef.current = savedStrokeRef.current;
      setStroke(savedStrokeRef.current);
      setStatusMessage("Draw a longer path to generate a cue.");
      return;
    }

    const generated = regenerateCueFromStroke(currentStroke, pathThreshold);

    if (!generated) {
      strokeRef.current = savedStrokeRef.current;
      setStroke(savedStrokeRef.current);
      setStatusMessage("No songs matched that path. Widen the path threshold or draw closer to nodes.");
      return;
    }

    setCue({ ...generated, buildMode: "path" });
    setStrokeLayoutConfig(generated.layoutConfig);
    clearUndo();
    setStatusMessage(`Generated ${generated.songs.length} songs along the path. Press Play to start.`);
  };

  const handleClusterLabelPointerDown = (
    event: React.PointerEvent<SVGTextElement>,
    clusterId: string,
    label: string
  ) => {
    if (!isClusterLayout) {
      return;
    }
    event.stopPropagation();
    const overrideMap =
      layoutConfig.viewMode === "cluster" && layoutConfig.clusterMode === "genre"
        ? clusterOverrides.genre
        : clusterOverrides.playlist;
    const clustersToMove =
      selectedClusterIds.size > 0 && selectedClusterIds.has(clusterId)
        ? [...selectedClusterIds]
        : [clusterId];
    const startPositions: Record<string, NormalizedPoint> = {};

    clustersToMove.forEach((id) => {
      if (overrideMap[id]) {
        startPositions[id] = { ...overrideMap[id] };
        return;
      }
      const region = clusterRegions.find((entry) => entry.id === id);
      startPositions[id] = region
        ? toNormalizedPosition(region.center, dimensions)
        : { x: 0.5, y: 0.5 };
    });

    const anchorRegion = clusterRegions.find((entry) => entry.id === clusterId);
    const anchorStart =
      startPositions[clusterId] ??
      (anchorRegion ? toNormalizedPosition(anchorRegion.center, dimensions) : { x: 0.5, y: 0.5 });

    clusterDragSessionRef.current = {
      clusterIds: clustersToMove,
      startPositions,
      anchorStart,
    };
    draggingClusterIdRef.current = clusterId;
    event.currentTarget.setPointerCapture(event.pointerId);
    setStatusMessage(
      clustersToMove.length > 1 ? `Dragging ${clustersToMove.length} clusters…` : `Dragging ${label}…`
    );
  };

  const handleNodePointerDown = (event: React.PointerEvent<SVGCircleElement>, song: Song) => {
    event.stopPropagation();
    nodePointerStartRef.current = {
      songId: song.id,
      clientX: event.clientX,
      clientY: event.clientY,
    };
  };

  const handleNodePointerUp = (event: React.PointerEvent<SVGCircleElement>, song: Song) => {
    event.stopPropagation();
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
      target.closest(".music-cue-node-hit") || target.closest(".music-cue-cluster-label-draggable")
    );
  };

  const handleGraphPointerDown = (event: React.PointerEvent<SVGSVGElement>) => {
    if (!svgRef.current || event.button !== 0) {
      return;
    }
    if (isInteractiveGraphTarget(event.target)) {
      return;
    }

    const point = getLocalPoint(event, svgRef.current, contentGroupRef.current);
    panSessionRef.current = {
      pointerId: event.pointerId,
      clientX: event.clientX,
      clientY: event.clientY,
      panX: viewTransformRef.current.panX,
      panY: viewTransformRef.current.panY,
      graphStart: point,
      shiftHeld: event.shiftKey,
      metaShiftHeld: (event.metaKey || event.ctrlKey) && event.shiftKey,
      spaceHeld: spaceHeld,
      mode: "pending",
    };
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
      setClusterOverrides((current) => {
        const updates: Record<string, NormalizedPoint> = {};
        session.clusterIds.forEach((id) => {
          const start = session.startPositions[id];
          updates[id] = { x: start.x + delta.x, y: start.y + delta.y };
        });
        if (layoutConfig.viewMode === "cluster" && layoutConfig.clusterMode === "genre") {
          const next = { ...current, genre: { ...current.genre, ...updates } };
          saveGenreClusterCenterOverrides(next.genre);
          clusterOverridesRef.current = next;
          return next;
        }
        if (layoutConfig.viewMode === "cluster" && layoutConfig.clusterMode === "playlist") {
          const next = {
            ...current,
            playlist: { ...current.playlist, ...updates },
          };
          savePlaylistClusterCenterOverrides(next.playlist);
          invalidatePlaylistOverlapLayoutCache();
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

      if (session.metaShiftHeld && isClusterLayout) {
        session.mode = "box-select";
        const point = getLocalPoint(event, svgRef.current, contentGroupRef.current);
        session.boxEnd = point;
        setBoxSelectRect({
          x1: session.graphStart.x,
          y1: session.graphStart.y,
          x2: point.x,
          y2: point.y,
        });
      } else if (buildMode === "path" && visibleSongs.length > 0 && !session.spaceHeld) {
        session.mode = "draw";
        beginNewStroke(session.graphStart);
        appendStrokePoint(getLocalPoint(event, svgRef.current, contentGroupRef.current));
      } else {
        session.mode = "pan";
        setIsPanning(true);
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
      setViewTransform({
        scale: viewTransformRef.current.scale,
        panX: session.panX + (event.clientX - session.clientX),
        panY: session.panY + (event.clientY - session.clientY),
      });
      return;
    }

    if (session.mode === "draw" && isDrawingRef.current) {
      appendStrokePoint(getLocalPoint(event, svgRef.current, contentGroupRef.current));
    }
  };

  const finishPointerInteraction = () => {
    if (draggingClusterIdRef.current) {
      draggingClusterIdRef.current = null;
      clusterDragSessionRef.current = null;
      setStatusMessage("Cluster position saved.");
      if (!isWebDeployment) {
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

    resetPanSession();
  };

  const handlePathThresholdChange = (value: number) => {
    setPathThreshold(value);
    savePathThreshold(value);
    if (strokeRef.current.length >= 2) {
      const generated = regenerateCueFromStroke(strokeRef.current, value);
      if (generated) {
        setCue(generated);
        setStatusMessage(`Path threshold ${value}px · ${generated.songs.length} songs in cue.`);
      }
    }
  };

  const applyLoadedLibrary = useCallback((loadedSongs: Song[], loadedStats: LibraryStats, message: string) => {
    invalidatePlaylistOverlapLayoutCache();
    const normalized = normalizeSongs(loadedSongs, loadedStats);
    setSongs(normalized);
    setStats(normalizeStats(loadedStats, normalized));
    saveLibrary(musicService, loadedSongs, loadedStats);
    setCue(null);
    setStroke([]);
    setStrokeLayoutConfig(null);
    setActivePlaylistName(null);
    setActivePersistentId(null);
    setSelectedSongId(null);
    setPlaybackTrackingEnabled(false);
    playbackTrackingRef.current = { persistentId: null, cueIndex: -1 };
    setStatusMessage(message);
  }, [musicService]);

  const applyMergedSharedLibrary = useCallback(
    async (contributorIds: string[], contributors: LibraryContributor[]) => {
      if (contributorIds.length === 0) {
        setSharedTrackCount(0);
        applyLoadedLibrary([], defaultStats(), "No contributors selected.");
        return;
      }
      setIsLoadingSharedLibrary(true);
      try {
        const merged = await loadMergedSharedLibrary(contributorIds);
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
          `Loaded shared library from ${contributorNames} (${loaded.songs.length} tracks${sharedLabel}).`
        );
      } catch (error) {
        setStatusMessage(error instanceof Error ? error.message : "Could not load shared library.");
      } finally {
        setIsLoadingSharedLibrary(false);
      }
    },
    [applyLoadedLibrary]
  );

  const refreshSharedContributors = useCallback(async () => {
    const contributors = await listSharedContributors();
    setSharedContributors(contributors);
    const storedEnabled = loadEnabledContributorIds().filter((contributorId) =>
      contributors.some((contributor) => contributor.id === contributorId)
    );
    const nextEnabled =
      storedEnabled.length > 0 ? storedEnabled : contributors.map((contributor) => contributor.id);
    setEnabledContributorIds(nextEnabled);
    saveEnabledContributorIds(nextEnabled);
    if (isWebDeployment && musicService === "spotify" && contributors.length > 0) {
      await applyMergedSharedLibrary(nextEnabled, contributors);
    }
    return contributors;
  }, [applyMergedSharedLibrary, musicService]);

  useEffect(() => {
    if (!isWebDeployment || musicService !== "spotify") {
      return;
    }
    void refreshSharedContributors().catch(() => {
      // Shared libraries are optional until someone publishes.
    });
  }, [musicService, refreshSharedContributors]);

  const handleContributorToggle = (contributorId: string) => {
    const nextEnabled = enabledContributorIds.includes(contributorId)
      ? enabledContributorIds.filter((id) => id !== contributorId)
      : [...enabledContributorIds, contributorId];
    setEnabledContributorIds(nextEnabled);
    saveEnabledContributorIds(nextEnabled);
    void applyMergedSharedLibrary(nextEnabled, sharedContributors);
  };

  const handleRefreshSharedLibrary = () => {
    void refreshSharedContributors();
  };

  const handlePublishSharedLibrary = async () => {
    setIsImporting(true);
    try {
      const published = await publishSharedLibrary();
      await refreshSharedContributors();
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
    setStroke([]);
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

  const handleLoadSpotifyLibrary = async () => {
    if (!musicProvider.loadLibrary) {
      return;
    }
    setIsImporting(true);
    try {
      const loaded = await musicProvider.loadLibrary();
      applyLoadedLibrary(
        loaded.songs,
        loaded.stats,
        `Loaded ${loaded.songs.length} saved tracks and ${loaded.stats.playlistIds.length} playlists from Spotify.`
      );
      if (isWebDeployment) {
        try {
          const published = await publishSharedLibrary();
          await refreshSharedContributors();
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
      setStatusMessage(error instanceof Error ? error.message : "Could not load Spotify library.");
    } finally {
      setIsImporting(false);
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
    savedStrokeRef.current = [];
    setStroke([]);
    setStrokeLayoutConfig(null);
    setIsDrawingNewPath(false);
    isDrawingRef.current = false;
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

  const handleClusterModeChange = (clusterMode: ClusterMode) => {
    updateLayoutConfig(
      { ...layoutConfig, viewMode: "cluster", clusterMode },
      clusterMode === "playlist"
        ? `Playlist overlap layout (${stats.playlistIds.length} playlists).`
        : "Genre cluster layout — drag labels to move groups."
    );
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

  const exportTerminalCommand = useMemo(() => {
    if (!cue || !isWebAppleMusic) {
      return "";
    }
    const playlistName = exportPlaylistName.trim() || defaultExportPlaylistName();
    return buildTerminalSavePlaylistCommand(toCueTracks(cue.songs), playlistName);
  }, [cue, exportPlaylistName, isWebAppleMusic]);

  const handleCopyExportCommand = async () => {
    if (!exportTerminalCommand) {
      return;
    }
    await copyTextToClipboard(exportTerminalCommand);
    setStatusMessage("Copied Music.app playlist command. Paste into Terminal on your Mac.");
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
      setStatusMessage(error instanceof Error ? error.message : "Could not play cue.");
    }
  };

  const handleClear = () => {
    clearDrawnPath();
    setCue(null);
    setSelectedSongId(null);
    clearUndo();
    setActivePlaylistName(null);
    setActivePersistentId(null);
    setPlaybackTrackingEnabled(false);
    playbackTrackingRef.current = { persistentId: null, cueIndex: -1 };
    setStatusMessage("Cleared graph path and cue.");
  };

  const strokePath = stroke
    .map((point, index) => `${index === 0 ? "M" : "L"} ${point.x.toFixed(1)} ${point.y.toFixed(1)}`)
    .join(" ");

  const hoveredSong = hoveredSongId ? songs.find((song) => song.id === hoveredSongId) : undefined;

  return (
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
                {isWebAppleMusic ? "Copy Music.app command" : "Export playlist"}
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
                {isWebAppleMusic ? "Close" : "Cancel"}
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
            <p className="music-cue-status">{statusMessage}</p>
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
              {buildMode === "path"
                ? " · drag to draw path · space-drag to pan · scroll to zoom"
                : " · drag to pan · scroll to zoom"}
              {isClusterLayout ? " · drag labels to move clusters · ⌘⇧ drag to box-select" : ""}
              {buildMode === "manual" ? " · click nodes to add" : ""}
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
                disabled={isImporting || !spotifyStatus?.connected}
              >
                {isImporting ? "Loading…" : "Load & share library"}
              </button>
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

          {isWebDeployment && musicService === "spotify" && sharedContributors.length > 0 ? (
            <div className="music-cue-contributor-toggle" role="group" aria-label="Shared library contributors">
              {sharedContributors.map((contributor) => (
                <label key={contributor.id} className="music-cue-contributor-option">
                  <input
                    type="checkbox"
                    checked={enabledContributorIds.includes(contributor.id)}
                    onChange={() => handleContributorToggle(contributor.id)}
                  />
                  <span>
                    {contributor.name} ({contributor.trackCount})
                  </span>
                </label>
              ))}
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
          <svg
            ref={svgRef}
            className={`music-cue-graph ${isPanning ? "music-cue-graph-panning" : ""} ${
              buildMode === "path" && !spaceHeld ? "music-cue-graph-draw-ready" : ""
            }`}
            width={dimensions.width}
            height={dimensions.height}
            onPointerDown={handleGraphPointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={finishPointerInteraction}
            onPointerLeave={(event) => {
              if (event.buttons === 0) {
                finishPointerInteraction();
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

              {fadingClusterSnapshot?.regions.map((region) => (
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

              {clusterRegions.map((region) => (
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

              {strokePath && (
                <path
                  d={strokePath}
                  className={`music-cue-stroke ${isDrawingNewPath ? "music-cue-stroke-drafting" : ""}`}
                />
              )}
              {showPathOverlays && cueEdgePath && !isDrawingNewPath && (
                <path d={cueEdgePath} className="music-cue-edge-path" />
              )}

              {positionedSongs.map(({ song, position }) => {
                const inCue = cue?.songs.some((entry) => entry.id === song.id);
                const isUnavailable = unavailableSongIds.has(song.id);
                const isSelected = selectedSongId === song.id;
                const nodeFill = songNodeFills.get(song.id) ?? "#000080";
                const radius = visibleSongs.length > 1000 ? 2 : visibleSongs.length > 400 ? 2 : 3;
                return (
                  <g
                    key={song.id}
                    transform={`translate(${position.x}, ${position.y})`}
                    onMouseEnter={() => setHoveredSongId(song.id)}
                    onMouseLeave={() => setHoveredSongId((current) => (current === song.id ? null : current))}
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

              {fadingClusterSnapshot?.regions.map((region) => (
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

              {clusterRegions.map((region) => (
                <text
                  key={`label-${region.id}`}
                  x={region.center.x}
                  y={region.center.y}
                  className={`music-cue-cluster-label ${
                    effectiveClusterRevealOpacity >= 1 ? "music-cue-cluster-label-draggable" : ""
                  } ${selectedClusterIds.has(region.id) ? "music-cue-cluster-label-selected" : ""}`}
                  opacity={effectiveClusterRevealOpacity}
                  pointerEvents={effectiveClusterRevealOpacity >= 1 ? undefined : "none"}
                  onPointerDown={(event) => handleClusterLabelPointerDown(event, region.id, region.label)}
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

        <aside className="music-cue-cue-sidebar">
          <div className="music-cue-cue-build-panel">
            <div className="music-cue-build-mode-toggle" role="group" aria-label="Cue build mode">
              <button
                type="button"
                className={buildMode === "path" ? "music-cue-layout-active" : ""}
                onClick={() => handleBuildModeChange("path")}
              >
                Path
              </button>
              <button
                type="button"
                className={buildMode === "manual" ? "music-cue-layout-active" : ""}
                onClick={() => handleBuildModeChange("manual")}
              >
                Manual
              </button>
            </div>
            {buildMode === "path" && (
              <label className="music-cue-slider-label music-cue-cue-path-slider">
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
            )}
          </div>

          <div className="music-cue-cue-header">
            <h2 className="music-cue-cue-title">Cue</h2>
            <div className="music-cue-actions music-cue-cue-actions">
              <button
                type="button"
                onClick={handlePlayCue}
                disabled={!cue || (!isValidatingLibrary && cueSummary?.playableCount === 0)}
              >
                {isWebAppleMusic ? "Copy play command" : "Play"}
              </button>
              <button type="button" onClick={handleOpenExportDialog} disabled={!cue}>
                {isWebAppleMusic ? "Copy playlist command" : "Export playlist"}
              </button>
              <button type="button" onClick={handleClear}>
                Clear
              </button>
              {buildMode === "manual" && (
                <button type="button" onClick={handleUndo} disabled={!canUndo}>
                  Undo ⌘Z
                </button>
              )}
            </div>
          </div>

          {buildMode === "path" && selectedSong && (
            <div className="music-cue-insert-panel">
              <p className="music-cue-selected-track">
                Selected: {selectedSong.artist} — {selectedSong.title}
                {unavailableSongIds.has(selectedSong.id) ? " (not in library)" : ""}
              </p>
              <div className="music-cue-insert-actions">
                <button type="button" onClick={handleAddToEnd}>
                  Add to end
                </button>
                <button type="button" onClick={() => handleAddNext()}>
                  Add next
                </button>
              </div>
            </div>
          )}

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
              {buildMode === "path"
                ? "Drag on the graph to build a cue."
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
        </aside>
      </div>
    </div>
  );
};
