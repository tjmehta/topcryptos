# High-flier study: pre-outcome audit and revision record

## Status

**Current status (2026-09-13):** acquisition and the unchanged frozen empirical run have completed successfully. The independent final-data audit found no confirmed discrepancies; all 143,175 rows passed structural checks, and six sampled rows from five archives matched checksum-verified raw inputs. Empirical results are preserved as `high-flier-results-frozen-20260913-v1.json.gz` (SHA-256 `54c3197473d5aa5e33879a923053a0b9cc97ff4878434c24f75dea981acdbb35`) and `high-flier-summary-frozen-20260913-v1.json` (`79404c94affe9c155d64cee28811f1bb18fac1cd0de84ec6f8ce17b154f09a5a`). Independent empirical aggregate/trade verification completed: primary counts and denominators, paired costs, signal-date block attribution, primary exit bootstrap CI, and deterministic panel/raw score-entry-exit samples were confirmed without a frozen-artifact failure. Gross-versus-net loss-rate and p10-versus-worst-decile-mean wording were clarified in the recommendation; original outputs remain unchanged. The coordinator's synthesis is in `high-flier-recommendation.md`. The paragraphs below preserve historical pre-outcome checkpoints and must not be mistaken for the current execution status. Tracked and staged production diffs remain empty.

The historical comparison has not run. The initial audit checkpoint was during archive-directory discovery: 129 counted listing attempts, 128 saved XML files, 2,810,628 persisted bytes, zero price-archive GETs. Subsequent acquisition with verified collector `02c37` completed inventory discovery and formation for 2020–2022, then background task `b06zqu99l` was reported system-killed for low memory during 2023 formation (200/418 historical candidates). The acquisition owner reports the preserved checkpoint contains 740 listing attempts, 739 listing files/records, 1,461 object GET attempts, 17,731,854 persisted response bytes, and 1,468 raw files/records (1,460 downloaded, eight verified external reuses). The unmaterialized attempt remains counted. No final dataset or strategy outcomes were generated; source/state were not modified after the kill. These crash counts are owner-reported pending independent checkpoint inspection. Functional/provenance verification below did not establish full-run memory scalability. Memory-cause diagnosis and safe recovery are pending; there has been no blind restart. No tracked production files were changed.

Independent audits identified the issues below. Collector revision `a2e352a29814f0c7ed4c751994c5d629fa38e11e71a1e715514942594afd337d` passed independent re-verification of D01–D07, D09–D10 and D12–D18. Its two remaining issues—D11 exact sorting after summation and D08 separate BCC quality-edge output/application—were then corrected and independently verified in final collector `02c37fb41a730bbbbf5c954487f084e896b592db32c58990e415870b09625fac`. The final data protocol is `267f3db35eda78b75575e176fe63e93e887d9932e945be58a28ba3cb2ebb9407`, self-test `f8118c40bb220c31a2688e9f5e8ae615444b36a83e0c21d64d75a467726175c8`, and final provenance `d683d3bad4b2107a083eee7afbd56965d158cd65f4629658ca5822f582535bcb`. No remaining direct blocker was found within the bounded fix-verification scope. The coordinator issued technical clearance to resume the original bounded acquisition on these exact hashes, preserving all prior request/byte counters; this is not new human approval or a bypass of tool permissions. The author reported offline self-tests; the read-only reviewer used in-memory equivalent fixtures because the supplied self-test performs temporary filesystem writes. Runner findings R01–R06 are **fixed and independently re-verified** on runner `4a371b5f30db80fa8c0475727a9e59ea0bba47c5216a63630f9bddda0f50eeb7` and self-test `71143fbe43ae8d936fe65152ce3253ded760c177ba18e1ce1f7028c35b6dda73`; all 30 synthetic tests passed, including the original failing fixtures. Both corrected source files are preserved under `high-flier-code-versions/`. No directly introduced blocker was found in the bounded changed-path review. This is code verification, not empirical strategy validation. Signal lookbacks, gates, thresholds, delayed-execution rules and entry/exit candidates are not being optimized from outcomes.

### Memory-failure recovery — 2026-09-12

The acquisition owner subsequently reported a no-network/no-write replay of saved inputs under a 1 GiB address-space limit: 55,476 inventory objects and six formation-loop passes, peak RSS 75,020 kB. This replay used only persisted archive pairs and is not a completed acquisition or a full finalization memory test. The prior task ended with a harness low-memory kill, no Python MemoryError, and no session-cgroup OOM event; available evidence is consistent with broader machine pressure, not a demonstrated collector leak. The owner verified checkpoint files, runtime inputs and cumulative counters before resuming unchanged collector `02c37` as task `b6y0o9lqb` with `ulimit -v 1048576` and bytecode writes disabled. No resource limits were raised and no unrelated processes were terminated.

The coordinator independently read the new Bash log: prior inventory/formation work reused exactly 740 listing attempts, 1,461 object GET attempts and 17,731,854 bytes, then progressed beyond the prior stopping point to 300/418 candidates for 2023. The coordinator independently verified the collector and data-protocol hashes above and inspected the exact running collector process: RSS 80,764 kB, high-water RSS 81,088 kB, and soft address-space limit 1,073,741,824 bytes. Acquisition is continuing within the original cumulative network bounds; no final dataset or outcome result is established by this recovery check. The initial crash paragraph above remains a historical checkpoint, not the latest runtime state.

### Second low-memory stop — historical checkpoint

Task `b6y0o9lqb` was subsequently reported harness-killed for low host memory despite the 1 GiB address-space ceiling. The acquisition owner reports formation completed for all six years, selecting exactly 50 raw pairs per cohort, and follow-window acquisition reached 700/4,260 unique archives. Latest preserved phase is `acquiring_follow_windows`: 740 listing attempts, 739 listing files/records, 4,573 object GET attempts, 20,645,172 persisted response bytes, and 4,583 raw files/records (4,571 downloaded, 12 verified external reuses). Two interrupted object attempts remain counted without persisted objects. These latest counts are owner-reported. No final artifacts or outcome analysis exist, and no source/state edits or further restart were reported. The earlier running-process measurement does not establish RSS immediately before this second kill. Automatic retries are paused pending resolution of host memory pressure; the user has been informed. No unrelated processes or system settings were changed.

### Acquisition complete; empirical run triggered — 2026-09-13

After the user requested continuation and host memory availability improved, the owner revalidated the preserved checkpoint and resumed once as task `b3m5yfoc4`, with unchanged frozen inputs, cumulative counters and a 1 GiB address-space ceiling. Acquisition exited successfully, with completion timestamp `2026-09-13T01:35:58.952479+00:00`. Totals: 740 listing attempts, 10,689 object GET attempts, 26,371,767 persisted response bytes, zero reserved bytes. All original network caps were respected. Actual live-run peak RSS was not captured.

The owner reports 2,152 candidate/cohort records, 300 selected memberships (50/year), 143,175 daily rows (143,160 complete, 15 partial terminal), 11 memberships with missing months, and no duplicate dates or timestamp-unit exceptions. The owner rehashed all 11,601 file-hash records. The coordinator independently computed hashes of all six final artifacts and checked the frozen manifest schema, study dates, artifact references and realized network bounds. Manifest SHA-256: `7264db85e95a076d587115ace6a1b3a1a8c07a2a645447166103279585f28dc2`; panel: `91dfcdc1afac7a35087a1f9a56b1c75bbede3c504f81a85b4192ef6fe6f7340c`; membership: `6622975110202ae0c9ee4ee316ba5d623f9c6fed6dd659eb9363cd1e718a70bd`. A separate read-only reviewer is checking final-data structure and deterministic raw-row samples.

The coordinator reverified frozen runner/self-test hashes and reran all 30 synthetic tests successfully, then explicitly triggered the unchanged empirical runner with a unique non-overwriting run ID. Strategy results are pending; acquisition completion and passing synthetic tests are not empirical validation. No source/rule tuning or production changes were authorized.

## Version trail

### Collector

- Initial observed collector hash: `3682b9e53390dce2a79f7b299f2048f6fd8a8cf0523444adc1d4e9a530a0f333`. This process fetched listings only. Original source bytes were not preserved.
- Intermediate observed on-disk hash: `0b7d84d6fe213ec38b5c4aec5fd4673ab83f141a1776e8aeddfbd0f73631c947`. Bytes were not preserved.
- Independently audited corrected candidate: `96795ee52d1ecd5854ea7de0bdb2ab2487362be0a210db7938ca26bd3f6f1247`. Its 72,232 source bytes are preserved under `high-flier-data/versions/96795ee52d1ecd5854ea7de0bdb2ab2487362be0a210db7938ca26bd3f6f1247.py`.
- Original data protocol: `423aa0cfa67f4ce831f85c108e5ad9a337ff5b4bdfb0ceb6fed0b492230162ed`.
- Amended data protocol audited with the corrected candidate: `9c510c25479e2cee6b253cfa0f86cca272d27999c8044088d6054d05d6cb769f`.
- Revision provenance files are in `high-flier-data/state/`. Original unavailable bytes must never be described as archived or retrospectively reconstructed without a matching hash.

The mid-process source change was a real reproducibility failure, caught before price acquisition. Saved XML files were independently verified against their recorded hashes and sizes. Reuse is conditional on implementing the same verification and cumulative-budget reconciliation in the corrected program; an audit performed once by a human/agent does not replace a programmatic resume guard.

### Outcome runner

- Audited runner: `949b8a850713a1442375f34d421b735c160ec223368df740d2a5b68dc95b2002`.
- Audited self-test: `cbd02d7bcb15c87b12c1e0b903921671a5b56f1986d6f1418ecca80e68067fb2`.
- Both original files were independently hash-checked and copied byte-for-byte into `high-flier-code-versions/<sha256>-<original-filename>` before correction was authorized.
- The independent reviewer ran the 22 original synthetic tests successfully and found no confirmed signal/exit lookahead in the reviewed paths. Passing those tests did not cover the six additional failures below.

## Collector findings — audited revision 96795

Line references are for the preserved audited revision, not a future corrected file.

| ID | Finding and failure | Audited lines | Required correction |
|---|---|---|---|
| D01 | Finalization hashes current disk bytes, which can differ from code/inputs actually used by the running process. | 1338–1343,1533–1569,1588–1601 | Pin executing-source/input bytes and hashes at startup; preserve in state; verify each phase/finalization; refuse mismatch and build manifests only from pinned state. |
| D02 | Adopted XML and resumed counters are not checked against provenance/filesystem; altered/missing/negative state can evade limits or alter inventory. | 422–448,563–603,1588–1601 | Freeze provenance, verify file SHA/size/XML chains, require valid nonnegative integer counters, reconcile all persisted files and attempts before networking. |
| D03 | Automatic redirects can make uncounted/unpaced requests outside the frozen host. | 460–497 | Disable automatic redirect following or explicitly validate/count/pace every hop. |
| D04 | Unbounded response.read occurs before size/budget checking. | 475–486 | Bound reads by expected size and remaining budget; validate Content-Length. |
| D05 | Intermediate output-directory symlinks can escape the owned tree. | 312–353,384–387 | Reject symlinks across owned components and use no-follow/directory-relative creation. |
| D06 | Existing/external checksum sidecars can be accepted by size alone, letting altered same-length content redefine the expected ZIP hash. | 659–724 | Validate recorded object hashes; use fresh official or independently pinned checksum content before external ZIP reuse. |
| D07 | Compressed ZIP download is bounded, but expansion/row/line sizes are not. | 857–877 | Freeze and enforce expanded-byte, row and field safety limits; retain explicit archive failures. |
| D08 | Identity JSON is hashed but segmentation uses a divergent hard-coded table. | 101–223,1070–1113,1381–1388 | Validate and derive metadata from the source-linked JSON; keep unrelated BCC bar-quality handling explicitly separate. |
| D09 | A bar ending 999ms before the valid inclusive endpoint is classified complete. | 826–843 | Validate exact millisecond/microsecond daily duration. |
| D10 | Oversized timestamp raises OverflowError and discards the entire archive rather than the invalid row. | 404–419,819–824,857–877 | Bounded, nonthrowing row-level timestamp conversion and diagnostics. |
| D11 | Default Decimal addition precision rounds distinct large December volume sums into a tie. | 1031–1045 | Exact bounded fixed-point summation or sufficient bounded local precision, retaining deterministic symbol tie-breaks. |
| D12 | Present-invalid dates are labeled absent; requested-window leading/trailing gaps are omitted. | 1233–1263 | Separate raw-presence gaps from valid-continuity gaps, including requested calendar edges. |
| D13 | Blank CSV rows are silently dropped. | 867–875 | Retain field-count-invalid rows with source row provenance. |
| D14 | Restart loses pacing state and can start a request inside the prior process's 250ms interval. | 445–480 | Persist wall-clock last-request start for restart pacing; monotonic pacing within a process. |
| D15 | Revision trail omits original protocol hash and does not pin the amendment. | protocol114–125; state revision record | Preserve old protocol revision/status and pin immutable consolidated provenance. |
| D16 | Excluded candidates report formation archive absent even when it exists. | 958–983 | Determine archive presence before exclusion branches. |
| D17 | Archive records omit required source URLs. | 711–748 | Emit deterministic ZIP/checksum URLs for successful and failed records. |
| D18 | Candidate flow lacks explicit before/after exclusion stages. | 1316–1326 | Emit auditable stage counts and symbol dispositions. |

Pre-outcome parser safety bounds assigned for the correction: expanded monthly daily CSV at most 1 MiB, at most 64 parsed rows, at most 16 KiB per line, numeric fields at most 1,024 characters plus bounded exponent/arithmetic work. These are resource/format protections, not economic-return outlier filters. If a selected future archive fails validation, retain its cohort membership and mark unknown outcomes rather than dropping the failed coin.

### Collector controls independently confirmed

- The 128 saved XML files match recorded hashes/sizes and parse with valid prefix/delimiter/continuation chains.
- Request attempts, including retries, are recorded before dispatch; current saved counters preserve the one unpersisted in-flight attempt conservatively.
- Candidate selection uses preceding December prices/volume and archive-key months, not LastModified or future-only leverage-product presence.
- Stable exclusions and reciprocal structured leverage checks avoid generic suffix matching such as mistakenly excluding JUP.
- Future missing archives do not remove selected members.
- ZIP members are streamed rather than extracted to paths; no cross-symbol stitching is used.
- Research-only licensing/attribution/nonredistribution scope is recorded.

## Outcome-runner findings — audited revision 949b8

| ID | Finding and failure | Audited lines | Required correction |
|---|---|---|---|
| R01 | `complete|zero_*` schema statuses are treated as incomplete, incorrectly changing formation eligibility and forward-path coverage. | 139–152,879 | Parse leading status class plus details; distinguish complete zero-activity bars from executable opens. |
| R02 | Valid partial-terminal class can be rejected while non-midnight-first-trade detail flags can permit false scheduled-open fills. | 143–152,825–908 | Derive completeness/execution flags from actual CSV schema details, rejecting non-midnight fills explicitly. |
| R03 | Incomplete post-exit paths can be called definitively non-premature. | 614–623 | False requires complete coverage; otherwise unknown, with a separately explicit policy for observed positive hits. |
| R04 | Bootstrap values labeled hits per ten slots are fractional hits per slot, understating values/CI by 10x. | 1549–1568 | Label fractional hit rates separately and scale per-ten-slot estimates and both CI endpoints by ten. |
| R05 | Episode/exit reporting uses entry date rather than signal date, leaking late development signals into evaluation and omitting final-2025 signals entering in2026. | 1688–1708 | Attribute reporting block by signal date; entry-date bootstrap clusters must still include all selected entries through Jan2,2026. |
| R06 | Missing gross-return scenarios are inserted directly into net-fee paired comparisons, creating a false fee advantage. | 1594–1598,1632–1635 | Apply exact 50bps fee transformation to both known and scenario gross returns before comparisons/bootstrap. |

The one-hit-over-60-dates unit regression must distinguish -1/600 fractional hit-rate difference from -1/60 expected hits per ten slots. A missing zero-gross-return scenario must net the same approximately -0.9950% as a known zero-gross-return round trip at 50bps/side, not receive a fee-free zero.

Additional reporting clarifications: premature-exit rates use early exits with evaluable post-exit paths, with hard exits/not-applicable and unknown counts separate. Bootstrap metadata must distinguish nonoverlapping 30-day calendar spans from possible moving-block starts and must not call either independent observations.

### Runner controls independently confirmed

All five scores are causal; t+2 entry, d+2 exit, e+30 hard exit and e+28 final overlay trigger are present; no perfect-peak or threshold fills; exit-day future high/low excluded from pre-exit excursions; same Return7 episode ledger used for all four exits; fixed cooldown independent of exit rule; identity-crossing unknown rows retained; known-trade fees exact; bootstrap masking and position-weighted sums/counts structurally correct.

## Nonblocking universe-interpretation limitation

A coordinator pre-outcome read of the verified runner's CSV ingestion confirmed annual membership is keyed by `(cohort_year, raw_symbol)`, while price histories are grouped by identity segment. This faithfully implements the frozen raw-pair cohort, but it is not a canonical-asset cohort: a replacement asset reusing an annual member's ticker can become eligible after its own 60-day warmup, even though the preceding December's volume belonged to the old asset. LUNAUSDT is the known example. Segmentation prevents a fabricated return across old/new tokens but does not prevent inheritance of a raw-symbol cohort slot.

Do not describe the primary study as the historical top50 canonical assets. Final reporting must separately count and expose any alerts/trades from a same-symbol replacement inside a cohort formed on its predecessor. A strict canonical-asset cohort would be a separately specified sensitivity or later experiment, not an undisclosed change to the frozen raw-pair rule. Acquisition need not change or stop for this interpretation limitation.

## Release gates

1. Authors correct confirmed defects without changing the discovery/exit hypotheses or inspecting outcomes.
2. Preserve corrected bytes, actual hashes and explicit pre-outcome amendment provenance.
3. Run synthetic regressions and independent fix verification on stable files.
4. Only then resume acquisition under cumulative bounds.
5. Validate finalized panel/manifests/hashes and run the frozen empirical study once; independently recompute representative results before reporting a winner or failure.
