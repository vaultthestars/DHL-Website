import React from "react";
import { pagesetter, reactvar } from "../App";
import { getcolorstring } from "../Homepage";
import { Viewport } from "../hooks/useWindowSize";
import { PageHeader } from "../components/PageHeader";
import "./subpages.css";

const marginwidth = 75;

type point = { x: number; y: number };

export default function musicpage(
  _timer: number,
  setPage: pagesetter,
  _mouse: point,
  _extravars: reactvar[],
  viewport: Viewport
) {
  const contentHeight = viewport.height - marginwidth;

  return (
    <div key="pagewrapper" className="pagewrapper">
      <div className="desktop-only">
      <svg className="animsvg" fill="true" width="100%" height={marginwidth} aria-label="music page header">
        <rect
          key="Music header"
          x={0}
          y={0}
          width={viewport.width}
          height={marginwidth}
          fill={getcolorstring({ h: 220, s: 0.6, v: 1 })}
          stroke="hsl(0 0% 0%)"
          strokeWidth={1}
        />
        <text
          key="Musictitle"
          textAnchor="middle"
          dominantBaseline="central"
          fill="hsl(0 0% 0%)"
          fontFamily="Helvetica"
          fontWeight="bold"
          fontSize={40}
          letterSpacing={20}
          x={viewport.width / 2}
          y={marginwidth / 2}
        >
          MUSIC
        </text>
        <image
          x="14"
          y="14"
          width="100"
          height="50"
          href="https://i.ibb.co/9nchptY/Screenshot-2024-01-14-at-3-00-09-PM.png"
          style={{ cursor: "pointer" }}
          onClick={() => setPage(0)}
        />
      </svg>
      <iframe
        src="/music-cue/"
        title="Music Cue"
        style={{
          width: "100%",
          height: `${contentHeight}px`,
          border: "none",
          display: "block",
        }}
      />
      </div>
      <div className="mobile-only mobile-page">
        <PageHeader title="MUSIC" setPage={setPage} hue={220} />
        <iframe
          className="mobile-music-frame"
          src="/music-cue/"
          title="Music Cue"
        />
      </div>
    </div>
  );
}
