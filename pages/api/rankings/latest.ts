import { CoinGecko, coingecko } from '../../../modules/coingecko'
import { ListingsOpts, cmc } from '../../../modules/coinmarketcap'
import type { NextApiRequest, NextApiResponse } from 'next'

import { get } from 'env-var'

type Resolved<T> = T extends PromiseLike<infer U> ? U : T

const USE_COINGECKO_API = get('USE_COINGECKO_API').asBool()

export type HourlyRankingsQuery = {
  hoursSkip?: string
  hoursLimit?: string
}

export default async (req: NextApiRequest, res: NextApiResponse<{}>) => {
  const maxRank = intParam(req.query.maxRank) ?? 500
  const minMarketCap = intParam(req.query.minMarketCap) ?? 10 * 1e6

  const query: ListingsOpts = {
    start: 1,
    limit: 500,
  }

  let coingeckoResult: Resolved<ReturnType<typeof cmc.listings>>
  const markets = await coingecko.markets({
    limit: query.limit,
  })
  coingeckoResult = markets ? CoinGecko.toCMCListing(markets) : null
  // @ts-ignore
  coingeckoResult.data = coingeckoResult.data.slice(0, maxRank)
  if (minMarketCap) {
    // @ts-ignore
    coingeckoResult.data = coingeckoResult.data.filter(
      (c) => c.quote.USD.market_cap > minMarketCap,
    )
  }
  // @ts-ignore
  coingeckoResult.data = coingeckoResult.data.map(
    (r) => r.quote.USD.last_updated,
  )

  let cmcResult: Resolved<ReturnType<typeof cmc.listings>> = await cmc.listings(
    query,
  )
  // @ts-ignore
  cmcResult.data = cmcResult.data.slice(0, maxRank)
  if (minMarketCap) {
    // @ts-ignore
    cmcResult.data = cmcResult.data.filter(
      (c) => c.quote.USD.market_cap > minMarketCap,
    )
  }
  // @ts-ignore
  cmcResult.data = cmcResult.data.map((r) => r.quote.USD.last_updated)

  const result = {
    coingecko: coingeckoResult.data,
    coinmarketcap: cmcResult.data,
  }

  res.status(200).json(result)
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
