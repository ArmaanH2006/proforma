/**
 * Liquidation waterfall.
 *
 * Proceeds go first to liquidation preferences, most senior rank first and pari
 * passu within a rank. What remains is shared per as-converted share by common,
 * exercised options (net of strike), converted preferred, and participating
 * preferred (capped classes stop at their cap). Non-participating and capped
 * classes choose whether to convert; the engine finds the set of choices where
 * no class would do better by switching on its own.
 */
import { conversionAmount } from '../captable/financing';
import type { CapTable, Convertible, Participation } from '../captable/types';
import { sum } from '../util/math';

export type WaterfallKind = 'common' | 'options' | 'preferred' | 'safe' | 'note';

export interface WaterfallHolding {
  /** Null for the option pool as a whole. */
  holderId: string | null;
  shares: number;
  invested: number;
}

export interface WaterfallClass {
  id: string;
  name: string;
  kind: WaterfallKind;
  /** Common-equivalent shares if the class converts (or always, for common and options). */
  shares: number;
  /** Liquidation preference in dollars. Zero for common and options. */
  preference: number;
  participation: Participation;
  /** Capped participation: maximum total payout in dollars, preference included. */
  capTotal: number;
  /** Higher ranks are paid first. Common and options are 0. */
  seniority: number;
  /** Options only: weighted-average exercise price. */
  strike: number;
  /** Whether the holders may give up the preference and take the as-converted amount instead. */
  canConvert: boolean;
  holdings: WaterfallHolding[];
  /** Classes from the same round (a series and its SAFE shadow series) share a group for charts. */
  group?: string;
  groupName?: string;
}

export interface ClassPayout {
  id: string;
  name: string;
  kind: WaterfallKind;
  shares: number;
  preference: number;
  converted: boolean;
  /** Paid against the liquidation preference. */
  preferencePaid: number;
  /** Paid from the residual (participation or as-converted). */
  residualPaid: number;
  total: number;
  perShare: number;
  capReached: boolean;
}

export interface WaterfallResult {
  proceeds: number;
  classes: ClassPayout[];
  /** Residual value per as-converted share. */
  commonPrice: number;
  optionsInTheMoney: boolean;
  preferencesCovered: boolean;
  /** Proceeds no class can absorb (only when every participant is capped). */
  unallocated: number;
}

/** Build waterfall classes from a cap table. Unissued pool shares receive nothing. */
export function waterfallClasses(cap: CapTable): WaterfallClass[] {
  const out: WaterfallClass[] = [];
  const commonIds = new Set(cap.classes.filter((c) => c.kind === 'common').map((c) => c.id));
  const commonPositions = cap.positions.filter((p) => commonIds.has(p.classId));
  out.push({
    id: 'common',
    name: 'Common',
    kind: 'common',
    shares: sum(commonPositions.map((p) => p.shares)),
    preference: 0,
    participation: 'full',
    capTotal: 0,
    seniority: 0,
    strike: 0,
    canConvert: false,
    holdings: commonPositions.map((p) => ({
      holderId: p.holderId,
      shares: p.shares,
      invested: p.invested,
    })),
    group: 'common',
    groupName: 'Common',
  });
  if (cap.pool.granted > 0) {
    out.push({
      id: 'options',
      name: 'Options',
      kind: 'options',
      shares: cap.pool.granted,
      preference: 0,
      participation: 'full',
      capTotal: 0,
      seniority: 0,
      strike: Math.max(0, cap.pool.avgStrike),
      canConvert: false,
      holdings: [{ holderId: null, shares: cap.pool.granted, invested: 0 }],
      group: 'options',
      groupName: 'Options',
    });
  }

  const preferred = cap.classes.filter((c) => c.kind === 'preferred');
  const nameById = new Map(cap.classes.map((c) => [c.id, c.name]));
  for (const cls of preferred) {
    const positions = cap.positions.filter((p) => p.classId === cls.id);
    const shares = sum(positions.map((p) => p.shares));
    if (shares <= 0) continue;
    out.push({
      id: cls.id,
      name: cls.name,
      kind: 'preferred',
      shares,
      preference: shares * cls.issuePrice * cls.prefMultiple,
      participation: cls.participation,
      capTotal: cls.participation === 'capped' ? shares * cls.issuePrice * cls.participationCap : 0,
      seniority: cls.seniority,
      strike: 0,
      canConvert: cls.participation !== 'full',
      holdings: positions.map((p) => ({
        holderId: p.holderId,
        shares: p.shares,
        invested: p.invested,
      })),
      group: cls.eventId ?? cls.id,
      groupName: nameById.get(cls.eventId ?? cls.id) ?? cls.name,
    });
  }

  if (cap.convertibles.length) {
    const prefRanks = preferred.map((c) => c.seniority);
    const safeRank = prefRanks.length ? Math.min(...prefRanks) : 1;
    const debtRank = (prefRanks.length ? Math.max(...prefRanks) : 1) + 1;
    const asConverted = liquidityConversionShares(cap);
    for (const c of cap.convertibles) {
      const shares = asConverted.get(c.id) ?? 0;
      const isNote = c.type === 'note';
      out.push({
        id: `convertible:${c.id}`,
        name: isNote ? 'Convertible note' : 'SAFE',
        kind: isNote ? 'note' : 'safe',
        shares,
        preference: isNote ? conversionAmount(c) : c.amount,
        participation: 'none',
        capTotal: 0,
        // SAFEs rank with preferred stock; notes are debt and come first.
        seniority: isNote ? debtRank : safeRank,
        strike: 0,
        canConvert: shares > 0,
        holdings: [{ holderId: c.holderId, shares, invested: c.amount }],
        group: isNote ? 'notes' : 'safes',
        groupName: isNote ? 'Convertible notes' : 'Unconverted SAFEs',
      });
    }
  }
  return out;
}

/**
 * Shares each capped SAFE or note would convert into at a sale (the post-money
 * SAFE's "Liquidity Capitalization": outstanding shares and granted options,
 * converting securities, but not the unissued pool).
 */
function liquidityConversionShares(cap: CapTable): Map<string, number> {
  const base = sum(cap.positions.map((p) => p.shares)) + cap.pool.granted;
  let F = 0;
  let pre = 0;
  const preShares = new Map<string, number>();
  const capped = (c: Convertible) => (c.cap != null && c.cap > 0 ? c.cap : null);
  for (const c of cap.convertibles) {
    const cp = capped(c);
    if (!cp) continue;
    if (c.type === 'post-safe') F += c.amount / cp;
    else {
      const n = (conversionAmount(c) * base) / cp;
      preShares.set(c.id, n);
      pre += n;
    }
  }
  const out = new Map<string, number>();
  if (F >= 1) return out;
  const liquidityCap = (base + pre) / (1 - F);
  for (const c of cap.convertibles) {
    const cp = capped(c);
    if (!cp) continue;
    out.set(c.id, c.type === 'post-safe' ? (c.amount / cp) * liquidityCap : preShares.get(c.id)!);
  }
  return out;
}

interface Distribution {
  preferencePaid: Map<string, number>;
  residualPaid: Map<string, number>;
  commonPrice: number;
  unallocated: number;
}

/** Distribute proceeds for a fixed set of converting classes. */
function distribute(
  classes: readonly WaterfallClass[],
  proceeds: number,
  converting: ReadonlySet<string>,
): Distribution {
  const preferencePaid = new Map<string, number>();
  let remaining = Math.max(0, proceeds);

  const holdsPreference = classes.filter((c) => c.preference > 0 && !converting.has(c.id));
  const ranks = [...new Set(holdsPreference.map((c) => c.seniority))].sort((a, b) => b - a);
  for (const rank of ranks) {
    const tier = holdsPreference.filter((c) => c.seniority === rank);
    const owed = sum(tier.map((c) => c.preference));
    const paid = Math.min(owed, remaining);
    for (const c of tier) preferencePaid.set(c.id, owed > 0 ? (c.preference * paid) / owed : 0);
    remaining -= paid;
  }

  // Residual participants and the slope breakpoints of total allocation T(p).
  type Participant = { id: string; shares: number; headroom: number; strike: number };
  const participants: Participant[] = [];
  for (const c of classes) {
    if (c.shares <= 0) continue;
    const converted = converting.has(c.id);
    if (c.kind === 'common' || c.kind === 'options' || converted) {
      participants.push({
        id: c.id,
        shares: c.shares,
        headroom: Infinity,
        strike: c.kind === 'options' ? c.strike : 0,
      });
    } else if (c.participation === 'full') {
      participants.push({ id: c.id, shares: c.shares, headroom: Infinity, strike: 0 });
    } else if (c.participation === 'capped') {
      const headroom = Math.max(0, c.capTotal - (preferencePaid.get(c.id) ?? 0));
      participants.push({ id: c.id, shares: c.shares, headroom, strike: 0 });
    }
  }

  const commonPrice = solveResidualPrice(participants, remaining);
  const residualPaid = new Map<string, number>();
  let allocated = 0;
  for (const p of participants) {
    const value = Math.min(p.shares * Math.max(0, commonPrice - p.strike), p.headroom);
    residualPaid.set(p.id, value);
    allocated += value;
  }
  return {
    preferencePaid,
    residualPaid,
    commonPrice,
    unallocated: Math.max(0, remaining - allocated),
  };
}

/**
 * Find the per-share price p with sum_i min(shares_i * max(0, p - strike_i), headroom_i) = R.
 * The left side is piecewise linear and nondecreasing in p, so walk its kinks.
 */
function solveResidualPrice(
  participants: ReadonlyArray<{ shares: number; headroom: number; strike: number }>,
  residual: number,
): number {
  if (residual <= 0 || participants.length === 0) return 0;
  type Kink = { at: number; delta: number };
  const kinks: Kink[] = [];
  let slope = 0;
  for (const p of participants) {
    if (p.headroom <= 0) continue;
    if (p.strike <= 0) slope += p.shares;
    else kinks.push({ at: p.strike, delta: p.shares });
    if (Number.isFinite(p.headroom)) {
      kinks.push({ at: Math.max(0, p.strike) + p.headroom / p.shares, delta: -p.shares });
    }
  }
  kinks.sort((a, b) => a.at - b.at);
  let price = 0;
  let total = 0;
  for (const k of kinks) {
    const next = total + slope * (k.at - price);
    if (slope > 0 && next >= residual) return price + (residual - total) / slope;
    total = next;
    price = k.at;
    slope += k.delta;
  }
  if (slope > 0) return price + (residual - total) / slope;
  return price; // everyone is capped; the rest is unallocated
}

function payoutOf(dist: Distribution, id: string): number {
  return (dist.preferencePaid.get(id) ?? 0) + (dist.residualPaid.get(id) ?? 0);
}

/** Payout per class for an explicit set of converting classes (no equilibrium search). */
export function payoutsFor(
  classes: readonly WaterfallClass[],
  proceeds: number,
  converting: ReadonlySet<string>,
): Map<string, number> {
  const dist = distribute(classes, proceeds, converting);
  return new Map(classes.map((c) => [c.id, payoutOf(dist, c.id)]));
}

/**
 * Conversion choices where no class gains by switching alone. Sequential best
 * responses starting from "nobody converts", with an exhaustive fallback.
 */
export function solveConversions(
  classes: readonly WaterfallClass[],
  proceeds: number,
): Set<string> {
  const candidates = classes
    .filter((c) => c.canConvert && c.shares > 0)
    .sort((a, b) => a.preference / a.shares - b.preference / b.shares);
  const converting = new Set<string>();
  if (candidates.length === 0 || proceeds <= 0) return converting;
  const tol = 1e-9 * Math.max(1, proceeds);

  const prefers = (id: string, set: Set<string>) => {
    const without = new Set(set);
    without.delete(id);
    const withIt = new Set(set);
    withIt.add(id);
    return (
      payoutOf(distribute(classes, proceeds, withIt), id) >
      payoutOf(distribute(classes, proceeds, without), id) + tol
    );
  };

  for (let sweep = 0; sweep < 4 * candidates.length + 8; sweep++) {
    let changed = false;
    for (const c of candidates) {
      const want = prefers(c.id, converting);
      if (want !== converting.has(c.id)) {
        if (want) converting.add(c.id);
        else converting.delete(c.id);
        changed = true;
      }
    }
    if (!changed) return converting;
  }

  if (candidates.length <= 12) {
    let best: Set<string> | null = null;
    for (let mask = 0; mask < 1 << candidates.length; mask++) {
      const set = new Set(candidates.filter((_, i) => mask & (1 << i)).map((c) => c.id));
      const stable = candidates.every((c) => prefers(c.id, set) === set.has(c.id));
      if (stable && (!best || set.size < best.size)) best = set;
    }
    if (best) return best;
  }
  return converting;
}

export function runWaterfall(
  classes: readonly WaterfallClass[],
  proceeds: number,
): WaterfallResult {
  const converting = solveConversions(classes, proceeds);
  const dist = distribute(classes, proceeds, converting);
  const totalPreference = sum(
    classes.filter((c) => !converting.has(c.id)).map((c) => c.preference),
  );
  const out: ClassPayout[] = classes.map((c) => {
    const preferencePaid = dist.preferencePaid.get(c.id) ?? 0;
    const residualPaid = dist.residualPaid.get(c.id) ?? 0;
    const total = preferencePaid + residualPaid;
    return {
      id: c.id,
      name: c.name,
      kind: c.kind,
      shares: c.shares,
      preference: c.preference,
      converted: converting.has(c.id),
      preferencePaid,
      residualPaid,
      total,
      perShare: c.shares > 0 ? total / c.shares : 0,
      capReached:
        c.participation === 'capped' &&
        !converting.has(c.id) &&
        c.capTotal > 0 &&
        total >= c.capTotal - 1e-6,
    };
  });
  const options = classes.find((c) => c.kind === 'options');
  return {
    proceeds: Math.max(0, proceeds),
    classes: out,
    commonPrice: dist.commonPrice,
    optionsInTheMoney: options ? dist.commonPrice > options.strike : false,
    preferencesCovered: proceeds >= totalPreference - 1e-6,
    unallocated: dist.unallocated,
  };
}

export interface HolderPayout {
  /** Null for the option pool. */
  holderId: string | null;
  payout: number;
  invested: number;
}

/** Split each class's payout across its holders by shares (by invested amount for SAFEs). */
export function holderPayouts(
  classes: readonly WaterfallClass[],
  result: WaterfallResult,
): HolderPayout[] {
  const byHolder = new Map<string | null, HolderPayout>();
  for (const c of classes) {
    const payout = result.classes.find((r) => r.id === c.id)?.total ?? 0;
    const basis = sum(c.holdings.map((h) => (c.shares > 0 ? h.shares : h.invested)));
    for (const h of c.holdings) {
      const weight = basis > 0 ? (c.shares > 0 ? h.shares : h.invested) / basis : 0;
      const entry = byHolder.get(h.holderId) ?? { holderId: h.holderId, payout: 0, invested: 0 };
      entry.payout += payout * weight;
      entry.invested += h.invested;
      byHolder.set(h.holderId, entry);
    }
  }
  return [...byHolder.values()];
}

export interface PayoutCurve {
  exits: number[];
  series: Array<{ id: string; name: string; values: number[] }>;
}

export function payoutCurve(
  classes: readonly WaterfallClass[],
  maxExit: number,
  steps = 200,
): PayoutCurve {
  const exits = Array.from({ length: steps + 1 }, (_, i) => (maxExit * i) / steps);
  const series = classes.map((c) => ({ id: c.id, name: c.name, values: [] as number[] }));
  for (const e of exits) {
    const r = runWaterfall(classes, e);
    r.classes.forEach((c, i) => series[i]!.values.push(c.total));
  }
  return { exits, series };
}

export interface Breakpoint {
  exit: number;
  description: string;
}

/**
 * Exit values where the shape of the waterfall changes: preferences covered,
 * options in the money, participation caps reached, and conversions.
 */
export function findBreakpoints(
  classes: readonly WaterfallClass[],
  maxExit: number,
  steps = 400,
): Breakpoint[] {
  const hasPreferences = classes.some((c) => c.preference > 0);
  const state = (e: number) => {
    const r = runWaterfall(classes, e);
    return {
      covered: hasPreferences && e > 0 && r.preferencesCovered,
      options: r.optionsInTheMoney,
      converted: new Set(r.classes.filter((c) => c.converted).map((c) => c.id)),
      capped: new Set(r.classes.filter((c) => c.capReached).map((c) => c.id)),
    };
  };
  type State = ReturnType<typeof state>;
  const key = (s: State) =>
    [s.covered, s.options, [...s.converted].sort().join(','), [...s.capped].sort().join(',')].join(
      '|',
    );
  const names = new Map(classes.map((c) => [c.id, c.name]));

  const out: Breakpoint[] = [];
  const report = (before: State, after: State, at: number) => {
    if (after.covered && !before.covered)
      out.push({ exit: at, description: 'All liquidation preferences are covered' });
    if (after.options && !before.options)
      out.push({ exit: at, description: 'Options are in the money' });
    for (const id of after.capped) {
      if (!before.capped.has(id))
        out.push({ exit: at, description: `${names.get(id)} reaches its participation cap` });
    }
    for (const id of after.converted) {
      if (!before.converted.has(id))
        out.push({ exit: at, description: `${names.get(id)} converts to common` });
    }
    for (const id of before.converted) {
      if (!after.converted.has(id))
        out.push({ exit: at, description: `${names.get(id)} goes back to its preference` });
    }
  };

  let prevE = 0;
  let prev = state(0);
  for (let i = 1; i <= steps; i++) {
    const e = (maxExit * i) / steps;
    const cur = state(e);
    // Several changes can fall inside one grid step; peel them off one at a time.
    for (let guard = 0; guard < 8 && key(cur) !== key(prev); guard++) {
      let lo = prevE;
      let hi = e;
      for (let it = 0; it < 48; it++) {
        const mid = (lo + hi) / 2;
        if (key(state(mid)) === key(prev)) lo = mid;
        else hi = mid;
      }
      const after = state(hi);
      report(prev, after, hi);
      prev = after;
      prevE = hi;
    }
    prevE = e;
    prev = cur;
  }
  return out.sort((a, b) => a.exit - b.exit);
}
