import { MusicCueTool } from "./components/MusicCueTool";
import { Win95Taskbar } from "./components/Win95Taskbar";

const WINDOW_TITLE = "Music Cue";

export const App = () => (
  <div className="win95-app">
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
