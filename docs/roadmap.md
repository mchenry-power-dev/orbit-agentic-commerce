# Direction and production boundaries

Orbit Studio is the first module of Orbit™ — Agentic Commerce OS. The product direction is to coordinate the work between commerce, creative, advertising, and storefront systems. This repository demonstrates a campaign portfolio workflow with a real local engine and simulated store/generation providers.

| Present boundary | Next production step | Evidence required before claiming it works |
| --- | --- | --- |
| Bundled fictional merchants | Authorized Shopify context adapter | Scoped access, provenance, factual reconciliation, revoked-access handling |
| Deterministic text and SVG providers | Real text/image/video adapters | Contract tests, cancellation, content controls, cost limits, provider failures |
| Browser-local IndexedDB | Authenticated merchant backend and job execution | Tenant isolation, access control, migrations, operational recovery |
| Human review and ZIP export | Explicitly approved storefront/ad publishing | Preview/diff, exact-version authorization, idempotent writes, audit history |
| Preference reuse | Measured feedback loop | Consented observations, defined evaluation, evidence against baselines |

These are future directions, not delivered integrations. No account connection, paid API, customer deployment, rendered video, or automatic campaign publishing is required to run this reference.

Cosmic Cat Coffee Co. is McHenry Power's operating business and intended customer-zero environment. It supplies the problem context, not production data or proof of an Orbit deployment. The public demo merchants are invented. Loom™ concerns subscription-commerce infrastructure; Orbit concerns reusable orchestration. FORGE™ is outside this reference.

A roughly ten-minute campaign brief is a product-design target. This repository does not report measured turnaround, conversion lift, revenue, ROI, model quality benchmarks, or live advertising performance.

Production work should begin with a single authorized adapter and its failure boundaries. More infrastructure is warranted only when an observed requirement needs it. This static reference intentionally has no microservices, server queue, multi-tenant billing, tracking, credential entry, or production publishing.
