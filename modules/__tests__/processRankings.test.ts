import {
  MAX_SCORE,
  NAN_SCORE,
  processRankings,
  cumulativeLogStrength,
  type RankingAlgorithm,
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

describe('corrected scoring and interval candidates', () => {
  const hour = 3600000
  const origin = Date.parse('2026-08-01T00:00:00Z')
  const date = (hours: number) => new Date(origin + hours * hour)
  const series = (prices: number[], hours = prices.map((_, i) => i)) =>
    prices.map((price, i) => snapshot(date(hours[i]).toISOString(), [
      { coin: A, price, marketCap: 1000 },
    ])) as any

  it('uses exact inclusive time boundaries and differentiates hourly windows', async () => {
    const data = series([10, 11, 12, 13, 14, 15, 16])
    const short = await processRankings(data, date(3), new Set(), { endDate: date(5), intervalMs: hour })
    const long = await processRankings(data, date(0), new Set(), { endDate: date(5), intervalMs: hour })
    expect(short.cryptosById['1']!.quotes.map(q => q.price)).toEqual([13, 14, 15])
    expect(long.cryptosById['1']!.quotes.map(q => q.price)).toEqual([10, 11, 12, 13, 14, 15])
    expect(short.cryptosById['1']!.total!.pricePct).not.toBe(long.cryptosById['1']!.total!.pricePct)
  })

  it('sorts measurements without mutating inputs and collapses exact duplicates', async () => {
    const data = series([10, 12, 15, 19])
    const original = structuredClone(data)
    const ordered = await processRankings(data, date(0), new Set())
    const shuffled = await processRankings([data[3], data[1], data[0], data[2], data[1]], date(0), new Set())
    expect(shuffled.cryptosSortedByScore).toEqual(ordered.cryptosSortedByScore)
    expect(data).toEqual(original)
  })

  it('does not let duplicates satisfy the history floor or select a conflicting price', async () => {
    const data = series([10, 12, 15])
    const duplicate = await processRankings([data[0], data[1], data[1]], date(0), new Set())
    expect(duplicate.cryptosById['1']!.insufficientHistory).toBe(true)
    const conflicting = structuredClone(data[1])
    conflicting.data[0].quote.USD.price = 100
    const result = await processRankings([...data, conflicting], date(0), new Set())
    expect(result.cryptosById['1']!.quotes.map(q => q.price)).toEqual([10, 15])
    expect(result.cryptosById['1']!.insufficientHistory).toBe(true)
  })

  it('ignores invalid prices and timestamps before calculating derivatives', async () => {
    const data = series([10, 11, 12, 13, 14, 15])
    data[1].data[0].quote.USD.price = 0
    data[2].data[0].quote.USD.price = Infinity
    data[3].data[0].quote.USD.last_updated = 'invalid'
    const result = await processRankings(data, date(0), new Set())
    expect(result.cryptosById['1']!.quotes.map(q => q.price)).toEqual([10, 14, 15])
    expect(Number.isFinite(result.cryptosById['1']!.score)).toBe(true)
  })

  it('gates stale endpoints, interior gaps, sparse counts and globally truncated windows', async () => {
    const options = { endDate: date(10), intervalMs: hour }
    for (const hours of [[0, 1, 10], [0, 2, 4, 6, 8], [8, 9, 10], [0, 1, 2]]) {
      const result = await processRankings(series(hours.map(i => 10 + i), hours), date(0), new Set(), options)
      expect(result.cryptosById['1']!.insufficientHistory).toBe(true)
      expect(result.cryptosById['1']!.score).toBe(NAN_SCORE)
    }
    const complete = await processRankings(series(Array.from({ length: 11 }, (_, i) => 10 + i)), date(0), new Set(), options)
    expect(complete.cryptosById['1']!.insufficientHistory).toBe(false)
  })

  it('uses provider market-cap ranks even when peer rows are missing', async () => {
    const data = series([10, 10, 10])
    data.forEach(s => { s.data[0].cmc_rank = 42 })
    const result = await processRankings(data, date(0), new Set())
    expect(result.cryptosById['1']!.quotes.map(q => q.rankByMarketCap)).toEqual([42, 42, 42])
    expect(result.cryptosById['1']!.rankAccelsSum).toBe(0)
  })

  it('rewards accelerating rank improvement and penalizes deterioration', async () => {
    const run = async (ranks: number[]) => {
      const data = series([10, 10, 10])
      data.forEach((s, i) => { s.data[0].cmc_rank = ranks[i] })
      return (await processRankings(data, date(0), new Set())).cryptosById['1']!
    }
    expect((await run([4, 3, 1])).score).toBeGreaterThan(0)
    expect((await run([1, 2, 4])).score).toBeLessThan(0)
    expect((await run([4, 3, 2])).score).toBe(0)
  })

  it('does not award percentile weight to floating-point acceleration dust', async () => {
    const result = await processRankings(series([100, 110, 121, 133.1]), date(0), new Set())
    expect(result.cryptosById['1']!.pricePctAccelsSum).toBe(0)
    expect(result.cryptosById['1']!.score).toBe(350)
  })

  it('keeps market-cap and score ties deterministic across row order', async () => {
    const data = [0, 1, 2].map(h => snapshot(date(h).toISOString(), [
      { coin: A, price: 10, marketCap: 1000 }, { coin: B, price: 10, marketCap: 1000 },
    ])) as any
    const a = await processRankings(data, date(0), new Set())
    const b = await processRankings(data.map(s => ({ ...s, data: s.data.slice().reverse() })), date(0), new Set())
    expect(a.cryptosSortedByScore).toEqual(b.cryptosSortedByScore)
    expect(a.cryptosSortedByScore.map(c => c.id)).toEqual(['1', '2'])
  })

  it('momentum orders endpoint returns and trend quality favors a smooth equal-return path', async () => {
    const prices = [[100, 110, 121, 133.1], [100, 200, 50, 133.1]]
    const data = [0, 1, 2, 3].map(i => snapshot(date(i).toISOString(), [
      { coin: A, price: prices[0][i], marketCap: 2000 },
      { coin: B, price: prices[1][i], marketCap: 1000 },
    ])) as any
    const momentum = await processRankings(data, date(0), new Set(), { algorithm: 'momentum' })
    expect(momentum.cryptosById['1']!.score).toBe(momentum.cryptosById['2']!.score)
    const trend = await processRankings(data, date(0), new Set(), { algorithm: 'trend-quality' })
    expect(trend.cryptosById['1']!.score).toBeGreaterThan(trend.cryptosById['2']!.score)
    data[3].data[1].quote.USD.price = 150
    const changed = await processRankings(data, date(0), new Set(), { algorithm: 'momentum' })
    expect(changed.cryptosById['2']!.score).toBeGreaterThan(changed.cryptosById['1']!.score)
  })

  it.each<RankingAlgorithm>(['classic', 'momentum', 'trend-quality', 'cumulative', 'hybrid'])('%s preserves losers, flat prices and common eligibility', async algorithm => {
    const down = await processRankings(series([100, 50, 25]), date(0), new Set(), { algorithm })
    expect(down.cryptosById['1']!.score).toBeLessThan(0)
    const flat = await processRankings(series([10, 10, 10]), date(0), new Set(), { algorithm })
    expect(flat.cryptosById['1']!.score).toBe(0)
    const short = await processRankings(series([10, 20]), date(0), new Set(), { algorithm })
    expect(short.cryptosById['1']!.score).toBe(NAN_SCORE)
  })
})

describe('cumulative strength', () => {
  const hour = 3_600_000
  const path = (prices: number[], times = prices.map((_, i) => i)) => prices.map((price, i) => ({ price, date: new Date(times[i] * hour) }))

  it('distinguishes sustained gains from an equal endpoint spike with known integral values', () => {
    expect(cumulativeLogStrength(path([100, 200, 200]), 2 * hour)).toBeCloseTo(.75 * Math.log(2), 12)
    expect(cumulativeLogStrength(path([100, 100, 200]), 2 * hour)).toBeCloseTo(.25 * Math.log(2), 12)
  })

  it('weights elapsed time, preserves price scale, and does not reward additional sampling', () => {
    const raw = cumulativeLogStrength(path([100, 200, 200]), 2 * hour)
    expect(cumulativeLogStrength(path([1000, 2000, 2000]), 2 * hour)).toBeCloseTo(raw, 12)
    expect(cumulativeLogStrength(path([100, Math.sqrt(20000), 200, 200], [0, .5, 1, 2]), 2 * hour)).toBeCloseTo(raw, 12)
    expect(cumulativeLogStrength(path([100, 200, 200], [0, .5, 2]), 2 * hour)).toBeCloseTo(.875 * Math.log(2), 12)
    expect(cumulativeLogStrength(path([100, 200, 200]), 4 * hour)).toBeCloseTo(raw / 2, 12)
  })

  it('does not turn mathematically cancelling growth into a signed rank through roundoff', async () => {
    for (const scale of [1, 100, 1e-6, 1e6]) {
      const prices = [1, 2, 1, .5, 1].map(price => price * scale)
      expect(cumulativeLogStrength(path(prices), 4 * hour)).toBe(0)
      const data = prices.map((price, i) => snapshot(new Date(i * hour).toISOString(), [
        { coin: A, price, marketCap: 2000 },
      ]))
      const result = await processRankings(data, new Date(0), new Set(), { algorithm: 'cumulative' })
      expect(result.cryptosById['1']?.score).toBe(0)
    }
    expect(cumulativeLogStrength(path([1, 2, 1, .5, 1.000001]), 4 * hour)).toBeGreaterThan(0)
  })

  it('normalizes each hybrid component before the fixed equal blend and ignores future observations', async () => {
    const data = [0, 1, 2].map(i => snapshot(new Date(i * hour).toISOString(), [
      { coin: A, price: [100, 200, 200][i], marketCap: 2000 },
      { coin: B, price: [100, 100, 200][i], marketCap: 1000 },
    ]))
    const opts = { endDate: new Date(2 * hour), intervalMs: hour }
    const momentum = await processRankings(data, new Date(0), new Set(), { ...opts, algorithm: 'momentum' })
    expect(momentum.cryptosById['1']?.score).toBe(500)
    expect(momentum.cryptosById['2']?.score).toBe(500)
    const cumulative = await processRankings(data, new Date(0), new Set(), { ...opts, algorithm: 'cumulative' })
    expect(cumulative.cryptosById['1']?.score).toBe(750)
    expect(cumulative.cryptosById['2']?.score).toBe(250)
    const hybrid = await processRankings(data, new Date(0), new Set(), { ...opts, algorithm: 'hybrid' })
    expect(hybrid.cryptosById['1']?.score).toBe(625)
    expect(hybrid.cryptosById['2']?.score).toBe(375)
    const future = snapshot(new Date(3 * hour).toISOString(), [{ coin: B, price: 10000, marketCap: 1e8 }])
    for (const algorithm of ['cumulative', 'hybrid'] as const) {
      const before = await processRankings(data, new Date(0), new Set(), { ...opts, algorithm })
      const after = await processRankings([...data, future], new Date(0), new Set(), { ...opts, algorithm })
      expect(after.cryptosSortedByScore.map(c => [c.id, c.score])).toEqual(before.cryptosSortedByScore.map(c => [c.id, c.score]))
    }
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
