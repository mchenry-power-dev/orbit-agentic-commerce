# Supported channel specification

**Scope:** a Performance Max-oriented planning and review subset. Orbit exports drafts; it does not configure a Google Ads campaign or certify launch readiness. Passing its checks means the implemented subset passed, not that Google will approve an ad.

**Official documentation verified: October 3, 2026.** Specifications can change. Recheck the sources before adding a production adapter.

## Required rules, recommendations, and Orbit defaults

| Text item | Google requirement / limit | Google recommendation | Orbit default |
| --- | --- | --- | --- |
| Short headlines | 3–15; at most 30 characters each; include one at most 15 | 11 or more | 5 |
| Long headlines | 1–5; at most 90 characters each | 2 or more; aim for at least 30 characters | 1 |
| Descriptions | Published minimum differs: 2 or 3; maximum 5; at most 90 characters | 4 or more | 4; conservative minimum 3 |
| Business name | One; at most 25 characters; match verified business/domain | — | Fictional fixture metadata |
| Final URL | One | — | Fixture `.example` metadata |
| CTA | Automated or selected from Google's list | One | 3 draft options; Orbit max 40 characters each |

Sources: [About text assets for Performance Max](https://support.google.com/google-ads/answer/14528373), [Best practices for text assets](https://support.google.com/google-ads/answer/15996555).

**Description-count discrepancy:** the text-assets page and [How asset groups work](https://support.google.com/google-ads/answer/10724748?hl=en) list a minimum of two descriptions. The text best-practices page lists three. Orbit explicitly chooses three as its conservative validation floor and generates four by default. That choice does not resolve the discrepancy for every account or import route.

| Image item | Google format / minimum | Google recommendation | Orbit default |
| --- | --- | --- | --- |
| Landscape | 1.91:1; 600 × 314 | 1200 × 628; 4+ | 2 SVG drafts at 1200 × 628 |
| Square | 1:1; 300 × 300 | 1200 × 1200; 4+ | 2 SVG drafts at 1200 × 1200 |
| Portrait | 4:5; 480 × 600; optional | 960 × 1200; 2+ | 2 SVG drafts at 960 × 1200 |

Google requires JPG or PNG image uploads, up to 5 MB, and a square logo. Orbit's original SVG compositions demonstrate coordinated layouts and stable packaging. They are **not upload-ready raster advertisements**; the reference does not produce a complete campaign logo/video/media inventory. Its six-image default is a finite portfolio choice, below Google's four-per-landscape/square recommendation. Sources: [About image assets for Performance Max](https://support.google.com/google-ads/answer/14530211), [How asset groups work](https://support.google.com/google-ads/answer/10724748?hl=en).

## What validation establishes

Channel configuration is versioned in [channel-specs.ts](../src/validation/channel-specs.ts); [validation](../src/validation/index.ts) checks supported fields, text lengths/counts, planned image dimensions/aspect ratios, and required portfolio completeness. Product facts and prohibited phrases are separate deterministic checks. Business/destination metadata is fictional, not a verified advertiser identity or Google import field. Logo inventory and full media/destination checks are outside the subset. CTA suggestions, product-copy drafts, landing material, and the video brief are review artifacts rather than verified Google import objects.

Orbit permits 1–5 draft CTA options, requires the requested quantity, and limits each to 40 weighted characters. These are chosen review rules, not Google's CTA-list schema or a claim that every generated option is a platform-supported selection.

Google counts double-width language characters as two toward text limits. Orbit implements a weighted CJK character count; the tests cover the supported cases rather than all Unicode/platform behavior. Google also applies quality, policy, advertiser, destination, branding, and media requirements beyond this subset. A fictional `.example` address is intentionally unusable as a live advertising destination.

The copy CSV is an Orbit review format, not an Ads Editor or Google Ads API import schema. Export does not spend money, publish a storefront, upload an ad, or substitute for platform review. Consult [Build an asset group](https://support.google.com/google-ads/answer/10724492) when designing a future connection.
