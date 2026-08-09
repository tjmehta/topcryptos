/**
 * Shared wire types for the rankings payload.
 *
 * These deliberately live in a module with no runtime imports. Previously the
 * client pulled `RankingsResponse` from `pages/api/rankings/hourly`, which
 * transitively imports `coinmarketcap.ts` — and that reads `CMC_API_KEY` and the
 * AWS credentials at module scope via `env-var`'s `.required()`. That dragged
 * server-only code into the browser bundle and blew up prerendering with an
 * unrelated-looking error.
 */

export type Quote = {
  price: number
  volume_24h: number
  percent_change_1h: number
  percent_change_24h: number
  percent_change_7d: number
  market_cap: number
  last_updated: string
}

export type Listing = {
  id: number
  name: string
  symbol: string
  slug: string
  num_market_pairs: number
  date_added: string
  tags: Array<string>
  max_supply: number
  circulating_supply: number
  total_supply: number
  platform: null
  cmc_rank: number
  last_updated: string
  quote: { USD: Quote }
}

export type Listings = {
  status: {
    timestamp: string
    error_code: number
    error_message: string | null
    elapsed: number
    credit_count: number
    notice: string | null
  }
  data: Listing[]
}

/** One entry per day/hour bucket, oldest first. */
export type RankingsResponse = Listings[]
