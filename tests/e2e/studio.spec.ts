import { test, expect, type Page } from "@playwright/test";
import { readFile, mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { unzipSync, strFromU8 } from "fflate";
import type {
  StudioAsset,
  StudioCampaign,
  StudioState,
} from "../../src/domain/studio";
import type { buildStudioExport } from "../../src/export/studio";
import {
  compositionLayout,
  containPhoto,
  photoSlots,
  inspectRaster,
} from "../../src/providers/composition";

type Manifest = ReturnType<typeof buildStudioExport>["manifest"];
const errors = new WeakMap<Page, string[]>(),
  requests = new WeakMap<Page, string[]>();
const origins = new WeakMap<Page, string>();
const version = (asset: StudioAsset) =>
  asset.versions.find((v) => v.id === asset.currentVersionId)!;
const assetCard = (page: Page, asset: StudioAsset) =>
  page.getByRole("article").filter({
    has: page.getByRole("heading", { name: asset.title, exact: true }),
  });
const section = (page: Page, name: string) =>
  page
    .getByRole("navigation", { name: "Campaign sections" })
    .getByRole("button", { name, exact: true });
const description = (page: Page) =>
  page.getByLabel(
    "Describe the campaign, the feeling you want, and what you want customers to do.",
    { exact: true },
  );

function watch(page: Page, owner = page) {
  page.on("pageerror", (error) => errors.get(owner)!.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.get(owner)!.push(message.text());
  });
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (
      !["data:", "blob:"].includes(url.protocol) &&
      url.origin !== origins.get(owner)
    )
      requests.get(owner)!.push(request.url());
  });
}
test.beforeEach(({ page, baseURL }) => {
  errors.set(page, []);
  requests.set(page, []);
  origins.set(page, new URL(baseURL!).origin);
  watch(page);
});
test.afterEach(({ page }) => {
  expect(
    errors.get(page),
    "No browser exceptions or React/console errors",
  ).toEqual([]);
  expect(
    requests.get(page),
    "No workflow requests outside this origin",
  ).toEqual([]);
});

async function readRecord<T>(page: Page, key: string): Promise<T> {
  return page.evaluate(async (key) => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open("orbit-studio-public-v1");
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    return new Promise<T>((resolve, reject) => {
      const request = database
        .transaction("state", "readonly")
        .objectStore("state")
        .get(key);
      request.onsuccess = () => {
        database.close();
        resolve(request.result);
      };
      request.onerror = () => {
        database.close();
        reject(request.error);
      };
    });
  }, key);
}
const state = (page: Page) => readRecord<StudioState>(page, "studio-v2");
const campaign = async (page: Page) => (await state(page)).campaigns[0];

async function home(page: Page) {
  await page.goto("./");
  await expect(
    page.getByRole("button", {
      name: "Explore a finished campaign",
      exact: true,
    }),
  ).toBeEnabled();
  await expect(
    page.getByRole("img", {
      name: "Finished Cosmic Cat Christmas creative family",
      exact: true,
    }),
  ).toBeVisible();
}
async function explore(page: Page) {
  await home(page);
  await page
    .getByRole("button", { name: "Explore a finished campaign", exact: true })
    .click();
  await expect(section(page, "Creative family")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Review asset", exact: true }),
  ).toHaveCount(15);
  return campaign(page);
}
async function start(
  page: Page,
  title: string,
  text: string,
  websiteOnly = false,
) {
  await home(page);
  await page
    .getByRole("button", { name: "Create a campaign", exact: true })
    .click();
  await page.getByLabel("Campaign name", { exact: true }).fill(title);
  await description(page).fill(text);
  if (websiteOnly)
    for (const name of ["Google Ads", "Meta Ads"])
      await page.getByRole("button", { name: new RegExp(name) }).click();
}
async function plan(page: Page) {
  await page
    .getByRole("button", { name: "Review creative plan", exact: true })
    .click();
  await expect(
    page.getByRole("heading", {
      name: "Confirm the direction before creation.",
      exact: true,
    }),
  ).toBeVisible();
}
async function create(page: Page, count: number) {
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
  ).toHaveCount(count);
  await expect(
    page.getByRole("button", { name: "Pause creation", exact: true }),
  ).toBeHidden();
  return campaign(page);
}
async function review(page: Page, asset: StudioAsset) {
  await assetCard(page, asset)
    .getByRole("button", { name: "Review asset", exact: true })
    .click();
  const dialog = page.getByRole("dialog", { name: asset.title, exact: true });
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText("Product & source fidelity");
  const heading = await dialog.locator("header small").textContent();
  const match = heading?.match(/^Version (\d+) · (.+)$/);
  expect(
    match,
    "Exact version identity displayed to the reviewer",
  ).toBeTruthy();
  return { dialog, id: match![2], number: Number(match![1]) };
}
async function closeReview(page: Page) {
  await page
    .getByRole("button", { name: "Close asset review", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toBeHidden();
}
async function approve(page: Page, asset: StudioAsset) {
  const current = await review(page, asset);
  await current.dialog
    .getByRole("button", { name: "Approve", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toBeHidden();
  await expect(assetCard(page, asset)).toContainText("Approved");
  return current.id;
}
async function packet(page: Page) {
  const downloading = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Export approved portfolio", exact: true })
    .click();
  const downloaded = await downloading,
    path = await downloaded.path();
  expect(path).toBeTruthy();
  const files = unzipSync(new Uint8Array(await readFile(path!)));
  return {
    files,
    manifest: JSON.parse(strFromU8(files["manifest.json"])) as Manifest,
  };
}
function checkPacket(
  result: Awaited<ReturnType<typeof packet>>,
  current: StudioCampaign,
  displayed: Record<string, string>,
) {
  for (const entry of result.manifest.assets) {
    const asset = current.assets.find((a) => a.id === entry.assetId)!;
    expect(entry.versionId).toBe(displayed[entry.assetId]);
    expect(entry.versionId).toBe(asset.approval?.versionId);
    expect(entry.versionId).toBe(version(asset).id);
    expect(entry.versionNumber).toBe(version(asset).number);
    expect(result.files[entry.filename]).toBeTruthy();
    if (version(asset).raster) {
      const raster = version(asset).raster!;
      expect(Buffer.from(result.files[entry.filename])).toEqual(
        Buffer.from(raster.dataUrl.split(",")[1], "base64"),
      );
      expect(
        inspectRaster(
          `data:${raster.mime};base64,${Buffer.from(result.files[entry.filename]).toString("base64")}`,
        ),
      ).toMatchObject({
        width: raster.width,
        height: raster.height,
        bytes: raster.bytes,
      });
    }
  }
  expect(result.files["copy-field-mapping.csv"]).toBeTruthy();
  expect(result.files["brand-provenance.json"]).toBeTruthy();
}
async function capture(
  page: Page,
  name: string,
  project: string,
  fullPage = true,
) {
  if (process.env.ORBIT_CAPTURE_STUDIO_GALLERY !== "1") return;
  const directory =
    project === "desktop" ? "docs/images" : "../_work/v2-narrow";
  await mkdir(directory, { recursive: true });
  await expect(page.locator(".studio-toast")).toBeHidden({ timeout: 5_000 });
  await page.evaluate(() =>
    window.scrollTo({ top: 0, left: 0, behavior: "instant" }),
  );
  await page.screenshot({ path: `${directory}/${name}.png`, fullPage });
}

async function checkLandingHero(page: Page, device: "desktop" | "mobile") {
  const image = page.getByRole("img", {
    name: `Intended ${device} website hero`,
    exact: true,
  });
  await expect(image).toBeVisible();
  const [bounds, container, natural] = await Promise.all([
    image.boundingBox(),
    page.locator(".studio .landing-hero").boundingBox(),
    image.evaluate((img: HTMLImageElement) => ({
      width: img.naturalWidth,
      height: img.naturalHeight,
    })),
  ]);
  expect(bounds).toBeTruthy();
  expect(container).toBeTruthy();
  expect(Math.abs(bounds!.width - container!.width)).toBeLessThanOrEqual(2);
  expect(bounds!.width / bounds!.height).toBeCloseTo(
    natural.width / natural.height,
    2,
  );
}

test("finished example, intentional selected approvals, targeted revision, exact ZIP and destinations", async ({
  page,
}, info) => {
  test.setTimeout(90_000);
  await home(page);
  await capture(page, "v2-01-home", info.project.name);
  const image = page.getByRole("img", {
    name: "Finished Cosmic Cat Christmas creative family",
    exact: true,
  });
  expect(
    await image.evaluate((img: HTMLImageElement) => img.naturalWidth),
  ).toBe(1200);
  await page
    .getByRole("button", { name: "Explore a finished campaign", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Review asset", exact: true }),
  ).toHaveCount(15);
  let item = await campaign(page);
  expect(item.mode).toBe("prebuilt-sample");
  expect(item.assets.every((a) => !a.approval)).toBe(true);
  expect(item.assets.filter((a) => a.kind === "image")).toHaveLength(12);
  await capture(page, "v2-03-family", info.project.name);
  const displayed: Record<string, string> = {};
  for (const asset of item.assets.slice(0, 2)) {
    const inspected = await review(page, asset);
    displayed[asset.id] = inspected.id;
    await closeReview(page);
    await assetCard(page, asset).getByRole("checkbox").check();
  }
  await page
    .getByRole("button", { name: "Approve selected (2)", exact: true })
    .click();
  await expect(assetCard(page, item.assets[1])).toContainText("Approved");
  let current = await campaign(page);
  expect(current.assets.filter((a) => a.approval)).toHaveLength(2);
  const untouched = current.assets[1].approval;
  const changed = item.assets[0],
    inspected = await review(page, changed);
  await inspected.dialog
    .getByLabel("Request a specific revision", { exact: true })
    .fill("More space around the product, with centered framing");
  await inspected.dialog
    .getByRole("button", { name: "Request revision", exact: true })
    .click();
  await expect(inspected.dialog.locator("header small")).toContainText(
    "Version 2",
  );
  await expect(
    inspected.dialog.getByRole("button", { name: "Approve", exact: true }),
  ).toBeEnabled();
  current = await campaign(page);
  expect(current.assets[0].approval).toBeUndefined();
  expect(current.assets[1].approval).toEqual(untouched);
  expect(version(current.assets[0]).recipe?.composition).toBe("product-center");
  expect(current.assets.slice(1).map((a) => a.currentVersionId)).toEqual(
    item.assets.slice(1).map((a) => a.currentVersionId),
  );
  await closeReview(page);
  displayed[changed.id] = await approve(page, changed);
  for (const asset of item.assets.slice(2))
    displayed[asset.id] = await approve(page, asset);
  current = await campaign(page);
  expect(current.assets.filter((a) => a.approval)).toHaveLength(15);
  await expect(
    page.getByRole("button", {
      name: "Export approved portfolio",
      exact: true,
    }),
  ).toBeEnabled();
  await page
    .getByRole("combobox", { name: "Export destination", exact: true })
    .selectOption("website");
  const website = await packet(page);
  expect(website.manifest.destination).toBe("website");
  expect(website.manifest.assets).toHaveLength(7);
  expect(
    website.manifest.assets
      .filter((a) => a.filename.endsWith(".jpg") || a.filename.endsWith(".png"))
      .every((a) => a.placements.every((p) => p.startsWith("website-"))),
  ).toBe(true);
  checkPacket(website, current, displayed);
  await page
    .getByRole("combobox", { name: "Export destination", exact: true })
    .selectOption("all");
  const all = await packet(page);
  expect(all.manifest.assets).toHaveLength(15);
  checkPacket(all, current, displayed);
  const url = page.url();
  await page.reload();
  await expect(section(page, "Creative family")).toBeVisible();
  expect(page.url()).toBe(url);
  item = await campaign(page);
  expect(item.assets.map((a) => a.approval?.versionId)).toEqual(
    current.assets.map((a) => a.approval?.versionId),
  );
  await section(page, "Landing page").click();
  await expect(
    page.getByRole("img", {
      name: "Intended desktop website hero",
      exact: true,
    }),
  ).toBeVisible();
  await checkLandingHero(page, "desktop");
  await capture(page, "v2-05-landing", info.project.name);
  await page.getByRole("button", { name: "Mobile", exact: true }).click();
  await checkLandingHero(page, "mobile");
  expect(
    await page
      .getByRole("img", { name: "Intended mobile website hero", exact: true })
      .evaluate((img: HTMLImageElement) => img.naturalWidth),
  ).toBe(900);
});

test("new Christmas and summer families change real artwork while preserving the same product", async ({
  page,
}, info) => {
  test.setTimeout(90_000);
  const created: StudioCampaign[] = [];
  for (const scenario of [
    {
      title: "Christmas coffee gifting",
      text: "Vibrant Christmas lights, premium coffee gifting, warm festive photography. Preserve the original product photo.",
      mood: "festive",
    },
    {
      title: "A quieter summer launch",
      text: "Minimalist summer launch, cool light, no holiday motifs. Preserve the same coffee photo and use generous negative space.",
      mood: "cool",
    },
  ]) {
    await start(page, scenario.title, scenario.text, true);
    if (scenario.mood === "festive")
      await capture(page, "v2-02-brief", info.project.name);
    await plan(page);
    await expect(page.locator(".interpretation")).toContainText(
      "Local photo composition",
    );
    const item = await create(page, 7);
    created.push(item);
    expect(item.plan.directions.map((d) => d.mood)).toEqual([
      scenario.mood,
      scenario.mood,
    ]);
    expect(item.mode).toBe("local-composition");
    expect(item.assets.filter((a) => a.kind === "image")).toHaveLength(4);
    expect(
      item.assets.filter((a) => a.kind === "image").map((a) => a.placementId),
    ).toEqual([
      "website-desktop",
      "website-mobile",
      "website-desktop",
      "website-mobile",
    ]);
    for (const asset of item.assets.filter((a) => a.kind === "image")) {
      const current = version(asset),
        raster = current.raster!;
      expect(current.recipe?.productIds).toEqual(["cosmic-solar-surge"]);
      expect(current.recipe?.productPhotos).toEqual([
        "/brand/cosmic-cat/solar-surge.png",
      ]);
      expect(current.id).toMatch(/^[a-f0-9-]{36}$/i);
      expect(inspectRaster(raster.dataUrl)).toMatchObject({
        width: raster.width,
        height: raster.height,
        mime: "image/png",
      });
    }
    if (scenario.mood === "cool")
      await capture(page, "v2-06-contrast", info.project.name);
  }
  expect(created[0].brief.productIds).toEqual(created[1].brief.productIds);
  expect(
    created[0].assets
      .filter((a) => a.kind === "image")
      .every(
        (a, i) =>
          version(a).raster!.dataUrl !==
          version(created[1].assets.filter((a) => a.kind === "image")[i])
            .raster!.dataUrl,
      ),
  ).toBe(true);
  expect(created[0].plan.copy.headlines[0]).toContain("Christmas");
  expect(created[1].plan.copy.headlines[0]).not.toContain("Christmas");
  const protectedAsset = created[1].assets.find((a) => a.kind === "image")!,
    raster = version(protectedAsset).raster!,
    recipe = version(protectedAsset).recipe!;
  const bounds = containPhoto(
    1200,
    1200,
    photoSlots(compositionLayout(recipe).photo, 1)[0],
  );
  const mismatches = await page.evaluate(
    async ({ dataUrl, bounds, origin }) => {
      const output = new Image();
      output.src = dataUrl;
      await output.decode();
      const original = new Image();
      original.src = `${origin}/orbit-agentic-commerce/brand/cosmic-cat/solar-surge.png`;
      await original.decode();
      const canvas = document.createElement("canvas");
      canvas.width = output.naturalWidth;
      canvas.height = output.naturalHeight;
      const context = canvas.getContext("2d")!;
      context.drawImage(output, 0, 0);
      const actual = context.getImageData(
        0,
        0,
        canvas.width,
        canvas.height,
      ).data;
      context.clearRect(0, 0, canvas.width, canvas.height);
      context.drawImage(
        original,
        bounds.x,
        bounds.y,
        bounds.width,
        bounds.height,
      );
      const expected = context.getImageData(
        0,
        0,
        canvas.width,
        canvas.height,
      ).data;
      let differences = 0;
      for (
        let y = Math.ceil(bounds.y) + 2;
        y < bounds.y + bounds.height - 2;
        y += Math.max(1, Math.floor(bounds.height / 24))
      )
        for (
          let x = Math.ceil(bounds.x) + 2;
          x < bounds.x + bounds.width - 2;
          x += Math.max(1, Math.floor(bounds.width / 24))
        ) {
          const i = (y * canvas.width + x) * 4;
          for (let c = 0; c < 4; c++)
            if (actual[i + c] !== expected[i + c]) {
              differences++;
              break;
            }
        }
      return differences;
    },
    { dataUrl: raster.dataUrl, bounds, origin: origins.get(page)! },
  );
  expect(mismatches, "Original packaging pixels were not repainted").toBe(0);
  await start(
    page,
    "Unseen phrasing limits",
    "A seaside July introduction with spare framing, chilled blue tones and open space. Keep seasonal ornaments out.",
    true,
  );
  await plan(page);
  await expect(page.locator(".interpretation")).toContainText(
    /bounded|local interpretation/i,
  );
  await expect(page.locator(".interpretation")).toContainText(
    /arbitrary.*configured|arbitrary.*service/i,
  );
  expect((await state(page)).draft?.plan?.mode).toBe("local-composition");
});

test("raw typing, commas, newlines, zero and blank inputs survive immediate planning and history", async ({
  page,
}, info) => {
  await start(page, "Latest input draft", "", true);
  const text =
    'A cool coastal launch. "Fresh, clear, coffee!"\nKeep the original bag visible and leave room to breathe.';
  await description(page).pressSequentially(text, { delay: 1 });
  await expect(description(page)).toHaveValue(text);
  expect(
    await description(page).evaluate(
      (element: HTMLTextAreaElement) =>
        document.activeElement === element &&
        element.selectionStart === element.value.length,
    ),
  ).toBe(true);
  await page
    .getByText("Audience, offer, timing & constraints", { exact: true })
    .click();
  await page
    .getByLabel("Audience", { exact: true })
    .fill("Coffee lovers — new and returning");
  await page
    .getByRole("textbox", { name: "Required phrases in ad copy", exact: true })
    .fill("Coffee, worth sharing\nA cup for today\n");
  await page
    .getByRole("textbox", { name: "Prohibited phrases", exact: true })
    .fill("Guaranteed perfection\n");
  await page
    .getByText("Budget planning & optional assumptions", { exact: true })
    .click();
  await page.getByLabel("Total budget", { exact: true }).fill("0");
  await page.getByLabel("Margin % assumption", { exact: true }).fill("0");
  await page.getByLabel("Target CPA assumption", { exact: true }).fill("0");
  await page.getByLabel("Target CPA assumption", { exact: true }).fill("");
  await page
    .getByLabel("Campaign themes / keywords", { exact: true })
    .fill("cool, clear, ");
  await plan(page);
  let draft = (await state(page)).draft!;
  expect(draft.brief.description).toBe(text);
  expect(draft.brief.keywords).toEqual(["cool", "clear"]);
  expect(draft.brief.rawInputs?.keywords).toBe("cool, clear, ");
  expect(draft.brief.rawInputs?.requiredPhrases).toBe(
    "Coffee, worth sharing\nA cup for today\n",
  );
  expect(draft.brief.budget.total).toBe(0);
  expect(draft.brief.budget.marginPercent).toBe(0);
  expect(draft.brief.budget.targetCpa).toBeNull();
  expect(draft.plan?.copy.longHeadlines).toContain("Coffee, worth sharing");
  await page.goBack();
  await expect(description(page)).toHaveValue(text);
  await expect(page).toHaveURL(/#\/create\/brief$/);
  await expect(
    page.getByLabel("Campaign themes / keywords", { exact: true }),
  ).toHaveValue("cool, clear, ");
  await page.goForward();
  await expect(page).toHaveURL(/#\/create\/plan$/);
  await expect(
    page.getByRole("heading", {
      name: "Confirm the direction before creation.",
      exact: true,
    }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Orbit Home", exact: true }).click();
  await expect(
    page.getByRole("button", {
      name: "Explore a finished campaign",
      exact: true,
    }),
  ).toBeEnabled();
  await page
    .getByRole("navigation", { name: "Primary navigation" })
    .getByRole("button", { name: "Campaigns", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Continue brief", exact: true })
    .click();
  await expect(description(page)).toHaveValue(text);
  await expect(page.locator(".capability-mode")).toContainText(
    "Browser-local work",
  );
  await page.reload();
  await expect(description(page)).toHaveValue(text);
  draft = (await state(page)).draft!;
  expect(draft.brief.audience).toBe("Coffee lovers — new and returning");
});

test("conflicts, invalid dates and allocation totals are actionable and block creation", async ({
  page,
}) => {
  await start(
    page,
    "Conflicting constraints",
    "Minimalist summer launch, no holiday motifs.",
  );
  await page
    .getByText("Audience, offer, timing & constraints", { exact: true })
    .click();
  await page
    .getByRole("textbox", { name: "Required phrases in ad copy", exact: true })
    .fill("Guaranteed perfection");
  await page
    .getByRole("textbox", { name: "Prohibited phrases", exact: true })
    .fill("Guaranteed perfection");
  await page
    .getByRole("button", { name: "Review creative plan", exact: true })
    .click();
  await expect(page.getByRole("alert")).toContainText(
    /required phrase.*prohibited/i,
  );
  await expect(
    page.getByRole("button", { name: "Create creative family", exact: true }),
  ).toHaveCount(0);
  await page
    .getByRole("textbox", { name: "Required phrases in ad copy", exact: true })
    .fill("");
  await page
    .getByRole("textbox", { name: "Prohibited phrases", exact: true })
    .fill("");
  await page.getByLabel("Start date", { exact: true }).fill("2026-12-10");
  await page.getByLabel("End date", { exact: true }).fill("2026-12-01");
  await page
    .getByRole("button", { name: "Review creative plan", exact: true })
    .click();
  await expect(page.getByRole("alert")).toContainText(/end date.*on or after/i);
  await page.getByLabel("End date", { exact: true }).fill("2026-12-12");
  await page
    .getByText("Budget planning & optional assumptions", { exact: true })
    .click();
  await page.getByLabel("Total budget", { exact: true }).fill("100");
  await page
    .getByLabel("Google Ads allocation (lifetime)", { exact: true })
    .fill("20");
  await page
    .getByRole("button", { name: "Review creative plan", exact: true })
    .click();
  await expect(page.getByRole("alert")).toContainText(
    /allocations must add up/i,
  );
});

test("owned brand facts and raster upload work while public import stays honestly unavailable", async ({
  page,
}) => {
  await start(
    page,
    "Owned brand draft",
    "Editorial coffee campaign using my confirmed product photo.",
    true,
  );
  await page
    .getByRole("button", { name: "Website, references & photos", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Use your brand", exact: true })
    .click();
  await page
    .getByLabel("Brand name", { exact: true })
    .fill("Acceptance Coffee");
  await page
    .getByLabel("Public website", { exact: true })
    .fill("https://example.invalid/");
  await page
    .getByText("Import a public website or reference", { exact: true })
    .click();
  await page
    .getByRole("textbox", {
      name: "Website, product, collection or reference URLs",
      exact: true,
    })
    .fill("https://example.invalid/product\nhttps://example.invalid/reference");
  await expect(
    page.getByRole("button", { name: "Import public pages", exact: true }),
  ).toBeDisabled();
  await expect(page.locator(".brand-workspace")).toContainText(
    "A saved URL alone is not an imported reference.",
  );
  await page.getByRole("button", { name: "Add product", exact: true }).click();
  await page.getByLabel("Product name", { exact: true }).fill("Audit Roast");
  await page
    .getByLabel("Package size / variant", { exact: true })
    .fill("12 oz ground coffee");
  await page
    .getByLabel("Confirmed factual description", { exact: true })
    .fill("Medium roast ground coffee. Pictured 12 oz bag.");
  const upload = page.getByLabel("Upload photo for Audit Roast", {
    exact: true,
  });
  await upload.setInputFiles({
    name: "active.svg",
    mimeType: "image/svg+xml",
    buffer: Buffer.from(
      '<svg xmlns="http://www.w3.org/2000/svg"><script>throw Error("active-upload")</script></svg>',
    ),
  });
  await expect(page.getByRole("alert")).toContainText(/PNG.*JPEG|raster/i);
  await page
    .getByRole("button", { name: "Dismiss error", exact: true })
    .click();
  await page.evaluate(() => {
    const decode = window.createImageBitmap;
    window.createImageBitmap = ((
      ...args: Parameters<typeof createImageBitmap>
    ) =>
      new Promise((resolve) => setTimeout(resolve, 600)).then(() =>
        decode(...args),
      )) as typeof createImageBitmap;
  });
  await upload.setInputFiles(
    resolve("public/brand/cosmic-cat/solar-surge.png"),
  );
  const currentFacts =
    "Medium roast ground coffee. Updated pictured 12 oz bag facts.";
  await page
    .getByRole("textbox", {
      name: "Confirmed factual description",
      exact: true,
    })
    .fill(currentFacts);
  await expect(
    page.getByText("Visitor-owned photo · locally decoded and re-encoded", {
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("textbox", {
      name: "Confirmed factual description",
      exact: true,
    }),
  ).toHaveValue(currentFacts);
  await page
    .getByRole("checkbox", {
      name: "I confirm these facts and may use this photo.",
      exact: true,
    })
    .check();
  await page
    .getByRole("button", { name: "Save brand & return", exact: true })
    .click();
  await expect(description(page)).toBeVisible();
  await page.locator(".product-tray").getByRole("checkbox").check();
  await plan(page);
  const saved = await state(page);
  expect(saved.brands).toHaveLength(1);
  expect(saved.draft!.brand.products[0].confirmed).toBe(true);
  expect(saved.draft!.brand.products[0].photo).toMatch(
    /^data:image\/png;base64,/,
  );
  expect(saved.draft!.brand.sources.every((s) => !s.url)).toBe(true);
  expect(saved.draft!.brand.products[0].description).toBe(currentFacts);
  await page
    .getByRole("navigation", { name: "Primary navigation" })
    .getByRole("button", { name: "Brand library", exact: true })
    .click();
  await page
    .getByRole("article")
    .filter({
      has: page.getByText(
        "Visitor-owned photo · locally decoded and re-encoded",
        { exact: true },
      ),
    })
    .getByRole("button", { name: "Remove source", exact: true })
    .click();
  await expect(page.getByText("Upload a photo", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("checkbox", {
      name: "I confirm these facts and may use this photo.",
      exact: true,
    }),
  ).not.toBeChecked();
  await page
    .getByRole("button", { name: "Save brand & return", exact: true })
    .click();
  const removed = (await state(page)).draft!.brand;
  expect(removed.products[0].photo).toBe("");
  expect(removed.products[0].confirmed).toBe(false);
  expect(removed.sources.some((source) => source.image)).toBe(false);
});

test("a failed step retains unrelated approvals and resumes only the missing output", async ({
  page,
}) => {
  await start(
    page,
    "Partial recovery",
    "Cool summer framing with the approved coffee photo.",
    true,
  );
  await page
    .getByText("Capability mode & developer tools", { exact: true })
    .click();
  await page
    .getByRole("checkbox", {
      name: "Developer test: fail one image step",
      exact: true,
    })
    .check();
  await plan(page);
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
    page.getByRole("button", { name: "Resume missing outputs", exact: true }),
  ).toBeEnabled();
  const before = await campaign(page);
  expect(before.assets.filter((a) => a.currentVersionId)).toHaveLength(6);
  expect(before.assets[0].versions).toHaveLength(0);
  const untouched = before.assets[1];
  const reviewed = await approve(page, untouched);
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Resume missing outputs", exact: true }),
  ).toBeEnabled();
  await page
    .getByRole("button", { name: "Resume missing outputs", exact: true })
    .click();
  await expect(
    page
      .getByRole("button", { name: "Review asset", exact: true })
      .and(page.locator(":enabled")),
  ).toHaveCount(7);
  await expect(
    page.getByRole("button", { name: "Pause creation", exact: true }),
  ).toBeHidden();
  const after = await campaign(page);
  expect(after.assets.every((a) => a.versions.length === 1)).toBe(true);
  expect(after.assets[1].approval?.versionId).toBe(reviewed);
  expect(after.assets.slice(1).map((a) => a.currentVersionId)).toEqual(
    before.assets.slice(1).map((a) => a.currentVersionId),
  );
});

test("mid-run refresh keeps checkpoint identities and resumes without duplicate versions", async ({
  page,
}) => {
  await start(
    page,
    "Refresh recovery",
    "Minimal coffee with cool coastal light.",
    true,
  );
  await plan(page);
  let loads = 0;
  await page.route("**/brand/cosmic-cat/solar-surge.png", async (route) => {
    loads++;
    if (loads >= 2) await new Promise((resolve) => setTimeout(resolve, 1500));
    try {
      await route.continue();
    } catch {}
  });
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
  ).toHaveCount(1);
  const before = await campaign(page),
    checkpoint = before.assets[0].currentVersionId;
  expect(checkpoint).toBeTruthy();
  await page.reload();
  await page.unroute("**/brand/cosmic-cat/solar-surge.png");
  await expect(
    page.getByRole("button", { name: "Resume missing outputs", exact: true }),
  ).toBeEnabled();
  expect((await campaign(page)).assets[0].currentVersionId).toBe(checkpoint);
  await page
    .getByRole("button", { name: "Resume missing outputs", exact: true })
    .click();
  await expect(
    page
      .getByRole("button", { name: "Review asset", exact: true })
      .and(page.locator(":enabled")),
  ).toHaveCount(7);
  await expect(
    page.getByRole("button", { name: "Pause creation", exact: true }),
  ).toBeHidden();
  const after = await campaign(page);
  expect(after.assets.every((a) => a.versions.length === 1)).toBe(true);
  expect(after.assets[0].currentVersionId).toBe(checkpoint);
});

test("family headline edits recreate dependent overlays and preserve unrelated approvals", async ({
  page,
}) => {
  await explore(page);
  const before = await campaign(page);
  const plain = before.assets.find((a) => a.placementId === "google-square")!,
    overlay = before.assets.find((a) => a.placementId === "website-desktop")!;
  const plainId = await approve(page, plain);
  await approve(page, overlay);
  await page
    .getByRole("button", { name: "Edit family direction", exact: true })
    .click();
  await page
    .getByLabel("Placement headline", { exact: true })
    .first()
    .fill("Share a coffee moment");
  await create(page, 15);
  const after = await campaign(page);
  expect(after.assets.find((a) => a.id === plain.id)?.approval?.versionId).toBe(
    plainId,
  );
  expect(after.assets.find((a) => a.id === plain.id)?.versions).toHaveLength(1);
  const changed = after.assets.find((a) => a.id === overlay.id)!;
  expect(changed.versions).toHaveLength(2);
  expect(changed.approval).toBeUndefined();
  expect(version(changed).recipe?.headline).toBe("Share a coffee moment");
  expect(
    after.assets.find(
      (a) =>
        a.placementId === "website-desktop" && a.familyId === "direction-2",
    )?.versions,
  ).toHaveLength(1);
});

test("dialog keyboard containment, visible approval, navigation and narrow layout", async ({
  page,
}, info) => {
  const item = await explore(page);
  const asset = item.assets.find((a) => a.placementId === "website-desktop")!;
  const button = assetCard(page, asset).getByRole("button", {
    name: "Review asset",
    exact: true,
  });
  const { dialog } = await review(page, asset);
  expect(
    await dialog.evaluate((element) =>
      element.contains(document.activeElement),
    ),
  ).toBe(true);
  await page.keyboard.press("Shift+Tab");
  await expect(
    dialog.getByRole("button", { name: "Approve", exact: true }),
  ).toBeFocused();
  const bounds = await dialog
    .getByRole("button", { name: "Approve", exact: true })
    .boundingBox();
  expect(bounds).toBeTruthy();
  expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(
    page.viewportSize()!.height,
  );
  await page.keyboard.press("Tab");
  await expect(
    dialog.getByRole("button", { name: "Close asset review", exact: true }),
  ).toBeFocused();
  await capture(page, "v2-04-review", info.project.name, false);
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(button).toBeFocused();
  await section(page, "Brief").click();
  const currentUrl = page.url();
  await page.goBack();
  await expect(section(page, "Creative family")).toBeVisible();
  await page.goForward();
  expect(page.url()).toBe(currentUrl);
  await expect(description(page)).toBeVisible();
  await page.goBack();
  await expect(section(page, "Creative family")).toBeVisible();
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > innerWidth + 1,
  );
  expect(overflow).toBe(false);
  await page.getByRole("button", { name: "Orbit Home", exact: true }).click();
  await expect(
    page.getByRole("button", {
      name: "Explore a finished campaign",
      exact: true,
    }),
  ).toBeEnabled();
});

test("V1 records remain verbatim and a second tab cannot overwrite local work", async ({
  page,
  context,
}) => {
  await page.goto("./?legacy=1");
  await page
    .getByRole("button", { name: "Try sample campaign", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Create portfolio", exact: true })
    .click();
  await expect(
    page
      .getByRole("button", { name: "Review asset", exact: true })
      .and(page.locator(":enabled")),
  ).toHaveCount(10);
  await expect(page.locator(".run-progress")).toBeHidden();
  const legacy = await readRecord<unknown>(page, "app");
  await page.goto("./#/campaigns");
  await expect(
    page.getByText("Preserved V1 campaigns (1)", { exact: true }),
  ).toBeVisible();
  expect(await readRecord<unknown>(page, "app")).toEqual(legacy);
  const second = await context.newPage();
  watch(second, page);
  await second.goto("./");
  await expect(
    second.getByRole("heading", {
      name: "One workspace at a time",
      exact: true,
    }),
  ).toBeVisible();
  expect(await readRecord<unknown>(page, "app")).toEqual(legacy);
  await second.close();
});

test("campaign draft association survives navigation and a fresh creation stays isolated", async ({
  page,
}) => {
  const original = await explore(page);
  await section(page, "Brief").click();
  const changed =
    "A saved iteration with cool light and a quieter product frame.";
  await description(page).fill(changed);
  await expect(page.locator(".capability-mode")).toContainText(
    "Browser-local work",
  );
  await page.getByRole("button", { name: "Orbit Home", exact: true }).click();
  await page
    .getByRole("navigation", { name: "Primary navigation" })
    .getByRole("button", { name: "Campaigns", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Continue brief", exact: true })
    .click();
  await expect(page).toHaveURL(new RegExp(`#/campaign/${original.id}/brief$`));
  await expect(description(page)).toHaveValue(changed);
  await page.getByRole("button", { name: "Orbit Home", exact: true }).click();
  await page
    .getByRole("button", { name: "Create a campaign", exact: true })
    .click();
  await expect(description(page)).toHaveValue("");
  await expect(page.getByLabel("Campaign name", { exact: true })).toHaveValue(
    "",
  );
  await page
    .getByLabel("Campaign name", { exact: true })
    .fill("An independent new campaign");
  await description(page).fill(
    "Cool coastal light for a fresh coffee introduction.",
  );
  for (const name of ["Google Ads", "Meta Ads"])
    await page.getByRole("button", { name: new RegExp(name) }).click();
  await plan(page);
  const created = await create(page, 7);
  expect(created.id).not.toBe(original.id);
  const saved = await state(page);
  expect(saved.campaigns).toHaveLength(2);
  expect(saved.campaigns.find((c) => c.id === original.id)?.brief).toEqual(
    original.brief,
  );
});

test("edited copy removes its approval, repairs the stale handoff and exports the reviewed version", async ({
  page,
}) => {
  test.setTimeout(90_000);
  const initial = await explore(page);
  const selected = initial.assets.filter(
    (a) =>
      a.kind === "copy" ||
      a.kind === "plan" ||
      a.placementId.startsWith("google-"),
  );
  const displayed: Record<string, string> = {};
  for (const asset of selected)
    displayed[asset.id] = await approve(page, asset);
  await page
    .getByRole("combobox", { name: "Export destination", exact: true })
    .selectOption("google");
  await expect(
    page.getByRole("button", {
      name: "Export approved portfolio",
      exact: true,
    }),
  ).toBeEnabled();
  const copy = initial.assets.find((a) => a.kind === "copy")!,
    handoff = initial.assets.find((a) => a.kind === "plan")!,
    inspected = await review(page, copy);
  await inspected.dialog
    .getByRole("textbox", { name: "headlines", exact: true })
    .fill(
      "Coffee, for Christmas\n=SUM(1,2)\nCoffee Moments\nExplore the Collection\nA Cup to Enjoy",
    );
  await inspected.dialog
    .getByRole("button", { name: "Save edited copy", exact: true })
    .click();
  await expect(inspected.dialog.locator("header small")).toContainText(
    "Version 2",
  );
  await closeReview(page);
  let current = await campaign(page);
  expect(
    current.assets.find((a) => a.kind === "copy")?.approval,
  ).toBeUndefined();
  expect(current.assets.find((a) => a.kind === "plan")?.stale).toBe(true);
  expect(
    current.assets
      .filter((a) => a.placementId.startsWith("google-"))
      .every((a) => a.approval?.versionId === displayed[a.id]),
  ).toBe(true);
  await expect(
    page.getByRole("button", {
      name: "Export approved portfolio",
      exact: true,
    }),
  ).toBeDisabled();
  displayed[copy.id] = await approve(page, copy);
  await page
    .getByRole("button", { name: "Recreate changed outputs", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Pause creation", exact: true }),
  ).toBeHidden();
  await expect(assetCard(page, handoff)).toContainText("Version 2");
  displayed[handoff.id] = await approve(page, handoff);
  current = await campaign(page);
  expect(current.assets.find((a) => a.kind === "copy")?.versions).toHaveLength(
    2,
  );
  await expect(
    page.getByRole("button", {
      name: "Export approved portfolio",
      exact: true,
    }),
  ).toBeEnabled();
  const output = await packet(page);
  expect(output.manifest.assets).toHaveLength(8);
  checkPacket(output, current, displayed);
  expect(strFromU8(output.files["copy-field-mapping.csv"])).toContain(
    '"\'=SUM(1,2)"',
  );
  expect(strFromU8(output.files["copy-v2.json"])).toContain(
    "Coffee, for Christmas",
  );
});
