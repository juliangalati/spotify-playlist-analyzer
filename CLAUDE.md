# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## About this project

A Vite + React + TypeScript app (with an Express backend) that analyzes every track in a public Spotify playlist — BPM, key, Camelot code, energy, danceability, valence, and playlist-level aggregates including a Camelot-wheel key distribution.

> **Status**: the project is documented but not yet implemented. If `package.json` / `src/` / `server/` don't exist yet, your first job is to execute `BUILD_PLAN.md`.

## Documentation map

Before doing anything non-trivial, read the doc(s) relevant to your task:

| File | What it covers |
|------|----------------|
| `README.md` | Human-facing intro, setup, usage |
| `SPEC.md` | Product spec — what to build, UI sections, JSON output shape, error handling |
| `ARCHITECTURE.md` | Directory tree, API route contract, data flow, component responsibilities |
| `API.md` | Spotify Web API + ReccoBeats reference (auth, pagination, batching, quirks) |
| `CAMELOT.md` | Camelot Wheel math, lookup tables, function signatures, distribution-wheel spec |
| `DESIGN.md` | Design system — colors, typography, components, shadows, Spotify-dark tokens |
| `BUILD_PLAN.md` | Ordered implementation checklist (steps 0–10) |

## Commands (once scaffolded)

```bash
npm run dev         # Vite (5173) + Express (3001) via concurrently
npm run dev:web     # Vite only
npm run dev:server  # Express only (tsx watch server/index.ts)
npm run build       # Vite production build → dist/
npm start           # Run Express serving the built frontend
npm run typecheck   # tsc --noEmit across src/ and server/
```

## Architecture at a glance

- `src/` — React frontend. `App.tsx` owns the flow: parse URL → `fetch('/api/playlist/:id')` → render header + summary + wheel + gallery + JSON panel.
- `server/` — Express backend. Owns Spotify client-credentials auth, pagination through `/v1/playlists/{id}/tracks`, and batched ReccoBeats lookups. Never exposes the client secret.
- Dev: Vite proxies `/api/*` to `:3001`. Prod: Express serves `dist/` and `/api/*`.

Full details: `ARCHITECTURE.md`.

## Conventions

- **Plain CSS, no framework** — Tailwind/MUI/styled-components are explicitly out. All styling uses the tokens in `DESIGN.md`, collected at the top of `src/index.css`. The design system is copied verbatim from the sibling `spotify-track-analyzer` project; don't invent new colors or font families.
- **Pure logic stays pure** — `src/camelot.ts`, `src/aggregate.ts`, `src/util.ts` must have no React or DOM dependencies, so they can be unit-tested standalone.
- **Types in `src/types.ts`** — shared shapes like `TrackRow`, `PlaylistSummary`, `AudioFeatures`. If the backend needs the same types, duplicate them in `server/` rather than wiring up complex path aliases. The project is small enough that light duplication beats config gymnastics.
- **Component files match exports** — one React component per file, PascalCase.
- **No feature-flag / backwards-compat shims** — the app has no production users yet. When something changes, change it; don't layer compat code.

## What NOT to do

- **Don't put `CLIENT_SECRET` anywhere under `src/`.** It lives in `.env` and is read only by the Express process (`server/spotify.ts`).
- **Don't call Spotify's `/v1/audio-features`.** It 403s for apps created after 2024-11-27. Use ReccoBeats (see `API.md`).
- **Don't paginate the track gallery.** Use `@tanstack/react-virtual` — `SPEC.md` and `ARCHITECTURE.md` cover the virtualization approach.
- **Don't introduce state libraries** (Redux, Zustand, Jotai). The scope is small enough for `useState` + prop drilling.
- **Don't rename the design tokens.** If you need a new token, add it to `src/index.css` with the same naming style (`--name-with-dashes`) and document it in `DESIGN.md` under "Playlist-analyzer additions".

## Verifying changes

- **Logic** (camelot / aggregate / util): run the typechecker (`npm run typecheck`). Unit tests aren't set up yet; if adding them, use `vitest` (compatible with Vite).
- **Frontend**: `npm run dev`, open `http://localhost:5173`, paste a playlist URL. Test a small playlist (~10 tracks), a medium one (~100), and a large one (~300+) for virtualization smoothness.
- **Backend**: `curl http://localhost:3001/api/playlist/{id}` against a known public playlist to verify the API contract.
- **Both**: `npm run build && npm start` to confirm the production bundle works on a single port.

## Useful reference

The sibling project `../spotify-track-analyzer/` has a working implementation of the single-track version with the same design system. Look there for:
- Camelot lookup tables (also in `CAMELOT.md`)
- The exact CSS custom properties used across the two projects
- D3 arc geometry for the Camelot wheel

Don't modify the sibling project — just read from it.
