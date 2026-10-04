/** Generates a key-free example through the actual StudioEngine and browser Canvas.
 * Run: node scripts/generate-studio-sample.mjs
 * IDs/time are fixture-fixed; Canvas bytes may vary across browser/font versions.
 * No merchant approvals, runtime browser data, external requests, or model calls.
 */
import { chromium } from "@playwright/test";
import { createServer } from "vite";
import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { createHash } from "node:crypto";

const project = fileURLToPath(new URL("../", import.meta.url));
const port = Number(process.env.ORBIT_SAMPLE_PORT || 5191);
const server = await createServer({
  root: project,
  server: { host: "127.0.0.1", port, strictPort: true },
});
let browser;
try {
  await server.listen();
  const origin = `http://127.0.0.1:${port}/orbit-agentic-commerce/`;
  browser = await chromium.launch();
  const context = await browser.newContext();
  const page = await context.newPage();
  const outside = [],
    errors = [];
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (
      !["data:", "blob:"].includes(url.protocol) &&
      url.origin !== new URL(origin).origin
    )
      outside.push(request.url());
  });
  page.on("pageerror", (error) => errors.push(error.message));
  // A raster document keeps the application and its private/local persistence out
  // of this fixture generation. Only the engine and public photos are imported.
  await page.goto(`${origin}brand/cosmic-cat/candy-cane.png`);
  const sample = await page.evaluate(async (origin) => {
    const { StudioEngine } = await import(
      `${origin}src/orchestration/studio.ts`
    );
    const { StudioMemoryPersistence } = await import(
      `${origin}src/persistence/studio.ts`
    );
    const { cosmicBrand, christmasSampleBrief, interpretLocalBrief } =
      await import(`${origin}src/fixtures/studio.ts`);
    const { renderComposition } = await import(
      `${origin}src/providers/composition/index.ts`
    );
    let sequence = 0;
    const engine = new StudioEngine(new StudioMemoryPersistence(), {
      id: () => `cosmic-sample-${String(++sequence).padStart(4, "0")}`,
      clock: () => new Date("2026-10-03T12:00:00.000Z"),
      render: (recipe, brand, signal) =>
        renderComposition(recipe, brand, signal, {
          mime: "image/jpeg",
          quality: 0.9,
        }),
    });
    await engine.initialize();
    const brand = cosmicBrand(),
      brief = christmasSampleBrief(brand);
    const plan = interpretLocalBrief(brief, brand, {
      generousSpace: true,
      tone: "",
    });
    plan.mode = "prebuilt-sample";
    plan.confirmed = true;
    plan.interpretation = `Prebuilt example: original Cosmic Cat product photography, bounded local planning and browser Canvas photo composition; no model calls. ${plan.interpretation}`;
    const campaign = await engine.create(brief, brand, plan, true);
    await engine.run(campaign.id);
    return structuredClone(engine.getSnapshot().campaigns[0]);
  }, origin);
  if (outside.length || errors.length)
    throw new Error(JSON.stringify({ outside, errors }));
  if (
    sample.assets.length !== 15 ||
    sample.assets.some(
      (asset) =>
        asset.approval ||
        asset.versions.length !== 1 ||
        !asset.currentVersionId ||
        asset.versions[0].findings.some((f) => f.severity === "error"),
    ) ||
    sample.runs.at(-1)?.status !== "completed"
  )
    throw new Error(
      "Sample outputs failed validation or retained an approval. No sample was written.",
    );
  const text = JSON.stringify(sample);
  const totalBytes = Buffer.byteLength(text);
  if (totalBytes > 5 * 1024 * 1024)
    throw new Error(
      `Sample exceeds the 5 MB transfer target (${totalBytes} bytes). Inspect JPEG quality before publishing.`,
    );
  const directory = resolve(project, "public/samples");
  const evidence = resolve(project, "../_work/v2-sample");
  await mkdir(directory, { recursive: true });
  await mkdir(evidence, { recursive: true });
  const images = sample.assets
    .filter((asset) => asset.kind === "image")
    .map((asset) => {
      const version = asset.versions[0],
        raster = version.raster;
      const bytes = Buffer.from(raster.dataUrl.split(",")[1], "base64");
      if (bytes.length !== raster.bytes || raster.mime !== "image/jpeg")
        throw new Error("Actual image bytes do not match sample metadata.");
      return {
        assetId: asset.id,
        versionId: version.id,
        width: raster.width,
        height: raster.height,
        mime: raster.mime,
        bytes: bytes.length,
        sha256: createHash("sha256").update(bytes).digest("hex"),
      };
    });
  await writeFile(resolve(directory, "cosmic-christmas.json"), text);
  const provenance = {
    generatedBy: "node scripts/generate-studio-sample.mjs",
    pipeline:
      "StudioEngine + interpretLocalBrief + renderComposition, in an isolated Chromium context",
    fixtureTime: "2026-10-03T12:00:00.000Z",
    mode: "prebuilt-sample",
    rendering:
      "Local photo composition; original full-frame Cosmic Cat photos, designed frames and drawn light accents. No generated photographed scene.",
    rasterEncoding:
      "Native placement dimensions, browser Canvas JPEG quality 0.90; no arbitrary downsampling.",
    approvals: 0,
    totalBytes,
    assetCount: sample.assets.length,
    imageCount: images.length,
    sources:
      "Owner-authorized bounded public snapshot in src/fixtures/cosmic-cat.ts; retrieved 2026-10-03.",
    reproducibility:
      "IDs, timestamps and input snapshot are fixed. Canvas/font/JPEG bytes can differ across browser or operating-system versions.",
  };
  await writeFile(
    resolve(directory, "cosmic-christmas.PROVENANCE.json"),
    JSON.stringify(provenance, null, 2),
  );
  await writeFile(
    resolve(evidence, "generation-report.json"),
    JSON.stringify(
      { ...provenance, images, outsideRequests: outside, errors },
      null,
      2,
    ),
  );
  for (const id of [
    "direction-1-google-square",
    "direction-1-website-desktop",
    "direction-2-website-mobile",
  ]) {
    const raster = sample.assets.find((asset) => asset.id === id)?.versions[0]
      .raster;
    if (raster)
      await writeFile(
        resolve(evidence, `${id}.jpg`),
        Buffer.from(raster.dataUrl.split(",")[1], "base64"),
      );
  }
  console.log(
    `Generated ${sample.assets.length} assets (${images.length} real JPEGs), zero approvals, ${totalBytes.toLocaleString()} bytes.`,
  );
  await context.close();
} finally {
  await browser?.close();
  await server.close();
}
