# Hourly local-cache recovery

Verified 2026-09-14 06:57 UTC.

The configured production price cron runs at :05 each hour, writing production storage. Local development uses FS cache, so those writes do not update its seeded copy.

Before: nine local response snapshots in a ten-hour request. Native IDs ended at 2026-09-14T04:xx; latest 06:xx data used incompatible CoinGecko slug IDs. The six-hour scorer correctly rejected stale/incomplete native histories.

After: a six-hour response contained six 500-coin CMC snapshots,01:xx through 06:50/06:51, including restored 05:03/05:04. Browser Classic / 6 hours rendered 120 paths. Freshness/coverage requirements and source timestamps stayed unchanged.

Implementation: request-time local-only hourly sync, five bounded public requests, five-minute throttle+concurrent deduplication, safe native-data replacement, atomic FS writes, visible-page five-minute refresh and background-return catchup. Live in-memory CMC expiry corrected from 15 hours to 15 minutes. No daily historical fallback calls, new cron, background daemon or production deployment.

Tests: 226 passed, 11 snapshots. Typecheck passed. See source tests in `modules/__tests__/coinmarketcapLocal.test.ts` and `components/__tests__/RankingsView.test.tsx`. Full evidence copied from existing public production history; no synthetic samples or timestamp shifts.

The isolated production build also passed after the fix. Changes remain local; no deployment or cron schedule change.
