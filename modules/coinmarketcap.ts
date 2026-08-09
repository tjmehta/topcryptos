import { cache, cacheKey } from './cache'
import { roundToHour, setHour } from './roundToHour'

import FSStore from './FSStore'
import type { Listings } from './uiTypes'
import S3Store from './S3Store'
import { get } from 'env-var'
import path from 'path'

const USE_FS_CACHE = get('USE_FS_CACHE').asBool()
const CACHE_STORE_DIR = get('CACHE_STORE_DIR').required().asString()
const CMC_API_KEY = get('CMC_API_KEY').required().asString()
const maxCacheDuration = 15 * 60 * 60 * 1000 // 15 min


export type { Listings }

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

async function getJson<T>(path: string, expected: number, init?: { query?: Record<string, string> }) {
  let url = new URL(`https://pro-api.coinmarketcap.com/v1/${path}`)
  if (init?.query) Object.entries(init.query).forEach(([k, v]) => url.searchParams.set(k, v))
  const res = await fetch(url.toString(), {
    headers: { 'X-CMC_PRO_API_KEY': CMC_API_KEY, accept: 'application/json' },
  })
  if (res.status !== expected) throw new Error(`unexpected status ${res.status}`)
  return (await res.json()) as T
}

class CoinMarketCap {
  latestListingsCache: {
    date: Date
    result: Listings
  } | null = null

  constructor() {}

  hourlyCachedMarkets = async (
    opts: ListingsOpts & { date: Date },
  ): Promise<Listings | null> => {
    const date = roundToHour(opts.date)

    // The hourly cron writes snapshots through `listings` below, whose `set`
    // step builds the key from the *full* opts — including `hourlyCron: true`.
    // Reading without that flag produces a different key that can never match,
    // which is why /hourly silently rendered an empty chart. Try the cron's key
    // shape first, then the flag-less shape used by pre-2022 snapshots.
    const legacyOpts = { ...opts, date }
    delete legacyOpts.hourlyCron

    for (const cacheOpts of [{ ...opts, hourlyCron: true, date }, legacyOpts]) {
      const result = await store.get<Listings>(
        cacheKey('cryptocurrency_listings', cacheOpts),
      )
      if (result != null) {
        // HACK: remove data to reduce payload size. Daily already does this;
        // hourly must too, or restoring these snapshots reintroduces the 1MB
        // response overflow that `topCryptos.getDailyRankings` chunks around.
        result.data = result.data.map((d) => {
          d.tags = []
          return d
        })
        return result
      }
    }

    return null
  }

  dailyCachedMarkets = async (
    opts: ListingsOpts & { date: Date },
  ): Promise<Listings | null> => {
    // Late-evening snapshots are preferred so a "day" reads as its close, but
    // the cron does miss hours, so walk back through hours that have
    // historically produced snapshots before giving up on the day.
    const hours = [23, 22, 19, 18, 16, 14, 13, 12, 10, 8, 7, 6, 4, 2]

    let result: Listings | null = null

    for (const hour of hours) {
      const key = cacheKey('cryptocurrency_listings', {
        ...opts,
        hourlyCron: true,
        date: setHour(opts.date, hour),
      })
      result = await store.get<Listings>(key)
      if (result != null) {
        if (hour !== 23 && hour !== 22) {
          console.warn('dailyCachedMarkets: fell back to hour', hour, opts.date)
        }
        break
      }
    }

    if (result == null) {
      // Pre-2022 snapshots were keyed without the hourlyCron flag. This used to
      // be the *first* probe, which meant every lookup spent an extra store read
      // that could never hit for cron-written data.
      const legacyOpts = { ...opts, date: setHour(opts.date, 23) }
      delete legacyOpts.hourlyCron
      result = await store.get<Listings>(
        cacheKey('cryptocurrency_listings', legacyOpts),
      )
    }

    // HACK: remove data to reduce payload size
    if (result) {
      result.data = result?.data.map((d) => {
        d.tags = []
        return d
      })
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
        if (result == null || !result.data || !result.data[0]) {
          console.error('ERROR: unexpected response', { opts, result })
          return
        }
        const keyQuery = {
          ...opts,
          date: new Date(result.data[0].last_updated),
        }

        let rounded: Date | null = null
        if (opts.date == null) {
          // if date is missing, query is for latest listings
          if (opts.hourlyCron) {
            // hourly cron query, round date and cache
            rounded = roundToHour(keyQuery.date)
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

        console.log('hourlyCron: cmc set cache', {
          date: keyQuery.date,
          rounded,
          key,
        })
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
        json = await getJson<Listings>('cryptocurrency/listings/latest', 200, {
          query,
        })
      } else {
        try {
          json = await getJson<Listings>('cryptocurrency/listings/historical', 200, {
            query: {
              ...query,
              date: new Date(opts.date).toISOString(),
            },
          })
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

      // HACK: remove data to reduce payload size
      if (json) {
        json.data = json.data.map((d) => {
          d.tags = []
          return d
        })
      }

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

      const json: Exchanges = await getJson<Exchanges>('exchange/listings/latest', 200, {
        query,
      })

      return json
    },
  )
}

export const cmc = new CoinMarketCap()
