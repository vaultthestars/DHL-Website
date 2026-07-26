import { useCallback, useEffect, useRef, useState, type MutableRefObject } from "react";
import { fromNormalizedPosition } from "../lib/graphLayout";
import type { GraphDimensions } from "../lib/graphLayout";
import type { NormalizedPoint } from "../lib/types";

type StrokeDraftLayerProps = {
  active: boolean;
  strokeRef: MutableRefObject<NormalizedPoint[]>;
  dimensions: GraphDimensions;
  scheduleRef: MutableRefObject<(() => void) | null>;
};

/** rAF-updated draft path so pointer moves do not re-render the graph layer. */
export const StrokeDraftLayer = ({
  active,
  strokeRef,
  dimensions,
  scheduleRef,
}: StrokeDraftLayerProps) => {
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
  if (!active) {
    return null;
  }

  const points = strokeRef.current;
  if (points.length < 2) {
    return null;
  }

  const path = points
    .map((point, index) => {
      const graphPoint = fromNormalizedPosition(point, dimensions);
      return `${index === 0 ? "M" : "L"} ${graphPoint.x.toFixed(1)} ${graphPoint.y.toFixed(1)}`;
    })
    .join(" ");

  return (
    <path
      d={path}
      className="music-cue-stroke music-cue-stroke-drafting"
      pointerEvents="none"
    />
  );
};
