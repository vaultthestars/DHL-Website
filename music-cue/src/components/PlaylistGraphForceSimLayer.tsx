import { useEffect, useRef } from "react";
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

/** Isolated rAF loop; imperative SVG updates avoid React re-renders each tick. */
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
  const edgeLineRefs = useRef<(SVGLineElement | null)[]>([]);
  const labelTextRefs = useRef<Map<string, SVGTextElement>>(new Map());

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

      edges.forEach((edge, index) => {
        const line = edgeLineRefs.current[index];
        const source = nodes[edge.sourceIndex];
        const target = nodes[edge.targetIndex];
        if (!line || !source || !target) {
          return;
        }
        line.setAttribute("x1", source.x.toFixed(1));
        line.setAttribute("y1", source.y.toFixed(1));
        line.setAttribute("x2", target.x.toFixed(1));
        line.setAttribute("y2", target.y.toFixed(1));
      });

      nodes.forEach((node) => {
        const label = labelTextRefs.current.get(node.regionId);
        if (!label) {
          return;
        }
        label.setAttribute("x", node.x.toFixed(1));
        label.setAttribute("y", node.y.toFixed(1));
      });

      animationId = requestAnimationFrame(tick);
    };

    animationId = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(animationId);
    };
  }, [active, edgesRef, nodesRef]);

  if (!active) {
    return null;
  }

  const initialNodes = nodesRef.current;
  const positionsByRegionId = new Map(initialNodes.map((node) => [node.regionId, node]));

  return (
    <>
      {segments.map((segment, index) => {
        const edgeStyle = playlistMetaGraphEdgeStyle(segment.sharedSongCount, maxSharedSongCount);
        return (
          <line
            key={`metagraph-sim-${segment.leftId}-${segment.rightId}`}
            ref={(element) => {
              edgeLineRefs.current[index] = element;
            }}
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
            ref={(element) => {
              if (element) {
                labelTextRefs.current.set(region.id, element);
              } else {
                labelTextRefs.current.delete(region.id);
              }
            }}
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
