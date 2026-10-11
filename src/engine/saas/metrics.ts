/**
 * SaaS diligence metrics. Every input is optional; a metric is computed only
 * when its inputs are present, and graded against a published benchmark.
 */
import {
  arrBand,
  BURN_MULTIPLE_BENCHMARK,
  cacPaybackBenchmark,
  CCS_BENCHMARK,
  classify,
  GROSS_MARGIN_BENCHMARK,
  growthBenchmark,
  grrBenchmark,
  LTV_CAC_BENCHMARK,
  MAGIC_NUMBER_BENCHMARK,
  NRR_BENCHMARK,
  RULE_OF_40_BENCHMARK,
  RUNWAY_BENCHMARK,
  type Band,
  type Benchmark,
  type Level,
  type Segment,
} from './benchmarks';

export interface SaasInputs {
  /** Current annual recurring revenue. */
  arr: number | null;
  /** ARR twelve months ago. */
  arrPriorYear: number | null;
  /** Net new ARR added in the most recent quarter (new + expansion - churn - contraction). */
  netNewArrQuarter: number | null;
  /** Net revenue retention, trailing twelve months (1.1 = 110%). */
  nrr: number | null;
  /** Gross revenue retention, trailing twelve months. */
  grr: number | null;
  grossMargin: number | null;
  /** Average monthly net burn over the most recent quarter. */
  monthlyNetBurn: number | null;
  cash: number | null;
  /** Sales and marketing spend in the prior quarter. */
  salesMarketingQuarter: number | null;
  /** New customers won in the most recent quarter. */
  newCustomersQuarter: number | null;
  /** Average first-year contract value of new customers. */
  acv: number | null;
  /** Free cash flow margin, trailing twelve months (negative while burning). */
  fcfMargin: number | null;
  headcount: number | null;
  /** Total equity and convertible capital raised to date. */
  capitalRaised: number | null;
  segment: Segment;
}

export type MetricId =
  | 'growth'
  | 'nrr'
  | 'grr'
  | 'grossMargin'
  | 'burnMultiple'
  | 'magicNumber'
  | 'cacPayback'
  | 'ltvCac'
  | 'ruleOf40'
  | 'runway'
  | 'ccs'
  | 'arrPerFte';

export type MetricFormat = 'percent' | 'multiple' | 'months' | 'currency';

export interface MetricResult {
  id: MetricId;
  label: string;
  group: 'Growth' | 'Retention' | 'Efficiency' | 'Cash';
  value: number | null;
  format: MetricFormat;
  formula: string;
  /** What is missing when the value cannot be computed. */
  needs?: string;
  benchmark: Benchmark | null;
  band: Band | null;
  /** 'info' when shown without a grade. */
  level: Level | 'info' | 'na';
  note?: string;
  /** Lower values are better (burn multiple, payback, ...). */
  lowerIsBetter?: boolean;
}

const has = (x: number | null | undefined): x is number =>
  typeof x === 'number' && Number.isFinite(x);

/** Customer lifetime is capped so that near-zero churn cannot produce an infinite LTV. */
export const MAX_LIFETIME_YEARS = 10;

export function computeMetrics(i: SaasInputs): MetricResult[] {
  const out: MetricResult[] = [];
  const grade = (
    base: Omit<MetricResult, 'band' | 'level'>,
    opts: { infoOnly?: boolean } = {},
  ): MetricResult => {
    if (base.value == null || !base.benchmark) {
      return { ...base, band: null, level: base.value == null ? 'na' : 'info' };
    }
    const band = classify(base.value, base.benchmark);
    return { ...base, band, level: opts.infoOnly ? 'info' : (band?.level ?? 'na') };
  };

  // Growth
  const growth =
    has(i.arr) && has(i.arrPriorYear) && i.arrPriorYear > 0 ? i.arr / i.arrPriorYear - 1 : null;
  out.push(
    grade({
      id: 'growth',
      label: 'ARR growth (YoY)',
      group: 'Growth',
      value: growth,
      format: 'percent',
      formula: 'ARR today / ARR 12 months ago - 1',
      needs: 'ARR today and 12 months ago',
      benchmark: has(i.arr) ? growthBenchmark(i.arr) : null,
      note: has(i.arr) ? growthBenchmark(i.arr).note : undefined,
    }),
  );

  // Retention
  out.push(
    grade({
      id: 'nrr',
      label: 'Net revenue retention',
      group: 'Retention',
      value: has(i.nrr) ? i.nrr : null,
      format: 'percent',
      formula: 'Revenue from a cohort today / its revenue 12 months ago, expansion included',
      needs: 'NRR',
      benchmark: NRR_BENCHMARK,
    }),
  );
  out.push(
    grade({
      id: 'grr',
      label: 'Gross revenue retention',
      group: 'Retention',
      value: has(i.grr) ? i.grr : null,
      format: 'percent',
      formula: 'Same as NRR but without expansion; capped at 100%',
      needs: 'GRR',
      benchmark: grrBenchmark(i.segment),
    }),
  );

  // Efficiency
  out.push(
    grade({
      id: 'grossMargin',
      label: 'Gross margin',
      group: 'Efficiency',
      value: has(i.grossMargin) ? i.grossMargin : null,
      format: 'percent',
      formula: '(Revenue - cost of revenue) / revenue',
      needs: 'gross margin',
      benchmark: GROSS_MARGIN_BENCHMARK,
    }),
  );

  const quarterlyBurn = has(i.monthlyNetBurn) ? i.monthlyNetBurn * 3 : null;
  let burnMultiple: number | null = null;
  let burnNote: string | undefined;
  if (quarterlyBurn != null && has(i.netNewArrQuarter)) {
    if (quarterlyBurn <= 0) {
      burnMultiple = 0;
      burnNote = 'Cash-flow positive this quarter.';
    } else if (i.netNewArrQuarter > 0) {
      burnMultiple = quarterlyBurn / i.netNewArrQuarter;
    } else {
      burnMultiple = Infinity;
      burnNote = 'Burning cash with no net new ARR.';
    }
  }
  out.push(
    grade({
      id: 'burnMultiple',
      label: 'Burn multiple',
      group: 'Efficiency',
      value: burnMultiple,
      format: 'multiple',
      formula: 'Net burn / net new ARR, same quarter',
      needs: 'monthly net burn and net new ARR',
      benchmark: BURN_MULTIPLE_BENCHMARK,
      lowerIsBetter: true,
      note: burnNote,
    }),
  );

  const magic =
    has(i.netNewArrQuarter) && has(i.salesMarketingQuarter) && i.salesMarketingQuarter > 0
      ? i.netNewArrQuarter / i.salesMarketingQuarter
      : null;
  out.push(
    grade({
      id: 'magicNumber',
      label: 'Magic number',
      group: 'Efficiency',
      value: magic,
      format: 'multiple',
      formula: 'Net new ARR this quarter / sales and marketing spend last quarter',
      needs: 'net new ARR and S&M spend',
      benchmark: MAGIC_NUMBER_BENCHMARK,
    }),
  );

  const cac =
    has(i.salesMarketingQuarter) && has(i.newCustomersQuarter) && i.newCustomersQuarter > 0
      ? i.salesMarketingQuarter / i.newCustomersQuarter
      : null;
  const monthlyGrossProfit = has(i.acv) && has(i.grossMargin) ? (i.acv / 12) * i.grossMargin : null;
  const payback =
    cac != null && monthlyGrossProfit != null && monthlyGrossProfit > 0
      ? cac / monthlyGrossProfit
      : null;
  out.push(
    grade({
      id: 'cacPayback',
      label: 'CAC payback',
      group: 'Efficiency',
      value: payback,
      format: 'months',
      formula: 'CAC / (ACV / 12 x gross margin), where CAC = S&M spend / new customers',
      needs: 'S&M spend, new customers, ACV and gross margin',
      benchmark: cacPaybackBenchmark(i.segment),
      lowerIsBetter: true,
      note:
        cac != null
          ? `Blended CAC of about $${Math.round(cac).toLocaleString('en-US')}.`
          : undefined,
    }),
  );

  const annualChurn = has(i.grr) ? Math.max(0, 1 - Math.min(1, i.grr)) : null;
  const lifetime =
    annualChurn != null
      ? Math.min(MAX_LIFETIME_YEARS, annualChurn > 0 ? 1 / annualChurn : Infinity)
      : null;
  const ltv =
    has(i.acv) && has(i.grossMargin) && lifetime != null ? i.acv * i.grossMargin * lifetime : null;
  out.push(
    grade({
      id: 'ltvCac',
      label: 'LTV / CAC',
      group: 'Efficiency',
      value: ltv != null && cac != null && cac > 0 ? ltv / cac : null,
      format: 'multiple',
      formula: `(ACV x gross margin x lifetime) / CAC, lifetime = 1 / (1 - GRR), capped at ${MAX_LIFETIME_YEARS} years`,
      needs: 'ACV, gross margin, GRR, S&M spend and new customers',
      benchmark: LTV_CAC_BENCHMARK,
      note: 'Early-stage LTV rests on short retention history; weigh it lightly.',
    }),
  );

  // Cash
  const ruleOf40 = growth != null && has(i.fcfMargin) ? growth + i.fcfMargin : null;
  out.push(
    grade(
      {
        id: 'ruleOf40',
        label: 'Rule of 40',
        group: 'Cash',
        value: ruleOf40,
        format: 'percent',
        formula: 'ARR growth + free cash flow margin',
        needs: 'ARR growth and FCF margin',
        benchmark: RULE_OF_40_BENCHMARK,
        note: RULE_OF_40_BENCHMARK.note,
      },
      { infoOnly: !has(i.arr) || i.arr < 10e6 },
    ),
  );

  let runway: number | null = null;
  let runwayNote: string | undefined;
  if (has(i.cash) && has(i.monthlyNetBurn)) {
    if (i.monthlyNetBurn <= 0) {
      runway = Infinity;
      runwayNote = 'Not burning cash.';
    } else runway = i.cash / i.monthlyNetBurn;
  }
  out.push(
    grade({
      id: 'runway',
      label: 'Runway (before this round)',
      group: 'Cash',
      value: runway,
      format: 'months',
      formula: 'Cash on hand / monthly net burn',
      needs: 'cash and monthly net burn',
      benchmark: RUNWAY_BENCHMARK,
      note: runwayNote,
    }),
  );

  const burned = has(i.capitalRaised) && has(i.cash) ? i.capitalRaised - i.cash : null;
  out.push(
    grade({
      id: 'ccs',
      label: 'Cash conversion score',
      group: 'Cash',
      value: has(i.arr) && burned != null && burned > 0 ? i.arr / burned : null,
      format: 'multiple',
      formula: 'ARR / (capital raised - cash on hand)',
      needs: 'ARR, capital raised and cash',
      benchmark: CCS_BENCHMARK,
    }),
  );

  out.push(
    grade({
      id: 'arrPerFte',
      label: 'ARR per employee',
      group: 'Efficiency',
      value: has(i.arr) && has(i.headcount) && i.headcount > 0 ? i.arr / i.headcount : null,
      format: 'currency',
      formula: 'ARR / full-time employees',
      needs: 'ARR and headcount',
      benchmark: null,
    }),
  );

  return out;
}

export interface MetricSummary {
  graded: number;
  counts: Record<Level, number>;
  band: ReturnType<typeof arrBand> | null;
  /** 1-5 suggestion for the "traction" line of the quick screen. */
  suggestedScore: number | null;
}

const LEVEL_POINTS: Record<Level, number> = { strong: 5, ok: 3.5, weak: 2, poor: 1 };

export function summarizeMetrics(results: MetricResult[], arr: number | null): MetricSummary {
  const counts: Record<Level, number> = { strong: 0, ok: 0, weak: 0, poor: 0 };
  let points = 0;
  let graded = 0;
  for (const r of results) {
    if (r.level === 'na' || r.level === 'info') continue;
    counts[r.level]++;
    points += LEVEL_POINTS[r.level];
    graded++;
  }
  return {
    graded,
    counts,
    band: has(arr) ? arrBand(arr) : null,
    suggestedScore: graded >= 3 ? Math.round((points / graded) * 2) / 2 : null,
  };
}
