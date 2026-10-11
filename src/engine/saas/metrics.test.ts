import { describe, expect, it } from 'vitest';
import { arrBand, classify, BURN_MULTIPLE_BENCHMARK, growthBenchmark } from './benchmarks';
import { computeMetrics, summarizeMetrics, type MetricId, type SaasInputs } from './metrics';
import { projectArr, t2d3Path, yearsToReach } from './projection';

const seedStage: SaasInputs = {
  arr: 1_200_000,
  arrPriorYear: 380_000,
  netNewArrQuarter: 330_000,
  nrr: 1.18,
  grr: 0.92,
  grossMargin: 0.74,
  monthlyNetBurn: 160_000,
  cash: 1_100_000,
  salesMarketingQuarter: 300_000,
  newCustomersQuarter: 6,
  acv: 48_000,
  fcfMargin: -1.4,
  headcount: 11,
  capitalRaised: 2_000_000,
  segment: 'mid',
};

function byId(inputs: SaasInputs) {
  return Object.fromEntries(computeMetrics(inputs).map((m) => [m.id, m])) as Record<
    MetricId,
    ReturnType<typeof computeMetrics>[number]
  >;
}

describe('SaaS metrics', () => {
  const m = byId(seedStage);

  it('computes growth and grades it against the Bessemer $1-10M range', () => {
    expect(m.growth.value).toBeCloseTo(1_200_000 / 380_000 - 1, 9);
    expect(m.growth.level).toBe('ok');
  });

  it('computes the burn multiple on a quarterly basis', () => {
    expect(m.burnMultiple.value).toBeCloseTo(480_000 / 330_000, 9);
    expect(m.burnMultiple.band?.label).toMatch(/Great/);
  });

  it('computes magic number, CAC payback, and LTV/CAC', () => {
    expect(m.magicNumber.value).toBeCloseTo(1.1, 9);
    // CAC = $50K; monthly gross profit per customer = 48K / 12 * 0.74 = $2,960
    expect(m.cacPayback.value).toBeCloseTo(50_000 / 2_960, 9);
    expect(m.cacPayback.level).toBe('strong'); // mid-market target is 18 months
    // Lifetime 1 / 8% = 12.5 years, capped at 10
    expect(m.ltvCac.value).toBeCloseTo((48_000 * 0.74 * 10) / 50_000, 9);
  });

  it('computes runway and the cash conversion score', () => {
    expect(m.runway.value).toBeCloseTo(6.875, 9);
    expect(m.runway.level).toBe('weak');
    expect(m.ccs.value).toBeCloseTo(1_200_000 / 900_000, 9);
    expect(m.ccs.level).toBe('strong');
  });

  it('shows the Rule of 40 without a grade below $10M ARR', () => {
    expect(m.ruleOf40.value).toBeCloseTo(m.growth.value! - 1.4, 9);
    expect(m.ruleOf40.level).toBe('info');
  });

  it('marks metrics with missing inputs as not available', () => {
    const sparse = byId({ ...seedStage, salesMarketingQuarter: null, grr: null });
    expect(sparse.magicNumber.level).toBe('na');
    expect(sparse.ltvCac.value).toBeNull();
    expect(sparse.magicNumber.needs).toBeTruthy();
  });

  it('handles cash-flow positive and zero-growth edge cases', () => {
    const profitable = byId({ ...seedStage, monthlyNetBurn: -10_000 });
    expect(profitable.burnMultiple.value).toBe(0);
    expect(profitable.runway.value).toBe(Infinity);
    expect(profitable.runway.level).toBe('strong');
    const stalled = byId({ ...seedStage, netNewArrQuarter: 0 });
    expect(stalled.burnMultiple.value).toBe(Infinity);
    expect(stalled.burnMultiple.level).toBe('poor');
  });

  it('summarizes graded metrics into a traction score', () => {
    const summary = summarizeMetrics(computeMetrics(seedStage), seedStage.arr);
    expect(summary.graded).toBeGreaterThanOrEqual(8);
    expect(summary.band).toBe('1-10');
    expect(summary.suggestedScore).toBeGreaterThan(3);
    expect(summary.suggestedScore).toBeLessThanOrEqual(5);
  });
});

describe('benchmarks', () => {
  it('picks the ARR band', () => {
    expect(arrBand(400_000)).toBe('pre');
    expect(arrBand(9_999_999)).toBe('1-10');
    expect(arrBand(30e6)).toBe('25-50');
    expect(arrBand(250e6)).toBe('100+');
  });

  it('uses band edges as [min, max)', () => {
    expect(classify(1.5, BURN_MULTIPLE_BENCHMARK)?.label).toMatch(/Good/);
    expect(classify(0.99, BURN_MULTIPLE_BENCHMARK)?.label).toMatch(/Amazing/);
    expect(classify(Infinity, BURN_MULTIPLE_BENCHMARK)?.level).toBe('poor');
  });

  it("notes when growth is benchmarked below Bessemer's first range", () => {
    expect(growthBenchmark(300_000).note).toMatch(/starts at \$1M/);
  });
});

describe('ARR projection', () => {
  it('compounds growth with annual decay', () => {
    const p = projectArr(1e6, 1.0, 0.2, 3);
    expect(p.map((x) => Math.round(x.arr))).toEqual([1_000_000, 2_000_000, 3_600_000, 5_904_000]);
  });

  it('follows triple, triple, double, double, double', () => {
    expect(t2d3Path(2e6).map((x) => x.arr / 1e6)).toEqual([2, 6, 18, 36, 72, 144]);
  });

  it('interpolates the year a path crosses $100M on a log scale', () => {
    expect(yearsToReach(t2d3Path(2e6), 100e6)).toBeCloseTo(4 + Math.log(100 / 72) / Math.log(2), 9);
    expect(yearsToReach(projectArr(1e6, 0.1, 0.5, 5), 100e6)).toBeNull();
  });
});
