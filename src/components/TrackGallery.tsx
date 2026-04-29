import { useEffect, useMemo, useRef, useState } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import type { TrackRow } from '../types';
import TrackCard from './TrackCard';

type SortField = 'default' | 'bpm' | 'energy' | 'danceability' | 'valence' | 'camelot';
type SortDir = 'asc' | 'desc';

type Sort = { field: SortField; dir: SortDir };

const SORT_OPTIONS: Array<{ field: SortField; label: string }> = [
  { field: 'default', label: 'Default' },
  { field: 'bpm', label: 'BPM' },
  { field: 'energy', label: 'Energy' },
  { field: 'danceability', label: 'Danceability' },
  { field: 'valence', label: 'Valence' },
  { field: 'camelot', label: 'Camelot' },
];

function camelotKey(code: string): [number, string] {
  const num = parseInt(code, 10);
  const letter = code.slice(-1);
  return [Number.isFinite(num) ? num : 99, letter];
}

function sortTracks(tracks: TrackRow[], sort: Sort): TrackRow[] {
  if (sort.field === 'default') return tracks;

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
    if (sort.field === 'default') return 0;
    const va = fa[sort.field];
    const vb = fb[sort.field];
    return (va - vb) * dirMul;
  });

  return [...sorted, ...withoutFeatures];
}

const MIN_COL_WIDTH = 220;
const MIN_COL_WIDTH_MOBILE = 160;
const ROW_HEIGHT = 380;
const GAP = 16;

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
  const sorted = useMemo(() => sortTracks(filtered, sort), [filtered, sort]);

  const scrollRef = useRef<HTMLDivElement | null>(null);
  const [columns, setColumns] = useState(4);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const width = entry.contentRect.width;
        const minW = window.innerWidth <= 768 ? MIN_COL_WIDTH_MOBILE : MIN_COL_WIDTH;
        const cols = Math.max(1, Math.floor((width + GAP) / (minW + GAP)));
        setColumns(cols);
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

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
    estimateSize: () => ROW_HEIGHT + GAP,
    overscan: 4,
  });

  function onPillClick(field: SortField) {
    setSort((prev) => {
      if (prev.field === field) {
        return { field, dir: prev.dir === 'asc' ? 'desc' : 'asc' };
      }
      return { field, dir: field === 'default' ? 'desc' : 'desc' };
    });
  }

  const filterActive = noDataOnly || keyFilter != null;

  return (
    <section>
      <h3>
        Tracks ({sorted.length}
        {filterActive && sorted.length !== tracks.length ? ` of ${tracks.length}` : ''})
      </h3>
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
          const arrow = active && opt.field !== 'default' ? (sort.dir === 'asc' ? ' ↑' : ' ↓') : '';
          return (
            <button
              key={opt.field}
              className={`sort-pill${active ? ' active' : ''}`}
              onClick={() => onPillClick(opt.field)}
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
          title={
            noDataCount === 0
              ? 'Every track has audio features'
              : 'Show only tracks missing audio features'
          }
        >
          No data ({noDataCount})
        </button>
      </div>
      <div className="gallery-scroll" ref={scrollRef}>
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
                className="gallery-row"
                style={{
                  transform: `translateY(${vr.start}px)`,
                  gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
                }}
              >
                {row.map((t) => (
                  <TrackCard key={t.id} track={t} />
                ))}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
