import { createExchangeOhlcProvider, exchangeInstrument, selectCoinbaseMarkets, selectKrakenMarkets } from '../exchangeOhlc'
import type { Exchange } from '../exchangeOhlc'
const DAY = 86_400_000, TODAY = Date.parse('2026-09-14T00:00:00Z'), NOW = TODAY + DAY / 2
const market = { id: 'BTC-USD', symbol: 'BTC-USD' }
const product = (base: string) => ({ id: `${base}-USD`, base_currency: base, quote_currency: 'USD', status: 'online' })
const ticker = (base: string, volume = 10) => ({ product_id: `${base}-USD`, quote_currency_id: 'USD', status: 'online', product_type: 'SPOT', approximate_quote_24h_volume: String(volume) })
const pair = (base: string) => ({ wsname: `${base}/USD`, base, quote: 'ZUSD', status: 'online', aclass_base: 'currency', aclass_quote: 'currency' })
const kraken = (result: unknown) => ({ error: [], result })
const response = (payload: unknown) => ({ ok: true, status: 200, json: async () => payload }) as Response
const page = (products: unknown[], has_next = false, next_cursor = '') => ({ products, pagination: { has_next, next_cursor } })
function candle(exchange: Exchange, time: number, price = 100): unknown[] {
  return exchange === 'coinbase' ? [time / 1000, price - 10, price + 10, price, price, 20000]
    : [time / 1000, String(price), String(price + 10), String(price - 10), String(price), String(price + 1), '20000', 50]
}
const candles = (exchange: Exchange) => Array.from({ length: 100 }, (_, i) => candle(exchange, TODAY - (99 - i) * DAY, i === 99 ? 200 : 100))

it('Coinbase uses active USD intersection, excludes stablecoins, aliases, halted and view-only markets', () => {
  const bases = ['BTC', 'ETH', 'USDC', 'LIMIT', 'VIEW', 'MISSING']
  const products = bases.map(product).map(p => p.id === 'LIMIT-USD' ? { ...p, limit_only: true } : p)
  const tickers = bases.filter(x => x !== 'MISSING').map(x => x === 'VIEW' ? { ...ticker(x), view_only: true } : ticker(x, x === 'ETH' ? 20 : 10))
  expect(selectCoinbaseMarkets(products, [...tickers, ticker('ADVANCEDONLY')]).map(x => x.symbol)).toEqual(['ETH-USD', 'BTC-USD'])
  expect(() => selectCoinbaseMarkets(products, [...tickers, tickers[0]])).toThrow('duplicate ticker')
  expect(() => selectCoinbaseMarkets([product('BTC'), product('BTC')], [ticker('BTC')])).toThrow('duplicate instrument')
  expect(() => selectCoinbaseMarkets([product('BTC')], [{ ...ticker('BTC'), approximate_quote_24h_volume: '' }])).toThrow('volume')
})
it('Kraken maps legacy BTC, uses rolling VWAP volume, rejects missing data and API errors', () => {
  const pairs = kraken({ XXBTZUSD: pair('XBT'), ETHUSD: pair('ETH'), USDTZUSD: pair('USDT'), HALT: { ...pair('HALT'), status: 'cancel_only' } })
  const tickers = kraken({ XXBTZUSD: { v: ['1', '10'], p: ['100', '2'] }, ETHUSD: { v: ['10000', '1'], p: ['1000', '30'] } })
  expect(selectKrakenMarkets(pairs, tickers).map(x => [x.symbol, x.quote_volume])).toEqual([['ETH-USD', 30], ['BTC-USD', 20]])
  expect(() => selectKrakenMarkets(pairs, kraken({}))).toThrow('ticker missing')
  expect(() => selectKrakenMarkets(pairs, { error: ['EAPI:Rate limit exceeded'] })).toThrow('API error')
})
it('fixes fifty liquid markets before history eligibility', () => {
  const bases = Array.from({ length: 60 }, (_, i) => `A${String(i).padStart(2, '0')}`)
  const selected = selectCoinbaseMarkets(bases.map(product), bases.map(x => ticker(x)))
  expect(selected).toHaveLength(50)
  expect(selected.at(-1)?.symbol).toBe('A49-USD')
})

it.each<Exchange>(['coinbase', 'kraken'])('%s isolates signal history, USD-volume measurement and current entry open', (exchange) => {
  const rows = candles(exchange)
  const original = exchangeInstrument(exchange, market, [...rows].reverse(), TODAY - 2 * DAY, TODAY, NOW)
  expect(original.bars).toHaveLength(98)
  expect(original.bars.at(-1)?.date).toBe('2026-09-12')
  expect(original.entry_price).toBe(200)
  expect(original.bars[0].quote_volume).toBe(exchange === 'coinbase' ? 2_000_000 : 2_020_000)
  rows[98][2] = 999999
  rows[99][2] = 999999
  rows[99][4] = 999999
  expect(exchangeInstrument(exchange, market, rows, TODAY - 2 * DAY, TODAY, NOW)).toEqual(original)
})
it.each<Exchange>(['coinbase', 'kraken'])('%s preserves gaps, missing entries and explicit inactive entries', (exchange) => {
  const rows = candles(exchange)
  const parse = (r: unknown) => exchangeInstrument(exchange, market, r, TODAY - 2 * DAY, TODAY, NOW)
  expect(parse(rows.slice(0, -1))).toMatchObject({ entry_price: null, entry_unavailable_reason: 'missing-entry-bar' })
  expect(parse(rows.filter((_, i) => i !== 98))).toMatchObject({ entry_price: null, entry_unavailable_reason: 'identity-gap' })
  rows[99][exchange === 'coinbase' ? 5 : 6] = 0
  expect(parse(rows)).toMatchObject({ entry_price: null, entry_unavailable_reason: 'inactive-entry' })
  rows[99][exchange === 'coinbase' ? 5 : 6] = 20000
  rows[98][exchange === 'coinbase' ? 5 : 6] = 0
  expect(parse(rows).entry_price).toBe(200)
  expect(parse(rows.filter((_, i) => i !== 50)).bars).toHaveLength(97)
})
it.each<Exchange>(['coinbase', 'kraken'])('%s rejects duplicates, wrong time units, future bars and malformed values', (exchange) => {
  const parse = (r: unknown) => exchangeInstrument(exchange, market, r, TODAY - 2 * DAY, TODAY, NOW)
  const row = candle(exchange, TODAY)
  expect(() => parse([row, row])).toThrow('Duplicate')
  expect(() => parse([candle(exchange, TODAY + DAY)])).toThrow('future')
  expect(() => parse([[TODAY, ...row.slice(1)]])).toThrow('candle time')
  expect(() => parse([[row[0], ...row.slice(1, 2), 'NaN', ...row.slice(3)]])).toThrow('high')
  expect(() => parse([[1, 2]])).toThrow('malformed candles')
})

function coinbaseFetcher(bases: string[], loadCandles: (url: URL) => Promise<Response>) {
  return jest.fn(async (input: string | URL | Request) => {
    const url = new URL(String(input))
    if (url.hostname === 'api.coinbase.com') return response(page(bases.map(x => ticker(x))))
    if (url.pathname === '/products') return response(bases.map(product))
    return loadCandles(url)
  }) as jest.MockedFunction<typeof fetch>
}
it('deduplicates callers, bounds concurrent requests, caches ten minutes and expires at UTC midnight', async () => {
  let now = NOW, active = 0, peak = 0
  const fetcher = coinbaseFetcher(['A', 'B', 'C', 'D', 'E'], async url => {
    expect(url.searchParams.get('granularity')).toBe('86400')
    active++; peak = Math.max(peak, active)
    await new Promise(resolve => setTimeout(resolve, 10))
    active--
    return response([])
  })
  const load = createExchangeOhlcProvider('coinbase', { fetcher, now: () => now, requestSpacingMs: 0 })
  const [a, b] = await Promise.all([load(), load()])
  expect(a).toBe(b); expect(a.instruments).toHaveLength(5); expect(peak).toBe(4)
  expect(a.volume_method).toBe('close-times-base-volume'); expect(a.quote_currency).toBe('USD')
  expect(fetcher).toHaveBeenCalledTimes(7)
  now += 9 * 60_000; expect(await load()).toBe(a)
  now += 60_000; await load(); expect(fetcher).toHaveBeenCalledTimes(14)
  now = TODAY + DAY - 1000; await load()
  now = TODAY + DAY + 1000; expect((await load()).entry_date).toBe('2026-09-15')
  expect(fetcher).toHaveBeenCalledTimes(28)
})
it('drains failed batches before retry, never serving partial rankings or cached errors', async () => {
  let broken = true, active = 0, peak = 0
  const fetcher = coinbaseFetcher(['A', 'B', 'C', 'D', 'E'], async url => {
    active++; peak = Math.max(peak, active)
    const fail = broken && url.pathname.includes('A-USD')
    await new Promise(resolve => setTimeout(resolve, fail ? 8 : 20)); active--
    return fail ? { ok: false, status: 429 } as Response : response([])
  })
  const load = createExchangeOhlcProvider('coinbase', { fetcher, now: () => NOW, requestSpacingMs: 0 })
  await expect(load()).rejects.toThrow('(429)'); expect(active).toBe(0)
  expect(fetcher).toHaveBeenCalledTimes(6)
  broken = false; expect((await load()).instruments).toHaveLength(5); expect(peak).toBe(4)
})
it('honors Coinbase pagination and rejects cycles instead of silently truncating the roster', async () => {
  let bad = false
  const fetcher = jest.fn(async (input: string | URL | Request) => {
    const url = new URL(String(input))
    if (url.pathname === '/products') return response([product('BTC'), product('ETH')])
    if (url.hostname === 'api.coinbase.com') return response(url.searchParams.has('cursor') ? page([ticker('ETH')], bad, 'again') : page([ticker('BTC')], true, 'again'))
    return response([])
  }) as typeof fetch
  expect((await createExchangeOhlcProvider('coinbase', { fetcher, now: () => NOW, requestSpacingMs: 0 })()).instruments).toHaveLength(2)
  bad = true
  await expect(createExchangeOhlcProvider('coinbase', { fetcher, now: () => NOW, requestSpacingMs: 0 })()).rejects.toThrow('pagination cursor')
})
it('requests Kraken US currency markets and rejects a candle response for another identity', async () => {
  let wrong = false
  const fetcher = jest.fn(async (input: string | URL | Request) => {
    const url = new URL(String(input))
    if (url.pathname.endsWith('AssetPairs')) {
      expect(url.searchParams.get('country_code')).toBe('US')
      expect(url.searchParams.get('aclass_base')).toBe('currency')
      return response(kraken({ XXBTZUSD: pair('XBT') }))
    }
    if (url.pathname.endsWith('Ticker')) return response(kraken({ XXBTZUSD: { v: ['1', '10'], p: ['100', '2'] } }))
    expect(url.searchParams.get('pair')).toBe('XXBTZUSD')
    expect(url.searchParams.get('interval')).toBe('1440')
    return response(kraken({ [wrong ? 'ETHUSD' : 'XXBTZUSD']: candles('kraken'), last: TODAY / 1000 }))
  }) as typeof fetch
  const source = await createExchangeOhlcProvider('kraken', { fetcher, now: () => NOW, requestSpacingMs: 0 })()
  expect(source.instruments[0].symbol).toBe('BTC-USD')
  expect(source.volume_method).toBe('vwap-times-base-volume')
  wrong = true
  await expect(createExchangeOhlcProvider('kraken', { fetcher, now: () => NOW, requestSpacingMs: 0 })()).rejects.toThrow('mismatched candle identity')
})
it('rejects a load crossing midnight rather than mixing signal dates', async () => {
  let now = TODAY + DAY - 1000
  const fetcher = coinbaseFetcher(['BTC'], async () => { now = TODAY + DAY + 1000; return response([]) })
  await expect(createExchangeOhlcProvider('coinbase', { fetcher, now: () => now, requestSpacingMs: 0 })()).rejects.toThrow('UTC day changed')
})
it('spaces request starts even when responses are immediate', async () => {
  const starts: number[] = []
  const source = coinbaseFetcher(['BTC', 'ETH'], async () => response([]))
  const fetcher = (async (...args: Parameters<typeof fetch>) => { starts.push(Date.now()); return source(...args) }) as typeof fetch
  await createExchangeOhlcProvider('coinbase', { fetcher, now: () => NOW, requestSpacingMs: 20 })()
  expect(starts).toHaveLength(4)
  expect(starts.every((time, index) => index === 0 || time - starts[index - 1] >= 15)).toBe(true)
})
