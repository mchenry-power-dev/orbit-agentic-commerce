import { test, expect, type Page } from "@playwright/test";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import sharp from "sharp";
import { unzipSync, strFromU8 } from "fflate";
import type {
  StudioState,
  StudioCampaign,
  StudioAsset,
} from "../../src/domain/studio";

const allowedPublicRead = new WeakSet<Page>();
const unexpected = new WeakMap<Page, string[]>();
const exceptions = new WeakMap<Page, string[]>();
test.beforeEach(({ page, baseURL }) => {
  unexpected.set(page, []);
  exceptions.set(page, []);
  page.on("pageerror", (error) => exceptions.get(page)!.push(error.message));
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (["data:", "blob:"].includes(url.protocol)) return;
    if (
      allowedPublicRead.has(page) &&
      url.hostname === "natures-nook-7929.myshopify.com" &&
      url.pathname === "/api/2026-10/graphql.json" &&
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
  expect(exceptions.get(page)).toEqual([]);
  expect(unexpected.get(page)).toEqual([]);
});
async function state(page: Page): Promise<StudioState> {
  return page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const r = indexedDB.open("orbit-studio-public-v1");
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
    });
    return new Promise<StudioState>((resolve, reject) => {
      const r = db.transaction("state").objectStore("state").get("studio-v2");
      r.onsuccess = () => {
        db.close();
        resolve(r.result);
      };
      r.onerror = () => reject(r.error);
    });
  });
}
const campaign = async (page: Page) => (await state(page)).campaigns[0];
const current = (asset: StudioAsset) =>
  asset.versions.find((v) => v.id === asset.currentVersionId)!;
const card = (page: Page, asset: StudioAsset) =>
  page.getByRole("article").filter({
    has: page.getByRole("heading", { name: asset.title, exact: true }),
  });
async function home(page: Page) {
  await page.goto("./");
  await expect(
    page.getByRole("button", {
      name: "Explore a finished campaign",
      exact: true,
    }),
  ).toBeEnabled();
}
async function explore(page: Page) {
  await home(page);
  await page
    .getByRole("button", { name: "Explore a finished campaign", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Review asset", exact: true }),
  ).toHaveCount(15, { timeout: 60_000 });
  return campaign(page);
}
async function approveAll(page: Page) {
  const checks = page.getByRole("checkbox", {
    name: /^Select .+ for approval$/,
  });
  for (let i = 0; i < (await checks.count()); i++) await checks.nth(i).check();
  await page
    .getByRole("button", { name: /^Approve selected \(\d+\)$/ })
    .click();
  await expect(
    page.getByRole("button", { name: "Approve selected (0)", exact: true }),
  ).toBeDisabled();
}
async function capture(
  page: Page,
  name: string,
  project: string,
  fullPage = true,
) {
  const directory = process.env.ORBIT_QUALITY_CAPTURE_DIRECTORY;
  if (!directory) return;
  const path = resolve(directory, project);
  await mkdir(path, { recursive: true });
  await page.screenshot({ path: resolve(path, `${name}.png`), fullPage });
}
async function verifyDownload(
  page: Page,
  trigger: () => Promise<unknown>,
  item: StudioCampaign,
) {
  const waiting = page.waitForEvent("download");
  await trigger();
  const download = await waiting;
  const path = await download.path();
  expect(path).toBeTruthy();
  const bytes = await readFile(path!);
  const files = unzipSync(bytes);
  const manifest = JSON.parse(strFromU8(files["manifest.json"]));
  for (const ref of manifest.assets) {
    const asset = item.assets.find((a) => a.id === ref.assetId)!;
    const version = current(asset);
    expect(ref.versionId).toBe(version.id);
    expect(asset.approval?.versionId).toBe(ref.versionId);
    expect(asset.stale).toBe(false);
    const exported = files[ref.filename];
    expect(exported).toBeTruthy();
    if (version.raster) {
      const meta = await sharp(exported).metadata();
      expect([meta.width, meta.height]).toEqual([
        version.raster.width,
        version.raster.height,
      ]);
      expect(Buffer.from(exported)).toEqual(
        Buffer.from(version.raster.dataUrl.split(",")[1], "base64"),
      );
    }
  }
  if (process.env.ORBIT_QUALITY_CAPTURE_DIRECTORY) {
    const dir = resolve(process.env.ORBIT_QUALITY_CAPTURE_DIRECTORY, "exports");
    await mkdir(dir, { recursive: true });
    await writeFile(resolve(dir, download.suggestedFilename()), bytes);
  }
  return { manifest, files };
}

test("catalog-first mobile journey: composition, exact revision, approval, handoff and download", async ({
  page,
}, info) => {
  test.setTimeout(120_000);
  await home(page);
  await capture(page, "home", info.project.name);
  await page
    .getByRole("button", { name: "Create a campaign", exact: true })
    .click();
  await expect(
    page.getByRole("combobox", { name: "Store", exact: true }),
  ).toHaveValue("cosmic-cat");
  await page
    .getByRole("combobox", { name: "Find products", exact: true })
    .fill("Candy");
  await expect(
    page.getByRole("option", {
      name: "Candy Cane, select product",
      exact: true,
    }),
  ).toBeVisible();
  await page
    .getByRole("option", { name: "Candy Cane, select product", exact: true })
    .click();
  await page
    .getByRole("button", {
      name: "Remove Solar Surge from selection",
      exact: true,
    })
    .click();
  const variant = page.getByRole("combobox", {
    name: "Variant for Candy Cane",
    exact: true,
  });
  await variant.selectOption("49335344333102");
  await expect(
    page.getByText("No approved photo depicts this variant.", { exact: false }),
  ).toBeVisible();
  await variant.selectOption("49335344431406");
  await expect(
    page.getByText("No approved photo depicts this variant.", { exact: false }),
  ).toBeHidden();
  await capture(page, "catalog", info.project.name);
  await page
    .getByLabel("Campaign name", { exact: true })
    .fill("Catalog holiday moment");
  await page
    .locator("#campaign-description")
    .fill(
      "A warm Christmas coffee moment. Preserve the packaging and use an editorial layout.",
    );
  await page
    .getByRole("button", { name: "Review creative plan", exact: true })
    .click();
  await expect(page.locator(".interpretation")).toContainText("Candy Cane");
  await page
    .getByRole("checkbox", {
      name: "I confirm these facts, directions, selected placements, and capability limits.",
      exact: true,
    })
    .check();
  await page
    .getByRole("button", { name: "Create creative family", exact: true })
    .click();
  await expect(
    page
      .getByRole("button", { name: "Review asset", exact: true })
      .and(page.locator(":enabled")),
  ).toHaveCount(15, { timeout: 60_000 });
  await expect(
    page.getByRole("button", { name: "Pause creation", exact: true }),
  ).toBeHidden();
  let item = await campaign(page);
  expect(item.brand.products[0].catalog?.variantId).toBe("49335344431406");
  const target = item.assets.find((a) => a.placementId === "website-mobile")!,
    previous = current(target);
  await card(page, target)
    .getByRole("button", { name: "Review asset", exact: true })
    .click();
  const dialog = page.getByRole("dialog", { name: target.title, exact: true });
  await dialog.getByText("Edit this placement", { exact: true }).click();
  await dialog
    .getByRole("combobox", { name: "Creative layout", exact: true })
    .selectOption("editorial");
  await dialog
    .getByLabel("Variant headline", { exact: true })
    .fill("A warm coffee moment");
  await dialog
    .getByRole("button", { name: "Recompose selected variant", exact: true })
    .click();
  await expect(dialog.locator("header small")).toContainText("Version 2");
  await capture(page, "mobile-review", info.project.name, false);
  item = await campaign(page);
  const revised = item.assets.find((a) => a.id === target.id)!;
  expect(current(revised).recipe).toMatchObject({
    headline: "A warm coffee moment",
    artDirection: "editorial",
  });
  expect(current(revised).raster!.dataUrl).not.toBe(previous.raster!.dataUrl);
  expect(revised.approval).toBeUndefined();
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await approveAll(page);
  await capture(page, "family", info.project.name);
  await page
    .getByRole("button", { name: "Preview channel publishing", exact: true })
    .click();
  const handoff = page.getByRole("dialog", {
    name: "Preview channel publishing",
    exact: true,
  });
  await handoff.getByRole("button", { name: /^Website assets/ }).click();
  await handoff
    .locator("footer")
    .getByRole("button", { name: "Map assets", exact: true })
    .click();
  await handoff
    .getByRole("button", { name: "Review readiness", exact: true })
    .click();
  await expect(
    handoff.getByRole("button", {
      name: "Create local demo handoff",
      exact: true,
    }),
  ).toBeEnabled();
  await handoff
    .getByRole("button", { name: "Create local demo handoff", exact: true })
    .click();
  await expect(handoff.getByRole("status")).toContainText(
    "Nothing was sent to your website",
  );
  await capture(page, "handoff", info.project.name, false);
  item = await campaign(page);
  expect(item.handoffs).toHaveLength(1);
  const packet = await verifyDownload(
    page,
    () =>
      handoff
        .getByRole("button", { name: "Download handoff package", exact: true })
        .click(),
    item,
  );
  expect(packet.manifest.published).toBe(false);
  expect(packet.manifest.assets.length).toBeGreaterThan(2);
  await page.keyboard.press("Escape");
  await expect(
    page.getByRole("button", {
      name: "Preview channel publishing",
      exact: true,
    }),
  ).toBeFocused();
  await page.reload();
  await expect(
    page.getByRole("button", {
      name: "Preview channel publishing",
      exact: true,
    }),
  ).toBeVisible();
  expect((await campaign(page)).handoffs).toEqual(item.handoffs);
  await page.getByRole("button", { name: "Orbit Home", exact: true }).click();
  await page.goBack();
  await page.goForward();
  await expect(
    page.getByRole("button", {
      name: "Explore a finished campaign",
      exact: true,
    }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth + 1,
    ),
  ).toBe(false);
});

test("channel mappings, blocked video, immutable handoffs and repeat completion", async ({
  page,
}, info) => {
  test.setTimeout(100_000);
  await explore(page);
  await approveAll(page);
  for (const destination of ["Google Ads", "Meta Ads", "TikTok Ads"]) {
    await page
      .getByRole("button", { name: "Preview channel publishing", exact: true })
      .click();
    const dialog = page.getByRole("dialog", {
      name: "Preview channel publishing",
      exact: true,
    });
    await dialog
      .getByRole("button", { name: new RegExp(`^${destination}`) })
      .click();
    await dialog
      .locator("footer")
      .getByRole("button", { name: "Map assets", exact: true })
      .click();
    if (destination === "Google Ads")
      await dialog
        .getByRole("checkbox", {
          name: "I reviewed this local business name and logo",
          exact: true,
        })
        .check();
    await dialog
      .getByRole("button", { name: "Review readiness", exact: true })
      .click();
    await dialog
      .getByText("Inspect destination structure and version references", {
        exact: true,
      })
      .click();
    const mapping = JSON.parse(
      await dialog.locator(".handoff-mapping pre").innerText(),
    );
    expect(JSON.stringify(mapping)).toContain("demo-");
    if (destination === "TikTok Ads") {
      await expect(
        dialog.getByRole("heading", { name: "Video required", exact: true }),
      ).toBeVisible();
      await expect(
        dialog.getByRole("button", {
          name: "Create local demo handoff",
          exact: true,
        }),
      ).toBeDisabled();
      const output = await verifyDownload(
        page,
        () =>
          dialog
            .getByRole("button", {
              name: "Download incomplete assets",
              exact: true,
            })
            .click(),
        await campaign(page),
      );
      expect(output.manifest.status).toBe("incomplete-asset-package");
    } else {
      const button = dialog.getByRole("button", {
        name: "Create local demo handoff",
        exact: true,
      });
      await expect(button).toBeEnabled();
      await button.evaluate((element: HTMLButtonElement) => {
        element.click();
        element.click();
      });
      await expect(dialog.getByRole("status")).toContainText(
        `Nothing was sent to ${destination}`,
      );
      const item = await campaign(page);
      expect(
        item.handoffs!.filter(
          (h) =>
            h.destination ===
            (destination === "Google Ads" ? "google" : "meta"),
        ),
      ).toHaveLength(1);
      await verifyDownload(
        page,
        () =>
          dialog
            .getByRole("button", {
              name: "Download handoff package",
              exact: true,
            })
            .click(),
        item,
      );
    }
    await capture(
      page,
      `handoff-${destination.split(" ")[0].toLowerCase()}`,
      info.project.name,
      false,
    );
    await dialog
      .getByRole("button", { name: "Close channel publishing", exact: true })
      .click();
  }
  const before = await campaign(page),
    target = before.assets.find((a) => a.placementId === "google-square")!;
  await card(page, target)
    .getByRole("button", { name: "Review asset", exact: true })
    .click();
  await page
    .getByLabel("Request a specific revision", { exact: true })
    .fill("More space around the product");
  await page
    .getByRole("button", { name: "Request revision", exact: true })
    .click();
  await expect(page.getByRole("dialog").locator("header small")).toContainText(
    "Version 2",
  );
  await page.keyboard.press("Escape");
  expect((await campaign(page)).handoffs).toEqual(before.handoffs);
});

test("failed public catalog read, safe import and switching stores preserve draft facts", async ({
  page,
}) => {
  await home(page);
  await page
    .getByRole("button", { name: "Create a campaign", exact: true })
    .click();
  await page
    .locator("#campaign-description")
    .fill("Keep this precise draft instruction.");
  const before = (await state(page)).newDraft!;
  await page.getByText("Catalog sources & import", { exact: true }).click();
  allowedPublicRead.add(page);
  await page.route(
    "https://natures-nook-7929.myshopify.com/api/2026-10/graphql.json",
    (route) => route.fulfill({ status: 503, body: "Unavailable" }),
  );
  await page
    .getByRole("button", {
      name: "Read public Cosmic Cat catalog",
      exact: true,
    })
    .click();
  await expect(page.locator(".catalog-warning[role=alert]")).toBeVisible();
  expect((await state(page)).newDraft!.brand).toEqual(before.brand);
  await expect(
    page.getByRole("option", { name: "Solar Surge, selected", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("checkbox", {
      name: "I have permission to use the product facts and images in my catalog file.",
      exact: true,
    })
    .check();
  await page.getByLabel("Import catalog JSON", { exact: true }).setInputFiles({
    name: "bad.json",
    mimeType: "application/json",
    buffer: Buffer.from('{"schemaVersion":1,"products":[]}'),
  });
  await expect(page.locator(".catalog-warning[role=alert]")).toBeVisible();
  expect((await state(page)).newDraft!.brand).toEqual(before.brand);
  await expect(page.locator("#campaign-description")).toHaveValue(
    "Keep this precise draft instruction.",
  );
});

test("offline sample smoke, five responsive widths and real approved downloads", async ({
  page,
  context,
}, info) => {
  test.setTimeout(100_000);
  await explore(page);
  await context.setOffline(true);
  for (const width of [360, 414, 768, 1366, 1536]) {
    await page.setViewportSize({ width, height: width === 1366 ? 768 : 900 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth + 1,
      ),
      `No overflow at ${width}`,
    ).toBe(false);
    await capture(page, `family-${width}`, info.project.name, false);
  }
  await approveAll(page);
  const item = await campaign(page);
  const packet = await verifyDownload(
    page,
    () =>
      page
        .getByRole("button", { name: "Download assets", exact: true })
        .click(),
    item,
  );
  expect(packet.manifest.assets).toHaveLength(15);
  expect(item.brand.products).toHaveLength(2);
  expect(new Set(item.plan.directions.map((d) => d.artDirection)).size).toBe(2);
  await context.setOffline(false);
});

test("storage failure explains a temporary fallback without deleting another project", async ({
  page,
}) => {
  await page.addInitScript(() => {
    localStorage.setItem("loom-quality-sentinel", "preserve");
    localStorage.setItem("enterprise-iq-quality-sentinel", "preserve");
    Object.defineProperty(indexedDB, "open", {
      value: () => {
        throw new Error("Storage unavailable for this test");
      },
    });
  });
  await page.goto("./");
  await page
    .getByRole("button", { name: "Use a temporary workspace", exact: true })
    .click();
  await expect(
    page.getByText("Temporary workspace · refresh or closing this tab", {
      exact: false,
    }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Explore a finished campaign", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Review asset", exact: true }),
  ).toHaveCount(15, { timeout: 60_000 });
  expect(
    await page.evaluate(() => [
      localStorage.getItem("loom-quality-sentinel"),
      localStorage.getItem("enterprise-iq-quality-sentinel"),
    ]),
  ).toEqual(["preserve", "preserve"]);
});
