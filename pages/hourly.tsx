import { DEFAULT_WINDOW, RankingsView } from '@/components/RankingsView'
import type { GetStaticProps } from 'next'
import type { RankingSummary } from '@/modules/rankingSummary'
import { staticSummaryProps } from '@/modules/staticSummaryProps'

type Props = { summary: RankingSummary | null }

export default function Hourly({ summary }: Props) {
  return <RankingsView mode="hourly" summary={summary} />
}

// The cron writes one snapshot an hour (at :05); regenerate within that hour.
export const getStaticProps: GetStaticProps<Props> = (context) =>
  staticSummaryProps(context, 900, async () => {
    const { loadRankingSummary } = await import('@/modules/rankingSummaryServer')
    return loadRankingSummary('hourly', DEFAULT_WINDOW.hourly)
  })
