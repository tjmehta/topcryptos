import * as d3 from 'd3'

import { RankingsResult, topCryptos } from '../modules/topCryptos'
import { Selection, select } from 'd3'
import { useEffect, useState } from 'react'

import Head from 'next/head'
import { RankingsData } from './api/rankings/hourly'
import { interpolate } from '../modules/interpolate'
import { last } from '../modules/last'
import { padLeft } from '../modules/padLeft'

// import useResizeObserver from 'use-resize-observer'

const margin = { top: 10, right: 20, bottom: 60, left: 50 }
const width = 1300 - margin.left - margin.right
const height = 1080 - margin.top - margin.bottom
const fullWidth = width + margin.left + margin.right
const fullHeight = height + margin.top + margin.bottom

const isServer = typeof window === 'undefined'

type ChartDataType = Record<
  string,
  {
    type: 'scatter'
    mode: 'lines'
    name: string
    x: string[]
    y: number[]
    line: { color: string }
  }
>

export default function DailyPct() {
  const [error, setError] = useState<null | string>(null)
  const [data, setData] = useState<null | RankingsResult>(null)
  const [hoveredTitle, setHoveredTitle] = useState<null | string>(null)

  useEffect(() => {
    if (isServer) return
    const params = new URLSearchParams(window.location.search.slice(1))
    const maxRankParam = parseInt(params.get('maxRank'), 10)
    const limitParam = parseInt(params.get('limit'), 10)
    const MAX_RANK = isNaN(maxRankParam) ? 500 : maxRankParam
    const LIMIT = isNaN(limitParam) ? 30 : limitParam

    topCryptos
      .getRankings({ maxRank: MAX_RANK, limit: LIMIT })
      .then(
        ({
          rankingsByCrypto,
          deltasByCrypto,
          accelsByCrypto,
          totalDeltasByCrypto,
          totalDeltasByCryptoId,
        }) => {
          setData({
            rankingsByCrypto,
            deltasByCrypto,
            accelsByCrypto,
            totalDeltasByCrypto,
            totalDeltasByCryptoId,
          })
          //////////////////////////////////////////
          //////////////////////////////////////////
          //////////////////////////////////////////
          //////////////////////////////////////////
          /**
           * CHART
           */

          const svg = d3
            .select('.chart')
            .append('svg')
            .attr('width', fullWidth)
            .attr('height', fullHeight)
            .call(responsivefy as any)
            .append('g')
            .attr('transform', `translate(${margin.left}, ${margin.top})`)

          const maxTotalPricePct = d3.max(
            totalDeltasByCrypto,
            (total) => total.price_delta_pct,
          )
          const minTotalPricePct = d3.min(
            totalDeltasByCrypto,
            (total) => total.price_delta_pct,
          )

          // AXES
          const yScale = d3
            .scaleLinear()
            .domain([MAX_RANK, 1])
            .range([height, 0])
            .nice()
          const yAxis = d3.axisLeft(yScale)
          svg.call(yAxis)

          const xScale = d3
            .scaleTime()
            .domain([
              d3.min(rankingsByCrypto, (arr) =>
                d3.min(arr, (item) => item.last_updated),
              ),
              d3.max(rankingsByCrypto, (arr) =>
                d3.max(arr, (item) => item.last_updated),
              ),
            ])
            .range([0, width])
          const xAxis = d3.axisBottom(xScale).ticks(5)
          svg
            .append('g')
            .attr('transform', `translate(0, ${height})`)
            .call(xAxis)
            .selectAll('text')
            .style('text-anchor', 'end')
            .attr('transform', 'rotate(-45)')

          // LINES
          type Ranking = typeof rankingsByCrypto[0][0]
          const line = (arr: Ranking[], index: number) =>
            d3
              .line<Ranking>()
              .x((item) => xScale(item.last_updated))
              .y((item) => yScale(item.cmc_rank))(arr)

          svg
            .selectAll('.line')
            .data(rankingsByCrypto)
            .enter()
            .append('path')
            .attr('class', 'line')
            .attr('data-crypto-id', (arr) => arr[0].id)
            .attr('d', (arr, index) => line(arr, index))
            .style('stroke', (arr, index) => {
              const totalDelta = totalDeltasByCrypto[index]

              if (totalDelta.price_delta_pct >= 0) {
                return '#00b300'
                // return interpolateColor({
                //   start: new Color(255, 255, 255),
                //   end: new Color(0, 255, 0),
                //   steps: maxTotalDiff.market_cap,
                //   count: c.totalDiff.market_cap,
                // }).toHexCode()
              } else {
                return '#b30000'
                // return interpolateColor({
                //   start: new Color(255, 255, 255),
                //   end: new Color(255, 0, 0),
                //   steps: Math.abs(minTotalDiff.market_cap),
                //   count: Math.abs(c.totalDiff.market_cap),
                // }).toHexCode()
              }
            })
            .style('stroke-width', (arr, index) => {
              const totalDelta = totalDeltasByCrypto[index]

              if (totalDelta.price_delta_pct >= 0) {
                return interpolate({
                  start: 0,
                  end: 25,
                  steps: maxTotalPricePct,
                  count: totalDelta.price_delta_pct,
                })
              } else {
                return interpolate({
                  start: 0,
                  end: 10,
                  steps: Math.abs(minTotalPricePct),
                  count: Math.abs(totalDelta.price_delta_pct),
                })
              }
            })
            .style('opacity', (arr, index) => {
              const totalDelta = totalDeltasByCrypto[index]

              if (totalDelta.price_delta_pct >= 0) {
                return (
                  interpolate({
                    start: 0,
                    end: 100,
                    steps: maxTotalPricePct,
                    count: totalDelta.price_delta_pct,
                  }) / 100
                )
              } else {
                return (
                  interpolate({
                    start: 0,
                    end: 50,
                    steps: Math.abs(minTotalPricePct),
                    count: Math.abs(totalDelta.price_delta_pct),
                  }) / 100
                )
              }
            })
            .append('title')
            .text((deltas) => deltas[0].name)
        },
      )
  }, [])

  useEffect(() => {
    const handleMouseOut = (e: any) => {
      if (e.target?.dataset ?? e.target?.dataset.cryptoId) {
        const cryptoId = e.target?.dataset.cryptoId
        document
          .querySelectorAll(`[data-crypto-id="${cryptoId}"]`)
          .forEach((el) => {
            el.classList.remove('hover')
          })
      }
    }
    const handleMouseOver = (e: any) => {
      if (e.target?.dataset ?? e.target?.dataset.cryptoId) {
        const cryptoId = e.target?.dataset.cryptoId
        document
          .querySelectorAll(`[data-crypto-id="${cryptoId}"]`)
          .forEach((el) => {
            el.classList.add('hover')
          })
      }
    }
    window.addEventListener('mouseout', handleMouseOut)
    window.addEventListener('mouseover', handleMouseOver)
    return () => {
      // cleanup
      window.removeEventListener('mouseout', handleMouseOut)
      window.removeEventListener('mouseover', handleMouseOver)
    }
  }, [])

  const winners = {
    byRank:
      data?.totalDeltasByCrypto.slice().sort((a, b) => {
        const key = 'cmc_rank_delta'
        if (a[key] > b[key]) {
          return 1 // backwards
        }
        if (a[key] < b[key]) {
          return -1 // backwards
        }
        return 0
      }) ?? [],
    byPricePct:
      data?.totalDeltasByCrypto.slice().sort((a, b) => {
        const key = 'price_delta_pct'
        a.price_delta_pct
        if (a[key] < b[key]) {
          return 1
        }
        if (a[key] > b[key]) {
          return -1
        }
        return 0
      }) ?? [],
    byMktCapPct:
      data?.totalDeltasByCrypto.slice().sort((a, b) => {
        const key = 'market_cap_delta_pct'
        if (a[key] > b[key]) {
          return -1
        }
        if (a[key] < b[key]) {
          return 1
        }
        return 0
      }) ?? [],
    byRankAccel:
      data?.accelsByCrypto
        .map((accels) => {
          return accels.reduce(
            (memo, item) => {
              memo.rank_accel_sum += 0 - item.cmc_rank_accel
              return memo
            },
            {
              id: accels[0].id,
              name: accels[0].name,
              symbol: accels[0].symbol,
              slug: accels[0].slug,
              rank_accel_sum: 0,
            },
          )
        })
        .sort((a, b) => {
          const key = 'rank_accel_sum'
          if (a[key] > b[key]) {
            return -1
          }
          if (a[key] < b[key]) {
            return 1
          }
          return 0
        }) ?? [],
    byPriceAccel:
      data?.accelsByCrypto
        .map((accels) => {
          return accels.reduce(
            (memo, item) => {
              item.price_accel
              memo.price_accel_sum += item.price_pct_accel
              return memo
            },
            {
              id: accels[0].id,
              name: accels[0].name,
              symbol: accels[0].symbol,
              slug: accels[0].slug,
              price_accel_sum: 0,
            },
          )
        })
        .sort((a, b) => {
          const key = 'price_accel_sum'
          if (a[key] > b[key]) {
            return -1
          }
          if (a[key] < b[key]) {
            return 1
          }
          return 0
        }) ?? [],
    byScore:
      data?.accelsByCrypto
        .map((accels, i) => {
          const total = data.totalDeltasByCryptoId[accels[0].id]
          const item = accels.reduce(
            (memo, item) => {
              item.price_accel
              memo.price_accel_sum += item.price_pct_accel
              return memo
            },
            {
              id: accels[0].id,
              name: accels[0].name,
              symbol: accels[0].symbol,
              slug: accels[0].slug,
              price_accel_sum: 0,
              start: total.start,
              end: total.end,
              score: 0,
            },
          )
          let factor = 0
          const totalPct = total.price_delta_pct
          const totalRank = total.mkt_rank_delta
          if (totalPct >= 0) {
            factor = 1 + totalPct / 100
          } else {
            factor = 1 + totalPct / 100
          }
          factor *= 0 - totalRank / 50
          item.score = item.price_accel_sum * factor * 10
          return item
        })
        .sort((a, b) => {
          const key = 'score'
          if (a[key] > b[key]) {
            return -1
          }
          if (a[key] < b[key]) {
            return 1
          }
          return 0
        }) ?? [],
  }

  return (
    <div className="container">
      <Head>
        <title>Top Crypto Rankings</title>
        <link rel="icon" href="/favicon.ico" />
      </Head>

      <div className="content">
        <div className="rankings-section">
          <div>Rankings</div>
          <div>Score Winners</div>
          <ul>
            {winners.byScore.slice(0, 50).map((item, i) => {
              const iii = winners.byPricePct.find((iii) => item.id === iii.id)
              return (
                <li key={i} data-crypto-id={item.id}>
                  {padLeft((i + 1).toString(), 2, '_')}.{' '}
                  {padLeft(Math.round(item.score).toString(), 6, '_')}
                  {' - '}
                  {padLeft(Math.round(iii.price_delta_pct).toString(), 5, '_')}
                  {'% - '}
                  {padLeft(Math.round(item.start.mkt_rank).toString(), 4, '_')}
                  {item.start.mkt_rank > item.end.mkt_rank ? ' -> ' : ' -- '}
                  {padLeft(Math.round(item.end.mkt_rank).toString(), 4, '_')}
                  {' - '}
                  {padLeft(
                    d3.format('.2s')(item.end.market_cap).replace('G', 'B'),
                    4,
                    '_',
                  )}
                  {' - '}
                  {item.name}
                  {' - '}
                  <a
                    href={`https://coinmarketcap.com/currencies/${item.slug}/`}
                    target="new"
                  >
                    {item.symbol}
                  </a>
                </li>
              )
            })}
          </ul>
          <div>Price Delta Winners</div>
          <ul>
            {winners.byPricePct.slice(0, 100).map((item, i) => {
              return (
                <li key={i} data-crypto-id={item.id}>
                  {padLeft((i + 1).toString(), 2, '_')}.{' '}
                  {padLeft(Math.round(item.price_delta_pct).toString(), 4, '_')}
                  {'% - '}
                  {padLeft(Math.round(item.start.mkt_rank).toString(), 4, '_')}
                  {' -> '}
                  {padLeft(Math.round(item.end.mkt_rank).toString(), 4, '_')}
                  {' - '}
                  {padLeft(
                    d3.format('.2s')(item.end.market_cap).replace('G', 'B'),
                    4,
                    '_',
                  )}
                  {' - '}
                  {item.name}
                  {' - '}
                  <a
                    href={`https://coinmarketcap.com/currencies/${item.slug}/`}
                    target="new"
                  >
                    {item.symbol}
                  </a>
                </li>
              )
            })}
          </ul>
          <div>Price Accel Delta Winners</div>
          <ul>
            {winners.byPriceAccel.slice(0, 20).map((item, i) => {
              return (
                <li key={i} data-crypto-id={item.id}>
                  {padLeft((i + 1).toString(), 2, '_')}.{' '}
                  {padLeft(Math.round(item.price_accel_sum).toString(), 4, '_')}{' '}
                  - {item.name}
                </li>
              )
            })}
          </ul>
          <div>Market Cap Delta Winners</div>
          <ul>
            {winners.byMktCapPct.slice(0, 20).map((item, i) => {
              return (
                <li key={i} data-crypto-id={item.id}>
                  {padLeft((i + 1).toString(), 2, '_')}.{' '}
                  {padLeft(
                    Math.round(item.market_cap_delta_pct).toString(),
                    4,
                    '_',
                  )}
                  % - {item.name} {item.symbol}
                </li>
              )
            })}
          </ul>
          <div>Rank Accel Delta Winners</div>
          <ul>
            {winners.byRankAccel.slice(0, 20).map((item, i) => {
              return (
                <li key={i} data-crypto-id={item.id}>
                  {padLeft((i + 1).toString(), 2, '_')}.{' '}
                  {padLeft(Math.round(item.rank_accel_sum).toString(), 4, '_')}{' '}
                  - {item.name}
                </li>
              )
            })}
          </ul>
          <div>Rank Delta Winners</div>
          <ul>
            {winners.byRank.slice(0, 20).map((item, i) => {
              return (
                <li key={i} data-crypto-id={item.id}>
                  {padLeft((i + 1).toString(), 2, '_')}.{' '}
                  {padLeft(Math.round(item.cmc_rank_delta).toString(), 4, '_')}{' '}
                  - {item.name}
                </li>
              )
            })}
          </ul>
        </div>
        <div className="chart" />
      </div>

      <style global jsx>{`
        .container {
          height: '100%';
          width: '100%';
        }
        .content {
          display: flex;
          flex-direction: row;
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
          background-color: lightgray;
          border: 1px solid black;
          min-height: 500px;
        }
        .line {
          cursor: pointer,
          stroke-width: 1px;
          fill: none;
        }
        .line.hover,
        .line:hover {
          stroke: purple !important;
          opacity: 1 !important;
          stroke-width: 10px !important;
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
  )
}

function responsivefy(
  svg: Selection<SVGElement, unknown, HTMLDivElement, unknown>,
) {
  // get container + svg aspect ratio
  var container = select(svg.node().parentNode),
    width = parseInt(svg.style('width')),
    height = parseInt(svg.style('height')),
    aspect = width / height
  // add viewBox and preserveAspectRatio properties,
  // and call resize so that svg resizes on inital page load
  svg
    .attr('viewBox', '0 0 ' + width + ' ' + height)
    .attr('preserveAspectRatio', 'xMinYMid')
    .call(resize)
  // to register multiple listeners for same event type,
  // you need to add namespace, i.e., 'click.foo'
  // necessary if you call invoke this function for multiple svgs
  // api docs: https://github.com/mbostock/d3/wiki/Selections#on
  select(window).on('resize.' + container.attr('id'), resize)
  // get width of container and resize svg to fit it
  function resize() {
    var targetWidth = window.innerHeight * 1.3
    // targetWidth -= 400
    svg.attr('width', Math.round(targetWidth / aspect))
    svg.attr('height', targetWidth / aspect)
  }
  resize()
}
