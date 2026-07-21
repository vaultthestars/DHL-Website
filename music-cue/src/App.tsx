import { MusicCueTool } from "./components/MusicCueTool";
import { SpotifyCallback } from "./components/SpotifyCallback";
import { Win95Taskbar } from "./components/Win95Taskbar";

const WINDOW_TITLE = "Music Cue";

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

const TitleBar = ({ showHomeButton }: { showHomeButton: boolean }) => (
  <div className="win95-titlebar">
    <div className="win95-titlebar-leading">
      {showHomeButton ? (
        <button type="button" className="win95-home-btn" onClick={goToSiteHome}>
          ← Home
        </button>
      ) : null}
      <span className="win95-titlebar-text">{WINDOW_TITLE}</span>
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

  if (window.location.pathname.endsWith("/spotify/callback")) {
    return (
      <div className={`win95-app ${embeddedClass}`}>
        <div className="win95-workspace">
          <div className="win95-shell">
            <TitleBar showHomeButton={showHomeButton} />
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
          <TitleBar showHomeButton={showHomeButton} />
          <div className="win95-client">
            <MusicCueTool />
          </div>
        </div>
      </div>
      <Win95Taskbar windowTitle={WINDOW_TITLE} />
    </div>
  );
};
