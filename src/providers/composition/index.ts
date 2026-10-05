import type { CompositionRecipe, StudioVersion } from "../../domain/studio";

type Raster = NonNullable<StudioVersion["raster"]>;
export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}
export interface CompositionLayout {
  brand: Rect;
  headline: Rect;
  body: Rect;
  cta: Rect;
  photo: Rect;
  centered: boolean;
  artDirection: "scene-led" | "editorial";
  /** A design reserve, not a checked platform template or policy approval. */
  storyReserve?: {
    top: number;
    bottom: number;
    status: "illustrative-manual-check-required";
  };
}
export interface EncodingOptions {
  mime?: Raster["mime"];
  quality?: number;
}

const MAX_SIDE = 4096;
const MAX_PIXELS = 16_777_216;
const MAX_SOURCE_PIXELS = 24_000_000;
const MAX_SOURCE_BYTES = 10 * 1024 * 1024;
const MAX_OUTPUT_BYTES = 25 * 1024 * 1024;

export class CompositionError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "CompositionError";
  }
}

function fail(code: string, message: string): never {
  throw new CompositionError(code, message);
}
function abort(signal?: AbortSignal) {
  if (signal?.aborted)
    throw new DOMException("Photo composition was cancelled.", "AbortError");
}

export function validateCompositionRecipe(recipe: CompositionRecipe): void {
  if (recipe.version !== 1)
    fail(
      "RECIPE_VERSION",
      "This composition recipe is not supported. Recreate the plan.",
    );
  if (
    ![recipe.width, recipe.height].every(
      (v) => Number.isInteger(v) && v >= 64 && v <= MAX_SIDE,
    ) ||
    recipe.width * recipe.height > MAX_PIXELS
  )
    fail(
      "DIMENSIONS",
      "Choose whole-pixel dimensions from 64 to 4096, with no more than 16 megapixels.",
    );
  if (
    !Number.isFinite(recipe.spacing) ||
    recipe.spacing < 0 ||
    recipe.spacing > 1
  )
    fail(
      "SPACING",
      "Composition spacing must be between 0 and 1. Edit the composition before retrying.",
    );
  if (
    !recipe.productPhotos.length ||
    recipe.productPhotos.length > 4 ||
    recipe.productPhotos.length !== recipe.productIds.length
  )
    fail(
      "PRODUCT_PHOTOS",
      "Provide one approved product photo per selected product, for up to four products.",
    );
  if (
    !["festive", "cool", "editorial"].includes(recipe.mood) ||
    !["product-right", "product-center"].includes(recipe.composition) ||
    (recipe.artDirection !== undefined &&
      !["scene-led", "editorial"].includes(recipe.artDirection))
  )
    fail("STYLE", "Choose a supported composition mood and framing.");
  if (
    recipe.palette.length > 8 ||
    recipe.palette.some((color) => !/^#[\da-f]{6}$/i.test(color))
  )
    fail(
      "PALETTE",
      "Use up to eight six-digit hex colors for this composition.",
    );
  if (
    [recipe.headline, recipe.body, recipe.cta].some(
      (value) => typeof value !== "string" || value.length > 2000,
    )
  )
    fail(
      "TEXT_LENGTH",
      "Composition text must be plain text, with no more than 2,000 characters per field.",
    );
}

/** Full-frame containment: no cropping, stretching, repainting, or package-label overlay. */
export function containPhoto(
  width: number,
  height: number,
  bounds: Rect,
): Rect {
  if (!(width > 0 && height > 0 && bounds.width > 0 && bounds.height > 0))
    fail(
      "PHOTO_DIMENSIONS",
      "The approved photo has invalid dimensions. Upload a valid PNG or JPEG.",
    );
  const scale = Math.min(bounds.width / width, bounds.height / height);
  return {
    x: Math.max(bounds.x, bounds.x + (bounds.width - width * scale) / 2),
    y: Math.max(bounds.y, bounds.y + (bounds.height - height * scale) / 2),
    width: width * scale,
    height: height * scale,
  };
}

/** Aspect-specific art direction. Protected photographs and copy occupy separate areas. */
export function compositionLayout(
  recipe: CompositionRecipe,
): CompositionLayout {
  validateCompositionRecipe(recipe);
  const rect = (x: number, y: number, width: number, height: number): Rect => ({
    x: x * recipe.width,
    y: y * recipe.height,
    width: width * recipe.width,
    height: height * recipe.height,
  });
  const centered = recipe.composition === "product-center";
  const artDirection =
    recipe.artDirection || (centered ? "editorial" : "scene-led");
  const editorial = artDirection === "editorial";
  const ratio = recipe.width / recipe.height;
  let layout: CompositionLayout;
  if (ratio >= 1.35) {
    layout = editorial
      ? {
          centered,
          artDirection,
          brand: rect(0.56, 0.09, 0.38, 0.055),
          headline: rect(0.56, 0.22, 0.38, 0.35),
          body: rect(0.56, 0.64, 0.36, 0.15),
          cta: rect(0.56, 0.865, 0.28, 0.06),
          photo: rect(0.025, 0.04, 0.49, 0.92),
        }
      : {
          centered,
          artDirection,
          brand: rect(0.055, 0.1, 0.36, 0.06),
          headline: rect(0.055, 0.25, 0.365, 0.34),
          body: rect(0.055, 0.65, 0.34, 0.13),
          cta: rect(0.055, 0.86, 0.28, 0.07),
          photo: rect(0.47, 0, 0.53, 1),
        };
  } else if (ratio >= 0.85) {
    layout = {
      centered,
      artDirection,
      brand: rect(0.065, 0.035, 0.87, 0.04),
      headline: rect(0.065, 0.095, 0.87, 0.12),
      body: rect(0.065, 0.235, 0.87, 0.055),
      cta: rect(0.065, 0.94, 0.52, 0.04),
      photo: editorial
        ? rect(0.1, 0.325, 0.8, 0.585)
        : rect(0, 0.315, 1, 0.595),
    };
  } else {
    if (ratio <= 0.6) {
      layout = {
        centered,
        artDirection,
        brand: rect(0.075, 0.115, 0.85, 0.025),
        headline: rect(0.075, 0.165, 0.85, 0.085),
        body: rect(0.075, 0.8, 0.85, 0.04),
        cta: rect(0.075, 0.86, 0.55, 0.035),
        photo: editorial
          ? rect(0.06, 0.275, 0.88, 0.5)
          : rect(0, 0.27, 1, 0.51),
      };
      layout.storyReserve = {
        top: recipe.height * 0.1,
        bottom: recipe.height * 0.1,
        status: "illustrative-manual-check-required",
      };
    } else
      layout = editorial
        ? {
            centered,
            artDirection,
            brand: rect(0.075, 0.035, 0.85, 0.03),
            headline: rect(0.075, 0.095, 0.85, 0.12),
            body: rect(0.075, 0.87, 0.85, 0.045),
            cta: rect(0.075, 0.945, 0.55, 0.035),
            photo: rect(0.025, 0.235, 0.95, 0.61),
          }
        : {
            centered,
            artDirection,
            brand: rect(0.075, 0.7, 0.85, 0.025),
            headline: rect(0.075, 0.75, 0.85, 0.09),
            body: rect(0.075, 0.855, 0.85, 0.055),
            cta: rect(0.075, 0.94, 0.55, 0.035),
            photo: rect(0, 0, 1, 0.67),
          };
  }
  // Ads can be text-free: let the photograph carry the frame. Wide placements
  // use a soft-focus background derived only from the same original photograph.
  if (!recipe.textOverlay) {
    if (ratio >= 1.35)
      layout.photo = editorial
        ? rect(0.03, 0.065, 0.94, 0.87)
        : centered
          ? rect(0, 0, 1, 1)
          : rect(0.34, 0, 0.66, 1);
    else if (ratio >= 0.85)
      layout.photo = editorial
        ? rect(0.06, 0.04, 0.88, 0.88)
        : centered
          ? rect(0, 0, 1, 1)
          : rect(0.02, 0, 0.98, 1);
    else
      layout.photo = editorial
        ? rect(0.04, 0.055, 0.92, 0.89)
        : centered
          ? rect(0, 0, 1, 1)
          : rect(0.02, 0, 0.98, 1);
  }
  // Framing remains a real control within either art direction. A centered
  // scene gets a small, even breathing margin; editorial right framing shifts
  // the intact photo inside its separate photographic column.
  if (recipe.artDirection && recipe.textOverlay && centered && !editorial) {
    layout.photo.x += layout.photo.width * 0.025;
    layout.photo.y += layout.photo.height * 0.025;
    layout.photo.width *= 0.95;
    layout.photo.height *= 0.95;
  } else if (recipe.artDirection && !centered && editorial) {
    layout.photo.x += layout.photo.width * 0.02;
    layout.photo.width *= 0.98;
  }
  // Keep spacing useful without reducing a product scene to a tiny thumbnail.
  const insetX = layout.photo.width * recipe.spacing * 0.06;
  const insetY = layout.photo.height * recipe.spacing * 0.06;
  layout.photo = {
    x: layout.photo.x + insetX,
    y: layout.photo.y + insetY,
    width: layout.photo.width - 2 * insetX,
    height: layout.photo.height - 2 * insetY,
  };
  return layout;
}

export function photoSlots(bounds: Rect, count: number): Rect[] {
  if (!Number.isInteger(count) || count < 1 || count > 4)
    fail("PRODUCT_PHOTOS", "Choose one to four approved product photos.");
  const columns = count === 1 ? 1 : 2;
  const rows = Math.ceil(count / columns);
  const gap = Math.min(bounds.width, bounds.height) * 0.035;
  const width = (bounds.width - gap * (columns - 1)) / columns;
  const height = (bounds.height - gap * (rows - 1)) / rows;
  return Array.from({ length: count }, (_, i) => ({
    x: bounds.x + (i % columns) * (width + gap),
    y: bounds.y + Math.floor(i / columns) * (height + gap),
    width,
    height,
  }));
}

/** Rejects remote, active, credential-bearing, and ambiguous image sources before Image.src. */
export function normalizePhotoSource(
  source: string,
  baseUrl: string,
  assetBasePath = "/",
): string {
  if (source.startsWith("data:")) {
    inspectRaster(source, MAX_SOURCE_BYTES);
    return source;
  }
  let url: URL;
  try {
    const path = source.startsWith("/brand/")
      ? `${assetBasePath.replace(/\/$/, "")}${source}`
      : source;
    url = new URL(path, baseUrl);
  } catch {
    return fail(
      "PHOTO_SOURCE",
      "Use a bundled photo or an uploaded PNG/JPEG. This image URL is invalid.",
    );
  }
  const base = new URL(baseUrl);
  if (
    !["http:", "https:"].includes(url.protocol) ||
    url.origin !== base.origin ||
    url.username ||
    url.password
  )
    fail(
      "PHOTO_ORIGIN",
      "Remote photos must first be imported by the protected service or uploaded as PNG/JPEG. Composition never loads cross-origin photos.",
    );
  if (!/\.(?:png|jpe?g)$/i.test(url.pathname) || url.hash)
    fail(
      "PHOTO_FORMAT",
      "Use a bundled PNG/JPEG or upload a validated raster. SVG and active image sources are not supported.",
    );
  return url.href;
}

/** Actual encoded bytes and dimensions, rather than filename, SVG attributes, or canvas CSS. */
export function inspectRaster(
  dataUrl: string,
  byteLimit = MAX_OUTPUT_BYTES,
): Raster {
  const match =
    /^data:(image\/png|image\/jpeg);base64,([A-Za-z0-9+/]+={0,2})$/.exec(
      dataUrl,
    );
  if (!match || match[2].length > Math.ceil(byteLimit / 3) * 4 + 4)
    fail(
      "RASTER_FORMAT",
      "The raster is invalid or too large. Use a bounded PNG/JPEG upload.",
    );
  let binary: string;
  try {
    binary = atob(match[2]);
  } catch {
    return fail(
      "RASTER_FORMAT",
      "The image's base64 data is invalid. Upload the original PNG/JPEG again.",
    );
  }
  const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
  if (bytes.length > byteLimit)
    fail(
      "RASTER_BYTES",
      "The image exceeds the byte limit. Export a smaller image or use JPEG.",
    );
  const view = new DataView(bytes.buffer);
  let width = 0,
    height = 0;
  if (match[1] === "image/png") {
    const signature = [137, 80, 78, 71, 13, 10, 26, 10];
    if (
      bytes.length < 33 ||
      !signature.every((v, i) => bytes[i] === v) ||
      view.getUint32(8) !== 13 ||
      String.fromCharCode(...bytes.subarray(12, 16)) !== "IHDR"
    )
      fail(
        "RASTER_SIGNATURE",
        "PNG bytes do not match the declared image type. Upload a valid PNG or JPEG.",
      );
    width = view.getUint32(16);
    height = view.getUint32(20);
  } else {
    if (bytes.length < 4 || bytes[0] !== 255 || bytes[1] !== 216)
      fail(
        "RASTER_SIGNATURE",
        "JPEG bytes do not match the declared image type. Upload a valid PNG or JPEG.",
      );
    let offset = 2;
    const frames = new Set([
      0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce,
      0xcf,
    ]);
    while (offset + 4 <= bytes.length) {
      if (bytes[offset] !== 255) break;
      while (bytes[offset] === 255) offset++;
      const marker = bytes[offset++];
      if (marker === 0xd9 || marker === 0xda) break;
      if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
      if (offset + 2 > bytes.length) break;
      const length = view.getUint16(offset);
      if (length < 2 || offset + length > bytes.length) break;
      if (frames.has(marker) && length >= 8) {
        height = view.getUint16(offset + 3);
        width = view.getUint16(offset + 5);
        break;
      }
      offset += length;
    }
  }
  if (
    !width ||
    !height ||
    width > 12000 ||
    height > 12000 ||
    width * height > MAX_SOURCE_PIXELS
  )
    fail(
      "RASTER_DIMENSIONS",
      "The raster has invalid or excessive pixel dimensions. Upload a smaller valid PNG/JPEG.",
    );
  return {
    dataUrl,
    mime: match[1] as Raster["mime"],
    width,
    height,
    bytes: bytes.length,
  };
}

async function loadPhoto(
  source: string,
  signal?: AbortSignal,
): Promise<HTMLImageElement> {
  abort(signal);
  let url = normalizePhotoSource(
    source,
    window.location.href,
    import.meta.env.BASE_URL,
  );
  if (!url.startsWith("data:")) {
    // Image.src follows redirects. Fetch with redirect:error keeps a same-origin
    // asset from causing an external request or tainting the protected canvas.
    const controller = new AbortController();
    let timedOut = false;
    const cancelled = () => controller.abort();
    const timeout = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, 20_000);
    signal?.addEventListener("abort", cancelled, { once: true });
    try {
      const response = await fetch(url, {
        signal: controller.signal,
        redirect: "error",
        mode: "same-origin",
        credentials: "same-origin",
      });
      if (!response.ok)
        fail(
          "PHOTO_LOAD",
          "The approved photo is unavailable. Re-import or upload it, then retry.",
        );
      const mime = response.headers.get("content-type")?.split(";")[0].trim();
      if (mime !== "image/png" && mime !== "image/jpeg")
        fail(
          "PHOTO_FORMAT",
          "The approved photo must be served as a PNG or JPEG. Re-import or upload a validated raster.",
        );
      const declaredBytes = Number(response.headers.get("content-length"));
      if (declaredBytes > MAX_SOURCE_BYTES)
        fail(
          "PHOTO_BYTES",
          "The photo exceeds 10 MB. Upload a smaller approved PNG/JPEG.",
        );
      const reader = response.body?.getReader();
      if (!reader)
        fail(
          "PHOTO_LOAD",
          "The browser could not read this photo. Re-import or upload it, then retry.",
        );
      const chunks: Uint8Array[] = [];
      let total = 0;
      for (;;) {
        abort(signal);
        const { done, value } = await reader.read();
        if (done) break;
        total += value.byteLength;
        if (total > MAX_SOURCE_BYTES) {
          await reader.cancel();
          fail(
            "PHOTO_BYTES",
            "The photo exceeds 10 MB. Upload a smaller approved PNG/JPEG.",
          );
        }
        chunks.push(value);
      }
      const binary: string[] = [];
      for (const chunk of chunks)
        for (let i = 0; i < chunk.length; i += 16_384)
          binary.push(String.fromCharCode(...chunk.subarray(i, i + 16_384)));
      url = `data:${mime};base64,${btoa(binary.join(""))}`;
      inspectRaster(url, MAX_SOURCE_BYTES);
    } catch (error) {
      abort(signal);
      if (error instanceof CompositionError) throw error;
      fail(
        "PHOTO_LOAD",
        timedOut
          ? "The photo load timed out. Check the local connection or upload the approved PNG/JPEG, then retry."
          : "The photo could not be loaded safely. Redirects and external photos are blocked; re-import or upload the approved PNG/JPEG.",
      );
    } finally {
      clearTimeout(timeout);
      signal?.removeEventListener("abort", cancelled);
    }
  }
  return new Promise((resolve, reject) => {
    const photo = new Image();
    const cleanup = () => {
      photo.onload = null;
      photo.onerror = null;
      signal?.removeEventListener("abort", cancelled);
    };
    const cancelled = () => {
      cleanup();
      photo.src = "";
      reject(
        new DOMException("Photo composition was cancelled.", "AbortError"),
      );
    };
    photo.onload = () => {
      cleanup();
      if (
        photo.naturalWidth < 32 ||
        photo.naturalHeight < 32 ||
        photo.naturalWidth * photo.naturalHeight > MAX_SOURCE_PIXELS
      )
        reject(
          new CompositionError(
            "PHOTO_DIMENSIONS",
            "This photo is too small or too large. Upload a clear PNG/JPEG within the pixel limit.",
          ),
        );
      else resolve(photo);
    };
    photo.onerror = () => {
      cleanup();
      reject(
        new CompositionError(
          "PHOTO_LOAD",
          "The approved product photo could not be decoded. Re-import or upload a valid PNG/JPEG, then retry.",
        ),
      );
    };
    signal?.addEventListener("abort", cancelled, { once: true });
    photo.src = url;
  });
}

export function wrapText(
  text: string,
  maxWidth: number,
  measure: (text: string) => number,
): string[] {
  const lines: string[] = [];
  for (const paragraph of text.split(/\r?\n/)) {
    let line = "";
    for (const word of paragraph.trim().split(/\s+/).filter(Boolean)) {
      if (measure(word) > maxWidth) {
        if (line) {
          lines.push(line);
          line = "";
        }
        for (const character of Array.from(word)) {
          if (line && measure(line + character) > maxWidth) {
            lines.push(line);
            line = "";
          }
          line += character;
        }
      } else if (line && measure(`${line} ${word}`) > maxWidth) {
        lines.push(line);
        line = word;
      } else line = line ? `${line} ${word}` : word;
    }
    if (line) lines.push(line);
  }
  return lines;
}

function textBlock(
  ctx: CanvasRenderingContext2D,
  text: string,
  box: Rect,
  size: number,
  weight: number,
  color: string,
  centered = false,
  family = "Arial, sans-serif",
  leading = 1.2,
) {
  if (!text.trim()) return;
  const minimum = Math.max(4, size * 0.55);
  let lines: string[] = [];
  let fontSize = size;
  for (; fontSize >= minimum; fontSize -= Math.max(1, size * 0.025)) {
    ctx.font = `${weight} ${fontSize}px ${family}`;
    lines = wrapText(text, box.width, (value) => ctx.measureText(value).width);
    if (
      lines.length * fontSize * leading <= box.height &&
      lines.every((line) => ctx.measureText(line).width <= box.width)
    )
      break;
  }
  if (fontSize < minimum)
    fail(
      "TEXT_OVERFLOW",
      "The complete overlay text does not fit this placement. Shorten its copy, enlarge the canvas, or choose a text-free image; text was not truncated.",
    );
  ctx.fillStyle = color;
  ctx.textAlign = centered ? "center" : "left";
  ctx.textBaseline = "top";
  lines.forEach((line, i) =>
    ctx.fillText(
      line,
      centered ? box.x + box.width / 2 : box.x,
      box.y + i * fontSize * leading,
    ),
  );
}

function dark(color: string) {
  const rgb = [1, 3, 5]
    .map((i) => parseInt(color.slice(i, i + 2), 16) / 255)
    .map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722 < 0.32;
}

/** A soft-focus extension of the photo's own upper scene, never a new product or scene. */
function photographicSurround(
  ctx: CanvasRenderingContext2D,
  photo: HTMLImageElement,
  width: number,
  height: number,
  opacity: number,
) {
  const sourceHeight = photo.naturalHeight * 0.18;
  const bleed = Math.min(width, height) * 0.1;
  const scale = Math.max(
    (width + bleed * 2) / photo.naturalWidth,
    (height + bleed * 2) / sourceHeight,
  );
  const drawWidth = photo.naturalWidth * scale,
    drawHeight = sourceHeight * scale;
  ctx.save();
  ctx.globalAlpha = opacity;
  ctx.filter = `blur(${Math.min(width, height) * 0.045}px)`;
  ctx.drawImage(
    photo,
    0,
    0,
    photo.naturalWidth,
    sourceHeight,
    (width - drawWidth) / 2,
    (height - drawHeight) / 2,
    drawWidth,
    drawHeight,
  );
  ctx.restore();
}

function background(
  ctx: CanvasRenderingContext2D,
  recipe: CompositionRecipe,
  layout: CompositionLayout,
  photo: HTMLImageElement,
) {
  const w = recipe.width,
    h = recipe.height;
  const editorial = layout.artDirection === "editorial";
  const palette = recipe.palette.length
    ? recipe.palette
    : recipe.mood === "festive"
      ? ["#361b20", "#d3ad81", "#18392d", "#f8f1e6"]
      : recipe.mood === "cool"
        ? ["#e6f0ee", "#17463e", "#c9e1d5", "#f7faf5"]
        : ["#153c32", "#17483c", "#c8ddce", "#f5f1e8"];
  const base = editorial ? palette[3] || "#f5f1e8" : palette[0];
  const ink = dark(base) ? "#fff9ef" : "#17392f";
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, w, h);
  // Photographic material supports the intact foreground image. No drawn lights,
  // ornaments, vector shapes, made-up objects, or rectangular photo shadows.
  if (!editorial)
    photographicSurround(ctx, photo, w, h, recipe.textOverlay ? 0.17 : 0.68);
  if (editorial) {
    ctx.fillStyle = palette[2] || "#c8ddce";
    const strip = Math.min(w, h) * 0.012;
    ctx.fillRect(0, 0, w, strip);
    if (recipe.textOverlay && w / h >= 1.35) {
      ctx.fillStyle = ink;
      ctx.globalAlpha = 0.24;
      ctx.fillRect(w * 0.56, h * 0.175, w * 0.38, Math.max(1, h * 0.0012));
      ctx.globalAlpha = 1;
    }
  }
  return { ink, surface: base, ctaInk: ink };
}

/** Honest local photo composition; original photos stay protected full-frame layers. */
export async function renderComposition(
  recipe: CompositionRecipe,
  brandName: string,
  signal?: AbortSignal,
  options: EncodingOptions = {},
): Promise<Raster> {
  abort(signal);
  validateCompositionRecipe(recipe);
  if (typeof document === "undefined")
    fail(
      "BROWSER_REQUIRED",
      "Photo composition needs a browser canvas. Open the campaign in the browser to create its raster assets.",
    );
  const mime = options.mime || "image/png";
  if (
    !["image/png", "image/jpeg"].includes(mime) ||
    (options.quality !== undefined &&
      (!Number.isFinite(options.quality) ||
        options.quality < 0.1 ||
        options.quality > 1))
  )
    fail("ENCODING", "Choose PNG or JPEG, with JPEG quality from 0.1 to 1.");
  if (typeof brandName !== "string" || brandName.length > 200)
    fail("BRAND_NAME", "Use a brand name of no more than 200 characters.");
  // Validate the entire set before starting any loads, including a live background.
  for (const source of [
    ...recipe.productPhotos,
    ...(recipe.backgroundImage ? [recipe.backgroundImage] : []),
  ])
    normalizePhotoSource(
      source,
      window.location.href,
      import.meta.env.BASE_URL,
    );
  // Export and review use this same renderer after local fonts have settled.
  if (document.fonts) await document.fonts.ready;
  abort(signal);
  const photos: HTMLImageElement[] = [];
  for (const source of recipe.productPhotos) {
    photos.push(await loadPhoto(source, signal));
    abort(signal);
  }
  const scene = recipe.backgroundImage
    ? await loadPhoto(recipe.backgroundImage, signal)
    : undefined;
  abort(signal);
  const canvas = document.createElement("canvas");
  canvas.width = recipe.width;
  canvas.height = recipe.height;
  const ctx = canvas.getContext("2d");
  if (!ctx)
    fail(
      "CANVAS_UNAVAILABLE",
      "This browser could not create a canvas. Try a supported browser and retry.",
    );
  const layout = compositionLayout(recipe),
    colors = background(ctx, recipe, layout, photos[0]);
  if (scene) {
    const frame = containPhoto(scene.naturalWidth, scene.naturalHeight, {
      x: 0,
      y: 0,
      width: recipe.width,
      height: recipe.height,
    });
    ctx.drawImage(scene, frame.x, frame.y, frame.width, frame.height);
    // An opaque copy panel keeps text readable without touching protected photos.
    if (recipe.textOverlay) {
      ctx.fillStyle = colors.surface;
      ctx.fillRect(
        layout.headline.x - recipe.width * 0.012,
        layout.brand.y - recipe.height * 0.012,
        layout.headline.width + recipe.width * 0.024,
        layout.cta.y +
          layout.cta.height -
          layout.brand.y +
          recipe.height * 0.024,
      );
    }
  }
  const slots = photoSlots(layout.photo, photos.length);
  photos.forEach((photo, i) => {
    const frame = containPhoto(
      photo.naturalWidth,
      photo.naturalHeight,
      slots[i],
    );
    ctx.drawImage(photo, frame.x, frame.y, frame.width, frame.height);
  });
  if (recipe.textOverlay) {
    const unit = Math.min(recipe.width, recipe.height);
    const editorial = layout.artDirection === "editorial";
    const wide = recipe.width / recipe.height >= 1.35;
    const textCentered = layout.centered && !wide && !editorial;
    textBlock(
      ctx,
      brandName.toLocaleUpperCase(),
      layout.brand,
      unit * 0.021,
      500,
      colors.ink,
      textCentered,
    );
    textBlock(
      ctx,
      recipe.headline,
      layout.headline,
      unit * (wide ? 0.093 : 0.082),
      editorial ? 600 : 400,
      colors.ink,
      textCentered,
      editorial ? "Arial, sans-serif" : "Georgia, serif",
      1.06,
    );
    textBlock(
      ctx,
      recipe.body,
      layout.body,
      unit * 0.025,
      400,
      colors.ink,
      textCentered,
      "Arial, sans-serif",
      1.25,
    );
    if (recipe.cta.trim()) {
      textBlock(
        ctx,
        recipe.cta,
        layout.cta,
        Math.min(unit * 0.023, layout.cta.height * 0.64),
        600,
        colors.ctaInk,
        textCentered,
      );
      ctx.fillStyle = colors.ink;
      ctx.fillRect(
        layout.cta.x,
        layout.cta.y + layout.cta.height * 0.9,
        Math.min(layout.cta.width, unit * 0.18),
        Math.max(1, unit * 0.0015),
      );
    }
  }
  abort(signal);
  let dataUrl: string;
  try {
    dataUrl = canvas.toDataURL(mime, options.quality ?? 0.92);
  } catch {
    return fail(
      "CANVAS_EXPORT",
      "The browser could not export this canvas. Re-import the photo as an owned PNG/JPEG to remove cross-origin restrictions, then retry.",
    );
  }
  const raster = inspectRaster(dataUrl);
  if (
    raster.width !== recipe.width ||
    raster.height !== recipe.height ||
    raster.mime !== mime
  )
    fail(
      "OUTPUT_DIMENSIONS",
      "The browser's encoded raster does not match the requested dimensions or type. Recreate the asset in a supported browser.",
    );
  // Thumbnails resample this exact finished canvas, never a second layout.
  const preview = document.createElement("canvas");
  const previewScale = Math.min(1, 768 / Math.max(canvas.width, canvas.height));
  preview.width = Math.round(canvas.width * previewScale);
  preview.height = Math.round(canvas.height * previewScale);
  const previewContext = preview.getContext("2d");
  if (previewContext) {
    previewContext.imageSmoothingQuality = "high";
    previewContext.drawImage(canvas, 0, 0, preview.width, preview.height);
    raster.previewDataUrl = preview.toDataURL("image/jpeg", 0.78);
  }
  // Release backing stores promptly; placement runs are sequential.
  canvas.width = canvas.height = preview.width = preview.height = 1;
  abort(signal);
  return raster;
}
