# Interval-aware algorithm work — 2026-09-13

## Request and chronology

- 2026-09-13 07:39 UTC: User authorizes subagents, algorithm tweaks, interval-aware behavior, requires all changes backtested, and asks for dated notes on setup and results. This authorizes implementation and local verification; no deployment has been requested.
- Frozen starting commit: `cf7819407ceec20c659c3afe2e752b0755a2551f`. The working tree initially had untracked `.codex/`, `.mcp.json`, and `research/`; no tracked production edits.
- `baseline.json` records capture time and hashes of the pre-change scorer and its local dependencies. `baseline/modules/` preserves those exact committed sources for comparison after production changes.
- Three parallel workstreams started: scorer math/data correctness; backtest validity and selection gates; product integration and test coverage. Findings and acceptance decisions will be appended rather than represented as already proven improvements.

## Objective

Find large future movers early, assess realized returns after delays and modeled costs, and distinguish the viewed historical interval from the future holding/exit interval. No promised future price/rank or exact peak detection. Any automated choice of algorithm must use outcomes already known at the decision time and meet a defensible validation gate.

## Evidence entering this change

- The current app is a 70/20/10 signed-percentile blend of coverage-adjusted price velocity, price acceleration, and rank acceleration.
- Prior audits reproduce calendar-date filtering on hourly data, rank-acceleration sign errors, acceleration roundoff amplification, ordering/duplicates and sparse-history weaknesses.
- The 2026 local CMC block is 69 daily observations; hourly evidence is at most 29 consecutive slots. It cannot validate every long holding period or establish robust hourly winners.
- The separate 2020–2025 Binance cohort panel supports price-signal research but lacks market-cap ranks, so it cannot be treated as an exact Classic comparison.
- The dated holding-horizon experiment in `../../holding-horizons/` is exploratory and has no calibrated selector or untouched holdout. A view-to-hold ratio is not established.

## Initial implementation boundary

Fix confirmed scorer correctness and make candidate methods explicit. Backtest the exact changed code against the frozen baseline on identical available signals, with cadence, formation span, missing observations, entry/exit dates, and modeled costs recorded. Preserve unsupported cells as insufficient data. Do not turn an in-sample maximum into an automatic production winner mapping.

## Completed implementation and exact replay

- Final replay ran 2026-09-13 07:52:58.775–07:55:39.059 UTC. See [results and coverage tables](README.md), [protocol](protocol.md), and [source/data hashes](summary.json).
- Classic stays the default: 70% signed-percentile coverage-adjusted price velocity, 20% price acceleration sum, 10% improving market-cap-rank acceleration sum. Repairs cover exact timestamps, ordering, conflicting duplicates, source ranks, acceleration direction and floating-point noise.
- Momentum ranks signed endpoint returns. Trend quality ranks signed log-price OLS slope per elapsed day multiplied by R². Neither candidate excludes all declining coins. Scores compare eligible coins; hidden IDs alter percentile populations.
- All methods use the selected N UTC buckets, including the partial current bucket. At least three distinct quotes, 50% requested-span coverage, 50% expected observation count, no internal gap over two cadences and a latest quote no older than one cadence are required for explicit app windows.
- Algorithm selection is stored in `algo`, preserves other URL controls across daily/hourly navigation, and rescoring does not refetch history. Both alternatives are marked experimental. The viewed interval is explicitly distinguished from a future holding period.
- Baseline/new replay covers every configured view and every requested feasible hold. It saves 5,984 cohort records, 59,840 selected-position outcomes and 544 aggregate groups. Unsupported cells stay unsupported. These counts include overlapping configurations and are not independent observations.
- Independent Python verification on 2026-09-13 15:17–15:18 UTC matched source/ledger hashes, all 58,862 known returns against raw cached entry/exit prices, fee and missing-return arithmetic, and immutable selections across holding periods. Runner deterministic selftests passed.
- The first completed replay used numeric ID tie ordering instead of native scorer ordering. Root and the testing reviewer identified this at `run.cjs:52` in the superseded version. The original bytes/results are retained under `superseded-numeric-ties/`; the final replay uses each scorer's returned order. Zero of 2,080 selection groups changed order or membership in this dataset.

## Findings and adoption decision

- The default ten-bucket/7-day-hold native example: before Classic 24/80 sampled +20% hits and +3.04% mean net return; corrected Classic 22/80 and +1.66%; Momentum 27/80 and -1.97%; Trend quality 23/80 and -3.61%. Net means model 50bps each side and zero-gross missing-exit marks; the report also retains total-loss marks. These are eight dated cohorts, not a return forecast.
- Finding movers and capturing their returns are separate objectives. Formula correctness does not imply better returns in every cell. Keep the corrected default and expose candidates for comparison; no automatic winner mapping, calibrated rank forecast or sell trigger is adopted.
- CMC daily data span July 4–September 10, 2026 (69 observations); hourly evidence is five short blocks with at most 29 consecutive observations. Actual Classic 90-day/year outcomes are unavailable. The separate 2020–2025 Binance price-only study cannot validate Classic's rank terms.
- Trigger-based exits and a maturity-aware automatic selector remain unvalidated research, requiring substantially more independent data and chronological evaluation. The longer holding study records why no universal view-to-hold multiplier is justified.

## Review and local verification

- Independent breaking-change review completed with no findings after inspecting caller compatibility, timestamp windows, provider ranks, URL state and cached-input runtime behavior for all three methods.
- The testing reviewer confirmed the tie-order issue above before hitting an account usage limit; it did not complete a final sign-off. The backtest agent likewise hit the limit after saving the final replay and report generator. Root completed the report, read the final runner, ran its selftests and independent verifier, and finished review locally.
- Browser checks on 2026-09-13 used synthetic fixtures only, through `browser/fixture-proxy.cjs`. Desktop Momentum → Trend quality changed scores and `algo` without additional ranking API requests; daily → hourly retained algorithm/window query state. Mobile 390×844 had no page overflow. Screenshots are retained in `browser/` and are not backtest observations.
- Resuming the browser after a long interruption exposed an empty-window crash at `components/RankingsChart.tsx:165`: absent min/max dates reached `getTime()`. Root fixed it with an explicit no-scoreable-history state and two regression cases covering empty/insufficient history plus recovery. This UI fix does not alter the hashed scorer or replay outcomes.
- Final Jest run after that fix: 15 suites, 107 tests, 11 snapshots passed. TypeScript check passed before the chart guard; final production build includes TypeScript validation. Build/browser completion is appended below.

All timestamps above are UTC. Changes are local and uncommitted; no deployment or trade was requested or performed.

## Final completion — 2026-09-13T15:22:07.749021+00:00

- Production build after the chart guard passed, including TypeScript validation. Browser verified the formerly crashing stale-data case now shows the empty-history message with working controls. After refreshing synthetic data, 6h → 3h updated `h=3`, and browser Back restored 6h while retaining `algo=trend-quality` and `d=7`.
- No scorer/source change followed the final replay. The generated `next-env.d.ts` build-path edit was restored to its initial bytes; source changes remain local for review.

## Trading-library follow-up — 2026-09-13T19:44:29.364169+00:00

Installed isolated VectorBT/TA-Lib tooling, verified existing return arithmetic with the external engine, and evaluated all 272 candidate/current-Classic cells. [Library setup and paired findings](../../trading-libraries/2026-09-13/README.md) records versions, dependency lock, dates and scope. Seven-day Momentum is a stronger candidate than six-day Trend quality after comparing with corrected Classic. No new production method selection or exit rule was installed.
