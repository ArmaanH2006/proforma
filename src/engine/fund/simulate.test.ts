import { describe, expect, it } from 'vitest';
import { irr, npv } from './irr';
import { mulberry32 } from './rng';
import {
  CORRELATION_OUTCOMES,
  bucketMean,
  planFund,
  simulateFund,
  type FundParams,
} from './simulate';

const studentFund: FundParams = {
  fundSize: 1_000_000,
  managementFee: 0,
  feeYears: 10,
  carry: 0,
  initialCheck: 25_000,
  reserveRatio: 0.25,
  followOnStepUp: 2.5,
  followOnRate: { winners: 0.9, losers: 0.4 },
  deploymentYears: 4,
  outcomes: CORRELATION_OUTCOMES,
  simulations: 2_000,
  seed: 42,
};

describe('IRR', () => {
  it('solves simple cases', () => {
    expect(irr([-100, 110])).toBeCloseTo(0.1, 9);
    expect(irr([-100, 0, 121])).toBeCloseTo(0.1, 9);
    expect(npv(0.1, [-100, 0, 121])).toBeCloseTo(0, 9);
  });

  it('returns -100% for a total loss and null with no outlay', () => {
    expect(irr([-100, 0, 0])).toBe(-1);
    expect(irr([0, 50])).toBeNull();
  });
});

describe('RNG', () => {
  it('is deterministic for a seed and roughly uniform', () => {
    const a = mulberry32(7);
    const b = mulberry32(7);
    const xs = Array.from({ length: 20_000 }, () => a());
    expect(xs.slice(0, 5)).toEqual(Array.from({ length: 5 }, () => b()));
    const mean = xs.reduce((s, x) => s + x, 0) / xs.length;
    expect(mean).toBeCloseTo(0.5, 1);
    expect(Math.min(...xs)).toBeGreaterThanOrEqual(0);
    expect(Math.max(...xs)).toBeLessThan(1);
  });
});

describe('fund plan', () => {
  it('sizes a student fund with no fees', () => {
    const plan = planFund(studentFund);
    expect(plan.investable).toBe(1_000_000);
    expect(plan.companies).toBe(30);
    expect(plan.reserves).toBe(250_000);
  });

  it('takes fees out of investable capital', () => {
    const plan = planFund({
      ...studentFund,
      fundSize: 25e6,
      managementFee: 0.02,
      initialCheck: 500_000,
      reserveRatio: 0.4,
    });
    expect(plan.totalFees).toBeCloseTo(5e6, 6);
    expect(plan.investable).toBeCloseTo(20e6, 6);
    expect(plan.companies).toBe(24);
    expect(plan.reserves).toBeCloseTo(8e6, 6);
  });

  it('computes the expected multiple from the outcome table', () => {
    expect(bucketMean({ ...CORRELATION_OUTCOMES[2]!, minMultiple: 1, maxMultiple: 5 })).toBeCloseTo(
      4 / Math.log(5),
      12,
    );
    const plan = planFund(studentFund);
    expect(plan.expectedMultiple).toBeGreaterThan(2);
    expect(plan.expectedMultiple).toBeLessThan(2.5);
  });

  it('flags impossible setups', () => {
    expect(planFund({ ...studentFund, initialCheck: 2e6 }).issues[0]!.level).toBe('error');
    expect(
      planFund({ ...studentFund, managementFee: 0.2 }).issues.some((i) => i.level === 'error'),
    ).toBe(true);
  });
});

describe('fund simulation', () => {
  it('is reproducible for a seed', () => {
    const a = simulateFund(studentFund);
    const b = simulateFund(studentFund);
    expect(a.netTvpi).toEqual(b.netTvpi);
    expect(simulateFund({ ...studentFund, seed: 43 }).netTvpi.p50).not.toBe(a.netTvpi.p50);
  });

  it('converges to the analytic expected multiple', () => {
    const params = { ...studentFund, reserveRatio: 0, simulations: 20_000 };
    const sim = simulateFund(params);
    expect(sim.grossMultiple.mean / sim.plan.expectedMultiple).toBeGreaterThan(0.97);
    expect(sim.grossMultiple.mean / sim.plan.expectedMultiple).toBeLessThan(1.03);
  });

  it('applies carry only above returned capital', () => {
    const params = { ...studentFund, reserveRatio: 0 };
    const gross = simulateFund(params);
    const net = simulateFund({ ...params, carry: 0.2 });
    // With no fees, net TVPI = G - 20% * max(0, G - 1) for gross multiple G.
    const afterCarry = (g: number) => (g > 1 ? 1 + 0.8 * (g - 1) : g);
    expect(gross.netTvpi.p75).toBeGreaterThan(1);
    expect(net.netTvpi.p75).toBeCloseTo(afterCarry(gross.netTvpi.p75), 9);
    expect(net.netTvpi.p90).toBeCloseTo(afterCarry(gross.netTvpi.p90), 9);
    expect(net.netTvpi.p10).toBeCloseTo(afterCarry(gross.netTvpi.p10), 9);
  });

  it('lowers net returns when fees are charged', () => {
    const noFees = simulateFund(studentFund);
    const fees = simulateFund({ ...studentFund, managementFee: 0.02 });
    expect(fees.netTvpi.p50).toBeLessThan(noFees.netTvpi.p50);
  });

  it('reports DPI that rises to TVPI once every company has exited', () => {
    const sim = simulateFund(studentFund);
    expect(sim.dpi[0]!.p50).toBe(0);
    expect(sim.dpi[sim.dpi.length - 1]!.p50).toBeCloseTo(sim.netTvpi.p50, 9);
  });

  it('produces a J-curve, a histogram, and power-law stats', () => {
    const sim = simulateFund(studentFund);
    expect(sim.jCurve[0]!.p50).toBeLessThan(0);
    expect(sim.histogram.reduce((s, b) => s + b.share, 0)).toBeCloseTo(1, 9);
    expect(sim.medianTopShare).toBeGreaterThan(0.15);
    expect(sim.probability.lossOfCapital).toBeGreaterThan(0);
    expect(sim.probability.lossOfCapital).toBeLessThan(1);
    expect(sim.netIrr.p50).toBeGreaterThan(-1);
  });
});
