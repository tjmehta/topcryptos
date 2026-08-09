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
    const seen = new Set<string>()
    const seenDate = new Set<string>()
    mergedResponses.forEach((response) => {
      // @ts-ignore
      response.data = response.data.filter((item) => {
        const dateStr = `${item.quote.USD.last_updated}`.split(':')[0] ?? ''
        const key = `${dateStr}:${item.id}`
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
      getJson<RankingsResponse>('api/rankings/hourly', {
        hoursSkip: '0',
        hoursLimit: '4',
      }),
    ])

    const mergedResponses: RankingsResponse = ([] as any[]).concat.apply([], responses)
    const seen = new Set<string>()
    const seenDate = new Set<string>()
    mergedResponses.forEach((response) => {
      // @ts-ignore
      response.data = response.data.filter((item) => {
        const dateStr = `${item.quote.USD.last_updated}`.split('T')[0] ?? ''
        const key = `${dateStr}:${item.id}`
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
