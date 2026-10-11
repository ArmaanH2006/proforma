/** The deal document: everything the workbench edits, in one serializable object. */
import type {
  CapTable,
  Criterion,
  FinancingEvent,
  FundParams,
  FutureRound,
  Holder,
  MarketInputs,
  OptionPool,
  SaasInputs,
  ShareClass,
  ThesisCheck,
} from '../engine';

export const SCHEMA_VERSION = 1;

/** The fund this workbench belongs to always uses this holder id. */
export const FUND_HOLDER_ID = 'fund';

export type Stage = 'Pre-seed' | 'Seed' | 'Series A';

export interface Founder {
  id: string;
  name: string;
  role: string;
  background: string;
}

export interface Risk {
  id: string;
  risk: string;
  mitigant: string;
}

export interface Memo {
  analyst: string;
  /** ISO date, yyyy-mm-dd. */
  date: string;
  recommendation: 'invest' | 'diligence' | 'pass';
  summary: string;
  thesis: string[];
  product: string;
  competition: string;
  risks: Risk[];
  nextSteps: string;
}

export interface Deal {
  schema: number;
  id: string;
  company: {
    name: string;
    oneLiner: string;
    website: string;
    location: string;
    founded: number | null;
    stage: Stage;
    sector: string;
    founders: Founder[];
  };
  thesis: ThesisCheck[];
  screen: Criterion[];
  market: MarketInputs;
  metrics: SaasInputs;
  projection: { decay: number; years: number };
  holders: Holder[];
  /** Cap table at formation: founder common stock and the option pool. */
  formation: { positions: Array<{ holderId: string; shares: number }>; pool: OptionPool };
  events: FinancingEvent[];
  valuation: { exitYear: number; arrMultiple: number; targetMultiple: number };
  /** Rounds after the last modeled event, for projecting ownership to exit. */
  futureRounds: FutureRound[];
  exit: {
    enterpriseValue: number;
    debt: number;
    /** Transaction fees as a fraction of enterprise value. */
    feePercent: number;
    /** Index into the cap table history; null means the latest. */
    snapshot: number | null;
  };
  fund: FundParams & { preset: string };
  memo: Memo;
}

export const COMMON_CLASS: ShareClass = {
  id: 'common',
  name: 'Common',
  kind: 'common',
  issuePrice: 0,
  prefMultiple: 0,
  participation: 'none',
  participationCap: 0,
  seniority: 0,
};

export function formationCapTable(deal: Pick<Deal, 'formation'>): CapTable {
  return {
    classes: [COMMON_CLASS],
    positions: deal.formation.positions.map((p) => ({
      holderId: p.holderId,
      classId: COMMON_CLASS.id,
      shares: Math.max(0, Math.round(p.shares)),
      invested: 0,
    })),
    pool: {
      granted: Math.max(0, Math.round(deal.formation.pool.granted)),
      avgStrike: Math.max(0, deal.formation.pool.avgStrike),
      unissued: Math.max(0, Math.round(deal.formation.pool.unissued)),
    },
    convertibles: [],
  };
}

export const DEFAULT_THESIS: ThesisCheck[] = [
  {
    id: 'vertical',
    label: 'Operates in a focus vertical (AI, cloud, data infrastructure)',
    met: null,
    required: true,
  },
  { id: 'stage', label: 'Raising between pre-seed and Series A', met: null, required: true },
  { id: 'moat', label: 'Has a technical moat or defensible IP', met: null, required: false },
  { id: 'gap', label: 'Addresses an underserved market gap', met: null, required: false },
  { id: 'alumni', label: 'Alumni on the founding team', met: null, required: false },
];

export const DEFAULT_CRITERIA: Criterion[] = [
  {
    id: 'team',
    label: 'Team',
    prompt: 'Founder-market fit, technical depth, ability to recruit and sell',
    weight: 30,
    score: null,
    note: '',
  },
  {
    id: 'market',
    label: 'Market',
    prompt: 'Size, growth, and how urgent the problem is for buyers',
    weight: 20,
    score: null,
    note: '',
  },
  {
    id: 'product',
    label: 'Product and moat',
    prompt: 'Differentiation and what keeps competitors out',
    weight: 20,
    score: null,
    note: '',
  },
  {
    id: 'traction',
    label: 'Traction',
    prompt: 'Revenue, retention, and efficiency against stage benchmarks',
    weight: 20,
    score: null,
    note: '',
  },
  {
    id: 'deal',
    label: 'Deal terms',
    prompt: 'Price against stage medians, terms, and the ownership our check buys',
    weight: 10,
    score: null,
    note: '',
  },
];

/** Carta medians, software companies: dilution by round (2026) and post-money by stage (2025). */
export const DEFAULT_FUTURE_ROUNDS: FutureRound[] = [
  { id: 'series-a', label: 'Series A', dilution: 0.18, postMoney: 60e6, proRata: false },
  { id: 'series-b', label: 'Series B', dilution: 0.12, postMoney: 145e6, proRata: false },
  { id: 'series-c', label: 'Series C', dilution: 0.1, postMoney: 300e6, proRata: false },
];

export function emptyMetrics(): SaasInputs {
  return {
    arr: null,
    arrPriorYear: null,
    netNewArrQuarter: null,
    nrr: null,
    grr: null,
    grossMargin: null,
    monthlyNetBurn: null,
    cash: null,
    salesMarketingQuarter: null,
    newCustomersQuarter: null,
    acv: null,
    fcfMargin: null,
    headcount: null,
    capitalRaised: null,
    segment: 'mid',
  };
}

/** The event in which our fund first invests, which the memo treats as "the deal". */
export function dealEventIndex(deal: Pick<Deal, 'events'>): number {
  const i = deal.events.findIndex((e) =>
    e.kind === 'priced'
      ? e.investments.some((inv) => inv.holderId === FUND_HOLDER_ID && inv.amount > 0)
      : e.instruments.some((inst) => inst.holderId === FUND_HOLDER_ID && inst.amount > 0),
  );
  return i >= 0 ? i : deal.events.length - 1;
}

export function holderName(deal: Pick<Deal, 'holders'>, id: string | null): string {
  if (id == null) return 'Option holders';
  return deal.holders.find((h) => h.id === id)?.name ?? 'Unknown holder';
}
