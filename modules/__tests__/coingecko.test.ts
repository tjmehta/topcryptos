import { coingecko } from '../coingecko'
import { setFetch } from 'simple-api-client'

setFetch(globalThis.fetch as any)

describe('coingecko', () => {
  it('should', async () => {
    await coingecko.markets()
  })
})
