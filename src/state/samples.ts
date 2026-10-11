/**
 * Sample deals. Both companies, their founders, and every investor other than
 * "Our fund" are fictional; the numbers are illustrative and sit near 2025-2026
 * medians where a median is cited.
 */
import { uid } from '../lib/id';
import {
  DEFAULT_CRITERIA,
  DEFAULT_FUTURE_ROUNDS,
  DEFAULT_THESIS,
  FUND_HOLDER_ID,
  SCHEMA_VERSION,
  emptyMetrics,
  type Deal,
} from './deal';
import { presetFund } from './fundPresets';

/** Today's date in the viewer's time zone, yyyy-mm-dd. */
function today(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function thesis(met: Record<string, boolean | null>) {
  return DEFAULT_THESIS.map((t) => ({ ...t, met: met[t.id] ?? null }));
}

function criteria(scores: Record<string, [number | null, string]>) {
  return DEFAULT_CRITERIA.map((c) => ({
    ...c,
    score: scores[c.id]?.[0] ?? null,
    note: scores[c.id]?.[1] ?? '',
  }));
}

export function corvane(): Deal {
  return {
    schema: SCHEMA_VERSION,
    id: uid('deal'),
    company: {
      name: 'Corvane',
      oneLiner:
        'Document AI that reads claim files for regional P&C insurers and drafts the adjuster’s first report.',
      website: 'corvane.example',
      location: 'Hartford, CT',
      founded: 2023,
      stage: 'Seed',
      sector: 'SaaS · AI for insurance',
      founders: [
        {
          id: 'f1',
          name: 'Priya Natarajan',
          role: 'CEO',
          background:
            'Eight years in claims operations at a top-ten P&C carrier. UConn School of Business alum.',
        },
        {
          id: 'f2',
          name: 'Daniel Okafor',
          role: 'CTO',
          background:
            'Former applied scientist on document understanding models; shipped OCR pipelines at scale.',
        },
      ],
    },
    thesis: thesis({ vertical: true, stage: true, moat: true, gap: true, alumni: true }),
    screen: criteria({
      team: [
        4,
        'Claims-operations founder plus a technical cofounder who has shipped document models. No sales leader yet.',
      ],
      market: [
        4,
        'About 6,000 North American carriers, MGAs, and TPAs. Claims is their largest controllable cost.',
      ],
      product: [
        3,
        'Integrations with core claims systems take months to build. Model quality alone is not a moat.',
      ],
      traction: [4, '$1.2M ARR across nine carriers, 216% growth, 118% net retention.'],
      deal: [4, 'About 17x ARR at $20M post, near the seed median. Pro rata rights available.'],
    }),
    market: { customers: 6_000, acv: 150_000, serviceableShare: 0.5, obtainableShare: 0.08 },
    metrics: {
      ...emptyMetrics(),
      arr: 1_200_000,
      arrPriorYear: 380_000,
      netNewArrQuarter: 330_000,
      nrr: 1.18,
      grr: 0.92,
      grossMargin: 0.74,
      monthlyNetBurn: 160_000,
      cash: 900_000,
      salesMarketingQuarter: 300_000,
      newCustomersQuarter: 6,
      acv: 48_000,
      fcfMargin: -1.4,
      headcount: 11,
      capitalRaised: 1_500_000,
      segment: 'mid',
    },
    projection: { decay: 0.3, years: 8 },
    holders: [
      { id: 'priya', name: 'Priya Natarajan', kind: 'founder' },
      { id: 'daniel', name: 'Daniel Okafor', kind: 'founder' },
      { id: 'granite', name: 'Granite Angels', kind: 'investor' },
      { id: 'northlight', name: 'Northlight Ventures', kind: 'investor' },
      { id: 'harborline', name: 'Harborline Capital', kind: 'investor' },
      { id: 'angels', name: 'Seed angels', kind: 'investor' },
      { id: 'series-a-lead', name: 'Series A lead', kind: 'investor' },
      { id: FUND_HOLDER_ID, name: 'Our fund', kind: 'fund' },
    ],
    formation: {
      positions: [
        { holderId: 'priya', shares: 4_600_000 },
        { holderId: 'daniel', shares: 4_000_000 },
      ],
      pool: { granted: 600_000, avgStrike: 0.12, unissued: 800_000 },
    },
    events: [
      {
        id: 'pre-seed',
        kind: 'convertibles',
        label: 'Pre-seed SAFEs',
        date: '2024-03-15',
        instruments: [
          {
            id: 'safe-granite',
            holderId: 'granite',
            type: 'post-safe',
            amount: 500_000,
            cap: 8_000_000,
            discount: null,
          },
          {
            id: 'safe-northlight',
            holderId: 'northlight',
            type: 'post-safe',
            amount: 1_000_000,
            cap: 12_000_000,
            discount: null,
          },
        ],
      },
      {
        id: 'seed',
        kind: 'priced',
        label: 'Series Seed',
        date: '2026-09-30',
        preMoney: 16_000_000,
        investments: [
          { holderId: 'harborline', amount: 3_500_000 },
          { holderId: 'northlight', amount: 250_000 },
          { holderId: FUND_HOLDER_ID, amount: 25_000 },
          { holderId: 'angels', amount: 225_000 },
        ],
        pool: { mode: 'target', percentPost: 0.1 },
        terms: { prefMultiple: 1, participation: 'none', participationCap: 3, seniority: 'pari' },
        pricePrecision: 4,
      },
      {
        id: 'series-a',
        kind: 'priced',
        label: 'Series A (projected)',
        date: '2028-03-31',
        preMoney: 60_000_000,
        investments: [{ holderId: 'series-a-lead', amount: 15_000_000 }],
        pool: { mode: 'target', percentPost: 0.1 },
        terms: { prefMultiple: 1, participation: 'none', participationCap: 3, seniority: 'pari' },
        pricePrecision: 4,
      },
    ],
    valuation: { exitYear: 7, arrMultiple: 5, targetMultiple: 10 },
    futureRounds: DEFAULT_FUTURE_ROUNDS.filter((r) => r.id !== 'series-a').map((r) => ({ ...r })),
    exit: { enterpriseValue: 250_000_000, debt: 0, feePercent: 0.02, snapshot: null },
    fund: presetFund('student'),
    memo: {
      analyst: '',
      date: today(),
      recommendation: 'invest',
      summary:
        'Corvane sells document AI to regional P&C insurers. Its models read claim files (first notice of loss, police reports, repair estimates) and draft the adjuster’s first report. The company has $1.2M ARR across nine carriers, up 216% year over year with 118% net retention, and is raising a $4.0M seed at $16.0M pre-money led by Harborline Capital.',
      thesis: [
        'Claims handling is the largest controllable expense for regional carriers, and most still key data from claim files by hand.',
        'A founder from claims operations shortens enterprise sales: nine carriers signed in eighteen months without a sales hire.',
        'Integrations with the two dominant core claims systems create switching costs that model quality alone would not.',
      ],
      product:
        'Corvane ingests the claim file, extracts parties, coverage, and loss details, and drafts the first report inside the carrier’s claims system. Adjusters edit and approve the draft. Average handling time on simple auto claims fell 31% at the two carriers with a full year of data.',
      competition:
        'Large insurtech platforms bundle similar extraction features for their own core systems, and horizontal document-AI vendors sell to the top twenty carriers. Corvane targets regional and mutual carriers that neither serves well.',
      risks: [
        {
          id: 'r1',
          risk: 'Carrier procurement cycles run six to nine months.',
          mitigant:
            'Nine of eleven pilots converted to contracts; the seed funds the first two account executives.',
        },
        {
          id: 'r2',
          risk: 'Gross margin of 74% sits just below the 75% SaaS target because of inference costs.',
          mitigant:
            'Moving extraction to a fine-tuned smaller model is on the roadmap. Track margin monthly.',
        },
        {
          id: 'r3',
          risk: 'A core-system vendor could ship a native feature.',
          mitigant:
            'Corvane is listed in both vendors’ marketplaces. Watch partner terms at renewal.',
        },
      ],
      nextSteps:
        'Reference calls with two carrier customers. Review the cohort data behind the 118% NRR. Confirm pro rata rights in the side letter.',
    },
  };
}

export function mossgrove(): Deal {
  return {
    schema: SCHEMA_VERSION,
    id: uid('deal'),
    company: {
      name: 'Mossgrove',
      oneLiner:
        'Evaluation and monitoring for LLM applications at banks, insurers, and health systems.',
      website: 'mossgrove.example',
      location: 'Stamford, CT',
      founded: 2025,
      stage: 'Pre-seed',
      sector: 'SaaS · AI infrastructure',
      founders: [
        {
          id: 'f1',
          name: 'Elena Brooks',
          role: 'CEO',
          background: 'Led model risk management for AI systems at a regional bank.',
        },
        {
          id: 'f2',
          name: 'Marcus Lin',
          role: 'CTO',
          background:
            'ML infrastructure engineer; built evaluation pipelines for production language models.',
        },
      ],
    },
    thesis: thesis({ vertical: true, stage: true, moat: null, gap: true, alumni: false }),
    screen: criteria({
      team: [4, 'Buyer-side founder from model risk plus a strong infrastructure engineer.'],
      market: [
        4,
        'Every regulated enterprise shipping LLM features needs model validation evidence.',
      ],
      product: [
        3,
        'Early. Open-source eval tools cover the basics; the edge is audit-ready reporting.',
      ],
      traction: [2, 'Three paying design partners at $32K each. No retention history yet.'],
      deal: [4, 'Post-money SAFE at a $15M cap, the median for $1-2.5M pre-seed rounds.'],
    }),
    market: { customers: 9_000, acv: 60_000, serviceableShare: 0.4, obtainableShare: 0.05 },
    metrics: {
      ...emptyMetrics(),
      arr: 96_000,
      grossMargin: 0.81,
      monthlyNetBurn: 55_000,
      cash: 310_000,
      acv: 32_000,
      headcount: 4,
      capitalRaised: 400_000,
      segment: 'enterprise',
    },
    projection: { decay: 0.3, years: 8 },
    holders: [
      { id: 'elena', name: 'Elena Brooks', kind: 'founder' },
      { id: 'marcus', name: 'Marcus Lin', kind: 'founder' },
      { id: 'angel-1', name: 'Angel investor', kind: 'investor' },
      { id: 'angel-2', name: 'Operator angel', kind: 'investor' },
      { id: 'cedar', name: 'Cedar Point Ventures', kind: 'investor' },
      { id: 'operators', name: 'Operator angels', kind: 'investor' },
      { id: 'seed-lead', name: 'Seed lead', kind: 'investor' },
      { id: FUND_HOLDER_ID, name: 'Our fund', kind: 'fund' },
    ],
    formation: {
      positions: [
        { holderId: 'elena', shares: 5_000_000 },
        { holderId: 'marcus', shares: 4_000_000 },
      ],
      pool: { granted: 200_000, avgStrike: 0.02, unissued: 800_000 },
    },
    events: [
      {
        id: 'angels',
        kind: 'convertibles',
        label: 'Angel SAFEs',
        date: '2025-06-01',
        instruments: [
          {
            id: 'safe-a1',
            holderId: 'angel-1',
            type: 'post-safe',
            amount: 150_000,
            cap: 8_000_000,
            discount: null,
          },
          {
            id: 'safe-a2',
            holderId: 'angel-2',
            type: 'post-safe',
            amount: 250_000,
            cap: 8_000_000,
            discount: null,
          },
        ],
      },
      {
        id: 'pre-seed',
        kind: 'convertibles',
        label: 'Pre-seed SAFEs',
        date: '2026-10-15',
        instruments: [
          {
            id: 'safe-cedar',
            holderId: 'cedar',
            type: 'post-safe',
            amount: 1_200_000,
            cap: 15_000_000,
            discount: null,
          },
          {
            id: 'safe-fund',
            holderId: FUND_HOLDER_ID,
            type: 'post-safe',
            amount: 25_000,
            cap: 15_000_000,
            discount: null,
          },
          {
            id: 'safe-ops',
            holderId: 'operators',
            type: 'post-safe',
            amount: 275_000,
            cap: 15_000_000,
            discount: 0.2,
          },
        ],
      },
      {
        id: 'seed',
        kind: 'priced',
        label: 'Seed (projected)',
        date: '2028-01-31',
        preMoney: 18_000_000,
        investments: [{ holderId: 'seed-lead', amount: 4_000_000 }],
        pool: { mode: 'target', percentPost: 0.1 },
        terms: { prefMultiple: 1, participation: 'none', participationCap: 3, seniority: 'pari' },
        pricePrecision: 4,
      },
    ],
    valuation: { exitYear: 8, arrMultiple: 5, targetMultiple: 20 },
    futureRounds: DEFAULT_FUTURE_ROUNDS.map((r) => ({ ...r })),
    exit: { enterpriseValue: 150_000_000, debt: 0, feePercent: 0.02, snapshot: null },
    fund: presetFund('student'),
    memo: {
      analyst: '',
      date: today(),
      recommendation: 'diligence',
      summary:
        'Mossgrove builds evaluation and monitoring for LLM applications in regulated industries, producing the validation evidence that model risk teams and examiners ask for. Three paying design partners. Raising $1.5M on post-money SAFEs at a $15M cap.',
      thesis: [
        'Regulators expect banks and insurers to validate AI models the way they validate credit models; LLMs do not fit existing tooling.',
        'The CEO has run model risk reviews and knows what an examiner accepts as evidence.',
        'Audit-ready reports are a wedge into a monitoring budget that grows with every LLM feature shipped.',
      ],
      product:
        'An evaluation harness that runs test suites against a customer’s LLM application, tracks drift in production, and exports reports mapped to model risk guidance.',
      competition:
        'Open-source evaluation libraries and general LLM observability startups. Mossgrove competes on regulatory reporting rather than developer tooling.',
      risks: [
        {
          id: 'r1',
          risk: 'Market size: at a $60K ACV the serviceable market is about $216M.',
          mitigant:
            'Expansion to monitoring and per-application pricing; test willingness to pay in diligence.',
        },
        {
          id: 'r2',
          risk: 'Observability platforms could add compliance reporting.',
          mitigant: 'Depth of model-risk workflows and examiner relationships; revisit at seed.',
        },
      ],
      nextSteps:
        'Call all three design partners. Ask for the pipeline of pilots and the pricing model for production monitoring.',
    },
  };
}

export function blankDeal(): Deal {
  const base = corvane();
  return {
    ...base,
    id: uid('deal'),
    company: {
      name: 'New company',
      oneLiner: '',
      website: '',
      location: '',
      founded: null,
      stage: 'Seed',
      sector: 'SaaS',
      founders: [{ id: 'f1', name: 'Founder', role: 'CEO', background: '' }],
    },
    thesis: DEFAULT_THESIS.map((t) => ({ ...t })),
    screen: DEFAULT_CRITERIA.map((c) => ({ ...c })),
    market: { customers: 0, acv: 0, serviceableShare: 0.5, obtainableShare: 0.05 },
    metrics: emptyMetrics(),
    holders: [
      { id: 'founder-1', name: 'Founder', kind: 'founder' },
      { id: 'lead', name: 'Lead investor', kind: 'investor' },
      { id: FUND_HOLDER_ID, name: 'Our fund', kind: 'fund' },
    ],
    formation: {
      positions: [{ holderId: 'founder-1', shares: 9_000_000 }],
      pool: { granted: 0, avgStrike: 0, unissued: 1_000_000 },
    },
    events: [
      {
        id: uid('evt'),
        kind: 'priced',
        label: 'Series Seed',
        date: today(),
        preMoney: 16_000_000,
        investments: [
          { holderId: 'lead', amount: 3_975_000 },
          { holderId: FUND_HOLDER_ID, amount: 25_000 },
        ],
        pool: { mode: 'target', percentPost: 0.1 },
        terms: { prefMultiple: 1, participation: 'none', participationCap: 3, seniority: 'pari' },
        pricePrecision: 4,
      },
    ],
    futureRounds: DEFAULT_FUTURE_ROUNDS.map((r) => ({ ...r })),
    exit: { enterpriseValue: 200_000_000, debt: 0, feePercent: 0.02, snapshot: null },
    memo: {
      analyst: '',
      date: today(),
      recommendation: 'diligence',
      summary: '',
      thesis: [''],
      product: '',
      competition: '',
      risks: [{ id: uid('risk'), risk: '', mitigant: '' }],
      nextSteps: '',
    },
  };
}

export const SAMPLES = [
  {
    id: 'corvane',
    label: 'Corvane',
    description: 'Seed round converting pre-seed SAFEs',
    make: corvane,
  },
  {
    id: 'mossgrove',
    label: 'Mossgrove',
    description: 'Pre-seed on post-money SAFEs',
    make: mossgrove,
  },
] as const;
