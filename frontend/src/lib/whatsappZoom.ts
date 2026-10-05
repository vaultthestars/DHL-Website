import type { CSSProperties } from "react";
import {
  keywordHeatColor,
  type ChatAttachment,
  type ScannedMessage,
} from "./whatsappParse";

export type GrayInnerItem =
  | { type: "message"; message: ScannedMessage }
  | { type: "status-run"; id: string; messages: ScannedMessage[] };

export type StreamBlock =
  | {
      type: "flagged";
      id: string;
      messages: ScannedMessage[];
      startIndex: number;
      endIndex: number;
    }
  | {
      type: "gray";
      id: string;
      messages: ScannedMessage[];
      inner: GrayInnerItem[];
      startIndex: number;
      endIndex: number;
    };

type AtomicRun =
  | {
      kind: "F";
      messages: ScannedMessage[];
      startIndex: number;
      endIndex: number;
    }
  | {
      kind: "G";
      messages: ScannedMessage[];
      startIndex: number;
      endIndex: number;
    };

export type HitFilters = {
  keyword: boolean;
  location: boolean;
  media: boolean;
};

export const DEFAULT_HIT_FILTERS: HitFilters = {
  keyword: true,
  location: true,
  media: true,
};

export function isFlaggedMessage(
  message: ScannedMessage,
  filters: HitFilters = DEFAULT_HIT_FILTERS
): boolean {
  if (message.isSystem) {
    return false;
  }
  if (filters.keyword && message.keywordScore > 0) {
    return true;
  }
  if (filters.location && message.locationHits.length > 0) {
    return true;
  }
  if (
    filters.media &&
    (message.mediaHits.length > 0 || message.attachmentNames.length > 0)
  ) {
    return true;
  }
  return false;
}

function buildGrayInner(messages: ScannedMessage[]): GrayInnerItem[] {
  const inner: GrayInnerItem[] = [];
  let index = 0;
  while (index < messages.length) {
    if (!messages[index].isSystem) {
      inner.push({ type: "message", message: messages[index] });
      index += 1;
      continue;
    }
    const start = index;
    index += 1;
    while (index < messages.length && messages[index].isSystem) {
      index += 1;
    }
    const group = messages.slice(start, index);
    if (group.length >= 2) {
      inner.push({
        type: "status-run",
        id: `status-${group[0].id}-${group[group.length - 1].id}`,
        messages: group,
      });
    } else {
      inner.push({ type: "message", message: group[0] });
    }
  }
  return inner;
}

function toStreamBlock(run: AtomicRun): StreamBlock {
  if (run.kind === "F") {
    return {
      type: "flagged",
      id: `flag-${run.messages[0].id}-${run.messages[run.messages.length - 1].id}-${run.startIndex}-${run.endIndex}`,
      messages: run.messages,
      startIndex: run.startIndex,
      endIndex: run.endIndex,
    };
  }
  return {
    type: "gray",
    id: `gray-${run.messages[0].id}-${run.messages[run.messages.length - 1].id}-${run.startIndex}-${run.endIndex}`,
    messages: run.messages,
    inner: buildGrayInner(run.messages),
    startIndex: run.startIndex,
    endIndex: run.endIndex,
  };
}

/** Level-0 atomic runs: each flagged message alone, consecutive gray (quiet+status) grouped. */
export function buildAtomicRuns(
  messages: ScannedMessage[],
  filters: HitFilters = DEFAULT_HIT_FILTERS
): AtomicRun[] {
  const runs: AtomicRun[] = [];
  let index = 0;
  while (index < messages.length) {
    if (isFlaggedMessage(messages[index], filters)) {
      runs.push({
        kind: "F",
        messages: [messages[index]],
        startIndex: index,
        endIndex: index,
      });
      index += 1;
      continue;
    }
    const start = index;
    index += 1;
    while (index < messages.length && !isFlaggedMessage(messages[index], filters)) {
      index += 1;
    }
    const group = messages.slice(start, index);
    runs.push({
      kind: "G",
      messages: group,
      startIndex: start,
      endIndex: index - 1,
    });
  }
  return runs;
}

/**
 * Zoom level L:
 * - 0: no flagged merging (expanded-like: flagged cards + gray stretches)
 * - 1: merge consecutive flagged (gray gap ≤ 0)
 * - 2: merge flagged clusters separated by ≤ 1 gray unit
 * - L: merge when intervening gray message count ≤ L - 1
 */
export function mergeThresholdForLevel(level: number): number {
  const discrete = Math.max(0, Math.floor(level));
  return discrete === 0 ? -1 : discrete - 1;
}

export function mergeRunsAtThreshold(
  runs: AtomicRun[],
  threshold: number
): AtomicRun[] {
  if (threshold < 0) {
    return runs;
  }

  const merged: AtomicRun[] = [];
  let index = 0;
  while (index < runs.length) {
    const current = runs[index];
    if (current.kind !== "F") {
      merged.push(current);
      index += 1;
      continue;
    }

    const acc: AtomicRun = {
      kind: "F",
      messages: [...current.messages],
      startIndex: current.startIndex,
      endIndex: current.endIndex,
    };
    index += 1;

    while (index < runs.length) {
      const next = runs[index];
      if (next.kind === "F") {
        acc.messages.push(...next.messages);
        acc.endIndex = next.endIndex;
        index += 1;
        continue;
      }

      const gap = next.messages.length;
      const following = runs[index + 1];
      if (following && following.kind === "F" && gap <= threshold) {
        acc.messages.push(...next.messages, ...following.messages);
        acc.endIndex = following.endIndex;
        index += 2;
        continue;
      }
      break;
    }

    merged.push(acc);
  }

  return merged;
}

export function buildStreamBlocks(
  messages: ScannedMessage[],
  level: number,
  filters: HitFilters = DEFAULT_HIT_FILTERS
): StreamBlock[] {
  const atomic = buildAtomicRuns(messages, filters);
  const merged = mergeRunsAtThreshold(atomic, mergeThresholdForLevel(level));
  return merged.map(toStreamBlock);
}

export function maxZoomLevel(
  messages: ScannedMessage[],
  filters: HitFilters = DEFAULT_HIT_FILTERS
): number {
  const atomic = buildAtomicRuns(messages, filters);
  let maxGap = 0;
  for (let index = 0; index < atomic.length; index += 1) {
    const run = atomic[index];
    if (
      run.kind === "G" &&
      index > 0 &&
      index < atomic.length - 1 &&
      atomic[index - 1].kind === "F" &&
      atomic[index + 1].kind === "F"
    ) {
      maxGap = Math.max(maxGap, run.messages.length);
    }
  }
  return Math.max(0, maxGap + 1);
}

function blockSignature(blocks: StreamBlock[]): string {
  return blocks
    .map((block) => `${block.type}:${block.startIndex}-${block.endIndex}`)
    .join("|");
}

/**
 * Raw zoom levels where each step actually changes the merge structure.
 * Slider indices map 1:1 onto this list — no flat stretches.
 */
export function buildMeaningfulZoomLevels(
  messages: ScannedMessage[],
  filters: HitFilters = DEFAULT_HIT_FILTERS
): number[] {
  const max = maxZoomLevel(messages, filters);
  const levels: number[] = [0];
  let previous = blockSignature(buildStreamBlocks(messages, 0, filters));
  for (let level = 1; level <= max; level += 1) {
    const signature = blockSignature(buildStreamBlocks(messages, level, filters));
    if (signature !== previous) {
      levels.push(level);
      previous = signature;
    }
  }
  return levels;
}

export function stepIndexForRawLevel(
  meaningfulLevels: number[],
  rawLevel: number
): number {
  let best = 0;
  for (let index = 0; index < meaningfulLevels.length; index += 1) {
    if (meaningfulLevels[index] <= rawLevel) {
      best = index;
    }
  }
  return best;
}

/** Highest detail level below current where the span splits into multiple blocks. */
export function findSplitLevel(
  messages: ScannedMessage[],
  startIndex: number,
  endIndex: number,
  currentLevel: number,
  filters: HitFilters = DEFAULT_HIT_FILTERS
): number {
  const from = Math.max(0, Math.floor(currentLevel));
  for (let level = from - 1; level >= 0; level -= 1) {
    const blocks = buildStreamBlocks(messages, level, filters);
    const overlapping = blocks.filter(
      (block) => block.startIndex <= endIndex && block.endIndex >= startIndex
    );
    if (overlapping.length >= 2) {
      return level;
    }
  }
  return 0;
}

export function minimapChipWeight(message: ScannedMessage): number {
  if (message.isSystem) {
    return 1;
  }
  if (message.keywordScore > 0) {
    return message.keywordScore >= 2 || message.hitTypes.length >= 2 ? 3 : 2;
  }
  if (message.locationHits.length > 0) {
    return 2;
  }
  if (message.mediaHits.length > 0 || message.attachmentNames.length > 0) {
    return 2;
  }
  return 1;
}

export function collectBlockMedia(
  messages: ScannedMessage[],
  attachmentMap: Record<string, ChatAttachment>
): ChatAttachment[] {
  const seen = new Set<string>();
  const media: ChatAttachment[] = [];
  for (const message of messages) {
    for (const name of message.attachmentNames) {
      const attachment = attachmentMap[name];
      if (!attachment || seen.has(attachment.name)) {
        continue;
      }
      if (
        attachment.kind === "image" ||
        attachment.kind === "video"
      ) {
        seen.add(attachment.name);
        media.push(attachment);
      }
    }
  }
  return media;
}

export function clusterStyle(
  messages: ScannedMessage[],
  filters: HitFilters = DEFAULT_HIT_FILTERS
): CSSProperties {
  let maxKeywordScore = 0;
  let hasLocation = false;
  let hasMedia = false;
  for (const message of messages) {
    if (!isFlaggedMessage(message, filters)) {
      continue;
    }
    if (filters.keyword) {
      maxKeywordScore = Math.max(maxKeywordScore, message.keywordScore);
    }
    if (filters.location && message.locationHits.length) hasLocation = true;
    if (
      filters.media &&
      (message.mediaHits.length || message.attachmentNames.length)
    ) {
      hasMedia = true;
    }
  }

  if (maxKeywordScore > 0) {
    return {
      background: keywordHeatColor(maxKeywordScore),
      borderColor: hasLocation ? "#4da3ff" : hasMedia ? "#c084fc" : "rgba(0,0,0,0.25)",
      color: "#1a1208",
    };
  }
  if (hasLocation) {
    return {
      background: "hsla(210, 90%, 62%, 0.72)",
      borderColor: hasMedia ? "#c084fc" : "rgba(0,0,0,0.2)",
      color: "#081018",
    };
  }
  if (hasMedia) {
    return {
      background: "hsla(280, 70%, 62%, 0.7)",
      borderColor: "rgba(0,0,0,0.2)",
      color: "#120818",
    };
  }
  return {
    background: "#2a2a2a",
    borderColor: "#555",
    color: "#f2f2f2",
  };
}
