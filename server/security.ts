import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { request } from "node:https";
import type { LookupFunction } from "node:net";
import { ServiceError } from "./errors";

export interface ResolvedAddress {
  address: string;
  family: number;
}
export type Resolver = (hostname: string) => Promise<ResolvedAddress[]>;
export const defaultResolver: Resolver = (hostname) =>
  lookup(hostname, { all: true, verbatim: true });
export function isPublicAddress(address: string): boolean {
  if (isIP(address) === 4) {
    const [a, b, c] = address.split(".").map(Number);
    return !(
      a === 0 ||
      a === 10 ||
      a === 127 ||
      a >= 224 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 &&
        (b === 168 ||
          (b === 0 && (c === 0 || c === 2)) ||
          (b === 88 && c === 99))) ||
      (a === 198 && (b === 18 || b === 19 || (b === 51 && c === 100))) ||
      (a === 203 && b === 0 && c === 113)
    );
  }
  if (isIP(address) === 6) {
    const normalized = address.toLowerCase();
    const first = parseInt(normalized.split(":")[0], 16);
    if (!(first >= 0x2000 && first <= 0x3ffe) || first === 0x2002) return false;
    if (
      first === 0x2001 &&
      parseInt(normalized.split(":")[1] || "0", 16) === 0xdb8
    )
      return false;
    if (
      first === 0x2001 &&
      parseInt(normalized.split(":")[1] || "0", 16) < 0x200
    )
      return false;
    return true;
  }
  return false;
}
export function publicUrl(value: string): URL {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new ServiceError("invalid-url", "Enter a complete public HTTPS URL.");
  }
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    (url.port && url.port !== "443")
  )
    throw new ServiceError(
      "unsafe-url",
      "Only public HTTPS on port 443 without embedded credentials is supported.",
    );
  const hostname = url.hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (
    !hostname ||
    hostname === "localhost" ||
    /\.(?:localhost|local|internal|lan|home|arpa)$/.test(hostname) ||
    (!hostname.includes(".") && !isIP(hostname)) ||
    (isIP(hostname) && !isPublicAddress(hostname))
  )
    throw new ServiceError(
      "unsafe-destination",
      "This destination is not an eligible public website.",
    );
  for (const key of [...url.searchParams.keys()]) {
    if (
      /^(?:access_token|token|api_key|key|authorization|signature|sig|x-amz-|x-goog-)/i.test(
        key,
      )
    )
      throw new ServiceError(
        "credential-url",
        "Credential-bearing or signed URLs are not public import sources.",
      );
    if (/^(?:utm_|gclid$|fbclid$|msclkid$)/i.test(key))
      url.searchParams.delete(key);
  }
  url.hash = "";
  return url;
}
export async function resolvePublic(
  url: URL,
  resolver: Resolver = defaultResolver,
): Promise<ResolvedAddress> {
  const hostname = url.hostname.replace(/^\[|\]$/g, "");
  let addresses: ResolvedAddress[];
  try {
    addresses = isIP(hostname)
      ? [{ address: hostname, family: isIP(hostname) }]
      : await resolver(hostname);
  } catch {
    throw new ServiceError(
      "dns-failed",
      "The public hostname could not be resolved.",
      422,
    );
  }
  if (
    !addresses.length ||
    addresses.some(
      (item) =>
        !isPublicAddress(item.address) ||
        (item.family !== 4 && item.family !== 6) ||
        isIP(item.address) !== item.family,
    )
  )
    throw new ServiceError(
      "unsafe-destination",
      "DNS returned an ineligible destination; no request was sent.",
    );
  return addresses[0];
}
export interface TransportResponse {
  status: number;
  headers: Record<string, string>;
  bytes: Uint8Array;
}
export interface PinnedRequest {
  url: URL;
  address: ResolvedAddress;
  maxBytes: number;
  timeoutMs: number;
  signal: AbortSignal;
}
export type Transport = (request: PinnedRequest) => Promise<TransportResponse>;
/** Connect to the validated IP, retaining hostname/SNI certificate verification; no shared socket or cookies. */
export const pinnedHttpsTransport: Transport = (options) =>
  new Promise((resolve, reject) => {
    const hostname = options.url.hostname.replace(/^\[|\]$/g, "");
    const pinnedLookup: LookupFunction = (_host, lookupOptions, callback) => {
      if (typeof lookupOptions === "object" && lookupOptions.all)
        callback(null, [options.address]);
      else callback(null, options.address.address, options.address.family);
    };
    const req = request(
      options.url,
      {
        method: "GET",
        agent: false,
        lookup: pinnedLookup,
        servername: isIP(hostname) ? undefined : hostname,
        signal: options.signal,
        headers: {
          "User-Agent":
            "OrbitPublicReference/2.0 (bounded owner-requested public import)",
          Accept: "text/html,image/png,image/jpeg,image/webp,text/plain",
          "Accept-Encoding": "identity",
        },
      },
      (response) => {
        const headers: Record<string, string> = {};
        for (const [key, value] of Object.entries(response.headers))
          if (value)
            headers[key] = Array.isArray(value) ? value.join(",") : value;
        if (
          headers["content-encoding"] &&
          headers["content-encoding"] !== "identity"
        ) {
          response.destroy();
          reject(
            new ServiceError(
              "encoded-response",
              "Compressed responses are not imported; use paste/upload fallback.",
            ),
          );
          return;
        }
        if (Number(headers["content-length"] ?? 0) > options.maxBytes) {
          response.destroy();
          reject(
            new ServiceError(
              "response-too-large",
              "The source exceeds the import size limit.",
              413,
            ),
          );
          return;
        }
        const parts: Buffer[] = [];
        let size = 0;
        response.on("data", (chunk: Buffer) => {
          size += chunk.length;
          if (size > options.maxBytes) {
            response.destroy();
            reject(
              new ServiceError(
                "response-too-large",
                "The source exceeds the import size limit.",
                413,
              ),
            );
          } else parts.push(chunk);
        });
        response.on("end", () =>
          resolve({
            status: response.statusCode ?? 502,
            headers,
            bytes: Buffer.concat(parts),
          }),
        );
        response.on("error", reject);
      },
    );
    const timer = setTimeout(
      () =>
        req.destroy(
          new ServiceError(
            "import-timeout",
            "The public source did not respond within the bounded timeout.",
            504,
          ),
        ),
      options.timeoutMs,
    );
    req.on("error", reject);
    req.on("close", () => clearTimeout(timer));
    req.end();
  });
export class PublicFetcher {
  constructor(
    private readonly resolver: Resolver = defaultResolver,
    private readonly transport: Transport = pinnedHttpsTransport,
  ) {}
  async get(
    value: string,
    options: {
      maxBytes: number;
      timeoutMs: number;
      signal: AbortSignal;
      maxRedirects?: number;
      beforeRequest?: (url: URL) => Promise<void>;
    },
  ): Promise<TransportResponse & { url: string }> {
    let url = publicUrl(value);
    const deadline = Date.now() + options.timeoutMs;
    const boundedSignal = AbortSignal.any([
      options.signal,
      AbortSignal.timeout(options.timeoutMs),
    ]);
    for (
      let redirects = 0;
      redirects <= (options.maxRedirects ?? 3);
      redirects++
    ) {
      if (options.signal.aborted)
        throw new ServiceError("cancelled", "Import was cancelled.", 499);
      if (Date.now() >= deadline)
        throw new ServiceError("import-timeout", "Import timed out.", 504);
      if (options.beforeRequest)
        await abortable(options.beforeRequest(url), boundedSignal);
      const address = await abortable(
        resolvePublic(url, this.resolver),
        boundedSignal,
      );
      const response = await abortable(
        this.transport({
          url,
          address,
          maxBytes: options.maxBytes,
          timeoutMs: Math.max(1, deadline - Date.now()),
          signal: boundedSignal,
        }),
        boundedSignal,
      );
      if ([301, 302, 303, 307, 308].includes(response.status)) {
        if (!response.headers.location)
          throw new ServiceError(
            "invalid-redirect",
            "The source returned a redirect without a destination.",
          );
        url = publicUrl(new URL(response.headers.location, url).href);
        continue;
      }
      if (response.bytes.byteLength > options.maxBytes)
        throw new ServiceError(
          "response-too-large",
          "Source exceeds the import size limit.",
          413,
        );
      return { ...response, url: url.href };
    }
    throw new ServiceError(
      "redirect-limit",
      "The source exceeds the redirect limit.",
    );
  }
}
export function abortable<T>(
  operation: Promise<T>,
  signal: AbortSignal,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const abort = () =>
      reject(
        new ServiceError(
          "cancelled-or-timeout",
          "The bounded operation was cancelled or timed out.",
          504,
        ),
      );
    if (signal.aborted) {
      abort();
      return;
    }
    signal.addEventListener("abort", abort, { once: true });
    operation
      .then(resolve, reject)
      .finally(() => signal.removeEventListener("abort", abort));
  });
}
