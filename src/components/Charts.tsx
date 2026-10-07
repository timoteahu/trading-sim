import { useRef, useState } from 'react';
import { instrumentId } from '../engine/instruments';
import { useUi, useEngine } from '../store';

function ema(series: number[], period: number): number[] {
  const k = 2 / (period + 1);
  const out: number[] = [];
  let e = series[0] ?? 0;
  for (const v of series) { e = v * k + e * (1 - k); out.push(e); }
  return out;
}

function path(series: number[], min: number, max: number, w: number, h: number): string {
  if (!series.length) return '';
  const range = max - min || 1;
  return series.map((v, i) =>
    `${i === 0 ? 'M' : 'L'} ${(i / Math.max(1, series.length - 1)) * w} ${h - ((v - min) / range) * h}`
  ).join(' ');
}

export default function Charts() {
  const engine = useEngine();
  const { chartA, chartB, emaFast, emaSlow, set } = useUi();
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState(0); // fraction of hidden tail scrolled left
  const drag = useRef<number | null>(null);

  const series = (id: string | null) => (id ? engine.history.get(id) ?? [] : []);
  let a = series(chartA), b = series(chartB);
  const n = Math.max(a.length, b.length);
  const win = Math.max(10, Math.floor(n / zoom));
  const end = Math.max(0, n - Math.floor(offset * (n - win)));
  const start = Math.max(0, end - win);
  a = a.slice(start, end); b = b.slice(start, end);

  const all = [...a, ...b];
  const min = all.length ? Math.min(...all) : 0;
  const max = all.length ? Math.max(...all) : 1;
  const W = 800, H = 150;

  const lines: { d: string; color: string }[] = [];
  if (a.length) lines.push({ d: path(a, min, max, W, H), color: '#4f9cf0' });
  if (b.length) lines.push({ d: path(b, min, max, W, H), color: '#e6a23c' });
  if (emaFast && a.length) lines.push({ d: path(ema(a, 5), min, max, W, H), color: '#3ecf6e' });
  if (emaSlow && a.length) lines.push({ d: path(ema(a, 20), min, max, W, H), color: '#ff6b6b' });

  return (
    <div className="chart-wrap">
      <div className="toolbar">
        <button onClick={() => set({ chartSelectArmed: true })}>Select chart</button>
        <span style={{ color: '#aab2bd' }}>
          {chartA ? instrumentLabel(chartA) : 'No instrument selected — click "Select chart" then a grid row'}
          {chartB ? ` + ${instrumentLabel(chartB)}` : ''}
        </span>
        <button className={emaFast ? 'on' : ''} onClick={() => set({ emaFast: !emaFast })}>EMA 5</button>
        <button className={emaSlow ? 'on' : ''} onClick={() => set({ emaSlow: !emaSlow })}>EMA 20</button>
        <button onClick={() => setZoom(1)}>Reset zoom</button>
        {chartB && <button onClick={() => set({ chartB: null })}>Clear overlay</button>}
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none"
        onWheel={(e) => setZoom(Math.min(50, Math.max(1, zoom * (e.deltaY > 0 ? 0.9 : 1.1))))}
        onMouseDown={(e) => { drag.current = e.clientX; }}
        onMouseMove={(e) => {
          if (drag.current != null) {
            const dx = (e.clientX - drag.current) / 400;
            setOffset(Math.min(1, Math.max(0, offset + dx)));
            drag.current = e.clientX;
          }
        }}
        onMouseUp={() => { drag.current = null; }} onMouseLeave={() => { drag.current = null; }}>
        {lines.map((l, i) => <path key={i} d={l.d} fill="none" stroke={l.color} strokeWidth="1.5" />)}
        {all.length > 0 && <>
          <text x="4" y="12" fill="#8a93a0" fontSize="10">{max.toFixed(2)}</text>
          <text x="4" y={H - 4} fill="#8a93a0" fontSize="10">{min.toFixed(2)}</text>
        </>}
      </svg>
    </div>
  );
}

function instrumentLabel(id: string) {
  const [p, c] = id.split(':');
  const name = ({ 'HEATING OIL': '', HO: 'HEATING OIL', FO6: 'FUEL OIL No.6', FO: 'FUEL OIL',
    'GAS/MOG': 'GASOLINE/MOGAS', 'HO/GASOIL': 'HEATING OIL/GASOIL', 'FO6/FO': 'FUEL OIL No.6/FUEL OIL' } as Record<string, string>)[p] ?? p;
  return `${name} ${c}`;
}
