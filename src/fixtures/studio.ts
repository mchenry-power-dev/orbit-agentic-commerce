import { fingerprint } from "../domain";
import type {
  StudioBrand,
  StudioBrief,
  StudioPlan,
  StudioState,
} from "../domain/studio";
import { studioAdsCharacterCount as adsCharacterCount } from "../validation/placements";
import { cosmicCatSnapshot } from "./cosmic-cat";

export function cosmicBrand(): StudioBrand {
  return {
    id: cosmicCatSnapshot.id,
    name: cosmicCatSnapshot.name,
    website: cosmicCatSnapshot.site,
    tagline: cosmicCatSnapshot.tagline,
    palette: [...cosmicCatSnapshot.palette],
    tone: cosmicCatSnapshot.tone,
    ownership: "owner-authorized-snapshot",
    products: cosmicCatSnapshot.products.map((p) => ({
      id: p.id,
      name: p.name,
      description: p.description,
      facts: [...p.facts],
      size: p.size,
      photo: p.photoPath,
      sourceIds: [...p.sourceIds],
      confirmed: true,
    })),
    sources: cosmicCatSnapshot.references.map((r) => ({
      id: r.id,
      url: r.sourceUrl,
      retrievedAt: r.retrievedAt,
      role: r.role,
      title: r.title,
      included: r.id !== "cosmic-gifting-inspiration",
      text: r.text,
      image: r.path,
    })),
  };
}

export function freshBrief(brand: StudioBrand = cosmicBrand()): StudioBrief {
  return {
    title: "",
    description: "",
    goal: "Introduce the collection",
    productIds: brand.products.slice(0, 1).map((p) => p.id),
    channels: ["google", "meta", "website"],
    placementIds: [
      "google-square",
      "google-landscape",
      "google-portrait",
      "meta-feed",
      "website-desktop",
      "website-mobile",
    ],
    audience: "",
    offer: "",
    tone: "",
    keywords: [],
    requiredPhrases: [],
    prohibitedPhrases: [],
    budget: {
      currency: "USD",
      periodStart: "",
      periodEnd: "",
      intent: "lifetime",
      total: null,
      allocations: {},
    },
    dates: { start: "", end: "" },
    websiteSize: { desktop: [1600, 900], mobile: [900, 1200] },
    emailSize: [1200, 600],
    feedback: "",
  };
}

export function christmasSampleBrief(
  brand: StudioBrand = cosmicBrand(),
): StudioBrief {
  return {
    ...freshBrief(brand),
    title: "Coffee, wrapped in Christmas warmth",
    description:
      "Create a vibrant Christmas coffee gifting campaign with festive lights and warm photography. Preserve the original Cosmic Cat packaging. Show two coordinated creative directions and adapt each for Google Performance Max, Meta feed and website heroes.",
    productIds: brand.products
      .filter((p) => p.id === "cosmic-solar-surge")
      .map((p) => p.id),
    audience: "Coffee lovers choosing Christmas gifts",
    tone: "Warm, vibrant and festive",
    keywords: ["Christmas", "coffee gifting", "festive lights"],
    prohibitedPhrases: ["guaranteed", "best ever"],
  };
}

const negativeHoliday =
  /\b(?:no|not|without|avoid|exclude|remove)\s+(?:any\s+)?(?:holiday|christmas|festive|winter|xmas)(?:\s+(?:motifs|elements|imagery|decorations|lights|themes))?/gi;
const festiveWords =
  /\b(christmas|xmas|yuletide|festive|holiday|winter|twinkling|fairy lights|gift(?:ing|s)?)\b/i;
const summerWords =
  /\b(summer|beach|coastal|sunlit|cool|icy|ice blue|minimal(?:ist)?|clean lines)\b/i;

/** Bounded local interpretation for photo composition; arbitrary semantic work requires the service. */
export function interpretLocalBrief(
  brief: StudioBrief,
  brand: StudioBrand,
  prefs: StudioState["preferences"] = { generousSpace: true, tone: "" },
): StudioPlan {
  const current = [
    brief.description,
    brief.tone,
    brief.feedback,
    ...brief.keywords,
  ].join(" ");
  const excludesHoliday = negativeHoliday.test(current);
  negativeHoliday.lastIndex = 0;
  const withoutNegations = current.replace(negativeHoliday, " ");
  const festive = festiveWords.test(withoutNegations) && !excludesHoliday;
  const cool = summerWords.test(withoutNegations) || excludesHoliday;
  const mood = festive ? "festive" : cool ? "cool" : "editorial";
  const theme = festive
    ? "Vibrant Christmas coffee gifting"
    : cool
      ? "Minimal coffee, cool summer light"
      : "Coffee in focus";
  const products = brand.products.filter((p) =>
    brief.productIds.includes(p.id),
  );
  const conflicts: string[] = [];
  if (!products.length)
    conflicts.push("Select at least one confirmed product.");
  if (products.some((p) => !p.confirmed || !p.photo))
    conflicts.push(
      "Selected products need confirmed facts and an approved photo.",
    );
  if (brief.productIds.some((id) => !products.some((p) => p.id === id)))
    conflicts.push("A selected product is missing from this brand.");
  if (excludesHoliday && festiveWords.test(withoutNegations))
    conflicts.push(
      "The brief both requests and excludes holiday imagery. Confirm which instruction applies.",
    );
  if (excludesHoliday && products.some((p) => p.id === "cosmic-candy-cane"))
    conflicts.push(
      "Candy Cane's protected original photo contains festive lights. Supply an approved alternative photo to satisfy a no-holiday instruction.",
    );
  if (!brief.description.trim())
    conflicts.push("Add a campaign description before confirming the plan.");
  const audience =
    brief.audience.trim() || "People exploring the selected products";
  const selectedNames = products.map((p) => p.name).join(" & ");
  const productFacts = products
    .map((p) => `${p.name}: ${p.description}`)
    .join(" ");
  const offer = brief.offer.trim();
  if (
    /\b(free shipping|discount|save \d|\d+% off|sale|guaranteed|certified|cures?|healthy|best ever|five[- ]star)\b/i.test(
      offer,
    )
  )
    conflicts.push(
      "This offer or claim is not established by the snapshot. Confirm its evidence before use.",
    );
  const excluded =
    excludesHoliday || cool
      ? [
          "holiday decorations",
          "Christmas lights",
          "red-and-green festive accents",
        ]
      : [];
  const palette = festive
    ? ["#421218", "#f4bf54", "#116348", "#fff2d5"]
    : cool
      ? ["#e5f4f7", "#164451", "#ffffff", "#60b7cb"]
      : [...brand.palette];
  const title = festive
    ? "Coffee for Christmas"
    : cool
      ? "A Fresh Coffee Moment"
      : "Coffee, in Good Company";
  const baseBody = festive
    ? `Make room for warm coffee moments. Explore ${selectedNames}.`
    : cool
      ? `Clear space for your next coffee ritual. Explore ${selectedNames}.`
      : `Meet ${selectedNames} from ${brand.name}.`;
  const body = offer ? `${baseBody} ${offer}` : baseBody;
  const tone =
    brief.tone.trim() || brand.tone || prefs.tone || "Warm and clear";
  const copy: StudioPlan["copy"] = {
    headlines: [
      title,
      festive
        ? "Festive Coffee Gifts"
        : cool
          ? "Keep It Fresh"
          : "Find Your Coffee",
      "Coffee Moments",
      "Explore the Collection",
      "A Cup to Enjoy",
    ],
    longHeadlines: [
      festive
        ? "Bring a little Christmas warmth to your coffee gifting"
        : cool
          ? "Discover coffee in a fresh, minimal summer setting"
          : "Explore the selected coffee collection and find your next coffee moment",
    ],
    descriptions: [
      festive
        ? "Give your coffee ritual a festive moment. Explore the selected collection."
        : cool
          ? "A cool palette and clear space frame your next coffee moment."
          : "Explore the selected collection and make time for a coffee moment.",
      ...products.map(
        (p) =>
          `${p.name}. ${p.facts.filter((f) => /^Medium roast|^Flavor notes/.test(f)).join(". ")}.`,
      ),
      "Explore the product details and choose the coffee that suits your ritual.",
      "Original product photography keeps the coffee and its packaging in focus.",
    ].slice(0, 5),
    ctas: ["Shop Coffee"],
  };
  while (copy.descriptions.length < 4)
    copy.descriptions.push(
      "Explore the selected coffee and its verified product details.",
    );
  if (offer) {
    if (!brief.channels.includes("google") || adsCharacterCount(offer) <= 90)
      copy.descriptions[0] = offer;
    else
      conflicts.push(
        "The complete offer exceeds Google's 90-character description limit. Edit it before creating ad-copy fields; it will not be truncated.",
      );
  }
  for (const phrase of brief.requiredPhrases.filter((p) => p.trim())) {
    if (
      brief.prohibitedPhrases.some(
        (p) =>
          p.trim() &&
          phrase.toLocaleLowerCase().includes(p.toLocaleLowerCase()),
      )
    ) {
      conflicts.push(
        `Required phrase conflicts with a prohibited phrase: “${phrase}”.`,
      );
      continue;
    }
    if (!brief.channels.includes("google") || adsCharacterCount(phrase) <= 90) {
      if (copy.longHeadlines.length < 5) copy.longHeadlines.push(phrase);
      else if (copy.descriptions.length < 5) copy.descriptions.push(phrase);
      else
        conflicts.push(
          `No available long-copy field can preserve the complete required phrase: “${phrase}”.`,
        );
    } else
      conflicts.push(
        `Required campaign-copy phrase exceeds Google's 90-character long-copy limit: “${phrase}”. Use it as a website body note instead, or shorten the requirement; it will not be truncated.`,
      );
  }
  const prohibited = brief.prohibitedPhrases.filter((p) => p.trim());
  const visibleCopy = [
    ...copy.headlines,
    ...copy.longHeadlines,
    ...copy.descriptions,
    body,
    productFacts,
    offer,
  ]
    .join(" ")
    .toLocaleLowerCase();
  for (const phrase of prohibited)
    if (visibleCopy.includes(phrase.toLocaleLowerCase()))
      conflicts.push(
        `Generated local copy contains a prohibited phrase: “${phrase}”. Edit the plan before creating assets.`,
      );
  const selectedSources = brand.sources.filter(
    (s) =>
      s.included &&
      (s.role === "page" ||
        s.role === "visual-inspiration" ||
        products.some((p) => p.sourceIds.includes(s.id))),
  );
  const limitations =
    "Local photo composition applies only bounded Christmas/gifting, summer/cool, and editorial cues. It preserves selected original photos, changes framing, palette and copy, and does not create a new photographed scene. Arbitrary free-text semantics require a configured planning service; review and edit this interpretation.";
  const directions: StudioPlan["directions"] = [
    {
      id: "direction-1",
      name: festive
        ? "Lights & gifting"
        : cool
          ? "Cool morning"
          : "Editorial spotlight",
      theme,
      scene: festive
        ? "Warm festive border with small Christmas light accents around the intact product photo."
        : cool
          ? "Airy cool-color frame around the intact product photo; no holiday decoration."
          : "Brand-color editorial frame around the intact product photo.",
      palette,
      mood,
      composition: "product-right",
      headline: title,
      body,
      cta: "Shop Coffee",
      excludedMotifs: excluded,
    },
    {
      id: "direction-2",
      name: festive
        ? "Christmas coffee ritual"
        : cool
          ? "Summer stillness"
          : "Centered coffee ritual",
      theme,
      scene: festive
        ? "Centered original product photo with warm gold light accents and a generous festive frame."
        : cool
          ? "Centered original product photo, pale blue framing and restrained graphic accents."
          : "Centered original product photo with generous surrounding space.",
      palette: [palette[2], palette[1], palette[0], palette[3]],
      mood,
      composition: "product-center",
      headline: festive
        ? "Festive Coffee Gifts"
        : cool
          ? "Keep It Fresh"
          : "Coffee Moments",
      body,
      cta: "Explore Coffee",
      excludedMotifs: excluded,
    },
  ];
  const result: StudioPlan = {
    id: `plan-${fingerprint({ brief, brand, prefs })}`,
    mode: "local-composition",
    theme,
    audience,
    offer,
    interpretation: `${theme}. Tone: ${tone}. Goal: ${brief.goal}. ${offer ? `User-supplied offer (requires confirmation): ${offer}. ` : "No offer supplied. "}${limitations} Required campaign-copy phrases use complete ad-copy fields; website and product metadata do not satisfy them. Headline text is never truncated to force a phrase in. Ad budget is a planning input only; it is not generation cost or a spending action.`,
    directions,
    conflicts,
    confirmed: false,
    ...{ generousSpace: prefs.generousSpace },
    sourceIds: selectedSources.map((s) => s.id),
    placements: [...new Set(brief.placementIds)],
    copy,
    landing: {
      title,
      body,
      cta: "Shop Coffee",
      sections: [
        {
          title: "Meet the coffee",
          body:
            productFacts || "Confirm product facts before creating content.",
        },
        {
          title: festive
            ? "A festive coffee moment"
            : cool
              ? "Room for a fresh ritual"
              : "Your next coffee ritual",
          body: `${body}${offer ? ` ${offer}` : ""}`,
        },
        {
          title: "Explore the details",
          body: "Review the product details on the brand's storefront before purchasing.",
        },
      ],
    },
    video: {
      title: `${theme} · video concept`,
      script: `Open on the approved product photo. ${body} Close with ${selectedNames} and a Shop Coffee call to action.`,
      shots: [
        "Approved product photo, full packaging visible",
        festive
          ? "Warm festive graphic light accents"
          : cool
            ? "Cool minimal graphic frame"
            : "Brand-color graphic frame",
        "Product detail and call-to-action end card",
      ],
      missingChecks: [
        "No rendered video",
        "Audio and motion not checked",
        "Platform safe-zone template not checked",
        "Platform policy approval not checked",
      ],
    },
  };
  const coffeeProducts = products.some((p) =>
    /\bcoffee\b/i.test([p.name, p.description, ...p.facts].join(" ")),
  );
  if (!coffeeProducts) {
    const generalized = (text: string) =>
      text
        .replace(/\bcoffee\b/gi, (word) =>
          word[0] === "C" ? "Collection" : "collection",
        )
        .replace(/\bcup\b/gi, "product");
    result.theme = generalized(result.theme);
    result.interpretation = generalized(result.interpretation);
    for (const direction of result.directions) {
      direction.name = generalized(direction.name);
      direction.theme = generalized(direction.theme);
      direction.scene = generalized(direction.scene);
      direction.headline = generalized(direction.headline);
      direction.body = generalized(direction.body);
      direction.cta = "Shop Products";
    }
    result.copy.headlines = result.copy.headlines.map(generalized);
    if (!result.copy.headlines.some((h) => adsCharacterCount(h) <= 15))
      result.copy.headlines[2] = "Meet the Range";
    result.copy.longHeadlines = result.copy.longHeadlines.map((text) =>
      brief.requiredPhrases.includes(text) ? text : generalized(text),
    );
    result.copy.descriptions = result.copy.descriptions.map((text) =>
      brief.requiredPhrases.includes(text) || text === offer
        ? text
        : generalized(text),
    );
    result.copy.ctas = ["Shop Products"];
    result.landing.title = generalized(result.landing.title);
    result.landing.body = generalized(result.landing.body);
    result.landing.cta = "Shop Products";
    result.landing.sections = result.landing.sections.map((section) => ({
      title: generalized(section.title),
      body: generalized(section.body),
    }));
    result.video.title = generalized(result.video.title);
    result.video.script = generalized(result.video.script);
    result.video.shots = result.video.shots.map(generalized);
  }
  return result;
}
