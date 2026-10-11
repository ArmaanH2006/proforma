import { useDeferredValue, useMemo } from 'react';
import { Button, Segmented } from '../../components/Controls';
import { Explainer, Issues, Panel, SourceLink, Stat, Stats } from '../../components/Display';
import { NumberField, TextField } from '../../components/Field';
import { ChartFrame } from '../../components/charts/ChartFrame';
import { Histogram } from '../../components/charts/Histogram';
import { LineChart } from '../../components/charts/LineChart';
import {
  bucketMean,
  CORRELATION_OUTCOMES,
  exitToReturnFund,
  simulateFund,
  SOURCES,
  type Percentiles,
} from '../../engine';
import { money, multiple, pct } from '../../lib/format';
import { FUND_HOLDER_ID } from '../../state/deal';
import { useDeal, useFundStake } from '../../state/derived';
import { FUND_PRESETS } from '../../state/fundPresets';
import { useStore } from '../../state/store';

const RUN_OPTIONS = [
  { value: '1000', label: '1K runs' },
  { value: '5000', label: '5K runs' },
  { value: '10000', label: '10K runs' },
] as const;

export function FundView() {
  const deal = useDeal();
  const update = useStore((s) => s.update);
  const fund = deal.fund;
  const deferred = useDeferredValue(fund);
  const sim = useMemo(() => simulateFund(deferred), [deferred]);
  const stale = deferred !== fund;
  const stake = useFundStake();
  const fundName = deal.holders.find((h) => h.id === FUND_HOLDER_ID)?.name ?? 'Our fund';
  const plan = sim.plan;
  const ok = sim.runs > 0;
  const setParam = (fn: (f: typeof fund) => void) =>
    update((d) => {
      fn(d.fund);
      d.fund.preset = 'custom';
    });

  const jCurve = useMemo(() => {
    const x = sim.jCurve.map((j) => j.year);
    return {
      x,
      p50: sim.jCurve.map((j) => j.p50),
      p10: sim.jCurve.map((j) => j.p10),
      p90: sim.jCurve.map((j) => j.p90),
    };
  }, [sim]);
  const trough = Math.min(...jCurve.p50);
  const breakeven = jCurve.p50.findIndex((v, i) => i > 0 && v >= 0);
  const dpiAt10 = sim.dpi[Math.min(10, sim.dpi.length - 1)]?.p50 ?? 0;
  const returner = exitToReturnFund(fund.fundSize, stake.atExit);
  const probSum = fund.outcomes.reduce((s, o) => s + o.probability, 0);

  return (
    <div className="view">
      <header className="view-header">
        <h1>Fund</h1>
        <p>
          Portfolio math for the fund writing the check: how many companies it can back, the spread
          of outcomes a power-law portfolio produces, and what this one deal has to do to matter.
          Every run is seeded, so results are reproducible.
        </p>
      </header>

      <Stats label="Fund summary">
        <Stat
          label="Portfolio companies"
          value={String(plan.companies)}
          sub={`${money(fund.initialCheck)} first checks`}
        />
        <Stat
          label="Investable capital"
          value={money(plan.investable)}
          sub={plan.totalFees > 0 ? `${money(plan.totalFees)} in fees` : 'No management fees'}
        />
        <Stat
          label="Median net TVPI"
          value={ok ? multiple(sim.netTvpi.p50, 2) : '—'}
          sub={
            ok ? `P10 ${multiple(sim.netTvpi.p10, 2)} · P90 ${multiple(sim.netTvpi.p90, 2)}` : ''
          }
          emphasis
        />
        <Stat
          label="Chance of losing money"
          value={ok ? pct(sim.probability.lossOfCapital, 0) : '—'}
          sub="Net TVPI under 1x"
        />
        <Stat
          label="Median net IRR"
          value={ok ? pct(sim.netIrr.p50) : '—'}
          sub={`${sim.runs.toLocaleString('en-US')} simulated funds`}
        />
      </Stats>

      <div className="sheet">
        <div className="stack inputs">
          <section className="panel">
            <div className="group">
              <div className="group-title">Fund</div>
              <TextField
                label="Fund name"
                value={fundName}
                onChange={(v) =>
                  update((d) => {
                    const h = d.holders.find((x) => x.id === FUND_HOLDER_ID);
                    if (h) h.name = v;
                  })
                }
              />
              <div className="field">
                <span className="field-label">Preset</span>
                <Segmented
                  ariaLabel="Fund preset"
                  fill
                  value={fund.preset}
                  options={[
                    ...FUND_PRESETS.map((p) => ({ value: p.id, label: p.label })),
                    { value: 'custom', label: 'Custom' },
                  ]}
                  onChange={(id) =>
                    update((d) => {
                      const p = FUND_PRESETS.find((x) => x.id === id);
                      if (!p) return;
                      Object.assign(d.fund, {
                        ...p.params,
                        followOnRate: { ...p.params.followOnRate },
                        preset: p.id,
                      });
                    })
                  }
                />
                <span className="field-hint">
                  {FUND_PRESETS.find((p) => p.id === fund.preset)?.description ??
                    'Your own settings'}
                </span>
              </div>
              <div className="fields">
                <NumberField
                  label="Fund size"
                  kind="money"
                  value={fund.fundSize}
                  min={1}
                  onChange={(v) => setParam((f) => void (f.fundSize = v ?? 1))}
                />
                <NumberField
                  label="First check"
                  kind="money"
                  value={fund.initialCheck}
                  min={1}
                  onChange={(v) => setParam((f) => void (f.initialCheck = v ?? 1))}
                />
                <NumberField
                  label="Management fee"
                  kind="percent"
                  value={fund.managementFee}
                  min={0}
                  max={0.05}
                  hint="Per year, on commitments"
                  onChange={(v) => setParam((f) => void (f.managementFee = v ?? 0))}
                />
                <NumberField
                  label="Fee years"
                  kind="years"
                  value={fund.feeYears}
                  min={0}
                  max={15}
                  onChange={(v) => setParam((f) => void (f.feeYears = Math.round(v ?? 0)))}
                />
                <NumberField
                  label="Carry"
                  kind="percent"
                  value={fund.carry}
                  min={0}
                  max={0.5}
                  hint="After LPs get capital back"
                  onChange={(v) => setParam((f) => void (f.carry = v ?? 0))}
                />
                <NumberField
                  label="Deployment years"
                  kind="years"
                  value={fund.deploymentYears}
                  min={1}
                  max={8}
                  onChange={(v) => setParam((f) => void (f.deploymentYears = Math.round(v ?? 1)))}
                />
              </div>
            </div>
            <div className="group">
              <div className="group-title">Reserves and follow-ons</div>
              <div className="fields">
                <NumberField
                  label="Reserves"
                  kind="percent"
                  value={fund.reserveRatio}
                  min={0}
                  max={0.8}
                  hint="Of investable capital"
                  onChange={(v) => setParam((f) => void (f.reserveRatio = v ?? 0))}
                />
                <NumberField
                  label="Follow-on step-up"
                  kind="multiple"
                  value={fund.followOnStepUp}
                  min={1}
                  max={10}
                  hint="Price vs. first check"
                  onChange={(v) => setParam((f) => void (f.followOnStepUp = v ?? 1))}
                />
                <NumberField
                  label="Winners that raise"
                  kind="percent"
                  value={fund.followOnRate.winners}
                  min={0}
                  max={1}
                  hint="Eventual 1x+ outcomes"
                  onChange={(v) => setParam((f) => void (f.followOnRate.winners = v ?? 0))}
                />
                <NumberField
                  label="Losers that raise"
                  kind="percent"
                  value={fund.followOnRate.losers}
                  min={0}
                  max={1}
                  hint="Eventual sub-1x outcomes"
                  onChange={(v) => setParam((f) => void (f.followOnRate.losers = v ?? 0))}
                />
              </div>
              <p className="field-hint">
                {plan.reserves > 0
                  ? `${money(plan.reserves)} of reserves across about ${plan.plannedFollowOns} follow-ons of ${money(plan.followOnCheck)}. A follow-on dollar is expected to return ${multiple(plan.expectedFollowOnMultiple, 2)}, against ${multiple(plan.expectedMultiple, 2)} for a first-check dollar.`
                  : 'No reserves: every dollar goes into first checks.'}
              </p>
            </div>
            <div className="group">
              <div className="group-title">Simulation</div>
              <Segmented
                ariaLabel="Number of runs"
                fill
                value={String(fund.simulations) as (typeof RUN_OPTIONS)[number]['value']}
                options={RUN_OPTIONS}
                onChange={(v) => update((d) => void (d.fund.simulations = Number(v)))}
              />
              <div className="row">
                <span className="muted" style={{ fontSize: 12 }}>
                  Seed {fund.seed}
                </span>
                <Button
                  size="sm"
                  variant="ghost"
                  icon="refresh"
                  onClick={() =>
                    update((d) => void (d.fund.seed = Math.floor(Math.random() * 1e9)))
                  }
                >
                  New seed
                </Button>
              </div>
            </div>
          </section>

          <Panel
            title="Outcome distribution"
            description="Chance of each outcome on a first check, the multiple range, and years to exit."
            footer={
              <>
                Bucket weights anchored to Correlation Ventures (65% under 1x, 25% at 1-5x, 6% at
                5-10x, 4% at 10x+); splits inside a bucket are assumptions.{' '}
                <SourceLink source={SOURCES.correlation} />
              </>
            }
            flush
          >
            <div className="table-wrap">
              <table className="data edit outcomes">
                <thead>
                  <tr>
                    <th>Outcome</th>
                    <th className="r">Chance</th>
                    <th className="r">Multiple</th>
                    <th className="r">Years</th>
                  </tr>
                </thead>
                <tbody>
                  {fund.outcomes.map((o, i) => (
                    <tr key={o.id}>
                      <td>
                        {o.label}
                        <span className="cell-sub">avg {multiple(bucketMean(o), 1)}</span>
                      </td>
                      <td className="r">
                        <NumberField
                          ariaLabel={`${o.label} probability`}
                          kind="percent"
                          value={o.probability}
                          min={0}
                          max={1}
                          onChange={(v) =>
                            setParam((f) => void (f.outcomes[i]!.probability = v ?? 0))
                          }
                        />
                      </td>
                      <td className="r muted">
                        {o.minMultiple === o.maxMultiple
                          ? multiple(o.minMultiple, 1)
                          : `${multiple(o.minMultiple, 1)}–${multiple(o.maxMultiple, 0)}`}
                      </td>
                      <td className="r muted">
                        {o.minYears}–{o.maxYears}
                      </td>
                    </tr>
                  ))}
                  <tr className="total">
                    <td>Total</td>
                    <td className="r">{pct(probSum, 1)}</td>
                    <td className="r" colSpan={2}>
                      Expected {multiple(plan.expectedMultiple, 2)}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
            {Math.abs(probSum - 1) > 0.001 && (
              <p className="field-hint" style={{ padding: '0 16px 12px' }}>
                Chances add to {pct(probSum, 1)}; the model rescales them to 100%.
              </p>
            )}
            <div style={{ padding: '0 16px 12px' }}>
              <Button
                size="sm"
                variant="ghost"
                icon="refresh"
                onClick={() =>
                  setParam((f) => void (f.outcomes = CORRELATION_OUTCOMES.map((o) => ({ ...o }))))
                }
              >
                Reset outcomes
              </Button>
            </div>
          </Panel>
        </div>

        <div className={`stack ${stale ? 'stale' : ''}`}>
          <Issues issues={sim.issues} />
          {ok && (
            <>
              <Panel
                title="Net TVPI across simulated funds"
                description="Total value returned to LPs per dollar they paid in, after fees and carry."
              >
                <ChartFrame
                  title={`Distribution of net TVPI, ${sim.runs.toLocaleString('en-US')} runs`}
                  subtitle={`Median ${multiple(sim.netTvpi.p50, 2)}. ${pct(sim.probability.atLeast2x, 0)} of runs reach 2x and ${pct(sim.probability.atLeast3x, 0)} reach 3x.`}
                  table={
                    <PercentileTable
                      rows={[
                        ['Net TVPI', sim.netTvpi, 'x'],
                        ['Gross multiple', sim.grossMultiple, 'x'],
                        ['Net IRR', sim.netIrr, '%'],
                      ]}
                    />
                  }
                >
                  <Histogram
                    ariaLabel="Histogram of net TVPI across simulated funds"
                    bins={sim.histogram}
                    formatEdge={(v) => `${v}x`}
                    highlightFrom={1}
                    lines={[
                      { value: sim.netTvpi.p50, label: `Median ${multiple(sim.netTvpi.p50, 2)}` },
                    ]}
                  />
                </ChartFrame>
                <p className="chart-note">
                  Bars below 1x are funds that lose money; they are drawn in gray.
                </p>
              </Panel>

              <Panel
                title="J-curve"
                description="Cumulative cash to and from LPs, as a multiple of the fund. Early fees and checks push it negative before exits pull it back."
              >
                <ChartFrame
                  title="Cumulative net cash flow to LPs"
                  subtitle={`Median trough ${multiple(trough, 2)} of the fund${breakeven > 0 ? `; breakeven in year ${breakeven}` : '; no breakeven in the median run'}. Median DPI by year 10: ${multiple(dpiAt10, 2)}.`}
                  legend={[
                    { label: 'Median run', color: 'var(--series-1)' },
                    { label: '10th to 90th percentile', color: 'var(--band)', shape: 'band' },
                  ]}
                  table={
                    <table className="data">
                      <thead>
                        <tr>
                          <th>Year</th>
                          <th className="r">P10</th>
                          <th className="r">Median</th>
                          <th className="r">P90</th>
                          <th className="r">Median DPI</th>
                        </tr>
                      </thead>
                      <tbody>
                        {sim.jCurve.map((j, i) => (
                          <tr key={j.year}>
                            <td>{j.year}</td>
                            <td className="r">{multiple(j.p10, 2)}</td>
                            <td className="r">{multiple(j.p50, 2)}</td>
                            <td className="r">{multiple(j.p90, 2)}</td>
                            <td className="r">{multiple(sim.dpi[i]?.p50 ?? 0, 2)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  }
                >
                  <LineChart
                    ariaLabel="Cumulative net cash flow to LPs by year, median with 10th to 90th percentile band"
                    x={jCurve.x}
                    series={[
                      {
                        id: 'p50',
                        label: 'Median run',
                        color: 'var(--series-1)',
                        values: jCurve.p50,
                      },
                    ]}
                    band={{ lower: jCurve.p10, upper: jCurve.p90, label: 'P10 to P90' }}
                    xFormat={(v) => `Yr ${v}`}
                    tooltipTitle={(v) => `Year ${v}`}
                    yFormat={(v) => `${v.toFixed(1)}x`}
                    height={240}
                  />
                </ChartFrame>
              </Panel>

              <Panel
                title="This deal in the portfolio"
                description="What one company has to do for the fund, given our ownership at exit."
              >
                <dl className="kv">
                  <dt>Our investment</dt>
                  <dd>{money(stake.invested)}</dd>
                  <dt>Share of the fund</dt>
                  <dd>{pct(stake.invested / fund.fundSize)}</dd>
                  <dt>Ownership at exit, after later rounds</dt>
                  <dd>{pct(stake.atExit)}</dd>
                  <dt>Exit that returns the whole fund</dt>
                  <dd>{Number.isFinite(returner) ? money(returner) : '—'}</dd>
                  <dt>Runs where any single company returned the fund</dt>
                  <dd>{pct(sim.probability.fundReturner, 0)}</dd>
                  <dt>Best company&rsquo;s share of gross proceeds, median run</dt>
                  <dd>{pct(sim.medianTopShare, 0)}</dd>
                </dl>
                <p className="chart-note">
                  Power law in one line: in the median simulated fund, one company produces{' '}
                  {pct(sim.medianTopShare, 0)} of all proceeds. A check is worth writing only if
                  this company could plausibly be that one.
                </p>
              </Panel>
            </>
          )}

          <Explainer title="How the fund model works">
            <p>
              Fees come off the top, so investable capital is the fund minus fees. The rest is split
              into equal first checks (written evenly over the deployment years) and reserves. Each
              company draws an outcome bucket, a multiple inside it (log-uniform, so most land near
              the bottom of the range), and an exit year.
            </p>
            <p>
              Companies that raise a next round get a follow-on check at the step-up price, so a
              follow-on dollar earns the company&rsquo;s multiple divided by the step-up. Winners
              raise more often than losers, which is the only signal the fund has. Carry is
              European: the GP earns its share only after LPs have every contributed dollar back.
            </p>
            <p>
              TVPI is total value to LPs over paid-in capital. DPI counts only what has been
              distributed, so it starts at zero and climbs to TVPI as companies exit; LPs care about
              DPI because it is cash. IRR uses annual cash flows. Results are seeded, so the same
              inputs always give the same numbers.
            </p>
          </Explainer>
        </div>
      </div>
    </div>
  );
}

function PercentileTable({ rows }: { rows: Array<[string, Percentiles, 'x' | '%']> }) {
  const f = (v: number, unit: 'x' | '%') => (unit === 'x' ? multiple(v, 2) : pct(v));
  return (
    <table className="data">
      <thead>
        <tr>
          <th>Metric</th>
          <th className="r">P10</th>
          <th className="r">P25</th>
          <th className="r">Median</th>
          <th className="r">P75</th>
          <th className="r">P90</th>
          <th className="r">Mean</th>
        </tr>
      </thead>
      <tbody>
        {rows.map(([label, p, unit]) => (
          <tr key={label}>
            <td>{label}</td>
            <td className="r">{f(p.p10, unit)}</td>
            <td className="r">{f(p.p25, unit)}</td>
            <td className="r">{f(p.p50, unit)}</td>
            <td className="r">{f(p.p75, unit)}</td>
            <td className="r">{f(p.p90, unit)}</td>
            <td className="r">{f(p.mean, unit)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
