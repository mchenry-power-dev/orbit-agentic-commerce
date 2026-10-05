import { test, expect, type Page } from "@playwright/test";
import sharp from "sharp";
import { cosmicCatalog } from "../../src/fixtures/catalog";
import { cosmicPublicEndpoint } from "../../src/providers/catalog";
import type { StudioState } from "../../src/domain/studio";

const readsAllowed = new WeakSet<Page>();
const unexpected = new WeakMap<Page, string[]>(),
  errors = new WeakMap<Page, string[]>();
test.beforeEach(({ page, baseURL }) => {
  unexpected.set(page, []);
  errors.set(page, []);
  page.on("pageerror", (error) => errors.get(page)!.push(error.message));
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (["data:", "blob:"].includes(url.protocol)) return;
    if (
      readsAllowed.has(page) &&
      url.href === cosmicPublicEndpoint &&
      request.method() === "POST"
    )
      return;
    if (
      url.origin !== new URL(baseURL!).origin ||
      /\/v1\/(capabilities|plan|images|import|upload|reset)/.test(url.pathname)
    )
      unexpected.get(page)!.push(request.url());
  });
});
test.afterEach(({ page }) => {
  expect(errors.get(page)).toEqual([]);
  expect(unexpected.get(page)).toEqual([]);
});
async function state(page: Page): Promise<StudioState> {
  return page.evaluate(async () => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const r = indexedDB.open("orbit-studio-public-v1");
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
    });
    return new Promise<StudioState>((resolve, reject) => {
      const r = database
        .transaction("state")
        .objectStore("state")
        .get("studio-v2");
      r.onsuccess = () => {
        database.close();
        resolve(r.result);
      };
      r.onerror = () => reject(r.error);
    });
  });
}
async function begin(page: Page, saveSample = false) {
  await page.goto("./");
  await expect(
    page.getByRole("button", {
      name: "Explore a finished campaign",
      exact: true,
    }),
  ).toBeEnabled();
  if (saveSample) {
    await page
      .getByRole("button", { name: "Explore a finished campaign", exact: true })
      .click();
    await expect(
      page.getByRole("button", { name: "Review asset", exact: true }),
    ).toHaveCount(15);
    await page
      .getByRole("button", { name: "Home", exact: true })
      .first()
      .click();
  }
  await page
    .getByRole("button", { name: "Create a campaign", exact: true })
    .click();
  await expect(
    page.getByRole("combobox", { name: "Find products", exact: true }),
  ).toBeVisible();
}
const instructions = (page: Page) =>
  page.getByLabel(
    "Describe the campaign, the feeling you want, and what you want customers to do.",
    { exact: true },
  );
async function localFile(storeId: string, name: string) {
  const red = `data:image/png;base64,${(
    await sharp({
      create: { width: 600, height: 600, channels: 3, background: "#8e3547" },
    })
      .png()
      .toBuffer()
  ).toString("base64")}`;
  const blue = `data:image/png;base64,${(
    await sharp({
      create: { width: 600, height: 600, channels: 3, background: "#365e83" },
    })
      .png()
      .toBuffer()
  ).toString("base64")}`;
  return {
    schemaVersion: 1,
    id: storeId,
    name,
    url: `https://${storeId}.example.com`,
    snapshotAt: "2026-10-05",
    completeness: "complete",
    products: [
      {
        id: "shared-product",
        title: "Solar Surge",
        description: `${name} owns these synthetic test facts.`,
        facts: [`Source store: ${name}`],
        url: `https://${storeId}.example.com/product`,
        defaultVariantId: "standard",
        variants: [
          {
            id: "standard",
            title: "Standard",
            options: { grind: "Standard" },
            price: { amount: "12.00", currency: "USD" },
            imageId: "front",
          },
          {
            id: "whole",
            title: "Whole Bean",
            options: { grind: "Whole Bean" },
            price: { amount: "15.00", currency: "USD" },
            imageId: "whole-photo",
          },
        ],
        images: [
          {
            id: "front",
            src: red,
            alt: "Owned standard front photograph",
            classification: "product-photo",
            variantIds: ["standard"],
          },
          {
            id: "back",
            src: blue,
            alt: "Owned standard alternate photograph",
            classification: "product-photo",
            variantIds: ["standard"],
          },
          {
            id: "whole-photo",
            src: blue,
            alt: "Owned whole-bean photograph",
            classification: "product-photo",
            variantIds: ["whole"],
          },
        ],
      },
    ],
  };
}
async function importFile(page: Page, value: unknown) {
  const details = page.locator(".catalog-manage");
  if ((await details.getAttribute("open")) === null)
    await details.locator("summary").click();
  await page
    .getByRole("checkbox", {
      name: "I have permission to use the product facts and images in my catalog file.",
      exact: true,
    })
    .check();
  await page.getByLabel("Import catalog JSON", { exact: true }).setInputFiles({
    name: "owned-catalog.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(value)),
  });
}
function publicData() {
  return Object.fromEntries(
    cosmicCatalog().products.map((p, i) => [
      `p${i}`,
      {
        handle: p.id,
        title: p.title,
        description: `Public refreshed ${p.title} description`,
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
            price: { amount: "24.00", currencyCode: "USD" },
          })),
          pageInfo: { hasNextPage: false },
        },
      },
    ]),
  );
}

test("owned catalog import keeps store-scoped selections, variants, images and draft instructions", async ({
  page,
}) => {
  await begin(page, true);
  const priorCampaign = (await state(page)).campaigns[0];
  const brief =
    "A cool editorial launch. Keep this exact paragraph while changing stores.";
  await instructions(page).fill(brief);
  await importFile(page, await localFile("alpha", "Owned Alpha"));
  await expect(
    page
      .getByRole("status")
      .filter({ hasText: "Owned Alpha: 1 products loaded" }),
  ).toBeVisible();
  expect((await state(page)).newDraft?.brand.id).toBe("cosmic-cat");
  await page
    .getByRole("option", { name: "Solar Surge, select product", exact: true })
    .click();
  await expect
    .poll(async () => (await state(page)).newDraft?.brand.id)
    .toBe("file:alpha");
  const first = (await state(page)).newDraft!.brand.products[0];
  expect(first.id).toBe("file:alpha::shared-product");
  expect(first.photo).toMatch(/^data:image\/png;base64,/);
  await page
    .getByRole("combobox", { name: "Product image", exact: true })
    .selectOption("back");
  await expect
    .poll(
      async () =>
        (await state(page)).newDraft?.brand.products[0].catalog?.imageId,
    )
    .toBe("back");
  expect((await state(page)).newDraft!.brand.products[0].photo).not.toBe(
    first.photo,
  );
  await page
    .getByRole("combobox", { name: "Variant for Solar Surge", exact: true })
    .selectOption("whole");
  await expect
    .poll(
      async () =>
        (await state(page)).newDraft?.brand.products[0].catalog?.variantId,
    )
    .toBe("whole");
  expect(
    (await state(page)).newDraft!.brand.products[0].catalog?.price?.amount,
  ).toBe("15.00");
  await importFile(page, await localFile("beta", "Owned Beta"));
  await expect(
    page
      .getByRole("status")
      .filter({ hasText: "Owned Beta: 1 products loaded" }),
  ).toBeVisible();
  expect((await state(page)).newDraft?.brand.id).toBe("file:alpha");
  await page
    .getByRole("option", { name: "Solar Surge, select product", exact: true })
    .click();
  await expect
    .poll(async () => (await state(page)).newDraft?.brand.id)
    .toBe("file:beta");
  expect((await state(page)).newDraft!.brand.products[0].id).not.toBe(first.id);
  await expect(instructions(page)).toHaveValue(brief);
  expect((await state(page)).campaigns[0]).toEqual(priorCampaign);
  await page.reload();
  await expect(instructions(page)).toHaveValue(brief);
  await expect(
    page.getByRole("combobox", { name: "Store", exact: true }),
  ).toHaveValue("file:beta");
  expect((await state(page)).catalogs).toHaveLength(3);
  expect((await state(page)).campaigns[0]).toEqual(priorCampaign);
  await page
    .getByRole("combobox", { name: "Store", exact: true })
    .selectOption("file:alpha");
  expect((await state(page)).newDraft?.brand.id).toBe("file:beta");
  await expect(instructions(page)).toHaveValue(brief);
});

test("partial public refresh, explicit snapshot update and blocked read preserve unaffected work", async ({
  page,
}) => {
  await begin(page, true);
  const saved = (await state(page)).campaigns[0],
    before = (await state(page)).newDraft!.brand.products[0];
  const data = publicData();
  delete data.p1;
  data.p0.variants.nodes = data.p0.variants.nodes.slice(0, 1);
  data.p0.variants.pageInfo.hasNextPage = true;
  readsAllowed.add(page);
  await page.route(cosmicPublicEndpoint, (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      headers: { "access-control-allow-origin": "*" },
      body: JSON.stringify({ data }),
    }),
  );
  await page.locator(".catalog-manage summary").click();
  await page
    .getByRole("button", {
      name: "Read public Cosmic Cat catalog",
      exact: true,
    })
    .click();
  await expect(
    page
      .getByRole("status")
      .filter({ hasText: "Partial refresh retained unlisted products" }),
  ).toBeVisible();
  let current = await state(page);
  expect(current.catalogs?.[0].products).toHaveLength(4);
  expect(
    current.catalogs?.[0].products.find((p) => p.id === "solar-surge")
      ?.variants,
  ).toHaveLength(4);
  expect(current.newDraft!.brand.products[0]).toEqual(before);
  expect(current.campaigns[0]).toEqual(saved);
  await page
    .getByRole("button", { name: "Apply catalog updates", exact: true })
    .click();
  await expect
    .poll(
      async () => (await state(page)).newDraft?.brand.products[0].description,
    )
    .toBe("Public refreshed Solar Surge description");
  expect(
    (await state(page)).newDraft!.brand.products[0].catalog?.price?.amount,
  ).toBe("24.00");
  expect((await state(page)).campaigns[0]).toEqual(saved);
  current = await state(page);
  await page.unroute(cosmicPublicEndpoint);
  await page.route(cosmicPublicEndpoint, (route) =>
    route.fulfill({
      status: 403,
      contentType: "application/json",
      headers: { "access-control-allow-origin": "*" },
      body: JSON.stringify({ error: "Public read blocked" }),
    }),
  );
  await page
    .getByRole("button", {
      name: "Read public Cosmic Cat catalog",
      exact: true,
    })
    .click();
  await expect(
    page
      .locator(".catalog-warning")
      .filter({ hasText: "did not return a readable catalog" }),
  ).toBeVisible();
  const failed = await state(page);
  expect(failed.catalogs).toEqual(current.catalogs);
  expect(failed.newDraft).toEqual(current.newDraft);
  expect(failed.campaigns).toEqual(current.campaigns);
});

test("catalog file failures preserve selection and missing images remain explicit", async ({
  page,
}) => {
  await begin(page);
  const before = (await state(page)).newDraft!;
  const unsafe = await localFile("unsafe", "Unsafe file");
  unsafe.products[0].images[0].src = "https://unrequested.example/pixel.png";
  await importFile(page, unsafe);
  await expect(
    page
      .locator(".catalog-warning")
      .filter({ hasText: "Embed owned PNG/JPEG" }),
  ).toBeVisible();
  expect((await state(page)).newDraft).toEqual(before);
  const missing = await localFile("missing", "Missing photo store");
  missing.products[0].images = [];
  delete (missing.products[0].variants[0] as { imageId?: string }).imageId;
  delete (missing.products[0].variants[1] as { imageId?: string }).imageId;
  await importFile(page, missing);
  await expect(
    page
      .getByRole("status")
      .filter({ hasText: "Missing photo store: 1 products loaded" }),
  ).toBeVisible();
  await page
    .getByRole("option", { name: "Solar Surge, select product", exact: true })
    .click();
  await expect(
    page
      .locator(".catalog-warning")
      .filter({ hasText: "No approved photo depicts this variant" }),
  ).toBeVisible();
  expect((await state(page)).newDraft!.brand.products[0].photo).toBe("");
});

test("owned campaign photo and facts are labeled overrides without changing the catalog snapshot", async ({
  page,
}) => {
  await begin(page);
  const original = (await state(page)).newDraft!.brand.products[0];
  const catalogBefore = (await state(page)).catalogs;
  await page
    .getByRole("button", { name: "Website, references & photos", exact: true })
    .click();
  const bytes = await sharp({
    create: { width: 600, height: 600, channels: 3, background: "#336075" },
  })
    .png()
    .toBuffer();
  await page
    .getByLabel("Upload photo for Solar Surge", { exact: true })
    .setInputFiles({
      name: "owned-photo.png",
      mimeType: "image/png",
      buffer: bytes,
    });
  await expect
    .poll(async () =>
      (await state(page)).newDraft!.brand.products[0].photo.startsWith(
        "data:image/png;base64,",
      ),
    )
    .toBe(true);
  await page
    .getByRole("textbox", {
      name: "Confirmed factual description",
      exact: true,
    })
    .fill(
      "Medium roast coffee. Visitor-confirmed description for this campaign.",
    );
  await page
    .getByRole("checkbox", {
      name: "I confirm these facts and may use this photo.",
      exact: true,
    })
    .check();
  await page
    .getByRole("button", { name: "Save brand & return", exact: true })
    .click();
  await expect(
    page.getByText(
      "Campaign override: manually edited facts or photos apply to this draft. The store catalog and its source snapshot are unchanged.",
      { exact: true },
    ),
  ).toBeVisible();
  await expect(
    page.getByRole("img", {
      name: "Solar Surge · campaign photo override",
      exact: true,
    }),
  ).toBeVisible();
  const overridden = (await state(page)).newDraft!.brand.products[0];
  expect(overridden.catalog?.imageId).toBeUndefined();
  expect(overridden.catalog).toEqual({
    ...original.catalog,
    imageId: undefined,
  });
  expect(
    overridden.sourceIds.some((id) => id.startsWith("visitor-facts-")),
  ).toBe(true);
  expect((await state(page)).catalogs).toEqual(catalogBefore);
  await page
    .getByRole("combobox", { name: "Product image", exact: true })
    .selectOption("solar-surge-scene");
  await expect
    .poll(
      async () =>
        (await state(page)).newDraft!.brand.products[0].catalog?.imageId,
    )
    .toBe("solar-surge-scene");
  const restored = (await state(page)).newDraft!.brand.products[0];
  expect(restored.photo).toBe(original.photo);
  expect(restored.description).toBe(overridden.description);
  expect(restored.facts).toEqual(overridden.facts);
  await expect(
    page.getByRole("img", {
      name: "Solar Surge · campaign photo override",
      exact: true,
    }),
  ).toHaveCount(0);
  await expect(page.locator(".catalog-override-note")).toBeVisible();
  expect((await state(page)).catalogs).toEqual(catalogBefore);
});
