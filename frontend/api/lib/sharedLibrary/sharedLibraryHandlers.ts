import { mergeSharedLibrarySnapshots } from "./sharedLibrary";
import {
  getSharedLibrarySnapshot,
  getSharedLibrarySnapshots,
  isSharedLibraryStorageConfigured,
  listSharedLibraryContributors,
  SHARED_LIBRARY_STORAGE_ERROR,
} from "./sharedLibraryStore";

type HandlerRequest = {
  method?: string;
  body?: unknown;
  headers?: { cookie?: string };
  query?: Record<string, unknown>;
};

type HandlerResponse = {
  status: (code: number) => HandlerResponse;
  json: (body: unknown) => void;
  setHeader: (name: string, value: string | string[]) => void;
};

const getQueryValue = (query: HandlerRequest["query"], key: string): string => {
  const value = query?.[key];
  if (Array.isArray(value)) {
    return typeof value[0] === "string" ? value[0] : "";
  }
  return typeof value === "string" ? value : "";
};

export const handleSharedLibraryRoute = async (
  route: string,
  req: HandlerRequest,
  res: HandlerResponse
): Promise<void> => {
  try {
    if (!isSharedLibraryStorageConfigured()) {
      res.status(503).json({ error: SHARED_LIBRARY_STORAGE_ERROR, contributors: [] });
      return;
    }

    if (route === "" && req.method === "GET") {
      res.status(200).json(await listSharedLibraryContributors());
      return;
    }

    if (route.startsWith("snapshot/") && req.method === "GET") {
      const contributorId = route.slice("snapshot/".length);
      const snapshot = await getSharedLibrarySnapshot(contributorId);
      if (!snapshot) {
        res.status(404).json({ error: "Shared library snapshot not found." });
        return;
      }
      res.status(200).json(snapshot);
      return;
    }

    if (route === "merge" && req.method === "GET") {
      const contributorsParam = getQueryValue(req.query, "contributors");
      const index = await listSharedLibraryContributors();
      const contributorIds = contributorsParam
        ? contributorsParam.split(",").map((entry) => entry.trim()).filter(Boolean)
        : index.contributors.map((contributor) => contributor.id);

      if (contributorIds.length === 0) {
        res.status(200).json({
          songs: [],
          stats: {
            minYear: 1970,
            maxYear: new Date().getFullYear(),
            genres: [],
            genreCounts: {},
            maxPlayCount: 1,
            playlistIds: [],
            playlistNames: {},
            playlistCounts: {},
          },
          sharedTrackCount: 0,
          contributors: [],
        });
        return;
      }

      const snapshots = await getSharedLibrarySnapshots(contributorIds);
      const merged = mergeSharedLibrarySnapshots(snapshots);
      res.status(200).json({
        ...merged,
        contributors: index.contributors.filter((contributor) => contributorIds.includes(contributor.id)),
      });
      return;
    }

    res.status(404).json({ error: `Unknown shared library route: ${route}` });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Shared library request failed.";
    res.status(500).json({ error: message });
  }
};
