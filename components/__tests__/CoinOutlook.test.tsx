/** @jest-environment jsdom */
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { CoinOutlook } from '../CoinOutlook'
import type { Crypto } from '@/modules/processRankings'

jest.mock('lucide-react', () => ({
  X: () => null,
  Star: () => null,
  XIcon: () => null,
}))
jest.mock('d3', () => ({ format: () => (n: number) => n.toFixed(2) }))
let root: Root
let container: HTMLDivElement
const now = new Date('2026-09-14T06:30:00Z')
const coin: Crypto = {
  id: '1',
  name: 'Example',
  symbol: 'EX',
  slug: 'example',
  rank: 1,
  score: 1,
  total: null,
  coverage: 1,
  insufficientHistory: false,
  pricePctAccelsSum: 0,
  rankAccelsSum: 0,
  quotes: [100, 105, 110].map((price, i) => ({
    id: '1',
    name: 'Example',
    symbol: 'EX',
    slug: 'example',
    price,
    marketCap: 1e8,
    dayVolume: 1e6,
    rankByMarketCap: 210 - i * 10,
    date: new Date(+now - (2 - i) * 3600000),
  })),
}
const props = () => ({
  cryptos: [coin],
  peers: [coin],
  rankings: [],
  highlightedIds: new Set(['1']),
  selectedId: '1',
  onSelect: jest.fn(),
  onClose: jest.fn(),
  restoreFocus: jest.fn(),
  mode: 'hourly' as const,
  amount: 3,
  algorithm: 'momentum' as const,
  algorithmLabel: 'Momentum',
  hiddenCoins: false,
  exchangeFiltered: false,
  isDesktop: true,
})
beforeEach(() => {
  jest
    .useFakeTimers({ doNotFake: ['setTimeout', 'clearTimeout'] })
    .setSystemTime(now)
  Object.assign(globalThis, {
    IS_REACT_ACT_ENVIRONMENT: true,
    fetch: jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        context: 'hourly:3:momentum:building',
        studiedAt: '2026-09-14',
        rows: [],
      }),
    }),
  })
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
})
afterEach(() => {
  act(() => root.unmount())
  container.remove()
  jest.useRealTimers()
})
async function openEvidence() {
  await act(async () => {
    const details = [...container.querySelectorAll('details')].find((d) =>
      d.querySelector('summary')?.textContent?.includes('Past outcomes'),
    )!
    details.open = true
    details.dispatchEvent(new Event('toggle'))
  })
}

test('opening a coin shows measured levels, with evidence fetched only on demand', async () => {
  await act(async () => root.render(<CoinOutlook {...props()} />))
  expect(container.textContent).toContain('Price and rank improving')
  expect(container.textContent).toContain('#210 → #190')
  expect(container.textContent).toContain('Prior sampled high')
  expect(container.textContent).toContain('105.00')
  expect(fetch).not.toHaveBeenCalled()
  await openEvidence()
  expect(fetch).toHaveBeenCalledWith(
    expect.stringContaining('view=3&method=momentum&state=building'),
    expect.any(Object),
  )
  expect(container.textContent).toContain('No completed outcomes')
})

test('a starred coin outside the tested top ten gets no matched historical claim', async () => {
  await act(async () =>
    root.render(<CoinOutlook {...props()} cryptos={[{ ...coin, rank: 11 }]} />),
  )
  await openEvidence()
  expect(fetch).not.toHaveBeenCalled()
  expect(container.textContent).toContain('No matching sample')
})

test('a mismatched evidence response is rejected', async () => {
  jest.mocked(fetch).mockResolvedValue({
    ok: true,
    json: async () => ({ context: 'daily:7:classic:building', rows: [] }),
  } as Response)
  await act(async () => root.render(<CoinOutlook {...props()} />))
  await openEvidence()
  expect(container.textContent).toContain("Results couldn't load")
})

test('pinning does not open a panel and close restores the invoking control', async () => {
  const p = props()
  await act(async () => root.render(<CoinOutlook {...p} selectedId={null} />))
  expect(
    container.querySelector('section[aria-label="Example outlook"]'),
  ).toBeNull()
  await act(async () => root.render(<CoinOutlook {...p} />))
  act(() =>
    (
      container.querySelector(
        '[aria-label="Close outlook"]',
      ) as HTMLButtonElement
    ).click(),
  )
  expect(p.onClose).toHaveBeenCalled()
  expect(p.restoreFocus).toHaveBeenCalled()
})

test('fallback-provider identity cannot inherit CMC evidence or attribution', async () => {
  await act(async () =>
    root.render(
      <CoinOutlook
        {...props()}
        selectedId="example-slug"
        cryptos={[{ ...coin, id: 'example-slug' }]}
      />,
    ),
  )
  await openEvidence()
  expect(fetch).not.toHaveBeenCalled()
  expect(container.textContent).toContain('Saved market quotes')
  expect(container.textContent).not.toContain('CoinMarketCap ·')
})
