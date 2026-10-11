import { describe, expect, it } from 'vitest';
import { exitToReturnFund, projectOwnership, retentionRatio, vcMethod } from './vcMethod';

describe('VC method', () => {
  it('works back from exit value to a post-money', () => {
    const r = vcMethod({
      investment: 4e6,
      exitValue: 300e6,
      targetMultiple: 10,
      futureDilution: [0.18, 0.12, 0.1],
    });
    expect(r.retention).toBeCloseTo(0.82 * 0.88 * 0.9, 12);
    expect(r.requiredOwnershipAtExit).toBeCloseTo(40e6 / 300e6, 12);
    expect(r.requiredOwnershipToday).toBeCloseTo(r.requiredOwnershipAtExit / r.retention, 12);
    expect(r.impliedPostMoney).toBeCloseTo((300e6 * r.retention) / 10, 4);
    expect(r.impliedPreMoney).toBeCloseTo(r.impliedPostMoney - 4e6, 4);
    // Consistency: owning I / post today becomes the required stake at exit.
    expect((4e6 / r.impliedPostMoney) * r.retention).toBeCloseTo(r.requiredOwnershipAtExit, 12);
  });

  it('treats no future rounds as no dilution', () => {
    expect(retentionRatio([])).toBe(1);
  });
});

describe('ownership path', () => {
  it('dilutes through rounds unless the fund takes its pro rata', () => {
    const steps = projectOwnership(0.01, [
      { id: 'a', label: 'Series A', dilution: 0.2, postMoney: 60e6, proRata: false },
      { id: 'b', label: 'Series B', dilution: 0.1, postMoney: 100e6, proRata: true },
    ]);
    expect(steps[0]!.ownership).toBeCloseTo(0.008, 12);
    expect(steps[1]!.ownership).toBeCloseTo(0.008, 12);
    // Holding 0.8% through a $10M raise costs 0.8% of $10M.
    expect(steps[1]!.followOn).toBeCloseTo(80_000, 6);
  });

  it('sizes the exit that returns the fund', () => {
    expect(exitToReturnFund(1e6, 0.001)).toBeCloseTo(1e9, 3);
    expect(exitToReturnFund(1e6, 0)).toBe(Infinity);
  });
});
