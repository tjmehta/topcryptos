import { HourlyCron } from './HourlyCron'
import { cmc } from '../../modules/coinmarketcap'

class HourlyListingsCron extends HourlyCron {
  constructor() {
    super({
      logger: console,
      stopTimeout: 5 * 1000,
      task: async () => {
        await Promise.allSettled([
          // coingecko.markets({
          //   limit: 500,
          //   hourlyCron: true,
          // }),
          cmc.listings({
            start: 1,
            limit: 500,
            hourlyCron: true,
          }),
        ])
      },
    })
  }
}

new HourlyListingsCron().start()
