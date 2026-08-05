import { useState } from "react";
import { MusicCueTool } from "./components/MusicCueTool";
import { SpotifyCallback } from "./components/SpotifyCallback";
import { Win95Taskbar } from "./components/Win95Taskbar";
import { MUSIC_APPS, switchMusicApp, type MusicAppId } from "./lib/musicApps";

const WINDOW_TITLE = "Music Cue";
const CURRENT_APP_ID: MusicAppId = "music-cue";

const isEmbeddedApp = (): boolean => {
  try {
    return window.self !== window.top;
  } catch {
    return true;
  }
};

const goToSiteHome = (): void => {
  try {
    if (window.self !== window.top && window.top) {
      window.top.postMessage({ type: "dhl-music-cue-go-home" }, window.location.origin);
      return;
    }
  } catch {
    // Fall through to direct navigation.
  }
  window.location.href = "/";
};

const MusicAppSwitcher = ({ welcomeName }: { welcomeName: string | null }) => {
  const [open, setOpen] = useState(false);
  const current = MUSIC_APPS.find((app) => app.id === CURRENT_APP_ID) ?? MUSIC_APPS[0];

  return (
    <div className="win95-app-switcher">
      <button
        type="button"
        className="win95-app-switcher-btn"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        {current.label} ▾
      </button>
      {open ? (
        <ul className="win95-app-switcher-menu" role="listbox">
          {MUSIC_APPS.map((app) => (
            <li key={app.id}>
              <button
                type="button"
                role="option"
                aria-selected={app.id === CURRENT_APP_ID}
                className={app.id === CURRENT_APP_ID ? "is-active" : ""}
                onClick={() => {
                  setOpen(false);
                  if (app.id !== CURRENT_APP_ID) {
                    switchMusicApp(app.id);
                  }
                }}
              >
                {app.label}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      {welcomeName ? (
        <span className="win95-titlebar-welcome"> · Welcome, {welcomeName}</span>
      ) : null}
    </div>
  );
};

const TitleBar = ({
  showHomeButton,
  welcomeName,
}: {
  showHomeButton: boolean;
  welcomeName: string | null;
}) => (
  <div className="win95-titlebar">
    <div className="win95-titlebar-leading">
      {showHomeButton ? (
        <button type="button" className="win95-home-btn" onClick={goToSiteHome}>
          ← Home
        </button>
      ) : null}
      <MusicAppSwitcher welcomeName={welcomeName} />
    </div>
    <div className="win95-titlebar-buttons" aria-hidden>
      <button type="button" className="win95-chrome-btn" tabIndex={-1}>
        _
      </button>
      <button type="button" className="win95-chrome-btn" tabIndex={-1}>
        □
      </button>
      <button type="button" className="win95-chrome-btn" tabIndex={-1}>
        ×
      </button>
    </div>
  </div>
);

export const App = () => {
  const embeddedClass = isEmbeddedApp() ? "win95-embedded" : "";
  const showHomeButton = isEmbeddedApp();
  const [welcomeName, setWelcomeName] = useState<string | null>(null);

  if (window.location.pathname.endsWith("/spotify/callback")) {
    return (
      <div className={`win95-app ${embeddedClass}`}>
        <div className="win95-workspace">
          <div className="win95-shell">
            <TitleBar showHomeButton={showHomeButton} welcomeName={welcomeName} />
            <div className="win95-client">
              <SpotifyCallback />
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`win95-app ${embeddedClass}`}>
      <div className="win95-workspace">
        <div className="win95-shell">
          <TitleBar showHomeButton={showHomeButton} welcomeName={welcomeName} />
          <div className="win95-client">
            <MusicCueTool onWelcomeNameChange={setWelcomeName} />
          </div>
        </div>
      </div>
      <Win95Taskbar windowTitle={WINDOW_TITLE} />
    </div>
  );
};
