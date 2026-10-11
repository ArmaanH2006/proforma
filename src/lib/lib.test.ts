import { describe, expect, it } from 'vitest';
import { money, multiple, pct, price, shares } from './format';
import { editText, parseAmount, parseField } from './parse';

describe('parseAmount', () => {
  it('reads shorthand people type in finance', () => {
    expect(parseAmount('1.5m')).toBe(1_500_000);
    expect(parseAmount('$250k')).toBe(250_000);
    expect(parseAmount('2,000,000')).toBe(2_000_000);
    expect(parseAmount('1.2B')).toBe(1_200_000_000);
    expect(parseAmount('3x')).toBe(3);
    expect(parseAmount('-140')).toBe(-140);
  });

  it('separates empty input from invalid input', () => {
    expect(parseAmount('  ')).toBeNull();
    expect(parseAmount('abc')).toBeNaN();
    expect(parseAmount('1.2.3')).toBeNaN();
  });

  it('treats percent fields as whole numbers', () => {
    expect(parseField('12', 'percent')).toBeCloseTo(0.12, 12);
    expect(parseField('12%', 'percent')).toBeCloseTo(0.12, 12);
    expect(editText(0.118, 'percent')).toBe('11.8');
  });
});

describe('formatting', () => {
  it('compacts money and promotes at unit boundaries', () => {
    expect(money(25_000)).toBe('$25K');
    expect(money(1_200_000)).toBe('$1.2M');
    expect(money(20_000_000)).toBe('$20M');
    expect(money(999_999)).toBe('$1M');
    expect(money(1_250_000_000)).toBe('$1.25B');
    expect(money(2_500)).toBe('$2,500');
    expect(money(null)).toBe('—');
  });

  it('formats percentages with precision for small stakes', () => {
    expect(pct(0.0017)).toBe('0.17%');
    expect(pct(0.125)).toBe('13%');
    expect(pct(0.054)).toBe('5.4%');
  });

  it('formats prices, shares, and multiples', () => {
    expect(price(1.1144)).toBe('$1.1144');
    expect(shares(17_946_424)).toBe('17,946,424');
    expect(multiple(10.62)).toBe('10.6x');
    expect(multiple(Infinity)).toBe('n/m');
  });
});
