import type { NextApiRequest, NextApiResponse } from 'next'
import handler from '../../pages/api/rankings/ohlc'
import { loadExchangeOhlc } from '../exchangeOhlc'
import example from '../../research/outlook/2026-09-13/example-input.json'

jest.mock('../exchangeOhlc', () => ({ loadExchangeOhlc: jest.fn() }))

function source() {
  return {
    exchange: 'coinbase' as const, quote_currency: 'USD' as const, source_url: 'https://docs.cdp.coinbase.com/',
    volume_method: 'close-times-base-volume' as const, volume_description: 'Estimated quote volume from base volume and close.',
    source: 'test historical OHLC', fetched_at: '2026-09-13T21:00:00Z',
    universe_selected_at: '2026-09-13T21:00:00Z', universe_description: 'Test universe',
    signal_date: example.signal_date, entry_date: example.entry_date,
    expected_instruments: 1,
    instruments: [{ ...example, symbol: 'BTC-USD', entry_unavailable_reason: null, bars: example.bars.map((bar) => ({ ...bar, bar_status: 'complete' as const })) }],
  }
}

async function call(query: Record<string, string | string[] | undefined> = {}, method = 'GET') {
  const res = { status: jest.fn().mockReturnThis(), json: jest.fn().mockReturnThis(), setHeader: jest.fn() }
  // Next provides the unused request/response fields in production.
  await handler({ query, method } as NextApiRequest, res as unknown as NextApiResponse)
  return res
}

beforeEach(() => jest.mocked(loadExchangeOhlc).mockResolvedValue(source()))

test('defaults to Coinbase, preserves level arithmetic and dates, and withholds unvalidated probabilities', async () => {
  const response = await call()
  expect(response.status).toHaveBeenCalledWith(200)
  const screen = response.json.mock.calls[0][0]
  expect(screen.signal_date).toBe('2024-01-01')
  expect(screen.entry_date).toBe('2024-01-03')
  expect(screen.hard_exit_date).toBe('2024-02-02')
  expect(screen.universe_size).toBe(1)
  expect(screen.unallocated_slots).toBe(9)
  expect(loadExchangeOhlc).toHaveBeenCalledWith('coinbase')
  expect(screen.exchange).toBe('coinbase')
  expect(screen.quote_currency).toBe('USD')
  expect(screen.rows[0].symbol).toBe('BTC-USD')
  expect(screen.rows[0].outlook.zones[1].target).toBeGreaterThan(screen.rows[0].entry_price)
  expect(screen.rows[0].outlook.zones[1]).toMatchObject({ probability: null, model_status: 'unvalidated-market', fit_id: null, model_cutoff: null, retrospective_validation: { metrics: null } })
  expect(screen.rows[0].outlook.sell_plan.type).toBe('evaluated-reference-only')
  expect(screen.rows[0].outlook.zones.every((zone: any) => zone.execution.includes('has not been backtested on this exchange'))).toBe(true)
  expect(screen.model_generated_at).toBeNull()
  expect(response.setHeader).toHaveBeenCalledWith('Cache-Control', 'no-store')
})

test('rejects unsupported and duplicate query values before data loading', async () => {
  for (const query of [{ d: '365' }, { d: '7junk' }, { d: ['7', '14'] }, { algo: 'Classic' }, { exchange: 'binance' }, { exchange: ['coinbase', 'kraken'] }]) {
    const response = await call(query)
    expect(response.status).toHaveBeenCalledWith(400)
  }
  expect(loadExchangeOhlc).not.toHaveBeenCalled()
})

test('allows only GET', async () => {
  const response = await call({}, 'POST')
  expect(response.status).toHaveBeenCalledWith(405)
  expect(response.setHeader).toHaveBeenCalledWith('Allow', 'GET')
  expect(loadExchangeOhlc).not.toHaveBeenCalled()
})

test('does not invent an entry price or outlook when the actual open is absent', async () => {
  const input = source()
  jest.mocked(loadExchangeOhlc).mockResolvedValue({ ...input, instruments: input.instruments.map((coin) => ({ ...coin, entry_price: null, entry_unavailable_reason: 'identity-gap' as const })) })
  const response = await call()
  expect(response.status).toHaveBeenCalledWith(200)
  expect(response.json.mock.calls[0][0].rows[0]).toMatchObject({ entry_price: null, entry_unavailable_reason: 'identity-gap', outlook: null })
})

test('an ineligible universe remains unallocated instead of forcing picks', async () => {
  const input = source()
  jest.mocked(loadExchangeOhlc).mockResolvedValue({ ...input, instruments: input.instruments.map((coin) => ({ ...coin, bars: coin.bars.slice(-5) })) })
  const response = await call()
  expect(response.json.mock.calls[0][0]).toMatchObject({ rows: [], unallocated_slots: 10, eligible_count: 0 })
})

test('fails the complete screen when the provider cannot verify its universe', async () => {
  const log = jest.spyOn(console, 'error').mockImplementation(() => {})
  jest.mocked(loadExchangeOhlc).mockRejectedValue(new Error('Incomplete OHLC universe'))
  const response = await call()
  expect(response.status).toHaveBeenCalledWith(503)
  expect(response.json.mock.calls[0][0]).not.toHaveProperty('rows')
  log.mockRestore()
})


test('routes Kraken explicitly and rejects another exchange returned by the provider', async () => {
  jest.mocked(loadExchangeOhlc).mockResolvedValue({ ...source(), exchange: 'kraken' })
  const response = await call({ exchange: 'kraken' })
  expect(loadExchangeOhlc).toHaveBeenCalledWith('kraken')
  expect(response.json.mock.calls[0][0]).toMatchObject({ exchange: 'kraken', model_scope: 'unvalidated-market' })
  jest.mocked(loadExchangeOhlc).mockResolvedValue(source())
  const log = jest.spyOn(console, 'error').mockImplementation(() => {})
  expect((await call({ exchange: 'kraken' })).status).toHaveBeenCalledWith(503)
  log.mockRestore()
})
