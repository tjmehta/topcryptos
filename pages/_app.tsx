import '../styles/globals.css'
import React from 'react'

class ErrorBoundary extends React.Component<{ children: React.ReactNode }, { hasError: boolean; error?: any }>{
  constructor(props) {
    super(props)
    this.state = { hasError: false }
  }
  static getDerivedStateFromError(error) {
    return { hasError: true, error }
  }
  componentDidCatch(error, info) {
    // eslint-disable-next-line no-console
    console.error('Client ErrorBoundary caught', error, info)
  }
  render() {
    if (this.state.hasError) {
      return <div style={{ padding: 24 }}>Client error. See console for details.</div>
    }
    return this.props.children as any
  }
}

function MyApp({ Component, pageProps }) {
  return (
    <ErrorBoundary>
      <Component {...pageProps} />
    </ErrorBoundary>
  )
}

export default MyApp
