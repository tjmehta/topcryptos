import * as d3 from 'd3'

import { useEffect } from 'react'

export default function D3() {
  useEffect(() => {
    const scores = [
      { name: 'Alice', score: 96 },
      { name: 'Billy', score: 83 },
      { name: 'Cindy', score: 91 },
      { name: 'David', score: 96 },
      { name: 'Emily', score: 88 },
    ]

    function scaleBar(selection, scale) {
      selection.style('transform', `scaleX(${scale})`)
    }
    function setFill(selection, color) {
      selection.style('fill', color)
    }
    function fade(selection, opacity) {
      selection.style('fill-opacity', opacity)
    }

    // initial dom
    const bar = d3
      .select<HTMLDivElement, void>('.chart')
      .append<SVGElement>('svg')
      .attr('width', 225)
      .attr('height', 300)
      .selectAll<SVGGElement, void>('g')
      .data(scores)
      .enter()
      .append<SVGGElement>('g')
      .attr('transform', (d, i) => `translate(0, ${i * 33})`)
    bar
      .append('rect')
      .style('width', (d) => d.score)
      .attr('class', 'bar')
      .on('mouseover', function (e) {
        d3.select(this).call(scaleBar, 2).call(setFill, 'orange')
        d3.select(e.target.parentElement.parentElement)
          .selectAll('rect')
          .filter(':not(:hover)')
          .call(fade, 0.5)
      })
      .on('mouseout', function (e) {
        d3.select(this).call(scaleBar, 1).call(setFill, 'lightgreen')
        d3.select(e.target.parentElement.parentElement)
          .selectAll('rect')
          .call(fade, 1)
      })
    bar
      .append('text')
      .attr('y', 20)
      .text((d) => d.name)
  }, [])

  return (
    <div className="chart">
      <style global jsx>{`
        .chart {
          background-color: lightgray;
          border: 1px solid black;
          min-height: 320px;
          min-width: 200px;
        }
        .bar {
          height: 30px;
          color: green;
          fill: lightgreen;
          stroke: black;
          stroke-width: 1;
        }
        .bar-active {
          fill: lightblue;
        }
      `}</style>
    </div>
  )
}
