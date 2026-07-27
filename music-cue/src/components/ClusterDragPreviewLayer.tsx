import { useCallback, useEffect, useRef, useState, type MutableRefObject } from "react";
import { parseOwnerScopedRegionId } from "../lib/isolateClusterLayout";
import { buildPlaylistNeighborHullPath } from "../lib/playlistClusterHull";
import type { PlaylistMetaGraphEdge } from "../lib/playlistMetaGraphEdges";
import type { ClusterRegion } from "../lib/clusterRegions";
import type { GraphPoint, Song } from "../lib/types";

export type ClusterDragHullContext = {
  edges: PlaylistMetaGraphEdge[];
  /** Hull anchor center per region (owner-local space, before displayOffset). */
  regionCentersByRegionId: Map<string, GraphPoint>;
  playlistCenters: Map<string, GraphPoint>;
  paddingByRegionId: Map<string, number>;
  memberCountByRegionId: Map<string, number>;
};

export type ClusterDragSnapshot = {
  movedRegionIds: Set<string>;
  previewRegionIds: Set<string>;
  songIds: Set<string>;
  movedRegions: Array<ClusterRegion & { labelCenter: GraphPoint }>;
  neighborRegions: ClusterRegion[];
  songs: Array<{ song: Song; position: GraphPoint }>;
  showClusterHulls: boolean;
  hullContext: ClusterDragHullContext | null;
};

type ClusterDragPreviewLayerProps = {
  active: boolean;
  graphDeltaRef: MutableRefObject<GraphPoint>;
  snapshotRef: MutableRefObject<ClusterDragSnapshot | null>;
  labelOpacity: number;
  scheduleRef: MutableRefObject<(() => void) | null>;
};

const buildLivePlaylistCenters = (
  snapshot: ClusterDragSnapshot,
  delta: GraphPoint
): Map<string, GraphPoint> | null => {
  const { hullContext } = snapshot;
  if (!hullContext) {
    return null;
  }
  const liveCenters = new Map(hullContext.playlistCenters);
  snapshot.movedRegions.forEach((region) => {
    const { clusterId } = parseOwnerScopedRegionId(region.id);
    const startCenter =
      hullContext.regionCentersByRegionId.get(region.id) ??
      hullContext.playlistCenters.get(clusterId);
    if (!startCenter) {
      return;
    }
    liveCenters.set(clusterId, {
      x: startCenter.x + delta.x,
      y: startCenter.y + delta.y,
    });
  });
  return liveCenters;
};

const buildLiveHullPath = (
  region: ClusterRegion,
  snapshot: ClusterDragSnapshot,
  liveCenters: Map<string, GraphPoint>
): string => {
  const { hullContext } = snapshot;
  if (!hullContext) {
    return region.hullPath;
  }
  const { clusterId } = parseOwnerScopedRegionId(region.id);
  const center = liveCenters.get(clusterId);
  if (!center) {
    return region.hullPath;
  }
  return buildPlaylistNeighborHullPath(
    clusterId,
    center,
    hullContext.edges,
    liveCenters,
    hullContext.memberCountByRegionId.get(region.id) ?? region.memberCount,
    hullContext.paddingByRegionId.get(region.id) ?? 24
  );
};

/** Lightweight rAF overlay so cluster drag does not re-render the full graph. */
export const ClusterDragPreviewLayer = ({
  active,
  graphDeltaRef,
  snapshotRef,
  labelOpacity,
  scheduleRef,
}: ClusterDragPreviewLayerProps) => {
  const [frame, setFrame] = useState(0);
  const rafRef = useRef(0);

  const scheduleFrame = useCallback(() => {
    if (rafRef.current) {
      return;
    }
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = 0;
      setFrame((value) => value + 1);
    });
  }, []);

  useEffect(() => {
    scheduleRef.current = scheduleFrame;
    return () => {
      scheduleRef.current = null;
    };
  }, [scheduleFrame, scheduleRef]);

  useEffect(
    () => () => {
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
      }
    },
    []
  );

  void frame;
  const snapshot = snapshotRef.current;
  if (!active || !snapshot) {
    return null;
  }

  const delta = graphDeltaRef.current;
  const liveCenters = buildLivePlaylistCenters(snapshot, delta);

  return (
    <g className="music-cue-cluster-drag-preview" pointerEvents="none">
      {snapshot.movedRegions.map((region) => {
        const offset = region.displayOffset;
        const useLiveHull = Boolean(liveCenters && snapshot.showClusterHulls);
        const hullPath = useLiveHull
          ? buildLiveHullPath(region, snapshot, liveCenters!)
          : region.hullPath;
        const offsetTransform = offset ? `translate(${offset.x} ${offset.y})` : undefined;
        const labelX = region.labelCenter.x + delta.x;
        const labelY = region.labelCenter.y + delta.y;
        return (
          <g key={`drag-moved-${region.id}`} transform={offsetTransform}>
            {snapshot.showClusterHulls ? (
              <path
                d={hullPath}
                className="music-cue-cluster-region music-cue-cluster-region-drag-active"
                fill={region.fill}
                stroke={region.stroke}
                opacity={labelOpacity}
              />
            ) : null}
            <text
              x={labelX}
              y={labelY}
              className="music-cue-cluster-label music-cue-cluster-label-draggable music-cue-cluster-label-dragging"
              opacity={labelOpacity}
            >
              {region.label}
            </text>
          </g>
        );
      })}

    </g>
  );
};
