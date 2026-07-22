import { GeneratedCue, GraphPoint, LayoutConfig, PositionResolver, Song } from "./types";

type PathCandidate = {
  song: Song;
  distance: number;
  t: number;
};

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

const getStrokeLength = (stroke: GraphPoint[]): number => {
  let length = 0;
  for (let index = 0; index < stroke.length - 1; index += 1) {
    length += Math.hypot(stroke[index + 1].x - stroke[index].x, stroke[index + 1].y - stroke[index].y);
  }
  return length;
};

const distanceAndParameterOnStrokes = (
  point: GraphPoint,
  strokes: GraphPoint[][]
): { distance: number; t: number } => {
  const drawableStrokes = strokes.filter((stroke) => stroke.length >= 2);
  if (drawableStrokes.length === 0) {
    const pointStroke = strokes.find((stroke) => stroke.length === 1);
    if (!pointStroke) {
      return { distance: Number.POSITIVE_INFINITY, t: 0 };
    }
    return {
      distance: Math.hypot(point.x - pointStroke[0].x, point.y - pointStroke[0].y),
      t: 0,
    };
  }

  const strokeLengths = drawableStrokes.map(getStrokeLength);
  const totalLength = strokeLengths.reduce((sum, length) => sum + length, 0) || 1;

  let bestDistance = Number.POSITIVE_INFINITY;
  let bestT = 0;
  let accumulated = 0;

  drawableStrokes.forEach((stroke, index) => {
    const distance = distancePointToPolyline(point, stroke);
    const localT = projectionParameter(point, stroke);
    if (distance < bestDistance) {
      bestDistance = distance;
      bestT = (accumulated + localT * strokeLengths[index]) / totalLength;
    }
    accumulated += strokeLengths[index];
  });

  return { distance: bestDistance, t: bestT };
};

const dedupeConsecutiveCandidates = (candidates: PathCandidate[]): PathCandidate[] =>
  candidates.filter((entry, index) => index === 0 || entry.song.id !== candidates[index - 1].song.id);

const sampleCandidatesEvenly = (candidates: PathCandidate[], maxCount: number): PathCandidate[] => {
  if (maxCount <= 0 || candidates.length <= maxCount) {
    return candidates;
  }

  const minT = candidates[0].t;
  const maxT = candidates[candidates.length - 1].t;
  const span = maxT - minT;
  const selected: PathCandidate[] = [];
  const usedSongIds = new Set<string>();

  for (let index = 0; index < maxCount; index += 1) {
    const targetT = span === 0 || maxCount === 1 ? minT : minT + (index / (maxCount - 1)) * span;

    let best: PathCandidate | null = null;
    let bestDelta = Number.POSITIVE_INFINITY;
    candidates.forEach((entry) => {
      if (usedSongIds.has(entry.song.id)) {
        return;
      }
      const delta = Math.abs(entry.t - targetT);
      if (delta < bestDelta) {
        bestDelta = delta;
        best = entry;
      }
    });

    if (!best) {
      break;
    }
    usedSongIds.add(best.song.id);
    selected.push(best);
  }

  return selected.sort((left, right) => left.t - right.t);
};

const buildCueCandidates = (
  songs: Song[],
  strokes: GraphPoint[][],
  getPosition: PositionResolver,
  proximityThreshold: number
): PathCandidate[] =>
  songs
    .map((song) => {
      const position = getPosition(song);
      const { distance, t } = distanceAndParameterOnStrokes(position, strokes);
      return { song, distance, t };
    })
    .filter((entry) => entry.distance <= proximityThreshold)
    .sort((left, right) => left.t - right.t || left.distance - right.distance);

const finalizeCueSelection = (candidates: PathCandidate[], cueLength: number): PathCandidate[] => {
  const deduped = dedupeConsecutiveCandidates(candidates);
  return cueLength > 0 ? sampleCandidatesEvenly(deduped, cueLength) : deduped;
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
  layoutConfig: LayoutConfig,
  cueLength = 0
): GeneratedCue | null => {
  if (stroke.length < 2) {
    return null;
  }

  const candidates = buildCueCandidates(songs, [stroke], getPosition, proximityThreshold);
  if (candidates.length === 0) {
    return null;
  }

  const selected = finalizeCueSelection(candidates, cueLength);
  if (selected.length === 0) {
    return null;
  }

  const seed = selected.reduce((sum, entry, index) => sum + entry.song.id.charCodeAt(0) * (index + 1), 0);

  return {
    seed,
    songs: selected.map((entry) => entry.song),
    stroke,
    layoutConfig,
    pathThreshold: proximityThreshold,
    cueLength: cueLength > 0 ? cueLength : undefined,
  };
};

export const generateCueFromStrokes = (
  songs: Song[],
  strokes: GraphPoint[][],
  getPosition: PositionResolver,
  proximityThreshold: number,
  layoutConfig: LayoutConfig,
  cueLength = 0
): GeneratedCue | null => {
  const drawableStrokes = strokes.filter((stroke) => stroke.length >= 2);
  if (drawableStrokes.length === 0) {
    return null;
  }

  const candidates = buildCueCandidates(songs, strokes, getPosition, proximityThreshold);
  if (candidates.length === 0) {
    return null;
  }

  const selected = finalizeCueSelection(candidates, cueLength);
  if (selected.length === 0) {
    return null;
  }

  const flatStroke = strokes.flat();
  const seed = selected.reduce((sum, entry, index) => sum + entry.song.id.charCodeAt(0) * (index + 1), 0);

  return {
    seed,
    songs: selected.map((entry) => entry.song),
    stroke: flatStroke,
    layoutConfig,
    pathThreshold: proximityThreshold,
    cueLength: cueLength > 0 ? cueLength : undefined,
  };
};
