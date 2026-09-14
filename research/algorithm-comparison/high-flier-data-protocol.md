# Frozen data protocol: historical Binance USDT high-flier pilot

## Freeze and purpose

This acquisition protocol is frozen before any forward high-flier or exit outcome is computed. It supplies the point-in-time annual cohorts and daily bars required by `high-flier-protocol.md`; the acquisition program must not compute signals, entries, exits, MFE, MAE, returns, peaks, threshold crossings, or method comparisons.

The study is a retrospective, venue-specific pilot of established liquid Binance Spot USDT pairs. It is not prospective proof, a global top-500 universe, a market-cap-ranked universe, or an exact Classic backtest. Binance archive availability and prior-December quote turnover do not measure global market capitalization. A fixed annual cohort necessarily misses within-year new listings.

Calendar-year reports for 2020–2022 are the predeclared development block. Calendar-year reports for 2023–2025 are the reserved retrospective evaluation block. This split is not a prospective holdout and must not be described as one. Data after 2025 are acquired only where needed to grade the frozen 2025 cohort through its February 2026 follow window.

## Public source and discovery

Use only Binance's anonymous official public archive:

- ListObjectsV2 endpoint: `https://s3-ap-northeast-1.amazonaws.com/data.binance.vision`
- archive prefix: `data/spot/monthly/klines/`
- interval: Spot daily (`1d`) monthly archives
- archive key: `data/spot/monthly/klines/{SYMBOL}/1d/{SYMBOL}-1d-{YYYY-MM}.zip`
- required adjacent checksum key: the archive key plus `.CHECKSUM`

Discover objects from bucket manifests; do not probe every symbol/month by blind HTTP 404 requests. First list symbol prefixes with delimiter `/`, retain raw symbols ending exactly in `USDT`, and then list each retained symbol's `1d/` prefix. Store each listing response and a normalized object inventory. Historical archive prefixes and past bars are the only cohort inputs. Current `exchangeInfo`, current-volume endpoints, current pair presence, and future archive presence are forbidden cohort inputs.

The previously acquired BTCUSDT and ETHUSDT ZIP/checksum files under `external-data/`, and checksummed identity-edge samples under `high-flier-data-probe/`, may be copied byte-for-byte into the new raw tree only when their SHA-256 and size agree with the newly discovered object/checksum specification. Existing files must never be modified.

## License, attribution, and research-only scope

The governing public terms are `https://data.binance.vision/Binance_Vision-Terms_of_Use.pdf`, Binance Vision Dataset Terms version 1.0, last updated August 26, 2026. The terms provide the datasets under Creative Commons Attribution-NonCommercial-ShareAlike 4.0 International (`CC BY-NC-SA 4.0`) and expressly permit algorithmic historical backtesting for purely personal non-production research and non-commercial open-source data-science evaluations. This acquisition is limited to that non-commercial research purpose. It must not feed production, live/proprietary trading execution, automated commercial order generation, compensated signal distribution, a commercial financial product, or any commercial integration without a separate written enterprise data license.

Every final manifest must attribute the source as “Binance Vision historical market data,” include the terms URL, version/date, `https://creativecommons.org/licenses/by-nc-sa/4.0/`, and the non-commercial research scope. Any redistributed derivative work must retain attribution and the identical CC BY-NC-SA 4.0 terms. Raw Binance archives and sidecars acquired here are local research inputs and must not be published or redistributed externally by this task. Nothing in the dataset or research is financial advice, and Binance does not sponsor or endorse this study.

## Immutable acquisition bounds

The complete run must remain within all of these bounds:

- at most 800 ListObjectsV2 requests;
- at most 20,000 non-listing object GETs, including ZIPs and checksum sidecars;
- less than or equal to 100,000,000 bytes of newly downloaded, persisted response content, counting listings, ZIPs, and checksum sidecars;
- at most four concurrent network requests;
- sustained request start rate at most four per second;
- retry limit four attempts per request with exponential backoff for HTTP 429 and 5xx responses.

Before starting a request that could breach a bound, stop without making it and write the resumable run state and cap reason. Never change a bound after seeing data. No API key, account, secret, paid/private API, package install, production endpoint, application cache, or production file may be used.

## Frozen cohort calendar

Freeze six annual cohorts:

| Cohort year | Formation month | Follow window, inclusive | Reporting block |
| --- | --- | --- | --- |
| 2020 | 2019-12 | 2019-11 through 2021-02 | development |
| 2021 | 2020-12 | 2020-11 through 2022-02 | development |
| 2022 | 2021-12 | 2021-11 through 2023-02 | development |
| 2023 | 2022-12 | 2022-11 through 2024-02 | reserved retrospective evaluation |
| 2024 | 2023-12 | 2023-11 through 2025-02 | reserved retrospective evaluation |
| 2025 | 2024-12 | 2024-11 through 2026-02 | reserved retrospective evaluation |

For cohort year `Y`, use only the archive roster discoverable under historical symbol prefixes and valid daily bars in December `Y-1`. Rank eligible candidates by the sum of daily quote-asset volume over that December, descending, with raw symbol ascending as the deterministic tie-break. Select exactly the first 50 if at least 50 are eligible; otherwise select every eligible candidate and record the shortfall. Cohort membership remains immutable even if later archives are absent, a pair delists, or a symbol is reused.

## Candidate parsing and frozen exclusions

A candidate instrument is a raw Binance archive symbol ending exactly in `USDT`; its base is the exact prefix before `USDT`. Pair identity is the raw symbol. Never stitch symbols, aliases, redenominations, migrations, forks, or exchanges.

Exclude these frozen stable bases by exact equality:

`USDC`, `TUSD`, `BUSD`, `USDP`, `PAX`, `DAI`, `USDS`, `SUSD`, `FDUSD`, `AEUR`, `EUR`, `UST`, `USTC`, `USDD`, `USD1`.

Exclude leveraged products only with structured evidence; never use a generic suffix exclusion. In particular, `JUPUSDT` is not excluded merely because its base ends in `UP`. A base ending in `UP` or `DOWN` is classified as leveraged only when both reciprocal `{UNDERLYING}UPUSDT` and `{UNDERLYING}DOWNUSDT` archive prefixes exist and `{UNDERLYING}USDT` also exists. A base ending in `BULL` or `BEAR` is classified only when both reciprocal `{UNDERLYING}BULLUSDT` and `{UNDERLYING}BEARUSDT` archive prefixes exist and `{UNDERLYING}USDT` also exists. An explicit official documented map may additionally classify a product, but the frozen acquisition implementation contains no such supplemental entries. Record the suffix, inferred underlying, reciprocal symbols, and underlying pair as evidence for every exclusion.

Every discovered formation-month candidate must receive exactly one final disposition and reason. At minimum report counts and symbol lists for: selected; eligible but below rank 50; stable-base exclusion; structured leveraged-product exclusion; missing formation archive; checksum/archive failure; invalid ZIP/CSV; missing December 1; missing December 31; fewer than 28 valid distinct UTC dates; duplicate UTC date; and invalid required bar fields. When several failures apply, store all reason codes and choose the primary reason in the preceding order after product exclusions. Preserve candidate counts before and after every exclusion.

## Daily-bar validation

Binance Spot kline CSV rows have exactly 12 fields: open time, open, high, low, close, base volume, close time, quote-asset volume, trade count, taker-buy base volume, taker-buy quote volume, ignore.

Retain source decimal strings in normalized output; numeric validation may use Python `Decimal`. A valid required bar has:

1. exactly 12 fields;
2. finite strictly positive open, high, low, and close;
3. `high >= max(open, close)`, `low <= min(open, close)`, and `low <= high`;
4. finite nonnegative base volume, quote volume, taker-buy base volume, and taker-buy quote volume;
5. an integer nonnegative trade count;
6. an open timestamp at 00:00:00 UTC and a close timestamp after it spanning a complete daily interval, allowing Binance's inclusive final millisecond/microsecond convention.

A parseable terminal bar shorter than a complete daily interval is `partial_interval`, is retained, and is not a valid required bar. Do not reject its entire archive. Zero-volume or zero-trade terminal bars are likewise retained and flagged under the field rules rather than causing archive-wide rejection.

Normalize timestamps to integer UTC microseconds while retaining the raw values and detected units. Values before 2025-01-01 must be millisecond-scale and values from 2025-01-01 onward must be microsecond-scale, matching Binance's documented Spot archive switch. Record every exception.

Formation eligibility requires at least 28 complete valid distinct UTC daily dates in the formation December and complete valid bars on both December 1 and December 31. Any duplicate UTC date makes that symbol ineligible for that cohort; do not select one duplicate or aggregate duplicates. Sum quote volume across the valid distinct formation bars only after all eligibility conditions pass.

For follow data, retain every parseable source row, including duplicate dates and invalid/zero/partial rows, with status flags. Do not compress duplicates, synthesize missing dates, forward-fill, or silently discard a gap. Missing dates are represented in the quality manifest as gaps and remain absent from the panel. Archive absence after selection is a data-quality/outcome-availability flag, never a survivor filter and never a reason to remove cohort membership.

## Follow-window acquisition

After freezing each cohort from its preceding December, acquire the selected raw symbols' monthly daily archives from November `Y-1` through February `Y+1`, inclusive. This range supports the 60-consecutive-bar warmup, all December signals, t+2 entry, delayed exits, and the 30-day hard horizon at the stated boundary. Fetch only keys present in the saved object inventory. Retain each selected symbol even when one or more requested archives are absent.

ZIP and adjacent `.CHECKSUM` objects are both required. Parse a ZIP only after the checksum sidecar has been parsed and SHA-256 of the ZIP exactly matches it. Preserve both raw objects and record source URL/key, listed size, downloaded byte size, ETag, LastModified, expected SHA-256, actual SHA-256, and acquisition/reuse status.

## Identity boundaries

The raw symbol is the pair key and no cross-symbol stitching is allowed, but raw symbol alone is not sufficient identity when Binance reuses a ticker. Assign `identity_segment_id` from the frozen official-event table plus observed continuity. Every explicit identity event starts a new segment; an unexplained UTC date gap also starts a new segment. Duplicates are flagged without being collapsed and do not themselves create a segment.

The frozen source-linked event table is `high-flier-identity-events.json`, acquired independently of forward outcomes. Record its SHA-256 alongside this data protocol and `high-flier-protocol.md`. It is a bounded eight-event audit, not a complete historical registry. It includes these measured archive hazards:

- `LUNAUSDT`: the May 2022 archive contains the original LUNA through a partial terminal bar on May 13 and a different, newly listed LUNA beginning May 31. These are different identity segments despite sharing one raw symbol and one monthly archive. Never compute across the boundary.
- `BTTUSDT` and `BTTCUSDT`: `BTTUSDT` has a partial terminal bar on 2022-01-17 and `BTTCUSDT` begins on 2022-01-25 following the 1:1000 redenomination. They remain distinct raw symbols and distinct identities; never stitch either direction.
- `BCCUSDT`: the 2018-11-20 terminal bar is partial and zero-trade. Retain and flag it; do not treat it as a complete executable daily bar.

The finalized event table records symbol, pre-event and post-event identities where applicable, exact last/first UTC timestamps, event kind, official source URLs, conversion ratios as metadata only, and a machine-readable `crossing_policy=unknown`. Any signal, open position, MFE/MAE path, entry, or exit whose required interval crosses an identity boundary must remain in the later outcome ledger as unknown with the protocol's 0%/-100% missing-outcome scenarios; it must not be silently deleted or filled using the new identity. A post-event segment must independently accumulate the required 60 consecutive complete daily bars before becoming signal-eligible.

A Binance daily bar's `open_time` is a UTC bucket label and does not prove that trading began at midnight. For each audited listing/reopening whose verified first trade was later (for example LUNA at 06:00 UTC, POL at 10:00 UTC, RENDER/S at 08:00 UTC), record the actual first-trade timestamp and flag the corresponding daily row `non_midnight_first_trade`. Downstream entry or exit fills scheduled for that day's nominal open are unexecutable/unknown; they must not use the daily OHLC open. Partial terminal durations are separately flagged and are not complete bars.

The acquisition quality manifest marks every affected row and raw symbol, emits identity-segment boundaries and unresolved crossing intervals for the downstream runner, and states that the event table is bounded rather than exhaustive. This metadata is frozen without computing forward returns.

## Pre-outcome acquisition correction record

An initial inventory-only process loaded acquisition-program SHA-256 `3682b9e53390dce2a79f7b299f2048f6fd8a8cf0523444adc1d4e9a530a0f333` as background task `bngl6qtra`. It was stopped at a safe checkpoint after 129 ListObjectsV2 requests and 2,810,628 persisted listing-response bytes, with zero object GETs and therefore no downloaded price archives, cohort formation, panel, final artifact, or outcome inspection. The old source bytes were not preserved and must be reported as unavailable/unverifiable; only the actual hash and run state are known. Saved listing XML responses remain immutable and may be reused after hash verification, with their requests and bytes retained in the cumulative bounds.

Before archive or outcome acquisition, four corrections were made and recorded as a superseding program revision:

1. leveraged-product structural evidence is restricted to symbols with archive object keys dated no later than that cohort's formation month, so future pair presence cannot affect a past cohort;
2. audited non-midnight listing/reopening dates and early terminal dates are marked partial/unexecutable instead of trusting the daily bucket's nominal midnight bounds;
3. downloaded-byte budget is durably reserved before creating a response file so a crash can conservatively overcount but cannot undercount on resume;
4. protocol, signal-protocol, identity-audit, and acquisition-program hashes are frozen in resumability state and fail closed if changed.

The as-of leveraged classification uses the `YYYY-MM` embedded in historical archive object keys. It does not use S3 `LastModified`, discovery time, current presence, or inferred backfill timestamps. This is a documented pre-outcome correction, not validation of the superseded revision. The original data-protocol SHA-256 was `423aa0cfa67f4ce831f85c108e5ad9a337ff5b4bdfb0ceb6fed0b492230162ed`; its exact bytes were not separately archived before this semantic amendment and must not be reconstructed or claimed available. Exact listing-file hashes, unavailable intermediate program hashes, preserved program revisions, and protocol amendments are recorded under `high-flier-data/state/` and in final provenance.

## Pre-outcome acquisition-safety amendment

The independent audit of the preserved `96795ee52d1ecd5854ea7de0bdb2ab2487362be0a210db7938ca26bd3f6f1247` collector revision was completed before any object GET, archive parsing, cohort output, panel, or outcome computation. That revision must never resume. Its byte-for-byte source remains under `high-flier-data/versions/`. The corrected collector and all metadata inputs are captured and hashed at process start, frozen in resumability state, checked before every phase and network request and again during finalization, and used directly for final provenance. Any on-disk mutation fails closed; finalization may not re-label an already executing image with replacement bytes.

Before a corrected run can reuse the 128 saved ListObjectsV2 XML responses, it must verify every path, regular-file/no-symlink status, byte length, SHA-256, XML prefix, delimiter, page number, and continuation chain against immutable revision provenance. The cumulative 129 listing attempts, 128 responses, 2,810,628 persisted bytes, and one stopped in-flight attempt remain charged. State counters must be nonnegative bounded integers and must reconcile with listing files, raw files, and acquisition records. No reset or unrecorded adoption is allowed.

A final static review found and corrected three additional pre-acquisition resumability/as-of defects. First, each annual candidate roster is restricted to symbols with at least one ZIP object-key month no later than that cohort's formation month; a future-only symbol prefix never enters an earlier cohort's candidate counts or exclusion flow. A historically present symbol with no formation-December archive remains a candidate with `missing_formation_archive`. Second, listing and object writes use explicit pending-write state records. A verified file left by an interrupted write is promoted only when its stored length and SHA-256 match; a missing file is tolerated only for a pending record; an unrecorded file is never adopted. Conservatively reserved but unmaterialized bytes remain charged and are reported rather than reset. Third, listing provenance uses the stable state `persisted`, not process-relative `downloaded` versus `existing`, so restart timing cannot change final artifact hashes. The executing Python implementation/version/cache tag and zlib runtime are pinned in corrected provenance, and the archived corrected source is byte-equal to the executing image. A final fail-closed gate prevents entry into every network-capable phase unless mutable state contains explicit independent re-audit clearance that pins the exact acquisition-program and final-provenance SHA-256 values, a nonempty reviewer, a valid UTC review timestamp, and `network_resume_authorized=true`. Merely creating provenance cannot resume acquisition. These changes occurred with zero object GETs and no cohort, panel, final artifact, forward-price, signal, or outcome computation.

All network access is HTTPS to the two frozen Binance hosts and paths. Automatic redirects are disabled and every 3xx fails closed; an uncounted/unpaced redirect is forbidden. Each actual attempt is paced and counted before dispatch. A wall-clock request-start timestamp is persisted so a restarted process observes the same 250 ms minimum start interval; monotonic time is additionally used within a process. Response bodies are streamed with an upper bound of the lesser of remaining persisted-byte budget and the frozen per-response cap, plus one byte only to detect overflow. Validate numeric `Content-Length` when present and exact listed object size. Listing responses are capped at 4 MiB.

Every owned output path is lexically confined to `high-flier-data/`; all existing and created path components are traversed with directory file descriptors and no-follow semantics. Symlinks, non-regular leaves, and path escapes are rejected before writes. Immutable artifacts remain create-or-exact-hash-match. Mutable state replacement also refuses symlink/non-regular targets.

A checksum sidecar may be reused from the owned raw tree only when its exact bytes and SHA-256 are already pinned by the corrected run's state. External/probe checksum sidecars are never trusted by size and are not copied; fetch the official sidecar afresh before any external ZIP reuse. An external ZIP may be copied only after its exact SHA-256 equals that freshly authenticated sidecar and its length equals the listed size. Every missing, verified, safety-rejected, or failed archive record includes deterministic ZIP and checksum source URLs.

Freeze parsing safety caps unrelated to economic outcomes: compressed ZIP at most 8 MiB; exactly one unencrypted file member; expanded CSV at most 1 MiB; at most 64 physical rows; each line at most 16 KiB; each numeric field at most 1,024 characters, at most 1,024 coefficient digits, and absolute decimal exponent at most 1,024. Stream the member without `extract`/`extractall`; any violation is an explicit archive-quality failure. A selected membership survives later archive parse/safety failures with missing-data flags.

A complete pre-2025 daily row has the exact millisecond inclusive duration `86,399,999 ms`; a complete 2025+ row has the exact microsecond inclusive duration `86,399,999,999 µs`. No one-second tolerance is allowed. Timestamp digit/range conversion failures stay as row-level invalid diagnostics rather than invalidating an otherwise readable archive. Blank physical CSV rows are retained as invalid source rows. December quote-volume sums use bounded exact fixed-point coefficient/scale arithmetic rather than the ambient Decimal context.

The corrected collector schema-validates the frozen eight-event `high-flier-identity-events.json` and derives normalized event metadata from it. BCC's 2018 partial terminal row remains a separate bar-quality observation, not a fabricated ninth identity event. Raw-date presence gaps and complete-valid-date gaps are reported separately, both including requested leading/trailing edges; an invalid-but-dated row is raw-present and valid-absent.

None of these safety amendments changes a ranking threshold, cohort date, selection rule, signal, execution rule, or outcome definition.

## Exclusive, idempotent persistence

The acquisition program owns only:

- `high-flier-data-protocol.md`
- `high-flier-data-acquire.py`
- `high-flier-data/`

All generated files use create-or-hash-match semantics: if a path exists, its bytes must match the would-be output exactly or the run must refuse to overwrite it. Mutable resumability state is the sole exception: write it atomically to a designated `state/` path, and do not treat it as a frozen study artifact. Existing files elsewhere in the repository are read-only.

Raw objects live under `high-flier-data/raw/`; saved ListObjectsV2 responses under `high-flier-data/listings/`; resumability metadata under `high-flier-data/state/`; and finalized artifacts under `high-flier-data/final/`.

## Frozen output schemas

`final/cohort-manifest.json` is the immutable cohort artifact. Its top-level verification fields are `schema_version="high-flier-data-v1"`, `protocol_frozen=true`, `frozen_at`, `data_protocol` (`path`, `sha256`), `acquisition_program` (`path`, `sha256`, Python version), `study` (`signal_start=2020-01-01`, `signal_end=2025-12-31`), `blocks`, and `artifacts`. It also contains bounds and realized request/byte counts; license/source attribution; discovery inventory hash; formation rules; exclusion rules; identity rules and machine-readable crossing intervals; one record per candidate/cohort with `cohort_year`, `reporting_block`, `symbol`, `base`, archive presence, validation counts, all reason codes, primary reason, formation quote-volume decimal string, formation rank, selected flag, and leveraged evidence; selected symbol lists; candidate-flow counts; raw archive records/hashes; missing requested months; and data-quality summaries.

`final/cohort-membership.csv.gz` contains:

`cohort_year,reporting_block,symbol,base,formation_month,formation_valid_days,formation_quote_volume,formation_rank,selected,primary_reason,all_reasons,identity_ambiguity`

`final/daily-panel.csv.gz` contains every retained follow source row in deterministic `(cohort_year,instrument_id,date,source_archive,source_row)` order:

`cohort_year,reporting_block,instrument_id,symbol,identity_segment_id,date,open_time_us,close_time_us,open_time_raw,close_time_raw,timestamp_unit,open,high,low,close,base_volume,quote_volume,trade_count,taker_buy_base_volume,taker_buy_quote_volume,source_archive,source_row,bar_status`

`instrument_id` equals the identity-segment-specific `identity_segment_id`, never the unsplit raw symbol. Decimal price/volume fields remain source strings. `bar_status` begins with `complete`, `partial_terminal`, or `invalid`, followed when needed by stable pipe-delimited detail flags. Duplicate rows remain separate. Downstream complete paths require `bar_status` beginning `complete`; executable opens additionally require `trade_count>0`.

`final/data-quality.json` contains per cohort/symbol requested/present/missing months, archive/checksum outcomes, source rows, valid rows, duplicate dates, source-order violations, UTC gaps, timestamp-unit counts/exceptions, invalid-row reason counts, first/last dates, contiguous identity segments, and ambiguity notes. Gaps and duplicates are observations, not repaired data.

`final/object-inventory.json.gz` contains normalized listing records (`key`, `size`, `last_modified`, `etag`) and discovery/listing provenance. `final/file-hashes.json` has `schema_version="high-flier-data-hashes-v1"`, the protocol path/hash, acquisition-program path/hash, and an `artifacts` array with path, SHA-256, byte length, and artifact role for every frozen final artifact and retained raw/listing object. The hash file does not hash itself.

Gzip artifacts use deterministic metadata (`mtime=0`, empty filename) and deterministic row/key ordering. JSON is UTF-8 with sorted keys and compact separators. No outcome-analysis artifact is permitted in this directory.
