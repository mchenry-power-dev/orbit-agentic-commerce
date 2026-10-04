import type { ValidationFinding } from "./index";
import type { GeneratedImage, SemanticPlan } from "./service";

export type Channel = "google" | "meta" | "tiktok" | "website" | "email";
export type CapabilityMode =
  "prebuilt-sample" | "local-composition" | "live-generation";
export interface Source {
  id: string;
  url?: string;
  retrievedAt: string;
  role: "product-fact" | "product-photo" | "visual-inspiration" | "page";
  title: string;
  included: boolean;
  text?: string;
  image?: string;
}
export interface BrandProduct {
  id: string;
  name: string;
  description: string;
  facts: string[];
  size: string;
  photo: string;
  sourceIds: string[];
  confirmed: boolean;
}
export interface StudioBrand {
  id: string;
  name: string;
  website: string;
  tagline: string;
  palette: string[];
  tone: string;
  products: BrandProduct[];
  sources: Source[];
  ownership: "owner-authorized-snapshot" | "visitor-confirmed";
}
export interface PlanningBudget {
  currency: string;
  periodStart: string;
  periodEnd: string;
  intent: "daily" | "lifetime";
  total: number | null;
  allocations: Partial<Record<Channel, number | null>>;
  targetCpa?: number | null;
  targetRoas?: number | null;
  marginPercent?: number | null;
}
export interface StudioBrief {
  title: string;
  description: string;
  goal: string;
  productIds: string[];
  channels: Channel[];
  placementIds: string[];
  audience: string;
  offer: string;
  tone: string;
  keywords: string[];
  requiredPhrases: string[];
  prohibitedPhrases: string[];
  phraseScope?: "campaign-copy" | "all-copy";
  budget: PlanningBudget;
  dates: { start: string; end: string };
  websiteSize: { desktop: [number, number]; mobile: [number, number] };
  emailSize: [number, number];
  feedback: string;
  rawInputs?: Partial<
    Record<
      | "keywords"
      | "requiredPhrases"
      | "prohibitedPhrases"
      | "desktop-width"
      | "desktop-height"
      | "mobile-width"
      | "mobile-height"
      | "email-width"
      | "email-height",
      string
    >
  >;
}
export interface CreativeDirection {
  id: string;
  name: string;
  theme: string;
  scene: string;
  palette: string[];
  mood: "festive" | "cool" | "editorial";
  composition: "product-right" | "product-center";
  headline: string;
  body: string;
  cta: string;
  excludedMotifs: string[];
  imagePrompt?: string;
  negativePrompt?: string;
  placementComposition?: {
    placementId: string;
    framing: string;
    focalPoint: string;
    negativeSpace: string;
    textPlacement: string;
    composition: "product-right" | "product-center";
    spacing: number;
  }[];
}
export interface StudioPlan {
  providerProvenance?: SemanticPlan["provenance"];
  id: string;
  mode: CapabilityMode;
  theme: string;
  audience: string;
  offer: string;
  interpretation: string;
  directions: CreativeDirection[];
  conflicts: string[];
  confirmed: boolean;
  generousSpace?: boolean;
  sourceIds: string[];
  placements: string[];
  copy: {
    headlines: string[];
    longHeadlines: string[];
    descriptions: string[];
    ctas: string[];
  };
  placementCopy?: {
    placementId: string;
    headlines: string[];
    longHeadlines: string[];
    descriptions: string[];
    ctas: string[];
  }[];
  landing: {
    title: string;
    body: string;
    cta: string;
    sections: { title: string; body: string }[];
  };
  video: {
    title: string;
    script: string;
    shots: string[];
    missingChecks: string[];
  };
}
export interface CompositionRecipe {
  version: 1;
  directionId: string;
  placementId: string;
  compatiblePlacementIds?: string[];
  width: number;
  height: number;
  productIds: string[];
  productPhotos: string[];
  palette: string[];
  mood: CreativeDirection["mood"];
  composition: CreativeDirection["composition"];
  headline: string;
  body: string;
  cta: string;
  textOverlay: boolean;
  spacing: number;
  backgroundImage?: string;
  sceneProvenance?: GeneratedImage["provenance"];
  sceneKey?: string;
}
export interface StudioVersion {
  id: string;
  number: number;
  at: string;
  dependencyFingerprint: string;
  mode: CapabilityMode;
  recipe?: CompositionRecipe;
  raster?: {
    dataUrl: string;
    mime: "image/png" | "image/jpeg";
    width: number;
    height: number;
    bytes: number;
  };
  content?: unknown;
  findings: ValidationFinding[];
  revisionNote?: string;
  sourceIds: string[];
}
export interface StudioAsset {
  id: string;
  familyId: string;
  placementId: string;
  compatiblePlacementIds?: string[];
  kind: "image" | "copy" | "landing" | "video" | "plan";
  title: string;
  required: boolean;
  versions: StudioVersion[];
  currentVersionId?: string;
  approval?: { versionId: string; status: "approved" | "rejected"; at: string };
  stale: boolean;
}
export interface StudioRun {
  id: string;
  status: "running" | "interrupted" | "failed" | "completed";
  assetIds: string[];
  completedIds: string[];
  attempts: Record<string, number>;
  at: string;
  error?: string;
  revisionNote?: string;
}
export interface StudioCampaign {
  id: string;
  brief: StudioBrief;
  brand: StudioBrand;
  plan: StudioPlan;
  assets: StudioAsset[];
  mode: CapabilityMode;
  createdAt: string;
  updatedAt: string;
  events: { id: string; at: string; message: string; assetId?: string }[];
  runs: StudioRun[];
  sceneCheckpoints?: Record<
    string,
    {
      directionId: string;
      dataUrl: string;
      provenance?: GeneratedImage["provenance"];
      at: string;
    }
  >;
}
export interface StudioState {
  schemaVersion: 2;
  campaigns: StudioCampaign[];
  brands: StudioBrand[];
  draft?: {
    brief: StudioBrief;
    brand: StudioBrand;
    plan?: StudioPlan;
    campaignId?: string;
  };
  drafts?: Record<
    string,
    {
      brief: StudioBrief;
      brand: StudioBrand;
      plan?: StudioPlan;
      campaignId: string;
    }
  >;
  newDraft?: {
    brief: StudioBrief;
    brand: StudioBrand;
    plan?: StudioPlan;
    campaignId?: string;
  };
  preferences: { generousSpace: boolean; tone: string };
}
export const freshStudioState = (): StudioState => ({
  schemaVersion: 2,
  campaigns: [],
  brands: [],
  preferences: { generousSpace: true, tone: "" },
});
export const studioVersion = (asset: StudioAsset) =>
  asset.versions.find((v) => v.id === asset.currentVersionId);
export function studioStatus(asset: StudioAsset) {
  const version = studioVersion(asset);
  if (!version) return "Missing";
  if (asset.stale) return "Stale";
  if (version.findings.some((f) => f.severity === "error"))
    return "Needs repair";
  if (asset.approval?.versionId === version.id)
    return asset.approval.status === "approved" ? "Approved" : "Rejected";
  return "Needs review";
}
