/** Chord Casserole is web-only; treat local `vite` dev the same as the embedded build. */
export const isWebDeployment =
  import.meta.env.VITE_APP_MODE === "web" || import.meta.env.DEV;

/** Local testing: `?dev=1` allows starting solo (one measure) without a second player. */
export const isDevSoloMode = (): boolean => {
  if (!import.meta.env.DEV) {
    return false;
  }
  try {
    return new URLSearchParams(window.location.search).get("dev") === "1";
  } catch {
    return false;
  }
};

export const minPlayersToBegin = (): number => (isDevSoloMode() ? 1 : 2);

export const playhtmlPathname = (): string => {
  if (typeof window === "undefined") {
    return "/chord-casserole/";
  }
  if (window.location.pathname.includes("/chord-casserole")) {
    return "/chord-casserole/";
  }
  const path = window.location.pathname || "/";
  return path.endsWith("/") ? path : `${path}/`;
};
