import dynamic from 'next/dynamic'

// Dynamically import the main component with SSR disabled
const HourlyPageComponent = dynamic(() => import('../components/HourlyPageComponent'), {
  ssr: false,
  loading: () => <div>Loading...</div>
})

export default function Hourly() {
  return <HourlyPageComponent />
}
