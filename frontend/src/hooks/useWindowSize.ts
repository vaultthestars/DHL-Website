import { useEffect, useState } from "react";

export type Viewport = {
  width: number;
  height: number;
};

export const useWindowSize = (): Viewport => {
  const [viewport, setViewport] = useState<Viewport>(() => ({
    width: window.innerWidth,
    height: window.innerHeight,
  }));

  useEffect(() => {
    let frame = 0;
    const onResize = () => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => {
        setViewport({ width: window.innerWidth, height: window.innerHeight });
      });
    };
    window.addEventListener("resize", onResize);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("resize", onResize);
    };
  }, []);

  return viewport;
};

export const MOBILE_BREAKPOINT = 768;

export const isMobileViewport = (width: number): boolean => width < MOBILE_BREAKPOINT;
