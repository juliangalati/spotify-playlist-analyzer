import type { Coverage, Playlist } from '../types';
import { formatLongDuration } from '../util';

type Props = {
  playlist: Playlist;
  coverage: Coverage;
};

export default function PlaylistHeader({ playlist, coverage }: Props) {
  const showBadge = coverage.analyzed < coverage.total;
  return (
    <section>
      <div className="playlist-header">
        {playlist.image ? (
          <img className="album-art" src={playlist.image} alt={`${playlist.name} cover`} />
        ) : (
          <div className="album-art" />
        )}
        <div>
          <div className="playlist-label">Playlist</div>
          <div className="playlist-title">{playlist.name}</div>
          <div className="playlist-meta">
            by <strong>{playlist.owner}</strong>
            <span className="sep">·</span>
            <span>{playlist.total} tracks</span>
            <span className="sep">·</span>
            <span>{formatLongDuration(playlist.duration_ms)}</span>
          </div>
          {showBadge && (
            <div className="coverage-badge">
              Analyzed {coverage.analyzed} of {coverage.total}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
