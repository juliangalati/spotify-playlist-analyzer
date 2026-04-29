# Architecture

## Directory tree

```
spotify-playlist-analyzer/
├─ package.json
├─ tsconfig.json                # shared compiler options (strict)
├─ tsconfig.server.json         # extends base, adds server/ include
├─ vite.config.ts               # React plugin + dev proxy /api → :3001
├─ .env                         # SPOTIFY_CLIENT_ID, SPOTIFY_CLIENT_SECRET, PORT (gitignored)
├─ .env.example                 # committed template
├─ .gitignore
├─ README.md
├─ CLAUDE.md
├─ SPEC.md
├─ ARCHITECTURE.md              # this file
├─ API.md
├─ CAMELOT.md
├─ DESIGN.md
├─ BUILD_PLAN.md
├─ index.html                   # Vite entry
├─ server/
│   ├─ index.ts                 # Express app, routes, static serve in prod
│   ├─ spotify.ts               # Token cache + playlist pagination
│   └─ reccobeats.ts            # Batched audio-features fetcher
├─ src/
│   ├─ main.tsx                 # ReactDOM.createRoot → <App />
│   ├─ App.tsx                  # Top-level flow: input, progress, results
│   ├─ index.css                # Global tokens + shared styles
│   ├─ api.ts                   # fetch wrapper for /api/playlist/:id
│   ├─ types.ts                 # TrackRow, Playlist, Features, Aggregates
│   ├─ camelot.ts               # Pure: camelotFor, keyName, compatibleCodes, buildWheelSlots
│   ├─ aggregate.ts             # Pure: computeAggregates(tracks)
│   ├─ util.ts                  # Pure: formatDuration, formatLongDuration, round, parsePlaylistId
│   └─ components/
│       ├─ Nav.tsx
│       ├─ PlaylistHeader.tsx
│       ├─ SummaryGrid.tsx
│       ├─ Card.tsx             # Generic label/value/sub/bar card (reused from sibling)
│       ├─ CamelotWheel.tsx     # D3 distribution wheel
│       ├─ TrackGallery.tsx     # Virtualized grid + sort pills
│       ├─ TrackCard.tsx        # One track tile
│       └─ JsonPanel.tsx
└─ dist/                        # Vite build output (gitignored)
```

## Ports & dev orchestration

- **Vite dev server** → `http://localhost:5173` (serves `src/`)
- **Express server** → `http://localhost:3001` (serves `/api/*`)
- `vite.config.ts` adds a dev-only proxy:
  ```ts
  server: { proxy: { '/api': 'http://localhost:3001' } }
  ```
- `package.json` scripts use `concurrently` so `npm run dev` runs both.
- In production (`npm run build && npm start`), Vite emits to `dist/`, Express serves both `dist/*` static files and `/api/*` on a single port.

## Backend (`server/`)

### `server/spotify.ts`

Responsibilities: hold a cached access token; fetch playlist + paginate tracks.

```ts
export async function getToken(): Promise<string>;
export async function fetchPlaylistMetadata(id: string): Promise<PlaylistMetadata>;
export async function fetchAllPlaylistTracks(id: string): Promise<SpotifyTrack[]>;
```

- `getToken`: POST `https://accounts.spotify.com/api/token` with `grant_type=client_credentials` and basic auth header. In-memory cache; refresh 10s before expiry.
- `fetchAllPlaylistTracks`: loops `GET /v1/playlists/{id}/tracks?limit=100&offset=N` until `next` is null. Filters `null`, `is_local`, non-track items inline.
- All errors throw; the route handler translates to HTTP codes.

### `server/reccobeats.ts`

Responsibilities: batched audio-features fetch, remap ReccoBeats results to Spotify IDs.

```ts
export async function fetchAudioFeatures(
  spotifyIds: string[]
): Promise<Map<string /* spotifyId */, ReccoFeatures>>;
```

- Chunks `spotifyIds` into groups of **40** (see `API.md` — tested max). Runs up to **4 chunks in parallel**.
- For each chunk: `GET https://api.reccobeats.com/v1/audio-features?ids=a,b,c,...`, parses `content[]`, extracts the Spotify ID from each item's `href` (`https://open.spotify.com/track/{spotifyId}`), stores in the result map.
- Tracks not in the catalog are simply absent from the map — the caller treats them as `features: null`.

### `server/index.ts`

- Loads `dotenv` config. Validates that `SPOTIFY_CLIENT_ID` and `SPOTIFY_CLIENT_SECRET` are set; exits with an error if not.
- Routes:
  - `GET /api/playlist/:id` — main analyzer endpoint.
  - `GET /api/health` — simple `{ ok: true }` for smoke tests.
- In production (`NODE_ENV === 'production'` or when `dist/` exists), adds `express.static('dist')` and a catch-all that serves `dist/index.html` for SPA routes.
- Dev mode: enables `cors()` for the Vite origin, even though the dev proxy makes it mostly unnecessary.

### Route contract: `GET /api/playlist/:id`

- **Success (200)**: `{ playlist, tracks, coverage }` matching the shape in `SPEC.md` minus the client-computed `aggregates` (the client computes aggregates from `tracks`).
- **404**: playlist not found / private.
- **500**: Spotify auth failure, network error, unexpected exception.

Server does **not** return aggregates — it keeps the backend stateless and avoids duplicating the aggregation logic across boundary. The client calls `computeAggregates(tracks)` once the payload lands.

## Frontend (`src/`)

### Data flow

```
                ┌──────────┐
URL input ─────▶│  App.tsx │
                └────┬─────┘
                     │ fetch('/api/playlist/:id')
                     ▼
                ┌──────────┐
                │  api.ts  │
                └────┬─────┘
                     │ { playlist, tracks, coverage }
                     ▼
             computeAggregates(tracks)  ← aggregate.ts
                     │
                     ▼
   ┌─────────┬─────────────┬────────────┬────────────┬──────────┐
   ▼         ▼             ▼            ▼            ▼          ▼
Nav  PlaylistHeader  SummaryGrid  CamelotWheel  TrackGallery  JsonPanel
```

State is local to `App.tsx` — a single `useState` for `{ status, payload, aggregates, error }`. No context, no global store.

### Component responsibilities

| Component | Purpose |
|---|---|
| `Nav` | Logo + `Playlist Analyzer` title. Pure presentational. |
| `PlaylistHeader` | Cover art + name/owner/duration + coverage badge. Props: `playlist`, `coverage`. |
| `SummaryGrid` | 4-col responsive grid of `Card`s showing aggregates. Props: `aggregates`. |
| `Card` | Reusable: `{ label, value, sub?, bar? }`. Ports `makeCard()` from the sibling project. |
| `CamelotWheel` | D3 SVG wheel with distribution heatmap. Props: `keyDistribution: Record<string, number>`. |
| `TrackGallery` | Virtualized grid + sort pills. Props: `tracks`. Owns its own sort state. |
| `TrackCard` | One track tile. Props: `{ track, width }` (width for measurement). |
| `JsonPanel` | Header + `<pre>` + copy button. Props: `data: unknown`. |

### Virtualization approach (`TrackGallery`)

Using `@tanstack/react-virtual`:

1. A scroll-parent `<div>` with `overflow-y: auto` and `max-height: 70vh`.
2. Inside, a content `<div>` with computed `height: totalRows * rowHeight`.
3. `lanes` (columns) is derived from container width:
   - `ResizeObserver` on the scroll parent.
   - `columns = Math.max(1, Math.floor(width / 220))` (desktop) or `160` (mobile breakpoint).
4. `rowHeight` is ~360px (cover 200 + content ~160). Measure with `measureElement` after first render if needed, but the estimate is usually fine.
5. `virtualizer.getVirtualItems()` returns `{ index, lane, start }`. Each item maps to `sortedTracks[index * columns + lane]` — except we actually use the library's `lanes` mode which returns `{ index, lane }` pairs directly.
6. Rendered absolutely within the content div: `transform: translate3d(lane * columnWidth, start, 0)`.

If `lanes` mode is too fiddly for the initial implementation, a simpler alternative is to precompute rows (`chunks of N`) and use the standard `useVirtualizer({ count: rows.length })` API, rendering each row as a flex container of up to `N` cards. This is slightly less efficient but noticeably simpler.

## Types (src/types.ts)

```ts
export type Playlist = {
  id: string;
  name: string;
  owner: string;
  image: string | null;
  total: number;
  url: string;
  duration_ms: number;
};

export type Features = {
  bpm: number;
  key: number;
  mode: 0 | 1;
  camelot: string;
  energy: number;
  danceability: number;
  valence: number;
  acousticness: number;
  instrumentalness: number;
  liveness: number;
  loudness: number;
};

export type TrackRow = {
  id: string;
  name: string;
  artists: Array<{ id: string; name: string }>;
  album: { name: string; release_date: string | null };
  duration_ms: number;
  url: string | null;
  cover: string | null;
  features: Features | null;
};

export type Coverage = { analyzed: number; total: number };

export type Aggregates = {
  avg_bpm: number;
  avg_energy: number;
  avg_danceability: number;
  avg_valence: number;
  avg_loudness: number;
  major_minor_ratio: { major: number; minor: number };
  key_distribution: Record<string, number>;
  dominant_key_code: string;
  total_duration_ms: number;
};

export type AnalyzerPayload = {
  playlist: Playlist;
  coverage: Coverage;
  tracks: TrackRow[];
};
```

Backend types in `server/` can be duplicated (or narrower — the server may have additional fields like raw ReccoBeats items internally).
