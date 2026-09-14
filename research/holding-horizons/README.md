# What holding period follows a viewed interval?

Research completed 2026-09-13. The evidence supports evaluating a forward return curve for each viewed interval. It does **not** establish a fixed conversion such as “a 7-day chart means sell after 14 days,” or a reliable best algorithm for every interval.

The concrete work is a new, reproducible offline comparison covering all 12 daily view settings, two price-signal families, and 7/14/30/60/90/365-day holds. It reuses the saved 2020–2025 Binance annual cohorts. It does not reproduce Classic's market-cap-rank component, change the production scorer, train a forecast model, or launch data collection.

## What the literature establishes

Liu, Tsyvinski and Wu's **April 2019 working-paper version** examines 1,707 cryptocurrencies over 2014–2018. Its one- through four-week formation signals are evaluated on the **following week's** returns. A four-week signal is therefore not evidence for holding four weeks. It reports stronger momentum among larger coins. These are portfolio/factor findings, not calibrated coin-level forecasts or fills after our execution delay. [Full paper, Yale](https://economics.yale.edu/sites/default/files/2022-10/LiuTsyvinskiWu2019%20COMMON%20RISK%20FACTORS.pdf).

Dobrynskaya explicitly examines formation J and holding K separately on roughly 2,000 cryptocurrencies during 2014–2020. The accessible conference draft finds short-horizon momentum and longer-horizon reversal, with results changing as either J or K increases. Its actual holding grid extends through 12 weeks; the two-year dimension in the draft includes the formation horizon and must not be presented as proof of a two-year sell policy. Short-window momentum significance is sensitive to the specification and robust standard errors. Capitalization-weighted winner-minus-loser portfolios and overlapping positions differ substantially from a long-only top-ten alert system. Long-horizon reversal also reflects subsequent gains among past losers, not simply that every past winner crashes. [Full conference draft](https://conference.hse.ru/files/download_file_ex?hash=FAE0AB2DC7A67656E89A0B1CB27D8C7D&id=3B5EE9A5-0B18-458A-9458-B4ED0F6C6664), [2023 publication record](https://papers.ssrn.com/sol3/papers.cfm?abstract_id=3913263).

Fičura's **FFA Working Paper 3/2023**, using CMC histories through January 2023, distinguishes large/liquid coins from small/illiquid ones. It finds weekly momentum in the former and weekly reversal in the latter. Its formation signals span several horizons but its portfolio outcome is the following week. The inference for TopCryptos is to test liquidity and universe sensitivity rather than treating the chart interval as the sole determinant of holding time. This full-text single-author version differs from the later coauthored SSRN revision; their version details should not be combined. [Full 2023 paper](https://quantitative.cz/wp-content/uploads/2023/09/impact_of_size_and_volume_on_cryptocurrency_momentum_and_reversal.pdf).

The literature also gives a reason to avoid installing the maximum-return cell of a large grid: selecting among many backtests can select historical noise. A strategy-selection process itself requires evaluation, not just its winning constituent. [Bailey et al., February 2015, full paper](https://www.davidhbailey.com/dhbpapers/backtest-prob.pdf).

These sources motivate a test design. They do not supply a universal sell multiplier or prove an investable TopCryptos strategy.

## New local experiment

The protocol was written before this calculation. Earlier research was already inspected, so both 2020–2022 and 2023–2025 are retrospective diagnostics, not untouched holdouts.

The frozen annual venue cohorts select 50 raw pairs using preceding-December turnover and availability. Signal eligibility retains the existing 60-consecutive-day and lagged-volume requirements. The cohorts omit newly listed coins during the year and lack market-cap ranks. The source's documented fiat-pair inclusion, symbol-identity exceptions, gaps and venue limitations remain; no outcomes-driven exclusions were introduced.

View settings use N observations, matching the app's amount-minus-one start calculation: the “7-day” setting has a six-day close-to-close formation span. The two candidates are positive endpoint momentum and positive log-price slope times R-squared (TrendQuality), the latter also requiring positive endpoint return. Both rank the same signal-time eligible universe, choose at most ten positions, and leave unused 10% slots in cash.

Signals occur on January 1 plus 28*k days, k=0..11, in each year. Enter at open t+2 after signal close t, and sell at entry+H. Holdings 7–90 days share the exact same signal dates and constituents. Horizons over 28 days overlap: this is a cohort-return comparison, not a sequential wealth curve. The grid contains 13,500 method/view/holding cohort records, not that many independent market observations. Six January-1 cases for the 90-observation setting are unscoreable because formation history is too short.

Fees are modeled at 50bps each side. They do not cover slippage, depth, capacity, venue outages or guaranteed execution. Missing entry stays cash. Missing exit is preserved under both 0% gross-return and total-loss marks; neither is a measured return. Complete-path future highs/lows are diagnostic labels only and never execution prices.

### Seven-day view: later-period momentum example

All 7–90-day rows below use the **same 36 signal dates in 2023–2025**, 360 capital slots and 299 issued selections. Means include unfilled slots as cash. Medians include only selected positions with known exits. These answer different questions and should not be mixed.

| Hold after entry | Mean after modeled fees, missing exit marked 0% gross | Mean with missing exit marked total loss | Median selected known-exit return | Mean excess over eligible universe, 0% mark |
|---|---:|---:|---:|---:|
| 7 days | -3.24% | -3.24% | -4.93% | -0.51 pp |
| 14 days | -0.02% | -0.30% | -2.93% | +1.14 pp |
| 30 days | -1.15% | -1.43% | -5.33% | -2.36 pp |
| 60 days | +3.78% | +3.23% | -7.30% | -0.64 pp |
| 90 days | +3.88% | +3.33% | -10.71% | +1.77 pp |

Missing selected exits are respectively 0, 1, 1, 2 and 2; selected entries are complete. The universe benchmark has its own missing endpoints and is fully allocated while selected strategies can hold cash, so these excess-return comparisons are not exposure-matched alpha estimates.

Longer holds produced larger arithmetic means in this slice, while the median position deteriorated. That does not identify a safe sale at day 90 or justify a 90/7 holding multiplier. In the earlier 2020–2022 slice, the same view's largest observed excess among these five holding periods was at 30 days; in the later slice it was at 90 days. The maximizing metric and historical period change the answer.

For the 30-observation view, the largest observed momentum excess shifted from the 90-day hold in 2020–2022 to the 14-day hold in 2023–2025. These are descriptive maxima, not selected or statistically validated strategies. All other view/method outcomes are retained in `summary.json`; no universal winner is claimed and no other algorithm families were empirically tested in this extension.

### One year requires a separate comparison

The frozen panel ends in February following each annual cohort. A 365-day forward outcome is therefore scheduled only for January 1, January 29 and February 26 signals. All shorter horizons are separately summarized on those same dates under `common-year-start` labels. We do not substitute later-year survivors or join into a different cohort to recover a missing price.

For the seven-observation momentum view in 2023–2025, there are only nine such annual-return cohorts, overlapping and concentrated near the start of each year. Mean 365-day return is -2.85% under the 0%-gross missing mark and -7.25% under the total-loss mark; the known-position median is -47.85%. Four of 73 selected entries lack exits. These observations cannot establish a general one-year holding recommendation. Comparing them directly to all 36 short-horizon cohorts would also confound holding time with entry dates.

The actual CMC/Classic data are much shorter: the longest recent block has 69 daily observations. For a seven-observation view with next-day entry, it provides only 4 nonoverlapping 14-day cohorts, 2 thirty-day cohorts, 1 sixty-day cohort and no 90/365-day cohorts. The venue-price study above does not remove that limitation.

## Fixed holds versus responsive exits

The earlier [high-flier experiment](../algorithm-comparison/high-flier-recommendation.md) compared several exits on identical Return7 entries, with a 30-day maximum and delayed fills. Trail15's mean after modeled fees was 2.22% versus 4.50% for Fixed30. Its lower-tail result improved, but many early exits missed further upside. The primary mean-return-difference interval included zero. That supports considering exits as separate risk-control policies; it does not establish an exhaustion predictor.

Those entries used a full seven-day price lookback and a different alert/cooldown schedule. They must not be spliced into the new seven-observation table as if it were one controlled experiment. No new adaptive exit rule was trained or tested here.

## Product and next-test decision

Treat the viewed interval as the **formation input** to a forward outlook. A seven-day view can expose forecast horizons of 7, 14, 30, 60 and 90 days; one year is a separately supported long-horizon outlook. The useful outputs would be a return distribution, chance of a defined big move, chance of entering the top decile of future returns, expected downside, and sample support. Those are proposed outputs, not forecasts this research has calibrated.

“This coin will move to rank X in Y days” is too precise for the available evidence. Specify whether rank means market capitalization, the app score, or future-return percentile. For the stated goal, future-return percentile measures relative winners most directly; market-cap rank can change through supply changes and other coins' moves. Our venue panel cannot evaluate market-cap-rank forecasts.

For a future selection experiment, use a small fixed relative grid around each viewed interval (roughly 0.5x, 1x, 2x, 4x, with explicit rounding) alongside the requested 60/90/365-day diagnostic endpoints. This relative grid is a **proposal**, not the grid executed above or a recommended holding schedule. Compare fixed exits with a small predeclared family of responsive exits. Faster triggers require data at the intended decision frequency; daily bars cannot validate hourly reactions.

Choose a policy using only outcomes fully realized before each decision, then evaluate it on later dates. A 90-day outcome is unavailable to the selector for 90 days after entry; a one-year outcome is unavailable for a year. Keep overlapping outcome windows out of the training/evaluation boundary. Assess the complete selector after fees, drawdowns, exposure and holding-time opportunity cost; maximizing historical gross return or dividing a lucky return by days is insufficient. Prior test periods have already been viewed, so new validation must acknowledge that reuse and ultimately include prospective observations.

**Decision:** use the chart interval to organize a measured forward outlook; do not hardcode a sell multiplier or per-interval winner from this grid. There is now a concrete holding-horizon experiment and evidence for this decision, rather than only a proposal to study it.

## Artifacts and verification

- [Protocol](protocol.md), [runner](run.py), [summary](summary.json), [compressed cohort ledger](cohorts.json.gz).
- Run with `python3 -B research/holding-horizons/run.py` in a fresh copy of the directory without result files; the runner refuses overwrites. No dependencies were added.
- The existing frozen loader verified source-artifact hashes. Deterministic checks passed for entry delay, fees, missing entry/exit, incomplete paths, identity-local lookup and future-high/exit separation.
- A separate read-only check verified all 13,500 ledger denominators and 2,574 immutable selection groups across horizons. It recomputed 59 known exit returns from raw panel rows for a representative 2024 seven-view cohort spanning all six holds, and recomputed all six later-period seven-view momentum aggregates. This is bounded verification, not an independently authored reimplementation of every signal or source-archive row.
- Summary records runner, protocol and imported frozen-runner hashes, dataset provenance, and compressed-ledger hash. No production files, existing frozen research outputs, credentials or remote deployments were changed.
