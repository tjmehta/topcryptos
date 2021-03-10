import * as d3 from 'd3'

import { Fragment, useEffect } from 'react'

// const t =
//   typeof window !== 'undefined'
//     ?
//     : null

export default function D3() {
  useEffect(() => {}, [])

  function handleClick() {
    const t = d3.transition().call(configure, 100, 1000)

    d3.selectAll('.chart').transition(t).style('width', '400px')

    d3.select('.a').transition(t).style('background-color', 'orange')

    d3.select('.b').transition(t).style('background-color', 'blue')
  }
  function handleClick2() {
    d3.selectAll('.chart')
      .transition()
      .call(configure, 100, 1000)
      .style('width', '400px')

    // d3.select('.a')
    //   .transition()
    //   .call(configure, 1000, 1000)
    //   .style('background-color', 'orange')

    // d3.select('.b')
    //   .transition()
    //   .call(configure, 1000, 1000)
    //   .style('background-color', 'blue')
  }

  return (
    <Fragment>
      <div className="chart a"></div>
      <div className="chart b"></div>
      <button onClick={handleClick}>Go</button>
      <button onClick={handleClick2}>Go2</button>
      <style global jsx>{`
        .chart {
          background: lightgray;
          border: 1px solid black;
          width: 50px;
          height: 50px;
          margin-bottom: 1em;
        }
      `}</style>
    </Fragment>
  )
}

function configure(t, delay, duration) {
  return t.delay(delay).duration(duration)
}
