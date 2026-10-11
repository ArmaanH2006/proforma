/**
 * Parse what people type into number fields: "1.5m", "$250k", "2,000,000",
 * "12%", "3x". Returns null for empty input and NaN for input that is not a number.
 */
const SUFFIX: Record<string, number> = { k: 1e3, m: 1e6, mm: 1e6, b: 1e9, bn: 1e9 };

export function parseAmount(input: string): number | null {
  const s = input
    .trim()
    .toLowerCase()
    .replace(/[$,\s_]/g, '')
    .replace(/x$/, '')
    .replace(/%$/, '');
  if (s === '') return null;
  const match = /^(-?\d*\.?\d+(?:e[+-]?\d+)?)(k|m|mm|b|bn)?$/.exec(s);
  if (!match) return Number.NaN;
  const value = Number(match[1]);
  const mult = match[2] ? SUFFIX[match[2]]! : 1;
  return value * mult;
}

export type NumberKind =
  'money' | 'percent' | 'number' | 'shares' | 'multiple' | 'months' | 'price' | 'years' | 'year';

/** Percent fields hold fractions; people type "12" or "12%" and mean 0.12. */
export function parseField(input: string, kind: NumberKind): number | null {
  const v = parseAmount(input);
  if (v == null || Number.isNaN(v)) return v;
  return kind === 'percent' ? v / 100 : v;
}

/** Text shown while editing: plain digits, no grouping, percent as a whole number. */
export function editText(value: number | null, kind: NumberKind): string {
  if (value == null || !Number.isFinite(value)) return '';
  const v = kind === 'percent' ? value * 100 : value;
  const rounded = Math.round(v * 1e6) / 1e6;
  return String(rounded);
}
