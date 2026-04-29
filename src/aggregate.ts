import type { Aggregates, TrackRow } from './types';
import { camelotFor } from './camelot';
import { round } from './util';

export function computeAggregates(tracks: TrackRow[]): Aggregates {
  const withFeatures = tracks.filter((t) => t.features != null);
  if (withFeatures.length === 0) {
    throw new Error('No audio features are available for any track in this playlist.');
  }

  let sumBpm = 0;
  let sumEnergy = 0;
  let sumDance = 0;
  let sumValence = 0;
  let sumLoudness = 0;
  let majorCount = 0;
  let minorCount = 0;

  const keyDistribution: Record<string, number> = {};

  for (const t of withFeatures) {
    const f = t.features!;
    sumBpm += f.bpm;
    sumEnergy += f.energy;
    sumDance += f.danceability;
    sumValence += f.valence;
    sumLoudness += f.loudness;

    if (f.mode === 1) majorCount += 1;
    else minorCount += 1;

    const code = camelotFor(f.key, f.mode);
    if (code != null) {
      keyDistribution[code] = (keyDistribution[code] ?? 0) + 1;
    }
  }

  const n = withFeatures.length;

  let dominantCode = '';
  let dominantCount = -1;
  const entries = Object.entries(keyDistribution);
  for (const [code, count] of entries) {
    if (count > dominantCount) {
      dominantCount = count;
      dominantCode = code;
    } else if (count === dominantCount) {
      const [aNumStr, aLetter] = [code.slice(0, -1), code.slice(-1)];
      const [bNumStr, bLetter] = [dominantCode.slice(0, -1), dominantCode.slice(-1)];
      const aNum = parseInt(aNumStr, 10);
      const bNum = parseInt(bNumStr, 10);
      if (aNum < bNum || (aNum === bNum && aLetter < bLetter)) {
        dominantCode = code;
      }
    }
  }

  const total_duration_ms = tracks.reduce((sum, t) => sum + t.duration_ms, 0);

  return {
    avg_bpm: round(sumBpm / n, 2) as number,
    avg_energy: round(sumEnergy / n, 3) as number,
    avg_danceability: round(sumDance / n, 3) as number,
    avg_valence: round(sumValence / n, 3) as number,
    avg_loudness: round(sumLoudness / n, 3) as number,
    major_minor_ratio: {
      major: round(majorCount / n, 3) as number,
      minor: round(minorCount / n, 3) as number,
    },
    key_distribution: keyDistribution,
    dominant_key_code: dominantCode,
    total_duration_ms,
  };
}
