import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import type { CapTable, Participation } from '../captable/types';
import {
  findBreakpoints,
  holderPayouts,
  payoutCurve,
  payoutsFor,
  runWaterfall,
  solveConversions,
  waterfallClasses,
  type WaterfallClass,
} from './waterfall';

const M = 1_000_000;

function common(shares: number): WaterfallClass {
  return {
    id: 'common',
    name: 'Common',
    kind: 'common',
    shares,
    preference: 0,
    participation: 'full',
    capTotal: 0,
    seniority: 0,
    strike: 0,
    canConvert: false,
    holdings: [{ holderId: 'founders', shares, invested: 0 }],
  };
}

function preferred(
  id: string,
  shares: number,
  price: number,
  opts: { participation?: Participation; cap?: number; seniority?: number; multiple?: number } = {},
): WaterfallClass {
  const participation = opts.participation ?? 'none';
  const multiple = opts.multiple ?? 1;
  return {
    id,
    name: id,
    kind: 'preferred',
    shares,
    preference: shares * price * multiple,
    participation,
    capTotal: participation === 'capped' ? shares * price * (opts.cap ?? 3) : 0,
    seniority: opts.seniority ?? 1,
    strike: 0,
    canConvert: participation !== 'full',
    holdings: [{ holderId: id, shares, invested: shares * price }],
  };
}

function payouts(classes: WaterfallClass[], exit: number): Record<string, number> {
  const r = runWaterfall(classes, exit);
  return Object.fromEntries(r.classes.map((c) => [c.id, c.total]));
}

describe('single preferred class: $5M for 25%', () => {
  const nonParticipating = [common(7.5 * M), preferred('A', 2.5 * M, 2)];

  it('takes the preference below the conversion point', () => {
    expect(payouts(nonParticipating, 4 * M)).toEqual({ common: 0, A: 4 * M });
    const at10 = payouts(nonParticipating, 10 * M);
    expect(at10.A).toBeCloseTo(5 * M, 6);
    expect(at10.common).toBeCloseTo(5 * M, 6);
  });

  it('converts once 25% of the exit beats $5M', () => {
    const at40 = payouts(nonParticipating, 40 * M);
    expect(at40.A).toBeCloseTo(10 * M, 6);
    expect(at40.common).toBeCloseTo(30 * M, 6);
    const bp = findBreakpoints(nonParticipating, 100 * M);
    const conversion = bp.find((b) => b.description.includes('converts'));
    expect(conversion!.exit).toBeCloseTo(20 * M, -1);
  });

  it('participating preferred double dips', () => {
    const classes = [common(7.5 * M), preferred('A', 2.5 * M, 2, { participation: 'full' })];
    expect(payouts(classes, 10 * M).A).toBeCloseTo(6.25 * M, 6);
    expect(payouts(classes, 40 * M).A).toBeCloseTo(13.75 * M, 6);
    expect(solveConversions(classes, 1e9).size).toBe(0);
  });

  it('capped participation stops at 3x, then converts above $60M', () => {
    const classes = [
      common(7.5 * M),
      preferred('A', 2.5 * M, 2, { participation: 'capped', cap: 3 }),
    ];
    expect(payouts(classes, 10 * M).A).toBeCloseTo(6.25 * M, 6);
    expect(payouts(classes, 50 * M).A).toBeCloseTo(15 * M, 6);
    expect(payouts(classes, 80 * M).A).toBeCloseTo(20 * M, 6);
    const bp = findBreakpoints(classes, 100 * M);
    expect(bp.find((b) => b.description.includes('cap'))!.exit).toBeCloseTo(45 * M, -1);
    expect(bp.find((b) => b.description.includes('converts'))!.exit).toBeCloseTo(60 * M, -1);
  });

  it('a 2x preference doubles the amount ahead of common', () => {
    const classes = [common(7.5 * M), preferred('A', 2.5 * M, 2, { multiple: 2 })];
    expect(payouts(classes, 12 * M).A).toBeCloseTo(10 * M, 6);
    expect(payouts(classes, 12 * M).common).toBeCloseTo(2 * M, 6);
  });
});

describe('stacked preferences', () => {
  // Series B: $10M senior. Series A: $5M junior. 10M shares in total.
  const classes = [
    common(5.5 * M),
    preferred('A', 2.5 * M, 2, { seniority: 1 }),
    preferred('B', 2 * M, 5, { seniority: 2 }),
  ];

  it('pays the senior class first', () => {
    const at12 = payouts(classes, 12 * M);
    expect(at12.B).toBeCloseTo(10 * M, 6);
    expect(at12.A).toBeCloseTo(2 * M, 6);
    expect(at12.common).toBeCloseTo(0, 6);
  });

  it('finds each conversion point', () => {
    const bp = findBreakpoints(classes, 80 * M);
    const at = (text: string) => bp.find((b) => b.description.includes(text))!.exit;
    expect(at('covered')).toBeCloseTo(15 * M, -1);
    // A converts when (E - 10M) * 2.5/8 > 5M, i.e. E > 26M.
    expect(at('A converts')).toBeCloseTo(26 * M, -1);
    // B converts when 20% of E > 10M.
    expect(at('B converts')).toBeCloseTo(50 * M, -1);
  });

  it('shares a shortfall pro rata within a pari passu rank', () => {
    const pari = [common(7 * M), preferred('Seed', 1 * M, 2), preferred('A', 2 * M, 3)];
    const r = payouts(pari, 4 * M);
    expect(r.Seed).toBeCloseTo(1 * M, 6);
    expect(r.A).toBeCloseTo(3 * M, 6);
  });
});

describe('options and convertibles from a cap table', () => {
  const base: CapTable = {
    classes: [
      {
        id: 'common',
        name: 'Common',
        kind: 'common',
        issuePrice: 0,
        prefMultiple: 0,
        participation: 'none',
        participationCap: 0,
        seniority: 0,
      },
    ],
    positions: [{ holderId: 'founders', classId: 'common', shares: 9 * M, invested: 0 }],
    pool: { granted: 1 * M, avgStrike: 1, unissued: 500_000 },
    convertibles: [],
  };

  it('options exercise only when the common price clears the strike', () => {
    const classes = waterfallClasses(base);
    const low = runWaterfall(classes, 5 * M);
    expect(low.optionsInTheMoney).toBe(false);
    expect(low.classes.find((c) => c.id === 'common')!.total).toBeCloseTo(5 * M, 6);
    const high = runWaterfall(classes, 20 * M);
    // p = (20M + 1M strike cash) / 10M shares = $2.10; options net $1.10 each.
    expect(high.commonPrice).toBeCloseTo(2.1, 9);
    expect(high.classes.find((c) => c.id === 'options')!.total).toBeCloseTo(1.1 * M, 6);
  });

  it('ignores the unissued pool', () => {
    const classes = waterfallClasses(base);
    const total = classes.reduce((s, c) => s + c.shares, 0);
    expect(total).toBe(10 * M);
  });

  it('pays an unconverted post-money SAFE the greater of cash-out and conversion', () => {
    const cap: CapTable = {
      ...base,
      pool: { granted: 1 * M, avgStrike: 0, unissued: 0 },
      convertibles: [{ id: 's', holderId: 'angel', type: 'post-safe', amount: 1 * M, cap: 10 * M }],
    };
    const classes = waterfallClasses(cap);
    const safe = classes.find((c) => c.kind === 'safe')!;
    expect(safe.shares / (10 * M + safe.shares)).toBeCloseTo(0.1, 9);
    expect(payouts(classes, 5 * M)['convertible:s']).toBeCloseTo(1 * M, 6);
    expect(payouts(classes, 20 * M)['convertible:s']).toBeCloseTo(2 * M, 6);
    const conversion = findBreakpoints(classes, 40 * M).find((b) =>
      b.description.includes('converts'),
    );
    expect(conversion!.exit).toBeCloseTo(10 * M, -1);
  });

  it('pays notes ahead of equity', () => {
    const cap: CapTable = {
      ...base,
      convertibles: [
        {
          id: 'n',
          holderId: 'lender',
          type: 'note',
          amount: 1 * M,
          interestRate: 0.1,
          termMonths: 12,
        },
      ],
    };
    const r = payouts(waterfallClasses(cap), 1 * M);
    expect(r['convertible:n']).toBeCloseTo(1 * M, 6);
    expect(payouts(waterfallClasses(cap), 3 * M)['convertible:n']).toBeCloseTo(1.1 * M, 6);
  });

  it('splits class payouts across holders', () => {
    const classes = [
      common(6 * M),
      {
        ...preferred('Seed', 4 * M, 1),
        holdings: [
          { holderId: 'lead', shares: 3 * M, invested: 3 * M },
          { holderId: 'fund', shares: 1 * M, invested: 1 * M },
        ],
      },
    ];
    const result = runWaterfall(classes, 100 * M);
    const byHolder = new Map(holderPayouts(classes, result).map((h) => [h.holderId, h]));
    expect(byHolder.get('fund')!.payout).toBeCloseTo(10 * M, 6);
    expect(byHolder.get('lead')!.payout).toBeCloseTo(30 * M, 6);
  });
});

describe('properties', () => {
  type Pref = {
    shares: number;
    price: number;
    participation: Participation;
    cap: number;
    seniority: number;
    multiple: number;
  };
  type Structure = { common: number; prefs: Pref[]; exit: number };

  const prefArb: fc.Arbitrary<Pref> = fc.record({
    shares: fc.integer({ min: 100_000, max: 5_000_000 }),
    price: fc.double({ min: 0.1, max: 20, noNaN: true }),
    participation: fc.constantFrom<Participation>('none', 'full', 'capped'),
    cap: fc.double({ min: 1.5, max: 5, noNaN: true }),
    seniority: fc.integer({ min: 1, max: 3 }),
    multiple: fc.constantFrom(1, 1, 1, 1.5, 2),
  });
  const structureArb: fc.Arbitrary<Structure> = fc.record({
    common: fc.integer({ min: 1_000_000, max: 20_000_000 }),
    prefs: fc.array(prefArb, { minLength: 1, maxLength: 5 }),
    exit: fc.double({ min: 0, max: 500_000_000, noNaN: true }),
  });
  const build = (s: Structure): WaterfallClass[] => [
    common(s.common),
    ...s.prefs.map((p, i) =>
      preferred(`P${i}`, p.shares, p.price, {
        participation: p.participation,
        cap: p.cap,
        seniority: p.seniority,
        multiple: p.multiple,
      }),
    ),
  ];

  it('distributes exactly the proceeds', () => {
    fc.assert(
      fc.property(structureArb, (s) => {
        const r = runWaterfall(build(s), s.exit);
        const paid = r.classes.reduce((t, c) => t + c.total, 0) + r.unallocated;
        expect(paid).toBeCloseTo(s.exit, 2);
      }),
      { numRuns: 400 },
    );
  });

  it('no class can gain by switching its conversion choice alone', () => {
    fc.assert(
      fc.property(structureArb, (s) => {
        const classes = build(s);
        const converting = solveConversions(classes, s.exit);
        const base = payoutsFor(classes, s.exit, converting);
        for (const c of classes.filter((x) => x.canConvert)) {
          const flipped = new Set(converting);
          if (flipped.has(c.id)) flipped.delete(c.id);
          else flipped.add(c.id);
          const alt = payoutsFor(classes, s.exit, flipped).get(c.id)!;
          expect(alt).toBeLessThanOrEqual(base.get(c.id)! + 1e-6 * Math.max(1, s.exit));
        }
      }),
      { numRuns: 400 },
    );
  });

  it('every class payout rises with the exit value', () => {
    fc.assert(
      fc.property(structureArb, (s) => {
        const curve = payoutCurve(build(s), Math.max(1, s.exit), 60);
        for (const series of curve.series) {
          for (let i = 1; i < series.values.length; i++) {
            expect(series.values[i]!).toBeGreaterThanOrEqual(
              series.values[i - 1]! - 1e-6 * Math.max(1, s.exit),
            );
          }
        }
      }),
      { numRuns: 150 },
    );
  });
});
