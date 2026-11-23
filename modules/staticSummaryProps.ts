import type { GetStaticPropsContext, GetStaticPropsResult } from 'next'

/**
 * ISR wrapper for a page summary.
 *
 * Regeneration errors are rethrown on purpose: Next keeps serving the last
 * good page and retries on the next request, so a transient S3 or exchange
 * failure never replaces real rankings with an empty summary. Only the build
 * (and local dev, which runs this per request) degrades to `summary: null`,
 * because a throw there would fail the deployment or the dev page; that
 * fallback page regenerates soon after.
 */
export async function staticSummaryProps<T>(
  context: GetStaticPropsContext,
  revalidate: number,
  load: () => Promise<T>,
): Promise<GetStaticPropsResult<{ summary: T | null }>> {
  try {
    return { props: { summary: await load() }, revalidate }
  } catch (error) {
    const degrade = context.revalidateReason === 'build' || process.env.NODE_ENV !== 'production'
    if (!degrade) throw error
    console.error({
      event: 'page_summary_unavailable',
      reason: error instanceof Error ? error.message : String(error),
    })
    return { props: { summary: null }, revalidate: 300 }
  }
}
