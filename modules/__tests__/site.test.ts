import { readFileSync } from 'fs'
import { join } from 'path'

import { SITE_ORIGIN, canonicalUrl } from '../site'

const publicDir = join(__dirname, '..', '..', 'public')

describe('site crawl controls', () => {
  it('canonical URLs collapse query variants onto the bare route', () => {
    expect(canonicalUrl('/')).toBe('https://topcryptos.io/')
    expect(canonicalUrl('/hourly')).toBe('https://topcryptos.io/hourly')
    expect(canonicalUrl('/breakouts')).toBe('https://topcryptos.io/breakouts')
  })

  it('sitemap.xml lists exactly the public pages, as their canonical URLs', () => {
    const xml = readFileSync(join(publicDir, 'sitemap.xml'), 'utf8')
    const locs = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1])
    expect(locs).toEqual(['/', '/hourly', '/breakouts'].map(canonicalUrl))
    expect(xml).toContain('xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"')
    expect(xml).not.toMatch(/\/api\//)
    expect(locs.some((loc) => loc.includes('?'))).toBe(false)
  })

  it('robots.txt keeps the API off crawlers and points at the sitemap', () => {
    const robots = readFileSync(join(publicDir, 'robots.txt'), 'utf8')
    expect(robots).toMatch(/^User-agent: \*$/m)
    expect(robots).toMatch(/^Disallow: \/api\/$/m)
    expect(robots).toMatch(new RegExp(`^Sitemap: ${SITE_ORIGIN}/sitemap.xml$`, 'm'))
  })
})
