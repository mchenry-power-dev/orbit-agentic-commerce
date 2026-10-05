import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import {
  catalogChoiceProduct,
  catalogPhotoSelectionBrand,
  catalogProductKey,
  catalogSelectionBrand,
  choicesFromBrand,
  matchingProductImages,
  replaceCatalog,
  withProductPhotoOverride,
} from "../src/domain/catalog";
import { cosmicCatalog } from "../src/fixtures/catalog";
import { cosmicBrand, freshBrief } from "../src/fixtures/studio";
import {
  cosmicPublicEndpoint,
  parseCatalogFile,
  readCosmicPublicCatalog,
} from "../src/providers/catalog";
import { StudioEngine } from "../src/orchestration/studio";
import { StudioMemoryPersistence } from "../src/persistence/studio";
import { freshStudioState } from "../src/domain/studio";
const choice = { productId: "solar-surge", variantId: "49506597994798" };
const template = () =>
  JSON.parse(readFileSync("public/samples/catalog-template.json", "utf8"));
const publicData = () =>
  Object.fromEntries(
    cosmicCatalog().products.map((p, i) => [
      `p${i}`,
      {
        handle: p.id,
        title: p.title,
        description: p.description,
        onlineStoreUrl: p.url,
        featuredImage: { url: p.images[0].sourceUrl },
        variants: {
          nodes: p.variants.map((v) => ({
            id: `gid://shopify/ProductVariant/${v.id}`,
            title: v.title,
            selectedOptions: Object.entries(v.options).map(([name, value]) => ({
              name,
              value,
            })),
            price: { amount: v.price!.amount, currencyCode: v.price!.currency },
          })),
          pageInfo: { hasNextPage: false },
        },
      },
    ]),
  );
const response = (value: unknown) =>
  new Response(JSON.stringify(value), {
    headers: { "content-type": "application/json" },
  });

describe("catalog identity, photographs and factual snapshots", () => {
  it("clears only the selected catalog image identity when a campaign photo is overridden or removed", () => {
    const product = catalogChoiceProduct(cosmicCatalog(), choice);
    const original = structuredClone(product);
    const unchanged = withProductPhotoOverride(product, product.photo);
    expect(unchanged.catalog?.imageId).toBe(original.catalog?.imageId);
    const owned = withProductPhotoOverride(
      product,
      "data:image/png;base64,OWNED",
    );
    expect(owned.catalog?.imageId).toBeUndefined();
    expect(owned.catalog).toEqual({ ...original.catalog, imageId: undefined });
    expect(owned.photo).toContain("OWNED");
    expect(
      withProductPhotoOverride(product, "").catalog?.imageId,
    ).toBeUndefined();
    expect(product).toEqual(original);
  });
  it("restoring a catalog image preserves manual factual overrides and replaces only photo provenance", () => {
    const store = cosmicCatalog(),
      brand = catalogSelectionBrand(store, [choice], cosmicBrand());
    const product = brand.products[0];
    product.description = "Visitor-corrected factual description";
    product.facts = ["Visitor-confirmed fact"];
    brand.products[0] = withProductPhotoOverride(
      product,
      "data:image/png;base64,OWNED",
    );
    brand.products[0].sourceIds.push("owned-photo");
    brand.sources.push({
      id: "owned-photo",
      role: "product-photo",
      included: true,
      title: "Owned",
      retrievedAt: "2026-10-05",
      image: "data:image/png;base64,OWNED",
    });
    const restored = catalogPhotoSelectionBrand(
      store,
      { ...choice, imageId: "solar-surge-scene" },
      brand,
    );
    expect(restored.products[0].description).toBe(product.description);
    expect(restored.products[0].facts).toEqual(product.facts);
    expect(restored.products[0].photo).toBe(store.products[0].images[0].src);
    expect(restored.products[0].catalog?.imageId).toBe("solar-surge-scene");
    expect(restored.products[0].catalog?.variantId).toBe(choice.variantId);
    expect(restored.products[0].sourceIds).not.toContain("owned-photo");
    expect(brand.products[0].photo).toContain("OWNED");
  });
  it("includes four sourced products, real prices and only variant-matched product photographs", () => {
    const catalog = cosmicCatalog();
    expect(catalog.products).toHaveLength(4);
    expect(catalog.sourceType).toBe("bundled-snapshot");
    expect(
      catalog.products[1].variants.find((v) => v.id === "49335344431406")
        ?.price,
    ).toEqual({ amount: "22.00", currency: "USD" });
    for (const product of catalog.products) {
      expect(product.images[0].classification).toBe("product-photo");
      expect(
        matchingProductImages(product, product.defaultVariantId),
      ).toHaveLength(1);
      expect(product.url).toMatch(
        /^https:\/\/cosmiccatcoffeeco.com\/products\//,
      );
      expect(
        readFileSync(`public${product.images[0].src}`).length,
      ).toBeGreaterThan(1_000_000);
      expect(
        readFileSync(`public${product.images[0].thumbnail}`).length,
      ).toBeLessThan(45_000);
    }
  });
  it("scopes identical product ids and names to separate stores", () => {
    const first = cosmicCatalog(),
      second = { ...cosmicCatalog(), id: "other-store", name: "Other store" };
    const a = catalogChoiceProduct(first, choice),
      b = catalogChoiceProduct(second, choice);
    expect(a.name).toBe(b.name);
    expect(a.id).not.toBe(b.id);
    expect(a.id).toBe(catalogProductKey("cosmic-cat", "solar-surge"));
  });
  it("never substitutes a logo, another variant or a saved URL for a photograph", () => {
    const catalog = cosmicCatalog();
    const other = catalogChoiceProduct(catalog, {
      ...choice,
      variantId: "51057535287598",
    });
    expect(other.photo).toBe("");
    expect(other.size).toBe("2lb / Whole Bean");
    expect(other.catalog?.price?.amount).toBe("46.00");
    catalog.products[0].images[0].classification = "logo";
    expect(catalogChoiceProduct(catalog, choice).photo).toBe("");
  });
  it("switches explicitly selected matching image and captures its provenance", () => {
    const catalog = cosmicCatalog(),
      p = catalog.products[0];
    p.images.push({
      ...p.images[0],
      id: "owned-alternate",
      src: "data:image/png;base64,OWNED",
      sourceUrl: "https://example.com/owned-photo",
    });
    const selected = catalogSelectionBrand(
      catalog,
      [{ ...choice, imageId: "owned-alternate" }],
      cosmicBrand(),
    );
    expect(selected.products[0].photo).toContain("OWNED");
    expect(selected.products[0].catalog?.imageId).toBe("owned-alternate");
    expect(
      selected.sources.some(
        (source) => source.url === "https://example.com/owned-photo",
      ),
    ).toBe(true);
  });
  it("keeps selected facts independent of mutable catalogs and keeps included brand references", () => {
    const catalog = cosmicCatalog(),
      brand = catalogSelectionBrand(catalog, [choice], cosmicBrand());
    catalog.products[0].title = "Changed catalog title";
    catalog.products[0].variants[0].price!.amount = "90.00";
    expect(brand.products[0].name).toBe("Solar Surge");
    expect(brand.products[0].catalog?.price?.amount).toBe("21.00");
    expect(
      brand.sources.some(
        (source) => source.id === "cosmic-logo" && source.included,
      ),
    ).toBe(true);
  });
  it("refreshes only explicit changed choices while retaining unaffected snapshots", () => {
    const original = cosmicCatalog(),
      brand = catalogSelectionBrand(
        original,
        [choice, { productId: "candy-cane", variantId: "49335344431406" }],
        cosmicBrand(),
      );
    const refreshed = cosmicCatalog();
    refreshed.snapshotAt = "2026-10-06";
    refreshed.products.forEach((p) => {
      p.snapshotAt = "2026-10-06";
      p.description = "New catalog description";
    });
    const changed = catalogSelectionBrand(
      refreshed,
      [
        { ...choice, variantId: "49506598027566" },
        { productId: "candy-cane", variantId: "49335344431406" },
      ],
      brand,
      true,
    );
    expect(changed.products[0].catalog?.variantId).toBe("49506598027566");
    expect(changed.products[0].photo).toBe("");
    expect(changed.products[1]).toEqual(brand.products[1]);
    const updated = catalogSelectionBrand(
      refreshed,
      [choice, { productId: "candy-cane", variantId: "49335344431406" }],
      brand,
    );
    expect(updated.products[1].description).toBe("New catalog description");
  });
  it("merges partial refreshes, honors complete removal and keeps old missing product facts", () => {
    const original = cosmicCatalog(),
      selected = catalogSelectionBrand(original, [choice], cosmicBrand());
    const incoming = cosmicCatalog();
    incoming.products = [incoming.products[1]];
    incoming.completeness = "partial";
    incoming.snapshotAt = "2026-10-06";
    const partial = replaceCatalog([original], incoming)[0];
    expect(partial.products).toHaveLength(4);
    expect(
      partial.products.find((p) => p.id === "solar-surge")?.snapshotAt,
    ).toBe("2026-10-05");
    const complete = replaceCatalog([original], {
      ...incoming,
      completeness: "complete",
    })[0];
    expect(complete.products).toHaveLength(1);
    expect(selected.products[0].name).toBe("Solar Surge");
    expect(() => catalogSelectionBrand(complete, [choice], selected)).toThrow(
      "no longer available",
    );
  });
  it("reads legacy selections without migrating or erasing their campaign facts", () => {
    const original = cosmicBrand(),
      before = structuredClone(original);
    expect(
      choicesFromBrand(cosmicCatalog(), original, ["cosmic-solar-surge"]),
    ).toEqual([choice]);
    expect(
      choicesFromBrand({ ...cosmicCatalog(), id: "another" }, original, [
        "cosmic-solar-surge",
      ]),
    ).toEqual([]);
    expect(original).toEqual(before);
  });
  it("persists catalog separately while preserving an active draft and older schema-2 state", async () => {
    const state = freshStudioState(),
      b = cosmicBrand();
    state.newDraft = { brand: b, brief: freshBrief(b) };
    const persistence = new StudioMemoryPersistence(state),
      engine = new StudioEngine(persistence);
    await engine.initialize();
    await engine.saveCatalogs([cosmicCatalog()]);
    expect(engine.getSnapshot().newDraft).toEqual(state.newDraft);
    const reopened = new StudioEngine(persistence);
    await reopened.initialize();
    expect(reopened.getSnapshot().catalogs?.[0].products).toHaveLength(4);
    expect(reopened.getSnapshot().newDraft).toEqual(state.newDraft);
  });
});

describe("bounded local catalog files", () => {
  it("accepts the documented file, missing images, duplicates across stores and inert description text", () => {
    const source = template();
    source.products[0].description = "<script>untrusted text</script>";
    const parsed = parseCatalogFile(JSON.stringify(source));
    expect(parsed.sourceType).toBe("catalog-file");
    expect(parsed.id).toBe("file:your-store");
    expect(parsed.products[0].description).toContain("<script>");
    expect(parsed.products[0].images).toEqual([]);
    expect(parsed.notice).toContain("No URL was fetched");
  });
  it("rejects remote/active image data, credentials, oversized files and duplicate identities", () => {
    const source = template();
    source.products[0].images = [
      {
        id: "photo",
        src: "https://tracker.example/image.png",
        alt: "Photo",
        classification: "product-photo",
        variantIds: ["standard"],
      },
    ];
    expect(() => parseCatalogFile(JSON.stringify(source))).toThrow(
      "Embed owned PNG/JPEG",
    );
    source.products[0].images[0].src = "data:image/svg+xml;base64,PHN2Zz4=";
    expect(() => parseCatalogFile(JSON.stringify(source))).toThrow(
      "Embed owned PNG/JPEG",
    );
    source.products[0].images = [];
    source.url = "https://user:secret@example.com/";
    expect(() => parseCatalogFile(JSON.stringify(source))).toThrow(
      "without credentials",
    );
    expect(() => parseCatalogFile("x".repeat(4_000_001))).toThrow("under 4 MB");
    const duplicated = template();
    duplicated.products.push(duplicated.products[0]);
    expect(() => parseCatalogFile(JSON.stringify(duplicated))).toThrow(
      "duplicate ids",
    );
  });
  it("rejects unknown default variants and excessive products without modifying the prior catalog", () => {
    const prior = cosmicCatalog(),
      before = structuredClone(prior),
      source = template();
    source.products[0].defaultVariantId = "missing";
    expect(() => parseCatalogFile(JSON.stringify(source))).toThrow(
      "Default variant",
    );
    const oversized = template();
    oversized.products = Array.from({ length: 21 }, (_, i) => ({
      ...oversized.products[0],
      id: `item-${i}`,
    }));
    expect(() => parseCatalogFile(JSON.stringify(oversized))).toThrow(
      "at most 20",
    );
    expect(prior).toEqual(before);
  });
});

describe("explicit public Shopify reads", () => {
  it("queries only four known products without tokens, cookies, redirects or writes", async () => {
    const fetcher = vi.fn(async () => response({ data: publicData() }));
    const result = await readCosmicPublicCatalog(
      fetcher,
      new Date("2026-10-05T14:00:00Z"),
    );
    expect(result.sourceType).toBe("public-storefront");
    expect(result.products).toHaveLength(4);
    expect(result.snapshotAt).toBe("2026-10-05T14:00:00.000Z");
    const [url, options] = fetcher.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ];
    expect(url).toBe(cosmicPublicEndpoint);
    expect(options.credentials).toBe("omit");
    expect(options.redirect).toBe("error");
    expect(options.headers).toEqual({ "Content-Type": "application/json" });
    const query = JSON.parse(String(options.body)).query;
    expect(query).not.toMatch(/mutation|customer|order|token|cart/i);
    expect(query.match(/product\(handle:/g)).toHaveLength(4);
    expect(result.products[0].images[0].src).toMatch(/^\/brand\//);
    expect(result.products[0].images[0].retrievedAt).toBe("2026-10-03");
  });
  it("preserves previous catalog on network, empty, invalid and oversized responses", async () => {
    const prior = cosmicCatalog(),
      before = structuredClone(prior);
    await expect(
      readCosmicPublicCatalog(async () => {
        throw new TypeError("Failed to fetch");
      }),
    ).rejects.toThrow("previous catalog is preserved");
    await expect(
      readCosmicPublicCatalog(async () => response({ data: {} })),
    ).rejects.toThrow("No curated products");
    await expect(
      readCosmicPublicCatalog(async () =>
        response({ errors: [{ message: "Denied" }] }),
      ),
    ).rejects.toThrow("could not complete");
    await expect(
      readCosmicPublicCatalog(async () =>
        response({ padding: "x".repeat(130_000) }),
      ),
    ).rejects.toThrow("120 KB");
    expect(prior).toEqual(before);
  });
  it("marks partial responses, merges unlisted products and does not invent image mappings", async () => {
    const data = publicData();
    data.p1 = null as never;
    data.p0.variants.nodes[0].title = "Different package";
    const result = await readCosmicPublicCatalog(async () =>
      response({ data }),
    );
    expect(result.completeness).toBe("partial");
    expect(result.products).toHaveLength(3);
    expect(result.products[0].variants[0].imageId).toBeUndefined();
    expect(
      matchingProductImages(
        result.products[0],
        result.products[0].variants[0].id,
      ),
    ).toHaveLength(0);
    expect(replaceCatalog([cosmicCatalog()], result)[0].products).toHaveLength(
      4,
    );
  });
  it("retains unlisted variants and original image mappings when Shopify reports another variant page", async () => {
    const data = publicData();
    data.p1.variants.nodes = data.p1.variants.nodes.slice(0, 1);
    data.p1.variants.pageInfo.hasNextPage = true;
    const result = await readCosmicPublicCatalog(
      async () => response({ data }),
      new Date("2026-10-06T12:00:00Z"),
    );
    const merged = replaceCatalog([cosmicCatalog()], result)[0];
    const candy = merged.products.find((p) => p.id === "candy-cane")!;
    expect(candy.variants).toHaveLength(4);
    const retained = candy.variants.find((v) => v.id === "49335344431406")!;
    expect(retained.snapshotAt).toBe("2026-10-05");
    expect(matchingProductImages(candy, retained.id)).toHaveLength(1);
    const selected = catalogChoiceProduct(merged, {
      productId: candy.id,
      variantId: retained.id,
    });
    expect(selected.catalog?.variantSnapshotAt).toBe("2026-10-05");
    expect(selected.catalog?.factsSnapshotAt).toBe("2026-10-05");
    expect(selected.catalog?.snapshotAt).toBe("2026-10-06T12:00:00.000Z");
  });
});
