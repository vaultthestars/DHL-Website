const SPOTIFY_CODE_VERIFIER_KEY = "music-cue-spotify-code-verifier";
const SPOTIFY_AUTH_STATE_KEY = "music-cue-spotify-auth-state";
const SPOTIFY_AUTH_STARTED_AT_KEY = "music-cue-spotify-auth-started-at";
const SPOTIFY_AUTH_TTL_MS = 10 * 60 * 1000;

const readStorage = (key: string): string | null => {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
};

const writeStorage = (key: string, value: string): void => {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Private browsing or storage blocked.
  }
};

const removeStorage = (key: string): void => {
  try {
    localStorage.removeItem(key);
  } catch {
    // Ignore storage errors.
  }
};

const clearSpotifyAuthStorage = (): void => {
  removeStorage(SPOTIFY_CODE_VERIFIER_KEY);
  removeStorage(SPOTIFY_AUTH_STATE_KEY);
  removeStorage(SPOTIFY_AUTH_STARTED_AT_KEY);
};

const isFreshSpotifyAuth = (): boolean => {
  const startedAt = Number(readStorage(SPOTIFY_AUTH_STARTED_AT_KEY));
  return Number.isFinite(startedAt) && Date.now() - startedAt < SPOTIFY_AUTH_TTL_MS;
};

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

  writeStorage(SPOTIFY_CODE_VERIFIER_KEY, codeVerifier);
  writeStorage(SPOTIFY_AUTH_STATE_KEY, state);
  writeStorage(SPOTIFY_AUTH_STARTED_AT_KEY, String(Date.now()));

  const response = await fetch("/api/spotify/auth-url", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
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
  if (!isFreshSpotifyAuth()) {
    clearSpotifyAuthStorage();
    throw new Error("Spotify login expired. Try connecting again.");
  }

  const expectedState = readStorage(SPOTIFY_AUTH_STATE_KEY);
  const codeVerifier = readStorage(SPOTIFY_CODE_VERIFIER_KEY);

  if (!expectedState || state !== expectedState) {
    clearSpotifyAuthStorage();
    throw new Error("Spotify login state mismatch. Try connecting again.");
  }
  if (!codeVerifier) {
    clearSpotifyAuthStorage();
    throw new Error("Spotify login verifier missing. Try connecting again.");
  }

  const response = await fetch("/api/spotify/auth-callback", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ code, codeVerifier }),
  });

  clearSpotifyAuthStorage();

  if (!response.ok) {
    const payload = (await response.json().catch(() => ({}))) as { error?: string };
    throw new Error(payload.error ?? "Could not complete Spotify login.");
  }
};
