# Destination handoff

“Download assets” produces files. “Preview channel publishing” creates a browser-local review record for a sample target. It never authenticates an account, uploads an ad, changes a theme, activates a campaign or spends money. Every target and handoff ID visibly begins with `demo`.

Choose a destination and sample target, map a creative family and its exact approved versions, then inspect readiness. Google also requires explicit local review of the original classified Cosmic Cat logo and business name. The logo preview and download verify its recorded dimensions, byte count and SHA-256. A product photograph never substitutes for a logo.

Completion is blocked by missing required fields or artifacts. An explicitly **incomplete** download remains available and lists what is missing. It includes only current approved, locally valid artifacts; stale, rejected and invalid versions are omitted. TikTok's storyboard is never counted as video.

## Mapping and rule scope

The versioned registry is [`handoff-rules.ts`](../src/validation/handoff-rules.ts), reviewed **2026-10-05**. Existing placement byte/dimension checks remain in [`placements.ts`](../src/validation/placements.ts). “Format checked”, “Approved version”, authentication, platform policy and publication describe different states.

| Destination | Prepared locally                                                                          | Remaining boundary                                                                                                                          |
| ----------- | ----------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| Google Ads  | PMax asset-group text/image relationships and final URL; separately reviewed brand assets | Bounded requirements only; account settings, policy, advertiser verification, feed/listing groups and actual API requests are not validated |
| Meta Ads    | Campaign/ad-set context, creative variants and resulting local ad drafts                  | Conceptual mapping; exact API requirements and placement acceptance **Not checked**                                                         |
| TikTok Ads  | Campaign/ad-group context, caption draft, destination and video brief                     | **Video required**; simulated completion remains blocked                                                                                    |
| Website     | Separate desktop/mobile heroes, approved content and placement guidance                   | No storefront or theme update; destination rendering/accessibility needs review                                                             |

### Google Performance Max

The verified API subset requires 3–15 short headlines (30 characters), 1–5 long headlines (90), 2–5 descriptions (90), and one landscape plus one square image. Portrait is optional. Image dimensions and file limits are checked by placement. Video is optional for this subset; the local handoff states that no video is supplied. [Official asset requirements](https://developers.google.com/google-ads/api/performance-max/asset-requirements).

At least one short headline must be 15 characters or fewer. Recommended variety—11+ headlines, 2+ long headlines and 4+ descriptions—exceeds valid minimums. The business-name limit is 25 characters, and destination/identity review remains separate. Oversized copy produces a field-specific finding; Orbit does not silently cut text. [Official format specifications](https://support.google.com/google-ads/answer/17091269?hl=en).

With brand guidelines enabled, brand name and logos link at campaign level; otherwise they link to the asset group. Brand-guideline campaign creation needs one business name and at least one square logo, in the same request. New standard/retail campaigns enable brand guidelines by default. The local checkbox records human review of a bundled file, not a verified account asset. [Official campaign/brand guide](https://developers.google.com/google-ads/api/performance-max/create-campaign).

Retail groups can initially have no linked creative assets; linking supplied assets triggers the complete minimums. Orbit's retail target maps supplied assets and never claims an empty-feed exemption. Non-retail groups and required links must be created atomically; updates cannot leave an invalid set. A real implementation must respect request ordering, feed/listing-group context and restrictions. [Asset-group guide](https://developers.google.com/google-ads/api/performance-max/asset-groups), [request structure](https://developers.google.com/google-ads/api/performance-max/structure-requests).

### Meta and TikTok

The [Meta Marketing API](https://developers.facebook.com/docs/marketing-api/) and [creative reference](https://developers.facebook.com/docs/marketing-api/reference/ad-creative/) were inaccessible during review (429/access failure); the [placement guide](https://www.facebook.com/business/ads-guide) redirected to login/temporary block. No undocumented limits or executable schema are invented. Meta handoff completion means only that the conceptual local mapping is saved.

TikTok documents campaign → ad group → ads. The selected Non-Spark in-feed placement requires actual video. The current guide recommends vertical 9:16 at least 540×960, up to 10 minutes, at most 500 MB and at least 516 kbps. Safe zones vary by caption, format and region; Spark specifications differ. Orbit cannot verify motion/audio/codec or satisfy this placement with a still. [Campaign structure](https://ads.tiktok.com/resources/help/article/campaign-set-up), [in-feed specifications](https://ads.tiktok.com/resources/help/article/tiktok-auction-in-feed-ads?lang=en).

## Records and packages

The serialized engine write rechecks readiness and deduplicates the exact selection/version signature. Repeated completion clicks reuse the existing local record. Later revisions require fresh approval and an explicit revised handoff; previous records retain their original asset IDs, version IDs, approval times, dependency fingerprints, findings and source references. Current downloads cannot be relabeled as an older record.

Destination ZIPs contain actual PNG/JPEG bytes, recipe files, approved copy CSV, mapped content, exact-version manifest, validation findings, provenance and a handoff summary. Google includes the source-identical reviewed logo. Website includes separate responsive assets and approved page content. JSON and CSV are **human-review mapping artifacts**, not verified vendor import formats or executable API requests. Nothing in a ZIP establishes launch readiness or platform policy approval.
