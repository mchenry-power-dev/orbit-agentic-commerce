# Workflow and domain

Orbit organizes **store → products → campaign → two creative directions → placement variants → exact versions → local handoff**. The description expresses intent; confirmed brand sources constrain facts. An editable interpretation precedes creation. The finished example is a useful starting point, but copying it does not preapprove any output for the merchant.

## Records and controls

| Record             | Meaning                                                                                                                     |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------- |
| Catalog selection  | Store-scoped product, variant and image identity plus a retained factual snapshot                                           |
| Local handoff      | Demo destination/target, exact approved version references, findings and immutable local completion record                  |
| Brief              | Description, goal, selected products/channels/placements, optional audience/offer/tone/phrases/dates and budget assumptions |
| Brand source       | Retrieved or visitor-supplied content with role, inclusion, provenance and confirmed product association                    |
| Creative plan      | Two directions, proposed copy/landing/video concept, conflicts, selected sources and captured preferences                   |
| Composition recipe | Direction, actual placement dimensions, protected photos, framing, overlays and spacing                                     |
| Asset version      | Raster or content, dependency fingerprint, findings, mode and source IDs                                                    |
| Approval           | Merchant decision tied to the exact current version                                                                         |
| Run                | Bounded attempts, completed checkpoints, interruption/failure state and concise events                                      |
| Export manifest    | Current approved versions mapped to exact filenames, placements, findings and provenance                                    |

Goal, products and channels remain near the brief. Optional details include audience, offer, tone, keywords, complete required/prohibited phrases, dates, website/email dimensions and budget. Budget distinguishes currency, period and daily/lifetime intent; allocations use the same basis and must total correctly. Empty amounts remain empty, zero remains zero. Optional CPA/ROAS/margin values are assumptions, not forecasts, private economics or spending authorization.

The hosted local planner supports bounded festive, cool and editorial cues and exposes its limits. Keywords can guide those cues; they are not exported paid-search account configuration. Art direction, approved image, framing, spacing, text visibility and supported placement copy are editable. Recompose selected variant applies those values to the actual raster. Arbitrary scene instructions remain review context; live semantic interpretation is deferred. Current supported instructions take precedence over brand defaults and remembered tone; remembered spacing is captured into a new plan.

Default required-phrase scope is **campaign-copy**: actual headline, long-headline, description or CTA fields. A complete 31–90 weighted-character phrase can use a long field while shorter headline alternatives remain intact. A phrase exceeding Google's 90-character supported long-copy limit conflicts when Google is selected. Use it as a website body note or shorten the requirement; it is not silently moved, split or truncated. Required/prohibited contradictions require resolution.

## Main journey

1. Explore a finished Cosmic Cat campaign, or choose a store, search its catalog and select products/variants before describing the campaign.
2. Inspect bundled brand facts, original photos and page/inspiration roles, or add confirmed facts and owned PNG/JPEG uploads. Website import is **Local service required** and disabled on Pages; a saved URL alone is not a successful import. Confirm actual product facts and photo associations.
3. Interpret, inspect and edit the creative plan. Resolve conflicting instructions and confirm the two directions.
4. Create only selected compatible outputs. The engine encodes real rasters, retains recipes, checks measurements and surfaces unknown rules.
5. Review a family or exact variant. Approve selected current versions intentionally, edit copy, reject or revise a targeted output.
6. Preview landing content and download current approved assets, or preview channel publishing to a clearly marked sample target. Review destination-specific mappings, create a local demo handoff where complete and download its package. The manifest identifies exact approved versions; no action publishes remotely.

The protected original photos are complete frames. A no-holiday request using Candy Cane's original festive photo conflicts until an alternative approved reference is supplied. The prepared sample pairs Candy Cane in a warm photographic story with Solar Surge in a contemporary editorial. Prototype review also compares both systems on both products. A contrasting summer campaign can reuse Solar Surge without introducing holiday motifs.

## Catalog consistency

The catalog and editable campaign brief are separate records. Search, store browsing and refresh do not rewrite a confirmed campaign. Product/variant/image selection captures factual context explicitly. Applying later catalog updates changes that snapshot and invalidates relevant output approvals; failed and partial refreshes preserve unaffected records. Duplicate names across stores do not share identity. [Catalog contract](catalog.md).

## Review and revision

```mermaid
stateDiagram-v2
  [*] --> Missing
  Missing --> Draft: create version
  Draft --> NeedsRepair: measured errors
  Draft --> NeedsReview: measurements reviewed
  NeedsRepair --> Draft: edit or recreate
  NeedsReview --> Approved: merchant approves exact version
  NeedsReview --> Rejected: merchant rejects
  Rejected --> Draft: revise
  Approved --> Draft: edit or revise this output
  Approved --> Stale: change its dependencies
  NeedsReview --> Stale: change its dependencies
  Stale --> Draft: recreate affected output
  Approved --> Downloaded: current packet gates pass
```

Conditions are stored separately in the [typed domain](../src/domain/studio.ts); “Downloaded” describes an export action. Warnings such as Meta **Not checked** or missing platform policy approval remain visible even after merchant review. Merchant approval is not a connected account, a platform policy decision or proof of creative effectiveness.

A single-variant revision creates one new version and clears that variant's approval. A family change invalidates dependent variants in that family. Copy/offer changes preserve text-free images when their visual dependencies remain current, while affected overlaid images, copy and handoff need review. Current required sources are checked again at export.

## Destination handoff

Google maps a Performance Max asset group with a sample campaign and separately reviewed brand assets. Meta maps campaign/ad-set context and conceptual ad drafts. TikTok maps campaign/ad-group inputs and blocks completion when actual video is missing. Website packages responsive hero assets and content. JSON/CSV are human-review artifacts, not executable vendor requests.

A completed demo handoff references exact approved versions and says nothing was sent. Duplicate clicks reuse the same signature. Revisions require fresh approval and an explicit revised handoff; older records stay unchanged. An incomplete download names its blockers and omits stale/rejected/invalid artifacts. [Mappings and rule registry](channel-handoff.md).

## Recovery and continuity

One active run is permitted; completed versions are persisted checkpoints. Bounded partial failures preserve unrelated approvals, and resume selects missing or stale work. A failed targeted revision resumes its original asset selection and note, preserving the prior version until a replacement succeeds. Live scene checkpoints are saved before local rendering; resuming a render failure reuses the scene, while revised and base scenes stay distinct. Late timed-out provider results do not become duplicate versions. Browser refresh restores local records; work does not continue after closing the browser.

V2 retains the earlier V1 database record separately. Use `?legacy=1` to inspect prior Aster/Harbor campaigns through the preserved interface. Navigation and local deletion are distinct from generation; no route changes advertising spend or a storefront. See [architecture](architecture.md), [demo guide](demo-guide.md) and [channel checks](channel-specs.md).
