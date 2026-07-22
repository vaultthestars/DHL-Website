import type { VercelRequest, VercelResponse } from "@vercel/node";
import { handleSpotifyRoute } from "../server-lib/spotify/spotifyHandlers";

const getSpotifyRoute = (req: VercelRequest): string => {
  const pathParts = req.query.path;
  if (pathParts) {
    return Array.isArray(pathParts) ? pathParts.join("/") : pathParts;
  }

  const requestUrl = req.url ?? "";
  const match = requestUrl.match(/\/api\/spotify\/?([^?]*)/);
  return match?.[1] ?? "";
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  await handleSpotifyRoute(getSpotifyRoute(req), req, res);
}
