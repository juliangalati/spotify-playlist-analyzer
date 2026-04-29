import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import session from 'express-session';
import cookieParser from 'cookie-parser';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { fetchPlaylist } from './spotify.js';
import { fetchAudioFeatures } from './reccobeats.js';
import { authRouter, requireSpotifyToken } from './auth.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = Number(process.env.PORT ?? 3001);

app.set('trust proxy', 1);

if (process.env.NODE_ENV !== 'production') {
  app.use(
    cors({
      origin: ['http://127.0.0.1:5173', 'http://localhost:5173'],
      credentials: true,
    })
  );
}

app.use(cookieParser());
app.use(
  session({
    name: 'spa.sid',
    secret: process.env.SESSION_SECRET ?? crypto.randomBytes(32).toString('hex'),
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      maxAge: 7 * 24 * 60 * 60 * 1000,
    },
  })
);

app.get('/api/health', (_req, res) => {
  res.json({ ok: true });
});

app.use('/api/auth', authRouter);

app.get('/api/debug/playlist/:id', async (req, res) => {
  try {
    const { requireSpotifyToken } = await import('./auth.js');
    const token = await requireSpotifyToken(req);
    const { id } = req.params;

    const r1 = await fetch(`https://api.spotify.com/v1/playlists/${id}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const meta = { status: r1.status, body: await r1.text() };

    const r2 = await fetch(
      `https://api.spotify.com/v1/playlists/${id}/tracks?limit=5`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    const tracksHeaders: Record<string, string> = {};
    r2.headers.forEach((v, k) => {
      tracksHeaders[k] = v;
    });
    const tracks = {
      status: r2.status,
      body: await r2.text(),
      headers: tracksHeaders,
    };

    const r3 = await fetch('https://api.spotify.com/v1/me', {
      headers: { Authorization: `Bearer ${token}` },
    });
    const me = { status: r3.status, body: await r3.text() };

    res.json({ meta, tracks, me });
  } catch (err) {
    const e = err as { status?: number; message?: string };
    res.status(e.status ?? 500).json({ error: e.message });
  }
});

app.get('/api/playlist/:id', async (req, res) => {
  try {
    const token = await requireSpotifyToken(req);
    const { id } = req.params;
    const { meta, tracks } = await fetchPlaylist(id, token);
    const featuresMap = await fetchAudioFeatures(tracks.map((t) => t.id));

    const analyzedTracks = tracks.map((t) => ({
      id: t.id,
      name: t.name,
      artists: t.artists.map((a) => ({ id: a.id, name: a.name })),
      album: {
        name: t.album.name,
        release_date: t.album.release_date ?? null,
      },
      duration_ms: t.duration_ms,
      url: t.external_urls?.spotify ?? null,
      cover: t.album.images?.[0]?.url ?? null,
      features: featuresMap.get(t.id) ?? null,
    }));

    const analyzedCount = analyzedTracks.filter((t) => t.features).length;

    res.json({
      playlist: {
        id: meta.id,
        name: meta.name,
        owner: meta.owner.display_name,
        image: meta.images?.[0]?.url ?? null,
        total: meta.tracks.total,
        url: meta.external_urls.spotify,
        duration_ms: analyzedTracks.reduce((sum, t) => sum + t.duration_ms, 0),
      },
      coverage: { analyzed: analyzedCount, total: analyzedTracks.length },
      tracks: analyzedTracks,
    });
  } catch (err) {
    const e = err as { status?: number; message?: string };
    const status = e.status ?? 500;
    const message = e.message ?? 'Internal error';
    console.error('[playlist]', message);
    res.status(status).json({ error: message });
  }
});

if (process.env.NODE_ENV === 'production') {
  const dist = path.join(__dirname, '..', 'dist');
  app.use(express.static(dist));
  app.get(/.*/, (_req, res) => {
    res.sendFile(path.join(dist, 'index.html'));
  });
}

app.listen(PORT, () => {
  console.log(`[server] listening on http://localhost:${PORT}`);
});
