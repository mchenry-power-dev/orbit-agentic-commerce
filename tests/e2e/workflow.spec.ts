import { test, expect, type Page, type Locator } from "@playwright/test";
import { readFile, mkdir } from "node:fs/promises";
import { unzipSync, strFromU8 } from "fflate";
import type { ExportManifest } from "../../src/domain";

const assetNames = [
  /Orbital still life/,
  /Editorial split/,
  /Quiet pedestal/,
  /Geometric collage/,
  /Horizon study/,
  /Typographic frame/,
  /Campaign copy/,
  /Landing-page content/,
  /Video concept brief/,
  /Blueprint and checklist/,
];

const card = (page: Page, name: RegExp) =>
  page.getByRole("article").filter({ hasText: name });
const exportButton = (page: Page) =>
  page.getByRole("button", { name: "Export approved portfolio", exact: true });
const readyReviews = (page: Page) =>
  page
    .getByRole("button", { name: "Review asset", exact: true })
    .and(page.locator(":enabled"));
const section = (page: Page, name: string) =>
  page
    .getByRole("navigation", { name: "Campaign sections" })
    .getByRole("button", { name: new RegExp(`^${name}`) });
const browserErrors = new WeakMap<Page, string[]>();
const networkCalls = new WeakMap<Page, string[]>();

test.beforeEach(({ page, baseURL }) => {
  const errors: string[] = [];
  const requests: string[] = [];
  browserErrors.set(page, errors);
  networkCalls.set(page, requests);
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (
      !["data:", "blob:"].includes(url.protocol) &&
      url.origin !== new URL(baseURL!).origin
    )
      requests.push(request.url());
  });
});

test.afterEach(({ page }) => {
  expect(
    browserErrors.get(page),
    "No page exceptions or console errors",
  ).toEqual([]);
  expect(
    networkCalls.get(page),
    "No workflow requests outside the configured demo origin",
  ).toEqual([]);
});

async function reopenCampaign(page: Page) {
  await page.getByRole("button", { name: /^A softer start to autumn/ }).click();
  await expect(section(page, "Portfolio")).toBeVisible();
}

async function closeReview(page: Page) {
  const dialog = page.getByRole("dialog");
  if (await dialog.isVisible())
    await dialog.getByRole("button", { name: /Close/ }).click();
  await expect(dialog).toBeHidden();
}

async function review(page: Page, name: RegExp): Promise<Locator> {
  await card(page, name)
    .getByRole("button", { name: "Review asset", exact: true })
    .click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText(/version/i);
  await expect(dialog).toContainText(/validation/i);
  return dialog;
}

async function approve(page: Page, name: RegExp) {
  const dialog = await review(page, name);
  await dialog.getByRole("button", { name: "Approve", exact: true }).click();
  await closeReview(page);
  await expect(card(page, name)).toContainText("Approved");
}

async function gallery(page: Page, name: string, project: string) {
  if (process.env.ORBIT_CAPTURE_GALLERY !== "1") return;
  const directory =
    project === "desktop" ? "docs/images" : "../_work/narrow-captures";
  await mkdir(directory, { recursive: true });
  await expect(page.locator(".toast")).toBeHidden({ timeout: 5_000 });
  if (name === "02-portfolio") {
    await page.getByRole("button", { name: "Images", exact: true }).click();
    await expect(page.getByRole("article")).toHaveCount(6);
  }
  await page.screenshot({
    path: `${directory}/${name}.png`,
    fullPage: project === "desktop" && name !== "04-review",
  });
  if (name === "02-portfolio")
    await page.getByRole("button", { name: "All assets", exact: true }).click();
}

async function startSample(page: Page, scenario?: string) {
  await page.goto("./?legacy=1");
  await expect(
    page.getByRole("button", { name: "Try sample campaign", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Try sample campaign", exact: true })
    .click();
  await expect(page.getByLabel("Audience", { exact: true })).toHaveValue(
    "Curious home coffee drinkers",
  );
  if (scenario) {
    await page.getByText(/Advanced settings/).click();
    await page
      .getByLabel("Provider scenario", { exact: true })
      .selectOption({ label: scenario });
  }
  await page
    .getByRole("button", { name: "Create portfolio", exact: true })
    .click();
}

test("sample campaign, targeted revision, exact-version review and real ZIP export", async ({
  page,
}, testInfo) => {
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.goto("./?legacy=1");
  await expect(
    page.getByText("Demo mode · Sample data · Simulated providers", {
      exact: true,
    }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Try sample campaign", exact: true })
    .click();
  await expect(page.getByLabel("Audience", { exact: true })).toHaveValue(
    "Curious home coffee drinkers",
  );
  await gallery(page, "01-brief", testInfo.project.name);
  await page
    .getByRole("button", { name: "Create portfolio", exact: true })
    .click();
  await expect(readyReviews(page)).toHaveCount(10);
  await expect(
    page.getByRole("status").filter({ hasText: "Creating your portfolio" }),
  ).toHaveCount(0);
  await expect(exportButton(page)).toBeDisabled();
  await gallery(page, "02-portfolio", testInfo.project.name);

  await approve(page, assetNames[0]);
  await approve(page, /Campaign copy/);
  const copyReview = await review(page, /Campaign copy/);
  await copyReview
    .getByRole("button", { name: "Copy short headlines 1", exact: true })
    .click();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
    "Coffee moments",
  );
  await copyReview
    .getByLabel("Revision request", { exact: true })
    .fill("Keep the calm tone and clarify the collection invitation.");
  await copyReview
    .getByRole("button", { name: "Request revision", exact: true })
    .click();
  await closeReview(page);
  await expect(card(page, /Campaign copy/)).toContainText(/(?:v|Version\s*)2/);
  await expect(exportButton(page)).toBeDisabled();
  await expect(card(page, assetNames[0])).toContainText(/Approved/);

  const reviewDialog = await review(page, assetNames[1]);
  await expect(reviewDialog).toContainText(/source|context/i);
  await gallery(page, "04-review", testInfo.project.name);
  await closeReview(page);
  for (const name of assetNames.slice(1)) await approve(page, name);
  await expect(exportButton(page)).toBeEnabled();

  await section(page, "Landing page").click();
  await expect(
    page.getByRole("heading", { name: /landing/i }).first(),
  ).toBeVisible();
  await gallery(page, "03-landing", testInfo.project.name);
  const briefDownloadPromise = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Download brief", exact: true })
    .click();
  const briefDownload = await briefDownloadPromise;
  expect(briefDownload.suggestedFilename()).toBe("orbit-campaign-brief.md");
  const briefPath = await briefDownload.path();
  expect(await readFile(briefPath!, "utf8")).toContain(
    "An autumn coffee ritual with warm light and generous space.",
  );
  await section(page, "Portfolio").click();

  const downloadPromise = page.waitForEvent("download");
  await exportButton(page).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/\.zip$/);
  const downloadPath = await download.path();
  expect(downloadPath).toBeTruthy();
  const files = unzipSync(new Uint8Array(await readFile(downloadPath!)));
  const manifest = JSON.parse(
    strFromU8(files["manifest.json"]),
  ) as ExportManifest;
  expect(manifest.mode).toBe("sample-data-simulated-providers");
  expect(manifest.assets).toHaveLength(10);
  expect(
    manifest.assets.find((asset) => asset.assetId === "copy")?.versionNumber,
  ).toBe(2);
  expect(
    manifest.assets
      .filter((asset) => asset.assetId !== "copy")
      .every((asset) => asset.versionNumber === 1),
  ).toBe(true);
  expect(
    manifest.assets.every(
      (asset) =>
        !!asset.approvedAt && !!asset.versionId && !!files[asset.filename],
    ),
  ).toBe(true);
  expect(
    Object.keys(files).every(
      (filename) =>
        !filename.includes("..") &&
        !filename.startsWith("/") &&
        !filename.includes("\\"),
    ),
  ).toBe(true);
  expect(
    Object.keys(files).filter((filename) => filename.endsWith(".svg")),
  ).toHaveLength(6);

  await page.reload();
  await reopenCampaign(page);
  await expect(exportButton(page)).toBeEnabled();
  await expect(card(page, /Campaign copy/)).toContainText(/(?:v|Version\s*)2/);
});

test("failed provider preserves approvals across refresh and resumes only the missing output", async ({
  page,
}) => {
  await startSample(page, "Definitive failure");
  await expect(page.getByText(/A provider step failed/)).toBeVisible();
  await expect(readyReviews(page)).toHaveCount(9);
  await approve(page, /Campaign copy/);
  await expect(exportButton(page)).toBeDisabled();
  await page.reload();
  await reopenCampaign(page);
  await expect(card(page, /Campaign copy/)).toContainText(/Approved/);
  await page.getByRole("button", { name: "Resume run", exact: true }).click();
  await expect(readyReviews(page)).toHaveCount(10);
  await expect(card(page, /Campaign copy/)).toContainText(/Approved/);
  for (const name of assetNames)
    await expect(card(page, name)).toContainText(/(?:v|Version\s*)1/);
});

test("required labels, modal focus, narrow layout and confirmed local reset", async ({
  page,
}) => {
  await startSample(page);
  await expect(readyReviews(page)).toHaveCount(10);
  const reviewButton = card(page, assetNames[0]).getByRole("button", {
    name: "Review asset",
    exact: true,
  });
  await reviewButton.click();
  await expect(page.getByRole("dialog")).toBeVisible();
  expect(
    await page
      .getByRole("dialog")
      .evaluate((dialog) => dialog.contains(document.activeElement)),
  ).toBe(true);
  await expect(
    page
      .getByRole("dialog")
      .getByRole("button", { name: "Approve", exact: true }),
  ).toBeInViewport();
  await page.keyboard.press("Shift+Tab");
  await expect(
    page
      .getByRole("dialog")
      .getByRole("button", { name: "Approve", exact: true }),
  ).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(
    page
      .getByRole("dialog")
      .getByRole("button", { name: "Close review", exact: true }),
  ).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toBeHidden();
  await expect(reviewButton).toBeFocused();
  await section(page, "Brief").click();
  expect(
    await page.locator("input:not([type=hidden]), textarea, select").count(),
  ).toBeGreaterThan(0);
  const unlabeledInputs = await page
    .locator("input:not([type=hidden]), textarea, select")
    .evaluateAll(
      (elements) =>
        elements.filter((element) => {
          const input = element as HTMLInputElement;
          return (
            !input.labels?.length &&
            !input.getAttribute("aria-label") &&
            !input.getAttribute("aria-labelledby")
          );
        }).length,
    );
  expect(unlabeledInputs).toBe(0);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth + 1,
    ),
  ).toBe(true);
  await section(page, "Portfolio").click();
  await page
    .getByRole("button", { name: "Brand context", exact: true })
    .click();
  page.once("dialog", (dialog) => dialog.dismiss());
  await page.getByRole("button", { name: /Reset sample data/i }).click();
  await expect(
    page.getByRole("button", { name: /Reset sample data/i }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Campaigns", exact: true }).click();
  await expect(readyReviews(page)).toHaveCount(10);
  await page
    .getByRole("button", { name: "Brand context", exact: true })
    .click();
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: /Reset sample data/i }).click();
  await expect(
    page.getByRole("button", { name: "Try sample campaign", exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Try sample campaign", exact: true }),
  ).toBeVisible();
});

test("editing approved copy creates an unapproved version and blocks unsupported claims", async ({
  page,
}) => {
  await startSample(page);
  await expect(readyReviews(page)).toHaveCount(10);
  await approve(page, /Campaign copy/);
  const dialog = await review(page, /Campaign copy/);
  await dialog.getByRole("button", { name: "Edit copy", exact: true }).click();
  await dialog
    .getByLabel("Short headlines 1", { exact: true })
    .fill("Guaranteed organic coffee");
  await dialog.getByRole("button", { name: "Save copy", exact: true }).click();
  await expect(dialog.getByTestId("asset-version")).toContainText("Version 2");
  await expect(dialog).toContainText("Unsupported claim vocabulary");
  await expect(
    dialog.getByRole("button", { name: "Approve", exact: true }),
  ).toBeDisabled();
  await closeReview(page);
  await expect(card(page, /Campaign copy/)).toContainText("Invalid");
  await expect(card(page, assetNames[0])).toContainText("Version 1");
  await expect(exportButton(page)).toBeDisabled();
});

test("refresh during generation recovers checkpoints without duplicating versions", async ({
  page,
}) => {
  await startSample(page);
  await expect(card(page, assetNames[0]).getByRole("img")).toBeVisible();
  await page.reload();
  await reopenCampaign(page);
  await expect(page.getByText(/The run was interrupted/)).toBeVisible();
  await expect(card(page, assetNames[0])).toContainText("Version 1");
  await page.getByRole("button", { name: "Resume run", exact: true }).click();
  await expect(readyReviews(page)).toHaveCount(10);
  for (const name of assetNames)
    await expect(card(page, name)).toContainText("Version 1");
});

test("saving a changed core brief and context invalidates the prior plan and approvals", async ({
  page,
}) => {
  await startSample(page);
  await expect(readyReviews(page)).toHaveCount(10);
  await approve(page, assetNames[0]);
  await section(page, "Brief").click();
  await page
    .getByLabel("Audience", { exact: true })
    .fill("Readers planning quiet winter mornings");
  await page
    .getByRole("checkbox", {
      name: "Include Existing collection page",
      exact: true,
    })
    .uncheck();
  await page.getByRole("button", { name: "Save brief", exact: true }).click();
  await expect(
    page.getByText("Brief saved. Previous assets now require regeneration.", {
      exact: true,
    }),
  ).toBeVisible();
  await section(page, "Portfolio").click();
  await expect(card(page, assetNames[0])).toContainText("Stale");
  await expect(card(page, assetNames[0])).not.toContainText("Approved");
  await expect(exportButton(page)).toBeDisabled();
  const staleReview = await review(page, assetNames[0]);
  await expect(
    staleReview.getByRole("button", { name: "Approve", exact: true }),
  ).toBeDisabled();
  await closeReview(page);
  await section(page, "Brief").click();
  await page
    .getByRole("button", { name: "Create portfolio", exact: true })
    .click();
  for (const name of assetNames)
    await expect(card(page, name)).toContainText("Version 2");
  const currentReview = await review(page, assetNames[0]);
  await expect(currentReview).not.toContainText("Existing collection page");
  await closeReview(page);
  await expect(exportButton(page)).toBeDisabled();
});

test("a second tab cannot acquire the active browser-local workspace", async ({
  page,
}) => {
  await startSample(page);
  await expect(readyReviews(page)).toHaveCount(10);
  const secondTab = await page.context().newPage();
  await secondTab.goto("./?legacy=1");
  await expect(
    secondTab.getByRole("heading", { name: "One workspace at a time" }),
  ).toBeVisible();
  await expect(
    secondTab.getByText(/prevents conflicting writes/),
  ).toBeVisible();
  await expect(
    secondTab.getByRole("button", { name: "Try sample campaign", exact: true }),
  ).toHaveCount(0);
  await secondTab.close();
  await expect(readyReviews(page)).toHaveCount(10);
});

test("the household preset coordinates a single selected product using changed brief fields", async ({
  page,
}) => {
  await page.goto("./?legacy=1");
  await page.getByRole("button", { name: /Harbor Home Goods/ }).click();
  await page.getByRole("checkbox", { name: /^Kitchen Brush/ }).uncheck();
  await page
    .getByLabel("Audience", { exact: true })
    .fill("People arranging simple cleaning cupboards");
  await page
    .getByLabel("Campaign direction", { exact: true })
    .fill("A winter collection with simple materials and generous space.");
  await page
    .getByLabel("Goal", { exact: true })
    .selectOption("Product spotlight");
  await page
    .getByRole("button", { name: "Create portfolio", exact: true })
    .click();
  await expect(readyReviews(page)).toHaveCount(10);
  const copy = await review(page, /Campaign copy/);
  await expect(copy).toContainText("Home essentials");
  await expect(copy).toContainText("Winter");
  await expect(copy).toContainText(
    "People arranging simple cleaning cupboards",
  );
  await expect(copy).toContainText("Everyday Cloths");
  await expect(copy).not.toContainText("Kitchen Brush");
  await closeReview(page);
  const landing = await review(page, /Landing-page content/);
  await expect(landing).toContainText("Everyday Cloths");
  await expect(landing).not.toContainText("Kitchen Brush");
  await expect(
    landing.getByRole("button", { name: "Approve", exact: true }),
  ).toBeEnabled();
  await closeReview(page);
});
