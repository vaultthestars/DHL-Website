import type { ChordSelection, Direction } from "./accordionGrid";

export const BEAT_COUNT = 16;
export const PITCH_ROW_COUNT = 12;
export const DRUM_ROW_COUNT = 3;
export const GRID_ROW_COUNT = PITCH_ROW_COUNT + DRUM_ROW_COUNT;

export type GamePhase = "lobby" | "playing" | "playback";

export type NoteGrid = boolean[][];

export type SongPart = {
  playerId: string;
  playerName: string;
  direction: Direction | null;
  chord: ChordSelection;
  line1: string;
  line2: string;
  notes: NoteGrid;
};

export type ActiveTurnDraft = {
  direction: Direction | null;
  directionChosen: boolean;
  line1: string;
  line2: string;
  notes: NoteGrid;
};

export type CasseroleGameState = {
  phase: GamePhase;
  /** Bumped when a round starts so clients can tell a fresh game from stale room data. */
  sessionEpoch: number;
  startedBy: string | null;
  /** Players who clicked Join in the lobby for the upcoming round. */
  joinedPlayerIds: string[];
  turnOrder: string[];
  currentTurnIndex: number;
  turnStartedAt: number | null;
  parts: SongPart[];
  chordPosition: { row: number; col: number } | null;
  activeDraft: ActiveTurnDraft | null;
  playbackIndex: number;
  /** Playback tempo; exposed in the UI as "speed". */
  playbackSpeed: number;
};

export const createEmptyNoteGrid = (): NoteGrid =>
  Array.from({ length: GRID_ROW_COUNT }, () => Array.from({ length: BEAT_COUNT }, () => false));

export const createEmptyDraft = (): ActiveTurnDraft => ({
  direction: null,
  directionChosen: false,
  line1: "",
  line2: "",
  notes: createEmptyNoteGrid(),
});

export const resetActiveTurnDraft = (draft: ActiveTurnDraft): void => {
  draft.direction = null;
  draft.directionChosen = false;
  draft.line1 = "";
  draft.line2 = "";
  draft.notes = createEmptyNoteGrid();
};

export const createInitialGameState = (): CasseroleGameState => ({
  phase: "lobby",
  sessionEpoch: 0,
  startedBy: null,
  joinedPlayerIds: [],
  turnOrder: [],
  currentTurnIndex: 0,
  turnStartedAt: null,
  parts: [],
  chordPosition: null,
  activeDraft: null,
  playbackIndex: 0,
  playbackSpeed: DEFAULT_PLAYBACK_SPEED,
});

export const TURN_SECONDS = 60;

export const DEFAULT_PLAYBACK_SPEED = 240;
export const MIN_PLAYBACK_SPEED = 1;
export const MAX_PLAYBACK_SPEED = 2000;

export const normalizePlaybackSpeed = (value: number | undefined | null): number => {
  if (value === undefined || value === null || !Number.isFinite(value)) {
    return DEFAULT_PLAYBACK_SPEED;
  }
  return Math.min(MAX_PLAYBACK_SPEED, Math.max(MIN_PLAYBACK_SPEED, Math.round(value)));
};

export const PLAYHTML_GAME_KEY = "chord-casserole-game-v4";
export const PLAYHTML_ROOM = "dhl-chord-casserole-v1";
export const SESSION_PRESENCE_CHANNEL = "session";

export type SessionPresenceData = {
  displayName: string;
};
