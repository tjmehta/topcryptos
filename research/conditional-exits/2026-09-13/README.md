# Conditional exit algorithms — 2026-09-13

The tested learned exit selectors generally reduced gains against holding the same coins to the same fixed deadline. Geometry-only Ridge improved 12/96 pooled view/method/holding comparisons; adding momentum, volatility, volume and BTC trend improved 4/96. Under total-loss marking for missing exits, each improved 17/96. The causal same-holding historical-mean selector chose fixed holding throughout. These results do not support automatic adoption of either learned selector.

## Setup and dates

The [protocol](protocol.md) was frozen before fitting, after inspecting earlier studies. Models use standardized scikit-learn Ridge with fixed alpha 10 to predict the realized net-return advantage of each existing level exit over FixedH. At entry, choose the largest positive predicted advantage, otherwise FixedH. A second baseline uses mature historical mean advantage for the exact holding period. Training expands monthly and requires full hard-horizon outcomes strictly before the forecast month. No parameter search was performed.

The unchanged source uses positive-signal Binance cohorts, 12 daily views, two ranking methods, and 14/30/60/90-day holding periods. Signal-close information precedes entry at open two days later; close-confirmed exit triggers also fill two days later, capped at the hard deadline. Costs are 50bps per side. Sold proceeds remain cash through the deadline. Overlapping cohort returns are not compounded into portfolio wealth.

There are 7,540 unique identity/signal/horizon events, 3,900 evaluation events and 3,432 evaluation cohorts in 2023–2025. Events repeat across horizons and selected cohorts; they are not independent samples. Training excludes unknown outcome pairs, while evaluation preserves original slots and both missing-price scenarios. Known-pair training may therefore be selection-biased. Raw return targets retain extreme observations rather than clipping them.

Initial run completed at 2026-09-13T20:04:36.395535 UTC. Independent review found that BTC features checked only return endpoints while the protocol required complete consecutive history. The runner now requires all 22 BTC bars and tests missing interior history. All actual histories were already complete, so the corrected run produced a byte-identical ledger. Initial runner, protocol and results are preserved in [initial](initial/).

Corrected run: **2026-09-13T20:08:14.778804+00:00 to 2026-09-13T20:08:30.057417+00:00**. Exact source, panel, runner, protocol and output hashes are in [summary.json](summary.json).

## Findings

| Selector | Positive mean advantage, 96 pooled comparisons | Positive under missing-exit total loss | Wins in each of three years |
|---|---:|---:|---:|
| Geometry Ridge | 12 | 17 | 0 |
| Geometry + market-state Ridge | 4 | 17 | 1 |
| Same-holding historical mean | 0 | 0 | 0; identical to FixedH |

The single state-model comparison positive in each year is the 14-day view, TrendQuality, 90-day hold: +0.537 percentage points over FixedH, or +0.276 points after removing its best paired date. It wins six of 36 paired dates, loses three, and ties 27. Its 2023 advantage disappears when that year's best date is removed; its 2025 mean return remains negative at −16.43%. It was identified after examining all results; it is a narrow research candidate, not an independently confirmed winner.

For seven-day-view Momentum, geometry selection changes mean returns relative to FixedH by approximately −0.388, −0.676, −0.141 and −0.177 percentage points for H14/30/60/90. The state model changes them by −1.117, −0.665, −1.965 and −0.637 points. A more informed exit model did not reliably preserve the large-mover upside in these tests.

## Verification and reproduction

An independent reviewer reconstructed all **15,080 candidate state-feature vectors** directly from the panel; all matched. All required BTC histories were complete. Fallback, deterministic ties, maturity boundary, future-observation invariance and missing-interior-history checks pass. The independent [verifier](verify.py) replays saved choices and aggregate accounting; its machine-readable results are in [verification.json](verification.json).

```sh
.cache/trading-libs-venv/bin/python research/conditional-exits/2026-09-13/run.py --selftest
.cache/trading-libs-venv/bin/python research/conditional-exits/2026-09-13/verify.py
```

The runner refuses to overwrite completed results. Preserve the dated artifacts before running a new experiment. Saved [ledger.json.gz](ledger.json.gz) includes feature vectors, mature fit metadata and coefficients, entry-time choices, and source cohorts. The paired exit outcomes remain in the unchanged source sell-zone ledger.

This study concerns daily venue-price experiments. It does not validate signed current-product rankings, hourly signals, market-cap rank forecasts, one-year holds or live execution. No production selector was installed.
