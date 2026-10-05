# Store catalog and factual snapshots

The hosted demo opens with **Cosmic Cat Coffee Co. · Demo catalog**: four owner-authorized public products with local photographs, product facts, real variant ids and dated USD prices. Selecting products copies factual context into a campaign; messaging remains editable separately.

| Mode                                 | What actually happens                                                                                                                                                                                                   |
| ------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Bundled demo catalog                 | Loads the checked-in **2026-10-05** snapshot. No storefront request, account or continuous sync.                                                                                                                        |
| Read public Cosmic Cat catalog       | On an explicit click, reads four known handles from Shopify's tokenless Storefront API. Descriptions, variants and prices receive the retrieval time; factual notes and approved photographs keep their original dates. |
| Local catalog file                   | Parses a visitor-confirmed Orbit JSON file entirely in the browser. Embedded PNG/JPEG photos are decoded and re-encoded. No URLs in the file are fetched.                                                               |
| Other public website URLs            | **Local service required.** The protected local importer is documented in [provider/runtime](provider-and-runtime.md). Saving a URL does not import its contents.                                                       |
| Authenticated production integration | Not included. Public read access does not authenticate a store account or authorize writes.                                                                                                                             |

## Curated public facts

On **2026-10-05**, four anonymous requests to the storefront's documented Ajax product endpoint supplied public variant ids, options and prices. The public homepage identified USD as the active currency and supplied the bounded roast/flavor notes. Product images were inspected against package labels. No customer, cart, checkout, review identity or private economics are retained.

| Product                                                                   | Public variants and snapshot prices                                  | Approved pictured variant |
| ------------------------------------------------------------------------- | -------------------------------------------------------------------- | ------------------------- |
| [Solar Surge](https://cosmiccatcoffeeco.com/products/solar-surge)         | 12oz Standard / Whole Bean: $21; 2lb Standard / Whole Bean: $46 USD  | 12oz Standard (ground)    |
| [Candy Cane](https://cosmiccatcoffeeco.com/products/candy-cane)           | 12oz Standard / Whole Bean: $22; 1lb Standard / Whole Bean: $28 USD  | 12oz Whole Bean           |
| [Dark Knight](https://cosmiccatcoffeeco.com/products/dark-knight)         | 12oz Standard / Whole Bean: $21 USD                                  | 12oz Standard (ground)    |
| [Breakfast Blend](https://cosmiccatcoffeeco.com/products/breakfast-blend) | 12oz Standard / Whole Bean: $21; 1lb: $28; 2lb: $46 USD, both grinds | 12oz Whole Bean           |

These are snapshot prices, not current offers. Orbit does not infer a sale, guarantee availability or insert a price into creative automatically. Descriptions are concise paraphrases of public product context. The [catalog fixture](../src/fixtures/catalog.ts) records every included variant. The prior [two-product fixture](../src/fixtures/cosmic-cat.ts) remains intact for older campaigns and tests.

Only a photograph explicitly associated with the chosen variant can populate a product photo. Other sizes/grinds show **Matching photo needed** and require a matching owned upload or a pictured variant before composition. Logos and reference graphics cannot silently become product photographs. The fetched product-detail graphic for Candy Cane had a conflicting “Caramel Cream” label and was excluded. [Brand provenance](brand-provenance.md) records original assets and rights.

## Verified tokenless read boundary

Shopify's official [Storefront authentication documentation](https://shopify.dev/docs/storefronts/headless/building-with-the-storefront-api) currently permits tokenless product/collection queries with a 1,000 complexity limit. Its [2026-10 API reference](https://shopify.dev/docs/api/storefront/latest) documents the GraphQL POST endpoint; the separate [Ajax Product API](https://shopify.dev/docs/api/ajax/reference/product) documents `GET /products/{handle}.js`, used for curation. Reviewed **2026-10-05**.

A clean Chromium context at the actual `https://mchenry-power-dev.github.io` origin successfully made a tokenless product query to the public Cosmic Cat shop on **2026-10-05**: HTTP 200, product data, reported query cost 2. This established browser access for that shop, not arbitrary Shopify stores.

The implemented [public reader](../src/providers/catalog.ts) hardcodes the official shop endpoint `https://natures-nook-7929.myshopify.com/api/2026-10/graphql.json` and the four curated handles. It requests product descriptions, public variant options/prices and a public image reference. It sends no token, cookies or referrer, forbids redirects, has a 12-second timeout, limits the response to 120 KB and makes no image downloads or API mutations. It runs only from **Read public Cosmic Cat catalog**. Remote service adapters remain unavailable in static builds.

Blocked requests, invalid/oversized responses and empty results report failure and preserve the prior catalog. A partial product response merges returned products while retaining unlisted products. A truncated variant connection preserves unlisted variants and their earlier price/photo dates. Nothing silently replaces failed reads with unrelated sample results.

## Campaign consistency

Product identity is scoped as `storeId::productId`, with separate variant and image identity. A selected product carries cloned facts, description, photo, price, source mode and snapshot dates in its `BrandProduct.catalog` record. The store catalog is a separate optional field in existing schema-2 state; older campaigns are neither erased nor automatically rewritten.

- Browsing another store leaves the draft unchanged. Selecting a product explicitly replaces that draft's store context while keeping the instructions.
- Refreshing catalogs changes the catalog record only. **Apply catalog updates** explicitly copies current facts into a draft; saving the changed campaign plan invalidates affected asset approvals through existing dependency checks.
- Changing one variant or image preserves other selected products' snapshots. Missing or removed products retain their old campaign facts until the visitor removes/replaces them.
- Manually edited facts and owned/reference photo assignments are labeled campaign overrides. A changed photo clears its original catalog-image identity while retaining the store/product/variant snapshot. Selecting a matching catalog photo again changes photo provenance without discarding manual factual edits; the catalog itself remains unchanged.
- A complete imported snapshot can remove catalog products. A `partial` snapshot merges products; `variantsComplete: false` also preserves unlisted variants.
- Catalog writes use the same Orbit-specific IndexedDB state and serialized persistence as campaigns. A failed save preserves the prior in-memory state and reports the error. No global storage reset is used.

## Catalog file contract

Start with the downloadable [example JSON](../public/samples/catalog-template.json). It deliberately contains no photo or invented price. Confirm permission in **Catalog sources & import**, import the file, then add a matching owned photo in **Website, references & photos**, or embed an image as below.

```json
{
  "id": "front-photo",
  "src": "data:image/png;base64,REPLACE_WITH_OWNED_IMAGE_BYTES",
  "alt": "The standard variant, front package photograph",
  "classification": "product-photo",
  "variantIds": ["standard"]
}
```

Place this object in the product's `images` array and set the variant's `imageId` to `front-photo`. An optional `price` uses `{ "amount": "21.00", "currency": "USD" }`. Store/product URLs must be public HTTPS references; they are clickable references, not import commands. `logo` and `reference` classifications remain ineligible for composition.

Limits: 4 MB/file, 20 products, 12 variants/product, 5 option fields/variant, 3 images/product and 20 images/file. Images must be embedded PNG/JPEG data, at most 1.5 million encoded characters each. Existing raster validation rejects invalid headers, dimensions above 20 megapixels / 8,000 pixels and decode mismatches, then re-encodes to a maximum 1,600-pixel side. The catalog generates separate 320-pixel previews and stores data in IndexedDB, not localStorage. Active formats, remote images, duplicate ids, unknown image/variant references and unsupported schema versions are rejected before catalog replacement.

[Catalog unit tests](../tests/catalog.test.ts) cover identity collisions, variant/image matching, legacy data, immutable snapshots, partial/full refresh and removal, storage separation, input bounds and explicit network behavior. See [validation records](testing-and-evaluation.md) for integrated browser/release evidence.
