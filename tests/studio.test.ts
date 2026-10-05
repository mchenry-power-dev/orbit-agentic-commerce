import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import sharp from "sharp";
import { strFromU8, unzipSync } from "fflate";
import { initialState } from "../src/domain";
import { studioVersion } from "../src/domain/studio";
import type {
  CompositionRecipe,
  StudioBrief,
  StudioCampaign,
  StudioPlan,
  StudioVersion,
} from "../src/domain/studio";
import { cosmicCatSnapshot } from "../src/fixtures/cosmic-cat";
import {
  cosmicBrand,
  christmasSampleBrief,
  freshBrief,
  interpretLocalBrief,
} from "../src/fixtures/studio";
import { getMerchant, presets } from "../src/fixtures";
import { StudioMemoryPersistence } from "../src/persistence/studio";
import { StudioEngine } from "../src/orchestration/studio";
import type { StudioEngineOptions } from "../src/orchestration/studio";
import {
  buildStudioExport,
  studioCopyCsv,
  studioExportGate,
} from "../src/export/studio";
import {
  getPlacement,
  studioAdsCharacterCount,
  validatePlacement,
  validateStudioBrief,
  validateStudioCopy,
} from "../src/validation/placements";

const brand = () => cosmicBrand();
const confirmedPlan = (brief: StudioBrief, b = brand()) => ({
  ...interpretLocalBrief(brief, b),
  confirmed: true,
});
const realRaster = async (
  width: number,
  height: number,
  color = "#112233",
  mime: "image/png" | "image/jpeg" = "image/png",
) => {
  const input = sharp({
    create: { width, height, channels: 3, background: color },
  });
  const bytes = await (
    mime === "image/png" ? input.png() : input.jpeg()
  ).toBuffer();
  return {
    dataUrl: `data:${mime};base64,${bytes.toString("base64")}`,
    mime,
    width,
    height,
    bytes: bytes.length,
  };
};
const render: NonNullable<StudioEngineOptions["render"]> = async (
  recipe: CompositionRecipe,
  _name: string,
  signal?: AbortSignal,
) => {
  if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
  return realRaster(recipe.width, recipe.height, recipe.palette[0]);
};
const find = (engine: StudioEngine, id: string) =>
  engine.getSnapshot().campaigns.find((c) => c.id === id)!;
async function setup(
  options: StudioEngineOptions = {},
  brief = christmasSampleBrief(),
  persistence = new StudioMemoryPersistence(),
) {
  let nextId = 0;
  const engine = new StudioEngine(persistence, {
    render,
    id: () => `studio-test-${++nextId}`,
    clock: () => new Date("2026-10-03T12:00:00Z"),
    maxAttempts: 2,
    timeoutMs: 1000,
    ...options,
  });
  await engine.initialize();
  const campaign = await engine.create(brief, brand(), confirmedPlan(brief));
  return { engine, persistence, id: campaign.id };
}
async function reviewed() {
  const s = await setup();
  await s.engine.run(s.id);
  await s.engine.approve(
    s.id,
    find(s.engine, s.id).assets.map((a) => a.id),
  );
  return s;
}
const imageOnlyBrief = () => ({
  ...christmasSampleBrief(),
  channels: ["google"] as StudioBrief["channels"],
  placementIds: ["google-square"],
});
async function until(predicate: () => boolean) {
  for (let i = 0; i < 200; i++) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 2));
  }
  throw new Error("Checkpoint did not arrive");
}
const errors = (findings: { severity: string }[]) =>
  findings.filter((f) => f.severity === "error");

describe("V2 bounded brand and planning", () => {
  it("bundles the unchanged source PNGs with matching recorded dimensions and hashes", async () => {
    for (const photo of cosmicCatSnapshot.photos) {
      const bytes = readFileSync(
        new URL(`../public${photo.path}`, import.meta.url),
      );
      expect(createHash("sha256").update(bytes).digest("hex")).toBe(
        photo.sha256,
      );
      expect(bytes.length).toBe(photo.bytes);
      const metadata = await sharp(bytes).metadata();
      expect([metadata.width, metadata.height]).toEqual([
        photo.width,
        photo.height,
      ]);
      expect(metadata.format).toBe("png");
    }
  });
  it("retains the fictional presets while the authorized snapshot keeps facts separate from inspiration", () => {
    expect(presets.map((p) => p.id)).toEqual(["aster-coffee", "harbor-home"]);
    expect(getMerchant("aster-coffee").products).toHaveLength(2);
    expect(cosmicCatSnapshot.products).toHaveLength(2);
    expect(
      cosmicCatSnapshot.products.every((p) =>
        p.factSourceUrls.includes("https://cosmiccatcoffeeco.com/"),
      ),
    ).toBe(true);
    expect(
      brand().sources.find((s) => s.id === "cosmic-gifting-inspiration")
        ?.included,
    ).toBe(false);
    expect(cosmicCatSnapshot.licenseStatus).toContain("no open-source");
  });
  it("Christmas and a contrasting summer campaign retain the same verified product but change directions and copy", () => {
    const christmas = christmasSampleBrief();
    const summer = {
      ...christmas,
      description:
        "A minimal cool summer coffee campaign, without any holiday motifs",
      tone: "Cool and minimal",
      keywords: ["summer"],
    };
    const winterPlan = interpretLocalBrief(christmas, brand(), {
      generousSpace: true,
      tone: "Calm autumn",
    });
    const summerPlan = interpretLocalBrief(summer, brand(), {
      generousSpace: false,
      tone: "Warm Christmas",
    });
    expect(christmas.productIds).toEqual(summer.productIds);
    expect(winterPlan.directions.every((d) => d.mood === "festive")).toBe(true);
    expect(summerPlan.directions.every((d) => d.mood === "cool")).toBe(true);
    expect(winterPlan.directions[0].palette).not.toEqual(
      summerPlan.directions[0].palette,
    );
    expect(winterPlan.copy).not.toEqual(summerPlan.copy);
    expect(winterPlan.directions[0].composition).not.toEqual(
      winterPlan.directions[1].composition,
    );
    expect(summerPlan.generousSpace).toBe(false);
    expect(summerPlan.conflicts).toEqual([]);
  });
  it("supports a bounded paraphrase and labels arbitrary local semantics honestly", () => {
    const brief = {
      ...christmasSampleBrief(),
      description:
        "Twinkling lights and vibrant holiday coffee gifts for a warm winter ritual",
      keywords: [],
      tone: "",
    };
    expect(interpretLocalBrief(brief, brand()).directions[0].mood).toBe(
      "festive",
    );
    const unseen = {
      ...brief,
      description:
        "An abstract surreal underwater launch with floating glass sculptures",
      keywords: [],
    };
    const local = interpretLocalBrief(unseen, brand());
    expect(local.mode).toBe("local-composition");
    expect(local.confirmed).toBe(false);
    expect(local.interpretation).toContain(
      "Arbitrary free-text semantics require a configured planning service",
    );
    expect(local.directions[0].scene).not.toContain("underwater");
  });
  it("preserves a long required phrase in actual long-copy fields and never shortens it into a headline", () => {
    const phrase = "A coffee moment shared with someone special";
    const brief = { ...christmasSampleBrief(), requiredPhrases: [phrase] };
    const plan = interpretLocalBrief(brief, brand());
    expect(plan.copy.longHeadlines).toContain(phrase);
    expect(plan.copy.headlines).not.toContain(phrase.slice(0, 30));
    expect(
      errors(validateStudioCopy(plan.copy, brief.channels, brief, brand())),
    ).toEqual([]);
    const missing = {
      ...plan.copy,
      longHeadlines: ["An alternative valid long headline"],
    };
    expect(
      validateStudioCopy(missing, brief.channels, brief).some(
        (f) => f.code === "required-phrase-missing",
      ),
    ).toBe(true);
  });
  it("surfaces overlong and contradictory phrases without moving them into landing metadata", () => {
    const brief = {
      ...christmasSampleBrief(),
      requiredPhrases: ["x".repeat(91), "Best coffee moments"],
      prohibitedPhrases: ["best"],
    };
    const plan = interpretLocalBrief(brief, brand());
    expect(plan.conflicts.length).toBeGreaterThan(1);
    expect(
      validateStudioBrief(brief, brand()).some(
        (f) => f.code === "required-phrase-length",
      ),
    ).toBe(true);
    expect(
      validateStudioBrief(brief, brand()).some(
        (f) => f.code === "phrase-conflict",
      ),
    ).toBe(true);
    expect(plan.landing.body).not.toContain("x".repeat(91));
  });
  it("requires an alternative protected photo when the selected original contradicts no-holiday imagery", () => {
    const brief = {
      ...freshBrief(),
      title: "Summer",
      description: "Cool summer without holiday motifs",
      productIds: ["cosmic-candy-cane"],
    };
    expect(
      interpretLocalBrief(brief, brand()).conflicts.some((c) =>
        c.includes("protected original photo"),
      ),
    ).toBe(true);
  });
  it("uses neutral collection language for a confirmed custom product category", () => {
    const b = brand();
    b.name = "Visitor's brand";
    b.id = "unit-only-custom";
    b.products[0] = {
      ...b.products[0],
      name: "Cotton Cloths",
      description: "Cotton cloths for household use.",
      facts: ["Cotton cloths", "Set of3"],
    };
    const brief = {
      ...freshBrief(b),
      title: "Everyday collection",
      description: "An editorial collection campaign with generous space",
    };
    const plan = interpretLocalBrief(brief, b);
    expect(JSON.stringify(plan.copy)).not.toMatch(/coffee/i);
    expect(plan.copy.headlines.some((h) => h.length <= 15)).toBe(true);
    expect(plan.directions[0].cta).toBe("Shop Products");
    expect(plan.landing.sections[0].body).toContain(
      "Cotton cloths for household use",
    );
  });
});

describe("V2 placement and planning gates", () => {
  it("enforces Google30/90 weighted boundaries with the newly verified two-description minimum", () => {
    expect(studioAdsCharacterCount("中文。Ａ，")).toBe(10);
    const copy = confirmedPlan(christmasSampleBrief()).copy;
    expect(
      errors(
        validateStudioCopy({
          ...copy,
          headlines: ["a".repeat(30), ...copy.headlines.slice(1)],
          descriptions: copy.descriptions.slice(0, 2),
        }),
      ),
    ).toEqual([]);
    expect(
      validateStudioCopy({
        ...copy,
        headlines: ["a".repeat(31), ...copy.headlines.slice(1)],
      }).some((f) => f.code === "google-copy-length"),
    ).toBe(true);
    expect(
      validateStudioCopy({
        ...copy,
        headlines: ["中".repeat(16), ...copy.headlines.slice(1)],
      }).some((f) => f.code === "google-copy-length"),
    ).toBe(true);
    expect(
      validateStudioCopy({
        ...copy,
        descriptions: ["a".repeat(91), copy.descriptions[1]],
      }).some((f) => f.code === "google-copy-length"),
    ).toBe(true);
    expect(
      errors(
        validateStudioCopy({ ...copy, headlines: ["a".repeat(100)] }, ["meta"]),
      ),
    ).toEqual([]);
  });
  it("accepts genuine PNG/JPEG rasters and rejects metadata forgery, wrong ratio and oversized files", async () => {
    const v: StudioVersion = {
      id: "test",
      number: 1,
      at: "2026-10-03",
      mode: "local-composition",
      dependencyFingerprint: "test",
      sourceIds: [],
      findings: [],
      raster: await realRaster(1200, 628),
    };
    expect(errors(validatePlacement("google-landscape", v))).toEqual([]);
    expect(
      errors(
        validatePlacement("google-square", {
          ...v,
          raster: await realRaster(1200, 1200, "#112233", "image/jpeg"),
        }),
      ),
    ).toEqual([]);
    expect(
      validatePlacement("google-square", v).some(
        (f) => f.code === "placement-ratio",
      ),
    ).toBe(true);
    expect(
      validatePlacement("google-landscape", {
        ...v,
        raster: { ...v.raster!, height: 900 },
      }).some((f) => f.code === "raster-metadata"),
    ).toBe(true);
    expect(
      validatePlacement("google-landscape", {
        ...v,
        raster: { ...v.raster!, bytes: 5120001 },
      }).some((f) => f.code === "placement-file-size"),
    ).toBe(true);
    expect(
      validatePlacement("google-landscape", {
        ...v,
        raster: { ...v.raster!, dataUrl: "data:image/png;base64,PHN2Zz4=" },
      }).some((f) => f.code === "raster-header"),
    ).toBe(true);
  });
  it("labels Meta as unchecked and TikTok as missing actual video; website and email use configurable goals", async () => {
    const v: StudioVersion = {
      id: "test",
      number: 1,
      at: "2026-10-03",
      mode: "local-composition",
      dependencyFingerprint: "test",
      sourceIds: [],
      findings: [],
      raster: await realRaster(1440, 1800),
    };
    expect(
      validatePlacement("meta-feed", v).some(
        (f) => f.code === "placement-not-checked" && f.severity === "warning",
      ),
    ).toBe(true);
    expect(
      validatePlacement("tiktok-video", v).some(
        (f) => f.code === "video-missing",
      ),
    ).toBe(true);
    const brief = {
      ...christmasSampleBrief(),
      websiteSize: { desktop: [1400, 700], mobile: [700, 900] },
      emailSize: [1000, 500],
    } as StudioBrief;
    expect(getPlacement("website-desktop", brief).width).toBe(1400);
    expect(getPlacement("email-banner", brief).verification).toBe(
      "design-goal",
    );
  });
  it("accepts blank/zero budgets and distinguishes daily/lifetime intent while rejecting invalid allocations and dates", () => {
    const brief = christmasSampleBrief();
    expect(errors(validateStudioBrief(brief, brand()))).toEqual([]);
    for (const intent of ["daily", "lifetime"] as const)
      expect(
        errors(
          validateStudioBrief(
            {
              ...brief,
              budget: {
                ...brief.budget,
                intent,
                total: 0,
                allocations: { google: 0, meta: 0 },
              },
            },
            brand(),
          ),
        ),
      ).toEqual([]);
    const invalid = {
      ...brief,
      budget: {
        ...brief.budget,
        total: 100,
        allocations: { google: 70, meta: 20 },
        marginPercent: 101,
      },
      dates: { start: "2026-02-30", end: "2026-03-01" },
    };
    const findings = validateStudioBrief(invalid, brand());
    expect(findings.some((f) => f.code === "budget-allocation-sum")).toBe(true);
    expect(findings.some((f) => f.code === "budget-margin")).toBe(true);
    expect(findings.some((f) => f.code === "brief-date")).toBe(true);
  });
  it("blocks omitted factual/photo references and unconfirmed products before any creation call", async () => {
    const b = brand();
    b.sources.find((s) => s.id === "cosmic-photo-solar-surge")!.included =
      false;
    const engine = new StudioEngine(new StudioMemoryPersistence(), { render });
    await engine.initialize();
    const brief = christmasSampleBrief();
    await expect(
      engine.create(brief, b, confirmedPlan(brief, b)),
    ).rejects.toThrow("reference");
    b.sources.find((s) => s.id === "cosmic-photo-solar-surge")!.included = true;
    b.products[0].confirmed = false;
    await expect(
      engine.create(brief, b, confirmedPlan(brief, b)),
    ).rejects.toThrow("confirmed");
  });
  it("allows a confirmed factual claim and rejects the same claim when unsupported", () => {
    const brief = christmasSampleBrief();
    const copy = confirmedPlan(brief).copy;
    const claimed = {
      ...copy,
      descriptions: [
        "Solar Surge is organic coffee.",
        ...copy.descriptions.slice(1),
      ],
    };
    expect(
      validateStudioCopy(claimed, brief.channels, brief, brand()).some(
        (f) => f.code === "unsupported-copy-claim",
      ),
    ).toBe(true);
    const b = brand();
    b.products[0].facts.push("Organic coffee");
    expect(
      validateStudioCopy(claimed, brief.channels, brief, b).some(
        (f) => f.code === "unsupported-copy-claim",
      ),
    ).toBe(false);
  });
});

describe("V2 versioned creation, recovery and export", () => {
  it("persists separate new-campaign and existing-campaign drafts without changing saved campaigns", async () => {
    const s = await setup({}, imageOnlyBrief());
    const secondBrief = { ...imageOnlyBrief(), title: "Second saved campaign" };
    const second = await s.engine.create(
      secondBrief,
      brand(),
      confirmedPlan(secondBrief),
    );
    const newBrief = {
      ...imageOnlyBrief(),
      title: "Unfinished new campaign",
      rawInputs: { keywords: "coffee, gifts\n" },
    };
    await s.engine.saveDraft(newBrief, brand(), confirmedPlan(newBrief));
    const firstDraft = { ...imageOnlyBrief(), title: "First unsaved change" };
    await s.engine.saveDraft(
      firstDraft,
      brand(),
      confirmedPlan(firstDraft),
      s.id,
    );
    const secondDraft = { ...secondBrief, title: "Second unsaved change" };
    await s.engine.saveDraft(
      secondDraft,
      brand(),
      confirmedPlan(secondDraft),
      second.id,
    );
    newBrief.title = "Mutation outside the engine";
    secondDraft.title = "Another external mutation";

    const refreshed = new StudioEngine(s.persistence, { render });
    await refreshed.initialize();
    const state = refreshed.getSnapshot();
    expect(state.newDraft?.brief.title).toBe("Unfinished new campaign");
    expect(state.newDraft?.brief.rawInputs?.keywords).toBe("coffee, gifts\n");
    expect(state.drafts?.[s.id].brief.title).toBe("First unsaved change");
    expect(state.drafts?.[second.id].brief.title).toBe("Second unsaved change");
    expect(state.draft?.campaignId).toBe(second.id);
    expect(find(refreshed, s.id).brief.title).toBe(imageOnlyBrief().title);
    expect(find(refreshed, second.id).brief.title).toBe(
      "Second saved campaign",
    );
  });
  it("deleting a campaign removes its draft while retaining other drafts and clears only a matching current draft", async () => {
    const s = await setup({}, imageOnlyBrief());
    const secondBrief = { ...imageOnlyBrief(), title: "Another campaign" };
    const second = await s.engine.create(
      secondBrief,
      brand(),
      confirmedPlan(secondBrief),
    );
    const newBrief = { ...imageOnlyBrief(), title: "New campaign draft" };
    await s.engine.saveDraft(newBrief, brand());
    await s.engine.saveDraft(imageOnlyBrief(), brand(), undefined, s.id);
    await s.engine.saveDraft(secondBrief, brand(), undefined, second.id);

    await s.engine.deleteCampaign(s.id);
    expect(s.engine.getSnapshot().campaigns.map((c) => c.id)).toEqual([
      second.id,
    ]);
    expect(s.engine.getSnapshot().drafts?.[s.id]).toBeUndefined();
    expect(s.engine.getSnapshot().draft?.campaignId).toBe(second.id);
    expect(s.engine.getSnapshot().drafts?.[second.id]).toBeDefined();
    expect(s.engine.getSnapshot().newDraft?.brief.title).toBe(
      "New campaign draft",
    );

    await s.engine.deleteCampaign(second.id);
    const persisted = await s.persistence.load();
    expect(persisted?.draft).toBeUndefined();
    expect(persisted?.drafts?.[second.id]).toBeUndefined();
    expect(persisted?.newDraft?.brief.title).toBe("New campaign draft");
  });
  it("deleting a brand clears its unsaved uploaded-photo drafts while preserving another brand's draft", async () => {
    const s = await setup({}, imageOnlyBrief());
    const uploaded = brand();
    uploaded.id = "unit-uploaded-brand";
    uploaded.ownership = "visitor-confirmed";
    uploaded.products[0].photo = (await realRaster(32, 32)).dataUrl;
    uploaded.sources[0].image = uploaded.products[0].photo;
    const brief = imageOnlyBrief();
    await s.engine.saveBrand(uploaded);
    await s.engine.saveDraft(brief, uploaded);
    await s.engine.saveDraft(
      brief,
      uploaded,
      undefined,
      "abandoned-upload-draft",
    );
    await s.engine.saveDraft(brief, brand(), undefined, s.id);

    await s.engine.deleteBrand(uploaded.id);
    const persisted = await s.persistence.load();
    expect(persisted?.brands.some((b) => b.id === uploaded.id)).toBe(false);
    expect(persisted?.newDraft).toBeUndefined();
    expect(persisted?.drafts?.["abandoned-upload-draft"]).toBeUndefined();
    expect(persisted?.draft?.campaignId).toBe(s.id);
    expect(persisted?.drafts?.[s.id].brand.id).toBe(brand().id);
    expect(JSON.stringify(persisted)).not.toContain(uploaded.products[0].photo);

    await s.engine.saveDraft(brief, uploaded);
    await s.engine.deleteBrand(uploaded.id);
    expect(s.engine.getSnapshot().draft).toBeUndefined();
    expect(s.engine.getSnapshot().newDraft).toBeUndefined();
  });
  it("creates only selected placements and imports a completed sample without copying approvals", async () => {
    const s = await reviewed();
    const c = find(s.engine, s.id);
    expect(c.assets.filter((a) => a.kind === "image")).toHaveLength(12);
    expect(c.assets.some((a) => a.placementId === "email-banner")).toBe(false);
    const imported = await s.engine.importSample(c);
    expect(imported.mode).toBe("prebuilt-sample");
    expect(imported.assets.every((a) => !a.approval)).toBe(true);
    expect(imported.assets.every((a) => studioVersion(a))).toBe(true);
  });
  it("offer text invalidates overlaid images/copy/handoff but retains unrelated text-free image approvals", async () => {
    const s = await reviewed();
    const before = find(s.engine, s.id);
    const stable = before.assets.find(
      (a) => a.kind === "image" && a.placementId === "google-square",
    )!;
    const approval = structuredClone(stable.approval);
    const brief = { ...before.brief, offer: "Include a personal gift note" };
    await s.engine.update(
      s.id,
      brief,
      before.brand,
      confirmedPlan(brief, before.brand),
    );
    const after = find(s.engine, s.id);
    expect(after.assets.find((a) => a.id === stable.id)?.approval).toEqual(
      approval,
    );
    expect(after.assets.find((a) => a.id === stable.id)?.stale).toBe(false);
    expect(
      after.assets.find((a) => a.placementId === "website-desktop")?.stale,
    ).toBe(true);
    expect(after.assets.find((a) => a.kind === "copy")?.stale).toBe(true);
    expect(after.assets.find((a) => a.kind === "plan")?.stale).toBe(true);
    expect(studioExportGate(after).allowed).toBe(false);
  });
  it("revises one variant while keeping all other exact approvals and versions", async () => {
    const s = await reviewed();
    const before = structuredClone(find(s.engine, s.id));
    const target = before.assets.find((a) => a.kind === "image")!;
    await s.engine.run(s.id, [target.id], "More space, center the product");
    const after = find(s.engine, s.id);
    const changed = after.assets.find((a) => a.id === target.id)!;
    expect(changed.versions).toHaveLength(2);
    expect(changed.approval).toBeUndefined();
    expect(studioVersion(changed)?.recipe?.spacing).toBe(0.18);
    for (const old of before.assets.filter((a) => a.id !== target.id)) {
      const next = after.assets.find((a) => a.id === old.id)!;
      expect(next.currentVersionId).toBe(old.currentVersionId);
      expect(next.approval).toEqual(old.approval);
    }
  });
  it("resumes a failed targeted revision with its note and IDs while retaining all other exact versions", async () => {
    const s = await reviewed();
    const before = structuredClone(find(s.engine, s.id));
    const target = before.assets.find((a) => a.kind === "image")!;
    const note = "More space, center the product";
    await s.engine.run(s.id, [target.id], note, target.id);
    const failed = find(s.engine, s.id);
    expect(failed.runs.at(-1)).toMatchObject({
      status: "failed",
      assetIds: [target.id],
      completedIds: [],
      revisionNote: note,
    });
    expect(failed.assets.find((a) => a.id === target.id)?.versions).toEqual(
      target.versions,
    );
    expect(
      failed.assets.find((a) => a.id === target.id)?.currentVersionId,
    ).toBe(target.currentVersionId);

    const refreshed = new StudioEngine(s.persistence, { render });
    await refreshed.initialize();
    await refreshed.resume(s.id);
    const after = find(refreshed, s.id);
    expect(after.runs.at(-1)).toMatchObject({
      status: "completed",
      assetIds: [target.id],
      completedIds: [target.id],
      revisionNote: note,
    });
    const revised = after.assets.find((a) => a.id === target.id)!;
    expect(revised.versions).toHaveLength(2);
    expect(revised.versions[0]).toEqual(target.versions[0]);
    expect(studioVersion(revised)).toMatchObject({
      number: 2,
      revisionNote: note,
      recipe: { spacing: 0.18, composition: "product-center" },
    });
    expect(revised.approval).toBeUndefined();
    for (const old of before.assets.filter((a) => a.id !== target.id)) {
      const current = after.assets.find((a) => a.id === old.id)!;
      expect(current.versions).toEqual(old.versions);
      expect(current.currentVersionId).toBe(old.currentVersionId);
      expect(current.approval).toEqual(old.approval);
    }
  });
  it("persists a mocked paid scene before local-render failure and reuses its exact provenance after refresh", async () => {
    const persistence = new StudioMemoryPersistence();
    const scene = await realRaster(64, 64);
    const provenance = {
      provider: "openai" as const,
      model: "unit-only-mock-image",
      generatedAt: "2026-10-03T12:00:00Z",
      operation: "generation" as const,
      requestId: "unit-scene-before-render",
    };
    let sceneCalls = 0;
    let renderCalls = 0;
    const s = await setup(
      {
        maxAttempts: 3,
        scene: async () => {
          sceneCalls++;
          return { dataUrl: scene.dataUrl, provenance };
        },
        render: async (recipe) => {
          renderCalls++;
          const saved = await persistence.load();
          const checkpoint =
            saved!.campaigns[0].sceneCheckpoints?.[recipe.sceneKey!];
          expect(recipe.sceneKey).toMatch(/^[a-f0-9]{64}$/);
          expect(checkpoint).toMatchObject({
            dataUrl: scene.dataUrl,
            provenance,
          });
          expect(
            saved!.campaigns[0].assets.find(
              (a) => a.familyId === recipe.directionId,
            )?.versions,
          ).toHaveLength(0);
          throw new Error("Unit fixture: local raster render failed");
        },
      },
      imageOnlyBrief(),
      persistence,
    );
    const initial = find(s.engine, s.id);
    await s.engine.update(s.id, initial.brief, initial.brand, {
      ...initial.plan,
      mode: "live-generation",
    });
    const target = find(s.engine, s.id).assets.find((a) => a.kind === "image")!;
    await s.engine.run(s.id, [target.id]);
    expect(sceneCalls).toBe(1);
    expect(renderCalls).toBe(1);
    expect(find(s.engine, s.id).runs.at(-1)?.attempts[target.id]).toBe(1);
    expect(find(s.engine, s.id).runs.at(-1)?.status).toBe("failed");
    expect(
      find(s.engine, s.id).assets.find((a) => a.id === target.id)?.versions,
    ).toHaveLength(0);

    const savedKey = Object.keys(find(s.engine, s.id).sceneCheckpoints!)[0];
    const refreshed = new StudioEngine(persistence, {
      render,
      scene: async () => {
        sceneCalls++;
        throw new Error("The persisted scene must avoid another provider call");
      },
    });
    await refreshed.initialize();
    await refreshed.resume(s.id);
    const version = studioVersion(
      find(refreshed, s.id).assets.find((a) => a.id === target.id)!,
    )!;
    expect(sceneCalls).toBe(1);
    expect(version.recipe).toMatchObject({
      sceneKey: savedKey,
      backgroundImage: scene.dataUrl,
      sceneProvenance: provenance,
    });
    expect(find(refreshed, s.id).runs.at(-1)?.status).toBe("completed");
  });
  it("does not reuse a targeted revised scene as the base scene for another missing variant in the family", async () => {
    const original = await realRaster(64, 64, "#113355");
    const revised = await realRaster(64, 64, "#aa3311");
    const notes: (string | undefined)[] = [];
    const brief = {
      ...imageOnlyBrief(),
      placementIds: ["google-square", "google-landscape"],
    };
    const s = await setup(
      {
        scene: async (_campaign, _direction, _signal, note) => {
          notes.push(note);
          return {
            dataUrl: note ? revised.dataUrl : original.dataUrl,
            provenance: {
              provider: "openai",
              model: "unit-only-mock-image",
              generatedAt: "2026-10-03T12:00:00Z",
              operation: "generation",
              requestId: note ? "unit-revised-scene" : "unit-base-scene",
            },
          };
        },
      },
      brief,
    );
    const initial = find(s.engine, s.id);
    await s.engine.update(s.id, initial.brief, initial.brand, {
      ...initial.plan,
      mode: "live-generation",
    });
    const images = find(s.engine, s.id).assets.filter(
      (a) => a.kind === "image",
    );
    const target = images[0];
    const missing = images.find(
      (a) => a.familyId === target.familyId && a.id !== target.id,
    )!;
    const note = "Use soft red background light";
    await s.engine.run(s.id, [target.id], note);
    await s.engine.run(s.id, [missing.id]);

    const after = find(s.engine, s.id);
    const targetRecipe = studioVersion(
      after.assets.find((a) => a.id === target.id)!,
    )!.recipe!;
    const missingRecipe = studioVersion(
      after.assets.find((a) => a.id === missing.id)!,
    )!.recipe!;
    expect(notes).toEqual([note, undefined]);
    expect(targetRecipe.backgroundImage).toBe(revised.dataUrl);
    expect(missingRecipe.backgroundImage).toBe(original.dataUrl);
    expect(targetRecipe.sceneKey).not.toBe(missingRecipe.sceneKey);
    expect(targetRecipe.sceneProvenance?.requestId).toBe("unit-revised-scene");
    expect(missingRecipe.sceneProvenance?.requestId).toBe("unit-base-scene");
  });
  it("applies placement-specific composition and spacing without merging same-size variants with different layouts", async () => {
    const brief: StudioBrief = {
      ...christmasSampleBrief(),
      channels: ["website", "email"],
      placementIds: ["website-desktop", "email-banner"],
      websiteSize: { desktop: [1200, 600], mobile: [900, 1200] },
      emailSize: [1200, 600],
    };
    const s = await setup({}, brief);
    const initial = find(s.engine, s.id);
    const plan = structuredClone(initial.plan);
    plan.directions = plan.directions.map((direction) => ({
      ...direction,
      placementComposition: [
        {
          placementId: "website-desktop",
          framing: "Centered product",
          focalPoint: "Package",
          negativeSpace: "Around product",
          textPlacement: "Above product",
          composition: "product-center",
          spacing: 0.18,
        },
        {
          placementId: "email-banner",
          framing: "Product on right",
          focalPoint: "Package",
          negativeSpace: "Left copy area",
          textPlacement: "Left",
          composition: "product-right",
          spacing: 0.07,
        },
      ],
    }));
    await s.engine.update(s.id, initial.brief, initial.brand, plan);
    expect(
      find(s.engine, s.id).assets.filter((a) => a.kind === "image"),
    ).toHaveLength(4);
    await s.engine.run(s.id);
    for (const asset of find(s.engine, s.id).assets.filter(
      (a) => a.kind === "image",
    )) {
      expect(asset.compatiblePlacementIds).toEqual([asset.placementId]);
      expect(studioVersion(asset)?.recipe).toMatchObject({
        width: 1200,
        height: 600,
        textOverlay: true,
        composition:
          asset.placementId === "website-desktop"
            ? "product-center"
            : "product-right",
        spacing: asset.placementId === "website-desktop" ? 0.18 : 0.07,
      });
    }
  });
  it("a changed family invalidates only that family's images plus handoff", async () => {
    const s = await reviewed();
    const before = find(s.engine, s.id);
    const plan = structuredClone(before.plan);
    plan.directions[0].palette = ["#000000", "#ffffff", "#c03020", "#80a0c0"];
    await s.engine.update(s.id, before.brief, before.brand, plan);
    const after = find(s.engine, s.id);
    expect(
      after.assets
        .filter((a) => a.familyId === plan.directions[0].id)
        .every((a) => a.stale && !a.approval),
    ).toBe(true);
    expect(
      after.assets
        .filter((a) => a.familyId === plan.directions[1].id)
        .every((a) => !a.stale && a.approval),
    ).toBe(true);
    expect(after.assets.find((a) => a.kind === "plan")?.stale).toBe(true);
  });
  it("a changed live image prompt invalidates that family's exact image approvals and preserves the unrelated family", async () => {
    const scene = await realRaster(64, 64);
    const s = await setup(
      { scene: async () => scene.dataUrl },
      imageOnlyBrief(),
    );
    const initial = find(s.engine, s.id);
    const livePlan: StudioPlan = {
      ...initial.plan,
      mode: "live-generation",
      directions: initial.plan.directions.map((d) => ({
        ...d,
        imagePrompt: "A warm editorial background with open space",
      })),
    };
    await s.engine.update(s.id, initial.brief, initial.brand, livePlan);
    await s.engine.run(s.id);
    await s.engine.approve(
      s.id,
      find(s.engine, s.id).assets.map((a) => a.id),
    );
    const before = structuredClone(find(s.engine, s.id));
    const updatedPlan = structuredClone(before.plan);
    updatedPlan.directions[0].imagePrompt =
      "A cool abstract background with soft blue light";
    await s.engine.update(s.id, before.brief, before.brand, updatedPlan);

    const after = find(s.engine, s.id);
    const changed = after.assets.filter(
      (a) => a.familyId === updatedPlan.directions[0].id,
    );
    expect(changed.length).toBeGreaterThan(0);
    expect(changed.every((a) => a.stale && !a.approval)).toBe(true);
    for (const old of before.assets.filter(
      (a) => a.familyId === updatedPlan.directions[1].id,
    )) {
      const current = after.assets.find((a) => a.id === old.id)!;
      expect(current.stale).toBe(false);
      expect(current.currentVersionId).toBe(old.currentVersionId);
      expect(current.approval).toEqual(old.approval);
    }
    expect(after.assets.find((a) => a.kind === "plan")?.stale).toBe(true);
    expect(studioExportGate(after).allowed).toBe(false);
  });
  it("resumes only missing outputs after a bounded failure and preserves completed approvals", async () => {
    const s = await setup({}, imageOnlyBrief());
    const target = find(s.engine, s.id).assets.find(
      (a) => a.kind === "image",
    )!.id;
    await s.engine.run(s.id, undefined, undefined, target);
    const failed = find(s.engine, s.id);
    expect(failed.runs[0].status).toBe("failed");
    expect(failed.runs[0].attempts[target]).toBe(2);
    const completed = failed.assets.filter((a) => studioVersion(a));
    await s.engine.approve(
      s.id,
      completed.map((a) => a.id),
    );
    const previous = find(s.engine, s.id)
      .assets.filter((a) => studioVersion(a))
      .map((a) => ({
        id: a.id,
        currentVersionId: a.currentVersionId,
        approval: structuredClone(a.approval),
      }));
    await s.engine.run(s.id);
    const resumed = find(s.engine, s.id);
    expect(resumed.runs[1].assetIds).toEqual([target]);
    for (const checkpoint of previous) {
      const a = resumed.assets.find((a) => a.id === checkpoint.id)!;
      expect(a.currentVersionId).toBe(checkpoint.currentVersionId);
      expect(a.approval).toEqual(checkpoint.approval);
    }
  });
  it("rejects concurrent creation, pauses cleanly and persists finished checkpoints for refresh/resume", async () => {
    let calls = 0;
    let release: (() => void) | undefined;
    const delayed: NonNullable<StudioEngineOptions["render"]> = async (
      recipe,
      name,
      signal,
    ) => {
      calls++;
      if (calls === 2)
        await new Promise<void>((resolve) => {
          release = resolve;
          signal?.addEventListener("abort", () => resolve(), { once: true });
        });
      return render(recipe, name, signal);
    };
    const s = await setup({ render: delayed }, imageOnlyBrief());
    const active = s.engine.run(s.id);
    await until(() => calls === 2);
    await expect(s.engine.run(s.id)).rejects.toThrow("already active");
    await s.engine.pause();
    release?.();
    await active;
    const paused = find(s.engine, s.id);
    expect(paused.runs[0].status).toBe("interrupted");
    expect(paused.assets.filter((a) => studioVersion(a))).toHaveLength(1);
    const refreshed = new StudioEngine(s.persistence, { render });
    await refreshed.initialize();
    await refreshed.run(s.id);
    expect(find(refreshed, s.id).assets.every((a) => studioVersion(a))).toBe(
      true,
    );
    expect(find(refreshed, s.id).assets[0].versions).toHaveLength(1);
  });
  it("bounds timeout attempts, ignores late completion and recovers without duplicate versions", async () => {
    const pending: ((value: Awaited<ReturnType<typeof realRaster>>) => void)[] =
      [];
    const never: NonNullable<StudioEngineOptions["render"]> = async () =>
      new Promise((resolve) => {
        pending.push(resolve);
      });
    const s = await setup(
      { render: never, timeoutMs: 5, maxAttempts: 2 },
      imageOnlyBrief(),
    );
    const image = find(s.engine, s.id).assets.find((a) => a.kind === "image")!;
    await s.engine.run(s.id, [image.id]);
    expect(find(s.engine, s.id).runs[0].attempts[image.id]).toBe(2);
    expect(
      find(s.engine, s.id).assets.find((a) => a.id === image.id)?.versions,
    ).toHaveLength(0);
    const late = await realRaster(1200, 1200);
    pending.forEach((resolve) => resolve(late));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(
      find(s.engine, s.id).assets.find((a) => a.id === image.id)?.versions,
    ).toHaveLength(0);
    const refreshed = new StudioEngine(s.persistence, { render });
    await refreshed.initialize();
    await refreshed.run(s.id);
    expect(
      find(refreshed, s.id).assets.find((a) => a.id === image.id)?.versions,
    ).toHaveLength(1);
  });
  it("does not silently substitute local composition when live image generation is unavailable", async () => {
    let renderCalls = 0;
    const engine = new StudioEngine(new StudioMemoryPersistence(), {
      render: async (...args) => {
        renderCalls++;
        return render(...args);
      },
      maxAttempts: 1,
    });
    await engine.initialize();
    const brief = imageOnlyBrief();
    const plan = { ...confirmedPlan(brief), mode: "live-generation" as const };
    const c = await engine.create(brief, brand(), plan);
    await engine.run(c.id);
    const after = find(engine, c.id);
    expect(renderCalls).toBe(0);
    expect(
      after.assets
        .filter((a) => a.kind === "image")
        .every((a) => !studioVersion(a)),
    ).toBe(true);
    expect(
      after.events.some((event) =>
        event.message.includes("no local substitute was used"),
      ),
    ).toBe(true);
    expect(after.mode).toBe("live-generation");
  });
  it("does not create duplicate versions for repeated IDs in one requested selection", async () => {
    const s = await setup({}, imageOnlyBrief());
    const image = find(s.engine, s.id).assets.find((a) => a.kind === "image")!;
    try {
      await s.engine.run(s.id, [image.id, image.id]);
    } catch (error) {
      expect(String(error)).toMatch(/duplicate|unique/i);
    }
    expect(
      find(s.engine, s.id).assets.find((a) => a.id === image.id)!.versions
        .length,
    ).toBeLessThanOrEqual(1);
  });
  it("edited copy invalidates its approval and handoff while image approvals remain exact", async () => {
    const s = await reviewed();
    const before = structuredClone(find(s.engine, s.id));
    await s.engine.editCopy(s.id, {
      ...before.plan.copy,
      descriptions: [
        "An edited coffee description.",
        ...before.plan.copy.descriptions.slice(1),
      ],
    });
    const after = find(s.engine, s.id);
    expect(
      after.assets.find((a) => a.kind === "copy")?.approval,
    ).toBeUndefined();
    expect(after.assets.find((a) => a.kind === "plan")?.stale).toBe(true);
    expect(
      after.assets.filter((a) => a.kind === "image").every((a) => a.approval),
    ).toBe(true);
  });
  it("global copy edits update actual placement-copy versions and exported CSV mappings consistently", async () => {
    const s = await setup();
    const initial = find(s.engine, s.id);
    const plan = structuredClone(initial.plan);
    plan.placementCopy = initial.brief.placementIds.map((placementId) => ({
      placementId,
      ...structuredClone(plan.copy),
      headlines: ["Original mapped title", ...plan.copy.headlines.slice(1)],
    }));
    await s.engine.update(s.id, initial.brief, initial.brand, plan);
    await s.engine.run(s.id);
    await s.engine.approve(
      s.id,
      find(s.engine, s.id).assets.map((a) => a.id),
    );
    const before = structuredClone(find(s.engine, s.id));
    const edited = {
      ...structuredClone(before.plan.copy),
      headlines: [
        "Updated coffee gift",
        ...before.plan.copy.headlines.slice(1),
      ],
      descriptions: [
        "An edited placement description.",
        ...before.plan.copy.descriptions.slice(1),
      ],
    };
    await s.engine.editCopy(s.id, edited);
    const after = find(s.engine, s.id);
    for (const placement of after.plan.placementCopy!)
      expect(placement).toEqual({
        placementId: placement.placementId,
        ...edited,
      });
    const copy = after.assets.find((a) => a.kind === "copy")!;
    expect(studioVersion(copy)?.content).toMatchObject({
      ...edited,
      placements: after.plan.placementCopy,
    });
    const csv = studioCopyCsv(after);
    expect(csv).toContain("Updated coffee gift");
    expect(csv).toContain("An edited placement description.");
    expect(csv).not.toContain("Original mapped title");
    expect(studioExportGate(after).allowed).toBe(false);

    const handoff = after.assets.find((a) => a.kind === "plan")!;
    await s.engine.run(s.id, [handoff.id]);
    await s.engine.approve(s.id, [copy.id, handoff.id]);
    const exported = buildStudioExport(find(s.engine, s.id));
    const copyManifest = exported.manifest.assets.find(
      (a) => a.assetId === copy.id,
    )!;
    const content = JSON.parse(
      strFromU8(exported.files[copyManifest.filename]),
    );
    expect(
      content.placements.every(
        (p: { headlines: string[] }) =>
          p.headlines[0] === "Updated coffee gift",
      ),
    ).toBe(true);
    expect(strFromU8(exported.files["copy-field-mapping.csv"])).toBe(
      studioCopyCsv(find(s.engine, s.id)),
    );
  });
  it("exports exact approved versions, real raster ZIP bytes and explicit destination/provenance mappings", async () => {
    const s = await reviewed();
    const c = find(s.engine, s.id);
    const exported = buildStudioExport(c);
    const unzipped = unzipSync(exported.bytes);
    expect(
      exported.manifest.assets.every(
        (m) =>
          c.assets.find((a) => a.id === m.assetId)?.approval?.versionId ===
          m.versionId,
      ),
    ).toBe(true);
    const images = exported.manifest.assets.filter((m) =>
      m.filename.endsWith(".png"),
    );
    expect(images).toHaveLength(12);
    for (const image of images) {
      const asset = c.assets.find((item) => item.id === image.assetId)!;
      const placement = getPlacement(asset.placementId, c.brief);
      expect(image.filename).toMatch(
        new RegExp(
          `^${placement.channel}/${placement.id}/[a-z0-9-]+-v\\d+\\.png$`,
        ),
      );
      expect([...unzipped[image.filename].slice(0, 8)]).toEqual([
        137, 80, 78, 71, 13, 10, 26, 10,
      ]);
    }
    expect(strFromU8(unzipped["brand-provenance.json"])).toContain(
      "owner-authorized-snapshot",
    );
    expect(strFromU8(unzipped["campaign-brief.md"])).toContain(
      c.plan.landing.body,
    );
    expect(strFromU8(unzipped["copy-field-mapping.csv"])).toContain(
      "Draft mapping; platform rules not checked",
    );
    const google = buildStudioExport(c, "google");
    expect(
      google.manifest.assets.filter((m) => m.filename.endsWith(".png")),
    ).toHaveLength(6);
    expect(google.manifest.assets.some((m) => m.assetId === "landing")).toBe(
      false,
    );
    expect(studioExportGate(c, "email").allowed).toBe(false);
    const stale = structuredClone(c);
    stale.assets[0].stale = true;
    expect(studioExportGate(stale).allowed).toBe(false);
    const wrong = structuredClone(c);
    wrong.assets[0].approval!.versionId = "old-version";
    expect(studioExportGate(wrong).allowed).toBe(false);
  });
  it("stops export if a required source was removed after review", async () => {
    const s = await reviewed();
    const c = structuredClone(find(s.engine, s.id));
    c.brand.sources.find(
      (source) => source.id === "cosmic-photo-solar-surge",
    )!.included = false;
    expect(studioExportGate(c).allowed).toBe(false);
  });
  it("neutralizes spreadsheet formula text and keeps organized ZIP paths inside the archive root", async () => {
    const s = await reviewed();
    const c = structuredClone(find(s.engine, s.id));
    c.brief.title = "../../CON: campaign";
    c.plan.copy.descriptions[0] = '=HYPERLINK("example")';
    expect(studioCopyCsv(c)).toContain("'=HYPERLINK");
    const exported = buildStudioExport(c);
    expect(exported.filename).not.toMatch(/[\\/]/);
    expect(
      Object.keys(exported.files).every(
        (name) =>
          !name.startsWith("/") &&
          !name.includes("\\") &&
          name
            .split("/")
            .every(
              (segment) =>
                segment !== "." &&
                segment !== ".." &&
                /^[a-zA-Z0-9_.-]+$/.test(segment),
            ),
      ),
    ).toBe(true);
  });
  it("stores V2 separately while retaining a complete legacy record verbatim", async () => {
    const legacy = initialState();
    legacy.preferences.preferredTone = "A prior merchant preference";
    const persistence = new StudioMemoryPersistence(undefined, legacy);
    const s = await setup({}, imageOnlyBrief(), persistence);
    await s.engine.run(s.id);
    expect(await persistence.legacy()).toEqual(legacy);
    const saved = await persistence.load();
    expect(saved?.schemaVersion).toBe(2);
    expect(saved?.campaigns).toHaveLength(1);
    const read = await persistence.legacy();
    read!.preferences.preferredTone = "Changed copy";
    expect(await persistence.legacy()).toEqual(legacy);
  });
});
