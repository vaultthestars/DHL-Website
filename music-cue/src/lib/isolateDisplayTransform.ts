import {
  getEnabledOwnerMetaClusters,
  songsForOwnerScope,
  wedgeIsolateAxisPosition,
  type OwnerMetaCluster,
} from "./libraryScope";
import { getIsolateOwnerBoundsFromConglomeratePositions } from "./isolateClusterLayout";
import { getMetricRange, getMetricValue, isClusterView } from "./layoutMetrics";
import type { GraphPoint, LayoutConfig, LibraryStats, Song } from "./types";

export type IsolateDisplayContext = {
  offsets: Map<string, GraphPoint>;
  metaClustersByOwner: Map<string, OwnerMetaCluster>;
  isAxisView: boolean;
};

/** Precompute per-owner isolate display data from conglomerate positions (no relayout). */
export const computeIsolateDisplayContext = (
  conglomeratePositions: Map<string, GraphPoint> | null,
  songs: Song[],
  dimensions: { width: number; height: number },
  enabledOwnerIds: string[] | undefined,
  layoutConfig: LayoutConfig
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
      const bounds = boundsByOwner.get(meta.id);
      if (!bounds) {
        return;
      }
      offsets.set(meta.id, {
        x: meta.center.x - bounds.centroid.x,
        y: meta.center.y - bounds.centroid.y,
      });
    });
  }

  return { offsets, metaClustersByOwner, isAxisView };
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
    const radialMetric = layoutConfig.axisY === "year" ? layoutConfig.axisX : layoutConfig.axisY;
    const metricValue = getMetricValue(song, radialMetric) ?? song.year;
    const metricRange = getMetricRange(allSongs, radialMetric, stats);
    const ownerSongs = songsForOwnerScope(allSongs, ownerId);
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
): Map<string, GraphPoint> =>
  computeIsolateDisplayContext(conglomeratePositions, songs, dimensions, enabledOwnerIds, {
    viewMode: "cluster",
    clusterMode: "genre",
    axisX: "year",
    axisY: "plays",
  }).offsets;
