import { useRef, useState } from "react";
import type { StudioBrand } from "../domain/studio";
import { withProductPhotoOverride } from "../domain/catalog";
import { readOwnedPhoto } from "../providers/uploads";
import { photoUrl } from "./StudioForms";

export default function BrandLibrary({
  brand,
  onChange,
  onSave,
  onImport,
  importEnabled,
  busy,
  onError,
  onDelete,
}: {
  brand: StudioBrand;
  onChange: (brand: StudioBrand) => void;
  onSave: () => void;
  onImport: (urls: string[]) => Promise<void>;
  importEnabled: boolean;
  busy: boolean;
  onError: (message: string) => void;
  onDelete: () => void;
}) {
  const [links, setLinks] = useState(brand.website);
  const brandRef = useRef(brand);
  brandRef.current = brand;
  function updateProduct(
    id: string,
    patch: Partial<StudioBrand["products"][number]>,
  ) {
    const existing = brand.products.find((p) => p.id === id)!;
    const factualEdit =
      patch.name !== undefined ||
      patch.size !== undefined ||
      patch.description !== undefined;
    const factId = `visitor-facts-${id}`;
    const next = { ...existing, ...patch };
    if (factualEdit)
      next.sourceIds = [
        ...existing.sourceIds.filter(
          (sourceId) =>
            !brand.sources.some(
              (s) => s.id === sourceId && s.role === "product-fact",
            ),
        ),
        factId,
      ];
    const factSource: StudioBrand["sources"][number] = {
      id: factId,
      role: "product-fact",
      retrievedAt: new Date().toISOString(),
      included: true,
      title: "Visitor-corrected facts · confirmation required",
      text: [next.name, next.size, next.description, ...next.facts]
        .filter(Boolean)
        .join("\n"),
    };
    onChange({
      ...brand,
      products: brand.products.map((p) => (p.id === id ? next : p)),
      sources: factualEdit
        ? [...brand.sources.filter((s) => s.id !== factId), factSource]
        : brand.sources,
    });
  }
  async function upload(file: File | undefined, productId: string) {
    if (!file) return;
    try {
      if (brand.sources.filter((s) => s.image?.startsWith("data:")).length >= 6)
        throw new Error(
          "Keep this local library to six owned uploads; remove an unused source before adding another.",
        );
      const photo = await readOwnedPhoto(file);
      const current = brandRef.current;
      if (current.id !== brand.id)
        throw new Error(
          "The brand changed during decoding. Choose the photo again for the current brand.",
        );
      const id = crypto.randomUUID();
      onChange({
        ...current,
        products: current.products.map((p) =>
          p.id === productId
            ? {
                ...withProductPhotoOverride(p, photo),
                sourceIds: [...p.sourceIds, id],
                confirmed: false,
              }
            : p,
        ),
        sources: [
          ...current.sources,
          {
            id,
            retrievedAt: new Date().toISOString(),
            role: "product-photo",
            title: "Visitor-owned photo · locally decoded and re-encoded",
            included: true,
            image: photo,
          },
        ],
      });
    } catch (error) {
      onError(error instanceof Error ? error.message : "Photo upload failed.");
    }
  }
  function addProduct() {
    if (brand.products.length >= 6) {
      onError("Keep this curated library to six products.");
      return;
    }
    const id = crypto.randomUUID(),
      sourceId = crypto.randomUUID();
    onChange({
      ...brand,
      products: [
        ...brand.products,
        {
          id,
          name: "",
          description: "",
          facts: [],
          size: "",
          photo: "",
          sourceIds: [sourceId],
          confirmed: false,
        },
      ],
      sources: [
        ...brand.sources,
        {
          id: sourceId,
          retrievedAt: new Date().toISOString(),
          role: "product-fact",
          title: "Visitor-supplied product facts · confirmation required",
          included: true,
          text: "",
        },
      ],
    });
  }
  return (
    <div className="brand-workspace">
      <section className="surface">
        <div className="section-title">
          <div>
            <span className="eyebrow">Brand library</span>
            <h2>Your creative foundation.</h2>
          </div>
          <button className="button primary" disabled={busy} onClick={onSave}>
            Save brand & return
          </button>
        </div>
        <div className="field-grid">
          <label>
            Brand name
            <input
              value={brand.name}
              onChange={(e) => onChange({ ...brand, name: e.target.value })}
            />
          </label>
          <label>
            Public website
            <input
              type="url"
              value={brand.website}
              onChange={(e) => onChange({ ...brand, website: e.target.value })}
              placeholder="https://yourbrand.com"
            />
          </label>
          <label>
            Brand tone
            <input
              value={brand.tone}
              onChange={(e) => onChange({ ...brand, tone: e.target.value })}
            />
          </label>
          <label>
            Positioning / tagline
            <input
              value={brand.tagline}
              onChange={(e) => onChange({ ...brand, tagline: e.target.value })}
            />
          </label>
        </div>
        <div className="palette-editor">
          <span>Confirmed palette</span>
          {brand.palette.map((color, i) => (
            <label key={i}>
              <input
                type="color"
                value={/^#[a-f0-9]{6}$/i.test(color) ? color : "#27253e"}
                aria-label={`Brand color ${i + 1}`}
                onChange={(e) =>
                  onChange({
                    ...brand,
                    palette: brand.palette.map((c, index) =>
                      index === i ? e.target.value : c,
                    ),
                  })
                }
              />
              <small>{color}</small>
            </label>
          ))}
        </div>
        <details className="advanced">
          <summary>
            <span>Import a public website or reference</span>
            {!importEnabled && <small> · Local service required</small>}
          </summary>
          <p className="helper">
            Website import uses the documented local service to read public
            pages and raster images. Imported facts stay unconfirmed until you
            review them. A saved URL alone is not an imported reference.
          </p>
          <label>
            Website, product, collection or reference URLs
            <textarea
              rows={3}
              value={links}
              onChange={(e) => setLinks(e.target.value)}
              placeholder="One public HTTPS URL per line; up to three"
            />
          </label>
          <button
            className="button"
            disabled={busy || !importEnabled}
            onClick={() =>
              void onImport(
                links
                  .split("\n")
                  .map((s) => s.trim())
                  .filter(Boolean),
              )
            }
          >
            Import public pages
          </button>
          {!importEnabled && (
            <p className="helper">
              <strong>Local service required</strong>. Website import is
              unavailable in the hosted demo. Use the bundled Cosmic Cat brand
              context, paste confirmed product facts, or upload your own
              PNG/JPEG below. Saving a website URL only records the link.
            </p>
          )}
        </details>
      </section>
      <section className="surface">
        <div className="section-title">
          <div>
            <h2>Product facts & protected photos</h2>
            <p>
              Confirm the exact product and photo association before creation.
            </p>
          </div>
          <button className="button" onClick={addProduct}>
            Add product
          </button>
        </div>
        <div className="brand-products">
          {brand.products.map((product) => (
            <article key={product.id} className="brand-product">
              {product.photo ? (
                <img
                  src={photoUrl(product.photo)}
                  alt={product.name || "Owned product photo"}
                />
              ) : (
                <div className="empty-photo">Upload a photo</div>
              )}
              <div>
                <label>
                  Product name
                  <input
                    value={product.name}
                    onChange={(e) =>
                      updateProduct(product.id, {
                        name: e.target.value,
                        confirmed: false,
                      })
                    }
                  />
                </label>
                <label>
                  Package size / variant
                  <input
                    value={product.size}
                    onChange={(e) =>
                      updateProduct(product.id, {
                        size: e.target.value,
                        confirmed: false,
                      })
                    }
                  />
                </label>
                <label>
                  Confirmed factual description
                  <textarea
                    rows={3}
                    value={product.description}
                    onChange={(e) =>
                      updateProduct(product.id, {
                        description: e.target.value,
                        facts: [e.target.value],
                        confirmed: false,
                      })
                    }
                  />
                </label>
                <label className="upload-button">
                  Upload owned PNG/JPEG
                  <input
                    type="file"
                    accept="image/png,image/jpeg"
                    aria-label={`Upload photo for ${product.name || "new product"}`}
                    onChange={(e) => {
                      void upload(e.target.files?.[0], product.id);
                      e.target.value = "";
                    }}
                  />
                </label>
                {brand.sources.some((s) => s.image) && (
                  <label>
                    Product photo source
                    <select
                      value={
                        brand.sources.find((s) => s.image === product.photo)
                          ?.id ?? ""
                      }
                      onChange={(e) => {
                        const source = brand.sources.find(
                          (s) => s.id === e.target.value,
                        );
                        onChange({
                          ...brand,
                          products: brand.products.map((p) =>
                            p.id === product.id
                              ? {
                                  ...withProductPhotoOverride(
                                    p,
                                    source?.image ?? "",
                                  ),
                                  sourceIds: [
                                    ...p.sourceIds.filter(
                                      (id) =>
                                        !brand.sources.some(
                                          (s) => s.id === id && s.image,
                                        ),
                                    ),
                                    ...(source ? [source.id] : []),
                                  ],
                                  confirmed: false,
                                }
                              : p,
                          ),
                          sources: brand.sources.map((s) =>
                            s.id === source?.id
                              ? { ...s, role: "product-photo", included: true }
                              : s,
                          ),
                        });
                      }}
                    >
                      <option value="">Choose a verified product photo</option>
                      {brand.sources
                        .filter((s) => s.image)
                        .map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.title} · {s.id.slice(0, 10)}
                          </option>
                        ))}
                    </select>
                  </label>
                )}
                <label className="check-line">
                  <input
                    type="checkbox"
                    checked={product.confirmed}
                    onChange={(e) =>
                      updateProduct(product.id, { confirmed: e.target.checked })
                    }
                  />
                  I confirm these facts and may use this photo.
                </label>
              </div>
            </article>
          ))}
        </div>
      </section>
      <section className="surface">
        <h2>Sources that guide the work</h2>
        <p className="helper">
          Product facts constrain the output. Visual inspiration is a separate
          role. Exclude unrelated sources.
        </p>
        <div className="source-grid">
          {brand.sources.map((source) => (
            <article className="source-card" key={source.id}>
              {source.image && (
                <img src={photoUrl(source.image)} alt={source.title} />
              )}
              <div>
                <label className="check-line">
                  <input
                    type="checkbox"
                    checked={source.included}
                    onChange={(e) =>
                      onChange({
                        ...brand,
                        sources: brand.sources.map((s) =>
                          s.id === source.id
                            ? { ...s, included: e.target.checked }
                            : s,
                        ),
                      })
                    }
                  />
                  <strong>{source.title}</strong>
                </label>
                <small>
                  {source.role} · retrieved {source.retrievedAt.slice(0, 10)}
                </small>
                <label>
                  Content role
                  <select
                    value={source.role}
                    onChange={(e) =>
                      onChange({
                        ...brand,
                        sources: brand.sources.map((s) =>
                          s.id === source.id
                            ? { ...s, role: e.target.value as typeof s.role }
                            : s,
                        ),
                      })
                    }
                  >
                    <option value="product-fact">Product facts</option>
                    <option value="product-photo">
                      Verified product photo
                    </option>
                    <option value="visual-inspiration">
                      Visual inspiration
                    </option>
                    <option value="page">Landing/page reference</option>
                  </select>
                </label>
                {source.url && (
                  <a href={source.url} target="_blank" rel="noreferrer">
                    View source
                  </a>
                )}
                <details>
                  <summary>Source content</summary>
                  <p>
                    {source.text ||
                      "Raster photograph; inspect the product and packaging directly."}
                  </p>
                </details>
                <button
                  className="button quiet"
                  onClick={() =>
                    onChange({
                      ...brand,
                      sources: brand.sources.filter((s) => s.id !== source.id),
                      products: brand.products.map((p) =>
                        p.sourceIds.includes(source.id)
                          ? {
                              ...withProductPhotoOverride(
                                p,
                                source.image && p.photo === source.image
                                  ? ""
                                  : p.photo,
                              ),
                              sourceIds: p.sourceIds.filter(
                                (id) => id !== source.id,
                              ),
                              confirmed: false,
                            }
                          : p,
                      ),
                    })
                  }
                >
                  Remove source
                </button>
              </div>
            </article>
          ))}
        </div>
      </section>
      <section className="surface">
        <h2>Local data</h2>
        <p>
          Your saved brand, facts and uploads stay in this browser unless you
          request a configured service operation. Delete campaigns using this
          brand before deleting its library and draft uploads.
        </p>
        <button className="button quiet" disabled={busy} onClick={onDelete}>
          Delete local brand
        </button>
      </section>
    </div>
  );
}
