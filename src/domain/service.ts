/** Wire records for the protected local service. No runtime secrets belong here. */
export type ServiceChannel = "google" | "meta" | "tiktok" | "website" | "email";
export interface FactSource {
  id: string;
  url: string | null;
  retrievedAt: string;
  role: "product-facts" | "visual-inspiration" | "brand";
  confirmed: boolean;
}
export interface ConfirmedProduct {
  id: string;
  name: string;
  description: string;
  facts: string[];
  sourceIds: string[];
  packageText: string[];
  imageIds: string[];
}
export interface PlanReference {
  id: string;
  role: "product" | "visual-inspiration" | "brand" | "landing";
  sourceId: string;
  text: string;
  selected: boolean;
}
export interface ServicePlacement {
  id: string;
  channel: ServiceChannel;
  name: string;
  media: "image" | "video" | "text";
  width: number | null;
  height: number | null;
  maxTextLength: number | null;
}
export interface PlanningBudget {
  currency: string;
  periodStart: string;
  periodEnd: string;
  intent: "daily" | "lifetime";
  totalMinorUnits: number;
  allocations: { channel: ServiceChannel; amountMinorUnits: number }[];
  assumptions: {
    cpaMinorUnits: number | null;
    roas: number | null;
    marginPercent: number | null;
  };
}
export interface SemanticPlanRequest {
  requestId: string;
  brief: {
    text: string;
    feedback?: string | null;
    goal: string;
    audience: string;
    offer: string | null;
    tone: string | null;
    keywords: string[];
    requiredPhrases: string[];
    prohibitedPhrases: string[];
    phraseScope: "campaign-copy" | "all-copy";
    dates: { start: string; end: string } | null;
  };
  confirmedProducts: ConfirmedProduct[];
  factSources: FactSource[];
  brand: { name: string; palette: string[]; tone: string; confirmed: boolean };
  references: PlanReference[];
  placements: ServicePlacement[];
  budget: PlanningBudget | null;
  preferences: { tone: string | null; avoidCrowdedCompositions: boolean };
}
export interface SemanticDirection {
  id: string;
  title: string;
  description: string;
  palette: string[];
  imagePrompt: string;
  negativePrompt: string;
  productLayerInstructions: string;
  placementComposition: {
    placementId: string;
    composition: "product-right" | "product-center";
    spacing: number;
    framing: string;
    focalPoint: string;
    negativeSpace: string;
    textPlacement: string;
  }[];
}
export interface SemanticPlan {
  mode: "live-semantic-provider";
  theme: string;
  audience: string;
  offer: string | null;
  productIds: string[];
  directions: SemanticDirection[];
  copy: {
    placementId: string;
    headlines: string[];
    longHeadlines: string[];
    descriptions: string[];
    ctas: string[];
  }[];
  landing: {
    heroTitle: string;
    heroBody: string;
    cta: string;
    sections: {
      kind: "benefit" | "story" | "supporting" | "faq";
      title: string;
      body: string;
    }[];
  };
  videoBriefs: {
    placementId: string;
    script: string;
    shots: string[];
    missingProductionChecks: string[];
  }[];
  conflicts: { code: string; message: string; requiresResolution: boolean }[];
  coverage: {
    input: string;
    appliedTo: string[];
    notAppliedReason: string | null;
  }[];
  warnings: string[];
  provenance: {
    provider: "openai";
    model: string;
    sourceIds: string[];
    generatedAt: string;
  };
}
export interface RasterImage {
  mimeType: "image/png" | "image/jpeg";
  width: number;
  height: number;
  byteLength: number;
  base64: string;
}
export interface ImportedProduct {
  name: string;
  description: string;
  facts: string[];
  sku: string | null;
  price: string | null;
  currency: string | null;
  confirmed: false;
}
export interface ImportedSource {
  id: string;
  url: string;
  retrievedAt: string;
  title: string;
  visibleText: string;
  colors: string[];
  products: ImportedProduct[];
}
export interface ImportedImage extends RasterImage {
  id: string;
  sourceId: string;
  sourceUrl: string;
  sha256: string;
}
export interface BrandImport {
  mode: "public-https-import";
  sources: ImportedSource[];
  images: ImportedImage[];
  failures: { url: string; code: string; message: string }[];
  reviewRequired: true;
}
export interface ImportRequest {
  urls: string[];
}
export interface UploadRequest {
  requestId: string;
  mimeType: "image/png" | "image/jpeg" | "image/webp";
  base64: string;
}
export interface ImageGenerationRequest {
  requestId: string;
  prompt: string;
  size: "1024x1024" | "1536x1024" | "1024x1536";
  referenceImages: { mimeType: "image/png" | "image/jpeg"; base64: string }[];
  backgroundOnly: boolean;
}
export interface GeneratedImage {
  mode: "live-image-provider";
  image: RasterImage;
  provenance: {
    provider: "openai";
    model: string;
    generatedAt: string;
    operation: "generation" | "edit";
    requestId: string;
  };
  requiresProductFidelityReview: true;
}
export interface ServiceCapabilities {
  mode: "protected-local-service";
  publicImport: boolean;
  uploads: boolean;
  semanticPlanning: boolean;
  imageGeneration: boolean;
  generationBlocker: string | null;
  limits: {
    pages: number;
    images: number;
    concurrentOperations: number;
    requestsPerMinute: number;
    remainingReservedCostCents: number | null;
  };
  transmission: string;
}
export interface ServiceFailure {
  error: { code: string; message: string };
  fallback:
    | "paste-facts-or-upload-owned-raster"
    | "configure-approved-server-runtime"
    | null;
}
