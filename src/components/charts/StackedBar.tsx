import { useState } from 'react';
import { useWidth } from './useWidth';

export interface Segment {
  id: string;
  label: string;
  value: number;
  color: string;
}

interface Row {
  label: string;
  segments: Segment[];
}

interface Props {
  rows: Row[];
  format: (v: number, share: number) => string;
  /** Normalize each row to 100%. Otherwise rows share one scale. */
  normalize?: boolean;
  ariaLabel: string;
  barHeight?: number;
}

const LABEL_W = 72;
const GAP = 2;

/** Horizontal stacked bars with 2px surface gaps between segments. */
export function StackedBar({ rows, format, normalize = true, ariaLabel, barHeight = 24 }: Props) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<{ row: number; seg: number } | null>(null);
  const hasLabels = rows.length > 1 || rows.some((r) => r.label);
  const plotX = hasLabels ? LABEL_W : 0;
  const plotW = Math.max(40, width - plotX);
  const rowH = barHeight + 14;
  const height = rows.length * rowH;
  const maxTotal = Math.max(
    1e-9,
    ...rows.map((r) => r.segments.reduce((s, x) => s + Math.max(0, x.value), 0)),
  );

  return (
    <div className="chart-plot" ref={ref}>
      <svg width={width} height={height} role="img" aria-label={ariaLabel}>
        {rows.map((row, ri) => {
          const total = row.segments.reduce((s, x) => s + Math.max(0, x.value), 0);
          const scale = normalize ? (total > 0 ? plotW / total : 0) : plotW / maxTotal;
          let cursor = plotX;
          const y = ri * rowH + 4;
          return (
            <g key={ri}>
              {hasLabels && (
                <text className="row-label" x={0} y={y + barHeight / 2} dy="0.32em">
                  {row.label}
                </text>
              )}
              {row.segments.map((s, si) => {
                const w = Math.max(0, s.value) * scale;
                const x = cursor;
                cursor += w;
                if (w <= 0) return null;
                const drawn = Math.max(0.5, w - (si < row.segments.length - 1 ? GAP : 0));
                const share = total > 0 ? s.value / total : 0;
                const text = format(s.value, share);
                const fits = drawn > text.length * 7 + 12;
                const active = hover?.row === ri && hover.seg === si;
                return (
                  <g
                    key={s.id}
                    tabIndex={0}
                    aria-label={`${row.label ? `${row.label}, ` : ''}${s.label}: ${text}`}
                    onPointerEnter={() => setHover({ row: ri, seg: si })}
                    onPointerLeave={() => setHover(null)}
                    onFocus={() => setHover({ row: ri, seg: si })}
                    onBlur={() => setHover(null)}
                  >
                    <rect
                      x={x}
                      y={y}
                      width={drawn}
                      height={barHeight}
                      rx={si === 0 || si === row.segments.length - 1 ? 3 : 0}
                      fill={s.color}
                      opacity={hover && !active ? 0.6 : 1}
                    />
                    {fits && (
                      <text className="seg-label" x={x + 8} y={y + barHeight / 2} dy="0.32em">
                        {text}
                      </text>
                    )}
                  </g>
                );
              })}
            </g>
          );
        })}
      </svg>
      {hover && rows[hover.row]?.segments[hover.seg] && (
        <div
          className="tooltip"
          style={{ left: Math.min(width - 200, plotX + 8), top: hover.row * rowH + barHeight + 10 }}
        >
          {(() => {
            const row = rows[hover.row]!;
            const s = row.segments[hover.seg]!;
            const total = row.segments.reduce((t, x) => t + Math.max(0, x.value), 0);
            return (
              <>
                <div className="tooltip-title">
                  {row.label ? `${row.label} · ${s.label}` : s.label}
                </div>
                <div className="tooltip-row">
                  <span className="tooltip-key rect" style={{ background: s.color }} />
                  <span className="tooltip-value">
                    {format(s.value, total > 0 ? s.value / total : 0)}
                  </span>
                </div>
              </>
            );
          })()}
        </div>
      )}
    </div>
  );
}
