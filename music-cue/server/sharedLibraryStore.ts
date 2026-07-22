import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { LibraryContributor, SharedLibraryIndex, SharedLibrarySnapshot } from "../shared/sharedLibrary";
import { sanitizeLibraryPayload } from "../shared/librarySanitize";
import {
  getRemoteJsonStore,
  isRemoteStorageConfigured,
  useBlobStorage,
  useS3Storage,
} from "./sharedLibraryRemoteStore";

const LOCAL_LIBRARY_DIR = path.resolve(process.cwd(), ".data/shared-libraries");
const STORAGE_PREFIX = "music-cue/libraries";
const INDEX_KEY = `${STORAGE_PREFIX}/index.json`;

export const SHARED_LIBRARY_STORAGE_ERROR =
  "Shared library storage is not configured. Set Cloudflare R2 / S3 env vars (SHARED_LIBRARY_S3_*) or reconnect Vercel Blob, then redeploy.";

const isVercelProduction = (): boolean => process.env.VERCEL === "1";

export const getSharedLibraryStorageDiagnostics = async (): Promise<{
  vercel: boolean;
  storageBackend: "local" | "s3" | "blob" | "none";
  s3Configured: boolean;
  blobConfigured: boolean;
  hasReadWriteToken: boolean;
  hasStoreId: boolean;
  snapshotCount: number;
  indexContributorCount: number;
}> => {
  const remote = getRemoteJsonStore();
  const storageBackend: "local" | "s3" | "blob" | "none" =
    remote?.backend ?? (isVercelProduction() ? "none" : "local");
  const base = {
    vercel: isVercelProduction(),
    storageBackend,
    s3Configured: useS3Storage(),
    blobConfigured: useBlobStorage(),
    hasReadWriteToken: Boolean(process.env.BLOB_READ_WRITE_TOKEN),
    hasStoreId: Boolean(process.env.BLOB_STORE_ID),
    snapshotCount: 0,
    indexContributorCount: 0,
  };

  if (!remote) {
    return { ...base };
  }

  try {
    const objects = await remote.listJsonKeys(`${STORAGE_PREFIX}/`);
    base.snapshotCount = objects.filter(
      (entry) => entry.key !== INDEX_KEY && entry.key.endsWith(".json")
    ).length;
    const index = await remote.readJson<SharedLibraryIndex>(INDEX_KEY);
    base.indexContributorCount = index?.contributors?.length ?? 0;
  } catch {
    // Leave counts at zero.
  }

  return base;
};

export const isSharedLibraryStorageConfigured = (): boolean => {
  if (!isVercelProduction()) {
    return true;
  }
  return isRemoteStorageConfigured();
};

export const assertSharedLibraryStorageConfigured = (): void => {
  if (!isSharedLibraryStorageConfigured()) {
    throw new Error(SHARED_LIBRARY_STORAGE_ERROR);
  }
};

const snapshotKey = (contributorId: string): string => `${STORAGE_PREFIX}/${contributorId}.json`;

const readLocalSnapshot = (contributorId: string): SharedLibrarySnapshot | null => {
  const filePath = path.join(LOCAL_LIBRARY_DIR, `${contributorId}.json`);
  if (!existsSync(filePath)) {
    return null;
  }
  try {
    return JSON.parse(readFileSync(filePath, "utf8")) as SharedLibrarySnapshot;
  } catch {
    return null;
  }
};

const writeLocalSnapshot = (snapshot: SharedLibrarySnapshot): void => {
  mkdirSync(LOCAL_LIBRARY_DIR, { recursive: true });
  writeFileSync(
    path.join(LOCAL_LIBRARY_DIR, `${snapshot.contributor.id}.json`),
    `${JSON.stringify(snapshot, null, 2)}\n`,
    "utf8"
  );
};

const readLocalIndex = (): SharedLibraryIndex => {
  const contributors: LibraryContributor[] = [];
  if (!existsSync(LOCAL_LIBRARY_DIR)) {
    return { contributors };
  }
  for (const fileName of readdirSync(LOCAL_LIBRARY_DIR)) {
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
      trackCount: snapshot.songs.length,
    });
  }
  contributors.sort((left, right) => left.name.localeCompare(right.name));
  return { contributors };
};

const writeLocalIndex = (index: SharedLibraryIndex): void => {
  mkdirSync(LOCAL_LIBRARY_DIR, { recursive: true });
  writeFileSync(path.join(LOCAL_LIBRARY_DIR, "index.json"), `${JSON.stringify(index, null, 2)}\n`, "utf8");
};

const upsertContributor = (index: SharedLibraryIndex, snapshot: SharedLibrarySnapshot): SharedLibraryIndex => {
  const contributor: LibraryContributor = {
    id: snapshot.contributor.id,
    name: snapshot.contributor.name,
    updatedAt: snapshot.updatedAt,
    trackCount: snapshot.songs.length,
  };
  const contributors = index.contributors.filter((entry) => entry.id !== contributor.id);
  contributors.push(contributor);
  contributors.sort((left, right) => left.name.localeCompare(right.name));
  return { contributors };
};

const isMockContributorId = (contributorId: string): boolean => contributorId.startsWith("mock-user-");

const filterMockContributors = (index: SharedLibraryIndex): SharedLibraryIndex => ({
  contributors: index.contributors.filter((contributor) => !isMockContributorId(contributor.id)),
});

const rebuildIndexFromRemoteSnapshots = async (): Promise<SharedLibraryIndex> => {
  const remote = getRemoteJsonStore();
  if (!remote) {
    return { contributors: [] };
  }

  const objects = await remote.listJsonKeys(`${STORAGE_PREFIX}/`);
  const contributors: LibraryContributor[] = [];

  for (const object of objects) {
    if (object.key === INDEX_KEY || !object.key.endsWith(".json")) {
      continue;
    }
    const contributorId = object.key.slice(`${STORAGE_PREFIX}/`.length, -".json".length);
    if (!contributorId) {
      continue;
    }
    const snapshot = await remote.readJson<SharedLibrarySnapshot>(object.key);
    if (snapshot?.contributor?.id) {
      contributors.push({
        id: snapshot.contributor.id,
        name: snapshot.contributor.name,
        updatedAt: snapshot.updatedAt,
        trackCount: snapshot.songs.length,
      });
      continue;
    }
    contributors.push({
      id: contributorId,
      name: contributorId,
      updatedAt: object.updatedAt.toISOString(),
      trackCount: 0,
    });
  }

  contributors.sort((left, right) => left.name.localeCompare(right.name));
  return { contributors };
};

export const listSharedLibraryContributors = async (): Promise<SharedLibraryIndex> => {
  assertSharedLibraryStorageConfigured();

  const remote = getRemoteJsonStore();
  if (!remote) {
    return filterMockContributors(readLocalIndex());
  }

  const index = await remote.readJson<SharedLibraryIndex>(INDEX_KEY);
  if (index?.contributors?.length) {
    return filterMockContributors(index);
  }

  const rebuilt = await rebuildIndexFromRemoteSnapshots();
  if (rebuilt.contributors.length > 0) {
    await remote.writeJson(INDEX_KEY, rebuilt);
    return filterMockContributors(rebuilt);
  }

  return filterMockContributors(index ?? { contributors: [] });
};

export const getSharedLibrarySnapshot = async (contributorId: string): Promise<SharedLibrarySnapshot | null> => {
  if (isMockContributorId(contributorId)) {
    return null;
  }

  const remote = getRemoteJsonStore();
  if (!remote) {
    return readLocalSnapshot(contributorId);
  }

  return remote.readJson<SharedLibrarySnapshot>(snapshotKey(contributorId));
};

export const getSharedLibrarySnapshots = async (contributorIds: string[]): Promise<SharedLibrarySnapshot[]> => {
  const snapshots = await Promise.all(contributorIds.map((contributorId) => getSharedLibrarySnapshot(contributorId)));
  return snapshots.filter((snapshot): snapshot is SharedLibrarySnapshot => snapshot !== null);
};

export const saveSharedLibrarySnapshot = async (snapshot: SharedLibrarySnapshot): Promise<void> => {
  assertSharedLibraryStorageConfigured();

  const sanitized = sanitizeLibraryPayload({
    songs: snapshot.songs,
    stats: snapshot.stats,
  });
  const cleanedSnapshot: SharedLibrarySnapshot = {
    ...snapshot,
    songs: sanitized.songs,
    stats: sanitized.stats,
  };

  const remote = getRemoteJsonStore();
  if (!remote) {
    writeLocalSnapshot(cleanedSnapshot);
    const index = readLocalIndex();
    writeLocalIndex(upsertContributor(index, cleanedSnapshot));
    return;
  }

  await remote.writeJson(snapshotKey(cleanedSnapshot.contributor.id), cleanedSnapshot);
  const currentIndex = (await remote.readJson<SharedLibraryIndex>(INDEX_KEY)) ?? { contributors: [] };
  await remote.writeJson(INDEX_KEY, upsertContributor(currentIndex, cleanedSnapshot));
};
