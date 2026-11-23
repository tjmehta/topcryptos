import { abovePriorHighPct, serializeJsonLd, utcLabel } from '../rankingSummary'
import { loadRankingSummary, loadSnapshots, summarizeScores } from '../rankingSummaryServer'

import { cmc } from '../coinmarketcap'
import { getRankingWindow } from '../rankingWindow'
import { processRankings } from '../processRankings'

jest.mock('../coinmarketcap', () => ({
  cmc: {
    hourlyCachedMarkets: jest.fn(),
    dailyCachedMarkets: jest.fn(),
    listings: jest.fn(),
  },
}))
jest.mock('../exchangeOhlc', () => ({ loadExchangeOhlc: jest.fn() }))

const hourly = cmc.hourlyCachedMarkets as jest.Mock
const daily = cmc.dailyCachedMarkets as jest.Mock
const listings = cmc.listings as jest.Mock

const COINS = Array.from({ length: 14 }, (_, i) => ({
  id: i + 1,
  name: `Coin ${i + 1}`,
  symbol: `C${i + 1}`,
  slug: `coin-${i + 1}`,
}))

/** CMC-shaped snapshot; rows are ordered by market cap like the provider's. */
function snapshot(date: string, step: number) {
  const rows = COINS.map((coin, i) => {
    // Deterministic, varied paths: some trend up, some down, some wobble.
    const drift = ((i % 5) - 2) * 0.01
    const wobble = Math.sin(step * (i + 1) * 0.7) * 0.02
    const price = (10 + i) * Math.exp(drift * step + wobble)
    return { coin, price, marketCap: price * 1e8 * (COINS.length - i) }
  }).sort((a, b) => b.marketCap - a.marketCap)
  return {
    status: {} as any,
    data: rows.map(({ coin, price, marketCap }, rank) => ({
      ...coin,
      num_market_pairs: 0,
      date_added: '',
      tags: [] as string[],
      max_supply: 0,
      circulating_supply: 0,
      total_supply: 0,
      platform: null,
      cmc_rank: rank + 1,
      last_updated: date,
      quote: {
        USD: {
          price,
          volume_24h: 1000,
          percent_change_1h: 0,
          percent_change_24h: 0,
          percent_change_7d: 0,
          market_cap: marketCap,
          last_updated: date,
        },
      },
    })),
  }
}

const NOW = new Date('2026-11-23T05:20:00.000Z')
const LATEST = '2026-11-23T05:05:00.000Z'

beforeEach(() => {
  hourly.mockReset()
  daily.mockReset()
  listings.mockReset()
})

describe('page summary JSON-LD', () => {
  it('escapes markup in third-party names so they cannot close the script tag', () => {
    const out = serializeJsonLd([{ '@type': 'ListItem', name: '</script><script>alert(1)</script>' }])
    expect(out).not.toContain('<')
    expect(JSON.parse(out)['@graph'][0].name).toBe('</script><script>alert(1)</script>')
  })

  it('formats timestamps in fixed UTC so server and client text match', () => {
    expect(utcLabel('2026-11-23T05:05:59.000Z')).toBe('2026-11-23 05:05 UTC')
  })

  it('reports a breakout score as the percentage above the prior high', () => {
    expect(abovePriorHighPct(Math.log(1.05))).toBeCloseTo(5, 10)
  })
})

describe('loadSnapshots', () => {
  it('reads daily history from stored cron snapshots only, on the API route bucket dates', async () => {
    hourly.mockImplementation(async ({ date }: { date: Date }) =>
      date.toISOString() === '2026-11-23T05:00:00.000Z' ? snapshot(LATEST, 0) : null,
    )
    daily.mockImplementation(async ({ date }: { date: Date }) => snapshot(date.toISOString(), 1))

    const buckets = await loadSnapshots('daily', 10, NOW)

    expect(listings).not.toHaveBeenCalled()
    expect(daily.mock.calls.map(([q]) => q.date.toISOString())).toEqual(
      Array.from({ length: 10 }, (_, i) => `2026-11-${String(22 - i).padStart(2, '0')}T23:00:00.000Z`),
    )
    expect(buckets).toHaveLength(11)
    // Oldest first, newest (the latest hourly snapshot) last.
    expect(buckets.at(-1)!.data[0].last_updated).toBe(LATEST)
  })

  it('looks back past a missed cron hour and skips missing buckets', async () => {
    hourly.mockImplementation(async ({ date }: { date: Date }) => {
      const iso = date.toISOString()
      if (iso === '2026-11-23T05:00:00.000Z' || iso === '2026-11-23T02:00:00.000Z') return null
      return snapshot(iso, 0)
    })

    const buckets = await loadSnapshots('hourly', 6, NOW)

    expect(listings).not.toHaveBeenCalled()
    // Latest found at 04:00; older buckets 04:00..23:00 minus the missing 02:00.
    expect(buckets.map((b) => b.data[0].last_updated)).toEqual([
      '2026-11-22T23:00:00.000Z',
      '2026-11-23T00:00:00.000Z',
      '2026-11-23T01:00:00.000Z',
      '2026-11-23T03:00:00.000Z',
      '2026-11-23T04:00:00.000Z',
      '2026-11-23T04:00:00.000Z',
    ])
  })

  it('applies the API universe: top 500 and market cap above $10M', async () => {
    const small = snapshot(LATEST, 0)
    small.data[small.data.length - 1].quote.USD.market_cap = 5e6
    hourly.mockResolvedValue(small)
    daily.mockResolvedValue(null)
    const [only] = await loadSnapshots('daily', 3, NOW)
    expect(only.data).toHaveLength(COINS.length - 1)
  })

  it('throws when no recent snapshot is stored, so ISR keeps the last good page', async () => {
    hourly.mockResolvedValue(null)
    daily.mockResolvedValue(null)
    await expect(loadRankingSummary('daily', 10, NOW)).rejects.toThrow('No recent hourly snapshot')
  })
})

describe('summary parity with the page scorer', () => {
  it('scoring only the window buckets ranks the same top entries as the full 90-day feed', async () => {
    const asOf = new Date(LATEST)
    const full = Array.from({ length: 90 }, (_, back) => {
      const date = new Date(Date.UTC(2026, 10, 22 - back, 23))
      return snapshot(date.toISOString(), 90 - back)
    }).reverse()
    full.push(snapshot(LATEST, 91))
    const windowOnly = full.slice(-11)

    const { startDate, endDate, intervalMs } = getRankingWindow('daily', 10, asOf)
    const opts = { algorithm: 'classic' as const, endDate, intervalMs }
    const a = summarizeScores('daily', 10, LATEST, await processRankings(full as any, startDate, new Set(), opts))
    const b = summarizeScores('daily', 10, LATEST, await processRankings(windowOnly as any, startDate, new Set(), opts))

    expect(a.entries.length).toBe(10)
    expect(b).toEqual(a)
  })

  it('builds the summary end to end from stored snapshots', async () => {
    hourly.mockImplementation(async () => snapshot(LATEST, 11))
    daily.mockImplementation(async ({ date }: { date: Date }) =>
      snapshot(date.toISOString(), 11 - Math.round((NOW.valueOf() - date.valueOf()) / 86_400_000)),
    )
    const summary = await loadRankingSummary('daily', 10, NOW)
    expect(summary).toMatchObject({ kind: 'rankings', mode: 'daily', window: 10, asOf: LATEST, asOfLabel: '2026-11-23 05:05 UTC' })
    expect(summary.entries.map((e) => e.position)).toEqual(Array.from({ length: 10 }, (_, i) => i + 1))
    expect(summary.scoredCount).toBe(COINS.length)
  })
})
