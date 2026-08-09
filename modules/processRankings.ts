import { GroupedObservable, Observable, from } from 'rxjs'
import {
  filter,
  groupBy,
  map,
  mergeMap,
  pairwise,
  tap,
  toArray,
} from 'rxjs/operators'

import { MinMaxState } from './MinMax'
import type { RankingsResponse } from './uiTypes'
import SortedList from './SortedList'
import { compareDates } from './compareDates'
import { last } from './../modules/last'

export const NAN_SCORE = -101
export const MAX_SCORE = 1000

export type Quote = {
  id: string
  name: string
  symbol: string
  slug: string
  date: Date
  price: number
  marketCap: number
  dayVolume: number
  rankByMarketCap: number
}
type Velocity = {
  id: string
  name: string
  symbol: string
  slug: string
  pricePct: number
  marketCapPct: number
  pricePctVelocity: number
  marketCapPctVelocity: number
  rankDelta: number
  rankVelocity: number
  duration: number
  averageDate: Date
  startQuote: Quote
  endQuote: Quote
}
type Accel = {
  id: string
  name: string
  symbol: string
  slug: string
  pricePctAccel: number
  marketCapPctAccel: number
  rankAccel: number
  duration: number
}
export type Crypto = {
  id: string
  name: string
  symbol: string
  slug: string
  total: Velocity | null
  rank: number
  quotes: Quote[]
  pricePctAccelsSum: number
  rankAccelsSum: number
  score: number
}
export type CryptosById = {
  [id: string]: Crypto | undefined
}
type SparseCrypto = {
  id: string
  name: string
  symbol: string
  slug: string
  total?: undefined | Velocity | null
  rank?: undefined | number
  quotes?: undefined | Quote[]
  pricePctAccelsSum?: undefined | number
  rankAccelsSum?: undefined | number
  score?: undefined | number
}
type SparseCryptosById = {
  [id: string]: SparseCrypto | undefined
}
export type CryptosMinMaxes = {
  dateMinMax: MinMaxState<Date>
  pricePctVelocityMinMax: MinMaxState<number>
  pricePctAccelsSumMinMax: MinMaxState<number>
  rankByMarketCapMinMax: MinMaxState<number>
  rankAccelsSumMinMax: MinMaxState<number>
  scoreMinMax: MinMaxState<number>
}
export type CryptoScoreResults = {
  cryptosSortedByScore: Array<Crypto>
  cryptosById: CryptosById
  minMaxes: CryptosMinMaxes
}

export async function processRankings(
  rankingsList: RankingsResponse,
  startDate: Date,
  disabledCryptoIds: Set<string>,
): Promise<CryptoScoreResults> {
  const minMaxes = {
    dateMinMax: new MinMaxState<Date>(),
    pricePctVelocityMinMax: new MinMaxState<number>(),
    pricePctAccelsSumMinMax: new MinMaxState<number>(),
    rankByMarketCapMinMax: new MinMaxState(1),
    rankAccelsSumMinMax: new MinMaxState<number>(),
    scoreMinMax: new MinMaxState<number>(),
  }

  const quotesGroupedByCrypto = from(rankingsList).pipe(
    mergeMap((rankings) => {
      rankings.data.sort((a, b) => {
        if (a.quote.USD.market_cap > b.quote.USD.market_cap) return -1
        if (a.quote.USD.market_cap < b.quote.USD.market_cap) return 1
        return 0
      })
      return from(rankings.data).pipe(
        map((rankingData, index) => {
          const { id, name, symbol, slug, quote: _quote } = rankingData
          const { price, volume_24h, market_cap, last_updated } = _quote.USD

          const quote: Quote = {
            id: id.toString(),
            name,
            symbol,
            slug,
            date: new Date(last_updated),
            price,
            marketCap: market_cap,
            dayVolume: volume_24h,
            rankByMarketCap: index + 1,
          }
          return quote
        }),
        filter((quote) =>
          compareDates(startDate, quote.date, (startDay, quoteDay) => {
            if (startDay.year > quoteDay.year) return false
            if (startDay.year < quoteDay.year) return true
            // year === year
            if (startDay.month > quoteDay.month) return false
            if (startDay.month < quoteDay.month) return true
            // month === month
            if (startDay.date > quoteDay.date) return false
            // date <= date
            return true
          }),
        ),
        tap((quote) => {
          if (!disabledCryptoIds.has(quote.id)) {
            minMaxes.dateMinMax.compare(quote.date)
            minMaxes.rankByMarketCapMinMax.compare(quote.rankByMarketCap)
          }
        }),
      )
    }),
    groupBy((quote) => quote.id),
  )

  const totalsByCrypto: Observable<Velocity> = quotesGroupedByCrypto.pipe(
    mergeMap((group) => {
      return group.pipe(
        toArray(),
        map((quotes) => {
          return [quotes[0], last(quotes)] as [Quote, Quote]
        }),
        filter((pair) => {
          if (pair[0] == null) {
            console.warn('weird', pair)
            return false
          }
          const name = pair[0].name
          if (pair[1] == null) {
            console.warn('TOTAL FILTERED (no last)', name)
            return false
          }
          if (pair[0] === pair[1]) {
            console.warn('TOTAL FILTERED (equal pair)', name)
            return false
          }
          return true
        }),
        map((pair) => {
          // common values
          const { id, name, symbol, slug } = pair[0]
          const duration = minutesDuration(pair, 'date')
          const pricePct = pct('price', pair)
          const marketCapPct = pct('marketCap', pair)
          const rankDelta = delta('rankByMarketCap', pair)

          return {
            id,
            name,
            symbol,
            slug,
            pricePct,
            pricePctVelocity: pricePct / duration,
            marketCapPct,
            marketCapPctVelocity: marketCapPct / duration,
            rankDelta,
            rankVelocity: rankDelta / duration,
            duration,
            averageDate: midpointDate(pair[0].date, duration),
            startQuote: pair[0],
            endQuote: pair[1],
          } as Velocity
        }),
      )
    }),
  )

  const accelsGroupedByCrypto: Observable<
    GroupedObservable<string, Accel>
  > = quotesGroupedByCrypto.pipe(
    mergeMap((group) => {
      return group.pipe(
        pairwise(),
        map((pair) => {
          // common values
          const { id, name, symbol, slug } = pair[0]
          const duration = minutesDuration(pair, 'date')
          return {
            id,
            name,
            symbol,
            slug,
            pricePctVelocity: pct('price', pair) / duration,
            marketCapPctVelocity: pct('marketCap', pair) / duration,
            rankVelocity: delta('rankByMarketCap', pair) / duration,
            duration,
            averageDate: midpointDate(pair[0].date, duration),
            startQuote: pair[0],
            endQuote: pair[1],
          }
        }),
        pairwise(),
        map<[Velocity, Velocity], Accel>((pair) => {
          // common values
          const { id, name, symbol, slug } = pair[0]
          const duration = minutesDuration(pair, 'averageDate')
          return {
            id,
            name,
            symbol,
            slug,
            pricePctAccel: delta('pricePctVelocity', pair) / duration,
            marketCapPctAccel: delta('marketCapPctVelocity', pair) / duration,
            rankAccel: delta('rankVelocity', pair) / duration,
            duration,
          }
        }),
      )
    }),
    groupBy((ranking) => ranking.id),
  )

  // result vars
  const sparseCryptosById: SparseCryptosById = {}

  // compute results
  await Promise.all([
    quotesGroupedByCrypto
      .pipe(
        mergeMap((group) => group.pipe(toArray())),
        tap((quotes) => {
          const { id, name, symbol, slug } = quotes[0]
          sparseCryptosById[id] = sparseCryptosById[id] ?? {
            id,
            name,
            symbol,
            slug,
          }
          sparseCryptosById[id].quotes = quotes
        }),
      )
      .toPromise(),
    accelsGroupedByCrypto
      .pipe(
        mergeMap((group) => group.pipe(toArray())),
        tap((accels) => {
          const { id, name, symbol, slug } = accels[0]
          let pricePctAccelsSum = 0
          let rankAccelsSum = 0

          accels.forEach((accel) => {
            pricePctAccelsSum += accel.pricePctAccel
            rankAccelsSum += accel.rankAccel
          })

          if (!disabledCryptoIds.has(id)) {
            minMaxes.pricePctAccelsSumMinMax.compare(pricePctAccelsSum)
            minMaxes.rankAccelsSumMinMax.compare(rankAccelsSum)
          }

          sparseCryptosById[id] = sparseCryptosById[id] ?? {
            id,
            name,
            symbol,
            slug,
          }
          sparseCryptosById[id].pricePctAccelsSum = pricePctAccelsSum
          sparseCryptosById[id].rankAccelsSum = rankAccelsSum
        }),
      )
      .toPromise(),
    totalsByCrypto
      .pipe(
        tap((total) => {
          const { id, name, symbol, slug } = total
          if (!disabledCryptoIds.has(id)) {
            minMaxes.pricePctVelocityMinMax.compare(total.pricePctVelocity)
          }
          sparseCryptosById[id] = sparseCryptosById[id] ?? {
            id,
            name,
            symbol,
            slug,
          }
          sparseCryptosById[id].total = total
        }),
      )
      .toPromise(),
  ])

  // calculate score
  Object.keys(sparseCryptosById).forEach((id) => {
    const sparseCrypto = sparseCryptosById[id]
    if (sparseCrypto == null) return
    let { pricePctAccelsSum, rankAccelsSum, total } = sparseCrypto

    const w1 = 0.7 * MAX_SCORE
    const w2 = 0.2 * MAX_SCORE
    const w3 = 0.1 * MAX_SCORE

    let score: number
    // Guard on finiteness, not truthiness. `if (total?.pricePct)` also rejected
    // a pricePct of exactly 0, so a coin that closed the window perfectly flat
    // scored NaN -> NAN_SCORE and got hidden from the chart entirely. Infinity
    // is excluded too: `pct()` divides by the start value, which is 0 for a coin
    // that had no price at the start of the window.
    if (total != null && Number.isFinite(total.pricePct)) {
      const pricePctScoreRatio = normalize(
        total.pricePctVelocity,
        minMaxes.pricePctVelocityMinMax,
      )
      const pricePctAccelsSumScoreRatio = normalize(
        pricePctAccelsSum,
        minMaxes.pricePctAccelsSumMinMax,
      )
      const rankAccelsSumScoreRatio = normalize(
        rankAccelsSum,
        minMaxes.rankAccelsSumMinMax,
      )
      const scoreRatio =
        (w1 * pricePctScoreRatio +
          w2 * pricePctAccelsSumScoreRatio +
          w3 * rankAccelsSumScoreRatio) /
        (w1 + w2 + w3)
      score = scoreRatio * MAX_SCORE
    } else {
      score = NaN
    }
    if (!disabledCryptoIds.has(id)) {
      minMaxes.scoreMinMax.compare(score)
    }
    sparseCrypto.score = score
  })

  // cryptosById from sparse
  const cryptosSortedByScoreList = new SortedList<Crypto>({
    comparator: (a, b) => {
      if (a.score < b.score) return -1
      if (a.score > b.score) return 1
      return 0
    },
  })
  const cryptosById: CryptosById = {}
  Object.keys(sparseCryptosById).forEach((id, index, keys) => {
    const sparseCrypto = sparseCryptosById[id]

    if (sparseCrypto == null) return
    if (sparseCrypto.quotes == null || sparseCrypto.quotes.length === 0) {
      console.warn(
        'SPARSE CRYPTO FILTERED (no quotes)',
        sparseCrypto.name,
        keys.length,
      )
      return
    }
    if (sparseCrypto.total == null) {
      console.warn(
        'SPARSE CRYPTO FILTERED (no total)',
        sparseCrypto.name,
        keys.length,
      )
      return
    }

    const score =
      sparseCrypto.score == null ||
      Number.isNaN(sparseCrypto.score)
        ? NAN_SCORE
        : sparseCrypto.score

    const crypto: Crypto = {
      id: sparseCrypto.id,
      name: sparseCrypto.name,
      symbol: sparseCrypto.symbol,
      slug: sparseCrypto.slug,
      total: sparseCrypto.total,
      rank: 0, // set below
      quotes: sparseCrypto.quotes,
      pricePctAccelsSum: sparseCrypto.pricePctAccelsSum ?? NaN,
      rankAccelsSum: sparseCrypto.rankAccelsSum ?? NaN,
      score,
    }
    cryptosById[id] = crypto
    cryptosSortedByScoreList.add(crypto)

    const i = cryptosSortedByScoreList.indexOf(crypto)
    if (i < 0) {
      console.warn('debug', crypto.name)
      debugger
    }
  })

  const cryptosSortedByScore: Array<Crypto> = []
  cryptosSortedByScoreList.forEach((crypto, i) => {
    crypto.rank = i + 1
    cryptosSortedByScore.push(crypto)
    // console.log(crypto.rank, crypto.quotes[0].name, crypto.id, crypto.score)
    // console.log(
    //   '  price',
    //   [crypto.total.startQuote.price, crypto.total.endQuote.price],
    //   crypto.total.pricePct,
    // )
    // console.log('  rank', [
    //   crypto.total.startQuote.rankByMarketCap,
    //   crypto.total.endQuote.rankByMarketCap,
    // ])
  })

  // console.log('RESULT', cryptosSortedByScore.length, {
  //   cryptosSortedByScore,
  //   cryptosById,
  //   minMaxes,
  // })
  return { cryptosSortedByScore, cryptosById, minMaxes }
}

function delta<K extends string, R extends Record<K, number>>(
  key: K,
  pair: [R, R],
): number {
  const prev = pair[0]
  const next = pair[1]

  if (prev[key] == null) return NaN
  if (Number.isNaN(prev[key])) return NaN
  if (next[key] == null) return NaN
  if (Number.isNaN(next[key])) return NaN

  return next[key] - prev[key]
}
function pct<K extends string, R extends Record<K, number>>(
  key: K,
  pair: [R, R],
): number {
  const prev = pair[0]
  return (delta(key, pair) / prev[key]) * 100
}
function minutesDuration<K extends string, R extends Record<K, Date>>(
  pair: [R, R],
  key: K,
) {
  return pair[1][key].valueOf() / 1000 / 60 - pair[0][key].valueOf() / 1000 / 60
}
/**
 * Scale `value` into roughly -1..1 against whichever end of the observed range
 * it sits on, returning 0 when that isn't meaningful.
 *
 * The previous inline form divided by `Math.abs(minMax.max)` (or `.min`) with no
 * guard, which produced NaN in two situations that actually occur:
 *
 *  - **A degenerate range.** When every coin in the window shares the same value
 *    the bound is 0, so `0 / 0` is NaN. NaN then propagates through the weighted
 *    sum, so *every* coin scores NaN -> NAN_SCORE and the entire chart renders
 *    blank rather than just that one component being uninformative.
 *  - **Missing acceleration sums.** Accelerations need at least three quotes
 *    (two `pairwise` passes). With a short window — or a longer one that the
 *    hourly cron left gaps in — the sums stay `undefined`, and
 *    `undefined / x` is NaN.
 *
 * Treating both as "this component contributes nothing" lets the score degrade
 * to the components that do have signal.
 */
function normalize(
  value: number | undefined,
  minMax: MinMaxState<number>,
): number {
  if (value == null || !Number.isFinite(value)) return 0
  const bound = Math.abs(value >= 0 ? minMax.max : minMax.min)
  if (!Number.isFinite(bound) || bound === 0) return 0
  return value / bound
}
/**
 * Midpoint of a window that starts at `start` and lasts `durationMinutes`.
 *
 * This used to be written inline as `new Date(start.valueOf() + duration / 2)`,
 * which mixed units: `valueOf()` is milliseconds but `duration` is minutes, so a
 * 24h window advanced the "average" date by 720ms instead of 12 hours. Because
 * the same offset was applied to every window it mostly cancelled out when
 * accelerations diffed consecutive `averageDate`s — but it stopped cancelling as
 * soon as snapshots were unevenly spaced, which is exactly what happens whenever
 * the hourly cron misses an hour.
 */
function midpointDate(start: Date, durationMinutes: number): Date {
  return new Date(start.valueOf() + (durationMinutes * 60 * 1000) / 2)
}
// function rankDivisor(rank: number) {
//   if (rank < 10) return 10
//   if (rank < 25) return 25
//   if (rank < 50) return 50
//   if (rank < 100) return 100
//   return 500
// }
