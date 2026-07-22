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
