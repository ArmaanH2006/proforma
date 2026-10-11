/** ARR trajectories: the company's own growth with decay, and the T2D3 benchmark path. */

export interface ProjectionPoint {
  year: number;
  arr: number;
  /** Growth applied to reach this year (0 for year 0). */
  growth: number;
}

/**
 * Compound ARR forward with growth that decays each year:
 * g(t+1) = g(t) * (1 - decay). A decay of 0.2 means each year grows at 80% of
 * the prior year's rate.
 */
export function projectArr(
  arr: number,
  growth: number,
  decay: number,
  years: number,
): ProjectionPoint[] {
  const points: ProjectionPoint[] = [{ year: 0, arr, growth: 0 }];
  let g = growth;
  let value = arr;
  for (let y = 1; y <= years; y++) {
    value *= 1 + g;
    points.push({ year: y, arr: value, growth: g });
    g *= 1 - decay;
  }
  return points;
}

/** Triple, triple, double, double, double. */
export const T2D3_MULTIPLIERS = [3, 3, 2, 2, 2] as const;

export function t2d3Path(arr: number, years: number = T2D3_MULTIPLIERS.length): ProjectionPoint[] {
  const points: ProjectionPoint[] = [{ year: 0, arr, growth: 0 }];
  let value = arr;
  for (let y = 1; y <= years; y++) {
    const m = T2D3_MULTIPLIERS[Math.min(y - 1, T2D3_MULTIPLIERS.length - 1)]!;
    value *= m;
    points.push({ year: y, arr: value, growth: m - 1 });
  }
  return points;
}

/** First (fractional) year at which the path reaches `target`, interpolating on a log scale. */
export function yearsToReach(points: readonly ProjectionPoint[], target: number): number | null {
  const first = points[0];
  if (!first || first.arr <= 0) return null;
  if (first.arr >= target) return 0;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]!;
    const b = points[i]!;
    if (b.arr >= target && b.arr > a.arr) {
      const t = (Math.log(target) - Math.log(a.arr)) / (Math.log(b.arr) - Math.log(a.arr));
      return a.year + t * (b.year - a.year);
    }
  }
  return null;
}
