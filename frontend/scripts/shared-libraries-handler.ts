import type { VercelRequest, VercelResponse } from "@vercel/node";
import { handleSharedLibraryRoute } from "../server-lib/sharedLibrary/sharedLibraryHandlers";

const getSharedLibraryRoute = (req: VercelRequest): string => {
  const pathParts = req.query.path;
  if (pathParts) {
    return Array.isArray(pathParts) ? pathParts.join("/") : pathParts;
  }

  const requestUrl = req.url ?? "";
  const match = requestUrl.match(/\/api\/shared-libraries\/?([^?]*)/);
  return match?.[1] ?? "";
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  await handleSharedLibraryRoute(getSharedLibraryRoute(req), req, res);
}
