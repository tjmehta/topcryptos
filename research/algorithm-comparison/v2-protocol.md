# Algorithm comparison v2: frozen exploratory protocol

Written before any v2 forward outcomes were computed or inspected. The earlier comparison outcomes were already read, so every v2 result is exploratory; no v2 segment is an untouched holdout. This is isolated offline research, not a production change or trading recommendation. All calendar and timestamp operations use UTC.

## Scope, source, and quarantine

- Read only local `.cache/coinmarketcap/cryptocurrency_listings:*.json`; make no network/API calls and do not alter cache files.
- Reuse the v1 daily-grid rule: for each UTC date choose the payload whose modal finite USD `last_updated` is closest to 23:00 UTC within ±30 minutes; ties choose the earlier modal timestamp, then lexicographically smaller filename. Require unique IDs per payload.
- Treat **2020-11-30** and **2021-01-28** as quarantined hard gaps. They are inventoried but cannot appear in formation, signal, entry, exit, feasibility, or portfolio paths, and no calculation may bridge either date.
- Consecutive unquarantined UTC dates form independent blocks. The 2026 block is the primary evidence. Every 2020–2021 block is diagnostic-only because the source is old, selectively retained, and adjacent to known contamination.
- Split each block chronologically into fixed `exploratory-train-era` (first two thirds of dates) and `exploratory-test-era` (last third). These names are descriptive only: prior outcomes influenced this v2 design, no fitting occurs, and neither part is a holdout. Outcomes must be grouped by era and named diagnostic segment.

## Fixed daily experiments

- Formation lookbacks are exactly **7, 21, and 30 calendar days**. A formation contains the signal-date snapshot and every daily snapshot back through signal date minus the lookback, so it has `lookback + 1` observations and cannot cross a hard gap.
- Entry lag is exactly **1 calendar day**: use the next daily snapshot after the signal. Before looking at entry rows, define `signalCutoff` as the maximum finite quote timestamp across all rows of the signal snapshot. Assert every selected coin’s complete formation has strictly increasing timestamps, every formation timestamp is at or before `signalCutoff`, and the entry snapshot’s modal time is strictly later than `signalCutoff`.
- Holdings are exactly **1 or 7 calendar days** from entry snapshot to exit snapshot. Signals within a `(block, segment, lookback, holding)` path advance by the holding interval, producing non-overlapping sequential cohorts. Formation may use earlier dates from the same block; entry and exit must both remain inside the named segment.
- Quote timestamps are observation labels, not proof of ingestion/publication availability. Retrospective cache construction leaves an unavoidable publication-availability caveat even after the strict cutoff rule.

## Point-in-time eligibility and immutable constituents

At the signal only, form one shared method universe. A coin must:

1. be present at every formation observation;
2. have finite positive USD price and market cap at every formation observation;
3. have a finite quote timestamp within one hour of each snapshot’s modal quote time;
4. have strictly increasing quote timestamps through formation, all no later than `signalCutoff`; and
5. be scoreable by the current production `processRankings` result for this formation.

Entry or exit presence never affects eligibility. Rank all methods on exactly these IDs and exactly these formation inputs. Select top 10 (or record a skipped signal if fewer than 10 eligible), then preserve those IDs without replacement. An unavailable entry remains that constituent’s denominator weight as cash; it is never replaced with a later-available survivor. An unavailable exit also remains in the denominator.

For Classic calculations, every snapshot row remains present so production market-cap ranks are formed exactly as in the application. IDs outside the shared eligible set are passed as disabled: they continue to establish snapshot ranks but do not define signed-percentile pools. All descending-score ties, including Classic, break by stable CMC ID ascending.

## Frozen methods

The production scorer is executed from `modules/processRankings.ts` through the already-installed TypeScript compiler. Its output supplies each eligible coin’s exact coverage-adjusted price velocity, price-acceleration sum, rank-acceleration sum, and Classic score. A local copy of production’s signed-percentile algorithm reconstructs component percentiles over the eligible pool; reconstructed Classic must match the production score for every eligible coin.

All component methods use the same signed-percentile values as Classic. Multiplying or omitting a common positive scale would not change ordering; the explicit scores below retain the production 1000-point scale.

1. **Classic**: `700 * velocityPercentile + 200 * priceAccelPercentile + 100 * rankAccelPercentile` (the exact current 70/20/10 production blend).
2. **Return**: simple formation return, `P_signal / P_start - 1`.
3. **ClassicNoRank**: `700 * velocityPercentile + 200 * priceAccelPercentile`.
4. **ClassicNoPriceAccel**: `700 * velocityPercentile + 100 * rankAccelPercentile`.
5. **ClassicRankSignCorrected**: `700 * velocityPercentile + 200 * priceAccelPercentile - 100 * rankAccelPercentile`; this tests the known direction issue without changing any other component.
6. **TrendQuality**: OLS slope of `log(price)` on actual elapsed days multiplied by R².
7. **VolAdjusted**: cumulative log return divided by `max(sample SD of daily log returns, 1e-12) * sqrt(number of daily returns)`. This is a ranking ratio, not a Sharpe ratio.
8. **ReturnContinuity**: cumulative log return multiplied by the fraction of daily log returns whose sign equals the cumulative log-return sign. A zero cumulative return receives zero. This is an optional transparent continuity heuristic and is **not** claimed to replicate Frog or any external proprietary formula.

## Endpoint accounting and reported cohort metrics

For each selected ID:

- Entry is usable only when the row exists in the fixed next-day snapshot, has finite positive price, has a fresh finite timestamp, and its timestamp is strictly later than `signalCutoff`.
- Exit is usable only when entry was usable and the fixed exit row exists with finite positive price, a fresh finite timestamp, and a timestamp strictly later than entry.
- Record missing entry and missing exit separately. Never filter the basket after selection.
- Report exact endpoint counts and two full-denominator scenarios:
  - **missing=0**: unavailable entry stays cash at 0%; an unavailable exit after a valid entry is marked at 0% return.
  - **missing=-100**: unavailable entry still stays cash because no purchase was possible; an unavailable exit after a valid entry is marked as a total loss.
- Also report conditional known-only means as diagnostics and exact means only for complete baskets. Missing scenarios are sensitivity bounds/conventions, not unbiased estimates; endpoint absence does not prove delisting or tradability.

For every method, Universe benchmark, and BTC benchmark on the same cohort dates, report arithmetic average forward returns (never present them as compounded executable performance), paired benchmark differences, complete/missing endpoint counts, most frequent top holdings, membership turnover, and the best/worst cohort’s influence (overall mean and mean after removing each extreme). Do not compute IID coin-level p-values, confidence intervals, or annualized statistics.

Universe means the complete signal-time eligible universe and is subject to the same immutable-constituent and entry/exit rules. BTC is CMC ID 1 selected only when it belongs to the signal-time eligible universe; otherwise its one denominator weight is cash. This avoids silently changing benchmark availability rules.

## Sequential turnover and costs

Within each non-overlapping path, model equal target weights at each fixed entry. IDs unavailable at entry receive their target allocation as cash. At each rebalance:

1. normalize the prior portfolio’s scenario-specific drifted asset weights;
2. compute asset buy notional as the sum of positive target-minus-current weights and asset sell notional as the sum of positive current-minus-target weights;
3. charge `rate * (buy notional + sell notional)` at **10, 50, and 100 bps per traded side/notional**;
4. reset remaining wealth to target asset/cash weights, then drift by the fixed cohort returns;
5. include the initial buys and final liquidation sells.

Cash changes are not separately charged. Report buy, sell, and total notional, membership replacement fraction, gross diagnostic wealth, and cost-adjusted diagnostic wealth for both missing scenarios. Apply exactly the same accounting to Universe and BTC. These are self-financing bookkeeping diagnostics under the stated marks, not claims of executable fills; spreads, market impact, token events, exchange access, and missing-price liquidation are unresolved.

## Independent monthly/cycle feasibility inventory

Independently of the daily experiments, inventory **1, 3, 6, and 12 calendar months** as lookback horizons and as forward horizons. For each block and named segment, count dates with an exact calendar-month lookback endpoint, dates with an exact forward endpoint, and every lookback/forward pair with signal, next-day entry, and forward endpoint wholly available without crossing quarantine. This inventory is feasibility only: the available 69-day modern block and quarantined old blocks cannot validate long monthly/cycle horizons.

## Required checks and reproducibility

The runner must fail before saving outcomes unless deterministic synthetic checks pass for:

- rank-acceleration sign correction;
- pure-return arithmetic equivalence;
- strict signal cutoff and strictly later next-day entry;
- unavailable entry represented as cash with no survivor replacement;
- missing endpoints retained in the original denominator under both scenarios;
- a known two-coin weight-drift/trade-cost case including initial and final charges; and
- reconstructed Classic parity with the production scorer.

Save protocol/runner/source/input hashes, runtime versions, inventory, compressed full results, and a readable summary under `research/algorithm-comparison/` using only `v2-*` result names. Do not edit production, existing research files, dependencies, configuration, or credentials.
