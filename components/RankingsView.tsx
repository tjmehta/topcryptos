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
import { useCallback, useEffect, useMemo, useState } from 'react'

import type { ExchangeMap } from '@/modules/exchangeMap'
import { ExchangeFilter } from '@/components/ExchangeFilter'
import Head from 'next/head'
import Link from 'next/link'
import { RankingsChart } from '@/components/RankingsChart'
import { RankingsTable } from '@/components/RankingsTable'
import { selectCoinIdsOnExchanges } from '@/modules/exchangeMap'
import { topCryptos } from '@/modules/topCryptos'

const WINDOWS = [3, 4, 5, 6, 7, 10, 14, 21, 30, 45, 60, 90]

export type RankingsMode = 'daily' | 'hourly'

function startDateFor(mode: RankingsMode, amount: number): Date {
  const date = new Date()
  if (mode === 'daily') {
    date.setDate(date.getDate() - (amount - 1))
  } else {
    date.setHours(date.getHours() - (amount - 1))
  }
  return date
}

export function RankingsView({ mode }: { mode: RankingsMode }) {
  const unit = mode === 'daily' ? 'days' : 'hours'

  const [error, setError] = useState<string | null>(null)
  const [rankings, setRankings] = useState<null | unknown[]>(null)
  const [results, setResults] = useState<null | CryptoScoreResults>(null)
  const [exchangeMap, setExchangeMap] = useState<null | ExchangeMap>(null)

  const [activeCryptoId, setActiveCryptoId] = useState<string | null>(null)
  const [selectedCryptoIds, setSelectedCryptoIds] = useState<Set<string>>(
    () => new Set(),
  )
  const [disabledCryptoIds, setDisabledCryptoIds] = useState<Set<string>>(
    () => new Set(),
  )

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
      .then((res) => {
        if (!cancelled) setRankings(res)
      })
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
      .then((map) => {
        if (!cancelled && map?.exchanges) setExchangeMap(map)
      })
      .catch(() => {
        // The filter is additive; if the map is unavailable the rest of the
        // page must still work, so this failure is deliberately swallowed
        // beyond leaving `exchangeMap` null (which disables the control).
      })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (rankings == null) return
    let cancelled = false

    processRankings(rankings as any, startDateFor(mode, amount), disabledCryptoIds)
      .then((res) => {
        if (!cancelled) setResults(res)
      })
      .catch((err) => {
        console.error('processRankings error', err)
        if (!cancelled) setError('Could not score rankings.')
      })

    return () => {
      cancelled = true
    }
  }, [rankings, amount, disabledCryptoIds, mode])

  // --- derived --------------------------------------------------------------

  const allowedCoinIds = useMemo(
    () =>
      exchangeMap
        ? selectCoinIdsOnExchanges(exchangeMap, selectedExchanges)
        : null,
    [exchangeMap, selectedExchanges],
  )

  const visibleCryptos = useMemo(() => {
    if (results == null) return []
    if (allowedCoinIds == null) return results.cryptosSortedByScore
    return results.cryptosSortedByScore.filter((c) => allowedCoinIds.has(c.id))
  }, [results, allowedCoinIds])

  /**
   * Selected coins float to the top of the table. The old implementation did
   * this by monkey-patching a `rank_plus_selected` field onto each Crypto and
   * sorting on it, which mutated shared objects during render.
   */
  const tableData = useMemo(() => {
    const rows = visibleCryptos.slice()
    rows.sort((a, b) => {
      const aSel = selectedCryptoIds.has(a.id) ? 0 : 1
      const bSel = selectedCryptoIds.has(b.id) ? 0 : 1
      if (aSel !== bSel) return aSel - bSel
      return a.rank - b.rank
    })
    return rows
  }, [visibleCryptos, selectedCryptoIds])

  const windowOptions = useMemo(() => {
    if (mode === 'daily') return WINDOWS
    const available = rankings?.length ?? 0
    const opts = WINDOWS.filter((w) => w < available)
    return opts.length > 0 ? opts : [Math.max(available, 1)]
  }, [mode, rankings])

  // Keep the selection valid when the available hourly window shrinks.
  useEffect(() => {
    if (windowOptions.length > 0 && !windowOptions.includes(amount)) {
      setAmount(windowOptions[0])
    }
  }, [windowOptions, amount])

  // --- interactions ---------------------------------------------------------

  const toggleSelected = useCallback((cryptoId: string) => {
    setSelectedCryptoIds((prev) => {
      const next = new Set(prev)
      next.has(cryptoId) ? next.delete(cryptoId) : next.add(cryptoId)
      return next
    })
  }, [])

  const toggleDisabled = useCallback((cryptoId: string) => {
    setDisabledCryptoIds((prev) => {
      const next = new Set(prev)
      next.has(cryptoId) ? next.delete(cryptoId) : next.add(cryptoId)
      return next
    })
    setSelectedCryptoIds((prev) => {
      if (!prev.has(cryptoId)) return prev
      const next = new Set(prev)
      next.delete(cryptoId)
      return next
    })
  }, [])

  const title = `Top Performing Cryptocurrencies${
    mode === 'hourly' ? ' (Hourly)' : ''
  }`
  const filteredOut =
    results != null && allowedCoinIds != null
      ? results.cryptosSortedByScore.length - visibleCryptos.length
      : 0

  return (
    <div className="min-h-full">
      <Head>
        <title>{`Top Cryptos - ${title}`}</title>
        <link rel="icon" href="/favicon.ico" />
      </Head>

      <div className="container mx-auto px-4">
        <header className="flex flex-wrap items-baseline justify-between gap-4 pt-6 pb-8 lg:pt-10 lg:pb-12">
          <h1 className="text-4xl font-bold md:text-5xl lg:text-6xl">
            <span aria-hidden>🔥 </span>Top Cryptos
          </h1>
          <nav className="flex gap-4 text-sm text-muted-foreground">
            <Link
              href="/"
              className={mode === 'daily' ? 'text-foreground' : 'hover:text-foreground'}
            >
              Daily
            </Link>
            <Link
              href="/hourly"
              className={mode === 'hourly' ? 'text-foreground' : 'hover:text-foreground'}
            >
              Hourly
            </Link>
          </nav>
        </header>

        <div className="flex flex-wrap items-center gap-3 pb-8 text-xl md:text-2xl">
          <span>Top performing cryptos over</span>

          <Select
            value={String(amount)}
            onValueChange={(v) => {
              const parsed = parseInt(v, 10)
              if (!Number.isNaN(parsed)) setAmount(parsed)
            }}
          >
            <SelectTrigger className="h-auto w-auto gap-2 border-border bg-secondary/60 text-base">
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

          <span>on</span>

          <ExchangeFilter
            exchanges={exchangeMap?.exchanges ?? []}
            selected={selectedExchanges}
            onChange={setSelectedExchanges}
          />
        </div>

        {error && (
          <div className="mb-6 rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-destructive-foreground">
            {error}
          </div>
        )}

        {selectedExchanges.length > 0 && filteredOut > 0 && (
          <p className="pb-4 text-sm text-muted-foreground">
            Showing {visibleCryptos.length} coins · {filteredOut} hidden by the
            exchange filter
          </p>
        )}

        <div className="grid gap-6 pb-16 xl:grid-cols-2">
          <div className="panel rounded-3xl p-2 shadow-2xl md:p-4 lg:p-6">
            {results == null ? (
              <div className="flex h-[28rem] items-center justify-center text-muted-foreground">
                Loading chart…
              </div>
            ) : (
              <RankingsChart
                cryptos={visibleCryptos}
                minMaxes={results.minMaxes}
                points={amount}
                activeCryptoId={activeCryptoId}
                selectedCryptoIds={selectedCryptoIds}
                disabledCryptoIds={disabledCryptoIds}
                onClick={toggleSelected}
                onDoubleClick={toggleDisabled}
                onMouseOver={setActiveCryptoId}
              />
            )}
          </div>

          <div className="panel overflow-hidden rounded-3xl shadow-2xl">
            {results == null ? (
              <div className="flex h-[28rem] items-center justify-center text-muted-foreground">
                Loading table…
              </div>
            ) : (
              <RankingsTable
                data={tableData}
                selectedCryptoIds={selectedCryptoIds}
                disabledCryptoIds={disabledCryptoIds}
                onToggleSelected={toggleSelected}
                onToggleDisabled={toggleDisabled}
                onHover={setActiveCryptoId}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

export type { Crypto }
