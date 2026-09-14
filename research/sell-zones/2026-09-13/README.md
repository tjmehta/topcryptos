# Level-based exit evidence — 2026-09-13

Final run: 2026-09-13T19:54:24.198078+00:00. **These predeclared level exits do not provide a general improvement in gains.** Across 192 later-period method/view/hold/exit comparisons, only 11 beat their paired fixed hold; none beat it in each of 2023, 2024 and 2025. No automatic sell recommendation or calibrated price forecast is justified by this study.

Both exits usually sold sooner, but missed gains that occurred later. The strongest apparent positive, 90-day TrendQuality view / 90-day hard hold with resistance target, gained 2.44 percentage points relative to fixed overall, while losing 9.26 points in 2023. That is phase-sensitive evidence, not a stable winner.

## Scope and setup

6,864 paired cohorts from signal dates 2020-01-01 through 2025-11-05; 7,540 distinct identity/signal/holding combinations and three policies. All 12 daily views: 3,4,5,6,7,10,14,21,30,45,60,90. Hard holding periods 14,30,60,90. All outputs retain both Momentum and TrendQuality from the frozen positive-only holding-horizons study. These are not the signed production modes or contemporary CMC rankings. Annual preselected Binance universe and repeated, overlapping cohorts limit inference.

Entry is the actual open two days after the signal. SMAATRBracket freezes signal-time SMA of 14 true ranges, takes profit at entry+3 ATR and stops at max(0,entry−2 ATR). ResistanceSMAATR caps the target at the highest high of the preceding 20 complete daily bars only when that level is above executed entry. A threshold must be confirmed by a daily close; fill is the actual open two days afterward, at or before hard exit. Consequently a stop can fill after a rebound and a target can fill after a fall. High/low touches are separately saved evaluation labels, never fills. These levels become entry-scaled prices at execution, not ex ante calibrated predictions.

Fees are 50 bps per side using exact purchased units. Ten original equal slots remain fixed, including cash when fewer than ten candidates exist. Missing execution/order has zero-gross net-of-cost and −100% sensitivities; no survivor-only filtering.

## Paired later-period results

Each count is the number of viewed intervals out of 12 where that policy beat FixedH on mean net return, using identical entries. All 192 results and yearly slices are in summary.json.

| Method | Hard hold | SMAATR wins / 12 | Resistance wins / 12 |
|---|---:|---:|---:|
| Momentum | 14 days | 1 | 1 |
| Momentum | 30 days | 0 | 0 |
| Momentum | 60 days | 0 | 0 |
| Momentum | 90 days | 0 | 2 |
| TrendQuality | 14 days | 1 | 1 |
| TrendQuality | 30 days | 0 | 1 |
| TrendQuality | 60 days | 0 | 0 |
| TrendQuality | 90 days | 2 | 2 |

Seven-day Momentum view, 2023–2025 (36 signal cohorts each):

| Hard hold | Fixed mean net | ATR mean net | Resistance mean net | ATR / resistance mean duration |
|---|---:|---:|---:|---:|
| 14 days | -0.02% | -1.50% | -1.25% | 11.5 / 10.4 days |
| 30 days | -1.15% | -2.39% | -1.81% | 18.1 / 15.3 days |
| 60 days | 3.78% | -2.17% | -1.58% | 23.2 / 18.7 days |
| 90 days | 3.88% | -1.76% | -1.40% | 25.0 / 19.7 days |

## Verification and reproducibility

- Nine synthetic tests passed: delayed target fill, delayed stop rebound, high-only touch, missing trigger ordering, missing entry/exit treatment, causal indicators, resistance target cap/fallback, hard-exit boundary, unavailable-resistance labels.
- 53,584 fixed-position comparisons exactly match the original ledger in both missing-data scenarios.
- 366 independently scanned known-policy sample outcomes match scheduled date and exact fee-adjusted return.
- Frozen selection ledger is checked against its existing manifest before use; original price data use the existing hash-enforcing loader.
- Across distinct cached entry/holding outcomes: fixed has 7,503 known exits and 37 missing exits; each bracket has 7,529 known exits and 11 unknown trigger-order outcomes.
- Independent review identified missing input-manifest verification and hypothetical labels for unavailable resistance. Both were fixed; initial source/results are retained in initial/. The rerun produced an identical ledger hash, confirming no empirical changes.

Run synthetic checks without modifying artifacts:

```sh
python3 -m unittest discover -s research/sell-zones/2026-09-13 -p test_run.py
```

`run.py` refuses to overwrite saved results. Reproduction requires a new empty output directory at the same research depth containing runner, protocol and tests, preserving access to frozen source data. Source SHA-256 hashes, input provenance, run UTC and ledger hash are in `summary.json`.

## Raw record schema

`ledger.json.gz` contains `cohorts` and `outcomes`. Each cohort preserves year/anchor/signal/view/holding/method/denominator, immutable outcome references, and net returns for each policy. Each outcome key is a JSON array `[identity, signal, holding]`; each value has all three policies. Outcomes retain signal level date, entry and hard-exit dates, entry price, ATR, prior resistance, absolute and relative target/stop, trigger and fill dates, actual fill price/duration, status, trigger reason and both missing-data returns. `target_reach` / `stop_reach` are true for an observed full-horizon high/low crossing, false for complete no-hit paths, and null when no hit is observed but the path is incomplete or the level is unavailable. `full_horizon_path_complete` describes label coverage. FixedH has no level-reachability labels.

No production files changed. All empirical cells remain exploratory; no strategy was selected on an untouched validation set.

## Additional independent level reconstruction

2026-09-13T19:58:14.757725+00:00: Root rebuilt the SMA of 14 true ranges and maximum of 20 strictly prior daily highs directly from the normalized raw CSV, independently of the exit engine helpers. All 1,885 distinct identity/signal level sets matched.
