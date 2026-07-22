import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** Committed defaults — imported by the Vite client; never written at runtime. */
const BUNDLED_LAYOUT_PATH = path.resolve(__dirname, "../src/data/cluster-layout.json");

/** Desktop runtime backup — outside src/ so Vite dev does not hot-reload in a loop. */
const USER_LAYOUT_PATH = path.resolve(__dirname, "../data/cluster-layout.local.json");

export type ClusterLayoutFile = {
  genre: Record<string, { x: number; y: number }>;
  playlist: Record<string, { x: number; y: number }>;
};

const emptyClusterLayout = (): ClusterLayoutFile => ({
  genre: {},
  playlist: {},
});

const readBundledLayoutFile = (): ClusterLayoutFile => {
  if (!existsSync(BUNDLED_LAYOUT_PATH)) {
    return emptyClusterLayout();
  }
  try {
    return JSON.parse(readFileSync(BUNDLED_LAYOUT_PATH, "utf8")) as ClusterLayoutFile;
  } catch {
    return emptyClusterLayout();
  }
};

export const readClusterLayoutFile = (): ClusterLayoutFile => {
  const bundled = readBundledLayoutFile();
  if (!existsSync(USER_LAYOUT_PATH)) {
    return bundled;
  }
  try {
    const user = JSON.parse(readFileSync(USER_LAYOUT_PATH, "utf8")) as ClusterLayoutFile;
    return {
      genre: { ...bundled.genre, ...(user.genre ?? {}) },
      playlist: { ...bundled.playlist, ...(user.playlist ?? {}) },
    };
  } catch {
    return bundled;
  }
};

export const writeClusterLayoutFile = (layout: ClusterLayoutFile): void => {
  mkdirSync(path.dirname(USER_LAYOUT_PATH), { recursive: true });
  writeFileSync(USER_LAYOUT_PATH, `${JSON.stringify(layout, null, 2)}\n`, "utf8");
};
