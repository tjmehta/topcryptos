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
import { useMediaQuery } from '@/components/hooks/useMediaQuery'

export const DAILY_WINDOWS = [3, 4, 5, 6, 7, 10, 14, 21, 30, 45, 60, 90]
export const HOURLY_WINDOWS = [3, 6, 9, 12, 18, 24]
export const DEFAULT_WINDOW = { daily: 10, hourly: 6 } as const

export type RankingsMode = 'daily' | 'hourly'

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

function startDateFor(mode: RankingsMode, amount: number): Date {
  const date = new Date()
  if (mode === 'daily') date.setDate(date.getDate() - (amount - 1))
  else date.setHours(date.getHours() - (amount - 1))
  return date
}

/** The sentence a shared link previews with. Built from URL state only, so the server can emit it too. */
export function shareDescription(
  mode: RankingsMode,
  amount: number,
  highlighted: number,
  exchanges: number,
): string {
  const unit = mode === 'daily' ? 'days' : 'hours'
  const parts = [`Cryptocurrencies climbing the market-cap ranks fastest over ${amount} ${unit}`]
  if (exchanges > 0) parts.push(`on ${exchanges} exchange${exchanges === 1 ? '' : 's'}`)
  if (highlighted > 0) parts.push(`· ${highlighted} coin${highlighted === 1 ? '' : 's'} highlighted`)
  return parts.join(' ') + '.'
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

  /*
   * Shareable state lives in the URL: the window, the exchange filter, the
   * sort and the highlighted coins are what a pasted link should reproduce.
   * Hidden coins are a personal preference (nobody shares "without USDT"),
   * so they persist in localStorage instead and stay out of the link.
   */
  const router = useRouter()
  const windowParam = WINDOW_PARAM[mode]
  const amount = parseWindow(mode, router.query[windowParam])
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

  /*
   * Hourly options are trimmed to what the snapshots actually cover: a window
   * of N hours needs N cron buckets plus the live one, hence the strict `<`.
   * Until the data arrives the full list stands so the select never flashes
   * a bogus "1 hours" entry.
   */
  const windowOptions = useMemo(() => {
    if (mode === 'daily') return DAILY_WINDOWS
    if (rankings == null) return HOURLY_WINDOWS
    const opts = HOURLY_WINDOWS.filter((w) => w < rankings.length)
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

  const description = shareDescription(mode, amount, highlightedIds.size, selectedExchanges.length)

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

            {/* One line of onboarding stays visible; everything else the old
                explainer said now lives on the thing it explains — the legend,
                the Score header tooltip, the New badge, the hover card. */}
            <p className="mt-4 border-t border-border/50 pt-3 text-xs text-muted-foreground">
              <span className="text-foreground font-medium">Score</span> = how fast a coin's
              price, market cap, and rank climbed over the whole window, not just today.
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
                sorting={sorting}
                onSortingChange={setSorting}
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
            className="size-11 shrink-0 rounded-full transition-transform group-hover:rotate-[12deg]"
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
