import type { AnalyzerPayload } from './types';

export const API_BASE = import.meta.env.DEV ? 'http://127.0.0.1:3001' : '';

export async function analyzePlaylist(id: string): Promise<AnalyzerPayload> {
  const res = await fetch(`${API_BASE}/api/playlist/${id}`, {
    credentials: 'include',
  });
  if (!res.ok) {
    const { error } = await res.json().catch(() => ({ error: res.statusText }));
    const err = new Error(error) as Error & { status?: number };
    err.status = res.status;
    throw err;
  }
  return res.json();
}

export type AuthState = { loggedIn: boolean; user?: { id: string; name: string } };

export async function fetchAuthState(): Promise<AuthState> {
  const res = await fetch(`${API_BASE}/api/auth/me`, { credentials: 'include' });
  if (!res.ok) return { loggedIn: false };
  return res.json();
}

export function loginUrl(): string {
  return `${API_BASE}/api/auth/login`;
}

export async function logout(): Promise<void> {
  await fetch(`${API_BASE}/api/auth/logout`, {
    method: 'POST',
    credentials: 'include',
  });
}
