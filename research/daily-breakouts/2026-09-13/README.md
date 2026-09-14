# Daily algorithms, sell timing and target probabilities — 2026-09-13

Daily testing supports breakout ranking as an improvement over the tested positive-momentum baseline in several viewed intervals. It also narrows the earlier claims: favorable sampled-calendar results do not guarantee favorable daily entry dates, and the 21-view volume-breakout candidate loses capital for most daily starts. The tested level exits generally trade lower upside for better adverse starting paths. Their target probabilities can be informative without making those targets good sell instructions.

## Experiment and dates

The [daily protocol](protocol.md) was frozen before these results. It tests the exact existing Momentum, Breakout and VolumeBreakout definitions for all 12 viewed intervals, with a fixed **30 days after entry** holding period. Signal close is date t, entry is open t+2, and the scheduled sale is open t+32. A view of N observations covers N−1 elapsed close-return days. The previous six-method/six-hold study supplies the wider algorithm and holding grid; this run validates its breakout/H30 candidates on daily calendars.

Formation data are the unchanged 2020–2025 annual Binance cohorts. Daily formations cover every calendar date, including December, with original identities retained through the following January exit. No cross-cohort symbol fallback was introduced. Shared history/liquidity gates, ten equal capital slots, unused cash, costs and missing prices remain explicit. The primary scenario charges 50bps each side and marks missing exits as total losses; all 0%-gross marks and 100bps costs are also saved.

The main run completed **2026-09-13T20:28:14.691958+00:00 to 20:31:32.393767+00:00**: 26,136 formations, 78,408 daily cohorts and 52,146 unique selected identity/signal/H30 outcomes. All 858 overlapping sampled formations, 2,574 cohorts and 11,160 position records matched the earlier indicator study exactly. There are 168 missing formations, caused by the existing annual long-view history requirement; these are not empty trading signals.

Capital replay completed at **20:32:04.702046 UTC**. Paired level exits completed at **20:32:47.922755 UTC**; monthly forecasts at **20:33:39.093650 UTC**; paired exit-capital replay at **20:35:48.429985 UTC**, all September 13, 2026. Each artifact retains full timestamps, source hashes and runner versions.

## Daily capital results

The primary `responsive` scheduler checks again the next day if there is no selection. If all selected entries fail, it waits until the entry date before that failure becomes known. A partially or fully filled batch holds its ten slots until the fixed deadline. A separate `scheduled` diagnostic reserves the whole interval even for empty selections. Neither scheduler uses future sale returns to choose entry dates.

Each view/method/scheduler is evaluated from all 32 initial dates January 1–February 1, 2023. Positions carry across year boundaries with no capital reset. The results below are medians of complete paths through the final sale, **not compounded daily-cohort averages**. A multiple below 1 means a loss. The paths overlap extensively; they are sensitivity cases, not independent trials.

| Viewed observations | Momentum median wealth | Breakout median wealth | VolumeBreakout median wealth | Breakout beats Momentum, paired starts |
|---|---:|---:|---:|---:|
| 3 | 0.367× | 1.161× | 1.405× | 23/32 |
| 4 | 0.345× | 1.561× | 1.335× | 29/32 |
| 5 | 0.334× | 1.184× | 1.066× | 29/32 |
| 6 | 0.383× | 1.190× | 1.015× | 32/32 |
| 7 | 0.503× | 1.591× | 0.943× | 32/32 |
| 10 | 0.488× | 1.107× | 1.052× | 32/32 |
| 14 | 0.391× | 1.185× | 0.851× | 32/32 |
| 21 | 0.480× | 0.894× | 0.863× | 32/32 |
| 30 | 0.485× | 0.940× | 0.581× | 30/32 |
| 45 | 0.538× | 0.873× | 0.656× | 25/32 |
| 60 | 0.429× | 1.070× | 0.822× | 32/32 |
| 90 | 0.254× | 1.286× | 0.944× | 32/32 |

These comparisons test improvement over the baseline, not a requirement of zero losses. Seven-view Breakout beats Momentum at every matched start under primary marks; it finishes above cash in 27/32 starts, with wealth range **0.721×–2.721×**. The high-cost worst start is 0.653×, so the earlier three-start claim of uniformly positive gains must not be generalized to daily schedules.

Long-view phase counts need care. Ninety-view Breakout has only three distinct actual entry schedules after annual warmup gaps align the starts; every evaluated 2025 path loses approximately 9.48%. Its 32/32 positive full-period results are not 32 independent confirmations. The 21-view VolumeBreakout median is 0.863× with only 7/32 profitable starts, weakening that earlier sampled-calendar candidate.

Breakout strategies make fewer selections and leave more capital in cash. Daily cohort means, realized ≥20% exits, observed +20% high reaches, losing positions, used slots, missing paths and complete-path excursions are preserved separately in [summary.json](summary.json). The matched-allocation study in [README-exposure.md](README-exposure.md) isolates selection quality from differing numbers of picks; do not infer that all of the gain advantage comes from better coin ordering.

The matched test gives Momentum exactly the same number of selections and the same decision dates as each candidate. Seven-view Breakout still wins **26/32** paired capital starts, including at higher costs. Its median wealth is 1.591× versus matched Momentum's 1.158×; median paired wealth advantage is +0.343 units. Daily cohort mean advantage shrinks to **+0.123 percentage points**, showing why allocation matching matters. It also catches fewer observed +20% reaches (1,493 versus 1,606) and realized ≥20% exits (668 versus 719), while reducing known losing positions (1,828 versus 1,897). This supports a gains-oriented candidate, not a claim of finding more movers.

Seven-view VolumeBreakout wins only 8/32 matched capital starts. Across all intervals, positive daily average differences do not imply a positive median capital advantage: only 10/24 candidate/view comparisons have the latter under the primary responsive scheduler. All interval-specific matched results remain in the exposure report.

## Sell levels versus holding

The [exit protocol](exits-protocol.md) retains three already specified policies on the exact daily entries: FixedH, SMAATRBracket and ResistanceSMAATR. ATR here is the existing 14-day simple mean of true range, not the ranking library's Wilder ATR. The ATR target is entry+3ATR and stop is max(0,entry−2ATR); a prior-20-bar resistance above entry caps the resistance target. A close confirms the trigger, with sale at open two days later, capped at H30. Neither a wick nor the target price is assumed to be an execution fill.

Early proceeds remain cash through the original deadline, preserving every original entry decision. Missing pre-trigger history remains unknown rather than silently selecting another policy. All four cost/missing-price marks are replayed on the frozen capital schedules.

For seven-view Breakout, primary median wealth is **1.591× for FixedH**, **1.205× for the ATR bracket**, and **1.187× for the resistance bracket**. The brackets improve the worst starting phase to 0.844×/0.861× but reduce median gains. ATR wins versus FixedH in 4/32 paired starts; resistance wins 3/32. This supports the 30-day hold over these particular profit-taking rules when prioritizing gains, while making the downside tradeoff visible.

The result is not universal: ATR improves 21-view VolumeBreakout median wealth from 0.863× to 0.895×, both below starting cash. Across all Breakout views, ATR wins 175/384 phase comparisons; across VolumeBreakout it wins 174/384. Average daily-cohort returns and complete capital paths answer different questions and must not be substituted for one another.

## What the target prediction means

The [forecast protocol](forecast-protocol.md) transfers the frozen five-feature logistic model to daily entries, with monthly expanding training and full-horizon maturity strictly before each month. Geometry is known at entry. The label is **a daily high reaching the reference target by day 30**, even if a stop or actual sale occurred earlier. It is not target-before-stop, a realized sale, or a market-cap-rank forecast.

There are 74 monthly fits and 53,136 forecasts across both target policies. The resistance model's unique-event Brier score is **0.21955 versus 0.25295** for the mature historical-rate baseline, approximately **13.2% lower error**. It beats that baseline in all 36 method/view populations pooled and in each year. It still overpredicts: average probability is 55.90% against 49.86% observed hits; in 2025, 50.84% against 40.68%.

On seven-view Breakout entries specifically, resistance-target probabilities average **62.44%** against **60.36%** observed hits across 3,264 known labels. Brier score is 0.21261 versus baseline 0.24491. This is a historical accuracy result, not today's probability for an arbitrary coin. The stronger prediction score does not undo the weaker realized returns from selling on that level.

Four evaluation events per policy lack usable features, and no evaluation month lacks a fit. Issued forecasts retain 40 unknown ATR labels and 37 unknown resistance labels; these do not become false labels. The independent [forecast verification](forecast-verification.json) supplements coverage by method/view/year. A sklearn warning arose from floating-point variance of the constant H30 feature; all scales were finite and that feature's maximum contribution to a prediction logit was 3.42e-24. Independent coefficient replay found no numerical defect.

## Reproducible evidence

- [run.py](run.py), [ledger.json.gz](ledger.json.gz), [summary.json](summary.json): all daily formations, selections and fixed outcomes.
- [capital.py](capital.py), [capital-ledger.json.gz](capital-ledger.json.gz), [capital-summary.json](capital-summary.json): all 2,304 capital paths, four costs/marks, exposure and paired starts.
- [exits.py](exits.py), [exit-ledger.json.gz](exit-ledger.json.gz), [exit-summary.json](exit-summary.json): all 156,438 policy outcomes and 522,216 fixed-mark parity checks.
- [exit-capital.py](exit-capital.py), [exit-capital-summary.json](exit-capital-summary.json): 6,912 fixed-entry policy paths with original deadlines.
- [forecasts.py](forecasts.py), [forecast-ledger.json.gz](forecast-ledger.json.gz), [forecast-summary.json](forecast-summary.json): all monthly fits, probabilities, levels and reliability bins.
- [verify.py](verify.py), [verify-capital.py](verify-capital.py), [verify-exit-capital.py](verify-exit-capital.py), [verify-forecasts.py](verify-forecasts.py): independent raw-data and arithmetic reconstructions. Reports are the corresponding verification JSON files.
- [exposure.py](exposure.py), [exposure-summary.json](exposure-summary.json), [README-exposure.md](README-exposure.md): 52,272 daily and 1,536 capital comparisons with matched counts and entry dates.
- [verify-exposure.py](verify-exposure.py), [exposure-verification.json](exposure-verification.json): independently verified all matched selections, slot returns, mover metrics, unchanged schedules and 12,288 role/scenario capital replays; zero benchmark overlap conflicts.

All five independent verification reports passed: over 3.6 million raw scores, all daily outcome/slot calculations, 2,304 base capital paths, 27,648 exit-policy/scenario paths, every forecast/scaler/population metric, and all matched-allocation comparisons. Completed-output writers refuse overwrite. Preserve the dated artifacts before any rerun. No application code or production behavior changed in this experiment.

These findings concern a preselected liquid venue universe and its existing annual membership, fiat-pair, missing-price and identity limitations. They do not establish an automatic current-CMC mapping, hourly execution, or a general one-year sell recommendation. The evaluated hold is 30 days; view-specific winners and sale deadlines remain empirical candidates rather than guaranteed future outcomes.
