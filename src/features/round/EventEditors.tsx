import { Button, Segmented } from '../../components/Controls';
import { NumberField, SelectField, TextField } from '../../components/Field';
import {
  proRataAmount,
  type CapTable,
  type ConvertibleEvent,
  type ConvertibleType,
  type Participation,
  type PricedRoundEvent,
} from '../../engine';
import { money } from '../../lib/format';
import { uid } from '../../lib/id';
import { FUND_HOLDER_ID, type Deal } from '../../state/deal';
import { useStore } from '../../state/store';
import { HolderInput } from './HolderInput';

function useEventUpdater<K extends 'priced' | 'convertibles'>(index: number, kind: K) {
  const update = useStore((s) => s.update);
  type E = K extends 'priced' ? PricedRoundEvent : ConvertibleEvent;
  return (fn: (e: E, d: Deal) => void) =>
    update((d) => {
      const e = d.events[index];
      if (e && e.kind === kind) fn(e as E, d);
    });
}

function EventHeader({
  index,
  label,
  date,
  onLabel,
  onDate,
}: {
  index: number;
  label: string;
  date?: string;
  onLabel: (v: string) => void;
  onDate: (v: string) => void;
}) {
  const update = useStore((s) => s.update);
  const setSnapshot = useStore((s) => s.setSnapshot);
  return (
    <div className="group">
      <div className="group-title">
        Event
        <Button
          size="sm"
          variant="ghost"
          icon="trash"
          onClick={() => {
            update((d) => void d.events.splice(index, 1));
            setSnapshot(index);
          }}
        >
          Delete event
        </Button>
      </div>
      <div className="fields">
        <TextField label="Name" value={label} onChange={onLabel} />
        <div className="field">
          <label className="field-label" htmlFor={`event-date-${index}`}>
            Date
          </label>
          <div className="control">
            <input
              id={`event-date-${index}`}
              type="date"
              value={date ?? ''}
              onChange={(e) => onDate(e.target.value)}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

export function FormationEditor() {
  const formation = useStore((s) => s.deal.formation);
  const holders = useStore((s) => s.deal.holders);
  const update = useStore((s) => s.update);
  return (
    <section className="panel">
      <div className="group">
        <div className="group-title">
          Founder and common shares
          <Button
            size="sm"
            variant="ghost"
            icon="plus"
            onClick={() =>
              update((d) => {
                const id = uid('holder');
                d.holders.push({ id, name: 'New founder', kind: 'founder' });
                d.formation.positions.push({ holderId: id, shares: 1_000_000 });
              })
            }
          >
            Add
          </Button>
        </div>
        {formation.positions.map((p, i) => {
          const holder = holders.find((h) => h.id === p.holderId);
          return (
            <div key={p.holderId} className="formation-row">
              <TextField
                ariaLabel="Holder name"
                value={holder?.name ?? ''}
                onChange={(v) =>
                  update((d) => {
                    const h = d.holders.find((x) => x.id === p.holderId);
                    if (h) h.name = v;
                  })
                }
              />
              <NumberField
                ariaLabel={`${holder?.name ?? 'Holder'} shares`}
                kind="shares"
                value={p.shares}
                min={0}
                onChange={(v) =>
                  update((d) => void (d.formation.positions[i]!.shares = Math.round(v ?? 0)))
                }
              />
              <Button
                size="sm"
                variant="ghost"
                icon="trash"
                title={`Remove ${holder?.name ?? 'holder'}`}
                disabled={formation.positions.length <= 1}
                onClick={() => update((d) => void d.formation.positions.splice(i, 1))}
              />
            </div>
          );
        })}
      </div>
      <div className="group">
        <div className="group-title">Option pool</div>
        <div className="fields">
          <NumberField
            label="Granted options"
            kind="shares"
            hint="Vested and unvested"
            value={formation.pool.granted}
            min={0}
            onChange={(v) => update((d) => void (d.formation.pool.granted = Math.round(v ?? 0)))}
          />
          <NumberField
            label="Average strike"
            kind="price"
            value={formation.pool.avgStrike}
            min={0}
            onChange={(v) => update((d) => void (d.formation.pool.avgStrike = v ?? 0))}
          />
          <NumberField
            className="span-2"
            label="Unissued pool"
            kind="shares"
            hint="Reserved for future grants; receives nothing at exit"
            value={formation.pool.unissued}
            min={0}
            onChange={(v) => update((d) => void (d.formation.pool.unissued = Math.round(v ?? 0)))}
          />
        </div>
      </div>
    </section>
  );
}

const TYPE_OPTIONS: ReadonlyArray<{ value: ConvertibleType; label: string }> = [
  { value: 'post-safe', label: 'Post-money SAFE' },
  { value: 'pre-safe', label: 'Pre-money SAFE' },
  { value: 'note', label: 'Convertible note' },
];

export function ConvertiblesEditor({ index }: { index: number }) {
  const event = useStore((s) => s.deal.events[index]) as ConvertibleEvent;
  const edit = useEventUpdater(index, 'convertibles');
  return (
    <section className="panel">
      <EventHeader
        index={index}
        label={event.label}
        date={event.date}
        onLabel={(v) => edit((e) => void (e.label = v))}
        onDate={(v) => edit((e) => void (e.date = v))}
      />
      <div className="group">
        <div className="group-title">
          Instruments
          <Button
            size="sm"
            variant="ghost"
            icon="plus"
            onClick={() =>
              edit((e, d) => {
                const id = uid('holder');
                d.holders.push({ id, name: `Investor ${d.holders.length}`, kind: 'investor' });
                e.instruments.push({
                  id: uid('inst'),
                  holderId: id,
                  type: 'post-safe',
                  amount: 250_000,
                  cap: 10_000_000,
                  discount: null,
                });
              })
            }
          >
            Add
          </Button>
        </div>
        {event.instruments.length === 0 && <div className="empty">No instruments yet.</div>}
        {event.instruments.map((inst, i) => (
          <div key={inst.id} className="instrument">
            <div className="instrument-head">
              <HolderInput
                holderId={inst.holderId}
                onChange={(id) => edit((e) => void (e.instruments[i]!.holderId = id))}
              />
              <Button
                size="sm"
                variant="ghost"
                icon="trash"
                title="Remove instrument"
                onClick={() => edit((e) => void e.instruments.splice(i, 1))}
              />
            </div>
            <div className="fields">
              <SelectField
                className="span-2"
                ariaLabel="Instrument type"
                value={inst.type}
                options={TYPE_OPTIONS}
                onChange={(v) => edit((e) => void (e.instruments[i]!.type = v))}
              />
              <NumberField
                label={inst.type === 'note' ? 'Principal' : 'Purchase amount'}
                kind="money"
                value={inst.amount}
                min={0}
                onChange={(v) => edit((e) => void (e.instruments[i]!.amount = v ?? 0))}
              />
              <NumberField
                label={inst.type === 'post-safe' ? 'Post-money cap' : 'Pre-money cap'}
                kind="money"
                optional
                placeholder="Uncapped"
                value={inst.cap ?? null}
                onChange={(v) => edit((e) => void (e.instruments[i]!.cap = v))}
              />
              <NumberField
                label="Discount"
                kind="percent"
                optional
                placeholder="None"
                max={0.95}
                value={inst.discount ?? null}
                onChange={(v) => edit((e) => void (e.instruments[i]!.discount = v))}
              />
              {inst.type === 'note' && (
                <>
                  <NumberField
                    label="Interest rate"
                    kind="percent"
                    optional
                    value={inst.interestRate ?? null}
                    onChange={(v) => edit((e) => void (e.instruments[i]!.interestRate = v))}
                  />
                  <NumberField
                    label="Months to conversion"
                    kind="number"
                    optional
                    value={inst.termMonths ?? null}
                    onChange={(v) => edit((e) => void (e.instruments[i]!.termMonths = v))}
                  />
                </>
              )}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

const POOL_MODES = [
  { value: 'none', label: 'No change' },
  { value: 'target', label: 'Target % post' },
  { value: 'shares', label: 'Add shares' },
] as const;

const PARTICIPATION: ReadonlyArray<{ value: Participation; label: string }> = [
  { value: 'none', label: 'Non-participating' },
  { value: 'full', label: 'Participating' },
  { value: 'capped', label: 'Capped' },
];

export function PricedRoundEditor({ index, capBefore }: { index: number; capBefore: CapTable }) {
  const event = useStore((s) => s.deal.events[index]) as PricedRoundEvent;
  const holders = useStore((s) => s.deal.holders);
  const edit = useEventUpdater(index, 'priced');
  const total = event.investments.reduce((s, i) => s + i.amount, 0);
  const holdsStake = (holderId: string) =>
    capBefore.positions.some((p) => p.holderId === holderId) ||
    capBefore.convertibles.some((c) => c.holderId === holderId);

  return (
    <section className="panel">
      <EventHeader
        index={index}
        label={event.label}
        date={event.date}
        onLabel={(v) => edit((e) => void (e.label = v))}
        onDate={(v) => edit((e) => void (e.date = v))}
      />
      <div className="group">
        <div className="group-title">Price</div>
        <div className="fields">
          <NumberField
            className="span-2"
            label="Pre-money valuation"
            kind="money"
            hint="Headline figure; includes converting SAFEs and any pool increase"
            value={event.preMoney}
            min={0}
            onChange={(v) => edit((e) => void (e.preMoney = v ?? 0))}
          />
          <div className="field span-2">
            <span className="field-label">Option pool</span>
            <Segmented
              ariaLabel="Option pool"
              fill
              value={event.pool.mode}
              options={POOL_MODES}
              onChange={(mode) =>
                edit((e) => {
                  e.pool =
                    mode === 'target'
                      ? { mode, percentPost: 0.1 }
                      : mode === 'shares'
                        ? { mode, shares: 500_000 }
                        : { mode: 'none' };
                })
              }
            />
          </div>
          {event.pool.mode === 'target' && (
            <NumberField
              className="span-2"
              label="Unissued pool after the round"
              kind="percent"
              hint="Share of post-money fully diluted. The increase comes out of the pre-money."
              value={event.pool.percentPost}
              min={0}
              max={0.5}
              onChange={(v) => edit((e) => void (e.pool = { mode: 'target', percentPost: v ?? 0 }))}
            />
          )}
          {event.pool.mode === 'shares' && (
            <NumberField
              className="span-2"
              label="Shares added to the pool"
              kind="shares"
              value={event.pool.shares}
              min={0}
              onChange={(v) =>
                edit((e) => void (e.pool = { mode: 'shares', shares: Math.round(v ?? 0) }))
              }
            />
          )}
        </div>
      </div>
      <div className="group">
        <div className="group-title">
          Investors
          <Button
            size="sm"
            variant="ghost"
            icon="plus"
            onClick={() =>
              edit((e, d) => {
                const id = uid('holder');
                d.holders.push({ id, name: `Investor ${d.holders.length}`, kind: 'investor' });
                e.investments.push({ holderId: id, amount: 500_000 });
              })
            }
          >
            Add
          </Button>
        </div>
        {event.investments.map((inv, i) => {
          const proRata = holdsStake(inv.holderId)
            ? proRataAmount(capBefore, inv.holderId, total)
            : null;
          return (
            <div key={`${inv.holderId}-${i}`} className="investor-row">
              <HolderInput
                holderId={inv.holderId}
                onChange={(id) => edit((e) => void (e.investments[i]!.holderId = id))}
              />
              <NumberField
                ariaLabel={`${holders.find((h) => h.id === inv.holderId)?.name ?? 'Investor'} amount`}
                kind="money"
                value={inv.amount}
                min={0}
                onChange={(v) => edit((e) => void (e.investments[i]!.amount = v ?? 0))}
              />
              <Button
                size="sm"
                variant="ghost"
                icon="trash"
                title="Remove investor"
                onClick={() => edit((e) => void e.investments.splice(i, 1))}
              />
              {proRata != null && proRata > 0 && Math.abs(proRata - inv.amount) > 1 && (
                <div className="investor-hint">
                  Pro rata is about {money(proRata)}.{' '}
                  <button
                    type="button"
                    className="link-button"
                    onClick={() =>
                      edit((e) => void (e.investments[i]!.amount = Math.round(proRata)))
                    }
                  >
                    Use it
                  </button>
                </div>
              )}
            </div>
          );
        })}
        {!event.investments.some((i) => i.holderId === FUND_HOLDER_ID) && (
          <button
            type="button"
            className="link-button add-fund"
            onClick={() =>
              edit((e) => {
                const amount = holdsStake(FUND_HOLDER_ID)
                  ? Math.round(proRataAmount(capBefore, FUND_HOLDER_ID, total))
                  : 25_000;
                e.investments.push({ holderId: FUND_HOLDER_ID, amount: Math.max(amount, 1_000) });
              })
            }
          >
            Add our fund to this round
          </button>
        )}
        <div className="investor-total">
          <span>Round size</span>
          <strong className="num">{money(total)}</strong>
        </div>
      </div>
      <div className="group">
        <div className="group-title">Preferred terms</div>
        <div className="fields">
          <NumberField
            label="Liquidation preference"
            kind="multiple"
            value={event.terms.prefMultiple}
            min={0}
            max={5}
            onChange={(v) => edit((e) => void (e.terms.prefMultiple = v ?? 1))}
          />
          <div className="field">
            <span className="field-label">Seniority</span>
            <Segmented
              ariaLabel="Seniority"
              fill
              value={event.terms.seniority}
              options={[
                { value: 'pari', label: 'Pari passu' },
                { value: 'senior', label: 'Senior' },
              ]}
              onChange={(v) => edit((e) => void (e.terms.seniority = v))}
            />
          </div>
          <div className="field span-2">
            <span className="field-label">Participation</span>
            <Segmented
              ariaLabel="Participation"
              fill
              value={event.terms.participation}
              options={PARTICIPATION}
              onChange={(v) => edit((e) => void (e.terms.participation = v))}
            />
          </div>
          {event.terms.participation === 'capped' && (
            <NumberField
              label="Participation cap"
              kind="multiple"
              hint="Total return, preference included"
              value={event.terms.participationCap}
              min={1}
              max={10}
              onChange={(v) => edit((e) => void (e.terms.participationCap = v ?? 3))}
            />
          )}
          <NumberField
            label="Price decimals"
            kind="number"
            hint="Price per share rounding"
            value={event.pricePrecision ?? 4}
            min={0}
            max={8}
            onChange={(v) => edit((e) => void (e.pricePrecision = Math.round(v ?? 4)))}
          />
        </div>
      </div>
    </section>
  );
}
