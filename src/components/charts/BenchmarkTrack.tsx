import type { Band } from '../../engine';
import { useWidth } from './useWidth';

interface Props {
  value: number | null;
  bands: Band[];
  domain: [number, number];
  format: (v: number) => string;
  markers?: Array<{ value: number; label: string }>;
}

/** Keep labels at least this far apart (px); drop the ones that would collide. */
const MIN_LABEL_GAP = 34;

/**
 * A compact scale for one metric: band edges as ticks on a neutral track and the
 * company's value as a dot. Color stays neutral; the grade is carried by the
 * badge beside it (icon + label), never by the track alone.
 */
export function BenchmarkTrack({ value, bands, domain, format, markers }: Props) {
  const [ref, width] = useWidth<HTMLDivElement>(180);
  const [lo, hi] = domain;
  const pos = (v: number) => Math.max(0, Math.min(1, (v - lo) / (hi - lo)));
  const edges = [
    ...new Set(
      bands.flatMap((b) => [b.min, b.max]).filter((v) => Number.isFinite(v) && v > lo && v < hi),
    ),
  ].sort((a, b) => a - b);
  const labeled: number[] = [];
  for (const e of edges) {
    const last = labeled[labeled.length - 1];
    if (last == null || (pos(e) - pos(last)) * width >= MIN_LABEL_GAP) labeled.push(e);
  }
  const clipped = value != null && (value < lo || value > hi);
  const v = value == null || Number.isNaN(value) ? null : value;

  return (
    <div className="track" aria-hidden="true" ref={ref}>
      <div className="track-bar">
        {edges.map((e) => (
          <span key={e} className="track-edge" style={{ left: `${pos(e) * 100}%` }} />
        ))}
        {markers?.map((m) => (
          <span
            key={m.label}
            className="track-marker"
            style={{ left: `${pos(m.value) * 100}%` }}
            title={`${m.label}: ${format(m.value)}`}
          />
        ))}
        {v != null && (
          <span
            className={`track-dot ${clipped ? 'clipped' : ''}`}
            style={{ left: `${pos(v) * 100}%` }}
          />
        )}
      </div>
      <div className="track-labels">
        {labeled.map((e) => (
          <span key={e} style={{ left: `${pos(e) * 100}%` }}>
            {format(e)}
          </span>
        ))}
      </div>
    </div>
  );
}
