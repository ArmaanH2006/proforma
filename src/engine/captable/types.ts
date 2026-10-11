/**
 * Cap table domain types.
 *
 * Share counts are whole numbers. Money is in dollars. Rates and percentages
 * are fractions (0.2 means 20%).
 */

export type HolderKind = 'founder' | 'employee' | 'investor' | 'fund';

export interface Holder {
  id: string;
  name: string;
  kind: HolderKind;
}

export type Participation = 'none' | 'full' | 'capped';

export interface ShareClass {
  id: string;
  name: string;
  kind: 'common' | 'preferred';
  /** Original issue price per share. The liquidation preference is based on it. */
  issuePrice: number;
  /** Liquidation preference multiple (1 = 1x). Ignored for common. */
  prefMultiple: number;
  participation: Participation;
  /** Capped participation only: total return cap as a multiple of issue price, e.g. 3 for 3x. */
  participationCap: number;
  /** Higher ranks are paid first; equal ranks are pari passu. Common is always 0. */
  seniority: number;
  /** Financing event that created the class. */
  eventId?: string;
}

export interface Position {
  holderId: string;
  classId: string;
  shares: number;
  /** Cash paid for the shares (cost basis). Used for MOIC. */
  invested: number;
  eventId?: string;
}

export interface OptionPool {
  /** Granted and promised options, vested or not. */
  granted: number;
  /** Weighted-average exercise price of granted options. */
  avgStrike: number;
  /** Reserved but not yet granted. */
  unissued: number;
}

export type ConvertibleType = 'post-safe' | 'pre-safe' | 'note';

export interface Convertible {
  id: string;
  holderId: string;
  type: ConvertibleType;
  /** Purchase amount for a SAFE, principal for a note. */
  amount: number;
  /**
   * Valuation cap. A post-money cap for post-money SAFEs; a pre-money cap for
   * pre-money SAFEs and notes. Null or 0 means uncapped.
   */
  cap?: number | null;
  /** Discount to the round price, e.g. 0.2 for a 20% discount. */
  discount?: number | null;
  /** Notes only: annual simple interest rate. */
  interestRate?: number | null;
  /** Notes only: months from issuance to conversion, for interest accrual. */
  termMonths?: number | null;
  eventId?: string;
}

export interface CapTable {
  classes: ShareClass[];
  positions: Position[];
  pool: OptionPool;
  /** SAFEs and notes issued and not yet converted. */
  convertibles: Convertible[];
}

export type PoolTarget =
  | { mode: 'none' }
  /** Size the unissued pool to a share of the post-money fully diluted count. */
  | { mode: 'target'; percentPost: number }
  /** Add a fixed number of shares to the unissued pool. */
  | { mode: 'shares'; shares: number };

export interface Investment {
  holderId: string;
  amount: number;
}

export interface PreferredTerms {
  prefMultiple: number;
  participation: Participation;
  participationCap: number;
  /** Rank relative to existing preferred. */
  seniority: 'senior' | 'pari';
}

export interface ConvertibleEvent {
  id: string;
  kind: 'convertibles';
  label: string;
  date?: string;
  instruments: Convertible[];
}

export interface PricedRoundEvent {
  id: string;
  kind: 'priced';
  /** Series name, e.g. "Series Seed". */
  label: string;
  date?: string;
  /** Headline pre-money valuation. Includes converting SAFEs/notes and any pool increase. */
  preMoney: number;
  investments: Investment[];
  pool: PoolTarget;
  terms: PreferredTerms;
  /** Decimal places for the price per share. Defaults to 4. */
  pricePrecision?: number;
}

export type FinancingEvent = ConvertibleEvent | PricedRoundEvent;

export interface Issue {
  level: 'error' | 'warning';
  message: string;
}
