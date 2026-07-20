import { useEffect, useRef, useState } from "react";
import { GraphDimensions } from "./graphLayout";
import { isClusterView, layoutConfigKey } from "./layoutMetrics";
import { GraphPoint, LayoutConfig, Song } from "./types";

export const LAYOUT_TRANSITION_SPEED_PX_PER_SEC = 360;

const easeInOut = (value: number): number =>
  value < 0.5 ? 2 * value * value : 1 - (-2 * value + 2) ** 2 / 2;

export type LayoutTransitionState = {
  progress: number;
  fromLayout: LayoutConfig;
  toLayout: LayoutConfig;
  isAnimating: boolean;
};

export const useLayoutTransition = (
  layoutConfig: LayoutConfig,
  visibleSongs: Song[],
  dimensions: GraphDimensions,
  computePosition: (song: Song, config: LayoutConfig) => GraphPoint
): {
  getDisplayPosition: (song: Song) => GraphPoint;
  transition: LayoutTransitionState;
} => {
  const [animatedPositions, setAnimatedPositions] = useState<Map<string, GraphPoint>>(() => new Map());
  const [transition, setTransition] = useState<LayoutTransitionState>({
    progress: 1,
    fromLayout: layoutConfig,
    toLayout: layoutConfig,
    isAnimating: false,
  });

  const animationRef = useRef<{
    frameId: number;
    from: Map<string, GraphPoint>;
    to: Map<string, GraphPoint>;
    fromLayout: LayoutConfig;
    toLayout: LayoutConfig;
    startTime: number;
    durationMs: number;
    layoutChanged: boolean;
  } | null>(null);

  const prevLayoutRef = useRef(layoutConfig);
  const computePositionRef = useRef(computePosition);
  computePositionRef.current = computePosition;

  useEffect(() => {
    const previousLayout = prevLayoutRef.current;
    const toLayout = layoutConfig;
    const toKey = layoutConfigKey(toLayout);
    const layoutChanged = layoutConfigKey(previousLayout) !== toKey;
    prevLayoutRef.current = toLayout;

    const to = new Map<string, GraphPoint>();
    visibleSongs.forEach((song) => {
      to.set(song.id, computePositionRef.current(song, toLayout));
    });

    if (!layoutChanged) {
      setAnimatedPositions(to);
      setTransition({
        progress: 1,
        fromLayout: toLayout,
        toLayout,
        isAnimating: false,
      });
      return undefined;
    }

    const startFrom =
      animatedPositions.size > 0
        ? new Map(animatedPositions)
        : new Map(visibleSongs.map((song) => [song.id, to.get(song.id)!]));

    let maxDistance = 0;
    visibleSongs.forEach((song) => {
      const fromPoint = startFrom.get(song.id) ?? to.get(song.id);
      const toPoint = to.get(song.id);
      if (!fromPoint || !toPoint) {
        return;
      }
      maxDistance = Math.max(maxDistance, Math.hypot(toPoint.x - fromPoint.x, toPoint.y - fromPoint.y));
    });

    if (animationRef.current) {
      cancelAnimationFrame(animationRef.current.frameId);
    }

    if (maxDistance < 1) {
      setAnimatedPositions(to);
      setTransition({
        progress: 1,
        fromLayout: toLayout,
        toLayout,
        isAnimating: false,
      });
      return undefined;
    }

    const durationMs = Math.max(250, (maxDistance / LAYOUT_TRANSITION_SPEED_PX_PER_SEC) * 1000);
    const startTime = performance.now();

    animationRef.current = {
      frameId: 0,
      from: startFrom,
      to,
      fromLayout: previousLayout,
      toLayout,
      startTime,
      durationMs,
      layoutChanged,
    };

    setTransition({
      progress: 0,
      fromLayout: previousLayout,
      toLayout,
      isAnimating: true,
    });

    const tick = (now: number) => {
      const session = animationRef.current;
      if (!session) {
        return;
      }

      const rawProgress = Math.min(1, (now - session.startTime) / session.durationMs);
      const progress = easeInOut(rawProgress);
      const nextPositions = new Map<string, GraphPoint>();

      visibleSongs.forEach((song) => {
        const fromPoint = session.from.get(song.id) ?? session.to.get(song.id);
        const toPoint = session.to.get(song.id);
        if (!fromPoint || !toPoint) {
          return;
        }
        nextPositions.set(song.id, {
          x: fromPoint.x + (toPoint.x - fromPoint.x) * progress,
          y: fromPoint.y + (toPoint.y - fromPoint.y) * progress,
        });
      });

      setAnimatedPositions(nextPositions);
      setTransition({
        progress,
        fromLayout: session.fromLayout,
        toLayout: session.toLayout,
        isAnimating: rawProgress < 1,
      });

      if (rawProgress < 1) {
        session.frameId = requestAnimationFrame(tick);
      } else {
        animationRef.current = null;
      }
    };

    animationRef.current.frameId = requestAnimationFrame(tick);

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current.frameId);
        animationRef.current = null;
      }
    };
  }, [dimensions.height, dimensions.width, layoutConfig, visibleSongs]);

  const getDisplayPosition = (song: Song): GraphPoint => {
    const isLayoutTransitioning =
      transition.isAnimating || layoutConfigKey(layoutConfig) !== layoutConfigKey(transition.toLayout);
    if (isLayoutTransitioning) {
      const animated = animatedPositions.get(song.id);
      if (animated) {
        return animated;
      }
    }
    return computePosition(song, layoutConfig);
  };

  return {
    getDisplayPosition,
    transition,
  };
};

export const isClusterLayoutConfig = (config: LayoutConfig): boolean => isClusterView(config);
