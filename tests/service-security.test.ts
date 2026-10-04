import { describe, expect, it, vi } from "vitest";
import sharp from "sharp";
import { extractPage, PublicImporter, robotsAllowed } from "../server/importer";
import { normalizeRaster } from "../server/raster";
import { isPublicAddress, publicUrl, PublicFetcher } from "../server/security";
import type { Transport } from "../server/security";
const resolver = async () => [{ address: "8.8.8.8", family: 4 }];
const response = (
  body: string | Uint8Array,
  status = 200,
  type = "text/html",
  headers: Record<string, string> = {},
) => ({
  status,
  headers: { "content-type": type, ...headers },
  bytes: typeof body === "string" ? Buffer.from(body) : body,
});
const signal = () => new AbortController().signal;
const png = () =>
  sharp({
    create: { width: 32, height: 48, channels: 3, background: "#6043b5" },
  })
    .png()
    .toBuffer();
describe("public import SSRF and bounded transport", () => {
  it("rejects loopback/private/metadata/local credentials and nonHTTPS URL forms", () => {
    for (const url of [
      "http://store.test/",
      "https://user:password@store.test/",
      "https://127.0.0.1/",
      "https://2130706433/",
      "https://10.0.0.1/",
      "https://[::1]/",
      "https://[fd00:ec2::254]/",
      "https://metadata.google.internal/",
      "https://store.test:8443/",
      "https://store.test/?api_key=hidden",
    ])
      expect(() => publicUrl(url)).toThrow();
    expect(
      publicUrl(
        "https://store.test/product?utm_source=tracker&utm_campaign=secret&gclid=id&variant=one#detail",
      ).href,
    ).toBe("https://store.test/product?variant=one");
  });
  it("rejects reserved and tunnel address ranges while accepting public global addresses", () => {
    for (const ip of [
      "0.1.2.3",
      "100.100.100.200",
      "169.254.169.254",
      "172.16.1.2",
      "192.168.1.2",
      "192.88.99.1",
      "198.18.0.1",
      "192.0.2.1",
      "203.0.113.4",
      "224.1.2.3",
      "::ffff:127.0.0.1",
      "2001:db8::1",
      "2001:0db8:0:0::1",
      "2002:0a00:0001::",
      "3fff::1",
      "fe80::1",
    ])
      expect(isPublicAddress(ip)).toBe(false);
    expect(isPublicAddress("8.8.8.8")).toBe(true);
    expect(isPublicAddress("2606:4700:4700::1111")).toBe(true);
  });
  it("rejects mixed public/private DNS answers before any outbound transport", async () => {
    const transport = vi.fn();
    const fetcher = new PublicFetcher(
      async () => [
        { address: "8.8.8.8", family: 4 },
        { address: "127.0.0.1", family: 4 },
      ],
      transport,
    );
    await expect(
      fetcher.get("https://store.test/", {
        maxBytes: 100,
        timeoutMs: 100,
        signal: signal(),
      }),
    ).rejects.toThrow("ineligible");
    expect(transport).not.toHaveBeenCalled();
  });
  it("pins each validated address and revalidates same-host redirect DNS to stop rebinding", async () => {
    const dns = vi
      .fn()
      .mockResolvedValueOnce([{ address: "8.8.8.8", family: 4 }])
      .mockResolvedValueOnce([{ address: "10.0.0.1", family: 4 }]);
    const transport = vi
      .fn<Transport>()
      .mockResolvedValue(response("", 302, "text/html", { location: "/next" }));
    const fetcher = new PublicFetcher(dns, transport);
    await expect(
      fetcher.get("https://store.test/", {
        maxBytes: 100,
        timeoutMs: 1000,
        signal: signal(),
      }),
    ).rejects.toThrow("ineligible");
    expect(transport).toHaveBeenCalledTimes(1);
    expect(transport.mock.calls[0][0].address.address).toBe("8.8.8.8");
    expect(dns).toHaveBeenCalledTimes(2);
  });
  it("revalidates redirect targets and limits public redirect chains", async () => {
    const unsafe = vi.fn<Transport>().mockResolvedValue(
      response("", 302, "text/html", {
        location: "https://169.254.169.254/latest/meta-data",
      }),
    );
    await expect(
      new PublicFetcher(resolver, unsafe).get("https://store.test/", {
        maxBytes: 100,
        timeoutMs: 1000,
        signal: signal(),
      }),
    ).rejects.toThrow("not an eligible");
    expect(unsafe).toHaveBeenCalledTimes(1);
    const chain = vi
      .fn<Transport>()
      .mockResolvedValue(response("", 302, "text/html", { location: "/next" }));
    await expect(
      new PublicFetcher(resolver, chain).get("https://store.test/", {
        maxBytes: 100,
        timeoutMs: 1000,
        signal: signal(),
        maxRedirects: 2,
      }),
    ).rejects.toThrow("redirect limit");
    expect(chain).toHaveBeenCalledTimes(3);
  });
  it("bounds DNS, transport, response bytes and cancellation without private probes", async () => {
    await expect(
      new PublicFetcher(() => new Promise(() => {}), vi.fn()).get(
        "https://store.test/",
        { maxBytes: 100, timeoutMs: 10, signal: signal() },
      ),
    ).rejects.toThrow("timed out");
    await expect(
      new PublicFetcher(resolver, () => new Promise(() => {})).get(
        "https://store.test/",
        { maxBytes: 100, timeoutMs: 10, signal: signal() },
      ),
    ).rejects.toThrow("timed out");
    await expect(
      new PublicFetcher(resolver, async () => response("x".repeat(101))).get(
        "https://store.test/",
        { maxBytes: 100, timeoutMs: 100, signal: signal() },
      ),
    ).rejects.toThrow("size limit");
    const controller = new AbortController();
    controller.abort();
    await expect(
      new PublicFetcher(resolver, vi.fn()).get("https://store.test/", {
        maxBytes: 100,
        timeoutMs: 100,
        signal: controller.signal,
      }),
    ).rejects.toThrow("cancelled");
  });
});
describe("sanitized public content and raster imports", () => {
  it("extracts visible product data and palette without executing scripts or including reviews/accounts", () => {
    const html = `<html><head><title>Solar coffee</title><style>.brand { color:#6043b5; }</style><script>throw new Error('never execute'); fetch('http://private');</script><script type="application/ld+json">${JSON.stringify({ "@type": "Product", name: "Solar Roast", description: "Whole bean coffee", sku: "solar", size: "12 oz", offers: { price: "18.00", priceCurrency: "USD" }, review: { author: "Private Customer" }, image: "https://cdn.test/product.png" })}</script></head><body><h1>Solar Roast</h1><p>Whole bean coffee for bright mornings.</p><p hidden>Secret hidden copy</p><section class="reviews">Private Customer review</section><form>Account details</form><img src="https://cdn.test/product.png"></body></html>`;
    const result = extractPage(html);
    expect(result.title).toBe("Solar Roast");
    expect(result.visibleText).toContain("bright mornings");
    expect(JSON.stringify(result)).not.toContain("Private Customer");
    expect(result.visibleText).not.toContain("hidden copy");
    expect(result.products[0]).toMatchObject({
      name: "Solar Roast",
      sku: "solar",
      price: "18.00",
      currency: "USD",
      confirmed: false,
    });
    expect(result.colors).toContain("#6043b5");
    expect(
      extractPage(
        '<h1>Product</h1><section class="customer-reviews"><img src="https://cdn.test/customer.png"></section><div hidden><img src="https://cdn.test/hidden.png"></div><img src="https://cdn.test/product.png">',
      ).imageUrls,
    ).toEqual(["https://cdn.test/product.png"]);
    expect(() =>
      extractPage("<div>".repeat(100) + "bounded" + "</div>".repeat(100)),
    ).toThrow("complexity");
  });
  it("obeys combined user-agent robots rules without crawling restricted paths", () => {
    expect(
      robotsAllowed(
        "User-agent: *\nUser-agent: OtherBot\nDisallow: /private\nAllow: /private/open",
        "/private/data",
      ),
    ).toBe(false);
    expect(
      robotsAllowed(
        "User-agent: *\nDisallow: /private\nAllow: /private/open",
        "/private/open",
      ),
    ).toBe(true);
  });
  it("imports actual decoded rasters with provenance and records unsafe image failures", async () => {
    const image = await png();
    const calls: string[] = [];
    const transport: Transport = async (request) => {
      calls.push(request.url.href);
      if (request.url.pathname === "/robots.txt")
        return response("", 404, "text/plain");
      if (request.url.hostname === "cdn.test")
        return response(image, 200, "image/png");
      return response(
        '<h1>Solar Roast</h1><p>Whole bean coffee</p><img src="https://cdn.test/product.png"><img src="https://10.0.0.1/private.png">',
      );
    };
    const result = await new PublicImporter(
      new PublicFetcher(resolver, transport),
      () => new Date("2026-10-03T12:00:00Z"),
    ).import(["https://store.test/product"], signal());
    expect(result.sources).toHaveLength(1);
    expect(result.images).toHaveLength(1);
    expect(result.images[0]).toMatchObject({
      width: 32,
      height: 48,
      mimeType: "image/png",
      sourceUrl: "https://cdn.test/product.png",
    });
    expect(result.images[0].sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(
      result.failures.some((item) => item.code === "unsafe-destination"),
    ).toBe(true);
    expect(calls.some((url) => url.includes("10.0.0.1"))).toBe(false);
    expect(result.reviewRequired).toBe(true);
  });
  it("reports blocked/challenge sites as failures and never successful imports", async () => {
    for (const body of [
      "<h1>Access denied</h1><p>Restricted</p>",
      '<h1>Just a moment</h1><script src="/cf-chl-platform"></script>',
    ]) {
      const transport: Transport = async (request) =>
        request.url.pathname === "/robots.txt"
          ? response("", 404, "text/plain")
          : response(body);
      const result = await new PublicImporter(
        new PublicFetcher(resolver, transport),
      ).import(["https://store.test/"], signal());
      expect(result.sources).toEqual([]);
      expect(result.failures[0].code).toBe("site-restriction");
    }
  });
  it("respects robots denial and does not expose credential-bearing failed URLs", async () => {
    const transport = vi
      .fn<Transport>()
      .mockResolvedValue(
        response("User-agent: *\nDisallow: /", 200, "text/plain"),
      );
    const result = await new PublicImporter(
      new PublicFetcher(resolver, transport),
    ).import(
      [
        "https://store.test/",
        "https://secret:password@store.test/?token=private",
      ],
      signal(),
    );
    expect(result.sources).toEqual([]);
    expect(transport).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(result)).not.toContain("password");
    expect(JSON.stringify(result)).not.toContain("private");
  });
  it("checks robots and restricted paths on every page redirect and rejects HTML access-rule responses", async () => {
    for (const destination of [
      "https://other.test/blocked",
      "https://store.test/%61ccount",
      "https://store.test/%2561ccount",
    ]) {
      const calls: string[] = [];
      const transport: Transport = async (request) => {
        calls.push(request.url.href);
        if (request.url.pathname === "/robots.txt")
          return request.url.hostname === "other.test"
            ? response("User-agent: *\nDisallow: /blocked", 200, "text/plain")
            : response("", 404, "text/plain");
        return response("", 302, "text/html", { location: destination });
      };
      const result = await new PublicImporter(
        new PublicFetcher(resolver, transport),
      ).import(["https://store.test/product"], signal());
      expect(result.sources).toEqual([]);
      expect(calls).not.toContain(destination);
      expect(result.failures[0].code).toMatch(
        /site-restriction|restricted-page/,
      );
    }
    const result = await new PublicImporter(
      new PublicFetcher(resolver, async () =>
        response("<h1>Access challenge</h1>", 200, "text/html"),
      ),
    ).import(["https://store.test/"], signal());
    expect(result.sources).toEqual([]);
    expect(result.failures[0].code).toBe("site-restriction");
  });
  it("decodes and reencodes PNG/JPEG while stripping metadata; rejects active/mismatched/corrupt/oversized media", async () => {
    const bytes = await sharp({
      create: { width: 32, height: 32, channels: 3, background: "orange" },
    })
      .jpeg()
      .withMetadata()
      .toBuffer();
    const output = await normalizeRaster(bytes, "image/jpeg");
    const metadata = await sharp(
      Buffer.from(output.base64, "base64"),
    ).metadata();
    expect(metadata.width).toBe(32);
    expect(metadata.exif).toBeUndefined();
    await expect(normalizeRaster(bytes, "image/png")).rejects.toThrow("MIME");
    await expect(
      normalizeRaster(
        Buffer.from("<svg><script>alert(1)</script></svg>"),
        "image/svg+xml",
      ),
    ).rejects.toThrow("unsupported");
    await expect(
      normalizeRaster((await png()).subarray(0, 24), "image/png"),
    ).rejects.toThrow("decoded");
    const tooWide = await sharp({
      create: { width: 8193, height: 16, channels: 3, background: "red" },
    })
      .png()
      .toBuffer();
    await expect(normalizeRaster(tooWide, "image/png")).rejects.toThrow(
      "dimensions",
    );
    await expect(
      normalizeRaster(new Uint8Array(4 * 1024 * 1024 + 1), "image/png"),
    ).rejects.toThrow("4 MiB");
  });
});
