/** Public spot market data for the user's venues. No account or trading APIs. */
import type { OhlcBar, OhlcInstrument } from './ohlcAlgorithms'

export type Exchange = 'coinbase' | 'kraken'
export type ExchangeEntryUnavailableReason = 'missing-entry-bar' | 'inactive-entry' | 'identity-gap' | null
export type ExchangeOhlcInstrument = OhlcInstrument & {
  symbol: string
  entry_price: number | null
  entry_unavailable_reason: ExchangeEntryUnavailableReason
}
export type ExchangeOhlcSnapshot = {
  exchange: Exchange
  quote_currency: 'USD'
  source: string
  source_url: string
  fetched_at: string
  universe_selected_at: string
  universe_description: string
  volume_method: 'close-times-base-volume' | 'vwap-times-base-volume'
  volume_description: string
  signal_date: string
  entry_date: string
  instruments: ExchangeOhlcInstrument[]
  expected_instruments: number
}
type Market = { id: string; symbol: string; quote_volume: number }
type Bar = { time: number; open: number; high: number; low: number; close: number; base_volume: number; quote_volume: number; trades?: number }
const DAY = 86_400_000
const CACHE_MS = 10 * 60_000
const STABLE_OR_FIAT = new Set(['USD', 'USDT', 'USDC', 'USDS', 'USDE', 'USD1', 'TUSD', 'BUSD', 'USDP', 'PAX', 'DAI', 'SUSD', 'FDUSD', 'AEUR', 'EUR', 'EURC', 'EURCV', 'UST', 'USTC', 'USDD', 'PYUSD', 'RLUSD', 'GUSD', 'GBP', 'CAD', 'AUD', 'CHF', 'JPY'])
const name = (exchange: Exchange) => exchange === 'coinbase' ? 'Coinbase' : 'Kraken'
const date = (time: number) => new Date(time).toISOString().slice(0, 10)
function object(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === 'object' && !Array.isArray(value)
}
function number(value: unknown, label: string): number {
  if ((typeof value !== 'number' && typeof value !== 'string') || (typeof value === 'string' && value.trim() === '')) throw new Error(`Invalid ${label}`)
  const n = Number(value)
  if (!Number.isFinite(n)) throw new Error(`Invalid ${label}`)
  return n
}
function turnover(volume: unknown, price: unknown): number {
  const v = number(volume, 'volume'), p = number(price, 'volume price')
  if (v < 0 || p < 0 || (v > 0 && p === 0) || !Number.isFinite(v * p)) throw new Error('Invalid turnover')
  return v * p
}
function topMarkets(markets: Market[]): Market[] {
  const chosen = markets.filter((m) => m.quote_volume > 0).sort((a, b) => b.quote_volume - a.quote_volume || a.symbol.localeCompare(b.symbol)).slice(0, 50)
  if (!chosen.length) throw new Error('No active USD spot markets are available')
  return chosen
}
function krakenResult(payload: unknown): Record<string, unknown> {
  if (!object(payload) || !Array.isArray(payload.error)) throw new Error('Kraken returned a malformed response')
  if (payload.error.length) throw new Error('Kraken market data unavailable: API error')
  if (!object(payload.result)) throw new Error('Kraken returned a malformed result')
  return payload.result
}

/** Coinbase USD products must exist on both public Advanced and Exchange catalogues. */
export function selectCoinbaseMarkets(products: unknown, tickers: unknown): Market[] {
  if (!Array.isArray(products) || !Array.isArray(tickers)) throw new Error('Coinbase returned an invalid catalogue')
  const active = new Set<string>(), seen = new Set<string>()
  for (const row of products) {
    if (!object(row) || typeof row.id !== 'string' || typeof row.base_currency !== 'string' || typeof row.quote_currency !== 'string') throw new Error('Coinbase returned an invalid instrument')
    if (seen.has(row.id)) throw new Error('Coinbase returned a duplicate instrument')
    seen.add(row.id)
    if (row.quote_currency !== 'USD' || STABLE_OR_FIAT.has(row.base_currency)) continue
    if (row.id !== `${row.base_currency}-USD`) throw new Error('Coinbase returned inconsistent identity')
    if (row.status === 'online' && !row.trading_disabled && !row.cancel_only && !row.post_only && !row.limit_only && !row.auction_mode && !row.fx_stablecoin) active.add(row.id)
  }
  seen.clear()
  const markets: Market[] = []
  for (const row of tickers) {
    if (!object(row) || typeof row.product_id !== 'string') throw new Error('Coinbase returned an invalid ticker')
    if (seen.has(row.product_id)) throw new Error('Coinbase returned a duplicate ticker')
    seen.add(row.product_id)
    if (!active.has(row.product_id)) continue
    if (row.product_type !== 'SPOT' || row.quote_currency_id !== 'USD' || row.status !== 'online' || row.is_disabled || row.view_only || row.trading_disabled || row.cancel_only || row.post_only || row.limit_only || row.auction_mode) continue
    const quote_volume = number(row.approximate_quote_24h_volume, 'Coinbase approximate quote volume')
    if (quote_volume < 0) throw new Error('Coinbase returned negative volume')
    markets.push({ id: row.product_id, symbol: row.product_id, quote_volume })
  }
  // These catalogues differ in coverage: use their explicit intersection, never
  // infer an Exchange candle identity from an Advanced-only product or alias.
  return topMarkets(markets)
}

export function selectKrakenMarkets(pairsPayload: unknown, tickerPayload: unknown): Market[] {
  const pairs = krakenResult(pairsPayload), tickers = krakenResult(tickerPayload)
  const markets: Market[] = [], seen = new Set<string>()
  for (const [id, row] of Object.entries(pairs)) {
    if (!object(row) || typeof row.wsname !== 'string' || typeof row.quote !== 'string' || typeof row.base !== 'string') throw new Error('Kraken returned an invalid instrument')
    if (row.status !== 'online' || row.quote !== 'ZUSD' || row.aclass_base !== 'currency' || row.aclass_quote !== 'currency' || id.endsWith('.d')) continue
    const parts = row.wsname.split('/')
    if (parts.length !== 2 || parts[1] !== 'USD' || !parts[0]) throw new Error('Kraken returned inconsistent USD identity')
    const base = parts[0] === 'XBT' ? 'BTC' : parts[0] === 'XDG' ? 'DOGE' : parts[0]
    if (STABLE_OR_FIAT.has(base)) continue
    const symbol = `${base}-USD`
    if (seen.has(symbol)) throw new Error('Kraken returned a duplicate USD market')
    seen.add(symbol)
    const ticker = tickers[id]
    if (!object(ticker) || !Array.isArray(ticker.v) || !Array.isArray(ticker.p)) throw new Error(`Kraken ticker missing for ${id}`)
    markets.push({ id, symbol, quote_volume: turnover(ticker.v[1], ticker.p[1]) })
  }
  return topMarkets(markets)
}

function parseBars(exchange: Exchange, payload: unknown, asOf: number): Bar[] {
  if (!Array.isArray(payload) || payload.length > (exchange === 'coinbase' ? 300 : 720)) throw new Error(`${name(exchange)} returned invalid candles`)
  const bars = payload.map((row): Bar => {
    if (!Array.isArray(row) || row.length !== (exchange === 'coinbase' ? 6 : 8)) throw new Error(`${name(exchange)} returned malformed candles`)
    const time = number(row[0], 'candle time') * 1000
    if (!Number.isSafeInteger(time) || time < 0 || time % DAY !== 0 || time > asOf) throw new Error('Invalid or future daily candle time')
    const open = number(row[exchange === 'coinbase' ? 3 : 1], 'open'), high = number(row[2], 'high')
    const low = number(row[exchange === 'coinbase' ? 1 : 3], 'low'), close = number(row[4], 'close')
    const base_volume = number(row[exchange === 'coinbase' ? 5 : 6], 'base volume')
    const quote_volume = turnover(base_volume, exchange === 'coinbase' ? close : row[5])
    const trades = exchange === 'kraken' ? number(row[7], 'trade count') : undefined
    if (Math.min(open, high, low, close) <= 0 || high < Math.max(open, close) || low > Math.min(open, close) || high < low || (trades != null && (!Number.isSafeInteger(trades) || trades < 0))) throw new Error('Invalid candle values')
    return { time, open, high, low, close, base_volume, quote_volume, trades }
  }).sort((a, b) => a.time - b.time) // Coinbase returns newest first.
  if (bars.some((bar, i) => i > 0 && bars[i - 1].time === bar.time)) throw new Error('Duplicate candle date')
  return bars
}

export function exchangeInstrument(exchange: Exchange, market: Pick<Market, 'id' | 'symbol'>, payload: unknown, signalTime: number, entryTime: number, asOf: number): ExchangeOhlcInstrument {
  const parsed = parseBars(exchange, payload, asOf)
  const instrument_key = `${date(signalTime).slice(0, 4)}:${exchange}:${market.id}:live-spot`
  const bars: OhlcBar[] = parsed.filter((bar) => bar.time <= signalTime && bar.time + DAY <= asOf).map((bar) => ({
    date: date(bar.time), instrument_key, open: bar.open, high: bar.high, low: bar.low, close: bar.close,
    quote_volume: bar.quote_volume, bar_status: 'complete',
  }))
  const entry = parsed.find((bar) => bar.time === entryTime)
  const continuous = [signalTime, signalTime + DAY, entryTime].every((time) => parsed.some((bar) => bar.time === time))
  const entry_unavailable_reason: ExchangeEntryUnavailableReason = entry == null || entryTime > asOf ? 'missing-entry-bar'
    : entry.base_volume <= 0 || entry.quote_volume <= 0 || entry.trades === 0 ? 'inactive-entry' : !continuous ? 'identity-gap' : null
  return { instrument_key, symbol: market.symbol, cohort_member: true, bars, entry_price: entry_unavailable_reason == null ? entry!.open : null, entry_unavailable_reason }
}

/** Per-venue isolated cache. Four candle workers, complete failure, no stale fallback. */
export function createExchangeOhlcProvider(exchange: Exchange, options: { fetcher?: typeof fetch; now?: () => number; requestSpacingMs?: number } = {}) {
  const now = options.now ?? Date.now
  let cached: { day: string; expires: number; snapshot: ExchangeOhlcSnapshot } | null = null
  let pending: Promise<ExchangeOhlcSnapshot> | null = null
  let launchGate = Promise.resolve()
  async function request(url: string): Promise<unknown> {
    // Concurrency alone does not enforce requests per second. Space starts to
    // stay below Coinbase's public 10 requests/second limit on fast responses.
    const turn = launchGate
    launchGate = turn.then(() => new Promise<void>((resolve) => setTimeout(resolve, options.requestSpacingMs ?? 150)))
    await turn
    const response = await (options.fetcher ?? fetch)(url, { headers: { accept: 'application/json' }, signal: AbortSignal.timeout(15_000) })
    if (!response.ok) throw new Error(`${name(exchange)} market data unavailable (${response.status})`)
    try { return await response.json() as unknown } catch { throw new Error(`${name(exchange)} returned malformed market data`) }
  }
  async function coinbaseTickers(): Promise<unknown[]> {
    const all: unknown[] = []
    let cursor = ''
    const seen = new Set<string>()
    for (let page = 0; page < 5; page++) {
      const url = new URL('https://api.coinbase.com/api/v3/brokerage/market/products')
      url.searchParams.set('limit', '1000'); url.searchParams.set('product_type', 'SPOT')
      if (cursor) url.searchParams.set('cursor', cursor)
      const payload = await request(url.toString())
      if (!object(payload) || !Array.isArray(payload.products) || !object(payload.pagination) || typeof payload.pagination.has_next !== 'boolean') throw new Error('Coinbase returned incomplete product pagination')
      all.push(...payload.products)
      if (!payload.pagination.has_next) return all
      const next = payload.pagination.next_cursor
      if (typeof next !== 'string' || !next || seen.has(next)) throw new Error('Coinbase returned invalid pagination cursor')
      seen.add(next); cursor = next
    }
    throw new Error('Coinbase product catalogue exceeds the bounded page limit')
  }
  async function fetchSnapshot(asOf: number): Promise<ExchangeOhlcSnapshot> {
    const entryTime = Math.floor(asOf / DAY) * DAY, signalTime = entryTime - 2 * DAY
    // Drain paired catalogue requests on failure, just like candle workers.
    const catalogue = await Promise.allSettled(exchange === 'coinbase'
      ? [request('https://api.exchange.coinbase.com/products'), coinbaseTickers()]
      : [request('https://api.kraken.com/0/public/AssetPairs?country_code=US&aclass_base=currency'), request('https://api.kraken.com/0/public/Ticker')])
    const failure = catalogue.find((r): r is PromiseRejectedResult => r.status === 'rejected')
    if (failure) throw failure.reason
    const values = catalogue.map((r) => (r as PromiseFulfilledResult<unknown>).value)
    const markets = exchange === 'coinbase' ? selectCoinbaseMarkets(values[0], values[1]) : selectKrakenMarkets(values[0], values[1])
    const instruments = new Array<ExchangeOhlcInstrument>(markets.length)
    let cursor = 0, failed = false
    const workers = await Promise.allSettled(Array.from({ length: Math.min(4, markets.length) }, async () => {
      while (!failed && cursor < markets.length) {
        const index = cursor++, market = markets[index]
        try {
          let payload: unknown
          if (exchange === 'coinbase') {
            const url = new URL(`https://api.exchange.coinbase.com/products/${encodeURIComponent(market.id)}/candles`)
            url.searchParams.set('granularity', '86400')
            url.searchParams.set('start', new Date(entryTime - 99 * DAY).toISOString())
            url.searchParams.set('end', new Date(asOf).toISOString())
            payload = await request(url.toString())
          } else {
            const url = new URL('https://api.kraken.com/0/public/OHLC')
            url.searchParams.set('pair', market.id); url.searchParams.set('interval', '1440')
            url.searchParams.set('since', String((entryTime - 99 * DAY) / 1000))
            const result = krakenResult(await request(url.toString()))
            if (Object.keys(result).filter((key) => key !== 'last').length !== 1 || !Object.hasOwn(result, market.id)) throw new Error('Kraken returned mismatched candle identity')
            payload = result[market.id]
          }
          instruments[index] = exchangeInstrument(exchange, market, payload, signalTime, entryTime, asOf)
        } catch (error) { failed = true; throw error }
      }
    }))
    const rejected = workers.find((r): r is PromiseRejectedResult => r.status === 'rejected')
    if (rejected) throw rejected.reason
    if (Math.floor(now() / DAY) !== Math.floor(asOf / DAY)) throw new Error('UTC day changed while loading market data; refresh the rankings')
    if (instruments.filter(Boolean).length !== markets.length) throw new Error('Complete market data unavailable')
    return {
      exchange, quote_currency: 'USD', source: `${name(exchange)} public spot market data`,
      source_url: exchange === 'coinbase' ? 'https://docs.cdp.coinbase.com/api-reference/exchange-api/rest-api/products/get-product-candles' : 'https://docs.kraken.com/api-reference/market-data/get-ohlc-data',
      fetched_at: new Date(now()).toISOString(), universe_selected_at: new Date(asOf).toISOString(),
      universe_description: `Current top 50 active ${name(exchange)} USD spot pairs by estimated rolling 24-hour dollar volume, excluding stablecoins and fiat.${exchange === 'kraken' ? ' Kraken catalogue filtered for country US.' : ''} Public listings do not establish availability for an individual account or US state. Current membership is observed after the signal and differs from the historical Binance backtest universe.`,
      volume_method: exchange === 'coinbase' ? 'close-times-base-volume' : 'vwap-times-base-volume',
      volume_description: exchange === 'coinbase'
        ? 'Daily dollar volume is an estimate: candle close × base volume. Market selection uses Coinbase’s approximate 24-hour quote volume. Volume thresholds and scores use this proxy; Binance backtest results and fitted probabilities do not validate this market or measurement.'
        : 'Daily and rolling dollar volume are reconstructed from reported VWAP × base volume, subject to provider rounding. Binance backtest results and fitted probabilities do not validate this market.',
      signal_date: date(signalTime), entry_date: date(entryTime), instruments, expected_instruments: markets.length,
    }
  }
  return async function load(): Promise<ExchangeOhlcSnapshot> {
    const asOf = now(), day = date(asOf)
    if (cached?.day === day && cached.expires > asOf) return cached.snapshot
    // Even across midnight, drain old work before another batch can start.
    if (pending) return pending
    const promise = fetchSnapshot(asOf).then((snapshot) => { cached = { day, expires: asOf + CACHE_MS, snapshot }; return snapshot })
    pending = promise
    try { return await promise } finally { if (pending === promise) pending = null }
  }
}
const providers = { coinbase: createExchangeOhlcProvider('coinbase'), kraken: createExchangeOhlcProvider('kraken') }
export const loadExchangeOhlc = (exchange: Exchange): Promise<ExchangeOhlcSnapshot> => providers[exchange]()
