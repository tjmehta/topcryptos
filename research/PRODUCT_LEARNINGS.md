# Product learnings

Recorded 2026-09-14 at 04:40 UTC, September 13 in Los Angeles.

## The product requirement

TopCryptos should find large movers early using its own coin history and algorithms. Exit guidance belongs with Classic, Momentum, Trend quality, Cumulative and Hybrid on Daily and Hourly, and must account for the selected interval. A separate venue-specific breakout screen does not satisfy that requirement.

The viewed interval measures the signal history. The holding period begins at entry. Keep signal time, entry time, exit trigger, execution delay and final exit date separate. A score alone is not an exit recommendation.

## Mistakes to avoid repeating

1. I chose Binance because public candle history was convenient, then let its market catalogue define the new page. The user is in the US and cannot use Binance.com. A data feed and a market the user can trade are different things. Start with the user's coin universe and actual exchange access. Confirm asset identity and coverage before attaching another provider's prices.
2. I delivered sell outlooks only on the separate Breakouts page. Our native ranking algorithms still lack integrated exit recommendations. Research completion and a working separate screen did not mean the intended product was complete.
3. I said backtests “failed” without distinguishing execution errors, negative returns, failure to beat a baseline, or insufficient evidence for changing a default. The retained backtests executed and passed independent arithmetic checks. Report the actual return, comparator, cost assumptions and sample support instead of using “failed” alone.
4. I described the app as broadly complete while exchange coverage and native exit guidance were unresolved. Name those gaps in status reports. Passing tests establishes implementation checks, not usefulness, predictive accuracy or completion of every requested feature.
5. I used technical research language and repeated explanatory text in the UI. The user wants clean designs with valuable information. Keep prices, dates, controls and outcomes prominent. Put formulas and detailed evidence in expandable sections without losing the meaning of the estimates.
6. I must report the skills actually applied. Design-review covered screenshots and responsive checks. Unslop and eliminate-visual-clutter were applied afterward. Minimalist-review was read but did not fit this UI task. Do not imply that every design skill or a comprehensive accessibility audit ran.

## Evidence rules

- Preserve original CMC and venue studies as distinct populations. Binance returns and target probabilities do not automatically validate our native algorithms or a US exchange universe.
- Record algorithm version, data source, covered dates, viewed interval, entry/exit rules, fees, missing prices and sample counts for every comparison.
- Do not present the largest retrospective result as a validated automatic recommendation. Our exact five-method CMC holding cells are descriptive. Previous automatic selectors did not establish a reliable interval-to-hold mapping.
- Do not confuse a target being touched with an executed profitable sale. Do not invent OHLC inputs, a target price or confidence where our data does not support them.
- Keep Cumulative scoped to the selected interval. Classic stays the default under the existing decision until a replacement has supporting evidence.

## Unfinished work at the initial entry

- Integrate holding-period evidence and supported exit guidance with the native Daily/Hourly algorithms. No such integration has been delivered as of this entry.
- Correct Breakouts' Binance-only market coverage for the user's actual exchange access. The exchange-preference question is unanswered; no replacement provider has been installed.
- Further evidence is needed before claiming a reliable automatic hold or coin-specific target forecast for all native algorithms and intervals.

## Existing records

- [Research status](RESEARCH_STATUS.md)
- [Algorithm recommendations](ALGORITHM_RECOMMENDATIONS.md)
- [Exact native Cumulative/Hybrid replay](cumulative/2026-09-13/README.md)
- [Holding-period research](holding-horizons/README.md)
- [Design review and screenshots](../DESIGN_REVIEW.md)

These notes describe observed product gaps and user feedback. They do not replace frozen research results or claim that unfinished changes have shipped.

## Update — 2026-09-14 04:55 UTC

The user confirmed **Coinbase and Kraken**. Breakouts now selects either exchange's public USD spot markets, with Coinbase as the default. Daily candles and actual entry opens come from that selected exchange. Public catalogue availability is not a check of the user's account or state-specific access. Provider live checks succeeded for 50 markets on each venue; those are feed checks, not financial backtests.

Daily and Hourly now include **Exit timing** for all five native algorithms. The panel compares holding periods using matched entry dates from our frozen CMC replay, exposes costs and missing-exit assumptions, and calculates a UTC exit date from the user's chosen duration and entry time. It shows missing-exit counts and makes clear that exchange/hidden-coin filters were not replayed. Independent verification checked 225 method/hold rows and 900 net-return means.

**Still unresolved:** no reliable automatic holding-period selector or coin-specific sell recommendation has been validated for the native algorithms. Coinbase/Kraken target probabilities and exit policies have not been backtested on their current market universes. Breakouts therefore shows price levels and a dated reference exit without transferring Binance probabilities or returns. A manual date planner does not complete the original request for supported automatic exit recommendations.

Records: [native holding evidence](native-exits/2026-09-14/README.md), [Coinbase/Kraken provider checks](us-exchanges/2026-09-14/README.md). Changes are local; no deployment or trade was performed.

## Polish and release preparation — September 14, 2026 UTC

The user specifically asked about shadcn and Emil. Earlier layout/copy reviews had not explicitly applied those skills; this was acknowledged and a dedicated pass followed. It reused installed Button/Input components, grouped menu items, scoped button transitions, added reduced-motion-aware press feedback, increased mobile form text, and matched native controls to the app's dark theme. Component checks: 24 passed; TypeScript and an isolated production build passed. Screenshots and exact skill provenance are in [the design record](../DESIGN_REVIEW.md).

The release upload now excludes offline research, screenshots, tests, local caches and local agent/env files while keeping the app's evidence JSON. No deployment or trade occurred. Polish readiness does not resolve unvalidated automatic exits or substitute for testing Coinbase/Kraken API access from Vercel.

## Outlook clarification — September 14, 2026 UTC

The user wanted interval-based, coin-specific insight into future price/rank milestones, and had regarded ranks as possible resistance. The manual date calculator did not answer that need. The proposed UI now centers on an Outlook for selected/starred coins, with reaching versus holding a rank separated from price returns. [Interaction proposal](COIN_OUTLOOK_UX.md); [actual CMC rank diagnostic and verification](rank-levels/2026-09-14/README.md). The hypothesis has received an initial descriptive test, not a validated predictive model. App behavior remains unchanged pending the next implementation decision.


## Coin Outlook and Radar — 2026-09-14 06:14 UTC

The user authorized aggressive parallel research and implementation. Three bounded agents ran native state outcomes, a rank-crossing replay, an earlier-era replication, primary-source financial research and independent checks while the root built the UI.

Delivered locally: stars preserve chart/URL behavior and pin a compact watch strip; opening a watched coin, leader or row opens Coin Outlook. Desktop uses an inline panel before the chart/table; mobile uses the installed shadcn bottom Sheet. It shows literal observed direction, prior sampled high/low, quote time, and a fixed-peer/supply market-cap gap when valid. Why loads matching descriptive historical individual-position medians, downside, known losses, missing outcomes and covered dates. The manual holding calculator is now inside a collapsed lower section.

Important corrections from real tests:
- Do not label a sharp jump “avoid” or an improving path “buy.” All 917 state cells have null recommendations; later daily and hourly outcomes disagree. The app state helper matches all 16,200 frozen classifications.
- Rank velocity selected identical coins to price momentum throughout the main modern primary study, even with top-three selections. That cannot establish incremental predictive value. Modern primary top-200→150 advancement occurred in 2 of 56 not-already-achieved events; these are overlapping historical observations, not live odds.
- The earlier 110-day cache block is reconstructed historical API data, not proven contemporary vintages. Its narrow top-300/top-three 14/30-step result is exploratory; results do not establish a universal detector or optimal hold. Different holds cover different mature dates.
- Rank movement is not price upside. Market-cap gaps require actual peer capitalization and supply assumptions; they are not resistance or promised targets.
- Exchange filtering is display-only in native RankingsView. Hidden-coin exclusions change the scoring universe. Earlier wording incorrectly conflated these; corrected in app copy and evidence gating.
- Non-numeric fallback-provider IDs cannot inherit CMC attribution or matched CMC outcomes. Duplicate raw snapshots with conflicting same-time measurements must be rejected deterministically, not selected by array order.
- Changing interval/method must hide prior scores until that exact context finishes. This now also protects Outlook from stale-context claims.

Validation: 203 tests and 11 snapshots passed, TypeScript passed, isolated production build passed with actual deployment exclusions. The first isolated build copy accidentally included tests while excluding their research fixture; corrected the copy to match .vercelignore and rebuilt successfully. Desktop/mobile browser checks and screenshots are recorded in DESIGN_REVIEW.md. No production deployment, orders, new paid historical calls or new dependencies were made.

Records: [state evidence](coin-outlook/2026-09-14/README.md), [financial foundation](coin-outlook/2026-09-14/FINANCIAL_FOUNDATION.md), [Radar](radar-velocity/2026-09-14/README.md), [earlier era](radar-velocity/2026-09-14/earlier-era/README.md), [app behavior](coin-outlook/2026-09-14/APP_INTEGRATION.md). Supported automatic exit recommendations and calibrated per-coin probabilities remain unresolved; the UI deliberately does not invent them.


## Remove rejected planner and repeated copy — 2026-09-14 UTC

The user explicitly rejected the right-side calendar planner and backtest-detail prose. Hiding the planner in another disclosure had preserved a flow they did not want. Removed NativeExitPanel and its enclosing calculator disclosure from RankingsView entirely. The old component/research files remain as historical code and data, but are no longer mounted or imported by the page.

Outlook now uses “Past outcomes” with the numeric table, a short population label, costs/missing-price assumptions and sample dates. Removed repeated explanations, shortened empty/error states and rank-gap copy, and replaced generic watch prose with the actual observed price levels. No algorithm, return calculation, probability or exit recommendation changed.

Validation: 11 affected UI tests and TypeScript passed. Live desktop DOM confirmed no planner, holding calculator or Backtest details section. Preserve detailed financial methods in dated research notes instead of repeating them throughout the coin UI.


## Breakouts terminology — 2026-09-14 UTC

The user asked what “observations” means. It is the selected count of completed daily candles. Breakout compares the final close with prior candle highs in that window; Momentum compares first and last closes, V−1 days apart. Changed the option labels to “daily candles” and clarified the close-to-close span. No scoring, warmup, entry or holding rule changed.


## Hourly cache stopped advancing — 2026-09-14 06:57 UTC

User reported an empty Classic/6-hour chart and correctly asked why the existing crons had not kept it fresh. Vercel config schedules price collection at :05 and exchange mapping at :35. Those jobs update production storage; the keyless dev server used a separate local FS copy. The earlier manual-seed workaround aged out.

Observed before fix at 06:49 UTC: local endpoint returned native CMC history only through 04:03/04:04, then live CoinGecko slug IDs at 06:xx. Missing 05:xx and incompatible fresh IDs left every native coin stale/unscoreable. This was a local replication gap, not evidence that the production cron stopped. Public production history supplied 05:03/05:04; after refresh local returned six native 500-row snapshots through 06:50/06:51.

Fix: local hourly route now refreshes a bounded 25-hour slice from the existing public hourly endpoint, with a shared in-flight request and five-minute throttle. It preserves original quote times/CMC identity, rejects future/stale/wrong-provider snapshots, and does not overwrite newer native measurements. Production never mirrors itself. FS writes use temporary files+atomic rename so readers cannot see partial JSON. An open Hourly page refreshes every five minutes while visible, and catches up after returning from the background.

Also corrected live-cache lifetime from accidental 15 hours to documented 15 minutes. Typecheck caught a nullable pointer guard in concurrent chart interaction work; fixed the guard without changing the gesture behavior. No score eligibility thresholds, ranking formulas or historical timestamps were relaxed.

Validation: 226 tests/11 snapshots and TypeScript passed. Live 6-hour Classic showed 120 rendered chart paths with no empty-history message. Screenshot: `screenshots/review-hourly-cache-recovery.png`. New tests exercise refresh deduplication/expiry, native identity, quote preservation, failure backoff, production guards, cache expiry and client polling cleanup. No cron mutation or deployment was performed.

The isolated production build also passed after the fix. Changes remain local; no deployment or cron schedule change.
