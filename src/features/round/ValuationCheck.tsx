import { Panel, SourceLink } from '../../components/Display';
import { NumberField } from '../../components/Field';
import { SOURCES, vcMethod, type PricedRoundReport, type Snapshot } from '../../engine';
import { money, pct } from '../../lib/format';
import { useDeal, useProjection } from '../../state/derived';
import { useStore } from '../../state/store';

/** Dilution each later round imposes on existing holders: 1 - existing shares / post-money shares. */
function laterDilution(
  history: Snapshot[],
  index: number,
): Array<{ label: string; dilution: number }> {
  return history.slice(index + 1).flatMap((s) => {
    const r = s.report;
    if (r?.kind !== 'priced' || r.postMoneyShares <= 0) return [];
    return [
      { label: s.event?.label ?? 'Round', dilution: 1 - r.existingShares / r.postMoneyShares },
    ];
  });
}

export function ValuationCheck({
  history,
  index,
  report,
}: {
  history: Snapshot[];
  index: number;
  report: PricedRoundReport;
}) {
  const deal = useDeal();
  const update = useStore((s) => s.update);
  const projection = useProjection();
  const v = deal.valuation;
  const point = projection.company[Math.min(v.exitYear, projection.company.length - 1)];
  const later = [
    ...laterDilution(history, index),
    ...deal.futureRounds.map((r) => ({ label: r.label, dilution: r.dilution })),
  ];
  const exitValue = point ? point.arr * v.arrMultiple : 0;
  const result = vcMethod({
    investment: report.newMoney,
    exitValue,
    targetMultiple: v.targetMultiple,
    futureDilution: later.map((l) => l.dilution),
  });
  const gap = result.impliedPostMoney > 0 ? report.postMoney / result.impliedPostMoney - 1 : null;

  return (
    <Panel
      title="Valuation check: the VC method"
      description="Work back from an exit to the most this round can pay and still return the target multiple after later dilution."
    >
      {!point ? (
        <div className="empty">
          Add ARR today and 12 months ago on the Metrics stage to project an exit.
        </div>
      ) : (
        <div className="valuation">
          <div className="fields three">
            <NumberField
              label="Exit year"
              kind="number"
              value={v.exitYear}
              min={1}
              max={deal.projection.years}
              onChange={(x) => update((d) => void (d.valuation.exitYear = Math.round(x ?? 7)))}
            />
            <NumberField
              label="Exit EV / ARR"
              kind="multiple"
              value={v.arrMultiple}
              min={0.5}
              max={50}
              onChange={(x) => update((d) => void (d.valuation.arrMultiple = x ?? 5))}
            />
            <NumberField
              label="Target multiple"
              kind="multiple"
              value={v.targetMultiple}
              min={1}
              max={100}
              onChange={(x) => update((d) => void (d.valuation.targetMultiple = x ?? 10))}
            />
          </div>
          <dl className="kv">
            <dt>Base-case ARR in year {point.year}</dt>
            <dd>{money(point.arr)}</dd>
            <dt>Exit value at {v.arrMultiple}x ARR</dt>
            <dd>{money(exitValue)}</dd>
            <dt>
              Ownership kept through{' '}
              {later.length ? later.map((l) => l.label).join(', ') : 'no later rounds'}
            </dt>
            <dd>{pct(result.retention)}</dd>
            <dt>Ownership this round needs today</dt>
            <dd>{pct(result.requiredOwnershipToday)}</dd>
            <dt>Post-money the method supports</dt>
            <dd>{money(result.impliedPostMoney)}</dd>
            <dt>Post-money as priced</dt>
            <dd>{money(report.postMoney)}</dd>
          </dl>
          {gap != null && (
            <p className="valuation-verdict">
              {gap <= 0 ? (
                <>
                  The round is priced <strong>{pct(-gap, 0)} below</strong> what a{' '}
                  {v.targetMultiple}x target supports under the base case.
                </>
              ) : (
                <>
                  The round is priced <strong>{pct(gap, 0)} above</strong> what a {v.targetMultiple}
                  x target supports. The base case has to beat its own forecast for this price to
                  work.
                </>
              )}
            </p>
          )}
          <p className="source">
            Later-round dilution uses the modeled rounds, then the defaults on the Exit stage (Carta
            medians for software companies). <SourceLink source={SOURCES.carta} />
          </p>
        </div>
      )}
    </Panel>
  );
}
