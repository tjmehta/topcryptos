import * as d3 from 'd3'

import { useEffect } from 'react'

const margin = { top: 10, right: 20, bottom: 60, left: 40 }
const width = 400 - margin.left - margin.right
const height = 400 - margin.top - margin.bottom
const fullWidth = width + margin.left + margin.right
const fullHeight = height + margin.top + margin.bottom

export default function D3() {
  const data = [
    { score: 63, subject: 'Mathematics' },
    { score: 82, subject: 'Geography' },
    { score: 74, subject: 'Spelling' },
    { score: 97, subject: 'Reading' },
    { score: 52, subject: 'Science' },
    { score: 52, subject: 'FF' },
    { score: 52, subject: 'SS' },
    { score: 52, subject: 'AA' },
  ]

  useEffect(() => {
    const svg = d3
      .select('.chart')
      .append('svg')
      .attr('width', fullWidth)
      .attr('height', fullHeight)
      .call(responsivefy)
      .append('g')
      .attr('transform', `translate(${margin.left}, ${margin.top})`)

    // axes
    const yScale = d3.scaleLinear().domain([0, 100]).range([height, 0])
    const yAxis = d3.axisLeft(yScale)
    svg.call(yAxis)

    const xScale = d3
      .scaleBand()
      .padding(0.2)
      .domain(data.map((i) => i.subject))
      .range([0, width])
    const xAxis = d3
      .axisBottom(xScale)
      .ticks(5)
      .tickSizeInner(10)
      .tickSizeOuter(20)
      .tickPadding(15)
    svg
      .append('g')
      .attr('transform', `translate(0, ${height})`)
      .call(xAxis)
      .selectAll('text')
      .style('text-anchor', 'end')
      .attr('transform', 'rotate(-45)')

    svg
      .selectAll('rect')
      .data(data)
      .enter()
      .append('rect')
      .attr('x', (d) => xScale(d.subject))
      .attr('y', (d) => yScale(d.score))
      .attr('width', (d) => xScale.bandwidth())
      .attr('height', (d) => height - yScale(d.score))
  }, [])

  return (
    <div className="chart">
      <style global jsx>{`
        .chart {
          background-color: lightgray;
          border: 1px solid black;
          // height: 100%;
        }
        rect {
          fill: steelblue;
        }
        rect:hover {
          fill: turquoise;
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
