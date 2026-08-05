import { useState } from "react";
import {
  CHART_ROWS,
  CHORD_QUALITIES,
  chartPositionToChord,
  type ChordSelection,
} from "../lib/accordionGrid";

export const ChordChartPicker = ({
  selectedChord,
  disabled,
  onSelect,
}: {
  selectedChord?: ChordSelection | null;
  disabled?: boolean;
  onSelect: (row: number, col: number) => void;
}) => {
  const [hovered, setHovered] = useState<{ row: number; col: number } | null>(null);

  return (
    <div className="casserole-chart-picker">
      <p className="casserole-help">
        Pick the opening chord on the accordion chart. Everyone else will navigate blind from here.
      </p>
      <div className="casserole-chart-grid">
        <div className="casserole-chart-header" aria-hidden>
          {CHORD_QUALITIES.map((quality) => (
            <span key={quality}>{quality}</span>
          ))}
        </div>
        {CHART_ROWS.map((rowOffset) => (
          <div key={rowOffset} className="casserole-chart-row">
            <span className="casserole-chart-row-label">
              {chartPositionToChord(rowOffset, 2).root}
            </span>
            {CHORD_QUALITIES.map((_, col) => {
              const chord = chartPositionToChord(rowOffset, col);
              const isSelected =
                selectedChord?.row === chord.row && selectedChord?.col === chord.col;
              const isHovered = hovered?.row === rowOffset && hovered?.col === col;
              return (
                <button
                  key={`${rowOffset}-${col}`}
                  type="button"
                  className={`casserole-chart-cell ${isSelected ? "casserole-chart-cell--selected" : ""} ${isHovered && !disabled ? "casserole-chart-cell--hover" : ""}`}
                  disabled={disabled}
                  aria-pressed={isSelected}
                  onMouseEnter={() => setHovered({ row: rowOffset, col })}
                  onMouseLeave={() => setHovered(null)}
                  onClick={() => onSelect(rowOffset, col)}
                >
                  {chord.label}
                </button>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
};
