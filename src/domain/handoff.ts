import type { StudioAsset, StudioCampaign, StudioPlan } from "./studio";
import { studioStatus, studioVersion } from "./studio";
import { cosmicCatSnapshot } from "../fixtures/cosmic-cat";
import {
  getPlacement,
  studioAdsCharacterCount,
  validatePlacement,
  validateStudioCopy,
} from "../validation/placements";
import { handoffRules } from "../validation/handoff-rules";

export type HandoffDestination = "google" | "meta" | "tiktok" | "website";
export const handoffDestinationNames: Record<HandoffDestination, string> = {
  google: "Google Ads",
  meta: "Meta Ads",
  tiktok: "TikTok Ads",
  website: "Website assets",
};
export interface HandoffSelection {
  destination: HandoffDestination;
  targetId: string;
  familyId: string;
  assetIds: string[];
  finalUrl: string;
  brandAssetsReviewed: boolean;
  logoVerified: boolean;
}
export interface HandoffTarget {
  id: string;
  destination: HandoffDestination;
  accountId: string;
  accountName: string;
  name: string;
  context: string;
  brandGuidelines?: boolean;
  retail?: boolean;
}
export const handoffTargets: HandoffTarget[] = [
  {
    id: "demo-google-pmax",
    destination: "google",
    accountId: "demo-google-account",
    accountName: "Orbit · Demo account",
    name: "Demo PMax · brand guidelines",
    context: "Performance Max campaign → asset group",
    brandGuidelines: true,
    retail: false,
  },
  {
    id: "demo-google-retail",
    destination: "google",
    accountId: "demo-google-account",
    accountName: "Orbit · Demo account",
    name: "Demo retail PMax · product feed",
    context: "Retail campaign → asset group (supplied assets)",
    brandGuidelines: true,
    retail: true,
  },
  {
    id: "demo-google-legacy",
    destination: "google",
    accountId: "demo-google-account",
    accountName: "Orbit · Demo account",
    name: "Demo PMax · asset-group brand assets",
    context: "Performance Max campaign → asset group",
    brandGuidelines: false,
    retail: false,
  },
  {
    id: "demo-meta-prospecting",
    destination: "meta",
    accountId: "demo-meta-account",
    accountName: "Orbit · Demo account",
    name: "Demo campaign / Prospecting ad set",
    context: "Campaign → ad set → creative variants → ad drafts",
  },
  {
    id: "demo-meta-retargeting",
    destination: "meta",
    accountId: "demo-meta-account",
    accountName: "Orbit · Demo account",
    name: "Demo campaign / Returning visitors ad set",
    context: "Campaign → ad set → creative variants → ad drafts",
  },
  {
    id: "demo-tiktok-infeed",
    destination: "tiktok",
    accountId: "demo-tiktok-account",
    accountName: "Orbit · Demo account",
    name: "Demo campaign / Non-Spark in-feed ad group",
    context: "Campaign → ad group → video ad drafts",
  },
  {
    id: "demo-website-home",
    destination: "website",
    accountId: "demo-website-workspace",
    accountName: "Orbit · Demo workspace",
    name: "Demo homepage hero package",
    context: "Responsive desktop/mobile heroes + page content",
  },
  {
    id: "demo-website-campaign",
    destination: "website",
    accountId: "demo-website-workspace",
    accountName: "Orbit · Demo workspace",
    name: "Demo campaign landing package",
    context: "Responsive desktop/mobile heroes + page content",
  },
];

const logoSource = cosmicCatSnapshot.photos.find(
  (source) => source.id === "cosmic-logo",
)!;
export const handoffLogo = {
  sourceId: logoSource.id,
  path: logoSource.path!,
  sourceUrl: logoSource.sourceUrl,
  snapshotDate: logoSource.retrievedAt,
  sha256: logoSource.sha256!,
  width: logoSource.width!,
  height: logoSource.height!,
  bytes: logoSource.bytes!,
  classification: "logo" as const,
};
export function hasBundledHandoffLogo(campaign: StudioCampaign) {
  return (
    campaign.brand.id === cosmicCatSnapshot.id &&
    campaign.brand.website.replace(/\/$/, "") ===
      cosmicCatSnapshot.site.replace(/\/$/, "") &&
    campaign.brand.sources.some(
      (source) => source.id === handoffLogo.sourceId && source.included,
    )
  );
}

export interface HandoffAssetReference {
  assetId: string;
  versionId: string;
  versionNumber: number;
  approvedAt: string;
  familyId: string;
  title: string;
  kind: StudioAsset["kind"];
  placements: string[];
  dependencyFingerprint: string;
  sourceIds: string[];
  findings: unknown[];
}
export interface HandoffFinding {
  code: string;
  status: "Format checked" | "Needs changes" | "Not checked" | "Video required";
  blocking: boolean;
  field: string;
  message: string;
}
export interface HandoffPreview {
  destination: HandoffDestination;
  target?: HandoffTarget;
  selection: HandoffSelection;
  assets: HandoffAssetReference[];
  findings: HandoffFinding[];
  canComplete: boolean;
  mapping: Record<string, unknown>;
  signature: string;
}
export interface DemoHandoff {
  schemaVersion: 1;
  id: string;
  campaignId: string;
  campaignTitle: string;
  createdAt: string;
  destination: HandoffDestination;
  selection: HandoffSelection;
  assets: HandoffAssetReference[];
  mapping: Record<string, unknown>;
  findings: HandoffFinding[];
  ruleVersion: string;
  signature: string;
  status: "local-demo-only";
  accountAuthenticated: false;
  platformPolicyApproved: false;
  published: false;
}

export function handoffCandidates(
  campaign: StudioCampaign,
  destination: HandoffDestination,
  familyId: string,
) {
  return campaign.assets.filter((asset) => {
    if (asset.kind === "copy") return true;
    if (asset.kind === "landing") return destination === "website";
    if (asset.kind === "video") return destination === "tiktok";
    if (asset.kind !== "image" || asset.familyId !== familyId) return false;
    return (asset.compatiblePlacementIds ?? [asset.placementId]).some((id) => {
      try {
        return getPlacement(id, campaign.brief).channel === destination;
      } catch {
        return false;
      }
    });
  });
}
export function defaultHandoffSelection(
  campaign: StudioCampaign,
  destination: HandoffDestination = "google",
): HandoffSelection {
  const familyId = campaign.plan.directions[0]?.id ?? "";
  return {
    destination,
    targetId: handoffTargets.find(
      (target) => target.destination === destination,
    )!.id,
    familyId,
    assetIds: handoffCandidates(campaign, destination, familyId).map(
      (asset) => asset.id,
    ),
    finalUrl: campaign.brand.website,
    brandAssetsReviewed: false,
    logoVerified: false,
  };
}
function safeFinalUrl(value: string) {
  try {
    const url = new URL(value);
    return (
      value.length <= 2048 &&
      url.protocol === "https:" &&
      !!url.hostname &&
      !url.username &&
      !url.password
    );
  } catch {
    return false;
  }
}
function usableCopy(content: unknown): content is StudioPlan["copy"] {
  const copy = content as StudioPlan["copy"] | undefined;
  return (
    !!copy &&
    [copy.headlines, copy.longHeadlines, copy.descriptions, copy.ctas].every(
      (field) =>
        Array.isArray(field) &&
        field.every((value) => typeof value === "string"),
    )
  );
}

export function buildHandoffPreview(
  campaign: StudioCampaign,
  input: HandoffSelection,
): HandoffPreview {
  const selection = {
    ...input,
    assetIds: [...new Set(input.assetIds)].sort(),
    finalUrl: input.finalUrl.trim(),
    brandAssetsReviewed:
      input.destination === "google" && input.brandAssetsReviewed,
    logoVerified: input.destination === "google" && input.logoVerified,
  };
  const destination = selection.destination;
  const target = handoffTargets.find(
    (item) =>
      item.id === selection.targetId && item.destination === destination,
  );
  const findings: HandoffFinding[] = [];
  const add = (
    code: string,
    field: string,
    message: string,
    blocking = true,
    status: HandoffFinding["status"] = blocking
      ? "Needs changes"
      : "Not checked",
  ) => findings.push({ code, field, message, blocking, status });
  if (!target)
    add(
      "target",
      "target",
      "Choose a listed demo account and campaign target.",
    );
  if (!campaign.brief.channels.includes(destination))
    add(
      "destination",
      "destination",
      "Add this destination in the campaign brief and compose its placements first.",
    );
  if (!campaign.plan.confirmed || campaign.plan.conflicts.length)
    add(
      "plan",
      "plan",
      "Resolve and confirm the campaign interpretation first.",
    );
  if (campaign.runs.some((run) => run.status === "running"))
    add("running", "campaign", "Wait for creation or revision to finish.");
  if (
    !campaign.plan.directions.some(
      (direction) => direction.id === selection.familyId,
    )
  )
    add("family", "family", "Choose a current creative family.");
  if (!safeFinalUrl(selection.finalUrl))
    add(
      "url",
      "finalUrl",
      "Provide a complete HTTPS destination URL. Its contents and ownership are not checked.",
    );
  const candidates = handoffCandidates(
    campaign,
    destination,
    selection.familyId,
  );
  if (
    selection.assetIds.some(
      (id) => !candidates.some((asset) => asset.id === id),
    )
  )
    add(
      "selection",
      "assets",
      "Some selected assets no longer belong to this destination and family. Select current assets again.",
    );
  const chosen = candidates.filter((asset) =>
    selection.assetIds.includes(asset.id),
  );
  const assets: HandoffAssetReference[] = [];
  let copy: StudioPlan["copy"] | undefined;
  let landing: unknown;
  let videoBrief: unknown;
  for (const asset of chosen) {
    const version = studioVersion(asset);
    if (studioStatus(asset) !== "Approved" || !version) {
      add(
        "approval",
        asset.id,
        `${asset.title}: ${studioStatus(asset)}. Review the current version before mapping it.`,
      );
      continue;
    }
    const placements = (
      asset.compatiblePlacementIds ?? [asset.placementId]
    ).filter((id) => {
      try {
        return getPlacement(id, campaign.brief).channel === destination;
      } catch {
        return asset.kind !== "image";
      }
    });
    if (asset.kind === "image") {
      const errors = placements
        .flatMap((id) => validatePlacement(id, version, campaign.brief))
        .filter((finding) => finding.severity === "error");
      if (errors.length) {
        errors.forEach((finding) =>
          add(finding.code, asset.id, `${asset.title}: ${finding.message}`),
        );
        continue;
      }
    }
    if (asset.kind === "copy") {
      if (!usableCopy(version.content)) {
        add(
          "copy-shape",
          asset.id,
          "Approved copy has an unsupported shape. Review a new copy version.",
        );
        continue;
      }
      const errors = validateStudioCopy(
        version.content,
        [destination],
        { ...campaign.brief, channels: [destination] },
        campaign.brand,
      ).filter((finding) => finding.severity === "error");
      errors.forEach((finding) =>
        add(
          finding.code,
          finding.field ?? "copy",
          finding.message +
            (finding.code === "google-copy-length"
              ? " Suggested shorter draft: “Explore the collection”. Edit and approve a new copy version before mapping it."
              : ""),
        ),
      );
      if (errors.length) continue;
      copy = structuredClone(version.content);
    }
    if (asset.kind === "landing") landing = structuredClone(version.content);
    if (asset.kind === "video") videoBrief = structuredClone(version.content);
    assets.push({
      assetId: asset.id,
      versionId: version.id,
      versionNumber: version.number,
      approvedAt: asset.approval!.at,
      familyId: asset.familyId,
      title: asset.title,
      kind: asset.kind,
      placements,
      dependencyFingerprint: version.dependencyFingerprint,
      sourceIds: [...version.sourceIds],
      findings: structuredClone(version.findings),
    });
  }
  if (!copy)
    add(
      "copy-required",
      "copy",
      "Map an approved current campaign-copy version.",
    );
  const images = assets.filter((asset) => asset.kind === "image");
  const mapping: Record<string, unknown> = {
    artifactType:
      "Orbit review mapping — not an API request or verified vendor import format",
    destination,
    account: target
      ? {
          id: target.accountId,
          label: target.accountName,
          authenticated: false,
        }
      : null,
    target: target ? structuredClone(target) : null,
    finalUrl: selection.finalUrl,
    assetReferences: assets,
    copy: copy ?? null,
    localOnly: true,
    published: false,
    platformPolicy: "Not checked",
  };
  if (destination === "google") {
    for (const [placement, limits] of Object.entries(
      handoffRules.google.images,
    )) {
      const count = images.filter((asset) =>
        asset.placements.includes(placement),
      ).length;
      if (count < limits.min || count > limits.max)
        add(
          "google-image-count",
          placement,
          `${placement}: map ${limits.min}–${limits.max} approved images; currently ${count}.`,
        );
    }
    const brandScope = target?.brandGuidelines ? "campaign" : "asset-group";
    const brandReady =
      hasBundledHandoffLogo(campaign) &&
      selection.brandAssetsReviewed &&
      selection.logoVerified;
    if (!brandReady)
      add(
        "brand-assets-required",
        `${brandScope}.brandAssets`,
        "Business name and square logo required. Review the available local brand assets; no account assets are assumed.",
      );
    if (
      !campaign.brand.name.trim() ||
      studioAdsCharacterCount(campaign.brand.name) >
        handoffRules.google.text.businessName.length
    )
      add(
        "business-name",
        "businessName",
        "Google business name must contain 1–25 characters. Legal/domain identity still requires platform review.",
      );
    mapping.performanceMax = {
      assetGroup: {
        name: campaign.plan.directions.find(
          (direction) => direction.id === selection.familyId,
        )?.name,
        campaignTarget: target?.id,
        finalUrls: [selection.finalUrl],
        imageRelationships: images.flatMap((asset) =>
          asset.placements.map((placement) => ({
            fieldType: (
              {
                "google-square": "SQUARE_MARKETING_IMAGE",
                "google-landscape": "MARKETING_IMAGE",
                "google-portrait": "PORTRAIT_MARKETING_IMAGE",
              } as Record<string, string>
            )[placement],
            assetId: asset.assetId,
            versionId: asset.versionId,
          })),
        ),
        textRelationships: copy
          ? [
              { fieldType: "HEADLINE", values: copy.headlines },
              { fieldType: "LONG_HEADLINE", values: copy.longHeadlines },
              { fieldType: "DESCRIPTION", values: copy.descriptions },
            ]
          : [],
        videoRelationships: [],
        callToAction:
          "Automated default; draft CTA remains a review suggestion",
      },
      brandAssets: {
        scope: brandScope,
        businessName: campaign.brand.name,
        reviewedLocally: brandReady,
        logo: brandReady ? { ...handoffLogo } : null,
      },
      merchantCenter: target?.retail
        ? "Demo feed context only. Feed, listing groups and URL match Not checked; supplying these creative assets still requires all minimums."
        : "No feed assumed",
    };
    add(
      "google-recommendations",
      "coverage",
      "Recommended variety exceeds minimums: 11+ headlines, 2+ long headlines, 4+ descriptions, more image choices and video. No video is supplied; Google may generate video in a real account. Orbit does not.",
      false,
    );
    add(
      "google-account",
      "account",
      "Format checks cover this asset subset. Advertiser identity, Merchant Center, campaign settings, policy and account assets remain Not checked.",
      false,
    );
  } else if (destination === "meta") {
    if (!images.length)
      add(
        "meta-image-required",
        "creativeVariants",
        "Map at least one approved image creative for this conceptual handoff.",
      );
    mapping.meta = {
      mappingScope: "Conceptual handoff; exact API schema Not checked",
      campaign: "demo-meta-campaign",
      adSet: target?.id,
      creativeVariants: images.map((asset) => ({
        localCreativeId: `demo-meta-creative-${asset.assetId}-${asset.versionNumber}`,
        assetId: asset.assetId,
        versionId: asset.versionId,
        placements: asset.placements,
        headline: copy?.headlines[0] ?? "",
        primaryText: copy?.descriptions.join(" ") ?? "",
        link: selection.finalUrl,
      })),
      adDrafts: images.map((asset) => ({
        localDraftId: `demo-meta-ad-${asset.assetId}-${asset.versionNumber}`,
        creativeAssetId: asset.assetId,
        creativeVersionId: asset.versionId,
        adSet: target?.id,
        status: "local-demo-draft",
      })),
    };
    add(
      "meta-not-checked",
      "platformRequirements",
      handoffRules.meta.note,
      false,
    );
  } else if (destination === "tiktok") {
    add(
      "tiktok-video-required",
      "video",
      "Video required. A photo composition or approved storyboard is a brief, not a finished Non-Spark in-feed video.",
      true,
      "Video required",
    );
    mapping.tiktok = {
      campaign: "demo-tiktok-campaign",
      adGroup: target?.id,
      placement: "Non-Spark in-feed video",
      adInputs: {
        actualVideo: null,
        scriptBrief: videoBrief ?? null,
        captionDraft: copy?.descriptions[0] ?? "",
        finalUrl: selection.finalUrl,
      },
      status: "Video required",
    };
    add("tiktok-scope", "videoSpecifications", handoffRules.tiktok.note, false);
  } else {
    for (const placement of ["website-desktop", "website-mobile"])
      if (!images.some((asset) => asset.placements.includes(placement)))
        add(
          "website-hero-required",
          placement,
          `Map an approved ${placement === "website-desktop" ? "desktop" : "mobile"} hero for the responsive package.`,
        );
    if (!landing)
      add(
        "website-content-required",
        "landingContent",
        "Map an approved landing-content version.",
      );
    mapping.website = {
      responsiveHeroes: images,
      landingContent: landing ?? null,
      installation:
        "Use desktop/mobile images as separate responsive sources. Separate content is included; inspect each recipe's textOverlay before adding page text. Integrate and review in your site; no theme was updated.",
    };
    add("website-scope", "website", handoffRules.website.note, false);
  }
  if (images.length)
    add(
      "image-format",
      "images",
      `${images.length} approved image version${images.length === 1 ? "" : "s"}: local file dimensions, type and byte headers checked.`,
      false,
      "Format checked",
    );
  const signature = JSON.stringify({
    campaignId: campaign.id,
    selection,
    ruleVersion: handoffRules.version,
    assets,
    mapping,
  });
  return {
    destination,
    target,
    selection,
    assets,
    findings,
    canComplete: !findings.some((finding) => finding.blocking),
    mapping,
    signature,
  };
}

/** No input or historical record is mutated. Call inside the engine's serialized write. */
export function createDemoHandoff(
  campaign: StudioCampaign,
  selection: HandoffSelection,
  existing: readonly DemoHandoff[],
  options: { now?: string; id?: string } = {},
) {
  const preview = buildHandoffPreview(campaign, selection);
  if (!preview.canComplete)
    throw new Error(
      preview.findings
        .filter((finding) => finding.blocking)
        .map((finding) => finding.message)
        .join(" "),
    );
  const previous = existing.find(
    (record) =>
      record.campaignId === campaign.id &&
      record.signature === preview.signature,
  );
  if (previous) return { record: structuredClone(previous), reused: true };
  const localId = options.id ?? crypto.randomUUID();
  const record: DemoHandoff = {
    schemaVersion: 1,
    id: localId.startsWith("demo-handoff-")
      ? localId
      : `demo-handoff-${localId}`,
    campaignId: campaign.id,
    campaignTitle: campaign.brief.title,
    createdAt: options.now ?? new Date().toISOString(),
    destination: selection.destination,
    selection: structuredClone(preview.selection),
    assets: structuredClone(preview.assets),
    mapping: structuredClone(preview.mapping),
    findings: structuredClone(preview.findings),
    ruleVersion: handoffRules.version,
    signature: preview.signature,
    status: "local-demo-only",
    accountAuthenticated: false,
    platformPolicyApproved: false,
    published: false,
  };
  return { record, reused: false };
}
