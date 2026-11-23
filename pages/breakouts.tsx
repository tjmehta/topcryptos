import { BreakoutsView } from '@/components/BreakoutsView'
import type { BreakoutSummary } from '@/modules/rankingSummary'
import type { GetStaticProps } from 'next'
import { staticSummaryProps } from '@/modules/staticSummaryProps'

type Props = { summary: BreakoutSummary | null }

export default function Breakouts({ summary }: Props) {
  return <BreakoutsView summary={summary} />
}

// Signals use completed UTC daily candles; refresh hourly to follow the day change.
export const getStaticProps: GetStaticProps<Props> = (context) =>
  staticSummaryProps(context, 3600, async () => {
    const { loadBreakoutSummary } = await import('@/modules/rankingSummaryServer')
    return loadBreakoutSummary()
  })
