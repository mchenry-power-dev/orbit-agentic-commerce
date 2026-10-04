# Cosmic Cat brand snapshot

Orbit's V2 reference uses a small, owner-authorized snapshot of [Cosmic Cat Coffee Co.'s public storefront](https://cosmiccatcoffeeco.com/), retrieved on **2026-10-03**. It contains two products, four unchanged PNG assets, and a short collection-context record. The [typed snapshot](../src/fixtures/cosmic-cat.ts) records source URLs, content roles, dimensions, byte lengths and SHA-256 hashes. The [Studio adapter](../src/fixtures/studio.ts) keeps it separate from the preserved fictional Aster and Harbor fixtures.

## Facts and limits

The accessible homepage identifies **Solar Surge** as medium roast with bright citrus and warm flavor notes, and **Candy Cane** as medium roast with peppermint and sweet flavor notes. The downloaded, visually inspected packaging photos identify the pictured variants as Solar Surge **ground coffee** and Candy Cane **whole bean coffee**, each **12 oz (340 g)**. These facts apply to the pictured variants; they do not establish other sizes or grind options.

Individual product-page requests during snapshot curation encountered a connection-verification challenge. [Solar Surge's product URL](https://cosmiccatcoffeeco.com/products/solar-surge) and [Candy Cane's product URL](https://cosmiccatcoffeeco.com/products/candy-cane) were retained as navigational references; this snapshot's factual evidence comes from the accessible homepage and original packaging-image labels.

A later, separate protected local importer successfully retrieved Solar Surge's product page: one source document, six decoded PNG references and one rejected unsupported/non-HTTPS image reference. That operation is recorded in the [testing guide](testing-and-evaluation.md); its unconfirmed metadata and local-only results do not silently replace the curated snapshot or establish a public import service.

Prices, offers, discounts, stock, ratings, review identities, health claims, certifications, delivery promises and private economics are deliberately absent. No account, cart, checkout or tracking records are part of the snapshot. This is a bounded reference, not a full catalog download or a live inventory feed. A visitor's later import is a separate operation and must report its own actual result.

## Original assets

All four requests returned HTTP 200 with `image/png`; PNG signatures, dimensions and byte lengths were checked. The files are unchanged copies, not generated scenes or redrawn package mockups.

| Local asset                                                     | Size                      | Role                    | First-party source                                                                                                                             |
| --------------------------------------------------------------- | ------------------------- | ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| [solar-surge.png](../public/brand/cosmic-cat/solar-surge.png)   | 1200×1200;1,559,203 bytes | Protected product photo | [Original PNG](https://cosmiccatcoffeeco.com/cdn/shop/files/Solar_Surge_-_Ground_-_12oz.png?v=1730069644)                                      |
| [candy-cane.png](../public/brand/cosmic-cat/candy-cane.png)     | 1200×1200;1,432,885 bytes | Protected product photo | [Original PNG](https://cosmiccatcoffeeco.com/cdn/shop/files/CandyCane-Whole-12oz.png?v=1725840919)                                             |
| [logo.png](../public/brand/cosmic-cat/logo.png)                 | 1800×1800;443,582 bytes   | Original brand logo     | [Original PNG](https://cosmiccatcoffeeco.com/cdn/shop/files/Cosmic_Cat_Logo_No_Background.png?v=1725676682)                                    |
| [coffee-gifts.png](../public/brand/cosmic-cat/coffee-gifts.png) | 866×866;522,494 bytes     | Visual inspiration only | [Original PNG](https://cosmiccatcoffeeco.com/cdn/shop/collections/25Q3_3_Bag_Box_Banner_481dfaad-1128-4a84-88b3-1fd362bf895d.png?v=1782781297) |

The gift image shows different products and a birthday tag. It is excluded from the default campaign context and is not evidence of a Christmas bundle or the contents of either selected product. Asset-version query parameters in these source URLs identify the storefront's public image versions; no visitor tracking parameters are retained.

Preserve each product photo's complete frame and package identity when composing a campaign. Do not change label wording, sizes, proportions or product contents. The original Candy Cane scene includes festive lights; a no-holiday brief using that photo requires an alternative approved reference rather than removing those motifs from the protected image. The Christmas sample selects Solar Surge so the same verified product can support a contrasting summer composition.

## Attribution, permission and interpretation

**Attribution:** public brand material belongs to Cosmic Cat Coffee Co. and comes from cosmiccatcoffeeco.com. The repository owner explicitly authorized using its public products, packaging, photography, positioning and page material in the Orbit V2 reference. Attribution identifies the source; it does not establish an open license. No unrestricted third-party reuse or open-source asset license is asserted, and this document adds no repository license.

The default palette records observed homepage CSS tokens. “Warm, colorful and coffee-focused” is Orbit's editorial interpretation of the storefront, not a formal brand policy. Christmas gifting, summer styling and composition directions are campaign design choices. Local composition frames unchanged public product photos with graphics and copy; it does not claim to generate a new photographed scene or new product facts. How the storefront originally produced these images was not verified.

The reference remains useful without a service key. Live planning, importing or image generation must be labeled separately and verified through its configured runtime; the existence of this checked-in snapshot does not prove that any visitor URL was successfully imported.
