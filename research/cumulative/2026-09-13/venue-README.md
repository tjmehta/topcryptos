# Cumulative and Hybrid venue results — 2026-09-13 UTC

This run does **not** support either new method as the gains-oriented OHLC default. Both candidates underperform Breakout in later-period mean daily returns for all twelve views. Every candidate/view also has median terminal wealth below its starting capital across the 32 responsive phases. The current CMC application default requires its separate exact-data study; these results do not reproduce Classic.

Run: **2026-09-13T22:16:05.076592+00:00 to 2026-09-13T22:18:50.245162+00:00**. Definitions were frozen in [venue-protocol.md](venue-protocol.md). The initial run was interrupted before writing results for the documented cancellation-roundoff correction; its code/protocol are retained in `venue-initial/`.

Cumulative is the time-weighted area of the log-price path relative to its first price, divided by elapsed view duration. Hybrid is a fixed 50/50 blend of signed endpoint and cumulative midrank percentiles. Both select strictly positive scores in ten 10% slots. An early rally that later ends below its starting price may still qualify. No endpoint filter, hold search or weight tuning followed these results.

## All viewed intervals

2023–2025 signal dates; actual signal+2-day entry open, 30-day hold, 50bps per side, missing exits marked total loss. Values are median terminal wealth over the same 32 initial phases. Parentheses show phases finishing above starting capital. Starting capital is 1.0. Phases share market outcomes and are not independent replications.

| View observations | Momentum | Breakout | Cumulative | Hybrid |
|---:|---:|---:|---:|---:|
| 3 | 0.367× (0/32) | 1.161× (18/32) | 0.429× (0/32) | 0.440× (0/32) |
| 4 | 0.345× (3/32) | 1.561× (25/32) | 0.401× (0/32) | 0.363× (1/32) |
| 5 | 0.334× (1/32) | 1.184× (24/32) | 0.368× (0/32) | 0.442× (3/32) |
| 6 | 0.383× (2/32) | 1.190× (21/32) | 0.462× (0/32) | 0.421× (0/32) |
| 7 | 0.503× (3/32) | 1.591× (27/32) | 0.435× (0/32) | 0.388× (1/32) |
| 10 | 0.488× (1/32) | 1.107× (19/32) | 0.520× (5/32) | 0.447× (2/32) |
| 14 | 0.391× (0/32) | 1.185× (28/32) | 0.439× (3/32) | 0.412× (1/32) |
| 21 | 0.480× (0/32) | 0.894× (10/32) | 0.392× (0/32) | 0.423× (0/32) |
| 30 | 0.485× (0/32) | 0.940× (10/32) | 0.464× (0/32) | 0.418× (0/32) |
| 45 | 0.538× (0/32) | 0.873× (5/32) | 0.471× (3/32) | 0.405× (0/32) |
| 60 | 0.429× (1/32) | 1.070× (26/32) | 0.407× (3/32) | 0.390× (1/32) |
| 90 | 0.254× (0/32) | 1.286× (32/32) | 0.224× (0/32) | 0.208× (0/32) |

At view 7, Cumulative and Hybrid each lose all 32 paired phases against Breakout. Cumulative wins 15/32 against ordinary positive Momentum; Hybrid wins 10/32. Against the same-count signed-Momentum counterfactual, each wins only 10/32. At view 10, Hybrid improves ordinary Momentum’s daily mean by 0.112 percentage points, but loses 0.164 points to the count-matched benchmark and finishes with median wealth 0.447×. The apparently favorable daily comparison therefore does not establish an improved capital policy.

Earlier-versus-later behavior is materially different: both new candidates beat Breakout’s mean daily returns in all 12 views during 2020–2022, but lose in all 12 during 2023–2025. Cumulative improves ordinary Momentum’s later mean in only views 3 and 4; Hybrid does so in views 3, 4, 5 and 10. Earlier and later labels are descriptive: no unseen holdout remains, and no learned rule or tuning was performed.

## Discovery, allocation and benchmark scope

At view 7 in 2023–2025, Cumulative selects 8,644 positions, observes 3,789 +20% high reaches and realizes 1,477 +20% net-return hits; 5,205 known positions lose money. Hybrid selects 9,170, observes 3,986 reaches and realizes 1,591 such gains; 5,499 known positions lose money. These are repeated coin/date positions, and observed highs are not sale fills. All unknown paths and missing endpoints remain separate in the ledger.

The matched benchmark takes exactly K signed endpoint-Momentum picks from each candidate’s eligible universe, on its unchanged entry schedule. This differs from the standalone positive-only Momentum baseline. In 10,410 of 52,272 matched daily cohorts, the candidate selected more positions than positive Momentum offered, so signed matching required nonpositive endpoint picks. No benchmark fill overlapped a following original decision. This diagnostic separates selection from differing offered position counts; it is not a new independently timed strategy.

## Reproduction and verification

Run `.cache/trading-libs-venv/bin/python research/cumulative/2026-09-13/venue-run.py --selftest` for scalar, sign/tie, time-weighting, cancellation and prefix checks. Full execution refuses to overwrite result artifacts and requires a fresh output location with the exact frozen source hashes.

- 26,136 daily formations; 104,544 baseline/candidate cohorts; 72,915 unique identity/signal/H30 outcomes, including 20,769 newly needed outcomes.
- 1,207,342 eligibility checks and 2,414,684 exact Momentum/Breakout raw-score checks.
- 9,220 independent trapezoid scalar checks, 209,088 exact baseline cohort-mark checks and 291,660 executed-price mark checks.
- 1,536 standalone capital paths; 768 baseline schedules/scenario objects exactly match the earlier daily study. Independent arithmetic reconstruction checks 9,216 standalone/matched scenario paths, including annual returns, drawdown and best-batch removal.

Independent verification [passed](verification-report.json) at 2026-09-13 22:21:26 UTC, including 12,510 raw cumulative calculations, all 52,272 new selection orderings and 9,216 capital scenarios. The runner’s own checks are calculation checks, not evidence of predictive superiority.

Ledger SHA-256: `d02c04b4606942c9e50bba993e8f15768519fa66f7e9504367a8d560254ea91e`. Capital ledger SHA-256: `c72385e3d449712459f3e47f119a276fdeac0deaaf848ca529f7e574313b9acd`.

Files: [runner](venue-run.py), [protocol](venue-protocol.md), [summary](venue-summary.json), [selection/outcome ledger](venue-ledger.json.gz), [capital paths](venue-capital.json.gz). These results retain the annual venue-universe and identity limitations of the frozen source study. No application OHLC method, target-probability population, production default, trade or deployment changed.
