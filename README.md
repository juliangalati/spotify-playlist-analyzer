# Spotify Playlist Analyzer

Paste a public Spotify playlist URL and get a full audio-feature breakdown for every track — BPM, musical key, Camelot code, energy, danceability, valence, loudness — plus playlist-level aggregates and a Camelot Wheel that visualizes the playlist's key distribution. Designed for DJs and producers who want to scan a playlist for harmonic structure at a glance.

Sibling project to `spotify-track-analyzer` (single-track version, one level up). This one is bigger in scope: it runs as a proper Vite + React + TypeScript app with a small Node/Express backend so the Spotify client secret never reaches the browser.

## Features

- **Playlist header** — cover art, name, owner, track count, total duration, coverage badge
- **Summary grid** — averages for BPM, energy, danceability, valence, loudness; dominant key; major/minor split; total duration
- **Camelot Wheel (distribution view)** — 24-slot D3 wheel where each slot's opacity scales with how many tracks are in that key; accent stroke on the most-populated slot
- **Track gallery** — virtualized card grid (`@tanstack/react-virtual`) that stays smooth at 500+ tracks; sortable by BPM, energy, danceability, valence, or Camelot code
- **JSON export** — clean structured output with a one-click copy button

## Stack

- **Frontend**: Vite + React 18 + TypeScript, plain CSS (no framework)
- **Backend**: Node 20+ + Express + TypeScript (via `tsx` in dev)
- **Libraries**: `d3` v7 (Camelot wheel SVG), `@tanstack/react-virtual` (gallery virtualization)
- **Data sources**:
  - Spotify Web API for playlist metadata (`/v1/playlists/{id}`, `/v1/playlists/{id}/tracks`)
  - [ReccoBeats](https://reccobeats.com/) for audio features (batched)

> **Why ReccoBeats?** Spotify's `/v1/audio-features` returns 403 for apps created after 2024-11-27. ReccoBeats provides the same feature set (tempo, key, mode, energy, danceability, valence, acousticness, instrumentalness, liveness, loudness, speechiness) with the same scales and conventions, and requires no authentication.

## Setup

1. **Clone the repo** and `cd` into it.

2. **Create a Spotify app** at [developer.spotify.com/dashboard](https://developer.spotify.com/dashboard):
   - App name: anything
   - Redirect URI: `http://127.0.0.1:3001/callback` (required but unused)
   - API: Web API
   - Copy the **Client ID** and **Client Secret**

3. **Add your credentials:**
   ```bash
   cp .env.example .env
   ```
   Edit `.env` and fill in `SPOTIFY_CLIENT_ID` and `SPOTIFY_CLIENT_SECRET`. This file is gitignored.

4. **Install dependencies:**
   ```bash
   npm install
   ```

5. **Run the app (dev):**
   ```bash
   npm run dev
   ```
   This starts Vite on `http://localhost:5173` and Express on `http://localhost:3001` concurrently. Vite proxies `/api/*` to the backend. Open the Vite URL.

6. **Production build:**
   ```bash
   npm run build && npm start
   ```
   Express serves the built frontend on a single port.

## Usage

Paste a playlist URL like `https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M` and click **Analyze**. The app fetches the playlist, batches audio-feature requests to ReccoBeats, and renders everything once the data is in.

For very large playlists (300+ tracks), the track gallery uses virtualization — only on-screen cards are mounted, so scrolling stays smooth regardless of size. Some tracks may not be in ReccoBeats's catalog; those appear in the gallery with `—` placeholders, and the playlist header shows a coverage badge (e.g. `Analyzed 247 of 250 tracks`).

## Security

- `.env` is gitignored — never commit it.
- Unlike the track-analyzer sibling, the Spotify `CLIENT_SECRET` stays on the backend. The browser only talks to `/api/*` on our Express server.
- Public playlists only. No OAuth / user-auth flow — this app uses Spotify's client-credentials flow, which can't read private playlists or personalized data.

## Files

```
spotify-playlist-analyzer/
├─ README.md            ← you are here
├─ CLAUDE.md            ← guidance for Claude Code sessions
├─ SPEC.md              ← product spec
├─ ARCHITECTURE.md      ← code layout + data flow
├─ API.md               ← Spotify + ReccoBeats reference
├─ CAMELOT.md           ← Camelot Wheel math & lookup tables
├─ DESIGN.md            ← design system (Spotify-dark)
├─ BUILD_PLAN.md        ← ordered implementation checklist
├─ .env.example         ← template (committed)
├─ .env                 ← real secrets (gitignored)
├─ server/              ← Express backend
└─ src/                 ← React frontend
```

## Limitations

- ReccoBeats doesn't return `time_signature` — that field is omitted.
- ReccoBeats catalog coverage is good but not exhaustive. Missing tracks show `—` in the gallery; the playlist header surfaces the coverage ratio.
- Private and collaborative playlists will return 404 under client-credentials auth — this is intentional Spotify behavior, not a bug.
- `/v1/audio-features` on a newly-created Spotify app returns 403 — this is intentional Spotify policy. We route around it via ReccoBeats.
