import { useLayoutEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { GraphDimensions } from "./graphLayout";
import { layoutConfigKey } from "./layoutMetrics";
import { GraphPoint, LayoutConfig, Song } from "./types";
import { getCanonicalSongId, isIsolateScopedSongId } from "./isolateScopeSongs";

export const LAYOUT_TRANSITION_SPEED_PX_PER_SEC = 360;
/** Above this count, layout changes snap instantly instead of animating every node. */
export const LARGE_LIBRARY_LAYOUT_SNAP_THRESHOLD = 500;

const easeInOut = (value: number): number =>
  value < 0.5 ? 2 * value * value : 1 - (-2 * value + 2) ** 2 / 2;

export type LayoutTransitionState = {
  progress: number;
  fromLayout: LayoutConfig;
  toLayout: LayoutConfig;
  fromScopeKey: string;
  toScopeKey: string;
  isAnimating: boolean;
};

export const useLayoutTransition = (
  layoutConfig: LayoutConfig,
  visibleSongs: Song[],
  dimensions: GraphDimensions,
  computePosition: (song: Song, config: LayoutConfig) => GraphPoint,
  extraTransitionKey = ""
): {
  getDisplayPosition: (song: Song) => GraphPoint;
  transition: LayoutTransitionState;
} => {
  const [animatedPositions, setAnimatedPositions] = useState<Map<string, GraphPoint>>(() => new Map());
  const [transition, setTransition] = useState<LayoutTransitionState>({
    progress: 1,
    fromLayout: layoutConfig,
    toLayout: layoutConfig,
    fromScopeKey: extraTransitionKey,
    toScopeKey: extraTransitionKey,
    isAnimating: false,
  });

  const animationRef = useRef<{
    frameId: number;
    from: Map<string, GraphPoint>;
    to: Map<string, GraphPoint>;
    fromLayout: LayoutConfig;
    toLayout: LayoutConfig;
    fromScopeKey: string;
    toScopeKey: string;
    startTime: number;
    durationMs: number;
    layoutChanged: boolean;
  } | null>(null);

  const prevLayoutRef = useRef(layoutConfig);
  const prevTransitionKeyRef = useRef(`${layoutConfigKey(layoutConfig)}|${extraTransitionKey}`);
  const computePositionRef = useRef(computePosition);
  computePositionRef.current = computePosition;

  const buildTransitionKey = (config: LayoutConfig, scopeKey: string): string =>
    `${layoutConfigKey(config)}|${scopeKey}`;

  const getScopeKey = (transitionKey: string): string => {
    const firstPipe = transitionKey.indexOf("|");
    if (firstPipe < 0) {
      return "";
    }
    const remainder = transitionKey.slice(firstPipe + 1);
    return remainder.split("|")[0] ?? "";
  };

  const applyScopeTransitionFromPositions = (
    startFrom: Map<string, GraphPoint>,
    to: Map<string, GraphPoint>,
    previousScopeKey: string,
    nextScopeKey: string,
    songs: Song[]
  ): void => {
    if (previousScopeKey === nextScopeKey) {
      return;
    }

    if (previousScopeKey === "conglomerate" && nextScopeKey === "isolate") {
      songs.forEach((song) => {
        const canonicalId = getCanonicalSongId(song.id);
        const sharedFrom = startFrom.get(canonicalId) ?? startFrom.get(song.id) ?? to.get(song.id);
        if (sharedFrom) {
          startFrom.set(song.id, sharedFrom);
        }
      });
      return;
    }

    if (previousScopeKey === "isolate" && nextScopeKey === "conglomerate") {
      songs.forEach((song) => {
        const duplicatePositions = [...startFrom.entries()].filter(
          ([songId]) => getCanonicalSongId(songId) === song.id
        );
        const targetPoint = to.get(song.id);
        if (duplicatePositions.length > 0) {
          const merged = duplicatePositions.reduce(
            (sum, [, point]) => ({ x: sum.x + point.x, y: sum.y + point.y }),
            { x: 0, y: 0 }
          );
          startFrom.set(song.id, {
            x: merged.x / duplicatePositions.length,
            y: merged.y / duplicatePositions.length,
          });
          if (targetPoint) {
            duplicatePositions.forEach(([songId]) => {
              to.set(songId, targetPoint);
            });
          }
          return;
        }
        const fallback = startFrom.get(song.id) ?? to.get(song.id);
        if (fallback) {
          startFrom.set(song.id, fallback);
        }
      });
    }
  };

  const animatedPositionsRef = useRef(animatedPositions);
  animatedPositionsRef.current = animatedPositions;

  useLayoutEffect(() => {
    const previousLayout = prevLayoutRef.current;
    const previousTransitionKey = prevTransitionKeyRef.current;
    const toLayout = layoutConfig;
    const toKey = buildTransitionKey(toLayout, extraTransitionKey);
    const layoutChanged = previousTransitionKey !== toKey;
    const previousScopeKey = getScopeKey(previousTransitionKey);
    prevLayoutRef.current = toLayout;
    prevTransitionKeyRef.current = toKey;

    const to = new Map<string, GraphPoint>();
    visibleSongs.forEach((song) => {
      to.set(song.id, computePositionRef.current(song, toLayout));
    });

    if (!layoutChanged) {
      if (to.size === animatedPositionsRef.current.size && to.size > 0) {
        const sampleId = visibleSongs[0]?.id;
        if (sampleId) {
          const previous = animatedPositionsRef.current.get(sampleId);
          const next = to.get(sampleId);
          if (
            previous &&
            next &&
            Math.hypot(previous.x - next.x, previous.y - next.y) < 0.5
          ) {
            return undefined;
          }
        }
      }
      setAnimatedPositions(to);
      setTransition({
        progress: 1,
        fromLayout: toLayout,
        toLayout,
        fromScopeKey: extraTransitionKey,
        toScopeKey: extraTransitionKey,
        isAnimating: false,
      });
      return undefined;
    }

    const snapLayoutInstantly = visibleSongs.length >= LARGE_LIBRARY_LAYOUT_SNAP_THRESHOLD;

    const startFrom =
      animatedPositionsRef.current.size > 0
        ? new Map(animatedPositionsRef.current)
        : new Map(visibleSongs.map((song) => [song.id, to.get(song.id)!]));

    applyScopeTransitionFromPositions(
      startFrom,
      to,
      previousScopeKey,
      extraTransitionKey,
      visibleSongs
    );

    let maxDistance = 0;
    const distanceSongIds = new Set(visibleSongs.map((song) => song.id));
    if (previousScopeKey === "isolate" && extraTransitionKey === "conglomerate") {
      startFrom.forEach((_, songId) => {
        if (isIsolateScopedSongId(songId)) {
          distanceSongIds.add(songId);
        }
      });
    }

    distanceSongIds.forEach((songId) => {
      const fromPoint = startFrom.get(songId) ?? to.get(songId);
      const toPoint = to.get(songId);
      if (!fromPoint || !toPoint) {
        return;
      }
      maxDistance = Math.max(maxDistance, Math.hypot(toPoint.x - fromPoint.x, toPoint.y - fromPoint.y));
    });

    if (animationRef.current) {
      cancelAnimationFrame(animationRef.current.frameId);
    }

    if (maxDistance < 1 || snapLayoutInstantly) {
      setAnimatedPositions(to);
      setTransition({
        progress: 1,
        fromLayout: toLayout,
        toLayout,
        fromScopeKey: extraTransitionKey,
        toScopeKey: extraTransitionKey,
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
      fromScopeKey: previousScopeKey,
      toScopeKey: extraTransitionKey,
      startTime,
      durationMs,
      layoutChanged,
    };

    flushSync(() => {
      setAnimatedPositions(new Map(startFrom));
      setTransition({
        progress: 0,
        fromLayout: previousLayout,
        toLayout,
        fromScopeKey: previousScopeKey,
        toScopeKey: extraTransitionKey,
        isAnimating: true,
      });
    });

    const tick = (now: number) => {
      const session = animationRef.current;
      if (!session) {
        return;
      }

      const rawProgress = Math.min(1, (now - session.startTime) / session.durationMs);
      const progress = easeInOut(rawProgress);
      const nextPositions = new Map<string, GraphPoint>();
      const animatedSongIds = new Set(visibleSongs.map((song) => song.id));

      if (session.fromScopeKey === "isolate" && session.toScopeKey === "conglomerate") {
        session.from.forEach((_, songId) => {
          if (isIsolateScopedSongId(songId)) {
            animatedSongIds.add(songId);
          }
        });
      }

      animatedSongIds.forEach((songId) => {
        const fromPoint = session.from.get(songId) ?? session.to.get(songId);
        const toPoint = session.to.get(songId);
        if (!fromPoint || !toPoint) {
          return;
        }
        nextPositions.set(songId, {
          x: fromPoint.x + (toPoint.x - fromPoint.x) * progress,
          y: fromPoint.y + (toPoint.y - fromPoint.y) * progress,
        });
      });

      setAnimatedPositions(nextPositions);
      setTransition({
        progress,
        fromLayout: session.fromLayout,
        toLayout: session.toLayout,
        fromScopeKey: session.fromScopeKey,
        toScopeKey: session.toScopeKey,
        isAnimating: rawProgress < 1,
      });

      if (rawProgress < 1) {
        session.frameId = requestAnimationFrame(tick);
      } else {
        animationRef.current = null;
        setTransition({
          progress: 1,
          fromLayout: session.toLayout,
          toLayout: session.toLayout,
          fromScopeKey: session.toScopeKey,
          toScopeKey: session.toScopeKey,
          isAnimating: false,
        });
      }
    };

    animationRef.current.frameId = requestAnimationFrame(tick);

    return () => {
      const session = animationRef.current;
      if (!session) {
        return;
      }
      cancelAnimationFrame(session.frameId);
      setAnimatedPositions(new Map(session.to));
      setTransition({
        progress: 1,
        fromLayout: session.toLayout,
        toLayout: session.toLayout,
        fromScopeKey: session.toScopeKey,
        toScopeKey: session.toScopeKey,
        isAnimating: false,
      });
      animationRef.current = null;
    };
  }, [dimensions.height, dimensions.width, extraTransitionKey, layoutConfig, visibleSongs]);

  const getDisplayPosition = (song: Song): GraphPoint => {
    if (transition.isAnimating) {
      const animated = animatedPositions.get(song.id);
      if (animated) {
        return animated;
      }
      const session = animationRef.current;
      const fromPoint = session?.from.get(song.id);
      if (fromPoint) {
        return fromPoint;
      }
    }

    return computePosition(song, layoutConfig);
  };

  return {
    getDisplayPosition,
    transition,
  };
};

export const isClusterLayoutConfig = (config: LayoutConfig): boolean => config.viewMode === "cluster";
