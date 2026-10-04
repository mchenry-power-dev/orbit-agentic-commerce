import { fingerprint } from "../domain";
import type { GeneratedImage } from "../domain/service";
import type {
  CompositionRecipe,
  StudioAsset,
  StudioBrand,
  StudioBrief,
  StudioCampaign,
  StudioPlan,
  StudioState,
  StudioVersion,
} from "../domain/studio";
import {
  freshStudioState,
  studioStatus,
  studioVersion,
} from "../domain/studio";
import type { StudioPersistence } from "../persistence/studio";
import {
  getPlacement,
  validatePlacement,
  validateStudioCopy,
  validateStudioBrief,
} from "../validation/placements";
import { renderComposition } from "../providers/composition";

export function studioScenePrompt(
  campaign: StudioCampaign,
  directionId: string,
  revisionNote?: string,
) {
  const direction = campaign.plan.directions.find((d) => d.id === directionId)!;
  return `${direction.imagePrompt || direction.scene}. Palette: ${direction.palette.join(", ")}. ${revisionNote ? `Merchant revision: ${revisionNote}.` : ""} Background scene only; no product packaging or invented text. Treat selected visual references as inspiration for original work; do not copy their brands or logos. ${direction.negativePrompt || ""}`;
}
async function sceneKey(
  campaign: StudioCampaign,
  directionId: string,
  revisionNote?: string,
) {
  const input = JSON.stringify({
    campaignId: campaign.id,
    directionId,
    prompt: studioScenePrompt(campaign, directionId, revisionNote),
    references: campaign.brand.sources
      .filter((s) => s.included && s.role === "visual-inspiration" && s.image)
      .map((s) => ({ id: s.id, image: s.image })),
  });
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(input),
  );
  return [...new Uint8Array(digest)]
    .map((n) => n.toString(16).padStart(2, "0"))
    .join("");
}

export interface StudioEngineOptions {
  id?: () => string;
  clock?: () => Date;
  render?: typeof renderComposition;
  scene?: (
    campaign: StudioCampaign,
    directionId: string,
    signal: AbortSignal,
    revisionNote?: string,
  ) => Promise<
    string | { dataUrl: string; provenance: GeneratedImage["provenance"] }
  >;
  maxAttempts?: number;
  timeoutMs?: number;
}
export class StudioEngine {
  private state = freshStudioState();
  private writes: Promise<unknown> = Promise.resolve();
  private listeners = new Set<() => void>();
  private active?: {
    campaignId: string;
    controller: AbortController;
    promise: Promise<void>;
  };
  constructor(
    private persistence: StudioPersistence,
    private options: StudioEngineOptions = {},
  ) {}
  private id = () => this.options.id?.() ?? crypto.randomUUID();
  private now = () => (this.options.clock?.() ?? new Date()).toISOString();
  getSnapshot = () => this.state;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  private async write<T>(operation: (state: StudioState) => T): Promise<T> {
    const pending = this.writes.then(async () => {
      const next = structuredClone(this.state);
      const result = operation(next);
      await this.persistence.save(next);
      this.state = next;
      this.listeners.forEach((listener) => listener());
      return result;
    });
    this.writes = pending.catch(() => undefined);
    return pending;
  }
  async initialize() {
    const saved = await this.persistence.load();
    if (saved && saved.schemaVersion !== 2)
      throw new Error(
        "This saved workspace needs a supported migration. Its data has been preserved.",
      );
    this.state = saved ?? freshStudioState();
    if (
      this.state.campaigns.some((c) =>
        c.runs.some((r) => r.status === "running"),
      )
    ) {
      await this.write((state) => {
        for (const campaign of state.campaigns)
          for (const run of campaign.runs) {
            if (run.status === "running") {
              run.status = "interrupted";
              this.event(
                campaign,
                "Session ended. Finished versions retained; resume missing work.",
              );
            }
          }
      });
    }
    this.listeners.forEach((listener) => listener());
  }
  private find(state: StudioState, id: string) {
    const campaign = state.campaigns.find((c) => c.id === id);
    if (!campaign) throw new Error("Campaign not found.");
    return campaign;
  }
  private idle() {
    if (this.active)
      throw new Error(
        "Pause the active creation run before making this change.",
      );
  }
  private event(campaign: StudioCampaign, message: string, assetId?: string) {
    campaign.events.push({ id: this.id(), at: this.now(), message, assetId });
    campaign.updatedAt = this.now();
  }
  async saveDraft(
    brief: StudioBrief,
    brand: StudioBrand,
    plan?: StudioPlan,
    campaignId?: string,
  ) {
    return this.write((state) => {
      const draft = {
        brief: structuredClone(brief),
        brand: structuredClone(brand),
        plan: plan && structuredClone(plan),
        campaignId,
      };
      state.draft = draft;
      if (!campaignId) state.newDraft = draft;
      if (campaignId) {
        state.drafts ??= {};
        state.drafts[campaignId] = { ...draft, campaignId };
      }
    });
  }
  async saveBrand(brand: StudioBrand) {
    this.idle();
    return this.write((state) => {
      const index = state.brands.findIndex((b) => b.id === brand.id);
      if (index < 0) state.brands.push(structuredClone(brand));
      else state.brands[index] = structuredClone(brand);
    });
  }
  async setPreferences(preferences: StudioState["preferences"]) {
    this.idle();
    return this.write((state) => {
      state.preferences = structuredClone(preferences);
    });
  }
  private specs(brief: StudioBrief, plan: StudioPlan): StudioAsset[] {
    const result: StudioAsset[] = [];
    for (const direction of plan.directions) {
      const compatible = new Map<string, StudioAsset>();
      for (const placementId of brief.placementIds) {
        const placement = getPlacement(placementId, brief);
        if (placement.media !== "image") continue;
        const overlay =
          placement.channel === "website" || placement.channel === "email";
        const layout = direction.placementComposition?.find(
          (p) => p.placementId === placementId,
        );
        const key = `${placement.width}x${placement.height}:${overlay}:${layout?.composition ?? direction.composition}:${layout?.spacing ?? (plan.generousSpace === false ? 0.06 : 0.12)}`;
        const existing = compatible.get(key);
        if (existing) {
          existing.compatiblePlacementIds!.push(placementId);
          continue;
        }
        const asset: StudioAsset = {
          id: `${direction.id}-${placementId}`,
          familyId: direction.id,
          placementId,
          compatiblePlacementIds: [placementId],
          kind: "image",
          title: `${direction.name} · ${placement.name}`,
          required: true,
          versions: [],
          stale: false,
        };
        compatible.set(key, asset);
        result.push(asset);
      }
    }
    for (const kind of ["copy", "landing", "plan"] as const) {
      if (kind === "landing" && !brief.channels.includes("website")) continue;
      result.push({
        id: kind,
        familyId: "campaign",
        placementId: kind,
        kind,
        title: {
          copy: "Coordinated campaign copy",
          landing: "Landing-page content",
          plan: "Creative plan and handoff",
        }[kind],
        required: true,
        versions: [],
        stale: false,
      });
    }
    if (
      brief.placementIds.some((id) => getPlacement(id, brief).media === "video")
    )
      result.push({
        id: "video",
        familyId: "campaign",
        placementId: "tiktok-infeed",
        kind: "video",
        title: "Video production brief · motion still needed",
        required: true,
        versions: [],
        stale: false,
      });
    return result;
  }
  async create(
    brief: StudioBrief,
    brand: StudioBrand,
    plan: StudioPlan,
    sample = false,
  ) {
    this.idle();
    const issues = validateStudioBrief(brief, brand).filter(
      (f) => f.severity === "error",
    );
    if (issues.length) throw new Error(issues.map((f) => f.message).join(" "));
    if (!plan.confirmed || plan.conflicts.length)
      throw new Error(
        "Confirm the interpretation and resolve its conflicts first.",
      );
    if (!brief.productIds.length || !brief.placementIds.length)
      throw new Error("Choose products and placements.");
    if (
      !brief.productIds.every((id) =>
        brand.products.some((p) => p.id === id && p.confirmed),
      )
    )
      throw new Error("Confirm the selected product facts.");
    return this.write((state) => {
      const campaign: StudioCampaign = {
        id: this.id(),
        brief: structuredClone(brief),
        brand: structuredClone(brand),
        plan: structuredClone(plan),
        assets: this.specs(brief, plan),
        mode: sample ? "prebuilt-sample" : plan.mode,
        createdAt: this.now(),
        updatedAt: this.now(),
        events: [],
        runs: [],
      };
      state.campaigns.unshift(campaign);
      state.draft = undefined;
      state.newDraft = undefined;
      this.event(
        campaign,
        sample
          ? "Prebuilt example copied into local work. No merchant approvals were copied."
          : `Confirmed plan: ${campaign.mode}. Two directions; only selected placements.`,
      );
      return structuredClone(campaign);
    });
  }
  async importSample(sample: StudioCampaign) {
    this.idle();
    return this.write((state) => {
      const campaign = structuredClone(sample);
      campaign.id = this.id();
      campaign.mode = "prebuilt-sample";
      campaign.createdAt = this.now();
      campaign.updatedAt = this.now();
      for (const asset of campaign.assets) asset.approval = undefined;
      campaign.events = [];
      campaign.runs = [];
      this.event(
        campaign,
        "Prebuilt Cosmic Cat example. Outputs are photo compositions; every approval is yours to make.",
      );
      state.campaigns.unshift(campaign);
      return structuredClone(campaign);
    });
  }
  private recipe(
    campaign: StudioCampaign,
    asset: StudioAsset,
  ): CompositionRecipe {
    const direction = campaign.plan.directions.find(
      (d) => d.id === asset.familyId,
    )!;
    const placement = getPlacement(asset.placementId, campaign.brief);
    const plannedComposition = direction.placementComposition?.find(
      (p) => p.placementId === asset.placementId,
    );
    const products = campaign.brand.products.filter((p) =>
      campaign.brief.productIds.includes(p.id),
    );
    return {
      version: 1,
      directionId: direction.id,
      placementId: asset.placementId,
      compatiblePlacementIds: asset.compatiblePlacementIds,
      width: placement.width!,
      height: placement.height!,
      productIds: products.map((p) => p.id),
      productPhotos: products.map((p) => p.photo),
      palette: direction.palette,
      mood: direction.mood,
      composition: plannedComposition?.composition ?? direction.composition,
      headline: direction.headline,
      body: direction.body,
      cta: direction.cta,
      textOverlay:
        placement.channel === "website" || placement.channel === "email",
      spacing:
        plannedComposition?.spacing ??
        (campaign.plan.generousSpace === false ? 0.06 : 0.12),
    };
  }
  private dependency(campaign: StudioCampaign, asset: StudioAsset): string {
    const products = campaign.brand.products.filter((p) =>
      campaign.brief.productIds.includes(p.id),
    );
    const selectedSources = campaign.brand.sources.filter((s) => s.included);
    if (asset.kind === "image") {
      const recipe = this.recipe(campaign, asset);
      if (!recipe.textOverlay) {
        recipe.headline = "";
        recipe.body = "";
        recipe.cta = "";
      }
      return fingerprint({
        recipe,
        visualDirection: campaign.plan.directions
          .filter((d) => d.id === asset.familyId)
          .map((d) => ({
            theme: d.theme,
            scene: d.scene,
            imagePrompt: d.imagePrompt,
            negativePrompt: d.negativePrompt,
            excludedMotifs: d.excludedMotifs,
          })),
        products,
        selectedSources,
        mode: campaign.mode,
      });
    }
    return fingerprint({
      kind: asset.kind,
      plan:
        asset.kind === "copy"
          ? [
              campaign.plan.copy,
              campaign.plan.placementCopy,
              campaign.brief.requiredPhrases,
              campaign.brief.prohibitedPhrases,
            ]
          : asset.kind === "landing"
            ? campaign.plan.landing
            : asset.kind === "video"
              ? campaign.plan.video
              : campaign.plan,
      products,
      selectedSources,
    });
  }
  async update(
    id: string,
    brief: StudioBrief,
    brand: StudioBrand,
    plan: StudioPlan,
  ) {
    this.idle();
    const issues = validateStudioBrief(brief, brand).filter(
      (f) => f.severity === "error",
    );
    if (issues.length) throw new Error(issues.map((f) => f.message).join(" "));
    if (!plan.confirmed || plan.conflicts.length)
      throw new Error(
        "Confirm the interpretation and resolve conflicts first.",
      );
    await this.write((state) => {
      const campaign = this.find(state, id);
      const previous = new Map(
        campaign.assets.map((a) => [
          a.id,
          { asset: a, dependency: this.dependency(campaign, a) },
        ]),
      );
      campaign.brief = structuredClone(brief);
      campaign.brand = structuredClone(brand);
      campaign.plan = structuredClone(plan);
      campaign.mode = plan.mode;
      campaign.assets = this.specs(brief, plan).map((spec) => {
        const old = previous.get(spec.id);
        if (!old) return spec;
        const next = {
          ...old.asset,
          title: spec.title,
          compatiblePlacementIds: spec.compatiblePlacementIds,
        };
        if (old.dependency !== this.dependency(campaign, next)) {
          next.stale = true;
          next.approval = undefined;
        }
        return next;
      });
      this.event(
        campaign,
        "Plan updated. Changed dependencies need recreation; unrelated current approvals retained.",
      );
      if (state.draft?.campaignId === id) state.draft = undefined;
      if (state.drafts) delete state.drafts[id];
    });
  }
  run(
    id: string,
    assetIds?: string[],
    revisionNote?: string,
    failureAssetId?: string,
  ): Promise<void> {
    if (this.active)
      return Promise.reject(new Error("A creation run is already active."));
    const controller = new AbortController();
    const promise = this.execute(
      id,
      controller,
      assetIds,
      revisionNote,
      failureAssetId,
    ).finally(() => {
      this.active = undefined;
    });
    this.active = { campaignId: id, controller, promise };
    return promise;
  }
  resume(id: string) {
    const campaign = this.find(this.state, id);
    const run = campaign.runs.at(-1);
    if (run && (run.status === "failed" || run.status === "interrupted"))
      return this.run(
        id,
        run.assetIds.filter(
          (assetId) =>
            !run.completedIds.includes(assetId) &&
            campaign.assets.some((a) => a.id === assetId),
        ),
        run.revisionNote,
      );
    return this.run(id);
  }
  private async execute(
    id: string,
    controller: AbortController,
    assetIds?: string[],
    revisionNote?: string,
    failureAssetId?: string,
  ) {
    const start = this.find(this.state, id);
    const ids = [
      ...new Set(
        assetIds ??
          start.assets
            .filter((a) => !studioVersion(a) || a.stale)
            .map((a) => a.id),
      ),
    ];
    if (!ids.length) return;
    if (ids.some((assetId) => !start.assets.some((a) => a.id === assetId)))
      throw new Error("Unknown asset selection.");
    const runId = this.id();
    await this.write((state) => {
      const campaign = this.find(state, id);
      campaign.runs.push({
        id: runId,
        status: "running",
        assetIds: ids,
        completedIds: [],
        attempts: {},
        at: this.now(),
        revisionNote,
      });
      this.event(
        campaign,
        `Creating ${ids.length} current outputs with bounded retries.`,
      );
    });
    const scenes = new Map<
      string,
      { dataUrl: string; provenance?: GeneratedImage["provenance"] }
    >();
    let failed = false;
    for (const assetId of ids) {
      if (controller.signal.aborted) break;
      const asset = this.find(this.state, id).assets.find(
        (a) => a.id === assetId,
      )!;
      // A refreshed run selects only missing/stale assets. Completed versions are checkpoints.
      const maximum =
        start.mode === "live-generation"
          ? 1
          : Math.max(1, Math.min(3, this.options.maxAttempts ?? 2));
      for (let attempt = 1; attempt <= maximum; attempt++) {
        await this.write((state) => {
          this.find(state, id).runs.find((r) => r.id === runId)!.attempts[
            assetId
          ] = attempt;
        });
        try {
          if (failureAssetId === assetId)
            throw new Error(
              "Developer fixture: provider failed. Other completed assets are preserved.",
            );
          const campaign = structuredClone(this.find(this.state, id));
          const latest = campaign.assets.find((a) => a.id === assetId)!;
          const stepController = new AbortController();
          const abort = () => stepController.abort();
          controller.signal.addEventListener("abort", abort, { once: true });
          let timer: ReturnType<typeof setTimeout> | undefined;
          let generated: StudioVersion;
          try {
            generated = await Promise.race([
              this.generate(
                campaign,
                latest,
                stepController.signal,
                revisionNote,
                scenes,
              ),
              new Promise<never>((_, reject) => {
                timer = setTimeout(
                  () => {
                    stepController.abort();
                    reject(
                      new Error(
                        "Creation timed out; retry or resume retained work.",
                      ),
                    );
                  },
                  this.options.timeoutMs ??
                    (start.mode === "live-generation" ? 75_000 : 30_000),
                );
              }),
              new Promise<never>((_, reject) =>
                stepController.signal.addEventListener(
                  "abort",
                  () =>
                    reject(new DOMException("Creation paused", "AbortError")),
                  { once: true },
                ),
              ),
            ]);
          } finally {
            if (timer) clearTimeout(timer);
            controller.signal.removeEventListener("abort", abort);
          }
          if (controller.signal.aborted) break;
          await this.write((state) => {
            const current = this.find(state, id);
            const target = current.assets.find((a) => a.id === assetId)!;
            target.versions.push(generated);
            target.currentVersionId = generated.id;
            target.approval = undefined;
            target.stale = false;
            current.runs
              .find((r) => r.id === runId)!
              .completedIds.push(assetId);
            this.event(
              current,
              `Created version ${generated.number}; review exact output and placement findings.`,
              assetId,
            );
          });
          break;
        } catch (error) {
          if (controller.signal.aborted) break;
          if (attempt === maximum) {
            failed = true;
            await this.write((state) => {
              const campaign = this.find(state, id);
              const message =
                error instanceof Error ? error.message : "Creation failed";
              campaign.runs.find((r) => r.id === runId)!.error = message;
              this.event(campaign, message, assetId);
            });
          }
        }
      }
    }
    await this.write((state) => {
      const campaign = this.find(state, id);
      campaign.runs.find((r) => r.id === runId)!.status = controller.signal
        .aborted
        ? "interrupted"
        : failed
          ? "failed"
          : "completed";
      this.event(
        campaign,
        controller.signal.aborted
          ? "Paused; completed versions retained."
          : failed
            ? "Some outputs failed. Resume only missing or stale work."
            : "Outputs created. Merchant review remains required.",
      );
    });
  }
  private async generate(
    campaign: StudioCampaign,
    asset: StudioAsset,
    signal: AbortSignal,
    revisionNote: string | undefined,
    scenes: Map<
      string,
      { dataUrl: string; provenance?: GeneratedImage["provenance"] }
    >,
  ): Promise<StudioVersion> {
    const version: StudioVersion = {
      id: this.id(),
      number: asset.versions.length + 1,
      at: this.now(),
      dependencyFingerprint: this.dependency(campaign, asset),
      mode: campaign.mode,
      findings: [],
      revisionNote,
      sourceIds: campaign.brand.sources
        .filter((s) => s.included)
        .map((s) => s.id),
    };
    if (asset.kind === "image") {
      const recipe = this.recipe(campaign, asset);
      if (/space|crowd/i.test(revisionNote ?? "")) recipe.spacing = 0.18;
      if (/center/i.test(revisionNote ?? ""))
        recipe.composition = "product-center";
      if (campaign.mode === "live-generation") {
        if (!this.options.scene)
          throw new Error(
            "Live image service unavailable; no local substitute was used.",
          );
        const key = await sceneKey(campaign, asset.familyId, revisionNote);
        if (!scenes.has(key) && campaign.sceneCheckpoints?.[key])
          scenes.set(key, campaign.sceneCheckpoints[key]);
        if (!scenes.has(key)) {
          const prior = campaign.assets
            .flatMap((a) => a.versions)
            .find(
              (v) => v.recipe?.sceneKey === key && v.recipe.backgroundImage,
            );
          if (prior)
            scenes.set(key, {
              dataUrl: prior.recipe!.backgroundImage!,
              provenance: prior.recipe!.sceneProvenance,
            });
        }
        if (!scenes.has(key)) {
          const scene = await this.options.scene(
            campaign,
            asset.familyId,
            signal,
            revisionNote,
          );
          const checkpoint =
            typeof scene === "string" ? { dataUrl: scene } : scene;
          if (signal.aborted)
            throw new DOMException("Creation paused", "AbortError");
          await this.write((state) => {
            const current = this.find(state, campaign.id);
            current.sceneCheckpoints ??= {};
            current.sceneCheckpoints[key] = {
              ...checkpoint,
              directionId: asset.familyId,
              at: this.now(),
            };
            while (Object.keys(current.sceneCheckpoints).length > 8)
              delete current.sceneCheckpoints[
                Object.keys(current.sceneCheckpoints)[0]
              ];
          });
          scenes.set(key, checkpoint);
        }
        recipe.sceneKey = key;
        recipe.backgroundImage = scenes.get(key)!.dataUrl;
        recipe.sceneProvenance = scenes.get(key)!.provenance;
      }
      version.recipe = recipe;
      version.raster = await (this.options.render ?? renderComposition)(
        recipe,
        campaign.brand.name,
        signal,
      );
      for (const placement of asset.compatiblePlacementIds ?? [
        asset.placementId,
      ])
        version.findings.push(
          ...validatePlacement(placement, version, campaign.brief),
        );
    } else {
      version.content =
        asset.kind === "copy"
          ? {
              ...campaign.plan.copy,
              placements: campaign.plan.placementCopy ?? [],
              requiredPhraseScope:
                campaign.brief.phraseScope ?? "campaign-copy",
            }
          : asset.kind === "landing"
            ? campaign.plan.landing
            : asset.kind === "video"
              ? campaign.plan.video
              : {
                  plan: campaign.plan,
                  brief: campaign.brief,
                  futureFeedbackLoop:
                    "Review → revise → review. Later measured performance can inform a new creative/page/budget hypothesis; no account data is connected.",
                };
      if (asset.kind === "copy")
        version.findings.push(
          ...validateStudioCopy(
            campaign.plan.copy,
            campaign.brief.channels,
            campaign.brief,
            campaign.brand,
          ),
        );
      if (asset.kind === "video")
        version.findings.push({
          code: "missing-video",
          severity: "warning",
          message:
            "Production brief only. Motion, audio, duration, safe areas and platform review require a finished video.",
        });
    }
    return version;
  }
  async pause() {
    if (this.active) {
      this.active.controller.abort();
      await this.active.promise;
    }
  }
  async approve(id: string, assetIds: string[]) {
    this.idle();
    if (!assetIds.length)
      throw new Error("Select the exact assets you intend to approve.");
    await this.write((state) => {
      const campaign = this.find(state, id);
      for (const assetId of assetIds) {
        const asset = campaign.assets.find((a) => a.id === assetId);
        if (
          !asset ||
          !studioVersion(asset) ||
          asset.stale ||
          studioVersion(asset)!.findings.some((f) => f.severity === "error")
        )
          throw new Error(
            "Missing, stale or invalid versions cannot be approved.",
          );
        asset.approval = {
          versionId: studioVersion(asset)!.id,
          status: "approved",
          at: this.now(),
        };
        this.event(
          campaign,
          "Merchant approved this exact current version; platform policy approval is separate.",
          assetId,
        );
      }
    });
  }
  async reject(id: string, assetId: string) {
    this.idle();
    return this.write((state) => {
      const c = this.find(state, id);
      const a = c.assets.find((a) => a.id === assetId)!;
      const v = studioVersion(a);
      if (!v) throw new Error("No version to reject");
      a.approval = { versionId: v.id, status: "rejected", at: this.now() };
      this.event(c, "Version rejected by merchant.", assetId);
    });
  }
  async editCopy(id: string, content: StudioPlan["copy"]) {
    this.idle();
    return this.write((state) => {
      const c = this.find(state, id);
      c.plan.copy = structuredClone(content);
      if (c.plan.placementCopy)
        c.plan.placementCopy = c.plan.placementCopy.map((copy) => ({
          ...copy,
          ...structuredClone(content),
        }));
      const asset = c.assets.find((a) => a.kind === "copy")!;
      const version: StudioVersion = {
        id: this.id(),
        number: asset.versions.length + 1,
        at: this.now(),
        dependencyFingerprint: this.dependency(c, asset),
        mode: c.mode,
        content: {
          ...content,
          placements: c.plan.placementCopy ?? [],
          requiredPhraseScope: c.brief.phraseScope ?? "campaign-copy",
        },
        findings: validateStudioCopy(
          content,
          c.brief.channels,
          c.brief,
          c.brand,
        ),
        sourceIds: c.plan.sourceIds,
      };
      asset.versions.push(version);
      asset.currentVersionId = version.id;
      asset.approval = undefined;
      asset.stale = false;
      const handoff = c.assets.find((a) => a.kind === "plan");
      if (handoff) {
        handoff.stale = true;
        handoff.approval = undefined;
      }
      this.event(c, "Copy edited; previous approval invalidated.", asset.id);
    });
  }
  async deleteCampaign(id: string) {
    this.idle();
    return this.write((state) => {
      state.campaigns = state.campaigns.filter((c) => c.id !== id);
      if (state.draft?.campaignId === id) state.draft = undefined;
      if (state.drafts) delete state.drafts[id];
    });
  }
  async deleteBrand(id: string) {
    this.idle();
    return this.write((state) => {
      if (state.campaigns.some((c) => c.brand.id === id))
        throw new Error("Delete the local campaigns using this brand first.");
      state.brands = state.brands.filter((b) => b.id !== id);
      if (state.draft?.brand.id === id) state.draft = undefined;
      if (state.newDraft?.brand.id === id) state.newDraft = undefined;
      for (const [campaignId, draft] of Object.entries(state.drafts ?? {}))
        if (draft.brand.id === id) delete state.drafts![campaignId];
    });
  }
  async clearDraft() {
    return this.write((state) => {
      state.draft = undefined;
      state.newDraft = undefined;
    });
  }
}

export function campaignStatus(campaign: StudioCampaign) {
  if (campaign.runs.some((r) => r.status === "running")) return "Creating";
  if (!campaign.assets.length || campaign.assets.some((a) => !studioVersion(a)))
    return "Outputs needed";
  if (campaign.assets.some((a) => a.stale)) return "Updates needed";
  if (campaign.assets.some((a) => studioStatus(a) === "Needs repair"))
    return "Repairs needed";
  return campaign.assets.every((a) => studioStatus(a) === "Approved")
    ? "Reviewed packet"
    : "Ready for review";
}
