# Topcryptos v2: research decision

## Decision

A correctness-focused and more interpretable v2 is justified. A universal predictive winner, optimal crypto lookback, or adaptive cycle selector is not established.

Use comparable-window return as the descriptive baseline. Keep trend continuity/quality and volatility/drawdown as separate, explicitly named views rather than selecting another blended score because it won an exploratory sample. Preserve Classic as a research comparator. Production implementation is a separate decision; none was performed in this research task.

## Local cross-sectional evidence

The cache contains 555 snapshots, but not continuous 2020–2026 history. Its longest modern daily block is only 69 days. Two anomalous old dates are quarantined as hard gaps. Long calendar-month cross-sectional experiments are infeasible in these segments.

The v2 study compares eight methods at 7/21/30-day formation and 1/7-day holding horizons, with next-day entry, common signal-time eligibility, immutable top-ten constituents, explicit missing-entry/exit scenarios, stable ties, and turnover-based cost stress. There are 322 configuration-specific decisions across 33 groups, not 322 independent market dates. All results are exploratory: earlier results already informed the design. The chronological test-era label does not mean untouched holdout.

An independent audit recomputed all local decisions and verified chronology, quarantine, production-score parity, missing-endpoint handling and the specified cost accounting. No computational discrepancy was found under the stated model. Publication availability, executable fills, liquidity, token events and market impact remain unresolved.

### Recent daily-holding comparison

Each row uses the same 21 holding dates, from 2026-08-20 to 2026-09-10. Values are arithmetic mean gross daily cohort returns, not annualized forecasts or executable strategy estimates.

| Formation | Classic | Return | Trend quality | Volatility-normalized return |
|---|---:|---:|---:|---:|
| 7 days | 1.812% | 2.459% | 2.829% | 1.930% |
| 21 days | 0.077% | 1.896% | 0.180% | 1.592% |
| 30 days | -0.261% | -0.064% | -0.148% | 0.745% |

Classic replaced 72–77% of the top ten per daily rebalance; Return replaced 17–33%. In the 7-day formation case, Classic diagnostic wealth changed from 1.3933 gross to 0.9973 at 100 bps per traded notional, versus Return 1.5863 to 1.3439 and TrendQuality 1.6767 to 1.4325. These are simulator cost sensitivities, not fee-inclusive achievable fills.

Weekly-holding comparisons have only three recent cohorts each and change the ordering: Classic beats Return for 7-, 21- and 30-day formation in that slice. This is evidence against declaring return-only a universal predictive winner, not evidence that Classic has established alpha. Earlier chronological groups also change the winning method.

## Correctness evidence independent of investment performance

The existing scorer's 70% coverage-adjusted velocity component reduces algebraically to return divided by a common span. Its acceleration terms add materially different ordering and churn.

Sixteen synthetic characterization checks reproduce behaviors including:

- Accelerating improvement in market-cap rank receives a negative rank-acceleration contribution, while accelerating deterioration receives a positive contribution.
- Floating-point residuals below 1e-12 can receive a full signed acceleration percentile.
- Summed acceleration telescopes on regular grids and is sensitive to timestamp irregularities.
- Sparse interiors and stale endpoints can remain eligible; a hidden long-span coin can alter another coin's coverage eligibility.
- Backwards/duplicate timestamps, calendar-day cutoff semantics and unstable ties require explicit handling.
- Hourly stale-row removal can compress snapshot ranks and manufacture rank changes.

Passing these characterization checks means the behaviors were reproduced, not fixed. The existing scoring Jest suite also passes all 14 tests.

## Separate monthly BTC/ETH exposure study

Official Binance archives provide 3,302 daily bars per asset, 2017-08-17 through 2026-08-31, in 218 checksum-verified ZIPs. This permits 95 common monthly holding intervals, 2018-09-01 through 2026-08-01. It is a retrospective study of two known survivors on one USDT-quoted venue, not a top-500 ranking test.

At each UTC month end, each fixed 1/3/6/12-calendar-month return generates a binary long/cash signal. The fixed ensemble's target exposure is the fraction of those four returns that are positive. All rules hold for one month; these experiments do NOT test prediction of next-3/6/12-month returns or adaptive lookback selection. Cash earns zero.

Independent raw-archive recomputation matches the gross return figures. Gross ensemble versus buy-and-hold results:

| Asset | Full-period terminal wealth, ensemble / buy-hold | Final 24-month return, ensemble / buy-hold | Full-period daily-open sampled maximum drawdown, ensemble / buy-hold |
|---|---:|---:|---:|
| BTC | 11.755 / 8.970 | +23.80% / -2.69% | -52.83% / -76.63% |
| ETH | 7.339 / 6.618 | -43.94% / -42.38% | -68.41% / -79.30% |

Wealth starts at 1. Daily-open sampled drawdowns above were independently recomputed; the original JSON `maxDrawdown` fields use monthly checkpoints and understate the daily-sampled losses. Neither captures all intraday drawdowns. The final 24 months are retrospective, not an untouched holdout.

The baseline executes at the first daily open immediately after the month-end close. The archive timestamps differ by only 1 ms: this is a boundary-price reference test, NOT a realistic full-day execution lag.

The completed independent audit also tested one fixed sensitivity: keep the same month-end signals and 95 periods, but shift both entry and exit to UTC day-2 open, approximately 24 hours later. These gross results were recomputed in memory; the original runner and JSON files remain unchanged.

| Asset | Full-period terminal wealth with day-2 execution, ensemble / buy-hold | Final 24-month return with day-2 execution, ensemble / buy-hold |
|---|---:|---:|
| BTC | 11.081 / 8.724 | +21.26% / -3.87% |
| ETH | 6.957 / 6.237 | -43.47% / -42.41% |

The delayed sensitivity reduces full-period wealth but does not change the qualitative conclusion: BTC ensemble outperformed in these retrospective comparisons; ETH ensemble still underperformed buy-and-hold on final-period return. This is one additional exploratory sensitivity, not independent confirmation or an optimized execution schedule.

The original cost model charges cost against pre-fee weight changes and then resets post-fee target weights. This is an approximation, not an exact fill ledger. An independent exact post-fee-target recomputation at 100 bps changes full-period ensemble terminal wealth only slightly: BTC 9.7163 to 9.7195 and ETH 6.1154 to 6.1174. This small numerical sensitivity does not resolve spreads, slippage, capacity, USDT or venue risk.

Lower drawdown accompanies lower average target exposure (roughly 58% BTC, 55% ETH). These are equal-month averages, not elapsed-day-weighted exposure despite the protocol's wording; the maximum discrepancy found across all/final24 experiments was 0.1484 exposure percentage point. An exposure-matched benchmark has not been tested, so this does not establish risk-adjusted alpha. ETH's weaker final-period return is important contrary evidence.

The independent audit verified all 96 symbol/strategy/cost/slice combinations against the stated approximate model, with numerical discrepancies below 1e-14. Final24 correctly carries pre-existing drifted weights instead of charging an artificial new entry. A future-run helper defect was also confirmed: `previousUtcMonth()` emits `YYYY-00` in January. It does not affect these September-generated results, but needs proper calendar arithmetic before reuse. The original research protocol, runner and JSON outputs were preserved rather than silently revised after outcomes were observed.

## Recommended next research boundary

1. Define retrospective performance separately from a forecast or trading strategy.
2. Enforce common start/end timestamps, fresh endpoints, coverage/gap rules, numeric tolerances and deterministic ties before changing the scoring formula.
3. Offer fixed 1/3/6/12-month return and trend views only when sufficient comparable data exist. Keep since-listing/all-time return separately labeled; unequal asset ages make it an unsuitable common performance baseline.
4. Treat a fixed multi-horizon ensemble as an exposure-management challenger, not an adaptive cycle detector.
5. To test next-X-month returns, separately freeze formation lookback, forward holding period and rebalance schedule. The completed monthly study fixes holding at one month.
6. Build a historical, point-in-time liquid universe from public archives, retaining exits and token migrations rather than filtering today's survivors. Freeze candidates and test on unseen data with exposure-matched benchmarks, real execution delay, costs, tail outcomes and multiplicity-aware uncertainty.
7. An adaptive selector using only past observations can be a later challenger. Choosing the horizon that worked best in the current retrospectively identified cycle is not valid out-of-sample evidence.

## Selected primary references

- Liu, Tsyvinski & Wu, 2019 working-paper version, weekly cross-sectional crypto momentum: https://www.nber.org/system/files/working_papers/w25882/w25882.pdf
- Grobys & Sapkota, 2019, mixed/insignificant monthly crypto momentum results: https://osuva.uwasa.fi/server/api/core/bitstreams/ffee5cb1-92a8-443e-a117-cbaacd8a1028/content
- Time Series Momentum original-paper data and methodology, non-crypto futures evidence: https://www.aqr.com/Insights/Datasets/Time-Series-Momentum-Original-Paper-Data
- Hurst, Ooi & Pedersen, fixed multi-horizon trend-following across traditional markets: https://fairmodel.econ.yale.edu/ec439/hurst.pdf
- Sullivan, Timmermann & White, data-snooping and technical-rule selection: https://www.fmg.ac.uk/sites/default/files/2020-11/dp303.pdf
- Binance public archive documentation: https://github.com/binance/binance-public-data

The earlier primary-source report contains fuller sample/cost/access caveats. None of these sources directly validates Topcryptos' exact acceleration blend or the study's exact alternative formulas.

## Scope and execution status

Only isolated research artifacts were added. No tracked production file changes, commits, deployments, installations, production credential use or production bulk-history requests were performed. Existing unrelated untracked `.codex/` and `.mcp.json` were preserved.

The separate Codex researcher was launched in Herdr topcryptos tab `codex-v2-research` with detailed independent instructions. Its repository audit remains blocked by `bwrap: loopback: Failed RTM_NEWADDR: Operation not permitted`; no sandbox permissions were changed. Its repository findings are not counted as completed independent evidence.
