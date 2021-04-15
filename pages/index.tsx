import {
  Crypto,
  CryptoScoreResults,
  CryptosById,
  processRankings,
} from '../modules/processRankings'
import DataTable, { createTheme } from 'react-data-table-component'
import { useEffect, useMemo, useState } from 'react'

import { DailyRankingsResponse } from './api/rankings/daily'
import Head from 'next/head'
import { RankingsChart } from '../components/RankingsChart'
import { format } from 'd3'
import { topCryptos } from '../modules/topCryptos'
import useURLSearchParam from '../components/hooks/useURLSearchParam'

const isServer = typeof window === 'undefined'
export const NAN_SCORE = 0 - 101

const DAYS = [3, 4, 5, 6, 7, 10, 14, 21, 30, 45, 60, 90]
const DATES = DAYS.map((days) => {
  const date = new Date()
  date.setDate(date.getDate() - (days - 1))
  return date
})

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
  const [activeCryptoId, setActiveCryptoId] = useState<string>(null)
  const [selectedCryptoIds, setSelectedCryptoIds] = useState<Set<string>>(
    new Set(),
  )
  const [disabledCryptoIds, setDisabledCryptoIds] = useState<Set<string>>(
    new Set(),
  )
  const [rankings, setRankings] = useState<null | DailyRankingsResponse>(null)
  const [
    cryptoScoreResults,
    setCryptoScoreResults,
  ] = useState<null | CryptoScoreResults>(null)
  const [maxRank] = useURLSearchParam<number>('maxRank', (val) => {
    const str: string | undefined = Array.isArray(val) ? val[0] : val
    let result = parseInt(str, 10)
    if (isNaN(result)) result = null
    console.log('maxRank', result)
    return result ?? 500
  })
  const [days, setDays] = useURLSearchParam<number>('limit', (val) => {
    const str: string | undefined = Array.isArray(val) ? val[0] : val
    let result = parseInt(str, 10)
    if (isNaN(result)) result = null
    return result ?? 10
  })
  const daysIndex = DAYS.findIndex((v) => v === days)
  const toggleDisabledCrypto = (cryptoId: string) => {
    const nextDisabledCryptoIds = new Set([...disabledCryptoIds])

    if (disabledCryptoIds.has(cryptoId)) {
      nextDisabledCryptoIds.delete(cryptoId)
    } else {
      nextDisabledCryptoIds.add(cryptoId)
    }

    if (selectedCryptoIds.has(cryptoId)) {
      toggleSelectedCrypto(cryptoId)
    }

    setDisabledCryptoIds(nextDisabledCryptoIds)
  }
  const toggleSelectedCrypto = (cryptoId: string) => {
    const nextSelectedCryptoIds = new Set([...selectedCryptoIds])

    const crypto = cryptoScoreResults.cryptosById[cryptoId]
    if (selectedCryptoIds.has(cryptoId)) {
      // @ts-ignore
      delete crypto.rank_plus_selected
      nextSelectedCryptoIds.delete(cryptoId)
    } else {
      const maxRank = cryptoScoreResults.minMaxes.rankByMarketCapMinMax.max
      // @ts-ignore
      crypto.rank_plus_selected = 0 - maxRank * 2 + crypto.rank
      nextSelectedCryptoIds.add(cryptoId)
    }

    setSelectedCryptoIds(nextSelectedCryptoIds)
  }
  const setSelectedCryptos = (cryptoIds: string[]) => {
    const nextSelectedCryptoIds = new Set([...cryptoIds])

    selectedCryptoIds.forEach((cryptoId) => {
      // previously selected
      delete cryptoScoreResults.cryptosById[
        cryptoId
        // @ts-ignore
      ].rank_plus_selected
    })
    const maxRank = cryptoScoreResults.minMaxes.rankByMarketCapMinMax.max
    nextSelectedCryptoIds.forEach((cryptoId) => {
      cryptoScoreResults.cryptosById[
        cryptoId
        // @ts-ignore
      ].rank_plus_selected =
        0 - maxRank * 2 + cryptoScoreResults.cryptosById[cryptoId].rank
    })

    setSelectedCryptoIds(nextSelectedCryptoIds)
  }

  // fetch cryptos
  useEffect(() => {
    if (isServer) return

    topCryptos
      .getRankings({})
      .then((rankings) => {
        setRankings(rankings)
      })
      .catch((err) => {
        console.error('getRankings error', err)
        setError(err)
      })
  }, [])

  useEffect(() => {
    if (rankings == null) return
    processRankings(rankings, DATES[daysIndex], disabledCryptoIds)
      .then((cryptoScoreResults) => {
        setCryptoScoreResults(cryptoScoreResults)
      })
      .catch((err) => {
        console.error('processRankings error', err)
        setError(err)
      })
  }, [daysIndex, rankings, disabledCryptoIds])

  const title = `Top Performing Cryptocurrencies`

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
              <option key={day} value={day}>{`${day} days`}</option>
            ))}
          </select>
        </h2>

        <div className="xl:flex">
          <div className="pb-5 md:pb-10 lg:pb-20 lg:pr-4">
            {useMemo(() => {
              if (cryptoScoreResults == null) return null
              return (
                <RankingsChart
                  className="rounded-3xl shadow-2xl p-2 md:p-4 lg:p-8 xl:flex-1"
                  cryptoScoreResults={cryptoScoreResults}
                  days={days}
                  activeCryptoId={activeCryptoId}
                  selectedCryptoIds={selectedCryptoIds}
                  disabledCryptoIds={disabledCryptoIds}
                  onClick={(cryptoId) => {
                    toggleSelectedCrypto(cryptoId)
                  }}
                  onDoubleClick={(cryptoId) => {
                    toggleDisabledCrypto(cryptoId)
                  }}
                  onMouseOver={(cryptoId) => {
                    setActiveCryptoId(cryptoId)
                  }}
                />
              )
            }, [cryptoScoreResults, selectedCryptoIds])}
          </div>
          <div
            className={
              cryptoScoreResults != null
                ? 'table-wrapper pb-5 md:pb-10 lg:pb-20 xl:max-w-3xl xl:flex-1'
                : 'loading'
            }
          >
            {useMemo(() => {
              if (cryptoScoreResults == null)
                return <div style={{ textAlign: 'center' }}>Loading...</div>

              return (
                <DataTable
                  data={cryptoScoreResults.cryptosSortedByScore.slice()}
                  theme="custom"
                  defaultSortField="rank_plus_selected"
                  defaultSortAsc={true}
                  onRowDoubleClicked={(crypto: Crypto) => {
                    toggleDisabledCrypto(crypto.id)
                  }}
                  contextActions={<div>ContextMenu</div>}
                  selectableRows // add for checkbox selection
                  selectableRowsHighlight={true}
                  selectableRowSelected={(crypto: Crypto) => {
                    return selectedCryptoIds.has(crypto.id)
                  }}
                  selectableRowDisabled={(crypto: Crypto) => {
                    return disabledCryptoIds.has(crypto.id)
                  }}
                  onSelectedRowsChange={(state) => {
                    setSelectedCryptos(
                      state.selectedRows.map((crypto) => crypto.id),
                    )
                  }}
                  columns={[
                    {
                      name: 'Name',
                      // rank_accel_sum: resultsByCryptoId[0].mark,
                      cell: (crypto: Crypto) => (
                        <a
                          href={`//coinmarketcap.com/currencies/${crypto.slug}/`}
                          target="_blank"
                        >
                          {crypto.name}
                        </a>
                      ),
                      selector: 'name',
                      maxWidth: '250px',
                      // minWidth: '250px',
                      sortable: true,
                    },
                    {
                      name: 'Symbol',
                      selector: 'symbol',
                      maxWidth: '80px',
                      minWidth: '80px',
                      sortable: true,
                    },
                    {
                      name: 'Score Rank',
                      selector: (crypto: Crypto) =>
                        // @ts-ignore
                        crypto.rank_plus_selected ?? crypto.rank,
                      format: (crypto: Crypto) => crypto.rank,
                      maxWidth: '55px',
                      minWidth: '55px',
                      sortable: true,
                      right: true,
                    },
                    {
                      name: 'Score',
                      selector: 'score',
                      format: (crypto: Crypto) => format('.4f')(crypto.score),
                      maxWidth: '200px',
                      minWidth: '85px',
                      sortable: true,
                      right: true,
                    },
                    {
                      name: 'Price %',
                      selector: 'total.pricePct',
                      format: (crypto: Crypto) =>
                        `${format('.2f')(crypto.total.pricePct)}%`,
                      maxWidth: '125px',
                      minWidth: '85px',
                      sortable: true,
                      right: true,
                    },
                    {
                      name: 'Mkt Cap',
                      selector: 'total.endQuote.marketCap',
                      format: (crypto: Crypto) => {
                        return format('~s')(
                          crypto.total.endQuote.marketCap,
                        ).replace('G', 'B')
                      },
                      maxWidth: '200px',
                      minWidth: '85px',
                      sortable: true,
                      right: true,
                    },
                    {
                      name: 'Mkt Cap %',
                      selector: 'total.marketCapPct',
                      format: (crypto: Crypto) =>
                        `${format('.2f')(crypto.total.marketCapPct)}%`,
                      maxWidth: '125px',
                      minWidth: '85px',
                      sortable: true,
                      right: true,
                    },
                    {
                      name: 'Rank Delta',
                      selector: 'crypto.total.rankDelta',
                      format: (crypto: Crypto) => 0 - crypto.total.rankDelta,
                      maxWidth: '55px',
                      minWidth: '55px',
                      sortable: true,
                      right: true,
                    },
                    {
                      name: 'Mkt Cap Rank',
                      selector: 'total.endQuote.rankByMarketCap',
                      maxWidth: '55px',
                      minWidth: '55px',
                      sortable: true,
                      right: true,
                    },
                    {
                      name: 'Price',
                      selector: 'total.endQuote.price',
                      format: (crypto: Crypto) =>
                        format('$,.4f')(crypto.total.endQuote.price),
                      maxWidth: '200px',
                      minWidth: '85px',
                      sortable: true,
                      right: true,
                    },
                  ]}
                />
              )
            }, [
              cryptoScoreResults?.cryptosSortedByScore,
              selectedCryptoIds,
              disabledCryptoIds,
            ])}
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
