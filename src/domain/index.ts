export type AssetKind = "image" | "copy" | "landing" | "video" | "blueprint";
export interface Quantities {
  headlines: number;
  longHeadlines: number;
  descriptions: number;
  ctas: number;
}
export interface CampaignBrief {
  merchantId: string;
  title: string;
  goal: string;
  productIds: string[];
  audience: string;
  direction: string;
  tone?: string;
  offer?: string;
  keywords?: string[];
  requiredPhrases?: string[];
  prohibitedPhrases?: string[];
  quantities?: Quantities;
}
export interface Product {
  id: string;
  name: string;
  category: string;
  size: string;
  color: string;
  facts: string[];
  description: string;
  packageLabel: string[];
}
export interface Merchant {
  id: string;
  name: string;
  category: "coffee" | "household";
  site: string;
  tagline: string;
  brandRules: string[];
  pageContent: string;
  products: Product[];
}
export interface Preferences {
  avoidCrowdedCompositions: boolean;
  preferredTone: string;
}
export interface ContextReference {
  id: string;
  type: "product" | "image" | "brand" | "page";
  title: string;
  reason: string;
  required?: boolean;
  productId?: string;
  text?: string;
}
export interface ContextSnapshot {
  references: ContextReference[];
  excludedIds: string[];
  selectedIds: string[];
  fingerprint: string;
}
export interface AssetSpec {
  id: string;
  kind: AssetKind;
  title: string;
  purpose: string;
  required: boolean;
  sourceReferenceIds: string[];
  width?: number;
  height?: number;
  treatment?: string;
}
export interface Blueprint {
  sourceRevision: number;
  summary: string;
  goal: string;
  audience: string;
  direction: string;
  tone: string;
  offer?: string;
  keywords: string[];
  instructions: string[];
  preferenceNotes: string[];
  specs: AssetSpec[];
}
export interface ImageContent {
  type: "image";
  svg: string;
  width: number;
  height: number;
  alt: string;
  creativeTreatment: string;
  generationBrief: string;
}
export interface CopyContent {
  type: "copy";
  headlines: string[];
  longHeadlines: string[];
  descriptions: string[];
  ctas: string[];
  productTitle: string;
  productDescription: string;
  collectionTitle: string;
  collectionDescription: string;
}
export interface LandingContent {
  type: "landing";
  hero: {
    eyebrow: string;
    title: string;
    body: string;
    cta: string;
    imageAssetId: string;
  };
  benefits: { title: string; body: string }[];
  story: { title: string; body: string };
  supporting: { title: string; body: string };
  faq: { question: string; answer: string }[];
}
export interface VideoContent {
  type: "video";
  title: string;
  durationSeconds: number;
  script: string;
  shots: { seconds: number; visual: string; voiceover: string }[];
  generationInstructions: string;
}
export interface BlueprintContent {
  type: "blueprint";
  summary: string;
  checklist: string[];
}
export type AssetContent =
  ImageContent | CopyContent | LandingContent | VideoContent | BlueprintContent;
export interface ValidationFinding {
  code: string;
  severity: "error" | "warning" | "info";
  message: string;
  field?: string;
}
export interface AssetVersion {
  id: string;
  number: number;
  content: AssetContent;
  createdAt: string;
  sourceRevision: number;
  contextFingerprint: string;
  validation: ValidationFinding[];
  revisionNote?: string;
}
export interface Approval {
  versionId: string;
  status: "approved" | "rejected";
  note?: string;
  at: string;
}
export interface AssetRecord {
  spec: AssetSpec;
  currentVersionId?: string;
  versions: AssetVersion[];
  approval?: Approval;
}
export type RunStatus =
  "queued" | "running" | "completed" | "failed" | "interrupted";
export interface RunStep {
  assetId: string;
  status: "pending" | "running" | "completed" | "failed";
  attempts: number;
  error?: string;
}
export interface RunEvent {
  id: string;
  at: string;
  type:
    | "plan"
    | "start"
    | "attempt"
    | "retry"
    | "validation"
    | "complete"
    | "failure"
    | "interruption"
    | "review"
    | "revision"
    | "context";
  message: string;
  assetId?: string;
}
export interface FailureScenario {
  assetId: string;
  kind: "transient" | "timeout" | "definitive";
  count: number;
}
export interface RunRecord {
  id: string;
  status: RunStatus;
  createdAt: string;
  updatedAt: string;
  steps: RunStep[];
  events: RunEvent[];
  targetAssetId?: string;
  revisionNote?: string;
  failure?: FailureScenario;
  failureRemaining?: number;
}
export interface Campaign {
  id: string;
  brief: CampaignBrief;
  context: ContextSnapshot;
  blueprint: Blueprint;
  assets: AssetRecord[];
  runs: RunRecord[];
  revision: number;
  createdAt: string;
  updatedAt: string;
}
export interface AppState {
  schemaVersion: 1;
  campaigns: Campaign[];
  preferences: Preferences;
}
export interface ExportManifest {
  schemaVersion: 1;
  campaignId: string;
  title: string;
  generatedAt: string;
  sourceRevision: number;
  contextFingerprint: string;
  mode: "sample-data-simulated-providers";
  channelSpecVersion: string;
  limitations: string[];
  assets: {
    assetId: string;
    versionId: string;
    versionNumber: number;
    filename: string;
    approvedAt: string;
    sourceReferenceIds: string[];
    validation: ValidationFinding[];
  }[];
}
export const initialState = (): AppState => ({
  schemaVersion: 1,
  campaigns: [],
  preferences: {
    avoidCrowdedCompositions: true,
    preferredTone: "Calm and inviting",
  },
});
export const currentVersion = (asset: AssetRecord): AssetVersion | undefined =>
  asset.versions.find((version) => version.id === asset.currentVersionId);
export const isCurrent = (campaign: Campaign, version: AssetVersion): boolean =>
  version.sourceRevision === campaign.revision &&
  version.contextFingerprint === campaign.context.fingerprint;
export const clone = <T>(value: T): T => structuredClone(value);
export function fingerprint(value: unknown): string {
  const text = JSON.stringify(value);
  let hash = 2166136261;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}
