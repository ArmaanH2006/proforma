import { useEffect, useMemo, useRef } from 'react';
import { Button } from '../../components/Controls';
import { Explainer, Issues, Panel, Stat, Stats } from '../../components/Display';
import { ChartFrame } from '../../components/charts/ChartFrame';
import { StackedBar } from '../../components/charts/StackedBar';
import {
  capTableView,
  fullyDiluted,
  holderStakes,
  type CapTable,
  type ConvertibleReport,
  type FinancingEvent,
  type PricedRoundReport,
  type Snapshot,
} from '../../engine';
import { money, moneyFull, pct, price, shares } from '../../lib/format';
import { uid } from '../../lib/id';
import { FUND_HOLDER_ID, holderName, type Deal } from '../../state/deal';
import { useDeal, useHistory } from '../../state/derived';
import { useStore } from '../../state/store';
import { CapTableTable } from './CapTableTable';
import { ConvertiblesEditor, FormationEditor, PricedRoundEditor } from './EventEditors';
import { ValuationCheck } from './ValuationCheck';

const SERIES_NAMES = ['Series Seed', 'Series A', 'Series B', 'Series C', 'Series D', 'Series E'];

export function RoundView() {
  const deal = useDeal();
  const history = useHistory();
  const selected = useStore((s) => s.snapshot);
  const index = Math.min(Math.max(0, selected), history.length - 1);
  const snap = history[index]!;
  const prev = index > 0 ? history[index - 1]! : null;
  const ours = holderStakes(snap.capTable).get(FUND_HOLDER_ID);

  return (
    <div className="view">
      <header className="view-header">
        <h1>Round</h1>
        <p>
          Model the financing history as it happened and as you expect it to go: SAFEs and notes,
          then priced rounds that convert them, top up the option pool, and issue new preferred.
          Select an event to edit it and see the cap table after it.
        </p>
      </header>

      <Timeline history={history} index={index} />

      <SummaryStats snap={snap} prev={prev} ours={ours?.percent ?? 0} />

      <div className="sheet">
        <div className="stack inputs">
          {snap.event == null ? (
            <FormationEditor />
          ) : snap.event.kind === 'priced' ? (
            <PricedRoundEditor key={snap.event.id} index={index - 1} capBefore={prev!.capTable} />
          ) : (
            <ConvertiblesEditor key={snap.event.id} index={index - 1} />
          )}
        </div>
        <div className="stack">
          <Issues issues={snap.issues} />
          {snap.report?.kind === 'priced' && snap.issues.every((i) => i.level !== 'error') && (
            <PricedResults report={snap.report} deal={deal} />
          )}
          {snap.report?.kind === 'convertibles' && (
            <ConvertibleResults report={snap.report} snap={snap} deal={deal} />
          )}
          <Panel
            title={snap.event ? `Cap table after ${snap.event.label}` : 'Cap table at formation'}
            description="Fully diluted: issued shares, granted options, and the unissued pool. Outstanding SAFEs and notes are shown as if converted at their caps."
            flush
          >
            <CapTableTable before={prev?.capTable ?? null} after={snap.capTable} deal={deal} />
          </Panel>
          {prev && (
            <OwnershipShift
              before={prev.capTable}
              after={snap.capTable}
              event={snap.event!}
              deal={deal}
            />
          )}
          {snap.report?.kind === 'priced' && snap.issues.every((i) => i.level !== 'error') && (
            <ValuationCheck history={history} index={index} report={snap.report} />
          )}
          <Explainer title="How conversion and the option pool shuffle work">
            <p>
              A <strong>post-money SAFE</strong> converts at its cap divided by the company
              capitalization, a count that includes every SAFE. That fixes the holder&rsquo;s
              ownership at purchase amount ÷ post-money cap until the priced round, so later SAFEs
              dilute the founders rather than earlier SAFE holders. A{' '}
              <strong>pre-money SAFE</strong> or note converts on a capitalization that leaves the
              SAFEs out, so holders share dilution from each other.
            </p>
            <p>
              The <strong>headline pre-money</strong> in a term sheet usually includes the shares
              issued to SAFE holders and any increase in the option pool. Both come out of the
              existing holders&rsquo; side, which is why the effective pre-money (what existing
              shares are worth at the round price) is lower than the headline.
            </p>
            <p>
              Each SAFE converts into its own shadow series priced at its conversion price, so its
              liquidation preference equals what it paid rather than the new investors&rsquo; price.
              Engine results match Y Combinator&rsquo;s published worked examples share for share.
            </p>
          </Explainer>
        </div>
      </div>
    </div>
  );
}

function eventMeta(s: Snapshot): string {
  if (!s.event) return `${shares(fullyDiluted(s.capTable))} shares`;
  const r = s.report;
  if (r?.kind === 'priced') return r.postMoney > 0 ? `${money(r.postMoney)} post` : 'Needs inputs';
  if (r?.kind === 'convertibles') return `${money(r.raised)} raised`;
  return '';
}

function Timeline({ history, index }: { history: Snapshot[]; index: number }) {
  const setSnapshot = useStore((s) => s.setSnapshot);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    // Keep the selected event visible when the timeline scrolls sideways on small screens.
    const el = ref.current?.querySelector<HTMLElement>('[aria-pressed="true"]');
    el?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, [index]);
  const update = useStore((s) => s.update);
  const events = useStore((s) => s.deal.events);

  const add = (kind: FinancingEvent['kind']) => {
    const lastPost = [...history].reverse().find((s) => s.report?.kind === 'priced')?.report as
      PricedRoundReport | undefined;
    const pricedCount = events.filter((e) => e.kind === 'priced').length;
    update((d) => {
      const holderId = uid('holder');
      if (kind === 'priced') {
        d.holders.push({ id: holderId, name: 'Lead investor', kind: 'investor' });
        d.events.push({
          id: uid('evt'),
          kind: 'priced',
          label: SERIES_NAMES[Math.min(pricedCount, SERIES_NAMES.length - 1)]!,
          date: new Date().toISOString().slice(0, 10),
          preMoney: lastPost ? Math.round(lastPost.postMoney * 2.5) : 16_000_000,
          investments: [
            { holderId, amount: lastPost ? Math.round(lastPost.postMoney * 0.6) : 4_000_000 },
          ],
          pool: { mode: 'target', percentPost: 0.1 },
          terms: { prefMultiple: 1, participation: 'none', participationCap: 3, seniority: 'pari' },
          pricePrecision: 4,
        });
      } else {
        d.holders.push({ id: holderId, name: 'New investor', kind: 'investor' });
        d.events.push({
          id: uid('evt'),
          kind: 'convertibles',
          label: 'SAFEs',
          date: new Date().toISOString().slice(0, 10),
          instruments: [
            {
              id: uid('inst'),
              holderId,
              type: 'post-safe',
              amount: 500_000,
              cap: lastPost ? Math.round(lastPost.postMoney * 1.5) : 10_000_000,
              discount: null,
            },
          ],
        });
      }
    });
    setSnapshot(history.length);
  };

  return (
    <div className="timeline" role="toolbar" aria-label="Financing events" ref={ref}>
      {history.map((s, i) => (
        <button
          key={s.event?.id ?? 'formation'}
          type="button"
          className="timeline-item"
          aria-pressed={i === index}
          onClick={() => setSnapshot(i)}
        >
          <span className="t-kind">
            {!s.event ? 'Start' : s.event.kind === 'priced' ? 'Priced round' : 'SAFEs / notes'}
          </span>
          <span className="t-label">{s.event?.label ?? 'Formation'}</span>
          <span className="t-meta">
            {s.event?.date ? `${s.event.date.slice(0, 7)} · ` : ''}
            {eventMeta(s)}
          </span>
          {s.issues.some((x) => x.level === 'error') && (
            <span className="t-flag" title="This event has an error" />
          )}
        </button>
      ))}
      <div className="timeline-add">
        <Button
          size="sm"
          variant="ghost"
          icon="plus"
          title="Add SAFEs or notes"
          onClick={() => add('convertibles')}
        >
          SAFEs
        </Button>
        <Button
          size="sm"
          variant="ghost"
          icon="plus"
          title="Add a priced round"
          onClick={() => add('priced')}
        >
          Priced round
        </Button>
      </div>
    </div>
  );
}

function SummaryStats({
  snap,
  prev,
  ours,
}: {
  snap: Snapshot;
  prev: Snapshot | null;
  ours: number;
}) {
  const prevOurs = prev ? (holderStakes(prev.capTable).get(FUND_HOLDER_ID)?.percent ?? 0) : 0;
  const r = snap.report;
  if (r?.kind === 'priced' && r.pricePerShare > 0) {
    return (
      <Stats label="Round summary">
        <Stat
          label="Price per share"
          value={price(r.pricePerShare)}
          sub={`${shares(r.postMoneyShares)} shares post`}
        />
        <Stat
          label="Post-money"
          value={money(r.postMoney)}
          sub={`${money(r.newMoney)} new money`}
        />
        <Stat
          label="Effective pre-money"
          value={money(r.effectivePreMoney)}
          sub={`Headline ${money(r.preMoney)}`}
          title="Existing fully diluted shares × round price"
        />
        <Stat
          label="Option pool after"
          value={pct(r.poolPostPercent)}
          sub={`${shares(r.poolIncrease)} shares added`}
        />
        <Stat
          label="Our ownership"
          value={pct(ours)}
          sub={prev ? `${prevOurs > 0 ? `From ${pct(prevOurs)}` : 'New position'}` : undefined}
          emphasis
        />
      </Stats>
    );
  }
  if (r?.kind === 'convertibles') {
    const ev = snap.event;
    const sold =
      ev?.kind === 'convertibles'
        ? r.implied.instruments
            .filter((i) => ev.instruments.some((x) => x.id === i.instrumentId))
            .reduce((s, i) => s + (i.percent ?? 0), 0)
        : 0;
    const unpriced = r.implied.instruments.filter((i) => i.shares == null).length;
    return (
      <Stats label="SAFE summary">
        <Stat
          label="Raised in this event"
          value={money(r.raised)}
          sub={`${ev?.kind === 'convertibles' ? ev.instruments.length : 0} instruments`}
        />
        <Stat
          label="Ownership sold at caps"
          value={pct(sold)}
          sub="If converted at the caps today"
        />
        <Stat
          label="Outstanding SAFEs and notes"
          value={String(snap.capTable.convertibles.length)}
          sub={unpriced ? `${unpriced} uncapped` : 'All capped'}
        />
        <Stat label="Our ownership" value={pct(ours)} sub="As converted at cap" emphasis />
      </Stats>
    );
  }
  const view = capTableView(snap.capTable);
  const founders = view.rows.filter((x) => x.kind === 'shares').reduce((s, x) => s + x.percent, 0);
  return (
    <Stats label="Formation summary">
      <Stat label="Fully diluted shares" value={shares(view.fullyDiluted)} />
      <Stat label="Founders and common" value={pct(founders)} />
      <Stat
        label="Option pool"
        value={pct((snap.capTable.pool.granted + snap.capTable.pool.unissued) / view.fullyDiluted)}
        sub={`${shares(snap.capTable.pool.unissued)} unissued`}
      />
    </Stats>
  );
}

function PricedResults({ report, deal }: { report: PricedRoundReport; deal: Deal }) {
  const segments = [
    {
      id: 'existing',
      label: 'Existing holders',
      value: report.effectivePreMoney,
      color: 'var(--series-1)',
    },
    {
      id: 'conversions',
      label: 'SAFE and note conversions',
      value: report.conversionValue,
      color: 'var(--series-2)',
    },
    {
      id: 'pool',
      label: 'Option pool increase',
      value: report.poolIncreaseValue,
      color: 'var(--series-3)',
    },
  ].filter((s) => s.value > 0);
  return (
    <>
      <Panel
        title="Where the pre-money goes"
        description={`The ${money(report.preMoney)} headline is split between existing holders and the new shares that sit inside it.`}
      >
        <ChartFrame
          title="Headline pre-money, by who it belongs to"
          legend={segments.map((s) => ({ label: s.label, color: s.color, shape: 'rect' as const }))}
          table={
            <table className="data">
              <thead>
                <tr>
                  <th>Component</th>
                  <th className="r">Value at round price</th>
                  <th className="r">Share</th>
                </tr>
              </thead>
              <tbody>
                {segments.map((s) => (
                  <tr key={s.id}>
                    <td>{s.label}</td>
                    <td className="r">{moneyFull(s.value)}</td>
                    <td className="r">{pct(s.value / report.preMoneyAsPriced)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          }
        >
          <StackedBar
            ariaLabel="Headline pre-money split by component"
            rows={[{ label: '', segments }]}
            format={(v) => money(v)}
            barHeight={28}
          />
        </ChartFrame>
      </Panel>

      {report.conversions.length > 0 && (
        <Panel
          title="Conversions"
          description="Each instrument converts at whichever of its cap or discount gives more shares."
          flush
        >
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>Holder</th>
                  <th>Instrument</th>
                  <th className="r">Converting</th>
                  <th>Basis</th>
                  <th className="r">Price</th>
                  <th className="r">Vs round</th>
                  <th className="r">Shares</th>
                </tr>
              </thead>
              <tbody>
                {report.conversions.map((c) => (
                  <tr
                    key={c.instrumentId}
                    className={c.holderId === FUND_HOLDER_ID ? 'us' : undefined}
                  >
                    <td>{holderName(deal, c.holderId)}</td>
                    <td className="muted">
                      {c.type === 'post-safe'
                        ? 'Post-money SAFE'
                        : c.type === 'pre-safe'
                          ? 'Pre-money SAFE'
                          : 'Note'}
                    </td>
                    <td className="r">
                      {money(c.conversionAmount)}
                      {c.conversionAmount !== c.amount && (
                        <span className="cell-sub">incl. interest</span>
                      )}
                    </td>
                    <td>
                      {c.basis === 'cap'
                        ? 'Cap'
                        : c.basis === 'discount'
                          ? 'Discount'
                          : 'Round price'}
                    </td>
                    <td className="r">{price(c.price)}</td>
                    <td className="r">
                      {c.discountToRound > 0.0001 ? `${pct(c.discountToRound, 0)} off` : '—'}
                    </td>
                    <td className="r">{shares(c.shares)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      )}
    </>
  );
}

function ConvertibleResults({
  report,
  snap,
  deal,
}: {
  report: ConvertibleReport;
  snap: Snapshot;
  deal: Deal;
}) {
  const ev = snap.event;
  if (ev?.kind !== 'convertibles') return null;
  const rows = ev.instruments.map((inst) => ({
    inst,
    implied: report.implied.instruments.find((i) => i.instrumentId === inst.id),
  }));
  return (
    <Panel
      title="What each instrument buys"
      description="A post-money SAFE's stake is fixed at purchase amount ÷ post-money cap until a priced round. Uncapped SAFEs cannot be priced until then."
      flush
    >
      <div className="table-wrap">
        <table className="data">
          <thead>
            <tr>
              <th>Holder</th>
              <th>Instrument</th>
              <th className="r">Amount</th>
              <th className="r">Cap</th>
              <th className="r">Discount</th>
              <th className="r">Ownership at cap</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ inst, implied }) => (
              <tr key={inst.id} className={inst.holderId === FUND_HOLDER_ID ? 'us' : undefined}>
                <td>{holderName(deal, inst.holderId)}</td>
                <td className="muted">
                  {inst.type === 'post-safe'
                    ? 'Post-money SAFE'
                    : inst.type === 'pre-safe'
                      ? 'Pre-money SAFE'
                      : 'Note'}
                </td>
                <td className="r">{money(inst.amount)}</td>
                <td className="r">{inst.cap ? money(inst.cap) : 'Uncapped'}</td>
                <td className="r">{inst.discount ? pct(inst.discount, 0) : '—'}</td>
                <td className="r">
                  {implied?.percent != null ? pct(implied.percent) : 'Unpriced'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}

type Group = 'Founders' | 'Option pool' | 'Earlier investors' | 'New money';
const GROUP_COLORS: Record<Group, string> = {
  Founders: 'var(--series-1)',
  'Option pool': 'var(--series-2)',
  'Earlier investors': 'var(--series-3)',
  'New money': 'var(--series-4)',
};

function grouped(cap: CapTable, deal: Deal, eventId: string | null): Record<Group, number> {
  const view = capTableView(cap);
  const kinds = new Map(deal.holders.map((h) => [h.id, h.kind]));
  const out: Record<Group, number> = {
    Founders: 0,
    'Option pool': 0,
    'Earlier investors': 0,
    'New money': 0,
  };
  const newPositions = new Set(
    eventId
      ? cap.positions
          .filter((p) => p.eventId === eventId && p.classId === eventId)
          .map((p) => `${p.holderId}:${p.classId}`)
      : [],
  );
  for (const r of view.rows) {
    if (r.kind === 'options' || r.kind === 'pool') out['Option pool'] += r.percent;
    else if (r.kind === 'shares' && newPositions.has(r.key)) out['New money'] += r.percent;
    else if (r.holderId && kinds.get(r.holderId) === 'founder') out.Founders += r.percent;
    else out['Earlier investors'] += r.percent;
  }
  return out;
}

function OwnershipShift({
  before,
  after,
  event,
  deal,
}: {
  before: CapTable;
  after: CapTable;
  event: FinancingEvent;
  deal: Deal;
}) {
  const data = useMemo(() => {
    const b = grouped(before, deal, null);
    const a = grouped(after, deal, event.id);
    const groups = (Object.keys(GROUP_COLORS) as Group[]).filter((g) => b[g] > 0 || a[g] > 0);
    return { b, a, groups };
  }, [before, after, event, deal]);
  const seg = (vals: Record<Group, number>) =>
    data.groups.map((g) => ({ id: g, label: g, value: vals[g], color: GROUP_COLORS[g] }));
  return (
    <Panel title="Ownership before and after" description="Fully diluted, by holder group.">
      <ChartFrame
        title={`Dilution from ${event.label}`}
        legend={data.groups.map((g) => ({
          label: g,
          color: GROUP_COLORS[g],
          shape: 'rect' as const,
        }))}
        table={
          <table className="data">
            <thead>
              <tr>
                <th>Group</th>
                <th className="r">Before</th>
                <th className="r">After</th>
              </tr>
            </thead>
            <tbody>
              {data.groups.map((g) => (
                <tr key={g}>
                  <td>{g}</td>
                  <td className="r">{pct(data.b[g])}</td>
                  <td className="r">{pct(data.a[g])}</td>
                </tr>
              ))}
            </tbody>
          </table>
        }
      >
        <StackedBar
          ariaLabel="Fully diluted ownership by group before and after the event"
          rows={[
            { label: 'Before', segments: seg(data.b) },
            { label: 'After', segments: seg(data.a) },
          ]}
          format={(_, share) => pct(share)}
        />
      </ChartFrame>
    </Panel>
  );
}
