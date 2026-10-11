import { Dialog } from '../components/Controls';
import { SOURCES, type Source } from '../engine';

const USES: Array<{ key: keyof typeof SOURCES; use: string }> = [
  { key: 'ycSafe', use: 'SAFE conversion mechanics; the engine reproduces its worked examples' },
  { key: 'bessemer', use: 'ARR growth, retention, CAC payback, Rule of 40, cash conversion' },
  { key: 'saasCapital', use: 'Net revenue retention quartiles for private SaaS' },
  { key: 'sacks', use: 'Burn multiple bands' },
  { key: 'chartmogul', use: 'Magic number thresholds' },
  { key: 'grossMargin', use: 'Gross margin target and median' },
  { key: 't2d3', use: 'T2D3 growth path' },
  { key: 'carta', use: 'Dilution by round, used for later rounds' },
  { key: 'cartaPrivate', use: 'Seed and Series A valuation medians in the samples' },
  { key: 'cartaPreSeed', use: 'Post-money SAFE cap medians in the samples' },
  { key: 'correlation', use: 'Outcome distribution for the fund model' },
];

export function SourcesDialog({ onClose }: { onClose: () => void }) {
  return (
    <Dialog title="Sources and method" onClose={onClose}>
      <p className="subtle">
        Every calculation runs in the browser from a small, tested engine. Cap table math is checked
        against Y Combinator&rsquo;s published examples share for share; waterfall results are
        property-tested to pay out every dollar and to leave no class better off by switching its
        conversion choice.
      </p>
      <ul className="sources">
        {USES.map(({ key, use }) => {
          const s: Source = SOURCES[key];
          return (
            <li key={key}>
              {s.url ? (
                <a href={s.url} target="_blank" rel="noreferrer">
                  {s.label}
                </a>
              ) : (
                <span>{s.label}</span>
              )}
              <span className="muted">{use}</span>
            </li>
          );
        })}
      </ul>
      <p className="field-hint">
        Sample companies, founders, and investors are fictional. Benchmarks describe venture-backed
        companies and are a starting point for questions, not a verdict.
      </p>
    </Dialog>
  );
}
