import React from "react";
import { arrsize, shuffleConwayGrid } from "../lib/conway";
import { getcolorstring } from "../Homepage";

type MobileConwayGridProps = {
  cellvals: number[];
  onShuffle: () => void;
};

const DISPLAY_SIZE = 120;
const cellSize = DISPLAY_SIZE / arrsize;

export const MobileConwayGrid: React.FC<MobileConwayGridProps> = ({ cellvals, onShuffle }) => (
  <div className="mobile-conway-wrap">
    <p className="mobile-conway__label">Tap the simulation to randomize</p>
    <svg
      className="mobile-conway"
      viewBox={`0 0 ${DISPLAY_SIZE} ${DISPLAY_SIZE}`}
      role="img"
      aria-label="Conway's Game of Life simulation"
      onClick={onShuffle}
    >
      {cellvals.map((cell, index) => {
        if (cell <= 0) {
          return null;
        }
        return (
          <rect
            key={"mobile-cell-" + index.toString()}
            x={(index % arrsize) * cellSize}
            y={Math.floor(index / arrsize) * cellSize}
            width={cellSize}
            height={cellSize}
            fill={getcolorstring({ h: (360 * index) / (arrsize * arrsize), s: 0.6, v: 0.5 * cell })}
          />
        );
      })}
    </svg>
  </div>
);
