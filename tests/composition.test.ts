import { describe, expect, it } from "vitest";
import type { CompositionRecipe } from "../src/domain/studio";
import {
  compositionLayout,
  containPhoto,
  inspectRaster,
  normalizePhotoSource,
  photoSlots,
  renderComposition,
  validateCompositionRecipe,
  wrapText,
} from "../src/providers/composition";

const recipe = (
  changes: Partial<CompositionRecipe> = {},
): CompositionRecipe => ({
  version: 1,
  directionId: "family-one",
  placementId: "google-square",
  width: 1080,
  height: 1080,
  productIds: ["product-one"],
  productPhotos: ["/brand/cosmic-cat/solar-surge.png"],
  palette: ["#e5f4f7", "#164451", "#ffffff", "#60b7cb"],
  mood: "cool",
  composition: "product-right",
  headline: "A Fresh Coffee Moment",
  body: "Clear space for your next coffee ritual.",
  cta: "Shop Coffee",
  textOverlay: true,
  spacing: 0.8,
  ...changes,
});
const overlaps = (
  a: { x: number; y: number; width: number; height: number },
  b: { x: number; y: number; width: number; height: number },
) =>
  a.x < b.x + b.width &&
  a.x + a.width > b.x &&
  a.y < b.y + b.height &&
  a.y + a.height > b.y;

describe("protected photo composition geometry", () => {
  it.each([
    [1200, 628],
    [1080, 1080],
    [1080, 1350],
    [1080, 1920],
    [1600, 900],
    [900, 1200],
    [1200, 600],
    [64, 64],
  ])(
    "keeps all content inside %ix%i and overlay text clear of photos",
    (width, height) => {
      for (const artDirection of ["scene-led", "editorial"] as const)
        for (const composition of [
          "product-right",
          "product-center",
        ] as const) {
          const layout = compositionLayout(
            recipe({ width, height, composition, artDirection }),
          );
          for (const box of [
            layout.brand,
            layout.headline,
            layout.body,
            layout.cta,
            layout.photo,
          ]) {
            expect(box.x).toBeGreaterThanOrEqual(0);
            expect(box.y).toBeGreaterThanOrEqual(0);
            expect(box.x + box.width).toBeLessThanOrEqual(width);
            expect(box.y + box.height).toBeLessThanOrEqual(height);
          }
          for (const box of [
            layout.brand,
            layout.headline,
            layout.body,
            layout.cta,
          ])
            expect(overlaps(box, layout.photo)).toBe(false);
          for (const count of [1, 2, 3, 4])
            for (const slot of photoSlots(layout.photo, count)) {
              const photo = containPhoto(1200, 800, slot);
              expect(photo.width / photo.height).toBeCloseTo(1.5, 10);
              expect(photo.x).toBeGreaterThanOrEqual(slot.x);
              expect(photo.y).toBeGreaterThanOrEqual(slot.y);
              expect(photo.x + photo.width).toBeLessThanOrEqual(
                slot.x + slot.width + 1e-8,
              );
              expect(photo.y + photo.height).toBeLessThanOrEqual(
                slot.y + slot.height + 1e-8,
              );
            }
        }
    },
  );
  it("has distinct family framing and labels portrait design reserves honestly", () => {
    const right = compositionLayout(recipe({ width: 1080, height: 1920 }));
    const center = compositionLayout(
      recipe({ width: 1080, height: 1920, composition: "product-center" }),
    );
    expect(right.photo).not.toEqual(center.photo);
    expect(center.storyReserve?.status).toBe(
      "illustrative-manual-check-required",
    );
    expect(center.brand.y).toBeGreaterThan(center.storyReserve!.top);
    expect(center.cta.y + center.cta.height).toBeLessThan(
      1920 - center.storyReserve!.bottom,
    );
  });
  it("uses more of a text-free ad canvas for the protected photo", () => {
    const textFree = compositionLayout(recipe({ textOverlay: false }));
    const overlaid = compositionLayout(recipe());
    expect(textFree.photo.width * textFree.photo.height).toBeGreaterThan(
      overlaid.photo.width * overlaid.photo.height * 1.4,
    );
    const center = compositionLayout(
      recipe({ textOverlay: false, composition: "product-center" }),
    );
    expect(center.photo.x + center.photo.width / 2).toBeCloseTo(540);
    expect(textFree.photo.x + textFree.photo.width / 2).toBeGreaterThan(540);
  });
  it("adapts the reading order across art directions and wide/mobile heroes", () => {
    const warmWide = compositionLayout(
      recipe({ width: 1600, height: 900, artDirection: "scene-led" }),
    );
    const editWide = compositionLayout(
      recipe({ width: 1600, height: 900, artDirection: "editorial" }),
    );
    expect(warmWide.photo.x).toBeGreaterThan(
      warmWide.headline.x + warmWide.headline.width,
    );
    expect(editWide.photo.x + editWide.photo.width).toBeLessThan(
      editWide.headline.x,
    );
    const warmMobile = compositionLayout(
      recipe({ width: 900, height: 1200, artDirection: "scene-led" }),
    );
    const editMobile = compositionLayout(
      recipe({ width: 900, height: 1200, artDirection: "editorial" }),
    );
    expect(warmMobile.photo.y + warmMobile.photo.height).toBeLessThan(
      warmMobile.headline.y,
    );
    expect(editMobile.headline.y + editMobile.headline.height).toBeLessThan(
      editMobile.photo.y,
    );
    for (const artDirection of ["scene-led", "editorial"] as const) {
      const photo = compositionLayout(
        recipe({ artDirection, textOverlay: false, spacing: 0.12 }),
      ).photo;
      expect(photo.width * photo.height).toBeGreaterThan(1080 * 1080 * 0.73);
      const right = compositionLayout(
        recipe({ artDirection, composition: "product-right" }),
      ).photo;
      const center = compositionLayout(
        recipe({ artDirection, composition: "product-center" }),
      ).photo;
      expect(right).not.toEqual(center);
    }
  });
  it("rejects excessive dimensions, unsupported palette, and mismatched protected products", () => {
    expect(() => validateCompositionRecipe(recipe({ width: 5000 }))).toThrow(
      /dimensions/i,
    );
    expect(() => validateCompositionRecipe(recipe({ height: 3.5 }))).toThrow(
      /dimensions/i,
    );
    expect(() => validateCompositionRecipe(recipe({ productIds: [] }))).toThrow(
      /one approved/i,
    );
    expect(() =>
      validateCompositionRecipe(
        recipe({ palette: ["url(https://example.com)"] }),
      ),
    ).toThrow(/hex/i);
    expect(() => validateCompositionRecipe(recipe({ spacing: NaN }))).toThrow(
      /spacing/i,
    );
  });
});

describe("raster source and output checks", () => {
  // Header construction only tests the byte/dimension parser. Browser tests decode real files.
  const pngHeader = (width: number, height: number) => {
    const bytes = new Uint8Array(33);
    bytes.set([137, 80, 78, 71, 13, 10, 26, 10]);
    const view = new DataView(bytes.buffer);
    view.setUint32(8, 13);
    bytes.set([73, 72, 68, 82], 12);
    view.setUint32(16, width);
    view.setUint32(20, height);
    return `data:image/png;base64,${Buffer.from(bytes).toString("base64")}`;
  };
  it("resolves bundled brand photos under a nested public base", () => {
    expect(
      normalizePhotoSource(
        "/brand/cosmic-cat/solar-surge.png",
        "https://example.com/orbit-agentic-commerce/",
        "/orbit-agentic-commerce/",
      ),
    ).toBe(
      "https://example.com/orbit-agentic-commerce/brand/cosmic-cat/solar-surge.png",
    );
  });
  it.each([
    "https://foreign.example/product.png",
    "https://user:secret@example.com/product.png",
    "//foreign.example/product.jpg",
    "data:image/svg+xml;base64,PHN2Zz4=",
    "javascript:alert(1)",
    "/brand/product.svg",
    "blob:https://example.com/a",
    "/photo.png#active",
  ])("rejects %s before loading a canvas source", (source) => {
    expect(() =>
      normalizePhotoSource(source, "https://example.com/"),
    ).toThrow();
  });
  it("checks PNG byte signature and real encoded dimensions", () => {
    const dataUrl = pngHeader(1080, 1920);
    expect(inspectRaster(dataUrl)).toMatchObject({
      mime: "image/png",
      width: 1080,
      height: 1920,
      bytes: 33,
    });
    expect(normalizePhotoSource(dataUrl, "https://example.com/")).toBe(dataUrl);
    expect(() => inspectRaster("data:image/png;base64,PHN2Zz4=")).toThrow(
      /PNG bytes/i,
    );
    expect(() => inspectRaster(pngHeader(30000, 30000))).toThrow(
      /pixel dimensions/i,
    );
    expect(() => inspectRaster(dataUrl, 4)).toThrow(/large/i);
  });
  it("checks JPEG frame dimensions and rejects mislabeled data", () => {
    const bytes = Buffer.from([
      255, 216, 255, 192, 0, 8, 8, 2, 88, 4, 176, 1, 255, 217,
    ]);
    expect(
      inspectRaster(`data:image/jpeg;base64,${bytes.toString("base64")}`),
    ).toMatchObject({
      mime: "image/jpeg",
      width: 1200,
      height: 600,
      bytes: 14,
    });
    expect(() =>
      inspectRaster(pngHeader(1080, 1080).replace("image/png", "image/jpeg")),
    ).toThrow(/JPEG bytes/i);
  });
  it("preserves words and complete long tokens without silent truncation", () => {
    const measure = (value: string) => Array.from(value).length;
    const input = "Fresh coffee moments and unusuallylongwords";
    const lines = wrapText(input, 12, measure);
    expect(lines.every((line) => measure(line) <= 12)).toBe(true);
    expect(lines.join("").replaceAll(" ", "")).toBe(input.replaceAll(" ", ""));
  });
  it("honors cancellation before browser setup and reports browser-only work honestly", async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(
      renderComposition(recipe(), "Test Brand", controller.signal),
    ).rejects.toMatchObject({ name: "AbortError" });
    await expect(renderComposition(recipe(), "Test Brand")).rejects.toThrow(
      /browser canvas/i,
    );
  });
});
