import {
  getEnabledOwnerMetaClusters,
  songsForOwnerScope,
  wedgeIsolateAxisPosition,
  type OwnerMetaCluster,
} from "./libraryScope";
import { getIsolateOwnerBoundsFromConglomeratePositions } from "./isolateClusterLayout";
import { getMetricRange, getMetricValue, isClusterView } from "./layoutMetrics";
import type { AxisMetric, GraphPoint, LayoutConfig, LibraryStats, Song } from "./types";

export type IsolateDisplayContext = {
  offsets: Map<string, GraphPoint>;
  metaClustersByOwner: Map<string, OwnerMetaCluster>;
  isAxisView: boolean;
  /** Axis isolate: precomputed once per layout, not per song lookup. */
  radialMetric?: AxisMetric;
  metricRange?: { min: number; max: number };
  ownerSongsByOwnerId?: Map<string, Song[]>;
};

/** Precompute per-owner isolate display data from conglomerate positions (no relayout). */
export const computeIsolateDisplayContext = (
  conglomeratePositions: Map<string, GraphPoint> | null,
  songs: Song[],
  dimensions: { width: number; height: number },
  enabledOwnerIds: string[] | undefined,
  layoutConfig: LayoutConfig,
  stats: LibraryStats
): IsolateDisplayContext => {
  const isAxisView = !isClusterView(layoutConfig);
  const boundsByOwner =
    !isAxisView && conglomeratePositions
      ? getIsolateOwnerBoundsFromConglomeratePositions(
          songs,
          conglomeratePositions,
          dimensions,
          enabledOwnerIds
        )
      : undefined;
  const metaClusters = getEnabledOwnerMetaClusters(songs, dimensions, enabledOwnerIds, {
    isAxisView,
    ownerBounds: boundsByOwner,
  });
  const metaClustersByOwner = new Map(metaClusters.map((meta) => [meta.id, meta]));
  const offsets = new Map<string, GraphPoint>();

  if (!isAxisView) {
    metaClusters.forEach((meta) => {
      const bounds = boundsByOwner?.get(meta.id);
      if (!bounds) {
        return;
      }
      offsets.set(meta.id, {
        x: meta.center.x - bounds.centroid.x,
        y: meta.center.y - bounds.centroid.y,
      });
    });
  }

  let radialMetric: AxisMetric | undefined;
  let metricRange: { min: number; max: number } | undefined;
  let ownerSongsByOwnerId: Map<string, Song[]> | undefined;

  if (isAxisView) {
    radialMetric = layoutConfig.axisY === "year" ? layoutConfig.axisX : layoutConfig.axisY;
    metricRange = getMetricRange(songs, radialMetric, stats);
    ownerSongsByOwnerId = new Map();
    metaClusters.forEach((meta) => {
      ownerSongsByOwnerId!.set(meta.id, songsForOwnerScope(songs, meta.id));
    });
  }

  return {
    offsets,
    metaClustersByOwner,
    isAxisView,
    radialMetric,
    metricRange,
    ownerSongsByOwnerId,
  };
};

export const applyIsolateDisplayTranslation = (
  song: Song,
  conglomeratePosition: GraphPoint,
  offsets: Map<string, GraphPoint>
): GraphPoint => {
  const owners = song.owners ?? [];
  if (owners.length !== 1) {
    return conglomeratePosition;
  }
  const offset = offsets.get(owners[0].id);
  if (!offset) {
    return conglomeratePosition;
  }
  return {
    x: conglomeratePosition.x + offset.x,
    y: conglomeratePosition.y + offset.y,
  };
};

export const applyIsolateDisplayPosition = (
  song: Song,
  conglomeratePosition: GraphPoint,
  context: IsolateDisplayContext,
  layoutConfig: LayoutConfig,
  stats: LibraryStats,
  allSongs: Song[]
): GraphPoint => {
  const owners = song.owners ?? [];
  if (owners.length !== 1) {
    return conglomeratePosition;
  }

  const ownerId = owners[0].id;

  if (context.isAxisView) {
    const meta = context.metaClustersByOwner.get(ownerId);
    if (!meta) {
      return conglomeratePosition;
    }
    const radialMetric =
      context.radialMetric ??
      (layoutConfig.axisY === "year" ? layoutConfig.axisX : layoutConfig.axisY);
    const metricValue = getMetricValue(song, radialMetric) ?? song.year;
    const metricRange = context.metricRange ?? getMetricRange(allSongs, radialMetric, stats);
    const ownerSongs = context.ownerSongsByOwnerId?.get(ownerId) ?? songsForOwnerScope(allSongs, ownerId);
    return wedgeIsolateAxisPosition(
      song,
      metricValue,
      metricRange.min,
      metricRange.max,
      meta,
      ownerSongs,
      radialMetric
    );
  }

  return applyIsolateDisplayTranslation(song, conglomeratePosition, context.offsets);
};

/** One-shot position map for web rendering — O(1) lookup during pan/zoom culling. */
export const buildWebDisplayPositionCache = (
  songs: Song[],
  conglomeratePositions: Map<string, GraphPoint> | null,
  isolateContext: IsolateDisplayContext | null,
  layoutConfig: LayoutConfig,
  stats: LibraryStats,
  fallbackPosition: (song: Song) => GraphPoint
): Map<string, GraphPoint> => {
  const positions = new Map<string, GraphPoint>();

  if (isolateContext?.isAxisView) {
    songs.forEach((song) => {
      positions.set(
        song.id,
        applyIsolateDisplayPosition(song, fallbackPosition(song), isolateContext, layoutConfig, stats, songs)
      );
    });
    return positions;
  }

  if (isolateContext && conglomeratePositions) {
    songs.forEach((song) => {
      const base = conglomeratePositions.get(song.id) ?? fallbackPosition(song);
      positions.set(
        song.id,
        applyIsolateDisplayTranslation(song, base, isolateContext.offsets)
      );
    });
    return positions;
  }

  if (conglomeratePositions) {
    songs.forEach((song) => {
      const cached = conglomeratePositions.get(song.id);
      if (cached) {
        positions.set(song.id, cached);
      }
    });
    return positions;
  }

  songs.forEach((song) => {
    positions.set(song.id, fallbackPosition(song));
  });
  return positions;
};

export const translateGraphPointByOwnerOffset = (
  point: GraphPoint,
  offset: GraphPoint
): GraphPoint => ({
  x: point.x + offset.x,
  y: point.y + offset.y,
});

/** @deprecated Use computeIsolateDisplayContext */
export const computeOwnerTranslationOffsets = (
  conglomeratePositions: Map<string, GraphPoint>,
  songs: Song[],
  dimensions: { width: number; height: number },
  enabledOwnerIds?: string[]
): Map<string, GraphPoint> => {
  const boundsByOwner = getIsolateOwnerBoundsFromConglomeratePositions(
    songs,
    conglomeratePositions,
    dimensions,
    enabledOwnerIds
  );
  const metaClusters = getEnabledOwnerMetaClusters(songs, dimensions, enabledOwnerIds, {
    isAxisView: false,
    ownerBounds: boundsByOwner,
  });
  const offsets = new Map<string, GraphPoint>();
  metaClusters.forEach((meta) => {
    const bounds = boundsByOwner.get(meta.id);
    if (!bounds) {
      return;
    }
    offsets.set(meta.id, {
      x: meta.center.x - bounds.centroid.x,
      y: meta.center.y - bounds.centroid.y,
    });
  });
  return offsets;
};
