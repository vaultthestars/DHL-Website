import { GeneratedCue, GraphPoint, PositionResolver, Song } from "./types";

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

const createSeededRandom = (seed: number): (() => number) => {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

const pickWeighted = <T>(items: T[], weights: number[], random: () => number): T => {
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  let roll = random() * total;
  for (let i = 0; i < items.length; i += 1) {
    roll -= weights[i];
    if (roll <= 0) {
      return items[i];
    }
  }
  return items[items.length - 1];
};

export const findNearestSong = (
  point: GraphPoint,
  songs: Song[],
  getPosition: PositionResolver
): Song | null => {
  const nearest = findNearestSongToPoint(point, songs, getPosition);
  const position = getPosition(nearest);
  const distance = Math.hypot(point.x - position.x, point.y - position.y);
  return distance <= 36 ? nearest : null;
};

export const findNearestSongToPoint = (
  point: GraphPoint,
  songs: Song[],
  getPosition: PositionResolver
): Song => {
  if (songs.length === 0) {
    throw new Error("Song library is empty.");
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

  return bestSong;
};

export const generateCueFromStroke = (
  songs: Song[],
  stroke: GraphPoint[],
  getPosition: PositionResolver,
  seed: number,
  startId?: string,
  endId?: string
): GeneratedCue | null => {
  if (stroke.length < 2) {
    return null;
  }

  const strokeLength = stroke.reduce((sum, point, index) => {
    if (index === 0) {
      return 0;
    }
    return sum + Math.hypot(point.x - stroke[index - 1].x, point.y - stroke[index - 1].y);
  }, 0);

  const proximityThreshold = Math.max(42, Math.min(110, strokeLength * 0.12));
  const random = createSeededRandom(seed);

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
    .sort((a, b) => a.t - b.t);

  if (candidates.length === 0) {
    return null;
  }

  const windowCount = Math.max(3, Math.min(8, Math.round(strokeLength / 120)));
  const selected: Song[] = [];

  for (let window = 0; window < windowCount; window += 1) {
    const startT = window / windowCount;
    const endT = (window + 1) / windowCount;
    const bucket = candidates.filter((entry) => entry.t >= startT && entry.t <= endT);
    if (bucket.length === 0) {
      continue;
    }

    const weights = bucket.map((entry) => 1 / (entry.distance + 8));
    const picked = pickWeighted(
      bucket.map((entry) => entry.song),
      weights,
      random
    );
    if (selected[selected.length - 1]?.id !== picked.id) {
      selected.push(picked);
    }
  }

  if (selected.length === 0) {
    selected.push(candidates[Math.floor(random() * candidates.length)].song);
  }

  const strokeStartSong = findNearestSongToPoint(stroke[0], songs, getPosition);
  const strokeEndSong = findNearestSongToPoint(stroke[stroke.length - 1], songs, getPosition);
  const pinnedStart = startId ? songs.find((song) => song.id === startId) : undefined;
  const pinnedEnd = endId ? songs.find((song) => song.id === endId) : undefined;
  const startSong = pinnedStart ?? strokeStartSong;
  const endSong = pinnedEnd ?? strokeEndSong;

  if (startSong.id !== selected[0]?.id) {
    selected.unshift(startSong);
  }
  if (endSong.id !== selected[selected.length - 1]?.id) {
    selected.push(endSong);
  }

  const deduped = selected.filter((song, index) => index === 0 || song.id !== selected[index - 1].id);

  if (deduped.length === 1 && startSong.id !== endSong.id) {
    deduped.push(endSong);
  }

  return {
    seed,
    songs: deduped,
    stroke,
    startId: startSong.id,
    endId: endSong.id,
  };
};
