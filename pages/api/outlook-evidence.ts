import type { NextApiRequest, NextApiResponse } from 'next'
import data from '@/modules/data/coin-outlook-evidence.json'
import type { OutlookEvidenceResponse } from '@/modules/coinOutlookEvidence'

export default function handler(
  req: NextApiRequest,
  res: NextApiResponse<OutlookEvidenceResponse | { error: string }>,
) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET')
    return res.status(405).json({ error: 'Use GET.' })
  }
  const { mode, view, method, state } = req.query
  if (
    (mode !== 'daily' && mode !== 'hourly') ||
    typeof view !== 'string' ||
    !data.study.views[mode].includes(Number(view)) ||
    typeof method !== 'string' ||
    !data.study.methods.includes(method) ||
    typeof state !== 'string' ||
    !['building', 'extended', 'fading', 'mixed'].includes(state)
  ) {
    return res.status(400).json({ error: 'Unknown outlook context.' })
  }
  const rows = data.cells
    .filter(
      (c) =>
        c.mode === mode &&
        c.view === Number(view) &&
        c.method === method &&
        c.state === state &&
        c.later.selected > 0,
    )
    .map(({ holding, signalStart, signalEnd, exitEnd, laterStart, later }) => ({
      holding,
      signalStart,
      signalEnd,
      exitEnd,
      laterStart,
      later,
    }))
    .sort((a, b) => a.holding - b.holding)
  res.setHeader('Cache-Control', 'public, max-age=300')
  return res
    .status(200)
    .json({
      context: `${mode}:${Number(view)}:${method}:${state}`,
      studiedAt: data.study.date,
      rows,
    })
}
