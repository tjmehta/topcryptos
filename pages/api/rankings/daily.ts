import { CoinGecko, coingecko } from '../../../modules/coingecko'
import { Listings, ListingsOpts, cmc } from '../../../modules/coinmarketcap'
import type { NextApiRequest, NextApiResponse } from 'next'

import { Market } from './../../../modules/coingecko'
import { get } from 'env-var'
import { timesParallel } from 'times-loop'

type Resolved<T> = T extends PromiseLike<infer U> ? U : T

const USE_COINGECKO_API = get('USE_COINGECKO_API').asBool()

export type DailyRankingsResponse = Listings[]

export default async (
  req: NextApiRequest,
  res: NextApiResponse<Listings[]>,
) => {
  const daySkip = intParam(req.query.daySkip) ?? 0
  const dayLimit = intParam(req.query.dayLimit) ?? 10
  const maxRank = intParam(req.query.maxRank) ?? 500
  const minMarketCap = intParam(req.query.minMarketCap) ?? 10 * 1e6

  console.log('query', req.query, {
    daySkip,
    dayLimit,
  })

  const dailyRankingsResponse: Listings[] = (
    await timesParallel(dayLimit, async (i) => {
      const day = daySkip + i
      const query: ListingsOpts = {
        start: 1,
        limit: 500,
      }

      if (i > 0 || daySkip > 0) {
        const date = new Date()
        date.setDate(date.getDate() - day)
        const strDate = `${[
          date.getFullYear(),
          zpad(date.getMonth() + 1),
          zpad(date.getDate()),
        ].join('-')}T23:00:00.000Z`
        query.date = new Date(strDate)
      }

      let result: Resolved<ReturnType<typeof cmc.listings>>
      try {
        if (USE_COINGECKO_API) {
          let markets: Market[] | null
          if (query.date) {
            markets = await coingecko.dailyCachedMarkets({
              limit: query.limit,
              date: query.date,
            })
          } else {
            markets = await coingecko.markets({
              limit: query.limit,
            })
          }
          if (markets == null) {
            // fallback to cmc cache
            console.warn(
              'falling back to cmc cache: ' + query.date.toISOString(),
            )
            result = await cmc.listings(query)
          } else {
            result = CoinGecko.toCMCListing(markets)
          }
        } else {
          result = await cmc.listings(query)
        }
        //console.log('THIS IS QUERY HERE' + query.date)
      } catch (err) {
        console.error('LISTINGS ERROR', err)
        return null
      }
      // @ts-ignore
      result.data = result.data.slice(0, maxRank)
      if (minMarketCap) {
        // @ts-ignore
        result.data = result.data.filter(
          (c) => c.quote.USD.market_cap > minMarketCap,
        )
      }

      return result
    })
  )
    .filter((v) => v != null)
    .reverse()

  res.status(200).json(dailyRankingsResponse)
}

function stringParam(param: null | string | string[]): string | null {
  if (param == null) return null
  if (typeof param === 'string') return param
  return param[0] ?? null
}
function intParam(param: null | string | string[]): number | null {
  const str = stringParam(param)
  if (str == null) return null
  const num = parseInt(str, 10)
  if (isNaN(num)) return null
  return num
}
function zpad(val: number): string {
  let str = val.toString()
  return str.length === 1 ? `0${str}` : str
}
