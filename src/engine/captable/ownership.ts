/** Ownership views over a cap table: rows for display and per-holder totals. */
import { sum } from '../util/math';
import { conversionAmount, fullyDiluted, impliedConversionAtCaps } from './financing';
import type { CapTable } from './types';

export type RowKind = 'shares' | 'options' | 'pool' | 'convertible';

export interface CapTableRow {
  /** Stable key so rows can be matched across snapshots. */
  key: string;
  kind: RowKind;
  holderId: string | null;
  classId: string | null;
  className: string;
  shares: number;
  /** Share of fully diluted, counting outstanding SAFEs and notes as converted at their caps. */
  percent: number;
  invested: number;
  /** Convertibles only: true when the instrument has no cap and cannot be priced yet. */
  unpriced?: boolean;
}

export interface CapTableView {
  rows: CapTableRow[];
  /** Fully diluted shares outstanding (no SAFE or note conversions). */
  fullyDiluted: number;
  /** Fully diluted including capped SAFEs and notes converted at their caps. */
  asConverted: number;
}

export function capTableView(cap: CapTable): CapTableView {
  const fd = fullyDiluted(cap);
  const implied = impliedConversionAtCaps(cap);
  const total = cap.convertibles.length ? implied.totalShares : fd;
  const classById = new Map(cap.classes.map((c) => [c.id, c]));

  const merged = new Map<string, CapTableRow>();
  for (const p of cap.positions) {
    const key = `${p.holderId}:${p.classId}`;
    const existing = merged.get(key);
    if (existing) {
      existing.shares += p.shares;
      existing.invested += p.invested;
    } else {
      merged.set(key, {
        key,
        kind: 'shares',
        holderId: p.holderId,
        classId: p.classId,
        className: classById.get(p.classId)?.name ?? p.classId,
        shares: p.shares,
        percent: 0,
        invested: p.invested,
      });
    }
  }
  const rows: CapTableRow[] = [...merged.values()];
  rows.push({
    key: 'options',
    kind: 'options',
    holderId: null,
    classId: null,
    className: 'Options',
    shares: cap.pool.granted,
    percent: 0,
    invested: 0,
  });
  rows.push({
    key: 'pool',
    kind: 'pool',
    holderId: null,
    classId: null,
    className: 'Unissued pool',
    shares: cap.pool.unissued,
    percent: 0,
    invested: 0,
  });
  for (const c of cap.convertibles) {
    const imp = implied.instruments.find((i) => i.instrumentId === c.id);
    rows.push({
      key: `convertible:${c.id}`,
      kind: 'convertible',
      holderId: c.holderId,
      classId: null,
      className:
        c.type === 'note'
          ? 'Convertible note'
          : c.type === 'post-safe'
            ? 'Post-money SAFE'
            : 'Pre-money SAFE',
      shares: imp?.shares ?? 0,
      percent: 0,
      invested: c.amount,
      unpriced: imp?.shares == null,
    });
  }
  for (const r of rows) r.percent = total > 0 ? r.shares / total : 0;
  return { rows, fullyDiluted: fd, asConverted: total };
}

export interface HolderStake {
  holderId: string;
  shares: number;
  percent: number;
  invested: number;
}

/** Per-holder totals, counting capped SAFEs and notes as converted at their caps. */
export function holderStakes(cap: CapTable): Map<string, HolderStake> {
  const view = capTableView(cap);
  const out = new Map<string, HolderStake>();
  for (const r of view.rows) {
    if (!r.holderId) continue;
    const s = out.get(r.holderId) ?? { holderId: r.holderId, shares: 0, percent: 0, invested: 0 };
    s.shares += r.shares;
    s.invested += r.invested;
    out.set(r.holderId, s);
  }
  for (const s of out.values()) s.percent = view.asConverted > 0 ? s.shares / view.asConverted : 0;
  return out;
}

/** Total cash a holder has put in, including SAFEs and notes not yet converted. */
export function holderInvested(cap: CapTable, holderId: string): number {
  return (
    sum(cap.positions.filter((p) => p.holderId === holderId).map((p) => p.invested)) +
    sum(cap.convertibles.filter((c) => c.holderId === holderId).map((c) => c.amount))
  );
}

/** Convenience: note value at conversion, re-exported for the UI. */
export { conversionAmount };
