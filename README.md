# Spotify Playlist Analyzer

Log in with Spotify, paste one of your playlists, and get a full audio-feature breakdown for every track — BPM, musical key, Camelot code, energy, danceability, valence, loudness — plus playlist-level aggregates and a Camelot Wheel that visualizes the playlist's key distribution. Designed for DJs and producers who want to scan a playlist for harmonic structure at a glance.

Sibling project to `spotify-track-analyzer` (single-track version). This one is bigger in scope: it runs as a Vite + React + TypeScript app with an Express backend that owns the Spotify OAuth flow and the client secret.

## Features

- **Spotify OAuth login** — authorization-code flow with session cookies, scopes `playlist-read-private` + `playlist-read-collaborative`.
- **Playlist header** — cover art, name, owner, track count, total duration, coverage badge when some tracks aren't in the audio-feature catalog.
- **Summary grid** — averages for BPM, energy, danceability, valence, loudness; dominant key; major/minor split; total duration.
- **Camelot Wheel (distribution view)** — 24-slot D3 wheel where each slot's opacity scales with how many tracks are in that key; accent stroke on the most-populated slot.
- **Track gallery** — virtualized card grid (`@tanstack/react-virtual`) that stays smooth at 500+ tracks; sortable by BPM, energy, danceability, valence, or Camelot code. Tracks missing ReccoBeats data get a highlighted border and "No data" badge.
- **JSON export** — clean structured output with a one-click copy button.

## Stack

- **Frontend**: Vite + React 18 + TypeScript, plain CSS (no framework).
- **Backend**: Node 20+ + Express + TypeScript (`tsx watch` in dev), `express-session` for OAuth state.
- **Libraries**: `d3` v7 (Camelot wheel), `@tanstack/react-virtual` (gallery virtualization).
- **Data sources**:
  - Spotify Web API — `/v1/playlists/{id}` (with embedded `tracks.items` / `items`) via user OAuth.
  - [ReccoBeats](https://reccobeats.com/) for audio features (batched, no auth).

> **Why ReccoBeats?** Spotify's `/v1/audio-features` returns 403 for apps created after 2024-11-27. ReccoBeats provides the same feature set with the same scales, no authentication required.

> **Why user OAuth instead of client credentials?** As of Spotify's 2026 platform tightening, `/v1/playlists/{id}/tracks` requires a user access token. Client-credentials tokens get 403. This app uses the authorization-code flow so the Spotify session belongs to you.

## Spotify access — what works and what doesn't

This is important and changed recently. Spotify Web API behavior under the current policy:

| Situation | Works? |
|---|---|
| A playlist **you own** or **you collaborate on** | ✅ Yes |
| A **public** playlist owned by another user | ❌ 403 — only visible to that user's sessions |
| A **Spotify editorial** playlist (URLs starting with `37i9dQZF1*`) | ❌ 403 — locked down for apps created after 2024-11-27 |
| A **Spotify-owned algorithmic** playlist (Discover Weekly, Daily Mix, etc.) | ❌ 403 — same policy |

To analyze playlists beyond your own account, you'd need to request **Extended Mode** access for your app from the Spotify Developer Dashboard. That's a manual approval by Spotify and isn't something the app can bypass.

## Setup

1. **Clone the repo** and `cd` into it.

2. **Create a Spotify app** at [developer.spotify.com/dashboard](https://developer.spotify.com/dashboard):
   - App name: anything.
   - API: Web API.
   - Add this **Redirect URI** (exactly as shown): `http://127.0.0.1:3001/api/auth/callback`
   - Copy the **Client ID** and **Client Secret**.

3. **Add your credentials:**
   ```bash
   cp .env.example .env
   ```
   Edit `.env` and fill in `SPOTIFY_CLIENT_ID`, `SPOTIFY_CLIENT_SECRET`, and `SESSION_SECRET` (any long random string). This file is gitignored.

4. **Install dependencies:**
   ```bash
   npm install
   ```

5. **Run the app (dev):**
   ```bash
   npm run dev
   ```
   Vite runs on `http://127.0.0.1:5173` and Express on `http://127.0.0.1:3001` concurrently. Open the Vite URL, click **Log in with Spotify**, then paste a playlist URL.

6. **Production build:**
   ```bash
   npm run build && npm start
   ```
   Express serves the built frontend and the API on a single port.

> ⚠️ Use `127.0.0.1`, not `localhost`. Spotify's redirect URI matching is literal, and the session cookie must be set on the same origin the browser visits.

## Usage

1. Click **Log in with Spotify** (one-time per session, 7-day cookie).
2. Paste a playlist URL you own, e.g. `https://open.spotify.com/playlist/68VBtAECLS6EbpzrTLL8er`.
3. Click **Analyze**. The app fetches the playlist via the Spotify Web API, then batches audio-feature requests to ReccoBeats (chunks of 40, up to 4 in flight), then renders everything.

For very large playlists (300+ tracks), the track gallery uses virtualization — only on-screen cards are mounted, so scrolling stays smooth regardless of size. Tracks that aren't in ReccoBeats's catalog show `—` placeholders with a highlighted border and a "No data" badge; the playlist header shows a coverage badge (e.g. `Analyzed 60 of 73`).

## Security

- `.env` is gitignored — never commit it.
- `CLIENT_SECRET` stays on the backend. The browser only talks to `/api/*` on the Express server.
- Sessions use HTTP-only, SameSite=Lax cookies. In production, `secure: true` is enabled automatically.
- No playback or token exposure to the browser.

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
├─ server/              ← Express backend (OAuth + Spotify + ReccoBeats)
└─ src/                 ← React frontend
```

## Limitations

- Analysis is limited to playlists the logged-in Spotify account can read (your own + those you collaborate on). See the access table above.
- ReccoBeats doesn't return `time_signature` — that field is omitted.
- ReccoBeats catalog coverage is good but not exhaustive. Missing tracks are flagged in the UI and in the coverage badge.
