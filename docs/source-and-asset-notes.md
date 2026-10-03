# Source and asset notes

## Provenance and ownership

This is newly written public-reference source for Orbit Studio, owned by McHenry Power. It does not import or reconstruct private Orbit, Loom, employer, or business implementation. Product direction and architecture are independent work; development used AI assistance. Public source availability is not an open-source license grant. No repository license has been added without owner authorization.

The two bundled merchant presets, product identifiers, factual attributes, packaging designs, and `.example` addresses are invented. Coffee is the primary fixture; household consumables demonstrate a second category. No customer/order records, private financial data, supplier terms, reviews, or paid-media results are included.

Demo image providers create original local SVG compositions and generation briefs. They are vector drafts, not model-generated photographs. Packaging text and fixture attributes stay tied to product records. Video output is a script/shot/generation brief, not a rendered video. Screenshots in the gallery are captured from the running application with synthetic data.

## Dependencies and assets

Dependencies are installed locally from the normal npm registry and locked by `package-lock.json`. React renders the interface; Vite builds the static app; TypeScript checks the model; the persistence adapter uses native IndexedDB; `fflate` assembles ZIP files. Vitest and Playwright provide unit/browser checks. [Third-party runtime notices](third-party-notices.md) preserve the installed dependency license texts. Development tooling retains its package notices. This repository makes no ownership claim over dependencies.

The UI uses system fonts. Orbital decoration and packaging artwork are original simple compositions. No proprietary fonts, third-party brand logos, remote stock photographs, embedded trackers, or paid-media creative have been redistributed. Google documentation is linked for specification provenance; it does not imply endorsement or affiliation.

## Trust boundaries

The demonstration has no login or authenticated production environment. Data stays in IndexedDB for the current browser/origin. Anyone using that browser profile can inspect or alter it; exports are not cryptographic attestations. Reset removes demo state from the local app. Browser storage clearing, another origin, or another device will not preserve it.

Fixture and provider text are data, not executable instructions. Supported text is rendered/escaped; exported filenames are normalized and review CSV cells neutralize formula prefixes. Generated previews must not execute arbitrary provider HTML or scripts. References are restricted to bundled assets. The default pipeline has no external API calls, scraping, credentials, uploads, payment controls, or analytics.

The deterministic factual/prohibited-phrase checks cover a finite rule set. They cannot establish the truth of arbitrary marketing language or perform comprehensive legal, advertising-policy, or security review. A merchant still reviews the exact output version. See [channel scope](channel-specs.md) and [tests](testing-and-evaluation.md) for practical limits.
