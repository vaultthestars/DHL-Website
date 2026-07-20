import { GeneratedCue, GraphPoint, LayoutConfig, PositionResolver, Song } from "./types";

const distancePointToSegment = (
  point: GraphPoint,
  start: GraphPoint,
  end: GraphPoint
): number => {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  if (dx === 0 && dy === 0) {
    return Math.hypot(point.x - start.x, point.y - start.y);
  }

  const t = Math.max(
    0,
    Math.min(1, ((point.x - start.x) * dx + (point.y - start.y) * dy) / (dx * dx + dy * dy))
  );
  const projX = start.x + t * dx;
  const projY = start.y + t * dy;
  return Math.hypot(point.x - projX, point.y - projY);
};

const distancePointToPolyline = (point: GraphPoint, stroke: GraphPoint[]): number => {
  if (stroke.length === 0) {
    return Number.POSITIVE_INFINITY;
  }
  if (stroke.length === 1) {
    return Math.hypot(point.x - stroke[0].x, point.y - stroke[0].y);
  }

  let minDistance = Number.POSITIVE_INFINITY;
  for (let i = 0; i < stroke.length - 1; i += 1) {
    minDistance = Math.min(minDistance, distancePointToSegment(point, stroke[i], stroke[i + 1]));
  }
  return minDistance;
};

const projectionParameter = (point: GraphPoint, stroke: GraphPoint[]): number => {
  if (stroke.length === 0) {
    return 0;
  }
  if (stroke.length === 1) {
    return 0;
  }

  let bestT = 0;
  let bestDistance = Number.POSITIVE_INFINITY;
  let accumulated = 0;
  const segmentLengths: number[] = [];

  for (let i = 0; i < stroke.length - 1; i += 1) {
    segmentLengths.push(Math.hypot(stroke[i + 1].x - stroke[i].x, stroke[i + 1].y - stroke[i].y));
  }
  const totalLength = segmentLengths.reduce((sum, length) => sum + length, 0) || 1;

  for (let i = 0; i < stroke.length - 1; i += 1) {
    const start = stroke[i];
    const end = stroke[i + 1];
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const denom = dx * dx + dy * dy;
    const localT = denom === 0 ? 0 : Math.max(0, Math.min(1, ((point.x - start.x) * dx + (point.y - start.y) * dy) / denom));
    const projX = start.x + localT * dx;
    const projY = start.y + localT * dy;
    const distance = Math.hypot(point.x - projX, point.y - projY);

    if (distance < bestDistance) {
      bestDistance = distance;
      bestT = (accumulated + localT * segmentLengths[i]) / totalLength;
    }
    accumulated += segmentLengths[i];
  }

  return bestT;
};

export const findNearestSong = (
  point: GraphPoint,
  songs: Song[],
  getPosition: PositionResolver
): Song | null => {
  if (songs.length === 0) {
    return null;
  }

  let bestSong = songs[0];
  let bestDistance = Number.POSITIVE_INFINITY;

  songs.forEach((song) => {
    const position = getPosition(song);
    const distance = Math.hypot(point.x - position.x, point.y - position.y);
    if (distance < bestDistance) {
      bestDistance = distance;
      bestSong = song;
    }
  });

  return bestDistance <= 36 ? bestSong : null;
};

export const generateCueFromStroke = (
  songs: Song[],
  stroke: GraphPoint[],
  getPosition: PositionResolver,
  proximityThreshold: number,
  layoutConfig: LayoutConfig
): GeneratedCue | null => {
  if (stroke.length < 2) {
    return null;
  }

  const candidates = songs
    .map((song) => {
      const position = getPosition(song);
      const distance = distancePointToPolyline(position, stroke);
      return {
        song,
        distance,
        t: projectionParameter(position, stroke),
      };
    })
    .filter((entry) => entry.distance <= proximityThreshold)
    .sort((a, b) => a.t - b.t || a.distance - b.distance);

  if (candidates.length === 0) {
    return null;
  }

  const selected = candidates.filter(
    (entry, index) => index === 0 || entry.song.id !== candidates[index - 1].song.id
  );

  const seed = selected.reduce((sum, entry, index) => sum + entry.song.id.charCodeAt(0) * (index + 1), 0);

  return {
    seed,
    songs: selected.map((entry) => entry.song),
    stroke,
    layoutConfig,
    pathThreshold: proximityThreshold,
  };
};
