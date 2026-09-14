/** Pure port of the verified daily OHLC research model. No network or orders. */
export const OHLC_METHODS = ['Momentum', 'Breakout', 'VolumeBreakout'] as const
export const OHLC_VIEWS = [3, 4, 5, 6, 7, 10, 14, 21, 30, 45, 60, 90] as const
export const OHLC_POLICIES = ['SMAATRBracket', 'ResistanceSMAATR'] as const
export type OhlcMethod = (typeof OHLC_METHODS)[number]
export type OhlcView = (typeof OHLC_VIEWS)[number]
export type OhlcPolicy = (typeof OHLC_POLICIES)[number]
export type OhlcDay = string & { readonly __ohlcDay: unique symbol }
export type OhlcJson =
  null | boolean | number | string | OhlcJson[] | OhlcMetadata
export type OhlcMetadata = { [key: string]: OhlcJson }
export type OhlcBar = {
  date: string
  instrument_key: string
  open: number
  high: number
  low: number
  close: number
  quote_volume: number
  bar_status: 'complete'
}
export type OhlcInstrument = {
  instrument_key: string
  symbol?: string
  cohort_member: boolean
  bars: readonly OhlcBar[]
}
export type OhlcWindow = {
  signal_date: string
  view_observations: OhlcView
  interval_unit?: 'day'
}
export type OhlcRankRequest = OhlcWindow & {
  algorithm?: OhlcMethod
  instruments: readonly OhlcInstrument[]
}
export type OhlcOutlookRequest = OhlcWindow &
  OhlcInstrument & {
    algorithm?: OhlcMethod
    hold_days?: number
    entry_date: string
    entry_price: number
  }
export type OhlcFeatures = [number, number, number, number, number]
export type OhlcFit = {
  fit_id: string
  policy: OhlcPolicy
  cutoff: OhlcDay
  latest_training_exit: OhlcDay
  training_n: number
  baseline_probability: number
  scaler_mean: OhlcFeatures
  scaler_scale: OhlcFeatures
  coefficients: OhlcFeatures
  intercept: number
}
export type OhlcValidationMetric = OhlcMetadata & {
  policy: OhlcPolicy
  population: string
  period: string
  events: number
  known: number
  model_brier?: number
  baseline_brier?: number
}
export type OhlcModelBundle = {
  schema_version: 1
  hold_days: 30
  fits: OhlcFit[]
  metrics: OhlcValidationMetric[]
  source: OhlcMetadata
}
export type OhlcScores = { [Method in OhlcMethod]: number | null }
export type OhlcFormation = {
  identity: string
  signal: OhlcDay
  view: OhlcView
  bars: OhlcBar[]
  eligible: boolean
  scores: OhlcScores
}
export type OhlcAssessment = {
  instrument_key: string
  eligible: boolean
  score: number | null
}
export type OhlcRanking = {
  status: 'research-ranking'
  algorithm: OhlcMethod
  signal_date: OhlcDay
  view_observations: OhlcView
  formation_elapsed_days: number
  selected: OhlcAssessment[]
  unallocated_slots: number
  allocation_per_selected: 0.1
  universe_assessments: OhlcAssessment[]
  scope: string
}
export type OhlcLevels = {
  atr_sma14: number | null
  prior20_resistance: number | null
}
export type OhlcZone = {
  policy: OhlcPolicy
  level_source_date: OhlcDay
  entry_price: number
  atr_sma14: number
  prior20_resistance: number
  target: number
  stop: number
  target_return: number
  stop_return: number
  probability: number | null
  model_status: 'available' | 'no-exact-month-model' | 'unusable-geometry' | 'unvalidated-market'
  fit_id: string | null
  model_cutoff: OhlcDay | null
  latest_training_exit: OhlcDay | null
  training_events: number | null
  historical_rate: number | null
  event: string
  retrospective_validation: {
    availability: string
    metrics: OhlcValidationMetric | null
  }
  execution: string
}
type OutlookBase = {
  instrument_key: string
  algorithm: OhlcMethod
  signal_date: OhlcDay
  entry_date: OhlcDay
  entry_price: number
  view_observations: OhlcView
  formation_elapsed_days: number
  holding_days: 30
  hard_exit_date: OhlcDay
  eligible: boolean
  ranking_scores: OhlcScores
  qualifies_for_algorithm: boolean
  selection_scope: string
  bundle_provenance: OhlcMetadata
  sell_plan: {
    type: 'research-candidate' | 'evaluated-reference-only'
    days_after_entry: 30
    automatic_level_exit: false
    evidence: string
  }
}
export type OhlcOutlook =
  | {
      status: 'unsupported-horizon'
      requested_hold_days: number
      target_probability: null
      reason: string
    }
  | (OutlookBase & {
      status: 'ineligible-history-or-liquidity' | 'no-qualifying-signal'
      target_probability: null
      zones: []
    })
  | (OutlookBase & { status: 'research-outlook'; zones: OhlcZone[] })

const DAY_MS = 86_400_000
function object(value: unknown, name: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    throw new Error(`${name} must be an object`)
  return value as Record<string, unknown>
}
function array(value: unknown, name: string): unknown[] {
  if (!Array.isArray(value)) throw new Error(`${name} must be an array`)
  return value
}
function text(value: unknown, name: string): string {
  if (typeof value !== 'string') throw new Error(`${name} must be a string`)
  return value
}
function finite(value: unknown, name: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value))
    throw new Error(`${name} must be finite`)
  return value
}
function nonnegative(value: unknown, name: string): number {
  const result = finite(value, name)
  if (result < 0) throw new Error(`${name} must be nonnegative`)
  return result
}
function positive(value: unknown, name: string): number {
  const result = finite(value, name)
  if (result <= 0) throw new Error(`${name} must be positive`)
  return result
}
function integer(value: unknown, name: string): number {
  const result = finite(value, name)
  if (!Number.isInteger(result)) throw new Error(`${name} must be an integer`)
  return result
}
export function parseOhlcDate(value: unknown): OhlcDay {
  const day = text(value, 'date')
  const parsed = Date.parse(`${day}T00:00:00.000Z`)
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(day) ||
    day.startsWith('0000') ||
    !Number.isFinite(parsed) ||
    new Date(parsed).toISOString().slice(0, 10) !== day
  ) {
    throw new Error('Date must be a valid YYYY-MM-DD UTC date')
  }
  return day as OhlcDay
}
function daysAfter(day: OhlcDay, count: number): OhlcDay {
  return parseOhlcDate(
    new Date(Date.parse(`${day}T00:00:00Z`) + count * DAY_MS)
      .toISOString()
      .slice(0, 10),
  )
}
function method(value: unknown): OhlcMethod {
  if (value === undefined) return 'Breakout'
  for (const candidate of OHLC_METHODS)
    if (candidate === value) return candidate
  throw new Error('Unsupported OHLC algorithm')
}
function policy(value: unknown): OhlcPolicy {
  for (const candidate of OHLC_POLICIES)
    if (candidate === value) return candidate
  throw new Error('Unsupported sell policy')
}
function window(value: Record<string, unknown>) {
  if (value.interval_unit !== undefined && value.interval_unit !== 'day')
    throw new Error('Daily bars only')
  const signal = parseOhlcDate(value.signal_date)
  for (const view of OHLC_VIEWS)
    if (view === value.view_observations) return { signal, view }
  throw new Error('Unsupported number of viewed observations')
}
function median(values: readonly number[]): number {
  if (!values.length) throw new Error('Median requires observations')
  const sorted = [...values].sort((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2
    ? sorted[middle]
    : (sorted[middle - 1] + sorted[middle]) / 2
}
function consecutive(bars: readonly OhlcBar[], count: number): boolean {
  if (bars.length < count) return false
  const slice = bars.slice(-count)
  return slice.every(
    (bar, i) =>
      i === 0 || bar.date === daysAfter(parseOhlcDate(slice[i - 1].date), 1),
  )
}

/** Validates wire input and discards future rows before reading their prices. */
export function formOhlc(value: unknown): OhlcFormation {
  const request = object(value, 'formation')
  const { signal, view } = window(request)
  const identity = text(request.instrument_key, 'instrument_key')
  if (!identity.startsWith(`${signal.slice(0, 4)}:`))
    throw new Error('Preserve the signal-year instrument identity')
  if (typeof request.cohort_member !== 'boolean')
    throw new Error('cohort_member must be explicit')
  const seen = new Set<string>()
  const bars: OhlcBar[] = []
  for (const item of array(request.bars, 'bars')) {
    const row = object(item, 'bar')
    const day = parseOhlcDate(row.date)
    if (day > signal) continue
    if (seen.has(day)) throw new Error('Duplicate historical date')
    seen.add(day)
    if (row.instrument_key !== identity)
      throw new Error('History must preserve one annual instrument identity')
    if (row.bar_status !== 'complete')
      throw new Error('Only complete bars; do not fill gaps')
    const open = positive(row.open, 'open'),
      high = positive(row.high, 'high')
    const low = positive(row.low, 'low'),
      close = positive(row.close, 'close')
    if (
      low > Math.min(open, close) ||
      high < Math.max(open, close) ||
      low > high
    )
      throw new Error('Inconsistent OHLC prices')
    bars.push({
      date: day,
      instrument_key: identity,
      open,
      high,
      low,
      close,
      quote_volume: nonnegative(row.quote_volume, 'quote_volume'),
      bar_status: 'complete',
    })
  }
  bars.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
  const last = bars.at(-1)
  const eligible = Boolean(
    last &&
    last.date === signal &&
    request.cohort_member &&
    consecutive(bars, 60) &&
    consecutive(bars, view) &&
    median(bars.slice(-21, -1).map((b) => b.quote_volume)) >= 1_000_000,
  )
  const scores: OhlcScores = {
    Momentum: null,
    Breakout: null,
    VolumeBreakout: null,
  }
  if (eligible && last) {
    const viewed = bars.slice(-view)
    const momentum = Math.log(last.close) - Math.log(viewed[0].close)
    const reference = Math.max(...viewed.slice(0, -1).map((b) => b.high))
    const breakout = Math.log(last.close / reference)
    finite(momentum, 'momentum')
    finite(breakout, 'breakout')
    scores.Momentum = momentum > 0 ? momentum : null
    scores.Breakout = breakout > 0 ? breakout : null
    scores.VolumeBreakout =
      breakout > 0 &&
      last.quote_volume >=
        1.5 * median(bars.slice(-21, -1).map((b) => b.quote_volume))
        ? breakout
        : null
  }
  return { identity, signal, view, bars, eligible, scores }
}

export function rankOhlc(value: unknown): OhlcRanking {
  const request = object(value, 'ranking')
  const { signal, view } = window(request)
  const algorithm = method(request.algorithm)
  const identities = new Set<string>()
  const rows = array(request.instruments, 'instruments').map((input) => {
    const f = formOhlc({
      ...object(input, 'instrument'),
      signal_date: signal,
      view_observations: view,
      interval_unit: 'day',
    })
    if (identities.has(f.identity))
      throw new Error('Duplicate instrument identity')
    identities.add(f.identity)
    return {
      instrument_key: f.identity,
      eligible: f.eligible,
      score: f.scores[algorithm],
    }
  })
  const selected = rows
    .filter((r) => r.score !== null)
    .sort((a, b) => {
      const delta = (b.score ?? 0) - (a.score ?? 0)
      return (
        delta ||
        (a.instrument_key < b.instrument_key
          ? -1
          : a.instrument_key > b.instrument_key
            ? 1
            : 0)
      )
    })
    .slice(0, 10)
  return {
    status: 'research-ranking',
    algorithm,
    signal_date: signal,
    view_observations: view,
    formation_elapsed_days: view - 1,
    selected,
    unallocated_slots: 10 - selected.length,
    allocation_per_selected: 0.1,
    universe_assessments: rows,
    scope:
      'Ranks supplied annual-cohort universe only; does not verify provider membership or place orders',
  }
}

/** Calendar-consecutive SMA ATR14 and prior-20 resistance; signal high excluded. */
export function ohlcLevels(formation: OhlcFormation): OhlcLevels {
  const byDay = new Map(formation.bars.map((b) => [b.date, b]))
  const recent = Array.from({ length: 15 }, (_, i) =>
    byDay.get(daysAfter(formation.signal, -i)),
  )
  let atr: number | null = null
  if (recent.every((b) => b !== undefined)) {
    let sum = 0
    for (let i = 0; i < 14; i++) {
      const current = recent[i],
        previous = recent[i + 1]
      if (!current || !previous) throw new Error('Incomplete ATR history')
      sum += Math.max(
        current.high - current.low,
        Math.abs(current.high - previous.close),
        Math.abs(current.low - previous.close),
      )
    }
    atr = finite(sum / 14, 'ATR')
  }
  const prior = Array.from({ length: 20 }, (_, i) =>
    byDay.get(daysAfter(formation.signal, -i - 1)),
  )
  const resistance = prior.every((b) => b !== undefined)
    ? Math.max(...prior.map((b) => b?.high ?? 0))
    : null
  return { atr_sma14: atr, prior20_resistance: resistance }
}

function jsonValue(value: unknown): OhlcJson {
  if (value === null || typeof value === 'string' || typeof value === 'boolean')
    return value
  if (typeof value === 'number') return finite(value, 'metadata number')
  if (Array.isArray(value)) return value.map(jsonValue)
  return metadata(value)
}
function metadata(value: unknown): OhlcMetadata {
  return Object.fromEntries(
    Object.entries(object(value, 'metadata')).map(([key, item]) => [
      key,
      jsonValue(item),
    ]),
  )
}
function vector(value: unknown, name: string): OhlcFeatures {
  const xs = array(value, name)
  if (xs.length !== 5) throw new Error('Model requires five features')
  return [
    finite(xs[0], name),
    finite(xs[1], name),
    finite(xs[2], name),
    finite(xs[3], name),
    finite(xs[4], name),
  ]
}
/** Parse once at the server boundary; callers own artifact hash/provenance checks. */
export function parseOhlcModelBundle(value: unknown): OhlcModelBundle {
  const raw = object(value, 'model bundle')
  if (raw.schema_version !== 1 || raw.hold_days !== 30)
    throw new Error('Unsupported model schema/horizon')
  const seen = new Set<string>()
  const fits = array(raw.fits, 'fits').map((input) => {
    const fit = object(input, 'fit')
    const cutoff = parseOhlcDate(fit.cutoff),
      latest = parseOhlcDate(fit.latest_training_exit)
    if (!cutoff.endsWith('-01') || latest >= cutoff)
      throw new Error('Training violates full-horizon maturity')
    const fitPolicy = policy(fit.policy),
      fitId = text(fit.fit_id, 'fit_id')
    if (fitId !== `${fitPolicy}:${cutoff}` || seen.has(fitId))
      throw new Error('Invalid or duplicate fit identity')
    seen.add(fitId)
    const scale = vector(fit.scaler_scale, 'scale')
    if (scale.some((x) => x <= 0))
      throw new Error('Model scales must be positive')
    const count = integer(fit.training_n, 'training_n')
    const baseline = nonnegative(
      fit.baseline_probability,
      'baseline probability',
    )
    if (count < 200 || baseline > 1)
      throw new Error('Invalid model support/probability')
    return {
      fit_id: fitId,
      policy: fitPolicy,
      cutoff,
      latest_training_exit: latest,
      training_n: count,
      baseline_probability: baseline,
      scaler_mean: vector(fit.scaler_mean, 'mean'),
      scaler_scale: scale,
      coefficients: vector(fit.coefficients, 'coefficients'),
      intercept: finite(fit.intercept, 'intercept'),
    }
  })
  const metrics = array(raw.metrics, 'metrics').map((input) => {
    const metric = object(input, 'metric')
    return {
      ...metadata(metric),
      policy: policy(metric.policy),
      population: text(metric.population, 'population'),
      period: text(metric.period, 'period'),
      events: nonnegative(metric.events, 'events'),
      known: nonnegative(metric.known, 'known'),
      ...(metric.model_brier === undefined
        ? {}
        : { model_brier: nonnegative(metric.model_brier, 'model_brier') }),
      ...(metric.baseline_brier === undefined
        ? {}
        : {
            baseline_brier: nonnegative(
              metric.baseline_brier,
              'baseline_brier',
            ),
          }),
    }
  })
  return {
    schema_version: 1,
    hold_days: 30,
    fits,
    metrics,
    source: metadata(raw.source),
  }
}

export function ohlcProbability(features: OhlcFeatures, fit: OhlcFit): number {
  const z =
    fit.intercept +
    features.reduce(
      (sum, x, i) =>
        sum +
        ((x - fit.scaler_mean[i]) / fit.scaler_scale[i]) * fit.coefficients[i],
      0,
    )
  finite(z, 'Model numerical range')
  return z >= 0 ? 1 / (1 + Math.exp(-z)) : Math.exp(z) / (1 + Math.exp(z))
}

export function createOhlcOutlook(
  value: unknown,
  bundle: OhlcModelBundle,
): OhlcOutlook {
  const request = object(value, 'outlook')
  const hold = integer(
    request.hold_days === undefined ? 30 : request.hold_days,
    'hold_days',
  )
  if (hold !== 30)
    return {
      status: 'unsupported-horizon',
      requested_hold_days: hold,
      target_probability: null,
      reason: 'This daily-entry model was validated for H30 only',
    }
  const f = formOhlc(request),
    algorithm = method(request.algorithm)
  const entryDate = parseOhlcDate(request.entry_date)
  if (entryDate !== daysAfter(f.signal, 2))
    throw new Error('Validated entry is signal date + 2 days')
  const entry = positive(request.entry_price, 'entry_price')
  const base: OutlookBase = {
    instrument_key: f.identity,
    algorithm,
    signal_date: f.signal,
    entry_date: entryDate,
    entry_price: entry,
    view_observations: f.view,
    formation_elapsed_days: f.view - 1,
    holding_days: 30,
    hard_exit_date: daysAfter(entryDate, 30),
    eligible: f.eligible,
    ranking_scores: f.scores,
    qualifies_for_algorithm: f.scores[algorithm] !== null,
    selection_scope:
      'Single-instrument outlook; top-ten membership requires the rank command',
    bundle_provenance: bundle.source,
    sell_plan: {
      type:
        f.view === 7 && algorithm === 'Breakout'
          ? 'research-candidate'
          : 'evaluated-reference-only',
      days_after_entry: 30,
      automatic_level_exit: false,
      evidence:
        'Seven-view breakout favored H30 over these brackets; this does not establish a universal interval mapping',
    },
  }
  if (!f.eligible)
    return {
      ...base,
      status: 'ineligible-history-or-liquidity',
      target_probability: null,
      zones: [],
    }
  if (f.scores[algorithm] === null)
    return {
      ...base,
      status: 'no-qualifying-signal',
      target_probability: null,
      zones: [],
    }
  const { atr_sma14: atr, prior20_resistance: resistance } = ohlcLevels(f)
  if (atr === null || resistance === null)
    throw new Error('Eligible history must contain complete level geometry')
  const cutoff = `${entryDate.slice(0, 7)}-01`
  const zones = OHLC_POLICIES.map((sellPolicy): OhlcZone => {
    let target = finite(entry + 3 * atr, 'target')
    const stop = Math.max(0, entry - 2 * atr)
    if (sellPolicy === 'ResistanceSMAATR' && resistance > entry)
      target = Math.min(target, resistance)
    const xs: OhlcFeatures = [
      target / entry - 1,
      stop / entry - 1,
      atr / entry,
      resistance / entry - 1,
      Math.log1p(30),
    ]
    const geometryOk = target > entry && xs.every(Number.isFinite)
    const fit = bundle.fits.find(
      (item) => item.policy === sellPolicy && item.cutoff === cutoff,
    )
    const metric =
      bundle.metrics.find(
        (item) =>
          item.policy === sellPolicy &&
          item.population === `${f.view}:${algorithm}` &&
          item.period === '2023-2025',
      ) ?? null
    return {
      policy: sellPolicy,
      level_source_date: f.signal,
      entry_price: entry,
      atr_sma14: atr,
      prior20_resistance: resistance,
      target,
      stop,
      target_return: xs[0],
      stop_return: xs[1],
      probability: fit && geometryOk ? ohlcProbability(xs, fit) : null,
      model_status: !fit
        ? 'no-exact-month-model'
        : !geometryOk
          ? 'unusable-geometry'
          : 'available',
      fit_id: fit?.fit_id ?? null,
      model_cutoff: fit?.cutoff ?? null,
      latest_training_exit: fit?.latest_training_exit ?? null,
      training_events: fit?.training_n ?? null,
      historical_rate: fit?.baseline_probability ?? null,
      event:
        'Daily high reaches target before hard exit, including paths that stopped or sold earlier',
      retrospective_validation: {
        availability:
          'Post-study evidence for 2023–2025 signals; not an input available at historical entry',
        metrics: metric,
      },
      execution:
        'A tested close-confirmed trigger fills at open two days later, never automatically at target price',
    }
  })
  return { ...base, status: 'research-outlook', zones }
}
