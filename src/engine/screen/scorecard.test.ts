import { describe, expect, it } from 'vitest';
import { scoreScreen, sizeMarket, type Criterion, type ThesisCheck } from './scorecard';

const criteria = (scores: Array<number | null>): Criterion[] =>
  [
    { id: 'team', label: 'Team', weight: 30 },
    { id: 'market', label: 'Market', weight: 20 },
    { id: 'product', label: 'Product', weight: 20 },
    { id: 'traction', label: 'Traction', weight: 20 },
    { id: 'deal', label: 'Deal', weight: 10 },
  ].map((c, i) => ({ ...c, prompt: '', note: '', score: scores[i] ?? null }));

const thesis = (met: Array<boolean | null>): ThesisCheck[] =>
  met.map((m, i) => ({ id: `t${i}`, label: `Check ${i}`, met: m, required: i < 2 }));

describe('quick screen', () => {
  it('weights the scores', () => {
    const r = scoreScreen(criteria([5, 4, 4, 3, 2]), thesis([true, true, null]));
    expect(r.score).toBeCloseTo((5 * 30 + 4 * 20 + 4 * 20 + 3 * 20 + 2 * 10) / 100, 12);
    expect(r.recommendation).toBe('advance');
    expect(r.thesis).toBe('in');
  });

  it('passes on deals outside the thesis regardless of score', () => {
    const r = scoreScreen(criteria([5, 5, 5, 5, 5]), thesis([true, false, true]));
    expect(r.thesis).toBe('out');
    expect(r.recommendation).toBe('pass');
    expect(r.failedRequired).toEqual(['Check 1']);
  });

  it('waits for enough of the scorecard before recommending', () => {
    expect(
      scoreScreen(criteria([5, null, null, null, 5]), thesis([true, true])).recommendation,
    ).toBe('incomplete');
    expect(scoreScreen(criteria([3, 3, 3, 3, 3]), thesis([true, true])).recommendation).toBe(
      'discuss',
    );
    expect(scoreScreen(criteria([2, 3, 2, 2, 3]), thesis([true, true])).recommendation).toBe(
      'pass',
    );
  });
});

describe('market sizing', () => {
  it('nests SAM and SOM inside TAM', () => {
    const m = sizeMarket({
      customers: 10_000,
      acv: 50_000,
      serviceableShare: 0.4,
      obtainableShare: 0.1,
    });
    expect(m.tam).toBe(500e6);
    expect(m.sam).toBe(200e6);
    expect(m.som).toBe(20e6);
    expect(m.samShareFor100m).toBeCloseTo(0.5, 12);
  });
});
