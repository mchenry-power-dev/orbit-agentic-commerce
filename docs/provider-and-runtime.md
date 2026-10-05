# Provider and runtime boundary

The no-key V2 release runs on GitHub Pages without a backend or paid provider. It is a **working no-key creative orchestration reference using real product photography, local composition, review workflows, and export.** The repository preserves a protected local service and schema-validated planning/image adapters for separate development; they are not connected to the hosted demo. **No paid provider call or public service deployment is part of this release.**

| Availability                  | Capability and boundary                                                                                                                                                                                                                               |
| ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Hosted demo                   | Dated Cosmic Cat catalog snapshot, explicit public catalog retrieval where supported, catalog-file/PNG/JPEG uploads, prebuilt sample, local composition, review/recovery, exact approvals, ZIPs, simulated channel handoffs and IndexedDB persistence |
| Documented local service only | Bounded public-URL import through CLI or authenticated development service; no model key needed                                                                                                                                                       |
| Deferred                      | Live semantic planning, generative image/video services, public backend authentication and provider connections                                                                                                                                       |

Public catalog retrieval is a separate, explicit read-only operation against Cosmic Cat's public Shopify endpoint. A successful read is labeled with its retrieval time; it is not authenticated store access or continuous sync. Failed reads preserve the previous catalog and offer bundled/file alternatives. See the [catalog contract](catalog.md).

On Pages, arbitrary website-page import says **Local service required** and its import action is disabled. Bundled context, pasted confirmed facts and supported local uploads remain available. Saving a URL does not count as importing it. **Live AI · deferred in hosted demo** exposes no credential-entry field or connected-provider claim. The static production build makes no localhost or service requests, regardless of any `VITE_ORBIT_SERVICE_URL` build-time value.

Simulated channel targets and local handoff records require no credentials. They do not authenticate an account, send assets, activate a campaign or change spend. [Channel handoff](channel-handoff.md) separates bounded Google mappings, conceptual Meta mappings, TikTok's missing actual video and website packages.

The frontend's prebuilt samples and local photograph compositions are separate capability modes. Neither silently substitutes for semantic generation of arbitrary instructions. User briefs, uploads and budgets must stay out of public sample files and source control.

## What has been tested

The [service tests](../tests/service-security.test.ts), [runtime/adapter tests](../tests/service-runtime.test.ts) and [frontend contract checks](../tests/service-client.test.ts) exercise DNS/redirect rejection, bounded HTML/raster imports, sanitized content, authorization, Host/Origin protection, schemas, output checks, source-role mapping, client cancellation/timeouts, concurrency, idempotency and persistent reservations. The 39 service/bridge checks pass. Provider integration tests intercept the actual REST request shapes and return synthetic responses. They establish the adapter boundary, **not live model availability, billing accuracy or creative relevance**.

A real bounded import of the owner-approved [Solar Surge product page](https://cosmiccatcoffeeco.com/products/solar-surge) was verified on **October 3, 2026**: one source document, six decoded PNG references, and one explicitly rejected unsupported/non-HTTPS image reference. The source title and JSON-LD product name, SKU, price and currency were extracted. Imported product records remain unconfirmed. Runtime evidence is local-only; no visitor/import result is checked into the public repository. Storefront markup exceeded the initial 512 KiB ceiling, so the final bounded HTML ceiling is 2 MiB.

A separate authorized public import of [example.org](https://example.org/) returned one text source, no products, no raster references and no failures. This confirms the general public-page transport path; the result is not a product-fact source or another brand preset. No third-party images were bundled from that check.

## Local public import

Install dependencies and choose an output path outside the public repository:

```sh
npm ci
npm run service:import -- --url https://cosmiccatcoffeeco.com/products/solar-surge --output ../_work/public-import.json
```

The command supports one to three explicitly selected public HTTPS pages. It performs no crawl, login, checkout, form submission or script execution. It does not call a model and needs no API key. Inspect the returned `sources`, `images` and `failures`; a saved URL or a failed response is never labeled a successful source. Paste confirmed facts or upload an owned PNG/JPEG when a site is blocked. The CLI runs with the local operator's permissions and does not expose an unauthenticated HTTP proxy.

## HTTP service and access

`npm run service` starts [server/index.ts](../server/index.ts) on **127.0.0.1:4318**. It requires a server-owned `ORBIT_SERVICE_ACCESS_SECRET` of at least 32 characters; provision a random value through the operator's secret mechanism. Never commit, print or place it in a frontend field. The default service supports import/uploads and rejects paid generation. Only explicit localhost/127.0.0.1 frontend origins on port 5173 are allowed. The service also checks its Host header to block local DNS rebinding.

Frontend service construction is limited to `npm run dev` on `localhost` or `127.0.0.1` with an explicit `VITE_ORBIT_SERVICE_URL=http://127.0.0.1:4318`. Set it in the local development environment, never as a provider-secret field. Production builds ignore the service URL. Use matching loopback hostnames for the frontend and service because the session cookie is SameSite=Strict.

Server-owned session bootstrap uses `POST /v1/session` with authorized operator authentication and sets a random, 30-minute **HttpOnly, SameSite=Strict** cookie. It does not return a provider key or access token in JSON. A browser session provisioning flow is not deployed; future hosted service access would require a separate identity/HTTPS/abuse-control design. This loopback service is not a production multi-merchant authentication system.

| Route                  | Meaning                                                                                                  |
| ---------------------- | -------------------------------------------------------------------------------------------------------- |
| `GET /v1/capabilities` | Authenticated configuration/limits; configured does not prove live provider verification                 |
| `POST /v1/import`      | Selected public pages → sanitized text, unconfirmed metadata and decoded raster bytes                    |
| `POST /v1/upload`      | Owned raster → decoded, oriented, metadata-stripped PNG/JPEG                                             |
| `POST /v1/plan`        | Confirmed context → strict semantic schema, deterministic identity/placement/phrase checks and conflicts |
| `POST /v1/images`      | One bounded scene generation or edit → checked raster and provenance; product fidelity review required   |
| `DELETE /v1/reset`     | Cancel work and discard transient sessions/cached content; retain cost reservations                      |

Pure client/server records live in [service.ts](../src/domain/service.ts). Imported content is data, never tool instructions. Planning priority is confirmed product facts/prohibitions, current explicit instructions, structured choices, confirmed brand defaults, then remembered preferences. Required phrases stay whole in their defined copy scope; conflicts are surfaced rather than silently truncated. Each placement supplies a checked `product-right` or `product-center` composition and spacing from 0.06 to 0.18; descriptive framing/focal/negative-space notes remain merchant-review context. Schema validity does not establish semantic relevance. Original product photography/text should remain protected composition layers, and returned imagery still needs visual inspection.

The client bounds capability requests to 10 seconds, imports/planning to 45 seconds and images to 80 seconds, including response-body reads. Caller cancellation propagates. It does not automatically retry or change a supplied operation identifier; timeout/cancellation of a paid request may leave an unknown charge reservation.

Current campaign text and merchant iteration feedback are independent fields, each bounded to 6,000 characters; optional feedback preserves compatibility with older requests. Current briefs, selected confirmed product facts, required/prohibited phrases and merchant feedback are transmitted intact within their bounds, or rejected if oversized. They are never silently shortened or combined to squeeze into another field.

Selected public source text is bounded untrusted context: the client sends at most **2,000 characters per reference, including an explicit excerpt marker** when shortened. The full sanitized imported text remains unchanged in the local brand/provenance record. Visitor-supplied reference text without a public URL is not silently excerpted; oversized text fails schema validation. The real Solar Surge source contained 8,000 characters of sanitized text, confirming this excerpt mapping is needed. Imported image labels include a sequential reference number and actual dimensions; association with a product remains explicit.

## Import and file limits

| Boundary      | Implemented local limit                                                                                                                     |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| Sources       | 3 selected pages, no crawl; account/cart/checkout/admin/login paths rejected                                                                |
| Transport     | HTTPS port 443 only; no embedded/signed URL credentials, cookies, authorization or script execution                                         |
| DNS/redirects | Reject every ineligible/mixed DNS answer; pin validated IP in each TLS connection; revalidate every hop and asset; at most 3 redirects      |
| Timing        | 8 seconds including DNS/redirects per fetch; 30 seconds for an import packet                                                                |
| Bytes         | 2 MiB HTML, 64 KiB robots, 4 MiB per raster, 12 MiB raster total                                                                            |
| Images        | At most 6; PNG/JPEG/WebP input signatures must match MIME; actual decoding; single frame, 16–8192-pixel edges and at most 16 million pixels |
| Output        | Metadata-stripped PNG/JPEG bytes; at most 4 MiB per raster; JSON response bound 18 MiB                                                      |
| Operations    | Serial concurrency 1; default 10 requests/minute, configurable only up to 20                                                                |

Private, loopback, link-local, metadata, multicast, documentation and selected tunneling/reserved ranges are rejected. The [pinned HTTPS transport](../server/security.ts) retains hostname/SNI certificate verification and does not reuse a socket whose DNS could change. Every page redirect destination must pass the restricted-path and destination-origin robots checks before it is fetched; encoded account paths and HTML challenge responses masquerading as robots rules are rejected. Robots exclusions and access/challenge responses are respected; no CORS proxy or challenge bypass is used. The extractor excludes scripts, forms, review/customer identities and hidden/active markup. It cannot reproduce full browser-computed visibility, interpret every site schema, or establish the truth of arbitrary marketing claims.

Raster decoding uses `sharp`, with pixel/byte bounds, and HTML parsing uses `parse5` without script execution. Active SVG/HTML uploads are rejected. Serving decoded bytes as local/data images avoids an imported cross-origin canvas source; the frontend still checks its own decode/export path. Server errors contain safe categories, not upstream bodies, stack traces, credentials or personal brief content.

Document extraction also refuses more than 50,000 nodes or 64 levels. Image candidates inside review/customer, hidden, form, cart/account, navigation and footer content are excluded before any image request. These structural exclusions do not establish full browser-computed visibility.

## Deferred paid generation stays fail closed

These preserved adapters are outside the no-key release. A future authorized operator must explicitly configure all of these **on the server** before generation can start:

- `ORBIT_SERVICE_GENERATION_APPROVED=yes` and a recorded `ORBIT_SERVICE_APPROVAL_ID`.
- `OPENAI_API_KEY`, `ORBIT_PLANNING_MODEL` and `ORBIT_IMAGE_MODEL` for an approved provider account and available models.
- `ORBIT_SERVICE_COST_CEILING_CENTS`, plus conservative `ORBIT_SERVICE_PLAN_RESERVATION_CENTS` and `ORBIT_SERVICE_IMAGE_RESERVATION_CENTS` checked against current pricing and the bounded request settings.
- A private, writable `ORBIT_SERVICE_STATE_DIR` (default ignored `.orbit-runtime/`) and an approved runtime/access policy.

There is no implicit paid model default. The Responses adapter limits output to 6,000 tokens and disables response storage with `store:false`. Image requests produce exactly one image at low quality and one of three bounded sizes; edits allow at most two decoded references. Provider requests have fixed OpenAI origins, reject redirects and use finite timeouts. These adapters follow the official [Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs) and [image generation](https://developers.openai.com/api/docs/guides/image-generation) documentation, checked October 3, 2026.

The [allowance ledger](../server/allowance.ts) durably reserves a full configured operation charge **before** a provider call. Failures, cancellation and unknown/time-out charges remain reserved. A repeated identifier with changed inputs is rejected. Completed results can be reused from bounded transient cache; after restart an already reserved call is blocked rather than repeated. The ledger allows at most 1,024 operations, refuses conflicting writers/corrupt state, and survives ordinary process restart. An interrupted lock requires operator inspection. Resetting visitor content does not replenish spending permission.

These are local conservative accounting controls, **not a guarantee of the provider invoice or a global account billing cap**. The approved runtime must verify per-operation worst-case pricing, provider/account spending restrictions and operational access before live/public use. No automatic retry multiplies paid calls. Public paid inference, provider access and semantic/image acceptance remain unverified until that owner-approved setup exists.
