import { getRankingWindow } from '../rankingWindow'

describe('getRankingWindow', () => {
  it('uses the selected UTC hourly buckets even when the window crosses midnight', () => {
    const now = new Date('2026-09-13T01:17:00Z')
    const three = getRankingWindow('hourly', 3, now)
    const six = getRankingWindow('hourly', 6, now)
    expect(three.startDate.toISOString()).toBe('2026-09-12T23:00:00.000Z')
    expect(six.startDate.toISOString()).toBe('2026-09-12T20:00:00.000Z')
    expect(three.endDate.toISOString()).toBe(now.toISOString())
    expect(three.intervalMs).toBe(3_600_000)
    expect(three.endDate).not.toBe(now)
  })

  it('uses UTC days across the daylight-saving transition', () => {
    const window = getRankingWindow('daily', 7, new Date('2026-03-09T01:00:00-07:00'))
    expect(window.startDate.toISOString()).toBe('2026-03-03T00:00:00.000Z')
    expect(window.endDate.toISOString()).toBe('2026-03-09T08:00:00.000Z')
    expect(window.intervalMs).toBe(86_400_000)
  })

  it('does not move the window when the same instant uses a different timezone offset', () => {
    const utc = getRankingWindow('daily', 3, new Date('2026-09-13T02:00:00Z'))
    const pacific = getRankingWindow('daily', 3, new Date('2026-09-12T19:00:00-07:00'))
    expect(pacific).toEqual(utc)
  })
})
