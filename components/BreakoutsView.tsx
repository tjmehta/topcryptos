import Head from 'next/head'
import Link from 'next/link'
import { useRouter } from 'next/router'
import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import type { OhlcScreen } from '@/modules/ohlcScreen'

const VIEWS = [3, 4, 5, 6, 7, 10, 14, 21, 30, 45, 60, 90]
const EXCHANGES = { coinbase: 'Coinbase', kraken: 'Kraken' } as const
const METHODS = ['Breakout', 'VolumeBreakout', 'Momentum']
const LABELS: Record<string, string> = { Breakout: 'Breakout', VolumeBreakout: 'Volume breakout', Momentum: 'Momentum' }
const numericPrice = (value: number) => value.toLocaleString('en-US', { maximumSignificantDigits: 7 })

export function BreakoutsView() {
  const router = useRouter()
  const rawView = typeof router.query.d === 'string' ? Number(router.query.d) : 7
  const view = VIEWS.includes(rawView) ? rawView : 7
  const method = typeof router.query.algo === 'string' && METHODS.includes(router.query.algo) ? router.query.algo : 'Breakout'
  const exchange = router.query.exchange === 'kraken' ? 'kraken' : 'coinbase'
  const [loadedData, setData] = useState<OhlcScreen | null>(null)
  const activeRequest = useRef<AbortController | null>(null)
  const data = loadedData?.algorithm === method && loadedData.view_observations === view && loadedData.exchange === exchange ? loadedData : null
  const [error, setError] = useState<string | null>(null)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    if (!router.isReady) return
    const controller = new AbortController()
    activeRequest.current = controller
    setData(null)
    setError(null)
    fetch(`/api/rankings/ohlc?d=${view}&algo=${method}&exchange=${exchange}`, { signal: controller.signal })
      .then(async (res) => {
        if (!res.ok) throw new Error('Could not load daily prices. Try again shortly.')
        const next: OhlcScreen = await res.json()
        if (next.algorithm !== method || next.view_observations !== view || next.exchange !== exchange) throw new Error('The response did not match this view. Try again.')
        if (!controller.signal.aborted) setData(next)
      })
      .catch((err: unknown) => {
        if (!controller.signal.aborted) setError(err instanceof Error ? err.message : 'Could not load breakouts.')
      })
    return () => controller.abort()
  }, [router.isReady, view, method, exchange, attempt])

  const change = (d: number, algo: string, selectedExchange = exchange) => {
    activeRequest.current?.abort()
    setData(null)
    setError(null)
    void router.push({ pathname: '/breakouts', query: { d, algo, exchange: selectedExchange } }, undefined, { shallow: true, scroll: false })
  }

  return <div className="min-h-full">
    <Head><title>Top Cryptos — Breakouts &amp; sell outlooks</title><meta name="description" content="Daily OHLC rankings, dated entry references and 30-day target outlooks." /></Head>
    <header className="sticky top-0 z-30 border-b border-border/60 bg-background/90 backdrop-blur-md">
      <div className="mx-auto flex max-w-[1600px] items-center justify-between gap-3 px-4 py-2.5 sm:px-6">
        <Link href="/" className="flex min-w-0 items-center gap-2"><span aria-hidden className="text-lg leading-none">🔥</span><span className="truncate font-display text-xl leading-none tracking-tight sm:text-2xl">Top Cryptos</span></Link>
        <nav aria-label="Ranking window" className="flex shrink-0 items-center rounded-full border border-border/70 bg-secondary/50 p-0.5 text-xs">
          <Link href="/" className="inline-flex min-h-11 items-center rounded-full px-2 font-medium text-muted-foreground transition-colors hover:text-foreground sm:min-h-8 sm:px-3">Daily</Link>
          <Link href="/hourly" className="inline-flex min-h-11 items-center rounded-full px-2 font-medium text-muted-foreground transition-colors hover:text-foreground sm:min-h-8 sm:px-3">Hourly</Link>
          <Link href="/breakouts" aria-current="page" className="inline-flex min-h-11 items-center rounded-full bg-primary px-2 font-medium text-primary-foreground sm:min-h-8 sm:px-3">Breakouts</Link>
        </nav>
      </div>
    </header>
    <main className="mx-auto max-w-[1400px] px-4 pt-6 pb-16 sm:px-6">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
        <div><p className="mb-1 text-xs uppercase tracking-wide text-muted-foreground">{EXCHANGES[exchange]} Spot · USD</p><h1 className="font-display text-3xl">Breakouts &amp; sell outlooks</h1></div>
        <div className="grid w-full grid-cols-2 gap-3 sm:flex sm:w-auto">
          <label className="col-span-2 text-xs text-muted-foreground sm:col-span-1">Exchange<select aria-label="OHLC exchange" className="mt-1 block min-h-11 w-full min-w-0 rounded-xl border border-border/70 bg-secondary/50 px-3 py-2 text-base text-foreground sm:w-auto sm:text-sm" value={exchange} onChange={(e) => change(view, method, e.target.value === 'kraken' ? 'kraken' : 'coinbase')}>{Object.entries(EXCHANGES).map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select></label>
          <label className="text-xs text-muted-foreground">Algorithm<select aria-label="OHLC algorithm" className="mt-1 block min-h-11 w-full min-w-0 rounded-xl border border-border/70 bg-secondary/50 px-3 py-2 text-base text-foreground sm:w-auto sm:text-sm" value={method} onChange={(e) => change(view, e.target.value)}>{METHODS.map((m) => <option key={m} value={m}>{LABELS[m]}</option>)}</select></label>
          <label className="text-xs text-muted-foreground">Viewed history<select aria-label="OHLC viewed history" className="mt-1 block min-h-11 w-full min-w-0 rounded-xl border border-border/70 bg-secondary/50 px-3 py-2 text-base text-foreground sm:w-auto sm:text-sm" value={view} onChange={(e) => change(Number(e.target.value), method)}>{VIEWS.map((n) => <option key={n} value={n}>{n} daily candles</option>)}</select></label>
        </div>
      </div>
      <p className="mb-6 max-w-3xl text-sm leading-relaxed text-muted-foreground">{view} completed daily candles · {view - 1} days between the first and last close.</p>

      {error ? <div role="alert" className="rounded-xl border border-destructive/50 p-5"><p>{error}</p><Button className="mt-3 min-h-11" onClick={() => setAttempt((n) => n + 1)}>Try again</Button></div> : !data ? <div role="status" className="flex flex-col gap-4"><p className="text-sm text-muted-foreground">Loading daily prices…</p><div aria-hidden="true" className="grid gap-4 lg:grid-cols-2">{[0, 1].map((key) => <div key={key} className="flex flex-col gap-5 rounded-xl border border-border/60 bg-card/40 p-5"><Skeleton className="h-6 w-28" /><Skeleton className="h-20 w-full" /><Skeleton className="h-10 w-2/3" /></div>)}</div></div> : <>
        <dl className="mb-5 grid grid-cols-1 gap-4 rounded-xl border border-border/60 bg-card/40 p-4 sm:grid-cols-3 sm:gap-6 sm:p-5 [&>div]:flex [&>div]:items-center [&>div]:justify-between [&>div]:gap-3 sm:[&>div]:block">
          <div><dt className="text-xs text-muted-foreground">Signal close · UTC date</dt><dd className="figure shrink-0 text-sm sm:mt-1 sm:text-base">{data.signal_date}</dd></div>
          <div><dt className="text-xs text-muted-foreground">Entry reference · UTC day open</dt><dd className="figure shrink-0 text-sm sm:mt-1 sm:text-base">{data.entry_date}</dd></div>
          <div><dt className="text-xs text-muted-foreground">Reference exit · UTC date</dt><dd className="figure shrink-0 text-sm sm:mt-1 sm:text-base">{data.hard_exit_date}</dd></div>
        </dl>
        <div className="mb-4 flex flex-wrap justify-between gap-2 text-xs leading-relaxed text-muted-foreground"><span>{data.rows.length} signals · {data.eligible_count}/{data.universe_size} pairs eligible</span><span>{data.unallocated_slots} of 10 slots in cash</span></div>
        {data.rows.length > 0 && <details className="mb-4 text-xs leading-relaxed text-muted-foreground"><summary className="min-h-11 cursor-pointer content-center hover:text-foreground">About targets &amp; stops</summary><p className="max-w-3xl pb-3">Target probability has not been evaluated for {EXCHANGES[exchange]}. Levels use the dated entry price and earlier daily candles. A target touch does not guarantee a sale. Levels are not updated for later prices.</p></details>}
        {data.rows.length === 0 ? <div className="rounded-xl border border-dashed border-border px-6 py-12 text-center"><h2 className="font-medium">{data.eligible_count === 0 ? 'No eligible price histories' : 'No qualifying signals'}</h2><p className="mt-2 text-sm text-muted-foreground">{data.eligible_count === 0 ? 'No pair had enough complete daily history and liquidity for this view.' : 'No pair passed this algorithm’s positive-signal rule.'} Unfilled slots stay in cash.</p></div> : <ol className="grid gap-4 lg:grid-cols-2">
          {data.rows.map((row) => {
            const zones = row.entry_price != null && row.outlook && 'zones' in row.outlook ? row.outlook.zones : []
            const resistance = zones.find((zone) => zone.policy === 'ResistanceSMAATR')
            const entryUnavailable = row.entry_unavailable_reason === 'identity-gap'
              ? { label: 'Identity continuity unverified', explanation: 'A missing daily bar separates the signal from entry, so the instrument’s identity cannot be verified across that gap. Entry-based levels and probability are withheld.' }
              : row.entry_unavailable_reason === 'inactive-entry'
                ? { label: 'No executable entry', explanation: 'The entry-day candle has no executable trading activity. No entry-based target or probability can be calculated.' }
                : { label: 'Open unavailable', explanation: 'The actual entry open is unavailable. No entry-based target or probability can be calculated.' }
            return <li key={row.instrument_key} className="min-w-0 rounded-xl border border-border/60 bg-card/40 p-4 sm:p-5">
              <div className="mb-5 flex items-center justify-between gap-3"><h2 className="flex min-w-0 items-center gap-3 text-lg font-semibold"><span className="figure text-xs font-normal text-muted-foreground">{String(row.rank).padStart(2, '0')}</span><span className="break-all">{row.symbol}</span></h2><span className="figure shrink-0 text-xs text-muted-foreground">Score {row.score.toFixed(5)}</span></div>
              <dl className="grid grid-cols-2 gap-x-4 gap-y-5 text-sm [&_dt]:leading-relaxed [&_dd]:break-words">
                <div><dt className="text-xs text-muted-foreground">Entry reference · {data.quote_currency}</dt><dd className="figure mt-1.5 text-sm leading-relaxed">{row.entry_price == null ? entryUnavailable.label : numericPrice(row.entry_price)}</dd></div>
                <div><dt className="text-xs text-muted-foreground">Reference exit · 30 days</dt><dd className="figure mt-1.5 text-sm leading-relaxed">{data.hard_exit_date}</dd></div>
                <div><dt className="text-xs text-muted-foreground">Target · {data.quote_currency}</dt><dd className="figure mt-1.5 text-sm leading-relaxed">{resistance?.target != null ? numericPrice(resistance.target) : 'Unavailable'}</dd></div>
                <div><dt className="text-xs text-muted-foreground">Stop reference · {data.quote_currency}</dt><dd className="figure mt-1.5 text-sm leading-relaxed">{resistance?.stop != null ? numericPrice(resistance.stop) : 'Unavailable'}</dd></div>
              </dl>
              <div className="mt-5 pt-1">
                {row.entry_price == null && <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{entryUnavailable.explanation}</p>}
                <details className="mt-3 text-xs leading-relaxed"><summary className="min-h-11 cursor-pointer content-center text-muted-foreground transition-colors hover:text-foreground">Details</summary><div className="flex flex-col gap-3 pt-2 text-muted-foreground">
                  <p>Target: entry + 3 × the mean of 14 daily true ranges, capped by the previous 20-day high when that high is above entry. Stop: entry − 2 × that range, floored at zero. Levels use information through the signal date.</p>
                  <p>These formulas come from the earlier Binance study. Neither the exit policy nor target probabilities have been validated on this exchange. A closing-price trigger and the later executed sale are separate events.</p>
                </div></details>
              </div>
            </li>
          })}
        </ol>}
        <section aria-label="Source and research support" className="mt-8 flex flex-col gap-3 border-t border-border/50 pt-5 text-xs leading-relaxed text-muted-foreground [&_p]:max-w-4xl [&_p]:break-words">
          <h2 className="font-medium text-foreground">Data &amp; backtests</h2>
          <p>These exchange rankings and price levels have not been backtested on this coin list. Historical Binance returns and probabilities do not transfer to this screen.</p>
          <details>
            <summary className="min-h-11 cursor-pointer content-center transition-colors hover:text-foreground">Source &amp; model details</summary>
            <div className="flex flex-col gap-3 pt-2">
              <p>{data.universe_description}</p>
              <p>{data.volume_description}</p>
              <p>Public market listings do not confirm availability for your state or account.</p>
              <p>The historical allocation rule assigns 10% to each selected pair and leaves the rest in cash.</p>
              <dl className="grid gap-3 sm:grid-cols-2 [&_dd]:break-all">
                <div><dt>Coin list selected</dt><dd className="figure mt-1">{data.universe_selected_at}</dd></div>
                <div><dt>Prices fetched</dt><dd className="figure mt-1">{data.fetched_at}</dd></div>
                <div><dt>Rankings calculated</dt><dd className="figure mt-1">{data.generated_at}</dd></div>
              </dl>
              <p>Daily and Hourly use our CMC rankings and their own holding-period evidence. This separate screen uses the selected exchange's candles for breakout scores and reference levels.</p>

              <a href={data.source_url} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center underline underline-offset-4">{EXCHANGES[exchange]} market-data source</a>
            </div>
          </details>
        </section>
      </>}
    </main>
  </div>
}
