import { scaleLinear } from 'd3-scale';
import { useState } from 'react';
import { useWidth } from './useWidth';

export interface Bin {
  from: number;
  to: number;
  share: number;
}

interface Props {
  bins: Bin[];
  height?: number;
  formatEdge: (v: number) => string;
  /** Reference lines in data units, e.g. the median. */
  lines?: Array<{ value: number; label: string }>;
  /** Bins at or above this edge are drawn in the accent series color; others in the muted color. */
  highlightFrom?: number;
  ariaLabel: string;
}

const MARGIN = { top: 24, right: 12, bottom: 30, left: 44 };

/** Rounded top corners (4px), square at the baseline. */
function barPath(x: number, y: number, w: number, h: number): string {
  const r = Math.min(4, w / 2, h);
  return `M${x},${y + h}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h}Z`;
}

export function Histogram({
  bins,
  height = 240,
  formatEdge,
  lines,
  highlightFrom,
  ariaLabel,
}: Props) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const innerW = Math.max(40, width - MARGIN.left - MARGIN.right);
  const innerH = height - MARGIN.top - MARGIN.bottom;
  const n = bins.length;
  const maxShare = Math.max(0.01, ...bins.map((b) => b.share));
  const y = scaleLinear().domain([0, maxShare]).nice(4).range([innerH, 0]);
  const slot = innerW / Math.max(1, n);
  const barW = Math.max(2, Math.min(24, slot - 2));
  const edgeX = (i: number) => i * slot;
  const lastFinite = bins.length ? bins[bins.length - 1]!.from : 0;
  const valueX = (v: number) => {
    // Position a value along the binned axis (the last bin is open-ended).
    const step = bins[0] ? bins[0].to - bins[0].from : 1;
    return (Math.min(v, lastFinite + step) / step) * slot;
  };

  return (
    <div className="chart-plot" ref={ref}>
      <svg width={width} height={height} role="img" aria-label={ariaLabel}>
        <g transform={`translate(${MARGIN.left},${MARGIN.top})`}>
          {y.ticks(4).map((t) => (
            <g key={t} transform={`translate(0,${y(t)})`}>
              <line className="grid" x1={0} x2={innerW} />
              <text className="tick" x={-8} dy="0.32em" textAnchor="end">
                {`${Math.round(t * 100)}%`}
              </text>
            </g>
          ))}
          {bins.map((b, i) => {
            const h = innerH - y(b.share);
            const x = edgeX(i) + (slot - barW) / 2;
            const strong = highlightFrom == null || b.from >= highlightFrom;
            return (
              <g key={i}>
                {h > 0 && (
                  <path
                    d={barPath(x, y(b.share), barW, h)}
                    fill={strong ? 'var(--series-1)' : 'var(--series-muted)'}
                    opacity={hover == null || hover === i ? 1 : 0.55}
                  />
                )}
                <rect
                  x={edgeX(i)}
                  y={0}
                  width={slot}
                  height={innerH}
                  fill="transparent"
                  tabIndex={0}
                  aria-label={`${formatEdge(b.from)} to ${Number.isFinite(b.to) ? formatEdge(b.to) : 'more'}: ${(b.share * 100).toFixed(1)}% of runs`}
                  onPointerEnter={() => setHover(i)}
                  onPointerLeave={() => setHover(null)}
                  onFocus={() => setHover(i)}
                  onBlur={() => setHover(null)}
                />
              </g>
            );
          })}
          <line className="axis" x1={0} x2={innerW} y1={innerH} y2={innerH} />
          {bins.map((b, i) =>
            i % Math.max(1, Math.round(n / 7)) === 0 && i < n - 1 ? (
              <text key={i} className="tick" x={edgeX(i)} y={innerH + 18} textAnchor="middle">
                {formatEdge(b.from)}
              </text>
            ) : null,
          )}
          {n > 1 && !Number.isFinite(bins[n - 1]!.to) && (
            <text className="tick" x={edgeX(n - 1) + slot / 2} y={innerH + 18} textAnchor="middle">
              {`${formatEdge(bins[n - 1]!.from)}+`}
            </text>
          )}
          {lines?.map((l, i) => {
            const lx = valueX(l.value);
            return (
              <g key={l.label} pointerEvents="none">
                <line className="ref strong" x1={lx} x2={lx} y1={-6} y2={innerH} />
                <text
                  className="ref-label"
                  x={lx + 4}
                  y={-10 - i * 14}
                  textAnchor={lx > innerW * 0.8 ? 'end' : 'start'}
                  dx={lx > innerW * 0.8 ? -8 : 0}
                >
                  {l.label}
                </text>
              </g>
            );
          })}
        </g>
      </svg>
      {hover != null && bins[hover] && (
        <div
          className="tooltip"
          style={{
            left: MARGIN.left + edgeX(hover) + slot / 2 + (edgeX(hover) > innerW * 0.6 ? -170 : 10),
            top: MARGIN.top,
          }}
        >
          <div className="tooltip-title">
            {formatEdge(bins[hover]!.from)} to{' '}
            {Number.isFinite(bins[hover]!.to) ? formatEdge(bins[hover]!.to) : 'more'}
          </div>
          <div className="tooltip-row">
            <span className="tooltip-value">{(bins[hover]!.share * 100).toFixed(1)}%</span>
            <span className="tooltip-label">of runs</span>
          </div>
        </div>
      )}
    </div>
  );
}
