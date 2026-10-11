/** First-pass screen: thesis fit, a weighted scorecard, and bottom-up market sizing. */

export interface ThesisCheck {
  id: string;
  label: string;
  /** True = meets, false = does not, null = not yet known. */
  met: boolean | null;
  /** A required check that fails puts the deal outside the thesis. */
  required: boolean;
}

export interface Criterion {
  id: string;
  label: string;
  prompt: string;
  /** Relative weight; weights are normalized. */
  weight: number;
  /** 1-5, or null when not yet scored. */
  score: number | null;
  note: string;
}

export type Recommendation = 'advance' | 'discuss' | 'pass' | 'incomplete';

export interface ScreenResult {
  /** Weighted average of scored criteria, 1-5. Null if nothing is scored. */
  score: number | null;
  scoredWeight: number;
  thesis: 'in' | 'out' | 'open';
  failedRequired: string[];
  recommendation: Recommendation;
  contributions: Array<{ id: string; label: string; weight: number; score: number | null }>;
}

export const ADVANCE_AT = 3.75;
export const DISCUSS_AT = 3.0;

export function scoreScreen(
  criteria: readonly Criterion[],
  thesis: readonly ThesisCheck[],
): ScreenResult {
  const totalWeight = criteria.reduce((s, c) => s + Math.max(0, c.weight), 0);
  let weighted = 0;
  let scoredWeight = 0;
  for (const c of criteria) {
    if (c.score == null || c.weight <= 0) continue;
    weighted += c.score * c.weight;
    scoredWeight += c.weight;
  }
  const score = scoredWeight > 0 ? weighted / scoredWeight : null;
  const failedRequired = thesis.filter((t) => t.required && t.met === false).map((t) => t.label);
  const open = thesis.some((t) => t.required && t.met == null);
  const fit = failedRequired.length ? 'out' : open ? 'open' : 'in';

  let recommendation: Recommendation;
  if (fit === 'out') recommendation = 'pass';
  else if (score == null || scoredWeight < totalWeight * 0.6) recommendation = 'incomplete';
  else if (score >= ADVANCE_AT) recommendation = 'advance';
  else if (score >= DISCUSS_AT) recommendation = 'discuss';
  else recommendation = 'pass';

  return {
    score,
    scoredWeight: totalWeight > 0 ? scoredWeight / totalWeight : 0,
    thesis: fit,
    failedRequired,
    recommendation,
    contributions: criteria.map((c) => ({
      id: c.id,
      label: c.label,
      weight: totalWeight > 0 ? c.weight / totalWeight : 0,
      score: c.score,
    })),
  };
}

export interface MarketInputs {
  /** Number of companies (or users) that could buy the product. */
  customers: number;
  /** Annual contract value per customer. */
  acv: number;
  /** Share of the TAM the product can serve today (segment, geography, product fit). */
  serviceableShare: number;
  /** Share of the SAM the company can realistically win within about five years. */
  obtainableShare: number;
}

export interface MarketSizing {
  tam: number;
  sam: number;
  som: number;
  /** Share of SAM needed to reach $100M ARR, the usual venture-scale bar. */
  samShareFor100m: number;
}

export function sizeMarket(m: MarketInputs): MarketSizing {
  const tam = Math.max(0, m.customers) * Math.max(0, m.acv);
  const sam = tam * Math.min(1, Math.max(0, m.serviceableShare));
  const som = sam * Math.min(1, Math.max(0, m.obtainableShare));
  return { tam, sam, som, samShareFor100m: sam > 0 ? 100e6 / sam : Infinity };
}
