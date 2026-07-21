import { useMemo } from "react";
import type { GraphDimensions } from "../lib/graphLayout";
import { fromNormalizedPosition } from "../lib/graphLayout";
import type { CustomClusterDefinition, NormalizedPoint } from "../lib/types";
import { polygonCentroid, polygonToPath, toGraphPoints } from "../lib/squigglyClusterGeometry";
import { isSquigglyCluster } from "../lib/squigglyClusters";

type SquigglyClusterLayerProps = {
  clusters: CustomClusterDefinition[];
  dimensions: GraphDimensions;
  hoveredClusterId: string | null;
  selectedClusterIds: Set<string>;
  redrawDraft: {
    clusterId: string;
    draftHull: NormalizedPoint[];
  } | null;
  activeDrawStroke: NormalizedPoint[];
  onClusterPointerDown: (
    event: React.PointerEvent<SVGPathElement>,
    cluster: CustomClusterDefinition
  ) => void;
  onClusterDoubleClick: (
    event: React.MouseEvent<SVGPathElement>,
    cluster: CustomClusterDefinition
  ) => void;
  onClusterHover: (clusterId: string | null) => void;
  onAcceptRedraw: () => void;
  onRejectRedraw: () => void;
};

export const SquigglyClusterLayer = ({
  clusters,
  dimensions,
  hoveredClusterId,
  selectedClusterIds,
  redrawDraft,
  activeDrawStroke,
  onClusterPointerDown,
  onClusterDoubleClick,
  onClusterHover,
  onAcceptRedraw,
  onRejectRedraw,
}: SquigglyClusterLayerProps) => {
  const squigglyClusters = useMemo(() => clusters.filter(isSquigglyCluster), [clusters]);

  const activeStrokePath =
    activeDrawStroke.length > 1
      ? polygonToPath(toGraphPoints(activeDrawStroke, dimensions), false)
      : null;

  return (
    <>
      {squigglyClusters.map((cluster) => {
        const hull =
          redrawDraft?.clusterId === cluster.id ? redrawDraft.draftHull : (cluster.hull ?? []);
        const graphHull = toGraphPoints(hull, dimensions);
        if (graphHull.length < 3) {
          return null;
        }
        const path = polygonToPath(graphHull, true);
        const color = cluster.color ?? "#4a90d9";
        const isHovered = hoveredClusterId === cluster.id;
        const isSelected = selectedClusterIds.has(cluster.id);
        const labelPoint = cluster.labelPosition
          ? fromNormalizedPosition(cluster.labelPosition, dimensions)
          : polygonCentroid(graphHull);

        return (
          <g key={`squiggly-${cluster.id}`}>
            <path
              d={path}
              className="music-cue-squiggly-cluster-fill"
              fill={color}
              fillOpacity={isSelected ? 0.22 : 0.14}
              onPointerDown={(event) => onClusterPointerDown(event, cluster)}
              onDoubleClick={(event) => onClusterDoubleClick(event, cluster)}
              onPointerEnter={() => onClusterHover(cluster.id)}
              onPointerLeave={() => onClusterHover(null)}
            />
            <path
              d={path}
              className={`music-cue-squiggly-cluster-border ${isHovered ? "is-hovered" : ""} ${
                isSelected ? "is-selected" : ""
              }`}
              fill="none"
              stroke={color}
              strokeWidth={isHovered || isSelected ? 3 : 1.8}
              pointerEvents="none"
            />
            <text
              x={labelPoint.x}
              y={labelPoint.y}
              className="music-cue-squiggly-cluster-label"
              pointerEvents="none"
            >
              {cluster.label}
            </text>
            {redrawDraft?.clusterId === cluster.id ? (
              <foreignObject
                x={labelPoint.x - 110}
                y={labelPoint.y + 14}
                width={220}
                height={72}
                className="music-cue-redraw-prompt-host"
              >
                <div
                  xmlns="http://www.w3.org/1999/xhtml"
                  className="music-cue-redraw-prompt"
                  onPointerDown={(event) => event.stopPropagation()}
                >
                  <p className="music-cue-redraw-prompt-text">Accept new cluster shape?</p>
                  <div className="music-cue-redraw-prompt-actions">
                    <button
                      type="button"
                      className="music-cue-redraw-accept-btn"
                      onClick={onAcceptRedraw}
                      aria-label="Accept new cluster shape"
                    >
                      ✓
                    </button>
                    <button
                      type="button"
                      className="music-cue-redraw-reject-btn"
                      onClick={onRejectRedraw}
                      aria-label="Reject new cluster shape"
                    >
                      ✕
                    </button>
                  </div>
                </div>
              </foreignObject>
            ) : null}
          </g>
        );
      })}
      {activeStrokePath ? (
        <path
          d={activeStrokePath}
          className="music-cue-squiggly-cluster-draft"
          fill="none"
          pointerEvents="none"
        />
      ) : null}
    </>
  );
};
