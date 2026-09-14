# Financial foundation for coin guidance

September 14, 2026 UTC. Primary-source research and a read-only local data inventory; this document does not validate a new trading recommendation. No production history requests, paid data, account access, or trades were made.

The useful hypothesis is **whether improving relative position identifies future price winners beyond ordinary price momentum**. A rank crossing is a candidate signal, not resistance, a valuation target, or evidence that a coin will multiply. The product should eventually translate tested net upside, downside, and time-to-outcome into a short assessment. A calendar calculator does not answer that question.

## What financial research supports

- Liu and Tsyvinski find time-series momentum and attention-related predictability in their historical sample of Bitcoin, Ripple, and Ethereum. That motivates testing momentum; it does not validate TopCryptos's intervals, current small coins, or a particular sell rule. [NBER paper](https://www.nber.org/papers/w24877).
- Liu, Tsyvinski, and Wu identify cryptocurrency market, size, and momentum factors in cross-sectional returns. Therefore compare a proposed rank signal with price momentum, market exposure, and size before attributing any gain to rank velocity. Factor or long-short portfolio evidence is not an individual coin's probability of success. [Published paper](https://onlinelibrary.wiley.com/doi/10.1111/jofi.13119).
- Begušić and Kostanjčar report that momentum differs with liquidity in their sample. Liquidity is a conditioning variable and execution constraint; a blanket volume multiplier is not established as universally beneficial. [Authors' paper](https://arxiv.org/abs/1904.00890).
- Borri, Liu, Tsyvinski, and Wu's updated empirical review includes inactive coins and emphasizes large jumps and data-quality problems. Its broader dataset illustrates why surviving coins alone and Gaussian return extrapolation are inadequate for rare multi-bagger claims. [March 2026 version](https://arxiv.org/html/2510.14435v4).
- Forecast probabilities require proper scoring and calibration, not just correct direction. Use Brier/log loss for defined binary outcomes and quantile coverage for returns. [Gneiting and Raftery](https://sites.stat.washington.edu/people/raftery/Research/PDF/Gneiting2007jasa.pdf). Aggressive strategy search also requires recording all tried variants and accounting for selection; a best historical cell is not automatically predictive. [Bailey and coauthors](https://www.davidhbailey.com/dhbpapers/backtest-prob.pdf).

These are methodological foundations, not transferred performance claims. Fundamental diligence—announced unlocks, governance, contract vulnerabilities, insider concentration, protocol adoption—is not supplied by the current price/rank inputs.

## Rank, price, and the proposed 5× interpretation

Circulating market capitalization equals circulating supply times price. Rank depends on competing assets and CMC eligibility as well as that capitalization. A coin can improve rank because peers fall, circulating supply changes, or the ranked universe changes. [CMC capitalization methodology](https://support.coinmarketcap.com/hc/en-us/articles/360043836811-Market-Capitalization-Cryptoasset-Aggregate), [listing and ranking criteria](https://support.coinmarketcap.com/hc/en-us/articles/360043659351-Listings-Criteria).

For a coin currently outside target rank K, the current Kth-ranked capitalization divided by its current circulating supply gives a **fixed-peer, fixed-supply threshold price**. Exceeding the capitalization threshold is arithmetic under those assumptions; it is not a predicted price, a trading resistance level, or a guaranteed rank because eligibility and ties also matter. In general:

`future price / current price = (future capitalization / current capitalization) / (future circulating supply / current circulating supply)`.

For example, doubling capitalization while doubling circulating supply leaves price unchanged. A future top-150 cutoff also moves with the market.

Our frozen July 4–September 12 CMC snapshots make the scale concrete:

| Same-date capitalization ratio | Paired snapshots | Median | Range |
| --- | ---: | ---: | ---: |
| Rank 150 / rank 300 | 70 | 2.184× | 1.908–2.349× |
| Rank 150 / rank 200 | 71 | 1.823× | 1.690–1.944× |

These compare different assets on each date, with no return calculation. They are not realized rank-crossing outcomes or forecasts. One day lacks a rank-300 row, so it is omitted, not interpolated. They show why “300 to 150 means 5×” is not supported even as frozen-market arithmetic. Counts, source hash, and values are in [the inventory](FINANCIAL_FOUNDATION_inventory.json).

The prior [rank diagnostic](../../rank-levels/2026-09-14/README.md) also found 27% of improving seven-observation rank windows had flat/falling prices. Its reaching-versus-holding distinction must survive into any model. The [native holding study](../../native-exits/2026-09-14/README.md) contains basket comparisons, not individual probabilities. The [algorithm recommendations](../../ALGORITHM_RECOMMENDATIONS.md) explicitly separate the longer Binance research from native CMC evidence and current Coinbase/Kraken markets.

## What our actual data can support next

The frozen modern replay contains 71 consecutive daily snapshots and six short hourly blocks. Raw rows retain numeric CMC IDs, provider rank, price, market capitalization, circulating/total/maximum supply, 24-hour volume and timestamps. Modern rows also have fields including FDV and exchange/decentralized volume breakdowns. We can calculate **observed supply changes** and check whether rank improvement came with price appreciation. Those changes are not proof of an unlock, an announced future dilution event, or a data correction's cause.

The bounded cache inventory found 587 numeric-CMC snapshot files: 44 dated 2020, 370 dated 2021, and 173 dated 2026. Selecting one actual snapshot per effective UTC day yields an earlier **110-day block, November 18, 2020–March 7, 2021**, and an isolated December 30, 2021 observation. The 110-day block has 500 rows per selected snapshot, positive prices and ranks, numeric IDs, no duplicate IDs, and a maximum within-snapshot quote age of 66 seconds. The common older schema includes supply, capitalization, volume, price and rank; it lacks modern FDV/volume-breakdown fields.

That block can support earlier-era diagnostics: seven-observation features, next-snapshot entry, and a 30-saved-day hold allow at most 73 mature signal dates before individual-coin completeness checks; 60/90-day holds allow 43/13. These overlap and do not represent independent market regimes. There is no one-year outcome coverage. Do not bridge the multi-year gaps or silently treat saved steps as exact exchange fill times.

**Historical-vintage limitation:** 104 of those 110 selected snapshots have a response/status timestamp more than a day after their effective quote time. For example, November 18, 2020 quotes were returned in a February 18, 2021 response. These appear to be historical API reconstructions, not proven contemporaneous archived vintages. They preserve a historical observed roster and are useful for replication, but do not establish which corrected values were knowable at the original signal. Testing new rules on this earlier block is an earlier-era diagnostic, not a future chronological holdout.

The inventory groups files by the UTC day of their latest valid quote timestamp, picks the latest such snapshot per day, and records the original response timestamp separately. It uses no forward fills. [Selected filenames, hashes, time and schema checks](FINANCIAL_FOUNDATION_inventory.json).

## Evaluation protocol to freeze before expanding the search

1. **Keep the economic outcomes separate.** For each formation: enter at the defined next observable/executable price; record net return at each supported horizon, downside on the path, rank reached at any observed point, rank at the endpoint, and return when rank is reached. A sampled quote reach is not an intraday high or executable sale. Treat 5× as a separately defined rare price-return event; never infer it from rank.
2. **Test whether rank adds anything.** Compare the same eligible assets and formation dates using current rank/capitalization distance alone, price momentum alone, the existing native methods, and price momentum plus rank velocity. Add volatility, market return, liquidity and observed supply change in a small, declared sequence. Compare round thresholds with neighboring ranks while controlling for capitalization distance; rank 299→200 spans a different economic gap from 199→100.
3. **Separate viewed history from future holding.** The selected interval determines features. Test a predeclared, supportable horizon grid rather than imposing hold = view or selecting the best return after the fact. Use matched signal dates when comparing horizons. A within-H reach probability should be coherent across nested horizons for the same forecast population.
4. **Use causal fitting and honest uncertainty.** At each fitting cutoff admit only outcomes whose complete horizon has matured. Keep overlapping label periods out of training/evaluation boundaries, and evaluate in chronological blocks. Compare forecasts with mature historical base rates conditioned on starting rank/distance and with a simple momentum model. Report calibration, Brier/log loss, discrimination, net performance and uncertainty across dates/coins. Pool/shrink sparse groups rather than assigning each interval a complex independent model. Already-inspected data is development evidence; reserve genuinely later observations for prospective confirmation.
5. **Model the investable portfolio.** Use fixed capital, positions, cash, turnover and explicit execution timing; do not compound overlapping cohort means. Include venue/account fee assumptions, spread/slippage sensitivity, volume participation and unknown/delisted exits. Compare with cash, a broad market reference and matched-exposure momentum. Report mean and median outcomes, losses, drawdown, and tail sensitivity. Aggregate CMC volume is not executable USD order-book depth.
6. **Preserve failures and dependence.** Keep missing paths as unknown labels, alongside adverse exit-mark sensitivity for financial outcomes. Top-500 disappearance is not automatically a verified delisting, rank 501, or zero price. Record unique coins, signal dates and event episodes; repeated alerts about the same crossing are not independent successes. Retain every tried rule and failed gate. Independently verify ledger membership, timestamps and fee arithmetic before promotion.

There is no universal sample-count cutoff that converts these results into reliable advice. Promotion requires a stable improvement over the relevant baseline, tolerable uncertainty and evidence from distinct periods, with no one coin or missing-price convention driving the conclusion.

## Feasible acquisition using our identities and the user's exchanges

- **First use the saved CMC cache**, retaining provider IDs, raw timestamps and historical rosters. The public production rankings routes can serve history, but daily cache misses can fall through to `cmc.listings` and the upstream CMC Historical API. `scripts/seedLocalCache.mjs` is therefore not a guaranteed cache-only bulk downloader. The route also applies a default $10 million capitalization filter. Use an explicit cache-only export/inventory for deeper production archives before any broad historical crawl.
- **Join CMC assets to exchange instruments with dated evidence.** The existing exchange filter uses current CoinGecko membership and slug/name/unique-symbol resolution; it is not a historical, contract-verified CMC-to-USD-market join. Preserve CMC ID, chain/contract or documented native-asset identity, venue product/pair ID, quote currency, symbol migrations and date ranges. Do not merge assets by ticker alone or carry a current listing backward through time.
- **Acquire bounded Coinbase windows after mapping.** Its public Exchange candle endpoint supports explicit start/end ranges with a 300-candle limit per request. Page fixed windows, deduplicate by instrument/time, and retain missing/no-trade intervals. [Coinbase candle documentation](https://docs.cdp.coinbase.com/api-reference/exchange-api/rest-api/products/get-product-candles).
- **Use Kraken's archive for older periods.** The REST OHLC endpoint returns at most 720 recent bars and includes the unfinished current bar; changing `since` does not provide unlimited backfill. Kraken supplies historical OHLCVT files with quarterly updates. Verify each downloaded instrument/date range and archive manifest; archive coverage alone is not proof of historical US/account eligibility. [REST limits](https://docs.kraken.com/api-reference/market-data/get-ohlc-data), [official historical files](https://support.kraken.com/articles/360047124832-downloadable-historical-ohlcvt-open-high-low-close-volume-trades-data).
- **Archive future membership and execution inputs.** Current Coinbase/Kraken rosters select at most 50 active USD markets by current turnover. This is useful live data, but replaying those survivors backward misses historical candidates and failed assets. Freeze dated rosters, mappings, complete bars, public spread/depth observations and unavailable states from now onward. Historical US eligibility and past depth remain separately missing unless sourced.

## Claim and UI boundaries

Show a short coin-specific conclusion with one reason, a relevant future horizon, price upside/downside and a meaningful rank milestone only when the evidence supports them. Keep the detailed ledger and calibration behind “Why?”. Starring should change which coin is followed, not improve its score or imply a position was opened.

Hand-set categories such as “building,” “extended,” “fading,” and “early mover” are **descriptive labels until their implications are tested**. A price far above a moving average is measurable; “therefore wait for a pullback” is a trading rule requiring evaluation. Likewise, rank acceleration is measurable; “easy top 150” is an unsupported forecast. Prefer literal measured reasons over confident-sounding judgments while evidence is limited.

Price highs/lows or ATR bands may be shown as dated reference levels once correct OHLC inputs are joined. Calling them recommended stops/targets requires executable-policy testing; ATR measures past range, not the probability of a reversal. A target reach can happen after a stop or after a recommended exit. Forecast that ordering explicitly if the UI intends to imply profit realization.

Do not show an individual “X% chance” by merely converting a pooled overlapping historical fraction to a percentage. Show observed outcomes and support instead, and promote calibrated probabilities only after their model, universe, horizon and baseline checks are established. The existing evidence justifies a sharper research direction and transparent measurements; it does not yet justify a confident buy/sell call or 5× prospect for a current coin.
