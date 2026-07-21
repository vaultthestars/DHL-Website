import { useEffect, useState } from "react";
import { Viewport } from "./useWindowSize";

export const useStableViewport = (viewport: Viewport, delayMs = 200): Viewport => {
  const [stableViewport, setStableViewport] = useState(viewport);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      setStableViewport(viewport);
    }, delayMs);

    return () => window.clearTimeout(timeout);
  }, [viewport.width, viewport.height, delayMs, viewport]);

  return stableViewport;
};
