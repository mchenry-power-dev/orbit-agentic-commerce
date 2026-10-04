import type {
  BrandImport,
  GeneratedImage,
  ImageGenerationRequest,
  ImportRequest,
  SemanticPlan,
  SemanticPlanRequest,
  ServiceCapabilities,
  ServiceFailure,
} from "../domain/service";
import type {
  StudioBrand,
  StudioBrief,
  StudioPlan,
  StudioState,
} from "../domain/studio";
import { getPlacement } from "../validation/placements";

const requestTimeouts = {
  "/v1/capabilities": 10_000,
  "/v1/import": 45_000,
  "/v1/plan": 45_000,
  "/v1/images": 80_000,
} as const;
export const externalReferenceTextLimit = 2000;
export const externalReferenceExcerptMarker =
  "\n[External source excerpt; full sanitized source remains in local provenance.]";
export function externalReferenceExcerpt(text: string): string {
  if (text.length <= externalReferenceTextLimit) return text;
  const excerpt = text
    .slice(
      0,
      externalReferenceTextLimit - externalReferenceExcerptMarker.length,
    )
    .replace(/[\uD800-\uDBFF]$/, "");
  return excerpt + externalReferenceExcerptMarker;
}
export class StudioServiceClient {
  constructor(readonly baseUrl: string) {
    const url = new URL(baseUrl);
    const local =
      url.protocol === "http:" &&
      (url.hostname === "127.0.0.1" || url.hostname === "localhost") &&
      import.meta.env.DEV;
    if (
      (!local && url.protocol !== "https:") ||
      url.username ||
      url.password ||
      url.search ||
      url.hash
    )
      throw new Error(
        "Configure an approved HTTPS service URL, or a local development service.",
      );
  }
  private async request<T>(
    path: keyof typeof requestTimeouts,
    body?: unknown,
    signal?: AbortSignal,
  ): Promise<T> {
    if (signal?.aborted)
      throw new DOMException("Service request cancelled.", "AbortError");
    const controller = new AbortController();
    const paid = path === "/v1/plan" || path === "/v1/images";
    const timeoutMessage = `Service request timed out. No automatic retry was made.${paid ? " A paid operation may already be reserved; preserve the request identifier when resuming." : " Use the paste/upload fallback if the service remains unavailable."}`;
    const cancelledMessage = `Service request cancelled.${paid ? " A paid operation may already be reserved; no automatic retry was made." : ""}`;
    let rejectBound: (error: Error) => void = () => {};
    let timedOut = false;
    const bound = new Promise<never>((_, reject) => {
      rejectBound = reject;
    });
    const cancel = () => {
      controller.abort();
      rejectBound(new DOMException(cancelledMessage, "AbortError"));
    };
    signal?.addEventListener("abort", cancel, { once: true });
    const timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
      rejectBound(new Error(timeoutMessage));
    }, requestTimeouts[path]);
    try {
      return await Promise.race([
        (async () => {
          const response = await fetch(
            `${this.baseUrl.replace(/\/$/, "")}${path}`,
            {
              method: body ? "POST" : "GET",
              headers: body
                ? { "Content-Type": "application/json" }
                : undefined,
              body: body ? JSON.stringify(body) : undefined,
              credentials: "include",
              signal: controller.signal,
            },
          );
          const payload = (await response.json()) as T | ServiceFailure;
          if (!response.ok)
            throw new Error(
              payload && typeof payload === "object" && "error" in payload
                ? (payload as ServiceFailure).error.message
                : "Service request failed. No result was substituted.",
            );
          return payload as T;
        })(),
        bound,
      ]);
    } catch (error) {
      if (timedOut) throw new Error(timeoutMessage);
      if (signal?.aborted)
        throw new DOMException(cancelledMessage, "AbortError");
      throw error;
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener("abort", cancel);
    }
  }
  capabilities(signal?: AbortSignal) {
    return this.request<ServiceCapabilities>(
      "/v1/capabilities",
      undefined,
      signal,
    );
  }
  import(body: ImportRequest, signal?: AbortSignal) {
    return this.request<BrandImport>("/v1/import", body, signal);
  }
  plan(body: SemanticPlanRequest, signal?: AbortSignal) {
    return this.request<SemanticPlan>("/v1/plan", body, signal);
  }
  image(body: ImageGenerationRequest, signal?: AbortSignal) {
    return this.request<GeneratedImage>("/v1/images", body, signal);
  }
}
export function semanticRequest(
  brief: StudioBrief,
  brand: StudioBrand,
  preferences: StudioState["preferences"],
): SemanticPlanRequest {
  return {
    requestId: crypto.randomUUID(),
    brief: {
      text: brief.description,
      feedback: brief.feedback || null,
      goal: brief.goal,
      audience: brief.audience,
      offer: brief.offer || null,
      tone: brief.tone || null,
      keywords: brief.keywords,
      requiredPhrases: brief.requiredPhrases,
      prohibitedPhrases: brief.prohibitedPhrases,
      phraseScope: brief.phraseScope ?? "campaign-copy",
      dates: brief.dates.start ? brief.dates : null,
    },
    confirmedProducts: brand.products
      .filter((p) => brief.productIds.includes(p.id) && p.confirmed)
      .map((p) => ({
        id: p.id,
        name: p.name,
        description: p.description,
        facts: p.facts,
        sourceIds: p.sourceIds.filter((id) =>
          brand.sources.some(
            (s) => s.id === id && s.included && s.role === "product-fact",
          ),
        ),
        packageText: [],
        imageIds: p.sourceIds.filter((id) =>
          brand.sources.some(
            (s) => s.id === id && s.included && s.role === "product-photo",
          ),
        ),
      })),
    factSources: brand.sources
      .filter((s) => s.included)
      .map((s) => ({
        id: s.id,
        url: s.url ?? null,
        retrievedAt: s.retrievedAt,
        role:
          s.role === "product-fact"
            ? "product-facts"
            : s.role === "visual-inspiration"
              ? "visual-inspiration"
              : "brand",
        confirmed:
          s.role !== "product-fact" ||
          brand.products
            .filter((p) => p.sourceIds.includes(s.id))
            .every((p) => p.confirmed),
      })),
    brand: {
      name: brand.name,
      palette: brand.palette,
      tone: brand.tone,
      confirmed: true,
    },
    references: brand.sources
      .filter((s) => s.included)
      .map((s) => ({
        id: s.id,
        role:
          s.role === "product-fact" || s.role === "product-photo"
            ? "product"
            : s.role === "page"
              ? "landing"
              : "visual-inspiration",
        sourceId: s.id,
        text: s.url
          ? externalReferenceExcerpt(s.text ?? s.title)
          : (s.text ?? s.title),
        selected: s.included,
      })),
    placements: brief.placementIds.map((id) => {
      const p = getPlacement(id, brief);
      return {
        id,
        channel: p.channel,
        name: p.name,
        media: p.media,
        width: p.width,
        height: p.height,
        maxTextLength: p.channel === "google" ? 30 : null,
      };
    }),
    budget:
      brief.budget.total === null
        ? null
        : {
            currency: brief.budget.currency,
            periodStart: brief.budget.periodStart,
            periodEnd: brief.budget.periodEnd,
            intent: brief.budget.intent,
            totalMinorUnits: Math.round(brief.budget.total * 100),
            allocations: Object.entries(brief.budget.allocations)
              .filter(([, amount]) => amount !== null && amount !== undefined)
              .map(([channel, amount]) => ({
                channel:
                  channel as SemanticPlanRequest["placements"][number]["channel"],
                amountMinorUnits: Math.round(amount! * 100),
              })),
            assumptions: {
              cpaMinorUnits:
                brief.budget.targetCpa == null
                  ? null
                  : Math.round(brief.budget.targetCpa * 100),
              roas: brief.budget.targetRoas ?? null,
              marginPercent: brief.budget.marginPercent ?? null,
            },
          },
    preferences: {
      tone: preferences.tone || null,
      avoidCrowdedCompositions: preferences.generousSpace,
    },
  };
}
export function fromSemanticPlan(
  result: SemanticPlan,
  brief: StudioBrief,
  generousSpace: boolean,
): StudioPlan {
  const google = result.copy.find((c) => c.placementId.startsWith("google"));
  const copy = google ?? result.copy[0];
  if (!copy || result.directions.length !== 2)
    throw new Error(
      "The semantic response lacks the planned copy or two creative directions.",
    );
  return {
    id: crypto.randomUUID(),
    providerProvenance: result.provenance,
    mode: "live-generation",
    theme: result.theme,
    audience: result.audience,
    offer: result.offer ?? "",
    interpretation: `${result.theme}. ${result.warnings.join(" ")} Semantic planning and generated scenes require review; measured file checks and product layers are separate. Public sources use marked context excerpts of up to 2,000 characters; full sanitized sources remain in your local provenance.`,
    directions: result.directions.map((d, i) => ({
      id: d.id,
      name: d.title,
      theme: result.theme,
      scene: d.description,
      palette: d.palette,
      mood: /christmas|festive|holiday/i.test(
        `${result.theme} ${d.description}`,
      )
        ? "festive"
        : /cool|summer|minimal/i.test(d.description)
          ? "cool"
          : "editorial",
      composition: i ? "product-center" : "product-right",
      headline: copy.headlines[i] ?? copy.headlines[0],
      body: copy.descriptions[i] ?? copy.descriptions[0],
      cta: copy.ctas[0],
      excludedMotifs: [d.negativePrompt],
      imagePrompt: d.imagePrompt,
      negativePrompt: d.negativePrompt,
      placementComposition: d.placementComposition,
    })),
    conflicts: result.conflicts
      .filter((c) => c.requiresResolution)
      .map((c) => c.message),
    confirmed: false,
    generousSpace,
    sourceIds: result.provenance.sourceIds,
    placements: [...brief.placementIds],
    copy: {
      headlines: copy.headlines,
      longHeadlines: copy.longHeadlines,
      descriptions: copy.descriptions,
      ctas: copy.ctas,
    },
    placementCopy: result.copy,
    landing: {
      title: result.landing.heroTitle,
      body: result.landing.heroBody,
      cta: result.landing.cta,
      sections: result.landing.sections.map((s) => ({
        title: s.title,
        body: s.body,
      })),
    },
    video: {
      title: "Video production brief",
      script: result.videoBriefs.map((v) => v.script).join("\n"),
      shots: result.videoBriefs.flatMap((v) => v.shots),
      missingChecks: result.videoBriefs.flatMap(
        (v) => v.missingProductionChecks,
      ),
    },
  };
}
export function importedBrand(
  result: BrandImport,
  website: string,
): StudioBrand {
  if (!result.sources.length)
    throw new Error(
      "No pages were imported. Paste product facts and upload an owned photo instead.",
    );
  const id = crypto.randomUUID();
  const sources: StudioBrand["sources"] = result.sources.map((source) => ({
    id: source.id,
    url: source.url,
    retrievedAt: source.retrievedAt,
    role: source.products.length ? "product-fact" : "page",
    title: source.title,
    included: true,
    text: source.visibleText,
  }));
  sources.push(
    ...result.images.map((image, index) => ({
      id: image.id,
      url: image.sourceUrl,
      retrievedAt: result.sources.find((s) => s.id === image.sourceId)!
        .retrievedAt,
      role: "visual-inspiration" as const,
      title: `Imported reference ${index + 1} · ${image.width}×${image.height} · confirm photo association`,
      included: true,
      image: `data:${image.mimeType};base64,${image.base64}`,
    })),
  );
  const products = result.sources.flatMap((source) =>
    source.products.map((p, index) => {
      return {
        id: `${source.id}-${index}`,
        name: p.name,
        description: p.description,
        facts: p.facts,
        size: "Confirm from product source",
        photo: "",
        sourceIds: [source.id],
        confirmed: false,
      };
    }),
  );
  return {
    id,
    name: result.sources[0].title,
    website,
    tagline: "",
    palette: (result.sources[0].colors.length
      ? result.sources[0].colors
      : ["#30233d", "#fff8ec"]
    )
      .map((c) =>
        /^#[0-9a-f]{3}$/i.test(c)
          ? `#${[...c.slice(1)].map((x) => x + x).join("")}`
          : c,
      )
      .filter((c) => /^#[0-9a-f]{6}$/i.test(c))
      .slice(0, 4),
    tone: "",
    products,
    sources,
    ownership: "visitor-confirmed",
  };
}
