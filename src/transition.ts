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

export function movingAverage(
  values: Array<number | null>,
  window: number
): Array<number | null> {
  const w = Math.max(1, Math.floor(window));
  const half = Math.floor(w / 2);
  return values.map((v, i) => {
    if (v == null) return null;
    let sum = 0;
    let n = 0;
    const lo = Math.max(0, i - half);
    const hi = Math.min(values.length - 1, i + half);
    for (let j = lo; j <= hi; j++) {
      const x = values[j];
      if (x == null) continue;
      sum += x;
      n += 1;
    }
    return n === 0 ? null : sum / n;
  });
}

export function cumulativeAverage(values: Array<number | null>): Array<number | null> {
  let sum = 0;
  let n = 0;
  return values.map((v) => {
    if (v == null) return n === 0 ? null : sum / n;
    sum += v;
    n += 1;
    return sum / n;
  });
}

export function suggestedSmoothingWindow(sampleCount: number): number {
  if (sampleCount <= 0) return 3;
  return Math.max(3, Math.round(Math.sqrt(sampleCount)));
}

export const HARMONIC_TIE_EPSILON = 0.5;

export function harmonicSort(tracks: TrackRow[]): TrackRow[] {
  const withFeatures = tracks.filter((t) => t.features != null);
  const withoutFeatures = tracks.filter((t) => t.features == null);
  if (withFeatures.length <= 1) {
    return [...withFeatures, ...withoutFeatures];
  }

  const isolationByIndex = computeIsolationCosts(withFeatures);
  const visited = new Set<number>();
  const order: TrackRow[] = [];

  const startIdx = 0;
  visited.add(startIdx);
  order.push(withFeatures[startIdx]);

  let currentIdx = startIdx;
  while (visited.size < withFeatures.length) {
    const current = withFeatures[currentIdx];
    let bestCost = Infinity;
    const candidates: Array<{ idx: number; cost: number; isolation: number }> = [];
    for (let j = 0; j < withFeatures.length; j++) {
      if (visited.has(j)) continue;
      const cost = trackDistance(current, withFeatures[j]);
      if (cost == null) continue;
      if (cost < bestCost) bestCost = cost;
      candidates.push({
        idx: j,
        cost,
        isolation: isolationByIndex[j] ?? Infinity,
      });
    }
    if (candidates.length === 0) break;

    const tieThreshold = bestCost + HARMONIC_TIE_EPSILON;
    const ties = candidates.filter((c) => c.cost <= tieThreshold);
    ties.sort((a, b) => {
      if (a.isolation !== b.isolation) return a.isolation - b.isolation;
      return a.cost - b.cost;
    });

    const next = ties[0];
    visited.add(next.idx);
    order.push(withFeatures[next.idx]);
    currentIdx = next.idx;
  }

  for (let j = 0; j < withFeatures.length; j++) {
    if (!visited.has(j)) order.push(withFeatures[j]);
  }

  return [...order, ...withoutFeatures];
}
