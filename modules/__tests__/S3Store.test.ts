import { Readable } from 'stream'

/**
 * The previous version of this file constructed a real S3Store and called
 * `set('foo', ...)` against the configured bucket — which is the *production*
 * bucket, so running `npm test` wrote junk objects into live storage and the
 * suite failed outright without credentials. The client is mocked here instead.
 */

const listBuckets = jest.fn()
const getObject = jest.fn()
const putObject = jest.fn()

// quick-lru v7 is ESM-only and S3Store loads it via `await import`. next/jest
// controls transformIgnorePatterns, so stub it rather than fight the transform;
// Map satisfies the get/set surface S3Store actually uses.
jest.mock('quick-lru', () => ({
  __esModule: true,
  default: class extends Map {
    constructor(_opts?: { maxSize: number }) {
      super()
    }
  },
}))

jest.mock('@aws-sdk/client-s3', () => ({
  S3: jest.fn().mockImplementation(() => ({
    listBuckets: (...args: unknown[]) => listBuckets(...args),
    getObject: (...args: unknown[]) => getObject(...args),
    putObject: (...args: unknown[]) => putObject(...args),
  })),
}))

// eslint-disable-next-line @typescript-eslint/no-var-requires
const S3Store = require('../S3Store').default

const BUCKET = process.env.AWS_S3_BUCKET

beforeEach(() => {
  listBuckets.mockResolvedValue({ Buckets: [{ Name: BUCKET }] })
  getObject.mockReset()
  putObject.mockReset().mockResolvedValue({})
})

describe('S3Store', () => {
  it('round-trips a value through JSON', async () => {
    const store = new S3Store()
    await store.set('foo', { foo: 'bar' })

    expect(putObject).toHaveBeenCalledWith({
      Bucket: BUCKET,
      Key: 'foo.json',
      Body: JSON.stringify({ foo: 'bar' }),
    })

    // set() populates the in-memory LRU, so the read never reaches S3
    await expect(store.get('foo')).resolves.toEqual({ foo: 'bar' })
    expect(getObject).not.toHaveBeenCalled()
  })

  it('parses an object fetched from S3', async () => {
    getObject.mockResolvedValue({ Body: Readable.from(['{"a":1}']) })

    const store = new S3Store()
    await expect(store.get('cold')).resolves.toEqual({ a: 1 })
    expect(getObject).toHaveBeenCalledWith({ Bucket: BUCKET, Key: 'cold.json' })
  })

  it('returns null for a missing key rather than throwing', async () => {
    getObject.mockRejectedValue(Object.assign(new Error('nope'), { name: 'NoSuchKey' }))

    const store = new S3Store()
    await expect(store.get('missing')).resolves.toBeNull()
  })

  it('propagates non-NoSuchKey read errors', async () => {
    getObject.mockRejectedValue(Object.assign(new Error('boom'), { name: 'AccessDenied' }))

    const store = new S3Store()
    await expect(store.get('boom')).rejects.toThrow(/readFile error/)
  })

  /**
   * Cache keys embed a JSON blob containing ISO dates, so they always carry
   * slashes; if those reached S3 verbatim they would silently become directory
   * separators and split one logical namespace across many prefixes.
   */
  it('flattens slashes in keys and appends .json', async () => {
    getObject.mockResolvedValue({ Body: Readable.from(['{}']) })

    const store = new S3Store()
    await store.get('listings:{"date":"2026-08-08T23:00:00.000Z"}')

    expect(getObject).toHaveBeenCalledWith({
      Bucket: BUCKET,
      Key: 'listings:{"date":"2026-08-08T23:00:00.000Z"}.json',
    })
  })

  it('fails fast when the configured bucket is absent', async () => {
    listBuckets.mockResolvedValue({ Buckets: [{ Name: 'some-other-bucket' }] })

    const store = new S3Store()
    await expect(store.get('anything')).rejects.toThrow(/bucket not found/)
  })
})
