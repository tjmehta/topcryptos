import { useEffect, useMemo, useRef, useState } from 'react'
import { X, Star } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Sheet,
  SheetContent,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet'
import { findRankCrossings, getCoinOutlook } from '@/modules/coinOutlook'
import type { Crypto, RankingAlgorithm } from '@/modules/processRankings'
import type { RankingsResponse } from '@/modules/uiTypes'
import type { OutlookEvidenceResponse } from '@/modules/coinOutlookEvidence'
import { percent, price, toneClass } from '@/modules/format'
import { cn } from '@/lib/utils'

const labels = {
  building: 'Price and rank improving',
  extended: 'Sharp latest jump',
  fading: 'Price losing ground',
  mixed: 'Mixed direction',
  unavailable: 'More history needed',
}

type Props = {
  cryptos: Crypto[]
  peers: Crypto[]
  rankings: RankingsResponse
  highlightedIds: Set<string>
  selectedId: string | null
  onSelect: (id: string) => void
  onClose: () => void
  restoreFocus: () => void
  mode: 'daily' | 'hourly'
  amount: number
  algorithm: RankingAlgorithm
  algorithmLabel: string
  hiddenCoins: boolean
  exchangeFiltered: boolean
  isDesktop: boolean
}

function HistoricalOutcomes({
  context,
  mode,
  eligible,
  exchangeFiltered,
}: {
  context: string
  mode: Props['mode']
  eligible: boolean
  exchangeFiltered: boolean
}) {
  const [opened, setOpened] = useState(false)
  const [data, setData] = useState<OutlookEvidenceResponse | null>(null)
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    if (!opened || !eligible) return
    const controller = new AbortController()
    const [mode, view, method, state] = context.split(':')
    setData(null)
    setFailed(false)
    fetch(
      `/api/outlook-evidence?${new URLSearchParams({ mode, view, method, state })}`,
      { signal: controller.signal },
    )
      .then(async (r) => {
        if (!r.ok) throw new Error('Evidence unavailable')
        const next: OutlookEvidenceResponse = await r.json()
        if (next.context !== context)
          throw new Error('Evidence context mismatch')
        if (!controller.signal.aborted) setData(next)
      })
      .catch(() => {
        if (!controller.signal.aborted) setFailed(true)
      })
    return () => controller.abort()
  }, [context, opened, eligible])
  const current = data?.context === context ? data : null
  return (
    <details
      className="border-t border-border/60 pt-1"
      onToggle={(e) => setOpened(e.currentTarget.open)}
    >
      <summary className="cursor-pointer py-3 text-sm font-medium">
        Past outcomes
      </summary>
      <div className="flex flex-col gap-3 pb-2 text-xs leading-relaxed text-muted-foreground">
        {!eligible ? (
          <p>
            No matching sample. Tests cover CMC top-ten picks with sufficient
            history and no hidden-coin exclusions.
          </p>
        ) : failed ? (
          <p role="status">Results couldn't load. Close and reopen to retry.</p>
        ) : !current ? (
          <p role="status">Loading results…</p>
        ) : current.rows.length === 0 ? (
          <p>No completed outcomes for this setup.</p>
        ) : (
          <>
            <p>
              Earlier CMC top-ten picks with the same algorithm, window and
              pattern. Historical results, not a forecast.
              {exchangeFiltered && ' Includes all exchanges.'}
            </p>
            <div className="overflow-x-auto">
              <table className="w-full text-left tabular-nums">
                <caption className="sr-only">
                  Historical holding outcomes after 0.5% cost each side
                </caption>
                <thead>
                  <tr className="border-b border-border/50">
                    <th className="py-2 pr-2 font-medium">Hold</th>
                    <th className="px-2 font-medium">Median</th>
                    <th className="px-2 font-medium">Bottom 10%</th>
                    <th className="pl-2 font-medium">Losses</th>
                  </tr>
                </thead>
                <tbody>
                  {current.rows.map((row) => (
                    <tr key={row.holding} className="border-b border-border/40">
                      <th className="py-2 pr-2 align-top font-normal">
                        {row.holding}
                        {mode === 'daily' ? 'd' : 'h'}
                        <span className="block text-[10px]">
                          {row.later.activeDates}{' '}
                          {row.later.activeDates === 1 ? 'date' : 'dates'}
                        </span>
                      </th>
                      <td className="px-2 align-top py-2">
                        {percent(
                          row.later.medianKnownNet50 == null
                            ? null
                            : row.later.medianKnownNet50 * 100,
                        )}
                      </td>
                      <td className="px-2 align-top py-2">
                        {percent(
                          row.later.p10KnownNet50 == null
                            ? null
                            : row.later.p10KnownNet50 * 100,
                        )}
                      </td>
                      <td className="pl-2 align-top py-2">
                        {row.later.knownLosses50}/{row.later.known}
                        <span className="block text-[10px]">
                          {row.later.entryMissing + row.later.exitMissing}{' '}
                          missing
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p>
              Next-quote entry · 0.5% cost each side · missing prices excluded.
              Samples overlap and differ by hold. Bottom 10% is the historical
              10th percentile.
            </p>
            <details>
              <summary className="cursor-pointer py-2">Sample dates</summary>
              <ul className="flex flex-col gap-1">
                {current.rows.map((r) => (
                  <li key={r.holding}>
                    {r.holding}
                    {mode === 'daily' ? 'd' : 'h'}: {r.laterStart.slice(0, 10)}–
                    {r.signalEnd.slice(0, 10)} signals; exits through{' '}
                    {r.exitEnd.slice(0, 10)}. {r.later.coins} coins,{' '}
                    {r.later.known}/{r.later.selected} known positions.
                  </li>
                ))}
              </ul>
              <p className="mt-2">
                Later-half sample · tested {current.studiedAt} UTC.
              </p>
            </details>
          </>
        )}
      </div>
    </details>
  )
}

function OutlookBody({ coin, ...props }: Props & { coin: Crypto }) {
  const outlook = getCoinOutlook(coin, {
    mode: props.mode,
    amount: props.amount,
  })
  const { latestQuote: latest, state } = outlook
  const context = `${props.mode}:${props.amount}:${props.algorithm}:${state}`
  const isCmc = /^[1-9]\d*$/.test(coin.id)
  const eligible =
    isCmc &&
    !props.hiddenCoins &&
    !coin.insufficientHistory &&
    coin.rank <= 10 &&
    state !== 'unavailable'
  const boundary =
    latest &&
    [10, 25, 50, 100, 150, 200, 300]
      .filter((r) => r < latest.rankByMarketCap)
      .at(-1)
  const peer =
    boundary &&
    props.peers
      .find((c) => c.quotes.at(-1)?.rankByMarketCap === boundary)
      ?.quotes.at(-1)
  const capRatio =
    latest &&
    peer &&
    latest.marketCap > 0 &&
    peer.marketCap > latest.marketCap &&
    Math.abs(new Date(peer.date).getTime() - new Date(latest.date).getTime()) <=
      3600000
      ? peer.marketCap / latest.marketCap
      : null
  return (
    <div className="flex flex-col gap-4">
      <div>
        <p className="font-display text-xl">
          {state === 'unavailable' &&
          outlook.unavailableReason === 'stale-quote'
            ? 'Latest quote is stale'
            : labels[state]}
        </p>
        {state !== 'unavailable' && latest && (
          <p className="mt-1 text-sm text-muted-foreground">
            Price {percent(outlook.priceChangePct)} in this selected window;
            market-cap rank #{outlook.quotes[0].rankByMarketCap} → #
            {latest.rankByMarketCap}.
          </p>
        )}
        {state === 'unavailable' && (
          <p className="mt-1 text-sm text-muted-foreground">
            Not enough recent quotes in this window.
          </p>
        )}
        {state === 'extended' && (
          <p className="mt-1 text-sm text-muted-foreground">
            The latest jump is more than twice the typical earlier step.
          </p>
        )}
        {state === 'fading' && (
          <p className="mt-1 text-sm text-muted-foreground">
            Below the starting price and the previous quote.
          </p>
        )}
      </div>
      {state !== 'unavailable' && latest && (
        <>
          <dl className="grid grid-cols-3 gap-3 rounded-lg bg-secondary/40 p-3 text-xs">
            <div>
              <dt className="text-muted-foreground">Latest price</dt>
              <dd className="figure mt-1 text-sm">{price(latest.price)}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Prior sampled high</dt>
              <dd className="figure mt-1 text-sm">
                {price(outlook.priorSampledHigh)}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Prior sampled low</dt>
              <dd className="figure mt-1 text-sm">
                {price(outlook.priorSampledLow)}
              </dd>
            </div>
          </dl>
          <div className="text-sm leading-relaxed">
            <p className="font-medium">What to watch</p>
            <p className="mt-1 text-muted-foreground">
              {latest.price > (outlook.priorSampledHigh ?? Infinity)
                ? `Above ${price(outlook.priorSampledHigh)}. Watch whether it holds.`
                : latest.price < (outlook.priorSampledLow ?? -Infinity)
                  ? `Below ${price(outlook.priorSampledLow)}. Watch for a recovery above it.`
                  : `Watch for a move above ${price(outlook.priorSampledHigh)} or below ${price(outlook.priorSampledLow)}.`}
            </p>
            <p className="mt-2 text-xs text-muted-foreground">
              Earlier saved quotes in this window. Not intraday extremes or
              tested exit levels.
            </p>
          </div>
          {capRatio && (
            <details className="border-t border-border/60 pt-1 text-xs leading-relaxed text-muted-foreground">
              <summary className="cursor-pointer py-3 text-sm">
                Market-cap gap to #{boundary}
              </summary>
              <p>
                #{boundary} has {capRatio.toFixed(2)}× this market cap.
                Equivalent price: {price(latest.price * capRatio)} (
                {percent((capRatio - 1) * 100)}).
              </p>
              <p className="mt-2">
                Assumes unchanged supply and peer market cap. Not a forecast.
              </p>
            </details>
          )}
        </>
      )}
      <HistoricalOutcomes
        key={context}
        context={context}
        mode={props.mode}
        eligible={eligible}
        exchangeFiltered={props.exchangeFiltered}
      />
      {outlook.latestQuoteTime && (
        <p className="text-[11px] text-muted-foreground">
          {isCmc ? 'CoinMarketCap' : 'Saved market quotes'} ·{' '}
          {outlook.latestQuoteTime.replace('T', ' ').slice(0, 16)} UTC
        </p>
      )}
    </div>
  )
}

export function CoinOutlook(props: Props) {
  const coin = props.cryptos.find((c) => c.id === props.selectedId)
  const pinned = props.cryptos.filter((c) => props.highlightedIds.has(c.id))
  const crossings = useMemo(
    () =>
      findRankCrossings(props.cryptos, {
        mode: props.mode,
        amount: props.amount,
        rankings: props.rankings,
      }),
    [props.cryptos, props.mode, props.amount, props.rankings],
  )
  const radar = crossings
    .filter(
      (c, i, all) =>
        all.findIndex((other) => other.crypto.id === c.crypto.id) === i,
    )
    .slice(0, 3)
  const panel = useRef<HTMLElement>(null)
  useEffect(() => {
    if (coin && props.isDesktop) panel.current?.focus({ preventScroll: false })
  }, [coin?.id, props.isDesktop])
  const close = () => {
    props.onClose()
    props.restoreFocus()
  }
  return (
    <div className="mb-5 flex flex-col gap-3">
      {radar.length > 0 && (
        <section
          aria-label="Rank crossings"
          className="flex flex-wrap items-center gap-2 border-b border-border/50 pb-3"
        >
          <div className="mr-2">
            <h2 className="text-sm font-medium">Radar</h2>
            <p className="text-[11px] text-muted-foreground">
              New rank crossings · price rising
            </p>
          </div>
          {radar.map((crossing) => (
            <Button
              key={crossing.crypto.id}
              variant="outline"
              className="min-h-11 gap-2 text-xs"
              onClick={() => props.onSelect(crossing.crypto.id)}
              aria-label={`View outlook for ${crossing.crypto.name}`}
            >
              <span className="font-medium">{crossing.crypto.symbol}</span>
              <span className="text-muted-foreground">
                Entered top {crossing.boundary}
              </span>
              <span className="figure">#{crossing.currentRank}</span>
            </Button>
          ))}
        </section>
      )}
      {pinned.length > 0 ? (
        <div
          className="flex flex-wrap items-center gap-2"
          aria-label="Watched coins"
        >
          <span className="mr-1 text-xs text-muted-foreground">Watching</span>
          {pinned.map((c) => (
            <Button
              key={c.id}
              variant={c.id === coin?.id ? 'secondary' : 'outline'}
              className="min-h-11 gap-2 rounded-full text-xs"
              onClick={() => props.onSelect(c.id)}
              aria-label={`View outlook for ${c.name}`}
              aria-pressed={c.id === coin?.id}
            >
              <Star className="size-3 fill-spotlight text-spotlight" />
              {c.symbol}
              <span className={cn('figure', toneClass(c.total?.pricePct))}>
                {percent(c.total?.pricePct)}
              </span>
            </Button>
          ))}
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">
          Star a coin to keep its Outlook here.
        </p>
      )}
      {coin && props.isDesktop && (
        <section
          ref={panel}
          tabIndex={-1}
          aria-label={`${coin.name} outlook`}
          className="rounded-xl border border-border/60 bg-card/50 p-5 outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <div className="mb-4 flex items-start justify-between gap-3">
            <div>
              <h2 className="font-medium">
                {coin.name}{' '}
                <span className="text-muted-foreground">{coin.symbol}</span>
              </h2>
              <p className="mt-1 text-xs text-muted-foreground">
                {props.algorithmLabel} · {props.amount}{' '}
                {props.mode === 'daily' ? 'days' : 'hours'}
              </p>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="size-11"
              onClick={close}
              aria-label="Close outlook"
            >
              <X className="size-4" />
            </Button>
          </div>
          <OutlookBody key={coin.id} {...props} coin={coin} />
        </section>
      )}
      {!props.isDesktop && (
        <Sheet
          open={!!coin}
          onOpenChange={(open) => {
            if (!open) props.onClose()
          }}
        >
          <SheetContent
            side="bottom"
            className="max-h-[88dvh] overflow-y-auto rounded-t-2xl p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] data-[state=open]:duration-200 data-[state=closed]:duration-150"
            onCloseAutoFocus={(e) => {
              e.preventDefault()
              props.restoreFocus()
            }}
          >
            <SheetTitle className="pr-12">
              {coin?.name}{' '}
              <span className="text-muted-foreground">{coin?.symbol}</span>
            </SheetTitle>
            <SheetDescription>
              {props.algorithmLabel} · {props.amount}{' '}
              {props.mode === 'daily' ? 'days' : 'hours'}
            </SheetDescription>
            {coin && <OutlookBody key={coin.id} {...props} coin={coin} />}
          </SheetContent>
        </Sheet>
      )}
    </div>
  )
}
