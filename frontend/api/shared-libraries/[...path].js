"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// scripts/shared-libraries-handler.ts
var shared_libraries_handler_exports = {};
__export(shared_libraries_handler_exports, {
  default: () => handler
});
module.exports = __toCommonJS(shared_libraries_handler_exports);

// api/lib/sharedLibrary/sharedLibrary.ts
var buildPlaylistOwnersFromSnapshots = (snapshots) => {
  const playlistOwners = {};
  snapshots.forEach((snapshot) => {
    snapshot.songs.forEach((song) => {
      (song.playlists ?? []).forEach((playlistId) => {
        if (!playlistOwners[playlistId]) {
          playlistOwners[playlistId] = snapshot.contributor.id;
        }
      });
    });
  });
  return playlistOwners;
};
var defaultStats = () => ({
  minYear: 1970,
  maxYear: (/* @__PURE__ */ new Date()).getFullYear(),
  genres: [],
  genreCounts: {},
  maxPlayCount: 1,
  playlistIds: [],
  playlistNames: {},
  playlistCounts: {}
});
var buildLibraryStatsFromSongs = (songs, playlistNames = {}) => {
  if (songs.length === 0) {
    return defaultStats();
  }
  const genreCounts = {};
  const playlistCounts = {};
  const playlistIdSet = /* @__PURE__ */ new Set();
  let minYear = songs[0].year;
  let maxYear = songs[0].year;
  let maxPlayCount = 1;
  songs.forEach((song) => {
    genreCounts[song.genre] = (genreCounts[song.genre] ?? 0) + 1;
    minYear = Math.min(minYear, song.year);
    maxYear = Math.max(maxYear, song.year);
    maxPlayCount = Math.max(maxPlayCount, song.playCount);
    (song.playlists ?? []).forEach((playlistId) => {
      playlistIdSet.add(playlistId);
      playlistCounts[playlistId] = (playlistCounts[playlistId] ?? 0) + 1;
    });
  });
  const mergedPlaylistNames = { ...playlistNames };
  playlistIdSet.forEach((playlistId) => {
    if (!mergedPlaylistNames[playlistId]) {
      mergedPlaylistNames[playlistId] = playlistId;
    }
  });
  return {
    minYear,
    maxYear,
    genres: Object.keys(genreCounts).sort((left, right) => left.localeCompare(right)),
    genreCounts,
    maxPlayCount,
    playlistIds: [...playlistIdSet].sort(
      (left, right) => (mergedPlaylistNames[left] ?? left).localeCompare(mergedPlaylistNames[right] ?? right)
    ),
    playlistNames: mergedPlaylistNames,
    playlistCounts
  };
};
var mergeSongOwners = (left, right, playlistOwners) => {
  const ownersById = /* @__PURE__ */ new Map();
  (left.owners ?? []).forEach((owner) => ownersById.set(owner.id, owner));
  (right.owners ?? []).forEach((owner) => ownersById.set(owner.id, owner));
  const owners = [...ownersById.values()].sort(
    (leftOwner, rightOwner) => leftOwner.name.localeCompare(rightOwner.name)
  );
  const ownerIds = new Set(owners.map((owner) => owner.id));
  const playlistSet = /* @__PURE__ */ new Set([...left.playlists ?? [], ...right.playlists ?? []]);
  const playlists = [...playlistSet].filter((playlistId) => {
    const creatorId = playlistOwners[playlistId];
    return creatorId !== void 0 && ownerIds.has(creatorId);
  });
  return {
    ...left,
    playCount: Math.max(left.playCount, right.playCount),
    loved: left.loved || right.loved,
    playlists,
    owners,
    ownerCount: owners.length
  };
};
var tagSongsForContributor = (songs, contributor) => songs.map((song) => ({
  ...song,
  owners: [{ id: contributor.id, name: contributor.name }],
  ownerCount: 1
}));
var mergeSharedLibrarySnapshots = (snapshots) => {
  const songMap = /* @__PURE__ */ new Map();
  const playlistNames = {};
  const playlistOwners = buildPlaylistOwnersFromSnapshots(snapshots);
  snapshots.forEach((snapshot) => {
    Object.assign(playlistNames, snapshot.stats.playlistNames ?? {});
    const taggedSongs = tagSongsForContributor(snapshot.songs, snapshot.contributor);
    taggedSongs.forEach((song) => {
      const existing = songMap.get(song.id);
      songMap.set(
        song.id,
        existing ? mergeSongOwners(existing, song, playlistOwners) : song
      );
    });
  });
  const songs = [...songMap.values()];
  const stats = buildLibraryStatsFromSongs(songs, playlistNames);
  return {
    songs,
    stats,
    sharedTrackCount: songs.filter((song) => (song.ownerCount ?? 1) > 1).length,
    playlistOwners
  };
};

// api/lib/sharedLibrary/sharedLibraryStore.ts
var import_node_fs = require("node:fs");
var import_node_path = __toESM(require("node:path"));
var LOCAL_LIBRARY_DIR = import_node_path.default.resolve(process.cwd(), ".data/shared-libraries");
var BLOB_PREFIX = "music-cue/libraries";
var INDEX_PATH = `${BLOB_PREFIX}/index.json`;
var SHARED_LIBRARY_STORAGE_ERROR = "Shared library storage is not configured. In the Vercel project, open Storage \u2192 Create Blob store \u2192 connect it to this project, then redeploy.";
var isVercelProduction = () => process.env.VERCEL === "1";
var useBlobStorage = () => Boolean(process.env.BLOB_READ_WRITE_TOKEN);
var isSharedLibraryStorageConfigured = () => useBlobStorage() || !isVercelProduction();
var assertSharedLibraryStorageConfigured = () => {
  if (!isSharedLibraryStorageConfigured()) {
    throw new Error(SHARED_LIBRARY_STORAGE_ERROR);
  }
};
var readLocalSnapshot = (contributorId) => {
  const filePath = import_node_path.default.join(LOCAL_LIBRARY_DIR, `${contributorId}.json`);
  if (!(0, import_node_fs.existsSync)(filePath)) {
    return null;
  }
  try {
    return JSON.parse((0, import_node_fs.readFileSync)(filePath, "utf8"));
  } catch {
    return null;
  }
};
var readLocalIndex = () => {
  const contributors = [];
  if (!(0, import_node_fs.existsSync)(LOCAL_LIBRARY_DIR)) {
    return { contributors };
  }
  for (const fileName of (0, import_node_fs.readdirSync)(LOCAL_LIBRARY_DIR)) {
    if (!fileName.endsWith(".json") || fileName === "index.json") {
      continue;
    }
    const snapshot = readLocalSnapshot(fileName.replace(/\.json$/, ""));
    if (!snapshot) {
      continue;
    }
    contributors.push({
      id: snapshot.contributor.id,
      name: snapshot.contributor.name,
      updatedAt: snapshot.updatedAt,
      trackCount: snapshot.songs.length
    });
  }
  contributors.sort((left, right) => left.name.localeCompare(right.name));
  return { contributors };
};
var getBlobModule = async () => import("@vercel/blob");
var readBlobJson = async (pathname) => {
  const { head } = await getBlobModule();
  try {
    const metadata = await head(pathname);
    const response = await fetch(metadata.url);
    if (!response.ok) {
      return null;
    }
    return await response.json();
  } catch {
    return null;
  }
};
var writeBlobJson = async (pathname, payload) => {
  const { put } = await getBlobModule();
  await put(pathname, JSON.stringify(payload), {
    access: "public",
    addRandomSuffix: false,
    contentType: "application/json"
  });
};
var isMockContributorId = (contributorId) => contributorId.startsWith("mock-user-");
var filterMockContributors = (index) => ({
  contributors: index.contributors.filter((contributor) => !isMockContributorId(contributor.id))
});
var rebuildIndexFromBlobSnapshots = async () => {
  const { list } = await getBlobModule();
  const { blobs } = await list({ prefix: `${BLOB_PREFIX}/` });
  const contributors = [];
  for (const blob of blobs) {
    if (blob.pathname === INDEX_PATH) {
      continue;
    }
    if (!blob.pathname.startsWith(`${BLOB_PREFIX}/`) || !blob.pathname.endsWith(".json")) {
      continue;
    }
    const contributorId = blob.pathname.slice(`${BLOB_PREFIX}/`.length, -".json".length);
    if (!contributorId) {
      continue;
    }
    const snapshot = await readBlobJson(blob.pathname);
    if (!snapshot?.contributor?.id) {
      continue;
    }
    contributors.push({
      id: snapshot.contributor.id,
      name: snapshot.contributor.name,
      updatedAt: snapshot.updatedAt,
      trackCount: snapshot.songs.length
    });
  }
  contributors.sort((left, right) => left.name.localeCompare(right.name));
  return { contributors };
};
var listSharedLibraryContributors = async () => {
  assertSharedLibraryStorageConfigured();
  if (!useBlobStorage()) {
    return filterMockContributors(readLocalIndex());
  }
  let index = await readBlobJson(INDEX_PATH);
  if (!index?.contributors?.length) {
    const rebuilt = await rebuildIndexFromBlobSnapshots();
    if (rebuilt.contributors.length > 0) {
      await writeBlobJson(INDEX_PATH, rebuilt);
      index = rebuilt;
    }
  }
  return filterMockContributors(index ?? { contributors: [] });
};
var getSharedLibrarySnapshot = async (contributorId) => {
  if (isMockContributorId(contributorId)) {
    return null;
  }
  if (!useBlobStorage()) {
    return readLocalSnapshot(contributorId);
  }
  return readBlobJson(`${BLOB_PREFIX}/${contributorId}.json`);
};
var getSharedLibrarySnapshots = async (contributorIds) => {
  const snapshots = await Promise.all(contributorIds.map((contributorId) => getSharedLibrarySnapshot(contributorId)));
  return snapshots.filter((snapshot) => snapshot !== null);
};

// api/lib/sharedLibrary/sharedLibraryHandlers.ts
var getQueryValue = (query, key) => {
  const value = query?.[key];
  if (Array.isArray(value)) {
    return typeof value[0] === "string" ? value[0] : "";
  }
  return typeof value === "string" ? value : "";
};
var handleSharedLibraryRoute = async (route, req, res) => {
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
      const contributorIds = contributorsParam ? contributorsParam.split(",").map((entry) => entry.trim()).filter(Boolean) : index.contributors.map((contributor) => contributor.id);
      if (contributorIds.length === 0) {
        res.status(200).json({
          songs: [],
          stats: {
            minYear: 1970,
            maxYear: (/* @__PURE__ */ new Date()).getFullYear(),
            genres: [],
            genreCounts: {},
            maxPlayCount: 1,
            playlistIds: [],
            playlistNames: {},
            playlistCounts: {}
          },
          sharedTrackCount: 0,
          contributors: []
        });
        return;
      }
      const snapshots = await getSharedLibrarySnapshots(contributorIds);
      const merged = mergeSharedLibrarySnapshots(snapshots);
      res.status(200).json({
        ...merged,
        contributors: index.contributors.filter((contributor) => contributorIds.includes(contributor.id))
      });
      return;
    }
    res.status(404).json({ error: `Unknown shared library route: ${route}` });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Shared library request failed.";
    res.status(500).json({ error: message });
  }
};

// scripts/shared-libraries-handler.ts
var getSharedLibraryRoute = (req) => {
  const pathParts = req.query.path;
  if (pathParts) {
    return Array.isArray(pathParts) ? pathParts.join("/") : pathParts;
  }
  const requestUrl = req.url ?? "";
  const match = requestUrl.match(/\/api\/shared-libraries\/?([^?]*)/);
  return match?.[1] ?? "";
};
async function handler(req, res) {
  await handleSharedLibraryRoute(getSharedLibraryRoute(req), req, res);
}
