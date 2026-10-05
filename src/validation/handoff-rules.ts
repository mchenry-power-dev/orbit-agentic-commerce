/** Bounded local checks, never account authentication or advertising-policy approval. */
export const handoffRules = {
  version: "2026-10-05-handoff-1",
  reviewedAt: "2026-10-05",
  google: {
    status: "verified-subset",
    sources: [
      "https://developers.google.com/google-ads/api/performance-max/asset-requirements",
      "https://developers.google.com/google-ads/api/performance-max/asset-groups",
      "https://developers.google.com/google-ads/api/performance-max/create-campaign",
      "https://developers.google.com/google-ads/api/performance-max/structure-requests",
      "https://support.google.com/google-ads/answer/17091269?hl=en",
    ],
    text: {
      headlines: { min: 3, max: 15, length: 30, recommended: 11 },
      longHeadlines: { min: 1, max: 5, length: 90, recommended: 2 },
      descriptions: { min: 2, max: 5, length: 90, recommended: 4 },
      businessName: { min: 1, max: 1, length: 25 },
    },
    images: {
      "google-square": { min: 1, max: 20 },
      "google-landscape": { min: 1, max: 20 },
      "google-portrait": { min: 0, max: 20 },
    },
    logo: { min: 1, minWidth: 128, minHeight: 128, maxBytes: 5120000 },
    note: "Brand assets belong to the campaign when brand guidelines are enabled, otherwise to the asset group. Retail groups may have no linked assets; once assets are linked, all minimums apply. Orbit maps supplied assets and does not claim the empty-feed exemption.",
    requestNote:
      "Non-retail asset groups and required asset links must be created together atomically. Brand-guideline campaign creation also requires its brand links together. Updates cannot leave a group below its minimums. This mapping is not an executable API request.",
  },
  meta: {
    status: "not-checked",
    sources: [
      "https://developers.facebook.com/docs/marketing-api/",
      "https://developers.facebook.com/docs/marketing-api/reference/ad-creative/",
      "https://www.facebook.com/business/ads-guide",
    ],
    note: "Official API pages were inaccessible (429/access failure) and the placement guide required login on review. Campaign/ad set, creative variants and ad drafts are conceptual mappings; exact API fields, account requirements and placement acceptance remain Not checked.",
  },
  tiktok: {
    status: "verified-video-subset",
    sources: [
      "https://ads.tiktok.com/resources/help/article/campaign-set-up",
      "https://ads.tiktok.com/resources/help/article/tiktok-auction-in-feed-ads?lang=en",
    ],
    note: "Campaign → ad group → ads. The selected Non-Spark in-feed placement requires actual video; vertical 9:16 at least 540×960 is recommended, duration up to 10 minutes, size at most 500 MB, bitrate at least 516 kbps. Spark rules differ. Safe zone depends on caption, format and region. A still or brief cannot satisfy video requirements.",
  },
  website: {
    status: "design-goal",
    sources: [],
    note: "Orbit checks the chosen desktop/mobile design dimensions and approved content. Theme integration, accessibility in the destination site and live publication require separate review.",
  },
} as const;
