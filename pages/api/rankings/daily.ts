import { CoinGecko, coingecko } from '../../../modules/coingecko'
import { Listings, ListingsOpts, cmc } from '../../../modules/coinmarketcap'
import { intParam } from '../../../modules/queryParams'
import type { NextApiRequest, NextApiResponse } from 'next'

import { get } from 'env-var'
import { setHour } from './../../../modules/roundToHour'
import { timesParallel } from 'times-loop'

type Resolved<T> = T extends PromiseLike<infer U> ? U : T

const USE_COINGECKO_API = get('USE_COINGECKO_API').asBool()

export type { RankingsResponse } from '../../../modules/uiTypes'

export type DailyRankingsQuery = {
  daySkip?: string
  dayLimit?: string
}

export default async (
  req: NextApiRequest,
  res: NextApiResponse<Listings[]>,
) => {
  const daySkip = intParam(req.query.daySkip) ?? 0
  const dayLimit = intParam(req.query.dayLimit) ?? 10
  const maxRank = intParam(req.query.maxRank) ?? 500
  const minMarketCap = intParam(req.query.minMarketCap) ?? 10 * 1e6

  // console.log('query', req.query, {
  //   daySkip,
  //   dayLimit,
  // })

  const dailyRankingsResponse: Listings[] = (
    await timesParallel(dayLimit, async (i) => {
      try {
        const day = daySkip + i
        const query: ListingsOpts = {
          start: 1,
          limit: 500,
        }

        if (i > 0 || daySkip > 0) {
          const date = new Date()
          date.setDate(date.getDate() - day)
          query.date = setHour(date, 23)
        }

        const result = USE_COINGECKO_API
          ? await fetchFromGecko(query)
          : await fetchFromCMC(query)

        // @ts-ignore
        result.data = result.data.slice(0, maxRank)
        if (minMarketCap) {
          // @ts-ignore
          result.data = result.data.filter(
            (c) => c.quote.USD.market_cap > minMarketCap,
          )
        }

        return result
      } catch (err) {
        if (/cache miss/.test(err.message)) {
          console.warn('cache miss:', err.message)
          return null
        }
        console.error('LISTINGS ERROR', err)
        return null
      }
    })
  )
    .filter((v) => v != null)
    .reverse()

  res.status(200).json(dailyRankingsResponse)
}


async function fetchFromGecko(query: ListingsOpts, noFallback?: boolean) {
  const date = query.date
  try {
    const markets = date
      ? await coingecko.dailyCachedMarkets({
          limit: query.limit,
          date,
        })
      : await coingecko.markets({
          limit: query.limit,
        })
    if (markets == null)
      throw { message: `gecko cache miss: ${date?.toISOString()}` }
    return CoinGecko.toCMCListing(markets)
  } catch (err) {
    // if (noFallback) throw err // loops back and fetches from CMC History API
    console.warn('fetchFromGecko warn', err.message)
    return fetchFromCMC(query, true /* no fallback */)
  }
}

async function fetchFromCMC(query: ListingsOpts, noFallback?: boolean) {
  const date = query.date
  try {
    const result = date
      ? await cmc.dailyCachedMarkets({ ...query, date })
      : await cmc.listings(query)
    if (result == null)
      throw { message: `cmc cache miss: ${date?.toISOString()}` }
    return result
  } catch (err) {
    if (noFallback) {
      console.warn(`Using CMC History API! ${date?.toISOString()}`)
      return cmc.listings(query)
    }
    console.warn('fetchFromGecko warn', err.message)
    return fetchFromGecko(query, true /* no fallback */)
  }
}
