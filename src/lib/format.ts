/** Number formatting for money, shares, percentages, and multiples. */

const usd0 = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 0,
});
const usd2 = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});
const int = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });

function trim(value: number, digits: number): string {
  return value.toFixed(digits).replace(/\.0+$|(\.\d*?)0+$/, '$1');
}

/** Compact money: $25K, $1.2M, $1.25B. Small amounts are shown in full. */
export function money(x: number | null | undefined, opts: { digits?: number } = {}): string {
  if (x == null || !Number.isFinite(x)) return '—';
  const sign = x < 0 ? '-' : '';
  const a = Math.abs(x);
  // Promote values that would round up to the next unit ($999.6K reads as $1M, not $1000K).
  if (a >= 999.5e6) return `${sign}$${trim(a / 1e9, opts.digits ?? 2)}B`;
  if (a >= 999.5e3)
    return `${sign}$${trim(a / 1e6, opts.digits ?? (a >= 1e8 ? 0 : a >= 1e7 ? 1 : 2))}M`;
  if (a >= 1e4) return `${sign}$${trim(a / 1e3, opts.digits ?? 0)}K`;
  return `${sign}${usd0.format(a)}`;
}

/** Full-precision money: $1,234,567. */
export function moneyFull(x: number | null | undefined, cents = false): string {
  if (x == null || !Number.isFinite(x)) return '—';
  return cents ? usd2.format(x) : usd0.format(x);
}

/** Price per share to four decimals: $1.1144. */
export function price(x: number | null | undefined, digits = 4): string {
  if (x == null || !Number.isFinite(x)) return '—';
  return `$${x.toFixed(digits)}`;
}

export function shares(x: number | null | undefined): string {
  if (x == null || !Number.isFinite(x)) return '—';
  return int.format(Math.round(x));
}

/** Percent from a fraction. Small values get extra precision so 0.17% does not read as 0%. */
export function pct(x: number | null | undefined, digits?: number): string {
  if (x == null || Number.isNaN(x)) return '—';
  if (!Number.isFinite(x)) return x > 0 ? '∞' : '-∞';
  const v = x * 100;
  const d = digits ?? (Math.abs(v) < 1 && v !== 0 ? 2 : Math.abs(v) < 10 ? 1 : 0);
  return `${v.toFixed(d)}%`;
}

/** Signed percentage-point or percent change: +2.4%. */
export function signedPct(x: number | null | undefined, digits = 1): string {
  if (x == null || !Number.isFinite(x)) return '—';
  return `${x > 0 ? '+' : ''}${(x * 100).toFixed(digits)}%`;
}

export function multiple(x: number | null | undefined, digits = 1): string {
  if (x == null || Number.isNaN(x)) return '—';
  if (!Number.isFinite(x)) return 'n/m';
  return `${x.toFixed(x >= 100 ? 0 : digits)}x`;
}

export function months(x: number | null | undefined): string {
  if (x == null || Number.isNaN(x)) return '—';
  if (!Number.isFinite(x)) return 'No burn';
  return `${x.toFixed(x >= 10 ? 0 : 1)} mo`;
}

export function years(x: number | null | undefined): string {
  if (x == null || !Number.isFinite(x)) return '—';
  return `${x.toFixed(1)} yrs`;
}

/** Axis tick label for money: 0, $250K, $1M, $2.5B. */
export function moneyTick(x: number): string {
  if (x === 0) return '$0';
  return money(x);
}

export function plural(n: number, word: string, pluralWord = `${word}s`): string {
  return `${int.format(n)} ${n === 1 ? word : pluralWord}`;
}
