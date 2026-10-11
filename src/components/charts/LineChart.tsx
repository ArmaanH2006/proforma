import { bisector } from 'd3-array';
import { scaleLinear, scaleLog } from 'd3-scale';
import { area, line } from 'd3-shape';
import { useMemo, useState, type KeyboardEvent, type PointerEvent } from 'react';
import { useWidth } from './useWidth';

export interface LineSeries {
  id: string;
  label: string;
  color: string;
  values: ReadonlyArray<number | null>;
  /** Draw thinner and behind the others. */
  muted?: boolean;
}

interface Props {
  x: readonly number[];
  series: LineSeries[];
  height?: number;
  xFormat: (v: number) => string;
  yFormat: (v: number) => string;
  tooltipTitle?: (v: number) => string;
  yScale?: 'linear' | 'log';
  band?: { lower: readonly number[]; upper: readonly number[]; label: string };
  /** Small markers on the x axis (e.g. waterfall breakpoints). */
  markers?: Array<{ x: number; label: string }>;
  hLines?: Array<{ y: number; label: string }>;
  selectedX?: number | null;
  onSelectX?: (x: number) => void;
  endLabels?: boolean;
  ariaLabel: string;
  xTickCount?: number;
}

const MARGIN = { top: 14, bottom: 30, left: 62 };

function logTicks(lo: number, hi: number): number[] {
  const out: number[] = [];
  const start = Math.floor(Math.log10(lo));
  const end = Math.ceil(Math.log10(hi));
  for (let e = start; e <= end; e++) {
    for (const m of [1, 3]) {
      const v = m * 10 ** e;
      if (v >= lo * 0.999 && v <= hi * 1.001) out.push(v);
    }
  }
  return out;
}

export function LineChart({
  x,
  series,
  height = 280,
  xFormat,
  yFormat,
  tooltipTitle,
  yScale = 'linear',
  band,
  markers,
  hLines,
  selectedX,
  onSelectX,
  endLabels,
  ariaLabel,
  xTickCount = 6,
}: Props) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const right = endLabels ? 108 : 18;
  const innerW = Math.max(40, width - MARGIN.left - right);
  const innerH = height - MARGIN.top - MARGIN.bottom;

  const { xs, ys, yTicks, paths, bandPath, labels } = useMemo(() => {
    const xs = scaleLinear()
      .domain([x[0] ?? 0, x[x.length - 1] ?? 1])
      .range([0, innerW]);
    const all: number[] = [];
    for (const s of series)
      for (const v of s.values) if (v != null && Number.isFinite(v)) all.push(v);
    if (band) all.push(...band.lower, ...band.upper);
    for (const h of hLines ?? []) all.push(h.y);
    let ys;
    let yTicks: number[];
    if (yScale === 'log') {
      const pos = all.filter((v) => v > 0);
      const lo = pos.length ? Math.min(...pos) : 1;
      const hi = pos.length ? Math.max(...pos) : 10;
      ys = scaleLog()
        .domain([lo * 0.9, hi * 1.1])
        .range([innerH, 0]);
      yTicks = logTicks(lo * 0.9, hi * 1.1);
    } else {
      const lo = Math.min(0, ...all);
      const hi = Math.max(1e-9, ...all);
      ys = scaleLinear().domain([lo, hi]).nice(5).range([innerH, 0]);
      yTicks = ys.ticks(5);
    }
    const gen = line<number | null>()
      .defined((v) => v != null && Number.isFinite(v) && (yScale !== 'log' || v > 0))
      .x((_, i) => xs(x[i]!))
      .y((v) => ys(v as number));
    const paths = series.map((s) => gen(s.values as Array<number | null>) ?? '');
    const bandPath = band
      ? (area<number>()
          .x((_, i) => xs(x[i]!))
          .y0((_, i) => ys(band.lower[i]!))
          .y1((_, i) => ys(band.upper[i]!))(band.lower as number[]) ?? '')
      : '';

    // Direct labels at the line ends, only when none would collide.
    let labels: Array<{ i: number; y: number; label: string }> = [];
    if (endLabels) {
      labels = series
        .map((s, i) => {
          let last = -1;
          for (let k = s.values.length - 1; k >= 0; k--) {
            if (s.values[k] != null) {
              last = k;
              break;
            }
          }
          return last < 0 ? null : { i, y: ys(s.values[last] as number), label: s.label };
        })
        .filter((v): v is { i: number; y: number; label: string } => v != null)
        .sort((a, b) => a.y - b.y);
      for (let k = 1; k < labels.length; k++) {
        if (labels[k]!.y - labels[k - 1]!.y < 14) {
          labels = [];
          break;
        }
      }
    }
    return { xs, ys, yTicks, paths, bandPath, labels };
  }, [x, series, band, hLines, innerW, innerH, yScale, endLabels]);

  const xTicks = xs.ticks(xTickCount);
  const nearest = (px: number) => {
    const value = xs.invert(px);
    const i = bisector((d: number) => d).center(x as number[], value);
    return Math.max(0, Math.min(x.length - 1, i));
  };

  const onMove = (e: PointerEvent<SVGRectElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    setHover(nearest(e.clientX - rect.left));
  };
  const onKey = (e: KeyboardEvent<SVGRectElement>) => {
    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
      e.preventDefault();
      const step = e.shiftKey ? 10 : 1;
      setHover((h) => {
        const cur = h ?? 0;
        return Math.max(0, Math.min(x.length - 1, cur + (e.key === 'ArrowRight' ? step : -step)));
      });
    } else if (e.key === 'Enter' && hover != null && onSelectX) {
      onSelectX(x[hover]!);
    }
  };

  const hx = hover != null ? xs(x[hover]!) : null;
  const tooltipLeft = hx != null ? MARGIN.left + hx : 0;
  const flip = hx != null && hx > innerW * 0.62;

  return (
    <div className="chart-plot" ref={ref}>
      <svg width={width} height={height} role="img" aria-label={ariaLabel}>
        <g transform={`translate(${MARGIN.left},${MARGIN.top})`}>
          {yTicks.map((t) => (
            <g key={t} transform={`translate(0,${ys(t)})`}>
              <line className="grid" x1={0} x2={innerW} />
              <text className="tick" x={-10} dy="0.32em" textAnchor="end">
                {yFormat(t)}
              </text>
            </g>
          ))}
          {yScale === 'linear' && ys.domain()[0]! < 0 && (
            <line className="axis" x1={0} x2={innerW} y1={ys(0)} y2={ys(0)} />
          )}
          <line className="axis" x1={0} x2={innerW} y1={innerH} y2={innerH} />
          {xTicks.map((t) => (
            <text key={t} className="tick" x={xs(t)} y={innerH + 18} textAnchor="middle">
              {xFormat(t)}
            </text>
          ))}
          {hLines?.map((h) => (
            <g key={h.label}>
              <line className="ref" x1={0} x2={innerW} y1={ys(h.y)} y2={ys(h.y)} />
              <text className="ref-label" x={4} y={ys(h.y) - 5}>
                {h.label}
              </text>
            </g>
          ))}
          {bandPath && <path d={bandPath} fill="var(--band)" stroke="none" />}
          {series.map((s, i) => (
            <path
              key={s.id}
              d={paths[i]}
              fill="none"
              stroke={s.color}
              strokeWidth={s.muted ? 1.5 : 2}
              strokeLinejoin="round"
              strokeLinecap="round"
              opacity={s.muted ? 0.7 : 1}
            />
          ))}
          {selectedX != null && selectedX >= xs.domain()[0]! && selectedX <= xs.domain()[1]! && (
            <g>
              <line className="selected" x1={xs(selectedX)} x2={xs(selectedX)} y1={0} y2={innerH} />
            </g>
          )}
          {markers?.map((m, i) => (
            <g key={i} transform={`translate(${xs(m.x)},${innerH})`}>
              <title>{`${m.label}: ${xFormat(m.x)}`}</title>
              <path d="M0,-7 L4.5,0 L-4.5,0 Z" className="marker" />
            </g>
          ))}
          {labels.map((l) => (
            <text key={l.i} className="end-label" x={innerW + 8} y={l.y} dy="0.32em">
              {l.label}
            </text>
          ))}
          {hx != null && (
            <g pointerEvents="none">
              <line className="crosshair" x1={hx} x2={hx} y1={0} y2={innerH} />
              {series.map((s) => {
                const v = s.values[hover!];
                if (v == null || !Number.isFinite(v) || (yScale === 'log' && v <= 0)) return null;
                return (
                  <circle
                    key={s.id}
                    cx={hx}
                    cy={ys(v)}
                    r={4}
                    fill={s.color}
                    stroke="var(--surface)"
                    strokeWidth={2}
                  />
                );
              })}
            </g>
          )}
          <rect
            className="overlay"
            width={innerW}
            height={innerH}
            tabIndex={0}
            aria-label={`${ariaLabel}. Use the arrow keys to read values${onSelectX ? ', Enter to select' : ''}.`}
            onPointerMove={onMove}
            onPointerLeave={() => setHover(null)}
            onPointerDown={(e) => {
              if (!onSelectX) return;
              const rect = e.currentTarget.getBoundingClientRect();
              onSelectX(x[nearest(e.clientX - rect.left)]!);
            }}
            onKeyDown={onKey}
            onBlur={() => setHover(null)}
            style={{ cursor: onSelectX ? 'pointer' : 'crosshair' }}
          />
        </g>
      </svg>
      {hover != null && hx != null && (
        <div
          className="tooltip"
          style={{
            left: flip ? undefined : tooltipLeft + 14,
            right: flip ? width - tooltipLeft + 14 : undefined,
            top: MARGIN.top + 4,
          }}
        >
          <div className="tooltip-title">{(tooltipTitle ?? xFormat)(x[hover]!)}</div>
          {series.map((s) => {
            const v = s.values[hover];
            if (v == null) return null;
            return (
              <div key={s.id} className="tooltip-row">
                <span className="tooltip-key" style={{ background: s.color }} />
                <span className="tooltip-value">{yFormat(v)}</span>
                <span className="tooltip-label">{s.label}</span>
              </div>
            );
          })}
          {band && (
            <div className="tooltip-row">
              <span className="tooltip-key band" />
              <span className="tooltip-value">
                {yFormat(band.lower[hover]!)} to {yFormat(band.upper[hover]!)}
              </span>
              <span className="tooltip-label">{band.label}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
