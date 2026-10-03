export const channelSpecs = {
  version: "google-pmax-review-2026-10-03",
  verifiedAt: "2026-10-03",
  sources: [
    "https://support.google.com/google-ads/answer/14528373",
    "https://support.google.com/google-ads/answer/15996555",
    "https://support.google.com/google-ads/answer/10724748?hl=en",
    "https://support.google.com/google-ads/answer/14530211",
  ],
  headlines: { min: 3, max: 15, maxLength: 30, atLeastOneMaxLength: 15 },
  longHeadlines: { min: 1, max: 5, maxLength: 90 },
  descriptions: { min: 3, max: 5, maxLength: 90 },
  ctas: { min: 1, max: 5, maxLength: 40 },
  imageSizes: [
    [1200, 1200],
    [1200, 628],
    [960, 1200],
  ],
  defaults: { headlines: 5, longHeadlines: 1, descriptions: 4, ctas: 3 },
  formatNote:
    "SVG files are review compositions. Google image uploads require supported raster formats; this is not a complete launch-ready asset group.",
} as const;
