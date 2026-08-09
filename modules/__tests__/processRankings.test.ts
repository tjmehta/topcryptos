import { NAN_SCORE, processRankings } from '../processRankings'

type Coin = { id: number; name: string; symbol: string; slug: string }

const A: Coin = { id: 1, name: 'Alpha', symbol: 'ALP', slug: 'alpha' }
const B: Coin = { id: 2, name: 'Beta', symbol: 'BET', slug: 'beta' }

/** Build one CMC-shaped listings snapshot. */
function snapshot(
  date: string,
  rows: Array<{ coin: Coin; price: number; marketCap: number }>,
) {
  return {
    status: {} as any,
    data: rows.map(({ coin, price, marketCap }) => ({
      ...coin,
      num_market_pairs: 0,
      date_added: '',
      tags: [] as string[],
      max_supply: 0,
      circulating_supply: 0,
      total_supply: 0,
      platform: null,
      cmc_rank: 0,
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

/**
 * Four evenly spaced daily snapshots.
 *   Alpha  — price accelerating upward (10 -> 12 -> 15 -> 19)
 *   Beta   — price perfectly flat at 5
 * Alpha always has the larger market cap, so it holds rank 1.
 */
const DATES = [
  '2026-08-01T23:00:00.000Z',
  '2026-08-02T23:00:00.000Z',
  '2026-08-03T23:00:00.000Z',
  '2026-08-04T23:00:00.000Z',
]
const ALPHA_PRICES = [10, 12, 15, 19]

const rankings = DATES.map((date, i) =>
  snapshot(date, [
    { coin: A, price: ALPHA_PRICES[i], marketCap: 1_000_000 * ALPHA_PRICES[i] },
    { coin: B, price: 5, marketCap: 1_000_000 },
  ]),
) as any

const START = new Date('2026-08-01T00:00:00.000Z')

describe('processRankings', () => {
  it('scores and ranks every coin in the window', async () => {
    const res = await processRankings(rankings, START, new Set())

    expect(res.cryptosSortedByScore).toHaveLength(2)
    expect(Object.keys(res.cryptosById).sort()).toEqual(['1', '2'])
    expect(res.cryptosSortedByScore.map((c) => c.rank)).toEqual([1, 2])
  })

  it('collects every quote in the window for each coin', async () => {
    const res = await processRankings(rankings, START, new Set())

    expect(res.cryptosById['1']!.quotes).toHaveLength(DATES.length)
    expect(res.cryptosById['1']!.quotes.map((q) => q.price)).toEqual(ALPHA_PRICES)
  })

  it('computes total price change across the window', async () => {
    const res = await processRankings(rankings, START, new Set())

    // 10 -> 19 is +90%
    expect(res.cryptosById['1']!.total!.pricePct).toBeCloseTo(90, 6)
    expect(res.cryptosById['2']!.total!.pricePct).toBe(0)
  })

  /**
   * Regression: `if (total?.pricePct)` rejected a pricePct of exactly 0, so a
   * perfectly flat coin scored NaN -> NAN_SCORE and was hidden from the chart
   * (RankingsChart maps NAN_SCORE to stroke-width 0 and opacity 0).
   */
  it('gives a flat coin a real score rather than NAN_SCORE', async () => {
    const res = await processRankings(rankings, START, new Set())
    const beta = res.cryptosById['2']!

    expect(beta.total!.pricePct).toBe(0)
    expect(beta.score).not.toBe(NAN_SCORE)
    expect(Number.isFinite(beta.score)).toBe(true)
  })

  it('ranks the rising coin above the flat one', async () => {
    const res = await processRankings(rankings, START, new Set())

    expect(res.cryptosById['1']!.score).toBeGreaterThan(
      res.cryptosById['2']!.score,
    )
  })

  /**
   * Regression: averageDate mixed units — it added `durationMinutes / 2` to a
   * millisecond epoch, landing 720ms after the window start instead of 12 hours.
   */
  it('places averageDate at the true midpoint of the window', async () => {
    const res = await processRankings(rankings, START, new Set())
    const total = res.cryptosById['1']!.total!

    const start = total.startQuote.date.valueOf()
    const end = total.endQuote.date.valueOf()
    expect(total.averageDate.valueOf()).toBe(start + (end - start) / 2)

    // and concretely: midway between Aug 1 23:00 and Aug 4 23:00
    expect(total.averageDate.toISOString()).toBe('2026-08-03T11:00:00.000Z')
  })

  it('excludes quotes before the start date', async () => {
    const res = await processRankings(
      rankings,
      new Date('2026-08-03T00:00:00.000Z'),
      new Set(),
    )

    expect(res.cryptosById['1']!.quotes).toHaveLength(2)
    expect(res.cryptosById['1']!.quotes.map((q) => q.price)).toEqual([15, 19])
  })

  it('keeps disabled coins out of the min/max ranges used for scaling', async () => {
    const withB = await processRankings(rankings, START, new Set())
    const withoutB = await processRankings(rankings, START, new Set(['2']))

    // Beta is still processed and returned...
    expect(withoutB.cryptosById['2']).toBeDefined()
    // ...but no longer stretches the rank range the chart's y-axis uses.
    expect(withoutB.minMaxes.rankByMarketCapMinMax.max).toBeLessThan(
      withB.minMaxes.rankByMarketCapMinMax.max,
    )
  })
})
