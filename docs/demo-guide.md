# Demo guide

This guide describes the **V2 candidate**. The [current public Pages demo](https://mchenry-power-dev.github.io/orbit-agentic-commerce/) remains the earlier V1 until a new release is verified. Local sample/composition does not need a paid provider; importing and live generation are separate service capabilities.

## Run locally

Use Node.js 22.12 or newer. Recorded tooling: Node 24.18.0 and npm 11.16.0.

```sh
npm ci
npm run dev
```

Open Vite's URL with `/orbit-agentic-commerce/`. **Explore a finished campaign** opens the completed Cosmic Cat example immediately. Its assets are real photo compositions; copying it into local work does not copy merchant approvals. **Create a campaign** starts a new description and brand context.

## Main journey

1. Start with the finished example or describe a campaign. The Christmas sample uses Solar Surge's unchanged public product photo. Select actual channels/placements and confirm product facts.
2. Inspect brand sources in the brand library. Product facts/photos differ from page context and visual inspiration. For your brand, paste confirmed facts and upload owned photos, or import through an authorized configured service. A failed import stays visible. Imported products remain unconfirmed with blank photo assignments until you associate an owned product photo; retrieved images start as visual references. An editable default palette fills in when source colors are absent.
3. Inspect the interpretation and two creative directions. Confirm audience, offer, themes, copy, source choices and placements. Required phrases stay complete in ad-copy fields; resolve incompatible requirements before creation.
4. Choose **Create creative family**. Local mode applies bounded themes to graphics, framing and copy around protected original photos. It does not promise arbitrary semantic interpretation or newly photographed scenes.
5. Review families and variants. Compare square/landscape/portrait targets and website heroes, inspect recipe/provenance/findings, revise one variant or edit copy. Intentional selected approval applies only to each exact current version.
6. Inspect the landing preview and approved packet. The export gate explains missing/stale/invalid/unreviewed outputs and rechecks sources. Destination exports carry real rasters, editable recipes, copy mappings, provenance and exact-version manifest references.

For a contrast campaign, keep Solar Surge selected and request cool minimal summer imagery with no holiday motifs. Current instructions override remembered festive tone. Candy Cane's original photo already contains festive lights, so selecting it with a no-holiday requirement needs an alternative approved photo.

## Budgets, continuity and recovery

Advertising budget is a planning input: currency, period, daily/lifetime intent, total and optional channel allocations. Empty amounts remain empty; zero is valid. Allocations must add up on the same basis. Optional CPA/ROAS/margin values are assumptions, not forecasts or private economics. These controls do not authorize provider costs or ad spend.

Local work uses IndexedDB for this browser and origin. Completed versions and decisions survive refresh; unfinished work can resume after bounded failure or interruption. Work stops when the browser closes. Review current gate reasons after any brief/family/source change. Developer failure fixtures are for testing and do not describe vendor reliability.

Activity accepts merchant feedback for the next interpretation; no performance metrics are imported. A failed targeted revision retains its original output selection and revision note for resume. In configured live mode, a saved scene can survive local rendering failure, with revised and base scenes kept separate. Those recovery contracts are tested with mocks; they do not establish real provider acceptance.

Home, campaigns, brand library and campaign sections use application navigation. Inspect the earlier interface with `?legacy=1`; its original `app` record is preserved separately from V2's `studio-v2` record. Confirm destructive local actions and keep unfinished changes visible until saved/applied.

## Service and verification boundaries

The [protected local service](../server/index.ts) uses server-owned credentials, authenticated sessions, bounded public import and explicit cost reservations. Default generation is disabled. An approved public runtime is not included. Do not put provider keys in browser settings, `VITE_*`, Git, public artifacts or CI logs.

Live mode must report unavailable or rejected services without returning a local substitute. A local import success does not establish public hosting; mocked semantic/image tests do not establish paid-call success or creative relevance. See [release boundaries](roadmap.md) and [trust notes](source-and-asset-notes.md).

```sh
npm run typecheck
npm test
npm run build
npx playwright install chromium
npm run test:e2e
npm run check
```

`check` combines type checking, unit tests, production build and browser acceptance. Browser installation is development tooling. To exercise the built app instead of Vite development mode, set `ORBIT_E2E_BUILT=1` before `npm run test:e2e`. [Recorded evidence](testing-and-evaluation.md) separates the clean 40-case browser rehearsal from the final 130-unit/build verification and documents the local preview-teardown limitation. [Actual screenshots](product-gallery.md) show the candidate workflow. [Channel scope](channel-specs.md) explains unknown Meta rules, configurable website/email goals, and missing actual video; export does not publish or prove complete ad compliance.
