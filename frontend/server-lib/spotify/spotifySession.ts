import { createHmac, timingSafeEqual } from "node:crypto";

export type SpotifyTokens = {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  scope: string;
  userId?: string;
  displayName?: string;
};

export const SPOTIFY_SESSION_COOKIE = "music_cue_spotify_session";

const getSessionSecret = (): string => {
  const secret = process.env.SPOTIFY_SESSION_SECRET;
  if (secret) {
    return secret;
  }
  if (process.env.NODE_ENV === "production") {
    throw new Error("SPOTIFY_SESSION_SECRET is required in production.");
  }
  return "music-cue-dev-session-secret";
};

export const sealSpotifySession = (tokens: SpotifyTokens): string => {
  const payload = Buffer.from(JSON.stringify(tokens), "utf8").toString("base64url");
  const signature = createHmac("sha256", getSessionSecret()).update(payload).digest("base64url");
  return `${payload}.${signature}`;
};

export const unsealSpotifySession = (value: string | undefined): SpotifyTokens | null => {
  if (!value) {
    return null;
  }
  const [payload, signature] = value.split(".");
  if (!payload || !signature) {
    return null;
  }
  const expected = createHmac("sha256", getSessionSecret()).update(payload).digest("base64url");
  const signatureBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  if (signatureBuffer.length !== expectedBuffer.length || !timingSafeEqual(signatureBuffer, expectedBuffer)) {
    return null;
  }
  try {
    return JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as SpotifyTokens;
  } catch {
    return null;
  }
};

export const parseCookieHeader = (cookieHeader: string | undefined): Record<string, string> => {
  if (!cookieHeader) {
    return {};
  }
  return cookieHeader.split(";").reduce<Record<string, string>>((cookies, part) => {
    const [rawKey, ...rawValue] = part.trim().split("=");
    if (!rawKey) {
      return cookies;
    }
    cookies[rawKey] = decodeURIComponent(rawValue.join("="));
    return cookies;
  }, {});
};

export const getSpotifySessionCookie = (cookieHeader: string | undefined): SpotifyTokens | null =>
  unsealSpotifySession(parseCookieHeader(cookieHeader)[SPOTIFY_SESSION_COOKIE]);

export const buildSpotifySessionSetCookie = (tokens: SpotifyTokens | null): string => {
  if (!tokens?.refreshToken) {
    return `${SPOTIFY_SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;
  }
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `${SPOTIFY_SESSION_COOKIE}=${sealSpotifySession(tokens)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${60 * 60 * 24 * 30}${secure}`;
};
