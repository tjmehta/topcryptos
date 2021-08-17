import { NextApiRequest, NextApiResponse } from 'next'

import { coingecko } from '../../../../modules/coingecko'

export default async (req: NextApiRequest, res: NextApiResponse<any>) => {
  const exchangeId = req.query.exchangeId as string
  const page = validateNumber(req.query.page, 1)

  const tickers = await coingecko.exchangeTickers(
    req.query.exchangeId as string,
    {
      page,
    },
  )
  res.status(200).json(tickers)
}

function validateNumber(val: any, defaultVal: number): number {
  const num = Number(val)
  return isNaN(num) ? defaultVal : num
}
