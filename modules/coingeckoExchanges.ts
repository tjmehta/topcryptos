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

/** Widest page the endpoint serves. One call, so asking for it is free. */
const EXCHANGES_PAGE_MAX = 250

/**
 * The top `limit` exchanges by trust-score rank, plus any of `extraIds`.
 *
 * The extras list exists because ranking by trust score alone can never
 * surface a DEX: CoinGecko caps every DEX at `trust_score: 2` while CEXes
 * reach 9-10, so the highest-ranked DEX sits near rank 170 and a top-20 cut is
 * always 100% centralised. Naming them explicitly is the only way in.
 *
 * Widening the page costs nothing — it is the same single request — so the
 * extras are picked out of one ranked fetch rather than a second lookup.
 */
export async function fetchTopExchanges(
  limit: number,
  extraIds: string[] = [],
): Promise<ExchangeSummary[]> {
  const perPage =
    extraIds.length > 0 ? EXCHANGES_PAGE_MAX : Math.min(limit, EXCHANGES_PAGE_MAX)
  const raw = await cgGet<any[]>(`/exchanges?per_page=${perPage}&page=1`)
  const summarize = (e: any): ExchangeSummary => ({
    id: e.id,
    name: e.name,
    rank: typeof e.trust_score_rank === 'number' ? e.trust_score_rank : null,
  })

  // The response is already ordered by trust-score rank.
  const top = raw.slice(0, limit).map(summarize)
  const seen = new Set(top.map((e) => e.id))
  const extras = extraIds
    .map((id) => raw.find((e) => e?.id === id))
    .filter((e) => e != null && !seen.has(e.id))
    .map(summarize)

  return [...top, ...extras]
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
