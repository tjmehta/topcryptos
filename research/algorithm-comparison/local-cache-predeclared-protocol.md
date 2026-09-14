# Local-cache comparative experiment: frozen protocol

Declared after timestamp/file inventory but BEFORE forward-return calculation. No search, fit, parameter sweep, or production modifications. All times UTC. Research only; not a trading strategy recommendation.

## Sources and daily sampling

- Read only local `.cache/coinmarketcap/cryptocurrency_listings:*.json`; preserve originals. Inventory all sources, cache keys, content hashes, modal quote times, duplicate timestamps/IDs/payloads, size, stale/zero quotes. Status time is request/retrieval metadata, not necessarily observation time.
- Pick the snapshot whose modal USD `last_updated` is closest to 23:00 UTC on each observation day, restricted to ±30 minutes. Ties: earlier modal timestamp, then lexicographic source filename. This fixed daily grid prevents dense intraday cache periods from receiving more weight. Payloads outside this grid remain in the inventory.
- Consecutive UTC days form separate eras; never bridge missing days. Never fetch additional data in response to results. Intraday runs are inventoried only; hourly forward tests require long independent history, not a handful of hours.
- Daily lookback/forward pairs: 7 days / 1 day and 21 days / 7 days; L+1 observations. Small timestamp jitter around the grid is retained and actual endpoint elapsed times reported.
- Last ceil(one third) of each era's days is a held-out chronological chunk. Decisions at/after its first day are holdout; earlier decisions whose forward endpoint crosses that boundary are excluded. Lookbacks may use past exploratory observations. Label holdout separately by era (including the latest overall chunk). Holdout is not a future/live test, and selective local data invalidate strong out-of-sample claims.
- Decision index starts L days into each era, then advances H days, so forward intervals do not overlap within a pair. The two pairs are not independent experiments; lookbacks overlap; regimes and cross-sectional returns remain correlated.

## Fixed candidates

1. **Classic**: execute the repository's actual `processRankings` via installed TypeScript transpilation, with 70/20/10 signed percentiles of coverage-adjusted percentage velocity, price-acceleration sum, rank-acceleration sum. Keep all snapshot rows when forming rank-by-market-cap; pass nonshared IDs as disabled so only shared eligible coins define signed-percentile pools. This is the exact current calculation with a declared research eligibility restriction, NOT a reimplemented proxy. Also run native/unrestricted Classic for current eligibility counts and descriptive ranking sensitivity.
2. **Return-only momentum**: `P_end / P_start - 1` over identical L+1 daily observations.
3. **Trend-quality momentum**: OLS regression of `log(P)` on actual elapsed days, score `slope * R²` (zero when log-price variance is zero). This is one transparent trend estimate with a goodness-of-fit multiplier, no fitted or tuned blend.
4. **Volatility-adjusted momentum**: `log(P_end/P_start) / (sample_sd(diff(log(P))) * sqrt(L))`. For exactly zero standard deviation, score zero; report these counts. Daily grid jitter is not rescaled inside the volatility estimate. No risk-free adjustment or claims that this is a strategy Sharpe ratio.

Descending score order; alternative ties break by numeric CMC ID ascending. Preserve Classic's actual ordering/tie behavior.

## Point-in-time universe and missing data

Shared universe: present at decision AND every daily observation in the lookback; finite price >0, finite market cap >0, quote timestamp within one hour of snapshot modal timestamp, and strictly increasing quote timestamps across days; must be scoreable by native Classic. The forward endpoint NEVER affects eligibility. No present-day survivor list, exchange filter, stablecoin exclusion, liquidity screen, or discretionary coin removal. Record decision count, any-history union count, native Classic eligible count, native-current eligible count, full-history shared count, and native top-10 vs restricted top-10 overlap.

End quotes are usable only if present, finite positive price and fresh within one hour of forward modal timestamp. Keep missing endpoints as null with coin IDs. Report: known endpoint coverage; known-only conditional mean (not portfolio performance); full-denominator missing=0% return scenario; full-denominator missing=-100% scenario; and exact basket mean only when complete. Missing=0 is NOT a no-bias estimate; -100% is a limited-liability lower-bound scenario, not proof of actual delisting losses. Missing gains have no finite upper bound.

## Outcomes and descriptive diagnostics

For each decision, equal-weight top 10 per candidate versus equal-weight entire shared universe and BTC (CMC ID 1) when fresh at both endpoints. Save constituent IDs/symbols, scores, returns, and missing reasons. Average decision returns, not compounded or annualized performance. Report heldout/exploratory and eras separately. Compare each candidate to same-universe and BTC endpoints on the same dates.

Descriptive only: top-10 overlap with Return-only, Spearman full-universe rank correlation (midranks for ties), successive-decision top-10 replacement fraction, Classic native vs shared-universe top-10 overlap, and eligibility counts. These describe rankings, not forecasting power.

Costs: stress full basket liquidation/re-entry at 10, 50, 100 basis points PER SIDE, subtracting 20/100/200 bps per decision from missing=0 gross scenario. No execution, turnover-based optimized costs, market impact, capacity, spreads, exchange availability, or realizable fills claimed. Benchmarks remain gross and are labeled.

## Interpretation and reproducibility

Local cache is selectively fetched/seeded. Historical retrieval is not real-time availability evidence. Top-500 entry/exit censors losers and winners; quoted prices may be untradeable; token migrations and erroneous prices are not adjusted. Old and current eras have a multi-year gap, and available short blocks are not representative independent market cycles. Cannot choose a robust winner from this initial experiment, even if point estimates differ. Record code/source hashes, Node/TypeScript versions, runner instructions, input manifest and results under this directory. Do not modify existing production/test/config files or install dependencies.
