import { describe, expect, it, vi } from "vitest";
import { strFromU8, unzipSync } from "fflate";
import { OrbitEngine } from "../src/orchestration";
import { MemoryPersistence } from "../src/persistence";
import {
  createSampleBrief,
  buildContext,
  getMerchant,
  presets,
} from "../src/fixtures";
import { evaluationFixtures } from "../src/fixtures/evaluation";
import {
  adsCharacterCount,
  channelSpecs,
  validateAsset,
  validateBrief,
  validateClaims,
  validateContext,
} from "../src/validation";
import {
  buildCampaignBrief,
  buildExport,
  copyCsv,
  exportGate,
  safeFilename,
} from "../src/export";
import { clone, currentVersion } from "../src/domain";
import type { Campaign, CopyContent } from "../src/domain";

const clock = () => new Date("2026-10-03T12:00:00.000Z");
async function setup(delayMs = 0, timeoutMs = 1000, maxAttempts = 3) {
  let id = 0;
  const persistence = new MemoryPersistence(),
    engine = new OrbitEngine(persistence, {
      delayMs,
      timeoutMs,
      maxAttempts,
      clock,
      id: () => `test-${++id}`,
    });
  await engine.initialize();
  const campaign = await engine.createCampaign(createSampleBrief());
  return { engine, persistence, id: campaign.id };
}
const campaign = (engine: OrbitEngine, id: string) =>
  engine.getSnapshot().campaigns.find((item) => item.id === id)!;
async function approved() {
  const result = await setup();
  await result.engine.runCampaign(result.id);
  for (const asset of campaign(result.engine, result.id).assets)
    await result.engine.approveAsset(result.id, asset.spec.id);
  return result;
}
async function until(predicate: () => boolean) {
  for (let i = 0; i < 500; i++) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 2));
  }
  throw new Error("Condition did not become true.");
}
const errors = (value: Campaign) =>
  value.assets.flatMap(
    (asset) =>
      currentVersion(asset)?.validation.filter(
        (finding) => finding.severity === "error",
      ) ?? [],
  );

describe("brief, provenance and channel rules", () => {
  it("accepts fictional coffee and household briefs", () => {
    for (const preset of presets)
      expect(validateBrief(createSampleBrief(preset.id), preset)).toEqual([]);
  });
  it("rejects missing requirements, unknown products and out-of-range quantities", () => {
    const brief = createSampleBrief();
    brief.goal = " ";
    brief.audience = "";
    brief.productIds = ["unknown"];
    brief.quantities!.headlines = 2;
    expect(
      validateBrief(brief, getMerchant(brief.merchantId)).map(
        (item) => item.code,
      ),
    ).toEqual(
      expect.arrayContaining([
        "brief-required",
        "brief-products",
        "brief-quantity",
      ]),
    );
  });
  it("rejects conflicting phrase requirements", () => {
    const brief = {
      ...createSampleBrief(),
      requiredPhrases: ["Guaranteed quality"],
      prohibitedPhrases: ["guaranteed"],
    };
    expect(
      validateBrief(brief, getMerchant(brief.merchantId)).some(
        (item) => item.code === "brief-conflicting-phrase",
      ),
    ).toBe(true);
  });
  it("selects product provenance and permits optional-reference exclusion", () => {
    const brief = createSampleBrief(),
      context = buildContext(brief, ["page:aster-coffee", "unknown"]);
    expect(context.selectedIds).toContain("product:aster-dawn");
    expect(context.selectedIds).not.toContain("page:aster-coffee");
    expect(context.excludedIds).toEqual(["page:aster-coffee"]);
    expect(validateContext(brief, context)).toEqual([]);
  });
  it("blocks missing required packaging references", () => {
    const brief = createSampleBrief();
    expect(
      validateContext(brief, buildContext(brief, ["image:aster-dawn"]))[0].code,
    ).toBe("context-required");
  });
  it("finds prohibited and unsupported claims within the documented vocabulary", () => {
    const results = validateClaims(
      "Best ever, guaranteed organic coffee with clinically proven results.",
      createSampleBrief(),
    );
    expect(results.map((item) => item.code)).toContain("prohibited-phrase");
    expect(results.map((item) => item.code)).toContain("unsupported-claim");
  });
  it("uses current versioned channel limits including double-width scripts", () => {
    expect(channelSpecs.headlines.maxLength).toBe(30);
    expect(channelSpecs.longHeadlines.maxLength).toBe(90);
    expect(channelSpecs.descriptions.min).toBe(3);
    expect(adsCharacterCount("Tea 茶 コーヒー 커피")).toBe(20);
  });
  it("reports copy counts, lengths and a missing short headline", async () => {
    const { engine, id } = await setup();
    await engine.runCampaign(id);
    const value = campaign(engine, id),
      asset = value.assets.find((item) => item.spec.id === "copy")!,
      content = clone(currentVersion(asset)!.content as CopyContent);
    content.headlines = ["x".repeat(31), "y".repeat(31)];
    content.longHeadlines = [];
    content.descriptions = ["短".repeat(46)];
    const findings = validateAsset(
      content,
      asset.spec,
      value.brief,
      value.context,
      getMerchant(value.brief.merchantId),
    );
    expect(findings.map((item) => item.code)).toEqual(
      expect.arrayContaining([
        "channel-count",
        "channel-length",
        "channel-short-headline",
        "requested-count",
      ]),
    );
  });
  it("checks catalog text and stable package labels", async () => {
    const { engine, id } = await setup();
    await engine.runCampaign(id);
    const value = campaign(engine, id),
      copy = value.assets.find((item) => item.spec.id === "copy")!,
      content = clone(currentVersion(copy)!.content as CopyContent);
    content.productDescription = "A new imaginary certification.";
    expect(
      validateAsset(
        content,
        copy.spec,
        value.brief,
        value.context,
        getMerchant(value.brief.merchantId),
      ).some((item) => item.code === "product-facts"),
    ).toBe(true);
    const image = value.assets[0],
      imageContent = clone(currentVersion(image)!.content);
    if (imageContent.type !== "image") throw new Error("Expected image");
    imageContent.svg = imageContent.svg.replaceAll("250 g", "500 g");
    expect(
      validateAsset(
        imageContent,
        image.spec,
        value.brief,
        value.context,
        getMerchant(value.brief.merchantId),
      ).some((item) => item.code === "package-facts"),
    ).toBe(true);
  });
  it("rejects missing blueprint fields, wrong image sizes and active SVG content", async () => {
    const { engine, id } = await setup();
    await engine.runCampaign(id);
    const value = campaign(engine, id),
      blueprint = value.assets.find((asset) => asset.spec.id === "blueprint")!;
    expect(
      validateAsset(
        { type: "blueprint", summary: "", checklist: [] },
        blueprint.spec,
        value.brief,
        value.context,
        getMerchant(value.brief.merchantId),
      ).some((finding) => finding.code === "blueprint-required"),
    ).toBe(true);
    const image = value.assets[0],
      content = clone(currentVersion(image)!.content);
    if (content.type !== "image") throw new Error("Expected image");
    content.width = 42;
    content.svg = "<svg><script>alert(1)</script></svg>";
    const findings = validateAsset(
      content,
      image.spec,
      value.brief,
      value.context,
      getMerchant(value.brief.merchantId),
    );
    expect(findings.map((finding) => finding.code)).toEqual(
      expect.arrayContaining([
        "image-dimensions",
        "unsafe-svg",
        "package-facts",
      ]),
    );
  });
});

describe("persistent orchestration and targeted review", () => {
  it("executes the finite complete portfolio asynchronously without external requests", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const { engine, id } = await setup();
    await engine.runCampaign(id);
    const value = campaign(engine, id);
    expect(value.assets).toHaveLength(10);
    expect(
      value.assets.filter((item) => item.spec.kind === "image"),
    ).toHaveLength(6);
    expect(value.runs[0].status).toBe("completed");
    expect(errors(value)).toEqual([]);
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });
  it("uses six distinct SVG treatments and preserves factual labels", async () => {
    const { engine, id } = await setup();
    await engine.runCampaign(id);
    const images = campaign(engine, id)
      .assets.map(currentVersion)
      .filter((version) => version?.content.type === "image");
    expect(
      new Set(
        images.map((version) =>
          version!.content.type === "image" ? version!.content.svg : "",
        ),
      ).size,
    ).toBe(6);
    for (const version of images) {
      if (version?.content.type !== "image") throw new Error("Expected image");
      expect(version.content.svg).toContain("DAWN BLEND");
      expect(version.content.svg).toContain("250 g");
    }
  });
  it("changes generated content with structured product and seasonal brief inputs", async () => {
    const { engine, id } = await setup();
    await engine.runCampaign(id);
    const before = campaign(engine, id);
    const firstCopy = currentVersion(
      before.assets.find((item) => item.spec.id === "copy")!,
    )!.content;
    const other = await engine.createCampaign({
      ...createSampleBrief("harbor-home"),
      direction: "A winter home routine.",
    });
    await engine.runCampaign(other.id);
    const after = campaign(engine, other.id);
    const secondCopy = currentVersion(
      after.assets.find((item) => item.spec.id === "copy")!,
    )!.content;
    expect(firstCopy).not.toEqual(secondCopy);
    expect(JSON.stringify(secondCopy)).toContain("Winter");
    expect(JSON.stringify(secondCopy)).toContain("Everyday Cloths");
    expect(errors(after)).toEqual([]);
  });
  it("supports a one-product portfolio", async () => {
    const { engine } = await setup();
    const brief = createSampleBrief();
    brief.productIds = ["aster-dawn"];
    const value = await engine.createCampaign(brief);
    await engine.runCampaign(value.id);
    expect(errors(campaign(engine, value.id))).toEqual([]);
  });
  it("prevents duplicate simultaneous starts and completed reruns", async () => {
    const { engine, id } = await setup(2);
    const running = engine.runCampaign(id);
    await expect(engine.runCampaign(id)).rejects.toThrow("already active");
    await running;
    await expect(engine.runCampaign(id)).rejects.toThrow("already exist");
    expect(
      campaign(engine, id).assets.every((asset) => asset.versions.length === 1),
    ).toBe(true);
  });
  it("bounds recoverable retries and resumes only failed steps", async () => {
    const { engine, id } = await setup();
    await engine.runCampaign(id, {
      failure: { assetId: "image-1", kind: "transient", count: 3 },
    });
    let value = campaign(engine, id);
    expect(value.runs[0].status).toBe("failed");
    expect(value.runs[0].steps[0].attempts).toBe(3);
    expect(value.assets.filter((asset) => currentVersion(asset))).toHaveLength(
      9,
    );
    await engine.approveAsset(id, "copy");
    const copyId = currentVersion(
      campaign(engine, id).assets.find((asset) => asset.spec.id === "copy")!,
    )!.id;
    await engine.resumeCampaign(id);
    value = campaign(engine, id);
    expect(value.runs[0].status).toBe("completed");
    expect(value.assets.every((asset) => asset.versions.length === 1)).toBe(
      true,
    );
    expect(
      value.assets.find((asset) => asset.spec.id === "copy")!.approval
        ?.versionId,
    ).toBe(copyId);
  });
  it("distinguishes timeout and definitive failure and limits attempts", async () => {
    const { engine, id } = await setup(0, 5, 2);
    await engine.runCampaign(id, {
      failure: { assetId: "image-2", kind: "timeout", count: 2 },
    });
    const run = campaign(engine, id).runs[0];
    expect(run.steps.find((step) => step.assetId === "image-2")!.attempts).toBe(
      2,
    );
    expect(run.events.some((event) => /timed out/.test(event.message))).toBe(
      true,
    );
    expect(run.status).toBe("failed");
    const second = await engine.createCampaign(createSampleBrief());
    await engine.runCampaign(second.id, {
      failure: { assetId: "image-2", kind: "definitive", count: 1 },
    });
    expect(
      campaign(engine, second.id).runs[0].steps.find(
        (step) => step.assetId === "image-2",
      )!.attempts,
    ).toBe(1);
  });
  it("recovers an interrupted refresh without duplicate completed versions", async () => {
    const { engine, persistence, id } = await setup(15);
    const running = engine.runCampaign(id);
    await until(() => Boolean(currentVersion(campaign(engine, id).assets[0])));
    await engine.interruptCampaign(id);
    await running;
    const saved = (await persistence.load())!;
    saved.campaigns[0].runs[0].status = "running";
    const pending = saved.campaigns[0].runs[0].steps.find(
      (step) => step.status === "pending",
    );
    if (pending) pending.status = "running";
    await persistence.save(saved);
    const refreshed = new OrbitEngine(persistence, { delayMs: 0 });
    await refreshed.initialize();
    expect(campaign(refreshed, id).runs[0].status).toBe("interrupted");
    await refreshed.resumeCampaign(id);
    expect(
      campaign(refreshed, id).assets.every(
        (asset) => asset.versions.length === 1,
      ),
    ).toBe(true);
    expect(
      campaign(refreshed, id).runs[0].events.some((event) =>
        /Browser session ended/.test(event.message),
      ),
    ).toBe(true);
  });
  it("preserves unrelated exact versions and approvals on a narrow revision", async () => {
    const { engine, id } = await approved();
    const before = clone(campaign(engine, id));
    await engine.reviseAsset(id, "copy", "Use shorter, concise copy.");
    const after = campaign(engine, id);
    expect(
      after.assets.find((asset) => asset.spec.id === "copy")!.versions,
    ).toHaveLength(2);
    expect(
      after.assets.find((asset) => asset.spec.id === "copy")!.approval,
    ).toBeUndefined();
    for (const asset of before.assets.filter(
      (asset) => asset.spec.id !== "copy",
    ))
      expect(
        after.assets.find((item) => item.spec.id === asset.spec.id),
      ).toEqual(asset);
    expect(exportGate(after).allowed).toBe(false);
  });
  it("clears edited approval and blocks unsupported edited copy", async () => {
    const { engine, id } = await approved();
    const old = currentVersion(
      campaign(engine, id).assets.find((asset) => asset.spec.id === "copy")!,
    )!;
    await engine.editCopy(id, "copy", {
      headlines: [
        "Guaranteed organic coffee",
        "Coffee moments",
        "Explore Dawn Blend",
        "Meet the collection",
        "Your coffee ritual",
      ],
    });
    const asset = campaign(engine, id).assets.find(
      (item) => item.spec.id === "copy",
    )!;
    expect(asset.versions).toHaveLength(2);
    expect(asset.approval).toBeUndefined();
    expect(old.id).not.toBe(asset.currentVersionId);
    await expect(engine.approveAsset(id, "copy")).rejects.toThrow("blocking");
  });
  it("invalidates assets and approvals after a core brief or context change", async () => {
    const { engine, id } = await approved();
    await engine.updateBrief(id, {
      ...campaign(engine, id).brief,
      audience: "New home coffee drinkers",
    });
    let value = campaign(engine, id);
    expect(value.revision).toBe(2);
    expect(value.assets.every((asset) => !asset.approval)).toBe(true);
    expect(
      exportGate(value).reasons.some((reason) => reason.includes("stale")),
    ).toBe(true);
    await engine.runCampaign(id);
    await engine.setContextExcluded(id, ["page:aster-coffee"]);
    value = campaign(engine, id);
    expect(value.revision).toBe(3);
    await expect(engine.approveAsset(id, "image-1")).rejects.toThrow("stale");
  });
  it("persists structured preferences and reuses them in the next plan", async () => {
    const { engine, persistence } = await setup();
    await engine.setPreferences({
      avoidCrowdedCompositions: false,
      preferredTone: "Concise and direct",
    });
    const next = await engine.createCampaign({
      ...createSampleBrief(),
      tone: undefined,
    });
    expect(next.blueprint.tone).toBe("Concise and direct");
    expect(next.blueprint.preferenceNotes.join(" ")).toContain(
      "fuller geometric",
    );
    const loaded = new OrbitEngine(persistence);
    await loaded.initialize();
    expect(loaded.getSnapshot().preferences.avoidCrowdedCompositions).toBe(
      false,
    );
  });
  it("resets persisted campaigns and preferences", async () => {
    const { engine, persistence, id } = await setup();
    await engine.runCampaign(id);
    await engine.setPreferences({ preferredTone: "Bold" });
    await engine.reset();
    const refreshed = new OrbitEngine(persistence);
    await refreshed.initialize();
    expect(refreshed.getSnapshot().campaigns).toEqual([]);
    expect(refreshed.getSnapshot().preferences.preferredTone).toBe(
      "Calm and inviting",
    );
  });
});

describe("exact-version export and evaluation cases", () => {
  it("blocks missing, unreviewed, stale and invalid required outputs", async () => {
    const { engine, id } = await setup();
    expect(
      exportGate(campaign(engine, id)).reasons.some((reason) =>
        reason.includes("missing"),
      ),
    ).toBe(true);
    await engine.runCampaign(id);
    expect(
      exportGate(campaign(engine, id)).reasons.some((reason) =>
        reason.includes("requires approval"),
      ),
    ).toBe(true);
    const value = clone(campaign(engine, id));
    const version = currentVersion(value.assets[0])!;
    version.sourceRevision--;
    version.validation.push({ code: "bad", severity: "error", message: "Bad" });
    const gate = exportGate(value);
    expect(gate.reasons.join(" ")).toContain("stale");
    expect(gate.reasons.join(" ")).toContain("blocking");
    expect(() => buildExport(value)).toThrow("Export blocked");
  });
  it("exports actual ZIP contents matching only approved current versions", async () => {
    const { engine, id } = await approved();
    await engine.reviseAsset(id, "copy", "Make concise copy.");
    await engine.approveAsset(id, "copy");
    const value = campaign(engine, id),
      output = buildExport(value, clock),
      files = unzipSync(output.bytes),
      manifest = JSON.parse(strFromU8(files["manifest.json"]));
    expect(manifest.assets).toHaveLength(10);
    expect(
      Object.keys(files).filter((name) => name.endsWith(".svg")),
    ).toHaveLength(6);
    expect(files["copy-v2.json"]).toBeDefined();
    expect(files["copy-v1.json"]).toBeUndefined();
    expect(files["copy-review.csv"]).toBeDefined();
    expect(files["campaign-brief.md"]).toBeDefined();
    for (const item of manifest.assets) {
      expect(files[item.filename]).toBeDefined();
      const asset = value.assets.find(
        (asset) => asset.spec.id === item.assetId,
      )!;
      expect(item.versionId).toBe(asset.approval!.versionId);
      expect(item.versionId).toBe(asset.currentVersionId);
    }
  });
  it("sanitizes export paths and cannot traverse directories", () => {
    for (const input of [
      "../../token",
      "a\\b/c",
      "<script>",
      "CON:",
      "",
      "🔥",
    ]) {
      const safe = safeFilename(input);
      expect(safe).toMatch(/^[a-zA-Z0-9_-]+$/);
      expect(safe).not.toContain("..");
    }
  });
  it("passes the implemented assertions for all five evaluation fixtures", async () => {
    expect(evaluationFixtures).toHaveLength(5);
    const { engine } = await setup();
    for (const fixture of evaluationFixtures) {
      const next = await engine.createCampaign(clone(fixture.brief));
      if ("excludedIds" in fixture) {
        await engine.setContextExcluded(next.id, [...fixture.excludedIds]);
        await expect(engine.runCampaign(next.id)).rejects.toThrow(
          "Required reference",
        );
        expect(exportGate(campaign(engine, next.id)).allowed).toBe(false);
        continue;
      }
      await engine.runCampaign(
        next.id,
        "failure" in fixture ? { failure: clone(fixture.failure) } : {},
      );
      let value = campaign(engine, next.id);
      if (fixture.expected === "blocked") {
        expect(errors(value).length).toBeGreaterThan(0);
        expect(exportGate(value).allowed).toBe(false);
      } else if (fixture.expected === "recoverable") {
        expect(value.runs[0].status).toBe("failed");
        await engine.approveAsset(next.id, "copy");
        const approvedCopy = clone(
          value.assets.find((asset) => asset.spec.id === "copy"),
        );
        await engine.resumeCampaign(next.id);
        value = campaign(engine, next.id);
        expect(value.runs[0].status).toBe("completed");
        expect(value.assets.find((asset) => asset.spec.id === "copy")).toEqual({
          ...approvedCopy,
          approval: value.assets.find((asset) => asset.spec.id === "copy")!
            .approval,
        });
        expect(value.assets.every((asset) => asset.versions.length === 1)).toBe(
          true,
        );
      } else if ("revision" in fixture) {
        const others = clone(
          value.assets.filter(
            (asset) => asset.spec.id !== fixture.revision.assetId,
          ),
        );
        await engine.reviseAsset(
          next.id,
          fixture.revision.assetId,
          fixture.revision.note,
        );
        value = campaign(engine, next.id);
        expect(
          value.assets.filter(
            (asset) => asset.spec.id !== fixture.revision.assetId,
          ),
        ).toEqual(others);
        expect(
          value.assets.find(
            (asset) => asset.spec.id === fixture.revision.assetId,
          )!.versions,
        ).toHaveLength(2);
      } else expect(errors(value)).toEqual([]);
    }
  });
  it("downloads actual current landing content and labels stale drafts", async () => {
    const { engine, id } = await setup();
    await engine.runCampaign(id);
    const value = campaign(engine, id),
      brief = buildCampaignBrief(value);
    expect(brief).toContain("### Hero");
    expect(brief).toContain("### FAQ");
    expect(brief).toContain("Tasting notes: cocoa and orange");
    await engine.updateBrief(id, {
      ...value.brief,
      direction: "A new winter campaign.",
    });
    expect(buildCampaignBrief(campaign(engine, id))).toContain("STALE DRAFT");
  });
  it("validates requested CTA quantities and protects CSV review cells", async () => {
    const { engine, id } = await setup();
    await engine.runCampaign(id);
    const value = campaign(engine, id),
      asset = value.assets.find((asset) => asset.spec.id === "copy")!,
      content = clone(currentVersion(asset)!.content as CopyContent);
    content.ctas = ['=HYPERLINK("https://unknown.example")'];
    expect(copyCsv(content)).toContain("'=HYPERLINK");
    expect(
      validateAsset(
        content,
        asset.spec,
        value.brief,
        value.context,
        getMerchant(value.brief.merchantId),
      ).some((finding) => finding.code === "copy-cta"),
    ).toBe(true);
  });
  it("supports more-space image revisions and warmer copy revisions", async () => {
    const { engine, id } = await setup();
    await engine.runCampaign(id);
    const before = currentVersion(campaign(engine, id).assets[0])!.content;
    await engine.reviseAsset(id, "image-1", "More space around the packages");
    const after = currentVersion(campaign(engine, id).assets[0])!.content;
    expect(after).not.toEqual(before);
    await engine.reviseAsset(id, "copy", "Use a warmer tone");
    const copy = currentVersion(
      campaign(engine, id).assets.find((asset) => asset.spec.id === "copy")!,
    )!.content;
    expect(JSON.stringify(copy)).toContain("Settle into");
  });
});
