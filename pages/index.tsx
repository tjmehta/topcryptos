import { DEFAULT_WINDOW, RankingsView } from '@/components/RankingsView'
import type { GetStaticProps } from 'next'
import type { RankingSummary } from '@/modules/rankingSummary'
import { staticSummaryProps } from '@/modules/staticSummaryProps'

type Props = { summary: RankingSummary | null }

export default function Home({ summary }: Props) {
  return <RankingsView mode="daily" summary={summary} />
}

// Daily buckets change once a day; an hourly refresh keeps "as of" recent.
export const getStaticProps: GetStaticProps<Props> = (context) =>
  staticSummaryProps(context, 3600, async () => {
    const { loadRankingSummary } = await import('@/modules/rankingSummaryServer')
    return loadRankingSummary('daily', DEFAULT_WINDOW.daily)
  })
