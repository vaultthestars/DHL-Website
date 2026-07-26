import {
  useCallback,
  useDeferredValue,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type MutableRefObject,
  type RefObject,
} from "react";
import { startTransition } from "react";
import {
  buildClusterRegions,
  buildClusterViewportHints,
  buildIsolateScopedClusterRegions,
  getClusterRegionDisplayCenter,
  type ClusterRegion,
} from "../lib/clusterRegions";
import { buildLibraryStatsFromSongs } from "../../shared/sharedLibrary";
import { isSingleContributorSharedLibrary } from "../lib/clusterLayoutScope";
import {
  fromNormalizedPosition,
  getIsolateOwnerBoundsForLayout,
  getLayoutAxisLabels,
  type GraphDimensions,
  layoutSongPosition,
} from "../lib/graphLayout";
import {
  cullGraphSongsWithLazyPositions,
  cullPositionedGraphNodes,
  getCullingViewportPadding,
  getGraphViewportBounds,
  GRAPH_NODE_CULLING_THRESHOLD,
  isPointInGraphViewport,
} from "../lib/graphViewportCulling";
import {
  buildPlaylistMetaGraphCenterMap,
  buildPlaylistMetaGraphSegments,
  isPlaylistMetaGraphClusterRegion,
  resolvePlaylistGraphViewRegionCenter,
} from "../lib/playlistMetaGraph";
import { buildPlaylistMetaGraphEdges } from "../lib/playlistMetaGraphEdges";
import {
  buildWebDisplayPositionCache,
  compressSharedAxisConglomerateBandGap,
  computeIsolateDisplayContext,
} from "../lib/isolateDisplayTransform";
import {
  getClusterOverridesForOwner,
  getIsolateOwnerBoundsFromConglomeratePositions,
  getIsolateOwnerIds,
} from "../lib/isolateClusterLayout";
import {
  hasMultipleLibraryOwners,
  resolveIsolateDisplayOwnerId,
  type LibraryScopeMode,
} from "../lib/libraryScope";
import {
  isClusterView,
  layoutConfigKey,
} from "../lib/layoutMetrics";
import { LARGE_LIBRARY_LAYOUT_SNAP_THRESHOLD } from "../lib/layoutConstants";
import { getSongIdsNearStrokes } from "../lib/pathGenerator";
import { getSongNodeFill } from "../lib/graphColors";
import { prepareGraphSongsForIsolate, scopeSongsForIsolateOwner } from "../lib/isolateScopeSongs";
import { isClusterLayoutConfig, useLayoutTransition } from "../lib/useLayoutTransition";
import { asStringArray } from "../lib/arrayUtils";
import { getCanonicalSongId } from "../lib/isolateScopeSongs";
import { isWebDeployment } from "../lib/runtime";
import type { ViewTransform } from "../lib/graphView";
import type {
  ClusterCenterOverrides,
  CueBuildMode,
  GeneratedCue,
  GraphPoint,
  GraphToolMode,
  LayoutConfig,
  LibraryStats,
  NormalizedPoint,
  Song,
} from "../lib/types";
import type { MusicServiceId } from "../lib/musicProvider";
import type { ClusterDragSnapshot } from "../components/ClusterDragPreviewLayer";
import type { FadingClusterSnapshot } from "../components/MusicCueGraphCanvas";
import type { MusicCueGraphCanvasHandlers } from "../components/MusicCueGraphCanvas";
import { MusicCueGraphCanvas } from "../components/MusicCueGraphCanvas";
import type { LayoutTransitionState } from "../lib/useLayoutTransition";

const LABEL_THRESHOLD = 250;
const PATH_ONLY_SONG_NODE_RENDER = true;
const PLAYHTML_ROOM = "music-cue";

export type MusicCueGraphLayerRef = {
  getPosition: (song: Song) => GraphPoint;
  computeLayoutPosition: (
    song: Song,
    config: LayoutConfig,
    scopeMode?: LibraryScopeMode,
    layoutSongs?: Song[]
  ) => GraphPoint;
  findHoveredSongAtPoint: (point: GraphPoint) => string | null;
  getClusterRegions: () => ClusterRegion[];
  getGraphViewClusterRegions: () => ClusterRegion[];
  getTransition: () => LayoutTransitionState;
  buildRegionSnapshot: (
    scope: LibraryScopeMode,
    config: LayoutConfig,
    positionForSong: (song: Song) => GraphPoint
  ) => ClusterRegion[];
  scheduleCullRefresh: () => void;
  getVisibleNodeCount: () => number;
  getCulledNodeCount: () => number;
  resolveClusterLabelCenter: (region: ClusterRegion) => GraphPoint;
  getPlaylistMetaGraphEdges: () => import("../lib/playlistMetaGraphEdges").PlaylistMetaGraphEdge[];
};

export type MusicCueGraphLayerProps = {
  structureKey: string;
  interactionRevisionKey: string;
  layerRef: MutableRefObject<MusicCueGraphLayerRef | null>;
  visibleNodeCountRef?: MutableRefObject<number>;
  culledNodeCountRef?: MutableRefObject<number>;

  visibleSongs: Song[];
  graphSongs: Song[];
  songs: Song[];
  stats: LibraryStats;
  playlistOwners: Record<string, string>;
  layoutConfig: LayoutConfig;
  layoutLibraryScopeMode: LibraryScopeMode;
  libraryScopeMode: LibraryScopeMode;
  songSpaceMode: SongSpaceMode;
  activeContributorIds: string[];
  clusterOverrides: ClusterCenterOverrides;
  layoutClusterOverrides: ClusterCenterOverrides;
  activeLayoutScope: string;
  sharedContributorCount: number;
  dimensions: GraphDimensions;
  musicService: MusicServiceId;
  isolateBoundsRevision: number;
  isolateOwnerBounds?: Map<string, { centroid: GraphPoint; radius: number }>;
  skipIsolateCentroidTranslation: boolean;
  getMetaClusterCenter: (ownerId: string, center: GraphPoint) => GraphPoint;
  isolateGraphSongs: (sourceSongs: Song[]) => Song[];
  conglomerateClusterOverridesRef: MutableRefObject<ClusterCenterOverrides>;
  showIsolateContributorView: boolean;
  layoutShowIsolateContributorView: boolean;
  playlistGraphViewActive: boolean;
  useWebPerformanceOptimizations: boolean;

  viewTransformRef: MutableRefObject<ViewTransform>;
  pauseGraphAnimationsRef: MutableRefObject<boolean>;

  hoveredSongId: string | null;
  hoveredClusterRegionId: string | null;
  selectedSongId: string | null;
  activePersistentId: string | null;
  cue: GeneratedCue | null;
  buildMode: CueBuildMode;
  completedStrokes: NormalizedPoint[][];
  pathThreshold: number;

  graphTool: GraphToolMode;
  svgRef: RefObject<SVGSVGElement | null>;
  contentGroupRef: RefObject<SVGGElement | null>;
  bgRectRef: RefObject<SVGRectElement | null>;
  handlersRef: MutableRefObject<MusicCueGraphCanvasHandlers>;
  boxSelectRect: { x1: number; y1: number; x2: number; y2: number } | null;
  fadingClusterSnapshot: FadingClusterSnapshot | null;
  clusterRevealOpacity: number;
  playlistGraphForceSim: boolean;
  isClusterDragging: boolean;
  clusterDragSnapshotRef: MutableRefObject<ClusterDragSnapshot | null>;
  clusterDragGraphDeltaRef: MutableRefObject<GraphPoint>;
  clusterDragPreviewScheduleRef: MutableRefObject<(() => void) | null>;
  unavailableSongIds: Set<string>;
  selectedClusterIds: Set<string>;
  isGuestViewOnly: boolean;
  isSharedIsolateClusterDragDisabled: boolean;
  metaGraphForceNodesRef: MutableRefObject<import("../lib/playlistMetaGraphForceSim").MetaGraphForceNode[]>;
  metaGraphForceEdgesRef: MutableRefObject<import("../lib/playlistMetaGraphForceSim").MetaGraphForceEdge[]>;
  isDrawingNewPathRef: MutableRefObject<boolean>;
  draftStrokeActiveRef: MutableRefObject<boolean>;
  draftStrokeRef: MutableRefObject<NormalizedPoint[]>;
  draftStrokeScheduleRef: MutableRefObject<(() => void) | null>;
  strokeLayoutConfig: LayoutConfig | null;
  viewTransformForHoverRef: MutableRefObject<ViewTransform>;

  hoveredSong?: Song;
};

const useMusicCueGraphModel = (props: MusicCueGraphLayerProps) => {
  const {
    visibleSongs,
    graphSongs,
    stats,
    playlistOwners,
    layoutConfig,
    layoutLibraryScopeMode,
    libraryScopeMode,
    songSpaceMode,
    activeContributorIds,
    clusterOverrides,
    layoutClusterOverrides,
    activeLayoutScope,
    sharedContributorCount,
    dimensions,
    musicService,
    isolateBoundsRevision,
    isolateOwnerBounds,
    skipIsolateCentroidTranslation,
    getMetaClusterCenter,
    isolateGraphSongs,
    conglomerateClusterOverridesRef,
    showIsolateContributorView,
    layoutShowIsolateContributorView,
    playlistGraphViewActive,
    useWebPerformanceOptimizations,
    viewTransformRef,
    pauseGraphAnimationsRef,
    hoveredSongId,
    selectedSongId,
    activePersistentId,
    cue,
    buildMode,
    completedStrokes,
    pathThreshold,
    clusterRevealOpacity,
    isClusterDragging,
    clusterDragSnapshotRef,
  } = props;

  const deferredPlaylistGraphViewActive = useDeferredValue(playlistGraphViewActive);

  const graphSongsRef = useRef(graphSongs);
  graphSongsRef.current = graphSongs;

  const [nodeCullRevision, setNodeCullRevision] = useState(0);
  const viewTransformForCullRef = useRef({ ...viewTransformRef.current });
  const nodeCullRefreshTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const isLargeLibrary =
    useWebPerformanceOptimizations && graphSongs.length >= LARGE_LIBRARY_LAYOUT_SNAP_THRESHOLD;
  const deferredLayoutConfig = useDeferredValue(layoutConfig);
  const coldLayoutConfig = isLargeLibrary ? deferredLayoutConfig : layoutConfig;

const resolveConglomerateOverridesForLayout = useCallback((): ClusterCenterOverrides => {
  if (songSpaceMode === "mine" || isSingleContributorSharedLibrary(sharedContributorCount)) {
    return layoutClusterOverrides;
  }
  if (activeLayoutScope === "conglomerate") {
    return clusterOverrides;
  }
  return conglomerateClusterOverridesRef.current;
}, [
  activeLayoutScope,
  clusterOverrides,
  layoutClusterOverrides,
  sharedContributorCount,
  songSpaceMode,
]);

const conglomeratePositionBySongId = useMemo(() => {
  if (!useWebPerformanceOptimizations || !isClusterView(layoutConfig)) {
    return null;
  }
  const overridesForLayout = resolveConglomerateOverridesForLayout();
  const positions = new Map<string, GraphPoint>();
  visibleSongs.forEach((song) => {
    positions.set(
      song.id,
      layoutSongPosition(
        song,
        dimensions,
        layoutConfig,
        stats,
        {},
        overridesForLayout,
        visibleSongs,
        {
          libraryScopeMode: "conglomerate",
          enabledOwnerIds: activeContributorIds,
        }
      )
    );
  });
  return positions;
}, [
  activeContributorIds,
  dimensions,
  layoutConfig,
  resolveConglomerateOverridesForLayout,
  stats,
  useWebPerformanceOptimizations,
  visibleSongs,
]);

const axisConglomeratePositionBySongId = useMemo(() => {
  if (!useWebPerformanceOptimizations || isClusterView(layoutConfig)) {
    return null;
  }
  if (libraryScopeMode === "isolate") {
    return null;
  }
  const overridesForLayout = resolveConglomerateOverridesForLayout();
  const positions = new Map<string, GraphPoint>();
  visibleSongs.forEach((song) => {
    positions.set(
      song.id,
      layoutSongPosition(
        song,
        dimensions,
        layoutConfig,
        stats,
        {},
        overridesForLayout,
        visibleSongs,
        {
          libraryScopeMode: "conglomerate",
          enabledOwnerIds: activeContributorIds,
        }
      )
    );
  });
  return positions;
}, [
  activeContributorIds,
  dimensions,
  layoutConfig,
  libraryScopeMode,
  resolveConglomerateOverridesForLayout,
  stats,
  useWebPerformanceOptimizations,
  visibleSongs,
]);

const isolateDisplayContext = useMemo(() => {
  if (!useWebPerformanceOptimizations || !hasMultipleLibraryOwners(visibleSongs)) {
    return null;
  }
  if (isClusterView(layoutConfig) && !conglomeratePositionBySongId) {
    return null;
  }
  return computeIsolateDisplayContext(
    conglomeratePositionBySongId,
    visibleSongs,
    dimensions,
    activeContributorIds,
    layoutConfig,
    stats
  );
}, [
  activeContributorIds,
  conglomeratePositionBySongId,
  dimensions,
  layoutConfig,
  stats,
  useWebPerformanceOptimizations,
  visibleSongs,
]);

const showIsolateContributorViewRef = useRef(showIsolateContributorView);
showIsolateContributorViewRef.current = showIsolateContributorView;
const isolateDisplayContextRef = useRef(isolateDisplayContext);
isolateDisplayContextRef.current = isolateDisplayContext;
const getConglomeratePositionForSong = useCallback(
  (song: Song, config: LayoutConfig = layoutConfig): GraphPoint => {
    const clusterCached = conglomeratePositionBySongId?.get(song.id);
    if (clusterCached) {
      return clusterCached;
    }
    const axisCached = axisConglomeratePositionBySongId?.get(song.id);
    if (axisCached) {
      return axisCached;
    }
    return layoutSongPosition(
      song,
      dimensions,
      config,
      stats,
      {},
      resolveConglomerateOverridesForLayout(),
      visibleSongs,
      {
        libraryScopeMode: "conglomerate",
        enabledOwnerIds: activeContributorIds,
      }
    );
  },
  [
    activeContributorIds,
    axisConglomeratePositionBySongId,
    conglomeratePositionBySongId,
    dimensions,
    layoutConfig,
    resolveConglomerateOverridesForLayout,
    stats,
    visibleSongs,
  ]
);

const webDisplayPositionBySongId = useMemo(() => {
  if (!useWebPerformanceOptimizations) {
    return null;
  }

  const conglomeratePositions = isClusterView(layoutConfig)
    ? conglomeratePositionBySongId
    : axisConglomeratePositionBySongId;

  const isolateContext =
    showIsolateContributorView && isolateDisplayContext ? isolateDisplayContext : null;

  if (!isClusterView(layoutConfig) && libraryScopeMode === "isolate" && !isolateContext) {
    return new Map<string, GraphPoint>();
  }

  if (isolateContext?.isAxisView) {
    return buildWebDisplayPositionCache(
      visibleSongs,
      null,
      isolateContext,
      layoutConfig,
      stats,
      getConglomeratePositionForSong
    );
  }

  if (!conglomeratePositions && !isolateContext) {
    return null;
  }

  const displayPositions = buildWebDisplayPositionCache(
    visibleSongs,
    conglomeratePositions,
    isolateContext,
    layoutConfig,
    stats,
    getConglomeratePositionForSong
  );

  if (
    songSpaceMode === "shared" &&
    libraryScopeMode === "conglomerate" &&
    !isClusterView(layoutConfig) &&
    hasMultipleLibraryOwners(visibleSongs) &&
    !isolateContext
  ) {
    return compressSharedAxisConglomerateBandGap(
      displayPositions,
      visibleSongs,
      dimensions,
      activeContributorIds
    );
  }

  return displayPositions;
}, [
  activeContributorIds,
  axisConglomeratePositionBySongId,
  conglomeratePositionBySongId,
  dimensions,
  getConglomeratePositionForSong,
  isolateDisplayContext,
  layoutConfig,
  libraryScopeMode,
  layoutShowIsolateContributorView,
  songSpaceMode,
  stats,
  useWebPerformanceOptimizations,
  visibleSongs,
]);

const webDisplayPositionBySongIdRef = useRef(webDisplayPositionBySongId);
webDisplayPositionBySongIdRef.current = webDisplayPositionBySongId;

const computeLayoutPosition = useCallback(
  (
    song: Song,
    config: LayoutConfig,
    scopeMode: LibraryScopeMode = layoutLibraryScopeMode,
    layoutSongs: Song[] = graphSongsRef.current,
    ownerBounds = isolateOwnerBounds
  ): GraphPoint => {
    if (useWebPerformanceOptimizations) {
      return getConglomeratePositionForSong(song, config);
    }
    return layoutSongPosition(song, dimensions, config, stats, {}, layoutClusterOverrides, layoutSongs, {
      libraryScopeMode: scopeMode,
      enabledOwnerIds: activeContributorIds,
      isolateOwnerBounds: ownerBounds,
      skipIsolateCentroidTranslation,
      metaClusterCenterForOwner: getMetaClusterCenter,
    });
  },
  [
    activeContributorIds,
    dimensions,
    getConglomeratePositionForSong,
    getMetaClusterCenter,
    layoutClusterOverrides,
    layoutLibraryScopeMode,
    skipIsolateCentroidTranslation,
    stats,
    useWebPerformanceOptimizations,
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
  libraryScopeMode: layoutLibraryScopeMode,
  activeContributorIds,
});
clusterSnapshotInputsRef.current = {
  graphSongs,
  visibleSongs,
  stats,
  dimensions,
  clusterOverrides,
  layoutClusterOverrides,
  computeLayoutPosition,
  libraryScopeMode: layoutLibraryScopeMode,
  activeContributorIds,
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
        ? useWebPerformanceOptimizations && conglomeratePositionBySongId
          ? getIsolateOwnerBoundsFromConglomeratePositions(
              layoutSongs,
              conglomeratePositionBySongId,
              dimensions,
              activeContributorIds
            )
          : getIsolateOwnerBoundsForLayout(
              layoutSongs,
              dimensions,
              config,
              stats,
              clusterOverrides,
              activeContributorIds,
            )
        : undefined;

    if (!isClusterView(config)) {
      return [];
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
            playlistOwners
          )
        : buildClusterRegions(
            config.clusterMode,
            layoutSongs,
            positionForSong,
            stats,
            dimensions,
            overridesForScope
          );

    return innerRegions;
  },
  [
    activeContributorIds,
    clusterOverrides,
    conglomeratePositionBySongId,
    dimensions,
    isolateGraphSongs,
    layoutClusterOverrides,
    playlistOwners,
    stats,
    useWebPerformanceOptimizations,
    visibleSongs,
  ]
);

const getPosition = useCallback(
  (song: Song): GraphPoint => {
    if (useWebPerformanceOptimizations) {
      const cached = webDisplayPositionBySongIdRef.current?.get(song.id);
      if (cached) {
        return cached;
      }
      return getConglomeratePositionForSong(song);
    }
    return computeLayoutPosition(song, layoutConfig, layoutLibraryScopeMode, graphSongsRef.current);
  },
  [
    computeLayoutPosition,
    getConglomeratePositionForSong,
    layoutConfig,
    layoutLibraryScopeMode,
    useWebPerformanceOptimizations,
  ]
);

const layoutTransitionKey = `${songSpaceMode}:${libraryScopeMode}`;

const layoutTransitionSongs = useWebPerformanceOptimizations ? visibleSongs : graphSongs;
const layoutTransitionCompute = useWebPerformanceOptimizations
  ? getConglomeratePositionForSong
  : computeLayoutPosition;

const { getDisplayPosition, transition } = useLayoutTransition(
  layoutConfig,
  layoutTransitionSongs,
  dimensions,
  layoutTransitionCompute,
  layoutTransitionKey,
  pauseGraphAnimationsRef
);

const isLayoutTransitioning = transition.isAnimating;
const isScopeMergeTransition = false;

const renderGraphSongs = useMemo(() => {
  if (!isScopeMergeTransition) {
    return graphSongs;
  }
  return prepareGraphSongsForIsolate(visibleSongs, activeContributorIds, playlistOwners);
}, [activeContributorIds, graphSongs, isScopeMergeTransition, playlistOwners, visibleSongs]);

const nodeRenderGraphSongs = useMemo(() => {
  if (!PATH_ONLY_SONG_NODE_RENDER || buildMode !== "path") {
    return renderGraphSongs;
  }
  const segments = [...completedStrokes];
  if (segments.length === 0) {
    return [];
  }
  const graphStrokes = segments.map((segment) =>
    segment.map((point) => fromNormalizedPosition(point, dimensions))
  );
  const matchedIds = getSongIdsNearStrokes(
    graphSongs,
    graphStrokes,
    getPosition,
    pathThreshold
  );
  if (matchedIds.size === 0) {
    return [];
  }
  return renderGraphSongs.filter((song) => matchedIds.has(song.id));
}, [
  buildMode,
  completedStrokes,
  dimensions,
  getPosition,
  graphSongs,
  pathThreshold,
  renderGraphSongs,
]);

const getRenderablePosition = useCallback(
  (song: Song): GraphPoint => getDisplayPosition(song),
  [getDisplayPosition, transition.isAnimating, transition.progress]
);
const effectiveClusterRevealOpacity = clusterRevealOpacity;

const prioritizedNodeIds = useMemo(() => {
  const ids = new Set<string>();
  if (hoveredSongId) {
    ids.add(hoveredSongId);
  }
  if (selectedSongId) {
    ids.add(selectedSongId);
  }
  if (activePersistentId) {
    ids.add(activePersistentId);
  }
  cue?.songs.forEach((song) => ids.add(song.id));
  return ids;
}, [activePersistentId, cue, hoveredSongId, selectedSongId]);

const enableGraphNodeCulling =
  useWebPerformanceOptimizations && nodeRenderGraphSongs.length >= GRAPH_NODE_CULLING_THRESHOLD;

const useLazyWebNodeCulling = useWebPerformanceOptimizations && enableGraphNodeCulling;

const layoutColdKey = `${layoutConfigKey(coldLayoutConfig)}|${layoutTransitionKey}|${renderGraphSongs.length}|${dimensions.width}x${dimensions.height}|${isolateBoundsRevision}`;

const clusterViewportHints = useMemo(() => {
  if (!useLazyWebNodeCulling || layoutShowIsolateContributorView) {
    return undefined;
  }
  if (!isClusterView(coldLayoutConfig)) {
    return undefined;
  }
  return buildClusterViewportHints(
    coldLayoutConfig.clusterMode,
    nodeRenderGraphSongs,
    stats,
    dimensions,
    layoutClusterOverrides
  );
}, [
  coldLayoutConfig,
  dimensions,
  layoutClusterOverrides,
  nodeRenderGraphSongs,
  layoutShowIsolateContributorView,
  stats,
  useLazyWebNodeCulling,
]);

const bakedPositionedSongs = useMemo(() => {
  if (useLazyWebNodeCulling) {
    return [] as { song: Song; position: GraphPoint }[];
  }
  return nodeRenderGraphSongs.map((song) => ({
    song,
    position: useWebPerformanceOptimizations
      ? getPosition(song)
      : isLargeLibrary
        ? computeLayoutPosition(song, coldLayoutConfig)
        : getRenderablePosition(song),
  }));
}, [
  coldLayoutConfig,
  computeLayoutPosition,
  getPosition,
  getRenderablePosition,
  isLargeLibrary,
  layoutColdKey,
  nodeRenderGraphSongs,
  useLazyWebNodeCulling,
  useWebPerformanceOptimizations,
]);

const renderedPositionedSongsRef = useRef<{ song: Song; position: GraphPoint }[]>([]);

const findHoveredSongAtPoint = useCallback(
  (graphPoint: GraphPoint): string | null => {
    const scale = Math.max(viewTransformRef.current.scale, 0.001);
    const hitRadius = 12 / scale;
    let bestId: string | null = null;
    let bestDistance = hitRadius;

    const nodes = useLazyWebNodeCulling ? renderedPositionedSongsRef.current : bakedPositionedSongs;
    const bounds = useLazyWebNodeCulling
      ? null
      : getGraphViewportBounds(
          dimensions,
          viewTransformRef.current,
          getCullingViewportPadding(dimensions)
        );

    nodes.forEach(({ song, position }) => {
      const renderPosition = position;
      if (bounds && !isPointInGraphViewport(renderPosition, bounds)) {
        return;
      }
      const distance = Math.hypot(renderPosition.x - graphPoint.x, renderPosition.y - graphPoint.y);
      if (distance <= bestDistance) {
        bestDistance = distance;
        bestId = song.id;
      }
    });

    return bestId;
  },
  [bakedPositionedSongs, dimensions, useLazyWebNodeCulling]
);



const renderedPositionedSongs = useMemo(() => {
  if (useLazyWebNodeCulling) {
    return cullGraphSongsWithLazyPositions(
      nodeRenderGraphSongs,
      dimensions,
      viewTransformForCullRef.current,
      getPosition,
      {
        alwaysIncludeSongIds: prioritizedNodeIds,
        enableCulling: true,
        clusterHints: clusterViewportHints,
        cullSeed: songSpaceMode === "shared" ? PLAYHTML_ROOM : undefined,
      }
    );
  }
  return cullPositionedGraphNodes(
    bakedPositionedSongs,
    dimensions,
    viewTransformForCullRef.current,
    {
      alwaysIncludeSongIds: prioritizedNodeIds,
      enableCulling: enableGraphNodeCulling,
      cullSeed: songSpaceMode === "shared" ? PLAYHTML_ROOM : undefined,
    }
  );
}, [
  bakedPositionedSongs,
  clusterViewportHints,
  dimensions,
  enableGraphNodeCulling,
  getPosition,
  libraryScopeMode,
  nodeCullRevision,
  nodeRenderGraphSongs,
  prioritizedNodeIds,
  songSpaceMode,
  useLazyWebNodeCulling,
]);

renderedPositionedSongsRef.current = renderedPositionedSongs;

const visiblePositionedSongs = renderedPositionedSongs;

const clusterDragSongIds = isClusterDragging ? clusterDragSnapshotRef.current?.songIds : undefined;
const clusterDragHiddenRegionIds = isClusterDragging
  ? clusterDragSnapshotRef.current?.movedRegionIds
  : undefined;

const culledNodeCount = enableGraphNodeCulling
  ? Math.max(0, nodeRenderGraphSongs.length - visiblePositionedSongs.length)
  : 0;

const songNodeFills = useMemo(() => {
  const fills = new Map<string, string>();
  const songsToFill = enableGraphNodeCulling
    ? visiblePositionedSongs.map(({ song }) => song)
    : nodeRenderGraphSongs;
  songsToFill.forEach((song) => {
    fills.set(
      song.id,
      getSongNodeFill(song, layoutConfig, stats, visibleSongs)
    );
  });
  return fills;
}, [
  enableGraphNodeCulling,
  layoutConfig,
  renderedPositionedSongs,
  nodeRenderGraphSongs,
  visiblePositionedSongs,
  stats,
  visibleSongs,
]);

const useAnimatedClusterPositions =
  isLayoutTransitioning && visibleSongs.length < LARGE_LIBRARY_LAYOUT_SNAP_THRESHOLD;
const positionForClusterRegions = useAnimatedClusterPositions ? getRenderablePosition : getPosition;

const webPerOwnerClusterRegions = useMemo(() => {
  if (
    !useWebPerformanceOptimizations ||
    !isClusterView(coldLayoutConfig) ||
    !hasMultipleLibraryOwners(graphSongs)
  ) {
    return null;
  }

  const overridesForOwnerRegions = layoutClusterOverrides;

  const ownerIds = getIsolateOwnerIds(graphSongs, activeContributorIds);
  if (ownerIds.length === 0) {
    return null;
  }

  const byOwner = new Map<string, ClusterRegion[]>();
  ownerIds.forEach((ownerId) => {
    const ownerSongs = scopeSongsForIsolateOwner(
      graphSongs.filter(
        (song) => resolveIsolateDisplayOwnerId(song, activeContributorIds) === ownerId
      ),
      ownerId,
      playlistOwners
    );
    if (ownerSongs.length === 0) {
      return;
    }

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
      overridesForOwnerRegions,
      ownerId,
      coldLayoutConfig
    );
    const regions = buildClusterRegions(
      coldLayoutConfig.clusterMode,
      ownerSongs,
      getConglomeratePositionForSong,
      ownerStats,
      dimensions,
      ownerOverrides).map((region) => ({
      ...region,
      id: `owner:${ownerId}:${region.id}`,
    }));
    byOwner.set(ownerId, regions);
  });

  return byOwner;
}, [
  activeContributorIds,
  coldLayoutConfig,
  dimensions,
  getConglomeratePositionForSong,
  graphSongs,
  layoutClusterOverrides,
  playlistOwners,
  stats.playlistNames,
  useWebPerformanceOptimizations,
]);

const clusterRegions = useMemo(() => {
  const clusterOverridesForLayout = layoutClusterOverrides;
  const showIsolateRegions = useWebPerformanceOptimizations
    ? layoutShowIsolateContributorView
    : layoutLibraryScopeMode === "isolate";

  if (!isClusterView(coldLayoutConfig)) {
    return [];
  }

  if (useWebPerformanceOptimizations && webPerOwnerClusterRegions) {
    if (showIsolateRegions) {
      const regions: ClusterRegion[] = [];
      webPerOwnerClusterRegions.forEach((ownerRegions, ownerId) => {
        const offset = isolateDisplayContext?.offsets.get(ownerId);
        if (!offset) {
          regions.push(...ownerRegions);
          return;
        }
        regions.push(
          ...ownerRegions.map((region) => ({
            ...region,
            displayOffset: offset,
          }))
        );
      });
      return regions;
    }

    return buildClusterRegions(
      coldLayoutConfig.clusterMode,
      graphSongs,
      getConglomeratePositionForSong,
      stats,
      dimensions,
      clusterOverridesForLayout
    );
  }

  const useIsolateScopedClusters =
    showIsolateRegions && getIsolateOwnerIds(graphSongs, activeContributorIds).length > 0;

  return useIsolateScopedClusters
    ? buildIsolateScopedClusterRegions(
        graphSongs,
        coldLayoutConfig.clusterMode,
        coldLayoutConfig,
        positionForClusterRegions,
        dimensions,
        clusterOverridesForLayout,
        activeContributorIds,
        stats.playlistNames,
        isolateOwnerBounds,
        playlistOwners
      )
    : buildClusterRegions(
        coldLayoutConfig.clusterMode,
        graphSongs,
        positionForClusterRegions,
        stats,
        dimensions,
        clusterOverridesForLayout
      );
}, [
  activeContributorIds,
  clusterOverrides,
  coldLayoutConfig,
  dimensions,
  graphSongs,
  isolateDisplayContext,
  isolateOwnerBounds,
  layoutClusterOverrides,
  layoutLibraryScopeMode,
  libraryScopeMode,
  playlistOwners,
  positionForClusterRegions,
  layoutShowIsolateContributorView,
  stats,
  useWebPerformanceOptimizations,
  webPerOwnerClusterRegions,
  getConglomeratePositionForSong,
]);

const showPlaylistMetaGraph = deferredPlaylistGraphViewActive;

const graphViewClusterRegions = useMemo(() => {
  const regions = showPlaylistMetaGraph
    ? clusterRegions.filter((region) => isPlaylistMetaGraphClusterRegion(region.id))
    : clusterRegions;
  if (!showPlaylistMetaGraph) {
    return regions;
  }
  if (layoutShowIsolateContributorView) {
    return regions.map((region) => ({
      ...region,
      center: getClusterRegionDisplayCenter(region),
      displayOffset: undefined,
    }));
  }
  const overridesForLayout = layoutClusterOverrides;
  return regions.map((region) => ({
    ...region,
    center: resolvePlaylistGraphViewRegionCenter(region, {
      graphSongs,
      stats,
      dimensions,
      clusterOverrides: overridesForLayout,
      layoutConfig: coldLayoutConfig,
      activeContributorIds,
      playlistOwners,
      playlistNames: stats.playlistNames,
      isolateOwnerBounds,
      getMetaClusterCenter,
    }),
    displayOffset: undefined,
  }));
}, [
  activeContributorIds,
  clusterOverrides,
  clusterRegions,
  coldLayoutConfig,
  dimensions,
  getMetaClusterCenter,
  graphSongs,
  isolateOwnerBounds,
  layoutClusterOverrides,
  layoutShowIsolateContributorView,
  playlistOwners,
  showPlaylistMetaGraph,
  stats,
]);

const playlistMetaGraphEdges = useMemo(() => {
  if (!showPlaylistMetaGraph) {
    return [];
  }
  if (layoutShowIsolateContributorView && hasMultipleLibraryOwners(graphSongs)) {
    return getIsolateOwnerIds(graphSongs, activeContributorIds).flatMap((ownerId) => {
      const ownerSongs = scopeSongsForIsolateOwner(
        graphSongs.filter(
          (song) => resolveIsolateDisplayOwnerId(song, activeContributorIds) === ownerId
        ),
        ownerId,
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
                ([playlistId]) => playlistOwners[playlistId] === ownerId
              )
            );
      const ownerStats = buildLibraryStatsFromSongs(ownerSongs, ownerPlaylistNames);
      return buildPlaylistMetaGraphEdges(asStringArray(ownerStats.playlistIds), ownerSongs);
    });
  }
  return buildPlaylistMetaGraphEdges(asStringArray(stats.playlistIds), graphSongs);
}, [
  activeContributorIds,
  graphSongs,
  playlistOwners,
  layoutShowIsolateContributorView,
  showPlaylistMetaGraph,
  stats.playlistIds,
  stats.playlistNames,
]);

const resolveClusterLabelCenter = useCallback(
  (region: ClusterRegion): GraphPoint => {
    if (layoutShowIsolateContributorView && showPlaylistMetaGraph) {
      return getClusterRegionDisplayCenter(region);
    }
    if (coldLayoutConfig.clusterMode !== "playlist") {
      return getClusterRegionDisplayCenter(region);
    }
    return resolvePlaylistGraphViewRegionCenter(region, {
      graphSongs,
      stats,
      dimensions,
      clusterOverrides: layoutClusterOverrides,
      layoutConfig: coldLayoutConfig,
      activeContributorIds,
      playlistOwners,
      playlistNames: stats.playlistNames,
      isolateOwnerBounds,
      getMetaClusterCenter,
    });
  },
  [
    activeContributorIds,
    coldLayoutConfig,
    dimensions,
    getMetaClusterCenter,
    graphSongs,
    isolateOwnerBounds,
    layoutClusterOverrides,
    layoutShowIsolateContributorView,
    playlistOwners,
    showPlaylistMetaGraph,
    stats,
  ]
);

const maxPlaylistMetaGraphSharedCount = useMemo(
  () =>
    playlistMetaGraphEdges.reduce(
      (max, edge) => Math.max(max, edge.sharedSongCount),
      1
    ),
  [playlistMetaGraphEdges]
);

const staticPlaylistMetaGraphSegments = useMemo(() => {
  if (!showPlaylistMetaGraph) {
    return [];
  }
  const centerByPlaylistId = buildPlaylistMetaGraphCenterMap(graphViewClusterRegions);
  return buildPlaylistMetaGraphSegments(playlistMetaGraphEdges, centerByPlaylistId);
}, [graphViewClusterRegions, playlistMetaGraphEdges, showPlaylistMetaGraph]);
  const clusterRegionsRef = useRef(clusterRegions);
  clusterRegionsRef.current = clusterRegions;
  const graphViewClusterRegionsRef = useRef(graphViewClusterRegions);
  graphViewClusterRegionsRef.current = graphViewClusterRegions;
  const renderedPositionedSongsRefForApi = useRef(renderedPositionedSongs);
  renderedPositionedSongsRefForApi.current = renderedPositionedSongs;

  const scheduleCullRefresh = useCallback(() => {
    viewTransformForCullRef.current = { ...viewTransformRef.current };
    if (nodeCullRefreshTimeoutRef.current) {
      clearTimeout(nodeCullRefreshTimeoutRef.current);
    }
    nodeCullRefreshTimeoutRef.current = setTimeout(() => {
      nodeCullRefreshTimeoutRef.current = null;
      const apply = () => {
        startTransition(() => {
          setNodeCullRevision((value) => value + 1);
        });
      };
      if (typeof requestIdleCallback !== "undefined") {
        requestIdleCallback(apply, { timeout: 1500 });
      } else {
        requestAnimationFrame(() => requestAnimationFrame(apply));
      }
    }, 64);
  }, [viewTransformRef]);

  useLayoutEffect(() => {
    viewTransformForCullRef.current = { ...viewTransformRef.current };
    setNodeCullRevision((value) => value + 1);
  }, [layoutColdKey, viewTransformRef]);

  useEffect(() => {
    if (!useWebPerformanceOptimizations || pauseGraphAnimationsRef.current) {
      return;
    }
    setNodeCullRevision((value) => value + 1);
  }, [libraryScopeMode, pauseGraphAnimationsRef, useWebPerformanceOptimizations, webDisplayPositionBySongId]);

  if (props.visibleNodeCountRef) {
    props.visibleNodeCountRef.current = visiblePositionedSongs.length;
  }
  if (props.culledNodeCountRef) {
    props.culledNodeCountRef.current = culledNodeCount;
  }

  const apiRef = useRef<MusicCueGraphLayerRef | null>(null);
  apiRef.current = {
    getPosition,
    computeLayoutPosition,
    findHoveredSongAtPoint,
    getClusterRegions: () => clusterRegionsRef.current,
    getGraphViewClusterRegions: () => graphViewClusterRegionsRef.current,
    getTransition: () => transition,
    buildRegionSnapshot,
    scheduleCullRefresh,
    getVisibleNodeCount: () => renderedPositionedSongsRefForApi.current.length,
    getCulledNodeCount: () => culledNodeCount,
    resolveClusterLabelCenter,
    getPlaylistMetaGraphEdges: () => playlistMetaGraphEdges,
  };

  props.layerRef.current = apiRef.current;

  const activePathLayoutConfig = props.strokeLayoutConfig;
  const showPathOverlays =
    activePathLayoutConfig !== null &&
    layoutConfigKey(layoutConfig) === layoutConfigKey(activePathLayoutConfig);
  const isClusterLayout = isClusterLayoutConfig(layoutConfig);
  const showClusterDecorations =
    isClusterLayout || Boolean(props.fadingClusterSnapshot && props.fadingClusterSnapshot.opacity > 0);
  const showPlaylistClusterHulls = showClusterDecorations && !showPlaylistMetaGraph;
  const showSongNodesInGraph = !showPlaylistMetaGraph;
  const axisLabels = useMemo(
    () => getLayoutAxisLabels(layoutConfig, musicService),
    [layoutConfig, musicService]
  );
  const showLabels = visibleSongs.length <= LABEL_THRESHOLD;
  const cueSongIds = useMemo(() => new Set(cue?.songs.map((song) => song.id) ?? []), [cue]);

  const strokePaths = useMemo(() => {
    const segments = [...completedStrokes];
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
  }, [completedStrokes, dimensions]);

  const cueEdgePath = useMemo(() => {
    if (!cue || cue.songs.length < 2) {
      return "";
    }
    return cue.songs
      .map((song, index) => {
        const position = getPosition(song);
        return `${index === 0 ? "M" : "L"} ${position.x.toFixed(1)} ${position.y.toFixed(1)}`;
      })
      .join(" ");
  }, [cue, getPosition]);

  const hoveredSongRenderPosition = useMemo(() => {
    if (!hoveredSongId) {
      return null;
    }
    const canonicalId = getCanonicalSongId(hoveredSongId);
    const visibleEntry = visiblePositionedSongs.find(
      (entry) => getCanonicalSongId(entry.song.id) === canonicalId
    );
    if (visibleEntry) {
      return visibleEntry.position;
    }
    if (!props.hoveredSong) {
      return null;
    }
    return getPosition(props.hoveredSong);
  }, [getPosition, hoveredSongId, props.hoveredSong, visiblePositionedSongs]);

  return {
    axisLabels,
    showLabels,
    cueSongIds,
    strokePaths,
    cueEdgePath,
    hoveredSongRenderPosition,
    showPlaylistClusterHulls,
    showSongNodesInGraph,
    isClusterLayout,
    showPlaylistMetaGraph,
    effectiveClusterRevealOpacity,
    clusterRegions,
    graphViewClusterRegions,
    visiblePositionedSongs,
    songNodeFills,
    clusterDragSongIds,
    clusterDragHiddenRegionIds,
    enableGraphNodeCulling,
    renderGraphSongCount: renderGraphSongs.length,
    resolveClusterLabelCenter,
    staticPlaylistMetaGraphSegments,
    maxPlaylistMetaGraphSharedCount,
    showPathOverlays,
    graphRenderRevision: `${props.structureKey}|${props.interactionRevisionKey}`,
  };
};

import { memo } from "react";

const MusicCueGraphLayerComponent = (props: MusicCueGraphLayerProps) => {
  const model = useMusicCueGraphModel(props);
  const viewTransform = props.viewTransformForHoverRef.current;

  return (
    <>
      {!model.showLabels && !model.showPlaylistMetaGraph && props.hoveredSong && model.hoveredSongRenderPosition ? (
        <div
          className="music-cue-hover-label music-cue-hover-label-overlay"
          style={{
            left: viewTransform.panX + model.hoveredSongRenderPosition.x * viewTransform.scale,
            top:
              viewTransform.panY +
              model.hoveredSongRenderPosition.y * viewTransform.scale -
              12,
          }}
        >
          {props.hoveredSong.artist} — {props.hoveredSong.title}
          {props.unavailableSongIds.has(props.hoveredSong.id) ? " (not in library)" : ""}
        </div>
      ) : null}
      <MusicCueGraphCanvas
        graphRenderRevision={model.graphRenderRevision}
        svgRef={props.svgRef}
        contentGroupRef={props.contentGroupRef}
        bgRectRef={props.bgRectRef}
        handlersRef={props.handlersRef}
        graphTool={props.graphTool}
        dimensions={props.dimensions}
        axisLabels={model.axisLabels}
        boxSelectRect={props.boxSelectRect}
        showPlaylistClusterHulls={model.showPlaylistClusterHulls}
        fadingClusterSnapshot={props.fadingClusterSnapshot}
        isClusterLayout={model.isClusterLayout}
        clusterRegions={model.clusterRegions}
        clusterDragPreviewRegionIds={model.clusterDragHiddenRegionIds}
        isDrawingNewPathRef={props.isDrawingNewPathRef}
        draftStrokeActiveRef={props.draftStrokeActiveRef}
        effectiveClusterRevealOpacity={model.effectiveClusterRevealOpacity}
        showPlaylistMetaGraph={model.showPlaylistMetaGraph}
        pinPlaylistGraphLabelCenters={
          model.showPlaylistMetaGraph && props.layoutShowIsolateContributorView
        }
        playlistGraphForceSim={props.playlistGraphForceSim}
        staticPlaylistMetaGraphSegments={model.staticPlaylistMetaGraphSegments}
        maxPlaylistMetaGraphSharedCount={model.maxPlaylistMetaGraphSharedCount}
        metaGraphForceNodesRef={props.metaGraphForceNodesRef}
        metaGraphForceEdgesRef={props.metaGraphForceEdgesRef}
        graphViewClusterRegions={model.graphViewClusterRegions}
        strokePaths={model.strokePaths}
        draftStrokeRef={props.draftStrokeRef}
        draftStrokeScheduleRef={props.draftStrokeScheduleRef}
        showPathOverlays={model.showPathOverlays}
        showSongNodesInGraph={model.showSongNodesInGraph}
        cueEdgePath={model.cueEdgePath}
        visiblePositionedSongs={model.visiblePositionedSongs}
        clusterDragSongIds={model.clusterDragSongIds}
        renderGraphSongCount={model.renderGraphSongCount}
        enableGraphNodeCulling={model.enableGraphNodeCulling}
        songNodeFills={model.songNodeFills}
        cueSongIds={model.cueSongIds}
        unavailableSongIds={props.unavailableSongIds}
        selectedSongId={props.selectedSongId}
        hoveredClusterRegionId={props.hoveredClusterRegionId}
        showLabels={model.showLabels}
        selectedClusterIds={props.selectedClusterIds}
        isGuestViewOnly={props.isGuestViewOnly}
        isSharedIsolateClusterDragDisabled={props.isSharedIsolateClusterDragDisabled}
        resolveClusterLabelCenter={model.resolveClusterLabelCenter}
        isClusterDragging={props.isClusterDragging}
        clusterDragGraphDeltaRef={props.clusterDragGraphDeltaRef}
        clusterDragSnapshotRef={props.clusterDragSnapshotRef}
        clusterDragPreviewScheduleRef={props.clusterDragPreviewScheduleRef}
      />
    </>
  );
};

export const MusicCueGraphLayer = memo(
  MusicCueGraphLayerComponent,
  (previous, next) =>
    previous.structureKey === next.structureKey &&
    previous.interactionRevisionKey === next.interactionRevisionKey
);
