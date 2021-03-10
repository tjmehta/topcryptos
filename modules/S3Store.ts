import { GetObjectCommandOutput, S3 } from '@aws-sdk/client-s3'

import AbstractStartable from 'abstract-startable'
import BaseErr from 'baseerr'
import { Stream } from 'stream'
import { get } from 'env-var'
import getStream from 'get-stream'

const AWS_S3_ACCESS_KEY_ID = get('AWS_S3_ACCESS_KEY_ID').required().asString()
const AWS_S3_SECRET_ACCESS_KEY = get('AWS_S3_SECRET_ACCESS_KEY')
  .required()
  .asString()
const AWS_S3_BUCKET = get('AWS_S3_BUCKET').required().asString()
const AWS_S3_BUCKET_REGION = get('AWS_S3_BUCKET_REGION').required().asString()

class S3StoreGetError extends BaseErr<{ key: string }> {}
class S3StoreSetError extends BaseErr<{ key: string }> {}

class S3StoreStartError extends BaseErr<{}> {}

type Resolved<T> = T extends PromiseLike<infer U> ? U : T

export default class S3Store extends AbstractStartable {
  private opts: {}
  private client: S3
  private bucket: string
  private cache: any // stupid ESM :-(

  constructor() {
    super()
    this.opts = {
      region: AWS_S3_BUCKET_REGION,
      credentials: {
        accessKeyId: AWS_S3_ACCESS_KEY_ID,
        secretAccessKey: AWS_S3_SECRET_ACCESS_KEY,
      },
    }
    this.client = new S3(this.opts)
    this.bucket = AWS_S3_BUCKET
  }

  async _start() {
    const { default: QuickLRU } = await import('quick-lru')
    this.cache = new QuickLRU({ maxSize: 1000 })
    const result = await this.client.listBuckets({})
    const buckets = result.Buckets
    if (!Boolean(buckets?.length)) {
      throw new S3StoreStartError('no buckets found', { result })
    }
    const found = buckets.some((bucket) => bucket.Name === this.bucket)
    if (!found) {
      throw new S3StoreStartError('bucket not found', {
        bucket: this.bucket,
        result,
      })
    }
  }
  async _stop() {
    // noop
  }

  async listObjects() {
    const result = await this.client.listObjects({ Bucket: this.bucket })
    return result
  }

  async get<T>(key: string): Promise<T | null> {
    key = key.replace(/\//g, '_') + '.json'
    let result: GetObjectCommandOutput
    await this.start()

    const cached = this.cache.get(key)
    if (cached != null) return cached as T

    try {
      result = await this.client.getObject({ Bucket: this.bucket, Key: key })
    } catch (err) {
      if (err.name === 'NoSuchKey') return null
      throw S3StoreGetError.wrap(err, 'readFile error', { key })
    }
    let str: string
    try {
      str = await getStream(result.Body as Stream)
      const obj: T = JSON.parse(str)
      return obj
    } catch (err) {
      throw S3StoreGetError.wrap(err, 'JSON.parse error', { key, result, str })
    }
  }

  async set<T>(key: string, data: T): Promise<void> {
    key = key.replace(/\//g, '_') + '.json'
    let str: string
    try {
      str = JSON.stringify(data)
    } catch (err) {
      throw S3StoreSetError.wrap(err, 'JSON.stringify error', { key })
    }
    try {
      await this.client.putObject({ Bucket: this.bucket, Key: key, Body: str })
      this.cache.set(key, data)
    } catch (err) {
      throw S3StoreSetError.wrap(err, 'writeFile error', { key })
    }
  }
}
