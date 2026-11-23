/*
 * Server-only loaders for the page summaries in ./rankingSummary. Import this
 * with `await import()` inside getStaticProps: it pulls in the CMC client and
 * S3 store, whose env vars are read at module load, and none of it may reach
 * the browser bundle.
 *
 * The loaders read only snapshots the hourly cron already wrote. They never
 * call the live or historical CMC listings endpoints (which spend API credits
 * on every regeneration) and never fall back to another provider, so a summary
 * describes exactly the stored history the page's own scorer would use.
 */
import { type Crypto, type CryptoScoreResults, NAN_SCORE, processRankings } from './processRankings'
import {
  type BreakoutSummary,
  type RankingSummary,
  SUMMARY_SIZE,
  abovePriorHighPct,
  utcLabel,
} from './rankingSummary'
import { floorHour, setHour } from './roundToHour'

import type { Listings } from './uiTypes'
import { cmc } from './coinmarketcap'
import { getRankingWindow } from './rankingWindow'
import { loadExchangeOhlc } from './exchangeOhlc'
import { rankOhlc } from './ohlcAlgorithms'

// Same universe the /api/rankings/{daily,hourly} routes serve to the page.
const MAX_RANK = 500
const MIN_MARKET_CAP = 10 * 1e6
const QUERY = { start: 1, limit: 500 } as const
const HOUR_MS = 3_600_000

function universe(listings: Listings): Listings {
  return {
    ...listings,
    data: listings.data
      .slice(0, MAX_RANK)
      .filter((c) => c.quote.USD.market_cap > MIN_MARKET_CAP),
  }
}

/** Newest hourly snapshot, looking back a few hours for a missed cron run. */
async function latestHourly(now: Date): Promise<Listings | null> {
  for (let h = 0; h <= 3; h++) {
    const snapshot = await cmc.hourlyCachedMarkets({
      ...QUERY,
      date: new Date(floorHour(now).valueOf() - h * HOUR_MS),
    })
    if (snapshot?.data?.length) return snapshot
  }
  return null
}

/** Oldest-first buckets for the window, matching the API routes' bucket dates. */
export async function loadSnapshots(
  mode: 'daily' | 'hourly',
  window: number,
  now = new Date(),
): Promise<Listings[]> {
  const latest = await latestHourly(now)
  if (latest == null) throw new Error('No recent hourly snapshot is stored')

  const older = await Promise.all(
    Array.from({ length: window }, (_, i) => {
      const back = i + 1
      if (mode === 'hourly') {
        return cmc.hourlyCachedMarkets({
          ...QUERY,
          date: new Date(floorHour(now).valueOf() - back * HOUR_MS),
        })
      }
      // /api/rankings/daily keys each past day by its 23:00 UTC snapshot.
      const date = new Date(now)
      date.setUTCDate(date.getUTCDate() - back)
      return cmc.dailyCachedMarkets({ ...QUERY, date: setHour(date, 23) })
    }),
  )

  // A repeated snapshot (newest hourly found one hour back) is harmless: the
  // scorer normalizes each coin's repeated quotes, as it does for the page.
  return [latest, ...older]
    .filter((v): v is Listings => (v?.data?.length ?? 0) > 0)
    .map(universe)
    .reverse()
}

function newestQuoteTime(buckets: Listings[]): number {
  let newest = -Infinity
  for (const bucket of buckets) {
    for (const row of bucket.data) {
      const t = Date.parse(row.quote.USD.last_updated)
      if (Number.isFinite(t) && t > newest) newest = t
    }
  }
  return newest
}

/** Top scored coins in the order the page's table ranks them (Classic, no filters). */
export function summarizeScores(
  mode: 'daily' | 'hourly',
  window: number,
  asOf: string,
  results: CryptoScoreResults,
): RankingSummary {
  const scored = results.cryptosSortedByScore.filter(
    (coin: Crypto) =>
      !coin.insufficientHistory && coin.score !== NAN_SCORE && Number.isFinite(coin.score),
  )
  return {
    kind: 'rankings',
    mode,
    window,
    asOf,
    asOfLabel: utcLabel(asOf),
    scoredCount: scored.length,
    entries: scored.slice(0, SUMMARY_SIZE).map((coin, i) => ({
      position: i + 1,
      name: coin.name,
      symbol: coin.symbol,
      pricePct: finiteOrNull(coin.total?.pricePct),
      startRank: finiteOrNull(coin.total?.startQuote.rankByMarketCap),
      endRank: finiteOrNull(coin.total?.endQuote.rankByMarketCap),
    })),
  }
}

function finiteOrNull(value: number | undefined | null): number | null {
  return value != null && Number.isFinite(value) ? value : null
}

/**
 * Classic scores for the page's default window, as of the newest stored
 * snapshot. Throws rather than returning an empty list so a regeneration
 * failure keeps the last good page (see staticSummaryProps).
 */
export async function loadRankingSummary(
  mode: 'daily' | 'hourly',
  window: number,
  now = new Date(),
): Promise<RankingSummary> {
  const buckets = await loadSnapshots(mode, window, now)
  const asOfMs = newestQuoteTime(buckets)
  if (!Number.isFinite(asOfMs)) throw new Error('Stored snapshots carry no quote times')
  const asOf = new Date(asOfMs)
  const { startDate, endDate, intervalMs } = getRankingWindow(mode, window, asOf)
  const results = await processRankings(buckets, startDate, new Set(), {
    algorithm: 'classic',
    endDate,
    intervalMs,
  })
  const summary = summarizeScores(mode, window, asOf.toISOString(), results)
  if (summary.entries.length === 0) throw new Error('No coin had enough stored history to score')
  return summary
}

/** The /breakouts default view: Coinbase, Breakout, 7 daily candles. */
export async function loadBreakoutSummary(view = 7): Promise<BreakoutSummary> {
  const source = await loadExchangeOhlc('coinbase')
  const ranking = rankOhlc({
    signal_date: source.signal_date,
    interval_unit: 'day',
    view_observations: view,
    algorithm: 'Breakout',
    instruments: source.instruments,
  })
  const symbols = new Map(source.instruments.map((i) => [i.instrument_key, i.symbol]))
  return {
    kind: 'breakouts',
    exchange: 'coinbase',
    view,
    signalDate: source.signal_date,
    fetchedAt: source.fetched_at,
    fetchedAtLabel: utcLabel(source.fetched_at),
    universeSize: source.instruments.length,
    eligibleCount: ranking.universe_assessments.filter((row) => row.eligible).length,
    entries: ranking.selected
      .filter((row) => row.score != null && symbols.has(row.instrument_key))
      .map((row, i) => ({
        position: i + 1,
        symbol: symbols.get(row.instrument_key)!,
        abovePriorHighPct: abovePriorHighPct(row.score!),
      })),
  }
}
