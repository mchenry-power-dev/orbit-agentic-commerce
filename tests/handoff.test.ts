import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { strFromU8, unzipSync } from "fflate";
import sharp from "sharp";
import type { StudioCampaign } from "../src/domain/studio";
import { studioVersion } from "../src/domain/studio";
import { freshStudioState } from "../src/domain/studio";
import { StudioMemoryPersistence } from "../src/persistence/studio";
import { StudioEngine } from "../src/orchestration/studio";
import {
  buildHandoffPreview,
  createDemoHandoff,
  defaultHandoffSelection,
  handoffLogo,
} from "../src/domain/handoff";
import {
  buildDestinationExport,
  verifyHandoffLogo,
} from "../src/export/studio";

const source = JSON.parse(
  readFileSync("public/samples/cosmic-christmas.json", "utf8"),
) as StudioCampaign;
function reviewed() {
  const campaign = structuredClone(source);
  for (const asset of campaign.assets)
    asset.approval = {
      versionId: asset.currentVersionId!,
      status: "approved",
      at: "2026-10-05T12:00:00Z",
    };
  return campaign;
}
const readyGoogle = (campaign: StudioCampaign) => ({
  ...defaultHandoffSelection(campaign, "google"),
  brandAssetsReviewed: true,
  logoVerified: true,
});
const logoBytes = () =>
  new Uint8Array(readFileSync(`public${handoffLogo.path}`));

describe("destination handoff readiness", () => {
  it("requires explicit local brand review and maps Google campaign-level brand assets separately", () => {
    const campaign = reviewed();
    const missing = buildHandoffPreview(
      campaign,
      defaultHandoffSelection(campaign, "google"),
    );
    expect(missing.canComplete).toBe(false);
    expect(
      missing.findings.some(
        (finding) => finding.code === "brand-assets-required",
      ),
    ).toBe(true);
    const result = buildHandoffPreview(campaign, readyGoogle(campaign));
    expect(result.findings.filter((finding) => finding.blocking)).toEqual([]);
    expect(result.mapping.performanceMax).toMatchObject({
      brandAssets: {
        scope: "campaign",
        reviewedLocally: true,
        logo: { sha256: handoffLogo.sha256, classification: "logo" },
      },
      assetGroup: { videoRelationships: [] },
    });
    expect(
      result.assets.every((asset) => !!asset.versionId && !!asset.approvedAt),
    ).toBe(true);
  });
  it("keeps retail supplied-asset minimums and legacy brand linkage distinct", () => {
    const campaign = reviewed();
    const selection = readyGoogle(campaign);
    const legacy = buildHandoffPreview(campaign, {
      ...selection,
      targetId: "demo-google-legacy",
    });
    expect(legacy.mapping.performanceMax).toMatchObject({
      brandAssets: { scope: "asset-group" },
    });
    const retail = buildHandoffPreview(campaign, {
      ...selection,
      targetId: "demo-google-retail",
      assetIds: selection.assetIds.filter((id) => !id.includes("landscape")),
    });
    expect(retail.canComplete).toBe(false);
    expect(
      retail.findings.some(
        (finding) => finding.field === "google-landscape" && finding.blocking,
      ),
    ).toBe(true);
  });
  it("does not assume the Cosmic logo belongs to an unrelated store", () => {
    const campaign = reviewed();
    campaign.brand.id = "another-store";
    expect(
      buildHandoffPreview(campaign, readyGoogle(campaign)).findings.some(
        (finding) => finding.code === "brand-assets-required",
      ),
    ).toBe(true);
  });
  it("reports a field-specific Google headline problem without marking image formats invalid", () => {
    const campaign = reviewed();
    const copy = studioVersion(
      campaign.assets.find((asset) => asset.kind === "copy")!,
    )!;
    (copy.content as StudioCampaign["plan"]["copy"]).headlines[0] =
      "A headline that is deliberately over thirty characters";
    const result = buildHandoffPreview(campaign, readyGoogle(campaign));
    expect(result.canComplete).toBe(false);
    expect(
      result.findings.some(
        (finding) =>
          finding.code === "google-copy-length" &&
          finding.field === "headlines.0",
      ),
    ).toBe(true);
    expect(
      result.findings.some(
        (finding) =>
          finding.status === "Format checked" && finding.field === "images",
      ),
    ).toBe(true);
  });
  it("uses exact approved copy content rather than mutable plan defaults", () => {
    const campaign = reviewed();
    campaign.plan.copy.headlines = ["Unapproved plan change"];
    const result = buildHandoffPreview(
      campaign,
      defaultHandoffSelection(campaign, "meta"),
    );
    const approvedCopy = studioVersion(
      campaign.assets.find((asset) => asset.kind === "copy")!,
    )!.content;
    expect(result.mapping.copy).toEqual(approvedCopy);
    expect(result.mapping.copy).not.toEqual(campaign.plan.copy);
  });
  it("models Meta ad-set context and ad drafts as conceptual, not platform passed", () => {
    const result = buildHandoffPreview(
      reviewed(),
      defaultHandoffSelection(reviewed(), "meta"),
    );
    expect(result.canComplete).toBe(true);
    expect(result.mapping.meta).toMatchObject({
      campaign: "demo-meta-campaign",
      adSet: "demo-meta-prospecting",
      mappingScope: expect.stringContaining("Conceptual"),
    });
    expect(
      result.findings.some(
        (finding) =>
          finding.code === "meta-not-checked" &&
          finding.status === "Not checked",
      ),
    ).toBe(true);
    expect(JSON.stringify(result.mapping)).not.toContain("assetGroup");
  });
  it("blocks TikTok completion even when a storyboard is approved", () => {
    const campaign = reviewed();
    campaign.brief.channels.push("tiktok");
    const result = buildHandoffPreview(
      campaign,
      defaultHandoffSelection(campaign, "tiktok"),
    );
    expect(
      result.findings.some(
        (finding) => finding.status === "Video required" && finding.blocking,
      ),
    ).toBe(true);
    expect(result.mapping.tiktok).toMatchObject({
      adGroup: "demo-tiktok-infeed",
      adInputs: { actualVideo: null },
    });
    expect(() => createDemoHandoff(campaign, result.selection, [])).toThrow(
      "Video required",
    );
  });
  it("requires both responsive website heroes and an approved content version", () => {
    const campaign = reviewed();
    const selection = defaultHandoffSelection(campaign, "website");
    expect(buildHandoffPreview(campaign, selection).canComplete).toBe(true);
    const missing = buildHandoffPreview(campaign, {
      ...selection,
      assetIds: selection.assetIds.filter(
        (id) => !id.includes("mobile") && id !== "landing",
      ),
    });
    expect(
      missing.findings
        .filter((finding) => finding.blocking)
        .map((finding) => finding.code),
    ).toEqual(
      expect.arrayContaining([
        "website-hero-required",
        "website-content-required",
      ]),
    );
  });
  it("rejects missing URL, unknown target, stale selection and running changes", () => {
    const campaign = reviewed();
    campaign.runs.push({
      id: "running",
      status: "running",
      assetIds: [],
      completedIds: [],
      attempts: {},
      at: "2026-10-05",
    });
    const result = buildHandoffPreview(campaign, {
      ...readyGoogle(campaign),
      targetId: "real-account",
      finalUrl: "javascript:alert(1)",
      assetIds: ["missing"],
    });
    expect(result.canComplete).toBe(false);
    expect(result.findings.map((finding) => finding.code)).toEqual(
      expect.arrayContaining(["target", "url", "selection", "running"]),
    );
  });
});

describe("immutable local handoffs and real packages", () => {
  it("serializes simultaneous completion clicks and persists one exact record", async () => {
    const campaign = reviewed();
    const persistence = new StudioMemoryPersistence({
      ...freshStudioState(),
      campaigns: [campaign],
    });
    const engine = new StudioEngine(persistence);
    await engine.initialize();
    const selection = defaultHandoffSelection(campaign, "meta");
    const [first, repeated] = await Promise.all([
      engine.addHandoff(campaign.id, selection),
      engine.addHandoff(campaign.id, selection),
    ]);
    expect(first.id).toBe(repeated.id);
    expect(engine.getSnapshot().campaigns[0].handoffs).toHaveLength(1);
    const reloaded = new StudioEngine(persistence);
    await reloaded.initialize();
    expect(reloaded.getSnapshot().campaigns[0].handoffs).toEqual([first]);
  });
  it("does not show a completed record when persistent storage fails", async () => {
    const campaign = reviewed();
    const persistence = new StudioMemoryPersistence({
      ...freshStudioState(),
      campaigns: [campaign],
    });
    const engine = new StudioEngine(persistence);
    await engine.initialize();
    persistence.save = async () => {
      throw new Error("Local save failed. Keep this tab open and retry.");
    };
    await expect(
      engine.addHandoff(campaign.id, defaultHandoffSelection(campaign, "meta")),
    ).rejects.toThrow("Local save failed");
    expect(engine.getSnapshot().campaigns[0].handoffs).toBeUndefined();
    expect(engine.getSnapshot().campaigns[0].assets).toEqual(campaign.assets);
  });
  it("reuses repeated completion and creates a new record only for an explicitly changed approved version", () => {
    const campaign = reviewed();
    const selection = defaultHandoffSelection(campaign, "meta");
    const initial = createDemoHandoff(campaign, selection, [], {
      id: "one",
      now: "2026-10-05T12:00:00Z",
    });
    const original = structuredClone(initial.record);
    const repeat = createDemoHandoff(campaign, selection, [initial.record], {
      id: "two",
    });
    expect(repeat.reused).toBe(true);
    expect(repeat.record.id).toBe("demo-handoff-one");
    const image = campaign.assets.find(
      (asset) =>
        asset.id ===
        initial.record.assets.find((asset) => asset.kind === "image")!.assetId,
    )!;
    const next = structuredClone(studioVersion(image)!);
    next.id = "new-version";
    next.number++;
    image.versions.push(next);
    image.currentVersionId = next.id;
    expect(() =>
      createDemoHandoff(campaign, selection, [initial.record]),
    ).toThrow("Needs review");
    image.approval = {
      versionId: next.id,
      status: "approved",
      at: "2026-10-05T13:00:00Z",
    };
    const revised = createDemoHandoff(campaign, selection, [initial.record], {
      id: "two",
    });
    expect(revised.reused).toBe(false);
    expect(revised.record.id).toBe("demo-handoff-two");
    expect(initial.record).toEqual(original);
    expect(
      initial.record.assets.some((asset) => asset.versionId === "new-version"),
    ).toBe(false);
    expect(
      revised.record.assets.some((asset) => asset.versionId === "new-version"),
    ).toBe(true);
    expect(revised.record).toMatchObject({
      status: "local-demo-only",
      accountAuthenticated: false,
      platformPolicyApproved: false,
      published: false,
    });
  });
  it("verifies actual logo dimensions, bytes and SHA before packaging", async () => {
    expect(await verifyHandoffLogo(logoBytes())).toHaveLength(
      handoffLogo.bytes,
    );
    const changed = logoBytes();
    changed[changed.length - 15] ^= 1;
    await expect(verifyHandoffLogo(changed)).rejects.toThrow("source hash");
    await expect(verifyHandoffLogo(new Uint8Array(33))).rejects.toThrow(
      "dimensions and size",
    );
  });
  it("writes real decodable Google images and source-identical logo with exact approved manifest refs", async () => {
    const campaign = reviewed();
    const selection = readyGoogle(campaign);
    const { record } = createDemoHandoff(campaign, selection, [], {
      id: "export",
    });
    const packet = await buildDestinationExport(campaign, selection, {
      handoff: record,
      logoBytes: logoBytes(),
    });
    const files = unzipSync(packet.bytes);
    const manifest = JSON.parse(strFromU8(files["manifest.json"]));
    expect(manifest.handoffId).toBe("demo-handoff-export");
    expect(files["google/brand-assets/cosmic-cat-original-logo.png"]).toEqual(
      logoBytes(),
    );
    for (const entry of manifest.assets.filter(
      (asset: { kind: string }) => asset.kind === "image",
    )) {
      const actual = await sharp(files[entry.filename]).metadata();
      const original = studioVersion(
        campaign.assets.find((asset) => asset.id === entry.assetId)!,
      )!;
      expect([actual.width, actual.height]).toEqual([
        original.raster!.width,
        original.raster!.height,
      ]);
      expect(entry.versionId).toBe(original.id);
      expect(entry.filename).toMatch(
        /^google\/[a-z0-9-]+\/[a-z0-9-]+-v\d+\.(jpg|png)$/,
      );
    }
    expect(strFromU8(files["READ-ME.txt"])).toContain("Nothing was sent");
    expect(strFromU8(files["destination-review-mapping.json"])).toContain(
      "not an API request",
    );
  });
  it("requires explicit incomplete export and never includes stale or rejected assets", async () => {
    const campaign = reviewed();
    const selection = defaultHandoffSelection(campaign, "meta");
    const image = campaign.assets.find(
      (asset) =>
        selection.assetIds.includes(asset.id) && asset.kind === "image",
    )!;
    image.stale = true;
    const copy = campaign.assets.find((asset) => asset.kind === "copy")!;
    copy.approval!.status = "rejected";
    await expect(buildDestinationExport(campaign, selection)).rejects.toThrow(
      "explicitly incomplete",
    );
    const packet = await buildDestinationExport(campaign, selection, {
      allowIncomplete: true,
    });
    expect(packet.manifest.status).toBe("incomplete-asset-package");
    expect(
      packet.manifest.assets.some(
        (asset) => asset.assetId === image.id || asset.assetId === copy.id,
      ),
    ).toBe(false);
    expect(packet.filename).toContain("incomplete");
    expect(strFromU8(packet.files["READ-ME.txt"])).toContain(
      "NOT LAUNCH READY",
    );
  });
  it("does not relabel a historical handoff with changed current versions or mapping", async () => {
    const campaign = reviewed();
    const selection = defaultHandoffSelection(campaign, "meta");
    const { record } = createDemoHandoff(campaign, selection, []);
    await expect(
      buildDestinationExport(
        campaign,
        { ...selection, finalUrl: "https://example.com/changed" },
        { handoff: record },
      ),
    ).rejects.toThrow("original record is unchanged");
  });
  it("escapes spreadsheet-active strings in placement-mapped CSV", async () => {
    const campaign = reviewed();
    const copy = studioVersion(
      campaign.assets.find((asset) => asset.kind === "copy")!,
    )!;
    (copy.content as StudioCampaign["plan"]["copy"]).headlines[0] = "=SUM(1,2)";
    const packet = await buildDestinationExport(
      campaign,
      defaultHandoffSelection(campaign, "meta"),
    );
    expect(strFromU8(packet.files["meta/copy-field-mapping.csv"])).toContain(
      '"\'=SUM(1,2)"',
    );
  });
});
