import crypto from 'node:crypto';
import type { Request, NextFunction } from 'express';
import { Router } from 'express';

const CLIENT_ID = process.env.SPOTIFY_CLIENT_ID;
const CLIENT_SECRET = process.env.SPOTIFY_CLIENT_SECRET;
const PORT = Number(process.env.PORT ?? 3001);
const REDIRECT_URI =
  process.env.SPOTIFY_REDIRECT_URI ?? `http://127.0.0.1:${PORT}/api/auth/callback`;

if (!CLIENT_ID || !CLIENT_SECRET) {
  throw new Error(
    'Missing Spotify credentials. Set SPOTIFY_CLIENT_ID and SPOTIFY_CLIENT_SECRET in .env.'
  );
}

const SCOPES = ['playlist-read-private', 'playlist-read-collaborative'].join(' ');

declare module 'express-session' {
  interface SessionData {
    accessToken?: string;
    refreshToken?: string;
    expiresAt?: number;
    userId?: string;
    userName?: string;
    oauthState?: string;
    postLoginRedirect?: string;
  }
}

type TokenResponse = {
  access_token: string;
  token_type: string;
  expires_in: number;
  refresh_token?: string;
  scope?: string;
};

async function exchangeCodeForToken(code: string): Promise<TokenResponse> {
  const basic = Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString('base64');
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri: REDIRECT_URI,
  });
  const res = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: {
      Authorization: `Basic ${basic}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Token exchange failed (${res.status}): ${text}`);
  }
  return (await res.json()) as TokenResponse;
}

async function refreshAccessToken(refreshToken: string): Promise<TokenResponse> {
  const basic = Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString('base64');
  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
  });
  const res = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: {
      Authorization: `Basic ${basic}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Token refresh failed (${res.status}): ${text}`);
  }
  return (await res.json()) as TokenResponse;
}

async function fetchMe(accessToken: string): Promise<{ id: string; display_name: string | null }> {
  const res = await fetch('https://api.spotify.com/v1/me', {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error(`/me failed (${res.status})`);
  return (await res.json()) as { id: string; display_name: string | null };
}

export async function requireSpotifyToken(req: Request): Promise<string> {
  const s = req.session;
  if (!s.accessToken || !s.refreshToken || !s.expiresAt) {
    const err = new Error('Not logged in. Please log in with Spotify first.');
    (err as { status?: number }).status = 401;
    throw err;
  }
  if (Date.now() < s.expiresAt - 10_000) {
    return s.accessToken;
  }
  const refreshed = await refreshAccessToken(s.refreshToken);
  s.accessToken = refreshed.access_token;
  s.expiresAt = Date.now() + refreshed.expires_in * 1000;
  if (refreshed.refresh_token) s.refreshToken = refreshed.refresh_token;
  return s.accessToken;
}

export const authRouter = Router();

authRouter.get('/login', (req, res) => {
  const state = crypto.randomBytes(16).toString('hex');
  req.session.oauthState = state;
  const returnTo = typeof req.query.returnTo === 'string' ? req.query.returnTo : '/';
  req.session.postLoginRedirect = returnTo;

  const params = new URLSearchParams({
    response_type: 'code',
    client_id: CLIENT_ID!,
    scope: SCOPES,
    redirect_uri: REDIRECT_URI,
    state,
    show_dialog: 'false',
  });
  res.redirect(`https://accounts.spotify.com/authorize?${params.toString()}`);
});

authRouter.get('/callback', async (req, res, next: NextFunction) => {
  try {
    const { code, state, error } = req.query as {
      code?: string;
      state?: string;
      error?: string;
    };
    if (error) {
      return res.redirect(`/?auth_error=${encodeURIComponent(error)}`);
    }
    if (!code || !state || state !== req.session.oauthState) {
      return res.redirect('/?auth_error=invalid_state');
    }
    req.session.oauthState = undefined;

    const token = await exchangeCodeForToken(code);
    req.session.accessToken = token.access_token;
    req.session.refreshToken = token.refresh_token;
    req.session.expiresAt = Date.now() + token.expires_in * 1000;

    try {
      const me = await fetchMe(token.access_token);
      req.session.userId = me.id;
      req.session.userName = me.display_name ?? me.id;
    } catch {
      // non-fatal
    }

    const redirectTo = req.session.postLoginRedirect ?? '/';
    req.session.postLoginRedirect = undefined;
    const base =
      process.env.NODE_ENV !== 'production'
        ? process.env.APP_BASE_URL ?? 'http://127.0.0.1:5173'
        : '';
    res.redirect(`${base}${redirectTo}`);
  } catch (err) {
    next(err);
  }
});

authRouter.get('/me', (req, res) => {
  if (req.session.accessToken && req.session.userId) {
    res.json({
      loggedIn: true,
      user: { id: req.session.userId, name: req.session.userName ?? req.session.userId },
    });
    return;
  }
  res.json({ loggedIn: false });
});

authRouter.post('/logout', (req, res) => {
  req.session.destroy(() => {
    res.json({ ok: true });
  });
});
