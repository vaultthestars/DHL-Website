import { useEffect, useState } from "react";

export const TurnTimer = ({
  turnStartedAt,
  durationSeconds,
  active,
}: {
  turnStartedAt: number | null;
  durationSeconds: number;
  active: boolean;
}) => {
  const [remaining, setRemaining] = useState(durationSeconds);

  useEffect(() => {
    if (!active || !turnStartedAt) {
      setRemaining(durationSeconds);
      return;
    }

    const tick = () => {
      const elapsed = (Date.now() - turnStartedAt) / 1000;
      setRemaining(Math.max(0, Math.ceil(durationSeconds - elapsed)));
    };

    tick();
    const interval = window.setInterval(tick, 200);
    return () => window.clearInterval(interval);
  }, [active, durationSeconds, turnStartedAt]);

  if (!active) {
    return null;
  }

  return (
    <div className={`casserole-timer ${remaining <= 10 ? "casserole-timer--urgent" : ""}`}>
      {remaining}s
    </div>
  );
};
