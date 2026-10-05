# Demo guide

Orbit Studio is a working no-key creative orchestration reference using real product photography, local composition, review workflows, and export. Open the [public demo](https://mchenry-power-dev.github.io/orbit-agentic-commerce/). No backend, paid provider or advertising account is needed.

## Three useful journeys

1. **Home → Explore a finished campaign → Creative family → Review asset.** Compare Candy Cane's photographic story with Solar Surge's editorial direction. Open the website desktop/mobile outputs at full size. These are prepared sample compositions; copying the campaign carries no approvals.
2. **Home → Create a campaign → search "Solar" → select product/variant → fill the brief → Review creative plan.** Facts and photography populate from the selected snapshot. Enter a cool summer campaign, inspect the interpreted directions and create the selected placements. Recompose one variant with an explicit direction, framing or copy change.
3. **Creative family → approve exact versions → Preview channel publishing.** Choose a destination, sample target and family, map approved artifacts, review warnings, then create a local demo handoff where ready. Download the package. TikTok in-feed demonstrates the blocked **Video required** path and an explicitly incomplete download.

## Catalog and context

The default **Cosmic Cat Coffee Co. · Demo catalog** is a curated public snapshot, not a continuously synced store. Search products, choose a variant and inspect its image/context. Only variants with matching approved imagery can compose without another confirmed upload. Product-versus-logo classification prevents a logo becoming product photography.

Browsing a different store does not silently replace an active draft. Selecting its products explicitly changes draft context. Catalog refresh preserves campaigns' selected factual snapshots until the user chooses an update; material updates invalidate affected approvals. Campaign messaging remains separate from source facts.

An explicit public Cosmic Cat catalog request reads four known handles from its public Shopify endpoint where the browser permits it. It is not authenticated Storefront/admin access and does not work on every storefront. A failed request stays visible and preserves the previous catalog. Use the bundled catalog or supported catalog JSON file as the working fallback. [Catalog contract and limits](catalog.md).

Manual confirmed product entry and owned PNG/JPEG uploads remain available. Arbitrary website-page import is labeled **Local service required** on Pages; saving a URL is not an import. The optional protected local service is documented separately.

## Composition and review

Keep the brief simple: campaign instructions, selected products, goal and placements. Optional audience, offer, dates, references and budget remain available. The bounded planner recognizes festive, cool and editorial cues; inspect its interpretation before creating assets. No live model understands arbitrary free text.

Photographic-story and editorial layouts retain the original photo frame, adapt hierarchy to each aspect ratio and keep overlay copy clear of package labels. Google imagery defaults to text-free artwork. Website/email heroes may include text. Explicit controls change the actual rendered variant; the review image and downloaded file share the same raster. Fonts load before export, and thumbnails are resampled from that exact canvas.

For a holiday/summer comparison, keep Solar Surge selected and change the supported direction and copy. Candy Cane's original photo already contains holiday lights; a no-holiday instruction needs an approved alternative reference. Local composition cannot remove those scene details or manufacture a different photograph.

Approve each exact current version intentionally. A targeted revision appends a version and clears its approval; unrelated assets remain intact. Review findings distinguish measurable local checks, human approval, unknown platform rules and missing finished video.

## Download and simulated handoff

**Download assets** exports current approved versions, real PNG/JPEGs, recipes, mapped copy, content, provenance and exact-version manifests. Stale, rejected, missing and invalid outputs remain gated.

**Preview channel publishing** is a focused local workflow, with visibly marked demo accounts and targets:

- **Google Ads:** Performance Max campaign/asset-group mapping, final URL, supported text/image requirements and separately reviewed brand assets.
- **Meta Ads:** Campaign/ad-set context, creative variants and ad drafts. Mapping is conceptual; exact API and policy acceptance are **Not checked**.
- **TikTok Ads:** Campaign/ad-group context and creative inputs. Actual video is missing, so completion stays blocked; a brief is labeled as a brief.
- **Website:** Responsive hero assets, copy/content and placement guidance. No theme or live page changes.

Completion says what happened locally and explicitly says nothing was sent. Repeated clicks reuse the same handoff record. Changed versions require a new review and an explicit revised handoff; older records remain unchanged. Incomplete downloads list their blockers rather than claiming launch readiness. [Verified mapping scope](channel-handoff.md).

## Persistence and budgets

Orbit-specific IndexedDB retains draft text, selected catalog snapshots, campaigns, outputs, decisions and handoff records. Refresh and navigation preserve work. Browser-local execution stops when the browser closes; completed steps are recovery checkpoints. Storage failure has a visible fallback. Reset/delete operations require confirmation and affect only Orbit data.

Budget values are planning assumptions: currency, period, daily/lifetime intent, total and allocations. Blank and zero remain distinct. They do not activate spend or produce ROAS forecasts. Earlier V1 records remain separate and accessible through `?legacy=1`.

## Run and verify locally

Use Node.js 22.12 or newer; recorded tooling is Node 24.18.0 / npm 11.16.0.

```sh
npm ci
npm run dev
npm run typecheck
npm test
npm run build
npx playwright install chromium firefox webkit
npm run test:e2e
```

Use Vite's `/orbit-agentic-commerce/` base path. Set `ORBIT_E2E_BUILT=1` for production-preview browser checks, or `ORBIT_E2E_BASE_URL` for an external hosted URL with no local web server. [Recorded results](testing-and-evaluation.md) state which engines, viewports and checks actually ran.

The static build makes no localhost or provider-service calls, even if a service URL was present at build time. Live semantic/image/video integrations remain deferred and expose no credential fields. Public catalog requests are explicit read-only retrievals, separate from the [development-only page importer](provider-and-runtime.md).
