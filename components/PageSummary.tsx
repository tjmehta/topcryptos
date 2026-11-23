import {
  type BreakoutSummary,
  type RankingSummary,
  faqJsonLd,
  itemListJsonLd,
  serializeJsonLd,
  websiteJsonLd,
} from '@/modules/rankingSummary'

import Head from 'next/head'

/*
 * Plain-text description of what each page ranks, how, and the current top
 * entries, rendered from getStaticProps so it is in the HTML that search and AI
 * crawlers fetch. Every figure comes from props (never Date.now() or locale
 * formatting at render), so the hydrated page matches the server HTML.
 *
 * Claims here must stay true of the shipping code: universe and weights mirror
 * /api/rankings/* and processRankings; breakout rules mirror ohlcAlgorithms.
 */

const UNIVERSE =
  'the 500 largest cryptocurrencies by market cap, counting only coins worth more than $10 million'

const CLASSIC =
  'The default Classic score combines three signed percentile ranks: price momentum (70%, the price change spread over the whole window), price acceleration (20%) and improving market-cap rank (10%, whether a coin is climbing the market-cap ranking faster).'

const NOT_ADVICE =
  'These rankings describe past price data. They are not investment advice or a forecast of future returns.'

// Plain ASCII signs (d3's formatter emits U+2212), and no d3 in this bundle.
function percent(value: number): string {
  return `${value > 0 ? '+' : ''}${value.toFixed(2)}%`
}

function coinList(summary: RankingSummary | null, count = 3): string | null {
  if (!summary || summary.entries.length === 0) return null
  return summary.entries
    .slice(0, count)
    .map((e) => `${e.name} (${e.symbol})`)
    .join(', ')
}

function faq(daily: RankingSummary | null): { q: string; a: string }[] {
  const leaders = daily?.mode === 'daily' ? coinList(daily) : null
  return [
    {
      q: 'Which cryptocurrencies have the strongest price momentum over the last 10 days?',
      a: `Top Cryptos ranks ${UNIVERSE}, over a 10-day window by default. ${
        leaders
          ? `As of ${daily!.asOfLabel}, the highest Classic scores were ${leaders}. `
          : ''
      }The order changes as new hourly snapshots arrive, so open topcryptos.io for the current list and every coin's score.`,
    },
    {
      q: "What's a free website that ranks cryptocurrencies by momentum?",
      a: 'Top Cryptos (topcryptos.io) is free and needs no account. It ranks coins by Classic score, built from price momentum, acceleration and improving market-cap rank, and also offers Momentum, Trend quality, Cumulative and Hybrid methods over windows of 3 to 90 days or 3 to 24 hours.',
    },
    {
      q: 'Is there a free crypto breakout scanner?',
      a: 'Yes. The Breakouts page (topcryptos.io/breakouts) screens the top 50 Coinbase or Kraken USD spot pairs by rolling 24-hour dollar volume. A pair qualifies when its latest completed daily close is above the highest high of the earlier candles in the chosen view (3 to 90 daily candles). It lists up to 10 signals with reference target and stop levels, which have not been backtested on these exchanges.',
    },
    {
      q: 'Where can I see hourly top-performing cryptocurrencies?',
      a: 'The Hourly page (topcryptos.io/hourly) ranks the same coins over the last 3 to 24 hours, 6 hours by default, using hourly CoinMarketCap snapshots. It reloads every five minutes while the tab is visible.',
    },
    {
      q: 'How can I find coins whose market cap rank is improving?',
      a: "Improving market-cap rank is one of the three inputs to the Classic score on the Daily and Hourly pages. On a wide screen, the rankings table has a Rank Δ column showing how many places each coin's market-cap rank moved over the window; sort by it to see the biggest climbers first.",
    },
  ]
}

function JsonLd({ graph }: { graph: Record<string, unknown>[] }) {
  return (
    <Head>
      <script
        key="jsonld"
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: serializeJsonLd(graph) }}
      />
    </Head>
  )
}

function Faq({ items }: { items: { q: string; a: string }[] }) {
  return (
    <div className="flex flex-col gap-3">
      <h2 className="font-medium text-foreground">Questions</h2>
      <dl className="flex flex-col gap-3">
        {items.map(({ q, a }) => (
          <div key={q}>
            <dt className="font-medium text-foreground">{q}</dt>
            <dd className="mt-1">{a}</dd>
          </div>
        ))}
      </dl>
    </div>
  )
}

function rankMove(e: RankingSummary['entries'][number]): string | null {
  if (e.startRank == null || e.endRank == null) return null
  if (e.startRank === e.endRank) return `market-cap rank #${e.endRank}, unchanged`
  return `market-cap rank #${e.startRank} → #${e.endRank}`
}

export function RankingsSummary({ mode, summary }: { mode: 'daily' | 'hourly'; summary: RankingSummary | null }) {
  const path = mode === 'daily' ? '/' : '/hourly'
  const unit = mode === 'daily' ? 'days' : 'hours'
  const window = summary?.window ?? (mode === 'daily' ? 10 : 6)
  const listName = `Top cryptocurrencies by ${mode} momentum (${window} ${unit})`
  const listDescription = summary
    ? `Highest Classic scores over ${window} ${unit} as of ${summary.asOfLabel}, among ${UNIVERSE}.`
    : `Highest Classic scores over ${window} ${unit}, among ${UNIVERSE}.`
  const items = faq(mode === 'daily' ? summary : null)
  const graph: Record<string, unknown>[] = [websiteJsonLd()]
  if (summary && summary.entries.length > 0) {
    graph.push(
      itemListJsonLd({
        path,
        name: listName,
        description: listDescription,
        items: summary.entries.map((e) => `${e.name} (${e.symbol})`),
      }),
    )
  }
  if (mode === 'daily') graph.push(faqJsonLd(items))

  return (
    <section
      aria-labelledby="about-rankings"
      className="mt-10 flex flex-col gap-6 border-t border-border/50 pt-6 text-sm leading-relaxed text-muted-foreground [&_p]:max-w-3xl"
    >
      <JsonLd graph={graph} />
      <div className="flex flex-col gap-3">
        <h2 id="about-rankings" className="font-medium text-foreground">
          About these {mode} rankings
        </h2>
        <p>
          This page ranks {UNIVERSE}, by how strongly each has moved over the
          selected window: {window} {unit} by default, adjustable from 3 to{' '}
          {mode === 'daily' ? '90 days' : '24 hours'}. Windows count UTC{' '}
          {mode === 'daily' ? 'calendar days' : 'hours'}, including the current
          partial one. Prices, market caps and ranks come from CoinMarketCap
          listings saved every hour.
        </p>
        <p>
          {CLASSIC} Coins with too little history in the window (fewer than
          three snapshots, under half the window, or long gaps) are marked as
          having insufficient history instead of being ranked.
        </p>
      </div>

      {summary && summary.entries.length > 0 && (
        <div className="flex flex-col gap-3">
          <h2 className="font-medium text-foreground">
            Top {summary.entries.length} by Classic score over {window} {unit}
          </h2>
          <p>
            As of {summary.asOfLabel}, from the newest saved snapshot;{' '}
            {summary.scoredCount} coins had enough history to score. The table
            above updates with the latest prices.
          </p>
          <ol className="flex list-decimal flex-col gap-1 pl-5">
            {summary.entries.map((e) => {
              const move = rankMove(e)
              return (
                <li key={`${e.position}-${e.symbol}`}>
                  <span className="text-foreground">
                    {e.name} ({e.symbol})
                  </span>
                  {e.pricePct != null && `: ${percent(e.pricePct)} price change`}
                  {move && `, ${move}`}
                </li>
              )
            })}
          </ol>
        </div>
      )}

      <p>{NOT_ADVICE}</p>
      <Faq items={items} />
    </section>
  )
}

export function BreakoutsSummary({ summary }: { summary: BreakoutSummary | null }) {
  const items = faq(null)
  const graph: Record<string, unknown>[] = [websiteJsonLd()]
  if (summary && summary.entries.length > 0) {
    graph.push(
      itemListJsonLd({
        path: '/breakouts',
        name: `Coinbase USD breakout signals (${summary.view} daily candles)`,
        description: `Coinbase USD spot pairs whose ${summary.signalDate} daily close was above the highest high of the previous ${summary.view - 1} daily candles, strongest first.`,
        items: summary.entries.map((e) => e.symbol),
      }),
    )
  }

  return (
    <section
      aria-labelledby="about-breakouts"
      className="mt-10 flex flex-col gap-6 border-t border-border/50 pt-6 text-sm leading-relaxed text-muted-foreground [&_p]:max-w-3xl"
    >
      <JsonLd graph={graph} />
      <div className="flex flex-col gap-3">
        <h2 id="about-breakouts" className="font-medium text-foreground">
          About this breakout screen
        </h2>
        <p>
          This page screens the current top 50 Coinbase or Kraken USD spot pairs
          by estimated rolling 24-hour dollar volume, excluding stablecoins and
          fiat, using each exchange&apos;s public daily candles. A pair is
          eligible with 60 consecutive complete daily candles and a median daily
          dollar volume of at least $1 million over the previous 20 days.
        </p>
        <p>
          The default Breakout method scores how far the latest completed daily
          close sits above the highest high of the earlier candles in the view
          (7 daily candles by default, adjustable from 3 to 90) and keeps up to
          10 pairs with a positive score. Volume breakout also requires that
          day&apos;s volume to be at least 1.5 times the 20-day median; Momentum
          ranks the price change across the view. Target and stop levels are
          references from an earlier Binance study and have not been backtested
          on these exchanges.
        </p>
      </div>

      {summary && (
        <div className="flex flex-col gap-3">
          <h2 className="font-medium text-foreground">
            Coinbase breakouts for {summary.signalDate}
          </h2>
          <p>
            Daily close of {summary.signalDate} (UTC), prices fetched{' '}
            {summary.fetchedAtLabel}; {summary.eligibleCount} of{' '}
            {summary.universeSize} pairs were eligible.{' '}
            {summary.entries.length === 0 &&
              'No pair closed above its prior high in this view.'}
          </p>
          {summary.entries.length > 0 && (
            <ol className="flex list-decimal flex-col gap-1 pl-5">
              {summary.entries.map((e) => (
                <li key={e.symbol}>
                  <span className="text-foreground">{e.symbol}</span>: closed{' '}
                  {e.abovePriorHighPct.toFixed(2)}% above the prior{' '}
                  {summary.view - 1}-day high
                </li>
              ))}
            </ol>
          )}
        </div>
      )}

      <p>{NOT_ADVICE}</p>
      <Faq items={items} />
    </section>
  )
}
