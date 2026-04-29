import { useEffect, useMemo, useState } from 'react';
import { analyzePlaylist, fetchAuthState, loginUrl, logout, type AuthState } from './api';
import { parsePlaylistId } from './util';
import { computeAggregates } from './aggregate';
import type { AnalyzerPayload, Aggregates } from './types';
import Nav from './components/Nav';
import PlaylistHeader from './components/PlaylistHeader';
import SummaryGrid from './components/SummaryGrid';
import CamelotWheel from './components/CamelotWheel';
import TrackGallery from './components/TrackGallery';
import JsonPanel from './components/JsonPanel';

type Status =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'error'; message: string };

export default function App() {
  const [url, setUrl] = useState('');
  const [status, setStatus] = useState<Status>({ kind: 'idle' });
  const [payload, setPayload] = useState<AnalyzerPayload | null>(null);
  const [auth, setAuth] = useState<AuthState>({ loggedIn: false });

  useEffect(() => {
    fetchAuthState().then(setAuth).catch(() => setAuth({ loggedIn: false }));
  }, []);

  async function onLogout() {
    await logout();
    setAuth({ loggedIn: false });
    setPayload(null);
  }

  const aggregates = useMemo<Aggregates | null>(() => {
    if (!payload) return null;
    try {
      return computeAggregates(payload.tracks);
    } catch {
      return null;
    }
  }, [payload]);

  useEffect(() => {
    if (payload) {
      document.title = `${payload.playlist.name} – Playlist Analyzer`;
    } else {
      document.title = 'Spotify Playlist Analyzer';
    }
  }, [payload]);

  async function analyze() {
    const id = parsePlaylistId(url);
    if (!id) {
      setStatus({
        kind: 'error',
        message:
          'Could not find a playlist ID in that URL. Expected format: https://open.spotify.com/playlist/...',
      });
      return;
    }
    setStatus({ kind: 'loading' });
    setPayload(null);
    try {
      const p = await analyzePlaylist(id);
      setPayload(p);
      setStatus({ kind: 'idle' });
    } catch (err) {
      const e = err as Error & { status?: number };
      if (e.status === 401) {
        setAuth({ loggedIn: false });
      }
      setStatus({
        kind: 'error',
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }

  const loading = status.kind === 'loading';
  const hasAnalyzed = payload != null && aggregates != null;
  const noCoverage = payload != null && payload.coverage.analyzed === 0;

  return (
    <>
      <Nav />
      <main>
        <section className="intro">
          <h1>Analyze a playlist</h1>
          <p>
            Paste a Spotify playlist URL to see its full audio analysis and key distribution.
          </p>
        </section>

        <div className="auth-row">
          {auth.loggedIn ? (
            <>
              <span className="auth-status">
                Signed in as <strong>{auth.user?.name}</strong>
              </span>
              <button className="secondary" onClick={onLogout}>
                Log out
              </button>
            </>
          ) : (
            <a className="primary" href={loginUrl()}>
              Log in with Spotify
            </a>
          )}
        </div>

        <div className="input-row">
          <input
            type="text"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !loading && auth.loggedIn) analyze();
            }}
            placeholder="https://open.spotify.com/playlist/..."
            autoComplete="off"
            spellCheck={false}
            aria-label="Spotify playlist URL"
            disabled={!auth.loggedIn}
          />
          <button
            className="primary"
            onClick={analyze}
            disabled={loading || !auth.loggedIn}
          >
            Analyze
          </button>
        </div>

        {status.kind === 'loading' && (
          <div className="status">
            {payload == null ? 'Analyzing…' : 'Analyzing tracks…'}
          </div>
        )}
        {status.kind === 'error' && (
          <div className="status error">{status.message}</div>
        )}
        {noCoverage && (
          <div className="status error">
            No audio features are available for any track in this playlist.
          </div>
        )}

        {hasAnalyzed && !noCoverage && (
          <>
            <PlaylistHeader playlist={payload.playlist} coverage={payload.coverage} />
            <SummaryGrid aggregates={aggregates} />
            <CamelotWheel keyDistribution={aggregates.key_distribution} />
            <TrackGallery tracks={payload.tracks} />
            <JsonPanel
              data={{
                playlist: payload.playlist,
                coverage: payload.coverage,
                aggregates,
                tracks: payload.tracks,
              }}
            />
          </>
        )}
      </main>
    </>
  );
}
