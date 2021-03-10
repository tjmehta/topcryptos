import { useEffect, useState } from 'react'

import Head from 'next/head'
import useResizeObserver from 'use-resize-observer'

export default function Hourly() {
  const [rankings, setRankings] = useState<{}>()
  const { ref, height = 320, width = 240 } = useResizeObserver()
  useEffect(() => {}, [])

  return (
    <div>
      <Head>
        <title>Hourly CryptoInsights</title>
        <link rel="icon" href="/favicon.ico" />
      </Head>

      <main ref={ref}>
        {/* <Plot
          data={[
            {
              x: [1, 2, 3],
              y: [2, 6, 3],
              type: 'scatter',
              mode: 'lines+markers',
              marker: { color: 'red' },
            },
          ]}
          layout={{ width, height, title: 'Hourly CryptoInsights' }}
        /> */}
      </main>
    </div>
  )
}
