import '../styles/globals.css'

import { Instrument_Serif, Inter, JetBrains_Mono } from 'next/font/google'

import type { AppProps } from 'next/app'
import React from 'react'
import { TooltipProvider } from '@/components/ui/tooltip'

/*
 * Three roles, deliberately contrasted:
 *   display — Instrument Serif, editorial and high-contrast. Used only for the
 *             wordmark and the one headline figure, so it stays an event.
 *   body    — Inter, for interface text that should disappear.
 *   mono    — JetBrains Mono for every numeral. Ranks, scores and percentages
 *             are read by scanning down a column, which needs tabular figures.
 */
const display = Instrument_Serif({
  weight: '400',
  subsets: ['latin'],
  variable: '--font-display',
  display: 'swap',
})

const body = Inter({
  subsets: ['latin'],
  variable: '--font-body',
  display: 'swap',
})

const mono = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-mono',
  display: 'swap',
})

class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props)
    this.state = { hasError: false }
  }

  static getDerivedStateFromError() {
    return { hasError: true }
  }

  componentDidCatch(error: unknown, info: unknown) {
    console.error('Client ErrorBoundary caught', error, info)
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="mx-auto max-w-md px-6 py-24 text-center">
          <h1 className="font-display text-3xl">Something broke</h1>
          <p className="mt-3 text-sm text-muted-foreground">
            The rankings failed to render. Reload to try again — details are in
            the browser console.
          </p>
          <button
            onClick={() => location.reload()}
            className="mt-6 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
          >
            Reload
          </button>
        </div>
      )
    }
    return this.props.children
  }
}

export default function MyApp({ Component, pageProps }: AppProps) {
  return (
    <div
      className={`${display.variable} ${body.variable} ${mono.variable} min-h-full`}
    >
      <TooltipProvider delayDuration={200}>
        <ErrorBoundary>
          <Component {...pageProps} />
        </ErrorBoundary>
      </TooltipProvider>
    </div>
  )
}
