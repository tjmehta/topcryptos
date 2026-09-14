/** Server-side, public Binance Spot OHLC input. No trading endpoints or keys. */
import type { OhlcBar, OhlcInstrument } from './ohlcAlgorithms'
const BASE_URL = 'https://data-api.binance.vision'
const DAY_MS = 86_400_000
const CACHE_MS = 10 * 60_000
const CONCURRENCY = 4
const MAX_INSTRUMENTS = 50
const STABLE_BASES = new Set([
  'USDC', 'TUSD', 'BUSD', 'USDP', 'PAX', 'DAI', 'USDS', 'SUSD',
  'FDUSD', 'AEUR', 'EUR', 'UST', 'USTC', 'USDD', 'USD1',
])
const LEVERAGED_SUFFIXES = [
  ['UP', 'DOWN'], ['DOWN', 'UP'], ['BULL', 'BEAR'], ['BEAR', 'BULL'],
] as const

type Market = { symbol: string; base_asset: string; quote_volume: number }
type Fetcher = typeof fetch

function object(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === 'object' && !Array.isArray(value)
}

function finiteNumber(value: unknown, label: string): number {
  if ((typeof value !== 'number' && typeof value !== 'string') || (typeof value === 'string' && value.trim() === '')) {
    throw new Error(`Binance returned invalid ${label}`)
  }
  const number = Number(value)
  if (!Number.isFinite(number)) throw new Error(`Binance returned invalid ${label}`)
  return number
}

function isLeveraged(base: string, symbols: Set<string>): boolean {
  return LEVERAGED_SUFFIXES.some(([suffix, reciprocal]) => {
    if (!base.endsWith(suffix) || base.length <= suffix.length) return false
    const underlying = base.slice(0, -suffix.length)
    return symbols.has(`${underlying}USDT`) && symbols.has(`${underlying}${reciprocal}USDT`)
  })
}

/** The live roster uses current rolling volume; it is not the annual backtest roster. */
export function selectBinanceMarkets(exchangeInfo: unknown, tickers: unknown): Market[] {
  if (!object(exchangeInfo) || !Array.isArray(exchangeInfo.symbols) || !Array.isArray(tickers)) {
    throw new Error('Binance returned an invalid market catalogue')
  }
  const symbols = new Set<string>()
  const active: { symbol: string; base_asset: string }[] = []
  for (const row of exchangeInfo.symbols) {
    if (!object(row) || typeof row.symbol !== 'string' || typeof row.baseAsset !== 'string'
      || typeof row.quoteAsset !== 'string' || typeof row.status !== 'string') {
      throw new Error('Binance returned an invalid instrument identity')
    }
    if (symbols.has(row.symbol)) throw new Error('Binance returned a duplicate instrument')
    symbols.add(row.symbol)
    if (row.status === 'TRADING' && row.quoteAsset === 'USDT' && row.isSpotTradingAllowed === true) {
      if (row.symbol !== `${row.baseAsset}USDT` || !/^[\p{L}\p{N}]+USDT$/u.test(row.symbol)) {
        throw new Error('Binance returned an unsupported instrument identity')
      }
      active.push({ symbol: row.symbol, base_asset: row.baseAsset })
    }
  }
  const volumes = new Map<string, number>()
  for (const row of tickers) {
    if (!object(row) || typeof row.symbol !== 'string') {
      throw new Error('Binance returned an invalid ticker identity')
    }
    if (volumes.has(row.symbol)) throw new Error('Binance returned a duplicate ticker')
    const volume = finiteNumber(row.quoteVolume, 'quote volume')
    if (volume < 0) throw new Error('Binance returned negative quote volume')
    volumes.set(row.symbol, volume)
  }
  const candidates: Market[] = []
  for (const market of active) {
    if (STABLE_BASES.has(market.base_asset) || isLeveraged(market.base_asset, symbols)) continue
    const quote_volume = volumes.get(market.symbol)
    if (quote_volume == null) throw new Error(`Binance ticker missing for ${market.symbol}`)
    if (quote_volume > 0) candidates.push({ ...market, quote_volume })
  }
  candidates.sort((a, b) => b.quote_volume - a.quote_volume || (a.symbol < b.symbol ? -1 : a.symbol > b.symbol ? 1 : 0))
  const chosen = candidates.slice(0, MAX_INSTRUMENTS)
  if (!chosen.length) throw new Error('Binance returned no eligible active USDT instruments')
  return chosen
}

type ParsedBar = {
  time: number
  close_time: number
  open: number
  high: number
  low: number
  close: number
  base_volume: number
  quote_volume: number
  trade_count: number
}

export type BinanceEntryUnavailableReason = 'missing-entry-bar' | 'inactive-entry' | 'identity-gap' | null

export type BinanceOhlcInstrument = OhlcInstrument & {
  symbol: string
  entry_price: number | null
  entry_unavailable_reason: BinanceEntryUnavailableReason
}

export type BinanceOhlcSnapshot = {
  source: string
  fetched_at: string
  universe_selected_at: string
  universe_description: string
  signal_date: string
  entry_date: string
  instruments: BinanceOhlcInstrument[]
  expected_instruments: number
}

/** Parse raw REST milliseconds, not the archive's post-2025 microseconds. */
function parseBars(payload: unknown, symbol: string): ParsedBar[] {
  if (!Array.isArray(payload) || payload.length > 100) throw new Error(`Binance returned invalid candles for ${symbol}`)
  let priorTime = -Infinity
  return payload.map((row) => {
    if (!Array.isArray(row) || row.length !== 12) throw new Error(`Binance returned malformed candles for ${symbol}`)
    const time = finiteNumber(row[0], 'candle open time')
    const close_time = finiteNumber(row[6], 'candle close time')
    if (!Number.isSafeInteger(time) || time < 0 || time % DAY_MS !== 0
      || !Number.isSafeInteger(close_time) || close_time !== time + DAY_MS - 1
      || time <= priorTime) {
      throw new Error(`Binance returned duplicate, unordered or non-daily candles for ${symbol}`)
    }
    priorTime = time
    const open = finiteNumber(row[1], 'open price')
    const high = finiteNumber(row[2], 'high price')
    const low = finiteNumber(row[3], 'low price')
    const close = finiteNumber(row[4], 'close price')
    const base_volume = finiteNumber(row[5], 'base volume')
    const quote_volume = finiteNumber(row[7], 'quote volume')
    const trade_count = finiteNumber(row[8], 'trade count')
    if (Math.min(open, high, low, close) <= 0 || high < Math.max(open, close)
      || low > Math.min(open, close) || high < low || base_volume < 0 || quote_volume < 0
      || !Number.isSafeInteger(trade_count) || trade_count < 0) {
      throw new Error(`Binance returned invalid candle values for ${symbol}`)
    }
    return { time, close_time, open, high, low, close, base_volume, quote_volume, trade_count }
  })
}

function dayString(time: number): string {
  return new Date(time).toISOString().slice(0, 10)
}

export function binanceInstrument(
  symbol: string,
  payload: unknown,
  signalTime: number,
  entryTime: number,
  asOf: number,
): BinanceOhlcInstrument {
  const parsed = parseBars(payload, symbol)
  if (parsed.some((bar) => bar.time > asOf)) throw new Error(`Binance returned future candles for ${symbol}`)
  const instrument_key = `${dayString(signalTime).slice(0, 4)}:${symbol}:live-spot`
  // Missing dates remain missing. Valid full-duration zero-activity bars remain
  // complete, as in the frozen acquisition; entry execution is checked separately.
  // The pure scorer enforces a complete consecutive formation window.
  const bars: OhlcBar[] = parsed.filter((bar) => bar.time <= signalTime && bar.close_time <= asOf).map((bar) => ({
      date: dayString(bar.time), instrument_key,
      open: bar.open, high: bar.high, low: bar.low, close: bar.close,
      quote_volume: bar.quote_volume, bar_status: 'complete',
    }))
  const entry = parsed.find((bar) => bar.time === entryTime)
  const continuousThroughEntry = [signalTime, signalTime + DAY_MS, entryTime]
    .every((time) => parsed.some((bar) => bar.time === time))
  // The live, still-open entry candle supplies only its opening price. Its high,
  // low and close never enter signal scoring or level geometry.
  // The frozen panel treats a missing raw UTC date as an identity boundary. Do
  // not fill an old signal using an open beyond that gap, even if the raw pair
  // symbol matches. A present zero-activity intervening day is not such a gap.
  const entry_unavailable_reason: BinanceEntryUnavailableReason = entry == null || entryTime > asOf
    ? 'missing-entry-bar'
    : entry.trade_count <= 0 || entry.base_volume <= 0 || entry.quote_volume <= 0
      ? 'inactive-entry'
      : !continuousThroughEntry ? 'identity-gap' : null
  const entry_price = entry_unavailable_reason == null ? entry!.open : null
  return { instrument_key, symbol, cohort_member: true, bars, entry_price, entry_unavailable_reason }
}

/** Factory provides isolated caches and clocks for provider-level tests. */
export function createBinanceOhlcProvider(options: { fetcher?: Fetcher; now?: () => number } = {}) {
  const now = options.now ?? Date.now
  let cached: { day: string; expires: number; snapshot: BinanceOhlcSnapshot } | null = null
  let pending: { day: string; promise: Promise<BinanceOhlcSnapshot> } | null = null

  async function request(path: string, query?: Record<string, string>): Promise<unknown> {
    const url = new URL(path, BASE_URL)
    for (const [key, value] of Object.entries(query ?? {})) url.searchParams.set(key, value)
    const response = await (options.fetcher ?? fetch)(url.toString(), {
      headers: { accept: 'application/json' }, signal: AbortSignal.timeout(15_000),
    })
    if (!response.ok) throw new Error(`Binance market data unavailable (${response.status})`)
    try {
      return await response.json() as unknown
    } catch {
      throw new Error('Binance returned malformed market data')
    }
  }

  async function fetchSnapshot(asOf: number): Promise<BinanceOhlcSnapshot> {
    const entryTime = Math.floor(asOf / DAY_MS) * DAY_MS
    const signalTime = entryTime - 2 * DAY_MS
    const [exchangeInfo, tickers] = await Promise.all([
      request('/api/v3/exchangeInfo'), request('/api/v3/ticker/24hr'),
    ])
    const markets = selectBinanceMarkets(exchangeInfo, tickers)
    const instruments = new Array<BinanceOhlcInstrument>(markets.length)
    let cursor = 0
    let failed = false
    const workers = await Promise.allSettled(Array.from({ length: Math.min(CONCURRENCY, markets.length) }, async () => {
      while (!failed && cursor < markets.length) {
        const index = cursor++
        const market = markets[index]
        try {
          const payload = await request('/api/v3/klines', {
            symbol: market.symbol, interval: '1d', limit: '100', endTime: String(asOf),
          })
          instruments[index] = binanceInstrument(market.symbol, payload, signalTime, entryTime, asOf)
        } catch (error) {
          failed = true
          throw error
        }
      }
    }))
    // Drain existing requests before releasing the shared pending load, so an
    // immediate retry cannot exceed the four-request bound after a failure.
    const rejected = workers.find((result): result is PromiseRejectedResult => result.status === 'rejected')
    if (rejected) throw rejected.reason
    if (Math.floor(now() / DAY_MS) !== Math.floor(asOf / DAY_MS)) {
      throw new Error('UTC day changed while loading market data; refresh the rankings')
    }
    if (instruments.filter((instrument) => instrument != null).length !== markets.length) {
      throw new Error('Binance market data is incomplete; rankings were not calculated')
    }
    return {
      source: 'Binance Spot public market-data REST',
      fetched_at: new Date(now()).toISOString(),
      universe_selected_at: new Date(asOf).toISOString(),
      universe_description: 'Current top 50 active Binance Spot USDT pairs by rolling 24-hour quote volume, with research stablecoin and structured leveraged-product exclusions. This current universe is not the historical annual backtest universe. Signal history ends two UTC days before the entry-day reference open; current membership is observed after that signal.',
      signal_date: dayString(signalTime), entry_date: dayString(entryTime),
      instruments, expected_instruments: markets.length,
    }
  }

  return async function load(): Promise<BinanceOhlcSnapshot> {
    const asOf = now()
    const day = dayString(asOf)
    if (cached?.day === day && cached.expires > asOf) return cached.snapshot
    if (pending?.day === day) return pending.promise
    const promise = fetchSnapshot(asOf).then((snapshot) => {
      cached = { day, expires: asOf + CACHE_MS, snapshot }
      return snapshot
    })
    pending = { day, promise }
    try {
      return await promise
    } finally {
      if (pending?.promise === promise) pending = null
    }
  }
}

export const loadBinanceOhlc = createBinanceOhlcProvider()
