import { memo, type MutableRefObject, type RefObject } from "react";
import type { ClusterRegion } from "../lib/clusterRegions";
import { playlistMetaGraphEdgeStyle, type PlaylistMetaGraphSegment } from "../lib/playlistMetaGraph";
import type { MetaGraphForceEdge, MetaGraphForceNode } from "../lib/playlistMetaGraphForceSim";
import { getCanonicalSongId } from "../lib/isolateScopeSongs";
import { isLocalDesktopApp } from "../lib/runtime";
import type { GraphDimensions } from "../lib/graphLayout";
import type { GraphPoint, GraphToolMode, NormalizedPoint, Song } from "../lib/types";
import { ClusterDragPreviewLayer, type ClusterDragSnapshot } from "./ClusterDragPreviewLayer";
import { PlaylistGraphForceSimLayer } from "./PlaylistGraphForceSimLayer";
import { StrokeDraftLayer } from "./StrokeDraftLayer";

const LABEL_THRESHOLD = 250;

export type FadingClusterSnapshot = {
  id: number;
  regions: ClusterRegion[];
  opacity: number;
};

export type MusicCueGraphCanvasHandlers = {
  onGraphPointerDown: (event: React.PointerEvent<SVGSVGElement>) => void;
  onGraphPointerUp: (event: React.PointerEvent<SVGSVGElement>) => void;
  onGraphPointerCancel: (event: React.PointerEvent<SVGSVGElement>) => void;
  onGraphPointerLeave: (event: React.PointerEvent<SVGSVGElement>) => void;
  onBackgroundPointerDown: (event: React.PointerEvent<SVGRectElement>) => void;
  onClusterLabelPointerDown: (
    event: React.PointerEvent<SVGTextElement>,
    clusterId: string,
    label: string
  ) => void;
  onClusterLabelPointerUp: (event: React.PointerEvent<SVGTextElement>) => void;
  onNodePointerDown: (event: React.PointerEvent<SVGCircleElement>, song: Song) => void;
  onNodePointerUp: (event: React.PointerEvent<SVGCircleElement>, song: Song) => void;
  onHoverSongEnter: (songId: string) => void;
  onHoverSongLeave: (songId: string) => void;
};

export type MusicCueGraphCanvasProps = {
  graphRenderRevision: string;
  svgRef: RefObject<SVGSVGElement | null>;
  contentGroupRef: RefObject<SVGGElement | null>;
  bgRectRef: RefObject<SVGRectElement | null>;
  handlersRef: MutableRefObject<MusicCueGraphCanvasHandlers>;
  graphTool: GraphToolMode;
  dimensions: GraphDimensions;
  axisLabels: { x: string; y?: string };
  boxSelectRect: { x1: number; y1: number; x2: number; y2: number } | null;
  showPlaylistClusterHulls: boolean;
  fadingClusterSnapshot: FadingClusterSnapshot | null;
  isClusterLayout: boolean;
  clusterRegions: ClusterRegion[];
  clusterDragPreviewRegionIds?: Set<string>;
  effectiveClusterRevealOpacity: number;
  showPlaylistMetaGraph: boolean;
  playlistGraphForceSim: boolean;
  staticPlaylistMetaGraphSegments: PlaylistMetaGraphSegment[];
  maxPlaylistMetaGraphSharedCount: number;
  metaGraphForceNodesRef: MutableRefObject<MetaGraphForceNode[]>;
  metaGraphForceEdgesRef: MutableRefObject<MetaGraphForceEdge[]>;
  graphViewClusterRegions: ClusterRegion[];
  strokePaths: string[];
  isDrawingNewPath: boolean;
  draftStrokeRef: MutableRefObject<NormalizedPoint[]>;
  draftStrokeScheduleRef: MutableRefObject<(() => void) | null>;
  showPathOverlays: boolean;
  showSongNodesInGraph: boolean;
  cueEdgePath: string;
  visiblePositionedSongs: Array<{ song: Song; position: GraphPoint }>;
  clusterDragSongIds?: Set<string>;
  renderGraphSongCount: number;
  enableGraphNodeCulling: boolean;
  songNodeFills: Map<string, string>;
  cueSongIds: Set<string>;
  unavailableSongIds: Set<string>;
  selectedSongId: string | null;
  showLabels: boolean;
  selectedClusterIds: Set<string>;
  isGuestViewOnly: boolean;
  isSharedIsolateClusterDragDisabled: boolean;
  resolveClusterLabelCenter: (region: ClusterRegion) => GraphPoint;
  isClusterDragging: boolean;
  clusterDragGraphDeltaRef: MutableRefObject<GraphPoint>;
  clusterDragSnapshotRef: MutableRefObject<ClusterDragSnapshot | null>;
  clusterDragPreviewScheduleRef: MutableRefObject<(() => void) | null>;
};

const MusicCueGraphCanvasComponent = ({
  svgRef,
  contentGroupRef,
  bgRectRef,
  handlersRef,
  graphTool,
  dimensions,
  axisLabels,
  boxSelectRect,
  showPlaylistClusterHulls,
  fadingClusterSnapshot,
  isClusterLayout,
  clusterRegions,
  clusterDragPreviewRegionIds,
  effectiveClusterRevealOpacity,
  showPlaylistMetaGraph,
  playlistGraphForceSim,
  staticPlaylistMetaGraphSegments,
  maxPlaylistMetaGraphSharedCount,
  metaGraphForceNodesRef,
  metaGraphForceEdgesRef,
  graphViewClusterRegions,
  strokePaths,
  isDrawingNewPath,
  showPathOverlays,
  showSongNodesInGraph,
  cueEdgePath,
  visiblePositionedSongs,
  clusterDragSongIds,
  renderGraphSongCount,
  enableGraphNodeCulling,
  songNodeFills,
  cueSongIds,
  unavailableSongIds,
  selectedSongId,
  showLabels,
  selectedClusterIds,
  isGuestViewOnly,
  isSharedIsolateClusterDragDisabled,
  resolveClusterLabelCenter,
  isClusterDragging,
  clusterDragGraphDeltaRef,
  clusterDragSnapshotRef,
  clusterDragPreviewScheduleRef,
  draftStrokeRef,
  draftStrokeScheduleRef,
}: MusicCueGraphCanvasProps) => {
  const useSpatialHover =
    enableGraphNodeCulling || (isLocalDesktopApp && renderGraphSongCount > LABEL_THRESHOLD);
  const nodeRadius = renderGraphSongCount > 1000 ? 2 : renderGraphSongCount > 400 ? 2 : 3;

  return (
    <svg
      ref={svgRef}
      className={`music-cue-graph music-cue-graph-${graphTool}`}
      width={dimensions.width}
      height={dimensions.height}
      onPointerDown={(event) => handlersRef.current.onGraphPointerDown(event)}
      onPointerUp={(event) => handlersRef.current.onGraphPointerUp(event)}
      onPointerCancel={(event) => handlersRef.current.onGraphPointerCancel(event)}
      onPointerLeave={(event) => handlersRef.current.onGraphPointerLeave(event)}
    >
      <g ref={contentGroupRef} className="music-cue-graph-content">
        <rect
          ref={bgRectRef}
          width={dimensions.width}
          height={dimensions.height}
          fill="#ffffff"
          onPointerDown={(event) => handlersRef.current.onBackgroundPointerDown(event)}
        />
        <text x={dimensions.width / 2} y={22} className="music-cue-axis-label">
          {axisLabels.x}
        </text>
        {axisLabels.y ? (
          <text x={16} y={dimensions.height / 2} className="music-cue-axis-label music-cue-axis-label-vertical">
            {axisLabels.y}
          </text>
        ) : null}

        {boxSelectRect ? (
          <rect
            x={Math.min(boxSelectRect.x1, boxSelectRect.x2)}
            y={Math.min(boxSelectRect.y1, boxSelectRect.y2)}
            width={Math.abs(boxSelectRect.x2 - boxSelectRect.x1)}
            height={Math.abs(boxSelectRect.y2 - boxSelectRect.y1)}
            className="music-cue-box-select"
            pointerEvents="none"
          />
        ) : null}

        {showPlaylistClusterHulls
          ? fadingClusterSnapshot?.regions.map((region) => (
              <path
                key={`fading-region-${region.id}`}
                d={region.hullPath}
                className="music-cue-cluster-region"
                stroke={region.stroke}
                opacity={fadingClusterSnapshot.opacity}
                pointerEvents="none"
              />
            ))
          : null}

        {showPlaylistClusterHulls && isClusterLayout
          ? clusterRegions
              .filter((region) => !clusterDragPreviewRegionIds?.has(region.id))
              .map((region) => {
                const offset = region.displayOffset;
                const transform = offset ? `translate(${offset.x} ${offset.y})` : undefined;
                return (
                  <path
                    key={`region-${region.id}`}
                    d={region.hullPath}
                    className="music-cue-cluster-region"
                    stroke={region.stroke}
                    opacity={effectiveClusterRevealOpacity}
                    pointerEvents="none"
                    transform={transform}
                  />
                );
              })
          : null}

        {showPlaylistMetaGraph && !playlistGraphForceSim
          ? staticPlaylistMetaGraphSegments.map((segment) => {
              const edgeStyle = playlistMetaGraphEdgeStyle(
                segment.sharedSongCount,
                maxPlaylistMetaGraphSharedCount
              );
              return (
                <line
                  key={`metagraph-${segment.leftId}-${segment.rightId}`}
                  x1={segment.start.x}
                  y1={segment.start.y}
                  x2={segment.end.x}
                  y2={segment.end.y}
                  className="music-cue-playlist-metagraph-edge"
                  stroke={edgeStyle.stroke}
                  strokeWidth={edgeStyle.strokeWidth}
                  pointerEvents="none"
                  opacity={effectiveClusterRevealOpacity}
                />
              );
            })
          : null}

        {showPlaylistMetaGraph && playlistGraphForceSim ? (
          <PlaylistGraphForceSimLayer
            active={playlistGraphForceSim}
            nodesRef={metaGraphForceNodesRef}
            edgesRef={metaGraphForceEdgesRef}
            labelRegions={graphViewClusterRegions}
            segments={staticPlaylistMetaGraphSegments}
            maxSharedSongCount={maxPlaylistMetaGraphSharedCount}
            labelOpacity={effectiveClusterRevealOpacity}
            onLabelPointerDown={
              isGuestViewOnly || isSharedIsolateClusterDragDisabled
                ? undefined
                : (event, clusterId, label) =>
                    handlersRef.current.onClusterLabelPointerDown(event, clusterId, label)
            }
          />
        ) : null}

        {strokePaths.map((path, index) => (
          <path
            key={`stroke-${index}`}
            d={path}
            className="music-cue-stroke"
          />
        ))}
        <StrokeDraftLayer
          active={isDrawingNewPath}
          strokeRef={draftStrokeRef}
          dimensions={dimensions}
          scheduleRef={draftStrokeScheduleRef}
        />
        {showPathOverlays && showSongNodesInGraph && cueEdgePath && !isDrawingNewPath ? (
          <path d={cueEdgePath} className="music-cue-edge-path" />
        ) : null}

        <g className="music-cue-song-nodes">
          {showSongNodesInGraph
            ? visiblePositionedSongs
                .filter(({ song }) => !clusterDragSongIds?.has(song.id))
                .map(({ song, position }) => {
                  const canonicalId = getCanonicalSongId(song.id);
                  const inCue = cueSongIds.has(canonicalId);
                  const isUnavailable = unavailableSongIds.has(canonicalId);
                  const isSelected = selectedSongId === canonicalId;
                  const nodeFill = songNodeFills.get(song.id) ?? "#000080";
                  return (
                    <g key={song.id} transform={`translate(${position.x}, ${position.y})`}>
                      <circle
                        r={nodeRadius + 3}
                        className="music-cue-node-hit music-cue-node-clickable"
                        onPointerDown={(event) => handlersRef.current.onNodePointerDown(event, song)}
                        onPointerUp={(event) => handlersRef.current.onNodePointerUp(event, song)}
                        onMouseEnter={
                          useSpatialHover
                            ? undefined
                            : () => handlersRef.current.onHoverSongEnter(song.id)
                        }
                        onMouseLeave={
                          useSpatialHover
                            ? undefined
                            : () => handlersRef.current.onHoverSongLeave(song.id)
                        }
                      />
                      <circle
                        r={nodeRadius}
                        fill={isUnavailable ? undefined : nodeFill}
                        className={`music-cue-node ${
                          inCue && !isUnavailable ? "music-cue-node-active" : ""
                        } ${isUnavailable ? "music-cue-node-missing" : ""} ${isSelected ? "music-cue-node-selected" : ""}`}
                        pointerEvents="none"
                      />
                      {showLabels ? (
                        <text y={nodeRadius + 10} className="music-cue-node-label" pointerEvents="none">
                          {song.title}
                        </text>
                      ) : null}
                    </g>
                  );
                })
            : null}
        </g>

        {showPlaylistClusterHulls
          ? fadingClusterSnapshot?.regions.map((region) => (
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
            ))
          : null}

        {isClusterLayout && !playlistGraphForceSim
          ? graphViewClusterRegions
              .filter((region) => !clusterDragPreviewRegionIds?.has(region.id))
              .map((region) => {
                const labelCenter = resolveClusterLabelCenter(region);
                const offset = region.displayOffset;
                const transform = offset ? `translate(${offset.x} ${offset.y})` : undefined;
                return (
                  <text
                    key={`label-${region.id}`}
                    x={labelCenter.x}
                    y={labelCenter.y}
                    className={`music-cue-cluster-label ${
                      effectiveClusterRevealOpacity >= 1 &&
                      !isGuestViewOnly &&
                      !isSharedIsolateClusterDragDisabled
                        ? "music-cue-cluster-label-draggable"
                        : ""
                    } ${selectedClusterIds.has(region.id) ? "music-cue-cluster-label-selected" : ""}`}
                    opacity={effectiveClusterRevealOpacity}
                    pointerEvents={
                      effectiveClusterRevealOpacity >= 1 &&
                      !isGuestViewOnly &&
                      !isSharedIsolateClusterDragDisabled
                        ? undefined
                        : "none"
                    }
                    transform={transform}
                    onPointerDown={
                      isGuestViewOnly
                        ? undefined
                        : (event) =>
                            handlersRef.current.onClusterLabelPointerDown(event, region.id, region.label)
                    }
                    onPointerUp={(event) => handlersRef.current.onClusterLabelPointerUp(event)}
                  >
                    {region.label}
                  </text>
                );
              })
          : null}

        <ClusterDragPreviewLayer
          active={isClusterDragging}
          graphDeltaRef={clusterDragGraphDeltaRef}
          snapshotRef={clusterDragSnapshotRef}
          labelOpacity={effectiveClusterRevealOpacity}
          scheduleRef={clusterDragPreviewScheduleRef}
        />
      </g>
    </svg>
  );
};

const areGraphCanvasPropsEqual = (
  previous: MusicCueGraphCanvasProps,
  next: MusicCueGraphCanvasProps
): boolean => previous.graphRenderRevision === next.graphRenderRevision;

export const MusicCueGraphCanvas = memo(MusicCueGraphCanvasComponent, areGraphCanvasPropsEqual);
