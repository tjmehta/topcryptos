// Small response contract; the full research ledger stays on the server.
export type OutlookEvidenceRow = {
  holding: number
  signalStart: string
  signalEnd: string
  exitEnd: string
  laterStart: string
  later: {
    activeDates: number
    coins: number
    selected: number
    known: number
    knownLosses50: number
    entryMissing: number
    exitMissing: number
    medianKnownNet50: number | null
    p10KnownNet50: number | null
  }
}
export type OutlookEvidenceResponse = {
  context: string
  studiedAt: string
  rows: OutlookEvidenceRow[]
}
