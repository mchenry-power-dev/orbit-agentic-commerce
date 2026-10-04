import type { Merchant } from "../domain";

export type CosmicCatSourceRole =
  "product-fact" | "product-photo" | "visual-inspiration" | "page";

export interface CosmicCatReference {
  id: string;
  sourceUrl: string;
  retrievedAt: string;
  role: CosmicCatSourceRole;
  title: string;
  text?: string;
  path?: string;
  alt?: string;
  width?: number;
  height?: number;
  bytes?: number;
  sha256?: string;
}

export interface CosmicCatProduct {
  id: string;
  name: string;
  description: string;
  facts: string[];
  size: string;
  packageLabel: string[];
  photoPath: string;
  photoSourceUrl: string;
  productSourceUrl: string;
  factSourceUrls: string[];
  sourceIds: string[];
}

export interface CosmicCatSnapshot {
  id: string;
  name: string;
  site: string;
  retrievedAt: string;
  authorization: string;
  attribution: string;
  licenseStatus: string;
  tagline: string;
  palette: string[];
  paletteBasis: string;
  tone: string;
  toneBasis: string;
  brandRules: string[];
  pageContent: string;
  products: CosmicCatProduct[];
  photos: CosmicCatReference[];
  references: CosmicCatReference[];
  limitations: string[];
}

const retrievedAt = "2026-10-03";
const home = "https://cosmiccatcoffeeco.com/";
const solarPhoto =
  "https://cosmiccatcoffeeco.com/cdn/shop/files/Solar_Surge_-_Ground_-_12oz.png?v=1730069644";
const candyPhoto =
  "https://cosmiccatcoffeeco.com/cdn/shop/files/CandyCane-Whole-12oz.png?v=1725840919";

const photos: CosmicCatReference[] = [
  {
    id: "cosmic-photo-solar-surge",
    role: "product-photo",
    title: "Solar Surge · original storefront product photo",
    path: "/brand/cosmic-cat/solar-surge.png",
    sourceUrl: solarPhoto,
    retrievedAt,
    alt: "Solar Surge medium ground coffee bag in the original green woodland scene.",
    width: 1200,
    height: 1200,
    bytes: 1559203,
    sha256: "587c9f0eebac4934bce4deb6bfbc77d41d1ae39670885a85bd7dabd01fda0049",
  },
  {
    id: "cosmic-photo-candy-cane",
    role: "product-photo",
    title: "Candy Cane · original storefront product photo",
    path: "/brand/cosmic-cat/candy-cane.png",
    sourceUrl: candyPhoto,
    retrievedAt,
    alt: "Candy Cane medium whole bean coffee bag with the original peppermint, cup and festive lights scene.",
    width: 1200,
    height: 1200,
    bytes: 1432885,
    sha256: "e17e5b54dfb68f839ff8164da46cac0f0f24daf6bc3eb53aa3f9d282408da060",
  },
  {
    id: "cosmic-logo",
    role: "visual-inspiration",
    title: "Cosmic Cat Coffee Co. · original logo",
    path: "/brand/cosmic-cat/logo.png",
    sourceUrl:
      "https://cosmiccatcoffeeco.com/cdn/shop/files/Cosmic_Cat_Logo_No_Background.png?v=1725676682",
    retrievedAt,
    alt: "Original Cosmic Cat Coffee Co. logo with a colorful cat and trademark mark.",
    width: 1800,
    height: 1800,
    bytes: 443582,
    sha256: "d948c1f605838c8abc8237450d4082342dc1dbd340b4908815bbc1bec4d3eadd",
  },
  {
    id: "cosmic-gifting-inspiration",
    role: "visual-inspiration",
    title: "Coffee Gifts · storefront visual inspiration",
    path: "/brand/cosmic-cat/coffee-gifts.png",
    sourceUrl:
      "https://cosmiccatcoffeeco.com/cdn/shop/collections/25Q3_3_Bag_Box_Banner_481dfaad-1128-4a84-88b3-1fd362bf895d.png?v=1782781297",
    retrievedAt,
    alt: "Original coffee gift photography showing several different coffee bags and a birthday gift tag.",
    text: "Gifting presentation inspiration only. Different products and a birthday tag are visible; this does not establish the contents of a selected product or a Christmas bundle.",
    width: 866,
    height: 866,
    bytes: 522494,
    sha256: "1308326cd4ca11b2a7c0136dc9ed115476748bab0222478113b08c2407fbed3a",
  },
];

export const cosmicCatSnapshot: CosmicCatSnapshot = {
  id: "cosmic-cat",
  name: "Cosmic Cat Coffee Co.",
  site: home,
  retrievedAt,
  authorization:
    "The repository owner explicitly authorized use of Cosmic Cat's public products, packaging, photography, positioning and page material for the Orbit V2 reference.",
  attribution:
    "Public brand material: Cosmic Cat Coffee Co., cosmiccatcoffeeco.com.",
  licenseStatus:
    "Owner-authorized use in this reference; no open-source or unrestricted third-party asset license is asserted.",
  tagline: "Fresh coffee. Roasted-to-order.",
  palette: ["#ffffff", "#020912", "#0b402e", "#e4f6ff"],
  paletteBasis:
    "Observed public homepage CSS color tokens, not a formal brand guide.",
  tone: "Warm, colorful and coffee-focused",
  toneBasis:
    "Editorial interpretation of the public storefront; not a verified brand policy.",
  brandRules: [
    "Use the original product photos as protected full-frame layers; preserve package identity, proportions, wording and labels.",
    "Facts apply to the pictured variants: Solar Surge ground coffee and Candy Cane whole bean coffee, each 12 oz (340 g). Do not infer other variants.",
    "Treat visual inspiration as inspiration, never as evidence of selected product contents.",
    "Do not invent prices, discounts, stock, reviews, certifications, health benefits, delivery promises or offers.",
    "Campaign scenes, palettes and gifting language are creative choices; do not present them as new product attributes or a verified gift bundle.",
  ],
  pageContent:
    "The public storefront presents premium roasts, flavored coffee, single origins and coffee gifts. Solar Surge is shown as medium roast with bright citrus and warm flavor notes. Candy Cane is shown as medium roast with peppermint and sweet flavor notes.",
  products: [
    {
      id: "cosmic-solar-surge",
      name: "Solar Surge",
      description:
        "Medium roast coffee with bright citrus and warm flavor notes; the pictured variant is ground coffee.",
      facts: [
        "Medium roast",
        "Flavor notes: bright citrus and warm",
        "Pictured variant: ground coffee",
        "Pictured bag: 12 oz (340 g)",
      ],
      size: "12 oz (340 g) · pictured variant",
      packageLabel: [
        "COSMIC CAT COFFEE CO.",
        "SOLAR SURGE",
        "Medium",
        "Ground Coffee",
        "NET WT. 12 OZ. (340g)",
      ],
      photoPath: "/brand/cosmic-cat/solar-surge.png",
      photoSourceUrl: solarPhoto,
      productSourceUrl: `${home}products/solar-surge`,
      factSourceUrls: [home, solarPhoto],
      sourceIds: ["cosmic-fact-solar-surge", "cosmic-photo-solar-surge"],
    },
    {
      id: "cosmic-candy-cane",
      name: "Candy Cane",
      description:
        "Medium roast flavored coffee with peppermint and sweet flavor notes; the pictured variant is whole bean coffee.",
      facts: [
        "Medium roast",
        "Flavor notes: peppermint and sweet",
        "Pictured variant: whole bean coffee",
        "Pictured bag: 12 oz (340 g)",
      ],
      size: "12 oz (340 g) · pictured variant",
      packageLabel: [
        "COSMIC CAT COFFEE CO.",
        "CANDY CANE",
        "Flavored Coffee",
        "Medium",
        "Whole Bean Coffee",
        "NET WT. 12 OZ. (340g)",
      ],
      photoPath: "/brand/cosmic-cat/candy-cane.png",
      photoSourceUrl: candyPhoto,
      productSourceUrl: `${home}products/candy-cane`,
      factSourceUrls: [home, candyPhoto],
      sourceIds: ["cosmic-fact-candy-cane", "cosmic-photo-candy-cane"],
    },
  ],
  photos,
  references: [
    {
      id: "cosmic-fact-solar-surge",
      role: "product-fact",
      title: "Solar Surge · verified homepage and pictured packaging facts",
      sourceUrl: home,
      retrievedAt,
      text: "Solar Surge; medium roast; bright citrus and warm flavor notes. The original product photo label identifies ground coffee, 12 oz (340 g).",
    },
    {
      id: "cosmic-fact-candy-cane",
      role: "product-fact",
      title: "Candy Cane · verified homepage and pictured packaging facts",
      sourceUrl: home,
      retrievedAt,
      text: "Candy Cane; medium roast; peppermint and sweet flavor notes. The original product photo label identifies flavored whole bean coffee, 12 oz (340 g).",
    },
    {
      id: "cosmic-page-home",
      role: "page",
      title: "Public storefront · bounded collection context",
      sourceUrl: home,
      retrievedAt,
      text: "Public collections include premium roasts, flavored coffee, single origins and coffee gifts. The storefront uses roasted-to-order positioning.",
    },
    ...photos,
  ],
  limitations: [
    "A bounded two-product snapshot, not the full catalog or a live stock/price feed.",
    "Individual product-page requests encountered a connection-verification challenge. Those URLs are navigational links, not successful import claims; current facts come from the accessible homepage and original image labels.",
    "No customer identities, review data, carts, checkout, account information, tracking records or private economics are retained.",
    "The original product photographs already contain background scenes. No claim is made about how the storefront created them.",
  ],
};

/** Optional adapter; it does not modify the preserved Aster/Harbor preset list. */
export const cosmicCatMerchant: Merchant = {
  id: cosmicCatSnapshot.id,
  name: cosmicCatSnapshot.name,
  category: "coffee",
  site: cosmicCatSnapshot.site,
  tagline: cosmicCatSnapshot.tagline,
  brandRules: [...cosmicCatSnapshot.brandRules],
  pageContent: cosmicCatSnapshot.pageContent,
  products: cosmicCatSnapshot.products.map((product) => ({
    id: product.id,
    name: product.name,
    category: "Coffee",
    size: product.size,
    color: "#020912",
    facts: [...product.facts],
    description: product.description,
    packageLabel: [...product.packageLabel],
  })),
};
