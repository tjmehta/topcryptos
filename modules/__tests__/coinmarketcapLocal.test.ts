import type { Listings } from '../uiTypes'

jest.mock('../FSStore', () => ({ __esModule: true, default: jest.fn().mockImplementation(() => ({ get: jest.fn(), set: jest.fn() })) }))
jest.mock('../S3Store', () => ({ __esModule: true, default: jest.fn().mockImplementation(() => ({ get: jest.fn(), set: jest.fn() })) }))

const originalFs = process.env.USE_FS_CACHE
const now = new Date('2026-09-13T21:45:00.000Z')
const snapshot = (updated: string, id: number | string = 1): Listings => ({
  status: { timestamp: updated, error_code: 0, error_message: null, elapsed: 0, credit_count: 0, notice: null },
  data: [{
    // The Gecko fallback has string IDs at runtime despite the legacy CMC wire type.
    id: id as number, name: 'Bitcoin', symbol: 'BTC', slug: 'bitcoin',
    num_market_pairs: 1, date_added: '', tags: [], max_supply: 0, circulating_supply: 1,
    total_supply: 1, platform: null, cmc_rank: 1, last_updated: updated,
    quote: { USD: { price: 100, volume_24h: 1e7, percent_change_1h: 0,
      percent_change_24h: 0, percent_change_7d: 0, market_cap: 1e9, last_updated: updated } },
  }],
})

beforeEach(() => {
  jest.resetModules()
  jest.spyOn(Date, 'now').mockReturnValue(now.valueOf())
  process.env.USE_FS_CACHE = 'true'
  jest.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('upstream unavailable'))
})
afterEach(() => {
  jest.restoreAllMocks()
  if (originalFs == null) delete process.env.USE_FS_CACHE
  else process.env.USE_FS_CACHE = originalFs
})

test('uses a fresh CMC quote under its rounded-up local key without fetching a different provider', async () => {
  const { cmc } = await import('../coinmarketcap')
  const fresh = snapshot('2026-09-13T21:38:00Z')
  const read = jest.spyOn(cmc, 'hourlyCachedMarkets').mockImplementation(async ({ date }) =>
    date.getUTCHours() === 22 ? fresh : null)
  expect(await cmc.listings({ start: 1, limit: 500 })).toBe(fresh)
  expect(read.mock.calls.map(([opts]) => opts.date.toISOString())).toEqual([
    '2026-09-13T22:00:00.000Z', '2026-09-13T21:00:00.000Z', '2026-09-13T20:00:00.000Z',
  ])
  expect(fetch).not.toHaveBeenCalled()
})

test('chooses the latest actual quote rather than assuming the newest key is best', async () => {
  const { cmc } = await import('../coinmarketcap')
  const newer = snapshot('2026-09-13T21:20:00Z')
  jest.spyOn(cmc, 'hourlyCachedMarkets').mockImplementation(async ({ date }) =>
    date.getUTCHours() === 21 ? newer : snapshot('2026-09-13T21:10:00Z'))
  expect(await cmc.listings({ start: 1, limit: 500 })).toBe(newer)
})

test.each([
  ['stale', '2026-09-13T20:44:00Z', 1],
  ['future', '2026-09-13T21:46:00Z', 1],
  ['invalid', 'invalid', 1],
  ['other provider', '2026-09-13T21:38:00Z', 'bitcoin'],
] as const)('does not treat a %s snapshot as a fresh native quote', async (_, updated, id) => {
  const { cmc } = await import('../coinmarketcap')
  jest.spyOn(cmc, 'hourlyCachedMarkets').mockResolvedValue(snapshot(updated, id))
  await expect(cmc.listings({ start: 1, limit: 500 })).rejects.toThrow('upstream unavailable')
  expect(fetch).toHaveBeenCalledTimes(1)
})

test.each(['production', 'cron'] as const)('preserves the %s upstream data path', async (mode) => {
  process.env.USE_FS_CACHE = mode === 'production' ? 'false' : 'true'
  const { cmc } = await import('../coinmarketcap')
  const read = jest.spyOn(cmc, 'hourlyCachedMarkets').mockResolvedValue(snapshot('2026-09-13T21:38:00Z'))
  await expect(cmc.listings({ start: 1, limit: 500, ...(mode === 'cron' ? { hourlyCron: true } : {}) })).rejects.toThrow('upstream unavailable')
  expect(read).not.toHaveBeenCalled()
  expect(fetch).toHaveBeenCalledTimes(1)
})


test('local hourly refresh shares concurrent work, keeps native IDs and quote times, and expires', async () => {
  const { cmc } = await import('../coinmarketcap')
  const FSStore = (await import('../FSStore')).default
  const store = jest.mocked(FSStore).mock.results[0].value
  const fresh = snapshot('2026-09-13T21:38:00Z')
  const older = snapshot('2026-09-13T20:03:00Z')
  jest.mocked(fetch).mockResolvedValue({ ok: true, json: async () => [fresh, older,
    snapshot('2026-09-13T21:40:00Z', 'bitcoin'), snapshot('2026-09-13T22:00:00Z')] } as Response)
  await Promise.all([cmc.refreshLocalHourlyCache(), cmc.refreshLocalHourlyCache(), cmc.refreshLocalHourlyCache()])
  expect(fetch).toHaveBeenCalledTimes(5)
  expect(store.set).toHaveBeenCalledTimes(2)
  expect(store.set).toHaveBeenCalledWith(expect.stringContaining('2026-09-13T22:00:00.000Z'), fresh)
  expect(store.set).toHaveBeenCalledWith(expect.stringContaining('2026-09-13T20:00:00.000Z'), older)
  expect(fresh.data[0].quote.USD.last_updated).toBe('2026-09-13T21:38:00Z')
  await cmc.refreshLocalHourlyCache()
  expect(fetch).toHaveBeenCalledTimes(5)
  jest.mocked(Date.now).mockReturnValue(now.valueOf() + 5 * 60_000)
  await cmc.refreshLocalHourlyCache()
  expect(fetch).toHaveBeenCalledTimes(10)
})

test('local refresh never overwrites newer cached measurements', async () => {
  const { cmc } = await import('../coinmarketcap')
  const FSStore = (await import('../FSStore')).default
  const store = jest.mocked(FSStore).mock.results[0].value
  store.get.mockResolvedValue(snapshot('2026-09-13T21:44:00Z'))
  jest.mocked(fetch).mockResolvedValue({ ok: true, json: async () => [snapshot('2026-09-13T21:38:00Z')] } as Response)
  await cmc.refreshLocalHourlyCache()
  expect(store.set).not.toHaveBeenCalled()
})

test('failed local refresh preserves disk data and backs off', async () => {
  jest.spyOn(console, 'warn').mockImplementation(() => {})
  const { cmc } = await import('../coinmarketcap')
  const FSStore = (await import('../FSStore')).default
  const store = jest.mocked(FSStore).mock.results[0].value
  await expect(cmc.refreshLocalHourlyCache()).resolves.toBeUndefined()
  expect(store.set).not.toHaveBeenCalled()
  await cmc.refreshLocalHourlyCache()
  expect(fetch).toHaveBeenCalledTimes(5)
})

test('production storage never fetches the public local-development mirror', async () => {
  process.env.USE_FS_CACHE = 'false'
  const { cmc } = await import('../coinmarketcap')
  await cmc.refreshLocalHourlyCache()
  expect(fetch).not.toHaveBeenCalled()
})

test('live memory cache expires after fifteen minutes, not fifteen hours', async () => {
  process.env.USE_FS_CACHE = 'false'
  const { cmc } = await import('../coinmarketcap')
  cmc.latestListingsCache = { date: new Date(now.valueOf() - 16 * 60_000), result: snapshot('2026-09-13T21:29:00Z') }
  await expect(cmc.listings({ start: 1, limit: 500 })).rejects.toThrow('upstream unavailable')
  expect(fetch).toHaveBeenCalledTimes(1)
})


test('production mode does not mirror its own endpoint even with FS storage enabled', async () => {
  const original = process.env.NODE_ENV
  Object.assign(process.env, { NODE_ENV: 'production' })
  try {
    const { cmc } = await import('../coinmarketcap')
    await cmc.refreshLocalHourlyCache()
    expect(fetch).not.toHaveBeenCalled()
  } finally {
    Object.assign(process.env, { NODE_ENV: original })
  }
})

test('restores native history over a newer incompatible-provider cache entry', async () => {
  const { cmc } = await import('../coinmarketcap')
  const FSStore = (await import('../FSStore')).default
  const store = jest.mocked(FSStore).mock.results[0].value
  store.get.mockResolvedValue(snapshot('2026-09-13T21:44:00Z', 'bitcoin'))
  const native = snapshot('2026-09-13T21:38:00Z')
  jest.mocked(fetch).mockResolvedValue({ ok: true, json: async () => [native] } as Response)
  await cmc.refreshLocalHourlyCache()
  expect(store.set).toHaveBeenCalledTimes(1)
  expect(store.set).toHaveBeenCalledWith(expect.any(String), native)
})
