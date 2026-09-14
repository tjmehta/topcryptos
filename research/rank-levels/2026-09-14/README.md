# Are market-cap ranks resistance levels?

September 14, 2026 UTC. This diagnostic responds to the user's intuition that market-cap ranks might behave like resistance levels. It uses our frozen CMC daily history, not Binance candles. These are descriptive results from previously examined data, not a fitted probability model or validated trading recommendation.

## Result

Rank boundaries are useful milestones to investigate. This sample does not establish that ranks 50 or 100 are special price resistance levels. A rising rank is also not equivalent to a rising price: **3,640 of 13,473 complete seven-observation windows with improving rank had a flat or falling price (27.0%)**. These windows overlap and contain repeat coins; they are observations, not independent trials.

For a seven-observation view, requiring both rising price and improving rank:

| Situation at signal | Observations | Unique coins | Reached target in next 7 saved days | Inside target at day 7 |
| --- | ---: | ---: | ---: | ---: |
| Rank 51–55, approaching top 50 | 83 | 15 | 26/83 | 18/83 |
| Rank 101–110, approaching top 100 | 172 | 25 | 53/172 | 29/172 |

Reaching a milestone and remaining there are different outcomes. These selected cells have no unknown future rank paths. They are not a statement that today's coin has a 31% chance of entering the top 100.

Crossing into a new rank band also did not mean staying there:

| Crossed into top… | Crossings | Unique coins | Observed outside again within 7 days |
| ---: | ---: | ---: | ---: |
| 40 | 10 | 6 | 7/10 |
| 50 | 13 | 8 | 9/13 |
| 60 | 25 | 12 | 19/25 |
| 80 | 18 | 12 | 13/18 |
| 100 | 29 | 18 | 21/29 |
| 120 | 32 | 20 | 19/32 |

Neighboring boundaries also had many reversals. They are descriptive comparisons involving different coins and dates, not matched controls. Neither causality nor the absence of a round-number effect is established. A coin can fall outside and later finish inside; the columns measure different events.

## Scope and reproducibility

- 71 daily snapshots, July 4–September 12, 2026; original provider IDs/ranks and point-in-time observed population, including stablecoins.
- Views 3/7/14 observations; future horizons 7/14 saved daily steps; boundaries 40/50/60/80/100/120; approach and cross events.
- 4,793 event/horizon/view records across 72 cells. Repeated configurations and overlapping dates are not independent samples.
- Every included signal permits the next-snapshot entry and horizon-delayed exit to mature. Consequently, different horizons can have different signal-date cohorts; their raw percentages must not be read as an apples-to-apples horizon comparison.
- Ledger also retains modeled next-snapshot-entry returns with 0.5% costs each side, cash for missing entries and total-loss/zero-gross missing-exit sensitivity. These differ in start/end time from signal-relative rank/price labels and are not compounded wealth.
- This diagnostic does not apply our five-method top-ten selection, filter for Coinbase/Kraken or condition on ATR. It tests the rank-boundary idea before proposing it as an algorithm feature.

Run `python3 research/rank-levels/2026-09-14/run.py`, then `python3 research/rank-levels/2026-09-14/verify.py` in a new output directory or after archiving existing outputs. Both refuse to overwrite their results. Source, runner and protocol hashes are retained in [summary.json](summary.json); [events.json.gz](events.json.gz) contains every event; [verification.json](verification.json) records the separate SQL membership and Decimal-return check.

## Implication for the interface

Use a selected coin's **Outlook** to distinguish observed strength, rank milestones, and potential price outcomes. Starring can pin coins while opening a coin reveals deeper evidence. Show reaching a rank and holding that rank separately. Keep prospective price-return forecasts beside rank forecasts because rank can rise while price falls. Only display coin-specific probabilities after appropriate chronological calibration and baseline comparison.

An implied price for reaching a market-cap threshold could be shown as arithmetic under fixed peer capitalizations and supply, never as a resistance level or forecast. CMC rankings also have eligibility rules, so a market-cap comparison alone does not guarantee the displayed rank. Reference: [CMC market capitalization](https://support.coinmarketcap.com/hc/en-us/articles/360043836811-Market-Capitalization-Cryptoasset-Aggregate) and [ranking methodology](https://support.coinmarketcap.com/hc/en-us/articles/360043836851-Ranking-Cryptoasset-Market-Pair-Exchange).

No application score, default, forecast probability, or trading action changed in this diagnostic.
