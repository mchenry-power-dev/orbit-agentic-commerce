import { useId, useRef, useState } from "react";
import type { StudioBrand } from "../domain/studio";
import type { CatalogChoice, StoreCatalog } from "../domain/catalog";
import {
  catalogModeLabel,
  catalogPhotoSelectionBrand,
  catalogSelectionBrand,
  choicesFromBrand,
  matchingProductImages,
  replaceCatalog,
} from "../domain/catalog";
import { cosmicCatalog } from "../fixtures/catalog";
import { cosmicBrand } from "../fixtures/studio";
import { readCatalogFile, readCosmicPublicCatalog } from "../providers/catalog";
import { Icon } from "../components/Icon";
import "./catalog.css";

const photoUrl = (path: string) =>
  path.startsWith("/brand/")
    ? `${import.meta.env.BASE_URL}${path.slice(1)}`
    : path;
function money(value?: { amount: string; currency: string }) {
  if (!value) return "Price not supplied";
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: value.currency,
    }).format(Number(value.amount));
  } catch {
    return `${value.amount} ${value.currency}`;
  }
}
export default function CatalogPicker({
  catalogs,
  brand,
  selectedProductIds,
  onCatalogsChange,
  onSelection,
  onError,
  busy = false,
}: {
  catalogs: StoreCatalog[];
  brand: StudioBrand;
  selectedProductIds: string[];
  onCatalogsChange: (catalogs: StoreCatalog[]) => void | Promise<void>;
  onSelection: (
    brand: StudioBrand,
    productIds: string[],
  ) => void | Promise<void>;
  onError: (message: string) => void;
  busy?: boolean;
}) {
  const stores = catalogs.length ? catalogs : [cosmicCatalog()];
  const [storeId, setStoreId] = useState(
    stores.some((store) => store.id === brand.id) ? brand.id : stores[0].id,
  );
  const store =
    stores.find((candidate) => candidate.id === storeId) ?? stores[0];
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState(true);
  const [activeIndex, setActiveIndex] = useState(0);
  const [working, setWorking] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const listId = useId();
  const choices = choicesFromBrand(store, brand, selectedProductIds);
  const results = store.products.filter((product) =>
    `${product.title} ${product.description} ${product.facts.join(" ")}`
      .toLowerCase()
      .includes(search.toLowerCase()),
  );
  const blocked = busy || working;
  const stale = choices.some((choice) => {
    const selection = brand.products.find(
      (p) => p.catalog?.productId === choice.productId,
    )?.catalog;
    const product = store.products.find((p) => p.id === choice.productId);
    return (
      selection &&
      selection.snapshotAt !== (product?.snapshotAt ?? store.snapshotAt)
    );
  });
  const unavailable = choices.some(
    (choice) =>
      !store.products.some(
        (p) =>
          p.id === choice.productId &&
          p.variants.some((v) => v.id === choice.variantId),
      ),
  );
  async function action(operation: () => void | Promise<void>) {
    if (blocked) return;
    setWorking(true);
    setError("");
    setStatus("");
    try {
      await operation();
    } catch (cause) {
      const message =
        cause instanceof Error
          ? cause.message
          : "Catalog change failed. Previous work is preserved.";
      setError(message);
      onError(message);
    } finally {
      setWorking(false);
    }
  }
  async function apply(next: CatalogChoice[], refresh = false) {
    const context =
      store.id === "cosmic-cat" && brand.id !== store.id
        ? cosmicBrand()
        : brand;
    const selection = catalogSelectionBrand(store, next, context, !refresh);
    await onSelection(
      selection,
      selection.products.map((p) => p.id),
    );
  }
  function choose(productId: string) {
    void action(async () => {
      const product = store.products.find((p) => p.id === productId)!;
      if (choices.some((choice) => choice.productId === productId)) return;
      if (choices.length >= 4)
        throw new Error(
          "A campaign can compose up to four products. Remove a selected product before adding another.",
        );
      await apply([
        ...choices,
        { productId, variantId: product.defaultVariantId },
      ]);
      setStatus(
        `${product.title} added to this draft with its product facts and pictured variant.`,
      );
    });
  }
  async function updateCatalog(next: StoreCatalog) {
    await onCatalogsChange(replaceCatalog(stores, next));
    setStoreId(next.id);
    setSearch("");
    setExpanded(true);
    setStatus(
      `${next.name}: ${next.products.length} products loaded. ${next.completeness === "partial" ? "Partial refresh retained unlisted products. " : ""}Existing campaign facts and approvals are unchanged. Apply catalog updates to change this draft.`,
    );
  }
  return (
    <section className="catalog-picker" aria-label="Store catalog">
      <div className="catalog-title-row">
        <div>
          <span className="eyebrow">01 · Store & products</span>
          <h2>Start with what you sell.</h2>
        </div>
        <span className="catalog-mode">
          {catalogModeLabel[store.sourceType]}
        </span>
      </div>
      <label className="catalog-store-label">
        Store
        <select
          value={store.id}
          disabled={blocked}
          onChange={(event) => {
            setStoreId(event.target.value);
            setSearch("");
            setExpanded(true);
            setError("");
            setStatus(
              "Browsing a store does not change your draft. Select products to use its context.",
            );
          }}
        >
          {stores.map((candidate) => (
            <option key={candidate.id} value={candidate.id}>
              {candidate.name} · {catalogModeLabel[candidate.sourceType]}
            </option>
          ))}
        </select>
      </label>
      <div className="catalog-provenance">
        <span>Snapshot as of {store.snapshotAt.slice(0, 10)}</span>
        <details>
          <summary>About this catalog</summary>
          <p>{store.notice}</p>
          <p>
            Product facts are copied into your campaign. Catalog refreshes do
            not rewrite saved campaigns or approve new versions.
          </p>
          <a href={store.url} target="_blank" rel="noreferrer">
            Public storefront ↗
          </a>
        </details>
      </div>
      <div className="catalog-search">
        <label htmlFor={`${listId}-input`}>Find products</label>
        <input
          ref={inputRef}
          id={`${listId}-input`}
          role="combobox"
          aria-autocomplete="list"
          aria-controls={listId}
          aria-expanded={expanded}
          aria-activedescendant={
            expanded && results.length
              ? `${listId}-option-${Math.min(activeIndex, results.length - 1)}`
              : undefined
          }
          value={search}
          placeholder="Search coffee, roast or flavor…"
          autoComplete="off"
          disabled={blocked}
          onFocus={() => setExpanded(true)}
          onChange={(event) => {
            setSearch(event.target.value);
            setActiveIndex(0);
            setExpanded(true);
          }}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              setExpanded(false);
              event.preventDefault();
            }
            if (event.key === "ArrowDown" || event.key === "ArrowUp") {
              setExpanded(true);
              setActiveIndex((index) =>
                Math.max(
                  0,
                  Math.min(
                    results.length - 1,
                    index + (event.key === "ArrowDown" ? 1 : -1),
                  ),
                ),
              );
              event.preventDefault();
            }
            if (event.key === "Enter" && expanded && results.length) {
              choose(results[Math.min(activeIndex, results.length - 1)].id);
              event.preventDefault();
            }
          }}
        />
      </div>
      {expanded && (
        <div
          id={listId}
          role="listbox"
          aria-label="Catalog products"
          aria-multiselectable="true"
          className="catalog-results"
        >
          {results.map((product, index) => {
            const image = product.images.find(
              (image) => image.classification === "product-photo",
            );
            const selected = choices.some(
              (choice) => choice.productId === product.id,
            );
            return (
              <button
                type="button"
                role="option"
                id={`${listId}-option-${index}`}
                aria-selected={selected}
                aria-label={`${product.title}${selected ? ", selected" : ", select product"}`}
                disabled={blocked}
                key={product.id}
                className={`catalog-option ${selected ? "selected" : ""}`}
                onMouseEnter={() => setActiveIndex(index)}
                onClick={() => choose(product.id)}
              >
                {image ? (
                  <img
                    width={64}
                    height={64}
                    loading="lazy"
                    src={photoUrl(image.thumbnail ?? image.src)}
                    alt=""
                    onError={(event) => {
                      event.currentTarget.style.visibility = "hidden";
                    }}
                  />
                ) : (
                  <span className="catalog-no-image">No photo</span>
                )}
                <span>
                  <strong>{product.title}</strong>
                  <small>
                    {product.variants.length} variants ·{" "}
                    {product.facts[0] ?? "Catalog product"}
                  </small>
                </span>
                <span className="catalog-select-mark" aria-hidden="true">
                  {selected ? "✓" : "+"}
                </span>
              </button>
            );
          })}
          {!results.length && (
            <p className="catalog-empty">
              No products match “{search}”. Try a different name or flavor.
            </p>
          )}
        </div>
      )}
      {brand.id !== store.id && selectedProductIds.length > 0 && (
        <p className="catalog-warning">
          Your draft still uses {brand.name}. Selecting a product from{" "}
          {store.name} replaces the draft’s product context. Your instructions
          stay intact.
        </p>
      )}
      <div className="catalog-selected-chips" aria-label="Selected products">
        {brand.products
          .filter((product) => selectedProductIds.includes(product.id))
          .map((product) => (
            <span className="catalog-chip" key={product.id}>
              {product.name}
              <button
                type="button"
                disabled={blocked}
                aria-label={`Remove ${product.name} from selection`}
                onClick={() =>
                  void action(async () => {
                    if (brand.id === store.id)
                      await apply(
                        choices.filter(
                          (choice) =>
                            choice.productId !==
                            (product.catalog?.productId ??
                              product.id.replace(/^cosmic-/, "")),
                        ),
                      );
                    else
                      await onSelection(
                        {
                          ...brand,
                          products: brand.products.filter(
                            (p) => p.id !== product.id,
                          ),
                        },
                        selectedProductIds.filter((id) => id !== product.id),
                      );
                  })
                }
              >
                ×
              </button>
            </span>
          ))}
      </div>
      {stale && choices.length > 0 && (
        <div className="catalog-update">
          <p>
            Your selection keeps its earlier factual snapshot.{" "}
            {unavailable
              ? "A selected product or variant is no longer in this catalog. Remove it or choose a replacement to update."
              : "Apply current catalog facts and images to this draft when you are ready to review changes."}
          </p>
          <button
            className="button"
            disabled={blocked || unavailable}
            onClick={() =>
              void action(async () => {
                await apply(choices, true);
                setStatus(
                  "Catalog facts applied to this draft. Save the changed campaign plan to invalidate affected approvals and review new versions.",
                );
              })
            }
          >
            Apply catalog updates
          </button>
        </div>
      )}
      <div className="catalog-selected-details">
        {choices.map((choice) => {
          const product = store.products.find((p) => p.id === choice.productId);
          if (!product)
            return (
              <p className="catalog-warning" key={choice.productId}>
                A selected product was removed from this catalog. Its saved
                campaign facts remain available.
              </p>
            );
          const selected = brand.products.find(
            (p) =>
              p.catalog?.productId === product.id ||
              p.id === `cosmic-${product.id}`,
          );
          const variant = product.variants.find(
            (v) => v.id === choice.variantId,
          );
          const images = matchingProductImages(product, choice.variantId);
          const image =
            images.find((i) => i.id === choice.imageId) ?? images[0];
          const photoOverride = Boolean(
            selected?.catalog &&
            !selected.catalog.imageId &&
            (selected.photo || images.length),
          );
          const factsOverride = selected?.sourceIds.some((id) =>
            id.startsWith("visitor-facts-"),
          );
          return (
            <details
              key={product.id}
              className="catalog-product-detail"
              open={choices.length === 1 || undefined}
            >
              <summary>
                {product.title}
                <span>{selected?.catalog?.variantTitle ?? variant?.title}</span>
              </summary>
              <div className="catalog-detail-grid">
                <div className="catalog-selected-photo">
                  {selected?.photo ? (
                    <img
                      loading="lazy"
                      src={photoUrl(
                        selected.photo === image?.src
                          ? (image.thumbnail ?? selected.photo)
                          : selected.photo,
                      )}
                      width={160}
                      height={160}
                      alt={
                        photoOverride
                          ? `${product.title} · campaign photo override`
                          : (image?.alt ??
                            `${product.title} selected product photograph`)
                      }
                    />
                  ) : (
                    <span>Matching photo needed</span>
                  )}
                </div>
                <div>
                  <label>
                    Variant for {product.title}
                    <select
                      disabled={blocked}
                      value={choice.variantId}
                      onChange={(event) =>
                        void action(() =>
                          apply(
                            choices.map((item) =>
                              item.productId === product.id
                                ? {
                                    productId: item.productId,
                                    variantId: event.target.value,
                                  }
                                : item,
                            ),
                          ),
                        )
                      }
                    >
                      {!variant && (
                        <option value={choice.variantId}>
                          Saved variant · no longer listed
                        </option>
                      )}
                      {product.variants.map((v) => (
                        <option value={v.id} key={v.id}>
                          {v.title}
                          {matchingProductImages(product, v.id).length
                            ? " · photo available"
                            : " · matching photo needed"}
                        </option>
                      ))}
                    </select>
                  </label>
                  <small className="catalog-price">
                    {money(selected?.catalog?.price ?? variant?.price)} ·
                    snapshot price
                  </small>
                  {(images.length > 1 ||
                    (photoOverride && images.length > 0)) && (
                    <label>
                      Product image
                      <select
                        value={photoOverride ? "" : image?.id}
                        disabled={blocked}
                        onChange={(event) =>
                          void action(() =>
                            onSelection(
                              catalogPhotoSelectionBrand(
                                store,
                                { ...choice, imageId: event.target.value },
                                brand,
                              ),
                              selectedProductIds,
                            ),
                          )
                        }
                      >
                        {photoOverride && (
                          <option value="" disabled>
                            Campaign photo override
                          </option>
                        )}
                        {images.map((i) => (
                          <option key={i.id} value={i.id}>
                            {i.alt}
                          </option>
                        ))}
                      </select>
                    </label>
                  )}
                  {!selected?.photo && (
                    <p className="catalog-warning">
                      No approved photo depicts this variant. Choose a pictured
                      variant or add a matching owned photo in Website,
                      references & photos before composing.
                    </p>
                  )}
                </div>
              </div>
              {(photoOverride || factsOverride) && (
                <p className="catalog-override-note">
                  Campaign override: manually edited facts or photos apply to
                  this draft. The store catalog and its source snapshot are
                  unchanged.
                </p>
              )}
              <p>{selected?.description ?? product.description}</p>
              <ul>
                {(selected?.facts ?? product.facts).map((fact) => (
                  <li key={fact}>{fact}</li>
                ))}
              </ul>
              <a
                href={selected?.catalog?.productUrl ?? product.url}
                target="_blank"
                rel="noreferrer"
              >
                View public product ↗
              </a>
            </details>
          );
        })}
      </div>
      <details className="catalog-manage">
        <summary>Catalog sources & import</summary>
        <p>
          Read the four curated products from Shopify’s public catalog, or use
          an owned catalog file. Public access does not authorize a store
          account.
        </p>
        <div className="catalog-source-actions">
          <button
            className="button"
            disabled={blocked}
            onClick={() =>
              void action(async () => {
                await updateCatalog(await readCosmicPublicCatalog());
              })
            }
          >
            {working ? "Working…" : "Read public Cosmic Cat catalog"}
          </button>
          <button
            className="button quiet"
            disabled={blocked}
            onClick={() => void action(() => updateCatalog(cosmicCatalog()))}
          >
            Use bundled demo catalog
          </button>
        </div>
        <p className="catalog-local-service">
          <strong>Other website URLs · Local service required.</strong> This
          hosted demo does not read arbitrary storefront URLs. Use a catalog
          file here or the documented local importer in Website, references &
          photos.
        </p>
        <label className="catalog-confirm">
          <input
            type="checkbox"
            checked={confirmed}
            onChange={(event) => setConfirmed(event.target.checked)}
          />
          I have permission to use the product facts and images in my catalog
          file.
        </label>
        <input
          ref={fileRef}
          className="catalog-file"
          type="file"
          accept=".json,application/json"
          aria-label="Import catalog JSON"
          disabled={!confirmed || blocked}
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file)
              void action(async () => {
                await updateCatalog(await readCatalogFile(file));
                if (fileRef.current) fileRef.current.value = "";
              });
          }}
        />
        <small>
          Orbit catalog JSON · up to 4 MB / 20 products. Embedded PNG/JPEG only;
          no remote images or active markup.{" "}
          <a
            href={`${import.meta.env.BASE_URL}samples/catalog-template.json`}
            download
          >
            Download an example file
          </a>
          .
        </small>
        <p>
          <Icon name="layers" size={15} /> Account authentication and production
          integrations are not included.
        </p>
      </details>
      {status && (
        <p className="catalog-status" role="status">
          {status}
        </p>
      )}
      {error && (
        <p className="catalog-warning" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
