# Build Plan

Ordered, step-by-step recipe for getting from an empty repo to a working app. Each step is self-contained and ends in a verifiable state. Follow them in order — later steps assume earlier steps are done.

Before you start, skim `SPEC.md`, `ARCHITECTURE.md`, and `API.md`. `DESIGN.md` and `CAMELOT.md` are reference materials you'll pull from during specific steps.

---

## Step 0 — Verify environment

```bash
node --version    # should be v20.x or later
npm --version     # should be v10.x or later
```

If Node is older, install a recent LTS (e.g. via `nvm install 20`). Vite 5 and modern `@types/node` assume Node 20+.

You'll also need the Spotify credentials from the sibling project:
```bash
cat ../spotify-track-analyzer/credentials.js
```
(Copy `CLIENT_ID` and `CLIENT_SECRET` — you'll put them in `.env` in Step 1.)

---

## Step 1 — Scaffold the project

### 1a. Package + dependencies

```bash
npm init -y
```

Install runtime deps:
```bash
npm install react react-dom @tanstack/react-virtual d3 express cors dotenv
```

Install dev deps:
```bash
npm install -D vite @vitejs/plugin-react typescript tsx \
  @types/react @types/react-dom @types/express @types/cors \
  @types/d3 @types/node concurrently
```

### 1b. `package.json` scripts

```json
{
  "scripts": {
    "dev": "concurrently -k -n web,server -c blue,magenta \"npm:dev:web\" \"npm:dev:server\"",
    "dev:web": "vite",
    "dev:server": "tsx watch server/index.ts",
    "build": "tsc --noEmit && vite build && tsc -p tsconfig.server.json",
    "start": "NODE_ENV=production node dist-server/index.js",
    "typecheck": "tsc --noEmit && tsc -p tsconfig.server.json --noEmit"
  }
}
```

(Feel free to simplify if you skip compiling the server — you can also `tsx server/index.ts` in prod, though the compiled `dist-server/` is cleaner.)

### 1c. TypeScript configs

`tsconfig.json` (base / frontend):
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "useDefineForClassFields": true,
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": false,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "jsx": "react-jsx",
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true
  },
  "include": ["src"]
}
```

`tsconfig.server.json` (backend):
```json
{
  "extends": "./tsconfig.json",
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "lib": ["ES2022"],
    "jsx": "preserve",
    "outDir": "dist-server",
    "rootDir": "server",
    "noEmit": false,
    "declaration": false
  },
  "include": ["server"]
}
```

### 1d. Vite config

`vite.config.ts`:
```ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:3001',
    },
  },
  build: {
    outDir: 'dist',
  },
});
```

### 1e. Environment files

`.env.example` (committed):
```
SPOTIFY_CLIENT_ID=YOUR_CLIENT_ID
SPOTIFY_CLIENT_SECRET=YOUR_CLIENT_SECRET
PORT=3001
```

`.env` (gitignored, real values):
```
SPOTIFY_CLIENT_ID=...
SPOTIFY_CLIENT_SECRET=...
PORT=3001
```

### 1f. `.gitignore`

```
node_modules/
dist/
dist-server/
.env
.env.*
!.env.example
.DS_Store
*.log
.vite/
.claude/settings.local.json
```

### 1g. `index.html` (Vite entry)

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Spotify Playlist Analyzer</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

### 1h. Verify

```bash
npm run typecheck    # should pass with zero files
ls -la               # confirms the scaffold structure
```

**Commit suggestion**: `chore: scaffold Vite + React + Express project`

---

## Step 2 — Pure logic modules

Port the math-heavy, framework-free modules first. These are the easiest to verify and everything else depends on them.

### 2a. `src/camelot.ts`

Copy the lookup tables and function bodies verbatim from `CAMELOT.md` §"Canonical implementations". No React imports.

### 2b. `src/util.ts`

```ts
export function round(n: number | null | undefined, digits = 3): number | null {
  if (n == null || Number.isNaN(n)) return null;
  const p = 10 ** digits;
  return Math.round(n * p) / p;
}

export function formatDuration(ms: number): string {
  const total = Math.round(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

export function formatLongDuration(ms: number): string {
  const totalSec = Math.round(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m ${s}s`;
}

export function parsePlaylistId(urlOrId: string): string | null {
  const m = urlOrId.trim().match(/playlist\/([A-Za-z0-9]{22})/);
  if (m) return m[1];
  const raw = urlOrId.trim().match(/^[A-Za-z0-9]{22}$/);
  if (raw) return raw[0];
  return null;
}
```

### 2c. `src/aggregate.ts`

Implements `computeAggregates(tracks: TrackRow[]): Aggregates` per `SPEC.md` §"JSON output shape". Operates only over tracks with `features != null`. If zero tracks have features, throw — the caller short-circuits with an error UI.

Key details:
- `avg_*` fields: sum / count (skip nulls), `round(..., 3)` for most, `round(..., 2)` for BPM.
- `major_minor_ratio`: `{ major: majorCount / total, minor: minorCount / total }`, rounded to 3 dp.
- `key_distribution`: `Record<camelotCode, count>`. Skip tracks whose `camelotFor(key, mode)` is null.
- `dominant_key_code`: highest count in `key_distribution`. Tiebreaker: lowest Camelot number, then `A` before `B`.
- `total_duration_ms`: sum of `track.duration_ms` across **all** tracks (even those without features — duration comes from Spotify).

### 2d. `src/types.ts`

Copy the types from `ARCHITECTURE.md` §"Types".

### 2e. Verify

```bash
npm run typecheck
```

**Commit suggestion**: `feat: pure logic modules (camelot, aggregate, util, types)`

---

## Step 3 — Backend

Build the Express app end-to-end before touching the frontend, so you can `curl` the API into existence.

### 3a. `server/spotify.ts`

- Env-check on module load: if `SPOTIFY_CLIENT_ID` or `SPOTIFY_CLIENT_SECRET` are missing, throw.
- `getToken()` — in-memory cache, refresh 10s before expiry. POST with basic auth header + `grant_type=client_credentials` body.
- `fetchPlaylistMetadata(id)` — single GET, extract just the fields we need (see `ARCHITECTURE.md` + `API.md`).
- `fetchAllPlaylistTracks(id)` — loop through pages while `next != null`. Filter inline.

### 3b. `server/reccobeats.ts`

- `fetchAudioFeatures(spotifyIds)` — chunks of 40, up to 4 chunks in flight using something like `p-limit`-style control (or just `Promise.all` over batched-pairs — the code is short enough to write by hand).
- Parse Spotify ID from each item's `href`. Build `Map<string, Features>`.
- Per-chunk failure = log + skip; don't fail the whole request.

### 3c. `server/index.ts`

```ts
import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { fetchPlaylistMetadata, fetchAllPlaylistTracks } from './spotify.js';
import { fetchAudioFeatures } from './reccobeats.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = Number(process.env.PORT ?? 3001);

if (process.env.NODE_ENV !== 'production') {
  app.use(cors());
}

app.get('/api/health', (_req, res) => res.json({ ok: true }));

app.get('/api/playlist/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const [meta, tracks] = await Promise.all([
      fetchPlaylistMetadata(id),
      fetchAllPlaylistTracks(id),
    ]);
    const featuresMap = await fetchAudioFeatures(tracks.map(t => t.id));

    const analyzedTracks = tracks.map(t => ({
      id: t.id,
      name: t.name,
      artists: t.artists.map(a => ({ id: a.id, name: a.name })),
      album: { name: t.album.name, release_date: t.album.release_date ?? null },
      duration_ms: t.duration_ms,
      url: t.external_urls?.spotify ?? null,
      cover: t.album.images?.[0]?.url ?? null,
      features: featuresMap.get(t.id) ?? null,
    }));

    const analyzedCount = analyzedTracks.filter(t => t.features).length;

    res.json({
      playlist: {
        id: meta.id,
        name: meta.name,
        owner: meta.owner.display_name,
        image: meta.images?.[0]?.url ?? null,
        total: meta.tracks.total,
        url: meta.external_urls.spotify,
        duration_ms: analyzedTracks.reduce((sum, t) => sum + t.duration_ms, 0),
      },
      coverage: { analyzed: analyzedCount, total: analyzedTracks.length },
      tracks: analyzedTracks,
    });
  } catch (err: any) {
    const status = err?.status ?? 500;
    const message = err?.message ?? 'Internal error';
    console.error('[playlist]', message);
    res.status(status).json({ error: message });
  }
});

if (process.env.NODE_ENV === 'production') {
  const dist = path.join(__dirname, '..', 'dist');
  app.use(express.static(dist));
  app.get('*', (_req, res) => res.sendFile(path.join(dist, 'index.html')));
}

app.listen(PORT, () => {
  console.log(`[server] listening on http://localhost:${PORT}`);
});
```

(Adjust imports / extensions to whatever your TS/ESM config ends up needing. If using `tsx watch`, the `.js` suffix in imports may or may not be required — run and iterate.)

### 3d. Verify

In one terminal:
```bash
npm run dev:server
```

In another:
```bash
curl -s http://localhost:3001/api/health
# {"ok":true}

# Use a known public playlist ID (e.g. "Today's Top Hits"):
curl -s http://localhost:3001/api/playlist/37i9dQZF1DXcBWIGoYBM5M | head -c 400
```

You should see a JSON response with `playlist`, `coverage`, `tracks`.

**Commit suggestion**: `feat: backend API for playlist analysis`

---

## Step 4 — Frontend shell + global styles

### 4a. `src/index.css`

Port the entire `:root { ... }` block, scrollbar styles, and base typography from `../spotify-track-analyzer/index.html`. Add the additions from `DESIGN.md` §10 (coverage badge tokens, `--row-hover`).

### 4b. `src/main.tsx`

```tsx
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
```

### 4c. `src/api.ts`

```ts
import type { AnalyzerPayload } from './types';

export async function analyzePlaylist(id: string): Promise<AnalyzerPayload> {
  const res = await fetch(`/api/playlist/${id}`);
  if (!res.ok) {
    const { error } = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(error);
  }
  return res.json();
}
```

### 4d. `src/App.tsx` (skeleton)

```tsx
import { useState } from 'react';
import { analyzePlaylist } from './api';
import { parsePlaylistId } from './util';
import { computeAggregates } from './aggregate';
import type { AnalyzerPayload, Aggregates } from './types';
import Nav from './components/Nav';

export default function App() {
  const [url, setUrl] = useState('');
  const [status, setStatus] = useState<{ kind: 'idle' | 'loading' | 'error'; message?: string }>({ kind: 'idle' });
  const [payload, setPayload] = useState<AnalyzerPayload | null>(null);
  const [aggregates, setAggregates] = useState<Aggregates | null>(null);

  async function analyze() {
    const id = parsePlaylistId(url);
    if (!id) {
      setStatus({ kind: 'error', message: 'Could not find a playlist ID in that URL.' });
      return;
    }
    setStatus({ kind: 'loading' });
    setPayload(null);
    setAggregates(null);
    try {
      const p = await analyzePlaylist(id);
      setPayload(p);
      setAggregates(computeAggregates(p.tracks));
      setStatus({ kind: 'idle' });
    } catch (err) {
      setStatus({ kind: 'error', message: err instanceof Error ? err.message : String(err) });
    }
  }

  return (
    <>
      <Nav />
      <main>
        {/* input row + progress + results sections (added in later steps) */}
      </main>
    </>
  );
}
```

### 4e. Verify

```bash
npm run dev
# open http://localhost:5173
```

You should see the nav bar and a blank main area. No console errors.

**Commit suggestion**: `feat: frontend shell and design tokens`

---

## Step 5 — Static presentation components

Build everything that doesn't need virtualization or D3 first.

### 5a. `src/components/Nav.tsx`

Port the nav block (logo SVG + title) from the sibling project. Only change the title text to "Playlist Analyzer".

### 5b. `src/components/Card.tsx`

```tsx
type CardProps = {
  label: string;
  value: React.ReactNode;
  sub?: string;
  bar?: number;       // 0..1
  accent?: boolean;   // makes the value green (for dominant-key-camelot)
};
```

Port the markup from the sibling's `makeCard` — same class names (`.card`, `.card-label`, `.card-value`, `.card-sub`, `.bar`).

### 5c. `src/components/PlaylistHeader.tsx`

Props: `{ playlist: Playlist; coverage: Coverage }`. Render cover + name + meta + coverage badge (only when `coverage.analyzed < coverage.total`).

### 5d. `src/components/SummaryGrid.tsx`

Props: `{ aggregates: Aggregates }`. Renders 8 `<Card>`s per `SPEC.md` §5.

### 5e. `src/components/JsonPanel.tsx`

Header row + scrollable `<pre>`. Copy button uses `navigator.clipboard.writeText`; swaps its label to `COPIED` for 1.2s. Same component pattern as the sibling.

### 5f. Wire into `App.tsx`

After payload loads, render:
```tsx
<PlaylistHeader playlist={payload.playlist} coverage={payload.coverage} />
<SummaryGrid aggregates={aggregates} />
{/* CamelotWheel — Step 6 */}
{/* TrackGallery — Step 7 */}
<JsonPanel data={{ playlist: payload.playlist, coverage: payload.coverage, aggregates, tracks: payload.tracks }} />
```

### 5g. Verify

Paste a small public playlist. Header + summary cards + JSON panel all render. The wheel + gallery slots stay blank.

**Commit suggestion**: `feat: header, summary grid, and JSON panel`

---

## Step 6 — Camelot Wheel (distribution view)

### 6a. `src/components/CamelotWheel.tsx`

Props: `{ keyDistribution: Record<string, number> }`.

Port the geometry (arcs, slot angles, labels) from the sibling's `renderWheel`. Key differences per `CAMELOT.md` §"Distribution-wheel rendering spec":
- Fill every slot with a `fill-opacity` based on its count fraction.
- Add a `×N` text badge on populated slots.
- Accent stroke on the most-populated slot.

Use `useRef` + `useEffect` to render D3 imperatively into the SVG. Clear the SVG with `d3.select(ref.current).selectAll('*').remove()` before each render.

### 6b. Verify

Paste a playlist with varied keys. The wheel shows a clear heatmap — most-populated slot has the green stroke and full opacity, emptier slots are dimmer, empty slots are solid dark.

Test edge cases:
- Playlist where all tracks share a key (one slot at full opacity, rest empty).
- Playlist with only one track (same effect).

**Commit suggestion**: `feat: Camelot Wheel distribution view`

---

## Step 7 — Track gallery + virtualization

The highest-risk step. Take it slowly.

### 7a. `src/components/TrackCard.tsx`

Props: `{ track: TrackRow }`. Layout per `SPEC.md` §7:
- Cover with duration overlay on top-right.
- Title + artist.
- Stats strip: BPM · Key · Camelot + 3 bars (Energy/Dance/Valence).
- Missing-features state: `—` placeholders + tooltip via `title` attribute.

### 7b. `src/components/TrackGallery.tsx` — initial (non-virtualized) version

Before wiring virtualization, render the full list in a CSS grid. This lets you verify the card layout, sort behavior, and missing-features state without the extra complexity.

```tsx
function TrackGallery({ tracks }: { tracks: TrackRow[] }) {
  const [sort, setSort] = useState<{ field: SortField; dir: 'asc' | 'desc' }>({ field: 'default', dir: 'desc' });
  const sorted = useMemo(() => sortTracks(tracks, sort), [tracks, sort]);

  return (
    <section>
      <SortPills sort={sort} onChange={setSort} />
      <div className="track-grid">
        {sorted.map(t => <TrackCard key={t.id} track={t} />)}
      </div>
    </section>
  );
}
```

Verify this works end-to-end with a medium playlist (~100 tracks). Confirm sorting, hover states, missing-features placeholders.

### 7c. Add virtualization

Swap the `.track-grid` body for `@tanstack/react-virtual`. Per `ARCHITECTURE.md` §"Virtualization approach":

- A scroll parent with `overflow-y: auto; max-height: 70vh`.
- Inside it, a div sized to the full virtualized height.
- Use either the `lanes` mode or the simpler "rows-of-N-cards" approach.
- Recompute column count via `ResizeObserver` on the scroll parent.

**Simpler approach (recommended for first pass)**:
1. Compute `columns = Math.max(1, Math.floor(width / 220))`.
2. Chunk `sorted` into rows of `columns`.
3. `useVirtualizer({ count: rows.length, getScrollElement, estimateSize: () => 360, overscan: 4 })`.
4. For each virtual row, render a flex container with the row's cards.
5. Re-chunk on resize.

Verify with a 300+ track playlist: scrolling stays smooth, cards render only as they come on-screen (check React DevTools profiler).

### 7d. Sort logic

`src/components/TrackGallery.tsx` or a helper file:
```ts
type SortField = 'default' | 'bpm' | 'energy' | 'danceability' | 'valence' | 'camelot';

function sortTracks(tracks: TrackRow[], sort: { field: SortField; dir: 'asc' | 'desc' }): TrackRow[];
```

- `default`: playlist order (just return `tracks`).
- Tracks without features sort to the end regardless of direction.
- `camelot`: sort by `(number, letter)` tuple lexicographically.

### 7e. Verify

- Small playlist → grid renders, all 6 sort pills work, asc/desc toggle works.
- Medium playlist → same, no lag.
- Large playlist (300+) → smooth scroll, sort snaps instantly.
- Playlist with missing-features tracks → placeholders + tooltip; those tracks end up at the bottom after sorting.

**Commit suggestion**: `feat: virtualized track gallery with sorting`

---

## Step 8 — Polish

Small quality-of-life items that are easy to forget:

- **Progress line** — keep it simple for now: show `Analyzing…` during the fetch. Optional: wire server-sent events for real N/TOTAL updates.
- **Empty states** — if `coverage.analyzed === 0`, show the "no features available" error and skip the wheel/gallery.
- **Error toast styling** — make sure the red `.status.error` reads well.
- **Keyboard shortcut** — Enter in the input should trigger Analyze (most browsers do this for `<form>`, but with a plain input you need an `onKeyDown`).
- **JSON copy feedback** — button briefly flashes `COPIED`, then reverts.
- **`<title>` update** — after a playlist loads, set `document.title = \`${playlist.name} – Playlist Analyzer\``.
- **Accessibility** — images have `alt` text, buttons have proper labels, tab order is sensible.

**Commit suggestion**: `polish: progress line, error states, keyboard, a11y`

---

## Step 9 — Production build

```bash
npm run build
```

Confirm `dist/` is populated and there are no TS errors. If `tsc -p tsconfig.server.json` fails because of import extensions, fix your `server/` imports to use `.js` suffixes or switch the server TS config to a bundler-style resolver.

```bash
npm start
# Open http://localhost:3001 (Express serves both static + API)
```

Smoke-test the same playlists you used in Step 7.

**Commit suggestion**: `chore: production build verified`

---

## Step 10 — End-to-end verification

Run through this checklist:

- [ ] `npm run typecheck` — passes with zero errors.
- [ ] Small playlist (~10 tracks): full flow works, JSON copies, wheel renders, cards sort.
- [ ] Medium playlist (~100 tracks): no lag during render or sort.
- [ ] Large playlist (~300+ tracks): virtualization holds scrolling smooth.
- [ ] Playlist with at least one non-catalog track: coverage badge shows, those cards display `—`, sort sends them to the bottom.
- [ ] Invalid URL: inline error appears and clears once a valid URL is typed.
- [ ] Private/invalid playlist ID: error message is clear.
- [ ] Reload during fetch: doesn't leave the app in a weird state.
- [ ] `npm run build && npm start` works on a single port.
- [ ] `.env` is not checked into git (`git status` shows it as ignored).

If any fail, fix before considering the project done.

**Final commit suggestion**: `feat: end-to-end verified, ready to use`

---

## Notes on deviations

Nothing here is sacred — if you find a cleaner way to structure something, do it and update the relevant doc so the next person isn't confused. The docs are the source of truth; the code enforces them but doesn't replace them.

The only things that shouldn't change without explicit user discussion:
- The stack choice (Vite/React/Express/TS).
- The rule that `CLIENT_SECRET` stays server-side.
- The design system from `DESIGN.md`.
- The decision to not paginate or cap playlist size.
