#!/usr/bin/env node
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outputPath = path.resolve(__dirname, "../src/data/cluster-layout.json");

const chromeStorageRoots = [
  path.join(os.homedir(), "Library/Application Support/Google/Chrome/Default/Local Storage/leveldb"),
  path.join(os.homedir(), "Library/Application Support/Arc/User Data/Default/Local Storage/leveldb"),
];

const entryPattern =
  /"((?:[^"\\]|\\.)*)"\s*:\s*\{\s*"x"\s*:\s*([-0-9.eE]+)\s*,\s*"y"\s*:\s*([-0-9.eE]+)\s*\}/g;
const playlistIdPattern = /^[0-9A-F]{16}$/;

const extractFromBlob = (data) => {
  const text = data.toString("utf8");
  const genre = {};
  const playlist = {};

  for (const match of text.matchAll(entryPattern)) {
    const key = match[1];
    if (![...key].every((character) => character.charCodeAt(0) >= 32 && character.charCodeAt(0) < 127)) {
      continue;
    }
    const value = { x: Number(match[2]), y: Number(match[3]) };
    if (key === "__unassigned__" || playlistIdPattern.test(key)) {
      playlist[key] = value;
    } else {
      genre[key] = value;
    }
  }

  return { genre, playlist };
};

const mergeLayouts = (target, source) => {
  Object.assign(target.genre, source.genre);
  Object.assign(target.playlist, source.playlist);
};

const readChromeClusterLayout = () => {
  const merged = { genre: {}, playlist: {} };
  for (const root of chromeStorageRoots) {
    if (!existsSync(root)) {
      continue;
    }
    for (const fileName of readdirSync(root)) {
      if (!fileName.endsWith(".ldb") && !fileName.endsWith(".log")) {
        continue;
      }
      const data = readFileSync(path.join(root, fileName));
      if (!data.includes("music-cue")) {
        continue;
      }
      mergeLayouts(merged, extractFromBlob(data));
    }
  }
  return merged;
};

const layout = readChromeClusterLayout();
mkdirSync(path.dirname(outputPath), { recursive: true });
writeFileSync(outputPath, `${JSON.stringify(layout, null, 2)}\n`, "utf8");

console.log(`Wrote ${outputPath}`);
console.log(`  genre clusters: ${Object.keys(layout.genre).length}`);
console.log(`  playlist clusters: ${Object.keys(layout.playlist).length}`);
