import type { OhlcOutlook } from './ohlcAlgorithms'
import type { Exchange, ExchangeEntryUnavailableReason } from './exchangeOhlc'

/** App response: prices belong to the selected exchange; ranks are strategy ranks. */
export type OhlcScreen = {
  exchange: Exchange
  quote_currency: 'USD'
  source_url: string
  volume_description: string
  model_scope: 'unvalidated-market'
  generated_at: string
  fetched_at: string
  source: string
  universe_description: string
  universe_selected_at: string
  universe_size: number
  eligible_count: number
  signal_date: string
  entry_date: string
  hard_exit_date: string
  view_observations: number
  algorithm: string
  unallocated_slots: number
  model_generated_at: string | null
  rows: {
    instrument_key: string
    symbol: string
    rank: number
    score: number
    entry_price: number | null
    entry_unavailable_reason: ExchangeEntryUnavailableReason
    outlook: OhlcOutlook | null
  }[]
}
