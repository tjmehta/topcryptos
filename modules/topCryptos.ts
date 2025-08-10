import {
  DailyRankingsQuery,
  RankingsResponse,
} from './../pages/api/rankings/daily'

import ApiClient from 'simple-api-client'
import { HourlyRankingsQuery } from './../pages/api/rankings/hourly'
import times from 'times-loop'

type DailyRankingsOpts = {
  daySkip?: number
  dayLimit?: number
}

type HourlyRankingsOpts = {
  hoursSkip?: number
  hoursLimit?: number
}

class TopCryptosApiClient {
  private client: ApiClient
  constructor() {
    this.client = new ApiClient('/')
  }
  async getDailyRankings(opts: DailyRankingsOpts): Promise<RankingsResponse> {
    const limit = 9
    const responses = await Promise.all<RankingsResponse>(
      times(90 / limit, (i) =>
        this.client.get<DailyRankingsQuery>('api/rankings/daily', 200, {
          query: {
            daySkip: `${i * limit}`,
            dayLimit: `${limit}`,
          },
        }),
      ).reverse(),
    )

    const mergedResponses: RankingsResponse = [].concat.apply([], responses)
    const seen = new Set<string>()
    const seenDate = new Set<string>()
    mergedResponses.forEach((response) => {
      // @ts-ignore
      response.data = response.data.filter((item) => {
        const dateStr = `${item.quote.USD.last_updated}`.split(':').shift()
        const key = `${dateStr}:${item.id}`
        if (!seen.has(key)) {
          console.log('DATE!!!', dateStr)
        }
        seenDate.add(dateStr)
        if (seen.has(key)) {
          return false
        }
        seen.add(key)
        return true
      })
      return response
    })

    return mergedResponses
  }
  async getHourlyRankings(opts: HourlyRankingsOpts): Promise<RankingsResponse> {
    const responses = await Promise.all<RankingsResponse>([
      this.client.get<HourlyRankingsQuery>('api/rankings/hourly', 200, {
        query: {
          hoursSkip: '0',
          hoursLimit: '4',
        },
      }),
    ])

    const mergedResponses: RankingsResponse = [].concat.apply([], responses)
    const seen = new Set<string>()
    const seenDate = new Set<string>()
    mergedResponses.forEach((response) => {
      // @ts-ignore
      response.data = response.data.filter((item) => {
        const dateStr = `${item.quote.USD.last_updated}`.split('T').shift()
        const key = `${dateStr}:${item.id}`
        if (!seenDate.has(dateStr)) {
          console.warn('DATE!!!', dateStr)
        }
        seenDate.add(dateStr)
        if (seen.has(key)) {
          return false
        }
        seen.add(key)
        return true
      })
      return response
    })

    return mergedResponses
  }
}

export const topCryptos = new TopCryptosApiClient()
