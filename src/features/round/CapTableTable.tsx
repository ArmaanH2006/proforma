import { useMemo } from 'react';
import { capTableView, type CapTable, type CapTableRow } from '../../engine';
import { pct, shares } from '../../lib/format';
import { FUND_HOLDER_ID, holderName, type Deal } from '../../state/deal';

type Section = 'Common' | 'Preferred' | 'Option pool' | 'SAFEs and notes';

interface Merged {
  key: string;
  section: Section;
  label: string;
  className: string;
  holderId: string | null;
  before: CapTableRow | null;
  after: CapTableRow | null;
  order: number;
}

function sectionOf(row: CapTableRow, cap: CapTable): Section {
  if (row.kind === 'options' || row.kind === 'pool') return 'Option pool';
  if (row.kind === 'convertible') return 'SAFEs and notes';
  const cls = cap.classes.find((c) => c.id === row.classId);
  return cls?.kind === 'preferred' ? 'Preferred' : 'Common';
}

const SECTIONS: Section[] = ['Common', 'Preferred', 'Option pool', 'SAFEs and notes'];

export function CapTableTable({
  before,
  after,
  deal,
}: {
  before: CapTable | null;
  after: CapTable;
  deal: Pick<Deal, 'holders'>;
}) {
  const data = useMemo(() => {
    const a = capTableView(after);
    const b = before ? capTableView(before) : null;
    const classOrder = new Map(after.classes.map((c, i) => [c.id, i]));
    const merged = new Map<string, Merged>();
    const add = (row: CapTableRow, cap: CapTable, which: 'before' | 'after') => {
      const existing = merged.get(row.key);
      const label =
        row.kind === 'options'
          ? 'Granted options'
          : row.kind === 'pool'
            ? 'Unissued pool'
            : holderName(deal, row.holderId);
      const entry: Merged = existing ?? {
        key: row.key,
        section: sectionOf(row, cap),
        label,
        className: row.className,
        holderId: row.holderId,
        before: null,
        after: null,
        order: (row.classId ? (classOrder.get(row.classId) ?? 99) : 100) * 1000 + merged.size,
      };
      entry[which] = row;
      merged.set(row.key, entry);
    };
    a.rows.forEach((r) => add(r, after, 'after'));
    b?.rows.forEach((r) => add(r, before!, 'before'));
    const rows = [...merged.values()].filter(
      (r) => (r.after?.shares ?? 0) > 0 || (r.before?.shares ?? 0) > 0 || r.after?.unpriced,
    );
    rows.sort(
      (x, y) => SECTIONS.indexOf(x.section) - SECTIONS.indexOf(y.section) || x.order - y.order,
    );
    const withHeaders = rows.map((r, i) => ({
      ...r,
      header: i === 0 || rows[i - 1]!.section !== r.section,
    }));
    return { rows: withHeaders, a, b };
  }, [before, after, deal]);

  const compare = before != null;

  return (
    <div className="table-wrap">
      <table className="data">
        <thead>
          <tr>
            <th>Holder</th>
            <th>Class</th>
            {compare && <th className="r">Before</th>}
            <th className="r">{compare ? 'After' : 'Shares'}</th>
            {compare && <th className="r">FD before</th>}
            <th className="r">{compare ? 'FD after' : 'Fully diluted'}</th>
            {compare && <th className="r">Change</th>}
          </tr>
        </thead>
        <tbody>
          {data.rows.map((r) => {
            const header = r.header;
            const implied = r.section === 'SAFEs and notes';
            // A SAFE that converted in this event now appears as preferred shares above.
            const converted = implied && r.before != null && r.after == null;
            const delta = converted ? 0 : (r.after?.percent ?? 0) - (r.before?.percent ?? 0);
            return [
              header && (
                <tr key={`${r.section}-h`} className="section">
                  <td colSpan={compare ? 7 : 4}>
                    {r.section}
                    {implied && <span className="muted"> · as converted at cap</span>}
                  </td>
                </tr>
              ),
              <tr key={r.key} className={r.holderId === FUND_HOLDER_ID ? 'us' : undefined}>
                <td>{r.label}</td>
                <td className="muted">{r.className}</td>
                {compare && <td className="r">{fmtShares(r.before)}</td>}
                <td className="r">
                  {converted ? <span className="muted">Converted</span> : fmtShares(r.after)}
                </td>
                {compare && <td className="r">{r.before ? pct(r.before.percent) : '—'}</td>}
                <td className="r">
                  {converted ? (
                    <span className="muted">—</span>
                  ) : r.after ? (
                    r.after.unpriced ? (
                      'Unpriced'
                    ) : (
                      pct(r.after.percent)
                    )
                  ) : (
                    '—'
                  )}
                </td>
                {compare && (
                  <td
                    className={`r ${delta > 1e-6 ? 'delta-up' : delta < -1e-6 ? 'delta-down' : 'muted'}`}
                  >
                    {Math.abs(delta) < 1e-6
                      ? '—'
                      : `${delta > 0 ? '+' : '−'}${Math.abs(delta * 100).toFixed(2)} pts`}
                  </td>
                )}
              </tr>,
            ];
          })}
          <tr className="total">
            <td>Fully diluted</td>
            <td />
            {compare && <td className="r">{shares(data.b?.asConverted)}</td>}
            <td className="r">{shares(data.a.asConverted)}</td>
            {compare && <td className="r">100%</td>}
            <td className="r">100%</td>
            {compare && <td />}
          </tr>
        </tbody>
      </table>
    </div>
  );
}

function fmtShares(row: CapTableRow | null): string {
  if (!row) return '—';
  if (row.unpriced) return 'Unpriced';
  return row.kind === 'convertible' ? `≈ ${shares(row.shares)}` : shares(row.shares);
}
