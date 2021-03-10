import { Listings, ListingsOpts, cmc } from '../../../modules/coinmarketcap'
import type { NextApiRequest, NextApiResponse } from 'next'

import { timesParallel } from 'times-loop'

export default async (
  req: NextApiRequest,
  res: NextApiResponse<Listings[]>,
) => {
  const limit = intParam(req.query.limit) ?? 30
  const maxRank = intParam(req.query.maxRank) ?? 300
  const minMarketCap = intParam(req.query.minMarketCap) ?? 10 * 1e6

  const listingSnapshots = await timesParallel(limit, async (i) => {
    const query: ListingsOpts = {
      start: 1,
      limit: 500,
    }

    if (i > 0) {
      const date = new Date()
      date.setDate(date.getDate() - i)
      const strDate = `${[
        date.getFullYear(),
        zpad(date.getMonth() + 1),
        zpad(date.getDate()),
      ].join('-')}T23:00:00.000Z`
      query.date = new Date(strDate)
    }

    const result = await cmc.listings(query)
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

  res.status(200).json(listingSnapshots.reverse())
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
