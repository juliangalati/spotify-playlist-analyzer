# Camelot Wheel Reference

The Camelot Wheel is a DJ-friendly system for labeling musical keys so that harmonically compatible keys are adjacent on a wheel. The 24 keys (12 major + 12 minor) map to 12 numbered slots (`1`–`12`), each with a letter — `A` for minor, `B` for major. A track tagged `8A` (A minor) mixes cleanly with `8B` (C major, same slot, opposite mode), `7A` (D minor, one step counter-clockwise), and `9A` (E minor, one step clockwise).

## Compatibility rule

For a Camelot code `NL` (where `N` is 1..12 and `L` is `A` or `B`):

- **Opposite mode, same root**: `N{other-letter}` (e.g. `8A` ↔ `8B`)
- **Energy shift counter-clockwise**: `{N-1}L` with wraparound (`1L` ↔ `12L`)
- **Energy shift clockwise**: `{N+1}L` with wraparound

Three compatible neighbors total.

## Lookup tables

Both Spotify and ReccoBeats report `key` as pitch class 0..11 and `mode` as 0 (minor) or 1 (major). These tables map each `(key, mode)` pair to its Camelot number. Minor gets the letter `A`, major gets `B`.

**Pitch names (for display):**
```ts
export const PITCH_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
```

**Major → Camelot number (letter B):**
```ts
export const CAMELOT_NUMBER_MAJOR: Record<number, number> = {
  0: 8,    // C major   → 8B
  1: 3,    // C#/Db    → 3B
  2: 10,   // D         → 10B
  3: 5,    // D#/Eb    → 5B
  4: 12,   // E         → 12B
  5: 7,    // F         → 7B
  6: 2,    // F#/Gb    → 2B
  7: 9,    // G         → 9B
  8: 4,    // G#/Ab    → 4B
  9: 11,   // A         → 11B
  10: 6,   // A#/Bb    → 6B
  11: 1,   // B         → 1B
};
```

**Minor → Camelot number (letter A):**
```ts
export const CAMELOT_NUMBER_MINOR: Record<number, number> = {
  0: 5,    // C minor    → 5A
  1: 12,   // C#/Db min → 12A
  2: 7,    // D minor    → 7A
  3: 2,    // D#/Eb min → 2A
  4: 9,    // E minor    → 9A
  5: 4,    // F minor    → 4A
  6: 11,   // F#/Gb min → 11A
  7: 6,    // G minor    → 6A
  8: 1,    // G#/Ab min → 1A
  9: 8,    // A minor    → 8A
  10: 3,   // A#/Bb min → 3A
  11: 10,  // B minor    → 10A
};
```

These tables are copied verbatim from `../spotify-track-analyzer/index.html`. They are correct — do not "fix" them without running the single-track app side-by-side to verify.

## Reference function signatures

Implement these in `src/camelot.ts` as pure functions (no React, no DOM):

```ts
/** Returns the Camelot code (e.g. "8A") or null for unknown keys. */
export function camelotFor(key: number, mode: 0 | 1): string | null;

/** Returns a human-readable key name (e.g. "A minor"). */
export function keyName(key: number, mode: 0 | 1): string;

/** Given a Camelot code, returns its 3 harmonic neighbors. */
export function compatibleCodes(code: string): string[];

/** Full 24-slot list used for wheel rendering. */
export function buildWheelSlots(): Array<{
  num: number;      // 1..12
  letter: 'A' | 'B';
  code: string;     // e.g. "8A"
  keyLabel: string; // short display: "Am", "C", "F#", "F#m", ...
}>;
```

### Canonical implementations (port from sibling)

`camelotFor`:
```ts
export function camelotFor(key: number, mode: 0 | 1): string | null {
  if (key == null || key < 0) return null;
  const num = mode === 1 ? CAMELOT_NUMBER_MAJOR[key] : CAMELOT_NUMBER_MINOR[key];
  if (num == null) return null;
  return `${num}${mode === 1 ? 'B' : 'A'}`;
}
```

`keyName`:
```ts
export function keyName(key: number, mode: 0 | 1): string {
  if (key == null || key < 0) return "Unknown";
  return `${PITCH_NAMES[key]} ${mode === 1 ? "major" : "minor"}`;
}
```

`compatibleCodes`:
```ts
export function compatibleCodes(code: string): string[] {
  if (!code) return [];
  const num = parseInt(code, 10);
  const letter = code.slice(-1);
  const other = letter === 'A' ? 'B' : 'A';
  const prev = ((num - 2 + 12) % 12) + 1;
  const next = (num % 12) + 1;
  return [`${num}${other}`, `${prev}${letter}`, `${next}${letter}`];
}
```

`buildWheelSlots`:
```ts
export function buildWheelSlots() {
  const slots = [];
  for (let n = 1; n <= 12; n++) {
    for (const letter of ['A', 'B'] as const) {
      const mode = letter === 'B' ? 1 : 0;
      const table = mode === 1 ? CAMELOT_NUMBER_MAJOR : CAMELOT_NUMBER_MINOR;
      const pitch = Object.keys(table).find(k => table[Number(k)] === n);
      const keyLabel = pitch != null
        ? `${PITCH_NAMES[Number(pitch)]}${mode === 1 ? '' : 'm'}`
        : '';
      slots.push({ num: n, letter, code: `${n}${letter}`, keyLabel });
    }
  }
  return slots;
}
```

## Distribution-wheel rendering spec

The playlist analyzer's Camelot wheel is a **heatmap** — each slot's fill opacity reflects how many tracks in the playlist are in that key.

### Geometry

Same as the single-track wheel:

- SVG `viewBox="0 0 520 520"`, 24 slots (12 outer major-B, 12 inner minor-A).
- Outer ring radius 250, middle radius 180, inner radius 100.
- Slot `N` centered at `N × 30°` from top, clockwise (so slot 12 is at the top, slot 3 is at the right, etc.).
- Use D3's `d3.arc().innerRadius(...).outerRadius(...)` helper.

### Fill rules (distribution variant)

For each slot:

- `count = keyDistribution[slot.code] ?? 0`
- `maxCount = max(keyDistribution values)`
- If `count === 0`: fill `var(--surface-interactive)` (`#1f1f1f`), no special treatment.
- If `count > 0`:
  - `opacity = Math.max(0.15, count / maxCount)` — 0.15 floor so single-track slots are still visible.
  - Fill `var(--accent)` (`#1ed760`) with that opacity, or tint the base surface — the simpler approach is `fillOpacity` on a solid green fill.
  - Add a small text badge `×{count}` centered under the key label, 10px weight 700.

The slot whose `count === maxCount` gets an additional 2px `var(--accent)` stroke (the rest get a thin dark stroke for segment separation).

### Labels

Same as the sibling single-track wheel:

- Code label (e.g. `8A`) on top — 12px weight 700.
- Key label (e.g. `Am`) below it — 10px weight 400, slightly transparent white.
- Center text: `CAMELOT / WHEEL` in 12px weight 700 uppercase muted.

### Legend

- Green gradient bar (from `opacity 0.15` to `opacity 1`) → label "Darker = more tracks".
- Swatch with accent stroke → label "Most populated key".
- "Empty slot" swatch using `#1f1f1f` with the standard dark stroke.

## Edge cases

- **All tracks in the same key** → that one slot has `opacity 1`, the rest are empty. Visually that's exactly what you want.
- **No features returned for any track** → you won't render the wheel at all (the UI short-circuits earlier with an error per `SPEC.md`).
- **Tracks with unknown key** (`key === -1` edge case from Spotify) → `camelotFor` returns `null`; skip those in the distribution count.
