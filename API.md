# External API Reference

Everything the backend needs to know about Spotify and ReccoBeats, self-contained so you don't need to dig through their docs.

## Spotify Web API

### Auth — Client Credentials flow

```
POST https://accounts.spotify.com/api/token
Headers:
  Authorization: Basic <base64(CLIENT_ID:CLIENT_SECRET)>
  Content-Type: application/x-www-form-urlencoded
Body: grant_type=client_credentials
```

**Response (200):**
```json
{ "access_token": "BQ...", "token_type": "Bearer", "expires_in": 3600 }
```

**Failures:**
- `400 invalid_client` → credentials wrong or missing. Surface the body to logs; tell the user their `.env` is misconfigured.
- `429 Too Many Requests` → should not happen for token requests at this scale; respect `Retry-After` if it does.

**Caching**: keep the token in process memory. Refresh when `Date.now() >= expiresAt - 10_000`. No distributed cache needed — this is a single-process app.

### Playlist metadata

```
GET https://api.spotify.com/v1/playlists/{id}
Headers:
  Authorization: Bearer <token>
```

**Fields we use** (many others exist; ignore them):
```ts
{
  id: string;
  name: string;
  owner: { display_name: string };
  images: Array<{ url: string; height: number; width: number }>;
  tracks: { total: number };
  external_urls: { spotify: string };
}
```

Use `images[0].url` for cover art (Spotify orders largest first).

**404** = playlist doesn't exist, is private, or is collaborative without the right auth. Surface as `Playlist not found or private.`

### Playlist tracks (paginated)

```
GET https://api.spotify.com/v1/playlists/{id}/tracks?limit=100&offset={n}
Headers:
  Authorization: Bearer <token>
```

**Response:**
```ts
{
  items: Array<{
    track: SpotifyTrack | null;      // null for removed tracks
    added_at: string;
    is_local?: boolean;              // sometimes at item level
  }>;
  next: string | null;               // full URL for the next page, or null
  total: number;
}
```

**`SpotifyTrack` fields we use:**
```ts
{
  id: string;
  name: string;
  type: 'track' | 'episode';
  is_local: boolean;
  duration_ms: number;
  artists: Array<{ id: string; name: string }>;
  album: {
    name: string;
    release_date: string;
    images: Array<{ url: string }>;
  };
  external_urls: { spotify: string };
}
```

**Pagination**: start at `offset=0`, keep fetching while `next !== null`. Each page is up to 100 items. Simple loop, no need to parallelize — each page depends on the cursor from the previous one (and the total page count is small even for huge playlists: 10 requests for 1000 tracks).

**Filter rules** before handing IDs off to ReccoBeats:
- Drop items where `track === null`.
- Drop items where `track.is_local === true` (local files can't be analyzed).
- Drop items where `track.type !== 'track'` (podcast episodes have a different shape).

### ❌ Do NOT call `/v1/audio-features`

This endpoint returns `403 Forbidden` for any Spotify app created after **2024-11-27**. This is an intentional Spotify policy change, not a bug. Use ReccoBeats instead (below).

## ReccoBeats

### Batch audio features

```
GET https://api.reccobeats.com/v1/audio-features?ids={comma-separated Spotify IDs}
Headers:
  Accept: application/json
```

**No auth required.**

**Confirmed batch behavior** (tested 2026-04-28):

| Batch size | Status |
|---|---|
| ≤ 40 IDs | ✅ HTTP 200 |
| 50 IDs | ❌ HTTP 400 (`{status, errors}`) |

Use chunks of **40**. Parallelize up to 4 chunks in flight per request to keep total latency reasonable without hammering the service.

### Response shape

```ts
{
  content: Array<{
    id: string;            // ReccoBeats UUID — NOT the Spotify ID
    href: string;          // "https://open.spotify.com/track/{spotifyId}"
    isrc: string;
    tempo: number;         // BPM
    key: number;           // 0..11, same convention as Spotify
    mode: 0 | 1;           // 0 = minor, 1 = major
    energy: number;        // 0..1
    danceability: number;  // 0..1
    valence: number;       // 0..1
    acousticness: number;  // 0..1
    instrumentalness: number;
    liveness: number;
    loudness: number;      // dB, typically -60..0
    speechiness: number;
  }>;
}
```

### Remapping ReccoBeats results → Spotify IDs

The `id` field in each item is ReccoBeats's internal UUID. **Do not use it as a dictionary key against Spotify IDs.** Instead, parse the Spotify ID out of the `href` field:

```ts
const SPOTIFY_TRACK_URL_RE = /open\.spotify\.com\/track\/([A-Za-z0-9]{22})/;

function spotifyIdFromHref(href: string): string | null {
  return href.match(SPOTIFY_TRACK_URL_RE)?.[1] ?? null;
}
```

Then build a `Map<spotifyId, features>`, skipping items where `spotifyIdFromHref` returns null (shouldn't happen in practice, but guard anyway).

### Missing fields vs. Spotify's deprecated endpoint

- `duration_ms` — **not in ReccoBeats**. Backfill from the Spotify track object you already have.
- `time_signature` — **not in ReccoBeats**. Omit from the output (the UI doesn't display it; if you want a placeholder, use `null`).

### Catalog coverage

ReccoBeats's catalog is wide but not exhaustive. Tracks that aren't in the catalog are **silently absent** from `content[]` — the batch doesn't fail, you just get fewer items back than IDs you sent. Handle this by:

- Building the features map keyed by Spotify ID.
- For each track in the playlist, lookup the map; if missing, set `features: null` on the merged row.
- Surface the `analyzed` / `total` counts to the client so it can render the coverage badge.

### Error responses

- `400` — usually too many IDs in one batch (see the batch-size table above) or a malformed ID. Log and treat this batch as completely missing features (rather than failing the whole request).
- `5xx` — retry once with a short delay, then treat that batch as missing features.

Partial batch failures should not fail the entire playlist — the coverage badge is our pressure-release valve.

## Key / mode conventions (both APIs)

Both Spotify and ReccoBeats follow the same conventions:

- `key`: pitch class as integer 0..11 → `C, C#, D, D#, E, F, F#, G, G#, A, A#, B`
- `mode`: 0 = minor, 1 = major
- `key == -1` (Spotify convention for "no key detected") — ReccoBeats doesn't return this, but guard for it anyway when computing Camelot codes.

Camelot mapping lives in `CAMELOT.md`.
