# Radar: new rank crossings and continued gains

Completed September 14, 2026 UTC. **The saved data supports describing a fresh rank crossing. It does not establish a dependable buy signal, a calibrated milestone probability, or an automatic exit recommendation. Rank velocity did not improve the selected basket over price momentum in the primary comparisons.**

The protocol was recorded before this replay, but the July–September source had already been studied. This is retrospective evidence, not a pristine holdout. The exact detector, costs, missing-data treatment, full parameter grid and split rules are in [protocol.md](protocol.md).

## What was tested

A coin has just crossed top 300, 200, 100 or 50 in the most recent saved step, remains above half that rank number, has improved its rank over the entire viewed window, and has risen in price over that window. Complete, fresh observations are required. The ordering is fractional log-rank improvement per saved interval, with no fitted speed threshold. This definition is intentionally stricter than “crossed at some point in the window.”

Use 71 saved daily observations from July 4 through September 12 and six separate hourly blocks totaling 99 observations. The primary viewed interval is seven daily observations, equivalent to six endpoint intervals. Entry is the next saved quote after the signal; exit is 1/7/14/30 saved days after entry, or 1/3/6/12 saved hours inside one hourly block. Daily 3/14/30 and hourly 3/6/12 views are included as sensitivities. All 112 cells are saved, including empty or negative cells.

Four controls use identical formation dates: confirmed crossings ordered by rank velocity; the same crossings ordered by price momentum; crossings without endpoint-confirmation gates; and price momentum among coins in the same rank band. Ten fixed capital slots leave cash when there are fewer signals. These are averages of overlapping baskets, **not compounded portfolio returns**. Fees are 0.5% or 1% per side; missing entries remain cash and missing exits are total losses in the primary calculation.

## Primary seven-observation daily view

Values below are mean net returns on the entire ten-slot basket, at 0.5% each-side costs with missing exits marked as total losses. They are not the average gain of a fully invested position. For example, top-300/7-day baskets fill only 2.14 of ten slots on average; top-200 baskets fill 1.04. The same-band momentum basket usually fills ten slots, so its comparison changes market exposure as well as selection.

| Fresh crossing | Hold after entry | Formation dates | Radar mean | Same-band price momentum | Radar after removing best date |
|---|---:|---:|---:|---:|---:|
| Top 300 | 1 day | 63 | +0.029% | −0.701% | See full artifact |
| Top 300 | 7 days | 57 | +0.105% | −0.491% | −0.163% |
| Top 300 | 14 days | 50 | +0.698% | +2.551% | +0.056% |
| Top 300 | 30 days | 34 | +0.831% | +8.612% | See full artifact |
| Top 200 | 1 day | 63 | −0.103% | −1.327% | See full artifact |
| Top 200 | 7 days | 57 | +0.233% | −1.081% | −0.035% |
| Top 200 | 14 days | 50 | +0.071% | −1.437% | +0.0004% |
| Top 200 | 30 days | 34 | +0.250% | −4.245% | See full artifact |

The apparent seven-day positives are fragile. At 1% each-side costs, the top-300 basket becomes −0.108%. Removing its single best date also makes the result negative. The nonoverlapping seven-day subset has only eight dates and means −0.151% for top 300 and −0.877% for top 200. Longer holds leave only four nonoverlapping dates at 14 days and two at 30 days.

Different holds have different mature formation dates. Strategies are matched within each hold, but these rows do not identify the best holding period by comparing their means against each other.

The later chronological half does not establish superiority: at the seven-day hold, rank-confirmed crossing minus crossing-only is −0.684 percentage points for top 300 and −0.027 points for top 200. At 14 days it is −0.567 and −0.275 points. Early observations whose exit overlaps the later period were purged. This remains a stability check on previously examined data.

### Rank movement is not an easy gain forecast

Some large crossings already passed the proposed next milestone at signal time. The separately verified [milestone-audit.json](milestone-audit.json) excludes those from **new** continuation counts. Raw `rankTouch` in the original ledger includes them; it must not be labeled a new milestone probability.

| Seven-day hold after entry | All selected events | Still needed next milestone at signal | Newly touched milestone | Still there at exit | Observed +20% price touch | Observed 5x price touch |
|---|---:|---:|---:|---:|---:|---:|
| Top 300 → top 200 | 122 / 87 unique coins | 115 | 16 yes, 97 no, 2 unknown | 9 yes, 104 no, 2 unknown | 23 yes, 97 no, 2 unknown | 0 yes, 120 no, 2 unknown |
| Top 200 → top 150 | 59 / 40 unique coins | 56 | 2 yes, 54 no | 1 yes, 55 no | 15 yes, 44 no | 0 yes, 59 no |

Price-touch columns use all selected events and actual next-snapshot entry prices; new-rank columns use only pending milestones. These are different denominators. Price touches mean saved observations, not intraday highs or executable fills. The +20% threshold is gross and does not deduct fees. Missing future observations prevent asserting a known no-touch. No observed 5x does not establish zero future probability.

Reversals were common: 69/122 top-300 events and 36/59 top-200 events fell outside their original boundary again during the observed seven-day path. Average observed worst gross price drawdown from entry was approximately 9.8% and 8.1%, respectively. This is snapshot downside, not a measured intraday stop distance.

### Velocity did not add selection value

The ten-slot rank-velocity and price-momentum controls select identical sets on every primary date. The experiment cannot attribute value to velocity ordering when ordering does not change holdings.

After seeing that result, we froze a separate [exploratory three-slot protocol](top-three-protocol.md). Across all four primary boundary/hold cells, the top-three sets were **also identical on every date**: zero effective dates distinguished the two orderings. Three-slot net returns for top-300 seven days were +0.059% at 0.5% costs, −0.558% at 1% costs, and −0.838% after removing the best date. Top-200 seven days were +0.649%, falling to −0.246% after removing the best date. These do not justify a trading recommendation based on a three-item UI preview. [Full exploratory results](top-three.json).

## Due diligence and limits

- Every one of 85,000 row appearances across the saved blocks passed the specified quote-age/rank/price checks; the capture is already curated, so this does not establish live-feed reliability. The daily and hourly collections can contain the same underlying observation.
- The daily top-500 catalog records 492 arrivals and 492 departures across consecutive snapshots. These are membership-change events, not 492 unique assets. Selecting by numeric ID at signal time avoids relying on today's survivor list, but the top-500 cutoff still censors paths and excludes earlier activity below the cutoff.
- Nine top-300 primary selected positions had a circulating-supply change exceeding 5% across the viewed interval. Provider rank reflects capitalization and ranking eligibility as well as price. Supply flags describe confounding; they are not proof a supply change caused a crossing.
- The source has empty tags. This replay preserves its population; it does not pretend to comprehensively remove stablecoins, wrappers or synthetic assets. Nor does it establish historical Coinbase/Kraken tradability, spreads, order-book depth, borrow, capacity or guaranteed fills.
- 37 of the 48 hourly cells have negative ten-slot means at the primary 0.5% fees. Several of the remaining cells contain no selections or very few assets. No hourly variant earns a recommendation by being the largest positive cell.
- Repeated coins, overlapping holding periods, market-wide shocks and previously examined data invalidate reading event frequencies as calibrated odds for a current coin. A longer historical reconstruction, if available, is a separate robustness check and cannot erase vintage or execution limitations.

## Product implication

A concise factual explanation is supported: **“Just entered the top 200; rank and price improved over your selected interval.”** Follow with the actual observed movement and price change. An exact next-rank target is a milestone to monitor, not resistance or a promise. The current evidence does not support “likely to reach top 150,” “5x potential,” a sell date, a calibrated percentage or a buy recommendation based on this detector. The score/default should remain unchanged until a genuinely predictive variant survives further evaluation.

## Reproduction and verification

- [run.py](run.py): original replay; refuses to overwrite original artifacts.
- [summary.json](summary.json): all 112 cells, all four methods and phase summaries.
- [ledger.json.gz](ledger.json.gz): every one of 19,088 baskets and 58,301 selected positions, including prices, costs, path labels and missingness.
- [verify.py](verify.py): independent implementation reconstructing selections and outcomes directly from the frozen input, using Decimal fee arithmetic and source path checks. It does not import the runner.
- [verification.json](verification.json): 19,088 basket selections, 58,301 positions, 616,069 numeric comparisons and 1,792 phase summaries passed, including paired control differences and observed downside.
- [milestone-audit.json](milestone-audit.json): pending-versus-already-reached milestone audit; generated after the initial replay caught an interpretation risk.
- [top-three.py](top-three.py): exploratory shortlist comparison with independent Decimal checks of every three-slot return.

The verification checks implementation consistency. It is not evidence that the strategy predicts future returns. SHA-256 source, protocol and script hashes are recorded in the artifacts; no frozen input or production scoring code was changed.
