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

export type RankingAlgorithm = 'classic' | 'momentum' | 'trend-quality' | 'cumulative' | 'hybrid'
export type ScoringOptions = {
  algorithm?: RankingAlgorithm
  endDate?: Date
  /** Expected snapshot cadence, in milliseconds, for freshness/density checks. */
  intervalMs?: number
}

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
  options: ScoringOptions = {},
): Promise<CryptoScoreResults> {
  const minMaxes = {
    dateMinMax: new MinMaxState<Date>(),
    pricePctVelocityMinMax: new MinMaxState<number>(),
    pricePctAccelsSumMinMax: new MinMaxState<number>(),
    rankByMarketCapMinMax: new MinMaxState(1),
    rankAccelsSumMinMax: new MinMaxState<number>(),
    scoreMinMax: new MinMaxState<number>(),
  }

  const quotesGroupedByCrypto = from(
    normalizedQuotes(rankingsList, startDate, options.endDate),
  ).pipe(
    tap((quote) => {
      if (!disabledCryptoIds.has(quote.id)) {
        minMaxes.dateMinMax.compare(quote.date)
        minMaxes.rankByMarketCapMinMax.compare(quote.rankByMarketCap)
      }
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
            pricePctAccel: stableDifference(pair[1].pricePctVelocity, pair[0].pricePctVelocity) / duration,
            marketCapPctAccel: delta('marketCapPctVelocity', pair) / duration,
            rankAccel: stableDifference(pair[0].rankVelocity, pair[1].rankVelocity) / duration,
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

          let priceAccelMagnitude = 0
          let rankAccelMagnitude = 0
          accels.forEach((accel) => {
            pricePctAccelsSum += accel.pricePctAccel
            rankAccelsSum += accel.rankAccel
            priceAccelMagnitude += Math.abs(accel.pricePctAccel)
            rankAccelMagnitude += Math.abs(accel.rankAccel)
          })
          pricePctAccelsSum = removeRoundoff(pricePctAccelsSum, priceAccelMagnitude)
          rankAccelsSum = removeRoundoff(rankAccelsSum, rankAccelMagnitude)

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
   * Legacy three-argument callers measure coverage against the longest coin
   * history. An explicit endDate instead measures the requested window, so a
   * globally truncated feed cannot masquerade as complete coverage.
   */
  let fullSpanMinutes = 0
  Object.keys(sparseCryptosById).forEach((id) => {
    const duration = sparseCryptosById[id]?.total?.duration
    if (duration != null && Number.isFinite(duration)) {
      fullSpanMinutes = Math.max(fullSpanMinutes, duration)
    }
  })

  const requestedSpan = options.endDate == null
    ? null
    : (options.endDate.valueOf() - startDate.valueOf()) / 60000
  if (requestedSpan != null) fullSpanMinutes = Math.max(0, requestedSpan)
  const cadence = options.intervalMs
  if (cadence != null && (!Number.isFinite(cadence) || cadence <= 0)) {
    throw new Error('intervalMs must be a positive finite duration')
  }
  const algorithm = options.algorithm ?? 'classic'
  const candidateValues: Record<string, number> = {}
  const candidatePercentiles = new SignedPercentiles()
  const cumulativeValues: Record<string, number> = {}
  const cumulativePercentiles = new SignedPercentiles()

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
    const observations = quotes ?? []
    const expectedCount = cadence == null ? 0 : Math.floor(fullSpanMinutes * 60000 / cadence) + 1
    const sparse = cadence != null && (
      observations.length < Math.ceil(expectedCount * MIN_COVERAGE_TO_SCORE) ||
      observations.some((quote, i) => i > 0 && quote.date.valueOf() - observations[i - 1].date.valueOf() > 2 * cadence) ||
      (options.endDate != null && observations.length > 0 &&
        options.endDate.valueOf() - last(observations)!.date.valueOf() > cadence)
    )
    sparseCrypto.insufficientHistory =
      observations.length < MIN_QUOTES_TO_SCORE ||
      coverage < MIN_COVERAGE_TO_SCORE || sparse
    candidateValues[id] = algorithm === 'trend-quality'
      ? trendQuality(observations)
      : total?.pricePct ?? NaN
    if (algorithm === 'cumulative' || algorithm === 'hybrid') {
      cumulativeValues[id] = cumulativeLogStrength(observations, fullSpanMinutes * 60000)
    }

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
      candidatePercentiles.add(candidateValues[id])
      cumulativePercentiles.add(cumulativeValues[id])
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
      const momentumRank = candidatePercentiles.rank(candidateValues[id])
      const cumulativeRank = cumulativePercentiles.rank(cumulativeValues[id])
      score = (algorithm === 'classic' ? scoreRatio
        : algorithm === 'cumulative' ? cumulativeRank
        : algorithm === 'hybrid' ? (momentumRank + cumulativeRank) / 2
        : momentumRank) * MAX_SCORE
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
      // SortedList inserts descending; the lexical ID breaks exact score ties.
      if (a.id < b.id) return 1
      if (a.id > b.id) return -1
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

/** Prepare immutable, chronological measurements before any derivatives. */
function normalizedQuotes(rankingsList: RankingsResponse, startDate: Date, endDate?: Date): Quote[] {
  const start = startDate.valueOf()
  const end = endDate?.valueOf() ?? Infinity
  if (!Number.isFinite(start) || (endDate != null && !Number.isFinite(end)) || end < start) {
    throw new Error('Invalid scoring window')
  }
  const byMeasurement = new Map<string, Quote | null>()
  for (const snapshot of rankingsList) {
    const rows = snapshot.data.slice().sort((a, b) => {
      const capDifference = b.quote.USD.market_cap - a.quote.USD.market_cap
      if (Number.isFinite(capDifference) && capDifference !== 0) return capDifference
      return String(a.id) < String(b.id) ? -1 : String(a.id) > String(b.id) ? 1 : 0
    })
    rows.forEach((row, index) => {
      const value = row.quote.USD
      const timestamp = Date.parse(value.last_updated)
      if (!Number.isFinite(timestamp) || timestamp < start || timestamp > end ||
        !Number.isFinite(value.price) || value.price <= 0 ||
        !Number.isFinite(value.market_cap) || value.market_cap <= 0) return
      const quote: Quote = {
        id: String(row.id), name: row.name, symbol: row.symbol, slug: row.slug,
        date: new Date(timestamp), price: value.price, marketCap: value.market_cap,
        dayVolume: value.volume_24h,
        rankByMarketCap: Number.isInteger(row.cmc_rank) && row.cmc_rank > 0 ? row.cmc_rank : index + 1,
      }
      const key = `${quote.id}:${timestamp}`
      const previous = byMeasurement.get(key)
      if (!byMeasurement.has(key)) byMeasurement.set(key, quote)
      // Conflicting observations at one timestamp cannot establish a price path.
      // Drop that measurement instead of choosing a favorable or input-order value.
      else if (previous != null && (previous.price !== quote.price ||
        previous.marketCap !== quote.marketCap || previous.rankByMarketCap !== quote.rankByMarketCap)) {
        byMeasurement.set(key, null)
      }
    })
  }
  return [...byMeasurement.values()].filter((quote): quote is Quote => quote != null)
    .sort((a, b) => a.date.valueOf() - b.date.valueOf() || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
}

function removeRoundoff(value: number, scale: number): number {
  if (!Number.isFinite(value) || !Number.isFinite(scale)) return value
  return Math.abs(value) <= 32 * Number.EPSILON * scale ? 0 : value
}

function stableDifference(next: number, previous: number): number {
  return removeRoundoff(next - previous, Math.abs(next) + Math.abs(previous))
}

/** Signed OLS log-price slope per day, discounted by its goodness of fit. */
function trendQuality(quotes: Quote[]): number {
  if (quotes.length < 2) return NaN
  const origin = quotes[0].date.valueOf()
  const xs = quotes.map((quote) => (quote.date.valueOf() - origin) / 86400000)
  const logOrigin = Math.log(quotes[0].price)
  const ys = quotes.map((quote) => Math.log(quote.price) - logOrigin)
  const meanX = xs.reduce((sum, value) => sum + value, 0) / xs.length
  const meanY = ys.reduce((sum, value) => sum + value, 0) / ys.length
  let xx = 0, xy = 0, yy = 0
  for (let i = 0; i < xs.length; i++) {
    const x = xs[i] - meanX, y = ys[i] - meanY
    xx += x * x
    xy += x * y
    yy += y * y
  }
  return xx > 0 && yy > 0 ? (xy / xx) * Math.min(1, xy * xy / (xx * yy)) : 0
}

/**
 * Average gain sustained through a window: integrate log price relative to the
 * first observed price using trapezoids and actual elapsed time. Equal endpoint
 * returns can differ when one move happened early and held. This is not a sum
 * of adjacent returns (which would reproduce endpoint momentum).
 * Missing edge coverage contributes no area; do not extend prices past observed history.
 */
export function cumulativeLogStrength(
  quotes: readonly Pick<Quote, 'date' | 'price'>[],
  windowSpanMs: number,
): number {
  if (quotes.length < 2 || !Number.isFinite(windowSpanMs) || windowSpanMs <= 0) return NaN
  const origin = Math.log(quotes[0].price)
  if (!Number.isFinite(origin)) return NaN
  let area = 0, magnitude = 0
  for (let i = 1; i < quotes.length; i++) {
    const before = quotes[i - 1], after = quotes[i]
    const elapsed = after.date.valueOf() - before.date.valueOf()
    const left = Math.log(before.price) - origin, right = Math.log(after.price) - origin
    if (!Number.isFinite(elapsed) || elapsed <= 0 || !Number.isFinite(left) || !Number.isFinite(right)) return NaN
    const contribution = (left + right) / 2 * elapsed
    area += contribution
    magnitude += Math.abs(contribution)
  }
  // A cancelling path must stay zero instead of gaining a full signed rank
  // from tiny log/subtraction errors. Reuse Classic's relative dust guard.
  return removeRoundoff(area, magnitude) / windowSpanMs
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
