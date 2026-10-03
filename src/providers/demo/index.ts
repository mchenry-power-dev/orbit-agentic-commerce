import type {
  AssetContent,
  AssetSpec,
  Campaign,
  Merchant,
  Preferences,
  Product,
} from "../../domain";
import { getMerchant } from "../../fixtures";
import { escapeXml } from "../../validation";
import { channelSpecs } from "../../validation/channel-specs";

export interface GenerationRequest {
  campaign: Campaign;
  spec: AssetSpec;
  versionNumber: number;
  revisionNote?: string;
  preferences: Preferences;
  signal: AbortSignal;
}
export interface GenerationProvider {
  readonly name: string;
  generate(request: GenerationRequest): Promise<AssetContent>;
}
export function delay(
  milliseconds: number,
  signal: AbortSignal,
): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(new DOMException("Run interrupted.", "AbortError"));
      return;
    }
    const done = () => {
      signal.removeEventListener("abort", abort);
      resolve();
    };
    const timer = setTimeout(done, milliseconds);
    const abort = () => {
      clearTimeout(timer);
      signal.removeEventListener("abort", abort);
      reject(new DOMException("Run interrupted.", "AbortError"));
    };
    signal.addEventListener("abort", abort, { once: true });
  });
}
const shorten = (text: string, length: number): string =>
  [...text.trim()].slice(0, length).join("").trim();
const distribute = (values: string[], count: number): string[] =>
  Array.from({ length: count }, (_, i) => values[i % values.length]);
function packageSvg(
  product: Product,
  x: number,
  y: number,
  width: number,
  height: number,
  merchant: Merchant,
): string {
  const label = product.packageLabel;
  const lineGap = height * 0.115;
  return `<g transform="translate(${x} ${y})"><ellipse cx="${width / 2}" cy="${height + 15}" rx="${width * 0.59}" ry="${height * 0.05}" fill="#171b32" opacity=".13"/><path d="M${width * 0.1} 0 H${width * 0.9} L${width} ${height} H0 Z" fill="${product.color}"/><path d="M${width * 0.1} 0 H${width * 0.9} L${width * 0.88} ${height * 0.095} H${width * 0.12} Z" fill="#202238" opacity=".25"/><rect x="${width * 0.1}" y="${height * 0.23}" width="${width * 0.8}" height="${height * 0.52}" rx="4" fill="#f7efe0"/>${label.map((line, i) => `<text x="${width / 2}" y="${height * 0.33 + i * lineGap}" text-anchor="middle" fill="#26263b" font-family="system-ui,sans-serif" font-size="${i === 0 ? width * 0.1 : i === 1 ? width * 0.077 : width * 0.054}" font-weight="${i < 2 ? 700 : 500}" letter-spacing="${i === 0 ? 2 : 0.5}">${escapeXml(line)}</text>`).join("")}<text x="${width / 2}" y="${height * 0.9}" text-anchor="middle" fill="#fff8e9" font-family="system-ui,sans-serif" font-size="${width * 0.038}">${merchant.category === "coffee" ? "SAMPLE COFFEE COLLECTION" : "SAMPLE HOME COLLECTION"}</text></g>`;
}
function image(
  request: GenerationRequest,
  merchant: Merchant,
  products: Product[],
): AssetContent {
  const { spec, campaign, versionNumber, preferences } = request;
  const width = spec.width!,
    height = spec.height!,
    unit = Math.min(width, height),
    index = Number(spec.id.split("-")[1]) - 1;
  const color = merchant.category === "coffee" ? "#cc7850" : "#6b8b77",
    ink = merchant.category === "coffee" ? "#252840" : "#24463c";
  const shift = (versionNumber - 1) * unit * 0.012;
  let decoration = "";
  let textX = width * 0.065,
    textY = height * 0.15;
  let packageY = height * 0.38,
    packageHeight = unit * 0.49,
    packageWidth = packageHeight * 0.58;
  switch (index) {
    case 0:
      decoration = `<circle cx="${width * 0.52}" cy="${height * 0.58}" r="${unit * 0.36}" fill="${color}" opacity=".17"/><circle cx="${width * 0.55}" cy="${height * 0.54}" r="${unit * 0.37}" fill="none" stroke="${color}" stroke-width="2"/><path d="M0 ${height * 0.84} Q${width * 0.55} ${height * 0.74} ${width} ${height * 0.88} V${height} H0Z" fill="#e8d9c0"/>`;
      break;
    case 1:
      decoration = `<rect x="${width * 0.48}" width="${width * 0.52}" height="${height}" fill="${ink}"/><circle cx="${width * 0.79}" cy="${height * 0.47}" r="${unit * 0.41}" fill="${color}" opacity=".52"/>`;
      packageY = height * 0.23;
      packageHeight = height * 0.62;
      packageWidth = packageHeight * 0.55;
      textY = height * 0.21;
      break;
    case 2:
      decoration = `<rect x="${width * 0.11}" y="${height * 0.24}" width="${width * 0.78}" height="${height * 0.57}" rx="${unit * 0.39}" fill="#ded2bd"/><ellipse cx="${width * 0.5}" cy="${height * 0.84}" rx="${width * 0.38}" ry="${height * 0.045}" fill="${ink}"/><path d="M${width * 0.12} ${height * 0.84}H${width * 0.88}V${height}H${width * 0.12}Z" fill="${color}"/>`;
      packageY = height * 0.35;
      packageHeight = unit * 0.55;
      packageWidth = packageHeight * 0.55;
      break;
    case 3:
      decoration = `<path d="M0 ${height * 0.5} L${width * 0.5} 0 H${width} V${height} H0Z" fill="${ink}"/><circle cx="${width * 0.81}" cy="${height * 0.23}" r="${unit * 0.19}" fill="${color}"/><rect x="${width * 0.06}" y="${height * 0.26}" width="${unit * 0.25}" height="${unit * 0.25}" transform="rotate(-12 ${width * 0.18} ${height * 0.38})" fill="#d5c4a6"/>`;
      textY = height * 0.16;
      break;
    case 4:
      decoration = `<rect y="${height * 0.53}" width="${width}" height="${height * 0.47}" fill="#d8c9b4"/><circle cx="${width * 0.73}" cy="${height * 0.4}" r="${unit * 0.3}" fill="${color}" opacity=".65"/><path d="M0 ${height * 0.76} Q${width * 0.55} ${height * 0.5} ${width} ${height * 0.75}" fill="none" stroke="${ink}" stroke-width="2"/>`;
      packageY = height * 0.2;
      packageHeight = height * 0.66;
      packageWidth = packageHeight * 0.55;
      textY = height * 0.2;
      break;
    default:
      decoration = `<rect x="${width * 0.035}" y="${height * 0.027}" width="${width * 0.93}" height="${height * 0.946}" fill="none" stroke="${ink}" stroke-width="2"/><text x="${width * 0.075}" y="${height * 0.3}" fill="${color}" opacity=".18" font-family="system-ui,sans-serif" font-size="${width * 0.36}" font-weight="700">${merchant.category === "coffee" ? "DAILY" : "HOME"}</text><circle cx="${width * 0.75}" cy="${height * 0.73}" r="${unit * 0.22}" fill="#ddd1bd"/>`;
      packageY = height * 0.38;
      packageHeight = unit * 0.55;
      packageWidth = packageHeight * 0.54;
      break;
  }
  const label = campaign.brief.goal.toLowerCase().includes("launch")
    ? "MEET THE COLLECTION"
    : merchant.category === "coffee"
      ? "A MOMENT, WELL MADE"
      : "EVERYDAY, CONSIDERED";
  if (/more space|spac(?:e|ing)|less crowd/i.test(request.revisionNote ?? "")) {
    packageHeight *= 0.8;
    packageWidth *= 0.8;
    packageY += unit * 0.04;
  }
  const availableStart =
    index === 1 || index === 4
      ? width * 0.56
      : width * 0.5 - products.length * packageWidth * 0.62;
  const packages = products
    .map((product, i) =>
      packageSvg(
        product,
        availableStart + i * packageWidth * 1.18 + shift,
        packageY + (i % 2) * unit * 0.028,
        packageWidth,
        packageHeight,
        merchant,
      ),
    )
    .join("");
  if (index === 3) {
    decoration += `<rect x="${width * 0.04}" y="${height * 0.1}" width="${width * 0.76}" height="${height * 0.15}" rx="${unit * 0.01}" fill="#f6efe2"/>`;
  }
  const titleFill = ink;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeXml(`${spec.treatment}: ${products.map((product) => product.name).join(" and ")}`)}"><rect width="${width}" height="${height}" fill="#f6efe2"/>${decoration}<text x="${textX}" y="${textY}" fill="${titleFill}" font-family="system-ui,sans-serif" font-size="${unit * 0.023}" font-weight="600" letter-spacing="3">${escapeXml(merchant.name.toUpperCase())}</text><text x="${textX}" y="${textY + unit * 0.064}" fill="${titleFill}" font-family="system-ui,sans-serif" font-size="${unit * (index === 1 || index === 4 ? 0.028 : 0.04)}" font-weight="600">${label}</text>${packages}${!preferences.avoidCrowdedCompositions ? `<circle cx="${width * 0.12}" cy="${height * 0.73}" r="${unit * 0.035}" fill="${color}"/><circle cx="${width * 0.89}" cy="${height * 0.89}" r="${unit * 0.06}" fill="${color}" opacity=".4"/>` : ""}<text x="${width * 0.065}" y="${height * 0.96}" fill="${index === 3 ? "#fff6e8" : ink}" font-family="system-ui,sans-serif" font-size="${unit * 0.016}" letter-spacing="1">ORIGINAL VECTOR CONCEPT · FICTIONAL SAMPLE PRODUCTS</text></svg>`;
  return {
    type: "image",
    svg,
    width,
    height,
    alt: `${spec.treatment} with ${products.map((product) => product.name).join(" and ")} in their original labeled sample packaging.`,
    creativeTreatment: `${spec.treatment}${versionNumber > 1 ? ` · revised arrangement ${versionNumber}` : ""}`,
    generationBrief: `Create a ${width} × ${height} ${spec.treatment?.toLowerCase()} composition for ${merchant.name}. Audience: ${campaign.brief.audience}. Direction: ${campaign.brief.direction} Tone: ${campaign.blueprint.tone}. Keep all package names, sizes, materials and roast labels fixed. ${preferences.avoidCrowdedCompositions ? "Use generous spacing." : "Use a fuller geometric composition."}${request.revisionNote ? ` Revision request (recorded for review): ${request.revisionNote}.` : ""} SVG draft; create supported raster assets before platform upload.`,
  };
}
function generateContent(request: GenerationRequest): AssetContent {
  const { campaign, spec, revisionNote, versionNumber } = request;
  const brief = campaign.brief;
  const storedMerchant = getMerchant(brief.merchantId);
  const merchant = campaign.context.selectedIds.includes(
    `brand:${storedMerchant.id}`,
  )
    ? storedMerchant
    : { ...storedMerchant, tagline: "Clear details for everyday choices" };
  const products = merchant.products.filter((product) =>
    brief.productIds.includes(product.id),
  );
  const quantities = brief.quantities ?? channelSpecs.defaults;
  const names = products.map((product) => product.name).join(" & ");
  const seasonal = /autumn|fall/i.test(brief.direction)
    ? "Autumn"
    : /winter/i.test(brief.direction)
      ? "Winter"
      : /summer/i.test(brief.direction)
        ? "Summer"
        : /spring/i.test(brief.direction)
          ? "Spring"
          : "Everyday";
  const warm = /warm/i.test(`${campaign.blueprint.tone} ${revisionNote ?? ""}`);
  const tone = warm
    ? "Settle into"
    : /concise|direct|bold/i.test(campaign.blueprint.tone)
      ? "Meet"
      : "Explore";
  const variation =
    versionNumber > 1 && /short|concise/i.test(revisionNote ?? "")
      ? "Simple"
      : seasonal;
  if (spec.kind === "image") return image(request, merchant, products);
  if (spec.kind === "copy") {
    const headlinePool = [
      merchant.category === "coffee" ? "Coffee moments" : "Home essentials",
      `${variation} ${merchant.category === "coffee" ? "coffee rituals" : "home routines"}`,
      ...products.map((product) => `${tone} ${product.name}`),
      `${tone} the collection`,
      ...(brief.keywords ?? []),
      `${variation} starts here`,
      "Made for your daily ritual",
      "Discover the details",
      "Your next everyday essential",
      "A collection to explore",
      "Choose your everyday",
      "Meet your daily companion",
      "An inviting new routine",
      "Browse the full collection",
    ];
    const required = brief.requiredPhrases?.join(" · ");
    const intro = `${tone} ${names}. ${brief.goal}.`;
    return {
      type: "copy",
      headlines: distribute(
        headlinePool.map((text) => shorten(text, 30)),
        quantities.headlines,
      ),
      longHeadlines: distribute(
        [
          `${tone} ${names}: ${seasonal.toLowerCase()} moments with ${merchant.name}`,
          `${brief.goal}: ${names} for everyday routines`,
          `${brief.audience}: discover ${names}`,
          `${tone} the ${seasonal.toLowerCase()} collection`,
          `${names} from ${merchant.name}`,
        ].map((text) => shorten(text, 90)),
        quantities.longHeadlines,
      ),
      descriptions: distribute(
        [
          `${intro} ${brief.offer ?? ""}`,
          products[0].description,
          products[1]?.description ??
            `Discover ${products[0].name} and explore the product details.`,
          `For ${brief.audience.toLowerCase()}. ${brief.keywords?.[0] ? `Explore ${brief.keywords[0]}.` : "Browse the collection."}`,
          `${tone} the details and find a place for ${names}.`,
        ].map((text) => shorten(text, 90)),
        quantities.descriptions,
      ),
      ctas: distribute(
        [
          "Explore the collection",
          "View product details",
          "Find your everyday",
          "Browse the essentials",
          "Discover the range",
        ],
        quantities.ctas,
      ),
      productTitle: names,
      productDescription: products
        .map((product) => `${product.name}: ${product.description}`)
        .join("\n"),
      collectionTitle: `${seasonal} ${merchant.category === "coffee" ? "coffee moments" : "home essentials"}`,
      collectionDescription: `${intro} Audience: ${brief.audience}. Tone: ${campaign.blueprint.tone}.${brief.offer ? ` Merchant-provided offer (requires review): ${brief.offer}.` : ""}${required ? ` ${required}.` : ""}${revisionNote ? ` Revision direction: ${revisionNote}.` : ""}`,
    };
  }
  if (spec.kind === "landing")
    return {
      type: "landing",
      hero: {
        eyebrow: `${merchant.name} · ${seasonal} collection`,
        title:
          merchant.category === "coffee"
            ? `${seasonal} begins with ${warm ? "a welcoming" : "a quiet"} cup.`
            : `${warm ? "A welcoming space" : "Make room"} for the everyday.`,
        body: `${names}. ${brief.goal}. ${brief.offer ?? merchant.tagline}`,
        cta: "Explore the collection",
        imageAssetId: "image-2",
      },
      benefits: [
        ...products.map((product) => ({
          title: product.name,
          body: product.description,
        })),
        ...(products.length === 1
          ? [
              {
                title: "The package details",
                body: products[0].facts.join(". ") + ".",
              },
            ]
          : []),
      ],
      story: {
        title: "A collection with clear details",
        body: `${merchant.name} is a fictional sample merchant. ${products.map((product) => `${product.name}: ${product.facts.join("; ")}.`).join(" ")}`,
      },
      supporting: {
        title: `${tone} your next routine`,
        body: `Created for ${brief.audience.toLowerCase()}. Campaign direction: ${brief.direction}${revisionNote ? ` Revision direction: ${revisionNote}.` : ""}`,
      },
      faq: products.map((product) => ({
        question: `What comes with ${product.name}?`,
        answer: product.facts.join(". ") + ".",
      })),
    };
  if (spec.kind === "video") {
    const shots = [
      {
        seconds: 4,
        visual: `Wide composition: ${names} with unchanged packaging.`,
        voiceover: merchant.tagline,
      },
      {
        seconds: 7,
        visual: `Close view of ${products[0].name}; show the package labels.`,
        voiceover: products[0].description,
      },
      {
        seconds: 5,
        visual: `${products[1] ? `${products[1].name} beside ${products[0].name}` : products[0].name} on a quiet geometric surface.`,
        voiceover: `${tone} the collection.`,
      },
      {
        seconds: 4,
        visual: `End card: ${merchant.name}; “Explore the collection”.`,
        voiceover: "Find your next everyday ritual.",
      },
    ];
    return {
      type: "video",
      title: `${seasonal} collection · video concept`,
      durationSeconds: 20,
      script: shots.map((shot) => shot.voiceover).join("\n"),
      shots,
      generationInstructions: `Fictional sample products only. Audience: ${brief.audience}. Direction: ${brief.direction}. Tone: ${campaign.blueprint.tone}. Maintain package labels. No invented product claims or reviews. ${revisionNote ? `Revision direction: ${revisionNote}.` : ""} This is a production brief; no video has been rendered.`,
    };
  }
  return {
    type: "blueprint",
    summary: `${campaign.blueprint.summary} Tone: ${campaign.blueprint.tone}. ${campaign.blueprint.preferenceNotes.join(" ")}`,
    checklist: [
      "Review factual product records and included references.",
      "Review each current asset and its validation findings.",
      "Approve each exact version or request an individual revision.",
      "Export the approved current packet for handoff.",
      "Convert SVG drafts to supported raster image formats.",
      "Complete missing advertising assets, platform checks and final merchant approval.",
      "Publishing or advertising spend requires a separate production workflow.",
    ],
  };
}
export class DemoProvider implements GenerationProvider {
  readonly name = "Deterministic local demo provider";
  constructor(private readonly delayMs = 90) {}
  async generate(request: GenerationRequest): Promise<AssetContent> {
    await delay(this.delayMs, request.signal);
    return generateContent(request);
  }
}
