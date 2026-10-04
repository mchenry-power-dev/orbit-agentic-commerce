import { afterEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { cosmicBrand, christmasSampleBrief } from "../src/fixtures/studio";
import {
  importedBrand,
  semanticRequest,
  StudioServiceClient,
  externalReferenceExcerptMarker,
  externalReferenceTextLimit,
} from "../src/providers/service-client";
import { validateImageRequest, validatePlanRequest } from "../server/schema";
import { imageReferenceInputs } from "../src/providers/visual-references";
import { inspectRaster } from "../src/providers/composition";
import type { BrandImport, RasterImage } from "../src/domain/service";

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("frontend/service contract bridge", () => {
  it("converts a real fixture raster to the exact strict image-reference request contract", () => {
    const photo = cosmicBrand().products[0].photo;
    const bytes = readFileSync(
      join(process.cwd(), "public", photo.replace(/^\//, "")),
    );
    const base64 = bytes.toString("base64");
    const inspected = inspectRaster(`data:image/png;base64,${base64}`);
    const decoded: RasterImage = {
      mimeType: inspected.mime,
      width: inspected.width,
      height: inspected.height,
      byteLength: inspected.bytes,
      base64,
    };
    const input = {
      requestId: "fixture-reference-contract",
      prompt: "Original scene inspired by the selected reference",
      size: "1536x1024",
      referenceImages: [decoded],
      backgroundOnly: true,
    };
    expect(() => validateImageRequest(input)).toThrow("unsupported field");
    const referenceImages = imageReferenceInputs([decoded]);
    expect(Object.keys(referenceImages[0]).sort()).toEqual([
      "base64",
      "mimeType",
    ]);
    expect(referenceImages[0].base64).toBe(base64);
    expect(() =>
      validateImageRequest({ ...input, referenceImages }),
    ).not.toThrow();
    const library = importedBrand(
      {
        mode: "public-https-import",
        reviewRequired: true,
        failures: [],
        sources: [
          {
            id: "source-fixture",
            url: "https://cosmiccatcoffeeco.com/products/solar-surge",
            retrievedAt: "2026-10-03",
            title: "Solar Surge",
            visibleText: "Imported product context",
            colors: ["#30233d"],
            products: [],
          },
        ],
        images: [
          {
            ...decoded,
            id: "fixture-image",
            sourceId: "source-fixture",
            sourceUrl: "https://cosmiccatcoffeeco.com/cdn/fixture.png",
            sha256: "mock-digest",
          },
        ],
      },
      "https://cosmiccatcoffeeco.com/",
    );
    expect(library.sources[1].title).toBe(
      `Imported reference 1 · ${decoded.width}×${decoded.height} · confirm photo association`,
    );
  });
  it("bounds capabilities including a stalled response body and does not retry", async () => {
    vi.useFakeTimers();
    const api = vi.fn(async (_url: string, _init: RequestInit) => ({
      ok: true,
      json: () => new Promise(() => {}),
    }));
    vi.stubGlobal("fetch", api);
    const operation = new StudioServiceClient(
      "https://approved-runtime.test",
    ).capabilities();
    const rejected = expect(operation).rejects.toThrow("timed out");
    await vi.advanceTimersByTimeAsync(10_001);
    await rejected;
    expect(api).toHaveBeenCalledTimes(1);
    expect(api.mock.calls[0][1].signal!.aborted).toBe(true);
  });
  it("bounds an unknown paid image result without changing its identifier or automatically retrying", async () => {
    vi.useFakeTimers();
    const api = vi.fn(
      (_url: string, _init: RequestInit) => new Promise(() => {}),
    );
    vi.stubGlobal("fetch", api);
    const input = {
      requestId: "scene-stable-identifier",
      prompt: "A reference-inspired scene only",
      size: "1536x1024" as const,
      referenceImages: [],
      backgroundOnly: true,
    };
    const operation = new StudioServiceClient(
      "https://approved-runtime.test",
    ).image(input);
    const rejected = expect(operation).rejects.toThrow(
      "paid operation may already be reserved",
    );
    await vi.advanceTimersByTimeAsync(80_001);
    await rejected;
    expect(api).toHaveBeenCalledTimes(1);
    expect(JSON.parse(api.mock.calls[0][1].body as string).requestId).toBe(
      input.requestId,
    );
    expect(api.mock.calls[0][1].signal!.aborted).toBe(true);
  });
  it("propagates caller cancellation, avoids calls already cancelled and clears completed request timers", async () => {
    vi.useFakeTimers();
    const api = vi.fn(
      (_url: string, _init: RequestInit) => new Promise(() => {}),
    );
    vi.stubGlobal("fetch", api);
    const client = new StudioServiceClient("https://approved-runtime.test");
    const controller = new AbortController();
    const operation = client.capabilities(controller.signal);
    const rejected = expect(operation).rejects.toMatchObject({
      name: "AbortError",
    });
    controller.abort();
    await rejected;
    expect(api.mock.calls[0][1].signal!.aborted).toBe(true);
    await expect(client.capabilities(controller.signal)).rejects.toMatchObject({
      name: "AbortError",
    });
    expect(api).toHaveBeenCalledTimes(1);
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ publicImport: true }))),
    );
    await expect(client.capabilities()).resolves.toMatchObject({
      publicImport: true,
    });
    expect(vi.getTimerCount()).toBe(0);
  });
  it("maps approved factual sources separately from product photos and ignores excluded references", () => {
    const brand = cosmicBrand();
    const input = semanticRequest(christmasSampleBrief(brand), brand, {
      generousSpace: true,
      tone: "",
    });
    validatePlanRequest(input);
    expect(input.confirmedProducts[0].sourceIds).toEqual([
      "cosmic-fact-solar-surge",
    ]);
    expect(input.confirmedProducts[0].imageIds).toEqual([
      "cosmic-photo-solar-surge",
    ]);
    expect(input.references.every((reference) => reference.selected)).toBe(
      true,
    );
    expect(
      input.references.some(
        (reference) => reference.id === "cosmic-gifting-inspiration",
      ),
    ).toBe(false);
    expect(
      input.placements
        .filter((placement) => placement.channel === "google")
        .every((placement) => placement.maxTextLength === 30),
    ).toBe(true);
  });
  it("sends a full long campaign brief and separate merchant feedback without concatenation or silent truncation", () => {
    const brand = cosmicBrand();
    const brief = christmasSampleBrief(brand);
    brief.description = "current brief ".repeat(500).slice(0, 6000);
    brief.feedback = "merchant iteration ".repeat(400).slice(0, 5000);
    const input = semanticRequest(brief, brand, {
      generousSpace: true,
      tone: "",
    });
    validatePlanRequest(input);
    expect(input.brief.text).toBe(brief.description);
    expect(input.brief.text).toHaveLength(6000);
    expect(input.brief.feedback).toBe(brief.feedback);
    expect(input.brief.feedback).toHaveLength(5000);
    const oldRequest = structuredClone(input);
    delete oldRequest.brief.feedback;
    expect(() => validatePlanRequest(oldRequest)).not.toThrow();
    input.brief.feedback = "x".repeat(6001);
    expect(() => validatePlanRequest(input)).toThrow("feedback");
    brief.requiredPhrases = ["complete phrase " + "x".repeat(301)];
    const oversizedPhrase = semanticRequest(brief, brand, {
      generousSpace: true,
      tone: "",
    });
    expect(oversizedPhrase.brief.requiredPhrases[0]).toBe(
      brief.requiredPhrases[0],
    );
    expect(() => validatePlanRequest(oversizedPhrase)).toThrow(
      "requiredPhrases",
    );
  });
  it("marks bounded external excerpts while preserving full local source text and confirmed product facts", () => {
    const brand = cosmicBrand();
    const source = brand.sources.find(
      (item) => item.id === "cosmic-fact-solar-surge",
    )!;
    source.text = "untrusted external product context "
      .repeat(300)
      .slice(0, 8000);
    const original = source.text;
    const input = semanticRequest(christmasSampleBrief(brand), brand, {
      generousSpace: true,
      tone: "",
    });
    validatePlanRequest(input);
    const excerpt = input.references.find(
      (reference) => reference.id === source.id,
    )!.text;
    expect(excerpt).toHaveLength(externalReferenceTextLimit);
    expect(excerpt.endsWith(externalReferenceExcerptMarker)).toBe(true);
    expect(source.text).toBe(original);
    expect(source.text).toHaveLength(8000);
    expect(input.confirmedProducts[0].facts).toEqual(brand.products[0].facts);
    source.url = undefined;
    const supplied = semanticRequest(christmasSampleBrief(brand), brand, {
      generousSpace: true,
      tone: "",
    });
    expect(
      supplied.references.find((reference) => reference.id === source.id)!.text,
    ).toBe(original);
    expect(() => validatePlanRequest(supplied)).toThrow("invalid string");
  });

  it("imports generic pages as page context without fabricating products or successful image associations", () => {
    const result: BrandImport = {
      mode: "public-https-import",
      reviewRequired: true,
      images: [],
      failures: [],
      sources: [
        {
          id: "source-example",
          url: "https://example.org/",
          retrievedAt: "2026-10-03T23:30:21Z",
          title: "Example Domain",
          visibleText: "Public example page",
          colors: ["#eee", "#222"],
          products: [],
        },
      ],
    };
    const brand = importedBrand(result, "https://example.org/");
    expect(brand.products).toEqual([]);
    expect(brand.sources[0].role).toBe("page");
    expect(brand.palette).toEqual(["#eeeeee", "#222222"]);
    expect(brand.ownership).toBe("visitor-confirmed");
    expect(() =>
      importedBrand(
        {
          ...result,
          sources: [],
          failures: [
            {
              url: "https://example.org/",
              code: "source-blocked",
              message: "Import blocked",
            },
          ],
        },
        "https://example.org/",
      ),
    ).toThrow("No pages were imported");
  });
});
