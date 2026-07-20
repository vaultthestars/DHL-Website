import type { VercelRequest, VercelResponse } from "@vercel/node";
import { handleSpotifyRoute } from "../api/lib/spotify/spotifyHandlers";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const pathParts = req.query.path;
  const route = Array.isArray(pathParts) ? pathParts.join("/") : pathParts ?? "";
  await handleSpotifyRoute(route, req, res);
}
