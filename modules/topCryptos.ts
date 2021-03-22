import {
  groupBy,
  last,
  map,
  mergeMap,
  pairwise,
  reduce,
  tap,
  toArray,
} from 'rxjs/operators'

import ApiClient from 'simple-api-client'
import { MinMaxState } from './MinMax'
import { RankingsData } from '../pages/api/rankings/hourly'
import SortedList from '../modules/SortedList'
import { from } from 'rxjs'
import { isSameDay } from './isSameDay'
import stringify from 'fast-json-stable-stringify'

type RankingsOpts = {
  maxRank?: number
  limit?: number
}
type RankingsQuery = {
  [P in keyof RankingsOpts]: string
}

type Resolved<T> = T extends PromiseLike<infer U> ? U : T

export const DAYS = [3, 4, 5, 6, 7, 8, 9, 10, 14, 21, 30, 60, 90]
export const indexByDay: {
  [day: string]: number
} = DAYS.reduce((memo, day, i) => {
  return (memo[day] = i)
}, {})

export type RankingsResult = Resolved<
  ReturnType<typeof TopCryptosApiClient.prototype.getRankings>
>

export const NAN_SCORE = 0 - 101
const cache = {}

export class TopCryptosApiClient extends ApiClient {
  constructor() {
    super('/')
  }
  async getRankings(opts: RankingsOpts) {
    const query: RankingsQuery = {
      limit: '90',
    }
    Object.keys(opts).forEach((key) => {
      if (opts[key] == null) return
      query[key] = opts[key].toString()
    })
    const key = stringify(query)
    if (cache[key]) return cache[key] as never

    const rankingsByDay: Array<RankingsData> = await this.get<RankingsQuery>(
      'api/rankings/daily',
      200,
      {
        query,
      },
    )
    rankingsByDay.forEach((rankings) => {
      rankings.data
        .sort((a, b) => {
          if (a.quote.USD.market_cap > b.quote.USD.market_cap) return -1
          if (a.quote.USD.market_cap < b.quote.USD.market_cap) return 1
          return 0
        })
        .forEach((cryptoQuote, i) => {
          // @ts-ignore - rank
          cryptoQuote.rank = i + 1
        })
    })
    const rankingsGroupedByCryptoObservable = from(rankingsByDay).pipe(
      mergeMap((rankings) => {
        return from(rankings.data).pipe(
          map((cryptoQuote) => {
            const {
              id,
              name,
              symbol,
              slug,
              cmc_rank,
              // @ts-ignore - rank
              rank,
              quote,
            } = cryptoQuote
            const {
              price,
              volume_24h,
              percent_change_1h,
              percent_change_24h,
              percent_change_7d,
              market_cap,
              last_updated,
            } = quote.USD

            return {
              id,
              name,
              symbol,
              slug,
              start_price: 0,
              start_market_cap: 0,
              mkt_rank: rank as number,
              cmc_rank,
              price,
              volume_24h,
              percent_change_1h,
              percent_change_24h,
              percent_change_7d,
              market_cap,
              last_updated: new Date(last_updated),
            }
          }),
        )
      }),
      groupBy((rankData) => rankData.id),
      mergeMap((group) => {
        return group.pipe(
          pairwise(),
          mergeMap((pair) => {
            const one = pair[0]
            const two = pair[1]
            one.start_price = one.start_price || one.price
            two.start_price = one.start_price
            one.start_market_cap = one.start_market_cap || one.market_cap
            two.start_market_cap = one.start_market_cap

            return from(pair)
          }),
        )
      }),
      groupBy((rankData) => rankData.id),
    )

    // durations for which we want scores for
    const dailyTotalDeltasGroupedByCryptoObservable = from(
      rankingsGroupedByCryptoObservable,
    ).pipe(
      mergeMap((group) => {
        const BTC_LAST_UPDATED_ARR = []
        return group.pipe(
          toArray(),
          tap((arr) => {
            if (arr[0].symbol === 'BTC') {
              DAYS.some((days) => {
                const first = arr[arr.length - (days - 1)]
                if (first == null) return
                BTC_LAST_UPDATED_ARR.push(first.last_updated)
              })
            }
          }),
          map((arr) => {
            return DAYS.map((days, i) => {
              const first = arr[arr.length - (days - 1)]
              const pair = [first, lastItem(arr)]
              const { id, name, symbol, slug } = pair[1]

              if (
                first == null ||
                !isSameDay(first.last_updated, BTC_LAST_UPDATED_ARR[i])
              ) {
                return {
                  id,
                  name,
                  symbol,
                  slug,
                  start: null,
                  end: pair[1],
                  mkt_rank_delta: NaN,
                  cmc_rank_delta: NaN,
                  price_delta: NaN,
                  price_delta_pct: NaN,
                  volume_delta: NaN,
                  market_cap_delta: NaN,
                  market_cap_delta_pct: NaN,
                  last_updated_avg: NaN,
                  score: NaN,
                } as never
              }

              const prev_date = new Date(pair[0].last_updated).valueOf()
              const next_date = new Date(pair[1].last_updated).valueOf()

              return {
                id,
                name,
                symbol,
                slug,
                start: pair[0] as typeof pair[0] | null,
                end: pair[1],
                mkt_rank_delta: pair[1].mkt_rank - pair[0].mkt_rank,
                cmc_rank_delta: pair[1].cmc_rank - pair[0].cmc_rank,
                price_delta: pair[1].price - pair[0].price,
                price_delta_pct:
                  ((pair[1].price - pair[0].price) / pair[0].price) * 100,
                volume_delta: pair[1].volume_24h - pair[0].volume_24h,
                market_cap_delta: pair[1].market_cap - pair[0].market_cap,
                market_cap_delta_pct:
                  ((pair[1].market_cap - pair[0].market_cap) /
                    pair[0].market_cap) *
                  100,
                last_updated_avg: new Date(
                  (next_date - prev_date) / 2 + prev_date,
                ),
                score: 0,
              }
            })
          }),
        )
      }),
    )

    const deltasGroupedByCryptoObservable = from(
      rankingsGroupedByCryptoObservable,
    ).pipe(
      mergeMap((group) => {
        return group.pipe(
          pairwise(),
          map((pair) => {
            const { id, name, symbol, slug } = pair[0]
            const prev_date = new Date(pair[0].last_updated).valueOf()
            const next_date = new Date(pair[1].last_updated).valueOf()

            return {
              id,
              name,
              symbol,
              slug,
              start_price: pair[0].start_price,
              start_market_cap: pair[0].start_market_cap,
              mkt_rank_delta: pair[1].mkt_rank - pair[0].mkt_rank,
              cmc_rank_delta: pair[1].cmc_rank - pair[0].cmc_rank,
              price_delta: pair[1].price - pair[0].price,
              price_delta_from_start: pair[1].price - pair[0].start_price,
              price_delta_pct:
                ((pair[1].price - pair[0].price) / pair[0].price) * 100,
              price_delta_pct_from_start:
                ((pair[1].price - pair[0].start_price) / pair[0].start_price) *
                100,
              volume_delta: pair[1].volume_24h - pair[0].volume_24h,
              market_cap_delta: pair[1].market_cap - pair[0].market_cap,
              market_cap_delta_from_start:
                pair[1].market_cap - pair[0].start_market_cap,
              market_cap_delta_pct:
                ((pair[1].market_cap - pair[0].market_cap) /
                  pair[0].market_cap) *
                100,
              market_cap_delta_pct_from_start:
                ((pair[1].market_cap - pair[0].start_market_cap) /
                  pair[0].start_market_cap) *
                100,
              last_updated_avg: new Date(
                (next_date - prev_date) / 2 + prev_date,
              ),
            }
          }),
        )
      }),
      groupBy((rankData) => rankData.id),
    )

    const accelsGroupedByCryptoObservable = from(
      deltasGroupedByCryptoObservable,
    ).pipe(
      mergeMap((group) => {
        return group.pipe(
          pairwise(),
          map((pair) => {
            const { id, name, symbol, slug } = pair[0]
            const prev_date = new Date(pair[0].last_updated_avg).valueOf()
            const next_date = new Date(pair[1].last_updated_avg).valueOf()

            return {
              id,
              name,
              symbol,
              slug,
              mkt_rank_accel: pair[1].mkt_rank_delta - pair[0].mkt_rank_delta,
              cmc_rank_accel: pair[1].cmc_rank_delta - pair[0].cmc_rank_delta,
              price_accel: pair[1].price_delta - pair[0].price_delta,
              price_pct_accel: (() => {
                function pctToFactorPct(pct: number) {
                  if (pct >= 0) return pct
                  return 100 + pct
                }
                return (
                  pctToFactorPct(pair[1].price_delta_pct) -
                  pctToFactorPct(pair[0].price_delta_pct)
                )
              })(),
              volume_accel: pair[1].volume_delta - pair[0].volume_delta,
              market_cap_accel:
                pair[1].market_cap_delta - pair[0].market_cap_delta,
              last_updated_avg: new Date(
                (next_date - prev_date) / 2 + prev_date,
              ),
            }
          }),
        )
      }),
      groupBy((rankData) => rankData.id),
    )
    const dailyMinMaxTotalDeltasObservable = dailyTotalDeltasGroupedByCryptoObservable.pipe(
      reduce(
        (dailyMinMaxes, cryptoTotalDeltasByDay) => {
          cryptoTotalDeltasByDay.forEach((totalDelta, dayIndex) => {
            if (totalDelta.start == null) return

            dailyMinMaxes[dayIndex].mkt_rank_delta_min_max.compare(
              totalDelta.mkt_rank_delta,
            )
            dailyMinMaxes[dayIndex].price_delta_pct_min_max.compare(
              totalDelta.price_delta_pct,
            )
          })

          return dailyMinMaxes
        },
        DAYS.map((day) => ({
          mkt_rank_delta_min_max: new MinMaxState(0),
          price_delta_pct_min_max: new MinMaxState(0),
        })),
      ),
    )
    const dailyAccelSumsGroupedByCryptoObservable = accelsGroupedByCryptoObservable.pipe(
      mergeMap((group) => {
        return group.pipe(
          toArray(),
          map((cryptoAccels) => {
            return DAYS.map((day) => {
              const accelsLen = day - 2
              const cryptoAccelsSlice = cryptoAccels.slice(0 - accelsLen)

              if (cryptoAccelsSlice.length !== accelsLen) {
                return {
                  id: cryptoAccels[0].id,
                  price_pct_accels_sum: NaN,
                  mkt_rank_accels_sum: NaN,
                }
              }

              const {
                price_pct_accels_sum,
                mkt_rank_accels_sum,
              } = cryptoAccelsSlice.reduce(
                (sums, accel) => {
                  return {
                    price_pct_accels_sum:
                      sums.price_pct_accels_sum + accel.price_pct_accel,
                    mkt_rank_accels_sum:
                      sums.mkt_rank_accels_sum + accel.price_pct_accel,
                  }
                },
                {
                  price_pct_accels_sum: 0,
                  mkt_rank_accels_sum: 0,
                },
              )

              return {
                id: 0,
                price_pct_accels_sum,
                mkt_rank_accels_sum,
              }
            })
          }),
        )
      }),
      groupBy((dailyAccelSums) => dailyAccelSums[0].id),
    )
    const dailyMinMaxAccelSumsObservable = dailyAccelSumsGroupedByCryptoObservable.pipe(
      mergeMap((group) =>
        group.pipe(
          reduce(
            (dailyMinMaxes, dailyCryptoAccelSums) => {
              dailyCryptoAccelSums.forEach((accelSum, dayIndex) => {
                if (isNaN(accelSum.price_pct_accels_sum)) return

                dailyMinMaxes[dayIndex].price_pct_accels_sum_min_max.compare(
                  accelSum.price_pct_accels_sum,
                )
                dailyMinMaxes[dayIndex].mkt_rank_accels_sum_min_max.compare(
                  accelSum.mkt_rank_accels_sum,
                )
              })

              return dailyMinMaxes
            },
            DAYS.map((day) => ({
              price_pct_accels_sum_min_max: new MinMaxState(0),
              mkt_rank_accels_sum_min_max: new MinMaxState(0),
            })),
          ),
        ),
      ),
    )

    // bycrypto -> groupedbycrypto
    const [
      rankingsByCrypto,
      deltasByCrypto,
      accelsByCrypto,
      dailyTotalDeltasByCrypto,
      dailyMinMaxTotalDeltas,
      dailyAccelSumsByCrypto,
      dailyMinMaxAccelSums,
    ] = await Promise.all([
      from(rankingsGroupedByCryptoObservable)
        .pipe(
          mergeMap((group) => {
            return group.pipe(toArray())
          }),
          toArray(),
        )
        .toPromise(),
      from(deltasGroupedByCryptoObservable)
        .pipe(
          mergeMap((group) => {
            return group.pipe(toArray())
          }),
          toArray(),
        )
        .toPromise(),
      from(accelsGroupedByCryptoObservable)
        .pipe(
          mergeMap((group) => {
            return group.pipe(toArray())
          }),
          toArray(),
        )
        .toPromise(),
      dailyTotalDeltasGroupedByCryptoObservable.pipe(toArray()).toPromise(),
      dailyMinMaxTotalDeltasObservable.toPromise(),
      from(dailyAccelSumsGroupedByCryptoObservable)
        .pipe(
          mergeMap((group) => {
            return group.pipe(toArray())
          }),
        )
        .toPromise(),
      dailyMinMaxAccelSumsObservable.toPromise(),
    ])

    // Grouped by crypto id
    type Rankings = typeof rankingsByCrypto[0]
    type Deltas = typeof deltasByCrypto[0]
    type Accels = typeof accelsByCrypto[0]
    type DailyTotalDeltas = typeof dailyTotalDeltasByCrypto[0]
    type DailyMinMaxTotalDeltas = typeof dailyMinMaxTotalDeltas[0]
    type DailyAccelSums = typeof dailyAccelSumsByCrypto[0]
    type DailyMinMaxAccelSums = typeof dailyMinMaxAccelSums[0]
    const rankingsByCryptoId = rankingsByCrypto.reduce((memo, item) => {
      memo[item[0].id] = item
      return memo
    }, {} as { [id: number]: Rankings })
    const deltasByCryptoId = deltasByCrypto.reduce((memo, item) => {
      memo[item[0].id] = item
      return memo
    }, {} as { [id: number]: Deltas })
    const accelsByCryptoId = accelsByCrypto.reduce((memo, item) => {
      memo[item[0].id] = item
      return memo
    }, {} as { [id: number]: Accels })
    const dailyTotalDeltasByCryptoId = dailyTotalDeltasByCrypto.reduce(
      (memo, arr) => {
        const item = arr[0]
        memo[item.id] = arr
        return memo
      },
      {} as { [id: number]: DailyTotalDeltas },
    )
    const dailyAccelSumsByCryptoId = dailyAccelSumsByCrypto.reduce(
      (memo, arr) => {
        const item = arr[0]
        memo[item.id] = arr
        return memo
      },
      {} as { [id: number]: DailyAccelSums },
    )

    // SCORES!
    const dailyMinMaxScores = DAYS.map((day) => new MinMaxState(0))
    const dailyScoreRankings: SortedList<{
      id: number
      score: number
    }>[] = DAYS.map(
      (day) =>
        new SortedList<{ id: number; score: number }>({
          comparator: (a, b) => {
            if (a.score < b.score) return 1
            if (a.score > b.score) return -1
            if (a.score === b.score) return 0
          },
        }),
    )
    rankingsByCrypto.forEach((cryptoRankings) => {
      const cryptoQuote = cryptoRankings[0]
      const id = cryptoQuote.id

      DAYS.forEach((day, dayIndex) => {
        const total = dailyTotalDeltasByCryptoId[id][dayIndex]
        const accelSum = dailyAccelSumsByCryptoId[id][dayIndex]
        const {
          price_delta_pct_min_max,
          mkt_rank_delta_min_max,
        } = dailyMinMaxTotalDeltas[dayIndex]
        const {
          // price_pct_accels_sum_min_max,
          mkt_rank_accels_sum_min_max,
        } = dailyMinMaxAccelSums[dayIndex]

        const price_delta_pct_score =
          (total.price_delta_pct / price_delta_pct_min_max.max) * 100
        const price_delta_pct_accels_sum_score =
          (accelSum.price_pct_accels_sum / mkt_rank_delta_min_max.max) * 100
        const mkt_rank_accels_sum_score =
          (accelSum.mkt_rank_accels_sum / mkt_rank_accels_sum_min_max.max) * 100

        // score weights
        const w1 = 30
        const w2 = 4.5 * ((95 - day) / (100 + day * 5))
        const w3 =
          total.end.mkt_rank < 10
            ? 10
            : total.end.mkt_rank < 25
            ? 8
            : total.end.mkt_rank < 50
            ? 6
            : total.end.mkt_rank < 100
            ? 5
            : total.end.mkt_rank < 200
            ? 3
            : total.end.mkt_rank < 300
            ? 1
            : 1

        let score =
          ((w1 * price_delta_pct_score +
            w2 * price_delta_pct_accels_sum_score +
            w3 * mkt_rank_accels_sum_score) /
            ((w1 + w2 + w3) * 100)) *
          100

        if (isNaN(score) || ~total.name.indexOf('Cocos')) {
          score = NAN_SCORE
        } else {
          dailyMinMaxScores[dayIndex].compare(score)
        }

        total.score = score

        dailyScoreRankings[dayIndex].add({
          id: total.id,
          score: total.score,
        })
      })
    })

    const result = {
      key,
      rankingsByCryptoId,
      // deltasByCryptoId,
      // accelsByCryptoId,
      // dailyAccelSumsByCryptoId,
      dailyScoreRankings,
      dailyTotalDeltasByCrypto,
      dailyMinMaxTotalDeltas,
      dailyMinMaxScores,
    }

    cache[key] = result

    return result
  }
}

export const topCryptos = new TopCryptosApiClient()

function lastItem<T>(arr: Array<T>): T {
  return arr[arr.length - 1]
}
