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
    //
    // s-maxage is deliberately short. The refresh cron rewrites this map every
    // hour, and while it is still converging each run adds exchanges — a long
    // CDN TTL pinned an empty map on the edge and left the filter looking
    // broken. The route only reads one ~9KB object, so refreshing often is cheap.
    res.setHeader(
      'Cache-Control',
      'public, max-age=0, s-maxage=60, stale-while-revalidate=300',
    )
    return res.status(200).json(map ?? EMPTY)
  } catch (err) {
    console.error('exchanges: read failed', err)
    return res.status(200).json(EMPTY)
  }
}
