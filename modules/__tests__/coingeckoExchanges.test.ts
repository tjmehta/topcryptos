import { fetchTopExchanges } from '../coingeckoExchanges'

/**
 * CoinGecko orders /exchanges by trust-score rank, and caps every DEX at a
 * trust score of 2 while centralised venues reach 9-10. The practical effect
 * is that DEXes land far down the list — Uniswap V3 sits near rank 176 — so a
 * top-20 cut is always entirely centralised. These tests pin the "name them
 * explicitly" escape hatch that makes a DEX reachable at all.
 */

type Row = { id: string; name: string; trust_score_rank: number | null }

const row = (id: string, name: string, rank: number | null): Row => ({
  id,
  name,
  trust_score_rank: rank,
})

/** Ranks 1..n as cexN, with the named DEXes parked down at realistic ranks. */
function catalogue(): Row[] {
  const cex = Array.from({ length: 40 }, (_, i) =>
    row(`cex${i + 1}`, `CEX ${i + 1}`, i + 1),
  )
  return [
    ...cex,
    row('pancakeswap-v3-bsc', 'PancakeSwap V3 (BSC)', 172),
    row('uniswap_v3', 'Uniswap V3 (Ethereum)', 176),
    row('curve_ethereum', 'Curve (Ethereum)', 198),
  ]
}

let requestedUrls: string[]

beforeEach(() => {
  requestedUrls = []
  global.fetch = jest.fn(async (url: any) => {
    requestedUrls.push(String(url))
    return {
      ok: true,
      status: 200,
      json: async () => catalogue(),
    }
  }) as any
})

afterEach(() => {
  jest.restoreAllMocks()
})

describe('fetchTopExchanges', () => {
  it('returns the top `limit` by rank and nothing below it', async () => {
    const res = await fetchTopExchanges(20)

    expect(res).toHaveLength(20)
    expect(res[0]).toEqual({ id: 'cex1', name: 'CEX 1', rank: 1 })
    expect(res[19]).toEqual({ id: 'cex20', name: 'CEX 20', rank: 20 })
    expect(res.map((e) => e.id)).not.toContain('cex21')
  })

  it('appends named exchanges ranked far outside the cut', async () => {
    const res = await fetchTopExchanges(20, ['uniswap_v3', 'curve_ethereum'])

    // The top 20 are untouched and still lead.
    expect(res.slice(0, 20).map((e) => e.id)).toEqual(
      Array.from({ length: 20 }, (_, i) => `cex${i + 1}`),
    )
    expect(res.slice(20)).toEqual([
      { id: 'uniswap_v3', name: 'Uniswap V3 (Ethereum)', rank: 176 },
      { id: 'curve_ethereum', name: 'Curve (Ethereum)', rank: 198 },
    ])
  })

  it('widens the page when extras are requested, so a rank-176 DEX is reachable', async () => {
    await fetchTopExchanges(20, ['uniswap_v3'])

    // A per_page=20 fetch could never contain rank 176 — this is the whole
    // reason the request widens, and it is still a single call.
    expect(requestedUrls).toHaveLength(1)
    expect(requestedUrls[0]).toContain('per_page=250')
  })

  it('does not widen the page when no extras are requested', async () => {
    await fetchTopExchanges(20)

    expect(requestedUrls[0]).toContain('per_page=20')
  })

  it('never duplicates an extra that already made the cut', async () => {
    const res = await fetchTopExchanges(20, ['cex3'])

    expect(res).toHaveLength(20)
    expect(res.filter((e) => e.id === 'cex3')).toHaveLength(1)
  })

  it('skips extras CoinGecko does not return rather than emitting holes', async () => {
    const res = await fetchTopExchanges(20, ['not-a-real-exchange', 'uniswap_v3'])

    expect(res).toHaveLength(21)
    expect(res.every((e) => e != null && typeof e.id === 'string')).toBe(true)
    expect(res.map((e) => e.id)).toContain('uniswap_v3')
    expect(res.map((e) => e.id)).not.toContain('not-a-real-exchange')
  })

  it('preserves a null rank rather than coercing it to a number', async () => {
    global.fetch = jest.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => [row('weird', 'Unranked Venue', null)],
    })) as any

    const res = await fetchTopExchanges(5)

    expect(res).toEqual([{ id: 'weird', name: 'Unranked Venue', rank: null }])
  })
})
