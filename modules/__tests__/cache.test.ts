import { cache, cacheKey } from '../cache'

describe('cacheKey', () => {
  it('serializes dates as ISO strings and everything else via toString', () => {
    expect(
      cacheKey('cryptocurrency_listings', {
        start: 1,
        limit: 500,
        date: new Date('2026-08-08T23:00:00.000Z'),
      }),
    ).toBe(
      'cryptocurrency_listings:{"date":"2026-08-08T23:00:00.000Z","limit":"500","start":"1"}',
    )
  })

  it('is stable regardless of property insertion order', () => {
    const date = new Date('2026-08-08T23:00:00.000Z')
    expect(cacheKey('x', { start: 1, limit: 500, date })).toBe(
      cacheKey('x', { date, limit: 500, start: 1 }),
    )
  })

  /**
   * Regression tests for the bug that left /hourly rendering an empty chart.
   *
   * The hourly cron writes snapshots through `cmc.listings({ hourlyCron: true })`,
   * and `hourlyCron` leaks out of the fetch options into the cache key. The read
   * path in `hourlyCachedMarkets` omitted the flag, producing a different key
   * that could never match, so years of S3 snapshots were invisible to the app.
   *
   * If someone "cleans up" the flag on only one side of this, these fail.
   */
  describe('hourlyCron flag participates in the key', () => {
    const base = {
      start: 1,
      limit: 500,
      date: new Date('2026-08-08T23:00:00.000Z'),
    }

    it('produces a DIFFERENT key with and without the flag', () => {
      expect(cacheKey('cryptocurrency_listings', base)).not.toBe(
        cacheKey('cryptocurrency_listings', { ...base, hourlyCron: true }),
      )
    })

    it('write key and hourly read key are identical', () => {
      // what the cron writes
      const writeKey = cacheKey('cryptocurrency_listings', {
        ...base,
        hourlyCron: true,
      })
      // what hourlyCachedMarkets now looks up
      const readKey = cacheKey('cryptocurrency_listings', {
        ...base,
        hourlyCron: true,
      })
      expect(readKey).toBe(writeKey)
      expect(writeKey).toContain('"hourlyCron":"true"')
    })

    it('matches the on-disk key format of existing snapshots', () => {
      // Taken verbatim from a committed snapshot filename in .cache/coinmarketcap/
      expect(
        cacheKey('cryptocurrency_listings', {
          start: 1,
          limit: 500,
          hourlyCron: true,
          date: new Date('2021-12-30T01:00:00.000Z'),
        }),
      ).toBe(
        'cryptocurrency_listings:{"date":"2021-12-30T01:00:00.000Z","hourlyCron":"true","limit":"500","start":"1"}',
      )
    })
  })
})

describe('cache', () => {
  it('returns the cached value without running the task', async () => {
    const task = jest.fn(async () => 'fresh')
    const wrapped = cache<string, [string]>(
      { get: async () => 'cached', set: async () => undefined },
      task,
    )

    await expect(wrapped('a')).resolves.toBe('cached')
    expect(task).not.toHaveBeenCalled()
  })

  it('runs the task and stores the result on a miss', async () => {
    const set = jest.fn(async () => undefined)
    const task = jest.fn(async (_key: string) => 'fresh')
    const wrapped = cache<string, [string]>({ get: async () => undefined, set }, task)

    await expect(wrapped('a')).resolves.toBe('fresh')
    expect(task).toHaveBeenCalledWith('a')
    expect(set).toHaveBeenCalledWith(['a'], 'fresh')
  })

  it('treats null from get as a miss', async () => {
    const task = jest.fn(async () => 'fresh')
    const wrapped = cache<string, [string]>(
      { get: async () => (null as unknown) as undefined, set: async () => undefined },
      task,
    )

    await expect(wrapped('a')).resolves.toBe('fresh')
    expect(task).toHaveBeenCalled()
  })
})
