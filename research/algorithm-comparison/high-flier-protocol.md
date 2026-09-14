# High-flier discovery and exhaustion exits — frozen signal protocol

## Objective and scope

Find future high-flying coins early and issue actionable exhaustion exits. This is not BTC exposure timing and not a portfolio Sharpe optimization. No production code changes. Only new isolated research artifacts may be created.

This protocol is written before new cross-coin forward outcomes are inspected. Prior Topcryptos local results, BTC/ETH history and published research have informed design, so describe the study as predeclared retrospective research, not prospective validation. No parameter search or adaptive cycle selection is permitted. Report unsuccessful candidates and missing outcomes.

A separate data protocol will freeze acquisition, historical eligibility cohorts, dates, exclusions and download limits before outcome computation. Binance spot OHLCV is venue-specific and lacks historical market-cap ranks: do not call it global top-500 coverage or an exact Classic backtest. Never substitute volume ranks for market-cap ranks. Existing local CMC data can reproduce Classic but cannot establish multi-year high-flier skill.

## Causal inputs and execution

- Complete UTC daily OHLCV bars; quote volume means daily USDT turnover, not rolling CMC volume_24h.
- Shared daily eligible universe requires membership in the data protocol's historical cohort, a complete signal-day bar, and at least 60 consecutive daily bars ending on the signal day. Validate positive finite OHLC, high/low ordering, unique strictly increasing UTC dates and nonnegative finite volumes.
- Require median quote volume of the preceding 20 completed days to be at least 1,000,000 USDT. This is a lagged screening threshold, not proof of depth or execution capacity. Stablecoins and leveraged tokens follow the data protocol's explicit exclusions.
- The decision is made after day t closes. Primary entry is the scheduled open of day t+2, approximately 24 hours later. The immediate t+1 open is NOT a realistic full-day delay and is not the primary experiment.
- An exit triggered after day d closes fills at scheduled day d+2 open, capped at the predeclared hard exit. Never use the high, close or threshold as a fill.
- Missing entry means no trade/cash and no replacement. Do not move entry to a later available bar. Missing exit stays in the ledger and receives explicit 0%-return and -100%-return scenarios, never an assumed executable last mark.
- Preserve partial terminal bars and flag their duration/trade count rather than discarding whole archives. They cannot satisfy complete-bar formation or complete forward-day coverage. Any execution bar must have positive finite open, positive trade count, positive base volume and positive quote volume. A midnight open from a partial bar may be used only if its instrument identity is unchanged and actual trading started by that scheduled open; zero-trade placeholder bars are not evidence of an executable open. Report this proxy assumption separately from guaranteed fillability.
- Split known symbol-reuse/redenomination boundaries using an explicit source-linked identity table frozen before aggregation. Never chain old and replacement-token prices, even when both occupy one archive path. Positions crossing an unresolved identity boundary remain in scenario denominators; do not delete them. The replacement identity requires its own 60-day warmup. Identity corrections are structural data controls, not exclusions selected by profitability.
- Report gross and 10/50/100-bps one-way fee sensitivities for independent unit-capital round trips. With fee c, quantity at entry is 1/[entryPrice*(1+c)], and final proceeds are quantity*exitPrice*(1-c). This is exact for this simplified fee convention; it is not a slippage/capacity model or a sequential portfolio simulation.

## Five fixed discovery methods

C_t, H_t and V_t denote completed close, high and daily quote volume. Each method ranks only shared eligible coins, descending, with stable symbol ties. Issue at most ten signals; unused slots remain unused and count in per-ten-slot metrics. Do not replace nonqualifying coins.

1. Return7: log(C_t/C_(t-7)), positive scores only.
2. Return21: log(C_t/C_(t-21)), positive scores only.
3. Breakout20: log(C_t/max(H_(t-20),...,H_(t-1))), positive scores only. Signal-day high is not part of the prior-high reference.
4. Acceleration3: log(C_t/C_(t-3))-log(C_(t-3)/C_(t-6)); require both a positive score and Return7>0. This is a price-only candidate, not production Classic.
5. VolumeBreakout20: same positive Breakout20 ranking, additionally V_t >= 1.5*median(V_(t-20),...,V_(t-1)).

Primary discovery comparison: Breakout20 versus Return7. All others are secondary. No change of lookbacks, volume multipliers, gates or ranking formula after results.

## Forward grading and discovery metrics

Let entry day index be e=t+2. Horizons are exactly H=7 and H=30 days; fixed endpoint fill is open at e+H. Opportunity-path bars are e through e+H-1 inclusive.

- MFE_H=max(high over opportunity path)/entryOpen-1.
- MAE_H=min(low over opportunity path)/entryOpen-1.
- Fixed endpoint return=O_(e+H)/O_e-1.
- Absolute high-flier labels: primary MFE_7>=20%; secondary MFE_30>=50%.
- Relative high-flier diagnostic: top decile of MFE_H across that day's shared eligible universe. For the conditional known-path diagnostic use exactly ceil(0.10*knownPathCount), with stable symbol then instrument-identity tie breaks, not tie expansion. If paths are incomplete, report the fraction unknown and label this known-path-only relative ranking as conditional, not survivor-free.
- Daily highs/first-peak dates and threshold-crossing dates are evaluation labels only. They never generate alerts or supply assumed fills. Daily bars cannot resolve intraday ordering or minute-level peaks.

Report known hits per ten available slots, precision per issued alert, unknown-outcome fraction, pessimistic/optimistic hit bounds, universe base rate and lift, distributions of MFE/MAE/endpoint return, and days from entry to first threshold crossing/first peak. Keep 7-day and 30-day grades separate.

Eligibility limits must remain explicit: this can only discover runners in the historically selected venue cohort, not every coin. Missing paths do not disappear from denominators; primary absolute-hit metrics have lower bound knownHits/slots and upper bound (knownHits+unknownSelectedPaths)/slots. Unknown entries are unexecuted, not profitable discoveries.

Report both daily selection statistics and event statistics. Define independent entry episodes per method/symbol: after an issued executable signal, suppress another episode for that symbol until 30 calendar days after its entry date. Do not refill the suppressed slot. Entry cooldown does not depend on which exit rule later succeeds. Daily rankings still exist and can be graded separately; do not count repeated daily selections as repeated unique runner discoveries.

## Same-entry exhaustion/exit study

Primary entry ledger is Return7's episode ledger. Compare all four exit rules on these identical entries, irrespective of future outcomes. Secondary ledgers may be reported separately, never pooled into the primary comparison.

Hard exit: open at e+30. Evaluate candidate closes d=e through e+28 inclusive using only data then available; the first trigger queues exit at d+2. A trigger at e+28 merely matches the already scheduled hard exit, not an earlier exit. Never use close e+29 or later to claim a delayed overlay fill at e+30. A missing/invalid required close before the first trigger makes the overlay's first-trigger order unknown; preserve that trade in the stated scenarios. Fixed30 can still have a known endpoint even when path-based grades are unknown. No perfect peak, immediate re-entry, intraday stop fill, take-profit search or retrospective removal of failed trades.

1. Fixed30 baseline: hard exit only.
2. Trail15: C_d <= 0.85*max(entryOpen, closes from e through d).
3. Chandelier3ATR: maintain stop_d=max(stop_(d-1),max(highs from e through d)-3*ATR14_d), initializing on the first completed entry-day bar, and trigger when C_d<=stop_d. ATR14 is the arithmetic mean of the latest 14 true ranges, TR_j=max(H_j-L_j,abs(H_j-C_(j-1)),abs(L_j-C_(j-1))). This explicit ratchet was clarified before outcome analysis: rising volatility must not silently lower an already established trailing stop. Stop is evaluated at close, not assumed crossed/fillable intraday.
4. EMA10Break: two consecutive post-entry completed closes below causal EMA10. Seed EMA10 with the arithmetic mean of the first ten closes in the symbol's loaded chronological history, then alpha=2/11; require 60-bar signal warmup.

Primary exit comparison: Trail15 versus Fixed30. Other exits secondary. Report paired gross/net return differences at 50bps/side, loss frequency, worst-decile return, holding duration, early-exit frequency, MFE/MAE before exit and over the fixed opportunity window.

Distinguish two quantities that must not be conflated:

- Profit given back before the actual exit: maximum favorable excursion through the exit fill minus actual return. For an open fill on day f, include highs only on days e through f-1, plus entryOpen and exitOpen; never include day f's later high or low. This is path-based hindsight grading, not an achievable sale at that high.
- Total opportunity shortfall: full 30-day MFE minus actual return. This includes both pre-exit giveback and upside missed after an early exit; do not label it all giveback.

Also report peak-capture ratio only for positive full-window MFE (unclipped), exit-fill date minus first full-window peak date, and premature exits followed by a daily high >=10% above exit fill before the fixed horizon. These hindsight grades cannot alone establish exit value. Net executable return and downside must accompany them. An exit that simply sells immediately is not automatically good peak detection.

## Validation and reporting

- Freeze data and code hashes before forward outcome aggregation. Do not download or read forward results to select candidates or thresholds.
- Report separate chronological calendar-year results plus predeclared development/evaluation date blocks from the data protocol; 2026 overlaps earlier local research and must be labeled exploratory.
- Retain delisted pairs and migration interruptions. Unknown trade outcomes retain their ledger denominators and scenario bounds.
- Bootstrap date-clustered paired primary differences using full-calendar 30-day moving blocks, 1,000 replicates and seed 20260912 where enough dates exist. Carry per-date numerators and observation counts, then recompute ratios after resampling. A date with no observation has numerator zero AND count zero; never insert a fictitious zero return/difference into a mean. Discovery has ten slots per nonempty-eligible-universe decision date; no eligible universe means no observation. Primary paired exit means weight positions equally via per-date sums/counts, not daily means equally. Unknown selected outcomes follow the explicit scenario ledgers rather than being silently dropped. Report empty bootstrap replicates, available 30-day time blocks (not a claim of independence), and annual-cohort dependence limitations; do not treat coin trades as IID.
- Two-sided primary tests, if reported, require explicit method and Holm adjustment across the two primary comparisons. Do not manufacture p-values from confidence intervals. Secondary methods, thresholds, costs, horizons and subgroups remain exploratory and fully disclosed.
- Check code on synthetic fixtures for no future data in scores, strictly delayed entry/exit, no perfect-peak fills, missing paths, duplicate/stale bars, stable ties, cooldown, immutable paired entry ledgers, exact unit-capital fees and boundary windows.
- Independently recompute representative source bars, scores, alerts and exit trades before presenting findings. Preserve the raw results if a defect is found; corrected runs require distinct filenames/versioned provenance.
