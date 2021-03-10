import type { NextApiRequest, NextApiResponse } from 'next'

export type RankingsData = {
  status: {
    timestamp: string // Date
    error_code: number
    error_message: string | null
    elapsed: number
    credit_count: number
    notice: string | null
  }
  data: [
    {
      id: number
      name: string
      symbol: string
      slug: string
      num_market_pairs: number
      date_added: string // Date
      tags: Array<string>
      max_supply: number
      circulating_supply: number
      total_supply: number
      platform: null
      cmc_rank: number
      last_updated: string // Date
      quote: {
        USD: {
          price: number
          volume_24h: number
          percent_change_1h: number
          percent_change_24h: number
          percent_change_7d: number
          market_cap: number
          last_updated: string // Date
        }
      }
    },
  ]
}

export default (req: NextApiRequest, res: NextApiResponse<RankingsData>) => {
  // res.status(200).json({ name: 'John Doe' })
}
