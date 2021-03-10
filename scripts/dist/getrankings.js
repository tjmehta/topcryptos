'use strict'
var __awaiter =
  (this && this.__awaiter) ||
  function (thisArg, _arguments, P, generator) {
    function adopt(value) {
      return value instanceof P
        ? value
        : new P(function (resolve) {
            resolve(value)
          })
    }
    return new (P || (P = Promise))(function (resolve, reject) {
      function fulfilled(value) {
        try {
          step(generator.next(value))
        } catch (e) {
          reject(e)
        }
      }
      function rejected(value) {
        try {
          step(generator['throw'](value))
        } catch (e) {
          reject(e)
        }
      }
      function step(result) {
        result.done
          ? resolve(result.value)
          : adopt(result.value).then(fulfilled, rejected)
      }
      step((generator = generator.apply(thisArg, _arguments || [])).next())
    })
  }
var __importDefault =
  (this && this.__importDefault) ||
  function (mod) {
    return mod && mod.__esModule ? mod : { default: mod }
  }
Object.defineProperty(exports, '__esModule', { value: true })
const isomorphic_unfetch_1 = __importDefault(require('isomorphic-unfetch'))
const fs_1 = __importDefault(require('fs'))
const path_1 = __importDefault(require('path'))
const times_loop_1 = require('times-loop')
var interval
;(function (interval) {
  interval['DAILY'] = 'DAILY'
  interval['HOURLY'] = 'HOURLY'
  interval['EIGHT_HR'] = 'EIGHT_HR'
})(interval || (interval = {}))
const COUNT = 45
const INTERVAL = interval.DAILY
const MIN_RANK = 200
let startDate
function main() {
  return __awaiter(this, void 0, void 0, function* () {
    let INTERVAL_UNIX
    let lastDate
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
    let dates = []
    let results = yield times_loop_1.timesParallel(COUNT, (i) =>
      __awaiter(this, void 0, void 0, function* () {
        const qs = new URLSearchParams([
          ['start', '1'],
          ['limit', MIN_RANK.toString()],
          ['convert', 'USD'],
        ])
        let url
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

        return isomorphic_unfetch_1
          .default(url, {
            headers: {
              'X-CMC_PRO_API_KEY': '1d3dee12-e925-475b-a2ae-c722b1f9c9ef',
            },
          })
          .then((res) => {
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
      }),
    )
    dates = dates.reverse()
    results = results.reverse()
    const rankdata = dates.reduce(
      (memo, d, i) => {
        const result = results[i]
        let date = result.data[0].last_updated
        // if (INTERVAL === interval.DAILY) {
        date = date.replace(/(T[0-9][0-9]).*$/, '$1').replace(/^20/, '')
        // } else {
        //   // HOURLY, EIGHT_HR
        //   date = date.replace(/^.*(T[0-9][0-9]).*$/, '$1')
        // }
        memo.ranking_values[date] = memo.ranking_values[date] || []
        result.data.forEach((data) => {
          memo.ranking_values[date].push({
            id: data.name,
            symbol: data.symbol,
            value: data.quote.USD.market_cap / 1000000,
          })
        })
        return memo
      },
      { ranking_values: {} },
    )
    fs_1.default.writeFileSync(
      path_1.default.join(
        __dirname,
        `cryptorankdata_${INTERVAL}_${startDate.valueOf()}_intervals${COUNT}_top${MIN_RANK}.json`,
      ),
      JSON.stringify(rankdata, null, 2),
    )
  })
}
main()
  .then(() => {
    console.log('SUCCESS')
  })
  .catch((err) => {
    throw err
  })
//# sourceMappingURL=getrankings.js.map
