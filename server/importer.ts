import { parse } from "parse5";
import type { DefaultTreeAdapterTypes as Tree } from "parse5";
import { createHash } from "node:crypto";
import type {
  BrandImport,
  ImportedProduct,
  ImportedSource,
} from "../src/domain/service";
import { ServiceError, publicFailure } from "./errors";
import { MAX_RASTER_BYTES, normalizeRaster } from "./raster";
import { PublicFetcher, publicUrl } from "./security";

export const importLimits = {
  pages: 3,
  images: 6,
  pageBytes: 2 * 1024 * 1024,
  robotsBytes: 64 * 1024,
  assetBytes: MAX_RASTER_BYTES,
  totalRasterBytes: 12 * 1024 * 1024,
  timeoutMs: 8_000,
  totalTimeoutMs: 30_000,
  domNodes: 50_000,
  domDepth: 64,
} as const;
const hash = (value: string) =>
  createHash("sha256").update(value).digest("hex").slice(0, 20);
const redactedUrl = (value: string): string => {
  try {
    const url = new URL(value);
    url.username = "";
    url.password = "";
    url.search = "";
    url.hash = "";
    return url.href.slice(0, 2048);
  } catch {
    return "[invalid URL]";
  }
};
const tidy = (value: string, max = 4000) =>
  value.replace(/\s+/g, " ").trim().slice(0, max);
const requirePublicPagePath = (url: URL): void => {
  let path = url.pathname;
  try {
    for (let pass = 0; pass < 2; pass++) path = decodeURIComponent(path);
  } catch {
    throw new ServiceError(
      "invalid-url",
      "The public source path has invalid encoding.",
    );
  }
  if (
    /\/(?:accounts?|carts?|checkouts?|orders?|login|log-in|signin|sign-in|admin|wp-admin)(?:\/|$)/i.test(
      path,
    )
  )
    throw new ServiceError(
      "restricted-page",
      "Account, cart, checkout and authenticated pages are not imported.",
    );
};
const text = (node: Tree.Node): string =>
  "value" in node && node.nodeName === "#text"
    ? String(node.value)
    : "childNodes" in node
      ? node.childNodes.map(text).join(" ")
      : "";
type Element = Tree.Element;
const attribute = (node: Element, name: string) =>
  node.attrs.find((item) => item.name === name)?.value;
const childElements = (node: Tree.Node): Element[] => {
  const result: Element[] = [];
  const pending = [{ node, depth: 0 }];
  let visited = 0;
  while (pending.length) {
    const current = pending.pop()!;
    if (
      ++visited > importLimits.domNodes ||
      current.depth > importLimits.domDepth
    )
      throw new ServiceError(
        "page-complexity",
        "The source exceeds bounded document complexity. Use paste/upload fallback.",
        422,
      );
    if ("tagName" in current.node) result.push(current.node);
    if ("childNodes" in current.node)
      for (let index = current.node.childNodes.length - 1; index >= 0; index--)
        pending.push({
          node: current.node.childNodes[index],
          depth: current.depth + 1,
        });
  }
  return result;
};
const excludedElement = (node: Element) =>
  [
    "script",
    "style",
    "noscript",
    "template",
    "svg",
    "iframe",
    "object",
    "embed",
    "form",
    "input",
    "button",
    "nav",
    "footer",
  ].includes(node.tagName) ||
  attribute(node, "hidden") !== undefined ||
  attribute(node, "aria-hidden") === "true" ||
  /display\s*:\s*none|visibility\s*:\s*hidden/i.test(
    attribute(node, "style") ?? "",
  ) ||
  /review|rating|account|cart|checkout|customer/i.test(
    `${attribute(node, "id") ?? ""} ${attribute(node, "class") ?? ""}`,
  );
const imageInExcludedContent = (node: Element) => {
  let current: Tree.Node | null = node;
  while (current) {
    if ("tagName" in current && excludedElement(current)) return true;
    current = "parentNode" in current ? current.parentNode : null;
  }
  return false;
};
function structuredProducts(
  value: unknown,
  output: ImportedProduct[],
  images: string[],
  depth = 0,
): void {
  if (depth > 12 || output.length >= 4) return;
  if (Array.isArray(value)) {
    for (const item of value.slice(0, 30))
      structuredProducts(item, output, images, depth + 1);
    return;
  }
  if (!value || typeof value !== "object") return;
  const record = value as Record<string, unknown>,
    types = Array.isArray(record["@type"])
      ? record["@type"]
      : [record["@type"]];
  if (types.includes("Product") && typeof record.name === "string") {
    const offers = Array.isArray(record.offers)
      ? record.offers[0]
      : record.offers;
    const offer =
      offers && typeof offers === "object"
        ? (offers as Record<string, unknown>)
        : {};
    const facts = ["size", "weight", "material", "color"].flatMap((key) =>
      typeof record[key] === "string"
        ? [`${key}: ${tidy(record[key] as string, 250)}`]
        : [],
    );
    output.push({
      name: tidy(record.name, 160),
      description:
        typeof record.description === "string"
          ? tidy(record.description.replace(/<[^>]*>/g, " "), 1000)
          : "",
      facts,
      sku: typeof record.sku === "string" ? tidy(record.sku, 100) : null,
      price:
        typeof offer.price === "string" || typeof offer.price === "number"
          ? /^\d+(?:\.\d{1,2})?$/.test(String(offer.price))
            ? String(offer.price)
            : null
          : null,
      currency:
        typeof offer.priceCurrency === "string" &&
        /^[A-Z]{3}$/.test(offer.priceCurrency)
          ? offer.priceCurrency
          : null,
      confirmed: false,
    });
    for (const image of (Array.isArray(record.image)
      ? record.image
      : [record.image]
    ).slice(0, 4))
      if (typeof image === "string") images.push(image);
      else if (
        image &&
        typeof image === "object" &&
        typeof (image as Record<string, unknown>).url === "string"
      )
        images.push((image as { url: string }).url);
  }
  if (record["@graph"])
    structuredProducts(record["@graph"], output, images, depth + 1);
  if (record.mainEntity)
    structuredProducts(record.mainEntity, output, images, depth + 1);
}
export function extractPage(html: string): {
  title: string;
  visibleText: string;
  colors: string[];
  products: ImportedProduct[];
  imageUrls: string[];
} {
  const document = parse(html, { scriptingEnabled: false });
  const elements = childElements(document);
  const products: ImportedProduct[] = [],
    imageUrls: string[] = [],
    colors: string[] = [];
  for (const node of elements) {
    if (
      node.tagName === "script" &&
      attribute(node, "type")?.toLowerCase() === "application/ld+json"
    ) {
      const raw = text(node);
      if (raw.length <= 64 * 1024)
        try {
          structuredProducts(JSON.parse(raw), products, imageUrls);
        } catch {
          /* malformed structured data is not interpreted */
        }
    }
    if (
      node.tagName === "meta" &&
      ["og:image", "twitter:image"].includes(
        attribute(node, "property") ?? attribute(node, "name") ?? "",
      )
    ) {
      const image = attribute(node, "content");
      if (image) imageUrls.push(image);
    }
    if (node.tagName === "img" && !imageInExcludedContent(node)) {
      const image = attribute(node, "src") ?? attribute(node, "data-src");
      if (image) imageUrls.push(image);
    }
    if (node.tagName === "style")
      colors.push(
        ...(text(node).match(/#[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{3}\b/g) ?? []),
      );
    const inline = attribute(node, "style");
    if (inline)
      colors.push(
        ...(inline.match(/#[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{3}\b/g) ?? []),
      );
  }
  const visible = (node: Tree.Node): string => {
    if ("tagName" in node) {
      if (node.tagName === "head" || excludedElement(node)) return "";
    }
    return "value" in node && node.nodeName === "#text"
      ? String(node.value)
      : "childNodes" in node
        ? node.childNodes.map(visible).join(" ")
        : "";
  };
  const title = tidy(
    text(
      elements.find((node) => node.tagName === "h1") ??
        elements.find((node) => node.tagName === "title") ??
        document,
    ),
    200,
  );
  return {
    title,
    visibleText: tidy(visible(document), 8000),
    colors: [...new Set(colors.map((color) => color.toLowerCase()))].slice(
      0,
      8,
    ),
    products,
    imageUrls: [...new Set(imageUrls)].slice(0, 12),
  };
}
/** Conservative wildcard robots rules. An explicit disallow blocks import; no crawling is performed. */
export function robotsAllowed(body: string, path: string): boolean {
  let applies = false,
    hadRules = false;
  const rules: { path: string; allow: boolean }[] = [];
  for (const raw of body.split(/\r?\n/)) {
    const line = raw.split("#")[0].trim(),
      colon = line.indexOf(":");
    if (colon < 0) continue;
    const key = line.slice(0, colon).trim().toLowerCase(),
      value = line.slice(colon + 1).trim();
    if (key === "user-agent") {
      if (hadRules) {
        applies = false;
        hadRules = false;
      }
      applies ||= value === "*" || /orbitpublicreference/i.test(value);
    } else if (key === "disallow" || key === "allow") {
      hadRules = true;
      if (applies && value) {
        const prefix = value.split("*")[0].replace(/\$$/, "");
        if (path.startsWith(prefix))
          rules.push({ path: prefix, allow: key === "allow" });
      }
    }
  }
  rules.sort(
    (a, b) =>
      b.path.length - a.path.length || Number(b.allow) - Number(a.allow),
  );
  return !rules.length || rules[0].allow;
}
export class PublicImporter {
  constructor(
    private readonly fetcher = new PublicFetcher(),
    private readonly clock = () => new Date(),
  ) {}
  async import(urls: string[], signal: AbortSignal): Promise<BrandImport> {
    if (!urls.length || urls.length > importLimits.pages)
      throw new ServiceError(
        "page-count",
        "Import one to three explicitly selected public pages.",
      );
    const result: BrandImport = {
      mode: "public-https-import",
      sources: [],
      images: [],
      failures: [],
      reviewRequired: true,
    };
    const seenImages = new Set<string>();
    let totalBytes = 0;
    const combined = AbortSignal.any([
      signal,
      AbortSignal.timeout(importLimits.totalTimeoutMs),
    ]);
    const robotsByOrigin = new Map<string, { status: number; body: string }>();
    const requireAllowedPage = async (url: URL): Promise<void> => {
      requirePublicPagePath(url);
      let rules = robotsByOrigin.get(url.origin);
      if (!rules) {
        const robots = await this.fetcher.get(
          new URL("/robots.txt", url).href,
          {
            maxBytes: importLimits.robotsBytes,
            timeoutMs: importLimits.timeoutMs,
            signal: combined,
            beforeRequest: async (target) => requirePublicPagePath(target),
          },
        );
        if (
          (robots.status !== 200 && robots.status !== 404) ||
          (robots.status === 200 &&
            !/^text\/plain\b/i.test(robots.headers["content-type"] ?? ""))
        )
          throw new ServiceError(
            "site-restriction",
            "The site access rules could not be established. Use paste/upload fallback.",
            422,
          );
        rules = {
          status: robots.status,
          body: Buffer.from(robots.bytes).toString("utf8"),
        };
        robotsByOrigin.set(url.origin, rules);
      }
      if (
        rules.status === 200 &&
        !robotsAllowed(rules.body, url.pathname + url.search)
      )
        throw new ServiceError(
          "site-restriction",
          "The site restricts automated access to this page. Use paste/upload fallback.",
          422,
        );
    };
    for (const input of [...new Set(urls)]) {
      try {
        const url = publicUrl(input);
        const page = await this.fetcher.get(url.href, {
          maxBytes: importLimits.pageBytes,
          timeoutMs: importLimits.timeoutMs,
          signal: combined,
          beforeRequest: requireAllowedPage,
        });
        if (page.status !== 200)
          throw new ServiceError(
            "source-blocked",
            `The source returned HTTP ${page.status}; no successful import is reported.`,
            422,
          );
        if (
          !/^text\/html\b|^application\/xhtml\+xml\b/i.test(
            page.headers["content-type"] ?? "",
          )
        )
          throw new ServiceError(
            "page-type",
            "The page is not an HTML document. Use owned raster upload for images.",
          );
        const html = Buffer.from(page.bytes).toString("utf8"),
          extracted = extractPage(html);
        if (
          /cf-chl-|challenge-platform/i.test(html) ||
          /just a moment|access denied|verify.*human|checking your browser/i.test(
            extracted.title,
          )
        )
          throw new ServiceError(
            "site-restriction",
            "The source presents an access challenge. No challenge is bypassed; use paste/upload fallback.",
            422,
          );
        if (!extracted.visibleText && !extracted.products.length)
          throw new ServiceError(
            "no-content",
            "No relevant public product or visible page content was found. Paste confirmed facts instead.",
            422,
          );
        const source: ImportedSource = {
          id: `source-${hash(page.url)}`,
          url: page.url,
          retrievedAt: this.clock().toISOString(),
          title: extracted.title,
          visibleText: extracted.visibleText,
          colors: extracted.colors,
          products: extracted.products,
        };
        if (result.sources.some((existing) => existing.id === source.id))
          continue;
        result.sources.push(source);
        for (const candidate of extracted.imageUrls) {
          if (
            result.images.length >= importLimits.images ||
            totalBytes >= importLimits.totalRasterBytes
          )
            break;
          let imageUrl = candidate;
          try {
            imageUrl = publicUrl(new URL(candidate, page.url).href).href;
            if (seenImages.has(imageUrl)) continue;
            seenImages.add(imageUrl);
            const image = await this.fetcher.get(imageUrl, {
              maxBytes: importLimits.assetBytes,
              timeoutMs: importLimits.timeoutMs,
              signal: combined,
              beforeRequest: async (target) => requirePublicPagePath(target),
            });
            if (image.status !== 200)
              throw new ServiceError(
                "image-blocked",
                `Image returned HTTP ${image.status}.`,
                422,
              );
            const raster = await normalizeRaster(
              image.bytes,
              image.headers["content-type"] ?? "",
            );
            if (
              result.images.some((existing) => existing.sourceUrl === image.url)
            )
              continue;
            if (totalBytes + raster.byteLength > importLimits.totalRasterBytes)
              throw new ServiceError(
                "total-image-size",
                "The packet exceeds the total image-byte limit.",
                413,
              );
            totalBytes += raster.byteLength;
            result.images.push({
              ...raster,
              id: `image-${hash(image.url)}`,
              sourceId: source.id,
              sourceUrl: image.url,
              sha256: createHash("sha256")
                .update(Buffer.from(raster.base64, "base64"))
                .digest("hex"),
            });
          } catch (error) {
            const failure = publicFailure(error);
            result.failures.push({
              url: redactedUrl(imageUrl),
              code: failure.code,
              message: failure.message,
            });
          }
        }
      } catch (error) {
        const failure = publicFailure(error);
        result.failures.push({
          url: redactedUrl(input),
          code: failure.code,
          message: failure.message,
        });
      }
      if (combined.aborted) break;
    }
    return result;
  }
}
