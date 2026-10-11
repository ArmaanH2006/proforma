import { Button, ScorePicker, Segmented } from '../../components/Controls';
import { Badge, Explainer, Panel, Stat, Stats } from '../../components/Display';
import { NumberField, TextArea, TextField } from '../../components/Field';
import { ADVANCE_AT, DISCUSS_AT } from '../../engine';
import { money, pct, shares } from '../../lib/format';
import { uid } from '../../lib/id';
import type { Stage } from '../../state/deal';
import { useDeal, useMarket, useMetrics, useScreen } from '../../state/derived';
import { useStore } from '../../state/store';

const STAGES: ReadonlyArray<{ value: Stage; label: string }> = [
  { value: 'Pre-seed', label: 'Pre-seed' },
  { value: 'Seed', label: 'Seed' },
  { value: 'Series A', label: 'Series A' },
];

const REC = {
  advance: { short: 'Advance', text: 'Advance to diligence', tone: 'good' as const },
  discuss: { short: 'Discuss', text: 'Discuss at team review', tone: 'warn' as const },
  pass: { short: 'Pass', text: 'Pass', tone: 'bad' as const },
  incomplete: { short: 'Pending', text: 'Score more criteria', tone: undefined },
};

type Met = 'yes' | 'no' | 'open';
const MET_OPTIONS: ReadonlyArray<{ value: Met; label: string }> = [
  { value: 'yes', label: 'Meets' },
  { value: 'no', label: 'Does not' },
  { value: 'open', label: 'Unknown' },
];

export function ScreenView() {
  const deal = useDeal();
  const update = useStore((s) => s.update);
  const result = useScreen();
  const market = useMarket();
  const { summary } = useMetrics();
  const rec = REC[result.recommendation];

  return (
    <div className="view">
      <header className="view-header">
        <h1>Screen</h1>
        <p>
          A first pass on whether this deal deserves diligence: does it fit the thesis, and how does
          it score on team, market, product, traction, and terms.
        </p>
      </header>

      <Stats label="Screen summary">
        <Stat
          label="Weighted score"
          value={result.score != null ? `${result.score.toFixed(2)} / 5` : '—'}
          sub={`${pct(result.scoredWeight, 0)} of weight scored`}
          emphasis
        />
        <Stat label="Recommendation" value={rec.short} sub={rec.text} />
        <Stat
          label="Thesis fit"
          value={
            result.thesis === 'in' ? 'In thesis' : result.thesis === 'out' ? 'Outside' : 'Open'
          }
          sub={
            result.failedRequired.length ? `Fails: ${result.failedRequired[0]}` : 'Required checks'
          }
        />
        <Stat
          label="Serviceable market"
          value={money(market.sam)}
          sub={`TAM ${money(market.tam)}`}
        />
        <Stat
          label="SAM share for $100M ARR"
          value={Number.isFinite(market.samShareFor100m) ? pct(market.samShareFor100m) : '—'}
          sub="The usual venture-scale bar"
        />
      </Stats>

      <div className="sheet">
        <div className="stack inputs">
          <section className="panel">
            <div className="group">
              <div className="group-title">Company</div>
              <div className="fields">
                <TextField
                  className="span-2"
                  label="Name"
                  value={deal.company.name}
                  onChange={(v) => update((d) => void (d.company.name = v))}
                />
                <TextArea
                  className="span-2"
                  label="One-liner"
                  rows={2}
                  value={deal.company.oneLiner}
                  placeholder="What it sells, to whom, and why now"
                  onChange={(v) => update((d) => void (d.company.oneLiner = v))}
                />
                <TextField
                  label="Sector"
                  value={deal.company.sector}
                  onChange={(v) => update((d) => void (d.company.sector = v))}
                />
                <TextField
                  label="Location"
                  value={deal.company.location}
                  onChange={(v) => update((d) => void (d.company.location = v))}
                />
                <TextField
                  label="Website"
                  value={deal.company.website}
                  onChange={(v) => update((d) => void (d.company.website = v))}
                />
                <NumberField
                  label="Founded"
                  kind="year"
                  optional
                  value={deal.company.founded}
                  onChange={(v) =>
                    update((d) => void (d.company.founded = v == null ? null : Math.round(v)))
                  }
                />
                <div className="field span-2">
                  <span className="field-label">Stage</span>
                  <Segmented
                    ariaLabel="Stage"
                    fill
                    value={deal.company.stage}
                    options={STAGES}
                    onChange={(v) => update((d) => void (d.company.stage = v))}
                  />
                </div>
              </div>
            </div>
            <div className="group">
              <div className="group-title">
                Founders
                <Button
                  size="sm"
                  variant="ghost"
                  icon="plus"
                  onClick={() =>
                    update(
                      (d) =>
                        void d.company.founders.push({
                          id: uid('founder'),
                          name: '',
                          role: '',
                          background: '',
                        }),
                    )
                  }
                >
                  Add
                </Button>
              </div>
              {deal.company.founders.map((f, i) => (
                <div key={f.id} className="founder">
                  <div className="fields">
                    <TextField
                      label="Name"
                      value={f.name}
                      onChange={(v) => update((d) => void (d.company.founders[i]!.name = v))}
                    />
                    <TextField
                      label="Role"
                      value={f.role}
                      onChange={(v) => update((d) => void (d.company.founders[i]!.role = v))}
                    />
                    <TextArea
                      className="span-2"
                      label="Background"
                      rows={2}
                      value={f.background}
                      onChange={(v) => update((d) => void (d.company.founders[i]!.background = v))}
                    />
                  </div>
                  {deal.company.founders.length > 1 && (
                    <Button
                      size="sm"
                      variant="ghost"
                      icon="trash"
                      title={`Remove ${f.name || 'founder'}`}
                      onClick={() => update((d) => void d.company.founders.splice(i, 1))}
                    />
                  )}
                </div>
              ))}
            </div>
            <div className="group">
              <div className="group-title">Market sizing, bottom-up</div>
              <div className="fields">
                <NumberField
                  label="Potential customers"
                  kind="number"
                  value={deal.market.customers}
                  onChange={(v) => update((d) => void (d.market.customers = Math.max(0, v ?? 0)))}
                />
                <NumberField
                  label="ACV at scale"
                  kind="money"
                  value={deal.market.acv}
                  onChange={(v) => update((d) => void (d.market.acv = Math.max(0, v ?? 0)))}
                />
                <NumberField
                  label="Serviceable share"
                  kind="percent"
                  hint="Of TAM the product fits today"
                  value={deal.market.serviceableShare}
                  min={0}
                  max={1}
                  onChange={(v) => update((d) => void (d.market.serviceableShare = v ?? 0))}
                />
                <NumberField
                  label="Obtainable share"
                  kind="percent"
                  hint="Of SAM winnable in ~5 years"
                  value={deal.market.obtainableShare}
                  min={0}
                  max={1}
                  onChange={(v) => update((d) => void (d.market.obtainableShare = v ?? 0))}
                />
              </div>
            </div>
          </section>
        </div>

        <div className="stack">
          <Panel
            title="Thesis fit"
            description="Required checks decide whether the fund can invest at all. Edit the wording to match your fund's thesis."
            flush
          >
            {deal.thesis.map((t, i) => (
              <div key={t.id} className="checkline">
                <div className="label">
                  <input
                    className="inline-input"
                    aria-label="Thesis check"
                    value={t.label}
                    onChange={(e) => update((d) => void (d.thesis[i]!.label = e.target.value))}
                  />
                  <small>
                    <button
                      type="button"
                      className="link-button"
                      onClick={() =>
                        update((d) => void (d.thesis[i]!.required = !d.thesis[i]!.required))
                      }
                    >
                      {t.required ? 'Required' : 'Nice to have'}
                    </button>
                  </small>
                </div>
                <Segmented
                  ariaLabel={t.label}
                  value={t.met === true ? 'yes' : t.met === false ? 'no' : 'open'}
                  options={MET_OPTIONS}
                  onChange={(v) =>
                    update(
                      (d) =>
                        void (d.thesis[i]!.met = v === 'yes' ? true : v === 'no' ? false : null),
                    )
                  }
                />
              </div>
            ))}
          </Panel>

          <Panel
            title="Scorecard"
            description={`Score each line 1 to 5. ${ADVANCE_AT}+ advances to diligence, ${DISCUSS_AT}+ goes to discussion, lower passes.`}
            actions={rec && <Badge tone={rec.tone}>{rec.text}</Badge>}
            flush
          >
            <div className="scorecard">
              {deal.screen.map((c, i) => (
                <div key={c.id} className="score-row">
                  <div className="score-head">
                    <div className="score-name">
                      <strong>{c.label}</strong>
                      <span className="muted">{c.prompt}</span>
                    </div>
                    <div className="score-controls">
                      <label className="weight">
                        <span className="muted">Weight</span>
                        <NumberField
                          ariaLabel={`${c.label} weight`}
                          kind="number"
                          value={c.weight}
                          min={0}
                          max={100}
                          onChange={(v) => update((d) => void (d.screen[i]!.weight = v ?? 0))}
                        />
                      </label>
                      <ScorePicker
                        label={`${c.label} score`}
                        value={c.score}
                        onChange={(v) => update((d) => void (d.screen[i]!.score = v))}
                      />
                    </div>
                  </div>
                  <textarea
                    className="textarea note"
                    rows={2}
                    aria-label={`${c.label} notes`}
                    placeholder="Evidence behind the score"
                    value={c.note}
                    onChange={(e) => update((d) => void (d.screen[i]!.note = e.target.value))}
                  />
                  {c.id === 'traction' &&
                    summary.suggestedScore != null &&
                    summary.suggestedScore !== c.score && (
                      <div className="field-hint">
                        The metrics grade suggests {summary.suggestedScore.toFixed(1)}.{' '}
                        <button
                          type="button"
                          className="link-button"
                          onClick={() =>
                            update(
                              (d) =>
                                void (d.screen[i]!.score = Math.round(summary.suggestedScore!)),
                            )
                          }
                        >
                          Use {Math.round(summary.suggestedScore)}
                        </button>
                      </div>
                    )}
                </div>
              ))}
            </div>
          </Panel>

          <Panel
            title="Market size"
            description="Bottom-up: customers times annual contract value, then the share the product can serve and win."
          >
            <MarketBars
              tam={market.tam}
              sam={market.sam}
              som={market.som}
              customers={deal.market.customers}
              acv={deal.market.acv}
            />
            <p className="market-note">
              {Number.isFinite(market.samShareFor100m) ? (
                <>
                  Reaching <strong>$100M ARR</strong> takes{' '}
                  <strong>{pct(market.samShareFor100m)}</strong> of the serviceable market.{' '}
                  {market.samShareFor100m > 0.25
                    ? 'That is a large share; check whether the market is bigger than this bottom-up count, or ask how the company expands.'
                    : 'That share is plausible for a category leader.'}
                </>
              ) : (
                'Enter customers and ACV to size the market.'
              )}
            </p>
          </Panel>

          <Explainer title="How the screen works">
            <p>
              The weighted score is the average of scored criteria, weighted by the weights you set
              (they do not need to sum to 100). The recommendation waits until at least 60% of the
              weight is scored. A failed required thesis check is an automatic pass, whatever the
              score.
            </p>
            <p>
              Market sizing is bottom-up rather than a top-down industry report figure, because
              investment committees trust a count of real buyers times a real price. The $100M ARR
              line is the conventional bar for a venture-scale outcome.
            </p>
          </Explainer>
        </div>
      </div>
    </div>
  );
}

function MarketBars({
  tam,
  sam,
  som,
  customers,
  acv,
}: {
  tam: number;
  sam: number;
  som: number;
  customers: number;
  acv: number;
}) {
  const rows = [
    {
      key: 'TAM',
      label: 'Total addressable',
      value: tam,
      detail: `${shares(customers)} customers × ${money(acv)}`,
      cls: 'seq-1',
    },
    {
      key: 'SAM',
      label: 'Serviceable',
      value: sam,
      detail: tam > 0 ? `${pct(sam / tam, 0)} of TAM` : '',
      cls: 'seq-2',
    },
    {
      key: 'SOM',
      label: 'Obtainable',
      value: som,
      detail: sam > 0 ? `${pct(som / sam, 0)} of SAM` : '',
      cls: 'seq-3',
    },
  ];
  return (
    <div
      className="market-bars"
      role="img"
      aria-label={`TAM ${money(tam)}, SAM ${money(sam)}, SOM ${money(som)}`}
    >
      {rows.map((r) => (
        <div key={r.key} className="market-row">
          <div className="market-label">
            <strong>{r.key}</strong>
            <span className="muted">{r.label}</span>
          </div>
          <div className="market-track">
            <span
              className={`market-fill ${r.cls}`}
              style={{ width: `${tam > 0 ? Math.max(0.6, (r.value / tam) * 100) : 0}%` }}
            />
          </div>
          <div className="market-value">
            <strong className="num">{money(r.value)}</strong>
            <span className="muted">{r.detail}</span>
          </div>
        </div>
      ))}
    </div>
  );
}
