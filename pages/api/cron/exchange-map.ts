import {
  ExchangeMapState,
  buildExchangeMap,
  pickStaleExchanges,
  resolveGeckoIds,
} from '../../../modules/exchangeMap'
import {
  fetchExchangeCoinIds,
  fetchGeckoCoinList,
  fetchTopExchanges,
  hasCoinGeckoKey,
} from '../../../modules/coingeckoExchanges'
import {
  readExchangeMapState,
  readGeckoCoins,
  writeExchangeMapState,
  writeGeckoCoins,
} from '../../../modules/exchangeStore'

import type { NextApiRequest, NextApiResponse } from 'next'
import { cmc } from '../../../modules/coinmarketcap'
import { get } from 'env-var'

const CRON_SECRET = get('CRON_SECRET').asString()
const TOP_EXCHANGES = get('CG_TOP_EXCHANGES').default(20).asIntPositive()

// Keyless CoinGecko hard-429s after ~3 calls, so the default rotation fits in
// that budget. A free Demo key raises the ceiling to 30/min; these env vars let
// you converge faster without a code change.
const PER_RUN = get('CG_EXCHANGES_PER_RUN')
  .default(hasCoinGeckoKey ? 6 : 2)
  .asIntPositive()
const TICKER_PAGES = get('CG_TICKER_PAGES')
  .default(hasCoinGeckoKey ? 3 : 1)
  .asIntPositive()

const WEEK_MS = 7 * 24 * 60 * 60 * 1000

export const config = { maxDuration: 300 }

function emptyState(): ExchangeMapState {
  return {
    generatedAt: new Date(0).toISOString(),
    exchanges: [],
    exchangeIdsByCoinId: {},
    roster: [],
    rosterFetchedAt: new Date(0).toISOString(),
    geckoCoinIdsByExchangeId: {},
    refreshedAt: {},
  }
}

/**
 * Incrementally rebuilds the exchange -> coin map.
 *
 * Each run refreshes only the most overdue handful of exchanges and merges the
 * result into stored state, so the map converges over several runs and then
 * keeps itself current. That is what makes this work with no CoinGecko API key
 * at all; with one, the same code simply covers more ground per run.
 */
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (!CRON_SECRET || req.headers.authorization !== `Bearer ${CRON_SECRET}`) {
    return res.status(401).json({ ok: false, error: 'unauthorized' })
  }

  try {
    const stored = await readExchangeMapState()
    const state: ExchangeMapState = { ...emptyState(), ...(stored ?? {}) }

    let callsSpent = 0

    // 1. Exchange roster — changes far more slowly than membership, so this is
    //    usually skipped and costs nothing.
    if (
      state.roster.length === 0 ||
      Date.now() - new Date(state.rosterFetchedAt).valueOf() > WEEK_MS
    ) {
      state.roster = await fetchTopExchanges(TOP_EXCHANGES)
      state.rosterFetchedAt = new Date().toISOString()
      callsSpent += 1
    }

    // 2. CoinGecko's coin list, cached weekly under its own key. Without it the
    //    join degrades to slug-only (~70% of the top 500); with it the
    //    slug -> name -> symbol cascade reaches ~95%.
    const cachedCoins = await readGeckoCoins()
    let geckoCoins = cachedCoins?.coins ?? []
    if (
      geckoCoins.length === 0 ||
      Date.now() - new Date(cachedCoins!.fetchedAt).valueOf() > WEEK_MS
    ) {
      try {
        geckoCoins = await fetchGeckoCoinList()
        callsSpent += 1
        await writeGeckoCoins(geckoCoins)
      } catch (err) {
        // Non-fatal: fall back to whatever is cached (possibly nothing, which
        // just means a weaker join this run).
        console.warn('exchange-map: coin list refresh failed', err)
      }
    }

    // 3. Refresh the most overdue exchanges.
    const targets = pickStaleExchanges(state.roster, state.refreshedAt, PER_RUN)
    const refreshed: string[] = []
    const failed: Array<{ id: string; error: string }> = []

    for (const exchange of targets) {
      try {
        const coinIds = await fetchExchangeCoinIds(exchange.id, TICKER_PAGES)
        callsSpent += TICKER_PAGES
        if (coinIds.length > 0) {
          state.geckoCoinIdsByExchangeId[exchange.id] = coinIds
          state.refreshedAt[exchange.id] = new Date().toISOString()
          refreshed.push(exchange.id)
        }
      } catch (err) {
        failed.push({
          id: exchange.id,
          error: err instanceof Error ? err.message : String(err),
        })
        // Almost always rate limiting. Stop rather than burn the remaining
        // budget; the rotation retries this exchange on the next run.
        break
      }
    }

    // 4. Re-derive the CMC join. Coins enter and leave the top 500 constantly,
    //    so this is recomputed every run rather than persisted.
    //
    //    The universe comes from the snapshots the app itself renders, not a
    //    live listings call: it costs no CMC credit, it cannot drift from what
    //    the UI is filtering, and it means this cron runs locally against a
    //    seeded FS cache with no API key.
    const today = new Date()
    const yesterday = new Date(today.valueOf() - 24 * 60 * 60 * 1000)
    const listings =
      (await cmc.dailyCachedMarkets({ start: 1, limit: 500, date: today })) ??
      (await cmc.dailyCachedMarkets({ start: 1, limit: 500, date: yesterday }))

    const coins = (listings?.data ?? []).map((d) => ({
      id: String(d.id),
      name: d.name,
      symbol: d.symbol,
      slug: d.slug,
    }))
    const resolution = resolveGeckoIds(coins, geckoCoins)

    const built = buildExchangeMap({
      exchanges: state.roster,
      geckoCoinIdsByExchangeId: state.geckoCoinIdsByExchangeId,
      cmcIdByGeckoId: resolution.cmcIdByGeckoId,
      generatedAt: new Date().toISOString(),
    })

    await writeExchangeMapState({
      generatedAt: built.generatedAt,
      // Serve only exchanges that resolved to at least one coin...
      exchanges: built.exchanges,
      exchangeIdsByCoinId: built.exchangeIdsByCoinId,
      // ...but persist the untrimmed roster, plus raw membership and refresh
      // timestamps, so the rotation keeps reaching exchanges with no data yet.
      roster: state.roster,
      rosterFetchedAt: state.rosterFetchedAt,
      geckoCoinIdsByExchangeId: state.geckoCoinIdsByExchangeId,
      refreshedAt: state.refreshedAt,
    })

    const summary = {
      refreshed,
      failed,
      hasCoinGeckoKey,
      callsSpent,
      exchangesKnown: state.roster.length,
      exchangesWithData: Object.keys(state.geckoCoinIdsByExchangeId).length,
      exchangesServed: built.exchanges.length,
      coinsCovered: Object.keys(built.exchangeIdsByCoinId).length,
      coinsInUniverse: coins.length,
      unresolvedCoins: resolution.unresolved.length,
      geckoCoinListSize: geckoCoins.length,
    }
    console.log('exchange-map cron', summary)

    return res.status(200).json({ ok: true, ...summary })
  } catch (err) {
    console.error('exchange-map cron: failed', err)
    return res.status(500).json({
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    })
  }
}
