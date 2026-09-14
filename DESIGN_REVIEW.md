# Design review: rankings and Breakouts

Date: 2026-09-14 UTC (September 13 in Los Angeles).
Direction: the user's “clean designs, valuable info,” using the existing dark panels, serif wordmark and restrained data colors. No standalone design brief existed; the conversation and existing design tokens supplied the direction.

## Completed refinements

- **Chart density:** capped visible strokes at 3px on narrow plots and 5px on larger plots. Desktop/tablet charts show the top 120 scores, mobile the top 30, plus pinned coins; the complete ranking list remains available. Existing wide touch paths remain. See `components/RankingsChart.tsx:237` and `components/RankingsView.tsx:532`.
- **Typography:** applied the already-loaded Inter font where its variable is defined, instead of inheriting the system fallback from the body. Numeric prices/dates use the existing figure style. See `pages/_app.tsx:78`.
- **Breakouts hierarchy:** compact mobile date rows, two-column controls, stronger symbols/prices/probabilities, shorter labels, nonbreaking probability deadline dates. Native details preserve training dates, formulas and historical evidence without repeating paragraphs on each card.
- **Copy:** one-line algorithm definitions; one shared target-event explanation; source timestamps and allocation details are expandable. Missing-entry/model states and current-population/calibration limitations remain available.
- **Interaction:** 44px main controls, menu choices and disclosure targets; consistent navigation between screens. Ranking menus open below their trigger instead of covering the header and hiding the first choice.
- **Dark surfaces:** explicit body background color prevents a white canvas beneath the fixed gradient during full-page capture and overscroll.

## Verification

Daily Cumulative, Hourly Hybrid and Breakouts Momentum/14-observation screens were reviewed at 375, 768 and 1280px widths. DOM checks found no horizontal page overflow. Real local hourly data was refreshed with the existing seed script (24 public snapshots); frozen research artifacts were untouched. Scores, algorithms, targets and default choices were not changed in this design pass.

Keyboard Enter opens and closes card Details with a visible focus indicator; the algorithm menu opens with Enter and closes with Escape. All five menu options have 44px target heights. Existing error, empty, missing-entry and model-support tests pass. Full suite: 163 tests, 11 snapshots, 20 suites; TypeScript passes. No new dependencies.

No remaining blocking visual issue was found in these views. This was a focused layout and interaction review, not a full assistive-technology audit. Loading was inspected in the running app; error and data-support states were covered by the existing component tests.

## Screenshots captured

All captures use the app's dark design. Main view captures are full-page; menu/details captures show the interactive viewport. Long mobile ranking captures are downscaled by the browser image renderer, so viewport inspections and DOM geometry supplemented them.

- [review-algorithm-menu-desktop-1280.png](screenshots/review-algorithm-menu-desktop-1280.png)
- [review-breakouts-desktop-1280.png](screenshots/review-breakouts-desktop-1280.png)
- [review-breakouts-details-mobile-375.png](screenshots/review-breakouts-details-mobile-375.png)
- [review-breakouts-mobile-375.png](screenshots/review-breakouts-mobile-375.png)
- [review-breakouts-tablet-768.png](screenshots/review-breakouts-tablet-768.png)
- [review-daily-desktop-1280.png](screenshots/review-daily-desktop-1280.png)
- [review-daily-mobile-375.png](screenshots/review-daily-mobile-375.png)
- [review-daily-tablet-768.png](screenshots/review-daily-tablet-768.png)
- [review-hourly-desktop-1280.png](screenshots/review-hourly-desktop-1280.png)
- [review-hourly-mobile-375.png](screenshots/review-hourly-mobile-375.png)
- [review-hourly-tablet-768.png](screenshots/review-hourly-tablet-768.png)

## Dedicated copy and clutter pass

Applied `design-review` for the first visual pass, then `unslop` and `eliminate-visual-clutter` for this follow-up. Read `minimalist-review`, but its business-strategy scope did not fit this UI task.

Replaced technical copy such as “fixed annual cohorts,” “mature training outcomes” and “slots unallocated” with yearly coin lists, completed outcomes and cash slots. Shortened the loading message. Removed the static chart shadow, repeated card divider and boxed source footer. Preserved prices, scoring rules, training dates and model limitations.

The two affected component suites pass all 18 tests. Mobile browser inspection found no horizontal overflow. Follow-up screenshot: [review-unslop-mobile-375.png](screenshots/review-unslop-mobile-375.png). Earlier screenshots document the preceding layout pass.

## Coinbase/Kraken and native exit timing — September 14, 2026 UTC

Follow-up used the same design-review, unslop and eliminate-visual-clutter guidance already recorded above. Live browser checks on `dev.local:3038` covered Coinbase → Kraken switching, ten populated Momentum/14-observation rows per venue, Daily Classic/7-day holding comparisons and Hourly Hybrid/6-hour comparisons. Daily and Kraken layouts had no horizontal page overflow at 375px; desktop was checked at 1280px. This is a focused feature review, not a full accessibility audit.

The native table keeps average net returns, known losses and missing-exit counts visible. Controls expose modeled costs and missing-price sensitivity; the UTC planner starts with no chosen hold or invented entry. A seven-day plan entered at September 14, 05:00 UTC produced September 21, 05:00 UTC in the browser. The hourly view showed its own 21 matched dates and hourly durations. Sparse windows retain their sample counts instead of displaying an unsupported average.

Breakouts identifies the selected exchange and USD units. Entry is labelled UTC day open; thirty-day exits are reference dates. Unsupported Binance probabilities and training metrics are absent. A source disclosure explains the unvalidated current universe. The local dev configuration now permits `dev.local` so hot reload works from the user's testing address.

Validation: full Jest suite passed 185 tests and 11 snapshots; after final wording corrections, the three affected suites passed 26 tests. TypeScript and the production build passed. [Live API checks](research/us-exchanges/2026-09-14/integration-check.json) verify exchange matching and null unsupported probabilities; they are not financial backtests.

- [Kraken desktop](screenshots/review-kraken-desktop-1280.png)
- [Kraken mobile](screenshots/review-kraken-mobile-375.png)
- [Native holding table mobile](screenshots/review-native-exits-mobile-375.png)
- [Native UTC planner mobile](screenshots/review-native-planner-mobile-375.png)

## Dedicated shadcn and Emil pass — September 14, 2026 UTC

This pass explicitly applied `/home/tjmehta/.agents/skills/shadcn/SKILL.md` and `/home/tjmehta/.agents/skills/emil-design-eng/SKILL.md` after the user asked which reviews had actually run. Earlier layout/copy work did not include these dedicated passes. The shadcn CLI confirmed the existing Radix/New York, Tailwind 4, Pages Router setup; no preset or dependency was replaced. Native selects remain native controls. Existing shadcn Button/Input components now handle holding actions, retry and the entry-time field.

| Before | After | Why |
| --- | --- | --- |
| Shared buttons used `transition-all` | Explicit color, background, border, shadow, opacity and transform transitions at 150 ms | Avoid animating layout changes |
| No shared press feedback | Subtle 0.97 pointer-press scale, disabled for reduced motion and keyboard focus | Immediate feedback without slowing keyboard actions |
| Select items directly in content | Existing `SelectGroup` wraps algorithm and window items | Follow shadcn/Radix composition |
| New native form controls used 14px on mobile | 16px mobile controls, compact desktop sizing | Improve touch-form readability |
| Browser date controls used a light color scheme | Root declares the app's dark color scheme | Match native picker and icon colors to the dark interface |
| Leader icon rotated on hover | Static icon | Remove decoration from a frequently used data view |
| Custom holding/retry buttons and entry input | Reuse existing Button variants and Input | Consistent focus and disabled states |

Live browser checks confirmed all four native planner controls at 16px/44px on 375px, no horizontal overflow, and the keyboard algorithm menu opened with ArrowDown. Escape focus restoration was observed during the same review. The desktop screenshot records the focused trigger and hourly exit panel: [review-emil-shadcn-menu-desktop-1280.png](screenshots/review-emil-shadcn-menu-desktop-1280.png). The shared browser connector stalled on a later screenshot, so verification continued in an isolated agent-browser session. [Mobile planner](screenshots/review-emil-planner-mobile-375.png) confirms the final native dark picker and larger control text; [open desktop menu](screenshots/review-emil-shadcn-open-menu-desktop-1280.png) confirms grouped options. The open keyboard menu reports no animation. This does not claim a full device or assistive-technology audit.

The three affected component suites passed 24 tests, and TypeScript passed. Deployment exclusions keep the 375 MB research archive, screenshots, local snapshot cache, local agent configuration and tests out of uploads, while preserving runtime evidence in `modules/data`. Tests run in the full workspace because they depend on the archived research fixtures. [Vercel exclusion semantics](https://vercel.com/docs/deployments/vercel-ignore), [shadcn Button](https://ui.shadcn.com/docs/components/radix/button), [Select](https://ui.shadcn.com/docs/components/radix/select), [Input](https://ui.shadcn.com/docs/components/radix/input).

Release verification: the source copy prepared with `.vercelignore` exclusions passed the production Next.js build, including TypeScript, page generation and optimization. An initial temporary-copy build was rejected because its dependency symlink pointed outside Turbopack's filesystem root; replacing the temporary symlink with copied dependencies resolved it. The final dark color-scheme change was included in the successful build. No deployment was performed. A Vercel preview must still exercise both public exchange feeds from the hosting environment before production promotion.


## Coin Outlook refinement — 2026-09-14 06:14 UTC

Continued the already-applied shadcn, Emil design engineering and interaction-flow work. Reused installed Button and Sheet; consulted the [official Sheet composition and side API](https://ui.shadcn.com/docs/components/radix/sheet). No new component library or dependency was added.

| Before | After | Why |
| --- | --- | --- |
| A prominent calendar planner preceded the chart | Watch strip and explicit Coin Outlook; planner collapsed below rankings | Answers the coin-specific question before asking for a holding date |
| Stars only highlighted chart lines | Stars also pin a compact watch strip; opening is a separate action | Keeps watch behavior predictable without forcing a modal |
| Coin names only opened CMC | Preserved external links and added explicit Outlook actions | Separates local interpretation from external research |
| Broad future-date framing | Literal direction, selected-window sampled levels, dated evidence behind Why | Exposes useful measured information without inventing a validated exit |
| New context could momentarily retain prior scores | Prior results hidden until the exact input/algorithm/window completes | Prevents stale data being read as new guidance |
| Default Sheet close target and long motion | 44px close target, 200ms opening/150ms closing, existing reduced-motion rules | Improves touch and respects the established motion system |

Visual inspection: `screenshots/review-outlook-desktop.png` (1280px) and `screenshots/review-outlook-mobile-375.png` (375×812). No horizontal document overflow. Mobile Sheet closes with Escape and restores focus to the watched-coin button in a normal open/close cycle. Starring preserved query `hl` and did not open the Sheet. Real Why request loaded matching outcomes; source/time, historical coverage, missing counts and unsupported-provider guards are explicit. This is a targeted design and interaction check, not a claimed comprehensive accessibility audit.

Verification: full suite 203 tests / 11 snapshots, TypeScript and isolated production build passed. Full state evidence remained outside production client chunks. No deployment was performed.

Final live check: `http://dev.local:3038` returned HTTP 200. The 375px mobile Why panel loaded five holding rows with no dialog or document horizontal overflow. The dedicated review browser session was closed afterward.


## Follow-up cleanup — 2026-09-14 UTC

| Before | After | Why |
| --- | --- | --- |
| Calendar planner retained in a lower disclosure | Entire planner and wrapper removed from RankingsView | The user rejected the flow, not just its placement |
| Repeated evidence caveats and method paragraphs | Past outcomes table with short scope, costs, missing counts and sample dates | Preserve interpretation without making the UI a research document |
| Generic “watch the high or low” sentence | Actual observed price references in the sentence | Makes the watch information concrete |

11 affected UI tests and TypeScript passed. Live DOM confirmed planner/calculator/Backtest details absent. Detailed protocols remain in research notes; calculations and evidence boundaries are unchanged.
