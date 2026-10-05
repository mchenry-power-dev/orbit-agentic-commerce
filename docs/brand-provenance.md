# Cosmic Cat brand snapshot

Orbit's V2 reference uses a small, owner-authorized snapshot of [Cosmic Cat Coffee Co.'s public storefront](https://cosmiccatcoffeeco.com/). The original **2026-10-03** snapshot contains two products, four unchanged PNG assets, and a short collection-context record. Its [typed snapshot](../src/fixtures/cosmic-cat.ts) remains intact for earlier campaigns and records source URLs, roles, dimensions, byte lengths and SHA-256 hashes. The **2026-10-05** [catalog](catalog.md) extends the curated set to four products with two further original photographs, real public variants and dated USD prices. This remains separate from the preserved fictional Aster and Harbor fixtures.

## Facts and limits

The accessible homepage identifies **Solar Surge** as medium roast with bright citrus and warm flavor notes, and **Candy Cane** as medium roast with peppermint and sweet flavor notes. The downloaded, visually inspected packaging photos identify the pictured variants as Solar Surge **ground coffee** and Candy Cane **whole bean coffee**, each **12 oz (340 g)**. These facts apply to the pictured variants; they do not establish other sizes or grind options.

Individual product-page requests during snapshot curation encountered a connection-verification challenge. [Solar Surge's product URL](https://cosmiccatcoffeeco.com/products/solar-surge) and [Candy Cane's product URL](https://cosmiccatcoffeeco.com/products/candy-cane) were retained as navigational references; this snapshot's factual evidence comes from the accessible homepage and original packaging-image labels.

A later, separate protected local importer successfully retrieved Solar Surge's product page: one source document, six decoded PNG references and one rejected unsupported/non-HTTPS image reference. That operation is recorded in the [testing guide](testing-and-evaluation.md); its unconfirmed metadata and local-only results do not silently replace the curated snapshot or establish a public import service.

The original two-product fixture omits prices. The current catalog records dated public USD prices and variants from four anonymous public product requests on **2026-10-05**, with exact scope in [catalog provenance](catalog.md). Offers, discounts, stock, ratings, review identities, health claims, certifications, delivery promises and private economics are deliberately absent. No account, cart, checkout or tracking records are part of the snapshot. This is a bounded reference, not a full catalog download or a live inventory feed. A visitor's later public read or import is a separate operation and must report its own actual result.

## Original assets

All four requests returned HTTP 200 with `image/png`; PNG signatures, dimensions and byte lengths were checked. The files are unchanged copies, not generated scenes or redrawn package mockups.

| Local asset                                                     | Size                      | Role                    | First-party source                                                                                                                             |
| --------------------------------------------------------------- | ------------------------- | ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| [solar-surge.png](../public/brand/cosmic-cat/solar-surge.png)   | 1200×1200;1,559,203 bytes | Protected product photo | [Original PNG](https://cosmiccatcoffeeco.com/cdn/shop/files/Solar_Surge_-_Ground_-_12oz.png?v=1730069644)                                      |
| [candy-cane.png](../public/brand/cosmic-cat/candy-cane.png)     | 1200×1200;1,432,885 bytes | Protected product photo | [Original PNG](https://cosmiccatcoffeeco.com/cdn/shop/files/CandyCane-Whole-12oz.png?v=1725840919)                                             |
| [logo.png](../public/brand/cosmic-cat/logo.png)                 | 1800×1800;443,582 bytes   | Original brand logo     | [Original PNG](https://cosmiccatcoffeeco.com/cdn/shop/files/Cosmic_Cat_Logo_No_Background.png?v=1725676682)                                    |
| [coffee-gifts.png](../public/brand/cosmic-cat/coffee-gifts.png) | 866×866;522,494 bytes     | Visual inspiration only | [Original PNG](https://cosmiccatcoffeeco.com/cdn/shop/collections/25Q3_3_Bag_Box_Banner_481dfaad-1128-4a84-88b3-1fd362bf895d.png?v=1782781297) |

The gift image shows different products and a birthday tag. It is excluded from the default campaign context and is not evidence of a Christmas bundle or the contents of either selected product. Asset-version query parameters in these source URLs identify the storefront's public image versions; no visitor tracking parameters are retained.

Preserve each product photo's complete frame and package identity when composing a campaign. Do not change label wording, sizes, proportions or product contents. The original Candy Cane scene includes festive lights; a no-holiday brief using that photo requires an alternative approved reference rather than removing those motifs from the protected image. The upgraded Christmas sample demonstrates Candy Cane in the scene-led family and Solar Surge in the editorial family. Solar Surge can also support a contrasting summer composition.

## Catalog additions · 2026-10-05

Only two additional original product scenes were included. Both are 1200×1200 PNGs copied unchanged from public product image references and inspected at full size. Dark Knight depicts **12oz Standard / ground**; Breakfast Blend depicts **12oz Whole Bean**. Variant identities are mapped explicitly; another size or grind is never represented by silently reusing these packages.

| Asset                                                                 | Public source                                                                                                                           | SHA-256                                                            |
| --------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| [dark-knight.png](../public/brand/cosmic-cat/dark-knight.png)         | [Original PNG](https://cosmiccatcoffeeco.com/cdn/shop/files/Dark_Knight_-_Ground_-_12oz.png?v=1730069644)                               | `63ac7a875a42c57e4b231fe668e229f8721f3fb4dd5a56d4639e843c249f6ed5` |
| [breakfast-blend.png](../public/brand/cosmic-cat/breakfast-blend.png) | [Original PNG](https://cosmiccatcoffeeco.com/cdn/shop/files/Breakfast-Whole-12oz_da39e1c0-cb4e-4ae7-945d-6c2b8b7a45af.png?v=1725921026) | `7e2c64ba88f5a7e43f49a2f8988f84112cc07144a9cf3e72029a37d38104aa21` |

Four `*-thumb.jpg` files are 320×320 resized JPEG previews derived from the corresponding originals using sharp at quality 82. They alter resolution/compression only and are used in the catalog; full originals feed compositions. Original rights and attribution apply equally to these derivatives. Product-detail reference graphics were inspected but not added: Candy Cane's detail graphic had a conflicting “Caramel Cream” heading. The logo and gifting inspiration remain in their own classifications.

## Attribution, permission and interpretation

**Attribution:** public brand material belongs to Cosmic Cat Coffee Co. and comes from cosmiccatcoffeeco.com. The repository owner explicitly authorized using its public products, packaging, photography, positioning and page material in the Orbit V2 reference. Attribution identifies the source; it does not establish an open license. No unrestricted third-party reuse or open-source asset license is asserted, and this document adds no repository license.

The default palette records observed homepage CSS tokens. “Warm, colorful and coffee-focused” is Orbit's editorial interpretation of the storefront, not a formal brand policy. Christmas gifting, summer styling and composition directions are campaign design choices. Local composition frames unchanged public product photos with graphics and copy; it does not claim to generate a new photographed scene or new product facts. How the storefront originally produced these images was not verified.

The reference remains useful without a service key. Live planning, importing or image generation must be labeled separately and verified through its configured runtime; the existence of this checked-in snapshot does not prove that any visitor URL was successfully imported.
