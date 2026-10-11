import { useMemo, useState } from 'react';
import { holderPayouts, holderStakes, runWaterfall, type PricedRoundReport } from '../engine';
import { money, multiple, pct } from '../lib/format';
import { REPO_URL } from '../lib/platform';
import { SourcesDialog } from './SourcesDialog';
import { FUND_HOLDER_ID } from '../state/deal';
import {
  useDealSnapshot,
  useHistory,
  useMetrics,
  useScreen,
  useWaterfallClasses,
} from '../state/derived';
import { useStore, VIEWS, type ViewId } from '../state/store';

const NAMES: Record<ViewId, string> = {
  screen: 'Screen',
  metrics: 'Metrics',
  round: 'Round',
  exit: 'Exit',
  fund: 'Fund',
  memo: 'Memo',
};

const RECOMMENDATION: Record<string, string> = {
  advance: 'Advance',
  discuss: 'Discuss',
  pass: 'Pass',
  incomplete: 'In progress',
};

export function Rail() {
  const view = useStore((s) => s.view);
  const setView = useStore((s) => s.setView);
  const deal = useStore((s) => s.deal);
  const screen = useScreen();
  const { summary } = useMetrics();
  const history = useHistory();
  const { snapshot } = useDealSnapshot();
  const [sourcesOpen, setSourcesOpen] = useState(false);
  const oursAtDeal = holderStakes(snapshot.capTable).get(FUND_HOLDER_ID)?.percent ?? 0;
  const lastIndex = deal.exit.snapshot ?? history.length - 1;
  const { classes } = useWaterfallClasses(lastIndex);

  const exitStatus = useMemo(() => {
    const proceeds =
      Math.max(0, deal.exit.enterpriseValue - deal.exit.debt) -
      deal.exit.enterpriseValue * deal.exit.feePercent;
    const result = runWaterfall(classes, Math.max(0, proceeds));
    const ours = holderPayouts(classes, result).find((h) => h.holderId === FUND_HOLDER_ID);
    if (!ours || ours.invested <= 0) return `at ${money(deal.exit.enterpriseValue)}`;
    return `${multiple(ours.payout / ours.invested)} at ${money(deal.exit.enterpriseValue)}`;
  }, [classes, deal.exit]);

  const report = snapshot.report;
  const roundStatus =
    report?.kind === 'priced'
      ? `${money((report as PricedRoundReport).postMoney)} post`
      : report?.kind === 'convertibles'
        ? `${money(report.raised)} SAFEs`
        : 'Formation';

  const status: Record<ViewId, string> = {
    screen:
      screen.score != null
        ? `${screen.score.toFixed(1)} · ${RECOMMENDATION[screen.recommendation]}`
        : 'Not scored',
    metrics: summary.graded
      ? `${summary.counts.strong} strong · ${summary.counts.weak + summary.counts.poor} flagged`
      : 'No metrics yet',
    round: `${roundStatus} · ${pct(oursAtDeal)} ours`,
    exit: exitStatus,
    fund: `${money(deal.fund.fundSize)} · ${money(deal.fund.initialCheck)} checks`,
    memo: { invest: 'Invest', diligence: 'More diligence', pass: 'Pass' }[deal.memo.recommendation],
  };

  return (
    <nav className="rail" aria-label="Deal stages">
      <div className="rail-label">Deal</div>
      {VIEWS.map((v, i) => (
        <button
          key={v}
          type="button"
          className="rail-item"
          aria-current={view === v ? 'page' : undefined}
          onClick={() => setView(v)}
        >
          <span className="step">{i + 1}</span>
          <span className="name">{NAMES[v]}</span>
          <span className="status">{status[v]}</span>
        </button>
      ))}
      <div className="rail-footer">
        <span>Saved in this browser as you type.</span>
        <button
          type="button"
          className="link-button rail-link"
          onClick={() => setSourcesOpen(true)}
        >
          Sources and method
        </button>
        {REPO_URL && (
          <a href={REPO_URL} target="_blank" rel="noreferrer" className="rail-link">
            Source code
          </a>
        )}
      </div>
      {sourcesOpen && <SourcesDialog onClose={() => setSourcesOpen(false)} />}
    </nav>
  );
}
