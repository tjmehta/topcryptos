import { topCryptos } from '../topCryptos'
import type { Listing, Listings } from '../uiTypes'

function listing(id: number, rank: number, updated: string): Listing {
  return {
    id, name: `Coin ${id}`, symbol: `C${id}`, slug: `coin-${id}`,
    num_market_pairs: 1, date_added: '', tags: [], max_supply: 0,
    circulating_supply: 1, total_supply: 1, platform: null, cmc_rank: rank,
    last_updated: updated,
    quote: { USD: {
      price: 10, volume_24h: 1000, percent_change_1h: 0,
      percent_change_24h: 0, percent_change_7d: 0,
      market_cap: 1000 / rank, last_updated: updated,
    } },
  }
}

afterEach(() => jest.restoreAllMocks())

test.each(['daily', 'hourly'] as const)(
  '%s fetch keeps repeated quotes in their source snapshots for rank assignment',
  async (mode) => {
    let request = 0
    const fetch = jest.spyOn(globalThis, 'fetch').mockImplementation(async () => {
      const snapshot: Listings = {
        status: { timestamp: '', error_code: 0, error_message: null, elapsed: 0, credit_count: 0, notice: null },
        data: [
          // A stalled quote still occupies source rank 1 in every snapshot.
          listing(1, 1, '2026-09-01T00:00:00Z'),
          listing(2, 2, `2026-09-01T${String(request++).padStart(2, '0')}:03:00Z`),
        ],
      }
      return new Response(JSON.stringify([snapshot]), {
        status: 200, headers: { 'content-type': 'application/json' },
      })
    })
    const result = mode === 'daily'
      ? await topCryptos.getDailyRankings({})
      : await topCryptos.getHourlyRankings({})
    expect(fetch).toHaveBeenCalledTimes(mode === 'daily' ? 10 : 5)
    expect(result.length).toBeGreaterThan(1)
    for (const snapshot of result) {
      expect(snapshot.data.map(coin => coin.id)).toEqual([1, 2])
      expect(snapshot.data[1].cmc_rank).toBe(2)
    }
  },
)
