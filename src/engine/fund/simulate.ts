/**
 * Monte Carlo model of a venture fund.
 *
 * Each run builds a portfolio: equal initial checks deployed over the first
 * years, an outcome multiple and exit year drawn per company from a bucketed
 * distribution, and follow-on checks from reserves for companies that raise a
 * next round. Cash flows are annual. Fees are charged on committed capital;
 * carry is European (whole fund): the GP earns carry only after LPs have their
 * paid-in capital back.
 */
import type { Issue } from '../captable/types';
import { quantileSorted } from '../util/math';
import { irr } from './irr';
import { mulberry32 } from './rng';

export interface OutcomeBucket {
  id: string;
  label: string;
  /** Relative weight; buckets are normalized to sum to 1. */
  probability: number;
  /** Multiple on invested capital, drawn log-uniformly in [min, max] (uniformly when min is 0). */
  minMultiple: number;
  maxMultiple: number;
  /** Years from the initial check to exit. */
  minYears: number;
  maxYears: number;
}

export interface FundParams {
  fundSize: number;
  /** Annual management fee as a fraction of committed capital. */
  managementFee: number;
  feeYears: number;
  carry: number;
  initialCheck: number;
  /** Share of investable capital held back for follow-on checks. */
  reserveRatio: number;
  /** Follow-on entry price as a multiple of the initial entry price. */
  followOnStepUp: number;
  /** Chance that a company raises a next round (and gets a follow-on), by eventual outcome. */
  followOnRate: { winners: number; losers: number };
  /** Years over which initial checks are written. */
  deploymentYears: number;
  outcomes: OutcomeBucket[];
  simulations: number;
  seed: number;
}

export interface FundPlan {
  totalFees: number;
  investable: number;
  companies: number;
  initialCapital: number;
  reserves: number;
  plannedFollowOns: number;
  followOnCheck: number;
  /** Expected gross multiple on an initial check, from the outcome table. */
  expectedMultiple: number;
  /** Expected gross multiple on a follow-on dollar, after the step-up in price. */
  expectedFollowOnMultiple: number;
  issues: Issue[];
}

function bucketMean(b: OutcomeBucket): number {
  const lo = Math.max(0, b.minMultiple);
  const hi = Math.max(lo, b.maxMultiple);
  if (hi === lo) return lo;
  if (lo <= 0) return (lo + hi) / 2;
  return (hi - lo) / Math.log(hi / lo);
}

function normalized(outcomes: readonly OutcomeBucket[]): Array<OutcomeBucket & { p: number }> {
  const total = outcomes.reduce((s, b) => s + Math.max(0, b.probability), 0);
  return outcomes.map((b) => ({ ...b, p: total > 0 ? Math.max(0, b.probability) / total : 0 }));
}

export function planFund(params: FundParams): FundPlan {
  const issues: Issue[] = [];
  const totalFees = params.fundSize * params.managementFee * params.feeYears;
  const investable = params.fundSize - totalFees;
  const initialCapital = investable * (1 - params.reserveRatio);
  const companies =
    params.initialCheck > 0 ? Math.floor(initialCapital / params.initialCheck + 1e-9) : 0;
  const reserves = Math.max(0, investable - companies * params.initialCheck);
  const buckets = normalized(params.outcomes);
  const raiseRate = buckets.reduce(
    (s, b) =>
      s + b.p * (b.minMultiple >= 1 ? params.followOnRate.winners : params.followOnRate.losers),
    0,
  );
  const plannedFollowOns = Math.max(1, Math.round(companies * raiseRate));
  const expectedMultiple = buckets.reduce((s, b) => s + b.p * bucketMean(b), 0);
  const rateOf = (b: OutcomeBucket) =>
    b.minMultiple >= 1 ? params.followOnRate.winners : params.followOnRate.losers;
  const expectedFollowOnMultiple =
    raiseRate > 0
      ? buckets.reduce((s, b) => s + b.p * rateOf(b) * bucketMean(b), 0) /
        raiseRate /
        Math.max(params.followOnStepUp, 1e-9)
      : 0;

  if (investable <= 0)
    issues.push({
      level: 'error',
      message: 'Fees use up the whole fund. Lower the fee or the fee period.',
    });
  if (companies < 1)
    issues.push({
      level: 'error',
      message: 'The initial check is larger than the capital set aside for initial checks.',
    });
  if (buckets.every((b) => b.p === 0))
    issues.push({ level: 'error', message: 'Give at least one outcome a probability above zero.' });
  if (companies > 0 && companies < 15) {
    issues.push({
      level: 'warning',
      message: `Only ${companies} companies. Small portfolios rarely catch a fund-returning outlier.`,
    });
  }

  return {
    totalFees,
    investable,
    companies,
    initialCapital: companies * params.initialCheck,
    reserves,
    plannedFollowOns,
    followOnCheck: reserves > 0 ? reserves / plannedFollowOns : 0,
    expectedMultiple,
    expectedFollowOnMultiple,
    issues,
  };
}

export interface Percentiles {
  p10: number;
  p25: number;
  p50: number;
  p75: number;
  p90: number;
  mean: number;
}

export interface FundSimulation {
  plan: FundPlan;
  runs: number;
  netTvpi: Percentiles;
  grossMultiple: Percentiles;
  netIrr: Percentiles;
  probability: {
    lossOfCapital: number;
    atLeast2x: number;
    atLeast3x: number;
    fundReturner: number;
  };
  /** Median share of gross proceeds from the single best company. */
  medianTopShare: number;
  meanTenBaggers: number;
  histogram: Array<{ from: number; to: number; share: number }>;
  /** Cumulative LP net cash flow as a multiple of fund size, by year. */
  jCurve: Array<{ year: number; p10: number; p50: number; p90: number }>;
  /** DPI (distributions to paid-in, realized only) by year: median run. */
  dpi: Array<{ year: number; p50: number }>;
  issues: Issue[];
}

function percentiles(values: Float64Array): Percentiles {
  const sorted = Array.from(values)
    .filter((v) => Number.isFinite(v))
    .sort((a, b) => a - b);
  const mean = sorted.reduce((s, v) => s + v, 0) / Math.max(1, sorted.length);
  return {
    p10: quantileSorted(sorted, 0.1),
    p25: quantileSorted(sorted, 0.25),
    p50: quantileSorted(sorted, 0.5),
    p75: quantileSorted(sorted, 0.75),
    p90: quantileSorted(sorted, 0.9),
    mean,
  };
}

export const HISTOGRAM_STEP = 0.25;
export const HISTOGRAM_MAX = 5;

export function simulateFund(params: FundParams): FundSimulation {
  const plan = planFund(params);
  const runs = Math.max(1, Math.floor(params.simulations));
  const buckets = normalized(params.outcomes);
  const cumulative: number[] = [];
  buckets.reduce((acc, b, i) => (cumulative[i] = acc + b.p), 0);

  const maxYears = Math.max(1, ...buckets.map((b) => b.maxYears));
  const horizon = Math.max(params.feeYears, params.deploymentYears + 1 + maxYears) + 1;

  const netTvpi = new Float64Array(runs);
  const gross = new Float64Array(runs);
  const irrs = new Float64Array(runs);
  const topShare = new Float64Array(runs);
  const jCurve: Float64Array[] = Array.from({ length: horizon }, () => new Float64Array(runs));
  const dpiByYear: Float64Array[] = Array.from({ length: horizon }, () => new Float64Array(runs));
  let lossCount = 0;
  let twoX = 0;
  let threeX = 0;
  let returner = 0;
  let tenBaggers = 0;

  if (plan.issues.some((i) => i.level === 'error')) {
    return emptySimulation(plan, horizon);
  }

  const rand = mulberry32(params.seed);
  const calls = new Float64Array(horizon);
  const distributions = new Float64Array(horizon);
  const deployYears = Math.max(1, Math.round(params.deploymentYears));

  for (let run = 0; run < runs; run++) {
    calls.fill(0);
    distributions.fill(0);
    for (let t = 0; t < params.feeYears && t < horizon; t++)
      calls[t]! += params.fundSize * params.managementFee;

    let reservesLeft = plan.reserves;
    let invested = 0;
    let best = 0;
    for (let i = 0; i < plan.companies; i++) {
      // Always draw four numbers per company so runs stay aligned across settings.
      const uBucket = rand();
      const uMultiple = rand();
      const uYears = rand();
      const uRaise = rand();

      const year0 = Math.floor((i * deployYears) / plan.companies);
      calls[year0]! += params.initialCheck;
      invested += params.initialCheck;

      let k = cumulative.findIndex((c) => uBucket < c);
      if (k < 0) k = buckets.length - 1;
      const b = buckets[k]!;
      const lo = Math.max(0, b.minMultiple);
      const hi = Math.max(lo, b.maxMultiple);
      const multiple =
        hi === lo
          ? lo
          : lo <= 0
            ? lo + uMultiple * (hi - lo)
            : Math.exp(Math.log(lo) + uMultiple * Math.log(hi / lo));
      const exitYear = Math.min(
        horizon - 1,
        year0 + Math.max(1, Math.floor(b.minYears + uYears * (b.maxYears - b.minYears + 1))),
      );

      let followOn = 0;
      const rate = b.minMultiple >= 1 ? params.followOnRate.winners : params.followOnRate.losers;
      if (uRaise < rate && reservesLeft > 1e-9 && exitYear > year0 + 1) {
        followOn = Math.min(plan.followOnCheck, reservesLeft);
        reservesLeft -= followOn;
        calls[year0 + 1]! += followOn;
        invested += followOn;
      }
      const proceeds =
        params.initialCheck * multiple +
        (followOn * multiple) / Math.max(params.followOnStepUp, 1e-9);
      distributions[exitYear]! += proceeds;
      if (proceeds > best) best = proceeds;
      if (multiple >= 10) tenBaggers++;
    }

    let totalCalled = 0;
    let totalGross = 0;
    for (let t = 0; t < horizon; t++) {
      totalCalled += calls[t]!;
      totalGross += distributions[t]!;
    }

    // European carry: the GP shares only in gains above total paid-in capital.
    let cumulativeGross = 0;
    let carryPaid = 0;
    let lpTotal = 0;
    let cumulativeNet = 0;
    let calledSoFar = 0;
    const flows: number[] = new Array(horizon);
    for (let t = 0; t < horizon; t++) {
      cumulativeGross += distributions[t]!;
      const carryDue = params.carry * Math.max(0, cumulativeGross - totalCalled);
      const lp = distributions[t]! - (carryDue - carryPaid);
      carryPaid = carryDue;
      lpTotal += lp;
      calledSoFar += calls[t]!;
      flows[t] = lp - calls[t]!;
      cumulativeNet += flows[t]!;
      jCurve[t]![run] = cumulativeNet / params.fundSize;
      dpiByYear[t]![run] = calledSoFar > 0 ? lpTotal / calledSoFar : 0;
    }

    const tvpi = totalCalled > 0 ? lpTotal / totalCalled : 0;
    netTvpi[run] = tvpi;
    gross[run] = invested > 0 ? totalGross / invested : 0;
    irrs[run] = irr(flows) ?? Number.NaN;
    topShare[run] = totalGross > 0 ? best / totalGross : 0;
    if (tvpi < 1) lossCount++;
    if (tvpi >= 2) twoX++;
    if (tvpi >= 3) threeX++;
    if (best >= params.fundSize) returner++;
  }

  const bins = Math.round(HISTOGRAM_MAX / HISTOGRAM_STEP);
  const counts = new Array<number>(bins + 1).fill(0);
  for (const v of netTvpi) counts[Math.min(bins, Math.floor(v / HISTOGRAM_STEP))]!++;
  const histogram = counts.map((c, i) => ({
    from: i * HISTOGRAM_STEP,
    to: i === bins ? Infinity : (i + 1) * HISTOGRAM_STEP,
    share: c / runs,
  }));

  return {
    plan,
    runs,
    netTvpi: percentiles(netTvpi),
    grossMultiple: percentiles(gross),
    netIrr: percentiles(irrs),
    probability: {
      lossOfCapital: lossCount / runs,
      atLeast2x: twoX / runs,
      atLeast3x: threeX / runs,
      fundReturner: returner / runs,
    },
    medianTopShare: percentiles(topShare).p50,
    meanTenBaggers: tenBaggers / runs,
    histogram,
    jCurve: jCurve.map((col, year) => {
      const p = percentiles(col);
      return { year, p10: p.p10, p50: p.p50, p90: p.p90 };
    }),
    dpi: dpiByYear.map((col, year) => ({ year, p50: percentiles(col).p50 })),
    issues: plan.issues,
  };
}

function emptySimulation(plan: FundPlan, horizon: number): FundSimulation {
  const zero: Percentiles = { p10: 0, p25: 0, p50: 0, p75: 0, p90: 0, mean: 0 };
  return {
    plan,
    runs: 0,
    netTvpi: zero,
    grossMultiple: zero,
    netIrr: zero,
    probability: { lossOfCapital: 0, atLeast2x: 0, atLeast3x: 0, fundReturner: 0 },
    medianTopShare: 0,
    meanTenBaggers: 0,
    histogram: [],
    jCurve: Array.from({ length: horizon }, (_, year) => ({ year, p10: 0, p50: 0, p90: 0 })),
    dpi: Array.from({ length: horizon }, (_, year) => ({ year, p50: 0 })),
    issues: plan.issues,
  };
}

/** Outcome table anchored to Correlation Ventures' 2001-2013 data (65% < 1x, 25% 1-5x, 6% 5-10x, 4% 10x+). */
export const CORRELATION_OUTCOMES: OutcomeBucket[] = [
  {
    id: 'wipe',
    label: 'Write-off',
    probability: 0.35,
    minMultiple: 0,
    maxMultiple: 0,
    minYears: 2,
    maxYears: 5,
  },
  {
    id: 'partial',
    label: 'Partial loss',
    probability: 0.3,
    minMultiple: 0.1,
    maxMultiple: 1,
    minYears: 3,
    maxYears: 7,
  },
  {
    id: 'base',
    label: '1-5x',
    probability: 0.25,
    minMultiple: 1,
    maxMultiple: 5,
    minYears: 4,
    maxYears: 8,
  },
  {
    id: 'good',
    label: '5-10x',
    probability: 0.06,
    minMultiple: 5,
    maxMultiple: 10,
    minYears: 5,
    maxYears: 10,
  },
  {
    id: 'great',
    label: '10-20x',
    probability: 0.025,
    minMultiple: 10,
    maxMultiple: 20,
    minYears: 6,
    maxYears: 11,
  },
  {
    id: 'outlier',
    label: '20-50x',
    probability: 0.01,
    minMultiple: 20,
    maxMultiple: 50,
    minYears: 7,
    maxYears: 12,
  },
  {
    id: 'returner',
    label: '50-100x',
    probability: 0.005,
    minMultiple: 50,
    maxMultiple: 100,
    minYears: 7,
    maxYears: 12,
  },
];

export { bucketMean };
