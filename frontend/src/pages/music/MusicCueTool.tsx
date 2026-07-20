import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { decodeCue, encodeCue } from "./cueCodec";
import {
  exportCustomLayoutJson,
  loadCustomPositions,
  loadLayoutMode,
  saveCustomPositions,
  saveLayoutMode,
} from "./customLayout";
import {
  buildInitialCustomPositions,
  clampGraphPoint,
  GraphDimensions,
  resolveSongPosition,
  toNormalizedPosition,
} from "./graphLayout";
import {
  findNearestSong,
  generateCueFromStroke,
} from "./pathGenerator";
import {
  addCustomSongs,
  exportSongLibraryJson,
  loadSongLibrary,
} from "./songLibrary";
import { GeneratedCue, GraphPoint, LayoutMode, NormalizedPoint, Song } from "./types";
import { importSongsFromUrls } from "./youtubeImport";
import { YouTubePlayer } from "./YouTubePlayer";
import "./music-cue.css";

const getGraphDimensions = (): GraphDimensions => ({
  width: Math.max(520, Math.min(window.innerWidth - 360, 920)),
  height: Math.max(360, window.innerHeight - 220),
});

const getLocalPoint = (
  event: React.PointerEvent<Element>,
  svg: SVGSVGElement
): GraphPoint => {
  const rect = svg.getBoundingClientRect();
  return {
    x: event.clientX - rect.left,
    y: event.clientY - rect.top,
  };
};

const DRAG_THRESHOLD = 10;

const mergeCustomPositions = (
  songs: Song[],
  dimensions: GraphDimensions,
  existing: Record<string, NormalizedPoint>
): Record<string, NormalizedPoint> => {
  const next = { ...existing };
  songs.forEach((song) => {
    if (!next[song.id]) {
      next[song.id] = toNormalizedPosition(resolveSongPosition(song, dimensions, "auto-sort", next), dimensions);
    }
  });
  return next;
};

export const MusicCueTool = () => {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const bgRectRef = useRef<SVGRectElement | null>(null);
  const strokeRef = useRef<GraphPoint[]>([]);
  const dragStartRef = useRef<GraphPoint | null>(null);
  const isDraggingRef = useRef(false);
  const pointerIdRef = useRef<number | null>(null);
  const savedStrokeRef = useRef<GraphPoint[]>([]);
  const draggingNodeIdRef = useRef<string | null>(null);
  const [dimensions, setDimensions] = useState<GraphDimensions>(getGraphDimensions);
  const [songs, setSongs] = useState<Song[]>(() => loadSongLibrary());
  const [layoutMode, setLayoutMode] = useState<LayoutMode>(() => loadLayoutMode());
  const [customPositions, setCustomPositions] = useState<Record<string, NormalizedPoint>>(() => {
    const stored = loadCustomPositions();
    return Object.keys(stored).length > 0 ? stored : buildInitialCustomPositions(loadSongLibrary(), getGraphDimensions());
  });
  const [stroke, setStroke] = useState<GraphPoint[]>([]);
  const [isDrawingNewPath, setIsDrawingNewPath] = useState(false);
  const [cue, setCue] = useState<GeneratedCue | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const [startId, setStartId] = useState<string | undefined>();
  const [endId, setEndId] = useState<string | undefined>();
  const [pasteValue, setPasteValue] = useState("");
  const [urlInput, setUrlInput] = useState("");
  const [importEnergy, setImportEnergy] = useState("0.5");
  const [importValence, setImportValence] = useState("0.5");
  const [isImporting, setIsImporting] = useState(false);
  const [statusMessage, setStatusMessage] = useState("Draw a path across the graph to generate a cue.");

  useEffect(() => {
    const handleResize = () => setDimensions(getGraphDimensions());
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  useEffect(() => {
    setCustomPositions((current) => {
      const merged = mergeCustomPositions(songs, dimensions, current);
      if (JSON.stringify(merged) !== JSON.stringify(current)) {
        saveCustomPositions(merged);
        return merged;
      }
      return current;
    });
  }, [songs, dimensions]);

  const getPosition = useCallback(
    (song: Song): GraphPoint => resolveSongPosition(song, dimensions, layoutMode, customPositions),
    [customPositions, dimensions, layoutMode]
  );

  const positionedSongs = useMemo(
    () =>
      songs.map((song) => ({
        song,
        position: getPosition(song),
      })),
    [songs, getPosition]
  );

  const videoIds = cue?.songs.map((song) => song.youtubeVideoId) ?? [];

  const cueEdgePath = useMemo(() => {
    if (!cue || cue.songs.length < 2) {
      return "";
    }
    return cue.songs
      .map((song, index) => {
        const position = getPosition(song);
        return `${index === 0 ? "M" : "L"} ${position.x.toFixed(1)} ${position.y.toFixed(1)}`;
      })
      .join(" ");
  }, [cue, getPosition]);

  const cueEdgePoints = useMemo(() => {
    if (!cue) {
      return [];
    }
    return cue.songs.map((song) => getPosition(song));
  }, [cue, getPosition]);

  const resetDragState = () => {
    dragStartRef.current = null;
    isDraggingRef.current = false;
    pointerIdRef.current = null;
  };

  const beginNewStroke = (point: GraphPoint) => {
    isDraggingRef.current = true;
    setIsDrawingNewPath(true);
    savedStrokeRef.current = stroke;
    strokeRef.current = [point];
    setStroke([point]);
    setStatusMessage("Drawing new path…");
  };

  const pinNearestSong = (nearest: Song) => {
    if (!startId) {
      setStartId(nearest.id);
      setStatusMessage(`Pinned start: ${nearest.title}`);
      return;
    }
    if (!endId && nearest.id !== startId) {
      setEndId(nearest.id);
      setStatusMessage(`Pinned end: ${nearest.title}`);
      return;
    }
    setStartId(nearest.id);
    setEndId(undefined);
    setStatusMessage(`Reset path pins. Start: ${nearest.title}`);
  };

  const handleNodePointerDown = (event: React.PointerEvent<SVGCircleElement>, song: Song) => {
    event.stopPropagation();

    if (event.shiftKey) {
      pinNearestSong(song);
      return;
    }

    if (layoutMode !== "custom") {
      return;
    }

    draggingNodeIdRef.current = song.id;
    event.currentTarget.setPointerCapture(event.pointerId);
    setStatusMessage(`Dragging ${song.title}…`);
  };

  const handleBackgroundPointerDown = (event: React.PointerEvent<SVGRectElement>) => {
    if (!svgRef.current || event.button !== 0 || songs.length === 0 || draggingNodeIdRef.current) {
      return;
    }

    const point = getLocalPoint(event, svgRef.current);
    const nearest = findNearestSong(point, songs, getPosition);

    if (event.shiftKey && nearest) {
      pinNearestSong(nearest);
      return;
    }

    event.currentTarget.setPointerCapture(event.pointerId);
    pointerIdRef.current = event.pointerId;
    dragStartRef.current = point;
    isDraggingRef.current = false;
  };

  const handlePointerMove = (event: React.PointerEvent<SVGSVGElement>) => {
    if (!svgRef.current) {
      return;
    }

    if (draggingNodeIdRef.current) {
      const point = clampGraphPoint(getLocalPoint(event, svgRef.current), dimensions);
      const normalized = toNormalizedPosition(point, dimensions);
      setCustomPositions((current) => {
        const next = {
          ...current,
          [draggingNodeIdRef.current as string]: normalized,
        };
        saveCustomPositions(next);
        return next;
      });
      return;
    }

    if (dragStartRef.current === null) {
      return;
    }

    const point = getLocalPoint(event, svgRef.current);

    if (!isDraggingRef.current) {
      const distance = Math.hypot(
        point.x - dragStartRef.current.x,
        point.y - dragStartRef.current.y
      );
      if (distance < DRAG_THRESHOLD) {
        return;
      }
      beginNewStroke(dragStartRef.current);
    }

    setStroke((current) => {
      const last = current[current.length - 1];
      if (!last || Math.hypot(point.x - last.x, point.y - last.y) < 4) {
        return current;
      }
      const next = [...current, point];
      strokeRef.current = next;
      return next;
    });
  };

  const finishDrawing = () => {
    if (draggingNodeIdRef.current) {
      draggingNodeIdRef.current = null;
      setStatusMessage("Custom node position saved.");
      return;
    }

    if (pointerIdRef.current !== null && bgRectRef.current?.hasPointerCapture(pointerIdRef.current)) {
      bgRectRef.current.releasePointerCapture(pointerIdRef.current);
    }

    if (!isDraggingRef.current) {
      resetDragState();
      return;
    }

    const currentStroke = strokeRef.current;
    resetDragState();
    setIsDrawingNewPath(false);

    if (currentStroke.length < 2) {
      strokeRef.current = savedStrokeRef.current;
      setStroke(savedStrokeRef.current);
      setStatusMessage("Draw a longer path to generate a cue.");
      return;
    }

    const seed = Math.floor(Math.random() * 1_000_000);
    const generated = generateCueFromStroke(songs, currentStroke, getPosition, seed, startId, endId);
    if (!generated) {
      strokeRef.current = savedStrokeRef.current;
      setStroke(savedStrokeRef.current);
      setStatusMessage("No songs matched that path. Try drawing closer to the nodes.");
      return;
    }

    setCue(generated);
    setStartId(generated.startId);
    setEndId(generated.endId);
    setActiveIndex(0);
    setStatusMessage(`Generated ${generated.songs.length} songs. Press play or copy the cue code.`);
  };

  const handlePointerUp = () => finishDrawing();
  const handlePointerLeave = (event: React.PointerEvent<SVGSVGElement>) => {
    if (event.buttons === 0) {
      finishDrawing();
    }
  };

  const handleGenerate = () => {
    if (stroke.length < 2) {
      setStatusMessage("Draw a path first.");
      return;
    }
    const seed = Math.floor(Math.random() * 1_000_000);
    const generated = generateCueFromStroke(songs, stroke, getPosition, seed, startId, endId);
    if (!generated) {
      setStatusMessage("No songs matched that path. Try drawing closer to the nodes.");
      return;
    }
    setCue(generated);
    setStartId(generated.startId);
    setEndId(generated.endId);
    setActiveIndex(0);
    setStatusMessage(`Re-rolled cue with ${generated.songs.length} songs.`);
  };

  const handleLayoutModeChange = (mode: LayoutMode) => {
    if (mode === "custom") {
      const merged = mergeCustomPositions(songs, dimensions, customPositions);
      setCustomPositions(merged);
      saveCustomPositions(merged);
      setStatusMessage("Custom graph mode: drag nodes to arrange them.");
    } else {
      setStatusMessage("Auto-sort mode: nodes follow energy and valence.");
    }
    setLayoutMode(mode);
    saveLayoutMode(mode);
  };

  const handleCopyCue = async () => {
    if (!cue) {
      return;
    }
    const encoded = encodeCue(cue);
    await navigator.clipboard.writeText(encoded);
    setStatusMessage("Cue copied to clipboard.");
  };

  const handlePasteCue = () => {
    const decoded = decodeCue(pasteValue, songs);
    if (!decoded) {
      setStatusMessage("Could not read that cue code.");
      return;
    }
    setCue(decoded);
    strokeRef.current = decoded.stroke;
    setStroke(decoded.stroke);
    setStartId(decoded.startId);
    setEndId(decoded.endId);
    setActiveIndex(0);
    setStatusMessage(`Loaded cue with ${decoded.songs.length} songs.`);
  };

  const handleClear = () => {
    strokeRef.current = [];
    savedStrokeRef.current = [];
    setStroke([]);
    setCue(null);
    setStartId(undefined);
    setEndId(undefined);
    setActiveIndex(0);
    setIsDrawingNewPath(false);
    setStatusMessage("Cleared graph path and cue.");
  };

  const handleImportUrls = async () => {
    const energy = Number(importEnergy);
    const valence = Number(importValence);
    if (Number.isNaN(energy) || Number.isNaN(valence)) {
      setStatusMessage("Energy and valence must be numbers between 0 and 1.");
      return;
    }

    setIsImporting(true);
    try {
      const { songs: imported, errors, acousticbrainzCount } = await importSongsFromUrls(urlInput, {
        energy: Math.min(1, Math.max(0, energy)),
        valence: Math.min(1, Math.max(0, valence)),
      });

      if (imported.length === 0) {
        setStatusMessage(errors[0] ?? "No songs were imported.");
        return;
      }

      const updatedLibrary = addCustomSongs(imported);
      setSongs(updatedLibrary);
      setUrlInput("");
      const fallbackCount = imported.length - acousticbrainzCount;
      const errorSuffix = errors.length > 0 ? ` ${errors.length} URL(s) failed.` : "";
      const featureSuffix =
        acousticbrainzCount > 0
          ? ` ${acousticbrainzCount} song(s) used AcousticBrainz features${
              fallbackCount > 0 ? `; ${fallbackCount} used fallback energy/valence.` : "."
            }`
          : " No AcousticBrainz match found; used fallback energy/valence.";
      setStatusMessage(`Added ${imported.length} song(s).${featureSuffix}${errorSuffix} Export JSON to update songs.json.`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Import failed.";
      setStatusMessage(message);
    } finally {
      setIsImporting(false);
    }
  };

  const handleExportLibrary = async () => {
    const json = exportSongLibraryJson(songs);
    await navigator.clipboard.writeText(json);
    setStatusMessage("Copied full song library JSON. Paste into src/data/songs.json to save permanently.");
  };

  const handleExportCustomLayout = async () => {
    const json = exportCustomLayoutJson(customPositions);
    await navigator.clipboard.writeText(json);
    setStatusMessage("Copied custom layout JSON (normalized x/y per song id).");
  };

  const strokePath = stroke
    .map((point, index) => `${index === 0 ? "M" : "L"} ${point.x.toFixed(1)} ${point.y.toFixed(1)}`)
    .join(" ");

  return (
    <div className="music-cue-layout">
      <div className="music-cue-graph-panel">
        <svg
          ref={svgRef}
          className={`music-cue-graph ${layoutMode === "custom" ? "music-cue-graph-custom" : ""}`}
          width={dimensions.width}
          height={dimensions.height}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerLeave={handlePointerLeave}
        >
          <rect
            ref={bgRectRef}
            width={dimensions.width}
            height={dimensions.height}
            className="music-cue-graph-bg"
            onPointerDown={handleBackgroundPointerDown}
          />
          <text x={dimensions.width / 2} y={22} className="music-cue-axis-label">
            valence →
          </text>
          <text
            x={16}
            y={dimensions.height / 2}
            className="music-cue-axis-label music-cue-axis-label-vertical"
          >
            energy ↑
          </text>

          {strokePath && (
            <path
              d={strokePath}
              className={`music-cue-stroke ${isDrawingNewPath ? "music-cue-stroke-drafting" : ""}`}
            />
          )}

          {cueEdgePath && !isDrawingNewPath && <path d={cueEdgePath} className="music-cue-edge-path" />}

          {positionedSongs.map(({ song, position }) => {
            const isStart = song.id === startId || song.id === cue?.startId;
            const isEnd = song.id === endId || song.id === cue?.endId;
            const inCue = cue?.songs.some((entry) => entry.id === song.id);
            return (
              <g key={song.id} transform={`translate(${position.x}, ${position.y})`}>
                <circle
                  r={isStart || isEnd ? 14 : 12}
                  className={`music-cue-node-hit ${layoutMode === "custom" ? "music-cue-node-draggable" : ""}`}
                  onPointerDown={(event) => handleNodePointerDown(event, song)}
                />
                <circle
                  r={isStart || isEnd ? 11 : 8}
                  className={`music-cue-node ${inCue ? "music-cue-node-active" : ""} ${
                    isStart ? "music-cue-node-start" : ""
                  } ${isEnd ? "music-cue-node-end" : ""}`}
                  pointerEvents="none"
                />
                <text y={18} className="music-cue-node-label" pointerEvents="none">
                  {song.title}
                </text>
              </g>
            );
          })}

          {!isDrawingNewPath &&
            cueEdgePoints.map((point, index) => (
              <g key={`cue-hop-${index}`} transform={`translate(${point.x}, ${point.y})`}>
                <text y={-14} className="music-cue-edge-label" pointerEvents="none">
                  {index + 1}
                </text>
              </g>
            ))}
        </svg>
      </div>

      <div className="music-cue-sidebar">
        <p className="music-cue-status">{statusMessage}</p>
        <p className="music-cue-help">
          Drag across the graph to sketch a vibe path. Shift-click nodes to pin a start and end.
          {layoutMode === "custom" ? " In custom graph mode, drag nodes to reposition them." : ""}
        </p>

        <div className="music-cue-layout-toggle" role="group" aria-label="Graph layout mode">
          <button
            type="button"
            className={layoutMode === "auto-sort" ? "music-cue-layout-active" : ""}
            onClick={() => handleLayoutModeChange("auto-sort")}
          >
            Auto-sort
          </button>
          <button
            type="button"
            className={layoutMode === "custom" ? "music-cue-layout-active" : ""}
            onClick={() => handleLayoutModeChange("custom")}
          >
            Custom graph
          </button>
        </div>

        {layoutMode === "custom" && (
          <button type="button" className="music-cue-load-button" onClick={handleExportCustomLayout}>
            Export custom layout JSON
          </button>
        )}

        <div className="music-cue-actions">
          <button type="button" onClick={handleGenerate}>
            Re-roll path
          </button>
          <button type="button" onClick={handleCopyCue} disabled={!cue}>
            Copy cue
          </button>
          <button type="button" onClick={handleClear}>
            Clear
          </button>
        </div>

        {(startId || cue?.startId) && (
          <p className="music-cue-pin">
            Start: {songs.find((song) => song.id === (startId ?? cue?.startId))?.title}
            {(endId || cue?.endId)
              ? ` · End: ${songs.find((song) => song.id === (endId ?? cue?.endId))?.title}`
              : ""}
          </p>
        )}

        {cue && (
          <ol className="music-cue-list">
            {cue.songs.map((song, index) => (
              <li key={`${song.id}-${index}`}>
                <button
                  type="button"
                  className={index === activeIndex ? "music-cue-track-active" : ""}
                  onClick={() => setActiveIndex(index)}
                >
                  {song.artist} — {song.title}
                </button>
              </li>
            ))}
          </ol>
        )}

        <div className="music-cue-player-shell">
          {videoIds.length > 0 ? (
            <YouTubePlayer
              videoIds={videoIds}
              activeIndex={activeIndex}
              onIndexChange={setActiveIndex}
            />
          ) : (
            <div className="music-cue-player-placeholder">Generate a cue to load the player.</div>
          )}
        </div>

        <details className="music-cue-import-panel">
          <summary>Add songs from YouTube URLs</summary>
          <p className="music-cue-help">
            Paste one URL per line. Title and artist come from YouTube. Energy and valence are fetched from{" "}
            <a href="https://acousticbrainz.org/" target="_blank" rel="noreferrer">
              AcousticBrainz
            </a>{" "}
            when a matching MusicBrainz recording exists; otherwise the fallback values below are used.
          </p>
          <label className="music-cue-paste-label">
            YouTube URLs
            <textarea
              value={urlInput}
              onChange={(event) => setUrlInput(event.target.value)}
              placeholder={"https://www.youtube.com/watch?v=...\nhttps://youtu.be/..."}
              rows={4}
            />
          </label>
          <div className="music-cue-import-defaults">
            <label>
              Fallback energy
              <input
                type="number"
                min="0"
                max="1"
                step="0.05"
                value={importEnergy}
                onChange={(event) => setImportEnergy(event.target.value)}
              />
            </label>
            <label>
              Fallback valence
              <input
                type="number"
                min="0"
                max="1"
                step="0.05"
                value={importValence}
                onChange={(event) => setImportValence(event.target.value)}
              />
            </label>
          </div>
          <div className="music-cue-actions">
            <button type="button" onClick={handleImportUrls} disabled={isImporting || !urlInput.trim()}>
              {isImporting ? "Importing…" : "Import songs"}
            </button>
            <button type="button" onClick={handleExportLibrary}>
              Export library JSON
            </button>
          </div>
        </details>

        <label className="music-cue-paste-label">
          Paste cue code
          <textarea
            value={pasteValue}
            onChange={(event) => setPasteValue(event.target.value)}
            placeholder="MUSICCUE1...."
            rows={3}
          />
        </label>
        <button type="button" className="music-cue-load-button" onClick={handlePasteCue}>
          Load cue
        </button>
      </div>
    </div>
  );
};
