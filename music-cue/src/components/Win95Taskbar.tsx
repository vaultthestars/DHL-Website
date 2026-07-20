import { useEffect, useState } from "react";

const formatWin95Clock = (date: Date): string => {
  let hours = date.getHours();
  const minutes = date.getMinutes();
  const ampm = hours >= 12 ? "PM" : "AM";
  hours %= 12;
  if (hours === 0) {
    hours = 12;
  }
  const minuteText = minutes < 10 ? `0${minutes}` : String(minutes);
  return `${hours}:${minuteText} ${ampm}`;
};

type Win95TaskbarProps = {
  windowTitle: string;
};

export const Win95Taskbar = ({ windowTitle }: Win95TaskbarProps) => {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const tick = () => setNow(new Date());
    tick();
    const intervalId = window.setInterval(tick, 1000);
    return () => window.clearInterval(intervalId);
  }, []);

  return (
    <footer className="win95-taskbar" role="contentinfo" aria-label="Taskbar">
      <button type="button" className="win95-start-btn" tabIndex={-1} aria-hidden>
        <span className="win95-start-flag" aria-hidden />
        Start
      </button>
      <div className="win95-taskbar-tasks">
        <button type="button" className="win95-task-btn win95-pressed" tabIndex={-1} aria-hidden>
          {windowTitle}
        </button>
      </div>
      <div className="win95-tray" aria-label="System tray">
        <time className="win95-tray-clock" dateTime={now.toISOString()} aria-live="polite">
          {formatWin95Clock(now)}
        </time>
      </div>
    </footer>
  );
};
