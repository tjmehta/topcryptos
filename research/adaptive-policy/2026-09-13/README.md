# Adaptive algorithm and holding-policy results — 2026-09-13

The tested adaptive selectors do not justify automatic adoption. Several fixed 30-day policies produced gains in this historical replay, but starting-date sensitivity is material. The comparison now evaluates actual sequential use of one pool of capital rather than treating overlapping cohorts as independent fully funded investments.

## What was run

Primary run: 2026-09-13T19:49:02.371408+00:00 to 2026-09-13T19:49:05.854450+00:00. Twelve viewed intervals × three adaptive and ten fixed policies = 156 policy evaluations, with 3,003 executed cohorts. Training starts in 2020; evaluated decisions run through 2023–2025, and all scheduled exits settle by 2026-03-01.

All values below are terminal wealth starting at **1.000**. A cash policy remains **1.000**. Returns include the source's 50bps-per-side costs; unknown exits use a total-loss sensitivity mark, not a claimed fill. Alternative zero-gross marks and all ten fixed policies are preserved in `summary.json`.

| Viewed buckets | Fixed Momentum14 | Fixed Momentum30 | Fixed Trend30 | Adaptive method, H14 | Adaptive hold, Momentum | Adaptive method + hold |
|---|---:|---:|---:|---:|---:|---:|
| 3 | 0.346 | 2.153 | 2.508 | 1.296 | 0.454 | 0.711 |
| 4 | 0.597 | 2.913 | 3.181 | 0.762 | 0.659 | 0.652 |
| 5 | 0.513 | 3.368 | 3.125 | 0.610 | 0.695 | 0.719 |
| 6 | 0.521 | 2.196 | 2.474 | 0.596 | 0.769 | 0.799 |
| 7 | 0.599 | 1.600 | 1.574 | 0.560 | 0.723 | 0.723 |
| 10 | 0.543 | 1.461 | 1.559 | 0.481 | 0.663 | 0.617 |
| 14 | 0.636 | 1.694 | 1.264 | 0.575 | 0.682 | 0.682 |
| 21 | 0.471 | 1.229 | 1.095 | 0.468 | 0.608 | 0.595 |
| 30 | 0.602 | 1.252 | 1.371 | 0.531 | 0.365 | 0.629 |
| 45 | 0.783 | 1.597 | 1.494 | 0.783 | 0.623 | 0.658 |
| 60 | 0.570 | 1.134 | 0.912 | 0.997 | 0.669 | 0.691 |
| 90 | 0.256 | 0.221 | 0.388 | 0.940 | 0.680 | 0.680 |

The joint selector finished below cash in every view. Method selection at a fixed 14-day hold exceeded cash only for the three-bucket view, based on just three executed trades. Relative loss reduction versus an always-trading losing strategy is not an absolute profitable edge.

## Entry-calendar and common-training sensitivity

This follow-up was specified after inspecting primary results. It shifts the first deployment from January 1, 2023 to January 29 or February 26, holding cash until then. The unchanged schedule and single-capital rules then determine later trades. It also tests using the same fully 90-day-mature training dates for all holding candidates. It is a robustness diagnostic, not a new holdout.

| View | Momentum30 wealth at starts 0 / 28 / 56 days | Trend30 wealth at starts 0 / 28 / 56 days | Joint, common training, starts 0 / 28 / 56 days |
|---|---|---|---|
| 3 | 2.153 / 0.938 / 1.298 | 2.508 / 1.088 / 1.512 | 0.390 / 0.294 / 0.323 |
| 4 | 2.913 / 1.068 / 1.409 | 3.181 / 1.229 / 1.539 | 0.413 / 0.280 / 0.293 |
| 5 | 3.368 / 1.312 / 1.784 | 3.125 / 1.169 / 1.667 | 0.383 / 0.284 / 0.314 |
| 6 | 2.196 / 1.146 / 1.652 | 2.474 / 1.130 / 1.862 | 0.292 / 0.248 / 0.268 |
| 7 | 1.600 / 0.846 / 1.140 | 1.574 / 0.889 / 1.196 | 0.415 / 0.338 / 0.367 |
| 10 | 1.461 / 0.807 / 1.053 | 1.559 / 0.912 / 1.170 | 0.485 / 0.399 / 0.450 |
| 14 | 1.694 / 0.979 / 0.969 | 1.264 / 0.957 / 0.824 | 0.288 / 0.194 / 0.199 |
| 21 | 1.229 / 1.329 / 1.145 | 1.095 / 1.327 / 1.024 | 0.319 / 0.299 / 0.307 |
| 30 | 1.252 / 0.956 / 0.987 | 1.371 / 1.093 / 1.101 | 0.247 / 0.205 / 0.220 |
| 45 | 1.597 / 1.073 / 0.913 | 1.494 / 0.963 / 0.871 | 0.388 / 0.278 / 0.289 |
| 60 | 1.134 / 0.959 / 0.885 | 0.912 / 0.740 / 0.712 | 0.298 / 0.249 / 0.263 |
| 90 | 0.221 / 0.221 / 0.179 | 0.388 / 0.388 / 0.281 | 0.470 / 0.470 / 0.476 |

There are 576 sensitivity cells, all retained. The common-training joint selector loses money across every tested view/start combination. Therefore the poor outcome is not resolved by aligning training recency. Some short-view fixed 30-day variants remain positive across these three starts (for example Momentum at views 4–6), while the previously highlighted seven-view Momentum30 changes from 1.600 to 0.846 with the first deployment delayed by 28 days. These results identify candidates and fragility, not an optimal sell schedule.

## Forecasts and interpretation

Each adaptive decision saves historical mean, median and 20th/80th quantiles of mature cohort returns, plus the last training-exit date. Forecast coverage and absolute error are reported on subsequent executed outcomes. These predict the whole selected basket under the missing-loss mark. They do not predict coin-level target prices, resistance, market-cap ranks, or probability of reaching a sell zone. The forecast has not been calibrated prospectively.

The selection objective averages log cohort return divided by days until capital can next deploy. This is an explicitly tested heuristic: it differs from pooled log return divided by total time, and its shadow training outcomes overlap. Actual evaluation trades do not overlap. Each native holding candidate trains on its own last 24 mature records; the common-training sensitivity addresses the resulting recency mismatch.

The preserved Binance source uses positive Momentum/TrendQuality candidates, annual venue-pair cohorts and daily bars. It cannot validate exact current Classic, signed-product modes, hourly selection or one-year forecasts. The original 365-day outcomes have a different seasonal schedule and were deliberately not treated as uniformly available to this policy. Prior data inspection means 2023–2025 is retrospective walk-forward evaluation, not untouched evidence.

## Verification and next decision

The independent reviewer matched all 3,003 decisions and 156 summaries to source identities/returns, ten-slot accounting, scheduled dates, strictly mature forecast samples, non-overlapping capital and compounded wealth. Runner selftests additionally perturb future outcomes and verify that earlier choices do not change. Source/runner/protocol/ledger hashes matched. Root separately reconciled all saved wealth paths and maturity bounds. The finite log floor is inactive: the worst source cohort loss is approximately 73.45%, not 100%.

No automatic method/holding selector is adopted from this run. Next: compare precomputed ATR/resistance sell-zone policies on identical entries, then evaluate reachability probability and realized exit returns using only mature prior outcomes. Preserve the present negative selector results when designing that next step.

Artifacts: [protocol](protocol.md), [runner](run.py), [summary](summary.json), [decisions](decisions.json.gz), [sensitivity runner](sensitivity.py), [sensitivity results](sensitivity.json). Both runners refuse overwrites. `python3 run.py --selftest` runs bounded invariant tests without replacing outputs.
