import { createServer } from "node:http";
import type { IncomingMessage, Server, ServerResponse } from "node:http";
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import type {
  GeneratedImage,
  SemanticPlan,
  ServiceCapabilities,
  ServiceFailure,
} from "../src/domain/service";
import type { Allowance } from "./allowance";
import { payloadHash } from "./allowance";
import { ServiceError, publicFailure } from "./errors";
import { importLimits, PublicImporter } from "./importer";
import { decodeBase64, normalizeRaster } from "./raster";
import type { ImageProvider, SemanticProvider } from "./providers";
import {
  validateImageRequest,
  validatePlanRequest,
  validateUploadRequest,
} from "./schema";
import { abortable } from "./security";

export interface ApprovedGeneration {
  approved: true;
  approvalId: string;
  allowance: Allowance;
  planReservationCents: number;
  imageReservationCents: number;
  semanticProvider: SemanticProvider;
  imageProvider: ImageProvider;
}
export interface ServiceOptions {
  accessSecret: string;
  allowedOrigins?: string[];
  importer?: PublicImporter;
  generation?: ApprovedGeneration;
  requestsPerMinute?: number;
  operationTimeoutMs?: number;
  clock?: () => number;
}
const digest = (value: string) => createHash("sha256").update(value).digest();
const compareSecret = (left: string, right: string) =>
  timingSafeEqual(digest(left), digest(right));
interface CachedOperation {
  hash: string;
  value: SemanticPlan | GeneratedImage;
  bytes: number;
}
/** Local-only adapter host. Public hosting requires a separately approved identity/abuse boundary. */
export class ProtectedService {
  readonly server: Server;
  private options: ServiceOptions;
  private sessions = new Map<string, number>();
  private rates = new Map<string, { minute: number; count: number }>();
  private controllers = new Set<AbortController>();
  private cache = new Map<string, CachedOperation>();
  private cacheBytes = 0;
  private active = 0;
  constructor(options: ServiceOptions) {
    if (options.accessSecret.length < 32)
      throw new ServiceError(
        "access-config",
        "Set a server-only access secret with at least 32 characters.",
        503,
      );
    if (
      (options.requestsPerMinute !== undefined &&
        (!Number.isInteger(options.requestsPerMinute) ||
          options.requestsPerMinute < 1 ||
          options.requestsPerMinute > 20)) ||
      (options.operationTimeoutMs !== undefined &&
        (!Number.isInteger(options.operationTimeoutMs) ||
          options.operationTimeoutMs < 1 ||
          options.operationTimeoutMs > 120_000))
    )
      throw new ServiceError(
        "bounds-config",
        "Request rate and operation timeout must fit the explicit finite local limits.",
        503,
      );
    if (
      options.generation &&
      (!options.generation.approved ||
        !/^[a-zA-Z0-9_-]{1,100}$/.test(options.generation.approvalId) ||
        !Number.isSafeInteger(options.generation.planReservationCents) ||
        options.generation.planReservationCents < 1 ||
        !Number.isSafeInteger(options.generation.imageReservationCents) ||
        options.generation.imageReservationCents < 1)
    )
      throw new ServiceError(
        "generation-config",
        "Generation needs explicit runtime approval and positive cost reservations.",
        503,
      );
    this.options = {
      ...options,
      allowedOrigins: options.allowedOrigins ?? [
        "http://127.0.0.1:5173",
        "http://localhost:5173",
      ],
      requestsPerMinute: Math.max(
        1,
        Math.min(20, options.requestsPerMinute ?? 10),
      ),
      operationTimeoutMs: Math.max(
        1,
        Math.min(120_000, options.operationTimeoutMs ?? 65_000),
      ),
    };
    if (
      this.options.allowedOrigins!.some((origin) => {
        try {
          const url = new URL(origin);
          return (
            !["http:", "https:"].includes(url.protocol) ||
            !["localhost", "127.0.0.1"].includes(url.hostname) ||
            url.origin !== origin
          );
        } catch {
          return true;
        }
      })
    )
      throw new ServiceError(
        "origin-config",
        "This local service only allows explicit loopback frontend origins.",
        503,
      );
    this.server = createServer(
      (request, response) => void this.handle(request, response),
    );
    this.server.headersTimeout = 10_000;
    this.server.requestTimeout = 30_000;
    this.server.maxRequestsPerSocket = 30;
  }
  capabilities(): ServiceCapabilities {
    return {
      mode: "protected-local-service",
      publicImport: true,
      uploads: true,
      semanticPlanning: !!this.options.generation,
      imageGeneration: !!this.options.generation,
      generationBlocker: this.options.generation
        ? null
        : "Live generation requires an owner-approved provider account, server runtime/access boundary and explicit cost ceiling. No paid call is enabled.",
      limits: {
        pages: importLimits.pages,
        images: importLimits.images,
        concurrentOperations: 1,
        requestsPerMinute: this.options.requestsPerMinute!,
        remainingReservedCostCents:
          this.options.generation?.allowance.remainingCents ?? null,
      },
      transmission:
        "Imports send selected public URLs to this local service. Planning sends the supplied brief and confirmed context to the configured provider; image edits send selected raster references. No content is logged or persisted by this service.",
    };
  }
  async listen(port = 4318): Promise<number> {
    return new Promise((resolve, reject) => {
      this.server.once("error", reject);
      this.server.listen(port, "127.0.0.1", () => {
        this.server.removeListener("error", reject);
        const address = this.server.address();
        resolve(address && typeof address === "object" ? address.port : port);
      });
    });
  }
  async close(): Promise<void> {
    this.resetTransient();
    await new Promise<void>((resolve, reject) =>
      this.server.close((error) => (error ? reject(error) : resolve())),
    );
  }
  resetTransient(): void {
    for (const controller of this.controllers) controller.abort();
    this.cache.clear();
    this.cacheBytes = 0;
    this.sessions.clear();
  }
  private now(): number {
    return this.options.clock?.() ?? Date.now();
  }
  private rate(key: string): void {
    const minute = Math.floor(this.now() / 60_000);
    for (const [id, record] of this.rates)
      if (record.minute !== minute) this.rates.delete(id);
    const record = this.rates.get(key) ?? { minute, count: 0 };
    if (++record.count > this.options.requestsPerMinute!)
      throw new ServiceError(
        "rate-limit",
        "Request limit reached. Wait for the next minute before retrying.",
        429,
      );
    this.rates.set(key, record);
  }
  private guards(request: IncomingMessage, response: ServerResponse): void {
    const address = this.server.address();
    const port = address && typeof address === "object" ? address.port : 4318;
    if (
      ![`127.0.0.1:${port}`, `localhost:${port}`].includes(
        request.headers.host ?? "",
      )
    )
      throw new ServiceError(
        "host-blocked",
        "Unexpected Host header; local DNS rebinding protection blocked the request.",
        403,
      );
    const origin = request.headers.origin;
    if (origin && !this.options.allowedOrigins!.includes(origin))
      throw new ServiceError(
        "origin-blocked",
        "This frontend origin is not authorized for the local service.",
        403,
      );
    if (origin) {
      response.setHeader("Access-Control-Allow-Origin", origin);
      response.setHeader("Access-Control-Allow-Credentials", "true");
      response.setHeader("Vary", "Origin");
    }
  }
  private identity(request: IncomingMessage): string {
    const authorization = request.headers.authorization ?? "";
    if (
      authorization.startsWith("Bearer ") &&
      compareSecret(authorization.slice(7), this.options.accessSecret)
    )
      return "operator";
    const cookie = (request.headers.cookie ?? "")
      .split(";")
      .map((item) => item.trim())
      .find((item) => item.startsWith("orbit_session="))
      ?.slice(14);
    if (cookie) {
      const key = digest(cookie).toString("hex"),
        expiry = this.sessions.get(key);
      if (expiry && expiry > this.now()) return key;
      this.sessions.delete(key);
    }
    throw new ServiceError(
      "unauthorized",
      "An authorized local-service session is required.",
      401,
    );
  }
  private async body(
    request: IncomingMessage,
    maxBytes: number,
  ): Promise<unknown> {
    if (!/^application\/json\b/i.test(request.headers["content-type"] ?? ""))
      throw new ServiceError(
        "content-type",
        "Use application/json for service requests.",
        415,
      );
    if (Number(request.headers["content-length"] ?? 0) > maxBytes)
      throw new ServiceError(
        "body-too-large",
        "Request exceeds the route size limit.",
        413,
      );
    const chunks: Buffer[] = [];
    let size = 0;
    for await (const chunk of request) {
      const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      size += bytes.length;
      if (size > maxBytes)
        throw new ServiceError(
          "body-too-large",
          "Request exceeds the route size limit.",
          413,
        );
      chunks.push(bytes);
    }
    try {
      return JSON.parse(Buffer.concat(chunks).toString("utf8"));
    } catch {
      throw new ServiceError("invalid-json", "Request is not valid JSON.");
    }
  }
  private send(response: ServerResponse, status: number, value: unknown): void {
    if (response.destroyed) return;
    const body = JSON.stringify(value);
    if (Buffer.byteLength(body) > 18 * 1024 * 1024)
      throw new ServiceError(
        "output-limit",
        "Service output exceeds the packet byte limit.",
        413,
      );
    response.writeHead(status, {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'",
      "Content-Length": Buffer.byteLength(body),
    });
    response.end(body);
  }
  private async paid<T extends SemanticPlan | GeneratedImage>(
    principal: string,
    path: string,
    request: { requestId: string },
    cost: number,
    signal: AbortSignal,
    operation: () => Promise<T>,
  ): Promise<T> {
    const generation = this.options.generation;
    if (!generation)
      throw new ServiceError(
        "generation-disabled",
        this.capabilities().generationBlocker!,
        503,
      );
    const key = `${principal}:${path}:${request.requestId}`,
      hash = payloadHash(request),
      cached = this.cache.get(key);
    if (cached) {
      if (cached.hash !== hash)
        throw new ServiceError(
          "idempotency-conflict",
          "This request identifier already refers to different inputs.",
          409,
        );
      return structuredClone(cached.value) as T;
    }
    await generation.allowance.reserve(
      `${path}:${request.requestId}`,
      hash,
      cost,
    );
    if (signal.aborted)
      throw new ServiceError(
        "cancelled",
        "Operation cancelled after reservation; no automatic repeated call is permitted.",
        499,
      );
    const value = await abortable(operation(), signal),
      bytes = Buffer.byteLength(JSON.stringify(value));
    while (
      this.cache.size >= 12 ||
      this.cacheBytes + bytes > 24 * 1024 * 1024
    ) {
      const oldest = this.cache.keys().next().value;
      if (!oldest) break;
      this.cacheBytes -= this.cache.get(oldest)!.bytes;
      this.cache.delete(oldest);
    }
    if (bytes <= 8 * 1024 * 1024) {
      this.cache.set(key, { hash, value: structuredClone(value), bytes });
      this.cacheBytes += bytes;
    }
    return value;
  }
  private async handle(
    request: IncomingMessage,
    response: ServerResponse,
  ): Promise<void> {
    let controller: AbortController | undefined,
      acquired = false;
    try {
      this.guards(request, response);
      if (request.method === "OPTIONS") {
        response.writeHead(204, {
          "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type, Authorization",
          "Access-Control-Max-Age": "600",
        });
        response.end();
        return;
      }
      const path = (request.url ?? "").split("?")[0];
      if (request.method === "GET" && path === "/health") {
        this.send(response, 200, {
          mode: "protected-local-service",
          status: "available",
        });
        return;
      }
      if (path === "/v1/session" && request.method === "POST") {
        this.rate("bootstrap");
        if (this.identity(request) !== "operator")
          throw new ServiceError(
            "unauthorized",
            "Session bootstrap requires the server-owned access secret.",
            401,
          );
        for (const [key, expiry] of this.sessions)
          if (expiry <= this.now()) this.sessions.delete(key);
        if (this.sessions.size >= 16)
          throw new ServiceError(
            "session-limit",
            "Local session limit reached.",
            429,
          );
        const token = randomBytes(32).toString("base64url");
        this.sessions.set(
          digest(token).toString("hex"),
          this.now() + 30 * 60_000,
        );
        response.setHeader(
          "Set-Cookie",
          `orbit_session=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=1800`,
        );
        this.send(response, 200, { authenticated: true });
        return;
      }
      const principal = this.identity(request);
      this.rate("global");
      this.rate(principal);
      if (path === "/v1/capabilities" && request.method === "GET") {
        this.send(response, 200, this.capabilities());
        return;
      }
      if (
        (path === "/v1/session" || path === "/v1/reset") &&
        request.method === "DELETE"
      ) {
        this.resetTransient();
        response.setHeader(
          "Set-Cookie",
          "orbit_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0",
        );
        this.send(response, 200, { deleted: true, allowanceRetained: true });
        return;
      }
      if (
        request.method !== "POST" ||
        !["/v1/import", "/v1/upload", "/v1/plan", "/v1/images"].includes(path)
      )
        throw new ServiceError(
          "route-not-found",
          "Unsupported service route.",
          404,
        );
      if (this.active >= 1)
        throw new ServiceError(
          "concurrency-limit",
          "Another operation is active; wait before starting another.",
          409,
        );
      this.active++;
      acquired = true;
      controller = new AbortController();
      this.controllers.add(controller);
      const currentController = controller;
      request.once("aborted", () => currentController.abort());
      response.once("close", () => {
        if (!response.writableFinished) currentController.abort();
      });
      const signal = AbortSignal.any([
        controller.signal,
        AbortSignal.timeout(this.options.operationTimeoutMs!),
      ]);
      const value = await abortable(
        this.body(
          request,
          path === "/v1/plan"
            ? 64 * 1024
            : path === "/v1/import"
              ? 8 * 1024
              : 12 * 1024 * 1024,
        ),
        signal,
      );
      let result: unknown;
      if (path === "/v1/import") {
        if (
          !value ||
          typeof value !== "object" ||
          Array.isArray(value) ||
          Object.keys(value).some((key) => key !== "urls") ||
          !Array.isArray((value as { urls?: unknown }).urls) ||
          (value as { urls: unknown[] }).urls.some(
            (url) => typeof url !== "string" || url.length > 2048,
          )
        )
          throw new ServiceError(
            "schema-invalid",
            "Import requires only one to three public URL strings.",
          );
        result = await abortable(
          (this.options.importer ?? new PublicImporter()).import(
            (value as { urls: string[] }).urls,
            signal,
          ),
          signal,
        );
      } else if (path === "/v1/upload") {
        validateUploadRequest(value);
        result = {
          mode: "validated-upload",
          image: await abortable(
            normalizeRaster(decodeBase64(value.base64), value.mimeType),
            signal,
          ),
          reviewRequired: true,
        };
      } else if (path === "/v1/plan") {
        validatePlanRequest(value);
        result = await this.paid(
          principal,
          path,
          value,
          this.options.generation?.planReservationCents ?? 0,
          signal,
          () => this.options.generation!.semanticProvider.plan(value, signal),
        );
      } else {
        validateImageRequest(value);
        result = await this.paid(
          principal,
          path,
          value,
          this.options.generation?.imageReservationCents ?? 0,
          signal,
          () => this.options.generation!.imageProvider.generate(value, signal),
        );
      }
      this.send(response, 200, result);
    } catch (error) {
      const failure = publicFailure(error);
      const body: ServiceFailure = {
        error: { code: failure.code, message: failure.message },
        fallback: /generation|provider|allowance/.test(failure.code)
          ? "configure-approved-server-runtime"
          : /url|import|source|image|raster|site|dns/.test(failure.code)
            ? "paste-facts-or-upload-owned-raster"
            : null,
      };
      if (!response.headersSent) this.send(response, failure.status, body);
      else response.destroy();
    } finally {
      if (controller) {
        controller.abort();
        this.controllers.delete(controller);
      }
      if (acquired) this.active--;
    }
  }
}
