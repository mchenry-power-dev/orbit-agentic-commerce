import { strToU8, zipSync } from "fflate";
import type { Campaign, CopyContent, ExportManifest } from "../domain";
import { currentVersion, isCurrent } from "../domain";
import { channelSpecs } from "../validation";
export function exportGate(campaign: Campaign): {
  allowed: boolean;
  reasons: string[];
} {
  const reasons: string[] = [];
  if (
    campaign.runs.some(
      (run) => run.status === "running" || run.status === "queued",
    )
  )
    reasons.push("A run is active; wait for persisted outputs.");
  for (const spec of campaign.blueprint.specs.filter((spec) => spec.required)) {
    const asset = campaign.assets.find((asset) => asset.spec.id === spec.id);
    const version = asset && currentVersion(asset);
    if (!asset || !version) {
      reasons.push(`${spec.title}: missing output.`);
      continue;
    }
    if (!isCurrent(campaign, version))
      reasons.push(`${spec.title}: stale after brief or context changes.`);
    if (version.validation.some((finding) => finding.severity === "error"))
      reasons.push(`${spec.title}: blocking validation findings.`);
    if (
      asset.approval?.status !== "approved" ||
      asset.approval.versionId !== version.id
    )
      reasons.push(`${spec.title}: current version requires approval.`);
  }
  return { allowed: reasons.length === 0, reasons };
}
export function safeFilename(value: string): string {
  const safe =
    value
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-zA-Z0-9_-]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 64) || "campaign";
  return /^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])$/i.test(safe)
    ? `_${safe}`
    : safe;
}
export function copyCsv(content: CopyContent): string {
  const quote = (value: string) =>
    `"${(/^(?:[\t\r\n]|\s*[=+\-@])/.test(value) ? "'" : "") + value.replace(/"/g, '""')}"`;
  return [
    "type,text",
    ...(
      ["headlines", "longHeadlines", "descriptions", "ctas"] as const
    ).flatMap((key) =>
      content[key].map((value) => `${quote(key)},${quote(value)}`),
    ),
  ].join("\r\n");
}
export function buildCampaignBrief(campaign: Campaign): string {
  const sections = [
    `# ${campaign.brief.title.replace(/[\r\n]/g, " ")}`,
    "Working reference demo · Sample data · Simulated providers",
    `Goal: ${campaign.brief.goal}`,
    `Audience: ${campaign.brief.audience}`,
    `Direction: ${campaign.brief.direction}`,
    `Tone: ${campaign.blueprint.tone}`,
  ];
  if (campaign.brief.offer)
    sections.push(
      `Merchant-provided offer (requires review): ${campaign.brief.offer}`,
    );
  sections.push(
    "## Context",
    campaign.context.references
      .map(
        (reference) =>
          `- ${campaign.context.selectedIds.includes(reference.id) ? "Included" : "Excluded"}: ${reference.title} — ${reference.reason}`,
      )
      .join("\n"),
  );
  sections.push(
    "## Blueprint",
    campaign.blueprint.summary,
    campaign.blueprint.instructions.map((text) => `- ${text}`).join("\n"),
    campaign.blueprint.preferenceNotes.join("\n\n"),
  );
  const landingAsset = campaign.assets.find(
    (asset) => asset.spec.id === "landing",
  );
  const landingVersion = landingAsset && currentVersion(landingAsset);
  if (landingVersion?.content.type === "landing") {
    const content = landingVersion.content;
    sections.push(
      "## Landing-page content",
      `Version ${landingVersion.number} · ${isCurrent(campaign, landingVersion) ? "current draft" : "STALE DRAFT — regenerate before handoff"} · ${landingAsset?.approval?.status === "approved" && landingAsset.approval.versionId === landingVersion.id ? "approved exact version" : "requires merchant review"}`,
    );
    sections.push(
      `### Hero\n\n${content.hero.eyebrow}\n\n${content.hero.title}\n\n${content.hero.body}\n\nCTA: ${content.hero.cta}\n\nImage reference: ${content.hero.imageAssetId}`,
    );
    sections.push(
      "### Benefits",
      content.benefits
        .map((benefit) => `**${benefit.title}**\n\n${benefit.body}`)
        .join("\n\n"),
    );
    sections.push(
      `### Product story\n\n${content.story.title}\n\n${content.story.body}`,
      `### Supporting content\n\n${content.supporting.title}\n\n${content.supporting.body}`,
    );
    if (content.faq.length)
      sections.push(
        "### FAQ",
        content.faq
          .map((item) => `**${item.question}**\n\n${item.answer}`)
          .join("\n\n"),
      );
  } else
    sections.push(
      "## Landing-page content",
      "Not generated yet. Create the portfolio to include the landing-page draft.",
    );
  sections.push(
    "## Handoff checklist",
    "- Review current versions and approve each required output.\n- Convert SVG concepts to supported raster formats; this is an incomplete platform asset group.\n- Confirm all product claims and offers with the merchant.\n- Complete platform policy checks before a separate publishing workflow.",
    "This is a campaign and landing-page handoff brief. Export does not publish a storefront, launch an advertisement or authorize spending.",
  );
  return sections.join("\n\n") + "\n";
}
export function buildExport(
  campaign: Campaign,
  clock: () => Date = () => new Date(),
): {
  bytes: Uint8Array;
  filename: string;
  manifest: ExportManifest;
  files: Record<string, Uint8Array>;
} {
  const gate = exportGate(campaign);
  if (!gate.allowed)
    throw new Error(`Export blocked: ${gate.reasons.join(" ")}`);
  const files: Record<string, Uint8Array> = {};
  const manifest: ExportManifest = {
    schemaVersion: 1,
    campaignId: campaign.id,
    title: campaign.brief.title,
    generatedAt: clock().toISOString(),
    sourceRevision: campaign.revision,
    contextFingerprint: campaign.context.fingerprint,
    mode: "sample-data-simulated-providers",
    channelSpecVersion: channelSpecs.version,
    limitations: [
      "Original SVG compositions are review drafts, not supported platform raster uploads.",
      "Copy CSV is a review artifact, not a verified Google import schema.",
      "Video output is a production brief, not a rendered video.",
      "Validation is a limited deterministic rule set; platform policy and merchant review remain necessary.",
      "Export does not authorize publishing or advertising spend.",
    ],
    assets: [],
  };
  for (const asset of campaign.assets) {
    const version = currentVersion(asset);
    if (
      !version ||
      asset.approval?.status !== "approved" ||
      asset.approval.versionId !== version.id ||
      !isCurrent(campaign, version)
    )
      continue;
    const filename = `${safeFilename(asset.spec.id)}-v${version.number}.${version.content.type === "image" ? "svg" : "json"}`;
    if (files[filename]) throw new Error("Duplicate safe export filenames.");
    files[filename] = strToU8(
      version.content.type === "image"
        ? version.content.svg
        : JSON.stringify(version.content, null, 2),
    );
    manifest.assets.push({
      assetId: asset.spec.id,
      versionId: version.id,
      versionNumber: version.number,
      filename,
      approvedAt: asset.approval.at,
      sourceReferenceIds: [...asset.spec.sourceReferenceIds],
      validation: version.validation,
    });
    if (version.content.type === "copy")
      files["copy-review.csv"] = strToU8(copyCsv(version.content));
  }
  files["manifest.json"] = strToU8(JSON.stringify(manifest, null, 2));
  files["campaign-brief.md"] = strToU8(buildCampaignBrief(campaign));
  return {
    bytes: zipSync(files, { level: 6 }),
    filename: `${safeFilename(campaign.brief.title)}-approved-portfolio.zip`,
    manifest,
    files,
  };
}
