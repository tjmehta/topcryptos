import {
  Crypto,
  CryptoScoreResults,
  NAN_SCORE,
  type RankingAlgorithm,
  processRankings,
} from '@/modules/processRankings'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { percent, toneClass, trend } from '@/modules/format'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { CoinCard } from '@/components/CoinCard'
import { CoinOutlook } from '@/components/CoinOutlook'
import { Button } from '@/components/ui/button'
import { ShareButton } from '@/components/ShareButton'
import type { SortingState } from '@tanstack/react-table'
import { useRouter } from 'next/router'
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
import { getRankingWindow } from '@/modules/rankingWindow'
import type { RankingsResponse } from '@/modules/uiTypes'
import { useMediaQuery } from '@/components/hooks/useMediaQuery'

export const DAILY_WINDOWS = [3, 4, 5, 6, 7, 10, 14, 21, 30, 45, 60, 90]
export const HOURLY_WINDOWS = [3, 6, 9, 12, 18, 24]
export const DEFAULT_WINDOW = { daily: 10, hourly: 6 } as const

export type RankingsMode = 'daily' | 'hourly'

export const ALGORITHMS = {
  classic: {
    label: 'Classic',
    description: 'Price momentum, acceleration, and improving market-cap rank.',
  },
  momentum: {
    label: 'Momentum',
    description: 'Price return from the start to the end of this window.',
  },
  'trend-quality': {
    label: 'Trend quality',
    description: 'Direction and consistency of the log-price trend.',
  },
  cumulative: {
    label: 'Cumulative',
    description: 'Rewards earlier gains that hold through this window.',
  },
  hybrid: {
    label: 'Hybrid',
    description: '50% Momentum + 50% Cumulative, normalized across eligible coins.',
  },
} satisfies Record<RankingAlgorithm, { label: string; description: string }>

export function parseAlgorithm(v: string | string[] | undefined): RankingAlgorithm {
  const value = first(v)
  return value != null && Object.hasOwn(ALGORITHMS, value) ? value as RankingAlgorithm : 'classic'
}

/**
 * Query param carrying the window, per mode. Kept distinct (`d` vs `h`) so a
 * daily link pasted onto /hourly can't be misread as 30 hours.
 */
export const WINDOW_PARAM = { daily: 'd', hourly: 'h' } as const

const SORTABLE = new Set([
  'rank',
  'name',
  'pricePct',
  'score',
  'marketCap',
  'price',
  'marketCapPct',
  'rankDelta',
])

function first(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v
}

function parseList(v: string | string[] | undefined, max = 50): string[] {
  const raw = first(v)
  if (!raw) return []
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, max)
}

export function parseWindow(mode: RankingsMode, v: string | string[] | undefined): number {
  const n = parseInt(first(v) ?? '', 10)
  const options = mode === 'daily' ? DAILY_WINDOWS : HOURLY_WINDOWS
  return options.includes(n) ? n : DEFAULT_WINDOW[mode]
}

function parseSort(v: string | string[] | undefined): SortingState {
  const raw = first(v)
  if (!raw) return []
  const desc = raw.startsWith('-')
  const id = desc ? raw.slice(1) : raw
  return SORTABLE.has(id) ? [{ id, desc }] : []
}

function hiddenStorageKey(mode: RankingsMode) {
  return `topcryptos:hidden:${mode}`
}

/** Query-specific copy updates after router hydration; static social previews use defaults. */
export function shareDescription(
  mode: RankingsMode,
  amount: number,
  highlighted: number,
  exchanges: number,
  algorithm: RankingAlgorithm = 'classic',
): string {
  const unit = mode === 'daily' ? 'days' : 'hours'
  const parts = [`Cryptocurrency ${ALGORITHMS[algorithm].label.toLowerCase()} rankings over ${amount} ${unit}`]
  if (exchanges > 0) parts.push(`on ${exchanges} exchange${exchanges === 1 ? '' : 's'}`)
  if (highlighted > 0) parts.push(`· ${highlighted} coin${highlighted === 1 ? '' : 's'} highlighted`)
  return parts.join(' ') + '.'
}

export function RankingsView({ mode }: { mode: RankingsMode }) {
  const unit = mode === 'daily' ? 'days' : 'hours'
  const isDesktop = useMediaQuery('(min-width: 768px)')

  const [error, setError] = useState<string | null>(null)
  const [loadedRankings, setLoadedRankings] = useState<{ mode: RankingsMode; data: RankingsResponse } | null>(null)
  const rankings = loadedRankings?.mode === mode ? loadedRankings.data : null
  const [scored, setScored] = useState<{ key: string; input: RankingsResponse; data: CryptoScoreResults } | null>(null)
  const [exchangeMap, setExchangeMap] = useState<null | ExchangeMap>(null)

  const [activeCryptoId, setActiveCryptoId] = useState<string | null>(null)

  /*
   * Shareable state lives in the URL: the window, the exchange filter, the
   * sort and the highlighted coins are what a pasted link should reproduce.
   * Hidden coins are a personal preference (nobody shares "without USDT"),
   * so they persist in localStorage instead and stay out of the link.
   */
  const router = useRouter()
  const windowParam = WINDOW_PARAM[mode]
  const amount = parseWindow(mode, router.query[windowParam])
  const algorithm = parseAlgorithm(router.query.algo)
  const algorithmInfo = ALGORITHMS[algorithm]
  const selectedExchanges = useMemo(
    () => parseList(router.query.ex),
    [router.query.ex],
  )
  const highlightedIds = useMemo(
    () => new Set(parseList(router.query.hl)),
    [router.query.hl],
  )
  const sorting = useMemo(() => parseSort(router.query.sort), [router.query.sort])

  const setQuery = useCallback(
    (patch: Record<string, string | undefined>, push = false) => {
      const query: Record<string, string> = {}
      Object.entries({ ...router.query, ...patch }).forEach(([k, v]) => {
        const val = first(v)
        if (val) query[k] = val
      })
      const nav = push ? router.push : router.replace
      // Shallow: nothing here needs a server round-trip, and a star click must
      // not refetch 90 days of snapshots.
      nav({ pathname: router.pathname, query }, undefined, { shallow: true, scroll: false })
    },
    [router],
  )

  const setAmount = useCallback(
    (n: number) =>
      // A window change is a real "new view", so it earns a history entry;
      // stars and sorts use replace so Back still leaves the page.
      setQuery({ [windowParam]: n === DEFAULT_WINDOW[mode] ? undefined : String(n) }, true),
    [setQuery, windowParam, mode],
  )
  const setAlgorithm = useCallback(
    (value: RankingAlgorithm) => setQuery({ algo: value === 'classic' ? undefined : value }, true),
    [setQuery],
  )
  const setSelectedExchanges = useCallback(
    (ids: string[]) => setQuery({ ex: ids.length ? ids.join(',') : undefined }),
    [setQuery],
  )
  const setHighlightedIds = useCallback(
    (ids: Set<string>) => setQuery({ hl: ids.size ? [...ids].join(',') : undefined }),
    [setQuery],
  )
  const setSorting = useCallback(
    (next: SortingState | ((prev: SortingState) => SortingState)) => {
      const resolved = typeof next === 'function' ? next(sorting) : next
      const s = resolved[0]
      setQuery({ sort: s ? `${s.desc ? '-' : ''}${s.id}` : undefined })
    },
    [setQuery, sorting],
  )

  const [hiddenIds, setHiddenIds] = useState<Set<string>>(() => new Set())
  const scoreKey = `${mode}:${amount}:${algorithm}:${[...hiddenIds].sort().join(',')}`
  const results = scored?.key === scoreKey && scored.input === rankings ? scored.data : null
  const [outlookId, setOutlookId] = useState<string | null>(null)
  const outlookTrigger = useRef<HTMLElement | null>(null)
  const openOutlook = useCallback((id: string) => {
    outlookTrigger.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
    setOutlookId(id)
  }, [])
  const restoreOutlookFocus = useCallback(() => {
    if (outlookTrigger.current?.isConnected) outlookTrigger.current.focus({ preventScroll: true })
  }, [])
  useEffect(() => {
    try {
      const raw = localStorage.getItem(hiddenStorageKey(mode))
      setHiddenIds(new Set(raw ? (JSON.parse(raw) as string[]) : []))
    } catch {
      setHiddenIds(new Set())
    }
  }, [mode])
  const persistHidden = useCallback(
    (ids: Set<string>) => {
      setHiddenIds(ids)
      try {
        localStorage.setItem(hiddenStorageKey(mode), JSON.stringify([...ids]))
      } catch {
        // Private mode / storage disabled: hiding still works for the session.
      }
    },
    [mode],
  )

  // --- data -----------------------------------------------------------------

  useEffect(() => {
    let cancelled = false
    let pending = false
    let lastAttempt = -Infinity
    const reload = () => {
      if (pending) return
      pending = true
      lastAttempt = Date.now()
      const load = mode === 'daily'
        ? topCryptos.getDailyRankings({})
        : topCryptos.getHourlyRankings({})
      void load
        .then((res) => {
          if (!cancelled) setLoadedRankings({ mode, data: res })
        })
        .catch((err) => {
          console.error('getRankings error', err)
          if (!cancelled) setError('Could not load rankings.')
        })
        .finally(() => { pending = false })
    }
    reload()
    const refreshVisible = () => {
      if (document.visibilityState !== 'hidden' && Date.now() - lastAttempt >= 5 * 60_000) reload()
    }
    const timer = mode === 'hourly' ? window.setInterval(refreshVisible, 5 * 60_000) : null
    if (mode === 'hourly') document.addEventListener('visibilitychange', refreshVisible)

    return () => {
      cancelled = true
      if (timer != null) window.clearInterval(timer)
      document.removeEventListener('visibilitychange', refreshVisible)
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

    const { startDate, endDate, intervalMs } = getRankingWindow(mode, amount)
    processRankings(rankings, startDate, hiddenIds, { algorithm, endDate, intervalMs })
      .then((res) => {
        if (!cancelled) {
          setScored({ key: scoreKey, input: rankings, data: res })
          setError(null)
        }
      })
      .catch((err) => {
        console.error('processRankings error', err)
        if (!cancelled) setError('Could not score rankings.')
      })

    return () => {
      cancelled = true
    }
  }, [rankings, amount, hiddenIds, mode, algorithm, scoreKey])

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

  const leader = visibleCryptos.find((coin) => !coin.insufficientHistory && coin.score !== NAN_SCORE) ?? null

  // Snapshot count can overstate coverage when several rows share a bucket.
  // Use observed UTC hour buckets; scoring separately checks individual gaps.
  const windowOptions = useMemo(() => {
    if (mode === 'daily') return DAILY_WINDOWS
    if (rankings == null) return HOURLY_WINDOWS
    const hourMs = 60 * 60 * 1000
    let oldest = Infinity
    let newest = -Infinity
    for (const snapshot of rankings) {
      for (const row of snapshot.data) {
        const time = Date.parse(row.quote.USD.last_updated)
        if (!Number.isFinite(time)) continue
        const bucket = Math.floor(time / hourMs)
        oldest = Math.min(oldest, bucket)
        newest = Math.max(newest, bucket)
      }
    }
    const observedHours = newest - oldest + 1
    const opts = HOURLY_WINDOWS.filter((w) => w <= observedHours)
    return opts.length > 0 ? opts : HOURLY_WINDOWS.slice(0, 1)
  }, [mode, rankings])

  useEffect(() => {
    if (!router.isReady || rankings == null) return
    if (!windowOptions.includes(amount)) setAmount(windowOptions[windowOptions.length - 1])
  }, [router.isReady, rankings, windowOptions, amount, setAmount])

  // --- interactions ---------------------------------------------------------

  const toggleIn = (set: Set<string>, id: string) => {
    const next = new Set(set)
    next.has(id) ? next.delete(id) : next.add(id)
    return next
  }

  const toggleHighlight = useCallback(
    (id: string) => setHighlightedIds(toggleIn(highlightedIds, id)),
    [highlightedIds, setHighlightedIds],
  )

  const toggleHidden = useCallback(
    (id: string) => {
      persistHidden(toggleIn(hiddenIds, id))
      if (highlightedIds.has(id)) {
        const next = new Set(highlightedIds)
        next.delete(id)
        setHighlightedIds(next)
      }
    },
    [hiddenIds, highlightedIds, persistHidden, setHighlightedIds],
  )

  const title = `Top Performing Cryptocurrencies${mode === 'hourly' ? ' (Hourly)' : ''}`
  const filteredOut =
    results != null && allowedCoinIds != null
      ? results.cryptosSortedByScore.length - visibleCryptos.length
      : 0
  const loading = results == null && error == null

  const description = shareDescription(mode, amount, highlightedIds.size, selectedExchanges.length, algorithm)

  return (
    <div className="min-h-full">
      <Head>
        <title>{`Top Cryptos — ${title}`}</title>
        <meta name="description" content={description} />
        <meta property="og:title" content={`Top Cryptos — ${title}`} />
        <meta property="og:description" content={description} />
        <meta property="og:type" content="website" />
        <meta name="twitter:card" content="summary" />
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
                { href: '/breakouts', label: 'Breakouts', active: false },
              ] as const
            ).map((tab) => (
              <Link
                key={tab.href}
                href={{ pathname: tab.href, query: router.query }}
                aria-current={tab.active ? 'page' : undefined}
                className={cn(
                  'inline-flex min-h-11 items-center rounded-full px-2 font-medium transition-colors sm:min-h-8 sm:px-3',
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
          <span className="text-muted-foreground">Rank by</span>
          <Select value={algorithm} onValueChange={(value) => setAlgorithm(parseAlgorithm(value))}>
            <SelectTrigger
              aria-label={`Algorithm: ${algorithmInfo.label}`}
              className="min-h-11 w-auto gap-1.5 rounded-full border-border/70 bg-secondary/50 px-3 text-sm"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent position="popper" align="start">
              <SelectGroup>
              {Object.entries(ALGORITHMS).map(([id, info]) => (
                <SelectItem key={id} value={id} className="min-h-11">
                  {info.label}
                </SelectItem>
              ))}
              </SelectGroup>
            </SelectContent>
          </Select>
          <span className="text-muted-foreground">over</span>
          <Select
            value={String(amount)}
            onValueChange={(v) => {
              const parsed = parseInt(v, 10)
              if (!Number.isNaN(parsed)) setAmount(parsed)
            }}
          >
            <SelectTrigger
              aria-label={`Window: ${amount} ${unit}`}
              className="min-h-11 w-auto gap-1.5 rounded-full border-border/70 bg-secondary/50 px-3 text-sm"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent position="popper" align="start">
              <SelectGroup>
              {windowOptions.map((w) => (
                <SelectItem key={w} value={String(w)} className="min-h-11">
                  {`${w} ${unit}`}
                </SelectItem>
              ))}
              </SelectGroup>
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
            <Button variant="ghost" className="min-w-0 justify-start px-0 font-display text-2xl" onClick={() => openOutlook(leader.id)} aria-label={`View outlook for ${leader.name}`}>
              <span className="truncate">{leader.name}</span>
            </Button>
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

        {results && (
          <CoinOutlook
            key={scoreKey}
            cryptos={visibleCryptos}
            peers={results.cryptosSortedByScore}
            highlightedIds={highlightedIds}
            selectedId={outlookId}
            onSelect={openOutlook}
            onClose={() => setOutlookId(null)}
            restoreFocus={restoreOutlookFocus}
            rankings={rankings!}
            mode={mode}
            amount={amount}
            algorithm={algorithm}
            algorithmLabel={algorithmInfo.label}
            hiddenCoins={hiddenIds.size > 0}
            exchangeFiltered={selectedExchanges.length > 0}
            isDesktop={isDesktop}
          />
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
            className="panel rounded-xl border border-border/50 p-3 sm:p-5"
          >
            {loading ? (
              <Skeleton className="h-[300px] w-full rounded-lg sm:h-[380px]" />
            ) : results ? (
              <RankingsChart
                cryptos={visibleCryptos}
                minMaxes={results.minMaxes}
                points={amount}
                // Keep the chart readable; the table retains every eligible coin.
                maxSeries={isDesktop ? 120 : 30}
                highlightedIds={highlightedIds}
                hiddenIds={hiddenIds}
                activeCryptoId={activeCryptoId}
                onToggleHighlight={toggleHighlight}
                onHover={setActiveCryptoId}
              />
            ) : null}

            {/* One line of onboarding stays visible; everything else the old
                explainer said now lives on the thing it explains — the legend,
                the Score header tooltip, the New badge, the hover card. */}
            <p className="mt-4 border-t border-border/50 pt-3 text-sm leading-relaxed text-muted-foreground">
              <span className="text-foreground font-medium">{algorithmInfo.label}.</span>{' '}
              {algorithmInfo.description}
            </p>
          </section>

          <section aria-label="Rankings" className="min-w-0">
            <div className="flex items-baseline justify-between gap-3 pb-2 text-xs text-muted-foreground">
              <span>
                {loading
                  ? 'Scoring…'
                  : `${visibleCryptos.length} coin${visibleCryptos.length === 1 ? '' : 's'}`}
                {filteredOut > 0 && ` · ${filteredOut} filtered out`}
              </span>
              <span className="flex items-center gap-3">
                {highlightedIds.size > 0 && (
                  <button
                    onClick={() => setHighlightedIds(new Set())}
                    className="underline underline-offset-4 hover:text-foreground"
                  >
                    Clear {highlightedIds.size} highlighted
                  </button>
                )}
                <ShareButton title={`Top Cryptos — ${title}`} text={description} />
              </span>
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
                scoreDescription={algorithmInfo.description}
                sorting={sorting}
                onSortingChange={setSorting}
                highlightedIds={highlightedIds}
                hiddenIds={hiddenIds}
                onToggleHighlight={toggleHighlight}
                onToggleHidden={toggleHidden}
                onViewOutlook={openOutlook}
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
                onViewOutlook={openOutlook}
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

      {/* Sponsored card, below the fold. */}
      <footer className="mx-auto max-w-[1600px] px-4 pb-10 sm:px-6">
        <a
          href="https://meownero.com"
          target="_blank"
          rel="noopener"
          className="group flex items-center gap-4 rounded-xl border border-border/50 bg-card/40 px-4 py-3 transition-colors hover:border-[#e0b64a]/50 hover:bg-card/70"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/meownero.png"
            alt=""
            width={44}
            height={44}
            className="size-11 shrink-0 rounded-full"
          />
          <span className="min-w-0 flex-1">
            <span className="block text-[10px] tracking-wide text-muted-foreground uppercase">
              Sponsored
            </span>
            <span className="block truncate">
              <span className="font-display text-lg leading-tight">Meownero</span>
              <span className="text-sm text-muted-foreground">
                {' '}
                — a privacy coin.
              </span>
            </span>
          </span>
          <span className="hidden shrink-0 text-sm text-muted-foreground group-hover:text-foreground sm:inline">
            meownero.com ↗
          </span>
        </a>
      </footer>
    </div>
  )
}
