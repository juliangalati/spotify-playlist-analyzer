import type { TrackRow } from '../types';
import { formatDuration, round } from '../util';
import { keyName } from '../camelot';

type Props = { track: TrackRow };

export default function TrackCard({ track }: Props) {
  const f = track.features;
  const artists = track.artists.map((a) => a.name).join(', ');

  return (
    <div
      className={`track-card${f == null ? ' missing' : ''}`}
      title={f == null ? 'Not in ReccoBeats catalog' : undefined}
    >
      {track.url ? (
        <a
          className="track-cover-wrap"
          href={track.url}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={`Open ${track.name} on Spotify`}
        >
          {track.cover ? <img src={track.cover} alt="" /> : null}
          <span className="track-duration">{formatDuration(track.duration_ms)}</span>
        </a>
      ) : (
        <div className="track-cover-wrap">
          {track.cover ? <img src={track.cover} alt="" /> : null}
          <span className="track-duration">{formatDuration(track.duration_ms)}</span>
        </div>
      )}

      <div>
        <div className="track-name">{track.name}</div>
        <div className="track-artists">{artists}</div>
        {f == null && <span className="missing-badge">No data</span>}
      </div>

      <div className="track-stats-row1">
        {f ? (
          <>
            <span>{Math.round(f.bpm)} BPM</span>
            <span className="sep">·</span>
            <span>{keyName(f.key, f.mode)}</span>
            <span className="sep">·</span>
            <span className="camelot">{f.camelot}</span>
          </>
        ) : (
          <>
            <span>— BPM</span>
            <span className="sep">·</span>
            <span>—</span>
            <span className="sep">·</span>
            <span>—</span>
          </>
        )}
      </div>

      <div className="track-bars">
        <BarCell letter="E" value={f?.energy} />
        <BarCell letter="D" value={f?.danceability} />
        <BarCell letter="V" value={f?.valence} />
      </div>
    </div>
  );
}

function BarCell({ letter, value }: { letter: string; value: number | undefined }) {
  return (
    <div className="track-bar-cell">
      <div className="top">
        <span>{letter}</span>
        <span className="value">{value != null ? round(value, 2) : '—'}</span>
      </div>
      <div className="bar">
        <div style={{ width: `${Math.max(0, Math.min(1, value ?? 0)) * 100}%` }} />
      </div>
    </div>
  );
}
