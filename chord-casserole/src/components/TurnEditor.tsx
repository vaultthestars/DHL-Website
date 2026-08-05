import { useCallback, useEffect, useMemo } from "react";
import {
  moveChord,
  positionToChord,
  START_CHORD_POSITION,
  type ChordSelection,
  type Direction,
} from "../lib/accordionGrid";
import {
  createEmptyDraft,
  TURN_SECONDS,
  type ActiveTurnDraft,
  type CasseroleGameState,
} from "../lib/gameTypes";
import { ChordChartPicker } from "./ChordChartPicker";
import { DirectionPicker } from "./DirectionPicker";
import { NoteGridEditor } from "./NoteGridEditor";
import { TurnTimer } from "./TurnTimer";

export const TurnEditor = ({
  gameState,
  isMyTurn,
  readOnly,
  currentChord,
  previousLine,
  draft,
  onDraftChange,
  onPickOpeningChord,
  onPickDirection,
  onDone,
  onSkipToSong,
  onResetGame,
  timedOut,
}: {
  gameState: CasseroleGameState;
  isMyTurn: boolean;
  readOnly: boolean;
  currentChord: ChordSelection | null;
  previousLine: string;
  draft: ActiveTurnDraft;
  onDraftChange: (draft: ActiveTurnDraft) => void;
  onPickOpeningChord: (row: number, col: number) => void;
  onPickDirection: (direction: Direction) => void;
  onDone: () => void;
  onSkipToSong?: () => void;
  onResetGame?: () => void;
  timedOut: boolean;
}) => {
  const turnPlayerId = gameState.turnOrder[gameState.currentTurnIndex];
  const isFirstTurn = gameState.parts.length === 0;
  const showChart = isFirstTurn && !draft.directionChosen;
  const showDirections = !isFirstTurn && !draft.directionChosen;
  const canEditLyricsAndNotes = draft.directionChosen && (isMyTurn || readOnly);
  const selectedOpeningChord = gameState.chordPosition
    ? positionToChord(gameState.chordPosition)
    : null;

  useEffect(() => {
    if (!timedOut || !isMyTurn || !draft.directionChosen) {
      return;
    }
    onDone();
  }, [draft.directionChosen, isMyTurn, onDone, timedOut]);

  const chordForGrid = useMemo(() => {
    if (currentChord) {
      return currentChord;
    }
    if (draft.directionChosen && gameState.chordPosition) {
      return positionToChord(gameState.chordPosition);
    }
    return positionToChord(START_CHORD_POSITION);
  }, [currentChord, draft.directionChosen, gameState.chordPosition]);

  return (
    <div className="casserole-screen casserole-turn">
      <div className="casserole-turn-header">
        <div>
          <h1 className="casserole-title">
            {isMyTurn ? "Your turn" : `${gameState.turnOrder.length ? "Watching" : "Waiting"}`}
          </h1>
          <p className="casserole-muted">
            {turnPlayerId ? `Player ${gameState.currentTurnIndex + 1} of ${gameState.turnOrder.length}` : ""}
          </p>
        </div>
        <TurnTimer
          active={gameState.phase === "playing" && Boolean(gameState.turnStartedAt)}
          turnStartedAt={gameState.turnStartedAt}
          durationSeconds={TURN_SECONDS}
        />
        {onResetGame ? (
          <button type="button" className="casserole-secondary-btn" onClick={onResetGame}>
            Reset room
          </button>
        ) : null}
        {onSkipToSong && gameState.parts.length > 0 ? (
          <button type="button" className="casserole-secondary-btn" onClick={onSkipToSong}>
            Skip to song
          </button>
        ) : null}
      </div>

      {showChart ? (
        isMyTurn ? (
          <ChordChartPicker
            selectedChord={selectedOpeningChord}
            onSelect={onPickOpeningChord}
          />
        ) : (
          <div className="casserole-waiting-pick">
            <p className="casserole-muted">
              Waiting for the current player to pick the opening chord…
            </p>
            <ChordChartPicker
              selectedChord={selectedOpeningChord}
              disabled
              onSelect={() => {}}
            />
          </div>
        )
      ) : null}

      {showDirections ? (
        isMyTurn ? (
          <DirectionPicker
            selectedDirection={draft.direction}
            onSelect={onPickDirection}
          />
        ) : (
          <div className="casserole-waiting-pick">
            <p className="casserole-muted">
              Waiting for the current player to choose a direction…
            </p>
            <DirectionPicker
              selectedDirection={draft.direction}
              disabled
              onSelect={() => {}}
            />
          </div>
        )
      ) : null}

      {canEditLyricsAndNotes ? (
        <>
          <div className="casserole-chord-banner">
            Current chord: <strong>{chordForGrid.label}</strong>
          </div>

          <div className="casserole-lyrics-block">
            <p className="casserole-lyric-prompt">Rhyme with this line:</p>
            <p className="casserole-lyric-line casserole-lyric-line--prompt">
              {previousLine || "(nothing yet — write anything)"}
            </p>

            <label className="casserole-field">
              <span>Your rhyming line</span>
              <input
                type="text"
                value={draft.line1}
                readOnly={readOnly || !isMyTurn}
                maxLength={120}
                onChange={(event) => onDraftChange({ ...draft, line1: event.target.value })}
              />
            </label>

            <label className="casserole-field">
              <span>Your free line (next person rhymes with this)</span>
              <input
                type="text"
                value={draft.line2}
                readOnly={readOnly || !isMyTurn}
                maxLength={120}
                onChange={(event) => onDraftChange({ ...draft, line2: event.target.value })}
              />
            </label>
          </div>

          <NoteGridEditor
            notes={draft.notes}
            chord={chordForGrid}
            readOnly={readOnly || !isMyTurn}
            onChange={(notes) => onDraftChange({ ...draft, notes })}
          />

          {isMyTurn ? (
            <button type="button" className="casserole-primary-btn" onClick={onDone}>
              Done
            </button>
          ) : (
            <p className="casserole-muted">Spectating — you&apos;ll see their edits live.</p>
          )}
        </>
      ) : null}
    </div>
  );
};

export const resolveCurrentChord = (gameState: CasseroleGameState): ChordSelection | null => {
  if (gameState.chordPosition) {
    return positionToChord(gameState.chordPosition);
  }
  return null;
};

export const applyDirection = (
  gameState: CasseroleGameState,
  direction: Direction
): { chordPosition: { row: number; col: number }; chord: ChordSelection } => {
  const base = gameState.chordPosition ?? START_CHORD_POSITION;
  const chord = moveChord(base, direction);
  return {
    chordPosition: { row: chord.row, col: chord.col },
    chord,
  };
};

export const buildDraftAfterDirection = (
  draft: ActiveTurnDraft,
  direction: Direction | null
): ActiveTurnDraft => ({
  ...draft,
  direction,
  directionChosen: true,
});

export const createFreshDraft = (): ActiveTurnDraft => createEmptyDraft();
