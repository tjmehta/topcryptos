import dynamic from 'next/dynamic'
import Head from 'next/head'

// Dynamically import the main component with SSR disabled
const IndexPageContent = dynamic(() => import('../components/IndexPageContent'), {
  ssr: false,
  loading: () => (
    <div className="text-gray-200" style={{ height: '100%', fontFamily: 'Helvetica' }}>
      <Head>
        <title>Top Cryptos - Top Performing Cryptocurrencies</title>
        <link rel="icon" href="/favicon.ico" />
      </Head>
      <div className="container mx-auto">
        <h1 className="logo font-bold pt-5 pb-10 text-4xl md:pt-6 md:pb-12 md:text-5xl lg:pt-10 lg:pb-20 lg:text-6xl">
          Top Cryptos
        </h1>
        <div style={{ textAlign: 'center', padding: '200px' }}>Loading...</div>
      </div>
    </div>
  )
})

export default function Home() {
  return <IndexPageContent />
}
