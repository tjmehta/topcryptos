# Coin Outlook application integration

September 14, 2026, 06:14 UTC. Local implementation; not deployed.

## User flow

Stars retain URL sharing and chart highlighting, and add a coin to Watching. A star does not force a modal. Open the watched coin, leader or row's Outlook action to see current direction, saved-quote price levels, and historical outcomes. Desktop details sit before the chart/table; mobile uses the existing shadcn/Radix bottom Sheet. Closing returns focus to the invoking control.

The calendar planner moved into “Algorithm backtests & holding calculator,” below the rankings. The original matched-holding comparison remains available there. The current discovery algorithms and Classic default did not change.

## What the screen can claim

- State classification is exactly the fixed protocol in this directory: fading, extended, building, mixed, unavailable. User-facing labels are neutral measured descriptions. All 16,200 frozen classifications match the application helper.
- High/low references use saved quotes within the selected window, excluding the latest. These are not OHLC extremes, ATR, established support/resistance, tested stops or executable targets.
- Where an appropriately fresh peer exists, a rank milestone expands to `current price × peer market cap / current market cap`. This holds the subject's supply and peer's capitalization fixed. It is a size comparison, not a future rank/price forecast.
- Why loads retrospective state-conditioned outcomes for the same algorithm and viewed interval. Its table shows the later half's known individual-position median, 10th percentile and loss count at 0.5% cost each side, with missing entries/exits explicit. No ten-slot basket mean is mislabeled as a coin return. Horizons have different mature dates and are not automatically ranked.
- Matching evidence is suppressed outside the unmodified CMC top ten, for insufficient/stale history, or after hidden-coin exclusions. Fallback-provider IDs cannot inherit CMC attribution or evidence. Exchange filters only affect current display; the historical population still includes all markets.
- Radar lists up to three fresh crossings with positive window price/rank movement. It requires original numeric provider IDs, complete raw snapshot buckets and quote freshness. It does not state a return, buy call or advance probability.

The modern Radar helper matched 396 frozen research windows with zero selection mismatches before duplicate hardening. Added regression cases reject ambiguous equal-decision coin observations in either input order; identical duplicates are accepted. Live uses the latest observable snapshot per UTC bucket, while the study used saved scheduled snapshots, so matching these historical fixtures does not guarantee identical future schedules.

## Implementation and delivery checks

- Pure logic: `modules/coinOutlook.ts` and focused tests, plus an opt-in compressed research trace audit.
- Evidence: `pages/api/outlook-evidence.ts` validates allowlisted context, returns only matching cells with later-period selections, and rejects unexpected HTTP methods. The 1.49 MB full state artifact is imported only on the server. Its protocol hash is absent from production client chunks.
- Context safety: RankingsView associates results with algorithm, mode, view, hidden IDs and exact input object. Old results disappear while a new context is scoring. API responses must echo the requested context; old fetches are aborted/ignored.
- UI tests cover on-demand loading, unmatched cohorts, mismatched responses, fallback provenance, star/open separation, and close callbacks. Browser checks cover actual mobile Sheet operation and overflow in addition to desktop behavior.
- Full suite: 203 tests and 11 snapshots passed. TypeScript and isolated production build passed. Build copy follows `.vercelignore`, preserving runtime evidence while excluding research/test fixtures, local caches and env files. Initial copy mismatch was corrected before the successful build.

## Financial conclusion

State outcomes and rank-crossing studies do not establish a dependable automatic exit or per-coin probability. Some narrow historical cells are positive; no universal selection rule survived the relevant comparisons. The older 110-day replication uses reconstructed historical API data and its top-three/top-300 longer-hold candidate remains exploratory. Full protocols, rejected ideas, dates and independent verification are preserved in this directory and `research/radar-velocity/2026-09-14/`.
