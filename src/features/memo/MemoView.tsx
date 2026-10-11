import { useMemo } from 'react';
import { Button, Segmented } from '../../components/Controls';
import { TextArea, TextField } from '../../components/Field';
import { money, pct } from '../../lib/format';
import { uid } from '../../lib/id';
import { can, copyText, downloadText } from '../../lib/platform';
import { FUND_HOLDER_ID, type Memo } from '../../state/deal';
import {
  useDeal,
  useFundStake,
  useHistory,
  useMarket,
  useMetrics,
  useScreen,
} from '../../state/derived';
import { useStore } from '../../state/store';
import { buildMemoData, longDate, memoMarkdown, recommendationText } from './memoData';

const RECS: ReadonlyArray<{ value: Memo['recommendation']; label: string }> = [
  { value: 'invest', label: 'Invest' },
  { value: 'diligence', label: 'More diligence' },
  { value: 'pass', label: 'Pass' },
];

export function MemoView() {
  const deal = useDeal();
  const update = useStore((s) => s.update);
  const notify = useStore((s) => s.notify);
  const history = useHistory();
  const { results } = useMetrics();
  const market = useMarket();
  const screen = useScreen();
  const stake = useFundStake();
  const data = useMemo(
    () => buildMemoData(deal, history, results, market, screen, stake),
    [deal, history, results, market, screen, stake],
  );
  const memo = deal.memo;
  const c = deal.company;
  const setMemo = (fn: (m: Memo) => void) => update((d) => fn(d.memo));
  const markdown = () => memoMarkdown(deal, data);
  const slug = c.name.toLowerCase().replace(/[^a-z0-9]+/g, '-') || 'memo';

  return (
    <div className="view">
      <header className="view-header">
        <h1>Memo</h1>
        <p>
          The investment memo: the analyst&rsquo;s writing on the left, with terms, traction,
          market, and returns filled in from the other stages. It updates as the model changes.
        </p>
      </header>

      <div className="sheet memo-sheet">
        <div className="stack inputs memo-editor">
          <section className="panel">
            <div className="group">
              <div className="group-title">Memo</div>
              <div className="fields">
                <TextField
                  label="Analyst"
                  value={memo.analyst}
                  placeholder="Your name"
                  onChange={(v) => setMemo((m) => void (m.analyst = v))}
                />
                <div className="field">
                  <label className="field-label" htmlFor="memo-date">
                    Date
                  </label>
                  <div className="control">
                    <input
                      id="memo-date"
                      type="date"
                      value={memo.date}
                      onChange={(e) => setMemo((m) => void (m.date = e.target.value))}
                    />
                  </div>
                </div>
              </div>
              <div className="field">
                <span className="field-label">Recommendation</span>
                <Segmented
                  ariaLabel="Recommendation"
                  fill
                  value={memo.recommendation}
                  options={RECS}
                  onChange={(v) => setMemo((m) => void (m.recommendation = v))}
                />
              </div>
              <TextArea
                label="Summary"
                rows={5}
                value={memo.summary}
                onChange={(v) => setMemo((m) => void (m.summary = v))}
              />
            </div>
            <div className="group">
              <div className="group-title">
                Why we would invest
                <Button
                  size="sm"
                  variant="ghost"
                  icon="plus"
                  onClick={() => setMemo((m) => void m.thesis.push(''))}
                >
                  Add
                </Button>
              </div>
              {memo.thesis.map((t, i) => (
                <div key={i} className="list-row">
                  <TextArea
                    ariaLabel={`Thesis point ${i + 1}`}
                    rows={2}
                    value={t}
                    onChange={(v) => setMemo((m) => void (m.thesis[i] = v))}
                  />
                  <Button
                    size="sm"
                    variant="ghost"
                    icon="trash"
                    title="Remove point"
                    onClick={() => setMemo((m) => void m.thesis.splice(i, 1))}
                  />
                </div>
              ))}
            </div>
            <div className="group">
              <div className="group-title">Business</div>
              <TextArea
                label="Product and moat"
                rows={4}
                value={memo.product}
                onChange={(v) => setMemo((m) => void (m.product = v))}
              />
              <TextArea
                label="Competition"
                rows={4}
                value={memo.competition}
                onChange={(v) => setMemo((m) => void (m.competition = v))}
              />
            </div>
            <div className="group">
              <div className="group-title">
                Risks and mitigants
                <Button
                  size="sm"
                  variant="ghost"
                  icon="plus"
                  onClick={() =>
                    setMemo((m) => void m.risks.push({ id: uid('risk'), risk: '', mitigant: '' }))
                  }
                >
                  Add
                </Button>
              </div>
              {memo.risks.map((r, i) => (
                <div key={r.id} className="risk-row">
                  <div className="list-row">
                    <TextArea
                      ariaLabel={`Risk ${i + 1}`}
                      rows={2}
                      value={r.risk}
                      placeholder="Risk"
                      onChange={(v) => setMemo((m) => void (m.risks[i]!.risk = v))}
                    />
                    <Button
                      size="sm"
                      variant="ghost"
                      icon="trash"
                      title="Remove risk"
                      onClick={() => setMemo((m) => void m.risks.splice(i, 1))}
                    />
                  </div>
                  <TextArea
                    ariaLabel={`Mitigant ${i + 1}`}
                    rows={2}
                    value={r.mitigant}
                    placeholder="Mitigant"
                    onChange={(v) => setMemo((m) => void (m.risks[i]!.mitigant = v))}
                  />
                </div>
              ))}
            </div>
            <div className="group">
              <TextArea
                label="Next steps"
                rows={3}
                value={memo.nextSteps}
                onChange={(v) => setMemo((m) => void (m.nextSteps = v))}
              />
            </div>
          </section>
        </div>

        <div className="stack">
          <div className="memo-actions">
            <Button
              icon="copy"
              onClick={async () =>
                notify(
                  (await copyText(markdown()))
                    ? 'Memo copied as Markdown'
                    : 'Copy failed in this browser',
                )
              }
            >
              Copy as Markdown
            </Button>
            {can.download && (
              <Button
                icon="download"
                onClick={() => downloadText(`${slug}-memo.md`, markdown(), 'text/markdown')}
              >
                Download .md
              </Button>
            )}
            {can.print && (
              <Button icon="printer" onClick={() => window.print()}>
                Print or save PDF
              </Button>
            )}
          </div>

          <article className="memo-doc" aria-label="Investment memo">
            <header className="memo-head">
              <div className="memo-eyebrow">
                Investment memo ·{' '}
                {deal.holders.find((h) => h.id === FUND_HOLDER_ID)?.name ?? 'Our fund'}
              </div>
              <h2 className="memo-title">{c.name || 'Untitled company'}</h2>
              {c.oneLiner && <p className="memo-lede">{c.oneLiner}</p>}
              <div className="memo-meta">
                {[c.stage, c.sector, c.location, c.founded ? `Founded ${c.founded}` : '']
                  .filter(Boolean)
                  .join(' · ')}
              </div>
              <div className="memo-byline">
                <span>
                  {memo.analyst || 'Analyst'} · {longDate(memo.date)}
                </span>
                <span className={`memo-rec rec-${memo.recommendation}`}>
                  {recommendationText(deal, data.check)}
                </span>
              </div>
            </header>

            <section className="memo-terms">
              <table>
                <tbody>
                  {data.terms.map((t) => (
                    <tr key={t.label}>
                      <th scope="row">{t.label}</th>
                      <td>{t.value}</td>
                    </tr>
                  ))}
                  <tr>
                    <th scope="row">Screen score</th>
                    <td>{data.screenScore}</td>
                  </tr>
                </tbody>
              </table>
            </section>

            {memo.summary && (
              <section>
                <h3>Summary</h3>
                <p>{memo.summary}</p>
              </section>
            )}

            {memo.thesis.some((t) => t.trim()) && (
              <section>
                <h3>Why we would invest</h3>
                <ol>
                  {memo.thesis
                    .filter((t) => t.trim())
                    .map((t, i) => (
                      <li key={i}>{t}</li>
                    ))}
                </ol>
              </section>
            )}

            <section>
              <h3>Team</h3>
              <ul className="memo-team">
                {c.founders.map((f) => (
                  <li key={f.id}>
                    <strong>{f.name}</strong>, {f.role}
                    {f.background && <>. {f.background}</>}
                  </li>
                ))}
              </ul>
            </section>

            <section>
              <h3>Market</h3>
              <p>
                Bottom-up, the total addressable market is <strong>{money(data.market.tam)}</strong>{' '}
                ({deal.market.customers.toLocaleString('en-US')} customers at{' '}
                {money(deal.market.acv)} a year). The serviceable market is {money(data.market.sam)}{' '}
                and the obtainable share is about {money(data.market.som)}. Reaching $100M ARR takes{' '}
                {pct(data.market.samShareFor100m)} of the serviceable market.
              </p>
            </section>

            {memo.product && (
              <section>
                <h3>Product and moat</h3>
                <p>{memo.product}</p>
              </section>
            )}

            {data.traction.length > 0 && (
              <section>
                <h3>Traction</h3>
                <table className="memo-table">
                  <thead>
                    <tr>
                      <th>Metric</th>
                      <th className="r">Value</th>
                      <th>Against benchmark</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.traction.map((t) => (
                      <tr key={t.label}>
                        <td>{t.label}</td>
                        <td className="r">{t.value}</td>
                        <td>{t.grade}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </section>
            )}

            {memo.competition && (
              <section>
                <h3>Competition</h3>
                <p>{memo.competition}</p>
              </section>
            )}

            <section>
              <h3>Returns</h3>
              <p>
                We would own {data.ownershipNow} after this round and about {data.ownershipExit} at
                exit after later dilution. Returning the whole fund takes a{' '}
                <strong>{data.returnFundExit}</strong> exit.
              </p>
              <table className="memo-table">
                <thead>
                  <tr>
                    <th>Exit</th>
                    <th className="r">Our proceeds</th>
                    <th className="r">Multiple</th>
                    <th className="r">Share of fund</th>
                  </tr>
                </thead>
                <tbody>
                  {data.returns.map((r) => (
                    <tr key={r.exit}>
                      <td>{r.exit}</td>
                      <td className="r">{r.proceeds}</td>
                      <td className="r">{r.multiple}</td>
                      <td className="r">{r.fundShare}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>

            {memo.risks.some((r) => r.risk.trim()) && (
              <section>
                <h3>Risks and mitigants</h3>
                <table className="memo-table risks">
                  <thead>
                    <tr>
                      <th>Risk</th>
                      <th>Mitigant</th>
                    </tr>
                  </thead>
                  <tbody>
                    {memo.risks
                      .filter((r) => r.risk.trim())
                      .map((r) => (
                        <tr key={r.id}>
                          <td>{r.risk}</td>
                          <td>{r.mitigant}</td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </section>
            )}

            {memo.nextSteps && (
              <section>
                <h3>Next steps</h3>
                <p>{memo.nextSteps}</p>
              </section>
            )}

            <footer className="memo-foot">
              Company figures are as reported by management and unaudited. Benchmarks: Bessemer
              Venture Partners, SaaS Capital, David Sacks, Carta. Returns ignore later-round
              preferences.
            </footer>
          </article>
        </div>
      </div>
    </div>
  );
}
