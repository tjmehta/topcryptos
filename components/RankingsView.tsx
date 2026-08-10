import {
  Crypto,
  CryptoScoreResults,
  processRankings,
} from '@/modules/processRankings'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { percent, toneClass, trend } from '@/modules/format'
import { useCallback, useEffect, useMemo, useState } from 'react'

import { CoinCard } from '@/components/CoinCard'
import type { ExchangeMap } from '@/modules/exchangeMap'
import { ExchangeFilter } from '@/components/ExchangeFilter'
import Head from 'next/head'
import Link from 'next/link'
import { RankingsChart } from '@/components/RankingsChart'
import { RankingsTable } from '@/components/RankingsTable'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import { selectCoinIdsOnExchanges } from '@/modules/exchangeMap'
import { topCryptos } from '@/modules/topCryptos'
import { useMediaQuery } from '@/components/hooks/useMediaQuery'

const WINDOWS = [3, 4, 5, 6, 7, 10, 14, 21, 30, 45, 60, 90]

export type RankingsMode = 'daily' | 'hourly'

function startDateFor(mode: RankingsMode, amount: number): Date {
  const date = new Date()
  if (mode === 'daily') date.setDate(date.getDate() - (amount - 1))
  else date.setHours(date.getHours() - (amount - 1))
  return date
}

export function RankingsView({ mode }: { mode: RankingsMode }) {
  const unit = mode === 'daily' ? 'days' : 'hours'
  const isDesktop = useMediaQuery('(min-width: 768px)')
  const isWide = useMediaQuery('(min-width: 1280px)')

  const [error, setError] = useState<string | null>(null)
  const [rankings, setRankings] = useState<null | unknown[]>(null)
  const [results, setResults] = useState<null | CryptoScoreResults>(null)
  const [exchangeMap, setExchangeMap] = useState<null | ExchangeMap>(null)

  const [activeCryptoId, setActiveCryptoId] = useState<string | null>(null)
  const [highlightedIds, setHighlightedIds] = useState<Set<string>>(() => new Set())
  const [hiddenIds, setHiddenIds] = useState<Set<string>>(() => new Set())

  const [amount, setAmount] = useState<number>(mode === 'daily' ? 10 : 4)
  const [selectedExchanges, setSelectedExchanges] = useState<string[]>([])

  // --- data -----------------------------------------------------------------

  useEffect(() => {
    let cancelled = false
    const load =
      mode === 'daily'
        ? topCryptos.getDailyRankings({})
        : topCryptos.getHourlyRankings({})

    load
      .then((res) => !cancelled && setRankings(res))
      .catch((err) => {
        console.error('getRankings error', err)
        if (!cancelled) setError('Could not load rankings.')
      })

    return () => {
      cancelled = true
    }
  }, [mode])

  useEffect(() => {
    let cancelled = false
    fetch('/api/exchanges')
      .then((r) => (r.ok ? r.json() : null))
      .then((map) => !cancelled && map?.exchanges && setExchangeMap(map))
      .catch(() => {
        // The filter is additive — if the map is unavailable the page still
        // works, and ExchangeFilter disables itself on an empty list.
      })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (rankings == null) return
    let cancelled = false

    processRankings(rankings as any, startDateFor(mode, amount), hiddenIds)
      .then((res) => !cancelled && setResults(res))
      .catch((err) => {
        console.error('processRankings error', err)
        if (!cancelled) setError('Could not score rankings.')
      })

    return () => {
      cancelled = true
    }
  }, [rankings, amount, hiddenIds, mode])

  // --- derived --------------------------------------------------------------

  const allowedCoinIds = useMemo(
    () => (exchangeMap ? selectCoinIdsOnExchanges(exchangeMap, selectedExchanges) : null),
    [exchangeMap, selectedExchanges],
  )

  const visibleCryptos = useMemo(() => {
    if (results == null) return []
    if (allowedCoinIds == null) return results.cryptosSortedByScore
    return results.cryptosSortedByScore.filter((c) => allowedCoinIds.has(c.id))
  }, [results, allowedCoinIds])

  /** Highlighted coins float to the top so a pinned coin is never lost in 500 rows. */
  const rows = useMemo(() => {
    const list = visibleCryptos.slice()
    list.sort((a, b) => {
      const aPin = highlightedIds.has(a.id) ? 0 : 1
      const bPin = highlightedIds.has(b.id) ? 0 : 1
      if (aPin !== bPin) return aPin - bPin
      return a.rank - b.rank
    })
    return list
  }, [visibleCryptos, highlightedIds])

  const leader = visibleCryptos[0] ?? null

  const windowOptions = useMemo(() => {
    if (mode === 'daily') return WINDOWS
    const available = rankings?.length ?? 0
    const opts = WINDOWS.filter((w) => w < available)
    return opts.length > 0 ? opts : [Math.max(available, 1)]
  }, [mode, rankings])

  useEffect(() => {
    if (windowOptions.length > 0 && !windowOptions.includes(amount)) {
      setAmount(windowOptions[0])
    }
  }, [windowOptions, amount])

  // --- interactions ---------------------------------------------------------

  const toggleIn = (set: Set<string>, id: string) => {
    const next = new Set(set)
    next.has(id) ? next.delete(id) : next.add(id)
    return next
  }

  const toggleHighlight = useCallback((id: string) => {
    setHighlightedIds((prev) => toggleIn(prev, id))
  }, [])

  const toggleHidden = useCallback((id: string) => {
    setHiddenIds((prev) => toggleIn(prev, id))
    setHighlightedIds((prev) => {
      if (!prev.has(id)) return prev
      const next = new Set(prev)
      next.delete(id)
      return next
    })
  }, [])

  const title = `Top Performing Cryptocurrencies${mode === 'hourly' ? ' (Hourly)' : ''}`
  const filteredOut =
    results != null && allowedCoinIds != null
      ? results.cryptosSortedByScore.length - visibleCryptos.length
      : 0
  const loading = results == null && error == null

  return (
    <div className="min-h-full">
      <Head>
        <title>{`Top Cryptos — ${title}`}</title>
        <meta
          name="description"
          content="Which cryptocurrencies are climbing the market-cap ranks fastest, scored by price and rank momentum."
        />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="icon" href="/favicon.ico" />
      </Head>

      {/* Sticky, compact: on a phone this is the only chrome between the user
          and the data, and it must never eat vertical space. */}
      <header className="sticky top-0 z-30 border-b border-border/60 bg-background/80 backdrop-blur-md">
        <div className="mx-auto flex max-w-[1600px] items-center justify-between gap-3 px-4 py-2.5 sm:px-6">
          <Link href="/" className="flex min-w-0 items-center gap-2">
            <span aria-hidden className="text-lg leading-none">
              🔥
            </span>
            <span className="font-display truncate text-xl leading-none tracking-tight sm:text-2xl">
              Top Cryptos
            </span>
          </Link>

          <nav
            aria-label="Ranking window"
            className="flex shrink-0 items-center rounded-full border border-border/70 bg-secondary/50 p-0.5 text-xs"
          >
            {(
              [
                { href: '/', label: 'Daily', active: mode === 'daily' },
                { href: '/hourly', label: 'Hourly', active: mode === 'hourly' },
              ] as const
            ).map((tab) => (
              <Link
                key={tab.href}
                href={tab.href}
                aria-current={tab.active ? 'page' : undefined}
                className={cn(
                  'rounded-full px-3 py-1 font-medium transition-colors',
                  tab.active
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:text-foreground',
                )}
              >
                {tab.label}
              </Link>
            ))}
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-[1600px] px-4 pb-16 sm:px-6">
        {/* Thesis line: says what the page is for, and carries the two controls
            inline so the sentence reads as the query being run. */}
        <div className="flex flex-wrap items-center gap-x-2 gap-y-2 pt-5 pb-4 text-base sm:text-lg">
          <span className="text-muted-foreground">Climbing fastest over</span>
          <Select
            value={String(amount)}
            onValueChange={(v) => {
              const parsed = parseInt(v, 10)
              if (!Number.isNaN(parsed)) setAmount(parsed)
            }}
          >
            <SelectTrigger
              aria-label={`Window: ${amount} ${unit}`}
              className="h-8 w-auto gap-1.5 rounded-full border-border/70 bg-secondary/50 px-3 text-sm"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {windowOptions.map((w) => (
                <SelectItem key={w} value={String(w)}>
                  {`${w} ${unit}`}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <span className="text-muted-foreground">on</span>
          <ExchangeFilter
            exchanges={exchangeMap?.exchanges ?? []}
            selected={selectedExchanges}
            onChange={setSelectedExchanges}
          />
        </div>

        {error && (
          <div
            role="alert"
            className="mb-6 rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm"
          >
            {error} Reload the page to try again.
          </div>
        )}

        {/* The signature moment: the single coin this whole page exists to find. */}
        {leader && (
          <div className="mb-5 flex items-baseline gap-3 rounded-lg border border-border/50 bg-card/40 px-4 py-3">
            <span className="text-xs tracking-wide text-muted-foreground uppercase">
              Leader
            </span>
            <span className="font-display truncate text-2xl leading-none">
              {leader.name}
            </span>
            <span
              className={cn(
                'figure ml-auto shrink-0 text-lg font-medium',
                toneClass(leader.total?.pricePct),
              )}
            >
              <span aria-hidden className="mr-1 text-[0.7em]">
                {trend(leader.total?.pricePct)}
              </span>
              {percent(leader.total?.pricePct)}
            </span>
          </div>
        )}

        {/* The table is given the larger share: it is the column that gains
            information with width (each ~100px brings back a real metric),
            whereas the chart is legible well below half the page. */}
        <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)]">
          <section
            aria-label="Rank over time"
            // Grid items stretch to the row height by default, so without
            // items-start this panel's border/background stretched down to
            // match the much-taller scrolling table next to it — a big empty
            // "mat" below the chart and legend.
            className="panel rounded-xl border border-border/50 p-3 shadow-2xl sm:p-5"
          >
            {loading ? (
              <Skeleton className="h-[300px] w-full rounded-lg sm:h-[380px]" />
            ) : results ? (
              <RankingsChart
                cryptos={visibleCryptos}
                minMaxes={results.minMaxes}
                points={amount}
                // 500 hairlines is texture, not information, on a phone.
                maxSeries={isWide ? undefined : isDesktop ? 120 : 30}
                highlightedIds={highlightedIds}
                hiddenIds={hiddenIds}
                activeCryptoId={activeCryptoId}
                onToggleHighlight={toggleHighlight}
                onHover={setActiveCryptoId}
              />
            ) : null}

            {/* On desktop this panel no longer stretches to match the taller
                table (see items-start above), which freed up real space here
                — used for the explainer a cold visitor otherwise doesn't get:
                nothing on the page says what "score" means or what a line's
                weight encodes. */}
            <div className="mt-5 border-t border-border/50 pt-4 text-sm text-muted-foreground">
              <p>
                <span className="text-foreground font-medium">Score</span> ranks coins by
                how fast their price, market cap, and rank are climbing — not just today's
                price change.
              </p>
              <ul className="mt-2 space-y-1">
                <li>Each line traces one coin's market-cap rank over the window.</li>
                <li>Thicker, brighter lines have a higher score.</li>
                <li>
                  <span className="text-[color:var(--gain)]">Green</span> means price is up
                  over the window, <span className="text-[color:var(--loss)]">red</span>{' '}
                  means down.
                </li>
                <li>Click a line or its star to highlight a coin so it never gets lost.</li>
              </ul>
            </div>
          </section>

          <section aria-label="Rankings" className="min-w-0">
            <div className="flex items-baseline justify-between gap-3 pb-2 text-xs text-muted-foreground">
              <span>
                {loading
                  ? 'Scoring…'
                  : `${visibleCryptos.length} coin${visibleCryptos.length === 1 ? '' : 's'}`}
                {filteredOut > 0 && ` · ${filteredOut} filtered out`}
              </span>
              {highlightedIds.size > 0 && (
                <button
                  onClick={() => setHighlightedIds(new Set())}
                  className="underline underline-offset-4 hover:text-foreground"
                >
                  Clear {highlightedIds.size} highlighted
                </button>
              )}
            </div>

            {loading ? (
              <div className="space-y-2">
                {Array.from({ length: 8 }).map((_, i) => (
                  <Skeleton key={i} className="h-16 w-full rounded-lg md:h-10" />
                ))}
              </div>
            ) : rows.length === 0 ? (
              <div className="rounded-xl border border-dashed border-border/70 px-6 py-16 text-center">
                <p className="font-medium">No coins match this filter</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Try selecting more exchanges, or clear the filter to see all
                  {results ? ` ${results.cryptosSortedByScore.length}` : ''} coins.
                </p>
                {selectedExchanges.length > 0 && (
                  <button
                    onClick={() => setSelectedExchanges([])}
                    className="mt-4 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground"
                  >
                    Clear exchange filter
                  </button>
                )}
              </div>
            ) : isDesktop ? (
              // shadcn's Table already wraps <table> in its own overflow-x-auto
              // div for horizontal scroll. Putting the vertical scroll/rounding
              // on a *second*, outer div made that inner div the sticky
              // <thead>'s containing block instead (nearest scroll-container
              // wins) — the header stopped sticking to the intended box. Both
              // axes need to live on the one div, via containerClassName.
              <RankingsTable
                data={rows}
                highlightedIds={highlightedIds}
                hiddenIds={hiddenIds}
                onToggleHighlight={toggleHighlight}
                onToggleHidden={toggleHidden}
                onHover={setActiveCryptoId}
                containerClassName="panel max-h-[70vh] overflow-y-auto rounded-xl border border-border/50 shadow-2xl"
              />
            ) : (
              <ul className="space-y-2">
                {rows.slice(0, 100).map((crypto: Crypto) => (
                  <li key={crypto.id}>
                    <CoinCard
                      crypto={crypto}
                      highlighted={highlightedIds.has(crypto.id)}
                      hidden={hiddenIds.has(crypto.id)}
                      onToggleHighlight={toggleHighlight}
                      onToggleHidden={toggleHidden}
                    />
                  </li>
                ))}
                {rows.length > 100 && (
                  <li className="py-4 text-center text-xs text-muted-foreground">
                    Showing the top 100 of {rows.length}. Narrow the window or
                    filter by exchange to see further down.
                  </li>
                )}
              </ul>
            )}
          </section>
        </div>
      </main>
    </div>
  )
}
