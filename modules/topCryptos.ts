import ApiClient from 'simple-api-client'
import { DailyRankingsResponse } from './../pages/api/rankings/daily'

type RankingsOpts = {
  maxRank?: number
  limit?: number
}
type RankingsQuery = {
  [P in keyof RankingsOpts]: string
}

export class TopCryptosApiClient extends ApiClient {
  constructor() {
    super('/')
  }
  async getRankings(opts: RankingsOpts): Promise<DailyRankingsResponse> {
    return this.get<RankingsQuery>('api/rankings/daily', 200, {
      query: {
        limit: '90',
      },
    })
  }
}

export const topCryptos = new TopCryptosApiClient()
