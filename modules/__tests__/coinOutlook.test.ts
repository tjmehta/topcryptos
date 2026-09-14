import { readFileSync } from 'node:fs'
import { gunzipSync } from 'node:zlib'
import { resolve } from 'node:path'
import { findRankCrossings, getCoinOutlook } from '../coinOutlook'
import type { Crypto } from '../processRankings'
import type { RankingsResponse } from '../uiTypes'

const HOUR = 3_600_000
const start = Date.parse('2026-09-01T00:30:00Z')
function coin(prices: number[], ranks = prices.map((_, i) => 310 - i), id = '1'): Crypto {
  return { id, name: 'Example', symbol: 'EX', slug: 'example', total: null, rank: 1, score: 1,
    coverage: 1, insufficientHistory: false, pricePctAccelsSum: 0, rankAccelsSum: 0,
    quotes: prices.map((price, i) => ({ id, name: 'Example', symbol: 'EX', slug: 'example', date: new Date(start + i * HOUR), price, marketCap: 1000, dayVolume: 100, rankByMarketCap: ranks[i] })) }
}
const options = (amount: number) => ({ mode: 'hourly' as const, amount, now: new Date(start + (amount - 1) * HOUR) })

describe('getCoinOutlook', () => {
  it('describes fading, building and mixed paths without predictions', () => {
    expect(getCoinOutlook(coin([100, 90, 80]), options(3)).state).toBe('fading')
    expect(getCoinOutlook(coin([100, 105, 110]), options(3)).state).toBe('building')
    expect(getCoinOutlook(coin([100, 110, 105]), options(3)).state).toBe('mixed')
  })
  it('uses a final spike only with six quotes and excludes it from the earlier median', () => {
    const result = getCoinOutlook(coin([100, 101, 102, 103, 104, 130]), options(6))
    expect(result.state).toBe('extended')
    expect(result.priorSampledHigh).toBe(104)
    expect(result.priorSampledLow).toBe(100)
    expect(result.priceChangePct).toBeCloseTo(30)
    expect(result.rankChange).toBe(5)
    expect(result.latestQuoteTime).toBe('2026-09-01T05:30:00.000Z')
    expect(getCoinOutlook(coin([100, 101, 102, 103, 130]), options(5)).state).toBe('building')
  })
  it('sorts and bounds quotes without mutating input or using future prices', () => {
    const crypto = coin([100, 105, 110, 1])
    crypto.quotes.reverse()
    const order = crypto.quotes.map(q => q.price)
    const result = getCoinOutlook(crypto, options(3))
    expect(result.state).toBe('building')
    expect(result.quotes.map(q => q.price)).toEqual([100, 105, 110])
    expect(crypto.quotes.map(q => q.price)).toEqual(order)
  })
  it('rejects stale, unscoreable and invalid observations', () => {
    const crypto = coin([100, 105, 110])
    expect(getCoinOutlook({ ...crypto, insufficientHistory: true }, options(3)).unavailableReason).toBe('insufficient-history')
    expect(getCoinOutlook(crypto, { ...options(5), now: new Date(start + 4 * HOUR) }).unavailableReason).toBe('stale-quote')
    expect(getCoinOutlook(coin([100, 0, 110]), options(3)).unavailableReason).toBe('invalid-quote')
    expect(getCoinOutlook(coin([100, 105, 110], [10, -1, 8]), options(3)).unavailableReason).toBe('invalid-quote')
    expect(getCoinOutlook(crypto, { ...options(3), now: new Date(NaN) }).unavailableReason).toBe('invalid-window')
  })
  it('deduplicates identical measurements and rejects conflicting same-time values', () => {
    const crypto = coin([100, 105, 110])
    crypto.quotes.push({ ...crypto.quotes[1] })
    expect(getCoinOutlook(crypto, options(3)).quotes).toHaveLength(3)
    crypto.quotes.at(-1)!.price = 106
    expect(getCoinOutlook(crypto, options(3)).unavailableReason).toBe('invalid-quote')
  })
})

function raw(cryptos: Crypto[]): RankingsResponse {
  const times = [...new Set(cryptos.flatMap(c => c.quotes.map(q => q.date.getTime())))].sort((a,b) => a-b)
  return times.map(time => ({ data: cryptos.flatMap(c => c.quotes.filter(q => q.date.getTime() === time).map(q => ({ id: Number(c.id), cmc_rank: q.rankByMarketCap, quote: { USD: { price: q.price, market_cap: 1e8, last_updated: q.date.toISOString() } } }))) })) as RankingsResponse
}
function crossings(cryptos: Crypto[], opts = options(3)) {
  return findRankCrossings(cryptos, { ...opts, rankings: raw(cryptos) })
}
describe('findRankCrossings', () => {
  it('finds only latest adjacent crossings with price and rank improvement', () => {
    const fresh = coin([100, 102, 104], [320, 305, 290])
    expect(crossings([fresh], options(3))).toMatchObject([{ boundary: 300, previousRank: 305, currentRank: 290, rankChange: 30, freshnessBasis: 'raw-snapshot' }])
    expect(crossings([coin([100, 102, 104], [320, 290, 280])], options(3))).toEqual([])
    expect(crossings([coin([100, 102, 99], [320, 305, 290])], options(3))).toEqual([])
    expect(crossings([coin([100, 102, 104], [280, 305, 290])], options(3))).toEqual([])
  })
  it('requires every bucket, valid numeric identity, and the boundary band', () => {
    const sparse = coin([100, 102, 104], [320, 305, 290]); sparse.quotes.splice(1, 1)
    expect(crossings([sparse], options(3))).toEqual([])
    expect(crossings([coin([100, 102, 104], [320, 305, 290], 'slug')], options(3))).toEqual([])
    const leap = crossings([coin([100, 102, 104], [320, 305, 90])], options(3))
    expect(leap.map(row => row.boundary)).toEqual([100])
  })
  it('sorts by observed rank speed, then numeric ID', () => {
    const slower = coin([100, 102, 104], [320, 305, 299], '1')
    const faster = coin([100, 102, 104], [400, 305, 290], '10')
    const tied = coin([100, 102, 104], [400, 305, 290], '2')
    expect(crossings([slower, faster, tied], options(3)).map(row => row.crypto.id)).toEqual(['2', '10', '1'])
  })
  it('rejects conflicting equal-decision snapshots in either order but accepts identical repeats', () => {
    const crypto = coin([100, 102, 104], [320, 305, 290])
    const rankings = raw([crypto])
    const repeated = JSON.parse(JSON.stringify(rankings[2]))
    expect(findRankCrossings([crypto], { ...options(3), rankings: [...rankings, repeated] })).toHaveLength(1)
    repeated.data[0].cmc_rank = 310
    for (const snapshots of [
      [...rankings, repeated],
      [...rankings.slice(0, 2), repeated, rankings[2]],
      [...rankings, repeated, rankings[2]],
    ]) {
      expect(findRankCrossings([crypto], { ...options(3), rankings: snapshots })).toEqual([])
    }
    const missing = JSON.parse(JSON.stringify(rankings[2]))
    missing.data[0].id = 2
    for (const snapshots of [[...rankings, missing], [...rankings.slice(0, 2), missing, rankings[2]]]) {
      expect(findRankCrossings([crypto], { ...options(3), rankings: snapshots })).toEqual([])
    }
  })
  it('requires raw data and rejects stale raw quotes or fallback ranks', () => {
    const crypto = coin([100, 102, 104], [320, 305, 290])
    expect(findRankCrossings([crypto], options(3))).toEqual([])
    const rankings = raw([crypto])
    rankings[1].data[0].cmc_rank = 0
    expect(findRankCrossings([crypto], { ...options(3), rankings })).toEqual([])
    const stale = raw([crypto])
    const last = stale[2].data[0]
    last.quote.USD.last_updated = new Date(start + HOUR - 1).toISOString()
    // A majority fixes the snapshot's modal time independently of this coin.
    stale[2].data.push(...[2, 3].map(id => ({ ...last, id, quote: { USD: { ...last.quote.USD, last_updated: options(3).now.toISOString() } } })))
    expect(findRankCrossings([crypto], { ...options(3), rankings: stale })).toEqual([])
  })
})

// Optional external-fixture parity audit; keeps the large frozen research corpus
// out of normal unit tests. Run COIN_OUTLOOK_TRACE_PARITY=1 npm test -- --runInBand modules/__tests__/coinOutlook.test.ts
if (process.env.COIN_OUTLOOK_TRACE_PARITY === '1') {
  it('matches every frozen native state classification', () => {
    const traces = JSON.parse(gunzipSync(readFileSync(resolve(process.cwd(), 'research/coin-outlook/2026-09-14/classification-traces.json.gz'))).toString())
    expect(traces).toHaveLength(16200)
    for (const trace of traces) {
      const crypto = coin(trace.quotes.map(q => q.price), trace.quotes.map(q => q.rank), trace.id)
      crypto.quotes.forEach((q, i) => { q.date = new Date(trace.quotes[i].time) })
      const actual = getCoinOutlook(crypto, { mode: trace.mode, amount: trace.view, now: new Date(trace.signal) })
      expect({ id: trace.id, state: actual.state }).toEqual({ id: trace.id, state: trace.state })
    }
  })
}
