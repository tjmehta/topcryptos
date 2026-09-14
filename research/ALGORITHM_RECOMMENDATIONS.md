# Algorithm and sell-outlook recommendations

Dated **2026-09-13 UTC**. The strongest practical research candidate is **seven-observation Breakout with a fixed 30-day hold after entry**, when prioritizing realized gains. For finding more movers in the existing CMC application, **seven-view Momentum** is the clearer experimental candidate. These conclusions come from different data and cannot be combined into one claimed backtest.

The existing research now covers algorithm definitions, viewed intervals, holding periods, executable sell rules, capital allocation, target probabilities, costs, missing prices and independent verification. It does **not** establish a validated automatic winner for every interval. Negative selector tests are evidence to retain explicit choices, rather than an invitation to install the largest historical cell.

## Practical choices by daily view

This table uses the more demanding daily-entry study, superseding the older 28-day-calendar candidate table for daily operation. It shows the higher median-wealth candidate **among Breakout and VolumeBreakout after observing these results**. That is a descriptive comparison, not a causally selected automatic mapping or a guarantee that it is the best of every possible algorithm.

Breakout ranks positive log(close / highest high of the preceding N−1 bars), excluding the signal bar from the reference. VolumeBreakout adds signal quote volume ≥1.5 times the previous 20-bar median. Momentum ranks positive endpoint log return. Each leaves unused 10% slots in cash.

All rows use H30, the responsive batch scheduler, 50 bps per side and missing-exit total-loss marking. Each wealth multiple starts with one unit of capital; 1.000× is cash. The 32 initial dates cover January 1–February 1, 2023; positions continue through final deadlines after 2025 signals. Medians summarize complete capital paths, not compounded overlapping daily returns.

“Matched Momentum” takes the candidate's exact number of picks at its exact dates, preserving cash slots and holding deadlines. It is a paired counterfactual, not a standalone Momentum policy. Wins compare corresponding initial dates; differences between medians are not medians of paired differences.

| View observations | Descriptive H30 candidate | Ordinary Momentum median | Candidate median | Matched Momentum median | Wins vs ordinary | Wins vs matched |
|---:|---|---:|---:|---:|---:|---:|
| 3 | VolumeBreakout | 0.367× | 1.405× | 1.360× | 32/32 | 18/32 |
| 4 | Breakout | 0.345× | 1.561× | 1.203× | 29/32 | 21/32 |
| 5 | Breakout | 0.334× | 1.184× | 1.019× | 29/32 | 23/32 |
| 6 | Breakout | 0.383× | 1.190× | 1.186× | 32/32 | 15/32 |
| 7 | Breakout | 0.503× | 1.591× | 1.158× | 32/32 | 26/32 |
| 10 | Breakout | 0.488× | 1.107× | 0.976× | 32/32 | 31/32 |
| 14 | Breakout | 0.391× | 1.185× | 1.181× | 32/32 | 18/32 |
| 21 | Breakout | 0.480× | 0.894× | 0.972× | 32/32 | 8/32 |
| 30 | Breakout | 0.485× | 0.940× | 0.841× | 30/32 | 25/32 |
| 45 | Breakout | 0.538× | 0.873× | 0.863× | 25/32 | 12/32 |
| 60 | Breakout | 0.429× | 1.070× | 1.149× | 32/32 | 10/32 |
| 90 | Breakout | 0.254× | 1.286× | 1.010× | 32/32 | 32/32 |

Read these as interval-specific tradeoffs. The 21/30/45-view candidates improve on ordinary Momentum but have median wealth below cash. The 45/60-view Breakout candidates also lose to matched Momentum in most phases, weakening the interpretation that their coin ordering adds value. The 90-view starts collapse to only three distinct schedules because annual warmup gaps align them; 32 wins are not 32 independent confirmations.

Seven-view Breakout is the clearest gain-oriented example: ordinary Momentum median wealth 0.503×, Breakout 1.591×, and matched Momentum 1.158×. Breakout wins 26/32 matched comparisons, also at 100 bps costs per side. It still loses capital in 5/32 primary phases; its wealth range is 0.721×–2.721×. Improvement means a better tested return tradeoff, not zero losses.

For that same view, matched daily means are 1.109% versus 0.986% per ten-slot H30 cohort, a +0.123 percentage-point difference. Breakout captures fewer observed +20% reaches (1,493 versus 1,606) and realized +20% net exits (668 versus 719), while having fewer known losing trades (1,828 versus 1,897). **Prioritize Breakout as a gains candidate; retain Momentum as the mover-discovery comparator.** The volume gate is not a general improvement: seven-view VolumeBreakout wins only 8/32 matched capital phases.

Sources: [daily capital summary](daily-breakouts/2026-09-13/capital-summary.json), [matched allocation summary](daily-breakouts/2026-09-13/exposure-summary.json), [daily study](daily-breakouts/2026-09-13/README.md), [matched-count explanation](daily-breakouts/2026-09-13/README-exposure.md).

## The viewed interval and sell timeline are separate

A view of N observations covers N−1 elapsed close-return days. It defines how the ranking is formed; it does not dictate when to sell. In the venue research, signal close is t, entry is open t+2, and a hold of H exits at open t+2+H. The practical H30 candidate therefore exits at open t+32. This delay is part of the tested implementation.

| Forward hold after entry | Executed evidence | Practical interpretation |
|---|---|---|
| 7 / 14 / 30 / 60 / 90 days | All 12 daily views; six frozen indicator methods on the common sampled calendar; causal method/hold selection also tested | A measured grid, not a proven rule that hold equals a multiplier of view |
| 30 days | Additional full daily formations, all 32 capital phases, Breakout/Momentum/VolumeBreakout, matched counts and sell-rule comparisons | Strongest operationally tested hold for the breakout candidate |
| 14 / 30 / 60 / 90 days | Earlier level/forecast experiments on sampled Momentum/TrendQuality entries | Supports those explicitly defined populations and geometry; daily breakout evidence is H30 |
| 365 days | Sampled first-three-anchor comparison near each year start, with shorter holds matched to those dates | Seasonal and sparse; not a general one-year sell recommendation |
| Hourly holds | Exact CMC snapshot replay in five short, separated blocks, longest 29 observations | Some cells tested; insufficient scope for a supported hourly automatic algorithm/exit mapping |

The expanded annual selector chose methods/holds using mature earlier outcomes only. It lost capital in 11/12 views; the remaining favorable view was fragile under start-date and best-cohort sensitivity. The evidence does not support replacing explicit research candidates with that automatic mapping. A fixed H30 candidate is not a claim that 30 days is optimal for every future coin.

Sources: [full holding grid](holding-horizons/README.md), [six-method indicator comparison](indicator-algorithms/2026-09-13/README.md), [annual selection](indicator-algorithms/2026-09-13/selection.json), [selection sensitivity](indicator-algorithms/2026-09-13/selection-sensitivity.json), [exact CMC scope](interval-algorithms/2026-09-13/README.md).

## Recommended sell rule and reference levels

For seven-view Breakout when optimizing the tested gains objective, retain the **fixed 30-day exit** as the primary candidate. Its median wealth is 1.591× on identical entry paths, versus 1.205× for the ATR bracket and 1.187× for the resistance bracket. ATR beats FixedH in 4/32 starts; resistance in 3/32. The brackets improve the worst starting phase to 0.844×/0.861× versus 0.721×, illustrating the downside/upside tradeoff.

The tested reference levels are concrete:

- ATR is the **simple mean of 14 daily true ranges through the signal**. This sell-level ATR differs from TA-Lib's Wilder-smoothed ATR used in one ranking candidate.
- Target: entry price + 3 × ATR. Stop reference: max(0, entry price − 2 × ATR).
- Resistance reference: maximum high of the previous 20 complete bars, excluding the signal. If above entry, it caps the ATR target; otherwise the ATR target remains.
- A daily close must confirm the trigger. The sale occurs at the open two days later, capped at the original H30 deadline. A wick touching a level is not assumed to fill an order.
- Early proceeds stay cash until the original deadline in these comparisons. Missing pre-trigger information remains unknown.

These are reference levels and explicitly tested alternative exits, not a proven optimal “sell zone.” A user choosing lower adverse-path loss may accept their lower median gains; it is a different objective. The learned conditional-exit experiments did not establish a broadly better automatic sale policy.

Sources: [daily exit protocol](daily-breakouts/2026-09-13/exits-protocol.md), [paired exit-capital results](daily-breakouts/2026-09-13/exit-capital-summary.json), [conditional-exit evidence](conditional-exits/2026-09-13/README.md).

## What the prediction can honestly say

The tested forecast is: **“Given this entry and the signal's frozen levels, what probability does the model assign to a daily high reaching this target by the H30 deadline?”** Geometry becomes fully known at the delayed entry open. The forecast is not a target-before-stop probability, an expected executed sale return, or “this coin will reach market-cap rank X in Y days.” A target may be touched after the tested stop or sale.

Monthly expanding logistic fits use only training events whose full hard deadline precedes the model cutoff. Reports group 2023–2025 **signal years**; lateDecember signals enter inJanuary, so saved fit cutoffs extend through 2026-01-01. The daily forecast run completed 2026-09-13 at 20:33:39 UTC. These are historical dated forecasts, not live probabilities for today's market.

For resistance targets, the daily unique-event Brier score is 0.21955 versus 0.25295 for the mature historical-rate baseline (about 13.2% lower squared probability error). Average probability is 55.90% versus 49.86% observed target reaches; in 2025 it is 50.84% versus 40.68%. On seven-view Breakout entries, average probability is 62.44% versus 60.36% observed across 3,264 known labels, with Brier 0.21261 versus 0.24491. Unknown labels remain unknown.

Consequently, present a model estimate alongside its target price, stop reference, signal/entry/deadline dates, monthly model cutoff, training support and historical calibration. Do not present the raw estimate as a perfectly calibrated probability or turn improved Brier into a sell recommendation. Earlier causal intercept recalibration improved pooled error but worsened raw-model Brier in 2023 and 2024; that separate sampled-population result does not establish a universal correction for daily breakout forecasts.

Sources: [daily forecast protocol](daily-breakouts/2026-09-13/forecast-protocol.md), [forecast metrics](daily-breakouts/2026-09-13/forecast-summary.json), [forecast verification](daily-breakouts/2026-09-13/forecast-verification.json), [earlier calibration study](sell-zone-calibration/2026-09-13/README.md).

## What is available in the app and research environment

The current application has **Classic, Momentum, Trend quality, Cumulative and Hybrid** modes, recalculated for the selected viewed interval. Classic remains the default. The scorer/window/rank-direction fixes and alternative modes were implemented and replayed against actual cached CMC data. In the original seven-view/seven-day-hold CMC comparison, Momentum found 32/80 sampled+20% hits versus corrected Classic's 22/80, with mean net 17.66% versus 11.86%; support is only eight signal dates. That frozen CMC series contains 69 consecutive recent daily snapshots from 2026-07-04 through 2026-09-10, so it cannot validate general 90-day or annual forecasts.

The subsequent [Cumulative/Hybrid study](cumulative/2026-09-13/README.md) captures a new 71-day CMC input snapshot and six hourly blocks, with independently verified scores, returns and promotion gates. Both candidates fail the daily gate and pass the hourly gate; hourly improvement is sensitive to missing-price assumptions. Neither meets the global-default criterion. Longer venue results also lose to Breakout in every later-period viewed-interval mean-return comparison. Keep both as normal options, with Classic the Daily/Hourly default. These scores describe observed history within the selected interval, not a holding rule or target forecast.

**Updated September 14:** `/breakouts` uses public **Coinbase or Kraken USD** candles, with Coinbase as default. The original TypeScript ranking/level formulas remain, but no Binance probability fits or performance metrics are shown for these unvalidated exchange populations. Thirty-day exits and price levels are reference scenarios, not validated recommendations for this market list. [Provider checks and limitations](us-exchanges/2026-09-14/README.md).

Daily and Hourly now offer **Exit timing** for all five native algorithms: matched CMC holding comparisons, selectable cost/missing-exit assumptions, and a manual UTC exit-date planner. This is descriptive evidence, not an automatic sell signal. [Native evidence and independent verification](native-exits/2026-09-14/README.md).

VectorBT 1.1.0, TA-Lib 0.7.1 and scikit-learn are installed in the isolated `.cache/trading-libs-venv`; versions are locked. VectorBT matched 58,862 saved round trips across three cost settings; TA-Lib indicators were checked against explicit recurrences and future-prefix invariance. They are working research tools, not pre-proven profitable algorithms. VectorBT has Apache 2.0 plus Commons Clause licensing; it was installed for local research. Freqtrade examples were reviewed but were not needed or installed.

Sources: [app modes](../components/RankingsView.tsx), [quote model](../modules/processRankings.ts), [exact implementation replay](interval-algorithms/2026-09-13/README.md), [library setup and lock](trading-libraries/2026-09-13/README.md).

## Evidence quality and delivery boundary

The daily studies independently verified over 3.6 million raw scores, all 52,146 selected outcomes,78,408 cohorts,2,304 base capital paths, alternative exits, forecast coefficients and matched-allocation comparisons. Frozen protocols, source hashes, UTC dates and reproducible ledgers are linked in the dated reports. This establishes that the reported rules and arithmetic were evaluated; it does not create untouched validation after prior outcomes have been examined.

The actionable research recommendation is **evaluate/use seven-view Breakout + H30 as the gains candidate on the supported venue OHLC inputs, retain Momentum for mover discovery, and expose resistance reachability only with its definition and calibration evidence**. For other views, keep the table's candidates and weaknesses visible. Do not equate a descriptive maximum with an automatic method choice the model could have made beforehand.

The [reusable ranking and sell-outlook interface](outlook/2026-09-13/README.md) is complete and independently verified. The user also requested app integration on September 13; `/breakouts` now supplies the OHLC screen, with current universe and model support explicitly distinguished from these historical cohorts. This local implementation has not been deployed. Hourly, general one-year and market-cap-rank predictions remain unsupported rather than fabricated. These are scope distinctions, not a demand that a strategy be risk-free or win in every phase/year.
