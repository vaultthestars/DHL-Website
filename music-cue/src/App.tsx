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

export const App = () => {
  const embeddedClass = isEmbeddedApp() ? "win95-embedded" : "";

  if (window.location.pathname.endsWith("/spotify/callback")) {
    return (
      <div className={`win95-app ${embeddedClass}`}>
        <div className="win95-workspace">
          <div className="win95-shell">
            <div className="win95-titlebar">
              <span className="win95-titlebar-text">{WINDOW_TITLE}</span>
            </div>
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
        <div className="win95-titlebar">
          <span className="win95-titlebar-text">{WINDOW_TITLE}</span>
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
        <div className="win95-client">
          <MusicCueTool />
        </div>
      </div>
    </div>
    <Win95Taskbar windowTitle={WINDOW_TITLE} />
  </div>
  );
};
