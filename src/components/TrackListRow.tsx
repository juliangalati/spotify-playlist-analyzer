import type { TrackRow } from '../types';
import { formatDuration, round } from '../util';

type Props = { track: TrackRow; position?: number };

export default function TrackListRow({ track, position }: Props) {
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
