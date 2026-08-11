import {
  MAX_SCORE,
  NAN_SCORE,
  processRankings,
} from '../processRankings'

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

/**
 * Scoring across coins with unequal histories.
 *
 * All growth factors here (×1.25, ×1.5, ×4, ×0.5 per day) are exact in binary
 * floating point, so each coin's per-step percent velocity is exactly constant,
 * every acceleration sum is exactly 0, and market caps are fixed so ranks never
 * move. The score then reduces to the velocity term alone and the expected
 * values are exact: score = 0.7 · signedPercentile(velocity) · MAX_SCORE.
 */
describe('processRankings with unequal histories', () => {
  const LOW: Coin = { id: 11, name: 'Low', symbol: 'LOW', slug: 'low' }
  const MID: Coin = { id: 12, name: 'Mid', symbol: 'MID', slug: 'mid' }
  const HIGH: Coin = { id: 13, name: 'High', symbol: 'HIG', slug: 'high' }
  const FLAT: Coin = { id: 14, name: 'Flat', symbol: 'FLT', slug: 'flat' }
  const DOWN: Coin = { id: 15, name: 'Down', symbol: 'DWN', slug: 'down' }
  /** the dappOS case: enters the window on day 3 and doubles overnight */
  const NEWCOMER: Coin = { id: 16, name: 'Newcomer', symbol: 'NEW', slug: 'new' }

  const growth = (base: number, factor: number, i: number) =>
    base * Math.pow(factor, i)

  const unequalRankings = DATES.map((date, i) => {
    const rows = [
      { coin: HIGH, price: growth(10, 4, i), marketCap: 5_000_000 },
      { coin: MID, price: growth(10, 1.5, i), marketCap: 4_000_000 },
      { coin: LOW, price: growth(10, 1.25, i), marketCap: 3_000_000 },
      { coin: FLAT, price: 5, marketCap: 2_000_000 },
      { coin: DOWN, price: growth(10, 0.5, i), marketCap: 1_500_000 },
    ]
    if (i >= 2) {
      rows.push({ coin: NEWCOMER, price: growth(0.25, 2, i - 2), marketCap: 1_000_000 })
    }
    return snapshot(date, rows)
  }) as any

  it('does not score a coin with too little history, and ranks it last', async () => {
    const res = await processRankings(unequalRankings, START, new Set())
    const newcomer = res.cryptosById['16']!

    // +100% in a 3-day window: the highest raw velocity on the board by far,
    // but only 2 quotes spanning a third of the window.
    expect(newcomer.insufficientHistory).toBe(true)
    expect(newcomer.coverage).toBeCloseTo(1 / 3, 6)
    expect(newcomer.score).toBe(NAN_SCORE)
    expect(newcomer.rank).toBe(res.cryptosSortedByScore.length)
  })

  it('sorts an unscored coin below a genuine loser', async () => {
    const res = await processRankings(unequalRankings, START, new Set())

    // -87.5% over the window: the worst real score on the board...
    expect(res.cryptosById['15']!.score).toBeLessThan(0)
    // ...and still ranked above the coin that could not be scored at all.
    expect(res.cryptosById['15']!.rank).toBeLessThan(res.cryptosById['16']!.rank)
  })

  it('scores by percentile so one extreme mover cannot compress the field', async () => {
    const res = await processRankings(unequalRankings, START, new Set())

    // High's +6300% dwarfs Mid's +237.5%, but percentiles only order the
    // gainers: with three of them, ranks are 5/6, 3/6, and 1/6. Under the old
    // divide-by-max scaling Mid's velocity ratio was 237.5/6300 ≈ 0.038.
    expect(res.cryptosById['13']!.score).toBeCloseTo(0.7 * (5 / 6) * MAX_SCORE, 6)
    expect(res.cryptosById['12']!.score).toBeCloseTo(0.7 * (3 / 6) * MAX_SCORE, 6)
    expect(res.cryptosById['11']!.score).toBeCloseTo(0.7 * (1 / 6) * MAX_SCORE, 6)
    // The flat coin contributes to no pool and scores exactly 0.
    expect(res.cryptosById['14']!.score).toBe(0)
    // The lone decliner is the median (only) loser: -0.7 · 0.5 · MAX_SCORE.
    expect(res.cryptosById['15']!.score).toBeCloseTo(-0.7 * (1 / 2) * MAX_SCORE, 6)
  })

  it('keeps an ineligible outlier out of everyone else\'s percentiles', async () => {
    const withNewcomer = await processRankings(unequalRankings, START, new Set())
    const withoutNewcomer = await processRankings(
      DATES.map((date, i) =>
        snapshot(date, [
          { coin: HIGH, price: growth(10, 4, i), marketCap: 5_000_000 },
          { coin: MID, price: growth(10, 1.5, i), marketCap: 4_000_000 },
          { coin: LOW, price: growth(10, 1.25, i), marketCap: 3_000_000 },
          { coin: FLAT, price: 5, marketCap: 2_000_000 },
          { coin: DOWN, price: growth(10, 0.5, i), marketCap: 1_500_000 },
        ]),
      ) as any,
      START,
      new Set(),
    )

    for (const id of ['11', '12', '13', '14', '15']) {
      expect(withNewcomer.cryptosById[id]!.score).toBe(
        withoutNewcomer.cryptosById[id]!.score,
      )
    }
  })

  it('scores a coin whose coverage clears the floor', async () => {
    // Present from day 2 on: 3 quotes spanning 2 of the 3-day window (~0.67).
    const partial: Coin = { id: 17, name: 'Partial', symbol: 'PRT', slug: 'partial' }
    const res = await processRankings(
      DATES.map((date, i) =>
        snapshot(date, [
          { coin: MID, price: growth(10, 1.5, i), marketCap: 4_000_000 },
          ...(i >= 1
            ? [{ coin: partial, price: growth(10, 1.5, i - 1), marketCap: 1_000_000 }]
            : []),
        ]),
      ) as any,
      START,
      new Set(),
    )

    expect(res.cryptosById['17']!.insufficientHistory).toBe(false)
    expect(res.cryptosById['17']!.score).not.toBe(NAN_SCORE)
    // Same daily growth rate, but a third of its window is missing history —
    // coverage scaling counts that as no movement, so it scores below Mid.
    expect(res.cryptosById['17']!.score).toBeLessThan(res.cryptosById['12']!.score)
  })

  it('gates on coverage even when the quote count clears the floor', async () => {
    // Six-day window, but the coin only spans the last 2 days (coverage 0.4)
    // with 3 quotes — enough points, not enough of the window.
    const sixDates = [
      '2026-08-01T23:00:00.000Z',
      '2026-08-02T23:00:00.000Z',
      '2026-08-03T23:00:00.000Z',
      '2026-08-04T23:00:00.000Z',
      '2026-08-05T23:00:00.000Z',
      '2026-08-06T23:00:00.000Z',
    ]
    const late: Coin = { id: 18, name: 'Late', symbol: 'LTE', slug: 'late' }
    const res = await processRankings(
      sixDates.map((date, i) =>
        snapshot(date, [
          { coin: MID, price: growth(10, 1.5, i), marketCap: 4_000_000 },
          ...(i >= 3
            ? [{ coin: late, price: growth(10, 1.5, i - 3), marketCap: 1_000_000 }]
            : []),
        ]),
      ) as any,
      START,
      new Set(),
    )

    expect(res.cryptosById['18']!.quotes).toHaveLength(3)
    expect(res.cryptosById['18']!.coverage).toBeCloseTo(0.4, 6)
    expect(res.cryptosById['18']!.insufficientHistory).toBe(true)
    expect(res.cryptosById['18']!.score).toBe(NAN_SCORE)
  })
})
