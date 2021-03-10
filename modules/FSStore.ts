import AbstractStartable from 'abstract-startable'
import BaseErr from 'baseerr'
import { promises as fs } from 'fs'
import mkdirp from 'mkdirp'
import path from 'path'

class StoreGetError extends BaseErr<{ key: string }> {}
class StoreSetError extends BaseErr<{ key: string }> {}

export default class FSStore extends AbstractStartable {
  private path: string

  constructor(path: string) {
    super()
    this.path = path
  }

  async _start() {
    await mkdirp(this.path)
  }
  async _stop() {
    // noop
  }

  async get<T>(key: string): Promise<T | null> {
    key = key.replace(/\//g, '_') + '.json'
    let data: Buffer
    await this.start()
    try {
      data = await fs.readFile(path.join(this.path, key))
    } catch (err) {
      if (err.code == 'ENOENT') return null
      throw StoreGetError.wrap(err, 'readFile error', { key })
    }
    try {
      return JSON.parse(data.toString())
    } catch (err) {
      throw StoreGetError.wrap(err, 'JSON.parse error', { key })
    }
  }

  async set<T>(key: string, data: T): Promise<void> {
    key = key.replace(/\//g, '_') + '.json'
    let str: string
    try {
      str = JSON.stringify(data)
    } catch (err) {
      throw StoreSetError.wrap(err, 'JSON.stringify error', { key })
    }
    try {
      await fs.writeFile(path.join(this.path, key), str)
    } catch (err) {
      throw StoreSetError.wrap(err, 'writeFile error', { key })
    }
  }
}
