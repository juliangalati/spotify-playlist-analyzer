import { useEffect, useRef } from 'react';
import * as d3 from 'd3';
import { buildWheelSlots } from '../camelot';

type Props = {
  keyDistribution: Record<string, number>;
};

export default function CamelotWheel({ keyDistribution }: Props) {
  const ref = useRef<SVGSVGElement | null>(null);

  useEffect(() => {
    if (!ref.current) return;
    const svg = d3.select(ref.current);
    svg.selectAll('*').remove();

    const size = 520;
    const cx = size / 2;
    const cy = size / 2;
    const outerR = 250;
    const midR = 180;
    const innerR = 100;

    const slots = buildWheelSlots();
    const counts = Object.values(keyDistribution);
    const maxCount = counts.length > 0 ? Math.max(...counts) : 0;

    // find the most-populated slot (ties: lowest number, then A before B)
    let topCode = '';
    let topCount = -1;
    for (const slot of slots) {
      const c = keyDistribution[slot.code] ?? 0;
      if (c > topCount) {
        topCount = c;
        topCode = slot.code;
      }
    }

    const arcOuter = d3.arc().innerRadius(midR).outerRadius(outerR);
    const arcInner = d3.arc().innerRadius(innerR).outerRadius(midR);

    const segAngleRad = (30 * Math.PI) / 180;

    function anglesForSlot(n: number) {
      const centerRad = (n * 30 * Math.PI) / 180;
      return {
        startAngle: centerRad - segAngleRad / 2,
        endAngle: centerRad + segAngleRad / 2,
      };
    }

    const g = svg.append('g').attr('transform', `translate(${cx},${cy})`);

    slots.forEach((slot) => {
      const { startAngle, endAngle } = anglesForSlot(slot.num);
      const isOuter = slot.letter === 'B';
      const arc = isOuter ? arcOuter : arcInner;

      const count = keyDistribution[slot.code] ?? 0;
      const isTop = count > 0 && slot.code === topCode;

      let fill: string;
      let fillOpacity = 1;
      if (count === 0 || maxCount === 0) {
        fill = '#1f1f1f';
      } else {
        fill = '#1ed760';
        fillOpacity = Math.max(0.15, count / maxCount);
      }

      g.append('path')
        .attr('class', 'wheel-segment')
        .attr('d', arc({ startAngle, endAngle, innerRadius: 0, outerRadius: 0 }) as string)
        .attr('fill', fill)
        .attr('fill-opacity', fillOpacity)
        .attr('stroke', isTop ? '#1ed760' : '#121212')
        .attr('stroke-width', isTop ? 2 : 2);

      const centerAngle = (startAngle + endAngle) / 2;
      const ringMid = isOuter ? (midR + outerR) / 2 : (innerR + midR) / 2;
      const lx = ringMid * Math.sin(centerAngle);
      const ly = -ringMid * Math.cos(centerAngle);

      g.append('text')
        .attr('class', 'wheel-label code')
        .attr('x', lx)
        .attr('y', ly - (count > 0 ? 10 : 7))
        .text(slot.code);

      g.append('text')
        .attr('class', 'wheel-label key')
        .attr('x', lx)
        .attr('y', ly + (count > 0 ? 3 : 8))
        .text(slot.keyLabel);

      if (count > 0) {
        g.append('text')
          .attr('class', 'wheel-label count')
          .attr('x', lx)
          .attr('y', ly + 16)
          .text(`×${count}`);
      }
    });

    g.append('text').attr('class', 'wheel-center').attr('y', -6).text('Camelot');
    g.append('text').attr('class', 'wheel-center').attr('y', 12).text('Wheel');
  }, [keyDistribution]);

  return (
    <section>
      <h3>Camelot Wheel — Key Distribution</h3>
      <div className="wheel-panel">
        <svg ref={ref} viewBox="0 0 520 520" width={520} height={520} />
        <div className="wheel-legend">
          <span>
            <span className="gradient-swatch" />
            Darker = more tracks in this key
          </span>
          <span>
            <span
              className="dot"
              style={{ background: '#1ed760', border: '2px solid #1ed760' }}
            />
            Most-populated key
          </span>
          <span>
            <span
              className="dot"
              style={{ background: '#1f1f1f', border: '1px solid #4d4d4d' }}
            />
            Empty slot
          </span>
        </div>
      </div>
    </section>
  );
}
