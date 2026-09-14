# Indicator algorithms and interval selection — 2026-09-13

Volatility-adjusted momentum and breakout filters improve many paired historical comparisons. However, choosing the algorithm and holding period from past performance remains unreliable: the frozen annual chooser loses capital in 11 of 12 viewed intervals. This experiment supports specific research candidates, not a universal automatic interval mapping.

## What was executed

The [protocol](protocol.md) froze six positive-signal methods: Momentum, TrendQuality, ATRNormalizedMomentum, EMAConfirmedMomentum, Breakout and VolumeBreakout. These use the same annual venue universe, signal dates, ten capital slots and delayed execution as the earlier horizon study. Unused slots remain cash. Fees are 50bps per side, with 100bps stress. Both missing-exit conventions are retained; primary sequential results use total-loss marking.

The viewed interval is the formation input; the holding period is independently varied. The 12 views use 3/4/5/6/7/10/14/21/30/45/60/90 observations. Thus a seven-observation view measures a six-day close-to-close return. H7/14/30/60/90 share the same signal dates. H365 is evaluated only at the first three annual anchors; shorter holds have matching `common-year-start` rows. Do not compare the full-calendar shorter-hold average directly with the seasonal annual-hold average.

TA-Lib ATR14 and EMA receive a fixed trailing max(60, view) complete-bar window. The seed is part of the declared algorithm: long-window slow EMA can equal its initial SMA. This ATR uses Wilder smoothing and differs from the earlier simple-mean ATR sell-zone calculation. Breakouts use the preceding view−1 highs, excluding the signal bar. Volume confirmation requires at least 1.5 times the preceding 20-bar median quote volume.

Run: **2026-09-13T20:16:07.115669+00:00 to 2026-09-13T20:16:27.417781+00:00**. Saved 31,500 cohort records, 17,403 unique identity/signal/holding outcomes, and 858 view/signal score records. Every one of the **13,500 original Momentum, TrendQuality and Universe cohort records** matched exactly. Source identities, gaps and missing endpoints were preserved.

## Paired algorithm results

Each count below covers 12 views × five H7–90 holds in 2023–2025. A positive difference can mean losing less money; it does not necessarily mean positive returns. Counts are correlated comparisons across overlapping horizons and signals, not independent statistical replications.

| Challenger versus Momentum | Positive pooled mean-return difference | Positive difference in each year 2023/2024/2025 |
|---|---:|---:|
| ATRNormalizedMomentum | 50/60 | 25/60 |
| EMAConfirmedMomentum | 33/60 | 10/60 |
| Breakout | 45/60 | 12/60 |
| VolumeBreakout | 48/60 | 11/60 |

For the seven-observation view and **30-day hold**, all rows below use the same 36 signal dates and 360 capital slots. Returns include unfilled slots as cash. Target hits are future daily highs reaching +20% from entry; realized hits mean net scheduled-sale return ≥20%. Highs never become sell fills.

| Method | Mean net cohort return | With missing-exit total loss | Selected positions | Observed +20% reaches | Realized ≥20% exits |
|---|---:|---:|---:|---:|---:|
| Momentum | −1.15% | −1.43% | 299 | 142 | 50 |
| ATRNormalizedMomentum | −0.60% | −0.88% | 299 | 136 | 50 |
| EMAConfirmedMomentum | −1.03% | −1.30% | 286 | 136 | 49 |
| Breakout | +2.07% | +2.07% | 150 | 68 | 33 |
| VolumeBreakout | +2.45% | +2.45% | 104 | 49 | 24 |

VolumeBreakout's mean paired advantage is +3.60 percentage points; it wins 23 dates and loses 12, with one tie. Removing its best paired date leaves +2.61 points. With 100bps per-side costs, mean cohort return remains +2.13%. Breakout retains +1.64% at those costs. Their selected paths in this cell are complete; Momentum has one unknown path/missing exit.

Selectivity changes the objective: VolumeBreakout catches fewer absolute movers while its proportion of selected positions realizing ≥20% is higher (24/104 versus Momentum 50/299). Its 47 known losing selections also compare with Momentum's 173, but there were far fewer selections. These are separate return, precision and breadth results; do not call it an improvement in every dimension of early mover discovery.

## Choosing the method and sale deadline causally

The annual chooser freezes a method/H pair each January 1 using only training signals whose longest candidate outcome was already fully mature. It compares 30 fixed strategies by sequential training wealth, includes cash, requires at least six executed cohorts, and retains ten-slot allocations. Evaluation uses one continuous pool of capital, with no overlapping positions or annual resets. Existing positions run to their original deadlines across year changes.

Only the four-observation view's annual chooser exceeds cash under the primary missing-exit scenario: **1.326×** terminal wealth at 50bps per side, or **1.097×** at 100bps. It chooses ATRNormalizedMomentum/H14 for 2023 and TrendQuality/H30 for 2024–2025. The seven-observation chooser finishes at **0.570×** at 50bps. No annual fit chose cash; good historical training performance did not ensure later gains.

The full later-period fixed-policy grid contains large descriptive winners, particularly some 30-day breakout holds. Those winners were identified by examining later results and are not substituted retrospectively into the annual chooser. The [interval candidate table](interval-candidates.md) records all 12 views with their strongest examined fixed policy and stresses.

Starting-date robustness is recorded separately in [selection-sensitivity.json](selection-sensitivity.json) under its [sensitivity protocol](sensitivity-protocol.md). This repeats all policies with initial availability January 1, January 29 or February 26, 2023; it does not refit anything. The four-view annual selector falls to 0.854×/0.643×/0.716× after removing its best executed cohort for each start. Its one apparent successful interval is therefore fragile.

Fixed seven-view Breakout/H30 remains at 3.061×/2.991×/2.675× across those starts, 2.878×/2.798×/2.525× with higher costs, and 1.820×/1.779×/1.591× with its best cohort removed at original costs. Across views 3–21, both Breakout/H30 and VolumeBreakout/H30 survive each of these separate stresses. This makes them more concrete next-test candidates than the annual chooser.

These shifts change initial availability only: paths can align again after annual gaps in the original signal calendar. This is not a daily-alert test or a shift of every subsequent signal. Daily signal scheduling and candidate-specific sell zones remain necessary evaluations for a live rule.

## Files and verification

- [run.py](run.py), [summary.json](summary.json), [ledger.json.gz](ledger.json.gz): all scores, eligibility, selections, unique outcomes, paired comparisons, dates, packages and hashes.
- [selector.py](selector.py), [selection.json](selection.json), [selection-ledger.json.gz](selection-ledger.json.gz): 36 annual fits, all candidate training paths, annual choices and 384 continuous evaluation paths.
- [verify.py](verify.py), [verification.json](verification.json): independently reconstructed 237,042 score values, 17,403 outcomes, 31,500 cohorts and 6,048 summary rows without importing the runner or TA-Lib. Maximum numeric difference 3.55e-15.
- [verify-selection.py](verify-selection.py), [selection-verification.json](selection-verification.json): independent chronology and capital accounting. Passed 36 annual fits, 1,080 candidate training paths, 384 evaluation paths and 39,002 executed events across all four scenarios.
- [selection-sensitivity.py](selection-sensitivity.py): all 1,152 start/policy/view comparisons, with 384 phase-zero summaries matching the original exactly.
- [verify-sensitivity.py](verify-sensitivity.py), [sensitivity-verification.json](sensitivity-verification.json): independent replay passed all 1,152 paths, 24,318 executions and four marking/cost scenarios. It confirms the limited scope of initial-date shifts; 251/384 policies have identical execution dates from 2024 onward across all three starts.

```sh
.cache/trading-libs-venv/bin/python research/indicator-algorithms/2026-09-13/run.py --selftest
.cache/trading-libs-venv/bin/python research/indicator-algorithms/2026-09-13/verify.py
.cache/trading-libs-venv/bin/python research/indicator-algorithms/2026-09-13/verify-selection.py
```

Completed-output writers refuse overwrite. Preserve this dated directory before a new run. No production scoring or application dependencies changed in this experiment.

This is retrospective daily Binance venue research, not current CMC/Classic product parity. Annual liquid-pair membership omits within-year new listings and retains the source's fiat-pair and identity limitations. Modelled fees do not establish market depth or guaranteed fills. Neither these rankings nor historical maxima constitute coin-level price or market-cap-rank forecasts. Sell-zone probabilities and level-exit experiments remain separately defined in the linked research status.
