import type { NextApiRequest, NextApiResponse } from 'next'
import { readExchangeMapState, toClientMap } from '../../modules/exchangeStore'

import type { ExchangeMap } from '../../modules/exchangeMap'

const EMPTY: ExchangeMap = {
  generatedAt: new Date(0).toISOString(),
  exchanges: [],
  exchangeIdsByCoinId: {},
}

/**
 * Serves the exchange -> coin map built by the refresh cron.
 *
 * Returns an empty map rather than a 404 when the cron has not populated it
 * yet: the filter is additive, and the client disables the control on an empty
 * `exchanges` list, so the rest of the page keeps working. `toClientMap` strips
 * the cron's bookkeeping (raw per-exchange membership, refresh timestamps) so
 * none of it reaches the browser.
 */
export default async function handler(
  _req: NextApiRequest,
  res: NextApiResponse<ExchangeMap>,
) {
  try {
    const map = toClientMap(await readExchangeMapState())
    // max-age=0 keeps browsers revalidating (otherwise they cache this
    // heuristically and pin a stale exchange list), while s-maxage lets the CDN
    // absorb the traffic.
    res.setHeader(
      'Cache-Control',
      'public, max-age=0, s-maxage=1800, stale-while-revalidate=86400',
    )
    return res.status(200).json(map ?? EMPTY)
  } catch (err) {
    console.error('exchanges: read failed', err)
    return res.status(200).json(EMPTY)
  }
}
