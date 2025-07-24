import dynamic from 'next/dynamic'

// Dynamically import the main component with SSR disabled
const IndexPageComponent = dynamic(() => import('../components/IndexPageComponent'), {
  ssr: false,
  loading: () => <div>Loading...</div>
})

export default function Home() {
  return <IndexPageComponent />
}
