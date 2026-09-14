import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { gunzipSync } from 'node:zlib'
import {
  OHLC_METHODS,
  OHLC_VIEWS,
  createOhlcOutlook,
  formOhlc,
  ohlcLevels,
  ohlcProbability,
  parseOhlcDate,
  parseOhlcModelBundle,
  rankOhlc,
  type OhlcOutlookRequest,
} from '../ohlcAlgorithms'

function object(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    throw new Error('Expected fixture object')
  return value as Record<string, unknown>
}
function list(value: unknown): unknown[] {
  if (!Array.isArray(value)) throw new Error('Expected fixture array')
  return value
}
function text(value: unknown): string {
  if (typeof value !== 'string') throw new Error('Expected fixture string')
  return value
}
function parity(actual: unknown, expected: unknown): void {
  if (typeof expected === 'number') {
    expect(typeof actual).toBe('number')
    if (typeof actual !== 'number') throw new Error('Not numeric')
    expect(Number.isFinite(actual)).toBe(true)
    expect(Math.abs(actual - expected)).toBeLessThanOrEqual(
      1e-11 * Math.max(Math.abs(expected), 1e-7),
    )
  } else if (Array.isArray(expected)) {
    const rows = list(actual)
    expect(rows).toHaveLength(expected.length)
    expected.forEach((value: unknown, i: number) => parity(rows[i], value))
  } else if (expected !== null && typeof expected === 'object') {
    const row = object(actual)
    expect(Object.keys(row).sort()).toEqual(Object.keys(expected).sort())
    for (const [key, value] of Object.entries(expected)) parity(row[key], value)
  } else expect(actual).toEqual(expected)
}

const root = join(__dirname, '../..')
const rawFixture: unknown = JSON.parse(
  gunzipSync(
    readFileSync(join(__dirname, 'fixtures/ohlc-parity.json.gz')),
  ).toString(),
)
const fixture = object(rawFixture)
const instruments = object(fixture.instruments)
const rawHistorical: unknown = JSON.parse(
  readFileSync(
    join(root, 'research/outlook/2026-09-13/model-bundle.json'),
    'utf8',
  ),
)
const historical = parseOhlcModelBundle(rawHistorical)

function synthetic(signal = '2024-01-01'): OhlcOutlookRequest {
  const identity = `${signal.slice(0, 4)}:XUSDT:segment-01`
  const time = Date.parse(`${signal}T00:00:00Z`)
  return {
    signal_date: signal,
    interval_unit: 'day',
    view_observations: 7,
    algorithm: 'Breakout',
    instrument_key: identity,
    symbol: 'XUSDT',
    cohort_member: true,
    hold_days: 30,
    entry_date: new Date(time + 2 * 86400000).toISOString().slice(0, 10),
    entry_price: 123,
    bars: Array.from({ length: 90 }, (_, i) => ({
      date: new Date(time - (89 - i) * 86400000).toISOString().slice(0, 10),
      instrument_key: identity,
      open: 100,
      high: i === 89 ? 120 : 101,
      low: 99,
      close: i === 89 ? 120 : 100,
      quote_volume: i === 89 ? 5_000_000 : 2_000_000,
      bar_status: 'complete',
    })),
  }
}

describe('OHLC Python parity', () => {
  it('pins the Python exporter, verified reference and model used by the fixture', () => {
    for (const [path, digest] of Object.entries(
      object(fixture.source_hashes),
    )) {
      expect(
        createHash('sha256')
          .update(readFileSync(join(root, path)))
          .digest('hex'),
      ).toBe(digest)
    }
  })

  it('matches every supported view and method on a complete historical universe', () => {
    const rows = list(fixture.rankings)
    expect(rows).toHaveLength(36)
    const combinations = new Set<string>()
    for (const raw of rows) {
      const row = object(raw),
        request = object(row.request)
      const supplied = list(row.instrument_refs).map(
        (ref) => instruments[text(ref)],
      )
      combinations.add(`${request.view_observations}:${request.algorithm}`)
      parity(rankOhlc({ ...request, instruments: supplied }), row.expected)
    }
    expect(combinations.size).toBe(OHLC_VIEWS.length * OHLC_METHODS.length)
  })

  it('matches full historical outlooks across all 74 monthly models', () => {
    const rows = list(fixture.outlooks)
    expect(rows).toHaveLength(148)
    const fitIds = new Set<string>()
    for (const raw of rows) {
      const row = object(raw)
      const input = {
        ...object(instruments[text(row.instrument_ref)]),
        ...object(row.request),
      }
      parity(createOhlcOutlook(input, historical), row.expected)
      fitIds.add(text(row.fit_id))
    }
    expect(fitIds.size).toBe(74)
  })

  it('retains the golden BTC January 2024 predictions and H30 deadline', () => {
    const result = createOhlcOutlook(fixture.golden_request, historical)
    expect(result.status).toBe('research-outlook')
    if (result.status !== 'research-outlook')
      throw new Error('No golden outlook')
    expect(result.entry_date).toBe('2024-01-03')
    expect(result.hard_exit_date).toBe('2024-02-02')
    expect(result.zones[0].probability).toBeCloseTo(0.5751501318232669, 12)
    expect(result.zones[1].probability).toBeCloseTo(0.641916029086595, 12)
    expect(result.sell_plan.automatic_level_exit).toBe(false)
  })

  it('loads the separately verified current models while preserving stale-support provenance', () => {
    const raw: unknown = JSON.parse(
      readFileSync(join(root, 'modules/data/ohlc-models.json'), 'utf8'),
    )
    const bundle = parseOhlcModelBundle(raw)
    expect(bundle.fits).toHaveLength(76)
    const result = createOhlcOutlook(synthetic('2026-09-11'), bundle)
    if (result.status !== 'research-outlook')
      throw new Error('Expected current outlook')
    expect(
      result.zones.every((zone) => zone.model_cutoff === '2026-09-01'),
    ).toBe(true)
    expect(
      result.zones.every((zone) => zone.latest_training_exit === '2026-02-01'),
    ).toBe(true)
    expect(result.bundle_provenance.current_fit_calibration).toBe(
      'not-evaluated-on-current-period',
    )
    expect(result.bundle_provenance.validated_forecast_last_cutoff).toBe(
      '2026-01-01',
    )
  })
})

describe('OHLC input, time and allocation boundaries', () => {
  it('ignores future prices, identity changes and outcome labels before reading them', () => {
    const request = synthetic()
    const before = createOhlcOutlook(request, historical)
    const future = {
      date: '2024-01-02',
      close: NaN,
      instrument_key: 'different identity',
    }
    parity(
      createOhlcOutlook(
        {
          ...request,
          bars: [...request.bars, future],
          exit_price: 1e9,
          hit: true,
        },
        historical,
      ),
      before,
    )
    expect(request.bars).toHaveLength(90)
  })

  it('rejects duplicate dates, changed annual identities, incomplete bars and malformed prices', () => {
    const request = synthetic()
    const duplicate = { ...request, bars: [...request.bars, request.bars[0]] }
    expect(() => formOhlc(duplicate)).toThrow(/Duplicate/)
    expect(() =>
      formOhlc({ ...request, instrument_key: '2023:XUSDT' }),
    ).toThrow(/signal-year/)
    for (const replacement of [
      { instrument_key: '2024:OTHER' },
      { bar_status: 'partial_terminal' },
      { open: 0 },
      { low: -1 },
      { close: true },
      { high: 10 },
      { low: 500 },
      { quote_volume: -1 },
      { close: Infinity },
    ]) {
      expect(() =>
        formOhlc({
          ...request,
          bars: request.bars.map((bar, i) =>
            i ? bar : { ...bar, ...replacement },
          ),
        }),
      ).toThrow()
    }
  })

  it('suppresses missing recent history, insufficient liquidity and nonmembership', () => {
    const request = synthetic()
    for (const changed of [
      { ...request, bars: request.bars.slice(-59) },
      { ...request, bars: request.bars.filter((_, i) => i !== 80) },
      { ...request, bars: request.bars.slice(0, -1) },
      {
        ...request,
        bars: request.bars.map((bar) => ({ ...bar, quote_volume: 100 })),
      },
      { ...request, cohort_member: false },
    ]) {
      const result = createOhlcOutlook(changed, historical)
      expect(result.status).toBe('ineligible-history-or-liquidity')
      if (result.status === 'ineligible-history-or-liquidity')
        expect(result.zones).toEqual([])
    }
    expect(formOhlc({ ...request, bars: request.bars.slice(1) }).eligible).toBe(
      true,
    )
    expect(() => formOhlc({ ...request, cohort_member: 1 })).toThrow()
  })

  it('uses prior bars for resistance, SMA true ranges for ATR and keeps gap geometry unknown', () => {
    const request = synthetic()
    const before = ohlcLevels(formOhlc(request))
    const changed = {
      ...request,
      bars: request.bars.map((bar, i) =>
        i === 89 ? { ...bar, high: 500 } : bar,
      ),
    }
    const after = ohlcLevels(formOhlc(changed))
    expect(before.prior20_resistance).toBe(101)
    expect(after.prior20_resistance).toBe(101)
    expect(after.atr_sma14).toBeGreaterThan(before.atr_sma14 ?? 0)
    const gap = ohlcLevels(
      formOhlc({ ...request, bars: request.bars.filter((_, i) => i !== 80) }),
    )
    expect(gap).toEqual({ atr_sma14: null, prior20_resistance: null })
  })

  it('checks UTC calendar dates and unsupported windows even for an empty universe', () => {
    for (const date of [
      '2024-02-30',
      '2023-02-29',
      '2024-1-01',
      '0000-01-01',
      '2024-01-01T00:00:00Z',
    ]) {
      expect(() => parseOhlcDate(date)).toThrow()
    }
    expect(parseOhlcDate('2024-02-29')).toBe('2024-02-29')
    const base = {
      signal_date: '2024-01-01',
      view_observations: 7,
      instruments: [],
    }
    for (const bad of [
      { interval_unit: 'hour' },
      { view_observations: true },
      { view_observations: 2 },
      { signal_date: 'bad' },
    ]) {
      expect(() => rankOhlc({ ...base, ...bad })).toThrow()
    }
    expect(rankOhlc(base).unallocated_slots).toBe(10)
  })

  it('selects positive scores only, breaks ties by identity and leaves unused slots in cash', () => {
    const request = synthetic()
    const instruments = Array.from({ length: 12 }, (_, i) => {
      const identity = `2024:X${String(11 - i).padStart(2, '0')}:segment-01`
      return {
        ...request,
        instrument_key: identity,
        bars: request.bars.map((b) => ({ ...b, instrument_key: identity })),
      }
    })
    const result = rankOhlc({ ...request, instruments })
    expect(result.selected.map((x) => x.instrument_key)).toEqual(
      instruments
        .map((x) => x.instrument_key)
        .sort()
        .slice(0, 10),
    )
    expect(result.allocation_per_selected).toBe(0.1)
    expect(
      rankOhlc({ ...request, instruments: instruments.slice(0, 2) })
        .unallocated_slots,
    ).toBe(8)
    expect(() =>
      rankOhlc({ ...request, instruments: [instruments[0], instruments[0]] }),
    ).toThrow()
    const flat = {
      ...request,
      bars: request.bars.map((b) => ({ ...b, high: 101, close: 100 })),
    }
    expect(createOhlcOutlook(flat, historical).status).toBe(
      'no-qualifying-signal',
    )
    expect(rankOhlc({ ...request, instruments: [flat] }).selected).toEqual([])
  })

  it('applies the volume threshold exactly and excludes the current high from breakout scoring', () => {
    const request = synthetic()
    const exact = {
      ...request,
      bars: request.bars.map((b, i) =>
        i === 89 ? { ...b, quote_volume: 3_000_000 } : b,
      ),
    }
    expect(formOhlc(exact).scores.VolumeBreakout).toBe(
      formOhlc(exact).scores.Breakout,
    )
    const below = {
      ...exact,
      bars: exact.bars.map((b, i) =>
        i === 89 ? { ...b, quote_volume: 2_999_999, high: 1000 } : b,
      ),
    }
    expect(formOhlc(below).scores.VolumeBreakout).toBeNull()
    expect(formOhlc(below).scores.Breakout).toBe(
      formOhlc(exact).scores.Breakout,
    )
  })

  it('requires actual t+2 entry and refuses unsupported hold probabilities', () => {
    const request = synthetic()
    expect(() =>
      createOhlcOutlook({ ...request, entry_date: '2024-01-02' }, historical),
    ).toThrow()
    for (const entry_price of [0, -1, NaN, Infinity, true])
      expect(() =>
        createOhlcOutlook({ ...request, entry_price }, historical),
      ).toThrow()
    for (const hold_days of [true, null, '30', 30.5])
      expect(() =>
        createOhlcOutlook({ ...request, hold_days }, historical),
      ).toThrow()
    for (const hold_days of [7, 14, 60, 90, 365])
      expect(
        createOhlcOutlook({ ...request, hold_days }, historical).status,
      ).toBe('unsupported-horizon')
    const future = createOhlcOutlook(synthetic('2030-01-01'), historical)
    if (future.status !== 'research-outlook')
      throw new Error('Expected levels without model')
    expect(
      future.zones.every(
        (z) =>
          z.probability === null && z.model_status === 'no-exact-month-model',
      ),
    ).toBe(true)
  })

  it('requires full training maturity and validates model coefficients and identities', () => {
    const source = object(rawHistorical),
      first = object(list(source.fits)[0])
    for (const bad of [
      { latest_training_exit: first.cutoff },
      { scaler_scale: [0, 1, 1, 1, 1] },
      { coefficients: [NaN, 1, 1, 1, 1] },
      { training_n: 199 },
      { baseline_probability: 1.01 },
      { fit_id: 'wrong' },
      { cutoff: '2023-01-02' },
    ])
      expect(() =>
        parseOhlcModelBundle({ ...source, fits: [{ ...first, ...bad }] }),
      ).toThrow()
    expect(() =>
      parseOhlcModelBundle({ ...source, fits: [first, first] }),
    ).toThrow()
    const fit = historical.fits[0]
    expect(
      ohlcProbability([0, 0, 0, 0, 0], {
        ...fit,
        coefficients: [0, 0, 0, 0, 0],
        intercept: -1000,
      }),
    ).toBe(0)
    expect(
      ohlcProbability([0, 0, 0, 0, 0], {
        ...fit,
        coefficients: [0, 0, 0, 0, 0],
        intercept: 1000,
      }),
    ).toBe(1)
  })
})
