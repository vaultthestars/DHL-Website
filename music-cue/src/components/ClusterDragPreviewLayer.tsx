import { useCallback, useEffect, useRef, useState, type MutableRefObject } from "react";
import type { ClusterRegion } from "../lib/clusterRegions";
import type { GraphPoint, Song } from "../lib/types";

export type ClusterDragSnapshot = {
  clusterIds: Set<string>;
  songIds: Set<string>;
  regions: Array<ClusterRegion & { labelCenter: GraphPoint }>;
  songs: Array<{ song: Song; position: GraphPoint }>;
  showClusterHulls: boolean;
};

type ClusterDragPreviewLayerProps = {
  active: boolean;
  graphDeltaRef: MutableRefObject<GraphPoint>;
  snapshotRef: MutableRefObject<ClusterDragSnapshot | null>;
  labelOpacity: number;
  getSongFill: (song: Song) => string;
  renderGraphSongCount: number;
  scheduleRef: MutableRefObject<(() => void) | null>;
};

/** Lightweight rAF overlay so cluster drag does not re-render the full graph. */
export const ClusterDragPreviewLayer = ({
  active,
  graphDeltaRef,
  snapshotRef,
  labelOpacity,
  getSongFill,
  renderGraphSongCount,
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
  const radius =
    renderGraphSongCount > 1000 ? 2 : renderGraphSongCount > 400 ? 2 : 3;

  return (
    <g className="music-cue-cluster-drag-preview" pointerEvents="none">
      {snapshot.regions.map((region) => {
        const offset = region.displayOffset;
        const transform = offset
          ? `translate(${offset.x + delta.x} ${offset.y + delta.y})`
          : `translate(${delta.x} ${delta.y})`;
        return (
          <g key={`drag-region-${region.id}`} transform={transform}>
            {snapshot.showClusterHulls ? (
              <path
                d={region.hullPath}
                className="music-cue-cluster-region"
                fill={region.fill}
                stroke={region.stroke}
                opacity={labelOpacity}
              />
            ) : null}
            <text
              x={region.labelCenter.x}
              y={region.labelCenter.y}
              className="music-cue-cluster-label music-cue-cluster-label-draggable music-cue-cluster-label-dragging"
              opacity={labelOpacity}
            >
              {region.label}
            </text>
          </g>
        );
      })}
      <g transform={`translate(${delta.x} ${delta.y})`}>
        {snapshot.songs.map(({ song, position }) => (
          <circle
            key={`drag-song-${song.id}`}
            cx={position.x}
            cy={position.y}
            r={radius}
            fill={getSongFill(song)}
            className="music-cue-node"
            pointerEvents="none"
          />
        ))}
      </g>
    </g>
  );
};
