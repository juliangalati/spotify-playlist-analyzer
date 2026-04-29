import type { ReactNode } from 'react';

type CardProps = {
  label: string;
  value: ReactNode;
  sub?: string;
  bar?: number;
  accent?: boolean;
};

export default function Card({ label, value, sub, bar, accent }: CardProps) {
  return (
    <div className="card">
      <div className="card-label">{label}</div>
      <div className={`card-value${accent ? ' accent' : ''}`}>{value}</div>
      {sub != null && <div className="card-sub">{sub}</div>}
      {bar != null && (
        <div className="bar">
          <div style={{ width: `${Math.max(0, Math.min(1, bar)) * 100}%` }} />
        </div>
      )}
    </div>
  );
}
