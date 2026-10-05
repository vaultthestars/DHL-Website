export type GraphNode = {
  id: string;
  letter: string;
  isWordEnd: boolean;
  isRoot: boolean;
  /** Min steps from root. */
  depthFromStart: number;
  /** Min steps to a word-end (0 if this node ends a word). */
  depthToEnd: number;
};

export type GraphEdge = {
  id: string;
  fromId: string;
  toId: string;
  /** How many accepted words traverse this edge. */
  weight: number;
};

export type LetterGraph = {
  nodes: GraphNode[];
  edges: GraphEdge[];
};

type RawNode = {
  letter: string;
  isWordEnd: boolean;
  /** Words that pass through this node. */
  passCount: number;
  children: Map<string, RawNode>;
};

function createRaw(letter: string): RawNode {
  return { letter, isWordEnd: false, passCount: 0, children: new Map() };
}

function insertIntoTrie(root: RawNode, word: string): void {
  let node = root;
  root.passCount += 1;
  for (let index = 0; index < word.length; index += 1) {
    const letter = word[index];
    let child = node.children.get(letter);
    if (!child) {
      child = createRaw(letter);
      node.children.set(letter, child);
    }
    child.passCount += 1;
    node = child;
  }
  node.isWordEnd = true;
}

function buildPrefixTrie(words: string[]): RawNode {
  const root = createRaw("");
  for (const word of words) {
    const normalized = word.trim().toUpperCase();
    if (normalized.length > 3) {
      insertIntoTrie(root, normalized);
    }
  }
  return root;
}

/** Unminimized prefix forest → graph (one tree per starting letter, no shared root). */
export function buildPrefixGraph(words: string[]): LetterGraph {
  const root = buildPrefixTrie(words);
  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];
  const depthToEnd = new Map<RawNode, number>();

  const computeDepthToEnd = (node: RawNode): number => {
    if (depthToEnd.has(node)) {
      return depthToEnd.get(node)!;
    }
    let best = node.isWordEnd ? 0 : Number.POSITIVE_INFINITY;
    Array.from(node.children.values()).forEach((child) => {
      best = Math.min(best, 1 + computeDepthToEnd(child));
    });
    if (!Number.isFinite(best)) {
      best = 0;
    }
    depthToEnd.set(node, best);
    return best;
  };
  computeDepthToEnd(root);

  let counter = 0;
  const visit = (node: RawNode, id: string, depth: number) => {
    nodes.push({
      id,
      letter: node.letter,
      isWordEnd: node.isWordEnd,
      isRoot: false,
      depthFromStart: depth,
      depthToEnd: depthToEnd.get(node) ?? 0,
    });
    const kids = Array.from(node.children.entries()).sort((a, b) =>
      a[0].localeCompare(b[0])
    );
    for (const [, child] of kids) {
      const childId = `p${counter++}`;
      edges.push({
        id: `${id}->${childId}`,
        fromId: id,
        toId: childId,
        weight: Math.max(1, child.passCount),
      });
      visit(child, childId, depth + 1);
    }
  };

  // Each first letter is its own cluster root — no shared empty root node.
  const starts = Array.from(root.children.entries()).sort((a, b) =>
    a[0].localeCompare(b[0])
  );
  for (const [, child] of starts) {
    const startId = `p${counter++}`;
    visit(child, startId, 0);
  }

  return { nodes, edges };
}

/**
 * DAWG-style minimization: share prefixes (via trie) and suffixes
 * (via merging nodes with identical continuation signatures).
 */
export function buildConsolidateGraph(words: string[]): LetterGraph {
  const root = buildPrefixTrie(words);
  const registry = new Map<string, string>();
  const nodeById = new Map<string, GraphNode>();
  const edgeSet = new Map<string, GraphEdge>();
  const childIdsByNode = new Map<string, Array<{ letter: string; childId: string }>>();
  let nextId = 0;

  const process = (node: RawNode, isRoot: boolean): string => {
    const kidEntries = Array.from(node.children.entries()).sort((a, b) =>
      a[0].localeCompare(b[0])
    );
    const childPairs = kidEntries.map(([letter, child]) => {
      const childId = process(child, false);
      return { letter, childId };
    });
    const sig = isRoot
      ? `ROOT|${childPairs.map((p) => `${p.letter}>${p.childId}`).join(",")}`
      : `${node.letter}|${node.isWordEnd ? 1 : 0}|${childPairs
          .map((p) => `${p.letter}>${p.childId}`)
          .join(",")}`;

    const existing = registry.get(sig);
    if (existing) {
      return existing;
    }

    const id = isRoot ? "root" : `d${nextId++}`;
    registry.set(sig, id);
    nodeById.set(id, {
      id,
      letter: node.letter,
      isWordEnd: node.isWordEnd,
      isRoot,
      depthFromStart: 0,
      depthToEnd: 0,
    });
    childIdsByNode.set(id, childPairs);
    for (const pair of childPairs) {
      const edgeId = `${id}->${pair.childId}`;
      if (!edgeSet.has(edgeId)) {
        edgeSet.set(edgeId, {
          id: edgeId,
          fromId: id,
          toId: pair.childId,
          weight: 1,
        });
      }
    }
    return id;
  };

  process(root, true);

  // Count how many typed words traverse each minimized edge.
  edgeSet.forEach((edge) => {
    edge.weight = 0;
  });
  for (const raw of words) {
    const word = raw.trim().toUpperCase();
    if (word.length <= 3) {
      continue;
    }
    let id = "root";
    for (const letter of word) {
      const kids = childIdsByNode.get(id) || [];
      const next = kids.find((kid) => kid.letter === letter);
      if (!next) {
        break;
      }
      const edgeId = `${id}->${next.childId}`;
      const edge = edgeSet.get(edgeId);
      if (edge) {
        edge.weight += 1;
      }
      id = next.childId;
    }
  }
  edgeSet.forEach((edge) => {
    if (edge.weight < 1) {
      edge.weight = 1;
    }
  });

  // Depth from start (BFS)
  const depthFromStart = new Map<string, number>();
  depthFromStart.set("root", 0);
  const queue = ["root"];
  while (queue.length) {
    const id = queue.shift()!;
    const depth = depthFromStart.get(id) ?? 0;
    const kids = childIdsByNode.get(id) || [];
    for (const kid of kids) {
      if (!depthFromStart.has(kid.childId)) {
        depthFromStart.set(kid.childId, depth + 1);
        queue.push(kid.childId);
      }
    }
  }

  // Depth to nearest word-end (reverse relax)
  const depthToEnd = new Map<string, number>();
  Array.from(nodeById.values()).forEach((node) => {
    depthToEnd.set(node.id, node.isWordEnd ? 0 : Number.POSITIVE_INFINITY);
  });
  let changed = true;
  while (changed) {
    changed = false;
    Array.from(edgeSet.values()).forEach((edge) => {
      const childDist = depthToEnd.get(edge.toId) ?? Number.POSITIVE_INFINITY;
      if (!Number.isFinite(childDist)) {
        return;
      }
      const next = childDist + 1;
      const current = depthToEnd.get(edge.fromId) ?? Number.POSITIVE_INFINITY;
      if (next < current) {
        depthToEnd.set(edge.fromId, next);
        changed = true;
      }
    });
  }

  const nodes = Array.from(nodeById.values()).map((node) => ({
    ...node,
    depthFromStart: depthFromStart.get(node.id) ?? 0,
    depthToEnd: Number.isFinite(depthToEnd.get(node.id))
      ? (depthToEnd.get(node.id) as number)
      : 0,
  }));

  // Omit root→start edges so beginning letters aren't tied to the cylinder axis.
  const edges = Array.from(edgeSet.values()).filter(
    (edge) => edge.fromId !== "root"
  );

  return { nodes, edges };
}

export type WordPath = {
  nodeIds: string[];
  edgeIds: string[];
};

/** Walk a word through the current letter graph (prefix forest or DAWG). */
export function findWordPath(graph: LetterGraph, word: string): WordPath {
  const normalized = word.trim().toUpperCase();
  if (!normalized) {
    return { nodeIds: [], edgeIds: [] };
  }

  const byId = new Map(graph.nodes.map((node) => [node.id, node]));
  const outgoing = new Map<
    string,
    Array<{ edgeId: string; toId: string; letter: string }>
  >();
  const hasIncoming = new Set<string>();
  graph.edges.forEach((edge) => {
    const to = byId.get(edge.toId);
    if (!to) {
      return;
    }
    const list = outgoing.get(edge.fromId) || [];
    list.push({ edgeId: edge.id, toId: edge.toId, letter: to.letter });
    outgoing.set(edge.fromId, list);
    hasIncoming.add(edge.toId);
  });

  // Prefix cluster roots and consolidate start letters both have no incoming edges.
  const start = graph.nodes.find(
    (node) =>
      !node.isRoot &&
      !hasIncoming.has(node.id) &&
      node.letter === normalized[0]
  );
  if (!start) {
    return { nodeIds: [], edgeIds: [] };
  }

  const nodeIds = [start.id];
  const edgeIds: string[] = [];
  let current = start.id;

  for (let index = 1; index < normalized.length; index += 1) {
    const letter = normalized[index];
    const next = (outgoing.get(current) || []).find(
      (kid) => kid.letter === letter
    );
    if (!next) {
      return { nodeIds, edgeIds };
    }
    edgeIds.push(next.edgeId);
    nodeIds.push(next.toId);
    current = next.toId;
  }

  return { nodeIds, edgeIds };
}

/**
 * NYT Spelling Bee word-list paste often concatenates each word with itself
 * ("plantplant", "implantimplant (pangram)"). Recover the real word.
 */
export function normalizeDumpedWord(token: string): string {
  let text = token.trim();
  if (!text) {
    return "";
  }
  text = text.replace(/\(\s*pangram\s*\)/gi, "");
  text = text.replace(/[^a-zA-Z]/g, "").toUpperCase();
  if (text.length >= 8 && text.length % 2 === 0) {
    const half = text.length / 2;
    const left = text.slice(0, half);
    const right = text.slice(half);
    if (left === right) {
      return left;
    }
  }
  return text;
}

/** Parse a typed word or an NYT-style multi-word dump into unique candidates. */
export function parseWordDump(raw: string): string[] {
  const parts = raw.split(/[\s,;|/]+/).filter(Boolean);
  const words: string[] = [];
  const seen = new Set<string>();
  for (const part of parts) {
    const word = normalizeDumpedWord(part);
    if (word.length < 4 || seen.has(word)) {
      continue;
    }
    seen.add(word);
    words.push(word);
  }
  return words;
}

export function wordUsesOnlyHive(word: string, letters: string[]): boolean {
  const allowed = new Set(letters.map((letter) => letter.toUpperCase()));
  for (const char of word.toUpperCase()) {
    if (!allowed.has(char)) {
      return false;
    }
  }
  return true;
}

export function isPangram(word: string, letters: string[]): boolean {
  const used = new Set(word.toUpperCase().split(""));
  return letters.every((letter) => used.has(letter.toUpperCase()));
}

/** Hive slot centers matching the left honeycomb visualizer layout. */
export function hiveLayoutCenters(
  letters: string[],
  centerIndex: number,
  originX: number,
  originY: number,
  ring: number
): Map<string, { x: number; y: number }> {
  const centers = new Map<string, { x: number; y: number }>();
  if (!letters.length) {
    return centers;
  }
  const centerLetter = letters[centerIndex];
  if (centerLetter) {
    centers.set(centerLetter.toUpperCase(), { x: originX, y: originY });
  }
  const outerIndices = letters
    .map((_, index) => index)
    .filter((index) => index !== centerIndex);
  outerIndices.forEach((index, order) => {
    const letter = letters[index];
    if (!letter) {
      return;
    }
    // Same convention as the sidebar honeycomb: first outer at top (-90°).
    const angle = (Math.PI / 180) * (60 * order - 90);
    centers.set(letter.toUpperCase(), {
      x: originX + ring * Math.cos(angle),
      y: originY + ring * Math.sin(angle),
    });
  });
  return centers;
}

/**
 * Soft layout anchors for prefix mode: seven separate letter clusters in a
 * honeycomb matching the hive visualizer. Cluster spacing grows with the
 * longest discovered word so neighboring trees stay clear of each other.
 */
export function prefixAnchors(
  graph: LetterGraph,
  hiveLetters: string[],
  centerIndex: number,
  width: number,
  height: number,
  longestWordLen = 4
): Map<string, { x: number; y: number; z: number }> {
  const anchors = new Map<string, { x: number; y: number; z: number }>();
  const byId = new Map(graph.nodes.map((node) => [node.id, node]));
  const children = new Map<string, string[]>();
  const parent = new Map<string, string>();
  graph.edges.forEach((edge) => {
    const list = children.get(edge.fromId) || [];
    list.push(edge.toId);
    children.set(edge.fromId, list);
    parent.set(edge.toId, edge.fromId);
  });

  const originX = width * 0.5;
  const originY = height * 0.48;
  const longest = Math.max(4, longestWordLen);
  // Per-letter radial step inside a cluster; ring grows so clusters don't overlap.
  const radiusStep = 34 + longest * 1.5;
  const clusterExtent = longest * radiusStep;
  const ring = Math.max(
    clusterExtent * 2.15,
    Math.min(width, height) * (0.14 + 0.04 * longest)
  );
  const clusterCenters = hiveLayoutCenters(
    hiveLetters,
    centerIndex,
    originX,
    originY,
    ring
  );

  const leafWeight = (id: string): number => {
    const kids = children.get(id) || [];
    if (!kids.length) {
      return 1;
    }
    return kids.reduce((sum, kid) => sum + leafWeight(kid), 0);
  };

  const clusterRoots = graph.nodes.filter((node) => !parent.has(node.id));

  clusterRoots.forEach((start) => {
    const hub = clusterCenters.get(start.letter.toUpperCase()) || {
      x: originX,
      y: originY,
    };

    const place = (id: string, spanStart: number, spanEnd: number) => {
      const node = byId.get(id);
      if (!node) {
        return;
      }
      if (node.depthFromStart === 0) {
        anchors.set(id, { x: hub.x, y: hub.y, z: 0 });
      } else {
        const mid = (spanStart + spanEnd) / 2;
        const radius = node.depthFromStart * radiusStep;
        anchors.set(id, {
          x: hub.x + Math.sin(mid) * radius,
          y: hub.y + Math.cos(mid) * radius,
          z: 0,
        });
      }
      const kids = (children.get(id) || []).slice().sort((a, b) => {
        const la = byId.get(a)?.letter || "";
        const lb = byId.get(b)?.letter || "";
        return la.localeCompare(lb);
      });
      if (!kids.length) {
        return;
      }
      const weights = kids.map(leafWeight);
      const total = weights.reduce((sum, weight) => sum + weight, 0) || 1;
      const span = spanEnd - spanStart;
      let cursor = spanStart;
      kids.forEach((kid, index) => {
        const slice = (span * weights[index]) / total;
        place(kid, cursor, cursor + slice);
        cursor += slice;
      });
    };

    place(start.id, -Math.PI * 0.75, Math.PI * 0.75);
  });

  return anchors;
}

/** True for rail letters: first letters (top) or word endings (bottom). */
export function isCylinderRailNode(node: {
  isRoot: boolean;
  depthFromStart: number;
  depthToEnd: number;
  isWordEnd: boolean;
}): boolean {
  if (node.isRoot) {
    return true;
  }
  if (node.depthFromStart <= 1) {
    return true;
  }
  if (node.isWordEnd || node.depthToEnd <= 0) {
    return true;
  }
  return false;
}

/** Evenly spaced rim angles for hive letters (top-ring / start order). */
export function startLetterAngles(hiveLetters: string[]): Map<string, number> {
  const angles = new Map<string, number>();
  const n = Math.max(hiveLetters.length, 1);
  hiveLetters.forEach((letter, index) => {
    if (!letter) {
      return;
    }
    angles.set(letter.toUpperCase(), (index / n) * Math.PI * 2);
  });
  return angles;
}

/**
 * Order ending letters to reduce crossings: each ending gets a weighted sum of
 * start-letter radial vectors (one vote per word that starts at S and ends at E),
 * then endings are sorted by that vector's angle.
 */
export function endingLetterOrder(
  words: string[],
  hiveLetters: string[],
  startAngles: Map<string, number>
): string[] {
  const vectors = new Map<string, { x: number; y: number }>();
  hiveLetters.forEach((letter) => {
    if (letter) {
      vectors.set(letter.toUpperCase(), { x: 0, y: 0 });
    }
  });

  for (const raw of words) {
    const word = raw.trim().toUpperCase();
    if (word.length <= 3) {
      continue;
    }
    const start = word[0];
    const end = word[word.length - 1];
    const angle = startAngles.get(start);
    const vec = vectors.get(end);
    if (angle == null || !vec) {
      continue;
    }
    vec.x += Math.cos(angle);
    vec.y += Math.sin(angle);
  }

  const sortKey = (letter: string) => {
    const upper = letter.toUpperCase();
    const vec = vectors.get(upper) || { x: 0, y: 0 };
    if (Math.abs(vec.x) < 1e-9 && Math.abs(vec.y) < 1e-9) {
      // Unused endings keep their start-rim angle as a stable fallback.
      return startAngles.get(upper) ?? 0;
    }
    return Math.atan2(vec.y, vec.x);
  };

  return hiveLetters
    .filter((letter) => letter.length > 0)
    .slice()
    .sort((a, b) => sortKey(a) - sortKey(b));
}

/** Bottom-rim angles after crossing-reduction order + optional twist (radians). */
export function endingLetterAngles(
  words: string[],
  hiveLetters: string[],
  bottomTwist = 0
): Map<string, number> {
  const startAngles = startLetterAngles(hiveLetters);
  const order = endingLetterOrder(words, hiveLetters, startAngles);
  const angles = new Map<string, number>();
  const n = Math.max(order.length, 1);
  order.forEach((letter, index) => {
    angles.set(letter.toUpperCase(), (index / n) * Math.PI * 2 + bottomTwist);
  });
  return angles;
}

/**
 * Layout anchors on a cylinder. Only starting letters (top ring) and ending
 * letters (bottom ring) are pinned to a hive-letter seventh. Intermediate
 * letters get a soft vertical target only — no angular pull.
 *
 * Bottom pin order is chosen to reduce path crossings; `bottomTwist` rotates
 * that whole bottom arrangement.
 */
export function cylinderAnchors(
  graph: LetterGraph,
  hiveLetters: string[],
  radius: number,
  halfHeight: number,
  words: string[] = [],
  bottomTwist = 0
): Map<string, { x: number; y: number; z: number }> {
  const anchors = new Map<string, { x: number; y: number; z: number }>();
  const topAngle = startLetterAngles(hiveLetters);
  const bottomAngle = endingLetterAngles(words, hiveLetters, bottomTwist);

  const fallbackAngle = (fallbackId: string) => {
    let hash = 0;
    for (let i = 0; i < fallbackId.length; i += 1) {
      hash = (hash * 31 + fallbackId.charCodeAt(i)) | 0;
    }
    return ((hash % 360) / 360) * Math.PI * 2;
  };

  graph.nodes.forEach((node) => {
    if (node.isRoot) {
      anchors.set(node.id, { x: 0, y: halfHeight, z: 0 });
      return;
    }

    const span = node.depthFromStart + node.depthToEnd;
    const progress = span <= 0 ? 0 : node.depthFromStart / span;
    const y = halfHeight * (1 - 2 * progress);
    const isStart = node.depthFromStart <= 1;
    const isEnd = node.isWordEnd || node.depthToEnd <= 0;

    if (isStart || isEnd) {
      const letter = node.letter.toUpperCase();
      const phi = isStart
        ? topAngle.get(letter) ?? fallbackAngle(node.id)
        : bottomAngle.get(letter) ?? fallbackAngle(node.id) + bottomTwist;
      anchors.set(node.id, {
        x: radius * Math.cos(phi),
        y: isStart ? halfHeight : -halfHeight,
        z: radius * Math.sin(phi),
      });
      return;
    }

    // Intermediate: soft vertical target only. Place on the wall at a stable
    // non-letter angle so new nodes spawn on-surface, then physics leaves xz free.
    const phi = fallbackAngle(node.id);
    anchors.set(node.id, {
      x: radius * Math.cos(phi),
      y,
      z: radius * Math.sin(phi),
    });
  });

  return anchors;
}

