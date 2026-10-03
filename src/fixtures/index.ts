import type {
  CampaignBrief,
  Merchant,
  ContextSnapshot,
  ContextReference,
  Preferences,
  Blueprint,
  AssetSpec,
} from "../domain";
import { fingerprint } from "../domain";

export const presets: Merchant[] = [
  {
    id: "aster-coffee",
    name: "Aster Coffee Works",
    category: "coffee",
    site: "https://astercoffee.example",
    tagline: "A quieter kind of coffee break",
    brandRules: [
      "Use warm cream, midnight blue and copper.",
      "Keep packaging names and sizes unchanged.",
      "Make no health, certification, review or scarcity claims.",
    ],
    pageContent:
      "Explore our two fictional specialty coffees. Product information comes from the bundled sample catalog.",
    products: [
      {
        id: "aster-dawn",
        name: "Dawn Blend",
        category: "Whole bean coffee",
        size: "250 g",
        color: "#ce744c",
        facts: [
          "Whole bean coffee",
          "Medium roast",
          "Tasting notes: cocoa and orange",
          "250 g bag",
        ],
        description:
          "A medium roast whole bean coffee with tasting notes of cocoa and orange.",
        packageLabel: [
          "ASTER",
          "DAWN BLEND",
          "WHOLE BEAN",
          "MEDIUM ROAST",
          "250 g",
        ],
      },
      {
        id: "aster-dusk",
        name: "Dusk Roast",
        category: "Whole bean coffee",
        size: "250 g",
        color: "#485678",
        facts: [
          "Whole bean coffee",
          "Dark roast",
          "Tasting notes: cacao and toasted almond",
          "250 g bag",
        ],
        description:
          "A dark roast whole bean coffee with tasting notes of cacao and toasted almond.",
        packageLabel: [
          "ASTER",
          "DUSK ROAST",
          "WHOLE BEAN",
          "DARK ROAST",
          "250 g",
        ],
      },
    ],
  },
  {
    id: "harbor-home",
    name: "Harbor Home Goods",
    category: "household",
    site: "https://harborhome.example",
    tagline: "Simple essentials for everyday spaces",
    brandRules: [
      "Use soft cream, pine green and terracotta.",
      "Keep packaging names and sizes unchanged.",
      "Make no disinfecting, safety, environmental or performance claims.",
    ],
    pageContent:
      "Two fictional household essentials with clear material and pack information.",
    products: [
      {
        id: "harbor-cloths",
        name: "Everyday Cloths",
        category: "Household cloths",
        size: "3 cloths",
        color: "#477363",
        facts: [
          "Cotton cloths",
          "Set of 3",
          "30 × 30 cm each",
          "Machine washable",
        ],
        description:
          "A set of three machine washable cotton cloths, each measuring 30 × 30 cm.",
        packageLabel: [
          "HARBOR",
          "EVERYDAY CLOTHS",
          "COTTON",
          "SET OF 3",
          "30 × 30 cm",
        ],
      },
      {
        id: "harbor-brush",
        name: "Kitchen Brush",
        category: "Household brush",
        size: "1 brush",
        color: "#b2704f",
        facts: ["Beechwood handle", "Nylon bristles", "One brush per pack"],
        description:
          "A kitchen brush with a beechwood handle and nylon bristles. One brush per pack.",
        packageLabel: [
          "HARBOR",
          "KITCHEN BRUSH",
          "BEECHWOOD HANDLE",
          "NYLON BRISTLES",
          "1 brush",
        ],
      },
    ],
  },
];
export function getMerchant(id: string): Merchant {
  const merchant = presets.find((item) => item.id === id);
  if (!merchant) throw new Error("Unknown sample merchant.");
  return merchant;
}
export function createSampleBrief(merchantId = presets[0].id): CampaignBrief {
  const merchant = getMerchant(merchantId);
  return {
    merchantId,
    title:
      merchant.category === "coffee"
        ? "A softer start to autumn"
        : "Everyday essentials, thoughtfully arranged",
    goal: "Introduce the collection",
    productIds: merchant.products.map((product) => product.id),
    audience:
      merchant.category === "coffee"
        ? "Curious home coffee drinkers"
        : "People refreshing everyday household essentials",
    direction:
      merchant.category === "coffee"
        ? "An autumn coffee ritual with warm light and generous space."
        : "Quiet everyday routines with simple materials and generous space.",
    tone: "Calm and inviting",
    keywords:
      merchant.category === "coffee"
        ? ["coffee", "autumn ritual"]
        : ["home essentials", "everyday routine"],
    requiredPhrases: [],
    prohibitedPhrases: ["best ever", "guaranteed"],
    quantities: { headlines: 5, longHeadlines: 1, descriptions: 4, ctas: 3 },
  };
}
export function buildContext(
  brief: CampaignBrief,
  excludedIds: string[] = [],
): ContextSnapshot {
  const merchant = getMerchant(brief.merchantId);
  const references: ContextReference[] = merchant.products
    .filter((product) => brief.productIds.includes(product.id))
    .flatMap((product) => [
      {
        id: `product:${product.id}`,
        type: "product" as const,
        title: `${product.name} · factual record`,
        reason: "Selected product: factual constraints for every output.",
        required: true,
        productId: product.id,
        text: [product.description, ...product.facts].join("\n"),
      },
      {
        id: `image:${product.id}`,
        type: "image" as const,
        title: `${product.name} · original package reference`,
        reason:
          "Selected product: stable packaging reference for vector compositions.",
        required: true,
        productId: product.id,
        text: product.packageLabel.join(" · "),
      },
    ]);
  references.push({
    id: `brand:${merchant.id}`,
    type: "brand",
    title: "Brand rules",
    reason: "Bundled fictional brand guidance.",
    required: false,
    text: merchant.brandRules.join("\n"),
  });
  references.push({
    id: `page:${merchant.id}`,
    type: "page",
    title: "Existing collection page",
    reason: "Bundled page copy provides collection context.",
    required: false,
    text: merchant.pageContent,
  });
  const excluded = [...new Set(excludedIds)].filter((id) =>
    references.some((reference) => reference.id === id),
  );
  const selectedIds = references
    .filter((reference) => !excluded.includes(reference.id))
    .map((reference) => reference.id);
  return {
    references,
    excludedIds: excluded,
    selectedIds,
    fingerprint: fingerprint({ references, selectedIds }),
  };
}
export function planCampaign(
  brief: CampaignBrief,
  context: ContextSnapshot,
  revision: number,
  preferences: Preferences,
): Blueprint {
  const dimensions = [
    [1200, 1200],
    [1200, 628],
    [960, 1200],
    [1200, 1200],
    [1200, 628],
    [960, 1200],
  ];
  const treatments = [
    "Orbital still life",
    "Editorial split",
    "Quiet pedestal",
    "Geometric collage",
    "Horizon study",
    "Typographic frame",
  ];
  const specs: AssetSpec[] = dimensions.map(([width, height], i) => ({
    id: `image-${i + 1}`,
    kind: "image",
    title: `${treatments[i]} · ${width === height ? "square" : width > height ? "landscape" : "portrait"}`,
    purpose: `Coordinated ${treatments[i].toLowerCase()} composition; SVG concept for review.`,
    required: true,
    sourceReferenceIds: context.selectedIds,
    width,
    height,
    treatment: treatments[i],
  }));
  specs.push(
    ...(["copy", "landing", "video", "blueprint"] as const).map((kind) => ({
      id: kind,
      kind,
      title: {
        copy: "Campaign copy",
        landing: "Landing-page content",
        video: "Video concept brief",
        blueprint: "Blueprint and checklist",
      }[kind],
      purpose: {
        copy: "Review-oriented PMax copy and storefront suggestions.",
        landing: "Responsive preview content, ready for merchant review.",
        video: "A script and shot plan, not a rendered video.",
        blueprint: "Campaign intent and a practical implementation checklist.",
      }[kind],
      required: true,
      sourceReferenceIds: context.selectedIds,
    })),
  );
  return {
    sourceRevision: revision,
    summary: `${brief.goal} for ${brief.audience}. ${brief.direction}`,
    goal: brief.goal,
    audience: brief.audience,
    direction: brief.direction,
    tone: brief.tone || preferences.preferredTone,
    offer: brief.offer,
    keywords: brief.keywords ?? [],
    instructions: [
      `Campaign direction (free text): ${brief.direction}`,
      `Required phrases: ${(brief.requiredPhrases ?? []).join(", ") || "None"}`,
      `Prohibited phrases: ${(brief.prohibitedPhrases ?? []).join(", ") || "None"}`,
      "The demo uses structured fields and deterministic rules; arbitrary free-text instructions are recorded for review.",
    ],
    preferenceNotes: [
      preferences.avoidCrowdedCompositions
        ? "Preference reused: generous spacing and no more than two packages per image."
        : "Preference reused: fuller geometric compositions.",
      `Preference reused: ${preferences.preferredTone}.`,
    ],
    specs,
  };
}
