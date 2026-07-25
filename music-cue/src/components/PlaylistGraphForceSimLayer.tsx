import { useEffect, useMemo, useState } from "react";
import {
  playlistMetaGraphEdgeStyle,
  type PlaylistMetaGraphSegment,
} from "../lib/playlistMetaGraph";
import {
  stepMetaGraphForceSim,
  type MetaGraphForceEdge,
  type MetaGraphForceNode,
} from "../lib/playlistMetaGraphForceSim";
import type { ClusterRegion } from "../lib/clusterRegions";

type PlaylistGraphForceSimLayerProps = {
  active: boolean;
  nodesRef: React.MutableRefObject<MetaGraphForceNode[]>;
  edgesRef: React.MutableRefObject<MetaGraphForceEdge[]>;
  labelRegions: ClusterRegion[];
  segments: PlaylistMetaGraphSegment[];
  maxSharedSongCount: number;
  labelOpacity?: number;
  onLabelPointerDown?: (
    event: React.PointerEvent<SVGTextElement>,
    clusterId: string,
    label: string
  ) => void;
};

/** Isolated rAF loop + SVG overlay so force sim does not re-render the full graph. */
export const PlaylistGraphForceSimLayer = ({
  active,
  nodesRef,
  edgesRef,
  labelRegions,
  segments,
  maxSharedSongCount,
  labelOpacity = 1,
  onLabelPointerDown,
}: PlaylistGraphForceSimLayerProps) => {
  const [frame, setFrame] = useState(0);

  useEffect(() => {
    if (!active) {
      return undefined;
    }

    let animationId = 0;
    const tick = () => {
      const nodes = nodesRef.current;
      const edges = edgesRef.current;
      if (nodes.length > 0) {
        stepMetaGraphForceSim(nodes, edges);
      }
      setFrame((value) => value + 1);
      animationId = requestAnimationFrame(tick);
    };

    animationId = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(animationId);
    };
  }, [active, edgesRef, nodesRef]);

  const positionsByRegionId = useMemo(() => {
    void frame;
    return new Map(nodesRef.current.map((node) => [node.regionId, node]));
  }, [frame, nodesRef]);

  const liveSegments = useMemo(() => {
    void frame;
    const nodes = nodesRef.current;
    if (nodes.length === 0) {
      return segments;
    }
    return edgesRef.current.map((edge) => ({
      leftId: nodes[edge.sourceIndex].playlistId,
      rightId: nodes[edge.targetIndex].playlistId,
      sharedSongCount: edge.weight,
      start: { x: nodes[edge.sourceIndex].x, y: nodes[edge.sourceIndex].y },
      end: { x: nodes[edge.targetIndex].x, y: nodes[edge.targetIndex].y },
    }));
  }, [edgesRef, frame, nodesRef, segments]);

  if (!active) {
    return null;
  }

  return (
    <>
      {liveSegments.map((segment) => {
        const edgeStyle = playlistMetaGraphEdgeStyle(segment.sharedSongCount, maxSharedSongCount);
        return (
          <line
            key={`metagraph-sim-${segment.leftId}-${segment.rightId}`}
            x1={segment.start.x}
            y1={segment.start.y}
            x2={segment.end.x}
            y2={segment.end.y}
            className="music-cue-playlist-metagraph-edge"
            stroke={edgeStyle.stroke}
            strokeWidth={edgeStyle.strokeWidth}
            pointerEvents="none"
            opacity={labelOpacity}
          />
        );
      })}
      {labelRegions.map((region) => {
        const node = positionsByRegionId.get(region.id);
        const center = node ? { x: node.x, y: node.y } : region.center;
        return (
          <text
            key={`label-sim-${region.id}`}
            x={center.x}
            y={center.y}
            className="music-cue-cluster-label"
            opacity={labelOpacity}
            onPointerDown={
              onLabelPointerDown
                ? (event) => onLabelPointerDown(event, region.id, region.label)
                : undefined
            }
            style={{ cursor: onLabelPointerDown ? "grab" : undefined }}
          >
            {region.label}
          </text>
        );
      })}
    </>
  );
};
