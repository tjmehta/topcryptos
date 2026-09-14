# Exposure-matched Momentum comparison — 2026-09-13 UTC

Breakout retains a modest return advantage in several views after matching the number of selected coins. It does not generally capture more big movers than taking the same number of top Momentum coins. The volume filter frequently weakens the capital result. These are distinct objectives, so neither hit counts nor mean gains alone establish a universal winner.

This post-result diagnostic uses the first K already-saved Momentum picks on each candidate date, where K is that Breakout or VolumeBreakout selection count. Both retain ten equal slots and identical unused slots. The capital counterfactual also uses the candidate’s exact frozen schedule. It is not a standalone Momentum strategy and does not choose a new phase or holding period.

## Later-period comparison

2023–2025 daily formations, H30, primary missing-exit total-loss mark, 50bps per side. Daily advantage is candidate minus matched Momentum in percentage points. Capital wins count the 32 responsive starting phases; phases share outcomes.

| View observations | Breakout daily advantage | Breakout capital wins | VolumeBreakout daily advantage | VolumeBreakout capital wins |
|---:|---:|---:|---:|---:|
| 3 | +0.323pp | 19/32 | +0.216pp | 18/32 |
| 4 | +0.023pp | 21/32 | +0.164pp | 21/32 |
| 5 | +0.134pp | 23/32 | +0.030pp | 5/32 |
| 6 | +0.152pp | 15/32 | +0.047pp | 5/32 |
| 7 | +0.123pp | 26/32 | +0.024pp | 8/32 |
| 10 | +0.045pp | 31/32 | +0.035pp | 8/32 |
| 14 | +0.074pp | 18/32 | +0.232pp | 11/32 |
| 21 | +0.196pp | 8/32 | +0.306pp | 5/32 |
| 30 | +0.080pp | 25/32 | +0.133pp | 16/32 |
| 45 | -0.002pp | 12/32 | +0.028pp | 13/32 |
| 60 | -0.033pp | 10/32 | +0.011pp | 7/32 |
| 90 | +0.249pp | 32/32 | +0.248pp | 0/32 |

At the seven-observation view, Breakout daily net mean is 1.109% versus matched Momentum’s 0.986%, a +0.123pp difference. Both select 3,269 positions across 1,096 daily formations. Breakout has fewer observed +20% high reaches (1,493 versus 1,606), fewer realized +20% net-return hits (668 versus 719), and fewer known losing trades (1,828 versus 1,897). Missing paths and exits remain explicit; a future high is never a sale fill. The gain improvement therefore comes with a mover-capture tradeoff.

On the same seven-view responsive schedule, Breakout beats matched Momentum in 26/32 phases at both cost settings. Median terminal wealth is 1.591 versus 1.158; the median paired wealth difference is +0.343 (difference of medians is a different statistic). Annual paired returns are mixed: 2023 favors Breakout in 13/32 phases, 2024 in 28/32, and 2025 in 32/32. This comparison measures relative performance, including years when both policies lose money. VolumeBreakout instead wins 8/32 phases, with median wealth 0.943 versus its matched benchmark’s 1.159.

Across all views, 22/24 candidate daily mean differences are positive in 2023–2025. Only 10/24 responsive capital comparisons have positive median paired wealth differences. Overlapping daily averages and a realizable capital schedule answer different questions; do not compound the daily averages.

## Reproduction and checks

Run `.cache/trading-libs-venv/bin/python research/daily-breakouts/2026-09-13/exposure.py` in a clean output directory. The runner refuses to overwrite existing results. The protocol was written before this diagnostic ran.

- 52,272 paired daily cohorts, 216 daily summary rows, 1,536 paired capital paths and 48 capital summary rows.
- All 52,272 candidate cohort returns and 1,536 complete candidate path/scenario objects exactly reproduce the frozen studies.
- All matched selection counts equal candidate counts; existing Momentum order is preserved. No new scores or price data.
- Zero counterfactual capital-overlap conflicts. Different filled counts remain recorded rather than dropping affected observations.
- A separate standard-library inline calculation checked all 12,288 role/scenario terminal wealth values and input hashes successfully.
- `exposure-ledger.json.gz` retains full paired outcome-key lists, source schedules, metrics and checkpoints. `exposure-summary.json` retains source hashes and every view/year/scenario summary.

Ledger SHA-256: `c94a546d12a2d335682c4ff3204507fe3b95cb18f236ce4629a80f2254ab9173`.

No production algorithm, trading action or automatic mapping changed. This is a retrospective comparison on the preselected annual venue universe, with dependent daily/phase observations; it does not establish fresh statistical validation, current CMC ranking performance or a future return guarantee.
