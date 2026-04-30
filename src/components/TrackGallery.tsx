import { useEffect, useMemo, useRef, useState } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import {
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
  closestCenter,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  arrayMove,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import type { TrackRow } from '../types';
import TrackCard from './TrackCard';
import TrackListRow from './TrackListRow';
import SortableTrackListRow from './SortableTrackListRow';
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
  | 'harmonic'
  | 'custom';
type SortDir = 'asc' | 'desc' | 'bell' | 'valley';

type Sort = { field: SortField; dir: SortDir };

const NUMERIC_FIELDS: SortField[] = ['bpm', 'energy', 'danceability', 'valence'];

const DIR_GLYPH: Record<SortDir, string> = {
  asc: ' ↑',
  desc: ' ↓',
  bell: ' ∩',
  valley: ' ∪',
};

function shapeInterleave<T>(ascending: T[], shape: 'bell' | 'valley'): T[] {
  const n = ascending.length;
  if (n <= 2) return shape === 'bell' ? ascending : [...ascending].reverse();
  const src = shape === 'bell' ? ascending : [...ascending].reverse();
  const left: T[] = [];
  const right: T[] = [];
  for (let i = 0; i < n; i++) {
    if (i % 2 === 0) left.push(src[i]);
    else right.unshift(src[i]);
  }
  return [...left, ...right];
}

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
    tooltip:
      'Tempo in beats per minute. Higher = faster. Click repeatedly to cycle: ↓ desc → ↑ asc → ∩ bell (builds to a peak in the middle) → ∪ valley (dips in the middle).',
  },
  {
    field: 'energy',
    label: 'Energy',
    tooltip:
      "Spotify's 0–1 perceptual measure of intensity and activity (loud, fast, noisy tracks score higher). Model output, not a direct physical measurement. Click repeatedly to cycle: ↓ desc → ↑ asc → ∩ bell → ∪ valley.",
  },
  {
    field: 'danceability',
    label: 'Danceability',
    tooltip:
      "Spotify's 0–1 score for how suitable a track is for dancing, based on tempo stability, beat strength, and regularity. Click repeatedly to cycle: ↓ desc → ↑ asc → ∩ bell → ∪ valley.",
  },
  {
    field: 'valence',
    label: 'Valence',
    tooltip:
      "Spotify's 0–1 score for musical positiveness. High valence = happy/cheerful; low valence = sad/angry/tense. Click repeatedly to cycle: ↓ desc → ↑ asc → ∩ bell → ∪ valley.",
  },
  {
    field: 'camelot',
    label: 'Camelot',
    tooltip:
      'Musical key mapped to the Camelot Wheel (e.g. 8A = A minor). Sorts by wheel number then letter — useful for finding key-compatible neighbors.',
  },
  {
    field: 'custom',
    label: 'Custom',
    tooltip:
      'Drag-and-drop mode (list view only). Seeds from the current order; rearrange tracks manually. Switching to another sort discards the custom order.',
  },
];

function camelotKey(code: string): [number, string] {
  const num = parseInt(code, 10);
  const letter = code.slice(-1);
  return [Number.isFinite(num) ? num : 99, letter];
}

function sortTracks(
  tracks: TrackRow[],
  sort: Sort,
  customOrder: string[] | null
): TrackRow[] {
  if (sort.field === 'default') return tracks;
  if (sort.field === 'harmonic') return harmonicSort(tracks);
  if (sort.field === 'custom') {
    if (!customOrder) return tracks;
    const byId = new Map(tracks.map((t) => [t.id, t]));
    const ordered: TrackRow[] = [];
    const seen = new Set<string>();
    for (const id of customOrder) {
      const t = byId.get(id);
      if (t) {
        ordered.push(t);
        seen.add(id);
      }
    }
    for (const t of tracks) {
      if (!seen.has(t.id)) ordered.push(t);
    }
    return ordered;
  }

  const withFeatures = tracks.filter((t) => t.features != null);
  const withoutFeatures = tracks.filter((t) => t.features == null);

  const ascending = [...withFeatures].sort((a, b) => {
    const fa = a.features!;
    const fb = b.features!;
    if (sort.field === 'camelot') {
      const [an, al] = camelotKey(fa.camelot);
      const [bn, bl] = camelotKey(fb.camelot);
      if (an !== bn) return an - bn;
      return al < bl ? -1 : al > bl ? 1 : 0;
    }
    const va = fa[sort.field as keyof typeof fa] as number;
    const vb = fb[sort.field as keyof typeof fb] as number;
    return va - vb;
  });

  let ordered: TrackRow[];
  if (sort.dir === 'asc') ordered = ascending;
  else if (sort.dir === 'desc') ordered = [...ascending].reverse();
  else ordered = shapeInterleave(ascending, sort.dir);

  return [...ordered, ...withoutFeatures];
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
  const [customOrder, setCustomOrder] = useState<string[] | null>(null);
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
    const base = sortTracks(filtered, sort, customOrder);
    if (!artistSpread || sort.field === 'default' || sort.field === 'custom') return base;
    return spreadByArtistAlbum(base);
  }, [filtered, sort, artistSpread, customOrder]);
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

  const featureSeries = useMemo(() => {
    const energy = sorted.map((t) => t.features?.energy ?? null);
    const danceability = sorted.map((t) => t.features?.danceability ?? null);
    const valence = sorted.map((t) => t.features?.valence ?? null);
    return { energy, danceability, valence };
  }, [sorted]);

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
      if (field === 'custom') {
        if (prev.field !== 'custom') {
          setCustomOrder(sorted.map((t) => t.id));
          if (viewMode !== 'list') setViewMode('list');
        }
        return { field, dir: 'desc' };
      }
      if (prev.field === 'custom') {
        setCustomOrder(null);
      }
      if (field === 'default' || field === 'harmonic') return { field, dir: 'desc' };
      const cycle: SortDir[] = NUMERIC_FIELDS.includes(field)
        ? ['desc', 'asc', 'bell', 'valley']
        : ['desc', 'asc'];
      if (prev.field !== field) return { field, dir: 'desc' };
      const idx = cycle.indexOf(prev.dir);
      const next = cycle[(idx + 1) % cycle.length];
      return { field, dir: next };
    });
  }

  function onViewModeChange(mode: ViewMode) {
    if (mode === 'grid' && sort.field === 'custom') {
      setCustomOrder(null);
      setSort({ field: 'default', dir: 'desc' });
    }
    setViewMode(mode);
  }

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } })
  );

  function onDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    setCustomOrder((prev) => {
      const base = prev ?? sorted.map((t) => t.id);
      const from = base.indexOf(String(active.id));
      const to = base.indexOf(String(over.id));
      if (from < 0 || to < 0) return prev;
      return arrayMove(base, from, to);
    });
  }

  const isCustom = sort.field === 'custom' && viewMode === 'list';
  const sortedIds = useMemo(() => sorted.map((t) => t.id), [sorted]);

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
            onClick={() => onViewModeChange('grid')}
            aria-pressed={viewMode === 'grid'}
            title={sort.field === 'custom' ? 'Grid view (exits Custom sort)' : 'Grid view'}
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
            onClick={() => onViewModeChange('list')}
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
          const hasDirection =
            opt.field !== 'default' && opt.field !== 'harmonic' && opt.field !== 'custom';
          const arrow = active && hasDirection ? DIR_GLYPH[sort.dir] : '';
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
          className={`spread-toggle${artistSpread && sort.field !== 'default' && sort.field !== 'custom' ? ' active' : ''}`}
          onClick={() => setArtistSpread((v) => !v)}
          disabled={sort.field === 'default' || sort.field === 'custom'}
          aria-pressed={artistSpread && sort.field !== 'default' && sort.field !== 'custom'}
          data-tooltip={
            sort.field === 'default'
              ? 'Select a sort other than Default to enable artist/album spread.'
              : sort.field === 'custom'
              ? 'Spread is disabled in Custom sort — drag tracks manually instead.'
              : "Post-sort modifier: rearrange to avoid consecutive tracks by the same artist (or same album when that's not possible). Keeps the current sort's overall shape; small local swaps only."
          }
        >
          Spread
          <span className="spread-switch" aria-hidden="true" />
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
          <CostLineChart
            title="Feature variation"
            tooltip="Per-track energy (red), danceability (teal), and valence (amber) across the current sort order. All three are Spotify model outputs on a 0–1 scale — energy is intensity, danceability is how groove-forward the track feels, valence is emotional positivity."
            maxY={1}
            series={[
              { label: 'Energy', values: featureSeries.energy, style: 'energy' },
              { label: 'Danceability', values: featureSeries.danceability, style: 'danceability' },
              { label: 'Valence', values: featureSeries.valence, style: 'valence' },
            ]}
          />
        </>
      )}
      <div className={`gallery-scroll${viewMode === 'list' ? ' list-mode' : ''}${isCustom ? ' custom-sort' : ''}`} ref={scrollRef}>
        {viewMode === 'list' && (
          <div className={`track-list-header${isCustom ? ' custom-sort' : ''}`}>
            {isCustom && <span />}
            <span className="list-pos">#</span>
            <span />
            <span>Title</span>
            <span />
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
        {isCustom ? (
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
            <SortableContext items={sortedIds} strategy={verticalListSortingStrategy}>
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
                      className="gallery-row list-row"
                      style={{
                        transform: `translateY(${vr.start}px)`,
                        gridTemplateColumns: '1fr',
                      }}
                    >
                      {row.map((t) => {
                        const costs = costByIndex.get(t.id);
                        return (
                          <SortableTrackListRow
                            key={t.id}
                            track={t}
                            position={positionById.get(t.id)}
                            transitionCost={costs?.transition ?? null}
                            isolationCost={costs?.isolation ?? null}
                          />
                        );
                      })}
                    </div>
                  );
                })}
              </div>
            </SortableContext>
          </DndContext>
        ) : (
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
        )}
      </div>
    </section>
  );
}
