# Product Spec

## Overview

A single-page web app that takes a public Spotify playlist URL and shows:

1. Playlist header (cover art, name, owner, track count, duration, coverage badge)
2. Playlist-level summary grid (aggregated metrics)
3. Camelot Wheel visualizing the playlist's key distribution
4. Virtualized gallery of track cards with per-track stats
5. JSON export of the full analyzed payload

The app is read-only and reads only public playlists. There is no login, no persistence, no multi-user concept.

## Input

A Spotify playlist URL. Parsed with:

```js
const PLAYLIST_RE = /playlist\/([A-Za-z0-9]{22})/;
```

Also accept a raw 22-char playlist ID.

If the regex doesn't match, show an inline error: `"Could not find a playlist ID in that URL. Expected format: https://open.spotify.com/playlist/..."`.

## Output — UI sections (top to bottom)

### 1. Nav

A thin top bar. Spotify-style green logo on the left, the title `Playlist Analyzer` next to it (see `DESIGN.md` for exact tokens). Same geometry as the sibling track analyzer's nav.

### 2. Intro + input row

- `<h1>Analyze a playlist</h1>`
- Subtitle: `Paste a public Spotify playlist URL to see its full audio analysis and key distribution.`
- Pill-shaped text input (500px radius, inset border-shadow) + green primary button labeled `ANALYZE` (uppercase, 1.4px letter-spacing).
- Enter key on the input triggers analyze.
- The button is disabled while a request is in flight.

### 3. Progress line

Shown under the input while loading. Text evolves through phases:

- `Fetching playlist…` — while pulling playlist metadata + paginated tracks.
- `Analyzing N / TOTAL tracks…` — once we know how many tracks we have and how many have come back from ReccoBeats. Updates after each batch resolves.
- Hidden once results render.

If the backend implements SSE progress (optional), use it; otherwise a single `Analyzing…` line is acceptable for the first pass.

### 4. Playlist header

- Left: cover art 200×200, 6px radius, heavy shadow.
- Right: stacked block —
  - Small uppercase label: `PLAYLIST`.
  - Playlist name (title font, 24px, weight 700).
  - Meta row: `by {owner}` (bold) · `{total} tracks` · `{total duration}`. Separators are `·` in `#7c7c7c`.
  - Coverage badge (only when `analyzed < total`): outlined pill, 12px uppercase, reads `ANALYZED N OF TOTAL`.

### 5. Summary grid

Responsive 4-column grid (3 / 2 / 1 on smaller breakpoints), same `.card` component as the sibling project:

| Card | Value | Sub / Extra |
|---|---|---|
| Avg BPM | integer | 2-dp exact |
| Avg Energy | 0–1 | progress bar |
| Avg Danceability | 0–1 | progress bar |
| Avg Valence | 0–1 | progress bar, sub `Mood` |
| Dominant Key | key name (e.g. `A minor`) | Camelot code in accent green |
| Avg Loudness | `-X.X dB` | — |
| Major / Minor | `68% / 32%` | — |
| Total Duration | `Xh Ym` or `Xm Ys` | — |

### 6. Camelot Wheel — distribution view

A D3-rendered 24-slot wheel (12 major = outer ring / "B", 12 minor = inner ring / "A"). Unlike the single-track version, this wheel is a **heatmap of the playlist**:

- Each slot's fill opacity = `count / maxCount`, with a floor of `0.15` for occupied slots so they stay visible.
- Unused slots get the base `--surface-interactive` color at normal opacity.
- Each populated slot shows a small count badge `×N` under its key label.
- The most-populated slot gets a 2px accent-green stroke.
- Legend below the wheel: a gradient swatch + label "Darker = more tracks in this key", plus a swatch for "Most-populated slot".
- Center text: `CAMELOT / WHEEL`, same typography as the sibling project.

See `CAMELOT.md` for rendering math and `DESIGN.md` for colors.

### 7. Track gallery

A virtualized grid of track cards. This is the workhorse view for exploring individual tracks.

**Card anatomy:**
- 200×200 album cover on top, 4px radius.
- Duration `m:ss` in the top-right corner of the cover area, 12px muted.
- Below cover:
  - Track title — 14px weight 700, white, 2-line max, ellipsis.
  - Artist names (joined with `, `) — 12px weight 400, `#b3b3b3`, 1-line ellipsis.
- Stats strip (two rows):
  - Row 1: `BPM · Key · Camelot` as inline labels. Camelot code in accent green.
  - Row 2: three thin bars side-by-side for Energy / Dance / Valence, each labeled above with the letter (`E D V`) and the value.
- Hover: card bg lifts from `--surface` to `--row-hover` (`#1f1f1f`) with shadow-medium.
- Cover is clickable — opens the Spotify track URL in a new tab.

**Missing-features tracks** (those not in ReccoBeats's catalog) show `—` for BPM, key, Camelot, and the bars, plus a subtle tooltip on hover: `Not in ReccoBeats catalog`.

**Grid layout:**
- `grid-template-columns: repeat(auto-fill, minmax(220px, 1fr))` at desktop.
- Gap 16px.
- At `<=768px` the grid collapses to `minmax(160px, 1fr)`.

**Virtualization:**
- Use `@tanstack/react-virtual`'s `useVirtualizer` with `lanes` = current visible column count, computed from a `ResizeObserver` on the scroll container.
- Scroll container has `overflow-y: auto` and a fixed `max-height` (e.g. `70vh`) so virtualization has a clear scroll parent.
- `estimateSize` — a fixed value around the computed row height (cover + content). The actual measured row height via `measureElement` is preferable but a good estimate is fine for the first pass.

**Sort pills** (above the grid):
- Row of small outlined pill buttons: `Default` · `BPM` · `Energy` · `Danceability` · `Valence` · `Camelot`.
- Active pill: green text, green border, transparent bg.
- Clicking the active pill toggles asc ↔ desc; clicking another pill switches sort + resets to desc.
- `Default` = playlist order as returned by Spotify (no sort).
- Tracks without features sort to the end regardless of direction.

### 8. JSON panel

Same pattern as the sibling project — a dark panel with a header row (`OUTPUT` label + `COPY` secondary button) and a scrollable `<pre>` body showing the pretty-printed JSON.

## JSON output shape

```ts
type Output = {
  playlist: {
    id: string;
    name: string;
    owner: string;
    image: string | null;
    total: number;           // total tracks reported by Spotify
    url: string;             // open.spotify.com URL
    duration_ms: number;     // sum of all tracks' duration_ms
  };
  coverage: {
    analyzed: number;        // tracks with features returned by ReccoBeats
    total: number;           // tracks we tried (after filtering nulls / locals / non-tracks)
  };
  aggregates: {
    avg_bpm: number;
    avg_energy: number;
    avg_danceability: number;
    avg_valence: number;
    avg_loudness: number;
    major_minor_ratio: { major: number; minor: number };  // 0..1 each, sum = 1
    key_distribution: Record<string /* CamelotCode like "8B" */, number>;
    dominant_key_code: string;   // e.g. "8B"
    total_duration_ms: number;   // same as playlist.duration_ms, duplicated for clarity
  };
  tracks: Array<{
    id: string;
    name: string;
    artists: Array<{ id: string; name: string }>;
    album: { name: string; release_date: string | null };
    duration_ms: number;
    url: string | null;
    cover: string | null;
    features: {
      bpm: number;
      key: number;
      mode: 0 | 1;
      camelot: string;       // e.g. "8A"
      energy: number;
      danceability: number;
      valence: number;
      acousticness: number;
      instrumentalness: number;
      liveness: number;
      loudness: number;
    } | null;
  }>;
};
```

Aggregates are computed over tracks with `features != null` only. Rounding: averages to 3 decimals, `avg_bpm` to 2.

## Error handling

| Condition | UX |
|---|---|
| Invalid / unparseable URL | Inline red status under the input |
| Playlist 404 (private / deleted / wrong id) | `Playlist not found or private.` |
| Spotify token failure | `Could not authenticate with Spotify. Check server credentials.` |
| ReccoBeats partial failure (some batches 4xx) | Log server-side, return partial results, show coverage badge |
| 0 tracks returned features | `No audio features are available for any track in this playlist.` (error) |
| Network failure | `Network error: {message}` |

Partial coverage (`analyzed < total`) is a **warning**, not an error — the coverage badge on the header is enough signal.

## Non-goals

- OAuth / user login
- Private, collaborative, or user-library playlists
- Persistence (no DB, no localStorage of past analyses)
- Playback / preview audio
- Exporting playlists to other services
- Mobile-native app (responsive web only)
- Multi-playlist comparison (single playlist at a time)
