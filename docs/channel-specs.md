# Placement specifications and check scope

Verified **2026-10-03** from first-party pages where accessible. [Executable V2 configuration](../src/validation/placements.ts) separates required measurements, recommendations, Orbit design choices and **Not checked**. Selecting a channel, measuring an asset, merchant approval, account connection and platform policy approval are distinct states.

## Google Performance Max

[Google's current format requirements](https://support.google.com/google-ads/answer/17091269?hl=en) and [API asset requirements](https://developers.google.com/google-ads/api/performance-max/asset-requirements) agree on the supported text minimums. The API page was updated 2026-09-30. Retail Merchant Center campaigns and enabled brand guidelines have different asset-generation/linkage conditions; this reference does not create campaign or account objects.

| Field                  | Required measurement                                  | Recommended              | Local default               |
| ---------------------- | ----------------------------------------------------- | ------------------------ | --------------------------- |
| Headlines              | 3–15; maximum 30; one at most 15                      | 11+                      | 5                           |
| Long headlines         | 1–5; maximum 90                                       | 2+                       | 1                           |
| Descriptions           | 2–5; maximum 90                                       | 4+                       | 4                           |
| Business name          | Maximum 25; verified name/domain conditions           | Exact legal/domain match | Not an account verification |
| Platform CTA/final URL | Selected/automated CTA and destination URL conditions | Review in account        | Free CTA text is a draft    |

Double-width CJK characters count as two. V2 also counts full-width punctuation/forms; it never truncates required phrases to fit a short field. An older [best-practice page](https://support.google.com/google-ads/answer/15996555) specifies at least three descriptions. V1 retains its conservative three-description floor for regression compatibility. V2 uses the two-description minimum agreed by the newer Help/API sources, with four as its local default.

| Image asset | Ratio  | Minimum | Recommended | Group scope                                                      |
| ----------- | ------ | ------- | ----------- | ---------------------------------------------------------------- |
| Landscape   | 1.91:1 | 600×314 | 1200×628    | One required; up to 20                                           |
| Square      | 1:1    | 300×300 | 1200×1200   | One required; up to 20                                           |
| Portrait    | 4:5    | 480×600 | 960×1200    | Optional; up to 20                                               |
| Square logo | 1:1    | 128×128 | 1200×1200   | Required branding conditions; not exported as a group asset here |

The API permits GIF/JPG/PNG; Help specifies JPG/PNG. Orbit uses the conservative PNG/JPEG subset. The API's 5120KB limit is represented as 5,120,000 bytes. Published integer landscape sizes do not divide to exactly 1.91; Orbit allows 0.1% rounding in its checker. This is an explicit implementation tolerance, not a verified Google tolerance.

Measured raster format, header dimensions, ratio and size do not establish a complete asset group. Logo/business-name linkage, final URL, account setup, editorial restrictions and policy approval still require review. Optional actual YouTube videos are at least 10 seconds, up to 15; Google may generate video if none is supplied. Orbit's production brief is not a video asset, and no full Performance Max compliance is claimed.

## Meta

The [Ads Guide](https://www.facebook.com/business/ads-guide), [Facebook Feed](https://www.facebook.com/business/ads-guide/update/image/facebook-feed), [Instagram Feed](https://www.facebook.com/business/ads-guide/update/image/instagram-feed) and [Instagram Stories](https://www.facebook.com/business/ads-guide/update/image/instagram-story) pages redirected to login/temporary blocking during this verification. No third-party summaries were substituted as verified rules.

Meta feed **1440×1800** and Stories **1080×1920** are chosen Orbit composition targets. File-size limits, exact accepted ratios/media, text recommendations and safe zones remain **Not checked**. The checker can detect a mismatch with the campaign's chosen design dimensions; it does not present that finding as a Meta rejection. Confirm the exact objective and placement in current Ads Manager before upload.

## TikTok

The first-party [auction in-feed guide](https://ads.tiktok.com/resources/help/article/tiktok-auction-in-feed-ads?lang=en), updated June 2026, distinguishes Spark from Non-Spark. The configured target is **Non-Spark in-feed video**, not every TikTok format.

| Non-Spark measurement | Published rule                                    |
| --------------------- | ------------------------------------------------- |
| Vertical              | Recommended 9:16; minimum 540×960                 |
| Horizontal            | 16:9; minimum 960×540                             |
| Square                | 1:1; minimum 640×640                              |
| Video formats         | MP4, MOV, MPEG, 3GP, AVI                          |
| Duration/size/bitrate | Up to 10 minutes; at most 500MB; at least 516kbps |

Orbit chooses 1080×1920 as a production target. It does not render video, so a static composition or script remains **missing actual video**, with duration, bitrate, audio and motion unverified. Spark uses organic captions and different format/duration rules; a universal caption-character limit is not invented. Safe zones depend on orientation, caption length, anchor format and region; no fixed universal safe-area percentage is asserted.

## Website, email and export

Desktop/mobile website heroes and email banners use configurable design dimensions, bounded to 1–4096 pixels per side for local rendering. These are Orbit resource/design choices, not platform mandates. Destination browser/client rendering, responsive placement and accessibility need review in the destination.

PNG/JPEG are actual image deliverables; recipes and JSON are supplementary. CSV field mappings label drafts and unchecked platform rules. None is claimed as a verified platform import schema. The ZIP manifest retains measured findings and unknowns alongside merchant approvals; downloading does not connect, publish or spend.
