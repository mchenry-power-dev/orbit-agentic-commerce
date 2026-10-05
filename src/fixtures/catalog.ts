import type { CatalogProduct, StoreCatalog } from "../domain/catalog";

const snapshotAt = "2026-10-05";
const home = "https://cosmiccatcoffeeco.com";
const records = [
  {
    id: "solar-surge",
    title: "Solar Surge",
    description:
      "A medium roast coffee with bright citrus and warm flavor notes.",
    facts: ["Medium roast coffee", "Flavor notes: bright citrus and warm"],
    photo: "Solar_Surge_-_Ground_-_12oz.png?v=1730069644",
    photographedVariant: "49506597994798",
    variants: [
      ["49506597994798", "12oz", "Standard", "21.00"],
      ["49506598027566", "12oz", "Whole Bean", "21.00"],
      ["51057535222062", "2lb", "Standard", "46.00"],
      ["51057535287598", "2lb", "Whole Bean", "46.00"],
    ],
  },
  {
    id: "candy-cane",
    title: "Candy Cane",
    description:
      "Medium roast flavored coffee with peppermint and sweet flavor notes.",
    facts: [
      "Medium roast",
      "Flavored coffee",
      "Flavor notes: peppermint and sweet",
    ],
    photo: "CandyCane-Whole-12oz.png?v=1725840919",
    photographedVariant: "49335344431406",
    variants: [
      ["49335344333102", "12oz", "Standard", "22.00"],
      ["49335344365870", "1lb", "Standard", "28.00"],
      ["49335344431406", "12oz", "Whole Bean", "22.00"],
      ["49335344464174", "1lb", "Whole Bean", "28.00"],
    ],
  },
  {
    id: "dark-knight",
    title: "Dark Knight",
    description: "A dark roast coffee with a bold, rich flavor profile.",
    facts: ["Dark roast coffee", "Flavor profile: bold and rich"],
    photo: "Dark_Knight_-_Ground_-_12oz.png?v=1730069644",
    photographedVariant: "49506610282798",
    variants: [
      ["49506610282798", "12oz", "Standard", "21.00"],
      ["49506610315566", "12oz", "Whole Bean", "21.00"],
    ],
  },
  {
    id: "breakfast-blend",
    title: "Breakfast Blend",
    description:
      "A medium roast coffee with bright citrus and invigorating flavor notes.",
    facts: [
      "Medium roast coffee",
      "Flavor notes: bright citrus and invigorating",
    ],
    photo:
      "Breakfast-Whole-12oz_da39e1c0-cb4e-4ae7-945d-6c2b8b7a45af.png?v=1725921026",
    photographedVariant: "49335367565614",
    variants: [
      ["49335367532846", "12oz", "Standard", "21.00"],
      ["49335367565614", "12oz", "Whole Bean", "21.00"],
      ["49335367598382", "1lb", "Standard", "28.00"],
      ["49335367631150", "1lb", "Whole Bean", "28.00"],
      ["49335367663918", "2lb", "Standard", "46.00"],
      ["49335367696686", "2lb", "Whole Bean", "46.00"],
    ],
  },
];
export function cosmicCatalog(): StoreCatalog {
  const products: CatalogProduct[] = records.map((record) => ({
    id: record.id,
    snapshotAt,
    factsSnapshotAt: snapshotAt,
    variantsComplete: true,
    title: record.title,
    description: record.description,
    facts: [...record.facts],
    url: `${home}/products/${record.id}`,
    defaultVariantId: record.photographedVariant,
    variants: record.variants.map(([id, size, grind, amount]) => ({
      id,
      snapshotAt,
      title: `${size} / ${grind}`,
      options: { size, grind },
      price: { amount, currency: "USD" },
      imageId:
        id === record.photographedVariant ? `${record.id}-scene` : undefined,
    })),
    images: [
      {
        id: `${record.id}-scene`,
        src: `/brand/cosmic-cat/${record.id}.png`,
        thumbnail: `/brand/cosmic-cat/${record.id}-thumb.jpg`,
        alt: `${record.title} · original 12oz ${record.variants.find((v) => v[0] === record.photographedVariant)![2]} product photograph`,
        classification: "product-photo",
        sourceUrl: `${home}/cdn/shop/files/${record.photo}`,
        retrievedAt: ["solar-surge", "candy-cane"].includes(record.id)
          ? "2026-10-03"
          : snapshotAt,
        variantIds: [record.photographedVariant],
      },
    ],
  }));
  return {
    schemaVersion: 1,
    id: "cosmic-cat",
    name: "Cosmic Cat Coffee Co.",
    url: `${home}/`,
    sourceType: "bundled-snapshot",
    snapshotAt,
    sourceUrl: `${home}/`,
    completeness: "complete",
    products,
    notice:
      "Four owner-authorized public products. Prices and variants are a dated snapshot, not an offer or stock feed. Only the pictured 12oz variant has an approved product photo; other variants need a matching owned photo. Store logo and unrelated reference graphics are excluded from product images.",
  };
}
