import { useState, type ReactNode } from 'react';

export interface LegendItem {
  label: string;
  color: string;
  shape?: 'line' | 'rect' | 'band';
}

export function Legend({ items }: { items: LegendItem[] }) {
  if (items.length < 2) return null;
  return (
    <ul className="legend" aria-label="Legend">
      {items.map((i) => (
        <li key={i.label}>
          <span
            className={`key ${i.shape ?? 'line'}`}
            style={{ background: i.color }}
            aria-hidden="true"
          />
          {i.label}
        </li>
      ))}
    </ul>
  );
}

/**
 * Figure wrapper: title, legend, the chart, and a table view of the same data.
 * The table is the accessible twin and the place to read exact values.
 */
export function ChartFrame({
  title,
  subtitle,
  legend,
  table,
  children,
  actions,
}: {
  title: string;
  subtitle?: ReactNode;
  legend?: LegendItem[];
  table?: ReactNode;
  children: ReactNode;
  actions?: ReactNode;
}) {
  const [showTable, setShowTable] = useState(false);
  return (
    <figure className="chart">
      <figcaption className="chart-head">
        <div className="chart-title">
          <h3>{title}</h3>
          {subtitle && <p>{subtitle}</p>}
        </div>
        <div className="chart-actions">
          {actions}
          {table && (
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              aria-pressed={showTable}
              onClick={() => setShowTable((s) => !s)}
            >
              {showTable ? 'Chart' : 'Table'}
            </button>
          )}
        </div>
      </figcaption>
      {!showTable && legend && <Legend items={legend} />}
      {showTable ? <div className="table-wrap chart-table">{table}</div> : children}
    </figure>
  );
}
