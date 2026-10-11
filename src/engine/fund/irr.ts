/** Internal rate of return for evenly spaced (annual) cash flows. */

export function npv(rate: number, flows: readonly number[]): number {
  let total = 0;
  let discount = 1;
  for (const cf of flows) {
    total += cf / discount;
    discount *= 1 + rate;
  }
  return total;
}

/**
 * Bisection on NPV(r) = 0 over [-99.99%, 10,000%]. Returns -1 when nothing comes
 * back, null when the flows have no sign change, and the bracket edge when the
 * rate lies outside it.
 */
export function irr(flows: readonly number[]): number | null {
  const hasNegative = flows.some((f) => f < 0);
  const hasPositive = flows.some((f) => f > 0);
  if (!hasNegative) return null;
  if (!hasPositive) return -1;
  let lo = -0.9999;
  let hi = 100;
  let fLo = npv(lo, flows);
  const fHi = npv(hi, flows);
  if (fLo * fHi > 0) return fLo > 0 ? hi : lo;
  for (let i = 0; i < 200; i++) {
    const mid = (lo + hi) / 2;
    const fMid = npv(mid, flows);
    if (Math.abs(fMid) < 1e-10 || hi - lo < 1e-12) return mid;
    if (fLo * fMid < 0) hi = mid;
    else {
      lo = mid;
      fLo = fMid;
    }
  }
  return (lo + hi) / 2;
}
