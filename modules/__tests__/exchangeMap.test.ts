import {
  CoinIdentity,
  GeckoCoin,
  buildExchangeMap,
  pickStaleExchanges,
  resolveGeckoIds,
  selectCoinIdsOnExchanges,
} from '../exchangeMap'

const coin = (
  id: string,
  name: string,
  symbol: string,
  slug: string,
): CoinIdentity => ({ id, name, symbol, slug })

const gecko = (id: string, symbol: string, name: string): GeckoCoin => ({
  id,
  symbol,
  name,
})

describe('resolveGeckoIds', () => {
  it('matches on slug when it equals the CoinGecko id', () => {
    const res = resolveGeckoIds(
      [coin('1', 'Bitcoin', 'BTC', 'bitcoin')],
      [gecko('bitcoin', 'btc', 'Bitcoin')],
    )

    expect(res.cmcIdByGeckoId).toEqual({ bitcoin: '1' })
    expect(res.counts.slug).toBe(1)
    expect(res.unresolved).toEqual([])
  })

  it('falls back to a unique name match when the slug differs', () => {
    const res = resolveGeckoIds(
      [coin('2', 'Wrapped Bitcoin', 'WBTC', 'wrapped-bitcoin-cmc')],
      [gecko('wrapped-bitcoin', 'wbtc', 'Wrapped Bitcoin')],
    )

    expect(res.cmcIdByGeckoId).toEqual({ 'wrapped-bitcoin': '2' })
    expect(res.counts.name).toBe(1)
  })

  it('falls back to a unique symbol match when slug and name both differ', () => {
    const res = resolveGeckoIds(
      [coin('3', 'Ether', 'ETH', 'ether')],
      [gecko('ethereum', 'eth', 'Ethereum')],
    )

    expect(res.cmcIdByGeckoId).toEqual({ ethereum: '3' })
    expect(res.counts.symbol).toBe(1)
  })

  it('is case insensitive on name and symbol', () => {
    const res = resolveGeckoIds(
      [coin('4', 'SOLANA', 'sol', 'solana-x')],
      [gecko('solana', 'SOL', 'Solana')],
    )

    expect(res.cmcIdByGeckoId).toEqual({ solana: '4' })
  })

  /**
   * The important negative case: symbols are heavily reused, and a wrong join
   * would silently attribute one coin's exchange listings to another. Ambiguity
   * must drop the coin, not guess.
   */
  it('refuses an ambiguous symbol match', () => {
    const res = resolveGeckoIds(
      [coin('5', 'Some Token', 'ONE', 'some-token')],
      [
        gecko('harmony', 'one', 'Harmony'),
        gecko('one-hundred', 'one', 'One Hundred'),
      ],
    )

    expect(res.cmcIdByGeckoId).toEqual({})
    expect(res.unresolved.map((c) => c.id)).toEqual(['5'])
  })

  it('refuses an ambiguous name match', () => {
    const res = resolveGeckoIds(
      [coin('6', 'Gemini', 'GEM', 'gemini-x')],
      [gecko('gemini-a', 'gma', 'Gemini'), gecko('gemini-b', 'gmb', 'Gemini')],
    )

    expect(res.unresolved.map((c) => c.id)).toEqual(['6'])
  })

  it('keeps the first (higher market cap) coin when two collide on one gecko id', () => {
    const res = resolveGeckoIds(
      [coin('10', 'Bitcoin', 'BTC', 'bitcoin'), coin('11', 'Bitcoin', 'BTC', 'bitcoin')],
      [gecko('bitcoin', 'btc', 'Bitcoin')],
    )

    expect(res.cmcIdByGeckoId).toEqual({ bitcoin: '10' })
    expect(res.unresolved).toEqual([])
  })

  it('reports coins with no match at all', () => {
    const res = resolveGeckoIds(
      [coin('7', 'Nowhere Coin', 'NWC', 'nowhere-coin')],
      [gecko('bitcoin', 'btc', 'Bitcoin')],
    )

    expect(res.cmcIdByGeckoId).toEqual({})
    expect(res.unresolved.map((c) => c.name)).toEqual(['Nowhere Coin'])
  })
})

describe('buildExchangeMap', () => {
  const exchanges = [
    { id: 'binance', name: 'Binance', rank: 1 },
    { id: 'gdax', name: 'Coinbase Exchange', rank: 2 },
    { id: 'ghost', name: 'Ghost Exchange', rank: 3 },
  ]
  const cmcIdByGeckoId = { bitcoin: '1', ethereum: '1027', solana: '5426' }

  const map = buildExchangeMap({
    exchanges,
    geckoCoinIdsByExchangeId: {
      binance: ['bitcoin', 'ethereum', 'unknown-coin'],
      gdax: ['bitcoin', 'solana'],
      ghost: ['also-unknown'],
    },
    cmcIdByGeckoId,
    generatedAt: '2026-08-08T23:00:00.000Z',
  })

  it('keys membership by CMC id', () => {
    expect(map.exchangeIdsByCoinId).toEqual({
      '1': ['binance', 'gdax'],
      '1027': ['binance'],
      '5426': ['gdax'],
    })
  })

  it('ignores gecko coins outside the app universe', () => {
    expect(Object.values(map.exchangeIdsByCoinId).flat()).not.toContain(
      'unknown-coin',
    )
  })

  it('drops exchanges that match no known coin', () => {
    expect(map.exchanges.map((e) => e.id)).toEqual(['binance', 'gdax'])
  })

  it('orders exchanges by rank', () => {
    const shuffled = buildExchangeMap({
      exchanges: [
        { id: 'gdax', name: 'Coinbase Exchange', rank: 2 },
        { id: 'binance', name: 'Binance', rank: 1 },
      ],
      geckoCoinIdsByExchangeId: { binance: ['bitcoin'], gdax: ['bitcoin'] },
      cmcIdByGeckoId,
      generatedAt: '2026-08-08T23:00:00.000Z',
    })

    expect(shuffled.exchanges.map((e) => e.id)).toEqual(['binance', 'gdax'])
  })

  it('sorts unranked exchanges last', () => {
    const withUnranked = buildExchangeMap({
      exchanges: [
        { id: 'mystery', name: 'Mystery', rank: null },
        { id: 'binance', name: 'Binance', rank: 1 },
      ],
      geckoCoinIdsByExchangeId: { binance: ['bitcoin'], mystery: ['bitcoin'] },
      cmcIdByGeckoId,
      generatedAt: '2026-08-08T23:00:00.000Z',
    })

    expect(withUnranked.exchanges.map((e) => e.id)).toEqual([
      'binance',
      'mystery',
    ])
  })
})

describe('selectCoinIdsOnExchanges', () => {
  const map = {
    exchangeIdsByCoinId: {
      '1': ['binance', 'gdax'],
      '1027': ['binance'],
      '5426': ['gdax'],
      '99': ['kraken'],
    },
  }

  it('returns null for an empty selection so callers can skip filtering', () => {
    expect(selectCoinIdsOnExchanges(map, [])).toBeNull()
  })

  it('selects coins on a single exchange', () => {
    expect([...selectCoinIdsOnExchanges(map, ['gdax'])!].sort()).toEqual([
      '1',
      '5426',
    ])
  })

  it('unions across a multiselect rather than intersecting', () => {
    expect(
      [...selectCoinIdsOnExchanges(map, ['gdax', 'kraken'])!].sort(),
    ).toEqual(['1', '5426', '99'])
  })

  it('returns an empty set when nothing matches', () => {
    expect([...selectCoinIdsOnExchanges(map, ['nope'])!]).toEqual([])
  })

  it('ignores unknown exchange ids mixed into the selection', () => {
    expect([...selectCoinIdsOnExchanges(map, ['kraken', 'nope'])!]).toEqual([
      '99',
    ])
  })
})

describe('pickStaleExchanges', () => {
  const exchanges = [
    { id: 'binance', name: 'Binance', rank: 1 },
    { id: 'gdax', name: 'Coinbase', rank: 2 },
    { id: 'kraken', name: 'Kraken', rank: 3 },
  ]

  it('prefers never-refreshed exchanges, best-ranked first', () => {
    expect(pickStaleExchanges(exchanges, {}, 2).map((e) => e.id)).toEqual([
      'binance',
      'gdax',
    ])
  })

  it('puts never-refreshed ahead of already-refreshed', () => {
    const refreshedAt = {
      binance: '2026-08-08T00:00:00.000Z',
      gdax: '2026-08-08T00:00:00.000Z',
    }
    expect(pickStaleExchanges(exchanges, refreshedAt, 1).map((e) => e.id)).toEqual(
      ['kraken'],
    )
  })

  it('orders refreshed exchanges oldest-first', () => {
    const refreshedAt = {
      binance: '2026-08-08T05:00:00.000Z',
      gdax: '2026-08-08T01:00:00.000Z',
      kraken: '2026-08-08T03:00:00.000Z',
    }
    expect(pickStaleExchanges(exchanges, refreshedAt, 3).map((e) => e.id)).toEqual(
      ['gdax', 'kraken', 'binance'],
    )
  })

  /**
   * The rotation is what makes the keyless budget workable: successive runs
   * must advance rather than re-fetching the same exchange forever.
   */
  it('advances across successive runs', () => {
    const refreshedAt: Record<string, string> = {}
    const seen: string[] = []
    for (let run = 0; run < 3; run++) {
      const [next] = pickStaleExchanges(exchanges, refreshedAt, 1)
      seen.push(next.id)
      refreshedAt[next.id] = new Date(2026, 7, 8, run).toISOString()
    }
    expect(seen).toEqual(['binance', 'gdax', 'kraken'])
  })

  it('never returns more than asked for', () => {
    expect(pickStaleExchanges(exchanges, {}, 10)).toHaveLength(3)
  })
})
