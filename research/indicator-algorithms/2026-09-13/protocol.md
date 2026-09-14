# Indicator algorithm and holding comparison — 2026-09-13

Previous goal turn: progress; completed and independently verified calibration and conditional exits. This protocol is written before this indicator grid is evaluated. Earlier constituent price outcomes and earlier algorithm studies have already been examined: this is retrospective chronological validation, not an untouched holdout.

## Frozen candidates and inputs

Reuse the hash-verified 2020–2025 annual Binance panel and exact holding-horizons loader, eligibility, scoring baseline and outcome grader. Preserve cohort identity, known gaps, annual membership and price units. Shared eligibility is the existing 60-complete-day and lagged-volume gate, plus a complete viewed window. Do not filter on future prices or subsequent membership. View N means N observations and N−1 elapsed close-return days, matching the existing study.

Views: 3/4/5/6/7/10/14/21/30/45/60/90. Signals: January 1 + 28k days, k=0..11, annually. At most ten equal capital slots; unused slots remain cash. Sort decreasing score, then immutable identity. Positive-signal research methods:

1. Momentum: unchanged positive log endpoint return.
2. TrendQuality: unchanged positive log-price slope times R², also requiring positive endpoint return.
3. ATRNormalizedMomentum: positive Momentum divided by TA-Lib ATR14/last close; nonpositive ATR suppresses this score.
4. EMAConfirmedMomentum: unchanged positive Momentum, qualifying only when fast EMA > slow EMA. Slow period is view N; fast period is max(2, nearest integer N/3), implemented max(2,(N+1)//3).
5. Breakout: positive log(last close / highest high of the preceding N−1 bars), excluding the signal bar from the high reference.
6. VolumeBreakout: identical Breakout score, additionally requiring signal quote volume ≥1.5 times the preceding 20-bar median quote volume.

For each score, feed TA-Lib exactly max(60,N) complete trailing bars through the signal. Indicators are explicitly finite-window seeded: ATR uses Wilder smoothing after its seed; EMA uses its SMA seed. The slow EMA for N≥60 is its initial SMA at the last bar. Do not describe these as converged all-history EMAs. The fixed slice is part of the algorithm definition, not a tuned warmup. No indicator, threshold, parameter or seed search follows the results. This rule preserves shared/native eligibility and baseline parity.

Primary indicator references: [TA-Lib ATR](https://ta-lib.github.io/ta-lib-python/func_groups/volatility_indicators.html), [TA-Lib EMA](https://ta-lib.github.io/ta-lib-python/func_groups/overlap_studies.html). Their documented initialization dependence motivates explicit seeds. This study's ATR is not the earlier simple-mean ATR used for sell-zone geometry.

## Fills, holding grid and reporting

Enter at open signal+2 days, exit at entry+H, H7/14/30/60/90. H365 uses only k0/1/2, with shorter holds additionally summarized on those exact entry dates. Preserve missing entry as cash; preserve missing exits under 0%-gross and total-loss marks, with modeled 50bps each side. Add 100bps-per-side cost stress using the same entry/exit prices. No future high is a fill. Empty selections still consume their scheduled holding interval in the later sequential policy, keeping the declared decision schedule.

Save every score and selection, unique identity/signal/H outcomes, dates, costs, hashes and package versions. Reproduce all native Momentum, TrendQuality and Universe source cohorts exactly before comparing new candidates. Report all views/holds/methods for all years, 2020–2022, 2023–2025, each year and common-year-start periods. Include paired mean and median differences versus Momentum, winning/losing dates, removal of the best paired date, missing-price stress, cost stress, used/cash slots, observed +20% high hits, realized +20% net-return hits, known losing trades and complete-path excursions. Missing paths are unknown, not confirmed failed alerts. No compounded-return claim from overlapping cohort averages.

## Causal interval selection

A separate selector consumes the frozen grid. At January 1 of 2023/2024/2025, select one fixed method/hold per viewed interval using only past signals whose signal+2+90-day exit is strictly before that cutoff. All candidates receive the same training signal calendar, beginning in 2020; no candidate gets more recent training labels because it has a shorter hold. H365 is excluded from this selector because its entry schedule differs.

Replay each candidate with one unit of capital, no overlapping positions, no leverage, and cash between its exit and next scheduled signal. Rank terminal wealth under missing-exit total-loss marking at 50bps per side, over the same calendar start/end. Require at least six executed cohorts. Include cash with wealth 1; nonpositive gains choose cash. Deterministic ties use listed method order then shorter holding. Save all candidate training counts, wealth, exit dates and annual decisions.

Evaluate 2023–2025 as one continuous capital path. Choices freeze at each January 1; an existing position continues to its original deadline, and the new annual choice applies at the next free scheduled signal. No year-end liquidation or capital reset. Report both missing-price scenarios and 100bps stress with the exact same choices, full sequential paths, exit-checkpoint drawdown (not intratrade drawdown), annual exits, and all fixed method/hold baselines plus cash. A maximum in the later results is descriptive, never substituted into an earlier choice. No automatic production mapping is installed from this run alone.

## Verification

Hash-check frozen inputs and source code. Independently test TA-Lib ATR/EMA against explicit recurrences and prefix/future-data invariance. Test breakout reference excludes the signal high, volume gate boundary, cash slots, no identity fallback and delayed executable fills. Check baseline ledger parity, all saved score ordering and aggregate denominators. Independently replay chronological selector maturity, capital nonoverlap, frozen annual choices and wealth arithmetic. Refuse output overwrite; preserve initial artifacts if a correction is needed.

The annual universe is a liquid venue sample, including its existing fiat-pair and identity limitations. It is not an exact Classic market-cap-rank backtest and omits new within-year listings. Hourly predictions and current CMC scoring require their own evidence. These results evaluate candidate gains and hold timing; target-level probability and sell-zone results remain separately defined in their dated studies.
