import { useEffect, useMemo, useRef, useState } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import type { TrackRow } from '../types';
import TrackCard from './TrackCard';
import TrackListRow from './TrackListRow';
import {
  computeIsolationCosts,
  computeTransitionCosts,
  costColor,
  cumulativeAverage,
  harmonicSort,
  movingAverage,
  spreadByArtistAlbum,
  suggestedSmoothingWindow,
  TRANSITION_MAX,
} from '../transition';
import CostLineChart from './CostLineChart';

type SortField =
  | 'default'
  | 'bpm'
  | 'energy'
  | 'danceability'
  | 'valence'
  | 'camelot'
  | 'harmonic';
type SortDir = 'asc' | 'desc';

type Sort = { field: SortField; dir: SortDir };

const SORT_OPTIONS: Array<{ field: SortField; label: string; tooltip: string }> = [
  {
    field: 'default',
    label: 'Default',
    tooltip: 'Original order of the playlist as returned by Spotify.',
  },
  {
    field: 'harmonic',
    label: 'Harmonic',
    tooltip:
      'Greedy nearest-neighbor ordering that minimizes transition cost (Camelot distance + BPM delta, 6 BPM ≈ 1 step) so consecutive tracks sound natural together. Starts from the original track #1; ties broken by lowest isolation.',
  },
  {
    field: 'bpm',
    label: 'BPM',
    tooltip: 'Tempo in beats per minute. Higher = faster.',
  },
  {
    field: 'energy',
    label: 'Energy',
    tooltip:
      "Spotify's 0–1 perceptual measure of intensity and activity (loud, fast, noisy tracks score higher). Model output, not a direct physical measurement.",
  },
  {
    field: 'danceability',
    label: 'Danceability',
    tooltip:
      "Spotify's 0–1 score for how suitable a track is for dancing, based on tempo stability, beat strength, and regularity.",
  },
  {
    field: 'valence',
    label: 'Valence',
    tooltip:
      "Spotify's 0–1 score for musical positiveness. High valence = happy/cheerful; low valence = sad/angry/tense.",
  },
  {
    field: 'camelot',
    label: 'Camelot',
    tooltip:
      'Musical key mapped to the Camelot Wheel (e.g. 8A = A minor). Sorts by wheel number then letter — useful for finding key-compatible neighbors.',
  },
];

function camelotKey(code: string): [number, string] {
  const num = parseInt(code, 10);
  const letter = code.slice(-1);
  return [Number.isFinite(num) ? num : 99, letter];
}

function sortTracks(tracks: TrackRow[], sort: Sort): TrackRow[] {
  if (sort.field === 'default') return tracks;
  if (sort.field === 'harmonic') return harmonicSort(tracks);

  const withFeatures = tracks.filter((t) => t.features != null);
  const withoutFeatures = tracks.filter((t) => t.features == null);

  const dirMul = sort.dir === 'asc' ? 1 : -1;

  const sorted = [...withFeatures].sort((a, b) => {
    const fa = a.features!;
    const fb = b.features!;
    if (sort.field === 'camelot') {
      const [an, al] = camelotKey(fa.camelot);
      const [bn, bl] = camelotKey(fb.camelot);
      if (an !== bn) return (an - bn) * dirMul;
      return (al < bl ? -1 : al > bl ? 1 : 0) * dirMul;
    }
    const va = fa[sort.field as keyof typeof fa] as number;
    const vb = fb[sort.field as keyof typeof fb] as number;
    return (va - vb) * dirMul;
  });

  return [...sorted, ...withoutFeatures];
}

const MIN_COL_WIDTH = 220;
const MIN_COL_WIDTH_MOBILE = 160;
const ROW_HEIGHT = 380;
const LIST_ROW_HEIGHT = 56;
const GAP = 16;
const LIST_GAP = 4;

type ViewMode = 'grid' | 'list';

type Props = {
  tracks: TrackRow[];
  keyFilter?: string | null;
  onClearKeyFilter?: () => void;
};

export default function TrackGallery({
  tracks,
  keyFilter = null,
  onClearKeyFilter,
}: Props) {
  const [sort, setSort] = useState<Sort>({ field: 'default', dir: 'desc' });
  const [noDataOnly, setNoDataOnly] = useState(false);
  const [artistSpread, setArtistSpread] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>('grid');
  const noDataCount = useMemo(
    () => tracks.reduce((n, t) => (t.features == null ? n + 1 : n), 0),
    [tracks]
  );
  const filtered = useMemo(() => {
    let list = tracks;
    if (noDataOnly) list = list.filter((t) => t.features == null);
    if (keyFilter) list = list.filter((t) => t.features?.camelot === keyFilter);
    return list;
  }, [tracks, noDataOnly, keyFilter]);
  const sorted = useMemo(() => {
    const base = sortTracks(filtered, sort);
    if (!artistSpread || sort.field === 'default') return base;
    return spreadByArtistAlbum(base);
  }, [filtered, sort, artistSpread]);
  const positionById = useMemo(() => {
    const map = new Map<string, number>();
    tracks.forEach((t, i) => map.set(t.id, i + 1));
    return map;
  }, [tracks]);

  const transitionCosts = useMemo(() => computeTransitionCosts(sorted), [sorted]);
  const isolationCosts = useMemo(() => computeIsolationCosts(sorted), [sorted]);
  const costByIndex = useMemo(() => {
    const m = new Map<string, { transition: number | null; isolation: number | null }>();
    sorted.forEach((t, i) => {
      m.set(t.id, {
        transition: transitionCosts[i] ?? null,
        isolation: isolationCosts[i] ?? null,
      });
    });
    return m;
  }, [sorted, transitionCosts, isolationCosts]);

  const trendSeries = useMemo(() => {
    const transitionSamples = transitionCosts.reduce<number>(
      (n, c) => (c == null ? n : n + 1),
      0
    );
    const isolationSamples = isolationCosts.reduce<number>(
      (n, c) => (c == null ? n : n + 1),
      0
    );
    const transitionWindow = suggestedSmoothingWindow(transitionSamples);
    const isolationWindow = suggestedSmoothingWindow(isolationSamples);
    return {
      transition: {
        raw: transitionCosts,
        smoothed: movingAverage(transitionCosts, transitionWindow),
        cumulative: cumulativeAverage(transitionCosts),
        window: transitionWindow,
      },
      isolation: {
        raw: isolationCosts,
        smoothed: movingAverage(isolationCosts, isolationWindow),
        window: isolationWindow,
      },
    };
  }, [transitionCosts, isolationCosts]);

  const transitionHistogram = useMemo(() => {
    const sampleCount = transitionCosts.reduce<number>((n, c) => (c == null ? n : n + 1), 0);
    const buckets = sampleCount === 0
      ? 10
      : Math.max(5, Math.min(12, Math.ceil(Math.sqrt(sampleCount))));
    const counts = new Array<number>(buckets).fill(0);
    for (const c of transitionCosts) {
      if (c == null) continue;
      const idx = Math.min(buckets - 1, Math.floor((c / TRANSITION_MAX) * buckets));
      counts[idx] += 1;
    }
    return { counts, seen: sampleCount, buckets };
  }, [transitionCosts]);

  const scrollRef = useRef<HTMLDivElement | null>(null);
  const [gridColumns, setGridColumns] = useState(4);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const width = entry.contentRect.width;
        const minW = window.innerWidth <= 768 ? MIN_COL_WIDTH_MOBILE : MIN_COL_WIDTH;
        const cols = Math.max(1, Math.floor((width + GAP) / (minW + GAP)));
        setGridColumns(cols);
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const columns = viewMode === 'list' ? 1 : gridColumns;
  const rowHeight = viewMode === 'list' ? LIST_ROW_HEIGHT : ROW_HEIGHT;
  const rowGap = viewMode === 'list' ? LIST_GAP : GAP;

  const rows = useMemo(() => {
    const out: TrackRow[][] = [];
    for (let i = 0; i < sorted.length; i += columns) {
      out.push(sorted.slice(i, i + columns));
    }
    return out;
  }, [sorted, columns]);

  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => rowHeight + rowGap,
    overscan: viewMode === 'list' ? 10 : 4,
  });

  useEffect(() => {
    virtualizer.measure();
  }, [viewMode, virtualizer]);

  function onPillClick(field: SortField) {
    setSort((prev) => {
      const hasDirection = field !== 'default' && field !== 'harmonic';
      if (prev.field === field && hasDirection) {
        return { field, dir: prev.dir === 'asc' ? 'desc' : 'asc' };
      }
      return { field, dir: 'desc' };
    });
  }

  const filterActive = noDataOnly || keyFilter != null;

  return (
    <section>
      <div className="tracks-header">
        <h3>
          Tracks ({sorted.length}
          {filterActive && sorted.length !== tracks.length ? ` of ${tracks.length}` : ''})
        </h3>
        <div className="view-toggle" role="group" aria-label="View mode">
          <button
            className={`view-toggle-btn${viewMode === 'grid' ? ' active' : ''}`}
            onClick={() => setViewMode('grid')}
            aria-pressed={viewMode === 'grid'}
            title="Grid view"
          >
            <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
              <rect x="1" y="1" width="5" height="5" rx="1" />
              <rect x="8" y="1" width="5" height="5" rx="1" />
              <rect x="1" y="8" width="5" height="5" rx="1" />
              <rect x="8" y="8" width="5" height="5" rx="1" />
            </svg>
            Grid
          </button>
          <button
            className={`view-toggle-btn${viewMode === 'list' ? ' active' : ''}`}
            onClick={() => setViewMode('list')}
            aria-pressed={viewMode === 'list'}
            title="List view"
          >
            <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
              <rect x="1" y="2" width="12" height="2" rx="1" />
              <rect x="1" y="6" width="12" height="2" rx="1" />
              <rect x="1" y="10" width="12" height="2" rx="1" />
            </svg>
            List
          </button>
        </div>
      </div>
      {keyFilter && (
        <div className="filter-chips">
          <button
            className="filter-chip"
            onClick={() => onClearKeyFilter?.()}
            title="Clear key filter"
          >
            Key: {keyFilter}
            <span aria-hidden="true" className="filter-chip-x">×</span>
          </button>
        </div>
      )}
      <div className="sort-pills">
        {SORT_OPTIONS.map((opt) => {
          const active = sort.field === opt.field;
          const hasDirection = opt.field !== 'default' && opt.field !== 'harmonic';
          const arrow = active && hasDirection ? (sort.dir === 'asc' ? ' ↑' : ' ↓') : '';
          return (
            <button
              key={opt.field}
              className={`sort-pill${active ? ' active' : ''}`}
              onClick={() => onPillClick(opt.field)}
              data-tooltip={opt.tooltip}
            >
              {opt.label}
              {arrow}
            </button>
          );
        })}
        <button
          className={`sort-pill${noDataOnly ? ' active' : ''}`}
          onClick={() => setNoDataOnly((v) => !v)}
          disabled={noDataCount === 0}
          data-tooltip={
            noDataCount === 0
              ? 'Every track in this playlist has audio features.'
              : "Filter to tracks ReccoBeats doesn't have features for. These can't be sorted by BPM/key/etc. and are excluded from aggregates."
          }
        >
          No data ({noDataCount})
        </button>
        <button
          className={`sort-pill${artistSpread && sort.field !== 'default' ? ' active' : ''}`}
          onClick={() => setArtistSpread((v) => !v)}
          disabled={sort.field === 'default'}
          data-tooltip={
            sort.field === 'default'
              ? 'Select a sort other than Default to enable artist/album spread.'
              : "Rearrange to avoid consecutive tracks by the same artist (or same album when that's not possible). Keeps the current sort's overall shape; small local swaps only."
          }
        >
          Spread
        </button>
      </div>
      {viewMode === 'list' && transitionHistogram.seen > 0 && (
        <div className="transition-histogram">
          <div className="transition-histogram-label">
            <span
              className="transition-histogram-title"
              data-tooltip={`Histogram of transition costs between consecutive tracks in the current sort order. Cost = Camelot distance + BPM delta (6 BPM ≈ 1 Camelot step). Lower = smoother harmonic/rhythmic flow. ${transitionHistogram.buckets} buckets from ${transitionHistogram.seen} transition${transitionHistogram.seen === 1 ? '' : 's'}.`}
            >
              Transition cost distribution
            </span>
            <span className="transition-histogram-scale">smooth → jarring</span>
          </div>
          <div className="transition-histogram-bars">
            {transitionHistogram.counts.map((count, i) => {
              const max = Math.max(...transitionHistogram.counts, 1);
              const h = (count / max) * 100;
              const bucketSize = TRANSITION_MAX / transitionHistogram.buckets;
              const lo = i * bucketSize;
              const hi = (i + 1) * bucketSize;
              const midCost = (lo + hi) / 2;
              const pct = transitionHistogram.seen === 0
                ? 0
                : Math.round((count / transitionHistogram.seen) * 100);
              return (
                <span
                  key={i}
                  className="transition-histogram-bar"
                  style={{ height: `${h}%`, background: costColor(midCost) }}
                  data-tooltip={`Cost ${lo.toFixed(1)}–${hi.toFixed(1)}: ${count} transition${count === 1 ? '' : 's'} (${pct}%)`}
                />
              );
            })}
          </div>
        </div>
      )}
      {viewMode === 'list' && transitionHistogram.seen > 0 && (
        <>
          <CostLineChart
            title="Transition variation"
            tooltip={`Per-position transition cost between consecutive tracks in the current sort order. Raw shows each transition; smoothed is a moving average (window ${trendSeries.transition.window}); cumulative is the running average, useful for spotting drift over the playlist.`}
            series={[
              { label: 'Raw', values: trendSeries.transition.raw, style: 'raw' },
              { label: 'Smoothed', values: trendSeries.transition.smoothed, style: 'smoothed' },
              { label: 'Cumulative', values: trendSeries.transition.cumulative, style: 'cumulative' },
            ]}
          />
          <CostLineChart
            title="Isolation variation"
            tooltip={`Per-track isolation cost — distance from each track to its nearest harmonic/rhythmic neighbor in the playlist. Smoothed is a moving average (window ${trendSeries.isolation.window}).`}
            series={[
              { label: 'Raw', values: trendSeries.isolation.raw, style: 'raw' },
              { label: 'Smoothed', values: trendSeries.isolation.smoothed, style: 'smoothed' },
            ]}
          />
        </>
      )}
      <div className={`gallery-scroll${viewMode === 'list' ? ' list-mode' : ''}`} ref={scrollRef}>
        {viewMode === 'list' && (
          <div className="track-list-header">
            <span className="list-pos">#</span>
            <span />
            <span>Title</span>
            <span className="list-stats">
              <span className="list-bpm">BPM</span>
              <span className="list-camelot">Key</span>
              <span className="list-metric">E</span>
              <span className="list-metric">D</span>
              <span className="list-metric">V</span>
            </span>
            <span className="list-cost-header" data-tooltip="Distance from previous track">Trans.</span>
            <span className="list-cost-header" data-tooltip="Distance to nearest other track">Isol.</span>
            <span className="list-duration">Time</span>
          </div>
        )}
        <div
          className="gallery-rows"
          style={{ height: virtualizer.getTotalSize() }}
        >
          {virtualizer.getVirtualItems().map((vr) => {
            const row = rows[vr.index];
            if (!row) return null;
            return (
              <div
                key={vr.key}
                className={`gallery-row${viewMode === 'list' ? ' list-row' : ''}`}
                style={{
                  transform: `translateY(${vr.start}px)`,
                  gridTemplateColumns:
                    viewMode === 'list'
                      ? '1fr'
                      : `repeat(${columns}, minmax(0, 1fr))`,
                }}
              >
                {row.map((t) => {
                  const costs = costByIndex.get(t.id);
                  return viewMode === 'list' ? (
                    <TrackListRow
                      key={t.id}
                      track={t}
                      position={positionById.get(t.id)}
                      transitionCost={costs?.transition ?? null}
                      isolationCost={costs?.isolation ?? null}
                    />
                  ) : (
                    <TrackCard
                      key={t.id}
                      track={t}
                      position={positionById.get(t.id)}
                    />
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
