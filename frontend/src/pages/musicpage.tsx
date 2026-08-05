import React, { useEffect, useState } from "react";
import { pagesetter, reactvar } from "../App";
import { Viewport } from "../hooks/useWindowSize";
import "./subpages.css";

type point = { x: number; y: number };

type MusicAppId = "music-cue" | "chord-casserole";

const MUSIC_APP_SOURCES: Record<MusicAppId, string> = {
  "music-cue": "/music-cue/",
  "chord-casserole": "/chord-casserole/",
};

const resolveMusicAppFromUrl = (): MusicAppId => {
  const params = new URLSearchParams(window.location.search);
  const app = params.get("app");
  if (app === "chord-casserole") {
    return "chord-casserole";
  }
  return "music-cue";
};

const setMusicAppInUrl = (appId: MusicAppId): void => {
  const url = new URL(window.location.href);
  if (appId === "music-cue") {
    url.searchParams.delete("app");
  } else {
    url.searchParams.set("app", appId);
  }
  window.history.replaceState({}, "", `${url.pathname}${url.search}`);
};

const MusicPageContent = ({
  setmusictab,
}: {
  setmusictab?: reactvar["setter"];
}) => {
  const [iframeApp, setIframeApp] = useState<MusicAppId>(() => resolveMusicAppFromUrl());

  useEffect(() => {
    const fromUrl = resolveMusicAppFromUrl();
    setIframeApp(fromUrl);
    setmusictab?.(fromUrl === "chord-casserole" ? 1 : 0);
  }, [setmusictab]);

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) {
        return;
      }
      if (event.data?.type === "dhl-music-app-switch") {
        const nextApp = event.data.appId as MusicAppId;
        if (nextApp === "music-cue" || nextApp === "chord-casserole") {
          setIframeApp(nextApp);
          setmusictab?.(nextApp === "chord-casserole" ? 1 : 0);
          setMusicAppInUrl(nextApp);
        }
      }
    };

    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [setmusictab]);

  const iframeSrc = (() => {
    const spotify = new URLSearchParams(window.location.search).get("spotify");
    const base = MUSIC_APP_SOURCES[iframeApp];
    if (iframeApp === "music-cue" && spotify) {
      return `${base}?spotify=${encodeURIComponent(spotify)}`;
    }
    return base;
  })();

  const iframeTitle = iframeApp === "chord-casserole" ? "Chord Casserole" : "Music Cue";

  return (
    <div key="pagewrapper" className="pagewrapper pagewrapper--music">
      <iframe
        key={iframeApp}
        className="music-cue-embed-frame"
        src={iframeSrc}
        title={iframeTitle}
      />
    </div>
  );
};

export default function musicpage(
  _timer: number,
  _setPage: pagesetter,
  _mouse: point,
  extravars: reactvar[],
  _viewport: Viewport
) {
  const setmusictab = extravars[2]?.setter;
  return <MusicPageContent setmusictab={setmusictab} />;
}
