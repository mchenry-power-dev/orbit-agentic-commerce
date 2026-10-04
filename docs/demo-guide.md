# Demo guide

Orbit V2 is a **working no-key creative orchestration reference using real product photography, local composition, review workflows, and export.** Start in the [public Pages demo](https://mchenry-power-dev.github.io/orbit-agentic-commerce/), or run the same browser workflow locally. No backend or paid provider is needed for the hosted release.

| Availability       | What to expect                                                                                                                                                                                                        |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Hosted demo        | Completed Cosmic Cat sample, bundled facts/photos, owned PNG/JPEG uploads, new local compositions, placement checks, landing previews, targeted revisions, exact approvals, ZIP exports and browser-local persistence |
| Local service only | Bounded import of selected public HTTPS pages; no model key required                                                                                                                                                  |
| Deferred           | Live semantic planning, generative images/video and provider connections; no credential-entry fields in the hosted app                                                                                                |

## Run locally

Use Node.js 22.12 or newer. Recorded tooling: Node 24.18.0 and npm 11.16.0.

```sh
npm ci
npm run dev
```

Open Vite's URL with `/orbit-agentic-commerce/`. **Explore a finished campaign** opens the completed Cosmic Cat example immediately. Its assets are real photo compositions; copying it into local work does not copy merchant approvals. **Create a campaign** starts a new description and brand context.

## Main journey

1. Start with the finished example or describe a campaign. The Christmas sample uses Solar Surge's unchanged public product photo. Select actual channels/placements and confirm product facts.
2. Inspect brand sources in the brand library. Product facts/photos differ from page context and visual inspiration. Use the bundled context, or paste confirmed facts and upload owned PNG/JPEG photos. Website import is labeled **Local service required** and disabled on Pages. A saved URL alone is not an imported source. With the local service, a failed import stays visible; imported products remain unconfirmed until you associate their photos and confirm facts.
3. Inspect the interpretation and two creative directions. Confirm audience, offer, themes, copy, source choices and placements. Required phrases stay complete in ad-copy fields; resolve incompatible requirements before creation.
4. Choose **Create creative family**. Supported festive, cool and editorial modes apply graphics and copy around protected original photos. Edit palette, framing, spacing and supported placement copy. Written scene notes remain human review context; arbitrary instructions are not understood by a live model.
5. Review families and variants. Compare square/landscape/portrait targets and website heroes, inspect recipe/provenance/findings, revise one variant or edit copy. Intentional selected approval applies only to each exact current version.
6. Inspect the landing preview and approved packet. The export gate explains missing/stale/invalid/unreviewed outputs and rechecks sources. Destination exports carry real rasters, editable recipes, copy mappings, provenance and exact-version manifest references.

For a contrast campaign, keep Solar Surge selected and request cool minimal summer imagery with no holiday motifs. Current instructions override remembered festive tone. Candy Cane's original photo already contains festive lights, so selecting it with a no-holiday requirement needs an alternative approved photo.

## Budgets, continuity and recovery

Advertising budget is a planning input: currency, period, daily/lifetime intent, total and optional channel allocations. Empty amounts remain empty; zero is valid. Allocations must add up on the same basis. Optional CPA/ROAS/margin values are assumptions, not forecasts or private economics. These controls do not authorize provider costs or ad spend.

Local work uses IndexedDB for this browser and origin. Completed versions and decisions survive refresh; unfinished work can resume after bounded failure or interruption. Work stops when the browser closes. Review current gate reasons after any brief/family/source change. Developer failure fixtures are for testing and do not describe vendor reliability.

Activity accepts merchant feedback for the next interpretation; no performance metrics are imported. A failed targeted revision retains its original output selection and revision note for resume. Local revisions support spacing or centered framing; edit the plan for other supported composition changes. Deferred live-scene recovery contracts remain tested with mocks, separately from the hosted workflow.

Home, campaigns, brand library and campaign sections use application navigation. Inspect the earlier interface with `?legacy=1`; its original `app` record is preserved separately from V2's `studio-v2` record. Confirm destructive local actions and keep unfinished changes visible until saved/applied.

## Service and verification boundaries

The static Pages build makes no localhost or service requests, even if a service URL was present at build time. **Live AI · deferred in hosted demo** means no provider is connected; no local composition is presented as a live generative result.

The optional [protected local service](provider-and-runtime.md) is development-only and uses operator-authenticated sessions for bounded public import. Its CLI also imports selected public pages without a model key. Frontend service access requires `npm run dev` on localhost/127.0.0.1 with an explicit `VITE_ORBIT_SERVICE_URL`; production builds ignore that setting. Live provider adapters are preserved for future development, with generation disabled by default. A local import success or mocked provider test does not establish live model acceptance. See [release boundaries](roadmap.md) and [trust notes](source-and-asset-notes.md).

```sh
npm run typecheck
npm test
npm run build
npx playwright install chromium
npm run test:e2e
npm run check
```

`check` combines type checking, unit tests, production build and browser acceptance. Browser installation is development tooling. To exercise the built app instead of Vite development mode, set `ORBIT_E2E_BUILT=1` before `npm run test:e2e`. [Recorded evidence](testing-and-evaluation.md) distinguishes local, CI and hosted verification. [Actual screenshots](product-gallery.md) show the V2 workflow. [Channel scope](channel-specs.md) explains unknown Meta rules, configurable website/email goals, and missing actual video; export does not publish or prove complete ad compliance.
