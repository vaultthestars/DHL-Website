export type MusicAppId = "music-cue" | "chord-casserole";

export const MUSIC_APPS: { id: MusicAppId; label: string; path: string }[] = [
  { id: "music-cue", label: "Music Cue", path: "/music-cue/" },
  { id: "chord-casserole", label: "Chord Casserole", path: "/chord-casserole/" },
];

const isEmbeddedInSite = (): boolean => {
  try {
    return window.self !== window.top;
  } catch {
    return true;
  }
};

const devServerUrlForApp = (appId: MusicAppId): string | null => {
  const port = window.location.port;
  const host = window.location.hostname;
  if (port === "5175" && appId === "music-cue") {
    return `http://${host}:5174/`;
  }
  if (port === "5174" && appId === "chord-casserole") {
    return `http://${host}:5175/`;
  }
  return null;
};

export const switchMusicApp = (appId: MusicAppId): void => {
  if (appId !== "music-cue" && appId !== "chord-casserole") {
    return;
  }

  if (isEmbeddedInSite()) {
    try {
      window.top?.postMessage({ type: "dhl-music-app-switch", appId }, window.location.origin);
      return;
    } catch {
      // Fall through to direct navigation.
    }
  }

  const devUrl = devServerUrlForApp(appId);
  if (devUrl) {
    window.location.href = devUrl;
    return;
  }

  const target = MUSIC_APPS.find((app) => app.id === appId);
  if (target) {
    window.location.href = target.path;
  }
};
