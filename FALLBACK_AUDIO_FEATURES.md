# Fallback audio features — implementation guide

When ReccoBeats doesn't have a track (common for indie / post-2022 / non-US catalog), the app currently shows "No data" and excludes the track from aggregates, Camelot-wheel counts, and transition-cost computations. This document describes how to implement a **second-source fallback** so those tracks get partial features instead.

This is a plan for future work. It is not implemented.

## Why this is non-trivial

Four things we already ruled out. If a future reader is tempted to "just use X," here's why we didn't:

1. **Spotify `/v1/audio-features`** — 403 for apps created after 2024-11-27. Permanent.
2. **ReccoBeats by artist + title** — doesn't exist. Every ReccoBeats metadata endpoint is Spotify-ID-keyed only. The only non-ID endpoint (`POST /v1/analysis/audio-features`) accepts an audio upload but returns 9 features without `key`/`mode`, so no Camelot. Useless for our purpose.
3. **AcousticBrainz** — frozen since mid-2022. Covers historical catalog but zero help for recent releases (e.g. the Geese track that originally motivated this).
4. **Spotify `preview_url`** — since 2024-11-27, `SimpleTrack` objects (the shape returned by `/v1/playlists/{id}/tracks`) no longer include `preview_url` for apps registered after that date. Our app is affected. Don't rely on this field.

## The chain that actually works

Preserve ReccoBeats as the primary source. For every track that comes back empty, run this fallback:

```
ReccoBeats by Spotify ID
   ↓ miss
ISRC from Spotify (track.external_ids.isrc, still returned on SimpleTrack)
   ↓
Deezer ISRC lookup (GET https://api.deezer.com/track/isrc:{isrc})
   ↓
Deezer preview MP3 URL (cdnt-preview.dzcdn.net, 30 seconds, no auth)
   ↓
Download MP3 on the backend
   ↓
Decode to PCM float32 @ 22050 Hz mono (ffmpeg or node-wav + mp3 decoder)
   ↓
Essentia.js algorithms → BPM, key, mode, loudness, danceability
   ↓
Map key + mode → Camelot code (reuse server/reccobeats.ts's lookup tables)
   ↓
Merge into Features object; leave Spotify-proprietary fields null
```

### Why Deezer, not Apple/iTunes

- Deezer is **unauthenticated** and has a direct ISRC endpoint: `GET https://api.deezer.com/track/isrc:{isrc}`.
- iTunes Search API requires fuzzy search on artist+title and returned only a live version for the Geese test case.
- Deezer verified as working for the motivating test case (Geese, "I See Myself", ISRC `USBQU2200321`).

### Field coverage matrix

| `Features` field      | Essentia source                        | Ship or null? |
|-----------------------|----------------------------------------|---------------|
| `bpm`                 | `RhythmExtractor2013` (multifeature)   | ✅ ship       |
| `key` (0–11)          | `KeyExtractor` (map note name → int)   | ✅ ship       |
| `mode` (0\|1)         | `KeyExtractor.scale`                   | ✅ ship       |
| `camelot`             | derive from (key, mode)                | ✅ ship       |
| `loudness` (dB)       | `LoudnessEBUR128` (LUFS)               | ✅ ship       |
| `danceability`        | `Danceability` algorithm (normalize)   | ✅ ship (scale differs from Spotify's, document this) |
| `energy`              | no direct analog                       | ❌ null — or compute RMS-based proxy and document |
| `valence`             | TF model `mood_happy` (requires tfjs-node + ~70 MB VGGish) | ⚠️ optional tier 2 |
| `acousticness`        | TF model `mood_acoustic`               | ⚠️ optional tier 2 |
| `instrumentalness`    | TF model `voice_instrumental`          | ⚠️ optional tier 2 |
| `liveness`            | no Essentia model                      | ❌ null       |

**Tier 1** (classical algorithms only): key, mode, Camelot, BPM, loudness, danceability. This is what I recommend shipping first — it covers the metrics the app actually uses for sorting, the wheel, and transition cost.

**Tier 2** (TF models): valence, acousticness, instrumentalness. Only add if partial data is a frequent UX complaint. Costs +100 MB tfjs-node + 70–150 MB of model weights, and first-call warmup of 1–3 s.

## License — read this before starting

**Essentia.js is AGPL-3.0.** That means:

- Any network-served app that links Essentia must offer its source to users on request.
- This is fine for a personal/local tool.
- It is **not fine** if this app is ever hosted publicly, sold, or distributed as a closed-source product without UPF's commercial license.
- The AGPL virally covers the whole app, not just the fallback module.

If this project is ever intended to be commercialized, **stop here** and pick a non-copyleft path (e.g., accept "No data" gracefully, or build a paid integration with Cyanite.ai / Musiio / AIMS).

## Files to touch

### Backend

- **`server/spotify.ts`** — already returns the Spotify track object; verify `external_ids.isrc` is included in the fetch (Spotify's playlist-tracks endpoint returns it by default on `SimpleTrack`). Propagate `isrc` up to the handler.
- **`server/deezer.ts`** *(new)* — wrapper around Deezer's public API.
  ```ts
  export async function previewUrlByIsrc(isrc: string): Promise<string | null>;
  ```
  - `GET https://api.deezer.com/track/isrc:{isrc}` → JSON with `preview` field.
  - Rate limit: ~50 req/5s per IP, plenty for fallback-only use.
  - Handle 404 (no catalog match) and `preview: null` (region-locked or preview-less).
  - Cache successful lookups in-memory keyed by ISRC (LRU, TTL 24h) — ISRC → preview URL is stable.
- **`server/essentia.ts`** *(new)* — single function:
  ```ts
  export async function analyzeClip(mp3Url: string): Promise<Partial<Features> | null>;
  ```
  Internals:
  1. `fetch(mp3Url)` → `ArrayBuffer`.
  2. Decode MP3 → PCM float32, mono, 22050 Hz. Easiest path: `ffmpeg-static` + spawn, piping PCM to stdout. Second option: `@breezystack/lamejs` in-process, but quality varies.
  3. Lazy-load Essentia once at module scope: `const { Essentia, EssentiaWASM } = require('essentia.js'); const ess = new Essentia(EssentiaWASM);`. Keep the instance.
  4. For parallelism, wrap this in a `worker_threads` pool — Essentia's WASM state is instance-scoped so each worker needs its own `Essentia` instance. Pool size 4 is a reasonable default.
  5. Run `ess.RhythmExtractor2013(audioVector, 208, 'multifeature')` → `{ bpm, confidence, beats, … }`.
  6. Run `ess.KeyExtractor(audioVector)` → `{ key, scale, strength }`.
  7. Run `ess.LoudnessEBUR128(stereo)` → integrated LUFS. Convert if you want the Spotify-style dB-ish number.
  8. Run `ess.Danceability(audioVector)` → scalar 0–3; normalize to 0–1 via `min(1, x / 3)`.
  9. Map `(key, scale)` → Camelot using the same lookup already in `server/reccobeats.ts` (extract it to a shared helper first).
  10. Return `{ bpm, key, mode, camelot, loudness, danceability }`; omit or null everything else.
- **`server/reccobeats.ts`** — no changes to the primary path. Expose the Camelot lookup helper so `server/essentia.ts` can reuse it.
- **`server/index.ts`** — after `fetchAudioFeatures` resolves, collect the IDs with `features: null` that have an `isrc`, then run the fallback chain concurrently (cap at 4 in flight to match the worker pool). Merge results into the tracks array before returning the response.

### Frontend

- **`src/types.ts`** — make the numeric fields on `Features` optional or nullable. Current shape assumes all 11 are present; a partial-features track will have `bpm` and `key` but not `valence`. Either:
  - Widen `Features` to `Partial<Features> & { bpm: number; camelot: string; key: number; mode: 0 | 1 }` (minimum for sorting and Camelot display), or
  - Split into `PartialFeatures` vs `FullFeatures` and branch in consumers.
- **`src/components/TrackListRow.tsx`**, **`TrackCard.tsx`** — handle nullable fields: show `—` for absent values, keep the row/card usable.
- **`src/aggregate.ts`** — `avg_valence`, `avg_energy`, etc. need to skip tracks missing that specific field (not just tracks with `features == null`). The loop currently checks once at the top; change to per-field accumulators.
- **`src/components/TrackCard.tsx`** — add a subtle "partial data" badge (different from the existing "No data" badge) so users understand why some fields render `—`.
- **`src/transition.ts`** — transition cost uses only `bpm` and `camelot`. Both are in the Tier 1 set, so no change needed. Sanity-check.
- **`src/components/SummaryGrid.tsx`** — if any summary card shows a field that's missing for a meaningful share of tracks (e.g. valence), surface "X of Y tracks analyzed" like the existing coverage badge does for "No data" tracks.

### Docs

- **`API.md`** — add a "Fallback chain" section documenting Deezer + Essentia.
- **`CLAUDE.md`** — add `server/deezer.ts` and `server/essentia.ts` to the backend summary. Warn about AGPL.
- **`README.md`** — update the "Limitations" section to reflect the new partial-data state.

## Implementation steps (ordered)

1. **Validate preconditions** — write a small one-off script that hits Deezer's ISRC endpoint for a playlist's missing tracks and logs the hit rate. If it's <50%, stop; Deezer coverage isn't worth the integration.
2. **Extract the Camelot helper** from `server/reccobeats.ts` into `server/camelot.ts` (server-side sibling of `src/camelot.ts`). Sanity test by running the existing flow end-to-end.
3. **Add `server/deezer.ts`** with the single `previewUrlByIsrc` function, plus a unit test against a handful of known ISRCs (cached fixtures so tests stay offline).
4. **Add ffmpeg-static dependency** and a small `decodeMp3ToPcm(buffer)` utility. Test on a known 30s preview.
5. **Add `server/essentia.ts`** single-threaded first. Verify feature values against a ReccoBeats-known track (pass the same MP3 through both and compare BPM / key — they should agree within tolerance).
6. **Wire the fallback** in `server/index.ts`. At this point, playlists with ReccoBeats misses should start filling in partial features. Measure added latency; it should be ~500ms–2s per miss.
7. **Widen the frontend types** and add the "partial data" UX.
8. **Add worker_threads pooling** only if step 6 showed the added latency is user-noticeable on typical playlists (≥5 misses).
9. **(Optional) Tier 2**: add `@tensorflow/tfjs-node`, download the VGGish embedding + mood classifier models, and fill in `valence`, `acousticness`, `instrumentalness`. Gate behind an env var — the models are large and slow.

## Verification

- `npm run typecheck`.
- Run against the motivating playlist containing "I See Myself" by Geese (`4gFFHAj5iwUEHwPpjZTdi5`). Expect: track no longer shows "No data", shows a partial badge instead, has BPM + Camelot populated, has `—` for valence/liveness/instrumentalness/acousticness.
- Run against a large playlist (300+ tracks) with a handful of ReccoBeats misses. Total response time should grow by ~2s per miss (worst case, serial) or ~500ms per miss (worker pool).
- Spot-check Essentia's BPM against a known-correct track via Tunebat or similar.
- Confirm that transition cost / Camelot wheel / Harmonic sort all function correctly when a track has partial features. The only required field for those is `camelot` (for wheel + harmonic) and `bpm` (for transition cost) — both are in Tier 1.

## Things that will bite you

- **FFmpeg on macOS vs Linux.** `ffmpeg-static` ships platform binaries, but if you containerize, make sure the Dockerfile installs the native `ffmpeg` package or the static binary is baked in.
- **Decoded audio sample rate.** Essentia's algorithms expect specific rates (most default to 44100). If you decode at 22050 you must pass the right rate to each algorithm constructor or results will be wrong (especially BPM, which will be off by exactly 2×).
- **Preview mismatch.** Deezer's 30s preview may be a different mix/master than Spotify's version (radio edit vs. album, explicit vs. clean). BPM and key should agree; loudness / energy may not. Accept this.
- **Deezer null `preview`.** Some ISRCs resolve to a Deezer track that has no preview (`preview: null` or `""`). Treat the same as a miss; don't crash.
- **AGPL contamination of the whole app.** AGPL is viral at the process boundary. If you ever consider moving Essentia to a sidecar microservice over HTTP to contain the license, that's a real engineering pattern but out of scope for this plan.
- **Cold start.** First Essentia call after server boot has ~300ms WASM init cost. Pre-warm by running a tiny dummy analysis at module load.

## If this document is more than a year old

Re-verify before building:
- Is Essentia.js still AGPL? (A permissive re-license would change the calculus.)
- Does Deezer's ISRC endpoint still return `preview` URLs unauthenticated?
- Did Spotify restore `preview_url` to `SimpleTrack` in a policy change?
- Did a commercial-friendly features API emerge (something like Cyanite with a real free tier)?

Any "yes" can simplify or replace large parts of this plan.
