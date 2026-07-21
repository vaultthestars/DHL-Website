import type { VercelRequest, VercelResponse } from "@vercel/node";
import { handleSharedLibraryRoute } from "../api/lib/sharedLibrary/sharedLibraryHandlers";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  await handleSharedLibraryRoute("", req, res);
}
