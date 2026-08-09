import type { ExchangeSummary } from './exchangeMap'
import { get } from 'env-var'

/**
 * Thin CoinGecko client for exchange membership.
 *
 * Keyless CoinGecko hard-429s after roughly three calls, which is why the
 * refresh cron rebuilds the map a couple of exchanges at a time rather than in
 * one sweep (see pages/api/cron/exchange-map.ts). Setting `CG_API_KEY` to a free
 * Demo key raises the ceiling to 30 req/min and lets each run cover more ground
 * via CG_EXCHANGES_PER_RUN / CG_TICKER_PAGES — no code change needed.
 */

const CG_API_KEY = get('CG_API_KEY').asString()
const BASE = CG_API_KEY
  ? 'https://api.coingecko.com/api/v3'
  : 'https://api.coingecko.com/api/v3'

export class RateLimitedError extends Error {
  constructor(path: string) {
    super(`coingecko rate limited: ${path}`)
    this.name = 'RateLimitedError'
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

async function cgGet<T>(path: string, attempt = 0): Promise<T> {
  const headers: Record<string, string> = { accept: 'application/json' }
  if (CG_API_KEY) headers['x-cg-demo-api-key'] = CG_API_KEY

  const res = await fetch(`${BASE}${path}`, { headers })

  if (res.status === 429) {
    // Two retries with a short backoff. Beyond that, let the caller record
    // partial progress and pick up on the next scheduled run rather than
    // burning the whole function timeout waiting.
    if (attempt >= 2) throw new RateLimitedError(path)
    await sleep((attempt + 1) * 8000)
    return cgGet<T>(path, attempt + 1)
  }
  if (!res.ok) throw new Error(`coingecko ${res.status}: ${path}`)
  return (await res.json()) as T
}

export async function fetchTopExchanges(limit: number): Promise<ExchangeSummary[]> {
  const raw = await cgGet<any[]>(`/exchanges?per_page=${limit}&page=1`)
  return raw.map((e) => ({
    id: e.id,
    name: e.name,
    rank: typeof e.trust_score_rank === 'number' ? e.trust_score_rank : null,
  }))
}

/**
 * CoinGecko coin ids trading on `exchangeId`, highest volume first.
 *
 * Ordering matters: only the first page or two are fetched, so volume ordering
 * is what makes those pages cover the large-cap coins this app actually ranks.
 */
export async function fetchExchangeCoinIds(
  exchangeId: string,
  pages: number,
): Promise<string[]> {
  const ids = new Set<string>()

  for (let page = 1; page <= pages; page++) {
    const body = await cgGet<{ tickers?: any[] }>(
      `/exchanges/${encodeURIComponent(exchangeId)}/tickers?page=${page}&order=volume_desc`,
    )
    const tickers = body?.tickers ?? []
    for (const t of tickers) {
      if (typeof t?.coin_id === 'string') ids.add(t.coin_id)
    }
    if (tickers.length < 100) break // last page
  }

  return [...ids]
}

/**
 * CoinGecko's full coin list (~18k entries).
 *
 * One call, cached weekly by the refresh cron. It is what lets the CMC join use
 * the name and symbol fallbacks instead of exact-slug matches only.
 */
export async function fetchGeckoCoinList(): Promise<
  Array<{ id: string; symbol: string; name: string }>
> {
  const raw = await cgGet<any[]>('/coins/list')
  return raw.map((c) => ({ id: c.id, symbol: c.symbol, name: c.name }))
}

export const hasCoinGeckoKey = Boolean(CG_API_KEY)
