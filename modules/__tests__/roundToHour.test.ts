import { ceilHour, floorHour, roundToHour, setHour } from '../roundToHour'

const iso = (d: Date) => d.toISOString()

describe('floorHour', () => {
  it('drops minutes, seconds and milliseconds', () => {
    expect(iso(floorHour(new Date('2026-08-08T23:47:31.500Z')))).toBe(
      '2026-08-08T23:00:00.000Z',
    )
  })

  it('is a no-op on an exact hour', () => {
    expect(iso(floorHour(new Date('2026-08-08T23:00:00.000Z')))).toBe(
      '2026-08-08T23:00:00.000Z',
    )
  })
})

describe('ceilHour', () => {
  it('advances to the next hour', () => {
    expect(iso(ceilHour(new Date('2026-08-08T23:02:00.000Z')))).toBe(
      '2026-08-09T00:00:00.000Z',
    )
  })

  it('rolls over the day boundary', () => {
    expect(iso(ceilHour(new Date('2026-08-08T23:59:59.999Z')))).toBe(
      '2026-08-09T00:00:00.000Z',
    )
  })
})

describe('roundToHour', () => {
  it.each([
    ['2026-08-08T23:00:00.000Z', '2026-08-08T23:00:00.000Z'],
    ['2026-08-08T23:29:59.999Z', '2026-08-08T23:00:00.000Z'],
    ['2026-08-08T23:30:00.000Z', '2026-08-09T00:00:00.000Z'],
    ['2026-08-08T23:59:00.000Z', '2026-08-09T00:00:00.000Z'],
  ])('rounds %s -> %s', (input, expected) => {
    expect(iso(roundToHour(new Date(input)))).toBe(expected)
  })

  /**
   * This is the invariant the Vercel cron schedule depends on. The cron writes
   * snapshots keyed by roundToHour(last_updated), so it must run early enough in
   * the hour that the CMC timestamp still floors back to the current hour. The
   * `5 * * * *` schedule sits at the start of that window; anything at or past
   * :30 would file the snapshot under the following hour.
   */
  it('buckets a fetch anywhere in :00-:29 to the current hour', () => {
    for (const minute of [0, 5, 10, 15, 20, 25, 29]) {
      const lastUpdated = new Date(
        `2026-08-08T14:${minute.toString().padStart(2, '0')}:00.000Z`,
      )
      expect(iso(roundToHour(lastUpdated))).toBe('2026-08-08T14:00:00.000Z')
    }
  })

  it('buckets a fetch at or past :30 to the NEXT hour', () => {
    for (const minute of [30, 45, 59]) {
      const lastUpdated = new Date(`2026-08-08T14:${minute}:00.000Z`)
      expect(iso(roundToHour(lastUpdated))).toBe('2026-08-08T15:00:00.000Z')
    }
  })
})

describe('setHour', () => {
  it('pins the hour and zeroes the rest', () => {
    expect(iso(setHour(new Date('2026-08-08T04:37:12.000Z'), 23))).toBe(
      '2026-08-08T23:00:00.000Z',
    )
  })

  it('zero-pads single digit hours', () => {
    expect(iso(setHour(new Date('2026-08-08T22:00:00.000Z'), 2))).toBe(
      '2026-08-08T02:00:00.000Z',
    )
  })
})
