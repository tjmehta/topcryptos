import { SITE_ORIGIN, canonicalUrl } from './site'

/*
 * Server-rendered page summaries. Ranking pages score in the browser, so the
 * HTML a crawler or AI engine fetches used to carry only the page chrome. Each
 * page's getStaticProps builds one of these from cron-written snapshots and the
 * page renders it as plain text plus JSON-LD. Everything here is serializable
 * page props: timestamps are preformatted UTC strings so server and client
 * render byte-identical text.
 */

export const SUMMARY_SIZE = 10

export type RankingSummaryEntry = {
  position: number
  name: string
  symbol: string
  /** price change over the window, in percent */
  pricePct: number | null
  startRank: number | null
  endRank: number | null
}

export type RankingSummary = {
  kind: 'rankings'
  mode: 'daily' | 'hourly'
  /** default window the page opens with, in days or hours */
  window: number
  /** newest snapshot used, ISO */
  asOf: string
  asOfLabel: string
  scoredCount: number
  entries: RankingSummaryEntry[]
}

export type BreakoutSummaryEntry = {
  position: number
  symbol: string
  /** close above the prior high of the viewed candles, in percent */
  abovePriorHighPct: number
}

export type BreakoutSummary = {
  kind: 'breakouts'
  exchange: 'coinbase' | 'kraken'
  view: number
  signalDate: string
  fetchedAt: string
  fetchedAtLabel: string
  universeSize: number
  eligibleCount: number
  entries: BreakoutSummaryEntry[]
}

/** "2026-11-23 05:00 UTC" — fixed format, no locale, so hydration matches. */
export function utcLabel(iso: string): string {
  const date = new Date(iso)
  if (!Number.isFinite(date.valueOf())) return iso
  return `${date.toISOString().slice(0, 16).replace('T', ' ')} UTC`
}

/** Breakout score is ln(close / prior high); report it as a percentage. */
export function abovePriorHighPct(score: number): number {
  return (Math.exp(score) - 1) * 100
}

// --- JSON-LD -----------------------------------------------------------------

type JsonLd = Record<string, unknown>

export function websiteJsonLd(): JsonLd {
  return {
    '@type': 'WebSite',
    '@id': `${SITE_ORIGIN}/#website`,
    name: 'Top Cryptos',
    url: `${SITE_ORIGIN}/`,
    description:
      'Free cryptocurrency momentum rankings: daily and hourly leaderboards scored from price momentum, price acceleration and market-cap rank acceleration, plus a Coinbase and Kraken breakout screen.',
    inLanguage: 'en',
  }
}

export function itemListJsonLd(opts: {
  path: string
  name: string
  description: string
  items: string[]
}): JsonLd {
  return {
    '@type': 'ItemList',
    name: opts.name,
    description: opts.description,
    url: canonicalUrl(opts.path),
    itemListOrder: 'https://schema.org/ItemListOrderDescending',
    numberOfItems: opts.items.length,
    itemListElement: opts.items.map((name, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name,
    })),
  }
}

export function datasetJsonLd(opts: {
  path: string
  name: string
  description: string
  /** ISO time of the data the page was generated from, when known */
  dateModified: string | null
}): JsonLd {
  return {
    '@type': 'Dataset',
    name: opts.name,
    description: opts.description,
    url: canonicalUrl(opts.path),
    isAccessibleForFree: true,
    creator: { '@type': 'Organization', name: 'Top Cryptos', url: `${SITE_ORIGIN}/` },
    ...(opts.dateModified ? { dateModified: opts.dateModified } : {}),
  }
}

export function faqJsonLd(faq: ReadonlyArray<{ q: string; a: string }>): JsonLd {
  return {
    '@type': 'FAQPage',
    mainEntity: faq.map(({ q, a }) => ({
      '@type': 'Question',
      name: q,
      acceptedAnswer: { '@type': 'Answer', text: a },
    })),
  }
}

/**
 * Serialize for a <script type="application/ld+json"> body. Coin names come
 * from a third-party feed, so escape `<` (and the line separators JSON allows
 * but script parsing may not) to keep a hostile name from closing the tag.
 */
export function serializeJsonLd(graph: JsonLd[]): string {
  return JSON.stringify({ '@context': 'https://schema.org', '@graph': graph })
    .replace(/</g, '\\u003c')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029')
}
