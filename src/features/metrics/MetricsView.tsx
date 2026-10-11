import { useMemo } from 'react';
import { Segmented } from '../../components/Controls';
import { Explainer, LevelBadge, Panel, SourceLink, Stat, Stats } from '../../components/Display';
import { NumberField } from '../../components/Field';
import { BenchmarkTrack } from '../../components/charts/BenchmarkTrack';
import { ChartFrame } from '../../components/charts/ChartFrame';
import { LineChart } from '../../components/charts/LineChart';
import {
  ARR_BAND_LABEL,
  BESSEMER_GROWTH,
  CAC_TARGET_MONTHS,
  SOURCES,
  yearsToReach,
  type MetricResult,
  type SaasInputs,
  type Segment,
} from '../../engine';
import { money, months, multiple, pct, years } from '../../lib/format';
import { useDeal, useMetrics, useProjection } from '../../state/derived';
import { useStore } from '../../state/store';

const SEGMENTS: ReadonlyArray<{ value: Segment; label: string }> = [
  { value: 'smb', label: 'SMB' },
  { value: 'mid', label: 'Mid-market' },
  { value: 'enterprise', label: 'Enterprise' },
];

function formatValue(m: MetricResult): string {
  if (m.value == null) return '—';
  switch (m.format) {
    case 'percent':
      return pct(m.value);
    case 'multiple':
      return multiple(m.value, 2);
    case 'months':
      return months(m.value);
    case 'currency':
      return money(m.value);
  }
}

function trackDomain(m: MetricResult, inputs: SaasInputs): [number, number] | null {
  switch (m.id) {
    case 'growth': {
      const top = inputs.arr != null && inputs.arr >= 10e6 ? 1.6 : BESSEMER_GROWTH['1-10'].top;
      return [0, Math.max(1, top * 1.4)];
    }
    case 'nrr':
      return [0.8, 1.4];
    case 'grr':
      return [0.6, 1];
    case 'grossMargin':
      return [0.4, 1];
    case 'burnMultiple':
      return [0, 4];
    case 'magicNumber':
      return [0, 1.5];
    case 'cacPayback':
      return [0, CAC_TARGET_MONTHS[inputs.segment] * 2.5];
    case 'ltvCac':
      return [0, 8];
    case 'ruleOf40':
      return [-0.5, 1.5];
    case 'runway':
      return [0, 30];
    case 'ccs':
      return [0, 2];
    default:
      return null;
  }
}

function trackFormat(m: MetricResult) {
  return (v: number) => {
    if (m.format === 'percent') return `${Math.round(v * 100)}%`;
    if (m.format === 'months') return `${Math.round(v)}`;
    if (m.format === 'multiple') return `${Number(v.toFixed(2))}x`;
    return String(v);
  };
}

const GROUPS = ['Growth', 'Retention', 'Efficiency', 'Cash'] as const;

export function MetricsView() {
  const deal = useDeal();
  const update = useStore((s) => s.update);
  const { results, summary } = useMetrics();
  const projection = useProjection();
  const m = deal.metrics;
  const set = (key: Exclude<keyof SaasInputs, 'segment'>) => (v: number | null) =>
    update((d) => void (d.metrics[key] = v));
  const byId = Object.fromEntries(results.map((r) => [r.id, r]));

  const chart = useMemo(() => {
    const n = Math.max(projection.company.length, projection.t2d3.length);
    const x = Array.from({ length: n }, (_, i) => i);
    const company = x.map((i) => projection.company[i]?.arr ?? null);
    const t2d3 = x.map((i) => projection.t2d3[i]?.arr ?? null);
    return { x, company, t2d3 };
  }, [projection]);

  const toTarget = yearsToReach(projection.company, 100e6);
  const t2d3ToTarget = yearsToReach(projection.t2d3, 100e6);
  const flagged = summary.counts.weak + summary.counts.poor;

  return (
    <div className="view">
      <header className="view-header">
        <h1>Metrics</h1>
        <p>
          SaaS traction and efficiency, graded against published benchmarks for the company&rsquo;s
          ARR range. Leave a field empty if the company has not shared it; metrics that need it will
          say so.
        </p>
      </header>

      <Stats label="Metrics summary">
        <Stat
          label="ARR"
          value={money(m.arr)}
          sub={summary.band ? ARR_BAND_LABEL[summary.band] : 'Not entered'}
        />
        <Stat
          label="Growth, year over year"
          value={formatValue(byId.growth!)}
          sub={`From ${money(m.arrPriorYear)}`}
        />
        <Stat
          label="Burn multiple"
          value={formatValue(byId.burnMultiple!)}
          sub={byId.burnMultiple!.band?.label ?? 'Needs burn and net new ARR'}
        />
        <Stat
          label="Runway before the round"
          value={formatValue(byId.runway!)}
          sub={m.cash != null ? `${money(m.cash)} in the bank` : '—'}
        />
        <Stat
          label="Grades"
          value={summary.graded ? `${summary.counts.strong} of ${summary.graded} strong` : '—'}
          sub={flagged ? `${flagged} flagged for diligence` : 'Nothing flagged'}
          emphasis
        />
      </Stats>

      <div className="sheet">
        <div className="stack inputs">
          <section className="panel">
            <div className="group">
              <div className="group-title">Revenue</div>
              <div className="fields">
                <NumberField
                  label="ARR today"
                  kind="money"
                  optional
                  value={m.arr}
                  onChange={set('arr')}
                />
                <NumberField
                  label="ARR 12 months ago"
                  kind="money"
                  optional
                  value={m.arrPriorYear}
                  onChange={set('arrPriorYear')}
                />
                <NumberField
                  className="span-2"
                  label="Net new ARR, last quarter"
                  kind="money"
                  optional
                  hint="New plus expansion, minus churn and contraction"
                  value={m.netNewArrQuarter}
                  onChange={set('netNewArrQuarter')}
                />
              </div>
            </div>
            <div className="group">
              <div className="group-title">Retention, trailing 12 months</div>
              <div className="fields">
                <NumberField
                  label="Net revenue retention"
                  kind="percent"
                  optional
                  value={m.nrr}
                  onChange={set('nrr')}
                />
                <NumberField
                  label="Gross revenue retention"
                  kind="percent"
                  optional
                  max={1}
                  value={m.grr}
                  onChange={set('grr')}
                />
              </div>
            </div>
            <div className="group">
              <div className="group-title">Unit economics</div>
              <div className="field">
                <span className="field-label">Customer segment</span>
                <Segmented
                  ariaLabel="Customer segment"
                  fill
                  value={m.segment}
                  options={SEGMENTS}
                  onChange={(v) => update((d) => void (d.metrics.segment = v))}
                />
              </div>
              <div className="fields">
                <NumberField
                  label="Gross margin"
                  kind="percent"
                  optional
                  max={1}
                  value={m.grossMargin}
                  onChange={set('grossMargin')}
                />
                <NumberField
                  label="Average ACV, new customers"
                  kind="money"
                  optional
                  value={m.acv}
                  onChange={set('acv')}
                />
                <NumberField
                  label="S&M spend, prior quarter"
                  kind="money"
                  optional
                  value={m.salesMarketingQuarter}
                  onChange={set('salesMarketingQuarter')}
                />
                <NumberField
                  label="New customers, last quarter"
                  kind="number"
                  optional
                  value={m.newCustomersQuarter}
                  onChange={set('newCustomersQuarter')}
                />
              </div>
            </div>
            <div className="group">
              <div className="group-title">Cash and team</div>
              <div className="fields">
                <NumberField
                  label="Monthly net burn"
                  kind="money"
                  optional
                  value={m.monthlyNetBurn}
                  onChange={set('monthlyNetBurn')}
                />
                <NumberField
                  label="Cash on hand"
                  kind="money"
                  optional
                  value={m.cash}
                  onChange={set('cash')}
                />
                <NumberField
                  label="Capital raised to date"
                  kind="money"
                  optional
                  value={m.capitalRaised}
                  onChange={set('capitalRaised')}
                />
                <NumberField
                  label="FCF margin"
                  kind="percent"
                  optional
                  hint="Negative while burning"
                  value={m.fcfMargin}
                  onChange={set('fcfMargin')}
                />
                <NumberField
                  label="Headcount"
                  kind="number"
                  optional
                  value={m.headcount}
                  onChange={set('headcount')}
                />
              </div>
            </div>
          </section>
        </div>

        <div className="stack">
          <Panel
            title="Benchmarks"
            description="Each metric is placed on its benchmark scale. Ticks mark the band edges; the dot is this company."
            flush
          >
            <div className="metric-list">
              {GROUPS.map((g) => (
                <div key={g} className="metric-group">
                  <div className="metric-group-title">{g}</div>
                  {results
                    .filter((r) => r.group === g)
                    .map((r) => {
                      const domain = trackDomain(r, m);
                      return (
                        <div key={r.id} className="metric-row">
                          <div className="metric-name">
                            <strong>{r.label}</strong>
                            <span className="mono muted">{r.formula}</span>
                          </div>
                          <div className="metric-value num">{formatValue(r)}</div>
                          <div className="metric-track">
                            {domain && r.benchmark ? (
                              <BenchmarkTrack
                                value={r.value}
                                bands={r.benchmark.bands}
                                domain={domain}
                                format={trackFormat(r)}
                                markers={r.benchmark.markers}
                              />
                            ) : (
                              <span className="muted metric-nobench">No published benchmark</span>
                            )}
                          </div>
                          <div className="metric-verdict">
                            <LevelBadge level={r.level} />
                            <span className="metric-band">
                              {r.value == null
                                ? `Needs ${r.needs}`
                                : r.level === 'info'
                                  ? r.benchmark
                                    ? 'Not graded below $10M ARR'
                                    : 'Shown for reference'
                                  : (r.band?.label ?? '')}
                            </span>
                            {r.value != null && r.note && (
                              <span className="metric-note">{r.note}</span>
                            )}
                            {r.benchmark && r.value != null && (
                              <SourceLink source={r.benchmark.source} short />
                            )}
                          </div>
                        </div>
                      );
                    })}
                </div>
              ))}
            </div>
          </Panel>

          <Panel
            title="ARR trajectory"
            description="The company's growth carried forward with annual decay, against the T2D3 path from today's ARR."
            actions={
              <div className="row">
                <NumberField
                  ariaLabel="Growth decay per year"
                  kind="percent"
                  value={deal.projection.decay}
                  min={0}
                  max={0.9}
                  onChange={(v) => update((d) => void (d.projection.decay = v ?? 0))}
                  className="compact-field"
                />
                <span className="muted" style={{ fontSize: 12 }}>
                  decay / yr
                </span>
              </div>
            }
          >
            {projection.company.length ? (
              <ChartFrame
                title="Projected ARR, log scale"
                subtitle={
                  <>
                    Base case reaches $100M ARR{' '}
                    {toTarget != null
                      ? `in ${years(toTarget)}`
                      : `beyond year ${deal.projection.years}`}
                    ; T2D3{' '}
                    {t2d3ToTarget != null ? `in ${years(t2d3ToTarget)}` : 'not within five years'}.
                  </>
                }
                legend={[
                  { label: 'Base case', color: 'var(--series-1)' },
                  { label: 'T2D3 path', color: 'var(--series-2)' },
                ]}
                table={
                  <table className="data">
                    <thead>
                      <tr>
                        <th>Year</th>
                        <th className="r">Base case ARR</th>
                        <th className="r">Growth</th>
                        <th className="r">T2D3 ARR</th>
                      </tr>
                    </thead>
                    <tbody>
                      {chart.x.map((i) => (
                        <tr key={i}>
                          <td>{i === 0 ? 'Today' : `Year ${i}`}</td>
                          <td className="r">{money(chart.company[i])}</td>
                          <td className="r">
                            {i === 0 ? '—' : pct(projection.company[i]?.growth)}
                          </td>
                          <td className="r">{money(chart.t2d3[i])}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                }
              >
                <LineChart
                  ariaLabel="Projected ARR by year for the base case and the T2D3 path"
                  x={chart.x}
                  yScale="log"
                  series={[
                    {
                      id: 'company',
                      label: 'Base case',
                      color: 'var(--series-1)',
                      values: chart.company,
                    },
                    {
                      id: 't2d3',
                      label: 'T2D3 path',
                      color: 'var(--series-2)',
                      values: chart.t2d3,
                    },
                  ]}
                  hLines={[{ y: 100e6, label: '$100M ARR' }]}
                  xFormat={(v) => (v === 0 ? 'Today' : `Yr ${v}`)}
                  tooltipTitle={(v) => (v === 0 ? 'Today' : `Year ${v}`)}
                  yFormat={(v) => money(v)}
                  xTickCount={Math.min(8, chart.x.length)}
                  endLabels
                  height={260}
                />
              </ChartFrame>
            ) : (
              <div className="empty">
                Enter ARR today and 12 months ago to project the trajectory.
              </div>
            )}
          </Panel>

          <Explainer title="Reading these numbers at pre-seed and seed">
            <p>
              Benchmarks are drawn from venture-backed companies, mostly above $1M ARR. At pre-seed,
              growth and retention rest on a handful of customers, so treat the grades as questions
              for the founder call rather than verdicts.
            </p>
            <p>
              Burn multiple is the single best efficiency read at this stage: it asks how many
              dollars of burn buy one dollar of new ARR. Magic number and CAC payback isolate sales
              and marketing. LTV/CAC depends on a churn estimate, so it is capped at a ten-year
              customer life.
            </p>
            <p>
              The T2D3 path is Battery Ventures&rsquo; heuristic for a company on track to a $1B
              valuation: triple, triple, double, double, double from about $2M ARR.{' '}
              <SourceLink source={SOURCES.t2d3} />
            </p>
          </Explainer>
        </div>
      </div>
    </div>
  );
}
