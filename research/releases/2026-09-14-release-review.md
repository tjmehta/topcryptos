# Release review — September 14, 2026 (America/Los_Angeles)

Verified at 2026-09-15 05:15 UTC. Reviewed `cf78194..7bed857`.

## Result

The application changes were already committed, pushed, and deployed when this release pass began. Vercel reported production READY at exact commit `7bed8574cd62f7d05956bedb6a66dd79f597e975`, serving https://topcryptos.io from deployment `dpl_AaKgzTQL1VURKjUKJG9azLdw2xBA`. Its production build completed in 29,276 ms. Port 3038 had no listener.

Two independent reviews covered breaking changes and testing/integration. Neither found a confirmed release blocker.

## Review observations and disposition

1. The filesystem cache comment overstated that all production live requests fetch upstream. Explicit filesystem snapshot mode can also run in a local production build. Clarified the comment to say S3-backed requests; preserved intentional keyless local behavior. The suggested behavior finding was withdrawn after checking this configuration distinction.

## Validation

- Full Jest suite: 26 suites, 226 tests, 11 snapshots passed.
- TypeScript typecheck passed.
- Production homepage, hourly page, Breakouts page, and Outlook evidence endpoint returned HTTP 200.
- Hourly endpoint returned five snapshots with numeric CMC IDs and a latest timestamp of 2026-09-15 05:09 UTC. The six-hour browser view rendered 120 chart paths without the empty-history message; opening a coin exposed Outlook and Past outcomes without an application error.
- Coinbase seven-day Momentum endpoint: 50 markets, 43 eligible, two signals, HTTP 200.
- Kraken seven-day Momentum endpoint: 50 markets, 34 eligible, two signals, HTTP 200.
- Integration replay of 33 saved CMC snapshots across all five algorithms and 3/6/24-hour windows: 491–497 eligible coins, no nonfinite scores, and available Outlooks for eligible coins.
- Vercel error-log query for the preceding hour returned no records; this is a point-in-time check, not continuous monitoring.
- Runtime imports do not depend on research, tests, or screenshots excluded from deployment.

## Interpretation limits

These checks establish application behavior and data availability. They do not establish superior trading returns or optimal Radar thresholds. Coinbase/Kraken market models remain unvalidated, with forecast probabilities withheld. Historical outcomes remain scoped to their matched data and interval.

This follow-up changes only a comment and this review record. Local `.codex/` and `.mcp.json` configuration is excluded from the commit.

## Dependency follow-up — 2026-09-15 05:20 UTC

The push of review commit `edb17a3` exposed four existing Dependabot alerts. Updated Next.js from 16.3.0 to 16.3.5, its sharp dependency from 0.35.3 to 0.35.4, and development dependency js-yaml from 3.15.1 to 3.15.2. No new direct dependencies or overrides were added.

2. Runtime Next.js alerts 170/171: the installed version was below the 16.3.3 patch boundary, including the [AVIF image optimization advisory](https://github.com/vercel/next.js/security/advisories/GHSA-2xp9-vwfh-vxw4). Resolved by the Next.js patch update.
3. Runtime sharp alert 173: installed 0.35.3 was below patched 0.35.4. Resolved through the updated dependency tree.
4. Development js-yaml alert 172: installed 3.15.1 was below patched 3.15.2. Updated within its existing dependency range.

After the updates: npm audit reported zero vulnerabilities; all 26 suites / 226 tests / 11 snapshots and typecheck passed again; the local production build completed successfully with Next.js 16.3.5. The production follow-up must deploy this lockfile before these fixes are considered live.

Independent dependency review found no actionable issues: changes are limited to those packages and matching transitive helpers/binaries, with compatible Node requirements and React peers.

## Dependency follow-up — 2026-10-10

Updated Next.js and eslint-config-next together from 16.3.5 to 16.3.8, with both manifest ranges set to `^16.3.8`. The lockfile stays on 16.3.x. Refreshed sharp from 0.35.4 to 0.35.5, its matching native binaries and libvips packages, and source-map-js from 1.2.1 to 1.2.2. No application source, direct dependencies or overrides were added.

- Next.js 16.3.8 addresses all seven advisories reported for 16.3.5, including the critical [next/og ImageResponse RCE](https://github.com/advisories/GHSA-vcvr-r3jv-pc5j) and high [Image Optimization SSRF](https://github.com/advisories/GHSA-cjq9-62q9-8jv4). Static inspection found no `next/og` or `next/image` imports and no `images` configuration in `next.config.js`. These paths are probably unreachable in the current app; this is a scoped exposure assessment, not an exploit reproduction or an emergency classification.
- sharp 0.35.5 addresses the [librsvg advisory](https://github.com/advisories/GHSA-wq5f-xc86-pv6w), and source-map-js 1.2.2 addresses the [indexed source-map denial of service](https://github.com/advisories/GHSA-68fv-2mgg-jv7q). Existing parent dependency ranges accept both patches, so no override was needed.
- The permitted trivial development-only follow-up refreshed brace-expansion from 2.1.4 to 2.1.7 and its test-exclude copy from 1.1.18 to 1.1.21, within the existing `^2.0.2` and `^1.1.7` ranges. These address the [recursion](https://github.com/advisories/GHSA-qhr7-859c-m2p7) and [quadratic expansion](https://github.com/advisories/GHSA-q2hr-2g5m-vwhr) advisories without upgrading their callers.

After the refresh, `npm audit --omit=dev` reports zero vulnerabilities. The full audit reports 24 development-only package findings, 5 high and 19 moderate, propagated from two underlying advisories: [braces](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm) through the ESLint/glob tooling and [sprintf-js](https://github.com/advisories/GHSA-hp3w-g68c-fv3c) through Jest's js-yaml/argparse tooling. Neither advisory lists a published patched version. They remain separate from the production dependency claim; forced downgrades, new overrides and tooling migrations are outside this patch.

The TJS-1915 handoff records audit, typecheck, the full Jest suite, lint and the production build against the exact pushed SHA, plus its Vercel preview. Local checks use inert placeholder credentials and `NODE_ENV=production` for the build, as required by `CLAUDE.md`. Independent review remains the acceptance step. The project lead must integrate the branch before these dependency fixes are live in production.
