export const isWebDeployment = import.meta.env.VITE_APP_MODE === "web";

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
