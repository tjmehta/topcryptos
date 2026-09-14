# Interval algorithms: implementation replay, 2026-09-13

**The changes are backtested, but no universal ranking winner or reliable automatic sell timeline was established.** This study executes the frozen old scorer and the actual new Classic, Momentum and TrendQuality implementations against cached CMC snapshots. The alternative modes recalculate using the viewed window; they do not select whichever method happened to win a historical cell.

Run: **2026-09-13T07:52:58.775Z to 2026-09-13T07:55:39.059Z UTC**. There are **5,984 cohort records**, 2,080 signal/method/comparison records and 544 aggregate groups. These are repeated configurations and overlapping coin-date outcomes, not independent market observations.

## What was actually changed and compared

- Native replay compares the old caller/window/deduplication and Classic scorer with the new caller/window and each current scorer. It measures the combined implementation change.
- Common-input replay gives all four scorers the same exact window and the intersection of scoreable signal-time IDs, then reruns their percentile pools. It helps separate formula changes from old hourly window and eligibility bugs.
- New Classic repairs timestamp ordering/filtering, duplicate handling, market-cap-rank direction and numeric noise while keeping the 70/20/10 blend. Momentum ranks signed endpoint return. TrendQuality ranks signed OLS log-price slope multiplied by R². Actual elapsed quote times enter the implementation.
- All methods rank signed scores and take up to ten names. These are not the positive-only Binance candidates that left negative-signal slots in cash in earlier research. The selected window counts UTC buckets, including the current partial bucket.
- Entry is the following saved snapshot; exits are scheduled saved snapshots after the chosen hold. A sampled future gain is an opportunity label; no simulated sale occurs at a future high. Every selected ID stays in the denominator.

## Daily discovery and realized endpoint returns

The table evaluates a seven-day hold after next-day entry. Each cell is **sampled +20% hits / ten capital slots per cohort; mean net endpoint return** with 50bps fees per side and missing exits marked at zero gross return. A hit can finish negative. Missing-price marks are conventions, and different view rows use different dates; do not choose a winning view from this table.

| Viewed buckets | Signal dates | Before Classic | Corrected Classic | Momentum | Trend quality |
|---|---:|---:|---:|---:|---:|
| 3 | 9 | 26/90; +6.31% | 23/90; +4.44% | 28/90; +4.60% | 31/90; +6.63% |
| 4 | 9 | 26/90; +4.89% | 24/90; +3.84% | 30/90; +3.51% | 29/90; +4.43% |
| 5 | 9 | 25/90; +5.01% | 20/90; +4.22% | 28/90; -0.73% | 26/90; -0.11% |
| 6 | 8 | 19/80; +1.60% | 23/80; +7.11% | 30/80; +5.55% | 30/80; +7.83% |
| 7 | 8 | 21/80; +14.08% | 22/80; +11.86% | 32/80; +17.66% | 27/80; +7.53% |
| 10 | 8 | 24/80; +3.04% | 22/80; +1.66% | 27/80; -1.97% | 23/80; -3.61% |
| 14 | 7 | 18/70; -1.41% | 20/70; +3.40% | 19/70; -1.92% | 18/70; -1.22% |
| 21 | 6 | 16/60; +2.57% | 16/60; +6.43% | 21/60; +2.37% | 18/60; +6.44% |
| 30 | 5 | 13/50; -1.28% | 11/50; +4.35% | 14/50; -6.30% | 12/50; -2.64% |
| 45 | 3 | 8/30; +0.67% | 10/30; +6.50% | 12/30; +3.57% | 12/30; +6.42% |
| 60 | 1 | 4/10; +11.92% | 6/10; +19.14% | 2/10; -2.40% | 3/10; +4.54% |
| 90 | 0 | Unsupported | Unsupported | Unsupported | Unsupported |

For the default ten-bucket view, the common-input seven-day comparison is:

| Method | Hits / slots | Mean net | Mean net, missing exits total loss | Known-return median |
|---|---:|---:|---:|---:|
| Before Classic | 23/80 | +1.47% | +1.47% | -3.18% |
| Corrected Classic | 22/80 | +1.66% | +0.42% | -4.22% |
| Momentum | 27/80 | -1.97% | -1.97% | -3.48% |
| Trend quality | 23/80 | -3.61% | -3.61% | -3.70% |

**The default-view example illustrates the objective tradeoff:** Momentum can find more sampled +20% movers while realizing a worse fixed-hold average. Correctness fixes likewise do not imply that every historical cell improves. Retain discovery, return capture and downside as separate objectives.

## Holding horizons are still separate from viewed history

Default ten-bucket native results below illustrate the measured forward curve. Each cell is mean net endpoint return with the same 50bps-per-side/zero-gross missing-exit convention. Longer holds have fewer mature signal dates, so rows are not matched-cohort evidence for choosing a sale date.

| Hold after entry | Signal dates | Before Classic | Corrected Classic | Momentum | Trend quality |
|---|---:|---:|---:|---:|---:|
| 1 days | 9 | +0.64% | -0.28% | -0.76% | -0.92% |
| 7 days | 8 | +3.04% | +1.66% | -1.97% | -3.61% |
| 14 days | 7 | +1.22% | +3.07% | +0.85% | +0.29% |
| 30 days | 5 | +6.86% | +4.23% | +7.47% | +2.86% |
| 60 days | 0 | Unsupported | Unsupported | Unsupported | Unsupported |
| 90 days | 0 | Unsupported | Unsupported | Unsupported | Unsupported |
| 365 days | 0 | Unsupported | Unsupported | Unsupported | Unsupported |

## Available daily signal dates by viewed interval and hold

Zero means the required complete formation and mature exit are unavailable. No outcome is filled in from another block or from Binance data. The 2026 daily block contains 69 observations, 2026-07-04 through 2026-09-10.

| Viewed buckets | Hold 1d | 7d | 14d | 30d | 60d | 90d | 365d |
|---|---:|---:|---:|---:|---:|---:|---:|
| 3 | 10 | 9 | 8 | 6 | 1 | 0 | 0 |
| 4 | 10 | 9 | 8 | 5 | 1 | 0 | 0 |
| 5 | 9 | 9 | 8 | 5 | 1 | 0 | 0 |
| 6 | 9 | 8 | 7 | 5 | 1 | 0 | 0 |
| 7 | 9 | 8 | 7 | 5 | 1 | 0 | 0 |
| 10 | 9 | 8 | 7 | 5 | 0 | 0 | 0 |
| 14 | 8 | 7 | 6 | 4 | 0 | 0 | 0 |
| 21 | 7 | 6 | 5 | 3 | 0 | 0 | 0 |
| 30 | 6 | 5 | 4 | 2 | 0 | 0 | 0 |
| 45 | 4 | 3 | 2 | 0 | 0 | 0 | 0 |
| 60 | 2 | 1 | 0 | 0 | 0 | 0 | 0 |
| 90 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |

## Hourly support and results

Five separate modern hourly blocks contain 12, 23, 6, 29 and 6 observations, spanning isolated dates from August 8 through September 11. Each historical caller receives at most 25 snapshots. Signals and outcomes cannot cross gaps. These samples cannot validate an hourly strategy selector or map daily findings to faster triggers.

| Viewed hourly buckets | Hold 1h | 3h | 6h | 12h | 24h |
|---|---:|---:|---:|---:|---:|
| 3 | 56 | 46 | 37 | 22 | 2 |
| 6 | 43 | 37 | 28 | 16 | 0 |
| 9 | 34 | 28 | 22 | 10 | 0 |
| 12 | 26 | 22 | 16 | 5 | 0 |
| 18 | 14 | 10 | 5 | 0 | 0 |
| 24 | 4 | 2 | 0 | 0 | 0 |

Native one-hour endpoint results, mean net after 50bps per side:

| Viewed hourly buckets | Before Classic | Corrected Classic | Momentum | Trend quality |
|---|---:|---:|---:|---:|
| 3 | -0.84% | -0.97% | -1.01% | -1.16% |
| 6 | -0.83% | -1.04% | -0.91% | -0.99% |
| 9 | -0.97% | -0.90% | -1.20% | -1.28% |
| 12 | -0.98% | -1.13% | -1.11% | -1.30% |
| 18 | -1.34% | -1.48% | -1.47% | -1.65% |
| 24 | -1.39% | -0.01% | -0.69% | -0.54% |

Gross and 100bps-per-side sensitivity results, missing counts, observed threshold timing, known-position loss rates, p10 outcomes, complete-path excursions, membership turnover and concentration remain available for every computed cell in `summary.json`. Hourly costs are material compared with the observed short-hold changes.

## Verification and limitations

- The independent stdlib Python verifier reconstructs selected entry/exit observations from raw hashed cache files, checking missing flags and all known returns, then recomputes fees, immutable selection groups, denominators and aggregate returns. This verifies calculation consistency; it cannot verify historical publication availability or fills.
- Synthetic runner tests cover delayed entry, missing entry as cash, missing exit as total loss, known hits on incomplete paths, exact fees and never selling at a hindsight high. Source bytes must remain unchanged while the run executes.
- The known-hit upper bound adds only incomplete paths with no known hit. It does not double count an incomplete path that already reached +20%. Snapshot prices miss intraday peaks and do not establish intraday ordering.
- Round-trip cohort returns are not a self-financing portfolio: horizons overlap, funds are not constrained across simultaneous signals, and no annualized or compounded returns are reported. Slippage, spread, capacity and outages remain unmodeled.
- Tests at 90 daily buckets, most long holds and many long hourly combinations are unsupported. An unavailable cell is not a passing backtest. The actual CMC data cannot validate 90-day or one-year forecasts.
- Historical CMC snapshots are selectively retained; inputs are not a complete historical investable universe. Falling outside the stored top 500 or cap filter can produce missing endpoints. Both zero-return and total-loss missing-exit marks are retained.
- Per-interval automatic method selection and trigger-based exits have not been implemented or validated here. A future selector needs mature-only training outcomes, purged forward windows, later-date evaluation, market dependence handling and prospective evidence. The earlier longer Binance research remains relevant context, but cannot validate Classic market-cap-rank terms or exact current product rankings.

## Amendment history and provenance

The first run imposed numeric ID ties in its research sorting. Review identified that this differed from the actual product. Its original code, protocol and outcomes are preserved in `superseded-numeric-ties/`. The final run consumes each scorer's native ordered output. Compared with the first run, **0/2080 signal selections changed order; 0/2080 changed constituent membership**. No earlier artifact was silently overwritten.

Archived scripts preserve the original recorded bytes and hashes; to reproduce an archived run, restore its runner/protocol to this dated directory in a separate checkout, retain the baseline directory, and use production sources matching its saved hashes. The current runner refuses to overwrite result files.

Final ledger SHA-256: `994ef1b947fc0a4191d5d871a534baf0c735d4cde04181dfc470506cb2e5b214`.

Artifacts: [protocol](protocol.md), [runner](run.cjs), [summary](summary.json), [compressed ledger](results.json.gz), [independent verifier](verify.py), [frozen baseline](baseline.json). Run `node run.cjs --selftest` for deterministic checks and `python3 verify.py` from this directory for saved-artifact verification. Full execution must use a fresh copy without result artifacts and sources matching the recorded hashes.
