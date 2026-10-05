import { useState } from "react";
import type {
  StudioAsset,
  StudioCampaign,
  StudioVersion,
} from "../domain/studio";

/** Explicit edits become the recipe for this one new version. */
export default function VariantEditor({
  campaign,
  asset,
  version,
  busy,
  onRecompose,
}: {
  campaign: StudioCampaign;
  asset: StudioAsset;
  version: StudioVersion;
  busy: boolean;
  onRecompose: (value: NonNullable<StudioAsset["recipeOverrides"]>) => void;
}) {
  const recipe = version.recipe!;
  const [value, setValue] = useState<
    NonNullable<StudioAsset["recipeOverrides"]>
  >({
    artDirection: recipe.artDirection ?? "scene-led",
    composition: recipe.composition,
    headline: recipe.headline,
    cta: recipe.cta,
    textOverlay: recipe.textOverlay,
    spacing: recipe.spacing,
    ...(recipe.productIds.length === 1
      ? { productId: recipe.productIds[0] }
      : {}),
  });
  const products = campaign.brand.products.filter((p) =>
    campaign.brief.productIds.includes(p.id),
  );
  return (
    <details className="variant-editor advanced">
      <summary>Edit this placement</summary>
      <fieldset disabled={busy} className="variant-fields">
        <p className="helper">
          Recompose only this variant. Its new image needs a fresh approval;
          other outputs stay intact.
        </p>
        <label>
          Creative layout
          <select
            value={value.artDirection}
            onChange={(e) =>
              setValue({
                ...value,
                artDirection: e.target.value as "scene-led" | "editorial",
              })
            }
          >
            <option value="scene-led">Scene-led photography</option>
            <option value="editorial">Editorial split</option>
          </select>
        </label>
        <label>
          Approved product reference
          <select
            value={value.productId ?? "all"}
            onChange={(e) =>
              setValue({
                ...value,
                productId:
                  e.target.value === "all" ? undefined : e.target.value,
              })
            }
          >
            {products.length > 1 && (
              <option value="all">Selected family products</option>
            )}
            {products.map((p) => (
              <option value={p.id} key={p.id}>
                {p.name} · {p.size}
              </option>
            ))}
          </select>
        </label>
        <label>
          Composition alignment
          <select
            value={value.composition}
            onChange={(e) =>
              setValue({
                ...value,
                composition: e.target.value as
                  "product-right" | "product-center",
              })
            }
          >
            <option value="product-right">Offset within photo frame</option>
            <option value="product-center">Centered within photo frame</option>
          </select>
        </label>
        <label>
          Photo spacing
          <select
            value={String(value.spacing)}
            onChange={(e) =>
              setValue({ ...value, spacing: Number(e.target.value) })
            }
          >
            {[...new Set([0.06, 0.12, 0.18, recipe.spacing])]
              .sort()
              .map((n) => (
                <option key={n} value={n}>
                  {Math.round(n * 100)}%
                </option>
              ))}
          </select>
        </label>
        <label className="check">
          <input
            type="checkbox"
            checked={value.textOverlay}
            disabled={asset.placementId.startsWith("google-")}
            onChange={(e) =>
              setValue({ ...value, textOverlay: e.target.checked })
            }
          />
          Show headline and CTA in image
        </label>
        {asset.placementId.startsWith("google-") && (
          <p className="helper">
            Google image assets keep text in separate mapped fields.
          </p>
        )}
        {value.textOverlay && (
          <>
            <label>
              Variant headline
              <input
                maxLength={90}
                value={value.headline}
                onChange={(e) =>
                  setValue({ ...value, headline: e.target.value })
                }
              />
            </label>
            <label>
              Variant CTA
              <input
                maxLength={30}
                value={value.cta}
                onChange={(e) => setValue({ ...value, cta: e.target.value })}
              />
            </label>
          </>
        )}
        <button
          className="button"
          disabled={busy}
          onClick={() => onRecompose(value)}
        >
          Recompose selected variant
        </button>
      </fieldset>
    </details>
  );
}
