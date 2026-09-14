/** @jest-environment jsdom */
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { RankingsView, parseAlgorithm, shareDescription } from '../RankingsView'
import { processRankings } from '@/modules/processRankings'
import { topCryptos } from '@/modules/topCryptos'
import { RankingsTable } from '../RankingsTable'
import { RankingsChart } from '../RankingsChart'

const mockRouter = {
  query: {} as Record<string, string | string[]>, pathname: '/', isReady: true,
  push: jest.fn(), replace: jest.fn(),
}
jest.mock('d3', () => ({ format: () => (value: number) => String(value) }))
jest.mock('next/router', () => ({ useRouter: () => mockRouter }))
jest.mock('next/head', () => ({ __esModule: true, default: () => null }))
jest.mock('next/link', () => ({
  __esModule: true,
  default: ({ href, children, ...props }: any) => <a {...props} href={typeof href === 'string' ? href : `${href.pathname}?${new URLSearchParams(href.query)}`}>{children}</a>,
}))
jest.mock('@/modules/processRankings', () => ({ processRankings: jest.fn(), NAN_SCORE: -10001 }))
jest.mock('@/modules/topCryptos', () => ({ topCryptos: { getDailyRankings: jest.fn(), getHourlyRankings: jest.fn() } }))
jest.mock('../RankingsTable', () => ({ RankingsTable: jest.fn(() => null) }))
jest.mock('../RankingsChart', () => ({ RankingsChart: jest.fn(() => null) }))
jest.mock('../CoinOutlook', () => ({ CoinOutlook: () => null }))
jest.mock('../NativeExitPanel', () => ({ NativeExitPanel: () => null }))
jest.mock('../CoinCard', () => ({ CoinCard: () => null }))
jest.mock('../ShareButton', () => ({ ShareButton: () => null }))
jest.mock('../ExchangeFilter', () => ({ ExchangeFilter: () => null }))
jest.mock('../hooks/useMediaQuery', () => ({ useMediaQuery: () => true }))
jest.mock('../ui/select', () => ({
  Select: ({ value, onValueChange, children }: any) => <select value={value} onChange={(e) => onValueChange(e.target.value)}>{children}</select>,
  SelectContent: ({ children }: any) => <>{children}</>,
  SelectGroup: ({ children }: any) => <>{children}</>,
  SelectTrigger: () => null,
  SelectValue: () => null,
  SelectItem: ({ value, children }: any) => <option value={value}>{children}</option>,
}))

let root: Root
let container: HTMLDivElement
const result = (id = 'eligible', eligible = true): any => ({
  cryptosSortedByScore: [{ id, name: id, rank: 1, score: eligible ? 500 : -10001, insufficientHistory: !eligible, total: null }],
  cryptosById: {}, minMaxes: {},
})
const latestTable = () => jest.mocked(RankingsTable).mock.calls.at(-1)![0]
const latestChart = () => jest.mocked(RankingsChart).mock.calls.at(-1)![0]

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true, fetch: jest.fn().mockResolvedValue({ ok: false }) })
  localStorage.clear()
  mockRouter.query = {}
  mockRouter.pathname = '/'
  jest.mocked(topCryptos.getDailyRankings).mockResolvedValue([])
  jest.mocked(topCryptos.getHourlyRankings).mockResolvedValue([])
  jest.mocked(processRankings).mockResolvedValue(result())
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
})
afterEach(() => {
  act(() => root.unmount())
  container.remove()
})
const render = async (mode: 'daily' | 'hourly' = 'daily') => {
  await act(async () => root.render(<RankingsView mode={mode} />))
}

test('algorithm URLs allowlist candidates and preserve Classic fallback', () => {
  expect(parseAlgorithm(undefined)).toBe('classic')
  expect(parseAlgorithm('auto')).toBe('classic')
  expect(parseAlgorithm('constructor')).toBe('classic')
  expect(parseAlgorithm(['trend-quality', 'momentum'])).toBe('trend-quality')
  expect(parseAlgorithm('cumulative')).toBe('cumulative')
  expect(parseAlgorithm('hybrid')).toBe('hybrid')
  expect(shareDescription('daily', 7, 2, 1, 'momentum')).toContain('momentum rankings over 7 days on 1 exchange · 2 coins highlighted')
})

test('a deep link restores method, window, filters, sorting and highlights', async () => {
  mockRouter.query = { algo: 'trend-quality', d: '7', ex: 'kraken', sort: '-score', hl: 'eligible' }
  await render()
  expect(processRankings).toHaveBeenLastCalledWith([], expect.any(Date), expect.any(Set), {
    algorithm: 'trend-quality', endDate: expect.any(Date), intervalMs: 86400000,
  })
  expect(latestTable().sorting).toEqual([{ id: 'score', desc: true }])
  expect(latestTable().highlightedIds.has('eligible')).toBe(true)
  expect(latestTable().scoreDescription).toContain('log-price')
  expect(latestChart().points).toBe(7)
  expect(container.textContent).not.toContain('Experimental')
  expect(container.querySelector('a[href^="/hourly?"]')?.getAttribute('href')).toContain('algo=trend-quality')
})

test('method change preserves URL state, rescores and redraws without refetching', async () => {
  mockRouter.query = { d: '14', ex: 'kraken', hl: 'eligible', sort: '-score' }
  await render()
  const originalChartData = latestChart().cryptos
  jest.mocked(processRankings).mockResolvedValue(result('new-leader'))
  const algorithmSelect = container.querySelector('select')!
  await act(async () => {
    algorithmSelect.value = 'momentum'
    algorithmSelect.dispatchEvent(new Event('change', { bubbles: true }))
  })
  expect(mockRouter.push).toHaveBeenLastCalledWith({
    pathname: '/', query: { d: '14', ex: 'kraken', hl: 'eligible', sort: '-score', algo: 'momentum' },
  }, undefined, { shallow: true, scroll: false })
  // Simulate the Next router publishing the navigation, including Back later.
  mockRouter.query = { ...mockRouter.query, algo: 'momentum' }
  await render()
  expect(topCryptos.getDailyRankings).toHaveBeenCalledTimes(1)
  expect(latestTable().scoreDescription).toContain('Price return')
  expect(latestChart().cryptos).not.toBe(originalChartData)
  expect(container.textContent).toContain('new-leader')
  delete mockRouter.query.algo
  await render()
  expect(processRankings).toHaveBeenLastCalledWith([], expect.any(Date), expect.any(Set), expect.objectContaining({ algorithm: 'classic' }))
  expect(topCryptos.getDailyRankings).toHaveBeenCalledTimes(1)
})

test('does not promote an unscorable coin to leader', async () => {
  jest.mocked(processRankings).mockResolvedValue(result('not-a-leader', false))
  await render()
  expect(container.textContent).not.toContain('not-a-leader')
  expect(latestTable().data[0].insufficientHistory).toBe(true)
})

test('hourly options reflect distinct timestamp coverage rather than response count', async () => {
  mockRouter.pathname = '/hourly'
  mockRouter.query = { h: '6', algo: 'momentum' }
  const now = Date.now()
  const data: any = Array.from({ length: 25 }, (_, i) => ({ data: [{ quote: { USD: {
    last_updated: new Date(now - (i % 3) * 3600000).toISOString(),
  } } }] }))
  jest.mocked(topCryptos.getHourlyRankings).mockResolvedValue(data)
  await render('hourly')
  const windows = Array.from(container.querySelectorAll('select')[1].querySelectorAll('option')).map((o) => o.value)
  expect(windows).toEqual(['3'])
  expect(mockRouter.push).toHaveBeenCalledWith({ pathname: '/hourly', query: { h: '3', algo: 'momentum' } }, undefined, { shallow: true, scroll: false })
  expect(processRankings).toHaveBeenLastCalledWith(data, expect.any(Date), expect.any(Set), expect.objectContaining({ intervalMs: 3600000 }))
})


test('an interval change hides old scores until the new calculation completes', async () => {
  await render()
  expect(container.textContent).toContain('eligible')
  let finish: (value: any) => void = () => {}
  jest.mocked(processRankings).mockReturnValue(new Promise((resolve) => { finish = resolve }))
  mockRouter.query = { d: '14' }
  await render()
  expect(container.textContent).not.toContain('eligible')
  expect(container.textContent).toContain('Scoring…')
  await act(async () => finish(result('new-window')))
  expect(container.textContent).toContain('new-window')
})


test('an open hourly page refreshes its data and stops polling on unmount', async () => {
  jest.useFakeTimers()
  try {
    mockRouter.pathname = '/hourly'
    await render('hourly')
    expect(topCryptos.getHourlyRankings).toHaveBeenCalledTimes(1)
    await act(async () => { jest.advanceTimersByTime(5 * 60_000) })
    expect(topCryptos.getHourlyRankings).toHaveBeenCalledTimes(2)
    await act(async () => root.render(<div />))
    await act(async () => { jest.advanceTimersByTime(5 * 60_000) })
    expect(topCryptos.getHourlyRankings).toHaveBeenCalledTimes(2)
  } finally {
    jest.useRealTimers()
  }
})
