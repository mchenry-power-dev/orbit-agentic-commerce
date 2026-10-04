import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";
import { tmpdir } from "node:os";
import sharp from "sharp";
import { request as httpRequest } from "node:http";
import type {
  ImageGenerationRequest,
  SemanticPlan,
  SemanticPlanRequest,
} from "../src/domain/service";
import { FileAllowance, MemoryAllowance } from "../server/allowance";
import { OpenAiProviders, validatePlanSemantics } from "../server/providers";
import { validatePlanRequest, validateSemanticPayload } from "../server/schema";
import { ProtectedService } from "../server/service";
import type { ServiceOptions } from "../server/service";

const access = "mock-local-access-secret-over-32-characters";
const services: ProtectedService[] = [],
  directories: string[] = [];
afterEach(async () => {
  for (const service of services.splice(0)) await service.close();
  for (const directory of directories.splice(0)) {
    if (
      dirname(resolve(directory)) !== resolve(tmpdir()) ||
      !basename(directory).startsWith("orbit-service-test-")
    )
      throw new Error("Unexpected temporary cleanup path");
    await rm(directory, { recursive: true, force: true });
  }
});
async function service(options: Partial<ServiceOptions> = {}) {
  const value = new ProtectedService({ accessSecret: access, ...options });
  services.push(value);
  const port = await value.listen(0);
  return { value, base: `http://127.0.0.1:${port}` };
}
const headers = {
  "Content-Type": "application/json",
  Authorization: `Bearer ${access}`,
};
const json = (value: unknown) =>
  new Response(JSON.stringify(value), {
    headers: { "Content-Type": "application/json" },
  });
export function request(): SemanticPlanRequest {
  return {
    requestId: "plan-test",
    brief: {
      text: "Vibrant Christmas lights and premium coffee gifting.",
      goal: "Introduce holiday gifts",
      audience: "Holiday gift buyers",
      offer: null,
      tone: "Festive",
      keywords: ["Christmas gifting"],
      requiredPhrases: [],
      prohibitedPhrases: ["guaranteed"],
      phraseScope: "campaign-copy",
      dates: null,
    },
    confirmedProducts: [
      {
        id: "solar",
        name: "Solar Roast",
        description: "Whole bean coffee",
        facts: ["Whole bean coffee", "12 oz bag"],
        sourceIds: ["product-page"],
        packageText: ["Solar Roast", "12 oz"],
        imageIds: ["product-photo"],
      },
    ],
    factSources: [
      {
        id: "product-page",
        url: "https://store.test/product",
        retrievedAt: "2026-10-03",
        role: "product-facts",
        confirmed: true,
      },
    ],
    brand: {
      name: "Owner Brand",
      palette: ["#6043b5"],
      tone: "Calm",
      confirmed: true,
    },
    references: [],
    placements: [
      {
        id: "google-square",
        channel: "google",
        name: "Google short headline",
        media: "image",
        width: 1200,
        height: 1200,
        maxTextLength: 30,
      },
      {
        id: "website-hero",
        channel: "website",
        name: "Website hero",
        media: "image",
        width: 1600,
        height: 900,
        maxTextLength: null,
      },
    ],
    budget: {
      currency: "USD",
      periodStart: "2026-12-01",
      periodEnd: "2026-12-15",
      intent: "lifetime",
      totalMinorUnits: 10000,
      allocations: [{ channel: "google", amountMinorUnits: 6000 }],
      assumptions: { cpaMinorUnits: null, roas: null, marginPercent: null },
    },
    preferences: { tone: "Calm and inviting", avoidCrowdedCompositions: true },
  };
}
function payload(input = request()): Omit<SemanticPlan, "mode" | "provenance"> {
  return {
    theme: input.brief.text,
    audience: input.brief.audience,
    offer: input.brief.offer,
    productIds: ["solar"],
    directions: [
      {
        id: "direction-1",
        title: "Radiant gifting",
        description: "A vibrant festive direction.",
        palette: ["#6043b5"],
        imagePrompt: `Bright scene: ${input.brief.text}`,
        negativePrompt: "No invented labels",
        productLayerInstructions: "Use original approved Solar Roast photo.",
        placementComposition: input.placements.map((item) => ({
          placementId: item.id,
          composition: "product-right",
          spacing:
            item.width && item.height && item.width < item.height ? 0.18 : 0.12,
          framing: "Purposeful framing",
          focalPoint: "Approved product photograph",
          negativeSpace: "Left side for copy",
          textPlacement: "Safe overlay area for review",
        })),
      },
      {
        id: "direction-2",
        title: "Quiet premium gifting",
        description: "A contrasting editorial gift direction.",
        palette: ["#6043b5"],
        imagePrompt: `Editorial scene: ${input.brief.text}`,
        negativePrompt: "No invented labels",
        productLayerInstructions: "Use original approved Solar Roast photo.",
        placementComposition: input.placements.map((item) => ({
          placementId: item.id,
          composition: "product-center",
          spacing:
            item.width && item.height && item.width < item.height ? 0.16 : 0.08,
          framing: "Tight editorial framing",
          focalPoint: "Approved product photograph",
          negativeSpace: "Upper area for copy",
          textPlacement: "Placement-specific overlay for review",
        })),
      },
    ],
    copy: input.placements.map((item) => ({
      placementId: item.id,
      headlines: ["Solar gifts", "Solar Roast gifts", "Bright coffee gifting"],
      longHeadlines: ["Share Solar Roast with your holiday gift buyers."],
      descriptions: [
        "Whole bean coffee in a 12 oz bag.",
        "Explore Solar Roast for festive gifting.",
      ],
      ctas: ["Explore coffee gifts"],
    })),
    landing: {
      heroTitle: "Christmas gifts, a brighter cup.",
      heroBody: "Meet Solar Roast: whole bean coffee in a 12 oz bag.",
      cta: "Explore the coffee",
      sections: [
        {
          kind: "benefit",
          title: "Clear product details",
          body: "Whole bean coffee in a 12 oz bag.",
        },
        {
          kind: "story",
          title: "Solar Roast",
          body: "Original approved product photography.",
        },
      ],
    },
    videoBriefs: [],
    conflicts: [],
    coverage: [
      {
        input: "Campaign brief",
        appliedTo: ["theme", "directions", "copy", "landing"],
        notAppliedReason: null,
      },
    ],
    warnings: [],
  };
}
const plan = (input = request()): SemanticPlan => ({
  ...payload(input),
  mode: "live-semantic-provider",
  provenance: {
    provider: "openai",
    model: "mock-model",
    sourceIds: ["product-page"],
    generatedAt: "2026-10-03T12:00:00Z",
  },
});
const imageRequest = (): ImageGenerationRequest => ({
  requestId: "image-test",
  prompt: "Christmas lights behind protected coffee photography",
  size: "1024x1024",
  referenceImages: [],
  backgroundOnly: true,
});
const providerConfig = {
  apiKey: "mock-api-secret-never-live",
  planningModel: "mock-planning-model",
  imageModel: "gpt-image-mock",
  maxOutputTokens: 6000,
  planTimeoutMs: 1000,
  imageTimeoutMs: 1000,
};
describe("schema and semantic provider adapter", () => {
  it("requires confirmed facts, valid same-intent allocations and known typed fields", () => {
    validatePlanRequest(request());
    const unconfirmed = request();
    unconfirmed.factSources[0].confirmed = false;
    expect(() => validatePlanRequest(unconfirmed)).toThrow("confirmed");
    const budget = request();
    budget.budget!.allocations[0].amountMinorUnits = 11000;
    expect(() => validatePlanRequest(budget)).toThrow("Budget");
    const invalid = request();
    invalid.brief.dates = { start: "2026-02-30", end: "2026-12-01" };
    expect(() => validatePlanRequest(invalid)).toThrow("dates");
    expect(() =>
      validatePlanRequest({ ...request(), apiKey: "not-allowed" }),
    ).toThrow("unsupported field");
  });
  it("sends strict schema/current instructions through the actual Responses adapter and validates returned copy", async () => {
    const api = vi.fn(
      async (_url: string | URL | Request, init?: RequestInit) => {
        const body = JSON.parse(init!.body as string),
          input = JSON.parse(body.input[1].content) as SemanticPlanRequest;
        return json({
          status: "completed",
          output: [
            {
              type: "message",
              content: [
                { type: "output_text", text: JSON.stringify(payload(input)) },
              ],
            },
          ],
        });
      },
    );
    const provider = new OpenAiProviders(providerConfig, api);
    const planningInput = request();
    planningInput.brief.feedback = "Current merchant iteration notes "
      .repeat(200)
      .slice(0, 5000);
    const result = await provider.plan(
      planningInput,
      new AbortController().signal,
    );
    expect(result.mode).toBe("live-semantic-provider");
    expect(result.directions).toHaveLength(2);
    expect(result.directions[0].placementComposition[0]).toMatchObject({
      composition: "product-right",
      spacing: 0.12,
    });
    expect(result.theme).toContain("Christmas");
    const body = JSON.parse(api.mock.calls[0][1]!.body as string);
    expect(body.text.format.strict).toBe(true);
    expect(body.store).toBe(false);
    expect(body.max_output_tokens).toBe(6000);
    expect(body.input[0].content).toContain("untrusted DATA");
    expect(body.input[0].content).toContain("current free-text");
    expect(body.input[0].content).toContain("actionable composition enum");
    expect(body.input[0].content).toContain(
      "Merchant iteration notes in brief.feedback are current input",
    );
    expect(JSON.parse(body.input[1].content).brief.feedback).toBe(
      planningInput.brief.feedback,
    );
    expect(JSON.stringify(result)).not.toContain(providerConfig.apiKey);
  });
  it("preserves unseen current prose across the provider boundary instead of substituting a fixture", async () => {
    const input = request();
    input.brief.text =
      "Sea-glass tones, a sunlit linen table, and absolutely no holiday motifs.";
    const api = vi.fn(
      async (_url: string | URL | Request, init?: RequestInit) => {
        const body = JSON.parse(init!.body as string),
          input = JSON.parse(body.input[1].content) as SemanticPlanRequest;
        return json({
          output: [
            {
              content: [
                { type: "output_text", text: JSON.stringify(payload(input)) },
              ],
            },
          ],
        });
      },
    );
    const result = await new OpenAiProviders(providerConfig, api).plan(
      input,
      new AbortController().signal,
    );
    expect(result.theme).toBe(input.brief.text);
    expect(result.directions[0].imagePrompt).toContain("Sea-glass");
  });
  it("omits excluded reference instructions from the provider input and used-source provenance", async () => {
    const input = request();
    input.factSources.push({
      id: "excluded-source",
      url: null,
      retrievedAt: "2026-10-03",
      role: "visual-inspiration",
      confirmed: false,
    });
    input.references.push({
      id: "excluded-ref",
      role: "visual-inspiration",
      sourceId: "excluded-source",
      text: "EXCLUDED_INSTRUCTION",
      selected: false,
    });
    const api = vi.fn(
      async (_url: string | URL | Request, init?: RequestInit) => {
        const sent = JSON.parse(
          JSON.parse(init!.body as string).input[1].content,
        ) as SemanticPlanRequest;
        return json({
          output: [
            {
              content: [
                { type: "output_text", text: JSON.stringify(payload(sent)) },
              ],
            },
          ],
        });
      },
    );
    const result = await new OpenAiProviders(providerConfig, api).plan(
      input,
      new AbortController().signal,
    );
    expect(api.mock.calls[0][1]!.body).not.toContain("EXCLUDED_INSTRUCTION");
    expect(result.provenance.sourceIds).toEqual(["product-page"]);
  });
  it("rejects malformed schemas, refusals and selected-product/placement substitutions", async () => {
    expect(() =>
      validateSemanticPayload({ ...payload(), directions: [] }),
    ).toThrow("item count");
    const emptyCopy = payload();
    emptyCopy.copy[1].headlines = [];
    expect(() => validateSemanticPayload(emptyCopy)).toThrow("item count");
    const missingLayout = payload();
    delete (
      missingLayout.directions[0].placementComposition[0] as {
        composition?: string;
      }
    ).composition;
    expect(() => validateSemanticPayload(missingLayout)).toThrow(
      "composition is required",
    );
    const invalidSpacing = payload();
    invalidSpacing.directions[0].placementComposition[0].spacing = 0.2;
    expect(() => validateSemanticPayload(invalidSpacing)).toThrow(
      "invalid number",
    );
    const unsupportedLayout = payload();
    (
      unsupportedLayout.directions[0].placementComposition[0] as {
        composition: string;
      }
    ).composition = "product-left";
    expect(() => validateSemanticPayload(unsupportedLayout)).toThrow(
      "supported choices",
    );
    const wrong = plan();
    wrong.productIds = ["unknown"];
    expect(() => validatePlanSemantics(wrong, request())).toThrow(
      "selected products",
    );
    const mapped = plan();
    mapped.directions[0].placementComposition = [];
    expect(() => validatePlanSemantics(mapped, request())).toThrow("map every");
    const refusal = new OpenAiProviders(providerConfig, async () =>
      json({ output: [{ content: [{ type: "refusal" }] }] }),
    );
    await expect(
      refusal.plan(request(), new AbortController().signal),
    ).rejects.toThrow("declined");
  });
  it("reports phrase/field conflicts without truncating required text or faking compliance", () => {
    const input = request();
    input.brief.requiredPhrases = [
      "A complete required phrase that should be placed in a suitable field.",
    ];
    const output = plan();
    output.copy[0].headlines[0] = "Guaranteed " + "x".repeat(35);
    validatePlanSemantics(output, input);
    expect(output.conflicts.map((item) => item.code)).toEqual(
      expect.arrayContaining([
        "required-phrase-missing",
        "prohibited-phrase",
        "placement-text-length",
      ]),
    );
    expect(output.copy[0].headlines[0]).toContain("x".repeat(35));
  });
  it("checks complete phrases in actual fields, V2 weighted Google lengths and Google-only counts", () => {
    const input = request();
    input.brief.requiredPhrases = ["google-square"];
    const output = plan();
    output.copy[0].headlines = ["中文。Ａ，".repeat(4)];
    output.copy[0].descriptions = ["x".repeat(91)];
    output.copy[1].headlines = [
      "An unrestricted website title that exceeds the Google headline length",
    ];
    validatePlanSemantics(output, input);
    expect(output.conflicts.map((conflict) => conflict.code)).toEqual(
      expect.arrayContaining([
        "required-phrase-missing",
        "google-copy-count",
        "google-copy-length",
        "google-short-headline",
      ]),
    );
    expect(
      output.conflicts
        .filter((conflict) => conflict.code.startsWith("google-"))
        .every((conflict) =>
          conflict.message.startsWith("Google short headline:"),
        ),
    ).toBe(true);
    const split = request();
    split.brief.requiredPhrases = ["perfect coffee"];
    const splitOutput = plan();
    splitOutput.copy[0].headlines = ["perfect", "coffee", "Solar gifts"];
    validatePlanSemantics(splitOutput, split);
    expect(
      splitOutput.conflicts.some(
        (conflict) => conflict.code === "required-phrase-missing",
      ),
    ).toBe(true);
  });
  it("requires unique placement maps and an actual brief for every selected video destination", () => {
    const duplicated = plan();
    duplicated.directions[0].placementComposition.push(
      duplicated.directions[0].placementComposition[0],
    );
    expect(() => validatePlanSemantics(duplicated, request())).toThrow(
      "map every",
    );
    const videoRequest = request();
    videoRequest.placements.push({
      id: "tiktok-video",
      channel: "tiktok",
      name: "TikTok video",
      media: "video",
      width: 1080,
      height: 1920,
      maxTextLength: null,
    });
    const videoPlan = plan(videoRequest);
    videoPlan.copy = videoPlan.copy.filter(
      (copy) => copy.placementId !== "tiktok-video",
    );
    expect(() => validatePlanSemantics(videoPlan, videoRequest)).toThrow(
      "Video brief",
    );
  });
  it("generates one validated raster through the actual Image API adapter with bounded parameters", async () => {
    const raster = await sharp({
      create: { width: 1024, height: 1024, channels: 3, background: "#6043b5" },
    })
      .png()
      .toBuffer();
    const api = vi.fn(
      async (_url: string | URL | Request, _init?: RequestInit) =>
        json({ data: [{ b64_json: raster.toString("base64") }] }),
    );
    const output = await new OpenAiProviders(providerConfig, api).generate(
      imageRequest(),
      new AbortController().signal,
    );
    expect(output.image).toMatchObject({
      mimeType: "image/png",
      width: 1024,
      height: 1024,
    });
    expect(output.requiresProductFidelityReview).toBe(true);
    const body = JSON.parse(api.mock.calls[0][1]!.body as string);
    expect(body).toMatchObject({
      n: 1,
      quality: "low",
      size: "1024x1024",
      output_format: "png",
    });
    expect(body.prompt).toContain("protected layers");
    expect(api.mock.calls[0][0]).toBe(
      "https://api.openai.com/v1/images/generations",
    );
  });
  it("edits bounded decoded image references and rejects wrong returned dimensions", async () => {
    const reference = await sharp({
      create: { width: 32, height: 32, channels: 3, background: "orange" },
    })
      .png()
      .toBuffer();
    const output = await sharp({
      create: { width: 1024, height: 1024, channels: 3, background: "blue" },
    })
      .png()
      .toBuffer();
    const api = vi.fn(
      async (_url: string | URL | Request, _init?: RequestInit) =>
        json({ data: [{ b64_json: output.toString("base64") }] }),
    );
    const input = imageRequest();
    input.referenceImages = [
      { mimeType: "image/png", base64: reference.toString("base64") },
    ];
    await new OpenAiProviders(providerConfig, api).generate(
      input,
      new AbortController().signal,
    );
    expect(api.mock.calls[0][0]).toBe("https://api.openai.com/v1/images/edits");
    const form = api.mock.calls[0][1]!.body as FormData;
    expect(form.get("n")).toBe("1");
    expect(form.getAll("image[]")).toHaveLength(1);
    await expect(
      new OpenAiProviders(providerConfig, async () =>
        json({ data: [{ b64_json: reference.toString("base64") }] }),
      ).generate(imageRequest(), new AbortController().signal),
    ).rejects.toThrow("dimensions");
  });
});
describe("protected local runtime and conservative cost boundary", () => {
  it("blocks unauthorized/hostile origin and Host requests with no exposed secrets", async () => {
    const { base } = await service();
    expect((await fetch(`${base}/v1/capabilities`)).status).toBe(401);
    expect(
      (
        await fetch(`${base}/v1/capabilities`, {
          headers: { ...headers, Origin: "https://attacker.test" },
        })
      ).status,
    ).toBe(403);
    const hostileHostStatus = await new Promise<number>((resolve, reject) => {
      const request = httpRequest(
        `${base}/v1/capabilities`,
        { headers: { ...headers, Host: "attacker.test" } },
        (response) => {
          response.resume();
          resolve(response.statusCode!);
        },
      );
      request.on("error", reject);
      request.end();
    });
    expect(hostileHostStatus).toBe(403);
    const response = await fetch(`${base}/v1/capabilities`, { headers });
    expect(response.status).toBe(200);
    expect(await response.text()).not.toContain(access);
  });
  it("bootstraps a short-lived HttpOnly session without returning an access/provider secret", async () => {
    const { base } = await service();
    const response = await fetch(`${base}/v1/session`, {
      method: "POST",
      headers,
    });
    const cookie = response.headers.get("set-cookie")!;
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("SameSite=Strict");
    expect(await response.text()).toBe('{"authenticated":true}');
    expect(
      (
        await fetch(`${base}/v1/capabilities`, {
          headers: { Cookie: cookie.split(";")[0] },
        })
      ).status,
    ).toBe(200);
  });
  it("defaults generation to unavailable rather than substituting canned results", async () => {
    const { base } = await service();
    const response = await fetch(`${base}/v1/plan`, {
      method: "POST",
      headers,
      body: JSON.stringify(request()),
    });
    expect(response.status).toBe(503);
    const body = await response.json();
    expect(body.error.code).toBe("generation-disabled");
    expect(body.fallback).toBe("configure-approved-server-runtime");
  });
  it("enforces request rate and upload validation limits", async () => {
    const { base } = await service({ requestsPerMinute: 1 });
    expect((await fetch(`${base}/v1/capabilities`, { headers })).status).toBe(
      200,
    );
    expect((await fetch(`${base}/v1/capabilities`, { headers })).status).toBe(
      429,
    );
    const second = await service();
    const response = await fetch(`${second.base}/v1/upload`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        requestId: "bad-upload",
        mimeType: "image/png",
        base64: Buffer.from("<script>bad</script>").toString("base64"),
      }),
    });
    expect(response.status).toBe(400);
  });
  it("serializes active work, returns cached idempotent results and blocks changed request IDs", async () => {
    const allowance = new MemoryAllowance(30);
    let unblock!: (value: SemanticPlan) => void;
    const provider = {
      plan: vi.fn(
        () =>
          new Promise<SemanticPlan>((resolve) => {
            unblock = resolve;
          }),
      ),
    };
    const { base } = await service({
      generation: {
        approved: true,
        approvalId: "mock",
        allowance,
        planReservationCents: 10,
        imageReservationCents: 10,
        semanticProvider: provider,
        imageProvider: { generate: vi.fn() },
      },
    });
    const pending = fetch(`${base}/v1/plan`, {
      method: "POST",
      headers,
      body: JSON.stringify(request()),
    });
    await vi.waitFor(() => expect(provider.plan).toHaveBeenCalledTimes(1));
    expect(
      (
        await fetch(`${base}/v1/plan`, {
          method: "POST",
          headers,
          body: JSON.stringify(request()),
        })
      ).status,
    ).toBe(409);
    unblock(plan());
    expect((await pending).status).toBe(200);
    expect(
      (
        await fetch(`${base}/v1/plan`, {
          method: "POST",
          headers,
          body: JSON.stringify(request()),
        })
      ).status,
    ).toBe(200);
    expect(provider.plan).toHaveBeenCalledTimes(1);
    const changed = request();
    changed.brief.text = "New summer idea";
    expect(
      (
        await fetch(`${base}/v1/plan`, {
          method: "POST",
          headers,
          body: JSON.stringify(changed),
        })
      ).status,
    ).toBe(409);
    expect(allowance.remainingCents).toBe(20);
  });
  it("counts failed/unknown calls and blocks automatic paid retry or allowance exhaustion", async () => {
    const allowance = new MemoryAllowance(10),
      provider = {
        plan: vi.fn(async () => {
          throw new Error("sensitive upstream detail must not be public");
        }),
      };
    const { base } = await service({
      generation: {
        approved: true,
        approvalId: "mock",
        allowance,
        planReservationCents: 10,
        imageReservationCents: 10,
        semanticProvider: provider,
        imageProvider: { generate: vi.fn() },
      },
    });
    const first = await fetch(`${base}/v1/plan`, {
      method: "POST",
      headers,
      body: JSON.stringify(request()),
    });
    expect(first.status).toBe(502);
    expect(await first.text()).not.toContain("sensitive");
    const repeated = await fetch(`${base}/v1/plan`, {
      method: "POST",
      headers,
      body: JSON.stringify(request()),
    });
    expect(repeated.status).toBe(409);
    const next = request();
    next.requestId = "another";
    expect(
      (
        await fetch(`${base}/v1/plan`, {
          method: "POST",
          headers,
          body: JSON.stringify(next),
        })
      ).status,
    ).toBe(402);
    expect(provider.plan).toHaveBeenCalledTimes(1);
  });
  it("bounds cancellation/timeouts and retains reservations after transient reset", async () => {
    const allowance = new MemoryAllowance(20),
      provider = { plan: vi.fn(() => new Promise<SemanticPlan>(() => {})) };
    const { base } = await service({
      operationTimeoutMs: 20,
      generation: {
        approved: true,
        approvalId: "mock",
        allowance,
        planReservationCents: 10,
        imageReservationCents: 10,
        semanticProvider: provider,
        imageProvider: { generate: vi.fn() },
      },
    });
    const response = await fetch(`${base}/v1/plan`, {
      method: "POST",
      headers,
      body: JSON.stringify(request()),
    });
    expect(response.status).toBe(504);
    expect(allowance.remainingCents).toBe(10);
    expect(
      (await fetch(`${base}/v1/reset`, { method: "DELETE", headers })).status,
    ).toBe(200);
    expect(allowance.remainingCents).toBe(10);
    expect(
      (
        await fetch(`${base}/v1/plan`, {
          method: "POST",
          headers,
          body: JSON.stringify(request()),
        })
      ).status,
    ).toBe(409);
    expect(provider.plan).toHaveBeenCalledTimes(1);
  });
  it("persists reservations across restarts, rejects competing writers and fails closed on corruption", async () => {
    const directory = await mkdtemp(join(tmpdir(), "orbit-service-test-"));
    directories.push(directory);
    const first = await FileAllowance.open(directory, 20, "approved-test");
    await first.reserve("operation", "a".repeat(64), 10);
    await expect(
      FileAllowance.open(directory, 20, "approved-test"),
    ).rejects.toThrow("lock");
    await first.close();
    const second = await FileAllowance.open(directory, 20, "approved-test");
    expect(second.remainingCents).toBe(10);
    await expect(
      second.reserve("operation", "a".repeat(64), 10),
    ).rejects.toThrow("already reserved");
    await second.close();
    await writeFile(join(directory, "allowance.json"), "{}");
    await expect(
      FileAllowance.open(directory, 20, "approved-test"),
    ).rejects.toThrow("inconsistent");
  });
});
