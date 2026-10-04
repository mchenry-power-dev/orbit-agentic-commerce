# 🪐 Orbit™

### Agentic Commerce OS

**One campaign brief. Two creative directions. A coordinated, reviewed set of placement variants.**

McHenry Power · Product Architect & Developer<br>
Current focus: **Orbit Studio — campaign creative orchestration**<br>
Status: **No-key V2 · Authorized public brand snapshot · Local photo composition**

[Public demo](https://mchenry-power-dev.github.io/orbit-agentic-commerce/) · [Workflow](docs/workflow-and-domain.md) · [Architecture](docs/architecture.md) · [Checks](docs/testing-and-evaluation.md) · [Brand provenance](docs/brand-provenance.md)

TypeScript · React · Vite · IndexedDB · Vitest · Playwright

---

## 🧭 Why Orbit Studio

McHenry Power's experience operating Cosmic Cat Coffee Co. shapes Orbit's central problem: one campaign requires coordinating product facts, audiences, offers, budgets, imagery, copy, landing pages and approvals. Each placement needs different framing, product visibility and text space. Repeated manual rework limits campaign frequency and encourages reuse of older creative.

The workflow begins with a description and selected products, followed by an editable interpretation. Audience, offer, references, directions and placement targets stay visible together. Advertising budgets record planning assumptions, including currency, period, daily/lifetime intent and channel allocation; they do not authorize spending.

**Brief and brand → creative plan → two families → placement variants → review → export**

Orbit's thesis is to make this coordination software. The intended feedback loop connects creative, page and budget hypotheses with later measured performance. This reference implements review and revision without connected advertising accounts or performance feeds.

## 🖼️ Start with a finished campaign

Orbit is a **working no-key creative orchestration reference using real product photography, local composition, review workflows, and export.** It opens with an authorized Cosmic Cat Christmas example. Solar Surge's verified record and unchanged packaging photo anchor two creative families, adapted for selected Google, Meta and website targets. Website heroes include text; Google image assets keep copy separate.

![Orbit Studio V2 showing the Cosmic Cat finished-campaign preview](docs/images/v2-01-home.png)

_No-key V2 · Authorized Cosmic Cat photos · Prebuilt local composition · No model calls._

**Explore a finished campaign** copies the example into local work without carrying over merchant approvals. **Create a campaign** begins a new brief. A contrasting cool summer direction can reuse the same protected product photo while changing the surrounding palette, arrangement and copy. The original photo remains intact; local composition creates a graphic treatment around it.

The [brand provenance](docs/brand-provenance.md) records retrieval dates, original image URLs, hashes and the boundary between product facts and visual inspiration. Aster and Harbor remain preserved regression fixtures and earlier saved campaigns remain available separately. Custom brands use confirmed facts and owned PNG/JPEG uploads. Arbitrary website import is labeled **Local service required** on Pages; bundled context and local uploads work publicly.

---

## Run it

Use Node.js **22.12 or newer**. Tested with **Node 24.18.0 and npm 11.16.0**:

```sh
npm ci
npm run dev
```

Open Vite's local URL, including `/orbit-agentic-commerce/`, or use the public demo. Choose a finished example, inspect its creative family, review exact outputs and download the approved packet. The no-key workflow needs no backend, model key or paid provider.

IndexedDB retains drafts, campaigns, versions, decisions and events across refreshes. Closing the browser stops work; completed outputs remain checkpoints. Storage is browser/origin-specific. Navigation preserves unfinished work; local deletion requires confirmation.

## 🛠️ Engineering boundaries

The engine separates campaign intent, creative families, placement recipes, outputs and exact approvals. Offer changes invalidate relevant copy and overlaid artwork while preserving unrelated image approvals. A targeted revision appends one version; family edits invalidate dependent variants. Failures remain visible and completed outputs survive recovery.

| Availability                  | Capability                                                                                                                  |
| ----------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| Hosted demo                   | Prebuilt sample, new local compositions, PNG/JPEG variants, landing previews, review, recovery, ZIP and browser persistence |
| Documented local service only | Bounded public-URL import; no model key required                                                                            |
| Deferred                      | Live semantic planning, generative images/video, account connections, publishing and measured optimization                  |

Local interpretation recognizes festive, cool and editorial cues. Editable palette, visual mode, framing, spacing and supported placement copy control the composition; arbitrary scene text remains review context. The hosted demo makes no localhost calls and offers no credential fields. Live adapters and their mocked tests remain available for later development, with live AI unavailable in this release. See the [capability and runtime boundary](docs/provider-and-runtime.md).

---

## Evidence and export

The [V2 tests](tests/studio.test.ts) cover contrasting briefs, complete phrases, sources, budgets, placements, dependencies, recovery and exact exports. The no-key production check passed **133 unit tests and 42 browser cases** (26 V2, 16 legacy), plus typecheck and build. The [testing guide](docs/testing-and-evaluation.md) records scope and links CI/deployment evidence. The [gallery](docs/product-gallery.md) contains real app captures with prebuilt and newly composed work labeled.

Exports contain current approved versions, real raster files, editable recipes, placement copy mappings and source provenance. CSV and JSON are review artifacts, not verified platform import schemas. Merchant approval applies to an exact version and remains separate from account connection and platform policy approval.

Google checks use dated first-party specifications for the supported measurements. Meta's official guides were unavailable during verification, so its rules remain **Not checked**. Website and email dimensions are configurable design goals. TikTok and Google video concepts remain scripts and shot lists; they are not playable video. No packet claims complete campaign compliance or automatic advertising approval.

## 🌱 Direction and ownership

Cosmic Cat Coffee Co. is the authorized customer-zero brand for this reference. [Loom™](https://github.com/mchenry-power-dev/loom-public) addresses subscription-commerce infrastructure; Orbit explores reusable orchestration across creative work. McHenry Power owns the product direction and architecture; development used AI assistance. Public source availability adds no open-source license grant, and attribution does not turn public brand photography into unrestricted assets.

The [roadmap](docs/roadmap.md) separates this no-key release from future provider integrations and performance feedback. No paid provider or public backend is part of this release.

[McHenry Power on LinkedIn](https://www.linkedin.com/in/mchenry-j-power-mba)
