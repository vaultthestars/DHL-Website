# Music Cue — local desktop vs website

This repo builds **two different products** from the same source:

| Build | Command | `VITE_APP_MODE` | Used for |
|-------|---------|-----------------|----------|
| **Desktop app** | `npm run build` in `music-cue/` (default) | unset | macOS app via `Start Music Cue.command` → `localhost:3847` |
| **Website embed** | `frontend` → `npm run build:music-cue` | `web` | `/music-cue/` on the DHL site (Vercel) |

## Rules for agents

1. **Website-only work** (Spotify import, shared libraries / R2, guest mode, rate limits, Vercel API routes) must be gated behind `isWebDeployment` or `useWebPerformanceOptimizations` from `src/lib/runtime.ts`. Do not change default desktop behavior.

2. **Do not modify desktop behavior** unless the user explicitly asks. The desktop app should:
   - Load libraries from **Library.xml** (Apple Music) or the **local Spotify OAuth API** — no shared-library database, no R2, no contributor merge UI.
   - Show **all graph nodes** (no viewport culling).
   - Use **convex hull** cluster regions (not ellipse “lite” hulls).
   - Control **Music.app** playback via `/api/music/*` on the local Express server.

3. **Performance shortcuts** (node culling, ellipse hulls, deferred layout for large libraries) are controlled by `useWebPerformanceOptimizations` — **web only**.

4. **Deploying website changes** requires `cd frontend && npm run build` (or at least `npm run build:music-cue`) so `frontend/public/music-cue/` updates. API-only deploys do not update the embedded client.

5. **Local server** (`music-cue/server/`) serves the desktop app. Shared-library and Spotify handler code is synced to `frontend/api/` for Vercel; changes there do not require changing desktop behavior if properly gated.

6. **Desktop cluster layout backup**: committed defaults in `src/data/cluster-layout.json` (bundled into the client). Runtime edits save to `data/cluster-layout.local.json` via `PUT /api/cluster-layout` — never write into `src/` at runtime (that triggers a Vite HMR loop in dev). Legacy browser keys (`music-cue-genre-cluster-layout` without `-isolate`) must keep working on desktop.

## Graph performance (web / large libraries)

The graph is the main perf hotspot (~2,500 songs on the website). Follow these patterns so pan, zoom, cluster drag, and view-mode toggles stay smooth.

### Architecture

- **`MusicCueTool.tsx`** — shell: gestures, sidebar, library state, view transform refs.
- **`MusicCueGraphLayer.tsx`** — memoized graph compute + canvas. Split from the tool so parent re-renders (Spotify countdown, hover, etc.) do not rerun layout `useMemo`s.
- **`MusicCueGraphCanvas.tsx`** — SVG render only; memoized on `graphRenderRevision`.

### Memo keys (do not collapse these)

- **`structureKey` (`layoutColdKey`)** — layout-only: config, song count, dimensions. Busting this reruns **all** cluster/layout/cull `useMemo`s (~hundreds of ms on large libraries).
- **`interactionRevisionKey`** — hover, selection, cluster drag, box select, playlist graph view, force sim, isolate-bounds revision. Busting this reruns the layer component but **cached layout memos stay valid**.

Never put interaction or drag state in `structureKey`. Example bug: `isolateBoundsRevision` in `layoutColdKey` caused a full graph recompute on every cluster-drag pointer down.

### Pan / zoom gestures

- Update **`viewBox` directly** on the SVG each animation frame (`applyLiveViewGesture`). Do **not** pan by CSS-transforming the whole `<svg>` — the frozen `viewBox` clips lines/paths at the old viewport edge.
- Keep live transform in **`viewTransformRef`** (no React state per mousemove).
- During gestures: block hover/collaborative cursor updates, defer node-cull refresh until idle (`NODE_CULL_IDLE_MS`), pause layout transitions via `pauseGraphAnimationsRef`.
- Use DOM class toggles (`.music-cue-view-gesturing`) for pointer-events / hiding labels — not `setState` on every move.

### Cluster drag

- **Pointer down (sync, minimal):** pointer capture, `draggingClusterIdRef`, anchor point, one-region preview snapshot, `setIsClusterDragging(true)`.
- **Next frame (`requestAnimationFrame`):** member songs, metagraph neighbors, hull context, `startPositions`, full snapshot. Freeze isolate bounds via **ref only** (`frozenIsolateBoundsRef`); bump `isolateBoundsRevision` on drag **end**, not start.
- Drag preview uses **`ClusterDragPreviewLayer`** + refs so moves do not re-render the full graph.

### Playlist “Graph view” toggle

- Wrap `setPlaylistGraphView` in **`startTransition`** so the UI stays responsive.
- In the graph layer, use **`useDeferredValue(playlistGraphViewActive)`** for metagraph-specific work (edges, graph-view region centers, hiding song nodes).
- Include `playlistGraphViewActive` / `playlistGraphForceSim` in **`interactionRevisionKey`**, not `structureKey`.

### Isolate contributors toggle (shared song space)

- Include **`libraryScopeMode`** in both `layoutTransitionKey` and `interactionRevisionKey` so the graph layer actually re-renders when toggling.
- Pass **`layoutShowIsolateContributorView={useDeferredValue(showIsolateContributorView)}`** into `MusicCueGraphLayer` so turning isolate **on** does not block the main thread; interaction overlays still use the live `showIsolateContributorView`.
- Playlist graph view in isolate mode must use **`getClusterRegionDisplayCenter`** (on-screen cluster positions), not conglomerate-only `resolvePlaylistGraphViewRegionCenter`.
- On toggle: `clearFrozenIsolateBounds()`, `reloadLayoutCaches(...)`, `invalidateLayoutPositionCaches()` inside `startTransition` — web and desktop use the same path.
- Do **not** bump `isolateBoundsRevision` on drag **start** (ref-only freeze); only on drag end.

### Song space (mine ↔ shared)

- Switch **`songSpaceMode` synchronously** (not inside `startTransition`) so filtering applies immediately.
- Snapshot personal/shared libraries in refs when leaving each mode; restore from snapshot or Spotify cache when returning to **mine** so merged shared songs do not leak into my song space.

### Path drawing (cue build)

- While the pointer is down, render the draft segment via **`StrokeDraftLayer`** (rAF + refs) — never `setState` per `pointermove`.
- Use **`isDrawingNewPathRef` / `draftStrokeActiveRef`** for stroke start; do **not** put `isDrawingNewPath` in `interactionRevisionKey` (avoids a full graph-layer rerun on first pointer down).
- **`nodeRenderGraphSongs`** / `getSongIdsNearStrokes` use **`completedStrokes` only**, not the in-progress stroke. Song matching and cue regeneration run in **`finishStrokeDrawing`** on pointer up.
- Bump **`completedStrokesRevision`** (in `interactionRevisionKey`) when strokes are committed or cleared.

### Draw vs navigate tool mode

- Do **not** include **`graphTool`** in `interactionRevisionKey`. Update the SVG tool class imperatively in `handleGraphToolChange` so toggling modes does not rerun graph layout memos.

### Force simulation stop

- Persist force-sim positions **without** `clampDisplayNormalizedToOwnerBounds` (`skipBoundsClamp: true` in `displayNormalizedToSoloNormalized`).
- Cluster override storage allows a wider normalized range (`-2`…`3`) so expanded layouts are not clipped to the viewport box.

### Other rules

- Isolate **Spotify rate-limit countdown** (and similar 1s timers) into child components so they do not re-render `MusicCueTool`.
- Node culling reads **`viewTransformForCullRef`**; refresh cull on idle after pan, not every frame.
- Desktop (`useWebPerformanceOptimizations === false`): no culling, no deferred layout — do not gate desktop behavior behind web perf flags unless intentional.
