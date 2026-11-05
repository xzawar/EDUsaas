'use client';

import { useEffect, useMemo, useRef, useState } from 'react';

/**
 * Single-series smooth area chart (dataviz rules: one hue, 2px line, ~10% wash, hairline grid, crosshair +
 * tooltip on hover, value label at the end). Values are percentages on a fixed 0–100 axis.
 */
type Point = { label: string; value: number; detail?: string };

const H = 220;
const PAD = { top: 16, right: 44, bottom: 26, left: 34 };

/**
 * Monotone cubic interpolation (Fritsch–Carlson): smooth like the reference design, but the curve never
 * overshoots the data — a week at 100% is never drawn above 100%.
 */
function smoothPath(pts: [number, number][]) {
  const n = pts.length;
  if (n < 2) return '';
  const dx = (i: number) => pts[i + 1]![0] - pts[i]![0];
  const slope = (i: number) => (pts[i + 1]![1] - pts[i]![1]) / dx(i);
  const m: number[] = new Array(n).fill(0);
  m[0] = slope(0);
  m[n - 1] = slope(n - 2);
  for (let i = 1; i < n - 1; i++) {
    const a = slope(i - 1);
    const b = slope(i);
    m[i] = a * b <= 0 ? 0 : (a + b) / 2;
  }
  for (let i = 0; i < n - 1; i++) {
    const s = slope(i);
    if (s === 0) {
      m[i] = 0;
      m[i + 1] = 0;
      continue;
    }
    const a = m[i]! / s;
    const b = m[i + 1]! / s;
    const h = a * a + b * b;
    if (h > 9) {
      const t = 3 / Math.sqrt(h);
      m[i] = t * a * s;
      m[i + 1] = t * b * s;
    }
  }
  let d = `M${pts[0]![0]},${pts[0]![1]}`;
  for (let i = 0; i < n - 1; i++) {
    const [x0, y0] = pts[i]!;
    const [x1, y1] = pts[i + 1]!;
    const h = (x1 - x0) / 3;
    d += ` C${x0 + h},${y0 + m[i]! * h} ${x1 - h},${y1 - m[i + 1]! * h} ${x1},${y1}`;
  }
  return d;
}

export function AreaTrend({
  points,
  target,
  caption,
  color = 'var(--accent)',
  yMin = 0,
}: {
  points: Point[];
  target?: number;
  caption: string;
  color?: string;
  /** Start the axis above 0 when every value sits high (e.g. attendance), so the shape is readable. */
  yMin?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(640);
  const [hover, setHover] = useState<number | null>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setW(Math.max(260, Math.round(e!.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const geo = useMemo(() => {
    const iw = w - PAD.left - PAD.right;
    const ih = H - PAD.top - PAD.bottom;
    const x = (i: number) => PAD.left + (points.length <= 1 ? iw / 2 : (i / (points.length - 1)) * iw);
    const y = (v: number) => PAD.top + ih - ((Math.max(yMin, v) - yMin) / (100 - yMin)) * ih;
    const pts = points.map((p, i) => [x(i), y(p.value)] as [number, number]);
    const line = smoothPath(pts);
    const area =
      pts.length > 1 ? `${line} L${pts[pts.length - 1]![0]},${PAD.top + ih} L${pts[0]![0]},${PAD.top + ih} Z` : '';
    const ticks = [0, 0.25, 0.5, 0.75, 1].map((t) => Math.round(yMin + t * (100 - yMin)));
    const every = Math.max(1, Math.ceil(points.length / Math.max(2, Math.floor(iw / 70))));
    return { iw, ih, x, y, pts, line, area, ticks, every };
  }, [w, points, yMin]);

  if (!points.length) return <p className="py-10 text-center text-sm text-slate-500">No data yet.</p>;

  const last = points[points.length - 1]!;
  const lastPt = geo.pts[geo.pts.length - 1]!;
  const h = hover === null ? null : { p: points[hover]!, at: geo.pts[hover]! };
  const gid = `area-${caption.replace(/\W+/g, '')}`;

  return (
    <figure ref={ref} className="relative">
      <figcaption className="sr-only">{caption}</figcaption>
      <svg
        width={w}
        height={H}
        role="img"
        aria-label={`${caption}. Latest ${last.label}: ${last.value}%.`}
        className="block touch-none select-none"
        onPointerMove={(e) => {
          const r = (e.currentTarget as SVGSVGElement).getBoundingClientRect();
          const px = e.clientX - r.left;
          let best = 0;
          for (let i = 1; i < geo.pts.length; i++)
            if (Math.abs(geo.pts[i]![0] - px) < Math.abs(geo.pts[best]![0] - px)) best = i;
          setHover(best);
        }}
        onPointerLeave={() => setHover(null)}
      >
        <defs>
          <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={0.16} />
            <stop offset="100%" stopColor={color} stopOpacity={0.02} />
          </linearGradient>
        </defs>
        {geo.ticks.map((t) => (
          <g key={t}>
            <line x1={PAD.left} x2={PAD.left + geo.iw} y1={geo.y(t)} y2={geo.y(t)} stroke="#eef0f4" strokeWidth={1} />
            <text
              x={PAD.left - 8}
              y={geo.y(t)}
              textAnchor="end"
              dominantBaseline="central"
              className="fill-slate-400 text-[10px]"
            >
              {t}
            </text>
          </g>
        ))}
        {target !== undefined && target > yMin && (
          <g>
            <line
              x1={PAD.left}
              x2={PAD.left + geo.iw}
              y1={geo.y(target)}
              y2={geo.y(target)}
              stroke="#94a3b8"
              strokeWidth={1}
              strokeDasharray="0"
              opacity={0.6}
            />
            <text x={PAD.left + 4} y={geo.y(target) - 6} className="fill-slate-500 text-[10px]">
              Target {target}%
            </text>
          </g>
        )}
        <path d={geo.area} fill={`url(#${gid})`} />
        <path d={geo.line} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
        {points.map((p, i) =>
          i % geo.every === 0 || i === points.length - 1 ? (
            <text key={i} x={geo.pts[i]![0]} y={H - 8} textAnchor="middle" className="fill-slate-400 text-[10px]">
              {p.label}
            </text>
          ) : null,
        )}
        {/* End label: the latest value, in ink, next to the line's end. */}
        <circle cx={lastPt[0]} cy={lastPt[1]} r={4} fill={color} stroke="white" strokeWidth={2} />
        <text
          x={lastPt[0] + 8}
          y={lastPt[1]}
          dominantBaseline="central"
          className="fill-slate-900 text-[11px] font-semibold"
        >
          {last.value}%
        </text>
        {h && (
          <g pointerEvents="none">
            <line x1={h.at[0]} x2={h.at[0]} y1={PAD.top} y2={PAD.top + geo.ih} stroke="#cbd5e1" strokeWidth={1} />
            <circle cx={h.at[0]} cy={h.at[1]} r={5} fill={color} stroke="white" strokeWidth={2} />
          </g>
        )}
      </svg>
      {h && (
        <div
          className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full rounded-lg bg-slate-900 px-2.5 py-1.5 text-xs whitespace-nowrap text-white shadow-lg"
          style={{ left: Math.min(Math.max(h.at[0], 50), w - 50), top: h.at[1] - 10 }}
        >
          <span className="font-semibold">{h.p.value}%</span>{' '}
          <span className="text-slate-300">· {h.p.detail ?? h.p.label}</span>
        </div>
      )}
    </figure>
  );
}
