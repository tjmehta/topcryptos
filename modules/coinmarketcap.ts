import { cache, cacheKey } from './cache'
import { roundToHour, setHour } from './roundToHour'

import ApiClient from 'simple-api-client'
import FSStore from './FSStore'
import S3Store from './S3Store'
import { get } from 'env-var'
import path from 'path'

const USE_FS_CACHE = get('USE_FS_CACHE').asBool()
const CACHE_STORE_DIR = get('CACHE_STORE_DIR').required().asString()
const CMC_API_KEY = get('CMC_API_KEY').required().asString()
const maxCacheDuration = 15 * 60 * 60 * 1000 // 15 min

export type Listings = {
  status: {
    timestamp: string // Date
    error_code: number
    error_message: string | null
    elapsed: number
    credit_count: number
    notice: string | null
  }
  data: {
    id: number
    name: string
    symbol: string
    slug: string
    num_market_pairs: number
    date_added: string // Date
    tags: Array<string>
    max_supply: number
    circulating_supply: number
    total_supply: number
    platform: null
    cmc_rank: number
    last_updated: string // Date
    quote: {
      USD: {
        price: number
        volume_24h: number
        percent_change_1h: number
        percent_change_24h: number
        percent_change_7d: number
        market_cap: number
        last_updated: string // Date
      }
    }
  }[]
}

type Exchanges = {}

export type ListingsOpts = {
  start: number
  limit: number
  date?: Date
  hourlyCron?: boolean
}

export type ExchangesOpts = {
  start: number
  limit: number
  date?: Date
}

const fsStore = new FSStore(path.resolve(CACHE_STORE_DIR, 'coinmarketcap'))
const s3Store = new S3Store()
const store = USE_FS_CACHE ? fsStore : s3Store

const errorDatesByKey: {
  [key: string]: {
    err: Error
    date: Date
  }
} = {}

class CoinMarketCap extends ApiClient {
  latestListingsCache: {
    date: Date
    result: Listings
  } = null

  constructor() {
    super('https://pro-api.coinmarketcap.com/v1/', {
      headers: {
        'X-CMC_PRO_API_KEY': CMC_API_KEY,
      },
    })
  }

  hourlyCachedMarkets = async (
    opts: ListingsOpts,
  ): Promise<Listings | null> => {
    // @ts-ignore
    const cacheOpts = {
      ...opts,
      date: roundToHour(opts.date),
    }
    const key = cacheKey('cryptocurrency_listings', cacheOpts)

    return await store.get<Listings>(key)
  }

  dailyCachedMarkets = async (opts: ListingsOpts): Promise<Listings | null> => {
    // @ts-ignore
    let cacheOpts = {
      ...opts,
      date: setHour(opts.date, 23),
    }
    let key = cacheKey('cryptocurrency_listings', cacheOpts)

    let result = await store.get<Listings>(key)
    if (result == null) {
      cacheOpts = {
        ...opts,
        hourlyCron: true,
        date: setHour(opts.date, 22),
      }
      key = cacheKey('cryptocurrency_listings', cacheOpts)
      result = await store.get<Listings>(key)
    }
    if (result == null) {
      console.warn('fallback to 16:00', opts.date)
      cacheOpts = {
        ...opts,
        hourlyCron: true,
        date: setHour(opts.date, 16),
      }
      key = cacheKey('cryptocurrency_listings', cacheOpts)
      result = await store.get<Listings>(key)
    }
    if (result == null) {
      console.warn('fallback to 10:00', opts.date)
      cacheOpts = {
        ...opts,
        hourlyCron: true,
        date: setHour(opts.date, 10),
      }
      key = cacheKey('cryptocurrency_listings', cacheOpts)
      result = await store.get<Listings>(key)
    }
    if (result == null) {
      console.warn('fallback to 4:00', opts.date)
      cacheOpts = {
        ...opts,
        hourlyCron: true,
        date: setHour(opts.date, 4),
      }
      key = cacheKey('cryptocurrency_listings', cacheOpts)
      result = await store.get<Listings>(key)
    }
    return result
  }

  listings = cache(
    {
      get: async ([opts]) => {
        // @ts-ignore
        const key = cacheKey('cryptocurrency_listings', opts)
        const now = Date.now()

        const errInfo = errorDatesByKey[key]
        if (errInfo) {
          if (now - errInfo.date.valueOf() > maxCacheDuration) {
            delete errorDatesByKey[key]
          } else {
            throw new Error('cached error')
          }
        }
        if (opts.hourlyCron) return

        // if date is missing, query is for latest listings
        if (opts.date == null) {
          if (this.latestListingsCache == null) return
          // get cache for latest listings
          const cacheDuration = now - this.latestListingsCache.date.valueOf()
          if (maxCacheDuration < cacheDuration) {
            this.latestListingsCache = null
            return
          }
          return this.latestListingsCache.result
        }

        return await store.get(key)
      },
      set: async ([opts], result) => {
        if (!result.data || !result.data[0]) {
          console.error('ERROR: unexpected response', { opts, result })
          return
        }
        const keyQuery = {
          ...opts,
          date: new Date(result.data[0].last_updated),
        }

        if (opts.date == null) {
          // if date is missing, query is for latest listings
          if (opts.hourlyCron) {
            // hourly cron query, round date and cache
            const rounded = roundToHour(keyQuery.date)
            console.log('hourlyCron: cmc set cache', {
              date: keyQuery.date,
              rounded,
            })
            keyQuery.date = rounded
          }
          // cache in memory
          this.latestListingsCache = {
            date: keyQuery.date,
            result,
          }
          if (!opts.hourlyCron) {
            // latest query, dont cache in store
            return result
          }
        }

        // cache in store
        const key = cacheKey('cryptocurrency_listings', keyQuery)

        return await store.set(key, result)
      },
    },
    async (opts: ListingsOpts): Promise<Listings> => {
      let query: {
        start: string
        limit: string
        date?: string
      } = {
        start: opts.start.toString(),
        limit: opts.limit.toString(),
      }

      let json: Listings
      if (opts.date == null) {
        json = await this.json<Listings>(
          'cryptocurrency/listings/latest',
          200,
          {
            query,
          },
        )
      } else {
        try {
          json = await this.json<Listings>(
            'cryptocurrency/listings/historical',
            200,
            {
              query: {
                ...query,
                date: new Date(opts.date).toISOString(),
              },
            },
          )
        } catch (err) {
          const key = cacheKey('cryptocurrency_listings', opts)
          errorDatesByKey[key] = {
            err,
            date: new Date(),
          }
          console.error('ERROR: cmc.historical.listings', err, opts)
          throw err
        }
      }
      // // sort by market cap?
      // json.data = json.data.sort((a, b) => {
      //   const mktCapA = a.quote.USD.market_cap
      //   const mktCapB = b.quote.USD.market_cap

      //   if (mktCapA > mktCapB) return -1
      //   if (mktCapA < mktCapB) return 1
      //   return 0
      // })
      return json
    },
  )

  exchanges = cache(
    {
      async get([opts]) {
        const key = cacheKey('exchange_listings', opts)
        return await store.get(key)
      },
      async set([opts], result) {
        const key = cacheKey('exchange_listings', opts)
        return await store.set(key, result)
      },
    },
    async (opts: ExchangesOpts): Promise<Exchanges> => {
      let query: {
        start: string
        limit: string
      } = {
        start: opts.start.toString(),
        limit: opts.limit.toString(),
      }

      const json: Exchanges = await this.json<Exchanges>(
        'exchange/listings/latest',
        200,
        {
          query,
        },
      )

      return json
    },
  )
}

export const cmc = new CoinMarketCap()
