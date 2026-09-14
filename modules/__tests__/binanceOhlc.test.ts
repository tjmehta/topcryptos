import {
  binanceInstrument,
  createBinanceOhlcProvider,
  selectBinanceMarkets,
} from '../binanceOhlc'

const DAY = 86_400_000
const TODAY = Date.parse('2026-09-13T00:00:00Z')
const NOW = TODAY + 12 * 60 * 60_000

function market(base: string, status = 'TRADING') {
  return { symbol: `${base}USDT`, baseAsset: base, quoteAsset: 'USDT', status, isSpotTradingAllowed: true }
}
function ticker(base: string, quoteVolume: number) {
  return { symbol: `${base}USDT`, quoteVolume: String(quoteVolume) }
}
function candle(time: number, price = 100): unknown[] {
  return [time, String(price), String(price + 10), String(price - 10), String(price),
    '100', time + DAY - 1, '2000000', 10, '50', '1000000', '0']
}
function candles(): unknown[][] {
  return Array.from({ length: 100 }, (_, i) => candle(TODAY - (99 - i) * DAY, i === 99 ? 200 : 100))
}
function response(payload: unknown): Response {
  return { ok: true, status: 200, json: async () => payload } as Response
}

it('ranks the current volume roster with exact stable and structured-product exclusions', () => {
  const bases = ['JUP', 'BTC', 'BTCUP', 'BTCDOWN', 'USDC', 'USD1', '币安人生', 'STOP']
  const info = { symbols: bases.map((b) => market(b, b === 'STOP' ? 'HALT' : 'TRADING')) }
  const volumes = bases.map((b) => ticker(b, b === 'JUP' ? 30 : b === 'BTC' ? 20 : 10))
  expect(selectBinanceMarkets(info, volumes).map((r) => r.symbol)).toEqual(['JUPUSDT', 'BTCUSDT', '币安人生USDT'])
})

it('does not exclude a legitimate suffix coin without its reciprocal underlying evidence', () => {
  const info = { symbols: [market('JUP'), market('FOOUP')] }
  expect(selectBinanceMarkets(info, [ticker('JUP', 20), ticker('FOOUP', 10)]).map((r) => r.symbol))
    .toEqual(['JUPUSDT', 'FOOUPUSDT'])
})

it('fixes the top50 before candle eligibility and rejects incomplete ticker catalogues', () => {
  const bases = Array.from({ length: 55 }, (_, i) => `A${String(i).padStart(2, '0')}`)
  const info = { symbols: bases.map((b) => market(b)) }
  const ts = bases.map((b) => ticker(b, 10))
  expect(selectBinanceMarkets(info, ts).map((r) => r.symbol)).toEqual(bases.slice(0, 50).map((b) => `${b}USDT`))
  expect(() => selectBinanceMarkets(info, ts.slice(1))).toThrow('ticker missing')
  expect(() => selectBinanceMarkets(info, [...ts, ts[0]])).toThrow('duplicate ticker')
  expect(() => selectBinanceMarkets({ symbols: [market('BTC'), market('BTC')] }, [ticker('BTC', 1)]))
    .toThrow('duplicate instrument')
})

it('exposes only through-signal complete history and keeps the current entry open separate', () => {
  const source = candles()
  const first = binanceInstrument('BTCUSDT', source, TODAY - 2 * DAY, TODAY, NOW)
  expect(first.instrument_key).toBe('2026:BTCUSDT:live-spot')
  expect(first.entry_price).toBe(200)
  expect(first.entry_unavailable_reason).toBeNull()
  expect(first.bars).toHaveLength(98)
  expect(first.bars.at(-1)?.date).toBe('2026-09-11')
  expect(first.bars.every((b) => b.instrument_key === first.instrument_key && b.bar_status === 'complete')).toBe(true)
  const altered = source.map((r) => [...r])
  altered[98][2] = '999999'
  altered[99][2] = '999999'
  altered[99][4] = '999999'
  expect(binanceInstrument('BTCUSDT', altered, TODAY - 2 * DAY, TODAY, NOW)).toEqual(first)
})

it('keeps insufficient history and unavailable or gap-separated entries explicit', () => {
  const source = candles()
  const short = binanceInstrument('NEWUSDT', source.slice(-10), TODAY - 2 * DAY, TODAY, NOW)
  expect(short.bars).toHaveLength(8)
  expect(short.cohort_member).toBe(true)
  expect(binanceInstrument('BTCUSDT', source.slice(0, -1), TODAY - 2 * DAY, TODAY, NOW))
    .toMatchObject({ entry_price: null, entry_unavailable_reason: 'missing-entry-bar' })
  const gap = source.filter((_, i) => i !== 98)
  expect(binanceInstrument('BTCUSDT', gap, TODAY - 2 * DAY, TODAY, NOW))
    .toMatchObject({ entry_price: null, entry_unavailable_reason: 'identity-gap' })
  const noTrades = source.map((r) => [...r])
  noTrades[99][8] = 0
  expect(binanceInstrument('BTCUSDT', noTrades, TODAY - 2 * DAY, TODAY, NOW))
    .toMatchObject({ entry_price: null, entry_unavailable_reason: 'inactive-entry' })
  noTrades[99][8] = 10
  noTrades[98][8] = 0
  noTrades[98][5] = '0'
  noTrades[98][7] = '0'
  expect(binanceInstrument('BTCUSDT', noTrades, TODAY - 2 * DAY, TODAY, NOW))
    .toMatchObject({ entry_price: 200, entry_unavailable_reason: null })
  noTrades[50][8] = 0
  noTrades[50][5] = '0'
  noTrades[50][7] = '0'
  const quietHistory = binanceInstrument('BTCUSDT', noTrades, TODAY - 2 * DAY, TODAY, NOW)
  expect(quietHistory.bars).toHaveLength(98)
  expect(quietHistory.bars[50].quote_volume).toBe(0)
})

it('rejects duplicate dates, future rows, malformed prices and archive microsecond timestamps', () => {
  const source = candles()
  expect(() => binanceInstrument('BTCUSDT', [...source.slice(1), source[99]], TODAY - 2 * DAY, TODAY, NOW))
    .toThrow('duplicate, unordered')
  expect(() => binanceInstrument('BTCUSDT', [candle(TODAY + DAY)], TODAY - 2 * DAY, TODAY, NOW)).toThrow('future')
  const invalid = candle(TODAY)
  invalid[2] = '1'
  expect(() => binanceInstrument('BTCUSDT', [invalid], TODAY - 2 * DAY, TODAY, NOW)).toThrow('invalid candle values')
  const micros = candle(TODAY)
  micros[0] = TODAY * 1000
  micros[6] = (TODAY + DAY) * 1000 - 1
  expect(() => binanceInstrument('BTCUSDT', [micros], TODAY - 2 * DAY, TODAY, NOW)).toThrow('non-daily')
})

it('limits candle requests to4, deduplicates callers, caches10min and expires at UTC midnight', async () => {
  let now = NOW
  const bases = Array.from({ length: 9 }, (_, i) => `A${i}`)
  let active = 0, peak = 0
  const fetcher = jest.fn(async (input: string | URL | Request) => {
    const url = new URL(String(input))
    if (url.pathname.endsWith('exchangeInfo')) return response({ symbols: bases.map((b) => market(b)) })
    if (url.pathname.endsWith('24hr')) return response(bases.map((b) => ticker(b, 100)))
    expect(url.hostname).toBe('data-api.binance.vision')
    expect(url.searchParams.get('limit')).toBe('100')
    expect(url.searchParams.get('interval')).toBe('1d')
    active++; peak = Math.max(peak, active)
    await new Promise((resolve) => setTimeout(resolve, 1))
    active--
    // Empty but well-formed history is ordinary ineligibility, never roster removal.
    return response([])
  }) as jest.MockedFunction<typeof fetch>
  const load = createBinanceOhlcProvider({ fetcher, now: () => now })
  const [a, b] = await Promise.all([load(), load()])
  expect(a).toBe(b)
  expect(a.expected_instruments).toBe(9)
  expect(a.instruments).toHaveLength(9)
  expect(a.instruments.every((i) => i.entry_price === null && i.bars.length === 0)).toBe(true)
  expect(a.signal_date).toBe('2026-09-11')
  expect(a.entry_date).toBe('2026-09-13')
  expect(a.universe_description).toContain('not the historical annual backtest universe')
  expect(peak).toBe(4)
  expect(fetcher).toHaveBeenCalledTimes(11)
  now += 9 * 60_000
  expect(await load()).toBe(a)
  now += 60_000
  await load()
  expect(fetcher).toHaveBeenCalledTimes(22)
  now = TODAY + DAY - 60_000
  await load()
  expect(fetcher).toHaveBeenCalledTimes(33)
  now = TODAY + DAY + 60_000
  expect((await load()).entry_date).toBe('2026-09-14')
  expect(fetcher).toHaveBeenCalledTimes(44)
})

it('fails the whole universe on a candle transport or parse failure and permits retry', async () => {
  let broken = true
  const fetcher = jest.fn(async (input: string | URL | Request) => {
    const url = new URL(String(input))
    if (url.pathname.endsWith('exchangeInfo')) return response({ symbols: [market('BTC'), market('ETH')] })
    if (url.pathname.endsWith('24hr')) return response([ticker('BTC', 20), ticker('ETH', 10)])
    if (broken && url.searchParams.get('symbol') === 'ETHUSDT') return { ok: false, status: 503 } as Response
    return response(candles())
  }) as jest.MockedFunction<typeof fetch>
  const load = createBinanceOhlcProvider({ fetcher, now: () => NOW })
  await expect(load()).rejects.toThrow('unavailable (503)')
  broken = false
  expect((await load()).instruments).toHaveLength(2)
  expect(fetcher).toHaveBeenCalledTimes(8)
  const malformed = createBinanceOhlcProvider({ now: () => NOW, fetcher: (async (input) => {
    const url = new URL(String(input))
    if (url.pathname.endsWith('exchangeInfo')) return response({ symbols: [market('BTC')] })
    if (url.pathname.endsWith('24hr')) return response([ticker('BTC', 20)])
    return response([[1, 2, 3]])
  }) as typeof fetch })
  await expect(malformed()).rejects.toThrow('malformed candles')
})

it('drains in-flight candle requests before a failed load permits an immediate retry', async () => {
  let broken = true, active = 0, peak = 0
  const bases = ['A', 'B', 'C', 'D', 'E']
  const fetcher = jest.fn(async (input: string | URL | Request) => {
    const url = new URL(String(input))
    if (url.pathname.endsWith('exchangeInfo')) return response({ symbols: bases.map((b) => market(b)) })
    if (url.pathname.endsWith('24hr')) return response(bases.map((b) => ticker(b, 10)))
    active++; peak = Math.max(peak, active)
    const fails = broken && url.searchParams.get('symbol') === 'AUSDT'
    await new Promise((resolve) => setTimeout(resolve, fails ? 1 : 5))
    active--
    return fails ? { ok: false, status: 503 } as Response : response([])
  }) as jest.MockedFunction<typeof fetch>
  const load = createBinanceOhlcProvider({ fetcher, now: () => NOW })
  await expect(load()).rejects.toThrow('unavailable')
  expect(active).toBe(0)
  expect(fetcher).toHaveBeenCalledTimes(6) // Failed batch stops before requesting E.
  broken = false
  expect((await load()).instruments).toHaveLength(5)
  expect(peak).toBe(4)
})
