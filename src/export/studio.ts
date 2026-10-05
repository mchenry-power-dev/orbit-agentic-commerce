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
import {
  buildHandoffPreview,
  defaultHandoffSelection,
  handoffLogo,
  type DemoHandoff,
  type HandoffDestination,
  type HandoffSelection,
} from "../domain/handoff";
import { handoffRules } from "../validation/handoff-rules";

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
    const placementId =
      asset.kind === "image"
        ? ((asset.compatiblePlacementIds ?? [asset.placementId]).find(
            (id) =>
              !channel || getPlacement(id, campaign.brief).channel === channel,
          ) ?? asset.placementId)
        : asset.placementId;
    const folder =
      asset.kind === "image"
        ? `${getPlacement(placementId, campaign.brief).channel}/${safeFilename(placementId)}/`
        : "";
    const filename = `${folder}${safeFilename(asset.id)}-v${version.number}.${ext}`;
    if (files[filename])
      throw new Error("Export filenames collided; nothing was downloaded.");
    files[filename] = version.raster
      ? rasterBytes(version.raster.dataUrl)
      : strToU8(JSON.stringify(version.content, null, 2));
    if (version.recipe)
      files[
        `${folder}${safeFilename(asset.id)}-v${version.number}-recipe.json`
      ] = strToU8(JSON.stringify(version.recipe, null, 2));
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
  files["destination-handoff-summary.json"] = strToU8(
    JSON.stringify(
      {
        scope:
          "Approved creative downloads; not a complete launch-ready campaign or a platform import format",
        ruleVersion: handoffRules.version,
        accountAuthenticated: false,
        platformPolicy: "Not checked",
        published: false,
        destinations: campaign.brief.channels
          .filter(
            (destination) =>
              destination !== "email" && (!channel || channel === destination),
          )
          .map((destination) => {
            const preview = buildHandoffPreview(
              campaign,
              defaultHandoffSelection(
                campaign,
                destination as HandoffDestination,
              ),
            );
            return {
              destination,
              findings: preview.findings,
              note: "Open Preview channel publishing to select the family, target and reviewed brand assets.",
            };
          }),
      },
      null,
      2,
    ),
  );
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

/** Checks the original approved logo rather than treating a product photograph as branding. */
export async function verifyHandoffLogo(bytes: Uint8Array) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (
    bytes.length !== handoffLogo.bytes ||
    bytes.length < 33 ||
    ![137, 80, 78, 71, 13, 10, 26, 10].every(
      (value, index) => bytes[index] === value,
    ) ||
    view.getUint32(16) !== handoffLogo.width ||
    view.getUint32(20) !== handoffLogo.height
  )
    throw new Error(
      "The local logo does not match its recorded PNG dimensions and size. Brand review is unavailable.",
    );
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new Uint8Array(bytes).buffer,
  );
  const sha = [...new Uint8Array(digest)]
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("");
  if (sha !== handoffLogo.sha256)
    throw new Error(
      "The local logo differs from its approved source hash. Brand review is unavailable.",
    );
  return bytes;
}
let verifiedLogo: Promise<Uint8Array> | undefined;
export function loadHandoffLogo(): Promise<Uint8Array> {
  return (verifiedLogo ??= (async () => {
    const url = `${import.meta.env.BASE_URL}${handoffLogo.path.replace(/^\//, "")}`;
    const response = await fetch(url, { credentials: "omit" });
    if (!response.ok)
      throw new Error(
        "The bundled logo could not be read. Reopen this view to retry, or download an incomplete package.",
      );
    return verifyHandoffLogo(new Uint8Array(await response.arrayBuffer()));
  })().catch((error: unknown) => {
    verifiedLogo = undefined;
    throw error;
  }));
}

/** Explicitly incomplete downloads include approved current artifacts only, never launch-ready claims. */
export async function buildDestinationExport(
  campaign: StudioCampaign,
  selection: HandoffSelection,
  options: {
    allowIncomplete?: boolean;
    handoff?: DemoHandoff;
    logoBytes?: Uint8Array;
  } = {},
) {
  const preview = buildHandoffPreview(campaign, selection);
  if (!preview.canComplete && !options.allowIncomplete)
    throw new Error(
      "This destination is incomplete. Choose the explicitly incomplete download to include the remaining requirements.",
    );
  if (
    options.handoff &&
    (options.handoff.campaignId !== campaign.id ||
      options.handoff.signature !== preview.signature)
  )
    throw new Error(
      "The current mapping or asset versions differ from this saved handoff. The original record is unchanged; review and create a revised handoff.",
    );
  const files: Record<string, Uint8Array> = {};
  const exportedAssets = [];
  for (const reference of preview.assets) {
    const asset = campaign.assets.find(
      (item) => item.id === reference.assetId,
    )!;
    const version = asset.versions.find(
      (item) => item.id === reference.versionId,
    )!;
    const folder = `${selection.destination}/${safeFilename(reference.placements[0] ?? (asset.kind === "video" ? "video-brief" : asset.kind))}`;
    const extension = version.raster
      ? version.raster.mime === "image/png"
        ? "png"
        : "jpg"
      : "json";
    const filename = `${folder}/${safeFilename(asset.id)}-v${version.number}.${extension}`;
    if (files[filename])
      throw new Error("Export filenames collided; nothing was downloaded.");
    files[filename] = version.raster
      ? rasterBytes(version.raster.dataUrl)
      : strToU8(JSON.stringify(version.content, null, 2));
    if (version.recipe)
      files[
        `${folder}/${safeFilename(asset.id)}-v${version.number}-recipe.json`
      ] = strToU8(JSON.stringify(version.recipe, null, 2));
    exportedAssets.push({
      ...reference,
      filename,
      ...(asset.kind === "video"
        ? { deliverable: "Video brief only — not rendered video" }
        : {}),
    });
  }
  if (
    selection.destination === "google" &&
    selection.brandAssetsReviewed &&
    selection.logoVerified &&
    preview.mapping.performanceMax
  ) {
    const brand = (
      preview.mapping.performanceMax as { brandAssets: { logo: unknown } }
    ).brandAssets;
    if (brand.logo)
      files["google/brand-assets/cosmic-cat-original-logo.png"] =
        options.logoBytes
          ? await verifyHandoffLogo(options.logoBytes)
          : await loadHandoffLogo();
  }
  const manifest = {
    schemaVersion: 1,
    campaignId: campaign.id,
    destination: selection.destination,
    status: preview.canComplete
      ? "local-demo-mapping"
      : "incomplete-asset-package",
    generatedAt: new Date().toISOString(),
    handoffId: options.handoff?.id ?? null,
    ruleVersion: handoffRules.version,
    assets: exportedAssets,
    accountAuthenticated: false,
    platformPolicy: "Not checked",
    published: false,
    approvalMeaning:
      "Only current human-approved versions are included. This does not establish platform approval or live publication.",
  };
  files["manifest.json"] = strToU8(JSON.stringify(manifest, null, 2));
  files["destination-review-mapping.json"] = strToU8(
    JSON.stringify(preview.mapping, null, 2),
  );
  files["validation-findings.json"] = strToU8(
    JSON.stringify(
      { rules: handoffRules, findings: preview.findings },
      null,
      2,
    ),
  );
  if (options.handoff)
    files["local-demo-handoff.json"] = strToU8(
      JSON.stringify(options.handoff, null, 2),
    );
  const copy = preview.mapping.copy as StudioCampaign["plan"]["copy"] | null;
  const copyRows = [["destination", "field", "text", "scope"]];
  if (copy)
    for (const field of [
      "headlines",
      "longHeadlines",
      "descriptions",
      "ctas",
    ] as const)
      for (const value of copy[field])
        copyRows.push([
          selection.destination,
          field,
          value,
          "Approved copy review mapping; not a vendor import schema",
        ]);
  files[`${selection.destination}/copy-field-mapping.csv`] = strToU8(
    copyRows.map((row) => row.map(csvQuote).join(",")).join("\r\n"),
  );
  files["source-provenance.json"] = strToU8(
    JSON.stringify(
      {
        brand: campaign.brand.name,
        website: campaign.brand.website,
        ownership: campaign.brand.ownership,
        sources: campaign.brand.sources
          .filter((source) => source.included)
          .map(({ image: _image, ...source }) => source),
        products: campaign.brand.products
          .filter((product) => campaign.brief.productIds.includes(product.id))
          .map(({ photo: _photo, ...product }) => product),
      },
      null,
      2,
    ),
  );
  files["READ-ME.txt"] = strToU8(
    [
      preview.canComplete
        ? "LOCAL DEMO HANDOFF PACKAGE"
        : "INCOMPLETE ASSET PACKAGE — NOT LAUNCH READY",
      `Destination: ${selection.destination}`,
      "Nothing was sent to an ad platform or website. No account was authenticated, policy approved, campaign activated or spend changed.",
      "JSON and CSV are human-review mappings, not executable API requests or verified vendor import files.",
      "Only the listed current approved artifact versions are included. Missing, stale, rejected and invalid outputs are omitted.",
      "Video briefs contain scripts and shot lists, not rendered video. Website heroes need responsive integration and accessibility review in the actual site.",
      ...preview.findings.map(
        (finding) => `${finding.status}: ${finding.message}`,
      ),
    ].join("\n\n"),
  );
  return {
    files,
    manifest,
    preview,
    bytes: zipSync(files, { level: 6 }),
    filename: `${safeFilename(campaign.brief.title)}-${selection.destination}-${preview.canComplete ? "demo-handoff" : "incomplete"}.zip`,
  };
}
