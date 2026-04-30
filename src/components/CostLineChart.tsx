import { useEffect, useRef, useState } from 'react';
import * as d3 from 'd3';
import { TRANSITION_MAX, costColor } from '../transition';

type SeriesStyle =
  | 'raw'
  | 'smoothed'
  | 'cumulative'
  | 'energy'
  | 'danceability'
  | 'valence';

export type CostLineSeries = {
  label: string;
  values: Array<number | null>;
  style: SeriesStyle;
};

type Props = {
  title: string;
  tooltip: string;
  series: CostLineSeries[];
  maxY?: number;
  height?: number;
};

type HoverState = {
  index: number;
  leftPct: number;
};

const VIEW_WIDTH = 800;
const MARGIN = { top: 6, right: 24, bottom: 18, left: 28 };

const STROKE_ACCENT = '#1ed760';
const STROKE_SMOOTHED = '#ffffff';
const STROKE_CUMULATIVE = '#b3b3b3';
const STROKE_ENERGY = '#ff6b6b';
const STROKE_DANCEABILITY = '#5eead4';
const STROKE_VALENCE = '#fbbf24';

function styleAttrs(style: SeriesStyle): {
  stroke: string;
  strokeWidth: number;
  strokeOpacity: number;
  strokeDasharray?: string;
} {
  switch (style) {
    case 'raw':
      return { stroke: STROKE_ACCENT, strokeWidth: 1.5, strokeOpacity: 1 };
    case 'smoothed':
      return { stroke: STROKE_SMOOTHED, strokeWidth: 2, strokeOpacity: 0.75 };
    case 'cumulative':
      return {
        stroke: STROKE_CUMULATIVE,
        strokeWidth: 1.5,
        strokeOpacity: 1,
        strokeDasharray: '4 3',
      };
    case 'energy':
      return { stroke: STROKE_ENERGY, strokeWidth: 1.75, strokeOpacity: 1 };
    case 'danceability':
      return { stroke: STROKE_DANCEABILITY, strokeWidth: 1.75, strokeOpacity: 1 };
    case 'valence':
      return { stroke: STROKE_VALENCE, strokeWidth: 1.75, strokeOpacity: 1 };
  }
}

export default function CostLineChart({
  title,
  tooltip,
  series,
  maxY = TRANSITION_MAX,
  height = 100,
}: Props) {
  const ref = useRef<SVGSVGElement | null>(null);
  const [hover, setHover] = useState<HoverState | null>(null);

  const n = series[0]?.values.length ?? 0;
  const gradientId = `cost-line-gradient-${title.replace(/\s+/g, '-').toLowerCase()}`;

  useEffect(() => {
    if (!ref.current) return;
    const svg = d3.select(ref.current);
    svg.selectAll('*').remove();

    if (n === 0) return;

    const innerW = VIEW_WIDTH - MARGIN.left - MARGIN.right;
    const innerH = height - MARGIN.top - MARGIN.bottom;

    const x = d3.scaleLinear().domain([1, Math.max(2, n)]).range([0, innerW]);
    const y = d3.scaleLinear().domain([0, maxY]).range([innerH, 0]);

    const defs = svg.append('defs');
    const grad = defs
      .append('linearGradient')
      .attr('id', gradientId)
      .attr('x1', '0')
      .attr('y1', '1')
      .attr('x2', '0')
      .attr('y2', '0');
    grad.append('stop').attr('offset', '0%').attr('stop-color', costColor(0)).attr('stop-opacity', 0.02);
    grad.append('stop').attr('offset', '50%').attr('stop-color', costColor(maxY / 2)).attr('stop-opacity', 0.12);
    grad.append('stop').attr('offset', '100%').attr('stop-color', costColor(maxY)).attr('stop-opacity', 0.22);

    const g = svg.append('g').attr('transform', `translate(${MARGIN.left},${MARGIN.top})`);

    [0.25, 0.5, 0.75].forEach((t) => {
      const yv = y(maxY * t);
      g.append('line')
        .attr('class', 'grid-line')
        .attr('x1', 0)
        .attr('x2', innerW)
        .attr('y1', yv)
        .attr('y2', yv);
    });

    const rawSeries = series.find((s) => s.style === 'raw');
    if (rawSeries) {
      const area = d3
        .area<number | null>()
        .defined((d) => d != null)
        .x((_, i) => x(i + 1))
        .y0(y(0))
        .y1((d) => y(Math.min(maxY, Math.max(0, d as number))))
        .curve(d3.curveMonotoneX);

      g.append('path')
        .datum(rawSeries.values)
        .attr('fill', `url(#${gradientId})`)
        .attr('stroke', 'none')
        .attr('d', area as unknown as string);
    }

    for (const s of series) {
      const attrs = styleAttrs(s.style);
      const line = d3
        .line<number | null>()
        .defined((d) => d != null)
        .x((_, i) => x(i + 1))
        .y((d) => y(Math.min(maxY, Math.max(0, d as number))))
        .curve(d3.curveMonotoneX);

      const path = g
        .append('path')
        .datum(s.values)
        .attr('fill', 'none')
        .attr('stroke', attrs.stroke)
        .attr('stroke-width', attrs.strokeWidth)
        .attr('stroke-opacity', attrs.strokeOpacity)
        .attr('stroke-linecap', 'round')
        .attr('stroke-linejoin', 'round')
        .attr('d', line as unknown as string);
      if (attrs.strokeDasharray) {
        path.attr('stroke-dasharray', attrs.strokeDasharray);
      }
    }

    g.append('text')
      .attr('class', 'axis-label')
      .attr('x', -6)
      .attr('y', y(maxY))
      .attr('text-anchor', 'end')
      .attr('dominant-baseline', 'hanging')
      .text(maxY.toFixed(0));
    g.append('text')
      .attr('class', 'axis-label')
      .attr('x', -6)
      .attr('y', y(0))
      .attr('text-anchor', 'end')
      .attr('dominant-baseline', 'alphabetic')
      .text('0');
    g.append('text')
      .attr('class', 'axis-label')
      .attr('x', 0)
      .attr('y', innerH + 12)
      .attr('text-anchor', 'start')
      .text('1');
    g.append('text')
      .attr('class', 'axis-label')
      .attr('x', innerW)
      .attr('y', innerH + 12)
      .attr('text-anchor', 'end')
      .text(String(n));

    const overlay = g
      .append('rect')
      .attr('class', 'hover-overlay')
      .attr('x', 0)
      .attr('y', 0)
      .attr('width', innerW)
      .attr('height', innerH)
      .attr('fill', 'transparent')
      .style('cursor', 'crosshair');

    const cursor = g
      .append('line')
      .attr('class', 'hover-cursor')
      .attr('y1', 0)
      .attr('y2', innerH)
      .attr('x1', 0)
      .attr('x2', 0)
      .style('opacity', 0);

    overlay
      .on('mousemove', (event) => {
        const [px] = d3.pointer(event);
        const raw = x.invert(px);
        const idx = Math.max(1, Math.min(n, Math.round(raw)));
        const cx = x(idx);
        cursor.attr('x1', cx).attr('x2', cx).style('opacity', 1);
        const leftPct = ((cx + MARGIN.left) / VIEW_WIDTH) * 100;
        setHover({ index: idx, leftPct });
      })
      .on('mouseleave', () => {
        cursor.style('opacity', 0);
        setHover(null);
      });
  }, [series, n, maxY, height, gradientId]);

  const hoverValues = hover
    ? series.map((s) => ({
        label: s.label,
        style: s.style,
        value: s.values[hover.index - 1] ?? null,
      }))
    : null;

  return (
    <div className="cost-line-chart">
      <div className="cost-line-chart-head">
        <span className="cost-line-chart-title" data-tooltip={tooltip}>
          {title}
        </span>
        <div className="cost-line-chart-legend">
          {series.map((s) => (
            <span key={s.label} className={`legend-item ${s.style}`}>
              <span className="swatch" />
              {s.label}
            </span>
          ))}
        </div>
      </div>
      <div className="cost-line-chart-canvas">
        <svg
          ref={ref}
          viewBox={`0 0 ${VIEW_WIDTH} ${height}`}
          preserveAspectRatio="none"
          width="100%"
          height={height}
        />
        {hover && hoverValues ? (
          <div
            className="cost-line-chart-readout"
            style={{ left: `${hover.leftPct}%` }}
          >
            <div className="cost-line-chart-readout-title">Track {hover.index}</div>
            {hoverValues.map((v) => (
              <div key={v.label} className="cost-line-chart-readout-row">
                <span className={`readout-swatch ${v.style}`} />
                <span className="readout-label">{v.label}</span>
                <span className="readout-value">{v.value == null ? '—' : v.value.toFixed(2)}</span>
              </div>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}
