import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { getNativeExitEvidence, nativeExitStudy, type NativeExitMode } from '@/modules/nativeExitEvidence'
import type { RankingAlgorithm } from '@/modules/processRankings'
import { cn } from '@/lib/utils'

const netReturn = (value: number) => `${value > 0 ? '+' : ''}${(value * 100).toFixed(2)}%`
const utcMinute = (value: string) => `${value.slice(0, 16).replace('T', ' ')} UTC`

/** A user-chosen calendar plan, separate from the retrospective return evidence. */
export function plannedExitUtc(entry: string, holding: number, mode: NativeExitMode): string | null {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(entry) || !Number.isSafeInteger(holding) || holding <= 0) return null
  const start = new Date(`${entry}:00.000Z`)
  if (!Number.isFinite(start.getTime()) || start.toISOString().slice(0, 16) !== entry) return null
  const end = new Date(start.getTime() + holding * (mode === 'daily' ? 86_400_000 : 3_600_000))
  return Number.isFinite(end.getTime()) && end.getUTCFullYear() <= 9999 ? end.toISOString() : null
}

export function NativeExitPanel({ mode, view, algorithm, label, filtersActive }: {
  mode: NativeExitMode
  view: number
  algorithm: RankingAlgorithm
  label: string
  filtersActive: boolean
}) {
  const evidence = getNativeExitEvidence(mode, view, algorithm)
  const [holding, setHolding] = useState<number | null>(null)
  const [entry, setEntry] = useState('')
  const [fee, setFee] = useState<'50' | '100'>('50')
  const [missing, setMissing] = useState<'loss' | 'flat'>('loss')
  const unit = mode === 'daily' ? 'days' : 'hours'
  const durationLabel = (count: number) => `${count} ${count === 1 ? unit.slice(0, -1) : unit}`
  const available = evidence?.windows.filter((row) => row.metrics != null) ?? []
  const chosen = available.find((row) => row.holding === holding)
  const exit = chosen ? plannedExitUtc(entry, chosen.holding, mode) : null
  const blocks = nativeExitStudy.dataBlocks[mode]
  const from = blocks[0]?.start.slice(0, 10)
  const through = blocks.at(-1)?.end.slice(0, 10)

  return <details className="mb-5 rounded-xl border border-border/60 bg-card/30 px-4 sm:px-5">
    <summary className="min-h-14 cursor-pointer content-center text-sm font-medium">Exit timing <span className="ml-2 font-normal text-muted-foreground">{label} · {view} {unit}</span></summary>
    <div className="pb-5">
      <p className="mb-4 text-sm text-muted-foreground">The tests do not establish an automatic exit recommendation yet. Compare the tested holds, then choose a duration to plan an exit date.</p>
      {filtersActive && <p className="mb-4 text-sm text-muted-foreground">These results use the full CMC ranking universe. Your hidden-coin exclusions change the scoring universe and have not been replayed in this test.</p>}
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <div className="min-w-0">
          <h2 className="text-sm font-medium">Tested holds</h2>
          <p className="mt-1 mb-3 text-xs leading-relaxed text-muted-foreground">{evidence?.matchedSignals ? `${evidence.matchedSignals} matching entry dates · top-ten baskets` : 'Not enough matching entry dates for a return comparison.'}</p>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <caption className="sr-only">{label} holding-period results for the {view}-{mode === 'daily' ? 'day' : 'hour'} view. Historical basket averages, not individual coin forecasts.</caption>
              <thead className="text-xs text-muted-foreground"><tr><th scope="col" className="py-2 pr-3 font-normal">Hold</th><th scope="col" className="px-2 py-2 text-right font-normal">Avg net</th><th scope="col" className="py-2 pl-2 text-right font-normal">Losses<span className="block text-[0.65rem]">0.5% fees</span></th><th scope="col" className="py-2 pl-2 text-right font-normal">Missing exits</th></tr></thead>
              <tbody>
                {evidence?.windows.map((row) => {
                  const metrics = row.metrics
                  const value = metrics == null ? null : fee === '50'
                    ? missing === 'loss' ? metrics.meanNetLoss50 : metrics.meanNet50
                    : missing === 'loss' ? metrics.meanNetLoss100 : metrics.meanNet100
                  return <tr key={row.holding} className="border-t border-border/40">
                    <th scope="row" className="pr-3 font-normal"><Button variant={holding === row.holding ? 'default' : 'ghost'} disabled={!metrics} aria-pressed={holding === row.holding} onClick={() => setHolding(row.holding)} className="my-1 min-h-11 justify-start px-2">{durationLabel(row.holding)}</Button></th>
                    {metrics && value != null ? <><td className={cn('figure px-2 text-right', value >= 0 ? 'text-gain' : 'text-loss')}>{netReturn(value)}</td><td className="figure pl-2 text-right text-muted-foreground">{metrics.knownLosers50}/{metrics.known}</td><td className="figure pl-2 text-right text-muted-foreground">{metrics.exitMissing}</td></> : <td colSpan={3} className="text-right text-xs text-muted-foreground">{row.availableSignals === 0 ? 'No completed tests' : `Only ${row.availableSignals} entry ${row.availableSignals === 1 ? 'date' : 'dates'}`}</td>}
                  </tr>
                })}
              </tbody>
            </table>
          </div>
          <div className="mt-3 flex flex-wrap gap-3 text-xs text-muted-foreground">
            <label>Modeled fee, each side<select aria-label="Exit evidence fee" value={fee} onChange={(event) => setFee(event.target.value === '100' ? '100' : '50')} className="mt-1 block min-h-11 rounded-lg border border-border bg-background px-2 text-base sm:text-sm text-foreground"><option value="50">0.5%</option><option value="100">1%</option></select></label>
            <label>Missing exit prices<select aria-label="Missing exit valuation" value={missing} onChange={(event) => setMissing(event.target.value === 'flat' ? 'flat' : 'loss')} className="mt-1 block min-h-11 rounded-lg border border-border bg-background px-2 text-base sm:text-sm text-foreground"><option value="loss">Total loss</option><option value="flat">Zero gross return</option></select></label>
          </div>
        </div>
        <div>
          <h2 className="text-sm font-medium">Plan an exit date</h2>
          {available.length ? <>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">Choose a tested duration and enter your entry time. This is your calendar plan, not an automatic sell signal.</p>
            <label className="mt-4 block text-xs text-muted-foreground">Hold after entry<select aria-label="Planned holding period" className="mt-1 block min-h-11 w-full rounded-lg border border-border bg-background px-3 text-base sm:text-sm text-foreground" value={holding ?? ''} onChange={(event) => setHolding(event.target.value ? Number(event.target.value) : null)}><option value="">Choose a hold</option>{available.map((row) => <option key={row.holding} value={row.holding}>{durationLabel(row.holding)}</option>)}</select></label>
            <label className="mt-4 block text-xs text-muted-foreground">Entry time · UTC<Input type="datetime-local" step="60" aria-label="Planned entry time UTC" value={entry} onChange={(event) => setEntry(event.target.value)} className="mt-1 min-h-11 rounded-lg" /></label>
            <div aria-live="polite" className="mt-4 text-sm">{exit ? <><span className="text-muted-foreground">Planned exit</span><time dateTime={exit} className="figure mt-1 block">{utcMinute(exit)}</time></> : <span className="text-muted-foreground">{holding == null ? 'Choose a hold to calculate the exit date.' : 'Enter a valid entry time to calculate the exit date.'}</span>}</div>
          </> : <p className="mt-2 text-sm text-muted-foreground">More history is needed before comparing exit windows for this view.</p>}
        </div>
      </div>
      <details className="mt-4 text-xs leading-relaxed text-muted-foreground"><summary className="min-h-11 cursor-pointer content-center">Backtest details</summary><div className="flex flex-col gap-2 pb-1">
        <p>CMC snapshots from {from} through {through}. Backtest completed {nativeExitStudy.backtestCompletedAt.slice(0, 10)}. Every displayed return for this view uses the same entry dates across holds and algorithms. At least six matching dates are required to display returns; this does not establish predictive accuracy.</p>
        <p>Entry used the next saved snapshot after the signal. Exit used the chosen number of saved {unit} after entry. Actual snapshot times vary. The planner uses exact elapsed UTC time and does not place an order.</p>
        <p>Average returns include ten equal capital slots per entry date. Missing entries stay cash. Known losses count selected coins with available entry and exit prices at 0.5% fees per side, regardless of the return fee setting above. These are overlapping historical baskets, not compounded returns or probabilities for today's coins.</p>
        {chosen?.metrics && <p>Selected hold: {chosen.metrics.selected} selections, {chosen.metrics.entryMissing} missing entries, {chosen.metrics.exitMissing} missing exits. Evaluated exits {chosen.exitStart?.slice(0, 10)} through {chosen.exitEnd?.slice(0, 10)}.</p>}
      </div></details>
    </div>
  </details>
}
