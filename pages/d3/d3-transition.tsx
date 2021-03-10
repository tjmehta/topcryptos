import * as d3 from 'd3'

import { useEffect } from 'react'

export default function D3() {
  useEffect(() => {
    d3.select('.chart')
      .transition()
      .duration(1000)
      .delay(650)
      .ease(d3.easeBounceOut)
      .style('width', '400px')
      .transition()
      .duration(1000)
      .ease(d3.easeBounceOut)
      .style('height', '600px')
      .transition()
      .ease(d3.easeQuadOut)
      .duration(1000)
      .style('background-color', 'purple')
  }, [])

  return (
    <div className="chart">
      <style global jsx>{`
        .chart {
          background: lightgray;
          border: 1px solid black;
          width: 100px;
          height: 100px;
        }
      `}</style>
    </div>
  )
}
