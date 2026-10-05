import type { Channel, StudioBrand, StudioBrief } from "../domain/studio";
import type { ReactNode } from "react";
import { placementSpecs } from "../validation/placements";
import { Icon } from "../components/Icon";

export const channelNames: Record<Channel, string> = {
  google: "Google Ads",
  meta: "Meta Ads",
  tiktok: "TikTok Ads",
  website: "Website",
  email: "Email",
};
export const photoUrl = (path: string) =>
  path.startsWith("/brand/")
    ? `${import.meta.env.BASE_URL}${path.slice(1)}`
    : path;
const list = (text: string) =>
  text
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);
const number = (text: string) => (text === "" ? null : Number(text));
export function BriefForm({
  brief,
  brand,
  onChange,
  onBrand,
  onPlan,
  onPreset,
  busy,
  catalog,
}: {
  brief: StudioBrief;
  brand: StudioBrand;
  onChange: (next: StudioBrief) => void;
  onBrand: () => void;
  onPlan: () => void;
  onPreset: () => void;
  busy: boolean;
  catalog?: ReactNode;
}) {
  const field = <K extends keyof StudioBrief>(key: K, value: StudioBrief[K]) =>
    onChange({ ...brief, [key]: value });
  const textList = (
    key: "keywords" | "requiredPhrases" | "prohibitedPhrases",
    text: string,
  ) =>
    onChange({
      ...brief,
      rawInputs: { ...brief.rawInputs, [key]: text },
      [key]:
        key === "keywords"
          ? text
              .split(",")
              .map((s) => s.trim())
              .filter(Boolean)
          : list(text),
    });
  function toggleChannel(channel: Channel) {
    const selected = brief.channels.includes(channel);
    onChange({
      ...brief,
      channels: selected
        ? brief.channels.filter((c) => c !== channel)
        : [...brief.channels, channel],
      placementIds: selected
        ? brief.placementIds.filter(
            (id) =>
              placementSpecs.find((p) => p.id === id)?.channel !== channel,
          )
        : [
            ...brief.placementIds,
            ...placementSpecs
              .filter((p) => p.channel === channel && !p.id.includes("story"))
              .map((p) => p.id),
          ],
    });
  }
  return (
    <div className="creation-grid">
      <section className="surface brief-surface">
        {catalog}
        <div className="section-title">
          <div>
            <span className="eyebrow">01 · Brief & brand</span>
            <h2>Start with the campaign idea.</h2>
          </div>
          <button className="button quiet" onClick={onPreset}>
            Use Christmas preset
          </button>
        </div>
        <label className="lead-label" htmlFor="campaign-description">
          Describe the campaign, the feeling you want, and what you want
          customers to do.
        </label>
        <textarea
          id="campaign-description"
          className="campaign-description"
          value={brief.description}
          placeholder="A minimalist summer launch, cool light, no holiday motifs…"
          onChange={(e) => field("description", e.target.value)}
          rows={5}
        />
        <div className="field-grid">
          <label>
            Campaign name
            <input
              value={brief.title}
              onChange={(e) => field("title", e.target.value)}
              placeholder="Give this idea a name"
            />
          </label>
          <label>
            Goal
            <select
              value={brief.goal}
              onChange={(e) => field("goal", e.target.value)}
            >
              <option>Introduce the collection</option>
              <option>Launch a product</option>
              <option>Reach gift buyers</option>
              <option>Refresh campaign creative</option>
            </select>
          </label>
        </div>
        <div className="context-tray">
          <span>
            <Icon name="layers" size={19} />
            <b>{brand.name}</b>
          </span>
          <small>
            {brand.products.length} products ·{" "}
            {brand.sources.filter((s) => s.included).length} selected sources
          </small>
          <button className="button" onClick={onBrand}>
            Website, references & photos
          </button>
        </div>
        {(!catalog || brand.products.some((product) => !product.catalog)) && (
          <fieldset className="product-fieldset">
            <legend>Products</legend>
            <div className="product-tray">
              {brand.products.map((product) => (
                <label
                  className={`product-choice ${brief.productIds.includes(product.id) ? "selected" : ""}`}
                  key={product.id}
                >
                  {product.photo ? (
                    <img src={photoUrl(product.photo)} alt={product.name} />
                  ) : (
                    <div className="empty-photo">Photo needed</div>
                  )}
                  <span>
                    <strong>{product.name}</strong>
                    <small>{product.size}</small>
                    <small>
                      {product.confirmed
                        ? "Confirmed product facts"
                        : "Facts need confirmation"}
                    </small>
                  </span>
                  <input
                    type="checkbox"
                    checked={brief.productIds.includes(product.id)}
                    onChange={(e) =>
                      field(
                        "productIds",
                        e.target.checked
                          ? [...brief.productIds, product.id]
                          : brief.productIds.filter((id) => id !== product.id),
                      )
                    }
                  />
                </label>
              ))}
            </div>
            {!brand.products.length && (
              <p>Add a product and an owned photo in the brand library.</p>
            )}
          </fieldset>
        )}
        <fieldset>
          <legend>Channels & placements</legend>
          <div className="channel-picker">
            {(Object.keys(channelNames) as Channel[]).map((channel) => (
              <button
                key={channel}
                type="button"
                className={`channel-pill ${brief.channels.includes(channel) ? "selected" : ""}`}
                aria-pressed={brief.channels.includes(channel)}
                onClick={() => toggleChannel(channel)}
              >
                <span className={`channel-symbol ${channel}`}>
                  {channel === "google"
                    ? "G"
                    : channel === "meta"
                      ? "∞"
                      : channel === "tiktok"
                        ? "♪"
                        : channel === "website"
                          ? "◎"
                          : "✉"}
                </span>
                {channelNames[channel]}
              </button>
            ))}
          </div>
          <details className="placement-options">
            <summary>
              Choose the formats ({brief.placementIds.length} selected)
            </summary>
            <div className="placement-choices">
              {placementSpecs
                .filter((p) => brief.channels.includes(p.channel))
                .map((p) => (
                  <label key={p.id}>
                    <input
                      type="checkbox"
                      checked={brief.placementIds.includes(p.id)}
                      onChange={(e) =>
                        field(
                          "placementIds",
                          e.target.checked
                            ? [...brief.placementIds, p.id]
                            : brief.placementIds.filter((id) => id !== p.id),
                        )
                      }
                    />
                    <span>
                      {p.name}
                      <small>
                        {p.width} × {p.height} ·{" "}
                        {p.media === "video"
                          ? "Video brief; motion needed"
                          : p.verification === "not-checked"
                            ? "Platform rules not checked"
                            : p.verification === "design-goal"
                              ? "Configurable design target"
                              : "Measured file rules"}
                      </small>
                    </span>
                  </label>
                ))}
            </div>
          </details>
        </fieldset>
        <details className="advanced">
          <summary>Audience, offer, timing & constraints</summary>
          <div className="field-grid">
            <label>
              Audience
              <input
                value={brief.audience}
                onChange={(e) => field("audience", e.target.value)}
                placeholder="Who should this reach?"
              />
            </label>
            <label>
              Merchant-confirmed offer
              <input
                value={brief.offer}
                onChange={(e) => field("offer", e.target.value)}
                placeholder="Optional; confirm the evidence"
              />
            </label>
            <label>
              Current tone
              <input
                value={brief.tone}
                onChange={(e) => field("tone", e.target.value)}
                placeholder="Current instructions take priority"
              />
            </label>
            <label>
              Campaign themes / keywords
              <input
                value={brief.rawInputs?.keywords ?? brief.keywords.join(", ")}
                onChange={(e) => textList("keywords", e.target.value)}
              />
            </label>
            <label>
              Start date
              <input
                type="date"
                value={brief.dates.start}
                onChange={(e) =>
                  field("dates", { ...brief.dates, start: e.target.value })
                }
              />
            </label>
            <label>
              End date
              <input
                type="date"
                value={brief.dates.end}
                onChange={(e) =>
                  field("dates", { ...brief.dates, end: e.target.value })
                }
              />
            </label>
            <label>
              Required phrases in ad copy
              <textarea
                value={
                  brief.rawInputs?.requiredPhrases ??
                  brief.requiredPhrases.join("\n")
                }
                onChange={(e) => textList("requiredPhrases", e.target.value)}
                placeholder="One whole phrase per line"
                rows={3}
              />
            </label>
            <label>
              Prohibited phrases
              <textarea
                value={
                  brief.rawInputs?.prohibitedPhrases ??
                  brief.prohibitedPhrases.join("\n")
                }
                onChange={(e) => textList("prohibitedPhrases", e.target.value)}
                rows={3}
              />
            </label>
          </div>
          <p className="helper">
            Required phrases apply to actual ad-copy fields. A phrase that
            exceeds a supported field limit needs a different placement or an
            explicit correction; it is never truncated.
          </p>
        </details>
        <details className="advanced">
          <summary>Budget planning & optional assumptions</summary>
          <p className="helper">
            These are your planning assumptions. No account spend changes. Ad
            budgets are separate from generation costs.
          </p>
          <div className="field-grid">
            <label>
              Currency
              <select
                value={brief.budget.currency}
                onChange={(e) =>
                  field("budget", { ...brief.budget, currency: e.target.value })
                }
              >
                <option>USD</option>
                <option>CAD</option>
                <option>EUR</option>
                <option>GBP</option>
              </select>
            </label>
            <label>
              Budget intent
              <select
                value={brief.budget.intent}
                onChange={(e) =>
                  field("budget", {
                    ...brief.budget,
                    intent: e.target.value as "daily" | "lifetime",
                  })
                }
              >
                <option value="lifetime">Lifetime over planning period</option>
                <option value="daily">Daily within planning period</option>
              </select>
            </label>
            <label>
              Total budget
              <input
                type="number"
                min="0"
                step="0.01"
                value={brief.budget.total ?? ""}
                onChange={(e) =>
                  field("budget", {
                    ...brief.budget,
                    total: number(e.target.value),
                  })
                }
              />
            </label>
            <label>
              Period starts
              <input
                type="date"
                value={brief.budget.periodStart}
                onChange={(e) =>
                  field("budget", {
                    ...brief.budget,
                    periodStart: e.target.value,
                  })
                }
              />
            </label>
            <label>
              Period ends
              <input
                type="date"
                value={brief.budget.periodEnd}
                onChange={(e) =>
                  field("budget", {
                    ...brief.budget,
                    periodEnd: e.target.value,
                  })
                }
              />
            </label>
            {brief.channels.map((channel) => (
              <label key={channel}>
                {channelNames[channel]} allocation ({brief.budget.intent})
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={brief.budget.allocations[channel] ?? ""}
                  onChange={(e) =>
                    field("budget", {
                      ...brief.budget,
                      allocations: {
                        ...brief.budget.allocations,
                        [channel]: number(e.target.value),
                      },
                    })
                  }
                />
              </label>
            ))}
            <label>
              Target CPA assumption
              <input
                type="number"
                min="0"
                step="0.01"
                value={brief.budget.targetCpa ?? ""}
                onChange={(e) =>
                  field("budget", {
                    ...brief.budget,
                    targetCpa: number(e.target.value),
                  })
                }
              />
            </label>
            <label>
              Target ROAS assumption
              <input
                type="number"
                min="0"
                step="0.1"
                value={brief.budget.targetRoas ?? ""}
                onChange={(e) =>
                  field("budget", {
                    ...brief.budget,
                    targetRoas: number(e.target.value),
                  })
                }
              />
            </label>
            <label>
              Margin % assumption
              <input
                type="number"
                min="0"
                max="100"
                value={brief.budget.marginPercent ?? ""}
                onChange={(e) =>
                  field("budget", {
                    ...brief.budget,
                    marginPercent: number(e.target.value),
                  })
                }
              />
            </label>
          </div>
        </details>
        <details className="advanced">
          <summary>Website & email design dimensions</summary>
          <div className="field-grid">
            {(["desktop", "mobile"] as const).map((device) => (
              <label key={device}>
                Website {device} width × height
                <span className="dimension-fields">
                  {[0, 1].map((index) => (
                    <input
                      key={index}
                      type="number"
                      aria-label={`${device} ${index ? "height" : "width"}`}
                      value={
                        brief.rawInputs?.[
                          `${device}-${index ? "height" : "width"}`
                        ] ?? brief.websiteSize[device][index]
                      }
                      onChange={(e) => {
                        const size = [...brief.websiteSize[device]] as [
                          number,
                          number,
                        ];
                        size[index] = Number(e.target.value);
                        onChange({
                          ...brief,
                          rawInputs: {
                            ...brief.rawInputs,
                            [`${device}-${index ? "height" : "width"}`]:
                              e.target.value,
                          },
                          websiteSize: { ...brief.websiteSize, [device]: size },
                        });
                      }}
                    />
                  ))}
                </span>
              </label>
            ))}
            <label>
              Email width × height
              <span className="dimension-fields">
                {[0, 1].map((index) => (
                  <input
                    key={index}
                    type="number"
                    aria-label={`Email ${index ? "height" : "width"}`}
                    value={
                      brief.rawInputs?.[
                        `email-${index ? "height" : "width"}`
                      ] ?? brief.emailSize[index]
                    }
                    onChange={(e) => {
                      const size = [...brief.emailSize] as [number, number];
                      size[index] = Number(e.target.value);
                      onChange({
                        ...brief,
                        rawInputs: {
                          ...brief.rawInputs,
                          [`email-${index ? "height" : "width"}`]:
                            e.target.value,
                        },
                        emailSize: size,
                      });
                    }}
                  />
                ))}
              </span>
            </label>
          </div>
        </details>
        <div className="step-action">
          <span className="helper">
            Local autosave · your latest text is used immediately
          </span>
          <button className="button primary" disabled={busy} onClick={onPlan}>
            Review creative plan <Icon name="arrow" size={16} />
          </button>
        </div>
      </section>
      <aside className="brief-preview surface">
        <span className="eyebrow">The foundation</span>
        <h3>Real product. Shared direction.</h3>
        {brand.products.find((p) => brief.productIds.includes(p.id))?.photo && (
          <img
            className="foundation-photo"
            src={photoUrl(
              brand.products.find((p) => brief.productIds.includes(p.id))!
                .photo,
            )}
            alt="Selected product photography"
          />
        )}
        <div className="palette">
          {brand.palette.map((color) => (
            <span key={color} style={{ background: color }} title={color} />
          ))}
        </div>
        <p>{brand.tagline}</p>
        <small>
          Original photography and confirmed facts stay protected across every
          placement.
        </small>
        <div className="creation-flow">
          Brief & brand <Icon name="arrow" size={14} /> Creative plan{" "}
          <Icon name="arrow" size={14} /> Review & export
        </div>
      </aside>
    </div>
  );
}
