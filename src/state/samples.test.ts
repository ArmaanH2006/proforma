import { describe, expect, it } from 'vitest';
import {
  buildHistory,
  computeMetrics,
  holderStakes,
  runWaterfall,
  simulateFund,
  waterfallClasses,
} from '../engine';
import { FUND_HOLDER_ID, dealEventIndex, formationCapTable } from './deal';
import { dealFromHash, parseDeal, serializeDeal, shareHash } from './persistence';
import { SAMPLES, blankDeal } from './samples';

const all = [
  ...SAMPLES.map((s) => ({ label: s.label, make: s.make })),
  { label: 'Blank', make: blankDeal },
];

describe.each(all)('$label sample', ({ make }) => {
  const deal = make();
  const history = buildHistory(formationCapTable(deal), deal.events);

  it('runs every financing event without errors', () => {
    for (const snap of history) expect(snap.issues.filter((i) => i.level === 'error')).toEqual([]);
  });

  it('gives our fund a position in the deal event', () => {
    const snap = history[dealEventIndex(deal) + 1]!;
    expect(holderStakes(snap.capTable).get(FUND_HOLDER_ID)?.percent ?? 0).toBeGreaterThan(0);
  });

  it('pays out an exit and simulates the fund', () => {
    const last = history[history.length - 1]!;
    const result = runWaterfall(waterfallClasses(last.capTable), 100e6);
    expect(result.classes.reduce((s, c) => s + c.total, 0)).toBeCloseTo(100e6, 0);
    const sim = simulateFund({ ...deal.fund, simulations: 200 });
    expect(sim.runs).toBe(200);
    expect(computeMetrics(deal.metrics).length).toBeGreaterThan(5);
  });

  it('survives a JSON and share-link round trip', () => {
    expect(parseDeal(serializeDeal(deal))).toEqual(deal);
    expect(dealFromHash(shareHash(deal))).toEqual(deal);
  });
});

describe('parseDeal', () => {
  it('rejects files that are not deals', () => {
    expect(() => parseDeal('not json')).toThrow(/not valid JSON/);
    expect(() => parseDeal('{"hello": 1}')).toThrow(/not a Proforma deal/);
  });

  it('fills sections missing from older files', () => {
    const deal = blankDeal();
    const partial = JSON.parse(serializeDeal(deal));
    delete partial.memo;
    delete partial.fund;
    const parsed = parseDeal(JSON.stringify(partial));
    expect(parsed.memo.recommendation).toBeDefined();
    expect(parsed.fund.fundSize).toBeGreaterThan(0);
  });
});
