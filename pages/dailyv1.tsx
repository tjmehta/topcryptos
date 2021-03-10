import * as d3 from 'd3'

import { useEffect, useState } from 'react'

import Head from 'next/head'
import { RankingsData } from './api/rankings/hourly'
import { interpolate } from '../modules/interpolate'
import { last } from '../modules/last'
import { topCryptos } from '../modules/topCryptos'

// import useResizeObserver from 'use-resize-observer'

const margin = { top: 10, right: 20, bottom: 60, left: 50 }
const width = 1280 - margin.left - margin.right
const height = 960 - margin.top - margin.bottom
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

export default function Daily() {
  const [error, setError] = useState<null | string>(null)
  const [data, setData] = useState<null | ChartDataType>(null)

  useEffect(() => {
    if (isServer) return
    const params = new URLSearchParams(window.location.search.slice(1))
    const maxRankParam = parseInt(params.get('maxRank'), 10)
    const limitParam = parseInt(params.get('limit'), 10)
    const MAX_RANK = isNaN(maxRankParam) ? 500 : maxRankParam
    const LIMIT = isNaN(limitParam) ? 30 : limitParam

    // topCryptos
    //   .getRankings({ maxRank: MAX_RANK, limit: LIMIT })
    //   .then(
    //     ({
    //       rankingsByCrypto,
    //       deltasByCrypto,
    //       accelsByCrypto,
    //       totalDeltasByCrypto,
    //     }) => {},
    //   )
    fetch(`/api/rankings/daily?maxRank=${MAX_RANK}&limit=${LIMIT}`)
      .then((res) => {
        if (!res.ok) {
          throw new Error(`status: ${res.status}`)
        }
        return res.json()
      })
      .then((rankings: Array<RankingsData>) => {
        /**
         * DATA
         */
        type Crypto = {
          id: number
          name: string
          symbol: string
          quotes: Array<{
            rank: number
            price: number
            volume_24h: number
            percent_change_1h: number
            percent_change_24h: number
            percent_change_7d: number
            market_cap: number
            last_updated: Date
          }>
          totalDiff: {
            rank: number
            market_cap: number
            market_cap_pct: number
            volume: number
            duration: number
            avg_timestamp: Date
          } | null
          diffs: Array<{
            rank: number
            market_cap: number
            market_cap_pct: number
            volume: number
            duration: number
            avg_timestamp: Date
          }>
          diffs2: Array<{
            rank: number
            market_cap: number
            market_cap_from_start: number
            volume: number
            avg_timestamp: Date
          }>
        }
        const cryptosById: Record<number, Crypto> = {}
        rankings.forEach((snapshot) => {
          snapshot.data.forEach((crypto, rank) => {
            cryptosById[crypto.id] = cryptosById[crypto.id] ?? {
              id: crypto.id,
              name: crypto.name,
              symbol: crypto.symbol,
              totalDiff: null,
              quotes: [],
              diffs: [],
              diffs2: [],
            }

            const prevDate = last(cryptosById[crypto.id].quotes)
            if (
              prevDate != null &&
              prevDate.last_updated.valueOf() >
                new Date(crypto.quote.USD.last_updated).valueOf()
            ) {
              console.error(
                'DATE ORDER ERROR??',
                prevDate.last_updated,
                new Date(crypto.quote.USD.last_updated),
              )
            }

            cryptosById[crypto.id].quotes.push({
              ...crypto.quote.USD,
              last_updated: new Date(crypto.quote.USD.last_updated),
              rank: 0 - (rank + 1),
            })
          })
        })
        let cryptos = Object.values(cryptosById)

        // calculate diffs
        cryptos.forEach((crypto) => {
          let prevQuote: Crypto['quotes'][0] | null = null
          crypto.diffs = crypto.quotes.reduce<Crypto['diffs']>(
            (diffs, quote) => {
              if (prevQuote == null) {
                prevQuote = quote
                return diffs
              }

              const duration =
                quote.last_updated.valueOf() - prevQuote.last_updated.valueOf()
              diffs.push({
                rank: 0 - (quote.rank - prevQuote.rank),
                market_cap: quote.market_cap - prevQuote.market_cap,
                market_cap_pct:
                  (quote.market_cap - prevQuote.market_cap) /
                  prevQuote.market_cap,
                volume: quote.volume_24h - prevQuote.volume_24h,
                duration: duration,
                avg_timestamp: new Date(
                  prevQuote.last_updated.valueOf() + duration / 2,
                ),
              })

              return diffs
            },
            [],
          )
        })

        // calculate diffs2
        cryptos.forEach((crypto) => {
          let prevDiff: Crypto['diffs'][0] | null = null
          crypto.diffs2 = crypto.diffs.reduce((diffs2, diff) => {
            if (prevDiff == null) {
              prevDiff = diff
              return diffs2
            }

            const duration =
              diff.avg_timestamp.valueOf() - prevDiff.avg_timestamp.valueOf()
            diffs2.push({
              rank: 0 - (diff.rank - prevDiff.rank),
              market_cap: diff.market_cap - prevDiff.market_cap,
              volume: diff.volume - prevDiff.volume,
              duration: duration,
              avg_timestamp: new Date(
                prevDiff.avg_timestamp.valueOf() + duration / 2,
              ),
            })

            return diffs2
          }, [])
        })

        // calculate totalDiff
        cryptos.forEach((crypto) => {
          if (crypto.quotes.length < LIMIT * 0.6) {
            delete cryptosById[crypto.id]
            return
          }

          const lastQuote = last(crypto.quotes)
          if (lastQuote == null) {
            // console.log('missing last quote!', crypto)
            delete cryptosById[crypto.id]
            return
          }
          const firstQuote = crypto.quotes[0]
          if (lastQuote == firstQuote) {
            // console.log('only one quote!', crypto)
            delete cryptosById[crypto.id]
            return
          }

          const duration =
            lastQuote.last_updated.valueOf() - firstQuote.last_updated.valueOf()
          crypto.totalDiff = {
            rank: 0 - (lastQuote.rank - firstQuote.rank),
            market_cap: lastQuote.market_cap - firstQuote.market_cap,
            market_cap_pct:
              (lastQuote.market_cap - firstQuote.market_cap) /
              firstQuote.market_cap,
            volume: lastQuote.volume_24h - firstQuote.volume_24h,
            duration: duration,
            avg_timestamp: new Date(
              firstQuote.last_updated.valueOf() + duration / 2,
            ),
          }
        })
        // calculate maxTotalDiff
        const maxTotalDiff: {
          rank: number
          market_cap: number
          volume: number
          market_cap_pct: number
          // duration: number
          // avg_timestamp: Date
        } = {
          rank: d3.max(cryptos, (c) => c.totalDiff?.rank),
          market_cap: d3.max(cryptos, (c) => c.totalDiff?.market_cap),
          market_cap_pct: d3.max(cryptos, (c) => c.totalDiff?.market_cap_pct),
          volume: d3.max(cryptos, (c) => c.totalDiff?.volume),
        }
        const minTotalDiff: {
          rank: number
          market_cap: number
          market_cap_pct: number
          volume: number
          // duration: number
          // avg_timestamp: Date
        } = {
          rank: d3.min(cryptos, (c) => c.totalDiff?.rank),
          market_cap: d3.min(cryptos, (c) => c.totalDiff?.market_cap),
          market_cap_pct: d3.min(cryptos, (c) => c.totalDiff?.market_cap_pct),
          volume: d3.min(cryptos, (c) => c.totalDiff?.volume),
        }

        // get cryptos again without filtered out
        cryptos = Object.values(cryptosById)

        console.log('MAX/MIN', maxTotalDiff, minTotalDiff)
        console.log('CRYPTOS BY ID', cryptosById)
        /**
         * CHART
         */

        const mktCap = false
        const startNumber = 100

        const svg = d3
          .select('.chart')
          .append('svg')
          .attr('width', fullWidth)
          .attr('height', fullHeight)
          .call(responsivefy)
          .append('g')
          .attr('transform', `translate(${margin.left}, ${margin.top})`)

        // AXES
        const yScale = d3
          .scaleLinear()
          .domain(
            mktCap
              ? [
                  startNumber + startNumber * minTotalDiff.market_cap_pct,
                  startNumber * maxTotalDiff.market_cap_pct,
                ]
              : [0 - MAX_RANK, -1],
          )
          .range([height, 0])
          .nice()
        const yAxis = d3.axisLeft(yScale)
        svg.call(yAxis)

        const xScale = d3
          .scaleTime()
          .domain([
            d3.min(cryptos, (crypto) =>
              d3.min(crypto.quotes, (quote) => quote.last_updated),
            ),
            d3.max(cryptos, (crypto) =>
              d3.max(crypto.quotes, (quote) => quote.last_updated),
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
        const rankLine = d3
          .line<Crypto['quotes'][0]>()
          .x((i) => xScale(i.last_updated))
          .y((i) => yScale(i.rank))
        const mktCapGainLine = (diffs, c) => {
          let val = startNumber

          return d3
            .line<Crypto['diffs'][0]>()
            .x((i) => xScale(i.avg_timestamp))
            .y((i) => {
              if (val > 500) console.log(c.name)
              if (i.market_cap_pct > 0) {
                val *= i.market_cap_pct
              } else {
                val = val + val * i.market_cap_pct
              }

              return yScale(val)
            })(diffs)
        }
        svg
          .selectAll('.line')
          .data(cryptos)
          .enter()
          .append('path')
          .attr('class', 'line')
          .attr('d', (c) =>
            mktCap ? mktCapGainLine(c.diffs, c) : rankLine(c.quotes),
          )
          .style('stroke', (c) => {
            if (c.totalDiff.market_cap >= 0) {
              return '#00FF00'
              // return interpolateColor({
              //   start: new Color(255, 255, 255),
              //   end: new Color(0, 255, 0),
              //   steps: maxTotalDiff.market_cap,
              //   count: c.totalDiff.market_cap,
              // }).toHexCode()
            } else {
              return '#FF0000'
              // return interpolateColor({
              //   start: new Color(255, 255, 255),
              //   end: new Color(255, 0, 0),
              //   steps: Math.abs(minTotalDiff.market_cap),
              //   count: Math.abs(c.totalDiff.market_cap),
              // }).toHexCode()
            }
          })
          .style('stroke-width', (c) => {
            if (mktCap) return 1
            if (c.totalDiff.market_cap >= 0) {
              return interpolate({
                start: 0,
                end: 10,
                steps: maxTotalDiff.market_cap_pct,
                count: Math.min(
                  maxTotalDiff.market_cap_pct,
                  c.totalDiff.market_cap_pct,
                  // c.totalDiff.market_cap_pct * 2,
                ),
              })
            } else {
              return interpolate({
                start: 0,
                end: 10,
                steps: minTotalDiff.market_cap_pct, // 100 + 100 * minTotalDiff.market_cap_pct,
                count: c.totalDiff.market_cap_pct / 2, // 100 + 100 * c.totalDiff.market_cap_pct,
              })
            }
          })
          .style('opacity', (c) => {
            if (mktCap) return 1
            console.log('TOTAL', c.name, c.totalDiff)
            if (c.totalDiff.market_cap >= 0) {
              return (
                interpolate({
                  start: 0,
                  end: 100,
                  steps: maxTotalDiff.market_cap_pct,
                  count: Math.min(
                    maxTotalDiff.market_cap_pct,
                    c.totalDiff.market_cap_pct,
                    // c.totalDiff.market_cap_pct * 2,
                  ),
                }) / 100
              )
            } else {
              return (
                interpolate({
                  start: 0,
                  end: 100,
                  steps: minTotalDiff.market_cap_pct, // 100 + 100 * minTotalDiff.market_cap_pct,
                  count: c.totalDiff.market_cap_pct / 2, // 100 + 100 * c.totalDiff.market_cap_pct,
                }) / 100
              )
            }
          })
          .append('title')
          .text((c) => c.name)
      })
  }, [])

  return (
    <div className="container">
      <Head>
        <title>Top Crypto Rankings</title>
        <link rel="icon" href="/favicon.ico" />
      </Head>

      <div className="chart" />
      <style global jsx>{`
        .container {
          height: '100%';
          width: '100%';
        }
        .chart {
          background-color: lightgray;
          border: 1px solid black;
          min-height: 500px;
        }
        .line {
          stroke-width: 1px;
          fill: none;
        }
        .line:hover {
          stroke-width: 10px !important;
        }
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

function responsivefy(svg) {
  // get container + svg aspect ratio
  var container = d3.select(svg.node().parentNode),
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
  d3.select(window).on('resize.' + container.attr('id'), resize)
  // get width of container and resize svg to fit it
  function resize() {
    var targetWidth = parseInt(container.style('width'))
    svg.attr('width', targetWidth)
    svg.attr('height', Math.round(targetWidth / aspect))
  }
}
