/** Roots ordered by perfect fifths going up the accordion chart (C at center). */
export const FIFTHS_ROOTS = [
  "C",
  "G",
  "D",
  "A",
  "E",
  "B",
  "F#",
  "C#",
  "G#",
  "D#",
  "A#",
  "F",
] as const;

export const CHORD_QUALITIES = ["dim", "7th", "min", "Maj"] as const;

export type ChordQuality = (typeof CHORD_QUALITIES)[number];
export type Direction = "n" | "ne" | "se" | "s" | "sw" | "nw";

export type ChordPosition = {
  row: number;
  col: number;
};

export type ChordSelection = ChordPosition & {
  root: string;
  quality: ChordQuality;
  label: string;
};

const DIRECTION_DELTAS: Record<Direction, [number, number]> = {
  n: [1, 0],
  ne: [1, 1],
  se: [-1, 1],
  s: [-1, 0],
  sw: [-1, -1],
  nw: [1, -1],
};

export const DIRECTION_LABELS: Record<Direction, string> = {
  n: "Up",
  ne: "Up-right",
  se: "Down-right",
  s: "Down",
  sw: "Down-left",
  nw: "Up-left",
};

export const DIRECTION_ORDER: Direction[] = ["n", "ne", "se", "s", "sw", "nw"];

const wrap = (value: number, size: number): number => ((value % size) + size) % size;

export const START_CHORD_POSITION: ChordPosition = { row: 0, col: 2 };

export const positionToChord = (position: ChordPosition): ChordSelection => {
  const row = wrap(position.row, FIFTHS_ROOTS.length);
  const col = wrap(position.col, CHORD_QUALITIES.length);
  const root = FIFTHS_ROOTS[row];
  const quality = CHORD_QUALITIES[col];
  const suffix =
    quality === "Maj" ? "" : quality === "min" ? "m" : quality === "7th" ? "7" : "dim";
  return {
    row,
    col,
    root,
    quality,
    label: `${root}${suffix}`,
  };
};

export const moveChord = (position: ChordPosition, direction: Direction): ChordSelection => {
  const [rowDelta, colDelta] = DIRECTION_DELTAS[direction];
  return positionToChord({
    row: position.row + rowDelta,
    col: position.col + colDelta,
  });
};

const ROOT_PITCH_CLASS: Record<string, number> = {
  C: 0,
  "C#": 1,
  Db: 1,
  D: 2,
  "D#": 3,
  Eb: 3,
  E: 4,
  F: 5,
  "F#": 6,
  Gb: 6,
  G: 7,
  "G#": 8,
  Ab: 8,
  A: 9,
  "A#": 10,
  Bb: 10,
  B: 11,
};

const PITCH_CLASS_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"] as const;

/** Grid rows 0–11 are chromatic from C (row 0) through B (row 11). */
export const pitchRowToName = (row: number): string => PITCH_CLASS_NAMES[wrap(row, 12)];

/** Map visual row (high notes at top) to stored grid row. */
export const displayRowToStorageRow = (displayRow: number, pitchRowCount = 12): number =>
  displayRow < pitchRowCount ? pitchRowCount - 1 - displayRow : displayRow;

/** Map stored grid row to visual row (high notes at top). */
export const storageRowToDisplayRow = (storageRow: number, pitchRowCount = 12): number =>
  storageRow < pitchRowCount ? pitchRowCount - 1 - storageRow : storageRow;

export const chordToneRows = (chord: ChordSelection): number[] => {
  const rootPc = ROOT_PITCH_CLASS[chord.root] ?? 0;
  const pcs = new Set<number>();

  if (chord.quality === "Maj") {
    [0, 4, 7].forEach((interval) => pcs.add(wrap(rootPc + interval, 12)));
  } else if (chord.quality === "min") {
    [0, 3, 7].forEach((interval) => pcs.add(wrap(rootPc + interval, 12)));
  } else if (chord.quality === "7th") {
    [0, 4, 10].forEach((interval) => pcs.add(wrap(rootPc + interval, 12)));
  } else {
    [0, 3, 6, 9].forEach((interval) => pcs.add(wrap(rootPc + interval, 12)));
  }

  return [...pcs].sort((left, right) => left - right);
};

/** Visible chart rows for the first player's full accordion picker. */
export const CHART_ROWS = [-4, -3, -2, -1, 0, 1, 2, 3, 4] as const;

export const chartPositionToChord = (rowOffset: number, col: number): ChordSelection =>
  positionToChord({ row: rowOffset, col });
