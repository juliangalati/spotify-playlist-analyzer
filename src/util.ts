export function round(n: number | null | undefined, digits = 3): number | null {
  if (n == null || Number.isNaN(n)) return null;
  const p = 10 ** digits;
  return Math.round(n * p) / p;
}

export function formatDuration(ms: number): string {
  const total = Math.round(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

export function formatLongDuration(ms: number): string {
  const totalSec = Math.round(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m ${s}s`;
}

export function parsePlaylistId(urlOrId: string): string | null {
  const m = urlOrId.trim().match(/playlist\/([A-Za-z0-9]{22})/);
  if (m) return m[1];
  const raw = urlOrId.trim().match(/^[A-Za-z0-9]{22}$/);
  if (raw) return raw[0];
  return null;
}
