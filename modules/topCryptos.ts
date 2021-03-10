import { groupBy, last, map, mergeMap, pairwise, toArray } from 'rxjs/operators'

import ApiClient from 'simple-api-client'
import { RankingsData } from '../pages/api/rankings/hourly'
import { from } from 'rxjs'
import stringify from 'fast-json-stable-stringify'

type RankingsOpts = {
  maxRank?: number
  limit?: number
}
type RankingsQuery = {
  [P in keyof RankingsOpts]: string
}

type Resolved<T> = T extends PromiseLike<infer U> ? U : T

export type RankingsResult = Resolved<
  ReturnType<typeof TopCryptosApiClient.prototype.getRankings>
>

const cache = {}

export class TopCryptosApiClient extends ApiClient {
  constructor() {
    super('/')
  }
  async getRankings(opts: RankingsOpts) {
    const query: RankingsQuery = {}
    Object.keys(opts).forEach((key) => {
      if (opts[key] == null) return
      query[key] = opts[key].toString()
    })
    const key = stringify(query)
    if (cache[key]) return cache[key] as never

    const rankings: Array<RankingsData> = await this.get<RankingsQuery>(
      'api/rankings/daily',
      200,
      {
        query,
      },
    )
    rankings.forEach((ranking) => {
      ranking.data
        .sort((a, b) => {
          if (a.quote.USD.market_cap > b.quote.USD.market_cap) return -1
          if (a.quote.USD.market_cap < b.quote.USD.market_cap) return 1
          return 0
        })
        .forEach((rankData, i) => {
          // @ts-ignore - rank
          rankData.rank = i + 1
        })
    })
    const rankingObservablesByCrypto = from(rankings).pipe(
      mergeMap((ranking) => {
        return from(ranking.data).pipe(
          map((rankData) => {
            // @ts-ignore - rank
            const { id, name, symbol, slug, cmc_rank, rank, quote } = rankData
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

    const deltaObservablesByCrypto = from(rankingObservablesByCrypto).pipe(
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

    const accelObservablesByCrypto = from(deltaObservablesByCrypto).pipe(
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

    const [
      rankingsByCrypto,
      deltasByCrypto,
      accelsByCrypto,
      totalDeltasByCrypto,
    ] = await Promise.all([
      from(rankingObservablesByCrypto)
        .pipe(
          mergeMap((group) => {
            return group.pipe(toArray())
          }),
          toArray(),
        )
        .toPromise(),
      from(deltaObservablesByCrypto)
        .pipe(
          mergeMap((group) => {
            return group.pipe(toArray())
          }),
          toArray(),
        )
        .toPromise(),
      from(accelObservablesByCrypto)
        .pipe(
          mergeMap((group) => {
            return group.pipe(toArray())
          }),
          toArray(),
        )
        .toPromise(),
      from(rankingObservablesByCrypto)
        .pipe(
          mergeMap((group) => {
            return group.pipe(
              toArray(),
              map((arr) => {
                const pair = [arr[0], lastItem(arr)]
                const { id, name, symbol, slug } = pair[0]
                const prev_date = new Date(pair[0].last_updated).valueOf()
                const next_date = new Date(pair[1].last_updated).valueOf()

                return {
                  id,
                  name,
                  symbol,
                  slug,
                  start: pair[0],
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
                }
              }),
            )
          }),
          toArray(),
        )
        .toPromise(),
    ])

    type Rankings = typeof rankingsByCrypto[0]
    type Deltas = typeof deltasByCrypto[0]
    type Accels = typeof accelsByCrypto[0]
    type TotalDelta = typeof totalDeltasByCrypto[0]

    const result = {
      rankingsByCrypto,
      deltasByCrypto,
      accelsByCrypto,
      totalDeltasByCrypto,
      rankingsByCryptoId: rankingsByCrypto.reduce((memo, item) => {
        memo[item[0].id] = item
        return memo
      }, {} as { [id: number]: Rankings }),
      deltasByCryptoId: deltasByCrypto.reduce((memo, item) => {
        memo[item[0].id] = item
        return memo
      }, {} as { [id: number]: Deltas }),
      accelsByCryptoId: accelsByCrypto.reduce((memo, item) => {
        memo[item[0].id] = item
        return memo
      }, {} as { [id: number]: Accels }),
      totalDeltasByCryptoId: totalDeltasByCrypto.reduce((memo, item) => {
        memo[item.id] = item
        return memo
      }, {} as { [id: number]: TotalDelta }),
    }

    cache[key] = result

    return result
  }
}

export const topCryptos = new TopCryptosApiClient()

function lastItem<T>(arr: Array<T>): T {
  return arr[arr.length - 1]
}
