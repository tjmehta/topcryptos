import { breakoutsJsonLd, rankingsJsonLd } from '../PageSummary'

import type { BreakoutSummary, RankingSummary } from '@/modules/rankingSummary'

const types = (graph: Record<string, unknown>[]) => graph.map((node) => node['@type'])

const breakouts = (entries: BreakoutSummary['entries']): BreakoutSummary => ({
  kind: 'breakouts',
  exchange: 'coinbase',
  view: 7,
  signalDate: '2026-11-21',
  fetchedAt: '2026-11-23T06:14:36.899Z',
  fetchedAtLabel: '2026-11-23 06:14 UTC',
  universeSize: 50,
  eligibleCount: 42,
  entries,
})

const rankings: RankingSummary = {
  kind: 'rankings',
  mode: 'daily',
  window: 10,
  asOf: '2026-11-23T06:05:00.000Z',
  asOfLabel: '2026-11-23 06:05 UTC',
  scoredCount: 1,
  entries: [{ position: 1, name: 'Alpha', symbol: 'ALP', pricePct: 12, startRank: 9, endRank: 7 }],
}

describe('page summary JSON-LD graphs', () => {
  it('keeps a ranking description on /breakouts when no pair qualifies', () => {
    const graph = breakoutsJsonLd(breakouts([]))
    expect(types(graph)).toEqual(['WebSite', 'Dataset', 'ItemList'])
    expect(graph[2]).toMatchObject({ numberOfItems: 0, itemListElement: [] })
    expect(graph[1]).toMatchObject({ dateModified: '2026-11-23T06:14:36.899Z', isAccessibleForFree: true })
  })

  it('lists breakout signals in rank order', () => {
    const graph = breakoutsJsonLd(breakouts([{ position: 1, symbol: 'VVV-USD', abovePriorHighPct: 5 }]))
    expect(graph[2]).toMatchObject({ numberOfItems: 1, itemListElement: [{ position: 1, name: 'VVV-USD' }] })
  })

  it('still describes the ranking as a Dataset when the build could not load data', () => {
    expect(types(breakoutsJsonLd(null))).toEqual(['WebSite', 'Dataset'])
    expect(types(rankingsJsonLd('hourly', null))).toEqual(['WebSite', 'Dataset'])
    expect(types(rankingsJsonLd('daily', null))).toEqual(['WebSite', 'Dataset', 'FAQPage'])
  })

  it('adds the scored top entries and, on Daily, the FAQ', () => {
    const graph = rankingsJsonLd('daily', rankings)
    expect(types(graph)).toEqual(['WebSite', 'Dataset', 'ItemList', 'FAQPage'])
    expect(graph[2]).toMatchObject({ numberOfItems: 1, itemListElement: [{ position: 1, name: 'Alpha (ALP)' }] })
    expect(types(rankingsJsonLd('hourly', { ...rankings, mode: 'hourly', window: 6 }))).toEqual(['WebSite', 'Dataset', 'ItemList'])
  })

  it('describes rank acceleration, not rank level, as the 10% input', () => {
    const text = JSON.stringify([rankingsJsonLd('daily', rankings), breakoutsJsonLd(null)])
    expect(text).not.toMatch(/improving market-cap rank/i)
    expect(text).not.toMatch(/latest completed daily close/i)
    expect(text).toMatch(/market-cap rank acceleration/)
  })
})
