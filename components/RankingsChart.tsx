import {
  Crypto,
  CryptosMinMaxes,
  MAX_SCORE,
  NAN_SCORE,
  Quote,
} from '@/modules/processRankings'
import { axisBottom, axisLeft, line, scaleLinear, scaleTime } from 'd3'

import { D3Chart } from '@/components/D3Chart'
import { interpolate } from '@/modules/interpolate'

const GAIN = 'var(--chart-1)'
const LOSS = 'var(--chart-2)'

export function RankingsChart({
  cryptos,
  minMaxes,
  points,
  selectedCryptoIds,
  disabledCryptoIds,
  activeCryptoId,
  onClick,
  onDoubleClick,
  onMouseOver,
}: {
  cryptos: Crypto[]
  minMaxes: CryptosMinMaxes
  /** how many trailing quotes to draw per coin */
  points: number
  selectedCryptoIds: Set<string>
  disabledCryptoIds: Set<string>
  activeCryptoId: string | null
  onClick: (id: string) => unknown
  onDoubleClick: (id: string) => unknown
  onMouseOver: (id: string | null) => unknown
}) {
  const renderKey = [
    points,
    cryptos.length,
    activeCryptoId,
    [...selectedCryptoIds].join(','),
    [...disabledCryptoIds].join(','),
  ].join(':')

  return (
    <D3Chart renderKey={renderKey} aspect={0.85}>
      {(svg, height, width) => {
        const yScale = scaleLinear()
          .domain([
            minMaxes.rankByMarketCapMinMax.max,
            minMaxes.rankByMarketCapMinMax.min,
          ])
          .range([height, 0])
          .nice()

        const xScale = scaleTime()
          .domain([minMaxes.dateMinMax.min, minMaxes.dateMinMax.max])
          .range([0, width])

        svg.append('g').attr('class', 'axisLeft').call(axisLeft(yScale))

        svg
          .append('g')
          .attr('class', 'axisBottom')
          .attr('transform', `translate(0, ${height})`)
          .call(axisBottom(xScale).ticks(5))
          .selectAll('text')
          .style('text-anchor', 'end')
          .attr('transform', 'rotate(-45)')

        const drawLine = line<Quote>()
          .x((q) => xScale(q.date))
          .y((q) => yScale(q.rankByMarketCap))

        /**
         * Score drives both stroke width and opacity, so the strongest movers
         * read as bright thick lines and the rest fade into the background.
         * `interpolate` maps a score onto that range; a bound of 0 would make it
         * divide by zero, so fall back to a hairline rather than NaN (which the
         * browser silently drops, making the line vanish).
         */
        const weight = (score: number, max: number, cap: number) => {
          if (!Number.isFinite(score) || !Number.isFinite(max) || max === 0) {
            return 0.5
          }
          return interpolate({ start: 0, end: cap, steps: max, count: score })
        }

        svg
          .selectAll('.rankings-line')
          .data(cryptos, (c: any) => c.id)
          .enter()
          .append('path')
          .attr('class', (c) =>
            c.id === activeCryptoId ? 'rankings-line is-active' : 'rankings-line',
          )
          .attr('data-crypto-id', (c) => c.id)
          .attr('d', (c) => drawLine(c.quotes.slice(-points)))
          .style('stroke', (c) =>
            selectedCryptoIds.has(c.id)
              ? '#ffe066'
              : (c.total?.pricePct ?? 0) >= 0
              ? GAIN
              : LOSS,
          )
          .style('filter', (c) =>
            selectedCryptoIds.has(c.id)
              ? 'drop-shadow(0 0 4px rgb(255 224 102 / 0.7))'
              : 'none',
          )
          .style('stroke-width', (c) => {
            if (disabledCryptoIds.has(c.id) || c.score === NAN_SCORE) return 0
            return c.score >= 0
              ? weight(c.score, minMaxes.scoreMinMax.max, 20)
              : weight(
                  Math.abs(c.score),
                  Math.abs(minMaxes.scoreMinMax.min),
                  10,
                )
          })
          .style('opacity', (c) => {
            if (disabledCryptoIds.has(c.id) || c.score === NAN_SCORE) return 0
            if (selectedCryptoIds.has(c.id)) return 1
            const raw =
              c.score >= 0
                ? weight(c.score, minMaxes.scoreMinMax.max, 900)
                : weight(Math.abs(c.score), Math.abs(minMaxes.scoreMinMax.min), 450)
            return Math.min(1, raw / MAX_SCORE)
          })
          .on('click', (evt: any) => onClick(evt.currentTarget.dataset.cryptoId))
          .on('dblclick', (evt: any) =>
            onDoubleClick(evt.currentTarget.dataset.cryptoId),
          )
          // The original registered 'onmouseover', which is not a DOM event
          // name, so hover highlighting never fired.
          .on('mouseover', (evt: any) =>
            onMouseOver(evt.currentTarget.dataset.cryptoId),
          )
          .on('mouseout', () => onMouseOver(null))
          .append('title')
          .text((c) => `${c.name} (${c.symbol})`)
      }}
    </D3Chart>
  )
}
