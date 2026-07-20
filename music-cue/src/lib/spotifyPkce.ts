const SPOTIFY_CODE_VERIFIER_KEY = "music-cue-spotify-code-verifier";
const SPOTIFY_AUTH_STATE_KEY = "music-cue-spotify-auth-state";

const randomString = (length: number): string => {
  const values = crypto.getRandomValues(new Uint8Array(length));
  return Array.from(values, (value) => "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789"[value % 62]).join("");
};

const base64UrlEncode = (buffer: ArrayBuffer): string =>
  btoa(String.fromCharCode(...new Uint8Array(buffer)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

export const createCodeChallenge = async (codeVerifier: string): Promise<string> => {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(codeVerifier));
  return base64UrlEncode(digest);
};

export const beginSpotifyAuth = async (): Promise<{ authorizeUrl: string; state: string }> => {
  const codeVerifier = randomString(64);
  const state = randomString(16);
  const codeChallenge = await createCodeChallenge(codeVerifier);

  sessionStorage.setItem(SPOTIFY_CODE_VERIFIER_KEY, codeVerifier);
  sessionStorage.setItem(SPOTIFY_AUTH_STATE_KEY, state);

  const response = await fetch("/api/spotify/auth-url", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ codeChallenge, state }),
  });

  if (!response.ok) {
    const payload = (await response.json().catch(() => ({}))) as { error?: string };
    throw new Error(payload.error ?? "Could not start Spotify login.");
  }

  const payload = (await response.json()) as { authorizeUrl: string; state: string };
  return payload;
};

export const completeSpotifyAuth = async (code: string, state: string): Promise<void> => {
  const expectedState = sessionStorage.getItem(SPOTIFY_AUTH_STATE_KEY);
  const codeVerifier = sessionStorage.getItem(SPOTIFY_CODE_VERIFIER_KEY);

  if (!expectedState || state !== expectedState) {
    throw new Error("Spotify login state mismatch. Try connecting again.");
  }
  if (!codeVerifier) {
    throw new Error("Spotify login verifier missing. Try connecting again.");
  }

  const response = await fetch("/api/spotify/auth/callback", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code, codeVerifier }),
  });

  sessionStorage.removeItem(SPOTIFY_CODE_VERIFIER_KEY);
  sessionStorage.removeItem(SPOTIFY_AUTH_STATE_KEY);

  if (!response.ok) {
    const payload = (await response.json().catch(() => ({}))) as { error?: string };
    throw new Error(payload.error ?? "Could not complete Spotify login.");
  }
};
