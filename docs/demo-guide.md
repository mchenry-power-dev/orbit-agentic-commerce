# Demo guide

## Run locally

Prerequisite: Node.js 22.12 or newer. The recorded Windows verification environment uses Node 24.18.0 and npm 11.16.0.

```sh
npm ci
npm run dev
```

Open the Vite URL with `/orbit-agentic-commerce/`. Dependencies and browser-test tooling need network access when first installed. Once loaded, the sample pipeline uses bundled fixtures and performs no external API calls. No keys, login, payment, or production account access is needed.

## Inspect the main journey

1. Choose **Try sample campaign**. It explicitly fills a fictional specialty-coffee brief; review the goal, products, audience, and direction.
2. Inspect selected context and inclusion reasons. Advanced controls expose offer, tone, keywords, required/prohibited phrases, quantities, and reference exclusions where supported.
3. Choose **Create portfolio**. Observe run states and concise activity events. The portfolio contains six original SVG drafts, copy, landing sections, a video brief, and a blueprint/checklist.
4. Choose **Review asset**. Inspect its purpose, source IDs, validation, and version. Request a revision of one item and confirm unrelated assets remain present.
5. Edit supported copy or request another revision. Previous approval for the changed asset becomes invalid; approve the current version again.
6. Approve the valid current required assets. **Export approved portfolio** downloads a real ZIP plus manifest. If the button is disabled, read the gate reasons and resolve them.
7. Inspect the landing-page preview using the same campaign messages/artwork. Copy supported content and download the campaign/landing brief, which includes actual current landing sections and marks stale content if the core brief/context changed.

Use **New campaign** to test a different structured brief. The household-consumables preset shows category reuse. Product packaging/facts stay tied to fictional records; arbitrary text is not proof of supported instruction interpretation.

## Recovery and state

Refresh during a run to inspect persisted progress; resume remaining work or restart explicitly. Use the documented failure fixture/control where available to observe bounded failure and recovery. A failed unrelated step should preserve approved outputs. Duplicate starts and conflicting active tabs are guarded; use a single active editing tab for the demo journey.

Briefs, versions, approvals, revision notes, preferences, and events live in IndexedDB in the current browser/origin. Work does not continue with the browser closed and does not sync between devices. Reset sample data requires confirmation. Clearing browser storage also removes local state.

## Build and validation commands

```sh
npm run typecheck
npm test
npm run build
npx playwright install chromium
npm run test:e2e
npm run check
```

`check` runs type checking, unit tests, build, and browser acceptance. Playwright's browser installation is a development step, not a runtime dependency. Preview the production build with `npm run preview` at the printed URL. See [recorded test evidence](testing-and-evaluation.md) for actual results and [gallery](product-gallery.md) for authentic captures.

## Understanding the download

The ZIP holds approved current draft assets and an export manifest with provenance/version references. The [generated sample packet](../samples/approved-campaign/) demonstrates the same path without private runtime data: six `image-*-v1.svg` compositions, `copy-v1.json`, `copy-review.csv`, `landing-v1.json`, `video-v1.json`, `blueprint-v1.json`, `manifest.json`, and `campaign-brief.md`. The checked-in directory adds `PROVENANCE.md`; `npm run sample` regenerates it. The copy CSV is an Orbit review format rather than a verified platform import schema, with potentially active spreadsheet prefixes neutralized.

Nothing is sent to Shopify or Google Ads. SVG files are not ad-ready PNG/JPG uploads; the video brief is not a rendered video. Production destination, media, policy, account, branding, and import checks remain outside this reference. See [channel specifications](channel-specs.md).
