#!/usr/bin/env node
'use strict';

process.env.TZ = 'UTC';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');

const ROOT = __dirname;
const DATA_DIR = path.join(ROOT, 'external-data');
const PROTOCOL_PATH = path.join(ROOT, 'external-monthly-protocol.md');
const RESULTS_PATH = path.join(ROOT, 'external-monthly-results.json');
const SUMMARY_PATH = path.join(ROOT, 'external-monthly-summary.json');
const BASE_URL = 'https://data.binance.vision/data/spot/monthly/klines';
const SYMBOLS = ['BTCUSDT', 'ETHUSDT'];
const HORIZONS = [1, 3, 6, 12];
const COSTS = [0, 0.001, 0.005, 0.01];
const MAX_DOWNLOAD_BYTES = 30 * 1024 * 1024;
const FIRST_MONTH = '2017-08';
const generatedAt = new Date().toISOString();

function invariant(condition, message) {
  if (!condition) throw new Error(message);
}

function sha256(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

function fileSha(file) {
  return sha256(fs.readFileSync(file));
}

function monthKey(year, month) {
  return `${year}-${String(month).padStart(2, '0')}`;
}

function parseMonth(key) {
  const [year, month] = key.split('-').map(Number);
  return { year, month };
}

function addMonths(key, delta) {
  const { year, month } = parseMonth(key);
  const date = new Date(Date.UTC(year, month - 1 + delta, 1));
  return monthKey(date.getUTCFullYear(), date.getUTCMonth() + 1);
}

function previousUtcMonth() {
  const now = new Date();
  return monthKey(now.getUTCFullYear(), now.getUTCMonth());
}

function monthsBetween(first, last) {
  const out = [];
  for (let key = first; key <= last; key = addMonths(key, 1)) out.push(key);
  return out;
}

function atomicWriteNew(file, bytes) {
  if (fs.existsSync(file)) {
    const existing = fs.readFileSync(file);
    invariant(Buffer.compare(existing, bytes) === 0, `Refusing to overwrite different existing file: ${file}`);
    return false;
  }
  const tmp = `${file}.tmp-${process.pid}`;
  fs.writeFileSync(tmp, bytes, { flag: 'wx' });
  fs.renameSync(tmp, file);
  return true;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchBytes(url, optional = false) {
  let lastError;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      const response = await fetch(url, { headers: { 'user-agent': 'topcryptos-external-validation/1.0' } });
      if (optional && response.status === 404) return null;
      if (response.status === 429 || response.status >= 500) {
        lastError = new Error(`${response.status} ${response.statusText}: ${url}`);
        await sleep(500 * 2 ** attempt);
        continue;
      }
      invariant(response.ok, `${response.status} ${response.statusText}: ${url}`);
      return Buffer.from(await response.arrayBuffer());
    } catch (error) {
      lastError = error;
      await sleep(500 * 2 ** attempt);
    }
  }
  throw lastError;
}

function archiveSpec(symbol, month) {
  const name = `${symbol}-1d-${month}.zip`;
  const url = `${BASE_URL}/${symbol}/1d/${name}`;
  return { symbol, month, name, url, zipPath: path.join(DATA_DIR, name), checksumPath: path.join(DATA_DIR, `${name}.CHECKSUM`) };
}

async function obtainArchive(spec) {
  let downloadedBytes = 0;
  let checksumBytes;
  if (fs.existsSync(spec.checksumPath)) checksumBytes = fs.readFileSync(spec.checksumPath);
  else {
    checksumBytes = await fetchBytes(`${spec.url}.CHECKSUM`, true);
    if (checksumBytes == null) return null;
    atomicWriteNew(spec.checksumPath, checksumBytes);
    downloadedBytes += checksumBytes.length;
  }

  const checksumText = checksumBytes.toString('utf8').trim();
  const match = checksumText.match(/^([0-9a-fA-F]{64})(?:\s+\*?.*)?$/);
  invariant(match, `Invalid checksum file: ${spec.checksumPath}`);
  const expectedSha256 = match[1].toLowerCase();

  let zipBytes;
  if (fs.existsSync(spec.zipPath)) zipBytes = fs.readFileSync(spec.zipPath);
  else {
    zipBytes = await fetchBytes(spec.url, true);
    if (zipBytes == null) return null;
    invariant(downloadedBytes + zipBytes.length <= MAX_DOWNLOAD_BYTES, 'Single-run download limit exceeded');
    atomicWriteNew(spec.zipPath, zipBytes);
    downloadedBytes += zipBytes.length;
  }

  const actualSha256 = sha256(zipBytes);
  invariant(actualSha256 === expectedSha256, `Checksum mismatch: ${spec.name}`);
  return {
    symbol: spec.symbol,
    month: spec.month,
    name: spec.name,
    url: spec.url,
    checksumUrl: `${spec.url}.CHECKSUM`,
    bytes: zipBytes.length,
    sha256: actualSha256,
    checksumText,
    downloadedBytes,
  };
}

async function downloadArchives() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const requestedMonths = monthsBetween(FIRST_MONTH, previousUtcMonth());
  const records = [];
  let downloadedBytes = 0;
  for (const symbol of SYMBOLS) {
    for (const month of requestedMonths) {
      const record = await obtainArchive(archiveSpec(symbol, month));
      if (record) {
        downloadedBytes += record.downloadedBytes;
        invariant(downloadedBytes <= MAX_DOWNLOAD_BYTES, `Download exceeded ${MAX_DOWNLOAD_BYTES} bytes`);
        records.push(record);
      }
    }
  }

  const bySymbol = Object.fromEntries(SYMBOLS.map((symbol) => [symbol, new Set(records.filter((r) => r.symbol === symbol).map((r) => r.month))]));
  const commonMonths = requestedMonths.filter((month) => SYMBOLS.every((symbol) => bySymbol[symbol].has(month)));
  invariant(commonMonths.length > 0, 'No common archive months found');
  const latestCommonMonth = commonMonths.at(-1);
  const retainedMonths = requestedMonths.filter((month) => month <= latestCommonMonth);
  for (const symbol of SYMBOLS) {
    const missing = retainedMonths.filter((month) => !bySymbol[symbol].has(month));
    invariant(missing.length === 0, `${symbol} missing archive months through ${latestCommonMonth}: ${missing.join(', ')}`);
  }
  return {
    records: records.filter((r) => r.month <= latestCommonMonth),
    requestedThrough: requestedMonths.at(-1),
    latestCommonMonth,
    downloadedBytes,
  };
}

function parseArchives(records) {
  const files = records.map((record) => archiveSpec(record.symbol, record.month).zipPath);
  const python = String.raw`
import csv, io, json, os, sys, zipfile
out = []
for file_path in json.load(sys.stdin):
    with zipfile.ZipFile(file_path, 'r') as z:
        names = [n for n in z.namelist() if not n.endswith('/')]
        if len(names) != 1:
            raise RuntimeError(f'{file_path}: expected one CSV member, found {names}')
        with z.open(names[0], 'r') as raw:
            text = io.TextIOWrapper(raw, encoding='utf-8', newline='')
            for source_row, row in enumerate(csv.reader(text), start=1):
                if not row:
                    continue
                out.append({'archive': os.path.basename(file_path), 'member': names[0], 'sourceRow': source_row, 'fields': row})
json.dump(out, sys.stdout, separators=(',', ':'))
`;
  const child = spawnSync('python3', ['-c', python], {
    input: JSON.stringify(files),
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
  invariant(child.status === 0, `Python ZIP parse failed: ${child.stderr || child.stdout}`);
  return JSON.parse(child.stdout);
}

function normalizeTimestamp(raw) {
  invariant(/^\d+$/.test(raw), `Invalid timestamp: ${raw}`);
  const value = BigInt(raw);
  const unit = value >= 100000000000000n ? 'microseconds' : 'milliseconds';
  const milliseconds = Number(unit === 'microseconds' ? value / 1000n : value);
  invariant(Number.isSafeInteger(milliseconds), `Unsafe timestamp: ${raw}`);
  return { milliseconds, unit };
}

function isoDate(ms) {
  return new Date(ms).toISOString().slice(0, 10);
}

function validateRows(rawRows) {
  const diagnostics = {};
  const barsBySymbol = {};

  for (const symbol of SYMBOLS) {
    const symbolRows = rawRows.filter((row) => row.archive.startsWith(`${symbol}-`));
    const bars = [];
    let sourceOrderViolations = 0;
    let priorSourceOpen = -Infinity;
    let unitSplitExceptions = 0;
    let invalidDurations = 0;

    for (const row of symbolRows) {
      invariant(row.fields.length === 12, `${row.archive}:${row.sourceRow}: expected 12 fields, got ${row.fields.length}`);
      const [openRaw, openText, highText, lowText, closeText, volumeText, closeTimeRaw] = row.fields;
      const prices = [openText, highText, lowText, closeText].map(Number);
      invariant(prices.every((v) => Number.isFinite(v) && v > 0), `${row.archive}:${row.sourceRow}: invalid OHLC`);
      const [open, high, low, close] = prices;
      invariant(high >= Math.max(open, close) && low <= Math.min(open, close) && low <= high, `${row.archive}:${row.sourceRow}: inconsistent OHLC`);
      invariant(Number.isFinite(Number(volumeText)) && Number(volumeText) >= 0, `${row.archive}:${row.sourceRow}: invalid volume`);
      const openTime = normalizeTimestamp(openRaw);
      const closeTime = normalizeTimestamp(closeTimeRaw);
      if (openTime.milliseconds <= priorSourceOpen) sourceOrderViolations += 1;
      priorSourceOpen = openTime.milliseconds;
      const date = isoDate(openTime.milliseconds);
      const expectedUnit = date < '2025-01-01' ? 'milliseconds' : 'microseconds';
      if (openTime.unit !== expectedUnit || closeTime.unit !== expectedUnit) unitSplitExceptions += 1;
      const duration = closeTime.milliseconds - openTime.milliseconds;
      if (duration < 86_399_000 || duration > 86_400_000) invalidDurations += 1;
      invariant(new Date(openTime.milliseconds).toISOString().endsWith('T00:00:00.000Z'), `${row.archive}:${row.sourceRow}: daily open not UTC midnight`);
      bars.push({
        symbol,
        date,
        openTime: openTime.milliseconds,
        closeTime: closeTime.milliseconds,
        timestampUnit: openTime.unit,
        open,
        high,
        low,
        close,
        source: { archive: row.archive, member: row.member, row: row.sourceRow, open: openText, high: highText, low: lowText, close: closeText },
      });
    }

    bars.sort((a, b) => a.openTime - b.openTime);
    const duplicateDates = [];
    const gaps = [];
    for (let i = 1; i < bars.length; i += 1) {
      const deltaDays = (bars[i].openTime - bars[i - 1].openTime) / 86_400_000;
      if (deltaDays === 0) duplicateDates.push(bars[i].date);
      else if (deltaDays !== 1) gaps.push({ after: bars[i - 1].date, before: bars[i].date, days: deltaDays });
    }
    invariant(duplicateDates.length === 0, `${symbol}: duplicate dates: ${duplicateDates.join(', ')}`);
    invariant(gaps.length === 0, `${symbol}: daily gaps: ${JSON.stringify(gaps.slice(0, 10))}`);
    invariant(unitSplitExceptions === 0, `${symbol}: ${unitSplitExceptions} timestamp-unit cutoff exceptions`);
    invariant(invalidDurations === 0, `${symbol}: ${invalidDurations} invalid daily bar durations`);

    barsBySymbol[symbol] = bars;
    diagnostics[symbol] = {
      rows: bars.length,
      firstDate: bars[0].date,
      lastDate: bars.at(-1).date,
      sourceOrderViolations,
      duplicateDates,
      gaps,
      unitCounts: bars.reduce((acc, bar) => ({ ...acc, [bar.timestampUnit]: (acc[bar.timestampUnit] || 0) + 1 }), {}),
      sourcePriceStringsSha256: sha256(bars.map((bar) => [bar.source.open, bar.source.high, bar.source.low, bar.source.close].join(',')).join('\n')),
      sourcePriceStringSamples: [bars[0], bars.at(-1)].map((bar) => ({ date: bar.date, archive: bar.source.archive, row: bar.source.row, open: bar.source.open, high: bar.source.high, low: bar.source.low, close: bar.source.close })),
      unitSplitExceptions,
      invalidDurations,
    };
  }
  return { barsBySymbol, diagnostics };
}

function monthOfDate(date) {
  return date.slice(0, 7);
}

function buildPeriods(barsBySymbol) {
  const periodsBySymbol = {};
  for (const symbol of SYMBOLS) {
    const bars = barsBySymbol[symbol];
    const monthEnds = new Map();
    for (const bar of bars) monthEnds.set(monthOfDate(bar.date), bar);
    const months = [...monthEnds.keys()].sort();
    const barIndexByTime = new Map(bars.map((bar, index) => [bar.openTime, index]));
    const decisions = [];

    for (const month of months) {
      const decisionBar = monthEnds.get(month);
      const signals = {};
      const trailingReturns = {};
      let complete = true;
      for (const horizon of HORIZONS) {
        const referenceMonth = addMonths(month, -horizon);
        const referenceBar = monthEnds.get(referenceMonth);
        if (!referenceBar) {
          complete = false;
          break;
        }
        const value = decisionBar.close / referenceBar.close - 1;
        trailingReturns[`${horizon}m`] = value;
        signals[`${horizon}m`] = value > 0 ? 1 : 0;
      }
      if (!complete) continue;
      const decisionIndex = barIndexByTime.get(decisionBar.openTime);
      const executionBar = bars[decisionIndex + 1];
      if (!executionBar) continue;
      decisions.push({ symbol, month, decisionDate: decisionBar.date, decisionClose: decisionBar.close, executionDate: executionBar.date, executionTime: executionBar.openTime, executionOpen: executionBar.open, signals, trailingReturns });
    }

    const periods = [];
    for (let i = 0; i + 1 < decisions.length; i += 1) {
      const current = decisions[i];
      const next = decisions[i + 1];
      invariant(addMonths(current.month, 1) === next.month, `${symbol}: nonconsecutive eligible decisions ${current.month} -> ${next.month}`);
      const assetReturn = next.executionOpen / current.executionOpen - 1;
      periods.push({
        symbol,
        month: current.month,
        decisionDate: current.decisionDate,
        startDate: current.executionDate,
        endDate: next.executionDate,
        startTime: current.executionTime,
        endTime: next.executionTime,
        startOpen: current.executionOpen,
        endOpen: next.executionOpen,
        assetReturn,
        signals: current.signals,
        trailingReturns: current.trailingReturns,
      });
    }
    invariant(periods.length >= 24, `${symbol}: fewer than 24 eligible periods`);
    periodsBySymbol[symbol] = periods;
  }

  const btcRegimeByMonth = new Map(periodsBySymbol.BTCUSDT.map((period) => [period.month, period.signals['12m'] ? 'positive_12m' : 'nonpositive_12m']));
  for (const symbol of SYMBOLS) {
    for (const period of periodsBySymbol[symbol]) {
      invariant(btcRegimeByMonth.has(period.month), `${symbol}: no BTC regime label for ${period.month}`);
      period.regime = btcRegimeByMonth.get(period.month);
    }
  }
  return periodsBySymbol;
}

function targetFor(strategy, period) {
  if (strategy === 'buy_hold') return 1;
  if (strategy === 'ensemble') return HORIZONS.reduce((sum, horizon) => sum + period.signals[`${horizon}m`], 0) / HORIZONS.length;
  const match = strategy.match(/^timing_(\d+)m$/);
  invariant(match, `Unknown strategy: ${strategy}`);
  return period.signals[`${Number(match[1])}m`];
}

function driftWeight(weight, assetReturn) {
  const denominator = 1 + weight * assetReturn;
  invariant(denominator > 0, 'Portfolio wealth became nonpositive');
  return (weight * (1 + assetReturn)) / denominator;
}

function simulate(periods, strategy, costRate, initialWeight = 0, liquidate = true) {
  let wealth = 1;
  let currentWeight = initialWeight;
  let totalTurnover = 0;
  const rows = [];
  const wealthPath = [{ date: periods[0].startDate, wealth }];
  const trades = [];

  for (let i = 0; i < periods.length; i += 1) {
    const period = periods[i];
    const target = targetFor(strategy, period);
    const startWealth = wealth;
    const trade = Math.abs(target - currentWeight);
    const startCost = costRate * trade * wealth;
    wealth -= startCost;
    totalTurnover += trade;
    trades.push({ date: period.startDate, type: 'rebalance', tradedNotionalFraction: trade, cost: startCost, fromWeight: currentWeight, toWeight: target });

    wealth *= 1 + target * period.assetReturn;
    currentWeight = driftWeight(target, period.assetReturn);

    let endCost = 0;
    let liquidationTrade = 0;
    if (liquidate && i === periods.length - 1) {
      liquidationTrade = currentWeight;
      endCost = costRate * liquidationTrade * wealth;
      wealth -= endCost;
      totalTurnover += liquidationTrade;
      trades.push({ date: period.endDate, type: 'liquidation', tradedNotionalFraction: liquidationTrade, cost: endCost, fromWeight: currentWeight, toWeight: 0 });
      currentWeight = 0;
    }

    const netReturn = wealth / startWealth - 1;
    rows.push({ ...period, strategy, costRate, targetWeight: target, startWeightBeforeTrade: trades.at(liquidate && i === periods.length - 1 ? -2 : -1).fromWeight, startTradeFraction: trade, startCost, endLiquidationTradeFraction: liquidationTrade, endCost, netReturn, endWealth: wealth });
    wealthPath.push({ date: period.endDate, wealth });
  }
  return { rows, trades, wealthPath, terminalWealth: wealth, totalTurnover };
}

function maxDrawdown(values) {
  let peak = -Infinity;
  let max = 0;
  for (const value of values) {
    peak = Math.max(peak, value);
    max = Math.min(max, value / peak - 1);
  }
  return max;
}

function sampleSd(values) {
  if (values.length < 2) return null;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  return Math.sqrt(values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (values.length - 1));
}

function compound(returns) {
  return returns.reduce((wealth, value) => wealth * (1 + value), 1) - 1;
}

function summarizeSimulation(simulation) {
  const { rows, terminalWealth, totalTurnover, wealthPath, trades } = simulation;
  const elapsedDays = (rows.at(-1).endTime - rows[0].startTime) / 86_400_000;
  const averageExposure = rows.reduce((sum, row) => sum + row.targetWeight, 0) / rows.length;
  const years = {};
  for (const year of [...new Set(rows.map((row) => row.startDate.slice(0, 4)))]) {
    const yearRows = rows.filter((row) => row.startDate.startsWith(year));
    const yearReturns = yearRows.map((row) => row.netReturn);
    const yearWealth = [1];
    for (const value of yearReturns) yearWealth.push(yearWealth.at(-1) * (1 + value));
    const yearTrades = trades.filter((trade) => trade.date.startsWith(year));
    years[year] = {
      periods: yearRows.length,
      return: compound(yearReturns),
      maxDrawdown: maxDrawdown(yearWealth),
      averageExposure: yearRows.reduce((sum, row) => sum + row.targetWeight, 0) / yearRows.length,
      turnover: yearTrades.reduce((sum, trade) => sum + trade.tradedNotionalFraction, 0),
    };
  }
  const regimes = {};
  for (const regime of ['positive_12m', 'nonpositive_12m']) {
    const subset = rows.filter((row) => row.regime === regime);
    regimes[regime] = {
      periods: subset.length,
      strategyCompoundReturn: subset.length ? compound(subset.map((row) => row.netReturn)) : null,
      meanStrategyReturn: subset.length ? subset.reduce((sum, row) => sum + row.netReturn, 0) / subset.length : null,
      meanAssetReturn: subset.length ? subset.reduce((sum, row) => sum + row.assetReturn, 0) / subset.length : null,
      averageExposure: subset.length ? subset.reduce((sum, row) => sum + row.targetWeight, 0) / subset.length : null,
    };
  }
  return {
    periods: rows.length,
    startDate: rows[0].startDate,
    endDate: rows.at(-1).endDate,
    elapsedDays,
    terminalWealth,
    cumulativeReturn: terminalWealth - 1,
    cagr: terminalWealth ** (365.2425 / elapsedDays) - 1,
    maxDrawdown: maxDrawdown(wealthPath.map((point) => point.wealth)),
    annualizedMonthlyVolatility: sampleSd(rows.map((row) => row.netReturn)) * Math.sqrt(12),
    averageExposure,
    totalTurnover,
    averageMonthlyTurnover: totalTurnover / rows.length,
    years,
    regimes,
  };
}

function priorDriftWeight(allPeriods, strategy, sliceStartIndex) {
  if (sliceStartIndex === 0) return 0;
  const prior = allPeriods[sliceStartIndex - 1];
  return driftWeight(targetFor(strategy, prior), prior.assetReturn);
}

function runStudy(periodsBySymbol) {
  const strategies = ['timing_1m', 'timing_3m', 'timing_6m', 'timing_12m', 'ensemble', 'buy_hold'];
  const detailed = {};
  const summary = {};

  for (const symbol of SYMBOLS) {
    detailed[symbol] = {};
    summary[symbol] = {};
    const periods = periodsBySymbol[symbol];
    const sliceStart = periods.length - 24;
    const final24 = periods.slice(sliceStart);

    for (const strategy of strategies) {
      detailed[symbol][strategy] = {};
      summary[symbol][strategy] = {};
      for (const costRate of COSTS) {
        const key = costRate === 0 ? 'gross' : `${Math.round(costRate * 10_000)}bpsPerSide`;
        const allSimulation = simulate(periods, strategy, costRate, 0, true);
        const sliceInitialWeight = priorDriftWeight(periods, strategy, sliceStart);
        const final24Simulation = simulate(final24, strategy, costRate, sliceInitialWeight, true);
        detailed[symbol][strategy][key] = {
          all: allSimulation,
          final24: final24Simulation,
        };
        summary[symbol][strategy][key] = {
          all: summarizeSimulation(allSimulation),
          final24: summarizeSimulation(final24Simulation),
        };
      }
    }
  }
  return { detailed, summary };
}

function assertDeterministicChecks() {
  invariant(addMonths('2024-01', -1) === '2023-12', 'calendar subtraction failed');
  invariant(addMonths('2023-12', 1) === '2024-01', 'calendar addition failed');
  invariant(normalizeTimestamp('1735689600000').unit === 'milliseconds', 'millisecond detection failed');
  invariant(normalizeTimestamp('1735689600000000').unit === 'microseconds', 'microsecond detection failed');
  invariant(Math.abs(driftWeight(0.5, 0.1) - 0.55 / 1.05) < 1e-12, 'weight drift failed');
  const synthetic = [{ startDate: '2020-01-01', endDate: '2020-02-01', startTime: 0, endTime: 31 * 86_400_000, assetReturn: 0.1, signals: { '1m': 1, '3m': 1, '6m': 1, '12m': 1 }, trailingReturns: {}, regime: 'positive_12m' }];
  const gross = simulate(synthetic, 'buy_hold', 0);
  invariant(Math.abs(gross.terminalWealth - 1.1) < 1e-12, 'gross simulation failed');
  const net = simulate(synthetic, 'buy_hold', 0.01);
  invariant(net.terminalWealth < 1.1 && net.totalTurnover === 2, 'cost/turnover simulation failed');
}

async function main() {
  invariant(fs.existsSync(PROTOCOL_PATH), `Missing frozen protocol: ${PROTOCOL_PATH}`);
  invariant(!fs.existsSync(RESULTS_PATH), `Refusing to overwrite existing result: ${RESULTS_PATH}`);
  invariant(!fs.existsSync(SUMMARY_PATH), `Refusing to overwrite existing summary: ${SUMMARY_PATH}`);
  assertDeterministicChecks();

  const download = await downloadArchives();
  const rawRows = parseArchives(download.records);
  const validated = validateRows(rawRows);
  const periodsBySymbol = buildPeriods(validated.barsBySymbol);
  const study = runStudy(periodsBySymbol);

  const source = {
    provider: 'Binance official public data archive',
    baseUrl: BASE_URL,
    firstRequestedMonth: FIRST_MONTH,
    requestedThrough: download.requestedThrough,
    latestCommonMonth: download.latestCommonMonth,
    archiveCount: download.records.length,
    totalArchiveBytes: download.records.reduce((sum, record) => sum + record.bytes, 0),
    bytesDownloadedThisRun: download.downloadedBytes,
    archives: download.records.map(({ downloadedBytes, ...record }) => record),
  };
  const limitations = [
    'Retrospective BTC/ETH survivor study; not a point-in-time top-500 or cross-sectional validation.',
    'Binance USDT pairs begin in 2017 and do not represent earlier cycles, other venues, USD excess returns, delisting returns, or a complete historical listing registry.',
    'Timing strategies reduce market exposure by holding idealized zero-interest cash; lower drawdown or volatility can be an exposure/beta effect rather than alpha.',
    'The final 24 months are a fixed chronological slice but remain retrospective, not prospective validation.',
    'Current-symbol selection and a 12-month seasoning requirement create survivorship and listing-age bias.',
  ];
  const runnerSha256 = fileSha(__filename);
  const protocolSha256 = fileSha(PROTOCOL_PATH);
  const result = {
    schemaVersion: 1,
    generatedAt,
    frozenProtocol: { path: path.basename(PROTOCOL_PATH), sha256: protocolSha256 },
    runner: { path: path.basename(__filename), sha256: runnerSha256, node: process.version, python: spawnSync('python3', ['--version'], { encoding: 'utf8' }).stdout.trim() || spawnSync('python3', ['--version'], { encoding: 'utf8' }).stderr.trim() },
    source,
    validation: validated.diagnostics,
    periods: periodsBySymbol,
    outcomes: study.detailed,
    summary: study.summary,
    limitations,
  };
  const compactSummary = {
    schemaVersion: result.schemaVersion,
    generatedAt,
    frozenProtocol: result.frozenProtocol,
    runner: result.runner,
    source: { ...source, archives: source.archives.map(({ symbol, month, name, url, checksumUrl, bytes, sha256 }) => ({ symbol, month, name, url, checksumUrl, bytes, sha256 })) },
    validation: result.validation,
    summary: result.summary,
    limitations,
  };

  fs.writeFileSync(RESULTS_PATH, `${JSON.stringify(result, null, 2)}\n`, { flag: 'wx' });
  fs.writeFileSync(SUMMARY_PATH, `${JSON.stringify(compactSummary, null, 2)}\n`, { flag: 'wx' });
  console.log(JSON.stringify({
    results: RESULTS_PATH,
    summary: SUMMARY_PATH,
    source: compactSummary.source,
    validation: compactSummary.validation,
    headline: Object.fromEntries(SYMBOLS.map((symbol) => [symbol, Object.fromEntries(['ensemble', 'buy_hold'].map((strategy) => [strategy, compactSummary.summary[symbol][strategy]]))])),
  }, null, 2));
}

main().catch((error) => {
  console.error(error.stack || error.message || String(error));
  process.exitCode = 1;
});
