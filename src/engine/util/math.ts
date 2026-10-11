/** Numeric helpers shared by the engine. */

/**
 * Round a share count down to a whole share. A small tolerance absorbs
 * floating-point noise so 588235.9999999 (really 588236) is not floored to 588235.
 */
export function floorShares(x: number): number {
  return Math.floor(x + 1e-6);
}

/** Round half away from zero to a fixed number of decimals. */
export function roundTo(x: number, decimals: number): number {
  const f = 10 ** decimals;
  return Math.sign(x) * (Math.round(Math.abs(x) * f + 1e-9) / f);
}

export function sum(values: readonly number[]): number {
  let total = 0;
  for (const v of values) total += v;
  return total;
}

export function clamp(x: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, x));
}

export function isPositive(x: number | null | undefined): x is number {
  return typeof x === 'number' && Number.isFinite(x) && x > 0;
}

/** Linear interpolation quantile on a pre-sorted array (type 7, same as numpy's default). */
export function quantileSorted(sorted: readonly number[], q: number): number {
  const n = sorted.length;
  if (n === 0) return Number.NaN;
  if (n === 1) return sorted[0]!;
  const pos = clamp(q, 0, 1) * (n - 1);
  const lo = Math.floor(pos);
  const hi = Math.min(n - 1, lo + 1);
  const t = pos - lo;
  return sorted[lo]! * (1 - t) + sorted[hi]! * t;
}
