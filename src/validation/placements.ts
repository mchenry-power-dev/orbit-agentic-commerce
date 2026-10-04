import type { ValidationFinding } from "../domain";
import type {
  Channel,
  StudioBrand,
  StudioBrief,
  StudioPlan,
  StudioVersion,
} from "../domain/studio";
import { adsCharacterCount as legacyCount } from "./index";

/** Include full-width punctuation/forms as well as the preserved legacy CJK script rules. */
export const studioAdsCharacterCount = (text: string): number =>
  [...text].reduce((sum, character) => {
    const point = character.codePointAt(0)!;
    const fullWidth =
      (point >= 0x3000 && point <= 0x303f) ||
      (point >= 0xff01 && point <= 0xff60) ||
      (point >= 0xffe0 && point <= 0xffe6);
    return sum + (fullWidth ? 2 : legacyCount(character));
  }, 0);
const adsCharacterCount = studioAdsCharacterCount;

export interface PlacementSpec {
  id: string;
  channel: Channel;
  name: string;
  width: number;
  height: number;
  media: "image" | "video";
  verification: "verified-measurements" | "not-checked" | "design-goal";
  verifiedAt?: string;
  sources: string[];
  ratio?: number;
  minWidth?: number;
  minHeight?: number;
  maxBytes?: number;
  requiredInPlatformGroup?: boolean;
  note: string;
}

export const googleSpecSources = [
  "https://support.google.com/google-ads/answer/17091269?hl=en",
  "https://developers.google.com/google-ads/api/performance-max/asset-requirements",
];
export const tiktokSpecSource =
  "https://ads.tiktok.com/resources/help/article/tiktok-auction-in-feed-ads?lang=en";
export const placementSpecs: PlacementSpec[] = [
  {
    id: "google-square",
    channel: "google",
    name: "Google PMax · square",
    width: 1200,
    height: 1200,
    media: "image",
    verification: "verified-measurements",
    verifiedAt: "2026-10-03",
    sources: googleSpecSources,
    ratio: 1,
    minWidth: 300,
    minHeight: 300,
    maxBytes: 5120000,
    requiredInPlatformGroup: true,
    note: "1:1; one required, up to 20 in a non-retail asset group. 1200² is recommended. Raster checks do not establish a complete asset group or policy approval.",
  },
  {
    id: "google-landscape",
    channel: "google",
    name: "Google PMax · landscape",
    width: 1200,
    height: 628,
    media: "image",
    verification: "verified-measurements",
    verifiedAt: "2026-10-03",
    sources: googleSpecSources,
    ratio: 1.91,
    minWidth: 600,
    minHeight: 314,
    maxBytes: 5120000,
    requiredInPlatformGroup: true,
    note: "1.91:1; one required, up to 20. 1200×628 is recommended. A small Orbit rounding tolerance handles the published integer sizes; no platform tolerance is asserted.",
  },
  {
    id: "google-portrait",
    channel: "google",
    name: "Google PMax · portrait",
    width: 960,
    height: 1200,
    media: "image",
    verification: "verified-measurements",
    verifiedAt: "2026-10-03",
    sources: googleSpecSources,
    ratio: 0.8,
    minWidth: 480,
    minHeight: 600,
    maxBytes: 5120000,
    requiredInPlatformGroup: false,
    note: "Optional 4:5 image, up to 20. 960×1200 is recommended; 480×600 is the minimum.",
  },
  {
    id: "meta-feed",
    channel: "meta",
    name: "Meta feed · composition target",
    width: 1440,
    height: 1800,
    media: "image",
    verification: "not-checked",
    sources: [
      "https://www.facebook.com/business/ads-guide/update/image/facebook-feed",
      "https://www.facebook.com/business/ads-guide/update/image/instagram-feed",
    ],
    note: "Not checked: official public guides redirected to login/temporary block. 4:5 at 1440×1800 is Orbit's chosen design target, not a verified Meta acceptance rule. Confirm the exact placement and objective in Ads Manager.",
  },
  {
    id: "meta-story",
    channel: "meta",
    name: "Meta Stories · composition target",
    width: 1080,
    height: 1920,
    media: "image",
    verification: "not-checked",
    sources: [
      "https://www.facebook.com/business/ads-guide/update/image/instagram-story",
    ],
    note: "Not checked. 9:16 at 1080×1920 is a chosen composition target. Safe areas, placement-specific media support, text and file limits require official verification.",
  },
  {
    id: "tiktok-video",
    channel: "tiktok",
    name: "TikTok Non-Spark in-feed · video",
    width: 1080,
    height: 1920,
    media: "video",
    verification: "verified-measurements",
    verifiedAt: "2026-10-03",
    sources: [tiktokSpecSource],
    ratio: 9 / 16,
    minWidth: 540,
    minHeight: 960,
    maxBytes: 500000000,
    note: "Actual video required. Official Non-Spark guide recommends vertical 9:16, minimum 540×960; up to 10 minutes, maximum 500 MB, bitrate >= 516 kbps. 1080×1920 is Orbit's target. Spark rules differ. This app's concept brief is not rendered video; safe zone depends on caption, anchor, orientation and region.",
  },
  {
    id: "website-desktop",
    channel: "website",
    name: "Website · desktop hero",
    width: 1600,
    height: 900,
    media: "image",
    verification: "design-goal",
    sources: [],
    note: "Configurable website design goal; no platform-mandated size or file limit is asserted.",
  },
  {
    id: "website-mobile",
    channel: "website",
    name: "Website · mobile hero",
    width: 900,
    height: 1200,
    media: "image",
    verification: "design-goal",
    sources: [],
    note: "Configurable mobile design goal; review responsive crop and readable content on the actual storefront.",
  },
  {
    id: "email-banner",
    channel: "email",
    name: "Email · banner",
    width: 1200,
    height: 600,
    media: "image",
    verification: "design-goal",
    sources: [],
    note: "Configurable email design goal. Client rendering, weight and accessibility require destination-specific review.",
  },
];

export function getPlacement(id: string, brief?: StudioBrief): PlacementSpec {
  const spec = placementSpecs.find((p) => p.id === id);
  if (!spec) throw new Error(`Unknown placement: ${id}`);
  const dimensions =
    id === "website-desktop"
      ? brief?.websiteSize.desktop
      : id === "website-mobile"
        ? brief?.websiteSize.mobile
        : id === "email-banner"
          ? brief?.emailSize
          : undefined;
  return {
    ...spec,
    sources: [...spec.sources],
    ...(dimensions ? { width: dimensions[0], height: dimensions[1] } : {}),
  };
}

const finding = (
  code: string,
  severity: ValidationFinding["severity"],
  message: string,
  field?: string,
): ValidationFinding => ({ code, severity, message, field });

function rasterHeader(
  dataUrl: string,
): { mime: string; width: number; height: number; bytes: number } | undefined {
  const match =
    /^data:(image\/(?:png|jpeg));base64,([A-Za-z0-9+/]+={0,2})$/.exec(dataUrl);
  if (!match || match[2].length > 45000000) return undefined;
  let decoded: string;
  try {
    decoded = atob(match[2]);
  } catch {
    return undefined;
  }
  const b = Uint8Array.from(decoded, (c) => c.charCodeAt(0));
  const view = new DataView(b.buffer);
  if (match[1] === "image/png") {
    if (
      b.length < 33 ||
      ![137, 80, 78, 71, 13, 10, 26, 10].every((n, i) => b[i] === n) ||
      view.getUint32(8) !== 13 ||
      String.fromCharCode(...b.slice(12, 16)) !== "IHDR"
    )
      return undefined;
    return {
      mime: match[1],
      width: view.getUint32(16),
      height: view.getUint32(20),
      bytes: b.length,
    };
  }
  if (b.length < 4 || b[0] !== 255 || b[1] !== 216) return undefined;
  let offset = 2;
  while (offset + 3 < b.length) {
    if (b[offset] !== 255) return undefined;
    while (b[offset] === 255) offset++;
    const marker = b[offset++];
    if (marker === 217 || marker === 218) return undefined;
    if (marker === 1 || (marker >= 208 && marker <= 215)) continue;
    if (offset + 1 >= b.length) return undefined;
    const length = view.getUint16(offset);
    if (length < 2 || offset + length > b.length) return undefined;
    if (
      [
        192, 193, 194, 195, 197, 198, 199, 201, 202, 203, 205, 206, 207,
      ].includes(marker)
    ) {
      if (length < 8) return undefined;
      return {
        mime: match[1],
        height: view.getUint16(offset + 3),
        width: view.getUint16(offset + 5),
        bytes: b.length,
      };
    }
    offset += length;
  }
  return undefined;
}

export function validatePlacement(
  id: string,
  version: StudioVersion,
  brief?: StudioBrief,
): ValidationFinding[] {
  let spec: PlacementSpec;
  try {
    spec = getPlacement(id, brief);
  } catch {
    return [
      finding(
        "placement-unknown",
        "warning",
        `Not checked: ${id} has no verified placement configuration.`,
        "placement",
      ),
    ];
  }
  const result: ValidationFinding[] = [];
  if (spec.verification === "not-checked")
    result.push(
      finding("placement-not-checked", "warning", spec.note, "placement"),
    );
  if (spec.verification === "design-goal")
    result.push(
      finding("placement-design-goal", "info", spec.note, "placement"),
    );
  if (spec.media === "video") {
    result.push(
      finding(
        "video-missing",
        "error",
        "This output has no actual rendered video. A PNG or concept brief does not satisfy TikTok's video placement.",
        "video",
      ),
    );
    result.push(
      finding(
        "video-safe-zone-not-checked",
        "warning",
        "Not checked: duration, codec, bitrate, audio, caption-specific safe zone and platform policy review.",
        "video",
      ),
    );
    return result;
  }
  const raster = version.raster;
  if (!raster)
    return [
      ...result,
      finding(
        "raster-missing",
        "error",
        "A real PNG or JPEG raster is required for this image output.",
        "raster",
      ),
    ];
  if (!["image/png", "image/jpeg"].includes(raster.mime))
    result.push(
      finding(
        "raster-format",
        "error",
        "Use PNG or JPEG. SVG and JSON are supplementary editable files, not these image deliverables.",
        "raster.mime",
      ),
    );
  if (
    !/^data:image\/(?:png|jpeg);base64,/.test(raster.dataUrl) ||
    !raster.dataUrl.startsWith(`data:${raster.mime};base64,`)
  )
    result.push(
      finding(
        "raster-data",
        "error",
        "Raster bytes must have the matching PNG/JPEG data URL type.",
        "raster.dataUrl",
      ),
    );
  const header = rasterHeader(raster.dataUrl);
  if (!header)
    result.push(
      finding(
        "raster-header",
        "error",
        "The PNG/JPEG byte header is missing or malformed.",
        "raster.dataUrl",
      ),
    );
  else if (
    header.mime !== raster.mime ||
    header.width !== raster.width ||
    header.height !== raster.height ||
    header.bytes !== raster.bytes
  )
    result.push(
      finding(
        "raster-metadata",
        "error",
        "Raster dimensions, format and byte length must match the encoded file header.",
        "raster",
      ),
    );
  if (
    !Number.isInteger(raster.width) ||
    !Number.isInteger(raster.height) ||
    raster.width < 1 ||
    raster.height < 1
  )
    result.push(
      finding(
        "raster-dimensions",
        "error",
        "Raster dimensions must be positive integer pixels.",
        "raster",
      ),
    );
  if (!Number.isFinite(raster.bytes) || raster.bytes <= 0)
    result.push(
      finding(
        "raster-bytes",
        "error",
        "The raster byte length must be known and positive.",
        "raster.bytes",
      ),
    );
  if (
    spec.minWidth &&
    spec.minHeight &&
    (raster.width < spec.minWidth || raster.height < spec.minHeight)
  )
    result.push(
      finding(
        "placement-min-dimensions",
        "error",
        `Minimum size is ${spec.minWidth}×${spec.minHeight}; received ${raster.width}×${raster.height}.`,
        "raster",
      ),
    );
  if (
    spec.ratio &&
    Math.abs(raster.width / raster.height - spec.ratio) / spec.ratio > 0.001
  )
    result.push(
      finding(
        "placement-ratio",
        "error",
        `Expected ${spec.ratio === 1 ? "1:1" : spec.ratio === 0.8 ? "4:5" : "1.91:1"} framing for this placement. Orbit allows 0.1% integer-pixel rounding, not a verified platform tolerance.`,
        "raster",
      ),
    );
  if (spec.maxBytes && raster.bytes > spec.maxBytes)
    result.push(
      finding(
        "placement-file-size",
        "error",
        `Maximum file size is ${spec.maxBytes.toLocaleString("en-US")} bytes.`,
        "raster.bytes",
      ),
    );
  if (
    spec.verification !== "verified-measurements" &&
    (raster.width !== spec.width || raster.height !== spec.height)
  )
    result.push(
      finding(
        "design-dimensions",
        "error",
        `This campaign chose ${spec.width}×${spec.height}; raster output is ${raster.width}×${raster.height}. This is a campaign design mismatch, not a platform rejection.`,
        "raster",
      ),
    );
  if (spec.channel === "google")
    result.push(
      finding(
        "platform-review-not-checked",
        "warning",
        "Measured image checks only. Complete asset-group counts, brand-guideline linkage, logos, actual video, final URL and Google policy review are not established by this image check.",
        "placement",
      ),
    );
  return result;
}

/** Google-specific fields only; Meta/TikTok copy never inherits these as universal limits. */
export function validateStudioCopy(
  copy: StudioPlan["copy"],
  channelsOrBrief: Channel[] | StudioBrief = ["google"],
  optionalBrief?: StudioBrief,
  brand?: StudioBrand,
): ValidationFinding[] {
  const brief = Array.isArray(channelsOrBrief)
    ? optionalBrief
    : channelsOrBrief;
  const channels = Array.isArray(channelsOrBrief)
    ? channelsOrBrief
    : channelsOrBrief.channels;
  const constraints: ValidationFinding[] = [];
  const fields = [
    ...(copy.headlines ?? []),
    ...(copy.longHeadlines ?? []),
    ...(copy.descriptions ?? []),
    ...(copy.ctas ?? []),
  ];
  for (const phrase of brief?.requiredPhrases ?? []) {
    if (!phrase.trim()) continue;
    if (!fields.some((field) => field.includes(phrase))) {
      constraints.push(
        finding(
          "required-phrase-missing",
          "error",
          `Required campaign-copy phrase is missing as a complete phrase: “${phrase}”. Website content and metadata do not satisfy this requirement.`,
          "copy",
        ),
      );
    }
  }
  for (const phrase of brief?.prohibitedPhrases ?? [])
    if (
      phrase.trim() &&
      fields.some((field) =>
        field.toLocaleLowerCase().includes(phrase.toLocaleLowerCase()),
      )
    )
      constraints.push(
        finding(
          "prohibited-phrase",
          "error",
          `Campaign copy contains a prohibited phrase: “${phrase}”.`,
          "copy",
        ),
      );
  if (brand && brief) {
    const products = brand.products.filter((p) =>
      brief.productIds.includes(p.id),
    );
    const claimPattern =
      /\b(?:certified organic|organic|certified|guaranteed|cures?|healthy|eco-friendly|sustainable|free shipping|same[- ]day shipping|best ever|five[- ]star)\b/gi;
    for (const field of fields)
      for (const match of field.matchAll(claimPattern)) {
        const claim = match[0].toLocaleLowerCase();
        const named = products.filter((p) =>
          field.toLocaleLowerCase().includes(p.name.toLocaleLowerCase()),
        );
        const relevant = named.length ? named : products;
        if (
          !relevant.length ||
          !relevant.every(
            (p) =>
              p.confirmed &&
              p.facts.some((fact) => fact.toLocaleLowerCase().includes(claim)),
          )
        )
          constraints.push(
            finding(
              "unsupported-copy-claim",
              "error",
              `Confirm a selected product fact supporting “${match[0]}” before using this claim.`,
              "copy",
            ),
          );
      }
  }
  if (!channels.includes("google"))
    return [
      ...constraints,
      finding(
        "copy-platform-not-checked",
        "warning",
        "Placement-specific copy limits are not checked for the selected non-Google channels.",
        "copy",
      ),
    ];
  const result: ValidationFinding[] = [...constraints];
  for (const [field, min, max, maxLength] of [
    ["headlines", 3, 15, 30],
    ["longHeadlines", 1, 5, 90],
    ["descriptions", 2, 5, 90],
  ] as const) {
    const values = copy[field];
    if (!Array.isArray(values) || values.length < min || values.length > max)
      result.push(
        finding(
          "google-copy-count",
          "error",
          `Google ${field}: provide ${min}–${max} fields.`,
          field,
        ),
      );
    for (const [index, value] of (Array.isArray(values)
      ? values
      : []
    ).entries()) {
      if (!value.trim())
        result.push(
          finding(
            "google-copy-empty",
            "error",
            "Copy fields must contain text.",
            `${field}.${index}`,
          ),
        );
      if (adsCharacterCount(value) > maxLength)
        result.push(
          finding(
            "google-copy-length",
            "error",
            `Google ${field} exceed the ${maxLength}-character limit; CJK double-width characters count as 2.`,
            `${field}.${index}`,
          ),
        );
    }
  }
  if (
    !(copy.headlines ?? []).some((h) => h.trim() && adsCharacterCount(h) <= 15)
  )
    result.push(
      finding(
        "google-short-headline",
        "error",
        "Include at least one headline of 15 characters or fewer.",
        "headlines",
      ),
    );
  result.push(
    finding(
      "google-copy-scope",
      "info",
      "Counts and lengths checked against the 2026-10-03 first-party PMax sources. Business name, final URL, selected platform CTA, brand linkage and policy approval require separate review. Recommended quantities 11+/2+/4+ exceed some valid minimums.",
      "copy",
    ),
  );
  if (channels.some((channel) => channel === "meta" || channel === "tiktok"))
    result.push(
      finding(
        "copy-platform-not-checked",
        "warning",
        "Meta/TikTok placement-specific copy remains Not checked; Google limits apply only to the labeled Google fields.",
        "copy",
      ),
    );
  return result;
}

function validDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const timestamp = Date.parse(`${value}T00:00:00Z`);
  return (
    Number.isFinite(timestamp) &&
    new Date(timestamp).toISOString().slice(0, 10) === value
  );
}

/** Campaign gates and Orbit resource bounds, separate from advertising-platform approval. */
export function validateStudioBrief(
  brief: StudioBrief,
  brand: StudioBrand,
): ValidationFinding[] {
  const result: ValidationFinding[] = [];
  const error = (code: string, message: string, field?: string) =>
    result.push(finding(code, "error", message, field));
  if (!brief.title.trim()) error("brief-title", "Name this campaign.", "title");
  if (!brief.description.trim())
    error(
      "brief-description",
      "Describe the campaign before interpreting the plan.",
      "description",
    );
  if (!brief.goal.trim())
    error("brief-goal", "Choose or describe a campaign goal.", "goal");
  for (const [field, max] of [
    ["title", 140],
    ["description", 5000],
    ["goal", 500],
    ["tone", 500],
    ["audience", 1000],
    ["offer", 1000],
    ["feedback", 5000],
  ] as const)
    if (brief[field].length > max)
      error(
        "brief-length",
        `${field} exceeds Orbit's ${max}-character input bound.`,
        field,
      );
  if (!brief.productIds.length)
    error("brief-products", "Select at least one product.", "productIds");
  if (new Set(brief.productIds).size !== brief.productIds.length)
    error("brief-products", "Select each product once.", "productIds");
  for (const id of brief.productIds) {
    const product = brand.products.find((p) => p.id === id);
    if (!product) {
      error(
        "brief-products",
        "A selected product is missing from this brand.",
        "productIds",
      );
      continue;
    }
    if (!product.confirmed || !product.facts.length || !product.photo)
      error(
        "brief-product-confirmation",
        `${product.name} needs confirmed facts and an approved product photo.`,
        "productIds",
      );
    const refs = product.sourceIds.map((sourceId) =>
      brand.sources.find((s) => s.id === sourceId),
    );
    if (
      !refs.length ||
      refs.some((s) => !s || !s.included) ||
      !refs.some((s) => s?.role === "product-fact") ||
      !refs.some((s) => s?.role === "product-photo")
    )
      error(
        "brief-product-reference",
        `Include the factual record and approved photo reference for ${product.name}.`,
        "sources",
      );
  }
  if (!brief.channels.length)
    error("brief-channels", "Select at least one channel.", "channels");
  if (
    new Set(brief.channels).size !== brief.channels.length ||
    brief.channels.some(
      (c) => !["google", "meta", "tiktok", "website", "email"].includes(c),
    )
  )
    error("brief-channels", "Use unique supported channels.", "channels");
  if (!brief.placementIds.length)
    error(
      "brief-placements",
      "Select the actual placement targets.",
      "placementIds",
    );
  for (const id of brief.placementIds) {
    const spec = placementSpecs.find((p) => p.id === id);
    if (!spec)
      error(
        "brief-placement-unknown",
        "This placement has no configured output target.",
        "placementIds",
      );
    else if (!brief.channels.includes(spec.channel))
      error(
        "brief-placement-channel",
        `Enable ${spec.channel} or remove its ${spec.name} target.`,
        "placementIds",
      );
  }
  for (const channel of brief.channels)
    if (
      !brief.placementIds.some(
        (id) => placementSpecs.find((p) => p.id === id)?.channel === channel,
      )
    )
      error(
        "brief-channel-placement",
        `Choose an actual ${channel} placement.`,
        "placementIds",
      );
  for (const [field, dimensions] of [
    ["website.desktop", brief.websiteSize.desktop],
    ["website.mobile", brief.websiteSize.mobile],
    ["email", brief.emailSize],
  ] as const)
    if (dimensions.some((n) => !Number.isInteger(n) || n < 1 || n > 4096))
      error(
        "brief-design-size",
        "Choose whole-pixel design dimensions from 1 to 4096. This is Orbit's rendering bound, not a platform specification.",
        field,
      );
  for (const [field, start, end] of [
    ["dates", brief.dates.start, brief.dates.end],
    ["budget.period", brief.budget.periodStart, brief.budget.periodEnd],
  ] as const) {
    if ((start && !validDate(start)) || (end && !validDate(end)))
      error("brief-date", "Use valid calendar dates.", field);
    if (Boolean(start) !== Boolean(end))
      error(
        "brief-date-range",
        "Supply both start and end dates, or leave the optional period empty.",
        field,
      );
    if (start && end && validDate(start) && validDate(end) && start > end)
      error(
        "brief-date-order",
        "The end date must be on or after the start date.",
        field,
      );
  }
  const budget = brief.budget;
  if (!/^[A-Z]{3}$/.test(budget.currency))
    error(
      "budget-currency",
      "Use a three-letter currency code.",
      "budget.currency",
    );
  if (!["daily", "lifetime"].includes(budget.intent))
    error(
      "budget-intent",
      "Choose daily or lifetime budget intent.",
      "budget.intent",
    );
  if (
    budget.total !== null &&
    (!Number.isFinite(budget.total) ||
      budget.total < 0 ||
      budget.total > 1000000000)
  )
    error(
      "budget-total",
      "Budget must be a nonnegative amount within Orbit's planning bound.",
      "budget.total",
    );
  const allocations = Object.entries(budget.allocations).filter(
    ([, value]) => value !== null && value !== undefined,
  );
  for (const [channel, value] of allocations) {
    if (!Number.isFinite(value) || Number(value) < 0)
      error(
        "budget-allocation",
        "Channel allocations must be nonnegative amounts.",
        "budget.allocations",
      );
    if (!brief.channels.includes(channel as Channel))
      error(
        "budget-allocation-channel",
        "Allocate budget only to selected channels.",
        "budget.allocations",
      );
  }
  if (allocations.length) {
    if (budget.total === null)
      error(
        "budget-allocation-total",
        "Set the total before allocating channel amounts.",
        "budget.total",
      );
    else if (
      Math.abs(
        allocations.reduce((sum, [, value]) => sum + Number(value), 0) -
          budget.total,
      ) > 0.005
    )
      error(
        "budget-allocation-sum",
        "Channel allocations must add up to the total using the same daily or lifetime basis.",
        "budget.allocations",
      );
  }
  for (const field of ["targetCpa", "targetRoas"] as const)
    if (
      budget[field] != null &&
      (!Number.isFinite(budget[field]) || Number(budget[field]) <= 0)
    )
      error(
        "budget-target",
        "Optional planning targets must be positive numbers.",
        `budget.${field}`,
      );
  if (
    budget.marginPercent != null &&
    (!Number.isFinite(budget.marginPercent) ||
      budget.marginPercent < 0 ||
      budget.marginPercent > 100)
  )
    error(
      "budget-margin",
      "Optional margin assumptions must be from 0 to 100 percent.",
      "budget.marginPercent",
    );
  for (const phrase of brief.requiredPhrases.filter((p) => p.trim())) {
    if (brief.channels.includes("google") && adsCharacterCount(phrase) > 90)
      error(
        "required-phrase-length",
        "A required campaign-copy phrase exceeds Google's 90-character long-copy limit. Use it as a website body note instead, or shorten the requirement; it will not be truncated.",
        "requiredPhrases",
      );
    if (
      brief.prohibitedPhrases.some(
        (p) =>
          p.trim() &&
          phrase.toLocaleLowerCase().includes(p.toLocaleLowerCase()),
      )
    )
      error(
        "phrase-conflict",
        "A required phrase contains a prohibited phrase. Resolve the conflict before creating assets.",
        "requiredPhrases",
      );
  }
  if (brief.phraseScope && brief.phraseScope !== "campaign-copy")
    error(
      "phrase-scope",
      "This release supports required phrases in actual campaign ad-copy fields. Choose campaign-copy scope.",
      "phraseScope",
    );
  return result;
}
