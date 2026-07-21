import React from "react";
import { pagesetter, reactvar } from "../App";
import { Viewport } from "../hooks/useWindowSize";
import "./subpages.css";

type point = { x: number; y: number };

export default function musicpage(
  _timer: number,
  _setPage: pagesetter,
  _mouse: point,
  _extravars: reactvar[],
  _viewport: Viewport
) {
  const musicCueSrc = (() => {
    const spotify = new URLSearchParams(window.location.search).get("spotify");
    return spotify ? `/music-cue/?spotify=${encodeURIComponent(spotify)}` : "/music-cue/";
  })();

  return (
    <div key="pagewrapper" className="pagewrapper pagewrapper--music">
      <iframe className="music-cue-embed-frame" src={musicCueSrc} title="Music Cue" />
    </div>
  );
}
