import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CLUSTER_LAYOUT_PATH = path.resolve(__dirname, "../src/data/cluster-layout.json");

export type ClusterLayoutFile = {
  genre: Record<string, { x: number; y: number }>;
  playlist: Record<string, { x: number; y: number }>;
};

const emptyClusterLayout = (): ClusterLayoutFile => ({
  genre: {},
  playlist: {},
});

export const readClusterLayoutFile = (): ClusterLayoutFile => {
  if (!existsSync(CLUSTER_LAYOUT_PATH)) {
    return emptyClusterLayout();
  }
  try {
    return JSON.parse(readFileSync(CLUSTER_LAYOUT_PATH, "utf8")) as ClusterLayoutFile;
  } catch {
    return emptyClusterLayout();
  }
};

export const writeClusterLayoutFile = (layout: ClusterLayoutFile): void => {
  mkdirSync(path.dirname(CLUSTER_LAYOUT_PATH), { recursive: true });
  writeFileSync(CLUSTER_LAYOUT_PATH, `${JSON.stringify(layout, null, 2)}\n`, "utf8");
};
