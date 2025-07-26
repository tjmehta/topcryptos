import { Listings } from '../modules/coinmarketcap'

export type RankingsResponse = Listings[]

export type DailyRankingsQuery = {
  daySkip?: string
  dayLimit?: string
}

export type HourlyRankingsQuery = {
  hoursSkip?: string
  hoursLimit?: string
}