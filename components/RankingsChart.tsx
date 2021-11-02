import {
  CryptoScoreResults,
  MAX_SCORE,
  NAN_SCORE,
  Quote,
} from '../modules/processRankings'
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
import { interpolate } from '../modules/interpolate'

export function RankingsChart({
  className,
  cryptoScoreResults,
  days,
  selectedCryptoIds,
  disabledCryptoIds,
  activeCryptoId,
  onClick,
  onDoubleClick,
  onMouseOver,
}: {
  className: string
  days: number
  cryptoScoreResults: CryptoScoreResults
  selectedCryptoIds: Set<string>
  disabledCryptoIds: Set<string>
  activeCryptoId: string
  onClick: (id: string) => unknown
  onDoubleClick: (id: string) => unknown
  onMouseOver: (id: string) => unknown
}) {
  const { cryptosSortedByScore, cryptosById, minMaxes } = cryptoScoreResults
  return (
    <D3Chart
      className={className}
      renderKey={`${days.toString()}:${activeCryptoId}:${[
        ...selectedCryptoIds,
      ].join(',')}:${[...disabledCryptoIds].join(',')}`}
    >
      {(svg, height, width) => {
        // AXES
        const yScale = scaleLinear()
          .domain([
            minMaxes.rankByMarketCapMinMax.max,
            minMaxes.rankByMarketCapMinMax.min,
          ])
          .range([height, 0])
          .nice()
        const yAxis = axisLeft(yScale)
        svg.append('g').attr('class', 'axisLeft').call(yAxis)

        const xScale = scaleTime()
          .domain([minMaxes.dateMinMax.min, minMaxes.dateMinMax.max])
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
        const createLine = (arr: Quote[]) =>
          line<Quote>()
            .x((item) => xScale(item.date))
            .y((item) => yScale(item.rankByMarketCap))(arr.slice(0 - days))

        svg
          .selectAll('.line')
          .data(cryptosSortedByScore)
          .enter()
          .append('path')
          .attr('class', 'line')
          .attr('data-crypto-id', (crypto) => crypto.id)
          .attr('d', (crypto) => createLine(crypto.quotes))
          .on('dblclick', (evt) => {
            // right click
            onDoubleClick(evt.currentTarget.dataset.cryptoId)
          })
          .on('click', (evt) => {
            onClick(evt.currentTarget.dataset.cryptoId)
          })
          .on('onmouseover', (evt) =>
            onMouseOver(evt.currentTarget.dataset.cryptoId),
          )
          .style('cursor', 'pointer')
          .style('stoke-linecap', 'round')
          .style('stoke-linejoin', 'round')
          .style('filter', (crypto) => {
            const isSelected = selectedCryptoIds.has(crypto.id)
            return isSelected ? 'drop-shadow(0px 0px 3px pink)' : 'none'
          })
          .style('stroke', (crypto) => {
            if (selectedCryptoIds.has(crypto.id)) return 'lightyellow'

            if (crypto.total.pricePct >= 0) {
              return '#00b300'
            } else {
              return '#b30000'
            }
          })
          .style('stroke-width', (crypto) => {
            const score = crypto.score

            if (disabledCryptoIds.has(crypto.id)) return 0
            if (score === NAN_SCORE) return 0

            if (score >= 0) {
              return interpolate({
                start: 0,
                end: 20,
                steps: minMaxes.scoreMinMax.max,
                count: score,
              })
            } else {
              return interpolate({
                start: 0,
                end: 10,
                steps: Math.abs(minMaxes.scoreMinMax.min),
                count: Math.abs(score),
              })
            }
          })
          .style('opacity', (crypto) => {
            const score = crypto.score
            
            if (selectedCryptoIds.has(crypto.id)) return 900
            if (disabledCryptoIds.has(crypto.id)) return 0
            if (score === NAN_SCORE) return 0

            if (score >= 0) {
              return (
                interpolate({
                  start: 0,
                  end: 900,
                  steps: minMaxes.scoreMinMax.max,
                  count: score,
                }) / MAX_SCORE
              )
            } else {
              return (
                interpolate({
                  start: 0,
                  end: 450,
                  steps: Math.abs(minMaxes.scoreMinMax.min),
                  count: Math.abs(score),
                }) / MAX_SCORE
              )
            }
          })
          .append('title')
          .text((crypto) => crypto.quotes[0].name)
      }}
    </D3Chart>
  )
}
