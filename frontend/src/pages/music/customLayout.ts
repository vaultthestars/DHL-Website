import { NormalizedPoint } from "./types";

const CUSTOM_LAYOUT_KEY = "music-cue-custom-layout";
const LAYOUT_MODE_KEY = "music-cue-layout-mode";

export type StoredLayoutMode = "auto-sort" | "custom";

export const loadLayoutMode = (): StoredLayoutMode => {
  const stored = localStorage.getItem(LAYOUT_MODE_KEY);
  return stored === "custom" ? "custom" : "auto-sort";
};

export const saveLayoutMode = (mode: StoredLayoutMode): void => {
  localStorage.setItem(LAYOUT_MODE_KEY, mode);
};

export const loadCustomPositions = (): Record<string, NormalizedPoint> => {
  try {
    const stored = localStorage.getItem(CUSTOM_LAYOUT_KEY);
    if (!stored) {
      return {};
    }
    return JSON.parse(stored) as Record<string, NormalizedPoint>;
  } catch {
    return {};
  }
};

export const saveCustomPositions = (positions: Record<string, NormalizedPoint>): void => {
  localStorage.setItem(CUSTOM_LAYOUT_KEY, JSON.stringify(positions, null, 2));
};

export const exportCustomLayoutJson = (positions: Record<string, NormalizedPoint>): string =>
  JSON.stringify(positions, null, 2);
