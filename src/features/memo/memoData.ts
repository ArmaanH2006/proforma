/** Assemble everything the memo shows from the deal and the engine, once, for both the page and Markdown. */
import {
  exitToReturnFund,
  holderStakes,
  type ConvertibleEvent,
  type MarketSizing,
  type MetricResult,
  type PricedRoundEvent,
  type PricedRoundReport,
  type ScreenResult,
  type Snapshot,
} from '../../engine';
import { money, multiple, pct, price } from '../../lib/format';
import { FUND_HOLDER_ID, dealEventIndex, type Deal } from '../../state/deal';
import type { FundStake } from '../../state/derived';

export interface MemoTerm {
  label: string;
  value: string;
}

export interface MemoData {
  terms: MemoTerm[];
  traction: Array<{ label: string; value: string; grade: string }>;
  market: MarketSizing;
  returns: Array<{ exit: string; proceeds: string; multiple: string; fundShare: string }>;
  returnFundExit: string;
  ownershipNow: string;
  ownershipExit: string;
  screenScore: string;
  check: number;
}

const GRADE: Record<MetricResult['level'], string> = {
  strong: 'Strong',
  ok: 'On par',
  weak: 'Weak',
  poor: 'Concern',
  info: 'Info only',
  na: '—',
};

/** 1 -> "1x", 1.5 -> "1.5x": term-sheet style. */
function termMultiple(v: number): string {
  return Number.isInteger(v) ? `${v}x` : `${v.toFixed(1)}x`;
}

export function longDate(iso: string): string {
  const d = new Date(`${iso}T00:00:00`);
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
}

function fmtMetric(m: MetricResult): string {
  if (m.value == null) return '—';
  if (m.format === 'percent') return pct(m.value);
  if (m.format === 'months')
    return Number.isFinite(m.value) ? `${m.value.toFixed(1)} months` : 'No burn';
  if (m.format === 'currency') return money(m.value);
  return multiple(m.value, 2);
}

const KEY_METRICS = [
  'growth',
  'nrr',
  'grossMargin',
  'burnMultiple',
  'cacPayback',
  'runway',
] as const;

export function buildMemoData(
  deal: Deal,
  history: Snapshot[],
  metrics: MetricResult[],
  market: MarketSizing,
  screen: ScreenResult,
  stake: FundStake,
): MemoData {
  const dealIndex = dealEventIndex(deal);
  const event = deal.events[dealIndex];
  const snap = history[dealIndex + 1];
  const check = event
    ? event.kind === 'priced'
      ? event.investments
          .filter((i) => i.holderId === FUND_HOLDER_ID)
          .reduce((s, i) => s + i.amount, 0)
      : event.instruments
          .filter((i) => i.holderId === FUND_HOLDER_ID)
          .reduce((s, i) => s + i.amount, 0)
    : 0;
  const ownershipAfterDeal = snap
    ? (holderStakes(snap.capTable).get(FUND_HOLDER_ID)?.percent ?? 0)
    : 0;

  const terms: MemoTerm[] = [];
  if (event?.kind === 'priced' && snap?.report?.kind === 'priced') {
    const r = snap.report as PricedRoundReport;
    const e = event as PricedRoundEvent;
    terms.push(
      { label: 'Round', value: `${e.label}, priced equity` },
      { label: 'Round size', value: money(r.newMoney) },
      { label: 'Pre-money (headline)', value: money(e.preMoney) },
      { label: 'Post-money', value: money(r.postMoney) },
      { label: 'Price per share', value: price(r.pricePerShare) },
      {
        label: 'Preference',
        value: `${termMultiple(e.terms.prefMultiple)} ${e.terms.participation === 'none' ? 'non-participating' : e.terms.participation === 'full' ? 'participating' : `participating, capped at ${termMultiple(e.terms.participationCap)}`}, ${e.terms.seniority === 'senior' ? 'senior' : 'pari passu'}`,
      },
      { label: 'Option pool after', value: pct(r.poolPostPercent) },
    );
  } else if (event?.kind === 'convertibles') {
    const e = event as ConvertibleEvent;
    const ours = e.instruments.find((i) => i.holderId === FUND_HOLDER_ID) ?? e.instruments[0];
    const raised = e.instruments.reduce((s, i) => s + i.amount, 0);
    terms.push(
      { label: 'Round', value: `${e.label}` },
      { label: 'Raised on these terms', value: money(raised) },
      {
        label: 'Instrument',
        value: ours
          ? ours.type === 'post-safe'
            ? 'Post-money SAFE'
            : ours.type === 'pre-safe'
              ? 'Pre-money SAFE'
              : 'Convertible note'
          : '—',
      },
      { label: 'Valuation cap', value: ours?.cap ? money(ours.cap) : 'Uncapped' },
      { label: 'Discount', value: ours?.discount ? pct(ours.discount, 0) : 'None' },
    );
  }
  terms.push(
    { label: 'Our check', value: money(check) },
    {
      label: 'Our ownership',
      value: `${pct(ownershipAfterDeal)} now, ${pct(stake.atExit)} at exit (projected)`,
    },
  );

  const byId = new Map(metrics.map((m) => [m.id, m]));
  const traction = KEY_METRICS.map((id) => byId.get(id)!)
    .filter((m) => m && m.value != null)
    .map((m) => ({ label: m.label, value: fmtMetric(m), grade: GRADE[m.level] }));

  const totalIn = stake.invested + stake.followOns;
  const returns = [100e6, 250e6, 500e6, 1e9].map((ev) => {
    const proceeds = stake.atExit * ev;
    return {
      exit: money(ev),
      proceeds: money(proceeds),
      multiple: multiple(totalIn > 0 ? proceeds / totalIn : 0),
      fundShare: pct(proceeds / deal.fund.fundSize),
    };
  });

  return {
    terms,
    traction,
    market,
    returns,
    returnFundExit: money(exitToReturnFund(deal.fund.fundSize, stake.atExit)),
    ownershipNow: pct(ownershipAfterDeal),
    ownershipExit: pct(stake.atExit),
    screenScore: screen.score != null ? `${screen.score.toFixed(2)} / 5` : 'Not scored',
    check,
  };
}

const REC_TEXT: Record<Deal['memo']['recommendation'], string> = {
  invest: 'Invest',
  diligence: 'Continue diligence',
  pass: 'Pass',
};

export function recommendationText(deal: Deal, check: number): string {
  const r = deal.memo.recommendation;
  return r === 'invest' && check > 0 ? `Invest ${money(check)}` : REC_TEXT[r];
}

export function memoMarkdown(deal: Deal, data: MemoData): string {
  const m = deal.memo;
  const c = deal.company;
  const lines: string[] = [];
  const meta = [c.stage, c.sector, c.location, c.founded ? `Founded ${c.founded}` : '']
    .filter(Boolean)
    .join(' · ');
  lines.push(`# ${c.name}: investment memo`, '');
  if (c.oneLiner) lines.push(`_${c.oneLiner}_`, '');
  lines.push(`${meta}`, '');
  lines.push(`**Recommendation:** ${recommendationText(deal, data.check)}  `);
  lines.push(`**Screen score:** ${data.screenScore}  `);
  lines.push(`**Prepared by:** ${m.analyst || '—'}, ${longDate(m.date)}`, '');
  lines.push('## Terms', '', '| | |', '|---|---|');
  for (const t of data.terms) lines.push(`| ${t.label} | ${t.value} |`);
  lines.push('');
  if (m.summary) lines.push('## Summary', '', m.summary, '');
  const thesis = m.thesis.filter((t) => t.trim());
  if (thesis.length) lines.push('## Why we would invest', '', ...thesis.map((t) => `- ${t}`), '');
  if (c.founders.length) {
    lines.push('## Team', '');
    for (const f of c.founders)
      lines.push(`- **${f.name}**, ${f.role}${f.background ? `. ${f.background}` : ''}`);
    lines.push('');
  }
  lines.push(
    '## Market',
    '',
    `Bottom-up TAM ${money(data.market.tam)} (${deal.market.customers.toLocaleString('en-US')} customers × ${money(deal.market.acv)}), SAM ${money(data.market.sam)}, SOM ${money(data.market.som)}. Reaching $100M ARR takes ${pct(data.market.samShareFor100m)} of SAM.`,
    '',
  );
  if (m.product) lines.push('## Product and moat', '', m.product, '');
  if (data.traction.length) {
    lines.push('## Traction', '', '| Metric | Value | Benchmark |', '|---|---|---|');
    for (const t of data.traction) lines.push(`| ${t.label} | ${t.value} | ${t.grade} |`);
    lines.push('');
  }
  if (m.competition) lines.push('## Competition', '', m.competition, '');
  lines.push(
    '## Returns',
    '',
    `Exit needed to return the fund: ${data.returnFundExit}.`,
    '',
    '| Exit | Our proceeds | Multiple | Share of fund |',
    '|---|---|---|---|',
  );
  for (const r of data.returns)
    lines.push(`| ${r.exit} | ${r.proceeds} | ${r.multiple} | ${r.fundShare} |`);
  lines.push('');
  const risks = m.risks.filter((r) => r.risk.trim());
  if (risks.length) {
    lines.push('## Risks and mitigants', '', '| Risk | Mitigant |', '|---|---|');
    for (const r of risks) lines.push(`| ${r.risk} | ${r.mitigant} |`);
    lines.push('');
  }
  if (m.nextSteps) lines.push('## Next steps', '', m.nextSteps, '');
  return lines.join('\n');
}
