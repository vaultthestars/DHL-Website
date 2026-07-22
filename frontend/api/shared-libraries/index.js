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

// scripts/shared-libraries-index-handler.ts
var shared_libraries_index_handler_exports = {};
__export(shared_libraries_index_handler_exports, {
  default: () => handler
});
module.exports = __toCommonJS(shared_libraries_index_handler_exports);

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

// api/lib/sharedLibrary/sharedLibraryRemoteStore.ts
var import_client_s3 = require("@aws-sdk/client-s3");
var isVercelProduction = () => process.env.VERCEL === "1";
var useS3Storage = () => {
  const override = process.env.SHARED_LIBRARY_STORAGE?.toLowerCase();
  if (override === "blob") {
    return false;
  }
  if (override === "s3" || override === "r2") {
    return Boolean(
      process.env.SHARED_LIBRARY_S3_BUCKET && process.env.SHARED_LIBRARY_S3_ACCESS_KEY_ID && process.env.SHARED_LIBRARY_S3_SECRET_ACCESS_KEY
    );
  }
  return Boolean(
    process.env.SHARED_LIBRARY_S3_BUCKET && process.env.SHARED_LIBRARY_S3_ACCESS_KEY_ID && process.env.SHARED_LIBRARY_S3_SECRET_ACCESS_KEY
  );
};
var useBlobStorage = () => {
  const override = process.env.SHARED_LIBRARY_STORAGE?.toLowerCase();
  if (override === "s3" || override === "r2") {
    return false;
  }
  if (override === "blob") {
    return Boolean(process.env.BLOB_READ_WRITE_TOKEN || isVercelProduction() && process.env.BLOB_STORE_ID);
  }
  if (useS3Storage()) {
    return false;
  }
  if (process.env.BLOB_READ_WRITE_TOKEN) {
    return true;
  }
  if (isVercelProduction() && process.env.BLOB_STORE_ID) {
    return true;
  }
  return false;
};
var streamToString = async (body) => {
  if (!body) {
    return "";
  }
  if (typeof body === "string") {
    return body;
  }
  if (body instanceof Uint8Array) {
    return new TextDecoder().decode(body);
  }
  if (typeof body.transformToByteArray === "function") {
    const bytes = await body.transformToByteArray();
    return new TextDecoder().decode(bytes);
  }
  return new Response(body).text();
};
var s3Client = null;
var getS3Client = () => {
  if (s3Client) {
    return s3Client;
  }
  const endpoint = process.env.SHARED_LIBRARY_S3_ENDPOINT;
  s3Client = new import_client_s3.S3Client({
    region: process.env.SHARED_LIBRARY_S3_REGION ?? "auto",
    endpoint: endpoint || void 0,
    forcePathStyle: Boolean(endpoint),
    credentials: {
      accessKeyId: process.env.SHARED_LIBRARY_S3_ACCESS_KEY_ID,
      secretAccessKey: process.env.SHARED_LIBRARY_S3_SECRET_ACCESS_KEY
    }
  });
  return s3Client;
};
var createS3RemoteStore = () => {
  const bucket = process.env.SHARED_LIBRARY_S3_BUCKET;
  return {
    backend: "s3",
    readJson: async (key) => {
      try {
        const result = await getS3Client().send(
          new import_client_s3.GetObjectCommand({
            Bucket: bucket,
            Key: key
          })
        );
        const text = await streamToString(result.Body);
        if (!text) {
          return null;
        }
        return JSON.parse(text);
      } catch {
        return null;
      }
    },
    writeJson: async (key, payload) => {
      await getS3Client().send(
        new import_client_s3.PutObjectCommand({
          Bucket: bucket,
          Key: key,
          Body: JSON.stringify(payload),
          ContentType: "application/json"
        })
      );
    },
    listJsonKeys: async (prefix) => {
      const entries = [];
      let continuationToken;
      do {
        const result = await getS3Client().send(
          new import_client_s3.ListObjectsV2Command({
            Bucket: bucket,
            Prefix: prefix,
            ContinuationToken: continuationToken
          })
        );
        (result.Contents ?? []).forEach((object) => {
          if (!object.Key) {
            return;
          }
          entries.push({
            key: object.Key,
            updatedAt: object.LastModified ?? /* @__PURE__ */ new Date(0)
          });
        });
        continuationToken = result.IsTruncated ? result.NextContinuationToken : void 0;
      } while (continuationToken);
      return entries;
    }
  };
};
var getBlobModule = async () => import("@vercel/blob");
var createBlobRemoteStore = () => ({
  backend: "blob",
  readJson: async (key) => {
    const { get } = await getBlobModule();
    try {
      const result = await get(key, { access: "private", useCache: false });
      if (!result || result.statusCode !== 200 || !result.stream) {
        return null;
      }
      const text = await new Response(result.stream).text();
      return JSON.parse(text);
    } catch {
      return null;
    }
  },
  writeJson: async (key, payload) => {
    const { put } = await getBlobModule();
    await put(key, JSON.stringify(payload), {
      access: "private",
      addRandomSuffix: false,
      allowOverwrite: true,
      contentType: "application/json"
    });
  },
  listJsonKeys: async (prefix) => {
    const { list } = await getBlobModule();
    const { blobs } = await list({ prefix });
    return blobs.map((blob) => ({
      key: blob.pathname,
      updatedAt: blob.uploadedAt
    }));
  }
});
var getRemoteJsonStore = () => {
  if (useS3Storage()) {
    return createS3RemoteStore();
  }
  if (useBlobStorage()) {
    return createBlobRemoteStore();
  }
  return null;
};
var isRemoteStorageConfigured = () => getRemoteJsonStore() !== null;

// api/lib/sharedLibrary/sharedLibraryStore.ts
var LOCAL_LIBRARY_DIR = import_node_path.default.resolve(process.cwd(), ".data/shared-libraries");
var STORAGE_PREFIX = "music-cue/libraries";
var INDEX_KEY = `${STORAGE_PREFIX}/index.json`;
var SHARED_LIBRARY_STORAGE_ERROR = "Shared library storage is not configured. Set Cloudflare R2 / S3 env vars (SHARED_LIBRARY_S3_*) or reconnect Vercel Blob, then redeploy.";
var isVercelProduction2 = () => process.env.VERCEL === "1";
var getSharedLibraryStorageDiagnostics = async () => {
  const remote = getRemoteJsonStore();
  const base = {
    vercel: isVercelProduction2(),
    storageBackend: remote?.backend ?? (isVercelProduction2() ? "none" : "local"),
    s3Configured: useS3Storage(),
    blobConfigured: useBlobStorage(),
    hasReadWriteToken: Boolean(process.env.BLOB_READ_WRITE_TOKEN),
    hasStoreId: Boolean(process.env.BLOB_STORE_ID),
    snapshotCount: 0,
    indexContributorCount: 0
  };
  if (!remote) {
    return { ...base };
  }
  try {
    const objects = await remote.listJsonKeys(`${STORAGE_PREFIX}/`);
    base.snapshotCount = objects.filter(
      (entry) => entry.key !== INDEX_KEY && entry.key.endsWith(".json")
    ).length;
    const index = await remote.readJson(INDEX_KEY);
    base.indexContributorCount = index?.contributors?.length ?? 0;
  } catch {
  }
  return base;
};
var isSharedLibraryStorageConfigured = () => {
  if (!isVercelProduction2()) {
    return true;
  }
  return isRemoteStorageConfigured();
};
var assertSharedLibraryStorageConfigured = () => {
  if (!isSharedLibraryStorageConfigured()) {
    throw new Error(SHARED_LIBRARY_STORAGE_ERROR);
  }
};
var snapshotKey = (contributorId) => `${STORAGE_PREFIX}/${contributorId}.json`;
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
var isMockContributorId = (contributorId) => contributorId.startsWith("mock-user-");
var filterMockContributors = (index) => ({
  contributors: index.contributors.filter((contributor) => !isMockContributorId(contributor.id))
});
var rebuildIndexFromRemoteSnapshots = async () => {
  const remote = getRemoteJsonStore();
  if (!remote) {
    return { contributors: [] };
  }
  const objects = await remote.listJsonKeys(`${STORAGE_PREFIX}/`);
  const contributors = [];
  for (const object of objects) {
    if (object.key === INDEX_KEY || !object.key.endsWith(".json")) {
      continue;
    }
    const contributorId = object.key.slice(`${STORAGE_PREFIX}/`.length, -".json".length);
    if (!contributorId) {
      continue;
    }
    const snapshot = await remote.readJson(object.key);
    if (snapshot?.contributor?.id) {
      contributors.push({
        id: snapshot.contributor.id,
        name: snapshot.contributor.name,
        updatedAt: snapshot.updatedAt,
        trackCount: snapshot.songs.length
      });
      continue;
    }
    contributors.push({
      id: contributorId,
      name: contributorId,
      updatedAt: object.updatedAt.toISOString(),
      trackCount: 0
    });
  }
  contributors.sort((left, right) => left.name.localeCompare(right.name));
  return { contributors };
};
var listSharedLibraryContributors = async () => {
  assertSharedLibraryStorageConfigured();
  const remote = getRemoteJsonStore();
  if (!remote) {
    return filterMockContributors(readLocalIndex());
  }
  let index = await remote.readJson(INDEX_KEY);
  if (!index?.contributors?.length) {
    const rebuilt = await rebuildIndexFromRemoteSnapshots();
    if (rebuilt.contributors.length > 0) {
      await remote.writeJson(INDEX_KEY, rebuilt);
      index = rebuilt;
    }
  }
  return filterMockContributors(index ?? { contributors: [] });
};
var getSharedLibrarySnapshot = async (contributorId) => {
  if (isMockContributorId(contributorId)) {
    return null;
  }
  const remote = getRemoteJsonStore();
  if (!remote) {
    return readLocalSnapshot(contributorId);
  }
  return remote.readJson(snapshotKey(contributorId));
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
    if (route === "storage-status" && req.method === "GET") {
      res.status(200).json(await getSharedLibraryStorageDiagnostics());
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

// scripts/shared-libraries-index-handler.ts
async function handler(req, res) {
  await handleSharedLibraryRoute("", req, res);
}
