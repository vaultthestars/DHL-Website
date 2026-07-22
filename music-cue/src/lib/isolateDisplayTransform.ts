import { getEnabledOwnerMetaClusters } from "./libraryScope";
import { getIsolateOwnerBoundsFromConglomeratePositions } from "./isolateClusterLayout";
import type { GraphPoint, Song } from "./types";

/** Per-owner translation: conglomerate position + offset = isolate display position. */
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

export const translateGraphPointByOwnerOffset = (
  point: GraphPoint,
  offset: GraphPoint
): GraphPoint => ({
  x: point.x + offset.x,
  y: point.y + offset.y,
});
