import { CoinGecko, coingecko } from '../../../modules/coingecko'
import { Listings, ListingsOpts, cmc } from '../../../modules/coinmarketcap'
import type { NextApiRequest, NextApiResponse } from 'next'

import { RankingsResponse as _RankingsResponse } from './daily'
import { ceilHour } from './../../../modules/roundToHour'
import { get } from 'env-var'
import { timesParallel } from 'times-loop'

type Resolved<T> = T extends PromiseLike<infer U> ? U : T

const USE_COINGECKO_API = get('USE_COINGECKO_API').asBool()

export type RankingsResponse = _RankingsResponse

export type HourlyRankingsQuery = {
  hoursSkip?: string
  hoursLimit?: string
}

export default async (
  req: NextApiRequest,
  res: NextApiResponse<Listings[]>,
) => {
  const hoursSkip = intParam(req.query.hoursSkip) ?? 0
  const hoursLimit = intParam(req.query.hoursLimit) ?? 10
  const maxRank = intParam(req.query.maxRank) ?? 500
  const minMarketCap = intParam(req.query.minMarketCap) ?? 10 * 1e6

  console.log('query', req.query, {
    hoursSkip,
    hoursLimit,
  })

  const hourlyRankingsResponse: Listings[] = (
    await timesParallel(hoursLimit, async (i) => {
      try {
        const hours = hoursSkip + i
        const query: ListingsOpts = {
          start: 1,
          limit: 500,
        }

        if (i > 0 || hoursSkip > 0) {
          const date = ceilHour(new Date())
          date.setHours(date.getHours() - hours)
          query.date = date
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

  res.status(200).json(hourlyRankingsResponse)
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

async function fetchFromGecko(query: ListingsOpts, noFallback?: boolean) {
  try {
    const markets = query.date
      ? await coingecko.hourlyCachedMarkets({
          limit: query.limit,
          date: query.date,
        })
      : await coingecko.markets({
          limit: query.limit,
        })
    if (markets == null)
      throw { message: `gecko cache miss: ${query.date?.toISOString()}` }
    return CoinGecko.toCMCListing(markets)
  } catch (err) {
    if (noFallback) throw err
    console.warn('fetchFromGecko warn', err.message)
    return fetchFromCMC(query, true /* no fallback */)
  }
}

async function fetchFromCMC(query: ListingsOpts, noFallback?: boolean) {
  try {
    const result = query.date
      ? await cmc.hourlyCachedMarkets(query)
      : await cmc.listings(query)
    if (result == null)
      throw { message: `cmc cache miss: ${query.date?.toISOString()}` }
    return result
  } catch (err) {
    if (noFallback) throw err
    console.warn('fetchFromGecko warn', err.message)
    return fetchFromGecko(query, true /* no fallback */)
  }
}
