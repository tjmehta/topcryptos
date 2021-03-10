import fetch from 'isomorphic-unfetch'
import fs from 'fs'
import path from 'path'
import { timesParallel } from 'times-loop'

enum interval {
  DAILY = 'DAILY',
  HOURLY = 'HOURLY',
  EIGHT_HR = 'EIGHT_HR',
}
const COUNT = 45
const INTERVAL: interval = interval.DAILY
const MIN_RANK = 200
let startDate: Date

async function main() {
  let INTERVAL_UNIX: number

  let lastDate: Date
  if (INTERVAL === interval.DAILY) {
    // todo set this to a high volume time
    lastDate = new Date(
      new Date().toISOString().replace(/T.*$/, 'T00:00:00.000Z'),
    )
    startDate = lastDate
    INTERVAL_UNIX = 24 * 60 * 60 * 1000
  } else if (INTERVAL === interval.HOURLY) {
    // todo flat hours?
    lastDate = new Date(
      new Date().toISOString().replace(/T.*$/, 'T23:59:59.000Z'),
    )
    lastDate.setDate(lastDate.getDate() - 1)
    startDate = lastDate
    INTERVAL_UNIX = 60 * 60 * 1000
  } else if (INTERVAL === interval.EIGHT_HR) {
    // todo set this to a high volume time
    lastDate = new Date(
      new Date().toISOString().replace(/T.*$/, 'T00:00:00.000Z'),
    )
    startDate = lastDate
    INTERVAL_UNIX = 8 * 60 * 60 * 1000
  }

  let dates: string[] = []
  let results = await timesParallel(COUNT, async (i) => {
    const qs = new URLSearchParams([
      ['start', '1'],
      ['limit', MIN_RANK.toString()],
      ['convert', 'USD'],
    ])
    let url: string

    if (i === 0) {
      url = `https://pro-api.coinmarketcap.com/v1/cryptocurrency/listings/latest?${qs.toString()}`
      const dateUnix = (Date.now() / 1000).toString()
      dates.push(dateUnix)
    } else {
      lastDate = new Date(lastDate.valueOf() - INTERVAL_UNIX)
      const dateUnix = (lastDate.valueOf() / 1000).toString()
      dates.push(dateUnix)
      qs.set('date', dateUnix)
      url = `https://pro-api.coinmarketcap.com/v1/cryptocurrency/listings/historical?${qs.toString()}`
    }

    return fetch(url, {
      headers: {
        'X-CMC_PRO_API_KEY': '1d3dee12-e925-475b-a2ae-c722b1f9c9ef',
      },
    }).then((res) => {
      if (!res.ok) {
        return res.text().then((text) => {
          console.error('DEBUG')
          console.error(res.status)
          console.error(text)
          throw new Error(`status code error: ${res.status}`)
        })
      }
      return res.json()
    })
  })

  dates = dates.reverse()
  results = results.reverse()

  const rankdata = dates.reduce(
    (memo, d, i) => {
      const result = results[i]
      let date: string = result.data[0].last_updated
      // if (INTERVAL === interval.DAILY) {
      date = date.replace(/(T[0-9][0-9]).*$/, '$1').replace(/^20/, '')
      // } else {
      //   // HOURLY, EIGHT_HR
      //   date = date.replace(/^.*(T[0-9][0-9]).*$/, '$1')
      // }
      memo.ranking_values[date] = memo.ranking_values[date] || []
      result.data.forEach(
        (data: {
          id: number
          name: string
          symbol: string
          quote: { USD: { market_cap: number } }
        }) => {
          memo.ranking_values[date].push({
            id: data.name,
            symbol: data.symbol,
            value: data.quote.USD.market_cap / 1000000,
          })
        },
      )
      return memo
    },
    { ranking_values: {} } as {
      ranking_values: {
        [date: string]: Array<{ id: string; symbol: string; value: number }>
      }
    },
  )

  fs.writeFileSync(
    path.join(
      __dirname,
      `cryptorankdata_${INTERVAL}_${startDate.valueOf()}_intervals${COUNT}_top${MIN_RANK}.json`,
    ),
    JSON.stringify(rankdata, null, 2),
  )
}

main()
  .then(() => {
    console.log('SUCCESS')
  })
  .catch((err) => {
    throw err
  })
