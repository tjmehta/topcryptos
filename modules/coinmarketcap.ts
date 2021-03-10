import ApiClient from 'simple-api-client'
import FSStore from './FSStore'
import S3Store from './S3Store'
import { get } from 'env-var'
import path from 'path'
import stringify from 'fast-json-stable-stringify'

const CACHE_STORE_DIR = get('CACHE_STORE_DIR').required().asString()
const CMC_API_KEY = get('CMC_API_KEY').required().asString()

export type Listings = {
  status: {
    timestamp: string // Date
    error_code: number
    error_message: string | null
    elapsed: number
    credit_count: number
    notice: string | null
  }
  data: [
    {
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
    },
  ]
}

type Exchanges = {}

export type ListingsOpts = {
  start: number
  limit: number
  date?: Date
}

export type ExchangesOpts = {
  start: number
  limit: number
  date?: Date
}

const fsStore = new FSStore(path.resolve(CACHE_STORE_DIR, 'coinmarketcap'))
const s3Store = new S3Store()
const store = s3Store

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

  listings = cache(
    {
      get: async ([opts]) => {
        // @ts-ignore
        const key = cacheKey('cryptocurrency_listings', opts)
        // if date is missing, query is for latest listings
        if (opts.date == null) {
          if (this.latestListingsCache == null) return
          // get cache for latest listings
          const maxCacheDuration = 30 * 60 * 60 * 1000 // 30 min
          const cacheDuration =
            Date.now() - this.latestListingsCache.date.valueOf()
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
          console.error('unexpected response', result)
          return
        }
        const keyQuery = {
          ...opts,
          date: new Date(result.data[0].last_updated),
        }
        // if date is missing, query is for latest listings
        if (opts.date == null) {
          // set cache for latest listings
          this.latestListingsCache = {
            date: keyQuery.date,
            result,
          }
        }
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
          console.error(err, opts)
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

type CacheOpts<Result, Args> = {
  set: (args: Args, result: Result) => Promise<unknown>
  get: (args: Args) => Promise<Result | undefined>
}

function cache<Result, Args extends Array<unknown>>(
  opts: CacheOpts<Result, Args>,
  task: (...args: Args) => Promise<Result>,
): (...args: Args) => Promise<Result> {
  return async (...args: Args) => {
    // check if result is cached
    const cached = await opts.get(args)
    if (cached != null) return cached

    // no cached result, run task
    const result = await task(...args)

    // save result in cache
    await opts.set(args, result)

    return result
  }
}

function cacheKey(name: string, opts: {}): string {
  const out = {}
  Object.keys(opts).forEach((key) => {
    out[key] = opts[key].toISOString
      ? opts[key].toISOString()
      : opts[key].toString()
  })
  return `${name}:${stringify(out).replace(/\\/g, '')}`
}
