/**
 * Exchange -> coin membership, used by the exchange filter on the rankings UI.
 *
 * The app's coin universe is keyed by CoinMarketCap id, but the cheapest source
 * of "which coins trade on which exchange" is CoinGecko, which keys everything
 * by its own slug. Everything in here is pure so the join can be tested without
 * a network or credentials; fetching lives in the cron route that calls it.
 */

export type ExchangeSummary = {
  id: string
  name: string
  /** CoinGecko trust score rank; lower is better. Null when unranked. */
  rank: number | null
}

export type ExchangeMap = {
  generatedAt: string
  exchanges: ExchangeSummary[]
  /** CMC coin id -> ids of exchanges the coin trades on, sorted. */
  exchangeIdsByCoinId: Record<string, string[]>
}

/**
 * What actually gets persisted.
 *
 * The refresh cron rebuilds only a couple of exchanges per run to stay inside
 * CoinGecko's keyless rate limit, so the raw per-exchange membership has to be
 * carried between runs — `exchangeIdsByCoinId` alone can't be updated
 * incrementally without losing the other exchanges' contributions.
 */
export type ExchangeMapState = ExchangeMap & {
  /**
   * Every exchange the rotation knows about.
   *
   * Kept separate from `exchanges` (the served subset) on purpose:
   * `buildExchangeMap` drops exchanges that resolved to no coins, so persisting
   * the built list as the roster would permanently shrink it to whatever had
   * data on the first run and strand every exchange not yet fetched.
   */
  roster: ExchangeSummary[]
  /** When `roster` was last fetched from CoinGecko. */
  rosterFetchedAt: string
  /** exchange id -> CoinGecko coin ids last seen trading there */
  geckoCoinIdsByExchangeId: Record<string, string[]>
  /** exchange id -> ISO timestamp of its last successful refresh */
  refreshedAt: Record<string, string>
}

/**
 * The `count` exchanges most overdue for a refresh, never-fetched ones first.
 * Keeps the rotation deterministic so successive runs make forward progress
 * instead of re-fetching whichever exchange happens to sort first.
 */
export function pickStaleExchanges(
  exchanges: ExchangeSummary[],
  refreshedAt: Record<string, string>,
  count: number,
): ExchangeSummary[] {
  return exchanges
    .slice()
    .sort((a, b) => {
      const at = refreshedAt[a.id]
      const bt = refreshedAt[b.id]
      if (at == null && bt == null) return (a.rank ?? Infinity) - (b.rank ?? Infinity)
      if (at == null) return -1
      if (bt == null) return 1
      return at.localeCompare(bt)
    })
    .slice(0, count)
}

/** The identifying fields of a CMC listing entry. */
export type CoinIdentity = {
  id: string
  name: string
  symbol: string
  slug: string
}

/** An entry from CoinGecko's /coins/list. */
export type GeckoCoin = {
  id: string
  symbol: string
  name: string
}

export type Resolution = {
  /** CoinGecko id -> CMC id. */
  cmcIdByGeckoId: Record<string, string>
  /** CMC coins that could not be matched to any CoinGecko coin. */
  unresolved: CoinIdentity[]
  /** How each resolved coin was matched, for observability. */
  counts: { slug: number; name: number; symbol: number }
}

function indexBy(coins: GeckoCoin[], pick: (c: GeckoCoin) => string) {
  const out: Record<string, string[]> = {}
  for (const coin of coins) {
    const key = pick(coin).toLowerCase()
    ;(out[key] = out[key] || []).push(coin.id)
  }
  return out
}

/**
 * Join CMC coins onto CoinGecko ids.
 *
 * Tried in descending order of confidence:
 *   1. CMC slug === CoinGecko id (the two projects agree surprisingly often)
 *   2. unique name match
 *   3. unique symbol match
 *
 * Symbol is deliberately last and only accepted when unambiguous — symbols are
 * heavily reused across unrelated tokens, and a wrong join here would silently
 * attribute one coin's exchange listings to another. Measured against the live
 * top 200 this resolves ~95%; the remainder are simply absent from the filter
 * rather than wrong, which is the safer failure.
 */
export function resolveGeckoIds(
  coins: CoinIdentity[],
  geckoCoins: GeckoCoin[],
): Resolution {
  const geckoIds = new Set(geckoCoins.map((c) => c.id))
  const byName = indexBy(geckoCoins, (c) => c.name)
  const bySymbol = indexBy(geckoCoins, (c) => c.symbol)

  const cmcIdByGeckoId: Record<string, string> = {}
  const unresolved: CoinIdentity[] = []
  const counts = { slug: 0, name: 0, symbol: 0 }

  for (const coin of coins) {
    let geckoId: string | undefined
    let via: keyof typeof counts | undefined

    const slug = coin.slug?.toLowerCase()
    const nameMatches = byName[coin.name?.toLowerCase()] ?? []
    const symbolMatches = bySymbol[coin.symbol?.toLowerCase()] ?? []

    if (slug && geckoIds.has(slug)) {
      geckoId = slug
      via = 'slug'
    } else if (nameMatches.length === 1) {
      geckoId = nameMatches[0]
      via = 'name'
    } else if (symbolMatches.length === 1) {
      geckoId = symbolMatches[0]
      via = 'symbol'
    }

    if (geckoId == null || via == null) {
      unresolved.push(coin)
      continue
    }
    // First writer wins: `coins` arrives in market-cap order, so if two CMC
    // entries collide on one CoinGecko coin the larger one keeps the mapping.
    if (cmcIdByGeckoId[geckoId] == null) {
      cmcIdByGeckoId[geckoId] = coin.id
      counts[via] += 1
    }
  }

  return { cmcIdByGeckoId, unresolved, counts }
}

/**
 * Invert per-exchange CoinGecko coin ids into CMC-keyed membership.
 *
 * Exchanges that resolve to no known coin are dropped from `exchanges` — an
 * option in the filter dropdown that can never match anything is worse than no
 * option at all.
 */
export function buildExchangeMap(opts: {
  exchanges: ExchangeSummary[]
  /** exchange id -> CoinGecko coin ids seen trading there */
  geckoCoinIdsByExchangeId: Record<string, string[]>
  cmcIdByGeckoId: Record<string, string>
  generatedAt: string
}): ExchangeMap {
  const { exchanges, geckoCoinIdsByExchangeId, cmcIdByGeckoId, generatedAt } =
    opts

  const coinIds: Record<string, Set<string>> = {}
  const nonEmpty = new Set<string>()

  for (const exchange of exchanges) {
    const geckoIds = geckoCoinIdsByExchangeId[exchange.id] ?? []
    for (const geckoId of geckoIds) {
      const cmcId = cmcIdByGeckoId[geckoId]
      if (cmcId == null) continue
      ;(coinIds[cmcId] = coinIds[cmcId] || new Set()).add(exchange.id)
      nonEmpty.add(exchange.id)
    }
  }

  const exchangeIdsByCoinId: Record<string, string[]> = {}
  for (const [cmcId, ids] of Object.entries(coinIds)) {
    exchangeIdsByCoinId[cmcId] = [...ids].sort()
  }

  return {
    generatedAt,
    exchanges: exchanges
      .filter((e) => nonEmpty.has(e.id))
      .sort((a, b) => (a.rank ?? Infinity) - (b.rank ?? Infinity)),
    exchangeIdsByCoinId,
  }
}

/**
 * Coins matching *any* of `exchangeIds` (OR semantics, for a multiselect).
 *
 * An empty selection means "no filter" and returns null so callers can skip
 * filtering entirely rather than conflating it with "nothing matched".
 */
export function selectCoinIdsOnExchanges(
  map: Pick<ExchangeMap, 'exchangeIdsByCoinId'>,
  exchangeIds: string[],
): Set<string> | null {
  if (exchangeIds.length === 0) return null
  const wanted = new Set(exchangeIds)
  const out = new Set<string>()
  for (const [coinId, ids] of Object.entries(map.exchangeIdsByCoinId)) {
    if (ids.some((id) => wanted.has(id))) out.add(coinId)
  }
  return out
}
