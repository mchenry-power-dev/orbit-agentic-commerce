import { strToU8, zipSync } from "fflate";
import { studioStatus, studioVersion } from "../domain/studio";
import type { Channel, StudioCampaign } from "../domain/studio";
import {
  getPlacement,
  validatePlacement,
  validateStudioCopy,
  validateStudioBrief,
} from "../validation/placements";
import { safeFilename } from "./index";

function selectedAssets(campaign: StudioCampaign, channel?: Channel) {
  return campaign.assets.filter(
    (asset) =>
      !channel ||
      asset.kind === "copy" ||
      asset.kind === "plan" ||
      (asset.kind === "landing"
        ? channel === "website"
        : asset.kind === "video"
          ? channel === "tiktok"
          : (asset.compatiblePlacementIds ?? [asset.placementId]).some(
              (id) => getPlacement(id, campaign.brief).channel === channel,
            )),
  );
}
export function studioExportGate(campaign: StudioCampaign, channel?: Channel) {
  const reasons: string[] = [];
  reasons.push(
    ...validateStudioBrief(campaign.brief, campaign.brand)
      .filter((f) => f.severity === "error")
      .map((f) => f.message),
  );
  if (campaign.runs.some((run) => run.status === "running"))
    reasons.push("Wait for the active creation run or pause it.");
  if (!campaign.plan.confirmed || campaign.plan.conflicts.length)
    reasons.push("Resolve and confirm the current interpretation.");
  if (
    !campaign.brief.productIds.every((id) =>
      campaign.brand.products.some((p) => p.id === id && p.confirmed),
    )
  )
    reasons.push("Confirm the selected product facts.");
  if (channel && !campaign.brief.channels.includes(channel))
    reasons.push("This destination was not selected in the plan.");
  const assets = selectedAssets(campaign, channel);
  if (!assets.length) reasons.push("No outputs exist for this destination.");
  for (const asset of assets) {
    if (studioStatus(asset) !== "Approved")
      reasons.push(`${asset.title}: ${studioStatus(asset).toLowerCase()}.`);
    const version = studioVersion(asset);
    if (version && asset.kind === "image")
      for (const placement of asset.compatiblePlacementIds ?? [
        asset.placementId,
      ]) {
        if (
          validatePlacement(placement, version, campaign.brief).some(
            (f) => f.severity === "error",
          )
        )
          reasons.push(`${asset.title}: current raster checks failed.`);
      }
    if (
      version &&
      asset.kind === "copy" &&
      validateStudioCopy(
        version.content as StudioCampaign["plan"]["copy"],
        campaign.brief.channels,
        campaign.brief,
        campaign.brand,
      ).some((f) => f.severity === "error")
    )
      reasons.push("Current copy checks failed.");
  }
  return { allowed: reasons.length === 0, reasons };
}
const csvQuote = (text: string) =>
  `"${(/^(?:[\t\r\n]|\s*[=+\-@])/.test(text) ? "'" : "") + text.replace(/"/g, '""')}"`;
export function studioCopyCsv(campaign: StudioCampaign, channel?: Channel) {
  const rows = [["destination", "placement", "field", "text", "check_status"]];
  for (const placementId of campaign.brief.placementIds) {
    const placement = getPlacement(placementId, campaign.brief);
    if (channel && channel !== placement.channel) continue;
    const content =
      campaign.plan.placementCopy?.find((c) => c.placementId === placementId) ??
      campaign.plan.copy;
    if (placement.channel === "google") {
      for (const field of [
        "headlines",
        "longHeadlines",
        "descriptions",
        "ctas",
      ] as const)
        for (const text of content[field])
          rows.push([
            placement.channel,
            placementId,
            field,
            text,
            field === "ctas"
              ? "Orbit draft CTA; selected platform CTA not checked"
              : "Google field counts/lengths checked separately; policy not checked",
          ]);
    } else {
      rows.push([
        placement.channel,
        placementId,
        placement.channel === "website" ? "hero_title" : "draft_headline",
        content.headlines[0] ?? "",
        "Draft mapping; platform rules not checked",
      ]);
      rows.push([
        placement.channel,
        placementId,
        placement.channel === "website" ? "hero_body" : "draft_body",
        content.descriptions.join(" "),
        "Draft mapping; platform rules not checked",
      ]);
      rows.push([
        placement.channel,
        placementId,
        "draft_cta",
        content.ctas[0] ?? "",
        "Draft mapping; platform CTA not checked",
      ]);
    }
  }
  return rows.map((row) => row.map(csvQuote).join(",")).join("\r\n");
}
function rasterBytes(dataUrl: string) {
  if (!/^data:image\/(?:png|jpeg);base64,[a-zA-Z0-9+/=]+$/.test(dataUrl))
    throw new Error("Invalid raster encoding; export stopped.");
  return Uint8Array.from(atob(dataUrl.slice(dataUrl.indexOf(",") + 1)), (ch) =>
    ch.charCodeAt(0),
  );
}
export function buildStudioExport(campaign: StudioCampaign, channel?: Channel) {
  const gate = studioExportGate(campaign, channel);
  if (!gate.allowed) throw new Error(gate.reasons.join(" "));
  const files: Record<string, Uint8Array> = {};
  const manifest = {
    schemaVersion: 2,
    campaignId: campaign.id,
    title: campaign.brief.title,
    mode: campaign.mode,
    generatedAt: new Date().toISOString(),
    destination: channel ?? "selected-destinations",
    placementSpecVersion: "2026-10-03-v2",
    approvalMeaning:
      "Merchant approval of an exact version; account connection and platform policy approval are separate and not established.",
    limitations: [
      "Local photo compositions and prebuilt samples are labeled separately from configured live generation.",
      "Meta placement rules remain Not checked; website/email sizes are chosen design targets.",
      "Video outputs are scripts/shot lists, not finished motion or audio.",
      "Copy JSON/CSV are explicit review mappings, not verified platform import schemas.",
      "Export does not publish, change advertising spend, or authorize generation costs.",
    ],
    assets: [] as {
      assetId: string;
      versionId: string;
      versionNumber: number;
      familyId: string;
      placements: string[];
      filename: string;
      approvedAt: string;
      dependencyFingerprint: string;
      mode: string;
      sourceIds: string[];
      findings: unknown[];
    }[],
  };
  for (const asset of selectedAssets(campaign, channel)) {
    const version = studioVersion(asset)!;
    const ext = version.raster
      ? version.raster.mime === "image/png"
        ? "png"
        : "jpg"
      : "json";
    const filename = `${safeFilename(asset.id)}-v${version.number}.${ext}`;
    if (files[filename])
      throw new Error("Export filenames collided; nothing was downloaded.");
    files[filename] = version.raster
      ? rasterBytes(version.raster.dataUrl)
      : strToU8(JSON.stringify(version.content, null, 2));
    if (version.recipe)
      files[`${safeFilename(asset.id)}-v${version.number}-recipe.json`] =
        strToU8(JSON.stringify(version.recipe, null, 2));
    manifest.assets.push({
      assetId: asset.id,
      versionId: version.id,
      versionNumber: version.number,
      familyId: asset.familyId,
      placements: asset.compatiblePlacementIds ?? [asset.placementId],
      filename,
      approvedAt: asset.approval!.at,
      dependencyFingerprint: version.dependencyFingerprint,
      mode: version.mode,
      sourceIds: [...version.sourceIds],
      findings: version.findings,
    });
  }
  files["copy-field-mapping.csv"] = strToU8(studioCopyCsv(campaign, channel));
  files["brand-provenance.json"] = strToU8(
    JSON.stringify(
      {
        brand: campaign.brand.name,
        website: campaign.brand.website,
        ownership: campaign.brand.ownership,
        sources: campaign.brand.sources
          .filter((s) => s.included)
          .map(({ image: _image, ...source }) => source),
        products: campaign.brand.products
          .filter((p) => campaign.brief.productIds.includes(p.id))
          .map(({ photo: _photo, ...product }) => product),
      },
      null,
      2,
    ),
  );
  files["manifest.json"] = strToU8(JSON.stringify(manifest, null, 2));
  files["campaign-brief.md"] = strToU8(
    `# ${campaign.brief.title}\n\nMode: ${campaign.mode}\n\n${campaign.brief.description}\n\nAudience: ${campaign.brief.audience}\nGoal: ${campaign.brief.goal}\nOffer: ${campaign.brief.offer || "None"}\n\n## Creative plan\n\n${campaign.plan.interpretation}\n\n## Landing content\n\n${campaign.plan.landing.title}\n\n${campaign.plan.landing.body}\n\n${campaign.plan.landing.sections.map((s) => `### ${s.title}\n\n${s.body}`).join("\n\n")}\n\nCTA: ${campaign.plan.landing.cta}\n\n## Budget assumptions\n\n${JSON.stringify(campaign.brief.budget, null, 2)}\n\nAd budget is a user-supplied planning assumption, separate from model-generation costs. No advertising account, publishing or performance feed is connected.\n`,
  );
  return {
    files,
    manifest,
    bytes: zipSync(files, { level: 6 }),
    filename: `${safeFilename(campaign.brief.title)}-${channel ?? "portfolio"}-approved.zip`,
  };
}
