# Native algorithm exit evidence — 2026-09-14 UTC

Daily and Hourly can now show holding-period comparisons for their actual Classic, Momentum, Trend quality, Cumulative and Hybrid selections. The artifact contains no automatic exit recommendation. A user-selected holding duration can support a dated plan; it must not be described as a validated best exit or an individual coin's forecast.

This addresses a product mismatch: earlier candle-based exit work used a separate Binance market universe, while the user's core expectation was exit guidance for **our existing algorithms**. The user trades on Coinbase and Kraken. Binance research does not validate native CMC selections or a Coinbase/Kraken-filtered basket. Market coverage and strategy evidence must stay explicit.

## What was exported and verified

- Source: the frozen, independently verified [exact native CMC replay](../../cumulative/2026-09-13/cmc-protocol.md), completed September 13 at 22:16 UTC. No new market data or dependency is used.
- Daily source coverage: July 4–September 12, 2026, 71 observations. Hourly coverage: six separate blocks between August 8 and September 13, with 6–29 observations each.
- All 18 mode/interval combinations and all five methods are represented. Full holding grids remain visible, including sparse and unavailable horizons.
- 225 method/holding comparisons use matching signal dates, entry dates, and per-method selected IDs across horizons. Each supported interval uses at least six common formation dates. Sparse counts are retained but their unmatched returns are not substituted into the comparison.
- JavaScript independently recalculated 204,380 position/basket fee values from gross outcomes. A separate Python Decimal audit verified all 225 rows, 900 return means, date matching, availability statuses, source hashes, and denominator counts. [Verification passed](verification.json).
- The app artifact is 71,436 bytes: [native-exit-evidence.json](../../../modules/data/native-exit-evidence.json). Its typed selector is [nativeExitEvidence.ts](../../../modules/nativeExitEvidence.ts).

## What the numbers mean

These are average returns of ten equal slots per signal, with entry at the next saved snapshot and exit H saved observations later. They are not compounded portfolio returns. Missing entries stay cash. The primary return assumes a total loss where an exit price is absent; an alternative zero-gross mark is exposed separately. Both include 0.5% or 1% costs on each side. These assumed costs are not a claim about the user's exchange fee tier or executable liquidity.

Known losses use only positions with known entry and exit prices, after 0.5% costs per side. Always display the known-outcome denominator and missing-exit count. Treating absent exit prices as zero-gross versus total loss can materially alter the conclusion.

For example, Classic on a 7-day view has eight matched signal dates. Its 1/7/14-day mean basket returns under the total-loss convention are **−2.83% / +8.15% / +6.30%**, after 0.5% costs per side. This does not validate selling after seven days: the same small historical sample was used to observe all alternatives. At a 10-day view, Classic's corresponding means are **−0.22% / −1.73% / −1.17%** over seven matching dates. Profitable and losing cells both exist; a missing validated recommendation is not a failed test run.

For a 6-hour view, Classic's 1/3/6/12-hour means are **−0.50% / −1.25% / −2.17% / −2.01%**, after 0.5% costs and total-loss marks, on 21 matching dates. These overlapping hourly signals are not 21 independent market regimes.

## Available comparisons

| Mode | Viewed interval | Matched dates | Comparable holding windows |
| --- | --- | ---: | --- |
| Daily | 3, 4, 5 days | 6 each | 1, 7, 14, 30 days |
| Daily | 6, 7 days | 8 each | 1, 7, 14 days |
| Daily | 10, 14 days | 7 each | 1, 7, 14 days |
| Daily | 21 days | 6 | 1, 7, 14 days |
| Daily | 30 days | 6 | 1 day only; no alternative comparison |
| Daily | 45, 60, 90 days | 0 | Insufficient common support |
| Hourly | 3 hours | 30 | 1, 3, 6, 12 hours |
| Hourly | 6 hours | 21 | 1, 3, 6, 12 hours |
| Hourly | 9 hours | 12 | 1, 3, 6, 12 hours |
| Hourly | 12 hours | 21 | 1, 3, 6 hours |
| Hourly | 18 hours | 12 | 1, 3 hours |
| Hourly | 24 hours | 0 | Insufficient common support |

The six-date threshold controls which rows can be compared on equal dates. It is not a validation threshold. Source availability determines the longest admitted hold, not its return. Longer holds can only be assessed after collecting longer continuous history; 90/365-day exits have no mature evidence in this source.

## Product contract and learnings

- Keep `recommendation: null` and `status: no-validated-exit`. Do not select the highest mean and label it optimal.
- A user can choose a duration and enter an actual or hypothetical entry date to calculate a planned exit date. An empty initial selection avoids implying a research-selected default.
- The selected viewing interval defines the ranking's lookback; the chosen holding window begins after entry. They are separate controls and neither implies the other.
- CMC prices describe the original broad snapshot universe. Applying Coinbase/Kraken availability filters changes the basket and has not been backtested here.
- No targets, stops, fill probabilities or coin-level exit predictions are derived from these basket averages.
- Explain adverse results concretely: a strategy may lose money, fail to beat the baseline, or have inadequate data. Computational failure is a different condition. This export and its arithmetic verification succeeded.

## Reproduce

From the repository root:

```sh
node research/native-exits/2026-09-14/export.cjs
python3 research/native-exits/2026-09-14/verify.py
```

The exporter checks the current scorer against the pinned research hash and checks the frozen ledger hash. It deterministically rewrites only its own generated artifact. A changed scorer requires a new exact replay before representing this evidence as current. Protocol and exporter hashes are included in the artifact; the independent verification report also pins the artifact and verifier hashes.
