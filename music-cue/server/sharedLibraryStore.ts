import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { LibraryContributor, SharedLibraryIndex, SharedLibrarySnapshot } from "../shared/sharedLibrary";

const LOCAL_LIBRARY_DIR = path.resolve(process.cwd(), ".data/shared-libraries");
const BLOB_PREFIX = "music-cue/libraries";
const INDEX_PATH = `${BLOB_PREFIX}/index.json`;

export const SHARED_LIBRARY_STORAGE_ERROR =
  "Shared library storage is not configured. In the Vercel project, open Storage → Create Blob store → connect it to this project, then redeploy.";

const isVercelProduction = (): boolean => process.env.VERCEL === "1";

/** True when @vercel/blob can authenticate (static token or Vercel OIDC + store id). */
const useBlobStorage = (): boolean => {
  if (process.env.BLOB_READ_WRITE_TOKEN) {
    return true;
  }
  if (isVercelProduction() && process.env.BLOB_STORE_ID) {
    return true;
  }
  return false;
};

export const getSharedLibraryStorageDiagnostics = (): {
  vercel: boolean;
  blobConfigured: boolean;
  hasReadWriteToken: boolean;
  hasStoreId: boolean;
} => ({
  vercel: isVercelProduction(),
  blobConfigured: useBlobStorage(),
  hasReadWriteToken: Boolean(process.env.BLOB_READ_WRITE_TOKEN),
  hasStoreId: Boolean(process.env.BLOB_STORE_ID),
});

export const isSharedLibraryStorageConfigured = (): boolean => {
  const diagnostics = getSharedLibraryStorageDiagnostics();
  return diagnostics.blobConfigured || !diagnostics.vercel;
};

export const assertSharedLibraryStorageConfigured = (): void => {
  if (!isSharedLibraryStorageConfigured()) {
    throw new Error(SHARED_LIBRARY_STORAGE_ERROR);
  }
};

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

const getBlobModule = async () => import("@vercel/blob");

const readBlobJson = async <T>(pathname: string): Promise<T | null> => {
  const { head } = await getBlobModule();
  try {
    const metadata = await head(pathname);
    const response = await fetch(metadata.url);
    if (!response.ok) {
      return null;
    }
    return (await response.json()) as T;
  } catch {
    return null;
  }
};

const writeBlobJson = async (pathname: string, payload: unknown): Promise<void> => {
  const { put } = await getBlobModule();
  await put(pathname, JSON.stringify(payload), {
    access: "public",
    addRandomSuffix: false,
    contentType: "application/json",
  });
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

const rebuildIndexFromBlobSnapshots = async (): Promise<SharedLibraryIndex> => {
  const { list } = await getBlobModule();
  const { blobs } = await list({ prefix: `${BLOB_PREFIX}/` });
  const contributors: LibraryContributor[] = [];

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
    const snapshot = await readBlobJson<SharedLibrarySnapshot>(blob.pathname);
    if (!snapshot?.contributor?.id) {
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

export const listSharedLibraryContributors = async (): Promise<SharedLibraryIndex> => {
  assertSharedLibraryStorageConfigured();

  if (!useBlobStorage()) {
    return filterMockContributors(readLocalIndex());
  }

  let index = await readBlobJson<SharedLibraryIndex>(INDEX_PATH);
  if (!index?.contributors?.length) {
    const rebuilt = await rebuildIndexFromBlobSnapshots();
    if (rebuilt.contributors.length > 0) {
      await writeBlobJson(INDEX_PATH, rebuilt);
      index = rebuilt;
    }
  }

  return filterMockContributors(index ?? { contributors: [] });
};

export const getSharedLibrarySnapshot = async (contributorId: string): Promise<SharedLibrarySnapshot | null> => {
  if (isMockContributorId(contributorId)) {
    return null;
  }
  if (!useBlobStorage()) {
    return readLocalSnapshot(contributorId);
  }
  return readBlobJson<SharedLibrarySnapshot>(`${BLOB_PREFIX}/${contributorId}.json`);
};

export const getSharedLibrarySnapshots = async (contributorIds: string[]): Promise<SharedLibrarySnapshot[]> => {
  const snapshots = await Promise.all(contributorIds.map((contributorId) => getSharedLibrarySnapshot(contributorId)));
  return snapshots.filter((snapshot): snapshot is SharedLibrarySnapshot => snapshot !== null);
};

export const saveSharedLibrarySnapshot = async (snapshot: SharedLibrarySnapshot): Promise<void> => {
  assertSharedLibraryStorageConfigured();

  if (!useBlobStorage()) {
    writeLocalSnapshot(snapshot);
    const index = readLocalIndex();
    writeLocalIndex(upsertContributor(index, snapshot));
    return;
  }

  await writeBlobJson(`${BLOB_PREFIX}/${snapshot.contributor.id}.json`, snapshot);
  const currentIndex = (await readBlobJson<SharedLibraryIndex>(INDEX_PATH)) ?? { contributors: [] };
  await writeBlobJson(INDEX_PATH, upsertContributor(currentIndex, snapshot));
};
