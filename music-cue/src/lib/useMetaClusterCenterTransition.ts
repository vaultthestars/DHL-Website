import { useCallback, useEffect, useRef, useState } from "react";
import { GraphDimensions } from "./graphLayout";
import { getEnabledOwnerMetaClusters } from "./libraryScope";
import { GraphPoint } from "./types";

const META_CENTER_TRANSITION_MS = 450;

const easeInOut = (value: number): number =>
  value < 0.5 ? 2 * value * value : 1 - (-2 * value + 2) ** 2 / 2;

type MetaCenterAnimation = {
  from: Map<string, GraphPoint>;
  to: Map<string, GraphPoint>;
  startTime: number;
  durationMs: number;
  onComplete?: () => void;
};

export const computeOwnerMetaCenters = (
  graphSongs: Array<{ id: string; owners?: Array<{ id: string; name: string }> }>,
  dimensions: GraphDimensions,
  enabledOwnerIds: string[] | undefined,
  ownerBounds?: Map<string, { centroid: GraphPoint; radius: number }>
): Map<string, GraphPoint> =>
  new Map(
    getEnabledOwnerMetaClusters(graphSongs, dimensions, enabledOwnerIds, {
      isAxisView: false,
      ownerBounds,
    }).map((meta) => [meta.id, meta.center])
  );

export const useMetaClusterCenterTransition = (
  graphSongs: Array<{ id: string; owners?: Array<{ id: string; name: string }> }>,
  dimensions: GraphDimensions,
  enabledOwnerIds: string[] | undefined,
  ownerBounds: Map<string, { centroid: GraphPoint; radius: number }> | undefined
): {
  getMetaClusterCenter: (ownerId: string, defaultCenter: GraphPoint) => GraphPoint;
  isMetaClusterAnimating: boolean;
  startMetaClusterCenterTransition: (
    fromBounds: Map<string, { centroid: GraphPoint; radius: number }>,
    onComplete?: () => void
  ) => void;
} => {
  const [animTick, setAnimTick] = useState(0);
  const animationRef = useRef<MetaCenterAnimation | null>(null);
  const frameRef = useRef(0);
  const liveCentersRef = useRef<Map<string, GraphPoint>>(new Map());

  liveCentersRef.current = computeOwnerMetaCenters(
    graphSongs,
    dimensions,
    enabledOwnerIds,
    ownerBounds
  );

  const finishAnimation = useCallback(() => {
    if (frameRef.current) {
      cancelAnimationFrame(frameRef.current);
      frameRef.current = 0;
    }
    const onComplete = animationRef.current?.onComplete;
    animationRef.current = null;
    onComplete?.();
    setAnimTick((value) => value + 1);
  }, []);

  const startMetaClusterCenterTransition = useCallback(
    (fromBounds: Map<string, { centroid: GraphPoint; radius: number }>, onComplete?: () => void) => {
      const fromCenters = computeOwnerMetaCenters(graphSongs, dimensions, enabledOwnerIds, fromBounds);
      const toCenters = liveCentersRef.current;

      let maxDistance = 0;
      toCenters.forEach((toCenter, ownerId) => {
        const fromCenter = fromCenters.get(ownerId) ?? toCenter;
        maxDistance = Math.max(
          maxDistance,
          Math.hypot(toCenter.x - fromCenter.x, toCenter.y - fromCenter.y)
        );
      });

      if (frameRef.current) {
        cancelAnimationFrame(frameRef.current);
        frameRef.current = 0;
      }

      if (maxDistance < 1) {
        animationRef.current = null;
        onComplete?.();
        setAnimTick((value) => value + 1);
        return;
      }

      animationRef.current = {
        from: fromCenters,
        to: toCenters,
        startTime: performance.now(),
        durationMs: META_CENTER_TRANSITION_MS,
        onComplete,
      };

      const tick = (now: number) => {
        const session = animationRef.current;
        if (!session) {
          return;
        }
        if (now - session.startTime >= session.durationMs) {
          finishAnimation();
          return;
        }
        setAnimTick((value) => value + 1);
        frameRef.current = requestAnimationFrame(tick);
      };

      setAnimTick((value) => value + 1);
      frameRef.current = requestAnimationFrame(tick);
    },
    [dimensions, enabledOwnerIds, finishAnimation, graphSongs]
  );

  useEffect(
    () => () => {
      if (frameRef.current) {
        cancelAnimationFrame(frameRef.current);
      }
    },
    []
  );

  const getMetaClusterCenter = useCallback(
    (ownerId: string, defaultCenter: GraphPoint): GraphPoint => {
      void animTick;
      const session = animationRef.current;
      if (!session) {
        return defaultCenter;
      }
      const from = session.from.get(ownerId) ?? defaultCenter;
      const to = session.to.get(ownerId) ?? defaultCenter;
      const rawProgress = Math.min(1, (performance.now() - session.startTime) / session.durationMs);
      const progress = easeInOut(rawProgress);
      return {
        x: from.x + (to.x - from.x) * progress,
        y: from.y + (to.y - from.y) * progress,
      };
    },
    [animTick]
  );

  return {
    getMetaClusterCenter,
    isMetaClusterAnimating: animationRef.current !== null,
    startMetaClusterCenterTransition,
  };
};
