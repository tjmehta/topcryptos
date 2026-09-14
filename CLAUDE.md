# CLAUDE.md

Guidance for Claude Code when working in this repo.

## What this is

Product corrections recorded September 13, 2026 local time: exit guidance belongs with
our native Daily/Hourly algorithms and the selected interval. Native Exit timing now
shows matched CMC holding evidence and a manual UTC planner; automatic recommendations
remain unvalidated. The user is in the US and uses Coinbase and Kraken; do not let
Binance.com availability define their tradable coin universe. Distinguish data feeds
from exchange access. Do not call a profitable but inconclusive comparison a failed
backtest. See `research/PRODUCT_LEARNINGS.md` for the mistakes, evidence rules and
unfinished work before extending this feature.

**topcryptos** (package name `cryptovisualize`) — a Next.js site that ranks and visualizes
top-performing cryptocurrencies over a trailing window. It scores each coin from the
velocity/acceleration of its price, market cap, and market-cap rank, then renders a D3
"spaghetti" chart of rank-over-time alongside a sortable table.

Classic scores are **signed percentile ranks** of coverage-adjusted velocity (70%) plus price/rank
acceleration sums (20%/10%) — see `processRankings.ts`. Coins without enough history in
the window (`MIN_QUOTES_TO_SCORE`, `MIN_COVERAGE_TO_SCORE`) get `NAN_SCORE`, sort last,
and render as an "Insufficient history" badge instead of a rank — a newly listed coin's 4-hour pump must
not outrank coins measured over the full window.

The `algo` URL parameter also supports `momentum` (signed endpoint return),
`trend-quality` (log-price OLS slope × R²), `cumulative` (time-average log-price gain
within the selected window), and `hybrid` (equal blend of separately normalized Momentum
and Cumulative). Classic remains the default: the verified September 13 Cumulative/Hybrid
study failed both daily promotion gates; hourly passes were sensitive to missing prices.
Definitions, results and independent verification: `research/cumulative/2026-09-13/README.md`. All methods
use the selected UTC bucket window from `modules/rankingWindow.ts`; the current partial
bucket counts toward N. Explicit scorer options enforce timestamps, coverage, observation
density, gaps and freshness. Keep complete client snapshots: the scorer normalizes quotes
after preserving provider market-cap ranks. Never deduplicate rows in the fetch client.

Dated setup, before/after results, data/source hashes and limitations are recorded in
`research/interval-algorithms/2026-09-13/README.md` and `NOTES.md`. Longer price-only holding
research is in `research/holding-horizons/README.md`. These exploratory studies do not
establish an automatic method selector or optimal sell period.

- `/` — daily rankings (3, 4, 5, 6, 7, 10, 14, 21, 30, 45, 60, 90 days)
- `/hourly` — same view on an hourly window
- `/breakouts` — Coinbase/Kraken USD daily OHLC rankings, entry references and H30 reference levels; separate current rolling-volume universe

The Daily and Hourly pages are thin wrappers over `components/RankingsView.tsx`.
`NativeExitPanel.tsx` uses `modules/data/native-exit-evidence.json` and
`modules/nativeExitEvidence.ts` for matched holding comparisons and a manual exit-date
planner. See `research/native-exits/2026-09-14/README.md`. Do not promote the largest
retrospective average into an automatic hold recommendation.

`/breakouts` uses `BreakoutsView.tsx` and `/api/rankings/ohlc`, backed by public Coinbase
and Kraken USD spot data through `modules/exchangeOhlc.ts`. The `exchange` parameter
defaults to `coinbase`; `kraken` is the other supported value. Its top-50 rolling-volume
roster is not the fixed annual backtest cohort. `modules/ohlcAlgorithms.ts` retains the
independently verified ranking and level formulas. No legacy Binance probability fits
are loaded by this route: probabilities and validation metrics are null on these new
venues. Coinbase turnover is close times base volume; Kraken uses VWAP times base
volume. Preserve these distinctions and missing/gapped entry handling.
See `research/us-exchanges/2026-09-14/README.md` for provider checks and limitations.
Historical Binance models and research remain archived as separate evidence.

## Stack

Next.js 16 (Pages Router, Turbopack) · React 19 · TypeScript 5 (`strict: false`,
`strictNullChecks: true`) · Tailwind 4 · shadcn/ui · TanStack Table · D3 v7 · RxJS 7 ·
Jest 30 · Node 22.

## Architecture

```
Vercel Cron (hourly)              Web request
       |                               |
cmc.listings({hourlyCron})   pages/api/rankings/{daily,hourly}.ts
       |                               |  fan out N days/hours in parallel
       v                               v
   S3 / FS store  <-------------  cached snapshots (read-only path)
                                       |
                                 modules/topCryptos.ts (browser fetch, chunked)
                                       |
                                 modules/processRankings.ts (RxJS scoring)
                                       |
                              RankingsChart (D3) + RankingsTable (TanStack)
```

**The CMC historical ranking path is designed to read snapshots.** It reads snapshots the
cron previously wrote. A miss on a given bucket silently drops that data point
(`.filter((v) => v != null)`), so the chart renders with fewer points rather than erroring.

### Files that matter

| Path | Role |
| --- | --- |
| `modules/uiTypes.ts` | Wire types (`Listings`, `RankingsResponse`). **Runtime-import-free on purpose** — see the note in the file. |
| `modules/coinmarketcap.ts` | CMC client + store-backed cache. Primary source. |
| `modules/coingecko.ts` | CoinGecko client + `toCMCListing()` shim. Only when `USE_COINGECKO_API=true`. |
| `modules/cache.ts` | `cache(opts, task)` wrapper + `cacheKey(name, opts)`. |
| `modules/S3Store.ts` / `modules/FSStore.ts` | Snapshot persistence, selected by `USE_FS_CACHE`. |
| `modules/processRankings.ts` | Scoring engine. RxJS: quotes → grouped → pairwise velocities → accelerations → score. |
| `modules/exchangeMap.ts` | Pure exchange↔coin join logic (CMC ids ↔ CoinGecko slugs). |
| `modules/exchangeStore.ts` | Persistence + the client-facing projection (`toClientMap`). |
| `modules/coingeckoExchanges.ts` | CoinGecko exchange/ticker client with 429 backoff. |
| `components/RankingsView.tsx` | The whole page: fetching, state, controls, layout. |
| `components/RankingsTable.tsx` | TanStack Table + shadcn table. |
| `components/RankingsChart.tsx` | Score → stroke width + opacity; selected lines go yellow. |
| `components/D3Chart.tsx` | Responsive SVG host (ResizeObserver). |
| `cron/crons/` | Legacy DigitalOcean cron. Superseded by Vercel Cron. |

## Commands

```bash
npm run dev         # next dev
npm run build       # next build  (see NODE_ENV gotcha below)
npm test            # jest
npm run typecheck   # tsc --noEmit
npm run build-cron  # tsc for the legacy DigitalOcean cron only
```

### Local development without production credentials

`CMC_API_KEY` and the `AWS_S3_*` vars are legacy **Encrypted** Vercel variables — write-only,
so `vercel env pull` returns empty strings for them and nothing that touches the data path
will start. To work around that, seed the FS cache from the public production API:

```bash
node scripts/seedLocalCache.mjs --days 30 --hours 12
USE_FS_CACHE=true npm run dev
```

`.env.local` then only needs inert placeholder values (`env-var`'s `.required()` just checks
for non-empty). The seeded `.cache/` is gitignored. Hourly now refreshes its recent CMC snapshots automatically when loaded; the script remains useful for daily history.

### ⚠️ NODE_ENV gotcha

This machine's `~/.zshenv` exports `NODE_ENV=development` globally. That makes
`next build` fail with the misleading error *"`<Html>` should not be imported outside of
pages/_document"* — nothing is wrong with the code. Build with:

```bash
NODE_ENV=production npm run build
```

Vercel is unaffected (it sets `production` itself). `next build --debug-prerender` also
sidesteps it, and is the way to unmask any *genuine* prerender error, since Next reports all
of them as that same `<Html>` message.

## Environment

Read at **module load time** via `env-var`, so a missing one throws on import:

| Var | Required | Notes |
| --- | --- | --- |
| `CMC_API_KEY` | yes | Currently the **free Basic plan** — 15k credits/mo, 50/min. |
| `CACHE_STORE_DIR` | yes | Required even in S3 mode |
| `AWS_S3_*` (4 vars) | yes | All `.required()` in `S3Store.ts`, which `coinmarketcap.ts` imports unconditionally — needed even when `USE_FS_CACHE=true` |
| `CRON_SECRET` | prod | Cron routes require `Authorization: Bearer $CRON_SECRET` |
| `USE_FS_CACHE` | no | `true` → local `.cache/` instead of S3 |
| `USE_COINGECKO_API` | no | `true` → prefer CoinGecko |
| `CG_API_KEY` | no | Free CoinGecko **Demo** key. Unset works, just converges slower. |
| `CG_TOP_EXCHANGES` / `CG_EXCHANGES_PER_RUN` / `CG_TICKER_PAGES` | no | Exchange-map cron tuning |

## Deployment

- **Web**: Vercel, project `offln/topcryptos` → https://topcryptos.io
- **Cron**: Vercel Cron via `vercel.json` → `/api/cron/hourly-listings` at `5 * * * *` (UTC).
  Crons run on **production deployments only**.

  The schedule must stay in the `:00`–`:29` window. Snapshots are keyed by
  `roundToHour(last_updated)`, which floors below `:30` and ceils at or above it, so a job
  running at `:35` would file into the *next* hour.

- **Cron**: `/api/cron/exchange-map` at `35 * * * *` — rebuilds the exchange filter's map.

  ```bash
  vercel crons ls
  vercel crons run /api/cron/hourly-listings   # Vercel injects the secret
  vercel crons run /api/cron/exchange-map
  ```

- **Legacy**: `cron/crons/` + `Dockerfile-cron` are the old DigitalOcean container. Safe to
  delete once DO is decommissioned.

## Known rough edges

- **Local hourly history refreshes automatically.** In non-production FS-cache mode,
  `/api/rankings/hourly` calls `cmc.refreshLocalHourlyCache()` before reading history.
  This fetches the public production hourly endpoint in five bounded chunks covering
  25 hours, shares concurrent work and refreshes at most every five minutes. Only
  native numeric CMC IDs and actual recent quote timestamps are written. Production
  and S3 mode never mirror their own public API. The open Hourly page reloads every
  five minutes while visible and on return after a stale background interval.
  Daily historical backfills still use the manual seed script; hourly refresh does
  not call the potentially paid historical endpoint. Live cache expiry is 15 minutes.

- **1MB response cap.** `topCryptos.getDailyRankings` issues 10 parallel requests of 9 days
  each rather than one 90-day request (commit `70908cf`), and both cached readers blank
  `tags` on every listing. Don't collapse these back into one request.
- **`hourlyCron` is part of the cache key.** Snapshots are written under keys containing
  `"hourlyCron":"true"` (it leaks from the fetch opts into `cacheKey`). Any new read path
  must include the flag or it silently never matches — this was a live bug that left
  `/hourly` blank for years while the data sat in S3. Don't "clean it up" out of the key
  without migrating every existing S3 object. `modules/__tests__/cache.test.ts` guards this.
- **Legacy `compareDates` uses local date parts.** The ranking scorer no longer uses it:
  ranking windows use UTC buckets and exact timestamp comparisons. Keep the remaining
  legacy utility tests pinned to UTC.
- **`.cache/` has 414 pre-existing tracked files (~137MB)** from 2020–2021, committed before
  the directory was gitignored. Still tracked; removing them is a separate decision.
- **The exchange map converges over several cron runs, by design.** Keyless CoinGecko
  hard-429s after ~3 calls, so `/api/cron/exchange-map` refreshes only the two most overdue
  exchanges per run and merges into stored state; a 20-exchange map takes ~10 hourly runs to
  fill in. Setting `CG_API_KEY` to a free Demo key (30 req/min) and raising
  `CG_EXCHANGES_PER_RUN` / `CG_TICKER_PAGES` converges it much faster with no code change.
  - `roster` is persisted separately from `exchanges` on purpose. `buildExchangeMap` drops
    exchanges that resolved to no coins, so storing the built list as the roster would
    permanently shrink it to whatever had data on the first run.
  - CMC cannot back this filter: its market-pairs endpoints are 403 on the free plan, and
    `exchange/assets` (which *is* allowed) reports custody holdings rather than listings — it
    covers only ~69% of the top 500 and returns nothing at all for Kraken.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->


### Coin Outlook update — 2026-09-14 UTC

Daily/Hourly: `components/CoinOutlook.tsx` provides watch pins and explicit row/leader Outlook actions; inline desktop panel and installed shadcn mobile Sheet. `modules/coinOutlook.ts` describes observed states and raw-snapshot rank crossings; these are not buy/sell policies. `pages/api/outlook-evidence.ts` serves one filtered slice of `modules/data/coin-outlook-evidence.json` on demand; keep the full ledger out of client imports. Only eligible numeric-CMC unmodified top-ten coins can show matched descriptive evidence. Exchange filters affect display; hidden exclusions change scoring. Scored data is keyed to exact context/input to suppress stale interval/method results. The user rejected the manual planner; NativeExitPanel is no longer imported or mounted by RankingsView. Keep it out of the product flow. Outlook evidence is labeled Past outcomes with compact context and figures.

Research and current limits: `research/coin-outlook/2026-09-14/APP_INTEGRATION.md`, `research/radar-velocity/2026-09-14/README.md`, and its `earlier-era/README.md`. All recommendations remain null; no rank-to-5x promise, calibrated probability, tested stop, new default, or automatic exit was established. Optional helper audit: `COIN_OUTLOOK_TRACE_PARITY=1 npm test -- --runInBand modules/__tests__/coinOutlook.test.ts`. Full suite 203 tests/11 snapshots and isolated production build passed. Local only; no deployment.
