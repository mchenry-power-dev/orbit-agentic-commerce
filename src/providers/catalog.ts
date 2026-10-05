import type {
  CatalogImage,
  CatalogProduct,
  CatalogVariant,
  StoreCatalog,
} from "../domain/catalog";
import { cosmicCatalog } from "../fixtures/catalog";
import { readOwnedPhoto } from "./uploads";

const object = (value: unknown, label: string): Record<string, unknown> => {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error(`${label} must be an object.`);
  return value as Record<string, unknown>;
};
const text = (value: unknown, label: string, max = 200): string => {
  if (typeof value !== "string" || !value.trim() || value.length > max)
    throw new Error(`${label} must contain 1–${max} characters.`);
  return value.trim();
};
const id = (value: unknown, label: string) => {
  const result = text(value, label, 100);
  if (!/^[a-zA-Z0-9_-]+$/.test(result))
    throw new Error(
      `${label} may contain letters, numbers, underscores and hyphens.`,
    );
  return result;
};
const array = (value: unknown, label: string, max: number): unknown[] => {
  if (!Array.isArray(value) || value.length > max)
    throw new Error(`${label} must be an array of at most ${max} items.`);
  return value;
};
function unique<T extends { id: string }>(items: T[], label: string): T[] {
  if (new Set(items.map((item) => item.id)).size !== items.length)
    throw new Error(`${label} contains duplicate ids.`);
  return items;
}
export function catalogPublicUrl(value: unknown, label: string): string {
  const parsed = new URL(text(value, label, 1000));
  if (
    parsed.protocol !== "https:" ||
    parsed.username ||
    parsed.password ||
    parsed.port ||
    !parsed.hostname.includes(".") ||
    /^(?:localhost|.*\.localhost|.*\.local|127\.|10\.|192\.168\.|169\.254\.|172\.(?:1[6-9]|2\d|3[01])\.|\[)/i.test(
      parsed.hostname,
    )
  )
    throw new Error(`${label} must be a public HTTPS URL without credentials.`);
  return parsed.href;
}
function price(value: unknown): CatalogVariant["price"] {
  if (value === undefined) return undefined;
  const p = object(value, "Price");
  const amount = text(p.amount, "Price amount", 16);
  const currency = text(p.currency, "Currency", 3);
  if (!/^\d{1,9}(?:\.\d{1,4})?$/.test(amount) || !/^[A-Z]{3}$/.test(currency))
    throw new Error(
      "Use a non-negative decimal price and three-letter currency.",
    );
  return { amount, currency };
}
/** Parse only documented inert fields. Nothing in a catalog file causes a network request. */
export function parseCatalogFile(json: string): StoreCatalog {
  if (new TextEncoder().encode(json).length > 4_000_000)
    throw new Error("Catalog files must be under 4 MB.");
  let raw: Record<string, unknown>;
  try {
    raw = object(JSON.parse(json), "Catalog");
  } catch {
    throw new Error(
      "Choose a valid Orbit catalog JSON file. The previous catalog was preserved.",
    );
  }
  if (raw.schemaVersion !== 1)
    throw new Error(
      "This catalog version is not supported. Use schemaVersion 1.",
    );
  const storeId = `file:${id(raw.id, "Store id")}`;
  const snapshotAt = text(raw.snapshotAt, "Snapshot date", 30);
  if (
    !/^\d{4}-\d{2}-\d{2}(?:T[\d:.]+Z)?$/.test(snapshotAt) ||
    !Number.isFinite(Date.parse(snapshotAt))
  )
    throw new Error("Use an ISO snapshot date, such as 2026-10-05.");
  let imageCount = 0;
  const products = unique(
    array(raw.products, "Products", 20).map((value): CatalogProduct => {
      const p = object(value, "Product");
      const variants = unique(
        array(p.variants, "Variants", 12).map((value): CatalogVariant => {
          const v = object(value, "Variant"),
            opts = object(v.options ?? {}, "Variant options");
          if (Object.keys(opts).length > 5)
            throw new Error("Use at most five variant options.");
          return {
            id: id(v.id, "Variant id"),
            snapshotAt,
            title: text(v.title, "Variant title"),
            options: Object.fromEntries(
              Object.entries(opts).map(([key, val]) => [
                text(key, "Option name", 60),
                text(val, "Option value", 100),
              ]),
            ),
            price: price(v.price),
            imageId:
              v.imageId === undefined ? undefined : id(v.imageId, "Image id"),
          };
        }),
        "Variants",
      );
      if (!variants.length)
        throw new Error("Every product needs at least one variant.");
      const images = unique(
        array(p.images ?? [], "Images", 3).map((value): CatalogImage => {
          if (++imageCount > 20)
            throw new Error("Use at most twenty embedded images per catalog.");
          const img = object(value, "Image");
          const src = text(img.src, "Image data", 1_500_000);
          if (
            !/^data:image\/(?:png|jpeg);base64,[A-Za-z0-9+/]+={0,2}$/.test(src)
          )
            throw new Error(
              "Embed owned PNG/JPEG images as data URLs. Remote URLs, SVG and filesystem paths are not loaded.",
            );
          const classification = img.classification;
          if (
            !["product-photo", "logo", "reference"].includes(
              String(classification),
            )
          )
            throw new Error(
              "Classify each image as product-photo, logo or reference.",
            );
          const variantIds = array(
            img.variantIds ?? [],
            "Image variant ids",
            12,
          ).map((value) => id(value, "Image variant id"));
          if (
            variantIds.some(
              (key) => !variants.some((variant) => variant.id === key),
            )
          )
            throw new Error("Image references an unknown variant.");
          return {
            id: id(img.id, "Image id"),
            src,
            alt: text(img.alt, "Image description", 300),
            classification: classification as CatalogImage["classification"],
            retrievedAt: snapshotAt,
            variantIds,
            sourceUrl:
              img.sourceUrl === undefined
                ? undefined
                : catalogPublicUrl(img.sourceUrl, "Image source"),
          };
        }),
        "Images",
      );
      if (
        variants.some(
          (v) => v.imageId && !images.some((image) => image.id === v.imageId),
        )
      )
        throw new Error("A variant references an unknown image.");
      const defaultVariantId =
        p.defaultVariantId === undefined
          ? variants[0].id
          : id(p.defaultVariantId, "Default variant id");
      if (!variants.some((v) => v.id === defaultVariantId))
        throw new Error("Default variant is missing from the catalog.");
      return {
        id: id(p.id, "Product id"),
        snapshotAt,
        factsSnapshotAt: snapshotAt,
        variantsComplete: p.variantsComplete !== false,
        title: text(p.title, "Product title"),
        description: text(p.description, "Product description", 2500),
        facts: array(p.facts ?? [], "Facts", 12).map((f) =>
          text(f, "Product fact", 400),
        ),
        url: catalogPublicUrl(p.url, "Product URL"),
        variants,
        images,
        defaultVariantId,
      };
    }),
    "Products",
  );
  if (!products.length)
    throw new Error(
      "The catalog is empty. The previous catalog was preserved.",
    );
  return {
    schemaVersion: 1,
    id: storeId,
    name: text(raw.name, "Store name"),
    url: catalogPublicUrl(raw.url, "Store URL"),
    sourceType: "catalog-file",
    snapshotAt,
    sourceUrl: catalogPublicUrl(raw.url, "Store URL"),
    completeness: raw.completeness === "partial" ? "partial" : "complete",
    products,
    notice:
      "Visitor-confirmed local catalog file. Facts and photo rights are supplied by the visitor; Orbit has not verified a store connection. No URL was fetched.",
  };
}
export async function readCatalogFile(file: File): Promise<StoreCatalog> {
  if (file.size > 4_000_000)
    throw new Error("Catalog files must be under 4 MB.");
  const catalog = parseCatalogFile(await file.text());
  for (const product of catalog.products)
    for (const image of product.images) {
      const [head, encoded] = image.src.split(",");
      const bytes = Uint8Array.from(atob(encoded), (char) =>
        char.charCodeAt(0),
      );
      image.src = await readOwnedPhoto(
        new File([bytes], "catalog-photo", {
          type: head.includes("png") ? "image/png" : "image/jpeg",
        }),
      );
      const bitmap = await createImageBitmap(
        new Blob([bytes], {
          type: head.includes("png") ? "image/png" : "image/jpeg",
        }),
      );
      try {
        const canvas = document.createElement("canvas"),
          scale = Math.min(1, 320 / Math.max(bitmap.width, bitmap.height));
        canvas.width = Math.round(bitmap.width * scale);
        canvas.height = Math.round(bitmap.height * scale);
        const context = canvas.getContext("2d");
        if (!context)
          throw new Error("This browser cannot prepare catalog thumbnails.");
        context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
        image.thumbnail = canvas.toDataURL("image/jpeg", 0.8);
      } finally {
        bitmap.close();
      }
    }
  return catalog;
}

export const cosmicPublicEndpoint =
  "https://natures-nook-7929.myshopify.com/api/2026-10/graphql.json";
const curated = cosmicCatalog();
const query = `query OrbitCuratedCatalog { ${curated.products.map((p, i) => `p${i}: product(handle: "${p.id}") { handle title description onlineStoreUrl featuredImage { url } variants(first: 12) { nodes { id title selectedOptions { name value } price { amount currencyCode } } pageInfo { hasNextPage } } }`).join(" ")} }`;
/** Explicit read-only action, four known handles, no token, cookies, image fetches or mutations. */
export async function readCosmicPublicCatalog(
  fetcher: typeof fetch = fetch,
  now = new Date(),
): Promise<StoreCatalog> {
  const controller = new AbortController(),
    timer = setTimeout(() => controller.abort(), 12_000);
  try {
    const response = await fetcher(cosmicPublicEndpoint, {
      method: "POST",
      credentials: "omit",
      redirect: "error",
      referrerPolicy: "no-referrer",
      cache: "no-store",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query }),
      signal: controller.signal,
    });
    if (!response.ok || !response.headers.get("content-type")?.includes("json"))
      throw new Error("The public store did not return a readable catalog.");
    const reader = response.body?.getReader();
    if (!reader) throw new Error("The public catalog response was empty.");
    let bytes = 0,
      body = "";
    const decoder = new TextDecoder();
    try {
      while (true) {
        const part = await reader.read();
        if (part.done) break;
        bytes += part.value.length;
        if (bytes > 120_000) {
          await reader.cancel();
          throw new Error(
            "The public catalog exceeded the 120 KB response limit.",
          );
        }
        body += decoder.decode(part.value, { stream: true });
      }
      body += decoder.decode();
    } finally {
      reader.releaseLock();
    }
    const envelope = object(JSON.parse(body), "Public response");
    if (envelope.errors)
      throw new Error("Shopify could not complete this public catalog query.");
    const data = object(envelope.data, "Public product data");
    let partial = false;
    const products: CatalogProduct[] = [];
    for (let index = 0; index < curated.products.length; index++) {
      const original = curated.products[index],
        value = data[`p${index}`];
      if (value === null || value === undefined) {
        partial = true;
        continue;
      }
      const p = object(value, "Public product");
      if (p.handle !== original.id)
        throw new Error("Public catalog returned an unexpected product.");
      const title = text(p.title, "Public product title");
      const connection = object(p.variants, "Public variants");
      const variantsComplete = !object(connection.pageInfo, "Variant page info")
        .hasNextPage;
      if (!variantsComplete) partial = true;
      const variants = unique(
        array(connection.nodes, "Public variants", 12).map(
          (value): CatalogVariant => {
            const v = object(value, "Public variant"),
              amount = object(v.price, "Public price");
            const variantId = text(v.id, "Public variant id").split("/").pop()!;
            const options = Object.fromEntries(
              array(v.selectedOptions, "Public options", 5).map((value) => {
                const o = object(value, "Public option");
                return [
                  text(o.name, "Option name", 60),
                  text(o.value, "Option value", 100),
                ];
              }),
            );
            const prior = original.variants.find(
              (candidate) =>
                candidate.id === variantId && candidate.title === v.title,
            );
            return {
              id: id(variantId, "Public variant id"),
              snapshotAt: now.toISOString(),
              title: text(v.title, "Public variant title"),
              options,
              price: price({
                amount: amount.amount,
                currency: amount.currencyCode,
              }),
              imageId: title === original.title ? prior?.imageId : undefined,
            };
          },
        ),
        "Public variants",
      );
      if (!variants.length) {
        partial = true;
        continue;
      }
      const knownImages =
        title === original.title
          ? original.images.map((image) => ({
              ...image,
              variantIds: image.variantIds.filter((variantId) =>
                variants.some(
                  (v) => v.id === variantId && v.imageId === image.id,
                ),
              ),
            }))
          : [];
      products.push({
        ...original,
        snapshotAt: now.toISOString(),
        variantsComplete,
        title,
        description: text(
          p.description || original.description,
          "Public description",
          4000,
        ),
        url: p.onlineStoreUrl
          ? catalogPublicUrl(p.onlineStoreUrl, "Public product URL")
          : original.url,
        variants,
        images: knownImages,
        defaultVariantId: variants.some(
          (v) => v.id === original.defaultVariantId,
        )
          ? original.defaultVariantId
          : variants[0].id,
      });
    }
    if (!products.length)
      throw new Error(
        "No curated products were returned. The previous catalog was preserved.",
      );
    return {
      ...curated,
      sourceType: "public-storefront",
      snapshotAt: now.toISOString(),
      sourceUrl: cosmicPublicEndpoint,
      products,
      completeness: partial ? "partial" : "complete",
      notice:
        "A successful read of four public product handles, not store authorization or continuous sync. Descriptions, prices and variants were retrieved at the shown time. Factual notes and photography retain their bundled snapshot dates; only matching pictured variants have a photo. Partial updates preserve unlisted variants with their earlier price dates. Saved campaign snapshots are unchanged until you apply catalog facts.",
    };
  } catch (error) {
    if (
      error instanceof Error &&
      (error.name === "AbortError" || error.name === "TypeError")
    )
      throw new Error(
        "The public catalog could not be read (network, timeout or browser access restriction). Your previous catalog is preserved. Use the demo catalog or import a local file.",
      );
    throw error;
  } finally {
    clearTimeout(timer);
  }
}
