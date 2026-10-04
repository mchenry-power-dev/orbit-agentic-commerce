# Testing and evaluation

Tests establish specific state, media, contract and safety behaviors. They do not establish arbitrary semantic understanding, creative relevance, advertising approval, security certification, conversion lift or live provider effectiveness. Mocked service responses and local photo compositions are explicitly distinct from real semantic/image calls.

## Reproduce

```sh
npm ci
npm run typecheck
npm test
npm run build
npx playwright install chromium
npm run test:e2e
npm run check
```

Recorded tooling: Node 24.18.0 and npm 11.16.0. Default sample/local-composition checks need no paid service or provider key.

## V2 assertions

| Area                   | Meaningful assertions                                                                                                                                                                                                                                               |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Curated sources        | Original PNG hashes/dimensions, bounded product facts, inspiration separate, Aster/Harbor preserved                                                                                                                                                                 |
| Interpretation         | Same-product Christmas versus cool/no-holiday summer; bounded paraphrase; honest arbitrary-semantic limitation; captured preference priority                                                                                                                        |
| Phrases and claims     | Whole required phrase in actual long copy; overlong/contradictory phrases conflict; supported known facts versus unsupported claims                                                                                                                                 |
| Placement measurements | Google 30/90 boundaries, CJK/full-width counting and minimum two descriptions; real PNG/JPEG headers, ratios/size and forged metadata rejection; Meta Not checked; missing TikTok video; actual placement composition/spacing and distinct same-size layouts        |
| Brief and budget       | Confirmed products and included factual/photo sources; blank/zero amounts; daily/lifetime intent, allocation sums, dates and dimensions                                                                                                                             |
| Dependencies           | Offer changes invalidate copy/overlaid images/handoff while preserving unrelated image approvals; family or live-image-prompt changes affect its variants; one-variant revisions retain other exact approvals                                                       |
| Recovery               | Bounded failure/timeout, ignored late result, active-run rejection, duplicate selection handling, paused checkpoints and refresh resume; targeted failed revision IDs/notes; persisted before-render scene and exact provenance; no revised/base scene substitution |
| Export                 | Exact approved versions, genuine raster ZIP entries, destination mappings, current source gates, safe filenames and formula-safe CSV; edited placement-copy versions and mappings agree                                                                             |
| Service/import         | Public address/DNS/redirect gates, MIME/size bounds, sanitization, sessions, cancellation, schemas, allowances and fail-closed operation reservations                                                                                                               |
| Continuity             | Separate V2 state retains the legacy V1 record verbatim; isolated new/existing drafts, campaign/brand cleanup, preserved unrelated drafts, and no copied merchant approvals in imported samples                                                                     |

[Studio tests](../tests/studio.test.ts) use genuine rasters encoded by sharp at recipe dimensions, not DOM canvas or invented metadata. [Composition tests](../tests/composition.test.ts), [service security](../tests/service-security.test.ts), [service runtime contracts](../tests/service-runtime.test.ts) and [client mapping tests](../tests/service-client.test.ts) exercise separate boundaries. These tests use bounded mock providers where stated; they never prove a live generative workflow.

## Current V2 evidence

Verification date: **2026-10-03**.

| Check                                                    | Recorded result                                                                                                                                                                                                            |
| -------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Type checking                                            | PASS                                                                                                                                                                                                                       |
| Studio domain/planner/placement/engine/export unit suite | **37 passed, 0 failed**                                                                                                                                                                                                    |
| Composition unit suite                                   | **24 passed, 0 failed**                                                                                                                                                                                                    |
| Service/security/runtime/client bridge suites            | **39 passed, 0 failed**; mocked providers and bounded retrieval fixtures                                                                                                                                                   |
| Preserved legacy core suite                              | **30 passed, 0 failed**                                                                                                                                                                                                    |
| Combined `npm test`                                      | **130 passed in six files, 0 failed**                                                                                                                                                                                      |
| Production build and clean-install/check rehearsal       | PASS: isolated npm ci, typecheck, then-current 128 units, production build and 40 browser cases; exit 0 after the local preview-teardown workaround below                                                                  |
| Desktop/narrow V2 browser acceptance and gallery         | PASS: 24 V2 cases (12 behaviors at 1365×900 and 390×844), plus 16 preserved legacy cases in the clean production rehearsal; real gallery visually inspected                                                                |
| Final synced clean-tree unit/build verification          | PASS: typecheck, 130 units and production build, exit 0; subsequent to the full browser rehearsal                                                                                                                          |
| Final production capture checks                          | PASS: eight focused cases, 0 failures/flaky/skipped; repeated verification, not eight additional unique acceptance behaviors                                                                                               |
| Protected local Cosmic Cat import                        | PASS: [Solar Surge](https://cosmiccatcoffeeco.com/products/solar-surge), one page and six decoded/metadata-stripped PNGs; one unsupported/non-HTTPS image reference rejected. Local-only evidence; no public service claim |
| Protected local general-page import                      | PASS: [example.org](https://example.org/), one text source, no products, no raster references and no failures. It remains page context, not a new brand preset or product-fact source                                      |
| Real semantic planning and image generation              | **Not verified; approved runtime and cost ceiling required**                                                                                                                                                               |
| Public V2 deployment/import/generation                   | **Not verified; current live remains V1**                                                                                                                                                                                  |

The 40-case clean production rehearsal and the final 130-unit/build verification were separate invocations. Final service wire updates added feedback and explicit public-source excerpt contracts after the rehearsal. Eight focused production capture cases then rechecked the final build. Repeated runs are not additional unique coverage. Browser assertions inspect real downloaded raster bytes, exact manifest versions, input retention, navigation, family differences, review controls and persisted recovery at desktop/narrow sizes. The [gallery](product-gallery.md) contains actual app captures.

On Windows, the local Vite preview teardown stalled after all 40 browser cases passed. Stopping only the verified rehearsal preview helper allowed npm check to exit 0. No browser assertion failed; this is a local runner limitation, not a skipped check. Final branch CI remains a separate verification step.

## Preserved V1 evidence

The previously published V1 passed 30 unit tests and 16 Chromium acceptance cases (eight behaviors at 1365×900 and 390×844), including an isolated clean install/check, production build and deployed sample/revision/review/ZIP/refresh journey. Its five [evaluation fixtures](../src/fixtures/evaluation.ts) are included in the preserved [legacy core suite](../tests/core.test.ts). Those counts are historical V1 evidence, not V2 acceptance.

The [legacy sample packet](../samples/approved-campaign/) contains SVG drafts and synthetic provenance. V2's [Cosmic Cat example](../public/samples/cosmic-christmas.json) comes from the actual Studio engine and Canvas compositor: 15 assets including 12 native JPEGs at 0.90 quality, with no approvals. Its [provenance](../public/samples/cosmic-christmas.PROVENANCE.json) identifies local composition and authorized public photos. A sample copied into local work requires the merchant's own exact-version decisions.

## Limits

Selected Chromium, keyboard and focus checks do not establish physical-device coverage or accessibility certification. Browser recovery is local, not a server queue guarantee. Deterministic field checks cannot prove semantic relevance or arbitrary marketing truth. Platform measurements remain separate from policy/account approval; Meta rules and video production are explicitly incomplete. See [placement specifications](channel-specs.md) and [release boundaries](roadmap.md).
