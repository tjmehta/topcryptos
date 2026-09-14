import type { Crypto, Quote } from './processRankings'
import { getRankingWindow } from './rankingWindow'
import type { Listing, RankingsResponse } from './uiTypes'

export type CoinOutlookState = 'fading' | 'extended' | 'building' | 'mixed' | 'unavailable'
export type CoinOutlookOptions = { mode: 'daily' | 'hourly'; amount: number; now?: Date }
export type CoinOutlook = {
  state: CoinOutlookState
  unavailableReason: 'invalid-window' | 'insufficient-history' | 'invalid-quote' | 'stale-quote' | null
  quotes: Quote[]
  priceChangePct: number | null
  rankChange: number | null
  priorSampledHigh: number | null
  priorSampledLow: number | null
  latestQuote: Quote | null
  latestQuoteTime: string | null
  inputs: {
    quoteCount: number
    windowStart: string | null
    windowEnd: string | null
    totalLogReturn: number | null
    lastLogReturn: number | null
    medianPriorAbsLogReturn: number | null
  }
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2
}

/** Describes the observed window; these states are not buy/sell recommendations. */
export function getCoinOutlook(crypto: Pick<Crypto, 'quotes' | 'insufficientHistory'>, options: CoinOutlookOptions): CoinOutlook {
  const result: CoinOutlook = {
    state: 'unavailable', unavailableReason: null, quotes: [], priceChangePct: null,
    rankChange: null, priorSampledHigh: null, priorSampledLow: null,
    latestQuote: null, latestQuoteTime: null,
    inputs: { quoteCount: 0, windowStart: null, windowEnd: null, totalLogReturn: null, lastLogReturn: null, medianPriorAbsLogReturn: null },
  }
  const reject = (reason: CoinOutlook['unavailableReason']) => ({ ...result, unavailableReason: reason })
  const now = options.now ?? new Date()
  if (!Number.isFinite(now.getTime()) || !Number.isSafeInteger(options.amount) || options.amount < 3) return reject('invalid-window')
  const { startDate, endDate, intervalMs } = getRankingWindow(options.mode, options.amount, now)
  if (!Number.isFinite(startDate.getTime())) return reject('invalid-window')
  result.inputs.windowStart = startDate.toISOString()
  result.inputs.windowEnd = endDate.toISOString()
  if (crypto.insufficientHistory) return reject('insufficient-history')
  if (crypto.quotes.some((q) => !(q.date instanceof Date) || !Number.isFinite(q.date.getTime()))) return reject('invalid-quote')
  const ordered = crypto.quotes.filter((q) => q.date >= startDate && q.date <= endDate).slice().sort((a, b) => a.date.getTime() - b.date.getTime())
  const quotes: Quote[] = []
  for (const quote of ordered) {
    if (!Number.isFinite(quote.price) || quote.price <= 0 || !Number.isFinite(quote.rankByMarketCap) || quote.rankByMarketCap <= 0) return reject('invalid-quote')
    const previous = quotes.at(-1)
    if (previous?.date.getTime() === quote.date.getTime()) {
      if (previous.price !== quote.price || previous.rankByMarketCap !== quote.rankByMarketCap) return reject('invalid-quote')
    } else quotes.push(quote)
  }
  result.quotes = quotes
  result.inputs.quoteCount = quotes.length
  const latest = quotes.at(-1)
  if (latest) {
    result.latestQuote = latest
    result.latestQuoteTime = latest.date.toISOString()
  }
  if (quotes.length < 3) return reject('insufficient-history')
  if (now.getTime() - latest!.date.getTime() > intervalMs) return reject('stale-quote')
  const first = quotes[0], previous = quotes.at(-2)!
  const changes = quotes.slice(1).map((q, i) => Math.log(q.price) - Math.log(quotes[i].price))
  const totalLogReturn = Math.log(latest!.price) - Math.log(first.price)
  const lastLogReturn = changes.at(-1)!
  const medianPriorAbsLogReturn = median(changes.slice(0, -1).map(Math.abs))
  result.priceChangePct = (latest!.price / first.price - 1) * 100
  result.rankChange = first.rankByMarketCap - latest!.rankByMarketCap
  result.priorSampledHigh = Math.max(...quotes.slice(0, -1).map((q) => q.price))
  result.priorSampledLow = Math.min(...quotes.slice(0, -1).map((q) => q.price))
  Object.assign(result.inputs, { totalLogReturn, lastLogReturn, medianPriorAbsLogReturn })
  result.state = latest!.price < first.price && latest!.price < previous.price ? 'fading'
    : latest!.price > first.price && lastLogReturn > 0 && quotes.length >= 6 && lastLogReturn > 2 * medianPriorAbsLogReturn && lastLogReturn >= totalLogReturn / 2 ? 'extended'
    : latest!.price > first.price && latest!.rankByMarketCap < first.rankByMarketCap && latest!.price >= previous.price ? 'building'
    : 'mixed'
  return result
}

export type RankCrossing = {
  crypto: Crypto
  boundary: 300 | 200 | 100 | 50
  previousRank: number
  currentRank: number
  rankChange: number
  priceChangePct: number
  /** Log rank improvement per observed daily/hourly step, not a forecast. */
  rankVelocity: number
  signalTime: string
  freshnessBasis: 'raw-snapshot'
}

/**
 * Uses original provider ranks and quote freshness from raw CMC snapshots.
 * Within a UTC bucket, the latest fully observable snapshot wins. Complete
 * bucket coverage is required; missing snapshots never become inferred ranks.
 */
export function findRankCrossings(cryptos: Crypto[], options: CoinOutlookOptions & { rankings?: RankingsResponse }): RankCrossing[] {
  const now = options.now ?? new Date()
  if (!options.rankings || !Number.isFinite(now.getTime()) || !Number.isSafeInteger(options.amount) || options.amount < 3) return []
  const window = getRankingWindow(options.mode, options.amount, now)
  if (!Number.isFinite(window.startDate.getTime())) return []
  const firstBucket = Math.floor(window.startDate.getTime() / window.intervalMs)
  const lastBucket = Math.floor(now.getTime() / window.intervalMs)
  const snapshots = new Map<number, { decision: number; rows: Map<string, Listing> }>()
  for (const snapshot of options.rankings) {
    const times = new Map<number, number>()
    for (const row of snapshot.data) {
      const time = Date.parse(row.quote.USD.last_updated)
      if (Number.isFinite(time)) times.set(time, (times.get(time) ?? 0) + 1)
    }
    const modal = [...times].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0]?.[0]
    if (modal == null) continue
    const rows = snapshot.data.slice(0, 500).filter(row => row.quote.USD.market_cap > 1e7)
    const nearby = rows.map(row => Date.parse(row.quote.USD.last_updated)).filter(time => Number.isFinite(time) && Math.abs(time - modal) <= 3_600_000)
    const decision = Math.max(modal, ...nearby)
    const bucket = Math.floor(modal / window.intervalMs)
    if (bucket < firstBucket || bucket > lastBucket || decision > now.getTime()) continue
    const byId = new Map(rows.map(row => [String(row.id), row]))
    if (byId.size !== rows.length) continue
    const previous = snapshots.get(bucket)
    if (!previous || previous.decision < decision) snapshots.set(bucket, { decision, rows: byId })
    else if (previous.decision === decision) {
      // Equal-time snapshots must agree about a coin. Intersection preserves
      // identical repeats and permanently removes ambiguous observations,
      // independent of input order or the number of duplicate snapshots.
      for (const [id, earlier] of previous.rows) {
        const repeated = byId.get(id)
        if (!repeated || earlier.cmc_rank !== repeated.cmc_rank ||
          earlier.quote.USD.price !== repeated.quote.USD.price ||
          earlier.quote.USD.market_cap !== repeated.quote.USD.market_cap ||
          Date.parse(earlier.quote.USD.last_updated) !== Date.parse(repeated.quote.USD.last_updated)) {
          previous.rows.delete(id)
        }
      }
    }
  }
  const ordered = [] as Array<{ decision: number; rows: Map<string, Listing> }>
  for (let bucket = firstBucket; bucket <= lastBucket; bucket++) {
    const snapshot = snapshots.get(bucket)
    if (!snapshot) return []
    ordered.push(snapshot)
  }
  const crossings: RankCrossing[] = []
  for (const crypto of cryptos) {
    if (!/^[1-9]\d*$/.test(crypto.id)) continue
    const quotes = [] as Array<{ rank: number; price: number; time: number }>
    let valid = true
    for (const snapshot of ordered) {
      const row = snapshot.rows.get(crypto.id)
      if (!row) { valid = false; break }
      const price = row.quote.USD.price, rank = row.cmc_rank, time = Date.parse(row.quote.USD.last_updated)
      const age = snapshot.decision - time
      if (!Number.isFinite(price) || price <= 0 || !Number.isInteger(rank) || rank <= 0 || !Number.isFinite(time) || age < 0 || age > 3_600_000) { valid = false; break }
      quotes.push({ price, rank, time })
    }
    if (!valid) continue
    const first = quotes[0], latest = quotes.at(-1)!, previous = quotes.at(-2)!
    if (latest.price <= first.price || latest.rank >= first.rank) continue
    for (const boundary of [300, 200, 100, 50] as const) {
      if (previous.rank > boundary && latest.rank <= boundary && latest.rank > boundary / 2) {
        crossings.push({ crypto, boundary, previousRank: previous.rank, currentRank: latest.rank,
          rankChange: first.rank - latest.rank,
          priceChangePct: (latest.price / first.price - 1) * 100,
          rankVelocity: Math.log(first.rank / latest.rank) / (options.amount - 1),
          signalTime: new Date(latest.time).toISOString(), freshnessBasis: 'raw-snapshot' })
      }
    }
  }
  return crossings.sort((a, b) => b.rankVelocity - a.rankVelocity || (BigInt(a.crypto.id) < BigInt(b.crypto.id) ? -1 : BigInt(a.crypto.id) > BigInt(b.crypto.id) ? 1 : b.boundary - a.boundary))
}
