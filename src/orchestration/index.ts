import type {
  AppState,
  AssetRecord,
  Campaign,
  CampaignBrief,
  CopyContent,
  FailureScenario,
  Preferences,
  RunEvent,
  RunRecord,
} from "../domain";
import { clone, currentVersion, initialState, isCurrent } from "../domain";
import { buildContext, getMerchant, planCampaign } from "../fixtures";
import type { Persistence } from "../persistence";
import { DemoProvider, delay } from "../providers/demo";
import type { GenerationProvider, GenerationRequest } from "../providers/demo";
import { validateAsset, validateBrief, validateContext } from "../validation";
export type { GenerationProvider, GenerationRequest } from "../providers/demo";

export interface EngineOptions {
  delayMs?: number;
  timeoutMs?: number;
  maxAttempts?: number;
  provider?: GenerationProvider;
  clock?: () => Date;
  id?: () => string;
}
export interface RunOptions {
  failure?: FailureScenario;
}
class ProviderError extends Error {
  constructor(
    message: string,
    readonly kind: "transient" | "timeout" | "definitive",
  ) {
    super(message);
  }
}
const isAbort = (error: unknown) =>
  error instanceof Error && error.name === "AbortError";
/** A serial, browser-local workflow. A persisted completed version is the step checkpoint. */
export class OrbitEngine {
  private state = initialState();
  private listeners = new Set<() => void>();
  private writes: Promise<void> = Promise.resolve();
  private active = new Map<
    string,
    { controller: AbortController; promise: Promise<void> }
  >();
  private initialized = false;
  private provider: GenerationProvider;
  private maxAttempts: number;
  private timeoutMs: number;
  constructor(
    private persistence: Persistence,
    private options: EngineOptions = {},
  ) {
    this.provider = options.provider ?? new DemoProvider(options.delayMs);
    this.maxAttempts = Math.max(1, Math.min(5, options.maxAttempts ?? 3));
    this.timeoutMs = Math.max(1, Math.min(30_000, options.timeoutMs ?? 2_000));
  }
  private now = () => (this.options.clock?.() ?? new Date()).toISOString();
  private id = () => this.options.id?.() ?? crypto.randomUUID();
  getSnapshot = (): AppState => this.state;
  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };
  private emit(): void {
    for (const listener of this.listeners) listener();
  }
  async initialize(): Promise<void> {
    if (this.initialized) return;
    const saved = await this.persistence.load();
    this.state = saved?.schemaVersion === 1 ? saved : initialState();
    let changed = false;
    for (const campaign of this.state.campaigns)
      for (const run of campaign.runs)
        if (run.status === "running" || run.status === "queued") {
          changed = true;
          run.status = "interrupted";
          run.updatedAt = this.now();
          for (const step of run.steps)
            if (step.status === "running") step.status = "pending";
          this.event(
            run,
            "interruption",
            "Browser session ended. Completed versions retained; resume pending work.",
          );
        }
    this.initialized = true;
    if (changed) await this.persistence.save(this.state);
    this.emit();
  }
  private mutate<T>(operation: (state: AppState) => T): Promise<T> {
    const result = this.writes.then(async () => {
      if (!this.initialized)
        throw new Error("Initialize the engine before editing.");
      const next = clone(this.state);
      const value = operation(next);
      await this.persistence.save(next);
      this.state = next;
      this.emit();
      return value;
    });
    this.writes = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }
  private find(state: AppState, campaignId: string): Campaign {
    const campaign = state.campaigns.find((item) => item.id === campaignId);
    if (!campaign) throw new Error("Campaign not found.");
    return campaign;
  }
  private asset(campaign: Campaign, assetId: string): AssetRecord {
    const asset = campaign.assets.find((item) => item.spec.id === assetId);
    if (!asset) throw new Error("Asset not found.");
    return asset;
  }
  private idle(): void {
    if (this.active.size)
      throw new Error(
        "A run is active. Interrupt it before changing the brief, context or review.",
      );
  }
  private event(
    run: RunRecord,
    type: RunEvent["type"],
    message: string,
    assetId?: string,
  ): void {
    run.events.push({ id: this.id(), at: this.now(), type, message, assetId });
    run.updatedAt = this.now();
  }
  private reviewEvent(
    campaign: Campaign,
    type: RunEvent["type"],
    message: string,
    assetId?: string,
  ): void {
    const run = campaign.runs.at(-1);
    if (run) this.event(run, type, message, assetId);
    campaign.updatedAt = this.now();
  }
  async createCampaign(brief: CampaignBrief): Promise<Campaign> {
    this.idle();
    const merchant = getMerchant(brief.merchantId);
    const findings = validateBrief(brief, merchant);
    if (findings.length)
      throw new Error(findings.map((finding) => finding.message).join(" "));
    return this.mutate((state) => {
      const context = buildContext(brief),
        blueprint = planCampaign(brief, context, 1, state.preferences);
      const campaign: Campaign = {
        id: this.id(),
        brief: clone(brief),
        context,
        blueprint,
        assets: blueprint.specs.map((spec) => ({ spec, versions: [] })),
        runs: [],
        revision: 1,
        createdAt: this.now(),
        updatedAt: this.now(),
      };
      state.campaigns.unshift(campaign);
      return clone(campaign);
    });
  }
  async updateBrief(campaignId: string, brief: CampaignBrief): Promise<void> {
    this.idle();
    const findings = validateBrief(brief, getMerchant(brief.merchantId));
    if (findings.length)
      throw new Error(findings.map((finding) => finding.message).join(" "));
    await this.mutate((state) => {
      const campaign = this.find(state, campaignId);
      if (JSON.stringify(brief) === JSON.stringify(campaign.brief)) return;
      campaign.brief = clone(brief);
      campaign.revision++;
      campaign.context = buildContext(brief, campaign.context.excludedIds);
      campaign.blueprint = planCampaign(
        brief,
        campaign.context,
        campaign.revision,
        state.preferences,
      );
      campaign.assets.forEach((asset) => {
        asset.spec = campaign.blueprint.specs.find(
          (spec) => spec.id === asset.spec.id,
        )!;
        asset.approval = undefined;
      });
      this.reviewEvent(
        campaign,
        "context",
        "Core brief updated. Earlier asset versions are stale; create the current portfolio.",
      );
    });
  }
  async setContextExcluded(
    campaignId: string,
    excludedIds: string[],
  ): Promise<void> {
    this.idle();
    await this.mutate((state) => {
      const campaign = this.find(state, campaignId);
      const context = buildContext(campaign.brief, excludedIds);
      if (context.fingerprint === campaign.context.fingerprint) return;
      campaign.context = context;
      campaign.revision++;
      campaign.blueprint = planCampaign(
        campaign.brief,
        context,
        campaign.revision,
        state.preferences,
      );
      campaign.assets.forEach((asset) => {
        asset.spec = campaign.blueprint.specs.find(
          (spec) => spec.id === asset.spec.id,
        )!;
        asset.approval = undefined;
      });
      this.reviewEvent(
        campaign,
        "context",
        "Selected context changed. Earlier versions are stale and approvals cleared.",
      );
    });
  }
  async setPreferences(patch: Partial<Preferences>): Promise<void> {
    this.idle();
    await this.mutate((state) => {
      state.preferences = {
        ...state.preferences,
        ...patch,
        preferredTone: (
          patch.preferredTone ?? state.preferences.preferredTone
        ).slice(0, 100),
      };
    });
  }
  runCampaign(campaignId: string, options: RunOptions = {}): Promise<void> {
    return this.launch(campaignId, options);
  }
  resumeCampaign(campaignId: string): Promise<void> {
    return this.launch(campaignId, {}, undefined, undefined, true);
  }
  reviseAsset(
    campaignId: string,
    assetId: string,
    note: string,
  ): Promise<void> {
    if (!note.trim())
      return Promise.reject(new Error("Enter a revision request."));
    return this.launch(campaignId, {}, assetId, note.trim().slice(0, 1000));
  }
  private launch(
    campaignId: string,
    options: RunOptions,
    targetAssetId?: string,
    note?: string,
    resume = false,
  ): Promise<void> {
    if (this.active.size)
      return Promise.reject(
        new Error("A run is already active. Duplicate starts are blocked."),
      );
    const controller = new AbortController();
    const promise = this.execute(
      campaignId,
      options,
      controller.signal,
      targetAssetId,
      note,
      resume,
    ).finally(() => this.active.delete(campaignId));
    this.active.set(campaignId, { controller, promise });
    return promise;
  }
  async interruptCampaign(campaignId: string): Promise<void> {
    const active = this.active.get(campaignId);
    if (active) {
      active.controller.abort();
      await active.promise;
    }
  }
  isRunning(campaignId?: string): boolean {
    return campaignId ? this.active.has(campaignId) : this.active.size > 0;
  }
  private async execute(
    campaignId: string,
    options: RunOptions,
    signal: AbortSignal,
    targetAssetId?: string,
    note?: string,
    resume = false,
  ): Promise<void> {
    let runId = "";
    try {
      runId = await this.mutate((state) => {
        const campaign = this.find(state, campaignId);
        const reusable = resume
          ? [...campaign.runs]
              .reverse()
              .find(
                (run) =>
                  run.status === "failed" || run.status === "interrupted",
              )
          : undefined;
        const contextFindings = validateContext(
          campaign.brief,
          campaign.context,
        );
        if (contextFindings.length)
          throw new Error(
            contextFindings.map((finding) => finding.message).join(" "),
          );
        if (resume && !reusable)
          throw new Error("There is no interrupted or failed run to resume.");
        if (
          reusable &&
          reusable.steps.some(
            (step) =>
              !campaign.assets.some((asset) => asset.spec.id === step.assetId),
          )
        )
          throw new Error(
            "Run specifications changed; create a new portfolio.",
          );
        if (reusable) {
          reusable.status = "running";
          for (const step of reusable.steps) {
            const asset = this.asset(campaign, step.assetId),
              version = currentVersion(asset);
            if (
              step.status === "completed" &&
              version &&
              isCurrent(campaign, version)
            )
              continue;
            step.status = "pending";
            step.error = undefined;
          }
          this.event(
            reusable,
            "start",
            "Resuming pending steps; completed versions are retained.",
          );
          return reusable.id;
        }
        if (targetAssetId) {
          const asset = this.asset(campaign, targetAssetId);
          if (!currentVersion(asset))
            throw new Error(
              "Generate this asset before requesting a revision.",
            );
        }
        const pending = campaign.assets.filter((asset) => {
          if (targetAssetId) return asset.spec.id === targetAssetId;
          const version = currentVersion(asset);
          return !version || !isCurrent(campaign, version);
        });
        if (!pending.length)
          throw new Error(
            "All current outputs already exist. Review them or revise an individual item.",
          );
        if (
          options.failure &&
          (!pending.some(
            (asset) => asset.spec.id === options.failure!.assetId,
          ) ||
            !Number.isInteger(options.failure.count) ||
            options.failure.count < 1 ||
            options.failure.count > 20)
        )
          throw new Error("Invalid demo failure scenario.");
        const run: RunRecord = {
          id: this.id(),
          status: "running",
          createdAt: this.now(),
          updatedAt: this.now(),
          steps: pending.map((asset) => ({
            assetId: asset.spec.id,
            status: "pending",
            attempts: 0,
          })),
          events: [],
          targetAssetId,
          revisionNote: note,
          failure: options.failure ? clone(options.failure) : undefined,
          failureRemaining: options.failure?.count,
        };
        this.event(
          run,
          "plan",
          `Planned ${pending.length} ${targetAssetId ? "targeted revision" : "required output"} steps; serial concurrency 1, maximum ${this.maxAttempts} attempts per step per invocation.`,
        );
        this.event(
          run,
          "start",
          `${this.provider.name}; local execution, no external workflow calls.`,
        );
        campaign.runs.push(run);
        campaign.updatedAt = this.now();
        return run.id;
      });
      const campaign = this.find(this.state, campaignId),
        run = campaign.runs.find((item) => item.id === runId)!;
      for (const step of run.steps) {
        if (step.status === "completed") continue;
        if (signal.aborted)
          throw new DOMException("Run interrupted.", "AbortError");
        let complete = false;
        for (let attempt = 1; attempt <= this.maxAttempts; attempt++) {
          if (signal.aborted)
            throw new DOMException("Run interrupted.", "AbortError");
          const fault = await this.mutate((state) => {
            const nextCampaign = this.find(state, campaignId),
              nextRun = nextCampaign.runs.find((item) => item.id === runId)!,
              nextStep = nextRun.steps.find(
                (item) => item.assetId === step.assetId,
              )!;
            nextStep.status = "running";
            nextStep.attempts++;
            nextStep.error = undefined;
            this.event(
              nextRun,
              "attempt",
              `Attempt ${attempt}/${this.maxAttempts}.`,
              step.assetId,
            );
            const injected =
              nextRun.failure?.assetId === step.assetId &&
              (nextRun.failureRemaining ?? 0) > 0
                ? nextRun.failure.kind
                : undefined;
            if (injected) nextRun.failureRemaining!--;
            return injected;
          });
          try {
            const latestCampaign = this.find(this.state, campaignId),
              latestRun = latestCampaign.runs.find(
                (item) => item.id === runId,
              )!,
              asset = this.asset(latestCampaign, step.assetId);
            const versionNumber = asset.versions.length + 1;
            const content = await this.withTimeout(
              {
                campaign: clone(latestCampaign),
                spec: clone(asset.spec),
                versionNumber,
                revisionNote: latestRun.revisionNote,
                preferences: clone(this.state.preferences),
                signal,
              },
              fault,
            );
            if (signal.aborted)
              throw new DOMException("Run interrupted.", "AbortError");
            await this.mutate((state) => {
              const currentCampaign = this.find(state, campaignId),
                currentRun = currentCampaign.runs.find(
                  (item) => item.id === runId,
                )!,
                currentAsset = this.asset(currentCampaign, step.assetId);
              const validation = validateAsset(
                content,
                currentAsset.spec,
                currentCampaign.brief,
                currentCampaign.context,
                getMerchant(currentCampaign.brief.merchantId),
              );
              const version = {
                id: this.id(),
                number: versionNumber,
                content,
                createdAt: this.now(),
                sourceRevision: currentCampaign.revision,
                contextFingerprint: currentCampaign.context.fingerprint,
                validation,
                revisionNote: currentRun.revisionNote,
              };
              currentAsset.versions.push(version);
              currentAsset.currentVersionId = version.id;
              currentAsset.approval = undefined;
              currentRun.steps.find(
                (item) => item.assetId === step.assetId,
              )!.status = "completed";
              this.event(
                currentRun,
                "validation",
                `${validation.filter((finding) => finding.severity === "error").length} blocking findings; current version ${versionNumber} saved.`,
                step.assetId,
              );
              currentCampaign.updatedAt = this.now();
            });
            complete = true;
            break;
          } catch (error) {
            if (isAbort(error) || signal.aborted) throw error;
            const message =
              error instanceof Error ? error.message : "Provider failed.";
            const definitive =
              error instanceof ProviderError && error.kind === "definitive";
            const last = definitive || attempt === this.maxAttempts;
            await this.mutate((state) => {
              const currentCampaign = this.find(state, campaignId),
                currentRun = currentCampaign.runs.find(
                  (item) => item.id === runId,
                )!,
                currentStep = currentRun.steps.find(
                  (item) => item.assetId === step.assetId,
                )!;
              currentStep.error = message;
              currentStep.status = last ? "failed" : "pending";
              this.event(
                currentRun,
                last ? "failure" : "retry",
                `${message}${last ? " Independent steps continue; this step can be resumed." : " Bounded retry scheduled."}`,
                step.assetId,
              );
            });
            if (last) break;
            await delay(Math.min(50 * attempt, 150), signal);
          }
        }
        if (!complete) continue;
      }
      await this.mutate((state) => {
        const campaign = this.find(state, campaignId),
          run = campaign.runs.find((item) => item.id === runId)!;
        const failed = run.steps.some((step) => step.status === "failed");
        run.status = failed ? "failed" : "completed";
        this.event(
          run,
          failed ? "failure" : "complete",
          failed
            ? "Independent outputs persisted. Resume the failed steps; completed versions and approvals remain intact."
            : "All planned outputs persisted. Merchant review and exact-version approvals are required before export.",
        );
      });
    } catch (error) {
      if (!runId) throw error;
      await this.mutate((state) => {
        const campaign = this.find(state, campaignId),
          run = campaign.runs.find((item) => item.id === runId)!;
        if (isAbort(error) || signal.aborted) {
          run.status = "interrupted";
          run.steps.forEach((step) => {
            if (step.status === "running") step.status = "pending";
          });
          this.event(
            run,
            "interruption",
            "Execution interrupted. Completed versions retained; resume pending steps.",
          );
        } else {
          run.status = "failed";
          this.event(
            run,
            "failure",
            error instanceof Error ? error.message : "Run failed.",
          );
        }
      });
    }
  }
  private async withTimeout(
    request: GenerationRequest,
    fault?: FailureScenario["kind"],
  ): Promise<Awaited<ReturnType<GenerationProvider["generate"]>>> {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const abort = () => controller.abort();
    request.signal.addEventListener("abort", abort, { once: true });
    if (request.signal.aborted) controller.abort();
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        reject(
          new ProviderError(
            `Provider timed out after ${this.timeoutMs} ms.`,
            "timeout",
          ),
        );
        controller.abort();
      }, this.timeoutMs);
    });
    try {
      const generate = async () => {
        if (fault === "timeout") {
          await delay(this.timeoutMs + 1, controller.signal);
          throw new ProviderError("Injected timeout.", "timeout");
        }
        if (fault) {
          await delay(1, controller.signal);
          throw new ProviderError(
            fault === "definitive"
              ? "Injected definitive provider failure."
              : "Injected recoverable provider failure.",
            fault,
          );
        }
        return this.provider.generate({
          ...request,
          signal: controller.signal,
        });
      };
      return await Promise.race([generate(), timeout]);
    } catch (error) {
      if (request.signal.aborted)
        throw new DOMException("Run interrupted.", "AbortError");
      throw error;
    } finally {
      if (timer) clearTimeout(timer);
      request.signal.removeEventListener("abort", abort);
      controller.abort();
    }
  }
  async approveAsset(campaignId: string, assetId: string): Promise<void> {
    this.idle();
    await this.mutate((state) => {
      const campaign = this.find(state, campaignId),
        asset = this.asset(campaign, assetId),
        version = currentVersion(asset);
      if (!version) throw new Error("This asset has not been generated.");
      if (!isCurrent(campaign, version))
        throw new Error(
          "This version is stale. Generate the current portfolio.",
        );
      if (version.validation.some((finding) => finding.severity === "error"))
        throw new Error(
          "Resolve blocking validation findings before approval.",
        );
      asset.approval = {
        versionId: version.id,
        status: "approved",
        at: this.now(),
      };
      this.reviewEvent(
        campaign,
        "review",
        `Approved exact version ${version.number}.`,
        assetId,
      );
    });
  }
  async rejectAsset(
    campaignId: string,
    assetId: string,
    note = "",
  ): Promise<void> {
    this.idle();
    await this.mutate((state) => {
      const campaign = this.find(state, campaignId),
        asset = this.asset(campaign, assetId),
        version = currentVersion(asset);
      if (!version) throw new Error("This asset has not been generated.");
      asset.approval = {
        versionId: version.id,
        status: "rejected",
        note: note.trim(),
        at: this.now(),
      };
      this.reviewEvent(
        campaign,
        "review",
        `Rejected version ${version.number}${note ? `: ${note}` : "."}`,
        assetId,
      );
    });
  }
  async editCopy(
    campaignId: string,
    assetId: string,
    patch: Partial<CopyContent>,
  ): Promise<void> {
    this.idle();
    await this.mutate((state) => {
      const campaign = this.find(state, campaignId),
        asset = this.asset(campaign, assetId),
        previous = currentVersion(asset);
      if (previous?.content.type !== "copy")
        throw new Error("Only supported copy fields can be edited.");
      if (!isCurrent(campaign, previous))
        throw new Error("Create current outputs before editing stale copy.");
      const content: CopyContent = {
        ...clone(previous.content),
        ...clone(patch),
        type: "copy",
      };
      const version = {
        id: this.id(),
        number: asset.versions.length + 1,
        content,
        createdAt: this.now(),
        sourceRevision: campaign.revision,
        contextFingerprint: campaign.context.fingerprint,
        validation: validateAsset(
          content,
          asset.spec,
          campaign.brief,
          campaign.context,
          getMerchant(campaign.brief.merchantId),
        ),
        revisionNote: "Merchant edited supported copy fields.",
      };
      asset.versions.push(version);
      asset.currentVersionId = version.id;
      asset.approval = undefined;
      this.reviewEvent(
        campaign,
        "revision",
        `Copy edited; approval cleared for version ${version.number}.`,
        assetId,
      );
    });
  }
  async reset(): Promise<void> {
    for (const active of this.active.values()) active.controller.abort();
    await Promise.all(
      [...this.active.values()].map((active) => active.promise),
    );
    await this.mutate((state) => {
      const clean = initialState();
      state.campaigns = clean.campaigns;
      state.preferences = clean.preferences;
    });
  }
}
