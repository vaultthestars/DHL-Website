import { useState } from "react";
import { ChordCasseroleTool } from "./components/ChordCasseroleTool";
import { MUSIC_APPS, switchMusicApp, type MusicAppId } from "./lib/musicApps";

const WINDOW_TITLE = "Chord Casserole";
const CURRENT_APP_ID: MusicAppId = "chord-casserole";

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

const MusicAppSwitcher = () => {
  const [open, setOpen] = useState(false);
  const current = MUSIC_APPS.find((app) => app.id === CURRENT_APP_ID) ?? MUSIC_APPS[1];

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
    </div>
  );
};

const TitleBar = ({ showHomeButton }: { showHomeButton: boolean }) => (
  <div className="win95-titlebar">
    <div className="win95-titlebar-leading">
      {showHomeButton ? (
        <button type="button" className="win95-home-btn" onClick={goToSiteHome}>
          ← Home
        </button>
      ) : null}
      <MusicAppSwitcher />
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

  return (
    <div className={`win95-app ${embeddedClass}`}>
      <div className="win95-workspace">
        <div className="win95-shell">
          <TitleBar showHomeButton={showHomeButton} />
          <div className="win95-client">
            <ChordCasseroleTool />
          </div>
        </div>
      </div>
    </div>
  );
};
