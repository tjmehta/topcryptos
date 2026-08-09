import type { ExchangeMap, ExchangeMapState, GeckoCoin } from './exchangeMap'

import FSStore from './FSStore'
import S3Store from './S3Store'
import { get } from 'env-var'
import path from 'path'

const USE_FS_CACHE = get('USE_FS_CACHE').asBool()
const CACHE_STORE_DIR = get('CACHE_STORE_DIR').required().asString()

const store = USE_FS_CACHE
  ? new FSStore(path.resolve(CACHE_STORE_DIR, 'coinmarketcap'))
  : new S3Store()

/**
 * Versioned so the shape can change without a migration: bump the suffix and
 * the next cron run writes a fresh object, while readers of the old key simply
 * miss and fall back to "filter unavailable".
 */
export const EXCHANGE_MAP_KEY = 'exchange_map_state:v1'

/**
 * CoinGecko's full coin list, cached separately and refreshed weekly.
 *
 * It is ~18k entries and exists only to power the slug/name/symbol join, so it
 * must not live in the object the browser downloads.
 */
export const GECKO_COINS_KEY = 'coingecko_coins:v1'

export async function readExchangeMapState(): Promise<ExchangeMapState | null> {
  return store.get<ExchangeMapState>(EXCHANGE_MAP_KEY)
}

export async function writeExchangeMapState(
  state: ExchangeMapState,
): Promise<void> {
  await store.set(EXCHANGE_MAP_KEY, state)
}

/** Only the fields the client needs — see GECKO_COINS_KEY above. */
export function toClientMap(state: ExchangeMapState | null): ExchangeMap | null {
  if (state == null) return null
  return {
    generatedAt: state.generatedAt,
    exchanges: state.exchanges,
    exchangeIdsByCoinId: state.exchangeIdsByCoinId,
  }
}

export async function readGeckoCoins(): Promise<{
  fetchedAt: string
  coins: GeckoCoin[]
} | null> {
  return store.get(GECKO_COINS_KEY)
}

export async function writeGeckoCoins(coins: GeckoCoin[]): Promise<void> {
  await store.set(GECKO_COINS_KEY, {
    fetchedAt: new Date().toISOString(),
    coins,
  })
}
