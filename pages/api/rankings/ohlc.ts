import type { NextApiRequest, NextApiResponse } from 'next'
import { loadExchangeOhlc } from '@/modules/exchangeOhlc'
import { createOhlcOutlook, rankOhlc, type OhlcModelBundle } from '@/modules/ohlcAlgorithms'
import type { OhlcScreen } from '@/modules/ohlcScreen'

const views = [3, 4, 5, 6, 7, 10, 14, 21, 30, 45, 60, 90]
const methods = ['Momentum', 'Breakout', 'VolumeBreakout']

export const config = { maxDuration: 60 }

export default async function handler(req: NextApiRequest, res: NextApiResponse<OhlcScreen | { error: string }>) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET')
    return res.status(405).json({ error: 'Method not allowed' })
  }
  const rawView = req.query.d ?? '7'
  const method = req.query.algo ?? 'Breakout'
  const exchange = req.query.exchange ?? 'coinbase'
  if (typeof rawView !== 'string' || !/^\d+$/.test(rawView) || !views.includes(Number(rawView)) || typeof method !== 'string' || !methods.includes(method) || (exchange !== 'coinbase' && exchange !== 'kraken')) {
    return res.status(400).json({ error: 'Choose Coinbase or Kraken, a supported daily view and OHLC algorithm' })
  }
  try {
    const source = await loadExchangeOhlc(exchange)
    if (source.exchange !== exchange) throw new Error('Source exchange does not match request')
    // Historical Binance fits have not been validated on either exchange.
    // Use the same level arithmetic with an empty bundle, never those probabilities.
    const modelBundle: OhlcModelBundle = {
      schema_version: 1, hold_days: 30, fits: [], metrics: [],
      source: { exchange, validation: 'No target model validated for this exchange' },
    }
    const view = Number(rawView)
    const request = {
      signal_date: source.signal_date,
      interval_unit: 'day',
      view_observations: view,
      algorithm: method,
      instruments: source.instruments,
    }
    const ranking = rankOhlc(request)
    const byIdentity = new Map(source.instruments.map((instrument) => [instrument.instrument_key, instrument]))
    const rows = ranking.selected.map((selected, index) => {
      const instrument = byIdentity.get(selected.instrument_key)
      if (!instrument) throw new Error('Selected instrument is missing from source')
      if (selected.score == null) throw new Error('Selected instrument has no score')
      const outlook = instrument.entry_price == null ? null : createOhlcOutlook({
        ...instrument,
        ...request,
        hold_days: 30,
        entry_date: source.entry_date,
        entry_price: instrument.entry_price,
      }, modelBundle)
      if (outlook && 'zones' in outlook) {
        outlook.sell_plan.type = 'evaluated-reference-only'
        outlook.sell_plan.evidence = '30-day reference only. This exit policy has not been backtested on this exchange universe.'
        for (const zone of outlook.zones) {
          zone.model_status = 'unvalidated-market'
          zone.execution = 'Hypothetical reference: a close-confirmed trigger would exit at the open two days later, capped at the 30-day deadline. This rule has not been backtested on this exchange.'
          zone.retrospective_validation = { availability: 'Not evaluated on this exchange', metrics: null }
        }
      }
      return {
        instrument_key: selected.instrument_key,
        symbol: instrument.symbol,
        rank: index + 1,
        score: selected.score,
        entry_price: instrument.entry_price,
        entry_unavailable_reason: instrument.entry_unavailable_reason,
        outlook,
      }
    })
    const hardExit = new Date(`${source.entry_date}T00:00:00.000Z`)
    hardExit.setUTCDate(hardExit.getUTCDate() + 30)
    const screen: OhlcScreen = {
      exchange,
      quote_currency: source.quote_currency,
      source_url: source.source_url,
      volume_description: source.volume_description,
      model_scope: 'unvalidated-market',
      generated_at: new Date().toISOString(),
      fetched_at: source.fetched_at,
      source: source.source,
      universe_description: source.universe_description,
      universe_selected_at: source.universe_selected_at,
      universe_size: source.instruments.length,
      eligible_count: ranking.universe_assessments.filter((row) => row.eligible).length,
      signal_date: source.signal_date,
      entry_date: source.entry_date,
      hard_exit_date: hardExit.toISOString().slice(0, 10),
      view_observations: view,
      algorithm: method,
      unallocated_slots: ranking.unallocated_slots,
      model_generated_at: null,
      rows,
    }
    // The provider deduplicates/caches the full universe. Avoid serving a screen
    // across the UTC date boundary through an independently stale CDN response.
    res.setHeader('Cache-Control', 'no-store')
    return res.status(200).json(screen)
  } catch (error: unknown) {
    console.error({ event: 'ohlc_screen_failed', reason: error instanceof Error ? error.message : 'Unknown failure' })
    return res.status(503).json({ error: 'The complete OHLC screen is unavailable. Try again shortly.' })
  }
}
