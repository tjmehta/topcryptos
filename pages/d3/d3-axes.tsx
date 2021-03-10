import * as d3 from 'd3'

import { useEffect } from 'react'

const margin = { top: 10, right: 20, bottom: 40, left: 40 }
const width = 400 - margin.left - margin.right
const height = 600 - margin.top - margin.bottom

export default function D3() {
  useEffect(() => {
    const svg = d3
      .select('.chart')
      .append('svg')
      .attr('width', width + margin.left + margin.right)
      .attr('height', height + margin.top + margin.bottom)

    svg.exit().remove()

    const g = svg
      .append('g')
      .attr('transform', `translate(${margin.left}, ${margin.top})`)

    g.append('rect')
      .attr('width', width)
      .attr('height', height)
      .style('fill', 'lightblue')
      .style('stroke', 'green')

    const yScale = d3.scaleLinear().domain([0, 100]).range([height, 0])
    const yAxis = d3.axisLeft(yScale).tickValues([5, 19, 43, 77])
    g.call(yAxis)

    const xScale = d3
      .scaleTime()
      .domain([new Date(2016, 0, 1, 6), new Date(2016, 0, 1, 9)])
      .range([0, width])
    const xAxis = d3
      .axisBottom(xScale)
      .ticks(5)
      .tickSizeInner(10)
      .tickSizeOuter(20)
      .tickPadding(15)
    g.append('g').attr('transform', `translate(0, ${height})`).call(xAxis)
  }, [])

  return (
    <div className="chart">
      <style global jsx>{`
        .chart {
          background-color: lightgray;
          border: 1px solid black;
          min-height: 425px;
          min-width: 625px;
        }
      `}</style>
    </div>
  )
}
