import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { LibraryContributor, SharedLibraryIndex, SharedLibrarySnapshot } from "../shared/sharedLibrary";

const LOCAL_LIBRARY_DIR = path.resolve(process.cwd(), ".data/shared-libraries");
const BLOB_PREFIX = "music-cue/libraries";
const INDEX_PATH = `${BLOB_PREFIX}/index.json`;

const useBlobStorage = (): boolean => Boolean(process.env.BLOB_READ_WRITE_TOKEN);

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
    if (!fileName.endsWith(".json")) {
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

export const listSharedLibraryContributors = async (): Promise<SharedLibraryIndex> => {
  if (!useBlobStorage()) {
    return readLocalIndex();
  }
  const index = await readBlobJson<SharedLibraryIndex>(INDEX_PATH);
  return index ?? { contributors: [] };
};

export const getSharedLibrarySnapshot = async (contributorId: string): Promise<SharedLibrarySnapshot | null> => {
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
