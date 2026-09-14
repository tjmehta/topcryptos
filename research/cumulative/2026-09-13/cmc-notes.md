# Exact-CMC cumulative/hybrid results — 2026-09-13 UTC

**Keep Classic as the application default in both daily and hourly modes.** Both new candidates fail the daily gate and pass the frozen hourly gate. Hybrid is the stronger hourly gains research candidate among the two new methods, but its advantage over Classic is sensitive to how missing exits are marked, so this review does not adopt an hourly default change. These conclusions concern the actual snapshot-based application scorer, not the OHLC/Binance breakout study. Identifying Hybrid as the stronger candidate uses the examined comparisons and is a post-comparison finding, not a prospectively selected policy.

The hourly result is conditional: all four primary methods still have negative average three-hour returns after modeled fees. Much of the paired advantage over Classic reflects fewer unavailable exits under the primary total-loss convention. The zero-gross missing-price sensitivity is weaker and prevents default adoption at this review. This decision preserves the formal frozen-gate results below; it does not rewrite their criteria after observing outcomes.

## Definition and dated source

Cumulative integrates log(price / first observed price) with trapezoids weighted by actual adjacent quote-time gaps, then divides by the full requested viewed-window duration. It rewards gains sustained earlier within that selected window. Hybrid equally blends the signed midrank percentiles of endpoint Momentum and Cumulative, using the same eligible pool. These methods use snapshot prices and the same shared history eligibility as current Classic. Signed negative scores remain eligible; the top ten are not a positive-only venue screen.

Run: **2026-09-13T22:15:25.248Z to 2026-09-13T22:16:32.490Z**. The new immutable input manifest contains 166 raw cache files. Daily coverage is 71 observations from 2026-07-04 to 2026-09-12. Six hourly blocks have 12/23/6/29/6/23 observations; the longest remains 29. The source is newly captured, not incorrectly asserted equal to the earlier 69-observation cache.

The run contains 4,645 cohort records,1,620 full-score/selection records,1,620 exact method-eligibility comparisons and 23,225 slot arithmetic checks. Signals retain the earlier sampled daily schedule (every 7 observations) and hourly schedule (every observation), with each required exit in the same contiguous block. Entry is the next saved snapshot after the decision. Forward highs are opportunity labels only, never sale fills. All five methods and all feasible original holding intervals are saved.

## Primary daily default: view 10, hold 7 days

Numbers below are mean ten-slot cohort returns with 50 bps per side and missing exits marked total loss. Daily 8 mature dates split into 4 earlier and 4 later dates.

| Method | All 8 dates | Earlier 4 | Later 4 | Later sampled +20% hits /40 slots | Later known losing trades |
|---|---:|---:|---:|---:|---:|
| Classic | 0.421% | -1.695% | 2.538% | 14/40 | 21/40 |
| Momentum | -1.971% | -4.913% | 0.971% | 15/40 | 23/39 |
| Cumulative | -1.857% | -4.169% | 0.456% | 13/40 | 22/38 |
| Hybrid | -1.823% | -7.317% | 3.670% | 15/40 | 22/39 |

Cumulative later-half advantage is−2.081 percentage points versus Classic and−0.515 pp versus Momentum, with 1/4 wins against each. Hybrid improves later means by+1.132 pp versus Classic and+2.699 pp versus Momentum, but wins only 2/4 Classic comparisons; removing its best paired Classic date changes the mean advantage to−0.179 pp. Neither passes. Across eight supported daily views at H7, Cumulative is nonnegative against both baselines in 1/8 and Hybrid in 3/8, failing the frozen breadth condition.

## Primary hourly default: view 6, hold 3hours

Hourly 51 mature signals split into 25 earlier and 26 later. All later signals fall on just two dates:12 on 2026-09-05 and 14 on 2026-09-13. Repeated coin/date outcomes and overlapping three-hour holds are not independent market regimes.

| Method | All 51 signals | Earlier 25 | Later 26 | Later sampled +20% hits /260 slots | Later known losing trades |
|---|---:|---:|---:|---:|---:|
| Classic | -1.635% | -1.280% | -1.976% | 5/260 | 177/257 |
| Momentum | -1.436% | -1.334% | -1.533% | 7/260 | 169/259 |
| Cumulative | -1.426% | -2.094% | -0.784% | 8/260 | 165/259 |
| Hybrid | -1.112% | -1.580% | -0.662% | 7/260 | 169/260 |

| Hourly candidate / comparator | Later mean advantage | 100 bps advantage | Wins /26 | Advantage without best paired date |
|---|---:|---:|---:|---:|
| Cumulative / Classic | 1.191 pp | 1.183 pp | 14/26 | 0.679 pp |
| Cumulative / Momentum | 0.749 pp | 0.745 pp | 14/26 | 0.240 pp |
| Hybrid / Classic | 1.313 pp | 1.300 pp | 15/26 | 0.774 pp |
| Hybrid / Momentum | 0.871 pp | 0.862 pp | 15/26 | 0.335 pp |

Both candidates pass the frozen primary mean, cost, removal-of-best and strict-majority conditions against both comparators. Each is nonnegative against both baselines in 3/5 supported hourly views, with nonnegative median view advantages at 100 bps. Hybrid has higher primary later returns, more winning dates and larger best-date-removal advantages than Cumulative, supporting it as the gain-oriented hourly candidate among the two tested additions. Cumulative has one more sampled +20% hit and fewer known losers in this slice, so objectives are still not identical.

**Missing-exit sensitivity:** in the later hourly cell, Classic has 3 missing exits, Momentum 1, and both new candidates 0. Marking missing exits at zero gross return instead reduces Hybrid’s mean advantage versus Classic to+0.171 pp, with 13/26 wins and−0.028 pp after removing the best paired date. Cumulative is+0.049 pp, with 13/26 wins and−0.198 pp after best-date removal. Neither sensitivity passes the full original gate if its missing-mark convention is substituted. The frozen gate itself remains reported without alteration; the conditionality of that gate is material. The marks are scenarios, not claims that the missing assets actually returned 0% or−100%.

## Breadth at the declared holding periods

All-date mean returns below use the primary 50 bps/total-loss mark. These descriptive rows are not used to replace the declared default horizons. N varies by view; cells with fewer than 6 dates do not enter the breadth gate.

| Mode/view | Dates | Classic | Momentum | Trend quality | Cumulative | Hybrid |
|---|---:|---:|---:|---:|---:|---:|
| daily/3 | 9 | 0.044% | 3.505% | 5.532% | -3.392% | 1.249% |
| daily/4 | 9 | -3.857% | -1.987% | -1.073% | -0.942% | -4.123% |
| daily/5 | 9 | 2.016% | -2.930% | -3.414% | -0.951% | -1.965% |
| daily/6 | 9 | 0.222% | 0.894% | 3.459% | 1.014% | 2.733% |
| daily/7 | 9 | 8.013% | 12.054% | 3.882% | 0.879% | 10.066% |
| daily/10 | 8 | 0.421% | -1.971% | -3.606% | -1.857% | -1.823% |
| daily/14 | 8 | 2.487% | -2.997% | -2.033% | -1.172% | -3.930% |
| daily/21 | 7 | 6.326% | -0.180% | 3.479% | -3.299% | -0.927% |
| daily/30 | 5 | 4.346% | -6.298% | -2.638% | -4.628% | -4.806% |
| daily/45 | 3 | 6.499% | 0.271% | 6.423% | 3.379% | 1.020% |
| daily/60 | 1 | 19.140% | -2.401% | 4.540% | -8.940% | 3.339% |
| daily/90 |0 | Unsupported | Unsupported | Unsupported | Unsupported | Unsupported |
| hourly/3 | 63 | -0.943% | -0.808% | -0.614% | -1.082% | -0.998% |
| hourly/6 | 51 | -1.635% | -1.436% | -1.587% | -1.426% | -1.112% |
| hourly/9 | 39 | -1.098% | -1.323% | -1.555% | -1.022% | -1.169% |
| hourly/12 | 30 | -0.922% | -0.614% | -1.019% | -0.448% | -0.393% |
| hourly/18 | 12 | -0.979% | -0.862% | -1.088% | -0.586% | -0.828% |
| hourly/24 | 2 | 1.850% | 2.947% | 2.502% | 2.064% | 2.545% |

DailyH90/H365 and the 90-observation daily view remain unsupported. All remaining holdings and date feasibility are in the summary. The hourly gate describes relative improvement over tested comparators, not a profitable three-hour trading rule, a price/rank forecast, or evidence over multiple market regimes.

## Artifacts and verification

- [cmc-protocol.md](cmc-protocol.md): frozen gates and execution definitions.
- [cmc-run.cjs](cmc-run.cjs): actual-module replay, source immutability assertions and selftests.
- [cmc-inputs.json.gz](cmc-inputs.json.gz): captured normalized blocks and original raw-file manifest.
- [cmc-sources.json](cmc-sources.json): exact scorer/helper/runner/protocol bytes and hashes.
- [cmc-results.json.gz](cmc-results.json.gz): all eligible normalized scores, native selections and position outcomes.
- [cmc-summary.json](cmc-summary.json): all dates, feasible cells, methods, chronological halves, paired differences and adoption gates.

Executing scorer SHA-256: `208a534f4dff743833c7cc3d263bb6341c5338f9e62546b49bb223d8a6aa33aa`. Ledger SHA-256: `7e37fcd1be5741df67fe15cc7da061c2c5770dec144a7176f9ebf5a865858463`. All executing source bytes matched at completion. New cumulative cancellation roundoff was corrected and regression-tested before this full run; no pre-correction outcome run occurred.

Independent CMC reconstruction **passed at 2026-09-13T22:19:54.031Z**. The separate standard-library implementation in [verification.cjs](verification.cjs) imported no application scoring or backtest implementation. Its [cmc-verification.json](cmc-verification.json) records checks of 166 raw files, 324 unique formations, 795,730 scores across all five methods, 1,620 signal selections, 4,645 cohort records, 46,450 positions, 45,669 known raw-price returns, 335,253 path snapshots, 1,242 paired cells and 1,035 chronological-half cells. All four adoption gates matched exactly: both daily failures and both hourly passes. The combined report is [verification-report.json](verification-report.json); the CMC result is the scope confirmed here.

No frozen prior source or output was modified by this experiment. Full execution refuses to overwrite these files; replay requires a fresh output directory and the captured exact source/data state. `node research/cumulative/2026-09-13/cmc-run.cjs --selftest` runs deterministic helper tests without rewriting artifacts.
