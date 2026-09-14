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

/**
 * Sentinel for "cannot be scored". Must sit below the entire real score range
 * (-MAX_SCORE..MAX_SCORE) so unscoreable coins sort under the worst genuine
 * loser — at its old value of -101 they ranked above every coin scoring below
 * -101.
 */
export const NAN_SCORE = -10001
export const MAX_SCORE = 1000

/**
 * Eligibility floor for scoring, per window. Below either bound a coin gets
 * NAN_SCORE and renders as unranked ("New") instead of competing:
 *
 *  - Fewer than three quotes cannot produce a single acceleration (two
 *    `pairwise` passes), so 30% of the score's weight would be judging noise —
 *    two points are one price delta, not a trend.
 *  - A coin must span at least half the window, or its velocity describes a
 *    sliver of the period the leaderboard claims to rank. Momentum screens and
 *    the major aggregators exclude such listings from windowed rankings for
 *    the same reason (CMC/CoinGecko show "—" for a 7d change on a 2-day-old
 *    coin). Half, not higher: on the hourly view a window is only 3-5 buckets,
 *    so a coin missing a single end bucket already sits near 0.6.
 */
export const MIN_QUOTES_TO_SCORE = 3
export const MIN_COVERAGE_TO_SCORE = 0.5

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
  /** fraction of the window this coin's quotes actually span, 0..1 */
  coverage: number
  /** true when the coin was too new/sparse to score — see MIN_*_TO_SCORE */
  insufficientHistory: boolean
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
  coverage?: undefined | number
  insufficientHistory?: undefined | boolean
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
  const w1 = 0.7 * MAX_SCORE
  const w2 = 0.2 * MAX_SCORE
  const w3 = 0.1 * MAX_SCORE

  /*
   * Coverage is measured against the longest span any coin achieved, not the
   * raw min-to-max of all dates. When data is healthy they're identical — some
   * large cap always spans the whole window. They diverge when no coin *can*
   * span it: a stalled cron leaves every coin with the same truncated history,
   * and dividing by the theoretical window would gate the entire board as
   * "insufficient" even though every coin is equally, maximally covered.
   */
  let fullSpanMinutes = 0
  Object.keys(sparseCryptosById).forEach((id) => {
    const duration = sparseCryptosById[id]?.total?.duration
    if (duration != null && Number.isFinite(duration)) {
      fullSpanMinutes = Math.max(fullSpanMinutes, duration)
    }
  })

  /*
   * Pass 1 — eligibility and coverage-adjusted velocity.
   *
   * `pricePctVelocity` divides by the coin's *own* observed span, which hands
   * a partial-history coin an inflation factor of (window / own span): a newly
   * listed coin with two quotes four hours apart computed a velocity ~57× any
   * full-history coin's and ranked #1 on every window. Two corrections, both
   * standard for ranking items with unequal histories:
   *
   *  - Coins under the MIN_*_TO_SCORE floor are not scored at all.
   *  - Scored coins spread their move over the shared window rather than their
   *    own span (velocity × coverage == pricePct / windowSpan), so missing
   *    history counts as "no movement" instead of a multiplier. For a
   *    full-coverage coin this is a no-op.
   */
  const adjustedVelocityById: { [id: string]: number } = {}
  const velocityPercentiles = new SignedPercentiles()
  const pricePctAccelsSumPercentiles = new SignedPercentiles()
  const rankAccelsSumPercentiles = new SignedPercentiles()
  Object.keys(sparseCryptosById).forEach((id) => {
    const sparseCrypto = sparseCryptosById[id]
    if (sparseCrypto == null) return
    const { total, quotes } = sparseCrypto

    const coverage =
      total == null || fullSpanMinutes <= 0
        ? 0
        : Math.min(1, total.duration / fullSpanMinutes)
    sparseCrypto.coverage = coverage
    sparseCrypto.insufficientHistory =
      (quotes?.length ?? 0) < MIN_QUOTES_TO_SCORE ||
      coverage < MIN_COVERAGE_TO_SCORE

    if (total != null) {
      adjustedVelocityById[id] = total.pricePctVelocity * coverage
    }

    // Only scoreable coins define the field the percentiles rank against, so
    // an ineligible outlier cannot shift anyone else's score. Hidden coins are
    // kept out for the same reason the min/maxes exclude them.
    if (
      !sparseCrypto.insufficientHistory &&
      !disabledCryptoIds.has(id) &&
      total != null &&
      Number.isFinite(total.pricePct)
    ) {
      velocityPercentiles.add(adjustedVelocityById[id])
      pricePctAccelsSumPercentiles.add(sparseCrypto.pricePctAccelsSum)
      rankAccelsSumPercentiles.add(sparseCrypto.rankAccelsSum)
    }
  })

  // Pass 2 — score as a weighted sum of signed percentile ranks.
  Object.keys(sparseCryptosById).forEach((id) => {
    const sparseCrypto = sparseCryptosById[id]
    if (sparseCrypto == null) return
    const { pricePctAccelsSum, rankAccelsSum, total } = sparseCrypto

    let score: number
    // Guard on finiteness, not truthiness. `if (total?.pricePct)` also rejected
    // a pricePct of exactly 0, so a coin that closed the window perfectly flat
    // scored NaN -> NAN_SCORE and got hidden from the chart entirely. Infinity
    // is excluded too: `pct()` divides by the start value, which is 0 for a coin
    // that had no price at the start of the window.
    if (
      !sparseCrypto.insufficientHistory &&
      total != null &&
      Number.isFinite(total.pricePct)
    ) {
      const scoreRatio =
        (w1 * velocityPercentiles.rank(adjustedVelocityById[id]) +
          w2 * pricePctAccelsSumPercentiles.rank(pricePctAccelsSum) +
          w3 * rankAccelsSumPercentiles.rank(rankAccelsSum)) /
        (w1 + w2 + w3)
      score = scoreRatio * MAX_SCORE
    } else {
      score = NaN
    }
    // Finite scores only: MinMaxState's comparator can never displace a NaN
    // seeded as the first min/max, which froze the range the chart scales
    // stroke width by.
    if (!disabledCryptoIds.has(id) && Number.isFinite(score)) {
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
      coverage: sparseCrypto.coverage ?? 0,
      insufficientHistory: sparseCrypto.insufficientHistory ?? false,
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
 * Signed percentile-rank normalization into -1..1, replacing the old
 * `value / populationMax` scaling.
 *
 * Dividing by the max let a single outlier define the whole scale: one extreme
 * velocity compressed every other coin's ratio toward 0, flattening the
 * scores' spread (and so the chart's stroke weights) across the field.
 * Percentiles only care about order, so an outlier is merely "first" — it
 * cannot shrink anyone else.
 *
 * Sign is preserved by ranking gainers and losers in separate pools — the
 * chart keys gain/loss stroke scales off the score's sign, so a coin that
 * moved up must never score negative just for being below the median. Ties
 * take the midrank. A missing, non-finite, or zero value contributes 0:
 * accelerations need at least three quotes (two `pairwise` passes), so short
 * or gappy series leave the sums `undefined`, and treating that as "this
 * component contributes nothing" lets the score degrade to the components
 * that do have signal — a degenerate all-equal field behaves the same way.
 */
class SignedPercentiles {
  private readonly gains: number[] = []
  private readonly losses: number[] = []
  private sorted = false

  add(value: number | undefined) {
    if (value == null || !Number.isFinite(value) || value === 0) return
    if (value > 0) this.gains.push(value)
    else this.losses.push(-value)
    this.sorted = false
  }

  /** midrank percentile of |value| within its sign's pool, negated for losses */
  rank(value: number | undefined): number {
    if (value == null || !Number.isFinite(value) || value === 0) return 0
    if (!this.sorted) {
      this.gains.sort((a, b) => a - b)
      this.losses.sort((a, b) => a - b)
      this.sorted = true
    }
    const pool = value > 0 ? this.gains : this.losses
    if (pool.length === 0) return 0
    const magnitude = Math.abs(value)
    const below = lowerBound(pool, magnitude)
    const equal = upperBound(pool, magnitude) - below
    const percentile = (below + 0.5 * equal) / pool.length
    return value > 0 ? percentile : -percentile
  }
}

/** index of the first element >= value */
function lowerBound(sorted: number[], value: number): number {
  let lo = 0
  let hi = sorted.length
  while (lo < hi) {
    const mid = (lo + hi) >> 1
    if (sorted[mid] < value) lo = mid + 1
    else hi = mid
  }
  return lo
}

/** index of the first element > value */
function upperBound(sorted: number[], value: number): number {
  let lo = 0
  let hi = sorted.length
  while (lo < hi) {
    const mid = (lo + hi) >> 1
    if (sorted[mid] <= value) lo = mid + 1
    else hi = mid
  }
  return lo
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
