import { BEAT_COUNT, GRID_ROW_COUNT, PITCH_ROW_COUNT, type NoteGrid } from "../lib/gameTypes";
import {
  chordToneRows,
  displayRowToStorageRow,
  pitchRowToName,
  type ChordSelection,
} from "../lib/accordionGrid";

const DRUM_LABELS = ["Bass", "Snare", "Hi-hat"];

export const NoteGridEditor = ({
  notes,
  chord,
  onChange,
  readOnly,
  playbackBeat = null,
}: {
  notes: NoteGrid;
  chord: ChordSelection;
  onChange?: (next: NoteGrid) => void;
  readOnly?: boolean;
  playbackBeat?: number | null;
}) => {
  const highlightedPitchClasses = new Set(chordToneRows(chord));

  const toggleCell = (displayRow: number, beat: number) => {
    if (readOnly || !onChange) {
      return;
    }
    const storageRow = displayRowToStorageRow(displayRow, PITCH_ROW_COUNT);
    const next = notes.map((gridRow, rowIndex) =>
      rowIndex === storageRow
        ? gridRow.map((active, beatIndex) => (beatIndex === beat ? !active : active))
        : gridRow
    );
    onChange(next);
  };

  return (
    <div className="casserole-note-grid-wrap">
      <div className="casserole-note-grid">
        {Array.from({ length: GRID_ROW_COUNT }, (_, displayRow) => {
          const storageRow = displayRowToStorageRow(displayRow, PITCH_ROW_COUNT);
          const isDrumRow = displayRow >= PITCH_ROW_COUNT;
          const pitchClass = isDrumRow ? null : storageRow;
          return (
            <div
              key={displayRow}
              className={`casserole-note-row ${isDrumRow ? "casserole-note-row--drum" : ""}`}
            >
              <span className="casserole-note-row-label">
                {isDrumRow
                  ? DRUM_LABELS[displayRow - PITCH_ROW_COUNT]
                  : pitchRowToName(storageRow)}
              </span>
              {Array.from({ length: BEAT_COUNT }, (_, beat) => {
                const active = notes[storageRow]?.[beat] ?? false;
                const highlighted =
                  pitchClass !== null && highlightedPitchClasses.has(pitchClass);
                const playing = playbackBeat === beat;
                return (
                  <button
                    key={`${displayRow}-${beat}`}
                    type="button"
                    className={[
                      "casserole-note-cell",
                      active ? "casserole-note-cell--on" : "",
                      highlighted ? "casserole-note-cell--chord-tone" : "",
                      playing ? "casserole-note-cell--playing" : "",
                    ]
                      .filter(Boolean)
                      .join(" ")}
                    disabled={readOnly}
                    onClick={() => toggleCell(displayRow, beat)}
                    aria-label={`${isDrumRow ? DRUM_LABELS[displayRow - PITCH_ROW_COUNT] : pitchRowToName(storageRow)} beat ${beat + 1}`}
                  />
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
};
