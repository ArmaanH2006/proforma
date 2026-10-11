import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  applyConvertibles,
  applyPricedRound,
  buildHistory,
  conversionAmount,
  fullyDiluted,
  impliedConversionAtCaps,
  proRataAmount,
  type PricedRoundReport,
} from './financing';
import { capTableView, holderStakes } from './ownership';
import type { CapTable, Convertible, PricedRoundEvent } from './types';

const common = {
  id: 'common',
  name: 'Common',
  kind: 'common' as const,
  issuePrice: 0,
  prefMultiple: 0,
  participation: 'none' as const,
  participationCap: 0,
  seniority: 0,
};

function startTable(founderShares: number, granted: number, unissued: number): CapTable {
  return {
    classes: [common],
    positions: [{ holderId: 'founders', classId: 'common', shares: founderShares, invested: 0 }],
    pool: { granted, avgStrike: 0, unissued },
    convertibles: [],
  };
}

function round(overrides: Partial<PricedRoundEvent> = {}): PricedRoundEvent {
  return {
    id: 'A',
    kind: 'priced',
    label: 'Series A',
    preMoney: 15_000_000,
    investments: [],
    pool: { mode: 'none' },
    terms: { prefMultiple: 1, participation: 'none', participationCap: 0, seniority: 'senior' },
    ...overrides,
  };
}

function priced(result: ReturnType<typeof applyPricedRound>): PricedRoundReport {
  expect(result.issues.filter((i) => i.level === 'error')).toEqual([]);
  if (result.report.kind !== 'priced') throw new Error('expected a priced report');
  return result.report;
}

function sharesOf(cap: CapTable, holderId: string): number {
  return cap.positions.filter((p) => p.holderId === holderId).reduce((s, p) => s + p.shares, 0);
}

/**
 * Y Combinator, "Post-Money Safe User Guide" (2023), Appendix II, Example 1:
 * two post-money SAFEs convert in a $5M Series A at a $15M pre-money with a
 * 1,695,000-share pool increase. Every share count below is from the guide.
 */
describe('Y Combinator post-money SAFE example 1', () => {
  const safes: Convertible[] = [
    { id: 'a', holderId: 'investorA', type: 'post-safe', amount: 200_000, cap: 4_000_000 },
    { id: 'b', holderId: 'investorB', type: 'post-safe', amount: 800_000, cap: 8_000_000 },
  ];
  // 9,250,000 founder shares + 650,000 outstanding and promised options + 100,000 unissued.
  const start = startTable(9_250_000, 650_000, 100_000);
  const withSafes = applyConvertibles(start, {
    id: 'safes',
    kind: 'convertibles',
    label: 'SAFEs',
    instruments: safes,
  }).capTable;

  const result = applyPricedRound(
    withSafes,
    round({
      investments: [
        { holderId: 'investorC', amount: 4_000_000 },
        { holderId: 'investorB', amount: 499_998.97 }, // B's 10% pro rata
        // The guide sizes the round at 4,486,719 shares and gives the remainder to other
        // investors. Here every investor buys whole shares with its own check, so the
        // other investors' check is the cost of their 448,673 shares at $1.1144.
        { holderId: 'others', amount: 500_001.2 },
      ],
      pool: { mode: 'shares', shares: 1_695_000 },
    }),
  );
  const report = priced(result);
  const cap = result.capTable;

  it('converts each SAFE at cap / company capitalization', () => {
    const [a, b] = report.conversions;
    expect(a!.shares).toBe(588_235);
    expect(b!.shares).toBe(1_176_470);
    expect(a!.price).toBeCloseTo(0.34, 6);
    expect(b!.price).toBeCloseTo(0.68, 6);
    expect(a!.basis).toBe('cap');
  });

  it('prices the Series A at $1.1144', () => {
    expect(report.pricePerShare).toBe(1.1144);
    expect(report.preMoneyShares).toBe(13_459_705);
  });

  it('issues the new money shares from the guide', () => {
    const byHolder = Object.fromEntries(report.investments.map((i) => [i.holderId, i.shares]));
    expect(byHolder.investorC).toBe(3_589_375);
    expect(byHolder.investorB).toBe(448_671);
    expect(byHolder.others).toBe(448_673);
  });

  it('matches the post-Series A cap table', () => {
    expect(fullyDiluted(cap)).toBe(17_946_424);
    expect(sharesOf(cap, 'investorB')).toBe(1_625_141);
    expect(cap.pool.unissued).toBe(1_795_000);
    const stakes = holderStakes(cap);
    expect(stakes.get('founders')!.percent).toBeCloseTo(0.5154, 4);
    expect(stakes.get('investorA')!.percent).toBeCloseTo(0.0328, 4);
    expect(stakes.get('investorB')!.percent).toBeCloseTo(0.0906, 4);
    expect(stakes.get('investorC')!.percent).toBeCloseTo(0.2, 4);
  });

  it('puts each SAFE in its own shadow series priced at its conversion price', () => {
    const shadow = cap.classes.filter((c) => c.eventId === 'A' && c.id !== 'A');
    expect(shadow.map((c) => c.name)).toEqual(['Series A-1', 'Series A-2']);
    expect(shadow[0]!.issuePrice).toBeCloseTo(0.34, 6);
    expect(cap.convertibles).toEqual([]);
  });

  it('explains the pre-money: existing holders + SAFE shares + pool increase', () => {
    const parts = report.effectivePreMoney + report.conversionValue + report.poolIncreaseValue;
    expect(parts).toBeCloseTo(report.preMoneyAsPriced, 2);
    expect(report.effectivePreMoney).toBeCloseTo(11_144_000, 0);
  });

  it("sizes investor B's pro rata at 10% of the round", () => {
    expect(proRataAmount(withSafes, 'investorB', 5_000_000)).toBeCloseTo(500_000, 0);
  });
});

/**
 * Same guide, Example 2: a pre-money SAFE ($200K at a $3.8M pre-money cap) next to a
 * post-money SAFE. The guide rounds the pre-money Safe Price to $0.3248 before dividing;
 * this engine keeps full precision, so share counts differ by a few dozen shares and
 * the published percentages match to two decimals.
 */
describe('Y Combinator example 2 (pre-money and post-money SAFEs)', () => {
  const start = startTable(9_250_000, 650_000, 100_000);
  const withSafes = applyConvertibles(start, {
    id: 'safes',
    kind: 'convertibles',
    label: 'SAFEs',
    instruments: [
      { id: 'a', holderId: 'investorA', type: 'pre-safe', amount: 200_000, cap: 3_800_000 },
      { id: 'b', holderId: 'investorB', type: 'post-safe', amount: 800_000, cap: 8_000_000 },
    ],
  }).capTable;
  const result = applyPricedRound(
    withSafes,
    round({
      investments: [
        { holderId: 'investorC', amount: 4_000_000 },
        { holderId: 'investorB', amount: 500_000 },
        { holderId: 'others', amount: 500_000 },
      ],
      pool: { mode: 'shares', shares: 1_700_000 },
    }),
  );
  const report = priced(result);

  it('prices the round at $1.1115', () => {
    expect(report.pricePerShare).toBe(1.1115);
  });

  it('includes the pool increase in the pre-money SAFE capitalization', () => {
    expect(report.conversions[0]!.price).toBeCloseTo(3_800_000 / 11_700_000, 9);
    expect(Math.abs(report.conversions[0]!.shares - 615_763)).toBeLessThan(40);
  });

  it('matches the published ownership percentages', () => {
    const stakes = holderStakes(result.capTable);
    expect(stakes.get('founders')!.percent).toBeCloseTo(0.514, 3);
    expect(stakes.get('investorA')!.percent).toBeCloseTo(0.0342, 4);
    expect(stakes.get('investorB')!.percent).toBeCloseTo(0.0906, 3);
    expect(stakes.get('investorC')!.percent).toBeCloseTo(0.2, 4);
    expect(result.capTable.pool.unissued / fullyDiluted(result.capTable)).toBeCloseTo(0.1, 3);
  });
});

describe('option pool shuffle', () => {
  it('solves the pool increase for a post-money target', () => {
    const withSafes = applyConvertibles(startTable(9_250_000, 650_000, 100_000), {
      id: 's',
      kind: 'convertibles',
      label: 'SAFEs',
      instruments: [
        { id: 'a', holderId: 'investorA', type: 'post-safe', amount: 200_000, cap: 4_000_000 },
        { id: 'b', holderId: 'investorB', type: 'post-safe', amount: 800_000, cap: 8_000_000 },
      ],
    }).capTable;
    const report = priced(
      applyPricedRound(
        withSafes,
        round({
          investments: [{ holderId: 'investorC', amount: 5_000_000 }],
          pool: { mode: 'target', percentPost: 0.1 },
        }),
      ),
    );
    // Closed form: X = (p*Post*k/m - U0) / (1 - p*Post*h/m) = 1,694,570.1 -> rounded up.
    expect(report.poolIncrease).toBe(1_694_571);
    expect(report.poolPostPercent).toBeGreaterThan(0.09999);
    expect(report.poolPostPercent).toBeLessThan(0.10001);
  });

  it('lowers the effective pre-money by the value of the pool increase', () => {
    const start = startTable(10_000_000, 0, 0);
    const report = priced(
      applyPricedRound(
        start,
        round({
          preMoney: 8_000_000,
          investments: [{ holderId: 'vc', amount: 2_000_000 }],
          pool: { mode: 'target', percentPost: 0.15 },
          pricePrecision: 8,
        }),
      ),
    );
    // Post = $10M, so a 15% pool is worth $1.5M of the $8M pre-money.
    expect(report.poolIncreaseValue).toBeCloseTo(1_500_000, -1);
    expect(report.effectivePreMoney).toBeCloseTo(6_500_000, -1);
  });

  it('refuses a target the pre-money cannot absorb', () => {
    const result = applyPricedRound(
      startTable(10_000_000, 0, 0),
      round({
        preMoney: 5_000_000,
        investments: [{ holderId: 'vc', amount: 5_000_000 }],
        pool: { mode: 'target', percentPost: 0.6 },
      }),
    );
    expect(result.issues.some((i) => i.level === 'error')).toBe(true);
  });
});

describe('discounts, notes, and plain rounds', () => {
  it('prices a plain round at pre-money / fully diluted shares', () => {
    const report = priced(
      applyPricedRound(
        startTable(8_000_000, 500_000, 1_500_000),
        round({ preMoney: 20_000_000, investments: [{ holderId: 'vc', amount: 5_000_000 }] }),
      ),
    );
    expect(report.pricePerShare).toBe(2);
    expect(report.investments[0]!.shares).toBe(2_500_000);
    expect(report.investments[0]!.shares / report.postMoneyShares).toBeCloseTo(0.2, 6);
  });

  it('converts a discount-only SAFE at the discounted round price', () => {
    const cap = applyConvertibles(startTable(10_000_000, 0, 0), {
      id: 's',
      kind: 'convertibles',
      label: 'SAFE',
      instruments: [
        { id: 'd', holderId: 'angel', type: 'post-safe', amount: 1_000_000, discount: 0.2 },
      ],
    }).capTable;
    const report = priced(
      applyPricedRound(
        cap,
        round({ preMoney: 20_000_000, investments: [{ holderId: 'vc', amount: 5_000_000 }] }),
      ),
    );
    // P = (M - a/(1-d)) / S0 = (20M - 1.25M) / 10M
    expect(report.pricePerShare).toBe(1.875);
    expect(report.conversions[0]!.basis).toBe('discount');
    expect(report.conversions[0]!.price).toBeCloseTo(1.5, 9);
    expect(report.conversions[0]!.shares).toBe(666_666);
  });

  it('uses the cap when it beats the discount, and the discount when it does not', () => {
    const safe: Convertible = {
      id: 's',
      holderId: 'angel',
      type: 'post-safe',
      amount: 1_000_000,
      cap: 10_000_000,
      discount: 0.2,
    };
    const cap = applyConvertibles(startTable(9_000_000, 0, 0), {
      id: 'e',
      kind: 'convertibles',
      label: 'SAFE',
      instruments: [safe],
    }).capTable;

    const high = priced(applyPricedRound(cap, round({ preMoney: 30_000_000 })));
    expect(high.conversions[0]!.basis).toBe('cap');
    expect(high.conversions[0]!.shares).toBe(1_000_000);
    expect(high.pricePerShare).toBe(3);

    const low = priced(applyPricedRound(cap, round({ preMoney: 8_000_000 })));
    expect(low.conversions[0]!.basis).toBe('discount');
    expect(low.pricePerShare).toBe(0.75);
    expect(low.conversions[0]!.price).toBeCloseTo(0.6, 9);
  });

  it('accrues simple interest on notes and converts at the pre-money cap', () => {
    const note: Convertible = {
      id: 'n',
      holderId: 'lender',
      type: 'note',
      amount: 500_000,
      cap: 6_000_000,
      discount: 0.2,
      interestRate: 0.08,
      termMonths: 18,
    };
    expect(conversionAmount(note)).toBeCloseTo(560_000, 6);
    const cap = applyConvertibles(startTable(9_000_000, 0, 1_000_000), {
      id: 'e',
      kind: 'convertibles',
      label: 'Note',
      instruments: [note],
    }).capTable;
    const report = priced(
      applyPricedRound(
        cap,
        round({ preMoney: 12_000_000, investments: [{ holderId: 'vc', amount: 3_000_000 }] }),
      ),
    );
    expect(report.conversions[0]!.basis).toBe('cap');
    expect(report.conversions[0]!.price).toBeCloseTo(0.6, 9);
    expect(report.conversions[0]!.shares).toBe(933_333);
    expect(report.pricePerShare).toBe(1.0976);
    // Cost basis stays the principal, not principal plus interest.
    const position = report.conversions[0]!;
    expect(position.amount).toBe(500_000);
  });

  it('rejects post-money SAFEs that claim the whole company', () => {
    const cap: CapTable = {
      ...startTable(1_000_000, 0, 0),
      convertibles: [
        { id: 'x', holderId: 'a', type: 'post-safe', amount: 3_000_000, cap: 5_000_000 },
        { id: 'y', holderId: 'b', type: 'post-safe', amount: 2_500_000, cap: 5_000_000 },
      ],
    };
    const result = applyPricedRound(cap, round());
    const error = result.issues.find((i) => i.level === 'error');
    expect(error?.message).toMatch(/100% or more/);
    expect(result.capTable).toBe(cap);
  });
});

describe('implied ownership before a priced round', () => {
  it('gives a post-money SAFE exactly amount / cap', () => {
    const cap = applyConvertibles(startTable(9_000_000, 400_000, 600_000), {
      id: 's',
      kind: 'convertibles',
      label: 'Pre-seed',
      instruments: [
        { id: 'a', holderId: 'fund', type: 'post-safe', amount: 25_000, cap: 15_000_000 },
        { id: 'b', holderId: 'lead', type: 'post-safe', amount: 1_475_000, cap: 15_000_000 },
        { id: 'c', holderId: 'mfn', type: 'post-safe', amount: 100_000 },
      ],
    }).capTable;
    const implied = impliedConversionAtCaps(cap);
    expect(implied.instruments[0]!.percent).toBeCloseTo(25_000 / 15_000_000, 12);
    expect(implied.instruments[1]!.percent).toBeCloseTo(1_475_000 / 15_000_000, 12);
    expect(implied.instruments[2]!.shares).toBeNull();
    const view = capTableView(cap);
    const total = view.rows.reduce((s, r) => s + r.percent, 0);
    expect(total).toBeCloseTo(1, 9);
  });
});

describe('multi-round history', () => {
  it('chains SAFEs, a seed, and a senior Series A', () => {
    const snapshots = buildHistory(startTable(8_600_000, 600_000, 800_000), [
      {
        id: 'pre',
        kind: 'convertibles',
        label: 'Pre-seed',
        instruments: [
          { id: 's1', holderId: 'angels', type: 'post-safe', amount: 500_000, cap: 8_000_000 },
          { id: 's2', holderId: 'fund', type: 'post-safe', amount: 1_000_000, cap: 12_000_000 },
        ],
      },
      round({
        id: 'seed',
        label: 'Seed',
        preMoney: 16_000_000,
        investments: [{ holderId: 'lead', amount: 4_000_000 }],
        pool: { mode: 'target', percentPost: 0.1 },
        terms: { prefMultiple: 1, participation: 'none', participationCap: 0, seniority: 'pari' },
      }),
      round({
        id: 'a',
        label: 'Series A',
        preMoney: 60_000_000,
        investments: [{ holderId: 'growth', amount: 15_000_000 }],
        pool: { mode: 'target', percentPost: 0.1 },
      }),
    ]);
    expect(snapshots).toHaveLength(4);
    expect(snapshots.every((s) => s.issues.every((i) => i.level !== 'error'))).toBe(true);
    const finalCap = snapshots[3]!.capTable;
    const seed = finalCap.classes.find((c) => c.id === 'seed')!;
    const seriesA = finalCap.classes.find((c) => c.id === 'a')!;
    expect(seed.seniority).toBe(1);
    expect(seriesA.seniority).toBe(2);
    const report = snapshots[3]!.report as PricedRoundReport;
    expect(fullyDiluted(finalCap)).toBe(report.postMoneyShares);
    expect(report.investments[0]!.shares / report.postMoneyShares).toBeCloseTo(0.2, 4);
  });
});

describe('properties', () => {
  const safeArb = fc.record({
    amount: fc.integer({ min: 25_000, max: 2_000_000 }),
    cap: fc.integer({ min: 4_000_000, max: 40_000_000 }),
  });

  it('post-money SAFEs own amount/cap of company capitalization; investors own I/(M+I)', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1_000_000, max: 20_000_000 }),
        fc.array(safeArb, { minLength: 0, maxLength: 5 }),
        fc.integer({ min: 2_000_000, max: 100_000_000 }),
        fc.integer({ min: 250_000, max: 30_000_000 }),
        fc.option(fc.double({ min: 0.02, max: 0.2, noNaN: true }), { nil: null }),
        (founders, safes, preMoney, newMoney, poolTarget) => {
          const totalShare = safes.reduce((s, x) => s + x.amount / x.cap, 0);
          fc.pre(totalShare < 0.6);
          const cap: CapTable = {
            ...startTable(founders, 0, Math.round(founders * 0.05)),
            convertibles: safes.map((s, i) => ({
              id: `s${i}`,
              holderId: `h${i}`,
              type: 'post-safe' as const,
              amount: s.amount,
              cap: s.cap,
            })),
          };
          const result = applyPricedRound(
            cap,
            round({
              preMoney,
              investments: [{ holderId: 'new', amount: newMoney }],
              pool:
                poolTarget == null ? { mode: 'none' } : { mode: 'target', percentPost: poolTarget },
              pricePrecision: 10,
            }),
          );
          if (result.issues.some((i) => i.level === 'error')) return; // infeasible pool targets are reported
          const report = result.report as PricedRoundReport;
          const companyCap = report.preMoneyShares - report.poolIncrease;
          for (const [i, s] of safes.entries()) {
            const conv = report.conversions[i]!;
            expect(Math.abs(conv.shares / companyCap - s.amount / s.cap)).toBeLessThan(
              3 / companyCap,
            );
          }
          const invested = report.investments[0]!;
          expect(invested.shares / report.postMoneyShares).toBeCloseTo(
            newMoney / (preMoney + newMoney),
            4,
          );
          expect(fullyDiluted(result.capTable)).toBe(report.postMoneyShares);
          if (poolTarget != null) expect(report.poolPostPercent).toBeGreaterThan(poolTarget - 1e-4);
        },
      ),
      { numRuns: 300 },
    );
  });
});
