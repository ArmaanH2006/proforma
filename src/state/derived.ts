/** Memoized engine results derived from the deal. Each hook recomputes only when its inputs change. */
import { useMemo } from 'react';
import {
  buildHistory,
  computeMetrics,
  holderInvested,
  holderStakes,
  projectArr,
  projectOwnership,
  scoreScreen,
  sizeMarket,
  summarizeMetrics,
  t2d3Path,
  waterfallClasses,
  type Snapshot,
} from '../engine';
import { FUND_HOLDER_ID, dealEventIndex, formationCapTable } from './deal';
import { useStore } from './store';

export function useDeal() {
  return useStore((s) => s.deal);
}

export function useHistory(): Snapshot[] {
  const formation = useStore((s) => s.deal.formation);
  const events = useStore((s) => s.deal.events);
  return useMemo(() => buildHistory(formationCapTable({ formation }), events), [formation, events]);
}

export function useMetrics() {
  const inputs = useStore((s) => s.deal.metrics);
  return useMemo(() => {
    const results = computeMetrics(inputs);
    return { results, summary: summarizeMetrics(results, inputs.arr) };
  }, [inputs]);
}

export function useScreen() {
  const criteria = useStore((s) => s.deal.screen);
  const thesis = useStore((s) => s.deal.thesis);
  return useMemo(() => scoreScreen(criteria, thesis), [criteria, thesis]);
}

export function useMarket() {
  const market = useStore((s) => s.deal.market);
  return useMemo(() => sizeMarket(market), [market]);
}

export function useProjection() {
  const metrics = useStore((s) => s.deal.metrics);
  const projection = useStore((s) => s.deal.projection);
  return useMemo(() => {
    const arr = metrics.arr ?? 0;
    const growth =
      metrics.arr != null && metrics.arrPriorYear != null && metrics.arrPriorYear > 0
        ? metrics.arr / metrics.arrPriorYear - 1
        : null;
    return {
      arr,
      growth,
      company:
        arr > 0 && growth != null
          ? projectArr(arr, growth, projection.decay, projection.years)
          : [],
      t2d3: arr > 0 ? t2d3Path(arr, Math.min(projection.years, 5)) : [],
    };
  }, [metrics, projection]);
}

/** The snapshot just after the event where our fund invests. */
export function useDealSnapshot() {
  const events = useStore((s) => s.deal.events);
  const history = useHistory();
  const index = dealEventIndex({ events }) + 1;
  const snapshot = history[Math.min(index, history.length - 1)]!;
  return { index, snapshot };
}

export interface FundStake {
  invested: number;
  /** Ownership after each modeled event, starting with the deal event. */
  modeled: Array<{ label: string; ownership: number }>;
  /** Ownership after the last modeled event (SAFEs counted at their caps). */
  current: number;
  projected: ReturnType<typeof projectOwnership>;
  atExit: number;
  followOns: number;
}

export function useFundStake(): FundStake {
  const history = useHistory();
  const events = useStore((s) => s.deal.events);
  const futureRounds = useStore((s) => s.deal.futureRounds);
  return useMemo(() => {
    const start = dealEventIndex({ events }) + 1;
    const modeled = history.slice(Math.max(1, start)).map((snap) => ({
      label: snap.event?.label ?? 'Formation',
      ownership: holderStakes(snap.capTable).get(FUND_HOLDER_ID)?.percent ?? 0,
    }));
    const last = history[history.length - 1]!;
    const current = holderStakes(last.capTable).get(FUND_HOLDER_ID)?.percent ?? 0;
    const projected = projectOwnership(current, futureRounds);
    const atExit = projected.length ? projected[projected.length - 1]!.ownership : current;
    return {
      invested: holderInvested(last.capTable, FUND_HOLDER_ID),
      modeled,
      current,
      projected,
      atExit,
      followOns: projected.reduce((s, p) => s + p.followOn, 0),
    };
  }, [history, events, futureRounds]);
}

export function useWaterfallClasses(snapshotIndex: number) {
  const history = useHistory();
  const snap = history[Math.min(Math.max(0, snapshotIndex), history.length - 1)]!;
  return useMemo(() => ({ snapshot: snap, classes: waterfallClasses(snap.capTable) }), [snap]);
}
