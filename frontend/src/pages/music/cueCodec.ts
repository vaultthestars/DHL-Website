import { EncodedCue, GeneratedCue, GraphPoint, Song } from "./types";

const CUE_PREFIX = "MUSICCUE1.";

const toBase64Url = (value: string): string => {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
};

const fromBase64Url = (value: string): string => {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/");
  const padLength = (4 - (padded.length % 4)) % 4;
  const base64 = padded + "=".repeat(padLength);
  const binary = atob(base64);
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
};

const normalizeStroke = (stroke: GraphPoint[]): [number, number][] =>
  stroke.map((point) => [Number(point.x.toFixed(4)), Number(point.y.toFixed(4))]);

const denormalizeStroke = (stroke: [number, number][]): GraphPoint[] =>
  stroke.map(([x, y]) => ({ x, y }));

export const encodeCue = (cue: GeneratedCue): string => {
  const payload: EncodedCue = {
    v: 1,
    seed: cue.seed,
    songIds: cue.songs.map((song) => song.id),
    stroke: normalizeStroke(cue.stroke),
    startId: cue.startId,
    endId: cue.endId,
  };
  return `${CUE_PREFIX}${toBase64Url(JSON.stringify(payload))}`;
};

export const decodeCue = (raw: string, library: Song[]): GeneratedCue | null => {
  const trimmed = raw.trim();
  if (!trimmed.startsWith(CUE_PREFIX)) {
    return null;
  }

  try {
    const payload = JSON.parse(fromBase64Url(trimmed.slice(CUE_PREFIX.length))) as EncodedCue;
    if (payload.v !== 1 || !Array.isArray(payload.songIds)) {
      return null;
    }

    const byId = new Map(library.map((song) => [song.id, song]));
    const songs = payload.songIds
      .map((id) => byId.get(id))
      .filter((song): song is Song => song !== undefined);

    if (songs.length === 0) {
      return null;
    }

    return {
      seed: payload.seed,
      songs,
      stroke: denormalizeStroke(payload.stroke ?? []),
      startId: payload.startId,
      endId: payload.endId,
    };
  } catch {
    return null;
  }
};
