import {
  axisBottom,
  axisLeft,
  line,
  max,
  min,
  scaleLinear,
  scaleTime,
} from 'd3'

import { D3Chart } from './D3Chart'
import { NAN_SCORE } from '../pages'
import { RankingsResult } from '../modules/topCryptos'
import { interpolate } from '../modules/interpolate'

export type ResultsByCryptoId = Record<
  number,
  {
    id: number
    name: string
    symbol: string
    slug: string
    start: RankingsResult['totalDeltasByCrypto'][0]['start']
    end: RankingsResult['totalDeltasByCrypto'][0]['end']
    totalPricePct: number
    totalMarketCapDeltaPct: number
    totalMarketRankDelta: number
    pricePctAccelsSum: number
    mktRankAccelsSum: number
    score: number
    score_rank: number
  }
>

export function RankingsChart({
  data,
  className,
  maxRank,
  maxScore,
  minScore,
  selectedRows,
  resultsByCryptoId,
  onClick,
}: {
  data: RankingsResult & { key: string }
  className: string
  maxRank: number
  maxScore: number
  minScore: number
  resultsByCryptoId: ResultsByCryptoId
  selectedRows: { [id: string]: boolean }
  onClick: (id: number) => unknown
}) {
  return (
    <D3Chart
      className={className}
      renderKey={data.key + ':::' + Object.keys(selectedRows).sort().join(':')}
    >
      {(svg, height, width) => {
        const { totalDeltasByCryptoId, rankingsByCrypto } = data

        // AXES
        const yScale = scaleLinear()
          .domain([maxRank, 1])
          .range([height, 0])
          .nice()
        const yAxis = axisLeft(yScale)
        svg.append('g').attr('class', 'axisLeft').call(yAxis)

        const xScale = scaleTime()
          .domain([
            min(rankingsByCrypto, (arr) =>
              min(arr, (item) => item.last_updated),
            ),
            max(rankingsByCrypto, (arr) =>
              max(arr, (item) => item.last_updated),
            ),
          ])
          .range([0, width])
        const xAxis = axisBottom(xScale).ticks(5)
        svg
          .append('g')
          .attr('class', 'axisBottom')
          .attr('transform', `translate(0, ${height})`)
          .call(xAxis)
          .selectAll('text')
          .style('text-anchor', 'end')
          .attr('transform', 'rotate(-45)')

        // LINES
        type Ranking = typeof rankingsByCrypto[0][0]
        const createLine = (arr: Ranking[], index: number) =>
          line<Ranking>()
            .x((item) => xScale(item.last_updated))
            .y((item) => yScale(item.mkt_rank))(arr)

        svg
          .selectAll('.line')
          .data(
            rankingsByCrypto,
            // .filter((rankings) => {
            //   // if (Object.keys(selectedRows).length === 0) return true
            //   // const cryptoId = rankings[0].id
            //   // return selectedRows[cryptoId]
            // }),
          )
          .enter()
          .append('path')
          .attr('class', 'line')
          .attr('data-crypto-id', (arr) => arr[0].id)
          .attr('d', (arr, index) => createLine(arr, index))
          .on('click', (evt) => onClick(evt.currentTarget.dataset.cryptoId))
          .style('cursor', 'pointer')
          .style('stoke-linecap', 'round')
          .style('stoke-linejoin', 'round')
          .style('filter', (arr, index) => {
            if (Object.keys(selectedRows).length === 0) return true
            const cryptoId = arr[0].id
            const isSelected = selectedRows[cryptoId]
            return isSelected ? 'drop-shadow(0px 0px 3px pink)' : 'none'
          })
          .style('stroke', (arr, index) => {
            const cryptoId = arr[0].id
            const totalDelta = totalDeltasByCryptoId[cryptoId]

            if (Object.keys(selectedRows).length > 0) {
              const isSelected = selectedRows[cryptoId]
              if (isSelected) return 'lightyellow'
            }

            if (totalDelta.price_delta_pct >= 0) {
              return '#00b300'
            } else {
              return '#b30000'
            }
          })
          .style('stroke-width', (arr, index) => {
            const cryptoId = arr[0].id
            const totalDelta = totalDeltasByCryptoId[cryptoId]
            const result = resultsByCryptoId[totalDelta.id]

            if (result.score === NAN_SCORE) return 0

            if (result.score >= 0) {
              return interpolate({
                start: 0,
                end: 20,
                steps: maxScore,
                count: result.score,
              })
            } else {
              return interpolate({
                start: 0,
                end: 10,
                steps: Math.abs(minScore),
                count: Math.abs(result.score),
              })
            }
          })
          .style('opacity', (arr, index) => {
            const cryptoId = arr[0].id
            const totalDelta = totalDeltasByCryptoId[cryptoId]
            const result = resultsByCryptoId[totalDelta.id]

            if (result.score === NAN_SCORE) return 0

            if (totalDelta.price_delta_pct >= 0) {
              return (
                interpolate({
                  start: 0,
                  end: 900,
                  steps: maxScore,
                  count: result.score,
                }) / 1000
              )
            } else {
              return (
                interpolate({
                  start: 0,
                  end: 450,
                  steps: Math.abs(minScore),
                  count: Math.abs(result.score),
                }) / 1000
              )
            }
          })
          .append('title')
          .text((deltas) => deltas[0].name)
      }}
    </D3Chart>
  )
}
