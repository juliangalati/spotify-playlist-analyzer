export type ReccoFeatures = {
  bpm: number;
  key: number;
  mode: 0 | 1;
  camelot: string;
  energy: number;
  danceability: number;
  valence: number;
  acousticness: number;
  instrumentalness: number;
  liveness: number;
  loudness: number;
};

type ReccoItem = {
  id: string;
  href: string;
  tempo: number;
  key: number;
  mode: 0 | 1;
  energy: number;
  danceability: number;
  valence: number;
  acousticness: number;
  instrumentalness: number;
  liveness: number;
  loudness: number;
};

const PITCH_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
void PITCH_NAMES;

const CAMELOT_NUMBER_MAJOR: Record<number, number> = {
  0: 8, 1: 3, 2: 10, 3: 5, 4: 12, 5: 7, 6: 2, 7: 9, 8: 4, 9: 11, 10: 6, 11: 1,
};
const CAMELOT_NUMBER_MINOR: Record<number, number> = {
  0: 5, 1: 12, 2: 7, 3: 2, 4: 9, 5: 4, 6: 11, 7: 6, 8: 1, 9: 8, 10: 3, 11: 10,
};

function camelotFor(key: number, mode: 0 | 1): string | null {
  if (key == null || key < 0) return null;
  const num = mode === 1 ? CAMELOT_NUMBER_MAJOR[key] : CAMELOT_NUMBER_MINOR[key];
  if (num == null) return null;
  return `${num}${mode === 1 ? 'B' : 'A'}`;
}

const SPOTIFY_TRACK_URL_RE = /open\.spotify\.com\/track\/([A-Za-z0-9]{22})/;

function spotifyIdFromHref(href: string): string | null {
  return href.match(SPOTIFY_TRACK_URL_RE)?.[1] ?? null;
}

const CHUNK_SIZE = 40;
const MAX_IN_FLIGHT = 4;

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

async function fetchChunk(ids: string[]): Promise<ReccoItem[]> {
  const url = `https://api.reccobeats.com/v1/audio-features?ids=${ids.join(',')}`;
  try {
    const res = await fetch(url, { headers: { Accept: 'application/json' } });
    if (!res.ok) {
      console.warn(`[reccobeats] chunk failed ${res.status}, size=${ids.length}`);
      return [];
    }
    const data = (await res.json()) as { content?: ReccoItem[] };
    return data.content ?? [];
  } catch (err) {
    console.warn('[reccobeats] chunk threw:', (err as Error).message);
    return [];
  }
}

export async function fetchAudioFeatures(
  spotifyIds: string[]
): Promise<Map<string, ReccoFeatures>> {
  const map = new Map<string, ReccoFeatures>();
  const chunks = chunk(spotifyIds, CHUNK_SIZE);

  for (let i = 0; i < chunks.length; i += MAX_IN_FLIGHT) {
    const batch = chunks.slice(i, i + MAX_IN_FLIGHT);
    const results = await Promise.all(batch.map(fetchChunk));
    for (const items of results) {
      for (const item of items) {
        const spotifyId = spotifyIdFromHref(item.href);
        if (!spotifyId) continue;
        const camelot = camelotFor(item.key, item.mode);
        if (camelot == null) continue;
        map.set(spotifyId, {
          bpm: item.tempo,
          key: item.key,
          mode: item.mode,
          camelot,
          energy: item.energy,
          danceability: item.danceability,
          valence: item.valence,
          acousticness: item.acousticness,
          instrumentalness: item.instrumentalness,
          liveness: item.liveness,
          loudness: item.loudness,
        });
      }
    }
  }

  return map;
}
