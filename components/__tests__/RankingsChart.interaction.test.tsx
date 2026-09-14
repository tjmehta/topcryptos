/** @jest-environment jsdom */
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { RankingsChart } from '../RankingsChart'
import { MinMaxState } from '@/modules/MinMax'
import type { Crypto } from '@/modules/processRankings'

// Exercise the real SVG renderer using D3's bundled CommonJS distribution.
jest.mock('d3', () => jest.requireActual('../../node_modules/d3/dist/d3.min.js'))

let root: Root
let container: HTMLDivElement
const toggle = jest.fn()
const hover = jest.fn()
const coin = (id: string, rank: number, score: number): Crypto => ({
  id, name: id, symbol: id, slug: id, rank, score, total: null,
  quotes: [new Date('2026-09-01'), new Date('2026-09-02')].map(date => ({
    id, name: id, symbol: id, slug: id, date, rankByMarketCap: rank,
    price: 1, marketCap: 1, dayVolume: 1,
  })),
  pricePctAccelsSum: 0, rankAccelsSum: 0, coverage: 1, insufficientHistory: false,
})

beforeEach(() => {
  jest.useFakeTimers()
  Object.assign(globalThis, {
    IS_REACT_ACT_ENVIRONMENT: true,
    ResizeObserver: class {
      constructor(private callback: ResizeObserverCallback) {}
      observe() { this.callback([{ contentRect: { width: 600 } }] as ResizeObserverEntry[], this as unknown as ResizeObserver) }
      disconnect() {}
    },
  })
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
  const dates = new MinMaxState(new Date('2026-09-01'))
  dates.compare(new Date('2026-09-02'))
  act(() => root.render(<RankingsChart
    cryptos={[coin('strong', 1, 100), coin('middle', 100, 50), coin('pinned', 200, 1)]}
    minMaxes={{
      dateMinMax: dates, rankByMarketCapMinMax: new MinMaxState(200),
      scoreMinMax: new MinMaxState(100), pricePctVelocityMinMax: new MinMaxState(1),
      pricePctAccelsSumMinMax: new MinMaxState(1), rankAccelsSumMinMax: new MinMaxState(1),
    }}
    points={1} highlightedIds={new Set(['pinned'])} hiddenIds={new Set()}
    activeCryptoId={null} onToggleHighlight={toggle} onHover={hover}
  />))
})
afterEach(() => {
  act(() => root.unmount())
  container.remove()
  jest.clearAllTimers()
  jest.useRealTimers()
})

function pointerEvent(target: Element, type: string, init: MouseEventInit = {}, primary = true) {
  const event = new MouseEvent(type, { bubbles: true, clientX: 30, clientY: 120, button: 0, ...init })
  Object.assign(event, { pointerId: 1, pointerType: 'mouse', isPrimary: primary })
  act(() => { target.dispatchEvent(event) })
}
function key(target: Element, value: string) {
  act(() => { target.dispatchEvent(new KeyboardEvent('keydown', { key: value, bubbles: true })) })
}

for (const side of ['start', 'end']) {
  const rail = () => container.querySelector(`.rank-rail-${side} .rank-rail-hit`)!
  test(`${side}: pointer release stars the hovered coin even without a click`, () => {
    pointerEvent(rail(), 'pointerenter')
    const selected = hover.mock.calls.at(-1)![0]
    pointerEvent(rail(), 'pointerdown')
    pointerEvent(rail(), 'pointerup')
    expect(toggle).toHaveBeenCalledTimes(1)
    expect(toggle).toHaveBeenCalledWith(selected)
    pointerEvent(rail(), 'click', { detail: 1 })
    expect(toggle).toHaveBeenCalledTimes(1)
  })
  test(`${side}: clicking preserves arrow-key selection`, () => {
    pointerEvent(rail(), 'pointerenter')
    key(rail(), 'Home')
    key(rail(), 'ArrowDown')
    pointerEvent(rail(), 'pointermove', { clientY: 121 })
    pointerEvent(rail(), 'pointerdown', { clientY: 121 })
    pointerEvent(rail(), 'pointerup', { clientY: 121 })
    expect(toggle).toHaveBeenCalledWith('middle')
  })
  test.each(['drag', 'cancel', 'leave', 'secondary'])(`${side}: %s does not star a coin`, kind => {
    pointerEvent(rail(), 'pointerenter')
    pointerEvent(rail(), 'pointerdown', { button: kind === 'secondary' ? 2 : 0 })
    if (kind === 'drag') {
      pointerEvent(rail(), 'pointermove', { clientY: 160 })
      pointerEvent(rail(), 'pointermove', { clientY: 120 })
    }
    if (kind === 'cancel') pointerEvent(rail(), 'pointercancel')
    if (kind === 'leave') pointerEvent(rail(), 'pointerleave')
    pointerEvent(rail(), 'pointerup')
    pointerEvent(rail(), 'click', { detail: 1 })
    expect(toggle).not.toHaveBeenCalled()
  })
  test(`${side}: keyboard and assistive clicks still activate`, () => {
    act(() => { rail().dispatchEvent(new FocusEvent('focus')) })
    key(rail(), 'Enter')
    key(rail(), ' ')
    pointerEvent(rail(), 'click', { detail: 0 })
    expect(toggle.mock.calls).toEqual([['strong'], ['strong'], ['strong']])
  })
}

test('overlapping hit targets put strong lines above faint lines and pinned lines on top', () => {
  const ids = (selector: string) => [...container.querySelectorAll(selector)].map(node => (node as Element & { __data__: Crypto }).__data__.id)
  expect(ids('.rank-hit')).toEqual(['middle', 'strong', 'pinned'])
  expect(ids('.rank-hit')).toEqual(ids('.rank-line'))
})
