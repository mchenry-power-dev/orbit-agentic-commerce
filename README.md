# 🪐 Orbit™

### Agentic Commerce OS · Orbit Studio

**Choose your products. Build a coordinated campaign. Prepare every placement.**

A working no-key creative orchestration reference using real product photography, local composition, review workflows, and export.

McHenry Power · Product Architect & Developer

[Live demo](https://mchenry-power-dev.github.io/orbit-agentic-commerce/) · [Try the workflow](docs/demo-guide.md) · [Gallery](docs/product-gallery.md) · [Architecture](docs/architecture.md) · [Validation](docs/testing-and-evaluation.md)

![Orbit Studio showing two photographic creative families and their placement variants](docs/images/quality04-family.png)

_Actual application · Candy Cane photographic story and Solar Surge editorial direction · Prepared sample compositions · No model calls_

## From a store to a reviewed campaign

**Store → products → campaign → variants → review → handoff**

Start with a finished Cosmic Cat campaign, or browse its curated catalog: search coffee, select variants and reuse factual context and approved photographs. The demo catalog is a dated public snapshot. An explicit public Cosmic Cat catalog read and local catalog-file import are separate operations; failed reads preserve the previous catalog.

Two composition systems give the photography room to work: a photographic story with restrained serif type and source-derived surroundings, and an editorial layout with paper tones and confident typography. Square, landscape, portrait and desktop/mobile heroes adapt individually. Review and export use the same finished raster; small previews come from that canvas.

Use festive, cool or editorial cues, then inspect the interpretation. Change direction, approved image, framing, copy or text visibility and recompose the selected variant. Arbitrary instructions are not understood by a live model. Every approval belongs to an exact current version.

**Download assets** produces real files. **Preview channel publishing** maps approved versions to sample Google, Meta, TikTok or website targets. Google, Meta and website flows can save local demo handoffs when their supported requirements are met. TikTok in-feed remains **Video required** because a still or storyboard is not finished video. Nothing is sent to an advertising account or storefront.

## The problem behind the product

McHenry Power's experience operating Cosmic Cat Coffee Co. shapes Orbit's central problem: one campaign coordinates product facts, offers, imagery, copy, landing pages, placement formats and approvals. Repeating those tasks by hand makes consistent campaign production difficult.

Orbit turns that coordination into inspectable software. Its broader vision connects creative, page and budget decisions with measured performance. This reference demonstrates production, review and handoff; it makes no revenue, conversion or optimization claims.

## Run it

Use Node.js **22.12 or newer**. Recorded tooling: **Node 24.18.0 / npm 11.16.0**.

```sh
npm ci
npm run dev
```

Open Vite's URL with `/orbit-agentic-commerce/`. No model key, backend or paid provider is needed. Browser-local IndexedDB preserves campaigns, drafts and exact-version decisions. Earlier saved campaigns remain supported. Closing the browser stops work.

## Inspect the decisions

| Boundary                            | Implementation                                                                                                    |
| ----------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| Catalog facts versus campaign edits | Store-scoped identity and retained selection snapshots; refresh never rewrites an approved campaign automatically |
| Preview versus export               | One Canvas composition recipe, loaded local fonts, native PNG/JPEG dimensions and bounded thumbnails              |
| Revision versus approval            | Targeted versions, dependency invalidation, bounded recovery and unchanged work preserved                         |
| Download versus publishing          | Destination ZIPs and immutable local demo records; no account authentication, API writes or spending              |
| Format versus policy                | Placement-specific measurements, exact human approval and explicit **Not checked** / **Video required** states    |

The [test record](docs/testing-and-evaluation.md) separates baseline, candidate and hosted evidence. The [catalog contract](docs/catalog.md), [channel mappings](docs/channel-handoff.md), [source provenance](docs/brand-provenance.md) and [workflow model](docs/workflow-and-domain.md) expose implementation details.

| Availability       | Scope                                                                                                                                                                                     |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Hosted             | Catalog snapshot/search/variants, explicit public catalog reads where supported, file/photo uploads, compositions, responsive previews, revisions, approvals, ZIPs and simulated handoffs |
| Local service only | Protected arbitrary public-page import; no model key required                                                                                                                             |
| Deferred           | Live semantic/image/video generation, authenticated production stores/ad accounts, real publishing and performance feedback                                                               |

Public catalog access is not store authorization. Simulated targets are not connected accounts. JSON/CSV are review mappings, not verified vendor import requests. Detailed [runtime boundaries](docs/provider-and-runtime.md) remain available.

## Ownership

Cosmic Cat Coffee Co. is the owner-authorized customer-zero brand. Public photography retains its provenance and rights; public source availability grants no open-source license. McHenry Power owns product direction and architecture; development used AI assistance. Aster and Harbor remain historical regression fixtures.

[Roadmap](docs/roadmap.md) · [McHenry Power on LinkedIn](https://www.linkedin.com/in/mchenry-j-power-mba)
