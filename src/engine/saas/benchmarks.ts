/**
 * Published benchmarks used to grade SaaS metrics. Each band is [min, max).
 * Labels say what the source says; where a band extends a source's single
 * threshold, the label says so.
 */

export type Level = 'strong' | 'ok' | 'weak' | 'poor';

export interface Source {
  label: string;
  /** Short attribution for tight spaces, e.g. "Bessemer". */
  short?: string;
  url?: string;
}

export interface Band {
  min: number;
  max: number;
  level: Level;
  label: string;
}

export interface Benchmark {
  bands: Band[];
  source: Source;
  /** Reference lines worth drawing on the scale (e.g. a median). */
  markers?: Array<{ value: number; label: string }>;
  note?: string;
}

export const SOURCES = {
  bessemer: {
    label: 'Bessemer Venture Partners, Scaling to $100 Million',
    short: 'Bessemer',
    url: 'https://www.bvp.com/atlas/scaling-to-100-million',
  },
  sacks: {
    label: 'David Sacks, The Burn Multiple',
    short: 'David Sacks',
    url: 'https://sacks.substack.com/p/the-burn-multiple-51a7e43cb200',
  },
  saasCapital: {
    label: 'SaaS Capital, retention benchmarks for private B2B SaaS (2025, $25-50K ACV)',
    short: 'SaaS Capital',
    url: 'https://www.saas-capital.com/research/saas-retention-benchmarks-for-private-b2b-companies/',
  },
  chartmogul: {
    label: 'ChartMogul SaaS metrics library, Magic Number',
    short: 'ChartMogul',
    url: 'https://chartmogul.com/saas-metrics/magic-number/',
  },
  grossMargin: {
    label: 'Benchmarkit 2025 via CloudZero (median about 77%, target 75%+)',
    short: 'Benchmarkit',
    url: 'https://www.cloudzero.com/blog/saas-gross-margin-benchmarks/',
  },
  t2d3: {
    label: 'Neeraj Agrawal (Battery Ventures), The SaaS Travel Adventure',
    short: 'Battery Ventures',
    url: 'https://techcrunch.com/2015/02/01/the-saas-travel-adventure/',
  },
  carta: {
    label: 'Carta, dilution by round for software companies (2026)',
    short: 'Carta',
    url: 'https://carta.com/data/linkedin-dilution-by-round-primary-vs-bridge/',
  },
  cartaPrivate: {
    label: 'Carta, State of Private Markets: 2025 in review',
    short: 'Carta',
    url: 'https://carta.com/data/state-of-private-markets-q4-2025-full-report/',
  },
  cartaPreSeed: {
    label: 'Carta, State of Pre-Seed: 2025 in review',
    short: 'Carta',
    url: 'https://carta.com/data/state-of-pre-seed-2025/',
  },
  correlation: {
    label: 'Correlation Ventures data on 21,000+ financings, 2001-2013, via Seth Levine',
    short: 'Correlation Ventures',
    url: 'https://sethlevine.com/archives/2014/08/venture-outcomes-are-even-more-skewed-than-you-think.html',
  },
  ycSafe: {
    label: 'Y Combinator, Post-Money Safe User Guide',
    short: 'Y Combinator',
    url: 'https://www.ycombinator.com/documents',
  },
  ruleOfThumb: { label: 'Rule of thumb, not a published benchmark', short: 'Rule of thumb' },
} satisfies Record<string, Source>;

export type ArrBand = 'pre' | '1-10' | '10-25' | '25-50' | '50-100' | '100+';

export function arrBand(arr: number): ArrBand {
  if (arr < 1e6) return 'pre';
  if (arr < 10e6) return '1-10';
  if (arr < 25e6) return '10-25';
  if (arr < 50e6) return '25-50';
  if (arr < 100e6) return '50-100';
  return '100+';
}

export const ARR_BAND_LABEL: Record<ArrBand, string> = {
  pre: 'Under $1M ARR',
  '1-10': '$1-10M ARR',
  '10-25': '$10-25M ARR',
  '25-50': '$25-50M ARR',
  '50-100': '$50-100M ARR',
  '100+': '$100M+ ARR',
};

/** Bessemer year-over-year ARR growth by ARR range: median and top-performer threshold. */
export const BESSEMER_GROWTH: Record<
  Exclude<ArrBand, 'pre'>,
  { median: number; average: number; top: number }
> = {
  '1-10': { median: 1.65, average: 2.0, top: 2.3 },
  '10-25': { median: 0.87, average: 1.15, top: 1.35 },
  '25-50': { median: 0.77, average: 0.95, top: 1.1 },
  '50-100': { median: 0.6, average: 0.6, top: 0.8 },
  '100+': { median: 0.57, average: 0.6, top: 0.8 },
};

const pct = (x: number) => `${Math.round(x * 100)}%`;

export function growthBenchmark(arr: number): Benchmark {
  const band = arrBand(arr);
  const ref = BESSEMER_GROWTH[band === 'pre' ? '1-10' : band];
  return {
    bands: [
      { min: -Infinity, max: 0, level: 'poor', label: 'Shrinking' },
      {
        min: 0,
        max: ref.median,
        level: 'weak',
        label: `Below the Bessemer median (${pct(ref.median)})`,
      },
      { min: ref.median, max: ref.top, level: 'ok', label: 'Between median and top performers' },
      { min: ref.top, max: Infinity, level: 'strong', label: `Top performers (${pct(ref.top)}+)` },
    ],
    markers: [
      { value: ref.median, label: 'Median' },
      { value: ref.top, label: 'Top' },
    ],
    source: SOURCES.bessemer,
    note:
      band === 'pre'
        ? 'Bessemer starts at $1M ARR; the $1-10M range is shown for reference.'
        : `Benchmarked against the ${ARR_BAND_LABEL[band]} range.`,
  };
}

export const NRR_BENCHMARK: Benchmark = {
  bands: [
    { min: -Infinity, max: 0.97, level: 'weak', label: 'Bottom quartile' },
    { min: 0.97, max: 1.11, level: 'ok', label: 'Middle half (median 102%)' },
    { min: 1.11, max: Infinity, level: 'strong', label: 'Top quartile (111%+)' },
  ],
  markers: [{ value: 1.02, label: 'Median' }],
  source: SOURCES.saasCapital,
};

export type Segment = 'smb' | 'mid' | 'enterprise';

export const SEGMENT_LABEL: Record<Segment, string> = {
  smb: 'SMB',
  mid: 'Mid-market',
  enterprise: 'Enterprise',
};

export function grrBenchmark(segment: Segment): Benchmark {
  if (segment === 'smb') {
    return {
      bands: [
        { min: -Infinity, max: 0.7, level: 'weak', label: 'Below the SMB range' },
        { min: 0.7, max: 0.8, level: 'ok', label: 'Bessemer SMB range (70-80%)' },
        { min: 0.8, max: Infinity, level: 'strong', label: 'Above the SMB range' },
      ],
      source: SOURCES.bessemer,
    };
  }
  return {
    bands: [
      { min: -Infinity, max: 0.8, level: 'weak', label: 'Below 80%' },
      { min: 0.8, max: 0.85, level: 'ok', label: 'Just under the typical range' },
      { min: 0.85, max: Infinity, level: 'strong', label: 'Bessemer typical range (85-90%)' },
    ],
    source: SOURCES.bessemer,
  };
}

export const GROSS_MARGIN_BENCHMARK: Benchmark = {
  bands: [
    { min: -Infinity, max: 0.6, level: 'weak', label: 'Below 60%' },
    { min: 0.6, max: 0.75, level: 'ok', label: 'Below the 75% target' },
    { min: 0.75, max: Infinity, level: 'strong', label: 'At or above the 75% target' },
  ],
  markers: [{ value: 0.77, label: 'Median' }],
  source: SOURCES.grossMargin,
};

export const BURN_MULTIPLE_BENCHMARK: Benchmark = {
  bands: [
    { min: 0, max: 1, level: 'strong', label: 'Amazing (under 1x)' },
    { min: 1, max: 1.5, level: 'strong', label: 'Great (1-1.5x)' },
    { min: 1.5, max: 2, level: 'ok', label: 'Good (1.5-2x)' },
    { min: 2, max: 3, level: 'weak', label: 'Suspect (2-3x)' },
    { min: 3, max: Infinity, level: 'poor', label: 'Bad (over 3x)' },
  ],
  source: SOURCES.sacks,
};

export const MAGIC_NUMBER_BENCHMARK: Benchmark = {
  bands: [
    { min: -Infinity, max: 0.5, level: 'weak', label: 'Improve efficiency before adding spend' },
    { min: 0.5, max: 0.75, level: 'ok', label: 'Acceptable' },
    { min: 0.75, max: Infinity, level: 'strong', label: 'Efficient enough to add spend' },
  ],
  source: SOURCES.chartmogul,
};

export const CAC_TARGET_MONTHS: Record<Segment, number> = { smb: 12, mid: 18, enterprise: 24 };

export function cacPaybackBenchmark(segment: Segment): Benchmark {
  const t = CAC_TARGET_MONTHS[segment];
  return {
    bands: [
      {
        min: 0,
        max: t,
        level: 'strong',
        label: `Within the ${SEGMENT_LABEL[segment]} target (${t} months)`,
      },
      { min: t, max: t * 1.5, level: 'ok', label: 'Up to 1.5x the target' },
      { min: t * 1.5, max: Infinity, level: 'weak', label: 'More than 1.5x the target' },
    ],
    source: SOURCES.bessemer,
    note: "Bessemer targets: SMB under 12 months, mid-market under 18, enterprise under 24. The middle band is this tool's extension.",
  };
}

export const LTV_CAC_BENCHMARK: Benchmark = {
  bands: [
    { min: -Infinity, max: 1, level: 'poor', label: 'Customers cost more than they return' },
    { min: 1, max: 3, level: 'weak', label: 'Below 3x' },
    { min: 3, max: Infinity, level: 'strong', label: '3x or better' },
  ],
  source: SOURCES.bessemer,
};

export const RULE_OF_40_BENCHMARK: Benchmark = {
  bands: [
    { min: -Infinity, max: 0.4, level: 'weak', label: 'Below 40%' },
    { min: 0.4, max: Infinity, level: 'strong', label: '40% or more' },
  ],
  source: SOURCES.bessemer,
  note: 'Bessemer applies the Rule of 40 to scaled companies.',
};

export const RUNWAY_BENCHMARK: Benchmark = {
  bands: [
    { min: 0, max: 6, level: 'poor', label: 'Under 6 months' },
    { min: 6, max: 12, level: 'weak', label: '6-12 months' },
    { min: 12, max: 18, level: 'ok', label: '12-18 months' },
    { min: 18, max: Infinity, level: 'strong', label: '18 months or more' },
  ],
  source: SOURCES.ruleOfThumb,
};

export const CCS_BENCHMARK: Benchmark = {
  bands: [
    { min: -Infinity, max: 0.5, level: 'weak', label: 'Below the 0.5x early-stage average' },
    { min: 0.5, max: 1, level: 'ok', label: 'Around the $1-10M ARR average' },
    { min: 1, max: Infinity, level: 'strong', label: 'Best in class (1x+)' },
  ],
  source: SOURCES.bessemer,
};

export function classify(value: number, benchmark: Benchmark): Band | null {
  if (Number.isNaN(value)) return null;
  for (const b of benchmark.bands) {
    if (value >= b.min && (value < b.max || (value === Infinity && b.max === Infinity))) return b;
  }
  return null;
}
