import { useMemo, useState } from 'react';
import { Button, Segmented } from '../../components/Controls';
import { Explainer, Panel, SourceLink, Stat, Stats } from '../../components/Display';
import { NumberField, SelectField, TextField } from '../../components/Field';
import { ChartFrame } from '../../components/charts/ChartFrame';
import { LineChart } from '../../components/charts/LineChart';
import {
  exitToReturnFund,
  findBreakpoints,
  holderPayouts,
  runWaterfall,
  SOURCES,
  type WaterfallClass,
} from '../../engine';
import { money, moneyFull, multiple, pct, price, shares } from '../../lib/format';
import { uid } from '../../lib/id';
import { DEFAULT_FUTURE_ROUNDS, FUND_HOLDER_ID, holderName } from '../../state/deal';
import { useDeal, useFundStake, useHistory, useWaterfallClasses } from '../../state/derived';
import { useStore } from '../../state/store';

const SERIES = [
  'var(--series-1)',
  'var(--series-2)',
  'var(--series-3)',
  'var(--series-4)',
  'var(--series-5)',
  'var(--series-6)',
  'var(--series-7)',
  'var(--series-8)',
];
const QUICK_EXITS = [50e6, 100e6, 250e6, 500e6, 1e9];

function netProceeds(ev: number, debt: number, feePercent: number): number {
  return Math.max(0, Math.max(0, ev - debt) - ev * feePercent);
}

function niceCeil(x: number): number {
  if (x <= 0) return 1;
  const p = 10 ** Math.floor(Math.log10(x));
  const m = x / p;
  const step = m <= 1 ? 1 : m <= 2 ? 2 : m <= 2.5 ? 2.5 : m <= 5 ? 5 : 10;
  return step * p;
}

export function ExitView() {
  const deal = useDeal();
  const update = useStore((s) => s.update);
  const history = useHistory();
  const ex = deal.exit;
  const snapshotIndex =
    ex.snapshot == null ? history.length - 1 : Math.min(ex.snapshot, history.length - 1);
  const { snapshot, classes } = useWaterfallClasses(snapshotIndex);

  const { debt, feePercent } = ex;
  const proceeds = netProceeds(ex.enterpriseValue, debt, feePercent);
  const result = useMemo(() => runWaterfall(classes, proceeds), [classes, proceeds]);
  const holders = useMemo(() => holderPayouts(classes, result), [classes, result]);
  const ours = holders.find((h) => h.holderId === FUND_HOLDER_ID);
  const founders = holders
    .filter((h) => deal.holders.find((x) => x.id === h.holderId)?.kind === 'founder')
    .reduce((s, h) => s + h.payout, 0);
  const totalPreference = classes.reduce((s, c) => s + c.preference, 0);

  // One line per round: a series and its SAFE shadow series are drawn together.
  const groups = useMemo(() => {
    const byGroup = new Map<string, { id: string; name: string; members: Set<string> }>();
    for (const c of classes) {
      if (c.shares <= 0 && c.preference <= 0) continue;
      const id = c.group ?? c.id;
      const g = byGroup.get(id) ?? { id, name: c.groupName ?? c.name, members: new Set<string>() };
      g.members.add(c.id);
      byGroup.set(id, g);
    }
    return [...byGroup.values()];
  }, [classes]);
  const fullRange = niceCeil(Math.max(ex.enterpriseValue * 2, totalPreference * 4, 10e6));
  const [range, setRange] = useState<'full' | 'prefs'>('full');

  const breakpoints = useMemo(() => {
    const fromProceeds = (p: number) => (p + debt) / Math.max(1e-9, 1 - feePercent);
    return findBreakpoints(classes, netProceeds(fullRange, debt, feePercent)).map((b) => ({
      ...b,
      ev: fromProceeds(b.exit),
    }));
  }, [classes, fullRange, debt, feePercent]);

  // "Preferences" zooms to the stretch where the preference stack and conversions change who gets what.
  const lastBreak = breakpoints.length ? breakpoints[breakpoints.length - 1]!.ev : 0;
  const maxEv = range === 'prefs' && lastBreak > 0 ? niceCeil(lastBreak * 1.4) : fullRange;

  const curve = useMemo(() => {
    const steps = 160;
    const x = Array.from({ length: steps + 1 }, (_, i) => (maxEv * i) / steps);
    const values = groups.map(() => [] as number[]);
    for (const ev of x) {
      const r = runWaterfall(classes, netProceeds(ev, debt, feePercent));
      groups.forEach((g, k) =>
        values[k]!.push(
          r.classes.filter((rc) => g.members.has(rc.id)).reduce((s, rc) => s + rc.total, 0),
        ),
      );
    }
    return { x, values };
  }, [classes, groups, maxEv, debt, feePercent]);

  const snapshotOptions = history.map((s, i) => ({
    value: String(i),
    label:
      i === history.length - 1
        ? `${s.event?.label ?? 'Formation'}, latest`
        : (s.event?.label ?? 'Formation'),
  }));

  return (
    <div className="view">
      <header className="view-header">
        <h1>Exit</h1>
        <p>
          Who gets what in a sale. Preferences are paid first, by seniority; each non-participating
          class then chooses the larger of its preference or converting to common. Below, our stake
          is carried through later rounds to the exit.
        </p>
      </header>

      <Stats label="Exit summary">
        <Stat
          label="Net proceeds to equity"
          value={money(proceeds)}
          sub={`From ${money(ex.enterpriseValue)} enterprise value`}
        />
        <Stat
          label="Our payout"
          value={money(ours?.payout ?? 0)}
          sub={ours ? `On ${money(ours.invested)} invested` : 'Our fund holds no shares here'}
          emphasis
        />
        <Stat
          label="Our multiple"
          value={ours && ours.invested > 0 ? multiple(ours.payout / ours.invested) : '—'}
          sub="Gross MOIC on this cap table"
        />
        <Stat
          label="Founders"
          value={money(founders)}
          sub={proceeds > 0 ? `${pct(founders / proceeds)} of proceeds` : '—'}
        />
        <Stat
          label="Preference stack"
          value={money(totalPreference)}
          sub={`Common price ${price(result.commonPrice, 2)}`}
        />
      </Stats>

      <div className="sheet">
        <div className="stack inputs">
          <section className="panel">
            <div className="group">
              <div className="group-title">Sale</div>
              <NumberField
                label="Enterprise value"
                kind="money"
                value={ex.enterpriseValue}
                min={0}
                onChange={(v) => update((d) => void (d.exit.enterpriseValue = v ?? 0))}
              />
              <div className="row quick-exits">
                {QUICK_EXITS.map((v) => (
                  <button
                    key={v}
                    type="button"
                    className="chip-button"
                    aria-pressed={ex.enterpriseValue === v}
                    onClick={() => update((d) => void (d.exit.enterpriseValue = v))}
                  >
                    {money(v)}
                  </button>
                ))}
              </div>
              <div className="fields">
                <NumberField
                  label="Debt repaid"
                  kind="money"
                  value={ex.debt}
                  min={0}
                  onChange={(v) => update((d) => void (d.exit.debt = v ?? 0))}
                />
                <NumberField
                  label="Transaction fees"
                  kind="percent"
                  value={ex.feePercent}
                  min={0}
                  max={0.2}
                  hint="Of enterprise value"
                  onChange={(v) => update((d) => void (d.exit.feePercent = v ?? 0))}
                />
              </div>
              <SelectField
                label="Cap table as of"
                value={String(snapshotIndex)}
                options={snapshotOptions}
                onChange={(v) =>
                  update(
                    (d) =>
                      void (d.exit.snapshot = Number(v) === history.length - 1 ? null : Number(v)),
                  )
                }
              />
            </div>
          </section>
          <FutureRoundsEditor />
        </div>

        <div className="stack">
          <Panel
            title="Payout by round"
            description="Each line is one round's shares, SAFE conversions included. Click the chart to set the exit value; triangles on the axis mark breakpoints."
          >
            <ChartFrame
              title={`Payout vs. exit value, cap table after ${snapshot.event?.label ?? 'formation'}`}
              actions={
                breakpoints.length > 0 && (
                  <Segmented
                    ariaLabel="Chart range"
                    value={range}
                    options={[
                      { value: 'full', label: `To ${money(fullRange)}` },
                      { value: 'prefs', label: 'Breakpoints' },
                    ]}
                    onChange={setRange}
                  />
                )
              }
              legend={groups.map((g, i) => ({ label: g.name, color: SERIES[i % SERIES.length]! }))}
              table={
                <table className="data">
                  <thead>
                    <tr>
                      <th>Exit value</th>
                      {groups.map((g) => (
                        <th key={g.id} className="r">
                          {g.name}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {curve.x
                      .map((ev, i) => ({ ev, i }))
                      .filter(({ i }) => i % 16 === 0)
                      .map(({ ev, i }) => (
                        <tr key={i}>
                          <td>{money(ev)}</td>
                          {groups.map((g, k) => (
                            <td key={g.id} className="r">
                              {money(curve.values[k]![i])}
                            </td>
                          ))}
                        </tr>
                      ))}
                  </tbody>
                </table>
              }
            >
              <LineChart
                ariaLabel="Payout to each share class as the exit value rises"
                x={curve.x}
                series={groups.map((g, k) => ({
                  id: g.id,
                  label: g.name,
                  color: SERIES[k % SERIES.length]!,
                  values: curve.values[k]!,
                }))}
                xFormat={(v) => money(v)}
                yFormat={(v) => money(v)}
                tooltipTitle={(v) => `Exit at ${money(v)}`}
                selectedX={ex.enterpriseValue}
                onSelectX={(v) =>
                  update((d) => void (d.exit.enterpriseValue = Math.round(v / 1e5) * 1e5))
                }
                markers={breakpoints
                  .filter((b) => b.ev <= maxEv)
                  .map((b) => ({ x: b.ev, label: b.description }))}
                height={300}
              />
            </ChartFrame>
          </Panel>

          <Panel
            title={`Distribution at ${money(ex.enterpriseValue)}`}
            description="Class by class, in order of seniority."
            flush
          >
            <ClassTable classes={classes} result={result} />
          </Panel>

          <Panel title="By holder" flush>
            <div className="table-wrap">
              <table className="data">
                <thead>
                  <tr>
                    <th>Holder</th>
                    <th className="r">Invested</th>
                    <th className="r">Payout</th>
                    <th className="r">Share of proceeds</th>
                    <th className="r">MOIC</th>
                  </tr>
                </thead>
                <tbody>
                  {[...holders]
                    .sort((a, b) => b.payout - a.payout)
                    .map((h) => (
                      <tr
                        key={h.holderId ?? 'options'}
                        className={h.holderId === FUND_HOLDER_ID ? 'us' : undefined}
                      >
                        <td>{holderName(deal, h.holderId)}</td>
                        <td className="r">{h.invested > 0 ? money(h.invested) : '—'}</td>
                        <td className="r">{money(h.payout)}</td>
                        <td className="r">{proceeds > 0 ? pct(h.payout / proceeds) : '—'}</td>
                        <td className="r">
                          {h.invested > 0 ? multiple(h.payout / h.invested) : '—'}
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </Panel>

          <Panel
            title="Breakpoints"
            description={`Where the waterfall changes shape, up to ${money(fullRange)}.`}
            flush
          >
            {breakpoints.length ? (
              <div className="table-wrap">
                <table className="data">
                  <tbody>
                    {breakpoints.map((b, i) => (
                      <tr key={i}>
                        <td className="r" style={{ width: 120 }}>
                          {money(b.ev)}
                        </td>
                        <td className="wrap">{b.description}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="empty">No breakpoints in this range.</div>
            )}
          </Panel>

          <OurPosition />

          <Explainer title="How the waterfall is solved">
            <p>
              Preferences are paid from the most senior rank down; a rank that cannot be paid in
              full shares pro rata by preference. The residual is split per as-converted share among
              common, exercised options (net of strike), converted preferred, and participating
              preferred, with capped classes stopping at their cap.
            </p>
            <p>
              Each non-participating or capped class can convert. The engine searches for the set of
              choices where no class could do better by switching on its own, starting from
              &ldquo;nobody converts&rdquo; and checking every combination if that search ever
              cycles. Property tests check that this holds and that every dollar is paid out.
            </p>
            <p>
              Unconverted SAFEs receive the greater of their purchase amount or their as-converted
              share, ranking with preferred stock; notes are repaid ahead of equity. The unissued
              pool receives nothing.
            </p>
          </Explainer>
        </div>
      </div>
    </div>
  );
}

function ClassTable({
  classes,
  result,
}: {
  classes: WaterfallClass[];
  result: ReturnType<typeof runWaterfall>;
}) {
  const rows = [...classes]
    .filter((c) => c.shares > 0 || c.preference > 0)
    .sort((a, b) => b.seniority - a.seniority);
  return (
    <div className="table-wrap">
      <table className="data">
        <thead>
          <tr>
            <th>Class</th>
            <th className="r">Shares</th>
            <th className="r">Preference</th>
            <th>Choice</th>
            <th className="r">Payout</th>
            <th className="r">Per share</th>
            <th className="r">MOIC</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((c) => {
            const r = result.classes.find((x) => x.id === c.id)!;
            const invested = c.holdings.reduce((s, h) => s + h.invested, 0);
            const choice =
              c.kind === 'common' || c.kind === 'options'
                ? c.kind === 'options'
                  ? result.optionsInTheMoney
                    ? 'Exercise'
                    : 'Underwater'
                  : 'Common'
                : r.converted
                  ? 'Converts'
                  : r.capReached
                    ? 'Capped'
                    : c.participation === 'full'
                      ? 'Participates'
                      : c.participation === 'capped'
                        ? 'Pref + participation'
                        : 'Takes preference';
            return (
              <tr key={c.id}>
                <td>
                  {c.name}
                  {c.kind === 'preferred' && (
                    <span className="cell-sub">
                      {c.participation === 'none'
                        ? 'Non-participating'
                        : c.participation === 'full'
                          ? 'Participating'
                          : 'Capped participation'}{' '}
                      · rank {c.seniority}
                    </span>
                  )}
                </td>
                <td className="r">{shares(c.shares)}</td>
                <td className="r">{c.preference > 0 ? money(c.preference) : '—'}</td>
                <td>{choice}</td>
                <td className="r">{moneyFull(r.total)}</td>
                <td className="r">{c.shares > 0 ? price(r.perShare, 2) : '—'}</td>
                <td className="r">{invested > 0 ? multiple(r.total / invested) : '—'}</td>
              </tr>
            );
          })}
          <tr className="total">
            <td>Total</td>
            <td />
            <td className="r">{money(classes.reduce((s, c) => s + c.preference, 0))}</td>
            <td />
            <td className="r">{moneyFull(result.classes.reduce((s, c) => s + c.total, 0))}</td>
            <td />
            <td />
          </tr>
        </tbody>
      </table>
    </div>
  );
}

function FutureRoundsEditor() {
  const rounds = useStore((s) => s.deal.futureRounds);
  const update = useStore((s) => s.update);
  return (
    <section className="panel">
      <div className="group">
        <div className="group-title">
          Later rounds
          <Button
            size="sm"
            variant="ghost"
            icon="plus"
            onClick={() =>
              update(
                (d) =>
                  void d.futureRounds.push({
                    id: uid('round'),
                    label: `Round ${d.futureRounds.length + 1}`,
                    dilution: 0.1,
                    postMoney: 500e6,
                    proRata: false,
                  }),
              )
            }
          >
            Add
          </Button>
        </div>
        <p className="field-hint">
          Rounds expected after the last modeled event. Defaults are Carta medians for software
          companies. <SourceLink source={SOURCES.carta} />
        </p>
        {rounds.map((r, i) => (
          <div key={r.id} className="future-round">
            <div className="instrument-head">
              <TextField
                ariaLabel="Round name"
                value={r.label}
                onChange={(v) => update((d) => void (d.futureRounds[i]!.label = v))}
              />
              <Button
                size="sm"
                variant="ghost"
                icon="trash"
                title="Remove round"
                onClick={() => update((d) => void d.futureRounds.splice(i, 1))}
              />
            </div>
            <div className="fields">
              <NumberField
                label="Dilution"
                kind="percent"
                value={r.dilution}
                min={0}
                max={0.6}
                onChange={(v) => update((d) => void (d.futureRounds[i]!.dilution = v ?? 0))}
              />
              <NumberField
                label="Post-money"
                kind="money"
                value={r.postMoney}
                min={0}
                onChange={(v) => update((d) => void (d.futureRounds[i]!.postMoney = v ?? 0))}
              />
            </div>
            <label className="check">
              <input
                type="checkbox"
                checked={r.proRata}
                onChange={(e) =>
                  update((d) => void (d.futureRounds[i]!.proRata = e.target.checked))
                }
              />
              Take our pro rata in this round
            </label>
          </div>
        ))}
        <Button
          size="sm"
          variant="ghost"
          icon="refresh"
          onClick={() =>
            update((d) => void (d.futureRounds = DEFAULT_FUTURE_ROUNDS.map((x) => ({ ...x }))))
          }
        >
          Reset to Carta medians
        </Button>
      </div>
    </section>
  );
}

function OurPosition() {
  const deal = useDeal();
  const stake = useFundStake();
  const fundSize = deal.fund.fundSize;
  const returner = exitToReturnFund(fundSize, stake.atExit);
  const totalIn = stake.invested + stake.followOns;
  const scenarios = [50e6, 100e6, 250e6, 500e6, 1e9, 2.5e9];
  if (stake.invested <= 0) {
    return (
      <Panel title="Our position at exit">
        <div className="empty">
          Our fund has no position yet. Add it to a round or SAFE on the Round stage.
        </div>
      </Panel>
    );
  }
  return (
    <Panel
      title="Our position at exit"
      description="Ownership carried through the later rounds. Proceeds here are ownership × exit value, which ignores later-round preferences; at large exits everyone converts, so the gap is small."
    >
      <div className="position">
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th>After</th>
                <th className="r">Ownership</th>
                <th className="r">Follow-on</th>
              </tr>
            </thead>
            <tbody>
              {stake.modeled.map((m, i) => (
                <tr key={`m-${i}`}>
                  <td>{m.label}</td>
                  <td className="r">{pct(m.ownership)}</td>
                  <td className="r muted">—</td>
                </tr>
              ))}
              {stake.projected.map((p, i) => (
                <tr key={`p-${i}`}>
                  <td>
                    {p.label} <span className="muted">projected</span>
                  </td>
                  <td className="r">{pct(p.ownership)}</td>
                  <td className="r">{p.followOn > 0 ? money(p.followOn) : '—'}</td>
                </tr>
              ))}
              <tr className="total">
                <td>At exit</td>
                <td className="r">{pct(stake.atExit)}</td>
                <td className="r">{stake.followOns > 0 ? money(stake.followOns) : '—'}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <div className="returner">
          <span className="stat-label">Exit needed to return the fund</span>
          <span className="returner-value">
            {Number.isFinite(returner) ? money(returner) : '—'}
          </span>
          <span className="stat-sub">
            {money(fundSize)} fund ÷ {pct(stake.atExit)} at exit
          </span>
        </div>
      </div>
      <div className="table-wrap" style={{ marginTop: 12 }}>
        <table className="data">
          <thead>
            <tr>
              <th>Exit value</th>
              <th className="r">Our proceeds</th>
              <th className="r">Multiple</th>
              <th className="r">Share of fund</th>
            </tr>
          </thead>
          <tbody>
            {scenarios.map((ev) => {
              const proceeds = stake.atExit * ev;
              return (
                <tr key={ev}>
                  <td>{money(ev)}</td>
                  <td className="r">{money(proceeds)}</td>
                  <td className="r">{multiple(totalIn > 0 ? proceeds / totalIn : 0)}</td>
                  <td className="r">{pct(proceeds / fundSize)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}
