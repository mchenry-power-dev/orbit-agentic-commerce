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
    !["product-right", "product-center"].includes(recipe.composition)
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
    x: bounds.x + (bounds.width - width * scale) / 2,
    y: bounds.y + (bounds.height - height * scale) / 2,
    width: width * scale,
    height: height * scale,
  };
}

/** Purposeful aspect-specific layout; the same family keeps its framing and palette. */
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
  const ratio = recipe.width / recipe.height;
  let layout: CompositionLayout;
  if (ratio >= 1.35) {
    layout = centered
      ? {
          centered,
          brand: rect(0.05, 0.065, 0.29, 0.075),
          headline: rect(0.05, 0.2, 0.29, 0.32),
          body: rect(0.05, 0.56, 0.28, 0.16),
          cta: rect(0.05, 0.8, 0.27, 0.09),
          photo: rect(0.36, 0.1, 0.49, 0.8),
        }
      : {
          centered,
          brand: rect(0.06, 0.065, 0.36, 0.075),
          headline: rect(0.06, 0.2, 0.36, 0.31),
          body: rect(0.06, 0.54, 0.36, 0.17),
          cta: rect(0.06, 0.79, 0.32, 0.09),
          photo: rect(0.5, 0.1, 0.44, 0.8),
        };
  } else if (ratio >= 0.85) {
    layout = centered
      ? {
          centered,
          brand: rect(0.15, 0.045, 0.7, 0.05),
          headline: rect(0.1, 0.12, 0.8, 0.12),
          body: rect(0.14, 0.81, 0.72, 0.075),
          cta: rect(0.25, 0.915, 0.5, 0.055),
          photo: rect(0.13, 0.3, 0.74, 0.47),
        }
      : {
          centered,
          brand: rect(0.07, 0.045, 0.75, 0.05),
          headline: rect(0.07, 0.12, 0.78, 0.17),
          body: rect(0.07, 0.31, 0.79, 0.08),
          cta: rect(0.07, 0.915, 0.5, 0.055),
          photo: rect(0.25, 0.43, 0.68, 0.44),
        };
  } else {
    layout = centered
      ? {
          centered,
          brand: rect(0.15, 0.115, 0.7, 0.035),
          headline: rect(0.1, 0.18, 0.8, 0.1),
          body: rect(0.13, 0.76, 0.74, 0.06),
          cta: rect(0.25, 0.845, 0.5, 0.045),
          photo: rect(0.11, 0.33, 0.78, 0.39),
        }
      : {
          centered,
          brand: rect(0.1, 0.115, 0.8, 0.035),
          headline: rect(0.1, 0.18, 0.8, 0.13),
          body: rect(0.1, 0.765, 0.8, 0.06),
          cta: rect(0.1, 0.845, 0.66, 0.045),
          photo: rect(0.24, 0.355, 0.66, 0.37),
        };
    if (ratio <= 0.6)
      layout.storyReserve = {
        top: recipe.height * 0.1,
        bottom: recipe.height * 0.1,
        status: "illustrative-manual-check-required",
      };
  }
  // Text-free ad artwork gets a larger protected photo rather than vacant copy
  // slots. Framing remains distinct; external ad copy stays outside this image.
  if (!recipe.textOverlay) {
    if (ratio >= 1.35)
      layout.photo = centered
        ? rect(0.18, 0.1, 0.64, 0.8)
        : rect(0.48, 0.1, 0.48, 0.8);
    else if (ratio >= 0.85)
      layout.photo = centered
        ? rect(0.15, 0.15, 0.7, 0.7)
        : rect(0.25, 0.22, 0.68, 0.68);
    else
      layout.photo = centered
        ? rect(0.1, 0.2, 0.8, 0.6)
        : rect(0.2, 0.23, 0.72, 0.56);
  }
  // The spacing preference enlarges the frame without changing product identity.
  const insetX = layout.photo.width * recipe.spacing * 0.4;
  const insetY = layout.photo.height * recipe.spacing * 0.4;
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
) {
  if (!text.trim()) return;
  const minimum = Math.max(4, size * 0.55);
  let lines: string[] = [];
  let fontSize = size;
  for (; fontSize >= minimum; fontSize -= Math.max(1, size * 0.025)) {
    ctx.font = `${weight} ${fontSize}px Arial, sans-serif`;
    lines = wrapText(text, box.width, (value) => ctx.measureText(value).width);
    if (
      lines.length * fontSize * 1.2 <= box.height &&
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
      box.y + i * fontSize * 1.2,
    ),
  );
}

function dark(color: string) {
  const rgb = [1, 3, 5]
    .map((i) => parseInt(color.slice(i, i + 2), 16) / 255)
    .map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722 < 0.32;
}

function background(
  ctx: CanvasRenderingContext2D,
  recipe: CompositionRecipe,
  layout: CompositionLayout,
) {
  const w = recipe.width,
    h = recipe.height,
    unit = Math.min(w, h);
  const defaultPalette =
    recipe.mood === "festive"
      ? ["#421218", "#f4bf54", "#116348", "#fff2d5"]
      : recipe.mood === "cool"
        ? ["#e5f4f7", "#164451", "#ffffff", "#60b7cb"]
        : ["#f4f1e9", "#173a42", "#cadacf", "#ffffff"];
  const palette = recipe.palette.length ? recipe.palette : defaultPalette;
  const base = palette[0],
    accent = palette[2] || palette[1] || defaultPalette[2];
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, w, h);
  ctx.save();
  ctx.globalAlpha = 0.28;
  ctx.fillStyle = accent;
  if (layout.centered) {
    ctx.beginPath();
    ctx.ellipse(
      layout.photo.x + layout.photo.width / 2,
      layout.photo.y + layout.photo.height / 2,
      layout.photo.width * 0.64,
      layout.photo.height * 0.67,
      0,
      0,
      Math.PI * 2,
    );
    ctx.fill();
  } else {
    ctx.beginPath();
    ctx.moveTo(w * 0.44, h);
    ctx.lineTo(w, h * 0.25);
    ctx.lineTo(w, h);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
  if (recipe.mood === "festive") {
    // Deliberately drawn light accents, not a generated photographic scene.
    const y = layout.storyReserve ? layout.storyReserve.top * 0.58 : h * 0.045;
    ctx.strokeStyle = "#b4893d";
    ctx.lineWidth = unit * 0.002;
    ctx.beginPath();
    ctx.moveTo(-w * 0.02, y);
    ctx.quadraticCurveTo(w * 0.5, y + unit * 0.06, w * 1.02, y);
    ctx.stroke();
    for (let i = 0; i < 14; i++) {
      const x = ((i + 0.5) * w) / 14,
        t = x / w,
        by = y + unit * 0.12 * t * (1 - t);
      const radius = unit * (0.0045 + (i % 3) * 0.001);
      const color = ["#f4bf54", "#ef6258", "#53ba84"][i % 3];
      ctx.save();
      ctx.fillStyle = color;
      ctx.shadowColor = color;
      ctx.shadowBlur = radius * 4;
      ctx.beginPath();
      ctx.arc(x, by + radius, radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
    ctx.strokeStyle = "#f4bf54";
    ctx.lineWidth = unit * 0.0018;
    ctx.strokeRect(w * 0.025, h * 0.025, w * 0.95, h * 0.95);
  } else if (recipe.mood === "cool") {
    ctx.save();
    ctx.globalAlpha = 0.35;
    ctx.strokeStyle = "#60b7cb";
    ctx.lineWidth = unit * 0.002;
    for (let i = 0; i < 3; i++) {
      ctx.beginPath();
      ctx.ellipse(
        w * 0.94,
        h * 0.82,
        w * (0.36 + i * 0.07),
        h * (0.32 + i * 0.05),
        -0.25,
        Math.PI,
        Math.PI * 2,
      );
      ctx.stroke();
    }
    ctx.restore();
  } else {
    ctx.save();
    ctx.globalAlpha = 0.35;
    ctx.strokeStyle = palette[1] || defaultPalette[1];
    ctx.lineWidth = unit * 0.0015;
    ctx.strokeRect(w * 0.025, h * 0.025, w * 0.95, h * 0.95);
    ctx.restore();
  }
  return {
    ink: dark(base) ? "#fff8e8" : "#112a31",
    ctaFill: dark(base) ? "#fff2d5" : "#173a42",
    ctaInk: dark(base) ? "#173a42" : "#fff8e8",
  };
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
    colors = background(ctx, recipe, layout);
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
      ctx.fillStyle = recipe.palette[0] || "#f4f1e9";
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
    ctx.save();
    ctx.fillStyle = "#ffffff";
    ctx.shadowColor = "#00000044";
    ctx.shadowBlur = Math.min(recipe.width, recipe.height) * 0.025;
    ctx.shadowOffsetY = recipe.height * 0.01;
    ctx.fillRect(frame.x, frame.y, frame.width, frame.height);
    ctx.restore();
    ctx.drawImage(photo, frame.x, frame.y, frame.width, frame.height);
  });
  if (recipe.textOverlay) {
    const unit = Math.min(recipe.width, recipe.height);
    textBlock(
      ctx,
      brandName.toLocaleUpperCase(),
      layout.brand,
      unit * 0.021,
      700,
      colors.ink,
      layout.centered && recipe.width / recipe.height < 1.35,
    );
    textBlock(
      ctx,
      recipe.headline,
      layout.headline,
      unit * 0.073,
      700,
      colors.ink,
      layout.centered && recipe.width / recipe.height < 1.35,
    );
    textBlock(
      ctx,
      recipe.body,
      layout.body,
      unit * 0.027,
      400,
      colors.ink,
      layout.centered && recipe.width / recipe.height < 1.35,
    );
    if (recipe.cta.trim()) {
      ctx.fillStyle = colors.ctaFill;
      ctx.beginPath();
      ctx.roundRect(
        layout.cta.x,
        layout.cta.y,
        layout.cta.width,
        layout.cta.height,
        unit * 0.008,
      );
      ctx.fill();
      const padding = layout.cta.height * 0.2;
      textBlock(
        ctx,
        recipe.cta,
        {
          x: layout.cta.x + padding,
          y: layout.cta.y + padding,
          width: layout.cta.width - padding * 2,
          height: layout.cta.height - padding * 2,
        },
        Math.min(unit * 0.026, layout.cta.height * 0.42),
        700,
        colors.ctaInk,
        true,
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
  abort(signal);
  return raster;
}
