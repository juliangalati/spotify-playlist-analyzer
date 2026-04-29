import type { Aggregates } from '../types';
import { formatLongDuration, round } from '../util';
import { CAMELOT_NUMBER_MAJOR, CAMELOT_NUMBER_MINOR, PITCH_NAMES } from '../camelot';
import Card from './Card';

function keyNameFromCamelot(code: string): string {
  if (!code) return '—';
  const num = parseInt(code, 10);
  const letter = code.slice(-1);
  const mode = letter === 'B' ? 1 : 0;
  const table = mode === 1 ? CAMELOT_NUMBER_MAJOR : CAMELOT_NUMBER_MINOR;
  const pitch = Object.keys(table).find((k) => table[Number(k)] === num);
  if (pitch == null) return '—';
  return `${PITCH_NAMES[Number(pitch)]} ${mode === 1 ? 'major' : 'minor'}`;
}

type Props = { aggregates: Aggregates };

export default function SummaryGrid({ aggregates }: Props) {
  const major = aggregates.major_minor_ratio.major;
  const minor = aggregates.major_minor_ratio.minor;

  return (
    <section>
      <h3>Playlist Summary</h3>
      <div className="summary-grid">
        <Card
          label="Avg BPM"
          value={Math.round(aggregates.avg_bpm)}
          sub={`${round(aggregates.avg_bpm, 2)} exact`}
        />
        <Card
          label="Avg Energy"
          value={round(aggregates.avg_energy, 2)}
          bar={aggregates.avg_energy}
        />
        <Card
          label="Avg Danceability"
          value={round(aggregates.avg_danceability, 2)}
          bar={aggregates.avg_danceability}
        />
        <Card
          label="Avg Valence"
          value={round(aggregates.avg_valence, 2)}
          bar={aggregates.avg_valence}
          sub="Mood"
        />
        <Card
          label="Dominant Key"
          value={keyNameFromCamelot(aggregates.dominant_key_code)}
          sub={aggregates.dominant_key_code}
          accent
        />
        <Card label="Avg Loudness" value={`${round(aggregates.avg_loudness, 1)} dB`} />
        <Card
          label="Major / Minor"
          value={`${Math.round(major * 100)}% / ${Math.round(minor * 100)}%`}
        />
        <Card
          label="Total Duration"
          value={formatLongDuration(aggregates.total_duration_ms)}
        />
      </div>
    </section>
  );
}
