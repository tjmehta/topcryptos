import type { RankingsResponse } from './uiTypes'

import times from 'times-loop'

type DailyRankingsOpts = {
  daySkip?: number
  dayLimit?: number
}

type HourlyRankingsOpts = {
  hoursSkip?: number
  hoursLimit?: number
}

async function getJson<T>(path: string, query?: Record<string, string>): Promise<T> {
  const url = new URL(path, typeof window !== 'undefined' ? window.location.origin : 'http://localhost')
  if (query) Object.entries(query).forEach(([k, v]) => url.searchParams.set(k, v))
  const res = await fetch(url.toString(), { method: 'GET', headers: { accept: 'application/json' } })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`unexpected status ${res.status}: ${text}`)
  }
  return res.json() as Promise<T>
}

class TopCryptosApiClient {
  async getDailyRankings(opts: DailyRankingsOpts): Promise<RankingsResponse> {
    const limit = 9
    const responses = await Promise.all<RankingsResponse>(
      times(90 / limit, (i) =>
        getJson<RankingsResponse>('api/rankings/daily', {
          daySkip: `${i * limit}`,
          dayLimit: `${limit}`,
        }),
      ).reverse(),
    )

    const mergedResponses: RankingsResponse = ([] as any[]).concat.apply([], responses)
    // Preserve complete snapshots so market-cap ranks keep their source
    // universe. The scorer deduplicates each coin's observations after ranks
    // are assigned; removing rows here compressed ranks in later snapshots.
    return mergedResponses
  }
  async getHourlyRankings(opts: HourlyRankingsOpts): Promise<RankingsResponse> {
    // 25 hours: a 24-hour window needs 24 cron buckets plus the live one.
    // Chunked for the same reason daily is — one 25×500-coin response would
    // trip the 1MB cap — and reversed so the oldest chunk merges first.
    const limit = 5
    const responses = await Promise.all<RankingsResponse>(
      times(25 / limit, (i) =>
        getJson<RankingsResponse>('api/rankings/hourly', {
          hoursSkip: `${i * limit}`,
          hoursLimit: `${limit}`,
        }),
      ).reverse(),
    )

    const mergedResponses: RankingsResponse = ([] as any[]).concat.apply([], responses)
    // Repeated quotes are handled per coin by the scorer, without shrinking
    // the source universe used to establish market-cap ranks.
    return mergedResponses
  }
}

export const topCryptos = new TopCryptosApiClient()
