import { HourlyCron } from './HourlyCron'
import { cmc } from '../../modules/coinmarketcap'

class HourlyListingsCron extends HourlyCron {
  constructor() {
    super({
      logger: console,
      stopTimeout: 5 * 1000,
      task: async () => {
        await cmc.listings({
          start: 1,
          limit: 500,
        })
      },
    })
  }
}

new HourlyListingsCron().start()
