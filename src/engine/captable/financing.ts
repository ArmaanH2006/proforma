/**
 * Financing mechanics: SAFE and note conversion, option pool top-ups, and
 * priced equity rounds.
 *
 * Conventions follow Y Combinator's SAFE documents and user guide:
 *  - Post-money SAFE: Safe Price = post-money cap / Company Capitalization, where
 *    Company Capitalization counts all outstanding shares, options, the unissued
 *    pool and all converting securities (including the SAFE itself), but not a
 *    pool increase made in connection with the round.
 *  - Pre-money SAFE: Safe Price = pre-money cap / capitalization that excludes
 *    every SAFE and note but includes the pool increase.
 *  - Notes convert like pre-money SAFEs, on principal plus accrued simple interest.
 *  - An instrument with both a cap and a discount converts at whichever price
 *    yields more shares.
 *  - The headline pre-money valuation includes the converted shares and the
 *    pool increase, so that dilution falls on existing holders (the "option
 *    pool shuffle").
 */
import { floorShares, roundTo, sum } from '../util/math';
import type {
  CapTable,
  Convertible,
  ConvertibleEvent,
  FinancingEvent,
  Investment,
  Issue,
  Position,
  PricedRoundEvent,
  ShareClass,
} from './types';

export type ConversionBasis = 'cap' | 'discount' | 'round';

export interface ConversionDetail {
  instrumentId: string;
  holderId: string;
  type: Convertible['type'];
  /** Purchase amount or note principal. */
  amount: number;
  /** Amount that converts (principal plus accrued interest for notes). */
  conversionAmount: number;
  basis: ConversionBasis;
  price: number;
  shares: number;
  /** Discount of the conversion price to the round price, as a fraction. */
  discountToRound: number;
  classId: string;
}

export interface PricedRoundReport {
  kind: 'priced';
  pricePerShare: number;
  /** Headline pre-money from the term sheet. */
  preMoney: number;
  /** Price per share times the pre-money fully diluted share count. */
  preMoneyAsPriced: number;
  postMoney: number;
  newMoney: number;
  /** Fully diluted shares before the round (existing holders only). */
  existingShares: number;
  preMoneyShares: number;
  postMoneyShares: number;
  poolIncrease: number;
  /** Unissued pool as a share of post-money fully diluted. */
  poolPostPercent: number;
  /** What existing holders' shares are worth at the round price. */
  effectivePreMoney: number;
  /** Value of shares issued to SAFE and note holders at the round price. */
  conversionValue: number;
  /** Value of the pool increase at the round price. */
  poolIncreaseValue: number;
  conversions: ConversionDetail[];
  investments: Array<Investment & { shares: number; invested: number }>;
  newClassId: string;
}

export interface ConvertibleReport {
  kind: 'convertibles';
  raised: number;
  implied: ImpliedConversion;
}

export interface EventResult {
  capTable: CapTable;
  report: PricedRoundReport | ConvertibleReport;
  issues: Issue[];
}

const DEFAULT_PRICE_PRECISION = 4;

/** Fully diluted share count: every issued share, granted option, and unissued pool share. */
export function fullyDiluted(cap: CapTable): number {
  return sum(cap.positions.map((p) => p.shares)) + cap.pool.granted + cap.pool.unissued;
}

/** Amount that converts: SAFEs convert their purchase amount, notes add simple interest. */
export function conversionAmount(c: Convertible): number {
  if (c.type !== 'note') return c.amount;
  const rate = c.interestRate ?? 0;
  const months = c.termMonths ?? 0;
  return c.amount * (1 + rate * (months / 12));
}

function capOf(c: Convertible): number | null {
  return c.cap != null && c.cap > 0 ? c.cap : null;
}

function discountOf(c: Convertible): number {
  return c.discount != null && c.discount > 0 ? Math.min(c.discount, 0.95) : 0;
}

interface Instrument {
  src: Convertible;
  a: number;
  cap: number | null;
  d: number;
  isPost: boolean;
  basis: ConversionBasis;
}

interface ContinuousSolution {
  price: number;
  poolIncrease: number;
  companyCap: number;
}

function initialBasis(i: Pick<Instrument, 'cap' | 'd'>): ConversionBasis {
  if (i.cap) return 'cap';
  if (i.d > 0) return 'discount';
  return 'round';
}

/**
 * Solve the round in closed form for a fixed choice of conversion basis per
 * instrument. With S0 = existing fully diluted shares, X = pool increase:
 *   pre-money SAFE/note at cap:  n = a(S0 + X) / cap          (sum of a/cap = g)
 *   post-money SAFE at cap:      n = (a / cap) * CC           (sum of a/cap = F)
 *   discount or round price:     n = a / (P(1 - d))           (sum of a/(1-d) = c)
 *   CC = (S0 + g(S0 + X) + c/P) / (1 - F)
 *   P  = preMoney / (CC + X)
 * which rearranges to P = m / (hX + k) with m = M - c/(1-F), h = 1 + g/(1-F),
 * k = S0(1+g)/(1-F). A post-money pool target p adds U0 + X = p * PostMoney / P.
 */
function solveContinuous(
  S0: number,
  U0: number,
  preMoney: number,
  newMoney: number,
  instruments: Instrument[],
  pool: PricedRoundEvent['pool'],
): ContinuousSolution | Issue {
  let g = 0;
  let F = 0;
  let c = 0;
  for (const i of instruments) {
    if (i.basis === 'cap' && i.cap) {
      if (i.isPost) F += i.a / i.cap;
      else g += i.a / i.cap;
    } else {
      c += i.a / (1 - (i.basis === 'discount' ? i.d : 0));
    }
  }
  if (F >= 1) {
    return {
      level: 'error',
      message:
        'Post-money SAFEs claim 100% or more of the company. Check the caps and purchase amounts.',
    };
  }
  const m = preMoney - c / (1 - F);
  if (m <= 0) {
    return {
      level: 'error',
      message:
        'SAFEs and notes converting at a discount are worth more than the pre-money valuation.',
    };
  }
  const h = 1 + g / (1 - F);
  const k = (S0 * (1 + g)) / (1 - F);

  let X = 0;
  if (pool.mode === 'shares') {
    X = Math.max(0, pool.shares);
  } else if (pool.mode === 'target') {
    const p = pool.percentPost;
    if (!(p >= 0 && p < 1)) {
      return { level: 'error', message: 'Option pool target must be between 0% and 100%.' };
    }
    const post = preMoney + newMoney;
    const denom = 1 - (p * post * h) / m;
    if (denom <= 0) {
      return {
        level: 'error',
        message:
          'The option pool target cannot be reached: the pool increase sits inside the pre-money, so a larger pool only lowers the price. Lower the target or raise the pre-money.',
      };
    }
    X = Math.max(0, ((p * post * k) / m - U0) / denom);
  }
  const price = m / (h * X + k);
  const companyCap = (S0 + g * (S0 + X) + c / price) / (1 - F);
  return { price, poolIncrease: X, companyCap };
}

function isIssue(x: ContinuousSolution | Issue): x is Issue {
  return (x as Issue).level !== undefined;
}

/** Update each dual-term instrument to whichever basis gives the lower price. Returns true if anything changed. */
function updateBases(instruments: Instrument[], sol: ContinuousSolution, S0: number): boolean {
  let changed = false;
  for (const i of instruments) {
    if (!(i.cap && i.d > 0)) continue;
    const capPrice = i.isPost ? i.cap / sol.companyCap : i.cap / (S0 + sol.poolIncrease);
    const discountPrice = sol.price * (1 - i.d);
    const next: ConversionBasis = capPrice <= discountPrice ? 'cap' : 'discount';
    if (next !== i.basis) {
      i.basis = next;
      changed = true;
    }
  }
  return changed;
}

function consistent(instruments: Instrument[], sol: ContinuousSolution, S0: number): boolean {
  const copy = instruments.map((i) => ({ ...i }));
  return !updateBases(copy, sol, S0);
}

/** Find a self-consistent basis assignment. Iterates best responses, then falls back to enumeration. */
function solveWithBases(
  S0: number,
  U0: number,
  event: PricedRoundEvent,
  newMoney: number,
  instruments: Instrument[],
): ContinuousSolution | Issue {
  let sol: ContinuousSolution | Issue = solveContinuous(
    S0,
    U0,
    event.preMoney,
    newMoney,
    instruments,
    event.pool,
  );
  for (let iter = 0; iter < 32; iter++) {
    if (isIssue(sol)) return sol;
    if (!updateBases(instruments, sol, S0)) return sol;
    sol = solveContinuous(S0, U0, event.preMoney, newMoney, instruments, event.pool);
  }
  // Best responses cycled. Enumerate assignments for instruments with both terms.
  const dual = instruments.filter((i) => i.cap && i.d > 0);
  if (dual.length <= 12) {
    for (let mask = 0; mask < 1 << dual.length; mask++) {
      dual.forEach((i, bit) => {
        i.basis = mask & (1 << bit) ? 'discount' : 'cap';
      });
      const candidate = solveContinuous(S0, U0, event.preMoney, newMoney, instruments, event.pool);
      if (!isIssue(candidate) && consistent(instruments, candidate, S0)) return candidate;
    }
  }
  return sol;
}

function nextSeniority(cap: CapTable, mode: 'senior' | 'pari'): number {
  const ranks = cap.classes.filter((c) => c.kind === 'preferred').map((c) => c.seniority);
  const top = ranks.length ? Math.max(...ranks) : 0;
  if (mode === 'senior') return top + 1;
  return Math.max(top, 1);
}

/** Apply a priced equity round: convert outstanding SAFEs and notes, top up the pool, issue new shares. */
export function applyPricedRound(cap: CapTable, event: PricedRoundEvent): EventResult {
  const issues: Issue[] = [];
  const precision = event.pricePrecision ?? DEFAULT_PRICE_PRECISION;
  const S0 = fullyDiluted(cap);
  const U0 = cap.pool.unissued;
  const newMoney = sum(event.investments.map((i) => Math.max(0, i.amount)));

  if (!(event.preMoney > 0)) {
    return fail(cap, event, 'Enter a pre-money valuation above zero.');
  }
  if (S0 <= 0) {
    return fail(cap, event, 'The cap table has no shares yet. Add founder shares first.');
  }
  if (newMoney <= 0) {
    issues.push({ level: 'warning', message: 'This round has no new money yet.' });
  }

  const instruments: Instrument[] = cap.convertibles
    .filter((c) => c.amount > 0)
    .map((c) => {
      const base = { cap: capOf(c), d: discountOf(c) };
      return {
        src: c,
        a: conversionAmount(c),
        ...base,
        isPost: c.type === 'post-safe',
        basis: initialBasis(base),
      };
    });

  const sol = solveWithBases(S0, U0, event, newMoney, instruments);
  if (isIssue(sol)) return fail(cap, event, sol.message, issues);

  // Whole-share pass, in the order the documents compute it.
  const poolIncrease =
    event.pool.mode === 'target'
      ? Math.ceil(sol.poolIncrease - 1e-6)
      : event.pool.mode === 'shares'
        ? Math.round(sol.poolIncrease)
        : 0;
  const preMoneyBasis = S0 + poolIncrease;
  const F = sum(instruments.filter((i) => i.isPost && i.basis === 'cap').map((i) => i.a / i.cap!));

  const shares = new Map<string, number>();
  const prices = new Map<string, number>();
  for (const i of instruments) {
    if (i.basis === 'cap' && !i.isPost) {
      const price = i.cap! / preMoneyBasis;
      prices.set(i.src.id, price);
      shares.set(i.src.id, floorShares(i.a / price));
    }
  }

  let price = roundTo(sol.price, precision);
  for (let iter = 0; iter < 12; iter++) {
    for (const i of instruments) {
      if (i.basis === 'cap') continue;
      const p = price * (1 - (i.basis === 'discount' ? i.d : 0));
      prices.set(i.src.id, p);
      shares.set(i.src.id, floorShares(i.a / p));
    }
    const nonPost = sum(
      instruments.filter((i) => !(i.isPost && i.basis === 'cap')).map((i) => shares.get(i.src.id)!),
    );
    const companyCap = floorShares((S0 + nonPost) / (1 - F));
    for (const i of instruments) {
      if (!(i.isPost && i.basis === 'cap')) continue;
      prices.set(i.src.id, i.cap! / companyCap);
      shares.set(i.src.id, floorShares(companyCap * (i.a / i.cap!)));
    }
    const preMoneyShares = S0 + poolIncrease + sum([...shares.values()]);
    const next = roundTo(event.preMoney / preMoneyShares, precision);
    if (next === price) break;
    price = next;
  }
  if (!(price > 0)) {
    return fail(cap, event, 'The round prices at zero. Raise the pre-money valuation.', issues);
  }

  const conversionShares = sum([...shares.values()]);
  const preMoneyShares = S0 + poolIncrease + conversionShares;

  // Classes: one for new money, plus a shadow series per distinct conversion price
  // (YC's "Safe Preferred Stock"), so each holder's preference matches what it paid.
  const seniority = nextSeniority(cap, event.terms.seniority);
  const baseClass: Omit<ShareClass, 'id' | 'name' | 'issuePrice'> = {
    kind: 'preferred',
    prefMultiple: event.terms.prefMultiple,
    participation: event.terms.participation,
    participationCap: event.terms.participationCap,
    seniority,
    eventId: event.id,
  };
  const newClassId = event.id;
  const classes: ShareClass[] = [
    ...cap.classes,
    { ...baseClass, id: newClassId, name: event.label, issuePrice: price },
  ];
  const shadowByPrice = new Map<string, string>();
  // "Series A (projected)" -> "Series A-1": shadow series take the bare series name.
  const seriesName = event.label.replace(/\s*\([^)]*\)\s*$/, '') || event.label;
  const distinctPrices = [...new Set(instruments.map((i) => prices.get(i.src.id)!))]
    .filter((p) => Math.abs(p - price) > 1e-9)
    .sort((a, b) => a - b);
  distinctPrices.forEach((p, idx) => {
    const id = `${event.id}-${idx + 1}`;
    shadowByPrice.set(p.toFixed(9), id);
    classes.push({ ...baseClass, id, name: `${seriesName}-${idx + 1}`, issuePrice: p });
  });

  const positions: Position[] = [...cap.positions];
  const conversions: ConversionDetail[] = instruments.map((i) => {
    const p = prices.get(i.src.id)!;
    const n = shares.get(i.src.id)!;
    const classId = shadowByPrice.get(p.toFixed(9)) ?? newClassId;
    positions.push({
      holderId: i.src.holderId,
      classId,
      shares: n,
      invested: i.src.amount,
      eventId: event.id,
    });
    return {
      instrumentId: i.src.id,
      holderId: i.src.holderId,
      type: i.src.type,
      amount: i.src.amount,
      conversionAmount: i.a,
      basis: i.basis,
      price: p,
      shares: n,
      discountToRound: 1 - p / price,
      classId,
    };
  });

  const investments = event.investments
    .filter((inv) => inv.amount > 0)
    .map((inv) => {
      const n = floorShares(inv.amount / price);
      const invested = roundTo(n * price, 2);
      positions.push({
        holderId: inv.holderId,
        classId: newClassId,
        shares: n,
        invested,
        eventId: event.id,
      });
      return { ...inv, shares: n, invested };
    });

  const newShares = sum(investments.map((i) => i.shares));
  const postMoneyShares = preMoneyShares + newShares;
  const unissued = cap.pool.unissued + poolIncrease;

  const capTable: CapTable = {
    classes,
    positions,
    pool: { ...cap.pool, unissued },
    convertibles: [],
  };

  if (
    event.pool.mode === 'target' &&
    sol.poolIncrease === 0 &&
    U0 / postMoneyShares > event.pool.percentPost
  ) {
    issues.push({
      level: 'warning',
      message: 'The existing unissued pool already exceeds the target, so no shares were added.',
    });
  }

  const report: PricedRoundReport = {
    kind: 'priced',
    pricePerShare: price,
    preMoney: event.preMoney,
    preMoneyAsPriced: price * preMoneyShares,
    postMoney: price * postMoneyShares,
    newMoney: sum(investments.map((i) => i.invested)),
    existingShares: S0,
    preMoneyShares,
    postMoneyShares,
    poolIncrease,
    poolPostPercent: unissued / postMoneyShares,
    effectivePreMoney: price * S0,
    conversionValue: price * conversionShares,
    poolIncreaseValue: price * poolIncrease,
    conversions,
    investments,
    newClassId,
  };
  return { capTable, report, issues };
}

function fail(
  cap: CapTable,
  event: FinancingEvent,
  message: string,
  prior: Issue[] = [],
): EventResult {
  return {
    capTable: cap,
    report:
      event.kind === 'priced'
        ? emptyPricedReport(event)
        : { kind: 'convertibles', raised: 0, implied: impliedConversionAtCaps(cap) },
    issues: [...prior, { level: 'error', message }],
  };
}

function emptyPricedReport(event: PricedRoundEvent): PricedRoundReport {
  return {
    kind: 'priced',
    pricePerShare: 0,
    preMoney: event.preMoney,
    preMoneyAsPriced: 0,
    postMoney: 0,
    newMoney: 0,
    existingShares: 0,
    preMoneyShares: 0,
    postMoneyShares: 0,
    poolIncrease: 0,
    poolPostPercent: 0,
    effectivePreMoney: 0,
    conversionValue: 0,
    poolIncreaseValue: 0,
    conversions: [],
    investments: [],
    newClassId: event.id,
  };
}

export interface ImpliedConversion {
  /** Fully diluted shares if every capped instrument converted at its cap today. */
  totalShares: number;
  instruments: Array<{
    instrumentId: string;
    holderId: string;
    /** Null when the instrument has no cap and cannot be priced until a round. */
    shares: number | null;
    percent: number | null;
  }>;
}

/**
 * Ownership implied by converting every capped SAFE and note at its cap, with no
 * new money and no pool change. For a post-money SAFE this is exactly
 * purchase amount / post-money cap. Uncapped instruments cannot be priced yet.
 */
export function impliedConversionAtCaps(cap: CapTable): ImpliedConversion {
  const S0 = fullyDiluted(cap);
  let F = 0;
  let preShares = 0;
  const pre = new Map<string, number>();
  for (const c of cap.convertibles) {
    const cp = capOf(c);
    if (!cp || c.amount <= 0) continue;
    if (c.type === 'post-safe') F += c.amount / cp;
    else {
      const n = (conversionAmount(c) * S0) / cp;
      pre.set(c.id, n);
      preShares += n;
    }
  }
  const valid = F < 1;
  const companyCap = valid ? (S0 + preShares) / (1 - F) : S0 + preShares;
  const instruments = cap.convertibles.map((c) => {
    const cp = capOf(c);
    if (!cp || c.amount <= 0 || !valid) {
      return { instrumentId: c.id, holderId: c.holderId, shares: null, percent: null };
    }
    const n = c.type === 'post-safe' ? (c.amount / cp) * companyCap : pre.get(c.id)!;
    return { instrumentId: c.id, holderId: c.holderId, shares: n, percent: n / companyCap };
  });
  return { totalShares: companyCap, instruments };
}

export function applyConvertibles(cap: CapTable, event: ConvertibleEvent): EventResult {
  const issues: Issue[] = [];
  const instruments = event.instruments.map((i) => ({ ...i, eventId: event.id }));
  for (const i of instruments) {
    if (!(i.amount > 0))
      issues.push({ level: 'warning', message: 'An instrument has no amount yet.' });
    if (i.type === 'post-safe' && capOf(i) && i.amount >= capOf(i)!) {
      issues.push({ level: 'error', message: 'A post-money SAFE amount cannot exceed its cap.' });
    }
  }
  const capTable: CapTable = { ...cap, convertibles: [...cap.convertibles, ...instruments] };
  const implied = impliedConversionAtCaps(capTable);
  const postSafeShare = sum(
    capTable.convertibles
      .filter((c) => c.type === 'post-safe' && capOf(c))
      .map((c) => c.amount / capOf(c)!),
  );
  if (postSafeShare >= 1) {
    issues.push({
      level: 'error',
      message: 'Post-money SAFEs claim 100% or more of the company. Check the caps.',
    });
  }
  return {
    capTable,
    report: { kind: 'convertibles', raised: sum(instruments.map((i) => i.amount)), implied },
    issues,
  };
}

export function applyEvent(cap: CapTable, event: FinancingEvent): EventResult {
  return event.kind === 'priced' ? applyPricedRound(cap, event) : applyConvertibles(cap, event);
}

export interface Snapshot {
  /** Null for the starting cap table. */
  event: FinancingEvent | null;
  capTable: CapTable;
  report: EventResult['report'] | null;
  issues: Issue[];
}

/** Run every financing event in order. Events that fail leave the cap table unchanged. */
export function buildHistory(start: CapTable, events: readonly FinancingEvent[]): Snapshot[] {
  const snapshots: Snapshot[] = [{ event: null, capTable: start, report: null, issues: [] }];
  let cap = start;
  for (const event of events) {
    const result = applyEvent(cap, event);
    const failed = result.issues.some((i) => i.level === 'error');
    if (!failed) cap = result.capTable;
    snapshots.push({ event, capTable: cap, report: result.report, issues: result.issues });
  }
  return snapshots;
}

/**
 * Dollar amount a holder must invest to keep its ownership in a round of
 * `roundSize`. Ownership is measured as if outstanding SAFEs and notes had
 * converted at their caps, which is how a post-money SAFE pro rata side letter
 * reads in practice.
 */
export function proRataAmount(cap: CapTable, holderId: string, roundSize: number): number {
  const implied = impliedConversionAtCaps(cap);
  const held = sum(cap.positions.filter((p) => p.holderId === holderId).map((p) => p.shares));
  const fromInstruments = sum(
    implied.instruments.filter((i) => i.holderId === holderId).map((i) => i.shares ?? 0),
  );
  const share = (held + fromInstruments) / implied.totalShares;
  return Number.isFinite(share) ? share * roundSize : 0;
}
