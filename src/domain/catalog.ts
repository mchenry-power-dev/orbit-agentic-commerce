import type { BrandProduct, StudioBrand } from "./studio";

export type CatalogSourceType =
  | "bundled-snapshot"
  | "public-storefront"
  | "catalog-file"
  | "local-service"
  | "simulated-connection";
export interface CatalogImage {
  id: string;
  src: string;
  thumbnail?: string;
  alt: string;
  classification: "product-photo" | "logo" | "reference";
  sourceUrl?: string;
  retrievedAt: string;
  variantIds: string[];
}
export interface CatalogVariant {
  id: string;
  snapshotAt?: string;
  title: string;
  options: Record<string, string>;
  price?: { amount: string; currency: string };
  imageId?: string;
}
export interface CatalogProduct {
  id: string;
  snapshotAt?: string;
  factsSnapshotAt?: string;
  variantsComplete?: boolean;
  title: string;
  description: string;
  facts: string[];
  url: string;
  images: CatalogImage[];
  variants: CatalogVariant[];
  defaultVariantId: string;
}
export interface StoreCatalog {
  schemaVersion: 1;
  id: string;
  name: string;
  url: string;
  sourceType: CatalogSourceType;
  snapshotAt: string;
  sourceUrl: string;
  completeness: "complete" | "partial";
  products: CatalogProduct[];
  notice: string;
}
/** Captured with campaign facts. Catalog refreshes never mutate these records. */
export interface CatalogSelection {
  storeId: string;
  storeName: string;
  productId: string;
  variantId: string;
  variantTitle: string;
  imageId?: string;
  snapshotAt: string;
  factsSnapshotAt?: string;
  variantSnapshotAt?: string;
  sourceType: CatalogSourceType;
  sourceUrl: string;
  productUrl: string;
  price?: CatalogVariant["price"];
}
export interface CatalogChoice {
  productId: string;
  variantId: string;
  imageId?: string;
}
export const catalogProductKey = (storeId: string, productId: string) =>
  `${storeId}::${productId}`;
/** A campaign photo edit does not change the catalog's product/variant snapshot. */
export function withProductPhotoOverride(
  product: BrandProduct,
  photo: string,
): BrandProduct {
  return {
    ...product,
    photo,
    catalog:
      product.catalog && photo !== product.photo
        ? { ...product.catalog, imageId: undefined }
        : product.catalog,
  };
}
export const catalogModeLabel: Record<CatalogSourceType, string> = {
  "bundled-snapshot": "Demo catalog",
  "public-storefront": "Public catalog read",
  "catalog-file": "Local catalog file",
  "local-service": "Local-service import",
  "simulated-connection": "Demo store connection",
};
export function matchingProductImages(
  product: CatalogProduct,
  variantId: string,
) {
  return product.images.filter(
    (image) =>
      image.classification === "product-photo" &&
      image.variantIds.includes(variantId),
  );
}
export function catalogChoiceProduct(
  store: StoreCatalog,
  choice: CatalogChoice,
): BrandProduct {
  const product = store.products.find((p) => p.id === choice.productId);
  const variant = product?.variants.find((v) => v.id === choice.variantId);
  if (!product || !variant)
    throw new Error(
      "This catalog product or variant is no longer available. Your saved campaign facts are unchanged.",
    );
  const images = matchingProductImages(product, variant.id);
  const image =
    images.find((i) => i.id === choice.imageId) ??
    images.find((i) => i.id === variant.imageId) ??
    images[0];
  const id = catalogProductKey(store.id, product.id);
  return {
    id,
    name: product.title,
    description: product.description,
    facts: [...product.facts, `Selected variant: ${variant.title}`],
    size: variant.title,
    photo: image?.src ?? "",
    confirmed: true,
    sourceIds: [`${id}:facts`, ...(image ? [`${id}:photo:${image.id}`] : [])],
    catalog: {
      storeId: store.id,
      storeName: store.name,
      productId: product.id,
      variantId: variant.id,
      variantTitle: variant.title,
      imageId: image?.id,
      snapshotAt: product.snapshotAt ?? store.snapshotAt,
      factsSnapshotAt:
        product.factsSnapshotAt ?? product.snapshotAt ?? store.snapshotAt,
      variantSnapshotAt:
        variant.snapshotAt ?? product.snapshotAt ?? store.snapshotAt,
      sourceType: store.sourceType,
      sourceUrl: store.sourceUrl,
      productUrl: product.url,
      price: variant.price && { ...variant.price },
    },
  };
}
export function catalogSelectionBrand(
  store: StoreCatalog,
  choices: CatalogChoice[],
  previous?: StudioBrand,
  preserveUnchanged = false,
): StudioBrand {
  const preserved = new Set<string>();
  const products = choices.map((choice) => {
    const saved =
      preserveUnchanged && previous?.id === store.id
        ? previous.products.find(
            (p) =>
              p.catalog?.productId === choice.productId &&
              p.catalog.variantId === choice.variantId &&
              (!choice.imageId || p.catalog.imageId === choice.imageId),
          )
        : undefined;
    if (saved) {
      preserved.add(saved.id);
      return structuredClone(saved);
    }
    return catalogChoiceProduct(store, choice);
  });
  const sameStore =
    previous?.id === store.id ||
    (store.id === "cosmic-cat" && previous?.id === "cosmic-cat");
  return {
    id: store.id,
    name: store.name,
    website: store.url,
    tagline: sameStore ? previous!.tagline : "",
    palette: sameStore
      ? [...previous!.palette]
      : ["#122523", "#f5f0e8", "#c9d7bb"],
    tone: sameStore ? previous!.tone : "Clear and product-focused",
    ownership:
      store.id === "cosmic-cat"
        ? "owner-authorized-snapshot"
        : "visitor-confirmed",
    products,
    sources: [
      ...(sameStore
        ? structuredClone(
            previous!.sources.filter(
              (source) =>
                source.role === "page" || source.role === "visual-inspiration",
            ),
          )
        : []),
      ...products.flatMap((product) => {
        if (preserved.has(product.id))
          return structuredClone(
            previous!.sources.filter((source) =>
              product.sourceIds.includes(source.id),
            ),
          );
        const selected = product.catalog!;
        const reference = store.products
          .find((p) => p.id === selected.productId)!
          .images.find((i) => i.id === selected.imageId);
        return [
          {
            id: `${product.id}:facts`,
            role: "product-fact" as const,
            included: true,
            title: `${product.name} · ${selected.variantTitle} · ${catalogModeLabel[store.sourceType]}`,
            url: selected.productUrl,
            retrievedAt: selected.snapshotAt,
            text: [
              product.description,
              `Product notes snapshot: ${selected.factsSnapshotAt ?? selected.snapshotAt}`,
              ...product.facts,
              selected.price
                ? `Snapshot price (${selected.variantSnapshotAt ?? selected.snapshotAt}): ${selected.price.amount} ${selected.price.currency}; not a current offer.`
                : "Price not supplied.",
            ].join("\n"),
          },
          ...(reference
            ? [
                {
                  id: `${product.id}:photo:${reference.id}`,
                  role: "product-photo" as const,
                  included: true,
                  title: reference.alt,
                  url: reference.sourceUrl,
                  retrievedAt: reference.retrievedAt,
                  image: reference.src,
                },
              ]
            : []),
        ];
      }),
    ],
  };
}
export function choicesFromBrand(
  store: StoreCatalog,
  brand: StudioBrand,
  selectedIds: string[],
): CatalogChoice[] {
  if (brand.id !== store.id) return [];
  return brand.products
    .filter((p) => selectedIds.includes(p.id))
    .flatMap((p) => {
      if (p.catalog?.storeId === store.id)
        return [
          {
            productId: p.catalog.productId,
            variantId: p.catalog.variantId,
            imageId: p.catalog.imageId,
          },
        ];
      // Existing V2 campaigns keep their legacy ids and facts until an explicit picker change.
      const original = store.products.find(
        (candidate) => p.id === `cosmic-${candidate.id}`,
      );
      return original
        ? [{ productId: original.id, variantId: original.defaultVariantId }]
        : [];
    });
}
/** Selecting a photo alone preserves campaign copy/fact overrides and the saved variant snapshot. */
export function catalogPhotoSelectionBrand(
  store: StoreCatalog,
  choice: CatalogChoice,
  brand: StudioBrand,
): StudioBrand {
  const reference = catalogChoiceProduct(store, choice);
  const selected = brand.products.find(
    (product) =>
      product.catalog?.storeId === store.id &&
      product.catalog.productId === choice.productId &&
      product.catalog.variantId === choice.variantId,
  );
  const image = store.products
    .find((p) => p.id === choice.productId)
    ?.images.find((i) => i.id === reference.catalog?.imageId);
  if (!selected || !image)
    throw new Error(
      "Choose a matching catalog photo for the selected product and variant.",
    );
  const sourceId = `${selected.id}:photo:${image.id}`;
  const next = structuredClone(brand);
  next.products = next.products.map((product) =>
    product.id === selected.id
      ? {
          ...product,
          photo: image.src,
          catalog: { ...product.catalog!, imageId: image.id },
          sourceIds: [
            ...product.sourceIds.filter(
              (id) =>
                !brand.sources.some(
                  (source) =>
                    source.id === id && source.role === "product-photo",
                ),
            ),
            sourceId,
          ],
        }
      : product,
  );
  next.sources = [
    ...next.sources.filter((source) => source.id !== sourceId),
    {
      id: sourceId,
      role: "product-photo",
      included: true,
      title: image.alt,
      url: image.sourceUrl,
      retrievedAt: image.retrievedAt,
      image: image.src,
    },
  ];
  return next;
}
/** A partial refresh is a merge; removal is meaningful only in a complete snapshot. */
export function replaceCatalog(
  previous: StoreCatalog[],
  incoming: StoreCatalog,
): StoreCatalog[] {
  const existing = previous.find((store) => store.id === incoming.id);
  const next = structuredClone(incoming);
  if (existing)
    for (const product of next.products) {
      if (product.variantsComplete !== false) continue;
      const previousProduct = existing.products.find(
        (p) => p.id === product.id,
      );
      if (!previousProduct) continue;
      const retained = structuredClone(
        previousProduct.variants.filter(
          (variant) => !product.variants.some((v) => v.id === variant.id),
        ),
      );
      for (const previousImage of previousProduct.images) {
        const ids = previousImage.variantIds.filter((id) =>
          retained.some((v) => v.id === id),
        );
        if (!ids.length) continue;
        const matching = product.images.find(
          (image) =>
            image.id === previousImage.id && image.src === previousImage.src,
        );
        if (matching)
          matching.variantIds = [...new Set([...matching.variantIds, ...ids])];
        else {
          let imageId = previousImage.id;
          while (product.images.some((image) => image.id === imageId))
            imageId = `previous-${imageId}`;
          product.images.push({
            ...structuredClone(previousImage),
            id: imageId,
            variantIds: ids,
          });
          for (const variant of retained)
            if (variant.imageId === previousImage.id) variant.imageId = imageId;
        }
      }
      product.variants.push(...retained);
    }
  if (existing && next.completeness === "partial") {
    next.products = [
      ...next.products,
      ...structuredClone(
        existing.products.filter(
          (product) => !next.products.some((p) => p.id === product.id),
        ),
      ),
    ];
    next.notice =
      `${next.notice} Partial update: unlisted products retain their previous facts.`.trim();
  }
  return existing
    ? previous.map((store) => (store.id === next.id ? next : store))
    : [...previous, next];
}
