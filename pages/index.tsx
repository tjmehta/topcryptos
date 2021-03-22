import {
  DAYS,
  indexByDay,
  indexByDay,
  RankingsResult,
  topCryptos,
} from '../modules/topCryptos'
import DataTable, { createTheme } from 'react-data-table-component'
import { useEffect, useMemo, useState } from 'react'

import Head from 'next/head'
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

export default function Home() {
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
  const [days, setDays] = useURLSearchParam<number>('limit', (val) => {
    const str: string | undefined = Array.isArray(val) ? val[0] : val
    let result = parseInt(str, 10)
    if (isNaN(result)) result = null
    return result ?? 10
  })
  const daysIndex = DAYS.findIndex((v) => v === days)

  // fetch cryptos
  useEffect(() => {
    if (isServer) return

    topCryptos
      .getRankings({ maxRank })
      .then((data) => {
        setData({
          ...data,
          key: Date.now().toString(),
        })
      })
      .catch((err) => {
        setError(err)
      })
  }, [maxRank])

  const {
    rankingsByCryptoId,
    dailyScoreRankings,
    dailyTotalDeltasByCrypto,
    dailyMinMaxTotalDeltas,
    dailyMinMaxScores,
  } = data ?? {}
  const title = `Top Performing Cryptocurrencies`
  type ResultType = typeof rankingsByCryptoId[0]

  return (
    <div
      className="text-gray-200"
      style={{ height: '100%', fontFamily: 'Helvetica' }}
    >
      <Head>
        <title>Top Cryptos - {title}</title>
        <link rel="icon" href="/favicon.ico" />
      </Head>
      <div className="container mx-auto">
        <h1 className="logo font-bold pt-5 pb-10 text-4xl md:pt-6 md:pb-12 md:text-5xl lg:pt-10 lg:pb-20 lg:text-6xl">
          Top Cryptos
        </h1>
        <h2 className="pb-5 text-xl md:pb-10 md:text-2xl lg:pb-20 lg:text-4xl">
          Top performing cryptos over{' '}
          <select
            className="bg-gray-600 rounded-md border-2 border-gray-100"
            value={days.toString()}
            onChange={(evt) => {
              const val = parseInt(evt.target.value, 10)
              if (isNaN(val)) return
              setDays(val)
            }}
          >
            {DAYS.map((day) => (
              <option value={day}>{`${day} days`}</option>
            ))}
          </select>
        </h2>

        <div className="xl:flex">
          <div className="pb-5 md:pb-10 lg:pb-20 lg:pr-4">
            {data ? (
              <RankingsChart
                className="rounded-3xl shadow-2xl p-2 md:p-4 lg:p-8 xl:flex-1"
                data={data}
                maxRank={maxRank}
                maxScore={dailyMinMaxScores[indexByDay[days]].max}
                minScore={dailyMinMaxScores[indexByDay[days]].min}
                rankingsByCryptoId={rankingsByCryptoId[indexByDay[days]]}
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
          <div
            className={
              data != null
                ? 'table-wrapper pb-5 md:pb-10 lg:pb-20 xl:max-w-3xl xl:flex-1'
                : 'loading'
            }
          >
            {useMemo(() => {
              if (data == null)
                return <div style={{ textAlign: 'center' }}>Loading...</div>

              const totalDeltaByCrypto: {
                [cryptoId: number]: typeof dailyTotalDeltasByCrypto[0][0]
              } = Object.keys(dailyTotalDeltasByCrypto).reduce(
                (totalDeltaByCrypto, cryptoId) => {
                  totalDeltaByCrypto[cryptoId] =
                    dailyTotalDeltasByCrypto[cryptoId][indexByDay[days]]
                  return totalDeltaByCrypto
                },
                {},
              )

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
                      format: (item: ResultType) =>
                        totalDeltaByCrypto.score_rank,
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
                        return format('~s')(
                          dailyTotalDeltasByCrypto[item[indexByDay[days]].id][
                            indexByDay[days]
                          ].end.market_cap,
                        ).replace('G', 'B')
                      },
                      maxWidth: '200px',
                      sortable: true,
                      right: true,
                    },
                    {
                      name: 'Price',
                      selector: 'end.price',
                      format: (item: ResultType) =>
                        format('$,.4f')(
                          dailyTotalDeltasByCrypto[item[indexByDay[days]].id][
                            indexByDay[days]
                          ].end.price,
                        ),
                      maxWidth: '200px',
                      sortable: true,
                      right: true,
                    },
                    {
                      name: 'Score',
                      selector: (item: ResultType) =>
                        dailyTotalDeltasByCrypto[item[indexByDay[days]].id][
                          indexByDay[days]
                        ].score ?? 0,
                      format: (item: ResultType) =>
                        format('.4f')(
                          dailyTotalDeltasByCrypto[item[indexByDay[days]].id][
                            indexByDay[days]
                          ].score,
                        ),
                      maxWidth: '200px',
                      sortable: true,
                      right: true,
                    },
                    {
                      name: 'Price %',
                      selector: 'totalPricePct',
                      format: (item: ResultType) =>
                        `${format('.2f')(
                          dailyTotalDeltasByCrypto[item[indexByDay[days]].id][
                            indexByDay[days]
                          ].price_delta_pct,
                        )}%`,
                      maxWidth: '125px',
                      sortable: true,
                      right: true,
                    },
                    {
                      name: 'Mkt Cap %',
                      selector: 'totalMarketCapDeltaPct',
                      format: (item: ResultType) =>
                        `${format('.2f')(
                          dailyTotalDeltasByCrypto[item[indexByDay[days]].id][
                            indexByDay[days]
                          ].market_cap_delta_pct,
                        )}%`,
                      maxWidth: '125px',
                      sortable: true,
                      right: true,
                    },
                    {
                      name: 'Rank Delta',
                      selector: 'totalMarketRankDelta',
                      format: (item: ResultType) =>
                        0 -
                        dailyMinMaxTotalDeltas[indexByDay[days]]
                          .mkt_rank_delta_min_max.max,
                      maxWidth: '125px',
                      sortable: true,
                      right: true,
                    },
                  ]}
                  data={Object.values(totalDeltaByCrypto)}
                />
              )
            }, [data, days, selectedRows])}
          </div>
        </div>

        <style global jsx>{`
        .loading {
          padding: 200px;
        }
        .table-wrapper {
          border-radius: 25px;
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
          background-image: linear-gradient(to top right, #0F1214, #131518, #15181B, #1B2026, #20242B, #22252D);
          box-sizing: border-box;
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
