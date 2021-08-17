import { NextApiRequest, NextApiResponse } from 'next'

import { coingecko } from '../../modules/coingecko'

export default async (req: NextApiRequest, res: NextApiResponse<any[]>) => {
  const exchanges = await coingecko.exchanges()
  res.status(200).json(exchanges)
}
