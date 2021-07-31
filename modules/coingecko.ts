import { cache, cacheKey } from './cache'
import { roundToHour, setHour } from './roundToHour'

import ApiClient from 'simple-api-client'
import FSStore from './FSStore'
import { Listings } from './coinmarketcap'
import S3Store from './S3Store'
import { get } from 'env-var'
import path from 'path'
import { timesParallel } from 'times-loop'

const USE_FS_CACHE = get('USE_FS_CACHE').asBool()
const CACHE_STORE_DIR = get('CACHE_STORE_DIR').required().asString()
const maxCacheDuration = 15 * 60 * 60 * 1000 // 15 min

const fsStore = new FSStore(path.resolve(CACHE_STORE_DIR, 'coinmarketcap'))
const s3Store = new S3Store()
const store = USE_FS_CACHE ? fsStore : s3Store

enum CurrencyEnum {
  USD = 'usd',
}

enum OrderBy {
  GECKO_DESC = 'gecko_desc',
  GECKO_ASC = 'gecko_asc',
  MARKET_CAP_ASC = 'market_cap_asc',
  MARKET_CAP_DESC = 'market_cap_desc',
  VOLUME_ASC = 'volume_asc',
  VOLUME_DESC = 'volume_desc',
  ID_ASC = 'id_asc',
  ID_DESC = 'id_desc',
}

enum DurationEnum {
  D_1H = '1h',
  D_24H = '24h',
  D_7D = '7d',
  D_14D = '14d',
  D_30D = '30d',
  D_200D = '200d',
  D_1Y = '1y',
}

type MarketsOpts = {
  vsCurrency?: CurrencyEnum
  ids?: string[]
  order?: OrderBy
  limit?: number
  hourlyCron?: boolean
}

type MarketQuery = {
  vs_currency?: CurrencyEnum
  ids?: string[]
  order?: OrderBy
  per_page?: string
  page?: string
  price_change_percentage?: string
}

export type Market = {
  id: string // 'bitcoin',
  symbol: string // 'btc',
  name: string // 'Bitcoin',
  image: string // 'https://assets.coingecko.com/coins/images/1/large/bitcoin.png?1547033579',
  current_price: number //  33610,
  market_cap: number //  628120709357,
  market_cap_rank: number // 1
  fully_diluted_valuation: number //  703419225204
  total_volume: number // 23514432191
  high_24h: number // 33695
  low_24h: number // 32389
  price_change_24h: number // 676.69
  price_change_percentage_24h: number //  2.05473
  market_cap_change_24h: number // 7499905651
  market_cap_change_percentage_24h: number //  1.20845
  circulating_supply: number // 18752025
  total_supply: number // 21000000
  max_supply: number // 21000000
  ath: number // 64805
  ath_change_percentage: number // -48.33613
  ath_date: string // '2021-04-14T11:54:46.763Z'
  atl: number // 67.81
  atl_change_percentage: number //  49274.90678
  atl_date: string // '2013-07-06T00:00:00.000Z'
  last_updated: string //  '2021-07-09T20:41:24.904Z'
  price_change_percentage_1h_in_currency: number // 0.1288386958004491,
  price_change_percentage_24h_in_currency: number // 1.8660369574306768,
  price_change_percentage_7d_in_currency: number // -0.29337879351626955
  // roi: null
}

const errorDatesByKey: {
  [key: string]: {
    err: Error
    date: Date
  }
} = {}

export class CoinGecko extends ApiClient {
  latestMarketsCache: {
    date: Date
    result: Market[]
  } = null

  constructor() {
    super('https://api.coingecko.com/api/v3/', {
      throttle: {
        statusCodes: /.*/,
        timeout: 60 * 1000,
      },
    })
  }

  static toCMCListing = (markets: Market[]): Listings => {
    const listings: Listings = {
      status: {
        timestamp: new Date().toISOString(),
        error_code: NaN,
        error_message: null,
        elapsed: NaN,
        credit_count: NaN,
        notice: null,
      },
      data: markets.map<Listings['data'][0]>((market) => ({
        id: (market.id as any) as number, // hack
        name: market.name,
        symbol: market.symbol,
        slug: market.id,
        num_market_pairs: NaN,
        date_added: '',
        tags: [],
        max_supply: market.max_supply,
        total_supply: market.total_supply,
        circulating_supply: market.circulating_supply,
        platform: null,
        cmc_rank: market.market_cap_rank,
        last_updated: market.last_updated,
        quote: {
          USD: {
            price: market.current_price,
            volume_24h: market.total_volume,
            percent_change_1h: market.price_change_percentage_1h_in_currency,
            percent_change_24h: market.price_change_percentage_24h_in_currency,
            percent_change_7d: market.price_change_percentage_7d_in_currency,
            market_cap: market.market_cap,
            last_updated: market.last_updated,
          },
        },
      })),
    }

    return listings
  }

  hourlyCachedMarkets = async (
    opts: MarketsOpts & { date: Date },
  ): Promise<Market[] | null> => {
    // @ts-ignore
    const cacheOpts = {
      ...opts,
      date: roundToHour(opts.date),
    }
    const key = cacheKey('cryptocurrency_markets', cacheOpts)

    return await store.get<Market[]>(key)
  }

  dailyCachedMarkets = async (
    opts: MarketsOpts & { date: Date },
  ): Promise<Market[] | null> => {
    // @ts-ignore
    const cacheOpts = {
      ...opts,
      date: setHour(opts.date, 23),
    }
    const key = cacheKey('cryptocurrency_markets', cacheOpts)

    let result = await store.get<Market[]>(key)
    if (result == null) {
      const cacheOpts2 = {
        ...opts,
        date: setHour(opts.date, 22),
      }
      const key2 = cacheKey('cryptocurrency_markets', cacheOpts2)
      result = await store.get<Market[]>(key2)
    }
    return result
  }

  markets = cache(
    {
      get: async ([opts = {}]) => {
        // @ts-ignore
        if (opts.hourlyCron) return
        if (this.latestMarketsCache == null) return

        const now = Date.now()
        // get cache for latest listings
        const cacheDuration = now - this.latestMarketsCache.date.valueOf()
        if (maxCacheDuration < cacheDuration) {
          this.latestMarketsCache = null
          return
        }
        return this.latestMarketsCache.result
      },
      set: async ([opts = {}], result) => {
        if (!result || !result[0]) {
          console.error('ERROR: unexpected response', { opts, result })
          return
        }
        const keyQuery = {
          ...opts,
          date: new Date(result[0].last_updated),
        }

        if (opts.hourlyCron) {
          // hourly cron query, round date and cache
          const rounded = roundToHour(keyQuery.date)
          console.log('hourlyCron: coingecko set cache', {
            date: keyQuery.date,
            rounded,
          })
          keyQuery.date = rounded
        }
        // cache in memory
        this.latestMarketsCache = {
          date: keyQuery.date,
          result,
        }
        if (!opts.hourlyCron) {
          // latest query, dont cache in store
          return result
        }

        // cache in store
        const key = cacheKey('cryptocurrency_markets', keyQuery)

        return await store.set(key, result)
      },
    },
    async (opts: MarketsOpts = {}): Promise<Market[]> => {
      const { vsCurrency, ids, order, limit = 250 } = opts

      const query: MarketQuery = {
        vs_currency: vsCurrency ?? CurrencyEnum.USD,
        per_page: limit.toString(),
        price_change_percentage: [
          DurationEnum.D_1H,
          DurationEnum.D_24H,
          DurationEnum.D_7D,
        ].join(','),
      }
      if (ids) query.ids = ids
      if (order) query.order = order

      let json: Market[] = []
      if (limit <= 250) {
        json = await this.get<MarketQuery>('coins/markets', {
          query,
        })
      } else {
        const count = Math.ceil(limit / 250)
        const pages: Market[][] = await timesParallel(
          count,
          (i): Promise<Market[]> =>
            this.get<MarketQuery>('coins/markets', {
              query: {
                ...query,
                per_page: '250',
                page: (i + 1).toString(),
              },
            }),
        )
        json = json.concat(...pages).slice(0, limit)
      }

      return json
    },
  )
}

export const coingecko = new CoinGecko()
