# Daily breakout validation — 2026-09-13

Previous goal turn: progress. The indicator grid identified promising fixed breakout/H30 policies, but its 28-day signal calendar and initial-start shifts do not validate daily alerts. This protocol is written before the daily results are calculated. Earlier outcomes and candidate strategies have been examined, so this remains retrospective validation.

## Frozen strategy and schedule

Test Momentum, Breakout and VolumeBreakout, exactly as implemented in the frozen indicator-algorithms/2026-09-13 runner, for all 12 views (3/4/5/6/7/10/14/21/30/45/60/90 observations). The holding period is fixed at 30 days because it was the promising candidate in the preceding study. Other holds retain their existing grid evidence; this experiment does not select a new hold after inspecting outcomes. Reuse the existing scorer instead of introducing a different breakout or volume definition.

Generate formations on every calendar day in each annual 2020–2025 cohort. Preserve the hash-verified annual identities, existing 60-complete-day/liquidity eligibility, viewed-window completeness, top-ten tie ordering and ten equal capital slots. No cross-cohort identity or price fallback. All H30 hard deadlines fit within the source annual panel's following-February boundary, including December signals. Annual long-window warmup gaps remain explicit missing formations; do not relabel them as a trading signal.

Signals use close information through date t; enter at open t+2 and exit at open t+32. Full-period daily cohorts overlap and must not be compounded. Reproduce every corresponding H30 original indicator score/selection/outcome/cohort before interpreting results. Store scores, eligibility, selected identities, unique identity/signal/H outcomes, executable prices, realized returns, future +20% reach labels, missing-path flags, complete-path excursions, all dates and hashes.

Costs: 50bps per side with fixed 100bps stress; retain missing entry as cash and missing exit under 0%-gross and total-loss marks. Total-loss marking is the primary sequential scenario. Highs and lows are diagnostic labels, never fills. Preserve all unused ten-slot capital as cash.

## Daily capital policy and start sensitivity

Evaluate 2023–2025 with one unit of capital and no leverage or overlapping batches. A position batch occupies capital until its fixed hard deadline. A new signal may be acted on only when its date is on/after that deadline; signal is after close and old exit is at open. Carry positions across year boundaries using their original annual identities; the next free signal uses that day's annual universe. No annual reset or forced liquidation.

Primary scheduler `responsive`: an empty selection makes no order and remains free to inspect the next daily signal. A selected batch whose entries all fail occupies capital only until the scheduled entry day, when that failure is known; it may inspect another signal that evening. Partially filled batches keep all ten slots through H30. This avoids pretending an absent alert requires 30 days of cash. Record empty and missing-entry decisions explicitly.

Diagnostic scheduler `scheduled`: even an empty selection reserves the full signal+32-day interval, matching the preceding sampled-calendar experiment's batch convention. Keep this as a fixed comparison; do not choose the scheduler from later returns.

For each view/method/scheduler, simulate all 32 initial dates from January 1 through February 1, 2023 inclusive, covering one full signal-to-signal H30 cycle. Do not shift only one initial date and call it a full calendar sensitivity. These are complete daily calendars, although explicit annual warmup gaps may align long-view paths. Summarize every path, all four costs/missing marks, selected/filled positions, cash decisions, final wealth, annual exit-cohort returns and exit-checkpoint drawdown. A best-cohort-removal diagnostic holds that batch in cash and preserves every subsequent scheduled decision. It is not a refitted policy.

Compare paired methods at each exact initial date and same scheduler; also report daily cohort-level return differences and mover counts. Prefer evidence that survives costs, missing prices, yearly regimes and starting phases. No maximum of these daily results becomes a retrospectively selected live policy. The daily strategy is batch allocation, not independent per-coin capital recycling or an intraday bot.

## Exit and forecast integration

The separate exits protocol evaluates unchanged FixedH, SMAATRBracket and ResistanceSMAATR outcomes on these exact selected daily entries. It preserves fixed deadlines and holds early proceeds as cash through H30. This isolates sale decisions from changes to entry timing; it does not automatically recycle early proceeds. Forecast labels and target prices must retain that exact target definition, signal source date, actual entry date and horizon. Earlier probability calibration on Momentum/TrendQuality entries does not establish calibration for breakout-selected daily entries.

## Verification and limits

Hash-check the frozen source panel, scoring runner, horizon helpers and indicator ledger. Verify exact parity wherever daily dates overlap the previous indicator grid. Independently reconstruct daily selections, representative raw scores, all saved prices/cost marks and capital schedules. Test no future-score access, executable entry/exit dates, no identity fallback, zero-selection response, missing-entry knowledge timing, capital nonoverlap, deterministic phase schedules and future-outcome invariance of selection.

Write dated immutable ledgers and reproducible runners. Preserve initial artifacts if a correction is needed. All results are research on a preselected liquid venue universe, including existing fiat-pair, annual membership and identity limitations. They do not establish current CMC market-cap ranks, hourly fills, one-year forecasts or commercially deployable performance. No production change follows automatically from this run.
