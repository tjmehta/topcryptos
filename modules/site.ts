// Public origin of the deployed site. The canonical URLs emitted by the pages
// and the <loc> entries in public/sitemap.xml must agree byte for byte, so both
// derive from this one value (guarded by modules/__tests__/site.test.ts).
export const SITE_ORIGIN = 'https://topcryptos.io'

// Query parameters (days, algo, exchange, ...) are view state, not separate
// pages, so every variant points search engines at the bare route.
export function canonicalUrl(path: string): string {
  return new URL(path, SITE_ORIGIN).toString()
}
