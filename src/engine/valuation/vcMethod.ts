/**
 * The venture capital method: work back from an exit value to the most an
 * investor can pay today and still earn its target multiple after future
 * dilution.
 */

export interface VcMethodInputs {
  /** Size of the round being priced. */
  investment: number;
  /** Equity value at exit. */
  exitValue: number;
  /** Gross multiple the investor needs on this round (e.g. 10 for 10x). */
  targetMultiple: number;
  /** Dilution from each later round, as fractions. */
  futureDilution: readonly number[];
}

export interface VcMethodResult {
  /** Share of today's ownership left at exit, after later rounds. */
  retention: number;
  requiredOwnershipAtExit: number;
  requiredOwnershipToday: number;
  impliedPostMoney: number;
  impliedPreMoney: number;
}

export function retentionRatio(dilution: readonly number[]): number {
  return dilution.reduce((r, d) => r * (1 - Math.min(Math.max(d, 0), 0.99)), 1);
}

export function vcMethod(i: VcMethodInputs): VcMethodResult {
  const retention = retentionRatio(i.futureDilution);
  const requiredOwnershipAtExit =
    i.exitValue > 0 ? (i.investment * i.targetMultiple) / i.exitValue : Infinity;
  const requiredOwnershipToday = requiredOwnershipAtExit / retention;
  const impliedPostMoney = i.targetMultiple > 0 ? (i.exitValue * retention) / i.targetMultiple : 0;
  return {
    retention,
    requiredOwnershipAtExit,
    requiredOwnershipToday,
    impliedPostMoney,
    impliedPreMoney: impliedPostMoney - i.investment,
  };
}

export interface FutureRound {
  id: string;
  label: string;
  /** New shares as a fraction of post-money fully diluted. */
  dilution: number;
  /** Post-money valuation of the round, used to size a pro rata check. */
  postMoney: number;
  /** Invest enough to hold ownership through this round. */
  proRata: boolean;
}

export interface OwnershipStep {
  label: string;
  ownership: number;
  /** Follow-on dollars needed to hold ownership through this round. */
  followOn: number;
}

/** Walk ownership through later rounds, holding it constant where the fund takes its pro rata. */
export function projectOwnership(current: number, rounds: readonly FutureRound[]): OwnershipStep[] {
  const steps: OwnershipStep[] = [];
  let own = current;
  for (const r of rounds) {
    const d = Math.min(Math.max(r.dilution, 0), 0.99);
    if (r.proRata) {
      steps.push({ label: r.label, ownership: own, followOn: own * d * r.postMoney });
    } else {
      own *= 1 - d;
      steps.push({ label: r.label, ownership: own, followOn: 0 });
    }
  }
  return steps;
}

/** Exit value at which one company's proceeds equal the whole fund. */
export function exitToReturnFund(fundSize: number, ownershipAtExit: number): number {
  return ownershipAtExit > 0 ? fundSize / ownershipAtExit : Infinity;
}
