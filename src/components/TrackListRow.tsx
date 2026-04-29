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

  const inner = (
    <>
      <span className="list-pos">{position != null ? position : ''}</span>
      <div className="list-cover">
        {track.cover ? <img src={track.cover} alt="" /> : null}
      </div>
      <div className="list-title">
        <div className="list-name">{track.name}</div>
        <div className="list-artists">{artists}</div>
      </div>
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
    </>
  );

  const className = `track-list-row${f == null ? ' missing' : ''}`;

  return track.url ? (
    <a
      className={className}
      href={track.url}
      target="_blank"
      rel="noopener noreferrer"
      title={f == null ? 'Not in ReccoBeats catalog' : `Open ${track.name} on Spotify`}
    >
      {inner}
    </a>
  ) : (
    <div
      className={className}
      title={f == null ? 'Not in ReccoBeats catalog' : undefined}
    >
      {inner}
    </div>
  );
}
