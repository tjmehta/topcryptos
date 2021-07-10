import { coingecko } from '../coingecko'
import fetch from 'isomorphic-unfetch'
import { setFetch } from 'simple-api-client'

setFetch(fetch)

describe('coingecko', () => {
  it('should', async () => {
    await coingecko.markets()
  })
})
