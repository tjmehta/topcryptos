/** @jest-environment jsdom */
import { act, type ComponentProps } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { RankingsChart } from '../RankingsChart'
import { D3Chart } from '../D3Chart'
import { MinMaxState } from '@/modules/MinMax'
import type { Crypto } from '@/modules/processRankings'

// Observe the imperative renderer's invalidation boundary, without importing
// D3's ESM graph or simulating SVG geometry in jsdom.
jest.mock('../D3Chart', () => ({ D3Chart: jest.fn(() => null) }))
jest.mock('d3', () => ({
  format: () => (value: number) => String(value),
  select: () => ({ selectAll: () => ({ classed: () => undefined }) }),
}))

type Props = ComponentProps<typeof RankingsChart>
const coin = (id: string): Crypto => ({
  id, name: id, symbol: id, slug: id, total: null, rank: 1, quotes: [],
  pricePctAccelsSum: 0, rankAccelsSum: 0, score: 1,
  coverage: 1, insufficientHistory: false,
})
const defaults = (): Props => ({
  cryptos: [coin('a'), coin('b'), coin('c')],
  minMaxes: {
    dateMinMax: new MinMaxState(new Date('2026-09-01')),
    pricePctVelocityMinMax: new MinMaxState(1),
    pricePctAccelsSumMinMax: new MinMaxState(1),
    rankByMarketCapMinMax: new MinMaxState(500),
    rankAccelsSumMinMax: new MinMaxState(1),
    scoreMinMax: new MinMaxState(1),
  },
  points: 7, maxSeries: 2, highlightedIds: new Set(), hiddenIds: new Set(),
  activeCryptoId: null, onToggleHighlight: jest.fn(), onHover: jest.fn(),
})
let root: Root
let container: HTMLDivElement
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
})
afterEach(() => {
  act(() => root.unmount())
  container.remove()
})
function render(props: Props) {
  act(() => root.render(<RankingsChart {...props} />))
  const calls = jest.mocked(D3Chart).mock.calls
  return calls[calls.length - 1][0].renderKey
}

test('redraws when exchange membership changes with the same capped count', () => {
  const props = defaults()
  const before = render(props)
  expect(render({ ...props, cryptos: [coin('d'), coin('e'), coin('f')] })).not.toBe(before)
})

test('redraws when new quotes arrive for the same coin IDs', () => {
  const props = defaults()
  const before = render(props)
  expect(render({ ...props, cryptos: props.cryptos.map(c => ({ ...c, score: 2 })) })).not.toBe(before)
})

test('redraws after scales or time window change', () => {
  const props = defaults()
  const before = render(props)
  const scales = render({ ...props, minMaxes: { ...props.minMaxes, scoreMinMax: new MinMaxState(5) } })
  expect(scales).not.toBe(before)
  expect(render({ ...props, points: 21 })).not.toBe(scales)
})

test('hover does not redraw paths or clear the active coin', () => {
  const props = defaults()
  const before = render(props)
  jest.mocked(props.onHover).mockClear()
  expect(render({ ...props, activeCryptoId: 'a' })).toBe(before)
  expect(props.onHover).not.toHaveBeenCalled()
})

test('pinning and hiding still invalidate the drawing', () => {
  const props = defaults()
  const before = render(props)
  const pinned = render({ ...props, highlightedIds: new Set(['c']) })
  expect(pinned).not.toBe(before)
  expect(render({ ...props, hiddenIds: new Set(['a']) })).not.toBe(pinned)
})

test('changing exchange data clears stale hover state', () => {
  const props = defaults()
  render(props)
  jest.mocked(props.onHover).mockClear()
  render({ ...props, cryptos: [coin('d'), coin('e')] })
  expect(props.onHover).toHaveBeenCalledWith(null)
})
