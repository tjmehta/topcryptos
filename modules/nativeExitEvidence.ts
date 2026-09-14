import data from './data/native-exit-evidence.json'
import type { RankingAlgorithm } from './processRankings'

export type NativeExitMode = 'daily' | 'hourly'
export type NativeExitMetrics = {
  holding: number
  selected: number
  known: number
  knownLosers50: number
  entryMissing: number
  exitMissing: number
  meanNet50: number
  meanNet100: number
  meanNetLoss50: number
  meanNetLoss100: number
}
export type NativeExitWindow = {
  holding: number
  availableSignals: number
  status: 'comparable' | 'sparse' | 'unavailable'
  exitStart: string | null
  exitEnd: string | null
  metrics: NativeExitMetrics | null
}
export type NativeExitEvidence = {
  mode: NativeExitMode
  view: number
  algorithm: RankingAlgorithm
  recommendation: null
  status: 'no-validated-exit'
  matchedSignals: number
  signalDates: string[]
  entryDates: string[]
  slots: number
  windows: NativeExitWindow[]
}
type Configuration = Omit<NativeExitEvidence, 'algorithm' | 'recommendation' | 'status' | 'windows'> & {
  windows: Omit<NativeExitWindow, 'metrics'>[]
  methods: Record<RankingAlgorithm, NativeExitMetrics[]>
}
export const nativeExitStudy = data.study

export function getNativeExitEvidence(
  mode: NativeExitMode,
  view: number,
  algorithm: RankingAlgorithm,
): NativeExitEvidence | null {
  const configuration = (data.configurations as Configuration[]).find(
    (item) => item.mode === mode && item.view === view,
  )
  if (!configuration) return null
  const { methods, windows, ...shared } = configuration
  return {
    ...shared,
    algorithm,
    recommendation: null,
    status: 'no-validated-exit',
    windows: windows.map((window) => ({
      ...window,
      metrics: methods[algorithm]?.find((row) => row.holding === window.holding) ?? null,
    })),
  }
}
