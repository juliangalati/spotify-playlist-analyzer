import type { TrackRow } from '../types';
import { formatDuration, round } from '../util';
import { costColor, costWidthPct } from '../transition';

type Props = {
  track: TrackRow;
  position?: number;
  transitionCost?: number | null;
  isolationCost?: number | null;
};

function CostCell({ cost, label }: { cost: number | null | undefined; label: string }) {
  if (cost == null) {
    return <span className="list-cost empty" aria-label={`${label}: n/a`} />;
  }
  const width = costWidthPct(cost);
  const color = costColor(cost);
  return (
    <span
      className="list-cost"
      title={`${label}: ${cost.toFixed(2)}`}
      aria-label={`${label}: ${cost.toFixed(2)}`}
    >
      <span className="list-cost-bar">
        <span
          className="list-cost-fill"
          style={{ width: `${width}%`, background: color }}
        />
      </span>
      <span className="list-cost-value">{cost.toFixed(1)}</span>
    </span>
  );
}

export default function TrackListRow({
  track,
  position,
  transitionCost,
  isolationCost,
}: Props) {
  const f = track.features;
  const artists = track.artists.map((a) => a.name).join(', ');
  const className = `track-list-row${f == null ? ' missing' : ''}`;

  return (
    <div
      className={className}
      title={f == null ? 'Not in ReccoBeats catalog' : undefined}
    >
      <span className="list-pos">{position != null ? position : ''}</span>
      <div className="list-cover">
        {track.cover ? <img src={track.cover} alt="" /> : null}
      </div>
      <div className="list-title">
        <div className="list-name">{track.name}</div>
        <div className="list-artists">{artists}</div>
      </div>
      {track.url ? (
        <a
          className="list-spotify-link"
          href={track.url}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={`Open ${track.name} on Spotify`}
          title={`Open ${track.name} on Spotify`}
        >
          <svg viewBox="0 0 168 168" width="16" height="16" aria-hidden="true">
            <path
              fill="currentColor"
              d="M83.996.277C37.747.277.253 37.77.253 84.019c0 46.251 37.494 83.741 83.743 83.741 46.254 0 83.744-37.49 83.744-83.741 0-46.246-37.49-83.738-83.745-83.738zm38.404 120.78a5.217 5.217 0 01-7.18 1.73c-19.662-12.01-44.414-14.73-73.564-8.07a5.222 5.222 0 01-6.249-3.93 5.213 5.213 0 013.926-6.25c31.9-7.291 59.263-4.15 81.337 9.34 2.46 1.51 3.24 4.72 1.73 7.18zm10.25-22.805c-1.89 3.075-5.91 4.045-8.98 2.155-22.51-13.839-56.823-17.846-83.448-9.764-3.453 1.043-7.1-.903-8.148-4.35a6.538 6.538 0 014.354-8.143c30.413-9.228 68.222-4.758 94.072 11.127 3.07 1.89 4.04 5.91 2.15 8.976v-.001zm.88-23.744c-26.99-16.031-71.52-17.505-97.289-9.684-4.138 1.255-8.514-1.081-9.768-5.219a7.835 7.835 0 015.221-9.771c29.581-8.98 78.756-7.245 109.83 11.202a7.823 7.823 0 012.74 10.733c-2.2 3.722-7.02 4.949-10.73 2.739z"
            />
          </svg>
        </a>
      ) : (
        <span className="list-spotify-link empty" aria-hidden="true" />
      )}
      <div className="list-stats">
        {f ? (
          <>
            <span className="list-bpm">{Math.round(f.bpm)} BPM</span>
            <span className="list-camelot">{f.camelot}</span>
            <span className="list-metric" title="Energy">E {round(f.energy, 2)}</span>
            <span className="list-metric" title="Danceability">D {round(f.danceability, 2)}</span>
            <span className="list-metric" title="Valence">V {round(f.valence, 2)}</span>
          </>
        ) : (
          <span className="missing-badge">No data</span>
        )}
      </div>
      <CostCell cost={transitionCost} label="Transition cost from previous track" />
      <CostCell cost={isolationCost} label="Distance to nearest other track" />
      <span className="list-duration">{formatDuration(track.duration_ms)}</span>
    </div>
  );
}
