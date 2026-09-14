/** @jest-environment jsdom */
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { BreakoutsView } from '../BreakoutsView'

const mockRouter = {
  query: {} as Record<string, string | string[]>, pathname: '/breakouts', isReady: true,
  push: jest.fn(),
}
jest.mock('next/router', () => ({ useRouter: () => mockRouter }))
jest.mock('next/head', () => ({ __esModule: true, default: () => null }))
jest.mock('next/link', () => ({
  __esModule: true, default: ({ href, children, ...props }: any) => <a {...props} href={href}>{children}</a>,
}))

const screen = (overrides: Record<string, unknown> = {}): any => ({
  exchange: 'coinbase', quote_currency: 'USD', source_url: 'https://docs.cdp.coinbase.com/',
  volume_description: 'Estimated quote volume.', model_scope: 'unvalidated-market',
  generated_at: '2026-09-13T19:00:00Z', fetched_at: '2026-09-13T18:59:00Z',
  source: 'Binance public daily klines', universe_description: 'Current liquid USDT spot pairs.',
  universe_selected_at: '2026-09-13T18:58:00Z', universe_size: 40, eligible_count: 35,
  signal_date: '2026-09-11', entry_date: '2026-09-13', hard_exit_date: '2026-10-13',
  view_observations: 7, algorithm: 'Breakout', unallocated_slots: 9,
  model_generated_at: '2026-09-13T18:00:00Z', rows: [{
    instrument_key: '2026:BTCUSDT', symbol: 'BTCUSDT', rank: 1, score: .03, entry_price: 100, entry_unavailable_reason: null,
    outlook: { zones: [{ policy: 'ResistanceSMAATR', target: 115, stop: 90, probability: .612,
      model_status: 'available', model_cutoff: '2026-09-01', latest_training_exit: '2026-02-01',
      training_events: 52020, retrospective_validation: {
        metrics: { model_brier: .219546, baseline_brier: .252948 },
      },
    }] },
  }], ...overrides,
})
const ok = (body: any) => ({ ok: true, json: async () => body })
const deferred = () => {
  let resolve!: (response: any) => void
  const promise = new Promise<any>((r) => { resolve = r })
  return { promise, resolve }
}
let root: Root
let container: HTMLDivElement
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true, fetch: jest.fn().mockResolvedValue(ok(screen())) })
  mockRouter.query = {}
  mockRouter.isReady = true
  mockRouter.push.mockResolvedValue(true)
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
})
afterEach(() => {
  act(() => root.unmount())
  container.remove()
})
const render = async () => { await act(async () => root.render(<BreakoutsView />)) }

test('waits for router hydration and exposes loading until the matching response arrives', async () => {
  mockRouter.isReady = false
  await render()
  expect(fetch).not.toHaveBeenCalled()
  expect(container.querySelector('[role="status"]')).not.toBeNull()
  const request = deferred()
  jest.mocked(fetch).mockReturnValue(request.promise)
  mockRouter.isReady = true
  mockRouter.query = { algo: 'VolumeBreakout', d: '21' }
  await render()
  expect(fetch).toHaveBeenCalledWith('/api/rankings/ohlc?d=21&algo=VolumeBreakout&exchange=coinbase', expect.any(Object))
  expect(container.textContent).not.toContain('BTCUSDT')
  await act(async () => request.resolve(ok(screen({ algorithm: 'VolumeBreakout', view_observations: 21 }))))
  expect(container.textContent).toContain('BTCUSDT')
  expect(container.querySelector('[role="status"]')).toBeNull()
  expect(container.textContent).toContain('Reference exit · 30 days')
})

test.each([
  { label: 'OHLC algorithm', value: 'Momentum', query: { d: '7', algo: 'Momentum' }, algorithm: 'Momentum', view: 7 },
  { label: 'OHLC viewed history', value: '14', query: { d: '14', algo: 'Breakout' }, algorithm: 'Breakout', view: 14 },
])('changing $label immediately clears results and fetches the newly selected view', async ({ label, value, query, algorithm, view }) => {
  await render()
  expect(container.textContent).toContain('BTCUSDT')
  const originalSignal = (jest.mocked(fetch).mock.calls[0][1] as RequestInit).signal!
  const request = deferred()
  jest.mocked(fetch).mockReturnValue(request.promise)
  const select = container.querySelector(`select[aria-label="${label}"]`) as HTMLSelectElement
  await act(async () => {
    select.value = value
    select.dispatchEvent(new Event('change', { bubbles: true }))
  })
  expect(originalSignal.aborted).toBe(true)
  expect(container.textContent).not.toContain('BTCUSDT')
  expect(container.querySelector('[role="status"]')).not.toBeNull()
  expect(mockRouter.push).toHaveBeenLastCalledWith({ pathname: '/breakouts', query: { d: view, algo: algorithm, exchange: 'coinbase' } }, undefined, { shallow: true, scroll: false })
  mockRouter.query = query
  await render()
  expect(fetch).toHaveBeenLastCalledWith(`/api/rankings/ohlc?d=${view}&algo=${algorithm}&exchange=coinbase`, expect.any(Object))
  await act(async () => request.resolve(ok(screen({ algorithm, view_observations: view }))))
  expect(container.textContent).toContain('BTCUSDT')
})

test('an aborted old request cannot overwrite a newer view when responses arrive out of order', async () => {
  const old = deferred(), current = deferred()
  jest.mocked(fetch).mockReturnValueOnce(old.promise).mockReturnValueOnce(current.promise)
  await render()
  mockRouter.query = { algo: 'Momentum', d: '14' }
  await render()
  await act(async () => current.resolve(ok(screen({ algorithm: 'Momentum', view_observations: 14, rows: [] }))))
  expect(container.textContent).toContain('No qualifying signals')
  await act(async () => old.resolve(ok(screen())))
  expect(container.textContent).toContain('No qualifying signals')
  expect(container.textContent).not.toContain('BTCUSDT')
  expect(container.querySelector('[role="alert"]')).toBeNull()
})

test('shows a fetch error and retries without retaining old rows', async () => {
  jest.mocked(fetch).mockResolvedValueOnce({ ok: false } as Response).mockResolvedValueOnce(ok(screen()) as Response)
  await render()
  expect(container.querySelector('[role="alert"]')?.textContent).toContain('Could not load daily prices')
  expect(container.textContent).not.toContain('BTCUSDT')
  await act(async () => (container.querySelector('button') as HTMLButtonElement).click())
  expect(fetch).toHaveBeenCalledTimes(2)
  expect(container.querySelector('[role="alert"]')).toBeNull()
  expect(container.textContent).toContain('BTCUSDT')
})

test('rejects mismatched response metadata rather than showing another algorithm’s rows', async () => {
  jest.mocked(fetch).mockResolvedValueOnce(ok(screen({ algorithm: 'Momentum' })) as Response)
  await render()
  expect(container.querySelector('[role="alert"]')?.textContent).toContain('did not match this view')
  expect(container.textContent).not.toContain('BTCUSDT')
})

test('empty selections retain date/source context and state that unused slots remain cash', async () => {
  jest.mocked(fetch).mockResolvedValueOnce(ok(screen({ rows: [], unallocated_slots: 10 })) as Response)
  await render()
  expect(container.textContent).toContain('No qualifying signals')
  expect(container.textContent).toContain('10 of 10 slots in cash')
  expect(container.textContent).toContain('Unfilled slots stay in cash')
  expect(container.textContent).toContain('2026-09-11')
  expect(container.querySelector('section[aria-label="Source and research support"]')).not.toBeNull()
})

test('missing actual entry suppresses numerical levels and probabilities even if an outlook is supplied', async () => {
  const response = screen()
  response.rows[0].entry_price = null
  response.rows[0].entry_unavailable_reason = 'missing-entry-bar'
  jest.mocked(fetch).mockResolvedValueOnce(ok(response) as Response)
  await render()
  expect(container.textContent).toContain('Open unavailable')
  expect(container.textContent).toContain('The actual entry open is unavailable')
  expect(container.textContent).toContain('Target probability has not been evaluated for Coinbase')
  expect(container.textContent).not.toContain('61.2%')
  expect(container.textContent).not.toContain('Training cutoff')
})

test('a missing monthly model retains reference levels without fabricating a probability', async () => {
  const response = screen()
  Object.assign(response.rows[0].outlook.zones[0], { probability: null, model_status: 'no-exact-month-model', model_cutoff: null })
  jest.mocked(fetch).mockResolvedValueOnce(ok(response) as Response)
  await render()
  expect(container.textContent).toContain('Target probability has not been evaluated for Coinbase')
  expect(container.textContent).toContain('115')
  expect(container.textContent).not.toContain('61.2%')
  expect(container.textContent).not.toContain('0.0%')
})

test('retains reference levels but never displays legacy model probabilities or metrics on the new exchanges', async () => {
  // The supplied legacy fixture deliberately carries a probability and Brier scores.
  await render()
  const text = container.textContent!
  expect(text).not.toContain('61.2%')
  expect(text).not.toContain('Training cutoff')
  expect(text).not.toContain('0.2195')
  expect(text).not.toContain('Model created')
  expect(text).toContain('A target touch does not guarantee a sale')
  expect(text).toContain('Levels are not updated for later prices')
  expect(text).toContain('Historical Binance returns and probabilities do not transfer')
  expect(text).toContain('Reference exit · 30 days')
  expect(text).toContain('115')
})


test('distinguishes insufficient eligible histories from evaluated negative signals', async () => {
  jest.mocked(fetch).mockResolvedValueOnce(ok(screen({ rows: [], eligible_count: 0, unallocated_slots: 10 })) as Response)
  await render()
  expect(container.textContent).toContain('No eligible price histories')
  expect(container.textContent).toContain('No pair had enough complete daily history and liquidity')
  expect(container.textContent).not.toContain('No pair passed this algorithm')
})


test.each([
  { reason: 'identity-gap', label: 'Identity continuity unverified', explanation: 'instrument’s identity cannot be verified across that gap' },
  { reason: 'inactive-entry', label: 'No executable entry', explanation: 'entry-day candle has no executable trading activity' },
])('explains $reason without calling a present entry candle missing', async ({ reason, label, explanation }) => {
  const response = screen()
  Object.assign(response.rows[0], { entry_price: null, entry_unavailable_reason: reason })
  jest.mocked(fetch).mockResolvedValueOnce(ok(response) as Response)
  await render()
  expect(container.textContent).toContain(label)
  expect(container.textContent).toContain(explanation)
  expect(container.textContent).not.toContain('Open unavailable')
  expect(container.textContent).not.toContain('actual entry open is unavailable')
  expect(container.textContent).not.toContain('61.2%')
  expect(container.textContent).not.toContain('Training cutoff')
})


test('exchange change clears stale quotes, carries the exchange in the URL and accepts only its matching response', async () => {
  await render()
  const pending = deferred()
  jest.mocked(fetch).mockReturnValue(pending.promise)
  const exchange = container.querySelector('select[aria-label="OHLC exchange"]') as HTMLSelectElement
  await act(async () => {
    exchange.value = 'kraken'
    exchange.dispatchEvent(new Event('change', { bubbles: true }))
  })
  expect(container.textContent).not.toContain('BTCUSDT')
  expect(mockRouter.push).toHaveBeenLastCalledWith({ pathname: '/breakouts', query: { d: 7, algo: 'Breakout', exchange: 'kraken' } }, undefined, { shallow: true, scroll: false })
  mockRouter.query = { exchange: 'kraken' }
  await render()
  expect(fetch).toHaveBeenLastCalledWith('/api/rankings/ohlc?d=7&algo=Breakout&exchange=kraken', expect.any(Object))
  await act(async () => pending.resolve(ok(screen())))
  expect(container.querySelector('[role="alert"]')?.textContent).toContain('did not match')
  expect(container.textContent).not.toContain('BTCUSDT')
})

test('labels unsupported exchange probabilities without implying only a missing month', async () => {
  const response = screen({ exchange: 'kraken' })
  Object.assign(response.rows[0].outlook.zones[0], { probability: null, model_status: 'unvalidated-market', model_cutoff: null })
  mockRouter.query = { exchange: 'kraken' }
  jest.mocked(fetch).mockResolvedValue(ok(response) as Response)
  await render()
  expect(container.textContent).toContain('Target probability has not been evaluated for Kraken')
  expect(container.textContent).not.toContain('No model is available for this entry month')
  expect(container.textContent).not.toContain('61.2%')
  expect(container.textContent).toContain('115')
  expect(container.textContent).toContain('Kraken Spot · USD')
})
