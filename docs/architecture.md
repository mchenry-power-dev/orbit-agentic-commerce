# Architecture

The no-key V2 release runs its campaign workspace entirely in the browser on GitHub Pages. A dated catalog snapshot, owned local uploads, local photo composition, review, export and simulated channel handoff need no backend or model credentials. Explicit public catalog reads are anonymous and read-only; browser failures preserve the prior catalog. A protected **local Node service** supports separate development-only public URL import. Semantic/image adapters are preserved but deferred; the hosted release has no connected provider.

```mermaid
flowchart TB
  subgraph Local[Hosted no-key browser workflow]
    UI[React workspace]
    Catalog[Store catalog and selected factual snapshot]
    Domain[Brief and confirmed brand sources]
    Plan[Editable plan with two directions]
    Engine[Versioned campaign engine]
    Raster[Protected photos and raster composition]
    Checks[Measured checks and explicit unknowns]
    Review[Exact-version merchant approval]
    Export[PNG or JPEG plus recipes and manifest]
    Handoff[Local destination handoff record]
    Store[(Browser-local IndexedDB)]
    UI --> Catalog --> Domain --> Plan --> Engine
    Engine --> Raster --> Checks --> Review --> Export
    Review --> Handoff
    Engine <--> Store
    Review <--> Store
  end
  Snapshot[Owner-authorized Cosmic Cat snapshot] --> Catalog
  subgraph Service[Separate local development service]
    Import[Bounded public HTTPS import]
    Schema[Deferred semantic planning adapter]
    Images[Deferred image provider adapter]
    Allowance[Server-side approval and cost reservations]
    Allowance --> Schema
    Allowance --> Images
  end
  Import -. confirmed development imports .-> Domain
  Schema -. future live mode .-> Plan
  Images -. future live mode .-> Raster
  Future[Future: approved public runtime and account integrations]
  Future -. requires separate verification .-> Service
```

## Responsibilities

| Boundary                                                                                    | Inspect                                                                                                          |
| ------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| Typed brief, brand sources, directions, recipes, versions and decisions                     | [Studio domain](../src/domain/studio.ts)                                                                         |
| Catalog identity, variants, refresh and selected snapshots                                  | [Catalog domain](../src/domain/catalog.ts), [catalog contract](catalog.md)                                       |
| Curated public facts and unchanged source images                                            | [Cosmic Cat snapshot](../src/fixtures/cosmic-cat.ts), [provenance](brand-provenance.md)                          |
| Bounded local theme interpretation and explicit conflicts                                   | [Local planner](../src/fixtures/studio.ts)                                                                       |
| Placement adaptation, protected photo frames and real raster encoding                       | [Composition provider](../src/providers/composition/index.ts)                                                    |
| Serialized state changes, bounded attempts, checkpoint recovery and dependency invalidation | [Studio engine](../src/orchestration/studio.ts)                                                                  |
| V2 records alongside preserved V1 data                                                      | [Persistence](../src/persistence/studio.ts)                                                                      |
| Google measurements, missing TikTok motion and unknown Meta rules                           | [Placement checks](../src/validation/placements.ts), [channel scope](channel-specs.md)                           |
| Current exact approvals, destination mappings and ZIP assembly                              | [Export](../src/export/studio.ts)                                                                                |
| Bounded import, authenticated local routes, schemas and allowances                          | [Service](../server/service.ts), [security](../server/security.ts), [provider contracts](../server/providers.ts) |

## Generation modes

**Prebuilt sample** means completed example outputs copied into local work without merchant approvals. **Local composition** means large unchanged product photographs composed with placement-specific typography and layout. Photographic-story layouts extend soft-focus material from the same original scene; editorial layouts use paper tones and a different reading order. It supports festive, cool and editorial cues, with editable palette, framing, spacing and supported placement copy. Arbitrary written scene instructions remain human review context; no live model interprets them in the hosted release. Composition does not synthesize a new photographed scene or alter the package.

**Live generation** is deferred in the hosted release. Static production builds never construct a service client, even with a `VITE_ORBIT_SERVICE_URL` value; no localhost or remote service requests occur. Website import is labeled **Local service required**. The optional development service is enabled only through an explicit URL while Vite runs in development on localhost/127.0.0.1. A missing/rejected development service fails visibly, without a silent local substitute. Mocked contract tests do not establish live provider quality, paid-call success or public service hosting.

Current instructions take priority over default brand tone and remembered preferences. The plan captures spacing preferences so later preference changes affect future plans rather than existing recipes. Required campaign-copy phrases must remain whole in actual ad-copy fields; metadata cannot satisfy them.

## Catalog and rendering

The [catalog domain](../src/domain/catalog.ts) separates stores, products, variants, classified images and source snapshots from campaign messaging. Store-scoped identity prevents duplicate names from colliding. A refresh changes catalog state; only an explicit user update changes a campaign's factual snapshot and invalidates affected approvals. Missing images or removed variants remain visible, never silently substituted.

One [Canvas renderer](../src/providers/composition/index.ts) loads local fonts, contains complete protected source frames and encodes the actual placement dimensions. Both preview and export reference that finished raster. A maximum-768-pixel JPEG thumbnail is resampled from the same canvas for galleries; review/download retain full-resolution bytes. The renderer bounds sources, dimensions and output bytes and releases canvas backing stores after each sequential composition.

## Storage, recovery and exports

The engine persists completed versions and concise events as each step finishes. One active run is permitted. Local composition defaults to two attempts and 30 seconds per step. Live-mode steps allow one attempt and 75 seconds by default, avoiding automatic paid retries; the service has its own bounded timeout and reservation gates. Failure does not erase unrelated completed work. Pausing or refreshing permits missing/stale work to resume; this is local recovery, not a distributed queue guarantee.

IndexedDB stores V2 under `studio-v2` in the original database. New-campaign drafts and existing-campaign drafts are retained separately; deleting a campaign clears its matching draft, and deleting a brand clears its draft uploads. The V1 `app` record is retained, and the earlier interface is reachable with `?legacy=1`. Browser storage remains specific to profile and origin; clearing it loses local work. Memory adapters support isolated tests and preserve a separate legacy record.

Dependency fingerprints connect each asset to its plan, selected products and sources, including family image prompts and scene instructions. Text-free imagery excludes copy fields from its dependencies. An offer edit therefore changes copy, relevant overlaid images and handoff without discarding unrelated text-free image approvals. A changed family image prompt invalidates that family's variants. An edited version never inherits its previous approval. Export rechecks current source gates, supported measurements and exact approval references.

Live-mode scenes are persisted before local composition, with SHA-256 keys covering campaign, family, scene prompt and selected visual references. A local-render failure can resume from its saved scene and exact provider provenance without repeating the provider request. Revised scenes use separate keys and cannot silently replace the base scene for another missing variant. Failed targeted revisions retain their selected IDs and note across refresh/resume. These behaviors are tested with mock scenes; real paid image generation remains unverified.

Placement plans provide bounded `product-right` or `product-center` composition and spacing. These values enter actual recipes; descriptive framing/focal/negative-space notes remain review context. Equal-size placements reuse a file only when their overlay and layout choices match. Global copy edits update current placement mappings as well as campaign copy before re-review/export.

ZIP files contain real PNG/JPEG bytes, optional editable recipes, content JSON, field-mapping CSV, provenance, campaign brief and an exact-version manifest. Local destination handoff records preserve exact approved version IDs and findings. Serialized creation deduplicates repeated clicks; a changed selection/version signature requires an explicit new handoff. Blocking requirements prevent simulated completion while allowing a clearly incomplete download. See [channel handoff](channel-handoff.md). They do not publish, change ad spend, prove a platform import schema or grant advertising policy approval.

## Service trust boundary

Import uses public HTTPS with bounded pages, assets, bytes, time and redirects. Address resolution, restricted paths and destination robots rules are checked across page redirects; requests are pinned to eligible resolved addresses. Credential-bearing, private, loopback, link-local, metadata and internal destinations are rejected. Structural extraction excludes hidden, form, navigation and recognizable review/customer sections without storefront cookies or script execution. It does not claim browser-computed visibility or universal recognition of identities in arbitrary unmarked text. Paste/upload remains available when a source cannot be imported.

Imported products remain unconfirmed with no assigned photo. Images enter as visual references until the visitor confirms ownership and explicitly associates a product photo. When extracted colors are absent, a visible editable default palette is supplied; it is not represented as a discovered brand fact.

The local service requires operator authorization, restricts frontend origins and bounds concurrency and response sizes. Provider credentials and allowance state belong server-side. Persistent cost reservations survive failed/unknown paid calls and reject repeated operation identifiers; they are operator ceilings, not proof of actual billing. Visitor budgets, sources and uploads must not become public fixture data or repository logs. Public service hosting, production authentication and account integrations require separate work and verification.

Using a future configured semantic service would transmit selected brief, confirmed facts, references and planning assumptions. Image contracts allow at most two selected, locally decoded visual references as inspiration; protected product photos remain separate composition layers. Reference input is not proof of provider fidelity or live acceptance. See the [runtime boundary](provider-and-runtime.md) for hosted, local-only and deferred capabilities.
