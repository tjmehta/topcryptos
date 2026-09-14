# Interval candidates from the tested grid — 2026-09-13

These are the highest terminal-wealth fixed policies in the examined 2023–2025 grid, identified after seeing those outcomes. They are descriptive candidates, not choices a live system could have known in 2023. All prices, formation rules and limits are in [README.md](README.md). The annual chooser is evaluated separately.

Each multiple starts with one unit of capital; 1.00× is cash. Primary results use 50bps per side and missing-exit total loss. The stress columns show the minimum across starts on January 1, January 29 and February 26, 2023. The last stress also removes the best executed cohort at the original fees, without changing subsequent scheduling. Cost and best-cohort stresses are separate, not combined.

| Viewed observations | Descriptive fixed candidate | Hold after entry | Original wealth | Minimum wealth at 100bps | Minimum without best cohort | Annual chooser wealth |
|---|---|---:|---:|---:|---:|---:|
| 3 | EMAConfirmedMomentum | 30 days | 3.026× | 0.914× | 0.692× | 0.551× |
| 4 | TrendQuality | 30 days | 3.181× | 1.069× | 0.791× | 1.326× |
| 5 | Breakout | 30 days | 3.514× | 2.443× | 1.524× | 0.724× |
| 6 | Breakout | 30 days | 3.253× | 2.670× | 1.560× | 0.987× |
| 7 | Breakout | 30 days | 3.061× | 2.525× | 1.591× | 0.570× |
| 10 | Breakout | 30 days | 2.835× | 2.349× | 1.498× | 0.539× |
| 14 | Breakout | 30 days | 2.633× | 2.286× | 1.461× | 0.636× |
| 21 | VolumeBreakout | 30 days | 2.397× | 2.315× | 1.480× | 0.543× |
| 30 | VolumeBreakout | 30 days | 1.615× | 1.584× | 0.998× | 0.791× |
| 45 | ATRNormalizedMomentum | 30 days | 1.598× | 0.738× | 0.641× | 0.544× |
| 60 | VolumeBreakout | 30 days | 1.309× | 1.290× | 0.983× | 0.883× |
| 90 | VolumeBreakout | 14 days | 1.189× | 1.157× | 0.938× | 0.292× |

The recurring 30-day deadline is a candidate produced by this particular grid and schedule, not a proven universal multiplier of the viewed interval. More than one method can be profitable; the table selects by one declared descriptive metric and retains all other results in the JSON artifacts. It says nothing about the best hourly or intraday rule.

The start-date sensitivity shifts initial availability only. Paths can converge after annual gaps in the original 28-day signal calendar. It does not establish robustness to daily alert timing or to shifting every subsequent signal date. Those execution schedules remain a necessary next evaluation before adopting a live rule.

For early mover discovery, read selection counts and realized/observed hit counts alongside capital returns: sparse breakout filters can improve returns while finding fewer total movers. No market-cap-rank forecast is supported by this venue-price panel.
