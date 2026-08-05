import { useState } from "react";
import { DIRECTION_LABELS, DIRECTION_ORDER, type Direction } from "../lib/accordionGrid";

const DIRECTION_COLORS: Record<Direction, string> = {
  n: "#4a90d9",
  ne: "#7b68ee",
  se: "#50c878",
  s: "#f4a460",
  sw: "#e06c75",
  nw: "#c678dd",
};

export const DirectionPicker = ({
  selectedDirection,
  onSelect,
  disabled,
}: {
  selectedDirection?: Direction | null;
  onSelect: (direction: Direction) => void;
  disabled?: boolean;
}) => {
  const [hovered, setHovered] = useState<Direction | null>(null);

  return (
    <div className="casserole-direction-picker">
      <p className="casserole-help">Choose a direction on the hidden accordion chart.</p>
      <div className="casserole-direction-wheel" aria-label="Chord direction picker">
        {DIRECTION_ORDER.map((direction) => {
          const isSelected = selectedDirection === direction;
          const isHovered = hovered === direction;
          return (
            <button
              key={direction}
              type="button"
              className={`casserole-direction-btn casserole-direction-btn--${direction} ${isSelected ? "casserole-direction-btn--selected" : ""} ${isHovered && !disabled ? "casserole-direction-btn--hover" : ""}`}
              style={{ backgroundColor: DIRECTION_COLORS[direction] }}
              disabled={disabled}
              aria-pressed={isSelected}
              onMouseEnter={() => setHovered(direction)}
              onMouseLeave={() => setHovered(null)}
              onClick={() => onSelect(direction)}
            >
              {DIRECTION_LABELS[direction]}
            </button>
          );
        })}
      </div>
    </div>
  );
};
