# Topcryptos: preliminary local-cache historical comparison

**Conclusion: cannot choose a robust winner.** The fixed alternatives produce materially different top-10 lists, but only **22 daily and 2 weekly decisions** survive in the latest chronological holdout. An older cache era contains a demonstrably wrong-universe snapshot. This is a reproducible, retrospective snapshot-aligned comparison—not a strictly as-of backtest, an investable strategy result, or a proposed production change.

**Independent verification qualification:** 24 decision records contain 4,226 eligible quotes timestamped one minute after their recorded decision time, including selected holdings. The freshness rule permits quotes on either side of the snapshot modal timestamp. Consequently, the results below contain within-snapshot timing leakage; verified arithmetic does not establish predictive or executable performance. A future clean experiment needs a common cutoff after permitted inputs, explicit entry-price rules, and verified publication availability—not merely relabeled decision times. The independent checker reproduced all alternative formulas, universes, returns, missing-price scenarios and date partitions, plus actual Classic scorer parity on 15 sampled decisions. Run `node research/algorithm-audit/verify-local-comparison.cjs`.

## Run and inspect

From the repository root, using the already-installed dependencies:

```sh
node research/algorithm-comparison/run-local-cache.cjs --inventory-only
node research/algorithm-comparison/run-local-cache.cjs
```

No network, credentials, installation, or compiled files are needed. Outputs are overwritten only within this research directory. Runner sets UTC, uses Node's standard library and installed TypeScript/RxJS. Reference environment: Node v22.22.2, TypeScript 5.9.3.

Files:
- `local-cache-predeclared-protocol.md`: formulas and fixed rules, written **before calculating forward returns**.
- `run-local-cache.cjs`: complete offline runner, embedded deterministic checks.
- `local-cache-2020-2026-inventory.json`: every source filename/hash, cache key, timestamps, quality counts, daily selection, source-rank exceptions and adjacent universe overlap.
- `local-cache-2020-2026-summary.json`: compact era/pair/phase outcomes, eligibility, coverage, overlap, turnover, scenario costs, hashes and explicit interpretation warnings.
- `local-cache-2020-2026-results.json.gz`: full JSON, including the same summary and every decision's constituents, scores, forward returns/nulls, missing IDs/reasons, source filenames and actual elapsed times. Decompress with Python's `gzip.open` or Node's `zlib.gunzipSync`; no extra dependency.

Input fingerprint: `7f99bf1ca69b05a9a3323b444ad7503d624d323279e5e576680d98d16bd5f3af`.
Classic module SHA-256: `3d9d8b46c5ee66eb2237285e27b4ad4c64ede65410a9ff5ec408bda190e0c689`.
The summary also records hashes of every runtime-imported local scoring module, runner and protocol. Different inputs or production scoring edits require a new interpretation, not blindly reusing this report.

## Inventory and adequacy

- **555 listings files, 277,500 rows, exactly 500 rows each; 414 tracked files and 141 untracked.** There are **2,200 distinct IDs** across the whole inventory; selected daily eras contain **1,541 old / 686 modern** distinct IDs. Two non-listings JSON files are outside scope.
- No exact data-payload duplicates; one duplicated modal quote timestamp (`2021-03-04T09:06:07Z`, two different payloads). No duplicate IDs within a snapshot.
- Zero nonpositive/invalid prices; zero nonpositive/invalid market caps; no quote more than one hour away from its snapshot's modal timestamp. **4,344 zero-volume rows** remain: freshness does not mean liquidity.
- Across matched adjacent daily observations: **84,826 pairs**, zero unchanged quote timestamps, **194 exactly unchanged prices**. These checks cannot detect stale markets marked with fresh timestamps.
- Fixed daily selection: nearest to **23:00 UTC, ±30 minutes**, one snapshot per date; 178 selected, 377 excluded. Selection uses observed quote time, not merely the filename's `hourlyCron` flag, because the seeder uses that flag for daily samples too.
- Daily blocks: **109 days, 2020-11-18–2021-03-06**; **69 days, 2026-07-04–2026-09-10**. No calculation crosses their multi-year gap. The isolated 2021-12-30 snapshot and incomplete final days are not daily decisions.
- Longest contiguous rounded hourly-slot block: **29 hours**. No hourly test: far too little independent history for the requested daily-scale evaluation.
- Latest holdout begins **2026-08-19**; old holdout begins **2021-01-29**. Each is the final ceil(one-third) of its daily block, frozen before returns. Earlier decisions whose forward horizon enters holdout are skipped. Every pair uses non-overlapping forward intervals; lookbacks and the two pairs remain correlated.

| Era | Pair (lookback / forward) | Exploratory decisions | Holdout decisions | Interpretation |
|---|---:|---:|---:|---|
| 2020–2021 | 7d / 1d | 64 | 29 | Diagnostic only: corrupted source universe |
| 2020–2021 | 21d / 7d | 7 | 1 | Diagnostic only; particularly inadequate holdout |
| 2026 | 7d / 1d | 38 | 22 | Primary preliminary comparison |
| 2026 | 21d / 7d | 3 | 2 | Primary preliminary comparison; tiny sample |

Total: **166 evaluated decisions** (65 modern, 101 old diagnostics); **14 skipped** (4 holdout-boundary crossings, 10 with zero shared eligible coins after the old source discontinuity). These are non-overlapping return intervals within each pair, **not 166 independent statistical observations**.

### Important source failure discovered during verification

`cryptocurrency_listings:{"date":"2021-01-28T23:00:00.000Z","limit":"500","start":"1"}.json` contains **ranks 1300–1800**, with no BTC and **zero IDs in common with either adjacent day**. A filename that says top-500 is not evidence its payload is top-500. Also, 2020-11-30 shares only **173 / 170 of 500 IDs** with the preceding/following days; the reason is unresolved.

The frozen run was retained, not reranked or tuned after discovering this. **Do not use the old-era aggregates to select an algorithm or describe their missing endpoints as economic losses.** They are retained only for diagnostics and exact reproducibility. Treat these discontinuities as data gaps in any subsequent experiment; none of the primary 2026 comparisons uses them. The old-era holdout is separately saved, but is not offered as clean, independent validation of its contaminated exploratory block.

Minor reported rank-boundary exceptions also exist (1–3 rows just beyond rank 500); two 2026 snapshots reach rank 501. All remain in the manifest and frozen selection. No discretionary deletion or new score variants were introduced.

## What is being compared

For every decision, all candidates use a shared **lookback-only, snapshot-aligned** universe (not strictly point-in-time available; see timing qualification above): current listing plus every lookback observation, positive finite price/cap, fresh and strictly increasing quote timestamps, and native Classic scoreability. Forward availability never determines membership. No stablecoin, wrapped/tokenized-stock, exchange, liquidity, or present-day survivor filter.

- **Classic:** actual `processRankings` executed by an in-memory TypeScript require transform; current **70/20/10** signed-percentile score. All 500 source rows remain when the module calculates market-cap positions. Nonshared IDs are disabled for percentile-pool construction; this is the current calculation with an explicit research eligibility restriction. Native, unrestricted Classic is separately executed for eligibility and ranking sensitivity.
- **Return:** `P_end / P_start - 1` across the common lookback.
- **TrendQuality:** OLS slope of `log(price)` versus actual elapsed days, multiplied by `R²`. No optimized weights.
- **VolAdjusted:** cumulative log return divided by `sample SD(daily log returns) × sqrt(L)`. Exactly zero SD scores zero (5 coin-decision occurrences over the entire frozen run). This is a ranking signal, not portfolio Sharpe.

**Classic's confirmed defects are intentionally preserved:** positive rank acceleration can reward deterioration; acceleration floating-point dust can receive a full signed percentile; disabled/ineligible coins can determine the coverage span. The scorer does not sort per-coin observations, and its start filter compares local calendar dates. This runner supplies chronological, fresh daily observations and UTC—it does **not** recreate the app's looser ordering/cutoff risks. It also does not reproduce live fetching, UI filters or user-hidden coin choices. No scoring fix was smuggled into the baseline.

Historical response `status.timestamp` can lag quote time by **91.40 days**. Local file modification time is not upstream ingestion time. **Actual contemporaneous publication/availability cannot be established.** Local snapshots were selectively seeded; their 500-coin universe censors entry/exit, including tokenized stock products, and says nothing about execution access, survivorship outside the snapshot, capacity or token migrations.

## Primary forward results: latest 2026 holdout

**Arithmetic mean percentage return per decision**, equal-weight top 10; not compounded or annualized. Parenthetical values are the missing-endpoint **−100% return scenario**; unparenthesized values use missing-endpoint **0% return**. Neither imputation is a measured return. A missing gain has no finite upper bound.

| Pair / decisions | Classic | Return | TrendQuality | VolAdjusted | Same-universe equal weight | BTC |
|---|---:|---:|---:|---:|---:|---:|
| 7d / 1d, **22** | 0.626% | 1.342% | 1.798% | 1.878% (**1.423%**) | 0.557% (**0.131%**) | 0.510% |
| 21d / 7d, **2** | 1.177% | 12.299% | 9.437% | 1.189% | 3.578% (**2.582%**) | 1.761% |

- **7d/1d:** measured Classic, Return and TrendQuality baskets have complete endpoints. VolAdjusted has **1 missing / 220 positions** (99.55% observed): CMC ID `39769`, `IBITon`, decision 2026-08-24. Its apparent edge over TrendQuality reverses under the −100% missing-return scenario; do not crown it the winner.
- **21d/7d:** all four top-10 methods have **0 missing / 20 positions**. However, **two weekly observations** do not support a forecasting conclusion.
- Universe benchmark: **45 missing / 10,544 positions** for daily holdout (99.57% observed), **9 / 904** for weekly (99.00%). It is not a completely measured benchmark. BTC has complete endpoints on all modern decisions.
- Relative to the universe under missing=0 **on both sides**, daily excess returns are Classic **+0.069 pp**, Return **+0.784 pp**, TrendQuality **+1.241 pp**, VolAdjusted **+1.321 pp**. Weekly excesses are **−2.400, +8.721, +5.859, −2.388 pp** respectively. These scenario-relative differences are not unbiased alpha estimates.

### Frozen exploratory results, separately—not used to choose parameters

Same units and missing scenarios:

| Pair / decisions | Classic | Return | TrendQuality | VolAdjusted | Same-universe equal weight | BTC |
|---|---:|---:|---:|---:|---:|---:|
| 7d / 1d, **38** | −1.655% | −0.532% (**−1.058%**) | −1.017% | −0.474% (**−1.263%**) | −0.181% (**−0.871%**) | 0.029% |
| 21d / 7d, **3** | −3.112% (**−6.445%**) | 9.475% | 9.246% | 1.853% (**−1.481%**) | −0.690% (**−4.316%**) | −0.629% |

Exploratory missing endpoints, Classic / Return / TrendQuality / VolAdjusted: **0 / 2 / 0 / 3 out of 380 each** for daily; **1 / 0 / 0 / 1 out of 30 each** for weekly. Universe: **123/17,662** daily, **49/1,265** weekly. Raw known-only conditional means are saved explicitly but never substituted for full-denominator basket returns.

## Eligibility and descriptive ranking behavior (not predictive evidence)

| 2026 phase / pair | Native-current Classic eligible, mean | Shared full-history eligible, mean |
|---|---:|---:|
| Exploratory 7d/1d | 485.8 | 464.8 |
| Holdout 7d/1d | 491.5 | 479.3 |
| Exploratory 21d/7d | 464.0 | 421.7 |
| Holdout 21d/7d | 485.0 | 452.0 |

Latest daily holdout shared universe ranges **472–487** coins; weekly **450–454**. Native eligibility across the entire lookback union, decision counts and stricter pre-gate counts are also saved per decision. Native-current versus shared Classic top-10 overlap averages **9.45/10** daily and **10/10** weekly in holdout: research eligibility is not identical to the UI universe.

In the **22-decision daily holdout**:
- Classic vs Return: Spearman full-universe score ranks **0.980**, but only **4.41/10** average top-10 overlap. High full-universe correlation masks major tail-selection differences.
- TrendQuality vs Return: Spearman **0.937**, top-10 overlap **7.09/10**.
- VolAdjusted vs Return: Spearman **0.876**, top-10 overlap **2.00/10**.
- Mean top-10 replacement on successive decisions: **77.6% Classic**, **33.8% Return**, **31.0% TrendQuality**, **49.5% VolAdjusted**. These are membership changes, not drift-adjusted traded-notional estimates.

## Cost stresses and limitations

Fixed **10 / 50 / 100 bps per side** full-basket liquidation/re-entry scenarios subtract **0.20 / 1.00 / 2.00 percentage points per decision** from the missing=0 gross mean. For latest daily holdout:

| Method | 10 bps/side | 50 bps/side | 100 bps/side |
|---|---:|---:|---:|
| Classic | 0.426% | −0.374% | −1.374% |
| Return | 1.142% | 0.342% | −0.658% |
| TrendQuality | 1.598% | 0.798% | −0.202% |
| VolAdjusted | 1.678% | 0.878% | −0.122% |

Benchmarks above remain **gross**, not like-for-like net strategies. These are deliberately simple stresses—not executable performance, optimized rebalance cost, spread/impact estimates or an assertion that such coins can be traded at those costs. Unknown endpoints remain unknown after costs.

**Decision:** the latest block supports discussing ranking semantics and instability, not selecting a reliable predictor. Classic exhibits much higher top-10 churn than Return or TrendQuality; that is descriptive. The predictive ordering is sensitive to horizon and missing endpoints, with too few weekly outcomes and no convincing representative-market validation. No parameter search, production edits, new model integration, dependency, commit or deployment was performed.

## Verification performed

- Embedded checks: constant/increasing/decreasing price paths, tied rank correlation, missing-endpoint denominators, fixed 10-position basket sizes, and non-overlapping decision intervals.
- Re-executed actual Classic; source hashes retained. Native scorer warnings for one-quote/no-total groups are counted (**34,442**) instead of flooding output; those groups are not eligible.
- Re-ran after adding metadata diagnostics and compression; **all 166 decision records, summaries and skips exactly matched the original frozen calculation**. No outcome-driven correction or silent date exclusion.
- Production/test/config files and `.cache` were not changed. The report does not imply the production test suite was run; this standalone runner was executed and checked.
