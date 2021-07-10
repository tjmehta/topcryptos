import { HourlyCron } from './HourlyCron'
import { cmc } from '../../modules/coinmarketcap'
import { coingecko } from '../../modules/coingecko'
import fetch from 'isomorphic-unfetch'
import { get } from 'env-var'
import { setFetch } from 'simple-api-client'

const USE_COINGECKO_API = get('USE_COINGECKO_API').asBool()

setFetch(fetch)

class HourlyListingsCron extends HourlyCron {
  constructor() {
    super({
      logger: console,
      stopTimeout: 5 * 1000,
      task: async () => {
        await coingecko.markets({
          limit: 500,
          // hourlyCron: true,
        })
        await cmc.listings({
          start: 1,
          limit: 500,
          // hourlyCron: true,
        })
      },
    })
  }
}

new HourlyListingsCron().start()
