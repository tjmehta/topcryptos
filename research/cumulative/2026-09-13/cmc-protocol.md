# Exact-CMC cumulative/hybrid replay — 2026-09-13 UTC

This protocol is frozen before the new cumulative/hybrid results. Earlier CMC outcomes and other algorithm studies have been examined; these are retrospective diagnostics, not untouched validation. The local cache has since gained snapshots, so this study captures a new input manifest instead of asserting the earlier cache hash inventory.

## Exact candidates and execution

Run the actual current TypeScript implementation of Classic, Momentum, TrendQuality, Cumulative and Hybrid. Cumulative is the adjacent-observation trapezoidal integral of log(price/first-price), weighted by actual elapsed quote time and divided by the requested full-window duration. Hybrid equally blends signed midrank percentiles of existing endpoint Momentum and Cumulative. Use the current shared eligibility and native signed top-ten order; do not apply a positive-only or Binance universe gate. These are CMC snapshot-price algorithms, not OHLC breakout variants.

Daily views3/4/5/6/7/10/14/21/30/45/60/90 and holds1/7/14/30/60/90/365; hourly views3/6/9/12/18/24 and holds1/3/6/12/24. Preserve the earlier exact-CMC loader, blocks, freshness, next-snapshot entry, grading, fee conventions and native fetch limits (90 daily/25 hourly snapshots). Signals use the original schedule: begin at view−1 within each contiguous block; step7 daily or1 hourly. Every evaluated label has its full exit snapshot inside the same block. Snapshot counts, actual dates and unfeasible cells are reported explicitly.

Enter after the decision at the next saved snapshot and exit at entry-index+H. Ten equal slots; retain missing selected IDs and empty slots. Primary returns mark missing exits as total loss with50bps each side; include zero-gross missing marks, no fees, and100bps stress. Sampled future+20% touches are labels only, never sale fills. Report known losing trades, realized+20% returns, missing paths, excursions and all source selection scores.

## Frozen default-adoption diagnostic

The primary default cells are daily view10/H7 and hourly view6/H3. Each requires at least6 mature signal dates. For each cell, sort distinct signal dates chronologically; the first floor(n/2) form the earlier half, the rest the later half. Labels are fully mature when evaluated. This split is not an independent-observation or multi-regime claim.

Cumulative and Hybrid are tested separately against BOTH current Classic and current Momentum on exactly matching dates. A candidate passes a primary default cell only if its later-half mean paired return is strictly positive under both total-loss marks at50bps and100bps; both advantages stay strictly positive after removing the single best paired later-date difference under each cost; and it wins strictly more than half the later dates at50bps. Counts, zero-gross sensitivities, mover hits and known losses are reported rather than replaced by a single objective.

Breadth uses the same holding period as the primary cell within that mode. A supported view has at least6 mature dates. Its later half uses the same chronological rule. Require nonnegative later-half mean advantage against BOTH baselines in a strict majority of supported views, and nonnegative median per-view advantage against each baseline at100bps total-loss marking. This is a bounded guard against a default improvement that collapses across neighboring views, not a requirement to win every view or avoid losses.

Report daily/hourly adoption diagnostics separately. If both candidates fail a mode's full gate, retain Classic for that mode under the user's conditional instruction. If a candidate passes, report its measured gain tradeoffs and limitations; do not claim general future superiority from short CMC coverage. A single global-default claim would need to satisfy both mode gates. All other holding cells are descriptive; their maxima are not substituted into the frozen defaults.

## Provenance and verification

Capture the normalized loaded input blocks plus new raw-file manifest as an immutable input artifact. Save actual runner/protocol/scorer/helper hashes and source snapshots; assert executing source bytes remain unchanged. Reuse the frozen exact-CMC load/grade/net/summarize helpers without changing their files. Independently recompute slot means and all paired/adoption metrics, and retain full selection/outcome ledgers. Verify method eligibility sets match current Classic before taking native top-ten selections. Refuse output overwrite. Do not mutate earlier results or substitute Binance observations into the app replay.
