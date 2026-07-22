export const isWebDeployment = import.meta.env.VITE_APP_MODE === "web";

/** macOS Music Cue app (localhost) — not the embedded /music-cue/ website build. */
export const isLocalDesktopApp = !isWebDeployment;

/**
 * Large-library shortcuts (node culling, ellipse hulls, deferred layout) are for the
 * website only. The desktop app should always show every node with convex hulls.
 */
export const useWebPerformanceOptimizations = isWebDeployment;

/** Demo/mock Spotify users are disabled in the web deployment. */
export const areMockUsersEnabled = (): boolean => {
  if (isWebDeployment) {
    return false;
  }
  try {
    return localStorage.getItem("music-cue-include-mock-users") === "true";
  } catch {
    return false;
  }
};
