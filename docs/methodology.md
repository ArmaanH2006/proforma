# Methodology

How every number in Proforma is computed, what it assumes, and where its benchmarks come from. The code lives in `src/engine/`; each module has tests next to it.

Conventions: money is in dollars, share counts are whole shares, and rates are fractions (0.2 means 20%). "Fully diluted" (FD) counts issued shares, granted options, and the unissued option pool.

---

## 1. Screen

**Weighted score.** Each criterion gets a score from 1 to 5 and a weight. The score is the weighted average of the criteria that have been scored:

```
score = Σ(scoreᵢ × weightᵢ) / Σ(weightᵢ over scored criteria)
```

A recommendation appears once at least 60% of the total weight is scored: 3.75 or higher advances to diligence, 3.0 to 3.75 goes to discussion, lower passes. A failed **required** thesis check is an automatic pass regardless of score.

**Bottom-up market sizing.**

```
TAM = potential customers × ACV at scale
SAM = TAM × serviceable share
SOM = SAM × obtainable share
SAM share needed for $100M ARR = $100M / SAM
```

The last line is the sanity check investment committees ask for: if reaching a venture-scale outcome needs a third of the serviceable market, the market is either bigger than the count suggests or the company needs a credible expansion story.

---

## 2. SaaS metrics

Every input is optional. A metric is computed only when its inputs exist; otherwise the page says which inputs it needs.

| Metric                  | Formula                                                                             | Benchmark                                                                            |
| ----------------------- | ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| ARR growth              | ARR today / ARR 12 months ago − 1                                                   | Bessemer, by ARR range. $1–10M: median 165%, top performers 230%+                    |
| Net revenue retention   | as reported, trailing 12 months                                                     | SaaS Capital 2025 ($25–50K ACV): bottom quartile 97%, median 102%, top quartile 111% |
| Gross revenue retention | as reported                                                                         | Bessemer: 85–90% typical; SMB 70–80%                                                 |
| Gross margin            | (revenue − cost of revenue) / revenue                                               | Benchmarkit 2025: median ~77%, target 75%+                                           |
| Burn multiple           | net burn / net new ARR, same quarter                                                | David Sacks: <1x amazing, 1–1.5x great, 1.5–2x good, 2–3x suspect, >3x bad           |
| Magic number            | net new ARR this quarter / S&M spend last quarter                                   | ChartMogul: >0.75 efficient, 0.5–0.75 acceptable, <0.5 fix first                     |
| CAC payback             | CAC / (ACV / 12 × gross margin), CAC = S&M / new customers                          | Bessemer targets: SMB <12 months, mid-market <18, enterprise <24                     |
| LTV / CAC               | (ACV × gross margin × lifetime) / CAC, lifetime = 1 / (1 − GRR), capped at 10 years | Bessemer: invest in acquisition at 3x+                                               |
| Rule of 40              | ARR growth + FCF margin                                                             | 40%+; shown ungraded below $10M ARR                                                  |
| Runway                  | cash / monthly net burn                                                             | Rule of thumb: under 6 months is a concern, 18+ is comfortable                       |
| Cash conversion score   | ARR / (capital raised − cash on hand)                                               | Bessemer: ~0.5x average at $1–10M ARR, 1x+ best in class                             |

Net new ARR is quarterly, so quarterly burn is monthly net burn × 3. Magic number uses net new ARR in place of the quarter-over-quarter revenue change × 4, which is the same quantity. Where a band extends a source's single threshold (for example the "up to 1.5x target" CAC payback band), the label says so.

**ARR trajectory.** The base case compounds today's growth rate with annual decay `d`: `g(t+1) = g(t) × (1 − d)`. The benchmark path is T2D3 (triple, triple, double, double, double), from Battery Ventures. The year a path crosses $100M ARR is interpolated on a log scale.

---

## 3. Cap table and financing

The financing history is a list of events applied in order to a starting cap table (founder common plus the option pool). Two event types exist.

### SAFEs and notes

A **SAFEs / notes** event adds instruments to the outstanding list. Until a priced round, the cap table shows them "as converted at their caps":

- A **post-money SAFE** with purchase amount `a` and post-money cap `C` owns exactly `a / C` of the company capitalization, which counts every SAFE. Later post-money SAFEs therefore dilute the founders, not earlier SAFE holders.
- A **pre-money SAFE** or **note** converts on a capitalization that leaves out every SAFE and note, so its implied shares are `a × S0 / C`.
- An uncapped SAFE cannot be priced until a round sets the price.

Notes convert principal plus simple interest: `a × (1 + rate × months / 12)`.

### Priced rounds

Let `S0` be existing FD shares, `U0` the unissued pool, `M` the headline pre-money, `I` the new money, and `X` the pool increase. Following Y Combinator's SAFE documents:

- **Post-money SAFE** price = cap / Company Capitalization (CC). CC counts all shares, granted options, the existing unissued pool, and every converting security, but not the pool increase for this round.
- **Pre-money SAFE / note** price = cap / (S0 + X): the pool increase is in, the SAFEs and notes are out.
- **Discount** price = round price × (1 − discount). An instrument with both a cap and a discount converts at whichever price gives more shares.
- **Round price** P = M / (CC + X): the headline pre-money includes the converted shares and the pool increase.

For a fixed choice of cap or discount per instrument the system has a closed form. With

```
g = Σ a/cap   over pre-money SAFEs and notes converting at cap
F = Σ a/cap   over post-money SAFEs converting at cap
c = Σ a/(1−d) over instruments converting at a discount (d = 0 at the round price)
m = M − c/(1 − F)      h = 1 + g/(1 − F)      k = S0(1 + g)/(1 − F)
```

the price is `P = m / (hX + k)`. A post-money pool target `p` adds `U0 + X = p × (M + I) / P`, which solves to

```
X = (p·(M+I)·k/m − U0) / (1 − p·(M+I)·h/m)
```

If the denominator is not positive the target is unreachable, because each new pool share sits inside the pre-money and only lowers the price; the app says so instead of returning a number. The engine picks each dual-term instrument's basis by iterating best responses (cap or discount, whichever is cheaper at the current solution) and falls back to enumerating every combination if that ever cycles.

**Whole shares.** After the continuous solve, a final pass mirrors how the documents are executed: conversion shares are rounded down, CC is rounded down, the price is rounded to four decimals by default, new-money shares are rounded down, and a target pool increase is rounded up so the target is met.

**Shadow series.** Each SAFE converts into its own series priced at its conversion price (YC's "Safe Preferred Stock", named Series Seed-1, Seed-2, and so on). Its liquidation preference therefore equals what it paid, not the new investors' price.

**Effective pre-money.** The headline pre-money splits into what existing holders' shares are worth at the round price (`P × S0`), the SAFE and note conversion shares, and the pool increase. The gap between the headline and the effective pre-money is the option pool shuffle plus the cost of the SAFEs.

**Pro rata.** A holder's pro rata check is its current ownership, with outstanding SAFEs counted at their caps, times the round size.

### Validation

`financing.test.ts` reproduces Appendix II, Example 1 of Y Combinator's _Post-Money Safe User Guide_ share for share: SAFE conversions of 588,235 and 1,176,470 shares, a Series A price of $1.1144, 3,589,375 shares for the lead, and 17,946,424 fully diluted shares after the round. Example 2 (a pre-money SAFE alongside a post-money SAFE) matches the published ownership percentages to two decimals; the guide rounds the pre-money Safe Price to $0.3248 before dividing, while the engine keeps full precision. Property tests check that post-money SAFE ownership equals `a / cap` of CC and that new investors own `I / (M + I)` across random rounds.

---

## 4. Valuation check (VC method)

Work back from an exit to the most a round can pay:

```
exit value          = base-case ARR in exit year × EV/ARR multiple
retention           = Π(1 − dilution of each later round)
ownership needed    = round size × target multiple / exit value / retention
post-money supported = exit value × retention / target multiple
```

Later-round dilution comes from the modeled rounds after this one (`1 − existing shares / post-money shares`), then the projected rounds on the Exit stage, whose defaults are Carta's medians for software companies (Series A 18%, Series B 12%, Series C 10%).

---

## 5. Liquidation waterfall

Built from the cap table at the selected point in the history:

- **Common** and **granted options** share the residual. Options exercise only when the residual price per share exceeds their weighted-average strike, and are paid net of strike. The unissued pool receives nothing.
- **Preferred** classes carry a preference of `shares × issue price × multiple`, a seniority rank, and participation: none, full, or capped at a multiple of issue price (preference included).
- **Unconverted SAFEs** take the greater of their purchase amount or their as-converted amount, ranking with the most junior preferred (the post-money SAFE's liquidity priority). Their as-converted shares use a capitalization that excludes the unissued pool.
- **Unconverted notes** are debt: repaid with interest ahead of all equity, or converted at the cap if that is worth more.

For a given set of converting classes, proceeds are paid down the preference stack by rank, pro rata by preference within a rank. The residual is split by solving for the price per share `p` in

```
Σᵢ min(sharesᵢ × max(0, p − strikeᵢ), headroomᵢ) = residual
```

where headroom is a capped class's cap minus its preference paid. The left side is piecewise linear and nondecreasing in `p`, so the engine walks its kinks and solves the final segment exactly.

**Conversion choices.** Each non-participating or capped class may convert. The engine looks for the choices where no class can do better by switching on its own: best responses starting from "nobody converts", in order of preference per share, with an exhaustive search over all combinations as a fallback. Property tests (fast-check, hundreds of random structures) check that the result is such an equilibrium, that every dollar of proceeds is paid out, and that each class's payout never falls as the exit value rises.

**Breakpoints** are found by scanning the exit range for changes in the waterfall's shape (preferences covered, options in the money, a cap reached, a class converting) and refining each one by bisection.

**Our position at exit.** Ownership after the last modeled event is carried through the projected later rounds; taking pro rata holds ownership and costs `ownership × dilution × post-money`. Proceeds in that table are ownership × exit value, which ignores later-round preferences (at large exits every class converts, so the error is small). The exit needed to return the fund is `fund size / ownership at exit`.

---

## 6. Fund model

**Plan.**

```
fees               = fund size × annual fee × fee years
investable         = fund size − fees
companies          = floor(investable × (1 − reserve ratio) / first check)
reserves           = investable − companies × first check
follow-on check    = reserves / expected number of companies that raise again
```

**Each simulated fund.** First checks are spread evenly over the deployment years. Each company draws an outcome bucket by probability, a multiple inside the bucket (log-uniform, so most outcomes land near the bottom of the range; uniform when the range starts at 0), and an exit year. A company raises a next round with one probability if its eventual outcome is 1x or better and a lower one if not; that is the only signal the fund gets. Companies that raise receive a follow-on check a year later, at the step-up price, so a follow-on dollar earns `multiple / step-up`.

**Cash flows** are annual. Capital calls are fees plus checks. Carry is European (whole fund): the GP earns `carry × max(0, cumulative distributions − total paid-in)`, so LPs get every contributed dollar back before any carry is paid. No hurdle or catch-up is modeled.

**Outputs.** Net TVPI = LP distributions / LP paid-in. DPI by year = cumulative LP distributions / cumulative paid-in; it counts only cash returned, so it starts at zero and reaches TVPI once every company has exited. Gross multiple = proceeds / invested capital. Net IRR solves `NPV = 0` on the annual LP cash flows by bisection. The J-curve is cumulative LP net cash flow as a multiple of fund size. Power-law statistics: the best company's share of gross proceeds, and the share of runs in which one company returns the whole fund.

**Outcome distribution.** The default buckets match Correlation Ventures' data on more than 21,000 venture financings from 2001 to 2013: 65% returned less than 1x, about 25% returned 1–5x, about 6% returned 5–10x, and 4% returned 10x or more. The split inside each bucket (for example 35% write-offs and 30% partial losses within the 65%) and the exit-year ranges are assumptions, labeled as such, and editable.

**Reproducibility.** Runs use a seeded Mulberry32 generator and always draw four random numbers per company, so the same inputs and seed give identical results. Tests check determinism, that the simulated mean multiple converges to the analytic expectation of the outcome table, and the carry arithmetic.

---

## 7. Simplifications

- One option pool with a weighted-average strike; vesting is ignored at exit.
- No cumulative dividends, redemption rights, or anti-dilution adjustments (anti-dilution matters only in down rounds).
- Every outstanding SAFE and note converts at the next priced round.
- Notes convert on the same capitalization as pre-money SAFEs; real note language varies.
- The fund model has no recycling, no fee step-down, and no hurdle.

## Sources

- Y Combinator, [SAFE documents and Post-Money Safe User Guide](https://www.ycombinator.com/documents)
- Bessemer Venture Partners, [Scaling to $100 Million](https://www.bvp.com/atlas/scaling-to-100-million)
- SaaS Capital, [Retention benchmarks for private B2B SaaS companies](https://www.saas-capital.com/research/saas-retention-benchmarks-for-private-b2b-companies/)
- David Sacks, [The Burn Multiple](https://sacks.substack.com/p/the-burn-multiple-51a7e43cb200)
- ChartMogul, [Magic Number](https://chartmogul.com/saas-metrics/magic-number/)
- CloudZero, [SaaS gross margin benchmarks](https://www.cloudzero.com/blog/saas-gross-margin-benchmarks/) (summarizing Benchmarkit 2025)
- Neeraj Agrawal (Battery Ventures), [The SaaS Travel Adventure](https://techcrunch.com/2015/02/01/the-saas-travel-adventure/)
- Carta, [Dilution by round](https://carta.com/data/linkedin-dilution-by-round-primary-vs-bridge/), [State of Private Markets: 2025 in review](https://carta.com/data/state-of-private-markets-q4-2025-full-report/), [State of Pre-Seed: 2025 in review](https://carta.com/data/state-of-pre-seed-2025/)
- Seth Levine, [Venture outcomes are even more skewed than you think](https://sethlevine.com/archives/2014/08/venture-outcomes-are-even-more-skewed-than-you-think.html) (Correlation Ventures data)
