import DataTable, { createTheme } from 'react-data-table-component'
import { RankingsResult, topCryptos } from '../modules/topCryptos'
import { useEffect, useMemo, useState } from 'react'

import Head from 'next/head'
import { MinMaxState } from '../modules/MinMax'
import { RankingsChart } from '../components/RankingsChart'
import { format } from 'd3'
import useURLSearchParam from '../components/hooks/useURLSearchParam'

const isServer = typeof window === 'undefined'
export const NAN_SCORE = 0 - 101

createTheme('custom', {
  text: {
    primary: '#EBEBEB',
    secondary: '#EBEBEB',
  },
  background: {
    default: 'none',
  },
  context: {
    background: '#E91E63',
    text: '#EBEBEB',
  },
  divider: {
    default: '#2C3136',
  },
  action: {
    button: 'rgba(0,0,0,.54)',
    hover: 'rgba(0,0,0,.08)',
    disabled: 'rgba(0,0,0,.12)',
  },
})

export default function DailyPct() {
  const [error, setError] = useState<null | string>(null)
  const [selectedRows, setSelectedRows] = useState<{
    [id: number]: boolean
  }>({})
  const [data, setData] = useState<null | (RankingsResult & { key: string })>(
    null,
  )
  const [maxRank] = useURLSearchParam<number>('maxRank', (val) => {
    const str: string | undefined = Array.isArray(val) ? val[0] : val
    let result = parseInt(str, 10)
    if (isNaN(result)) result = null
    console.log('maxRank', result)
    return result ?? 350
  })
  const [limit, setLimit] = useURLSearchParam<number>('limit', (val) => {
    const str: string | undefined = Array.isArray(val) ? val[0] : val
    let result = parseInt(str, 10)
    if (isNaN(result)) result = null
    console.log('limit', result)
    return result ?? 10
  })

  // fetch cryptos
  useEffect(() => {
    if (isServer) return

    topCryptos
      .getRankings({ maxRank, limit })
      .then((data) => {
        setData({
          ...data,
          key: Date.now().toString(),
        })
      })
      .catch((err) => {
        setError(err)
      })
  }, [maxRank, limit])

  // compute stuff
  const {
    minScore,
    maxScore,
    maxTotalPricePct,
    minTotalPricePct,
    resultsByCryptoId,
  } = useMemo(() => {
    if (data == null) return {}

    const totalPricePctMinMaxState = new MinMaxState(0)
    const pricePctAccelsSumMinMaxState = new MinMaxState(0)
    const mktRankAccelsSumMinMaxState = new MinMaxState(0)
    const scoreMinMaxState = new MinMaxState(0)

    const resultsByCryptoId = data.totalDeltasByCrypto
      .map((totalDelta, i) => {
        const accels = data.accelsByCryptoId[totalDelta.id]

        const totalPricePct = totalDelta.price_delta_pct
        const totalMarketCapDeltaPct = totalDelta.market_cap_delta_pct
        const totalMarketRankDelta = totalDelta.mkt_rank_delta
        const pricePctAccelsSum =
          accels?.reduce((memo, item) => {
            return memo + item.price_pct_accel
          }, 0) ?? NaN
        const mktRankAccelsSum =
          accels?.reduce((memo, item) => {
            return memo - item.mkt_rank_accel
          }, 0) ?? NaN

        totalPricePctMinMaxState.compare(totalPricePct)
        pricePctAccelsSumMinMaxState.compare(pricePctAccelsSum)
        mktRankAccelsSumMinMaxState.compare(mktRankAccelsSum)

        return {
          id: totalDelta.id,
          name: totalDelta.name,
          symbol: totalDelta.symbol,
          slug: totalDelta.slug,
          start: totalDelta.start,
          end: totalDelta.end,
          totalPricePct,
          totalMarketCapDeltaPct,
          totalMarketRankDelta,
          pricePctAccelsSum,
          mktRankAccelsSum,
          score: 0,
        }
      })
      .map((result) => {
        const pricePctScore =
          (result.totalPricePct / totalPricePctMinMaxState.max) * 100
        const pricePctAccelsSumScore =
          (result.pricePctAccelsSum / pricePctAccelsSumMinMaxState.max) * 100
        const mktRankAccelsSumScore =
          (result.mktRankAccelsSum / mktRankAccelsSumMinMaxState.max) * 100
        const w1 = 30
        const w2 = 4.5 * ((95 - limit) / (100 + limit * 5))
        const w3 =
          result.end.mkt_rank < 10
            ? 10
            : result.end.mkt_rank < 25
            ? 8
            : result.end.mkt_rank < 50
            ? 6
            : result.end.mkt_rank < 100
            ? 5
            : result.end.mkt_rank < 200
            ? 3
            : result.end.mkt_rank < 300
            ? 1
            : 1

        let score =
          ((w1 * pricePctScore +
            w2 * pricePctAccelsSumScore +
            w3 * mktRankAccelsSumScore) /
            ((w1 + w2 + w3) * 100)) *
          100

        if (isNaN(score) || ~result.name.indexOf('Cocos')) {
          score = NAN_SCORE
        } else {
          scoreMinMaxState.compare(score)
        }

        return {
          ...result,
          score,
          score_rank_mod: 0,
          score_rank: 0,
        }
      })
      .sort((a: any, b: any) => {
        if (a.score > b.score) return -1
        if (a.score < b.score) return 1
        return 0
      })
      .map((result, i) => {
        result.score_rank = 1 + i
        return result
      })
      .reduce(
        (memo, result) => {
          memo[result.id] = result

          return memo
        },
        {} as Record<
          string,
          {
            id: number
            name: string
            symbol: string
            slug: string
            start: typeof data.totalDeltasByCrypto[0]['start']
            end: typeof data.totalDeltasByCrypto[0]['end']
            totalPricePct: number
            totalMarketCapDeltaPct: number
            totalMarketRankDelta: number
            pricePctAccelsSum: number
            mktRankAccelsSum: number
            score: number
            score_rank: number
            score_rank_mod: number
          }
        >,
      )

    return {
      maxScore: scoreMinMaxState.max,
      minScore: scoreMinMaxState.min,
      maxTotalPricePct: totalPricePctMinMaxState.max,
      minTotalPricePct: totalPricePctMinMaxState.min,
      resultsByCryptoId,
    }
  }, [data])

  const title = `Top Performing Cryptocurrencies Over ${limit} Days`
  type ResultType = typeof resultsByCryptoId[0]
  const results = useMemo(() => {
    const results = Object.values(resultsByCryptoId ?? {})
    results.forEach((item) => {
      item.score_rank_mod = selectedRows[item.id]
        ? 0 - maxRank * 2 + item.score_rank
        : item.score_rank
    })
    return results
  }, [resultsByCryptoId, selectedRows])

  return (
    <div
      className="text-gray-200"
      style={{ height: '100%', fontFamily: 'Helvetica' }}
    >
      <Head>
        <title>TopCryptos - {title}</title>
        <link rel="icon" href="/favicon.ico" />
      </Head>
      <div className="container mx-auto">
        <h1 className="logo pt-10 pb-20 text-8xl font-bold">Top Cryptos</h1>
        <h2 className="text-5xl pb-20">
          Top performing cryptocurrencies over{' '}
          <select
            className="bg-gray-600 rounded-md border-2 border-gray-100"
            value={limit.toString()}
            onChange={(evt) => {
              const val = parseInt(evt.target.value, 10)
              if (isNaN(val)) return
              setLimit(val)
            }}
          >
            <option value="3">1 day</option>
            <option value="4">4 days</option>
            <option value="5">5 days</option>
            <option value="6">6 days</option>
            <option value="7">7 days</option>
            <option value="10">10 days</option>
            <option value="14">14 days</option>
            <option value="21">21 days</option>
            <option value="30">30 days</option>
            <option value="45">45 days</option>
            <option value="60">60 days</option>
            <option value="90">90 days</option>
          </select>
        </h2>

        <div>
          <div>
            {data ? (
              <RankingsChart
                data={data}
                maxRank={maxRank}
                maxScore={maxScore}
                minScore={minScore}
                resultsByCryptoId={resultsByCryptoId}
                selectedRows={selectedRows}
                onClick={(cryptoId: number) => {
                  const nextSelectedRows = {
                    ...selectedRows,
                  }
                  if (selectedRows[cryptoId]) {
                    delete nextSelectedRows[cryptoId]
                  } else {
                    nextSelectedRows[cryptoId] = true
                  }
                  setSelectedRows(nextSelectedRows)
                }}
              />
            ) : null}
          </div>
          <div className={results.length ? 'table-wrapper' : 'loading'}>
            {useMemo(() => {
              if (results.length === 0)
                return <div style={{ textAlign: 'center' }}>Loading...</div>
              return (
                <DataTable
                  theme="custom"
                  defaultSortField="score_rank_mod"
                  defaultSortAsc={true}
                  selectableRows // add for checkbox selection
                  selectableRowsHighlight={true}
                  selectableRowSelected={(row) => {
                    if (selectedRows == null) return false
                    return selectedRows[row.id] ?? false
                  }}
                  onSelectedRowsChange={(state) => {
                    state
                    setSelectedRows(
                      state.selectedRows.reduce((memo, row) => {
                        memo[row.id] = true
                        return memo
                      }, {}),
                    )
                  }}
                  columns={[
                    {
                      name: 'Score Rank',
                      selector: 'score_rank_mod',
                      format: (item: ResultType) => item.score_rank,
                      maxWidth: '25px',
                      sortable: true,
                      center: true,
                    },
                    {
                      name: 'Name',
                      // rank_accel_sum: resultsByCryptoId[0].mark,
                      selector: 'name',
                      maxWidth: '250px',
                      sortable: true,
                    },
                    {
                      name: 'Symbol',
                      selector: 'symbol',
                      maxWidth: '80px',
                      sortable: true,
                    },
                    {
                      name: 'Mkt Cap Rank',
                      selector: 'end.mkt_rank',
                      maxWidth: '100px',
                      sortable: true,
                      right: true,
                    },
                    {
                      name: 'Mkt Cap',
                      selector: 'end.market_cap',
                      format: (item: ResultType) => {
                        return format('~s')(item.end.market_cap).replace(
                          'G',
                          'B',
                        )
                      },
                      maxWidth: '200px',
                      sortable: true,
                      right: true,
                    },
                    {
                      name: 'Price',
                      selector: 'end.price',
                      format: (item: ResultType) =>
                        format('$,.4f')(item.end.price),
                      maxWidth: '200px',
                      sortable: true,
                      right: true,
                    },
                    {
                      name: 'Score',
                      selector: (item: ResultType) => item.score ?? 0,
                      format: (item: ResultType) => format('.4f')(item.score),
                      maxWidth: '200px',
                      sortable: true,
                      right: true,
                    },
                    {
                      name: 'Price %',
                      selector: 'totalPricePct',
                      format: (item: ResultType) =>
                        `${format('.2f')(item.totalPricePct)}%`,
                      maxWidth: '125px',
                      sortable: true,
                      right: true,
                    },
                    {
                      name: 'Mkt Cap %',
                      selector: 'totalMarketCapDeltaPct',
                      format: (item: ResultType) =>
                        `${format('.2f')(item.totalMarketCapDeltaPct)}%`,
                      maxWidth: '125px',
                      sortable: true,
                      right: true,
                    },
                    {
                      name: 'Rank Delta',
                      selector: 'totalMarketRankDelta',
                      format: (item: ResultType) =>
                        0 - item.totalMarketRankDelta,
                      maxWidth: '125px',
                      sortable: true,
                      right: true,
                    },
                  ]}
                  data={results}
                />
              )
            }, [results, selectedRows])}
          </div>
        </div>

        <style global jsx>{`
        .loading {
          padding: 200px;
        }
        .table-wrapper {
          border-radius: 25px;
          margin-bottom: 50px;
          box-shadow: -25px 25px 50px rgba(5, 5, 5, .5);
          background-image: linear-gradient(to top right,#0F1214,#131518,#15181B,#1B2026,#20242B,#22252D)
        }
        .table-wrapper > div:first-child {
          border-radius: 25px 25px 0 0;
          background: none;
        }
        .table-wrapper > div:last-child {
          border-radius: 0 0 25px 25px;
          background: none;
        }
        .table-wrapper > div:last-child > div > div {
          background: none;
        }

        .axisLeft line,
        .axisBottom line{
          stroke: #2C3136;
        }

        .axisLeft path,
        .axisBottom path{
          stroke: #2C3136;
        }

        .axisLeft text,
        .axisBottom text{
          fill: #7F8490;
        }
        .logo::before {
          content: '🔥 ';
        }
        .rankings-section {
          flex: 9;
          font-size: 10pt;
          font-family: SF Mono;
          min-width: 600px;
        }
        ul {
          padding-left: 3px;
        }
        li {
          cursor: pointer;
        }
        li.hover {
          color: purple;
        }
        .chart {
          flex: 16;
          background-image: linear-gradient(to top right, #0F1214, #131518, #15181B, #1B2026, #20242B, #22252D);
          border-radius: 25px;
          padding: 40px 45px 45px 40px;
          margin-bottom: 75px;
          box-sizing: border-box;
          box-shadow: -25px 25px 50px rgba(5, 5, 5, .5);
        }
        .line {
          cursor: pointer,
          stroke-width: 1px;
          fill: none;
        }
        .line.hover,
        .line:hover {
          stroke: yellow !important;
          opacity: 1 !important;
          filter: drop-shadow(0px 0px 10px pink);
        }
        .line.hover::after,
        .line:hover::after {
          position: fixed;
          height: 10px;
          background-color: orange;
          content: attr(title);
        }
      `}</style>
      </div>
    </div>
  )
}
