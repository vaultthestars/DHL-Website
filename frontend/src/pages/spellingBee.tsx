import React, { useEffect, useMemo, useRef, useState } from "react";
import { pagesetter, reactvar } from "../App";
import { PageHeader } from "../components/PageHeader";
import { Viewport } from "../hooks/useWindowSize";
import {
  birthStrength,
  clampInsideCylinder,
  projectToCylinderSurface,
  rotateX,
  rotateY,
  sampleCylinderSurfaceArc,
  stepSimulation,
  syncSimulation,
  unrotate,
  type SimEdge,
  type SimNode,
} from "../lib/spellingBeePhysics";
import {
  buildConsolidateGraph,
  buildPrefixGraph,
  cylinderAnchors,
  endingLetterAngles,
  findWordPath,
  isCylinderRailNode,
  isPangram,
  parseWordDump,
  prefixAnchors,
  startLetterAngles,
  wordUsesOnlyHive,
} from "../lib/spellingBeeTrie";
import "./subpages.css";

type Point = { x: number; y: number };
type ViewMode = "prefix" | "consolidate";

const EMPTY_LETTERS = ["", "", "", "", "", "", ""];

function normalizeLetter(value: string): string {
  return value.replace(/[^a-zA-Z]/g, "").slice(0, 1).toUpperCase();
}

function hexPoints(cx: number, cy: number, radius: number): string {
  const points: string[] = [];
  for (let i = 0; i < 6; i += 1) {
    const angle = (Math.PI / 180) * (60 * i - 30);
    points.push(`${cx + radius * Math.cos(angle)},${cy + radius * Math.sin(angle)}`);
  }
  return points.join(" ");
}

const SpellingBeePage = ({ setPage }: { setPage: pagesetter }) => {
  const [letters, setLetters] = useState<string[]>([...EMPTY_LETTERS]);
  const [centerIndex, setCenterIndex] = useState(0);
  const [hiveReady, setHiveReady] = useState(false);
  const [draft, setDraft] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [statusTone, setStatusTone] = useState<"ok" | "err" | "info">("info");
  const [foundWords, setFoundWords] = useState<string[]>([]);
  const [selectedWord, setSelectedWord] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>("prefix");
  const [surfaceConstrained, setSurfaceConstrained] = useState(false);
  const [cylinderWidthScale, setCylinderWidthScale] = useState(1);
  const [cylinderHeightScale, setCylinderHeightScale] = useState(1);
  const [cylinderTwistDeg, setCylinderTwistDeg] = useState(0);
  const treeWrapRef = useRef<HTMLDivElement | null>(null);
  const [treeSize, setTreeSize] = useState({ width: 720, height: 520 });
  const letterInputRefs = useRef<Array<HTMLInputElement | null>>([]);

  const simRef = useRef<SimNode[]>([]);
  const edgesRef = useRef<SimEdge[]>([]);
  const [frameNodes, setFrameNodes] = useState<SimNode[]>([]);
  const [frameEdges, setFrameEdges] = useState<SimEdge[]>([]);
  const rotRef = useRef({ yaw: 0.55, pitch: -0.25 });
  const panRef = useRef({ x: 0, y: 0 });
  const zoomRef = useRef(1);
  /** 0 = free volume, 1 = fully surface-constrained (eased toward checkbox). */
  const surfaceBlendRef = useRef(0);
  const [viewTick, setViewTick] = useState(0);
  const draggingIdsRef = useRef<Set<string>>(new Set());
  const dragRef = useRef<{
    kind: "pan" | "rotate" | "node" | null;
    id: string | null;
    lastX: number;
    lastY: number;
    pointerId: number | null;
  }>({ kind: null, id: null, lastX: 0, lastY: 0, pointerId: null });
  const svgRef = useRef<SVGSVGElement | null>(null);

  const centerLetter = letters[centerIndex] || "";
  const hiveComplete = letters.every((letter) => letter.length === 1);
  const uniqueLetters =
    hiveComplete && new Set(letters).size === 7 && centerLetter.length === 1;

  const baseSize = Math.min(treeSize.width, treeSize.height);
  const cylinderRadius = baseSize * 0.34 * cylinderWidthScale;
  const halfHeight = baseSize * 0.38 * cylinderHeightScale;
  const bottomTwist = (cylinderTwistDeg * Math.PI) / 180;
  const longestWordLen = useMemo(
    () =>
      foundWords.reduce((max, word) => Math.max(max, word.length), 0) || 4,
    [foundWords]
  );

  const autoFramePrefix = () => {
    if (viewMode !== "prefix") {
      return;
    }
    const nodes = simRef.current;
    if (!nodes.length) {
      return;
    }
    let minX = Number.POSITIVE_INFINITY;
    let maxX = Number.NEGATIVE_INFINITY;
    let minY = Number.POSITIVE_INFINITY;
    let maxY = Number.NEGATIVE_INFINITY;
    nodes.forEach((node) => {
      minX = Math.min(minX, node.x, node.anchorX);
      maxX = Math.max(maxX, node.x, node.anchorX);
      minY = Math.min(minY, node.y, node.anchorY);
      maxY = Math.max(maxY, node.y, node.anchorY);
    });
    if (!Number.isFinite(minX) || !Number.isFinite(maxX)) {
      return;
    }
    const pad = 56;
    const boundsW = Math.max(maxX - minX, 120);
    const boundsH = Math.max(maxY - minY, 120);
    const zoom = Math.min(
      (treeSize.width - pad * 2) / boundsW,
      (treeSize.height - pad * 2) / boundsH,
      2.4
    );
    const nextZoom = Math.max(0.22, zoom);
    const midX = (minX + maxX) / 2;
    const midY = (minY + maxY) / 2;
    zoomRef.current = nextZoom;
    panRef.current = {
      x: treeSize.width / 2 - midX * nextZoom,
      y: treeSize.height / 2 - midY * nextZoom,
    };
    setViewTick((value) => value + 1);
  };

  const graph = useMemo(() => {
    if (!foundWords.length) {
      return viewMode === "consolidate"
        ? buildConsolidateGraph([])
        : buildPrefixGraph([]);
    }
    return viewMode === "consolidate"
      ? buildConsolidateGraph(foundWords)
      : buildPrefixGraph(foundWords);
  }, [foundWords, viewMode]);

  const selectedPath = useMemo(() => {
    if (!selectedWord || !foundWords.includes(selectedWord)) {
      return null;
    }
    return findWordPath(graph, selectedWord);
  }, [foundWords, graph, selectedWord]);

  const selectedNodeIds = useMemo(
    () => new Set(selectedPath?.nodeIds ?? []),
    [selectedPath]
  );
  const selectedEdgeIds = useMemo(
    () => new Set(selectedPath?.edgeIds ?? []),
    [selectedPath]
  );

  useEffect(() => {
    const node = treeWrapRef.current;
    if (!node || typeof ResizeObserver === "undefined") {
      return;
    }
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) {
        return;
      }
      const { width, height } = entry.contentRect;
      setTreeSize({
        width: Math.max(320, width),
        height: Math.max(360, height),
      });
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, [hiveReady]);

  // Rebuild simulation targets when graph / size / mode changes.
  useEffect(() => {
    const anchors =
      viewMode === "consolidate"
        ? cylinderAnchors(
            graph,
            letters,
            cylinderRadius,
            halfHeight,
            foundWords,
            bottomTwist
          )
        : prefixAnchors(
            graph,
            letters,
            centerIndex,
            treeSize.width,
            treeSize.height,
            longestWordLen
          );

    const specs = graph.nodes.map((node) => {
      const anchor = anchors.get(node.id) || { x: 0, y: 0, z: 0 };
      return {
        id: node.id,
        letter: node.letter,
        isWordEnd: node.isWordEnd,
        isRoot: node.isRoot,
        depthFromStart: node.depthFromStart,
        depthToEnd: node.depthToEnd,
        anchorX: anchor.x,
        anchorY: anchor.y,
        anchorZ: anchor.z,
      };
    });

    const now = performance.now();
    simRef.current = syncSimulation(simRef.current, specs, now);
    if (viewMode === "consolidate") {
      // Start/end rails snap to the current cylinder size; intermediates keep
      // freedom and only ease toward the wall via the live surface blend.
      const blend = surfaceBlendRef.current;
      simRef.current = simRef.current.map((node) => {
        if (!isCylinderRailNode(node)) {
          const nextY = Math.max(
            -halfHeight,
            Math.min(halfHeight, node.y || node.anchorY)
          );
          let x = node.x || node.anchorX;
          let z = node.z || node.anchorZ;
          const inside = clampInsideCylinder(x, nextY, z, cylinderRadius);
          x = inside.x;
          z = inside.z;
          if (blend > 0) {
            const onWall = projectToCylinderSurface(x, nextY, z, cylinderRadius);
            x = x + (onWall.x - x) * blend;
            z = z + (onWall.z - z) * blend;
          }
          return { ...node, x, y: nextY, z };
        }
        return {
          ...node,
          x: node.anchorX,
          y: node.anchorY,
          z: node.anchorZ,
          vx: 0,
          vy: 0,
          vz: 0,
        };
      });
    }
    edgesRef.current = graph.edges.map((edge) => ({
      id: edge.id,
      fromId: edge.fromId,
      toId: edge.toId,
      weight: Math.max(1, edge.weight || 1),
    }));
    setFrameNodes(simRef.current.slice());
    setFrameEdges(edgesRef.current.slice());
    if (viewMode === "prefix") {
      // Frame from anchors immediately, then again after a short settle.
      requestAnimationFrame(() => autoFramePrefix());
      window.setTimeout(() => autoFramePrefix(), 280);
    }
  }, [
    graph,
    cylinderRadius,
    halfHeight,
    bottomTwist,
    foundWords,
    letters,
    centerIndex,
    longestWordLen,
    treeSize.height,
    treeSize.width,
    viewMode,
  ]);

  // Physics loop
  useEffect(() => {
    if (!hiveReady) {
      return;
    }
    let frame = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const dt = (now - last) / 1000;
      last = now;
      const targetBlend = surfaceConstrained ? 1 : 0;
      // ~0.55s ease between free volume and surface-restricted paths.
      surfaceBlendRef.current +=
        (targetBlend - surfaceBlendRef.current) *
        (1 - Math.exp(-Math.max(0, dt) * 3.2));
      if (simRef.current.length) {
        simRef.current = stepSimulation(simRef.current, edgesRef.current, {
          now,
          dt,
          mode: viewMode,
          cylinderRadius,
          halfHeight,
          surfaceBlend: surfaceBlendRef.current,
          draggingIds: draggingIdsRef.current,
        });
        setFrameNodes(simRef.current.slice());
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [hiveReady, cylinderRadius, halfHeight, surfaceConstrained, viewMode]);

  const setLetterAt = (index: number, value: string) => {
    const letter = normalizeLetter(value);
    setLetters((current) => {
      const next = [...current];
      next[index] = letter;
      return next;
    });
    if (letter && index < 6) {
      letterInputRefs.current[index + 1]?.focus();
    }
  };

  const startHive = () => {
    if (!uniqueLetters) {
      setStatusTone("err");
      setStatus("Enter 7 unique letters and pick a center letter.");
      return;
    }
    simRef.current = [];
    edgesRef.current = [];
    setFrameNodes([]);
    setFrameEdges([]);
    setFoundWords([]);
    setSelectedWord(null);
    setDraft("");
    setViewMode("prefix");
    panRef.current = { x: 0, y: 0 };
    rotRef.current = { yaw: 0.55, pitch: -0.25 };
    zoomRef.current = 1;
    setHiveReady(true);
    setStatusTone("info");
    setStatus("Hive set. Type words of 4+ letters that use the center.");
  };

  const resetHive = () => {
    setHiveReady(false);
    setLetters([...EMPTY_LETTERS]);
    setCenterIndex(0);
    simRef.current = [];
    edgesRef.current = [];
    setFrameNodes([]);
    setFrameEdges([]);
    setFoundWords([]);
    setSelectedWord(null);
    setDraft("");
    setViewMode("prefix");
    panRef.current = { x: 0, y: 0 };
    setStatus(null);
  };

  const addParsedWords = (raw: string) => {
    if (!hiveReady) {
      return;
    }
    const candidates = parseWordDump(raw);
    if (!candidates.length) {
      setStatusTone("err");
      setStatus("No words found in that paste.");
      return;
    }

    const accepted: string[] = [];
    let skippedShort = 0;
    let skippedCenter = 0;
    let skippedHive = 0;
    let skippedDup = 0;
    const already = new Set(foundWords);

    for (const word of candidates) {
      if (word.length <= 3) {
        skippedShort += 1;
        continue;
      }
      if (!word.includes(centerLetter)) {
        skippedCenter += 1;
        continue;
      }
      if (!wordUsesOnlyHive(word, letters)) {
        skippedHive += 1;
        continue;
      }
      if (already.has(word)) {
        skippedDup += 1;
        continue;
      }
      already.add(word);
      accepted.push(word);
    }

    if (!accepted.length) {
      setStatusTone("err");
      if (candidates.length === 1) {
        if (skippedShort) {
          setStatus("Too short — Spelling Bee words need 4+ letters.");
        } else if (skippedCenter) {
          setStatus(`Must include the center letter “${centerLetter}”.`);
        } else if (skippedHive) {
          setStatus("Only letters from the hive are allowed.");
        } else {
          setStatus("Already found.");
        }
      } else {
        setStatus("No new valid hive words in that paste.");
      }
      return;
    }

    setFoundWords((current) => [...current, ...accepted].sort());
    const pangrams = accepted.filter((word) => isPangram(word, letters));
    const skipped =
      skippedShort + skippedCenter + skippedHive + skippedDup;
    setStatusTone("ok");
    if (accepted.length === 1) {
      setStatus(
        pangrams.length
          ? `Pangram! ${accepted[0]}`
          : `Added ${accepted[0]}`
      );
    } else {
      setStatus(
        `Added ${accepted.length} word${accepted.length === 1 ? "" : "s"}` +
          (pangrams.length ? ` · ${pangrams.length} pangram` : "") +
          (skipped ? ` · skipped ${skipped}` : "")
      );
    }
    if (viewMode === "prefix") {
      window.setTimeout(() => autoFramePrefix(), 40);
      window.setTimeout(() => autoFramePrefix(), 320);
    }
  };

  const submitWord = () => {
    const raw = draft;
    setDraft("");
    if (!raw.trim()) {
      return;
    }
    addParsedWords(raw);
  };

  const honeycombPositions = useMemo(() => {
    const cx = 120;
    const cy = 120;
    const ring = 64;
    const slots: Array<{ x: number; y: number; index: number; center: boolean }> = [
      { x: cx, y: cy, index: centerIndex, center: true },
    ];
    const outerIndices = letters
      .map((_, index) => index)
      .filter((index) => index !== centerIndex);
    outerIndices.forEach((index, order) => {
      const angle = (Math.PI / 180) * (60 * order - 90);
      slots.push({
        x: cx + ring * Math.cos(angle),
        y: cy + ring * Math.sin(angle),
        index,
        center: false,
      });
    });
    return slots;
  }, [centerIndex, letters]);

  const projected = useMemo(() => {
    void viewTick;
    const now = performance.now();
    const cx = treeSize.width / 2;
    const cy = treeSize.height / 2;
    const yaw = rotRef.current.yaw;
    const pitch = rotRef.current.pitch;
    const pan = panRef.current;

    return frameNodes.map((node) => {
      let x = node.x;
      let y = node.y;
      let z = node.z;
      if (viewMode === "consolidate") {
        const zoom = zoomRef.current;
        const rotated = rotateX(rotateY({ x, y, z }, yaw), pitch);
        x = cx + rotated.x * zoom;
        y = cy - rotated.y * zoom;
        z = rotated.z * zoom;
      } else {
        const zoom = zoomRef.current;
        x = node.x * zoom + pan.x;
        y = node.y * zoom + pan.y;
        z = 0;
      }
      const birth = birthStrength(node, now);
      return { ...node, px: x, py: y, pz: z, birth };
    });
  }, [frameNodes, viewTick, treeSize.height, treeSize.width, viewMode]);

  const projectedById = useMemo(() => {
    const map = new Map<string, (typeof projected)[number]>();
    projected.forEach((node) => map.set(node.id, node));
    return map;
  }, [projected]);

  const sortedNodes = useMemo(() => {
    if (viewMode !== "consolidate") {
      return projected;
    }
    return projected.slice().sort((a, b) => a.pz - b.pz);
  }, [projected, viewMode]);

  const railMarkers = useMemo(() => {
    if (viewMode !== "consolidate" || !uniqueLetters) {
      return [] as Array<{
        letter: string;
        kind: "top" | "bottom";
        point: { x: number; y: number; z: number };
      }>;
    }
    const tops = startLetterAngles(letters);
    const bottoms = endingLetterAngles(foundWords, letters, bottomTwist);
    const markers: Array<{
      letter: string;
      kind: "top" | "bottom";
      point: { x: number; y: number; z: number };
    }> = [];
    letters.forEach((letter) => {
      if (!letter) {
        return;
      }
      const upper = letter.toUpperCase();
      const topPhi = tops.get(upper);
      const bottomPhi = bottoms.get(upper);
      if (topPhi != null) {
        markers.push({
          letter: upper,
          kind: "top",
          point: {
            x: cylinderRadius * Math.cos(topPhi),
            y: halfHeight,
            z: cylinderRadius * Math.sin(topPhi),
          },
        });
      }
      if (bottomPhi != null) {
        markers.push({
          letter: upper,
          kind: "bottom",
          point: {
            x: cylinderRadius * Math.cos(bottomPhi),
            y: -halfHeight,
            z: cylinderRadius * Math.sin(bottomPhi),
          },
        });
      }
    });
    return markers;
  }, [
    bottomTwist,
    cylinderRadius,
    foundWords,
    halfHeight,
    letters,
    uniqueLetters,
    viewMode,
  ]);

  const projectWorld = (point: { x: number; y: number; z: number }) => {
    const cx = treeSize.width / 2;
    const cy = treeSize.height / 2;
    if (viewMode !== "consolidate") {
      const zoom = zoomRef.current;
      return {
        px: point.x * zoom + panRef.current.x,
        py: point.y * zoom + panRef.current.y,
        pz: 0,
      };
    }
    const zoom = zoomRef.current;
    const rotated = rotateX(
      rotateY(point, rotRef.current.yaw),
      rotRef.current.pitch
    );
    return {
      px: cx + rotated.x * zoom,
      py: cy - rotated.y * zoom,
      pz: rotated.z * zoom,
    };
  };

  const clientToSvg = (clientX: number, clientY: number) => {
    const svg = svgRef.current;
    if (!svg) {
      return { x: clientX, y: clientY };
    }
    const point = svg.createSVGPoint();
    point.x = clientX;
    point.y = clientY;
    const matrix = svg.getScreenCTM();
    if (!matrix) {
      return { x: clientX, y: clientY };
    }
    const local = point.matrixTransform(matrix.inverse());
    return { x: local.x, y: local.y };
  };

  const moveNodeByScreenDelta = (id: string, dx: number, dy: number) => {
    const index = simRef.current.findIndex((node) => node.id === id);
    if (index < 0) {
      return;
    }
    const node = simRef.current[index];
    const pinnedRail =
      viewMode === "consolidate" &&
      (node.depthFromStart <= 1 ||
        node.isWordEnd ||
        node.depthToEnd <= 0);
    if (node.isRoot || pinnedRail) {
      return;
    }

    if (viewMode === "consolidate") {
      const yaw = rotRef.current.yaw;
      const pitch = rotRef.current.pitch;
      const zoom = zoomRef.current || 1;
      const cam = rotateX(rotateY({ x: node.x, y: node.y, z: node.z }, yaw), pitch);
      cam.x += dx / zoom;
      cam.y -= dy / zoom;
      let world = unrotate(cam, yaw, pitch);
      world.y = Math.max(-halfHeight, Math.min(halfHeight, world.y));
      world = clampInsideCylinder(world.x, world.y, world.z, cylinderRadius);
      const blend = surfaceBlendRef.current;
      if (blend > 0) {
        const onWall = projectToCylinderSurface(
          world.x,
          world.y,
          world.z,
          cylinderRadius
        );
        world = {
          x: world.x + (onWall.x - world.x) * blend,
          y: world.y,
          z: world.z + (onWall.z - world.z) * blend,
        };
      }
      simRef.current[index] = {
        ...node,
        x: world.x,
        y: world.y,
        z: world.z,
        vx: 0,
        vy: 0,
        vz: 0,
      };
    } else {
      const zoom = zoomRef.current || 1;
      simRef.current[index] = {
        ...node,
        x: node.x + dx / zoom,
        y: node.y + dy / zoom,
        vx: 0,
        vy: 0,
        vz: 0,
      };
    }
    setFrameNodes(simRef.current.slice());
  };

  const onBackgroundPointerDown = (event: React.PointerEvent<SVGSVGElement>) => {
    if (event.button !== 0 && event.button !== 2) {
      return;
    }
    // Consolidate: drag rotates. Prefix: drag pans.
    dragRef.current = {
      kind: viewMode === "consolidate" ? "rotate" : "pan",
      id: null,
      lastX: event.clientX,
      lastY: event.clientY,
      pointerId: event.pointerId,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const onNodePointerDown = (
    event: React.PointerEvent,
    id: string,
    isRoot: boolean,
    pinned = false
  ) => {
    event.stopPropagation();
    if (isRoot || pinned || event.button !== 0) {
      return;
    }
    draggingIdsRef.current.add(id);
    dragRef.current = {
      kind: "node",
      id,
      lastX: event.clientX,
      lastY: event.clientY,
      pointerId: event.pointerId,
    };
    (event.currentTarget as Element).setPointerCapture?.(event.pointerId);
  };

  const onPointerMove = (event: React.PointerEvent) => {
    const drag = dragRef.current;
    if (!drag.kind) {
      return;
    }
    const dx = event.clientX - drag.lastX;
    const dy = event.clientY - drag.lastY;
    drag.lastX = event.clientX;
    drag.lastY = event.clientY;

    if (drag.kind === "pan") {
      panRef.current.x += dx;
      panRef.current.y += dy;
      setViewTick((value) => value + 1);
      return;
    }
    if (drag.kind === "rotate") {
      rotRef.current.yaw += dx * 0.008;
      rotRef.current.pitch = Math.max(
        -1.05,
        Math.min(1.05, rotRef.current.pitch + dy * 0.008)
      );
      setViewTick((value) => value + 1);
      return;
    }
    if (drag.kind === "node" && drag.id) {
      const a = clientToSvg(event.clientX - dx, event.clientY - dy);
      const b = clientToSvg(event.clientX, event.clientY);
      moveNodeByScreenDelta(drag.id, b.x - a.x, b.y - a.y);
    }
  };

  const onPointerUp = (event: React.PointerEvent) => {
    const drag = dragRef.current;
    if (drag.kind === "node" && drag.id) {
      // Resume physics from the dropped position.
      draggingIdsRef.current.delete(drag.id);
    }
    dragRef.current = {
      kind: null,
      id: null,
      lastX: 0,
      lastY: 0,
      pointerId: null,
    };
    const target = event.currentTarget as Element & {
      hasPointerCapture?: (id: number) => boolean;
      releasePointerCapture?: (id: number) => void;
    };
    if (target.hasPointerCapture?.(event.pointerId)) {
      target.releasePointerCapture?.(event.pointerId);
    }
  };

  useEffect(() => {
    const wrap = treeWrapRef.current;
    if (!wrap || !hiveReady) {
      return;
    }
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const oldZoom = zoomRef.current;
      const factor = event.deltaY > 0 ? 0.9 : 1.1;
      const newZoom = Math.max(0.18, Math.min(4.5, oldZoom * factor));
      if (Math.abs(newZoom - oldZoom) < 1e-6) {
        return;
      }
      if (viewMode === "prefix") {
        // Zoom toward viewport center while preserving pan framing.
        const cx = treeSize.width / 2;
        const cy = treeSize.height / 2;
        panRef.current = {
          x: cx - ((cx - panRef.current.x) * newZoom) / oldZoom,
          y: cy - ((cy - panRef.current.y) * newZoom) / oldZoom,
        };
      }
      // Consolidate: scale about the cylinder center (no pan).
      zoomRef.current = newZoom;
      setViewTick((value) => value + 1);
    };
    wrap.addEventListener("wheel", onWheel, { passive: false });
    return () => wrap.removeEventListener("wheel", onWheel);
  }, [hiveReady, treeSize.height, treeSize.width, viewMode]);

  // Keep the prefix map framed as words are added.
  useEffect(() => {
    if (!hiveReady || viewMode !== "prefix" || !foundWords.length) {
      return;
    }
    const timer = window.setTimeout(() => autoFramePrefix(), 60);
    return () => window.clearTimeout(timer);
  }, [foundWords.length, hiveReady, viewMode, treeSize.width, treeSize.height]);

  return (
    <div className="page-shell bee-page">
      <PageHeader title="SPELLING BEE MAP" setPage={setPage} hue={42} />
      <div className="bee-layout">
        <aside className="bee-sidebar">
          <section className="bee-panel">
            <h2>Hive</h2>
            <p className="bee-hint">
              Enter today’s 7 letters, click one to mark the center, then start
              mapping words. Shared prefixes (and endings, in consolidate mode)
              reuse the same edges.
            </p>

            {!hiveReady ? (
              <>
                <div className="bee-letter-grid" role="group" aria-label="Hive letters">
                  {letters.map((letter, index) => (
                    <button
                      key={`slot-${index}`}
                      type="button"
                      className={`bee-letter-slot${
                        index === centerIndex ? " is-center" : ""
                      }`}
                      onClick={() => setCenterIndex(index)}
                      title={
                        index === centerIndex
                          ? "Center letter"
                          : "Click to make center"
                      }
                    >
                      <input
                        ref={(node) => {
                          letterInputRefs.current[index] = node;
                        }}
                        value={letter}
                        maxLength={1}
                        aria-label={`Letter ${index + 1}`}
                        onChange={(event) => setLetterAt(index, event.target.value)}
                        onFocus={() => setCenterIndex(index)}
                      />
                    </button>
                  ))}
                </div>
                <p className="bee-center-note">
                  Center: <strong>{centerLetter || "—"}</strong>
                  {uniqueLetters ? "" : " · need 7 unique letters"}
                </p>
                <button
                  type="button"
                  className="bee-primary"
                  disabled={!uniqueLetters}
                  onClick={startHive}
                >
                  Start mapping
                </button>
              </>
            ) : (
              <>
                <div className="bee-honeycomb" aria-label="Letter honeycomb">
                  <svg viewBox="0 0 240 240" width="220" height="220">
                    {honeycombPositions.map((slot) => {
                      const letter = letters[slot.index];
                      return (
                        <g key={`hex-${slot.index}`}>
                          <polygon
                            points={hexPoints(slot.x, slot.y, 30)}
                            className={
                              slot.center
                                ? "bee-hex bee-hex--center"
                                : "bee-hex"
                            }
                          />
                          <text
                            x={slot.x}
                            y={slot.y + 1}
                            textAnchor="middle"
                            dominantBaseline="middle"
                            className={
                              slot.center
                                ? "bee-hex-label bee-hex-label--center"
                                : "bee-hex-label"
                            }
                          >
                            {letter}
                          </text>
                        </g>
                      );
                    })}
                  </svg>
                </div>
                <button type="button" className="bee-secondary" onClick={resetHive}>
                  Change letters
                </button>
              </>
            )}
          </section>

          {hiveReady ? (
            <section className="bee-panel">
              <h2>Found · {foundWords.length}</h2>
              <ul className="bee-word-list">
                {foundWords.length === 0 ? (
                  <li className="bee-word-list__empty">No words yet</li>
                ) : (
                  foundWords.map((word) => {
                    const selected = selectedWord === word;
                    const pangram = isPangram(word, letters);
                    return (
                      <li key={word}>
                        <button
                          type="button"
                          className={[
                            "bee-word-chip",
                            pangram ? "is-pangram" : "",
                            selected ? "is-selected" : "",
                          ]
                            .filter(Boolean)
                            .join(" ")}
                          aria-pressed={selected}
                          onClick={() =>
                            setSelectedWord((current) =>
                              current === word ? null : word
                            )
                          }
                        >
                          {word}
                        </button>
                      </li>
                    );
                  })
                )}
              </ul>
            </section>
          ) : null}
        </aside>

        <main className="bee-main">
          {hiveReady ? (
            <>
              <form
                className="bee-compose"
                onSubmit={(event) => {
                  event.preventDefault();
                  submitWord();
                }}
              >
                <label className="bee-compose-label" htmlFor="bee-word">
                  Word
                </label>
                <input
                  id="bee-word"
                  className="bee-compose-input"
                  value={draft}
                  autoComplete="off"
                  autoCapitalize="characters"
                  spellCheck={false}
                  placeholder="Type a word, or paste an NYT word list"
                  onChange={(event) =>
                    setDraft(
                      event.target.value.replace(/[^a-zA-Z\s]/g, "").toUpperCase()
                    )
                  }
                  onPaste={(event) => {
                    const text = event.clipboardData.getData("text");
                    // NYT dumps are multi-line / doubled / tagged — ingest immediately.
                    if (
                      /\s/.test(text) ||
                      /\(\s*pangram\s*\)/i.test(text) ||
                      parseWordDump(text).length > 1
                    ) {
                      event.preventDefault();
                      setDraft("");
                      addParsedWords(text);
                    }
                  }}
                />
                <button type="submit" className="bee-primary">
                  Add
                </button>
              </form>
              {status ? (
                <p className={`bee-status bee-status--${statusTone}`}>{status}</p>
              ) : null}

              <div className="bee-tree-panel">
                <div className="bee-tree-head">
                  <h2>Letter map</h2>
                  <div className="bee-view-toggle" role="group" aria-label="View mode">
                    <button
                      type="button"
                      className={viewMode === "prefix" ? "is-active" : ""}
                      onClick={() => setViewMode("prefix")}
                    >
                      Prefix tree
                    </button>
                    <button
                      type="button"
                      className={viewMode === "consolidate" ? "is-active" : ""}
                      onClick={() => setViewMode("consolidate")}
                    >
                      Consolidate endings
                    </button>
                  </div>
                </div>
                <p className="bee-tree-caption">
                  {viewMode === "prefix"
                    ? "Seven letter clusters match the hive · scroll to zoom · drag to pan · edges attract"
                    : "Starts & endings pinned to the rims · scroll to zoom · drag to rotate · let paths settle before restricting to the surface"}
                </p>
                {viewMode === "consolidate" ? (
                  <div className="bee-cylinder-controls">
                    <label className="bee-surface-toggle">
                      <input
                        type="checkbox"
                        checked={surfaceConstrained}
                        onChange={(event) =>
                          setSurfaceConstrained(event.target.checked)
                        }
                      />
                      <span>
                        Restrict paths to cylinder surface
                        <em>
                          {surfaceConstrained
                            ? " — easing onto the wall"
                            : " — free volume (recommended first)"}
                        </em>
                      </span>
                    </label>
                    <div className="bee-cyl-sliders">
                      <label className="bee-cyl-slider">
                        <span>Width</span>
                        <input
                          type="range"
                          min={0.45}
                          max={1.8}
                          step={0.02}
                          value={cylinderWidthScale}
                          onChange={(event) =>
                            setCylinderWidthScale(Number(event.target.value))
                          }
                        />
                      </label>
                      <label className="bee-cyl-slider">
                        <span>Height</span>
                        <input
                          type="range"
                          min={0.45}
                          max={1.8}
                          step={0.02}
                          value={cylinderHeightScale}
                          onChange={(event) =>
                            setCylinderHeightScale(Number(event.target.value))
                          }
                        />
                      </label>
                      <label className="bee-cyl-slider">
                        <span>Twist</span>
                        <input
                          type="range"
                          min={-180}
                          max={180}
                          step={1}
                          value={cylinderTwistDeg}
                          onChange={(event) =>
                            setCylinderTwistDeg(Number(event.target.value))
                          }
                        />
                      </label>
                    </div>
                  </div>
                ) : null}
                <div className="bee-tree-wrap" ref={treeWrapRef}>
                  {frameNodes.length <= 1 ? (
                    <p className="bee-tree-empty">
                      Accepted words will branch from the first letter outward.
                    </p>
                  ) : (
                    <svg
                      ref={svgRef}
                      className={`bee-tree-svg is-pannable${
                        viewMode === "consolidate" ? " is-cylinder" : ""
                      }`}
                      viewBox={`0 0 ${treeSize.width} ${treeSize.height}`}
                      width="100%"
                      height="100%"
                      role="img"
                      aria-label="Word letter map"
                      onPointerDown={onBackgroundPointerDown}
                      onPointerMove={onPointerMove}
                      onPointerUp={onPointerUp}
                      onPointerCancel={onPointerUp}
                      onContextMenu={(event) => event.preventDefault()}
                    >
                      {viewMode === "consolidate" ? (
                        <g className="bee-cylinder-guide" aria-hidden="true">
                          {(() => {
                            void viewTick;
                            const top: Array<{ x: number; y: number }> = [];
                            const bottom: Array<{ x: number; y: number }> = [];
                            const steps = 48;
                            for (let i = 0; i <= steps; i += 1) {
                              const phi = (i / steps) * Math.PI * 2;
                              const t = projectWorld({
                                x: cylinderRadius * Math.cos(phi),
                                y: halfHeight,
                                z: cylinderRadius * Math.sin(phi),
                              });
                              const b = projectWorld({
                                x: cylinderRadius * Math.cos(phi),
                                y: -halfHeight,
                                z: cylinderRadius * Math.sin(phi),
                              });
                              top.push({ x: t.px, y: t.py });
                              bottom.push({ x: b.px, y: b.py });
                            }
                            const topD = top
                              .map((p, i) => `${i === 0 ? "M" : "L"}${p.x},${p.y}`)
                              .join(" ");
                            const bottomD = bottom
                              .map((p, i) => `${i === 0 ? "M" : "L"}${p.x},${p.y}`)
                              .join(" ");
                            const startAngles = startLetterAngles(letters);
                            const seamGuides = letters
                              .filter(Boolean)
                              .map((letter) => {
                                const phi = startAngles.get(letter.toUpperCase()) ?? 0;
                                return {
                                  letter,
                                  top: {
                                    x: cylinderRadius * Math.cos(phi),
                                    y: halfHeight,
                                    z: cylinderRadius * Math.sin(phi),
                                  },
                                  bottom: {
                                    x: cylinderRadius * Math.cos(phi),
                                    y: -halfHeight,
                                    z: cylinderRadius * Math.sin(phi),
                                  },
                                };
                              });
                            return (
                              <>
                                <path d={`${topD} Z`} className="bee-cylinder-ring" />
                                <path d={`${bottomD} Z`} className="bee-cylinder-ring" />
                                {seamGuides.map((seam) => {
                                  const a = projectWorld(seam.top);
                                  const b = projectWorld(seam.bottom);
                                  return (
                                    <line
                                      key={`seam-${seam.letter}`}
                                      x1={a.px}
                                      y1={a.py}
                                      x2={b.px}
                                      y2={b.py}
                                      className="bee-cylinder-seam"
                                    />
                                  );
                                })}
                                {railMarkers.map((rail) => {
                                  const p = projectWorld(rail.point);
                                  return (
                                    <text
                                      key={`rail-${rail.kind}-${rail.letter}`}
                                      x={p.px}
                                      y={
                                        rail.kind === "top" ? p.py - 8 : p.py + 14
                                      }
                                      textAnchor="middle"
                                      className="bee-rail-label"
                                    >
                                      {rail.letter}
                                    </text>
                                  );
                                })}
                              </>
                            );
                          })()}
                        </g>
                      ) : null}
                      {(() => {
                        const maxWeight = frameEdges.reduce(
                          (max, item) => Math.max(max, item.weight || 1),
                          1
                        );
                        const pathActive = Boolean(selectedPath);
                        const orderedEdges = pathActive
                          ? frameEdges
                              .slice()
                              .sort(
                                (a, b) =>
                                  Number(selectedEdgeIds.has(a.id)) -
                                  Number(selectedEdgeIds.has(b.id))
                              )
                          : frameEdges;
                        return orderedEdges.map((edge) => {
                        if (edge.fromId === "root" || edge.toId === "root") {
                          return null;
                        }
                        const from = projectedById.get(edge.fromId);
                        const to = projectedById.get(edge.toId);
                        if (!from || !to) {
                          return null;
                        }
                        const onPath = selectedEdgeIds.has(edge.id);
                        const depthFade =
                          viewMode === "consolidate"
                            ? 0.4 +
                              0.6 *
                                ((from.pz + to.pz) / 2 / (cylinderRadius * 2) +
                                  0.5)
                            : 1;
                        const weight = Math.max(1, edge.weight || 1);
                        const multiT =
                          maxWeight <= 1
                            ? 0
                            : Math.log(weight) / Math.log(maxWeight);
                        const multiBoost = 0.38 + 0.62 * multiT;
                        let opacity = Math.max(
                          0.18,
                          Math.min(1, depthFade) *
                            Math.min(from.birth, to.birth) *
                            multiBoost
                        );
                        let stroke = `rgba(242, 196, 72, ${
                          0.42 + 0.58 * multiT
                        })`;
                        let strokeWidth = 1.4 + 1.8 * multiT;
                        if (pathActive) {
                          if (onPath) {
                            opacity = 1;
                            stroke = "rgba(255, 220, 96, 1)";
                            strokeWidth = 3.4;
                          } else {
                            opacity = Math.min(opacity, 0.12);
                            stroke = "rgba(215, 199, 164, 0.28)";
                            strokeWidth = 1.1;
                          }
                        }

                        // Ease straight chords toward wall geodesics with surface blend.
                        if (viewMode === "consolidate" && !from.isRoot && !to.isRoot) {
                          const blend = surfaceBlendRef.current;
                          const worldFrom = frameNodes.find(
                            (node) => node.id === edge.fromId
                          );
                          const worldTo = frameNodes.find(
                            (node) => node.id === edge.toId
                          );
                          if (worldFrom && worldTo && blend > 0.02) {
                            const arc = sampleCylinderSurfaceArc(
                              worldFrom,
                              worldTo,
                              cylinderRadius,
                              20
                            );
                            const d = arc
                              .map((point, index) => {
                                const t = index / Math.max(1, arc.length - 1);
                                const chord = {
                                  x:
                                    worldFrom.x +
                                    (worldTo.x - worldFrom.x) * t,
                                  y:
                                    worldFrom.y +
                                    (worldTo.y - worldFrom.y) * t,
                                  z:
                                    worldFrom.z +
                                    (worldTo.z - worldFrom.z) * t,
                                };
                                const mixed = {
                                  x: chord.x + (point.x - chord.x) * blend,
                                  y: chord.y + (point.y - chord.y) * blend,
                                  z: chord.z + (point.z - chord.z) * blend,
                                };
                                const p = projectWorld(mixed);
                                return `${index === 0 ? "M" : "L"}${p.px},${p.py}`;
                              })
                              .join(" ");
                            return (
                              <path
                                key={edge.id}
                                d={d}
                                className={`bee-tree-edge bee-tree-edge--curve${
                                  onPath ? " is-path" : ""
                                }`}
                                fill="none"
                                stroke={stroke}
                                strokeWidth={strokeWidth}
                                opacity={opacity}
                              />
                            );
                          }
                        }

                        return (
                          <line
                            key={edge.id}
                            x1={from.px}
                            y1={from.py}
                            x2={to.px}
                            y2={to.py}
                            className={`bee-tree-edge${
                              onPath ? " is-path" : ""
                            }`}
                            stroke={stroke}
                            strokeWidth={strokeWidth}
                            opacity={opacity}
                          />
                        );
                        });
                      })()}
                      {(() => {
                        const pathActive = Boolean(selectedPath);
                        const orderedNodes = pathActive
                          ? sortedNodes
                              .slice()
                              .sort(
                                (a, b) =>
                                  Number(selectedNodeIds.has(a.id)) -
                                  Number(selectedNodeIds.has(b.id))
                              )
                          : sortedNodes;
                        return orderedNodes.map((node) => {
                        if (node.isRoot) {
                          return null;
                        }
                        void viewTick;
                        const zoom = zoomRef.current;
                        const onPath = selectedNodeIds.has(node.id);
                        const isStartLetter =
                          viewMode === "prefix"
                            ? node.depthFromStart === 0
                            : node.depthFromStart <= 1;
                        const pinnedRail =
                          viewMode === "consolidate" &&
                          (node.depthFromStart <= 1 ||
                            node.isWordEnd ||
                            node.depthToEnd <= 0);
                        // pz is already zoom-scaled in projection; undo that for depth cue.
                        const depthZ = zoom > 1e-6 ? node.pz / zoom : node.pz;
                        const depthScale =
                          viewMode === "consolidate"
                            ? 0.72 +
                              0.35 * (depthZ / (cylinderRadius * 2) + 0.5)
                            : 1;
                        const sizeScale =
                          Math.max(0.12, node.birth) *
                          depthScale *
                          zoom *
                          (onPath ? 1.12 : 1);
                        const radius =
                          (node.isWordEnd ? 18 : 15) * sizeScale;
                        let diskClass = isStartLetter
                          ? "bee-tree-disk bee-tree-disk--start"
                          : node.isWordEnd
                            ? "bee-tree-disk bee-tree-disk--word"
                            : "bee-tree-disk";
                        let letterClass = isStartLetter
                          ? "bee-tree-letter bee-tree-letter--start"
                          : "bee-tree-letter";
                        let nodeOpacity = 0.35 + 0.65 * node.birth;
                        if (pathActive) {
                          if (onPath) {
                            diskClass = "bee-tree-disk bee-tree-disk--path";
                            letterClass =
                              "bee-tree-letter bee-tree-letter--path";
                            nodeOpacity = 1;
                          } else {
                            nodeOpacity = Math.min(nodeOpacity, 0.22);
                          }
                        }
                        return (
                          <g
                            key={node.id}
                            className={
                              pinnedRail
                                ? "bee-tree-node"
                                : "bee-tree-node is-draggable"
                            }
                            opacity={nodeOpacity}
                            onPointerDown={(event) =>
                              onNodePointerDown(
                                event,
                                node.id,
                                node.isRoot,
                                pinnedRail
                              )
                            }
                            onPointerMove={onPointerMove}
                            onPointerUp={onPointerUp}
                            onPointerCancel={onPointerUp}
                            style={{ cursor: pinnedRail ? "default" : "grab" }}
                          >
                            <circle
                              cx={node.px}
                              cy={node.py}
                              r={radius}
                              className={diskClass}
                            />
                            <text
                              x={node.px}
                              y={node.py + 1}
                              textAnchor="middle"
                              dominantBaseline="middle"
                              className={letterClass}
                              fontSize={Math.max(3, 13 * sizeScale)}
                            >
                              {node.letter}
                            </text>
                          </g>
                        );
                        });
                      })()}
                    </svg>
                  )}
                </div>
              </div>
            </>
          ) : (
            <div className="bee-placeholder">
              <div className="bee-placeholder-mark" aria-hidden="true">
                <svg viewBox="0 0 64 64" width="72" height="72">
                  <polygon
                    points={hexPoints(32, 32, 26)}
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.5"
                  />
                  <polygon
                    points={hexPoints(32, 32, 12)}
                    fill="currentColor"
                    opacity="0.35"
                  />
                </svg>
              </div>
              <h2>Map the hive</h2>
              <p>
                This won’t solve today’s puzzle for you — it just grows a visual
                of the words you find, letter by letter.
              </p>
            </div>
          )}
        </main>
      </div>
    </div>
  );
};

export default function SpellingBee(
  _timer: number,
  setPage: pagesetter,
  _mouse: Point,
  _extravars: reactvar[],
  _viewport: Viewport
) {
  return <SpellingBeePage setPage={setPage} />;
}
