import type { TrackRow } from './types';

const BPM_PER_CAMELOT_STEP = 6;

export function camelotDistance(a: string, b: string): number {
  const an = parseInt(a, 10);
  const bn = parseInt(b, 10);
  const al = a.slice(-1);
  const bl = b.slice(-1);
  if (!Number.isFinite(an) || !Number.isFinite(bn)) return 0;
  const diff = Math.abs(an - bn);
  const ring = Math.min(diff, 12 - diff);
  const flip = al === bl ? 0 : 1;
  return ring + flip;
}

export function bpmDistance(a: number, b: number): number {
  return Math.abs(a - b) / BPM_PER_CAMELOT_STEP;
}

export function trackDistance(a: TrackRow, b: TrackRow): number | null {
  if (!a.features || !b.features) return null;
  return camelotDistance(a.features.camelot, b.features.camelot) +
    bpmDistance(a.features.bpm, b.features.bpm);
}

export function computeTransitionCosts(tracks: TrackRow[]): Array<number | null> {
  return tracks.map((t, i) => {
    if (i === 0) return null;
    return trackDistance(tracks[i - 1], t);
  });
}

export function computeIsolationCosts(tracks: TrackRow[]): Array<number | null> {
  return tracks.map((t, i) => {
    if (!t.features) return null;
    let best: number | null = null;
    for (let j = 0; j < tracks.length; j++) {
      if (j === i) continue;
      const d = trackDistance(t, tracks[j]);
      if (d == null) continue;
      if (best == null || d < best) best = d;
    }
    return best;
  });
}

export const TRANSITION_MAX = 10;

export function costColor(cost: number): string {
  const clamped = Math.max(0, Math.min(TRANSITION_MAX, cost));
  const t = clamped / TRANSITION_MAX;
  const hue = 140 - 140 * t;
  return `hsl(${hue.toFixed(0)}, 70%, 50%)`;
}

export function costWidthPct(cost: number): number {
  const clamped = Math.max(0, Math.min(TRANSITION_MAX, cost));
  return (clamped / TRANSITION_MAX) * 100;
}
