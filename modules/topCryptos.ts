import ApiClient from 'simple-api-client'
import { DailyRankingsResponse } from './../pages/api/rankings/daily'

type RankingsOpts = {
  daySkip?: number
  dayLimit?: number
}
type RankingsQuery = {
  [P in keyof RankingsOpts]: string
}

export class TopCryptosApiClient extends ApiClient {
  constructor() {
    super('/')
  }
  async getRankings(opts: RankingsOpts): Promise<DailyRankingsResponse> {
    const responses = await Promise.all<DailyRankingsResponse>([
      this.get<RankingsQuery>('api/rankings/daily', 200, {
        query: {
          daySkip: '0',
          dayLimit: '10',
        },
      }),
      this.get<RankingsQuery>('api/rankings/daily', 200, {
        query: {
          daySkip: '10',
          dayLimit: '10',
        },
      }),
      this.get<RankingsQuery>('api/rankings/daily', 200, {
        query: {
          daySkip: '20',
          dayLimit: '10',
        },
      }),
      this.get<RankingsQuery>('api/rankings/daily', 200, {
        query: {
          daySkip: '30',
          dayLimit: '10',
        },
      }),
      this.get<RankingsQuery>('api/rankings/daily', 200, {
        query: {
          daySkip: '40',
          dayLimit: '10',
        },
      }),
      this.get<RankingsQuery>('api/rankings/daily', 200, {
        query: {
          daySkip: '50',
          dayLimit: '10',
        },
      }),
      this.get<RankingsQuery>('api/rankings/daily', 200, {
        query: {
          daySkip: '60',
          dayLimit: '10',
        },
      }),
      this.get<RankingsQuery>('api/rankings/daily', 200, {
        query: {
          daySkip: '70',
          dayLimit: '10',
        },
      }),
      this.get<RankingsQuery>('api/rankings/daily', 200, {
        query: {
          daySkip: '80',
          dayLimit: '10',
        },
      }),
    ])

    const mergedResponses: DailyRankingsResponse = [].concat.apply(
      [],
      responses,
    )
    const seen = new Set<string>()
    mergedResponses.forEach((response) => {
      // @ts-ignore
      response.data = response.data.filter((item) => {
        const key = `${item.id}:${item.quote.USD.last_updated}`
        if (seen.has(key)) return false
        seen.add(key)
        return true
      })
      return response
    })

    return mergedResponses
  }
}

export const topCryptos = new TopCryptosApiClient()
