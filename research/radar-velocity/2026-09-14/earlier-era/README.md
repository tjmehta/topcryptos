# Earlier-era Radar evidence

September 14, 2026 UTC. **The reconstructed 2020–2021 sample does not establish a generally better rank-crossing detector or an easy next-rank forecast.** It does contain an exploratory result worth testing on later data: when more than three confirmed coins cross top 300 together, selecting three by rank velocity beats selecting three by price momentum on mean 14/30-step outcomes. The corresponding seven-step result is fragile, and top-200 evidence is sparse.

This is a replication on an earlier historical period, not a prospective validation. No production algorithm or default changed.

## Data and timing

Use 110 actual saved daily snapshots from November 18, 2020 through March 7, 2021, with original numeric CMC IDs and historical observed top-500 rosters. All 55,000 source rows passed the frozen price/rank/freshness checks; 2,697 arrivals and 2,697 departures across adjacent snapshots are roster transitions, not counts of unique assets or verified delistings. No gaps or prices were filled.

**These are retrospective historical API reconstructions:** 104/110 selected snapshots have response timestamps more than a day after their effective quote time. Replay uses effective quote timestamps, retains response timestamps separately, and does not claim the values were available unrevised at the original signal. A selected snapshot's latest quote is the effective replay time. The last observation is March 7 at 07:47:06 UTC; saved daily steps are therefore not exact 24-hour execution intervals.

The [frozen protocol](protocol.md) reuses the parent study: seven observations of features; fresh crossing into top 300 or top 200 with improving fractional rank and positive price momentum; next-snapshot entry; fixed holds 7/14/30 saved daily steps. Ten equal capital slots, unused slots cash, 0.5% fees each side, missing entries cash and missing exits total loss in the primary result. Also retain 1% fees and zero-gross missing-exit sensitivity. These are overlapping basket means, not compounded wealth or actual exchange fills. Historical Coinbase/Kraken eligibility is not established.

## Primary ten-slot comparisons

“Radar” orders price-confirmed fresh crossers by fractional rank velocity. “Band momentum” selects positive-price-momentum coins inside the same half-boundary-to-boundary rank band, ordered by price momentum. This comparison changes both crossing eligibility and invested capital; the invested-position means are included to expose that distinction.

| Boundary | Hold | Signal dates | Radar basket mean | Band-momentum basket mean | Radar invested-position mean | Band invested-position mean |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| 300 | 7 | 96 | +0.85% | −1.33% | +2.40% | −1.48% |
| 300 | 14 | 89 | +3.50% | +1.46% | +10.01% | +1.64% |
| 300 | 30 | 73 | +11.89% | +13.45% | +37.57% | +15.51% |
| 200 | 7 | 96 | −0.14% | +2.99% | −0.83% | +3.28% |
| 200 | 14 | 89 | +3.47% | +13.89% | +20.71% | +15.33% |
| 200 | 30 | 73 | +11.47% | +56.77% | +71.60% | +64.16% |

Within each cell both methods use the same signal dates. Different horizons have different mature dates, so this table does not establish an optimal holding period. A larger invested-position mean with lower basket mean can reflect a more selective, cash-heavy detector; neither alone establishes superior portfolio design.

**Rank ordering itself is almost untested by the ten-slot version.** Rank velocity and price momentum choose exactly the same confirmed crossers on every top-300 date and all but one top-200 date per horizon. Their primary rank-versus-price differences are zero for top 300 and only +0.040/+0.048/+0.182 percentage points for top 200. One date is not evidence of a reliable ordering advantage. The broader crossing-only control has higher basket means than confirmed Radar in all six cells, though it also changes occupancy and eligibility.

Missing outcomes matter. Top-300 Radar's H30 mean changes from +11.89% to +16.91% under the alternative zero-gross missing-exit assumption; band momentum changes from +13.45% to +28.09%. Top-300 H30 has 6 missing entries and 37 missing exits among 237 selected positions. These are valuation scenarios for unavailable prices, not evidence that disappeared coins returned exactly zero or lost all value. [All costs, phases, nonoverlapping subsets and comparisons](summary.json).

## New rank milestones and price gains

The following table excludes coins that were already at/better than the next milestone at signal. Unknown future paths remain in the pending population. Reaching a milestone and ending inside it are different events; a known reach can coexist with a missing later endpoint.

| Crossing → new milestone | Hold | Pending positions | Observed new reaches | Reach unknown | Inside at exit | Exit rank unknown |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| 300 → 200 | 7 | 230 | 19 | 41 | 10 | 9 |
| 300 → 200 | 14 | 211 | 24 | 56 | 13 | 16 |
| 300 → 200 | 30 | 151 | 14 | 100 | 9 | 36 |
| 200 → 150 | 7 | 142 | 9 | 20 | 6 | 4 |
| 200 → 150 | 14 | 130 | 19 | 27 | 12 | 2 |
| 200 → 150 | 30 | 101 | 30 | 43 | 10 | 4 |

These are overlapping positions and previously examined market history, not today's coin-specific odds. H30 rank-touch unknowns are especially substantial. H7 observed a move back outside the original boundary in 247/346 top-300 Radar positions and 114/161 top-200 positions; additional paths were unknown. Large crossings had already reached the next milestone at signal for 116 and 19 positions respectively, which is why the pending-only correction is necessary. [Milestone audit](milestone-audit.json).

Some sampled 5× price touches occurred: top-300 Radar has 1/1/8 observed touches over H7/H14/H30, with 60/89/156 unknown paths among 346/317/237 selected positions. Top-200 Radar has 0/1/8, with 24/37/64 unknown paths among 161/149/117 positions. These are separate price events relative to entry, not guaranteed returns from crossing rank, unique independent successes, or executable 5× sales.

## Predeclared exploratory top-three ordering

Both methods use the same confirmed-crossing candidates and three equal capital slots, changing only rank-versus-price ordering. The table isolates dates with more than three candidates, when truncation can affect membership. Positive differences favor rank ordering; each difference is a percentage-point difference of three-slot net basket returns, not a compounded gain.

| Boundary | Hold | Contested dates | Different selections | Rank ahead / behind | Mean paired difference | Later-half difference | Difference after removing best paired date |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 300 | 7 | 50 | 30 | 16 / 13 | +2.15 pp | −0.97 pp | −0.03 pp |
| 300 | 14 | 46 | 26 | 12 / 13 | +4.34 pp | +5.22 pp | +2.10 pp |
| 300 | 30 | 34 | 22 | 15 / 6 | +16.67 pp | +17.23 pp | +8.97 pp |
| 200 | 7 | 11 | 5 | 2 / 2 | −0.92 pp | −2.57 pp | −1.85 pp |
| 200 | 14 | 10 | 5 | 3 / 2 | +0.24 pp | −1.03 pp | −2.19 pp |
| 200 | 30 | 7 | 2 | 1 / 1 | +1.81 pp | +3.92 pp | −0.50 pp |

Some different selections produce equal returns, including shared missing-price marks. “Later” uses the parent's chronological split and purge rules; it remains a stability check within reconstructed familiar history.

Top-300 H14/H30 mean advantages remain positive at 1% fees and under the alternative missing-exit mark; at 0.5% fees with zero-gross missing exits they fall to +2.90/+8.91 pp. H14 wins fewer contested dates than it loses, despite the positive mean. H30 is the stronger candidate here, but its overlapping observations, missing paths and historical-vintage limitation remain material. This supports a narrowly specified later-data test, not changing the default or issuing confident live guidance. [Complete exploratory rows and checks](top3.json).

## Reproducibility and verification

- [Adaptation manifest](adaptation-manifest.json): parent protocol/runner/verifier hashes and exact scope substitutions.
- [Frozen normalized source](inputs.json.gz): original rows, effective/response timestamps, raw hashes and inventory hash.
- [Runner](run.py), [ledger](ledger.json.gz), [summary](summary.json): all six cells, four methods and retained outcomes.
- [Independent verifier](verify.py) and [verification](verification.json): passed at 06:05:32 UTC; 2,064 basket-selection checks, 9,440 positions, 84,352 numeric comparisons and 96 phase metrics. The verifier imports no replay functions.
- [Top-three script](run_top3.py): additionally reconstructs top-three membership from raw inputs and verifies Decimal basket arithmetic; 1,032 membership and 4,128 numeric checks passed. Its output records input/code/protocol hashes.

Runner and top-three output refuse overwrites. To rerun, copy the captured directory into a fresh output location and remove only the copied generated outputs; preserve the dated originals. The independent verifier checks arithmetic and implementation, not predictive validity. No upstream data calls were used.
