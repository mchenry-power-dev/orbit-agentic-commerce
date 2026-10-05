import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Icon } from "../components/Icon";
import type { StudioCampaign } from "../domain/studio";
import { studioStatus, studioVersion } from "../domain/studio";
import {
  buildHandoffPreview,
  defaultHandoffSelection,
  handoffCandidates,
  handoffDestinationNames,
  handoffLogo,
  handoffTargets,
  hasBundledHandoffLogo,
  type DemoHandoff,
  type HandoffDestination,
  type HandoffSelection,
} from "../domain/handoff";
import { buildDestinationExport, loadHandoffLogo } from "../export/studio";
import { handoffRules } from "../validation/handoff-rules";
import "./channel-handoff.css";

function download(bytes: Uint8Array, filename: string) {
  const url = URL.createObjectURL(
    new Blob([new Uint8Array(bytes)], { type: "application/zip" }),
  );
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export default function ChannelHandoff({
  campaign,
  onCreate,
  onClose,
  returnFocus,
}: {
  campaign: StudioCampaign;
  onCreate: (selection: HandoffSelection) => Promise<DemoHandoff>;
  onClose: () => void;
  returnFocus?: HTMLElement | null;
}) {
  const titleId = useId();
  const dialog = useRef<HTMLDialogElement>(null);
  const [selection, setSelection] = useState(() =>
    defaultHandoffSelection(
      campaign,
      campaign.brief.channels.find(
        (channel): channel is HandoffDestination => channel !== "email",
      ) ?? "website",
    ),
  );
  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<DemoHandoff>();
  const [logoBytes, setLogoBytes] = useState<Uint8Array>();
  const [logoError, setLogoError] = useState("");
  const busyRef = useRef(false);
  useEffect(() => {
    const trigger =
      returnFocus ?? (document.activeElement as HTMLElement | null);
    dialog.current?.showModal();
    return () => {
      dialog.current?.close();
      trigger?.focus();
    };
  }, []);
  useEffect(() => {
    if (!hasBundledHandoffLogo(campaign)) return;
    let active = true;
    loadHandoffLogo()
      .then((bytes) => {
        if (!active) return;
        setLogoBytes(bytes);
        setLogoError("");
        setSelection((value) => ({ ...value, logoVerified: true }));
      })
      .catch((reason: unknown) => {
        if (active)
          setLogoError(
            reason instanceof Error
              ? reason.message
              : "The bundled logo could not be verified.",
          );
      });
    return () => {
      active = false;
    };
  }, [campaign.brand.id]);
  const preview = useMemo(
    () => buildHandoffPreview(campaign, selection),
    [campaign, selection],
  );
  const candidates = handoffCandidates(
    campaign,
    selection.destination,
    selection.familyId,
  );
  const blocked = preview.findings.filter((finding) => finding.blocking);
  const matching = campaign.handoffs?.find(
    (record) => record.signature === preview.signature,
  );
  const completed = result?.signature === preview.signature ? result : matching;
  const historical =
    campaign.handoffs?.filter(
      (record) => record.destination === selection.destination,
    ) ?? [];
  const changeDestination = (destination: HandoffDestination) => {
    setSelection({
      ...defaultHandoffSelection(campaign, destination),
      logoVerified: !!logoBytes,
    });
    setResult(undefined);
    setError("");
    setStep(0);
  };
  const create = async () => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setError("");
    try {
      setResult(await onCreate(selection));
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "The handoff was not saved. Keep this tab open and retry.",
      );
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };
  const exportPackage = async () => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setError("");
    try {
      const packet = await buildDestinationExport(campaign, selection, {
        allowIncomplete: !preview.canComplete,
        handoff: completed,
        logoBytes,
      });
      download(packet.bytes, packet.filename);
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Download failed. Your campaign and saved handoffs are unchanged.",
      );
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };
  return (
    <dialog
      ref={dialog}
      className="channel-handoff"
      aria-labelledby={titleId}
      onCancel={(event) => {
        event.preventDefault();
        if (!busy) onClose();
      }}
    >
      <div className="handoff-heading">
        <div>
          <span className="eyebrow">Local demo · nothing is sent</span>
          <h2 id={titleId}>Preview channel publishing</h2>
          <p>
            Prepare a destination handoff with the exact versions you reviewed.
          </p>
        </div>
        <button
          className="icon-button"
          aria-label="Close channel publishing"
          disabled={busy}
          onClick={onClose}
        >
          <Icon name="close" />
        </button>
      </div>
      <nav className="handoff-steps" aria-label="Handoff steps">
        {["Destination", "Map assets", "Review & handoff"].map(
          (label, index) => (
            <button
              key={label}
              aria-current={step === index ? "step" : undefined}
              className={step === index ? "active" : ""}
              disabled={busy}
              onClick={() => setStep(index)}
            >
              <span>{index + 1}</span>
              {label}
            </button>
          ),
        )}
      </nav>
      <div className="handoff-content">
        {step === 0 && (
          <section aria-label="Choose destination">
            <div className="handoff-destinations">
              {(
                Object.keys(handoffDestinationNames) as HandoffDestination[]
              ).map((destination) => (
                <button
                  key={destination}
                  className={
                    selection.destination === destination ? "selected" : ""
                  }
                  aria-pressed={selection.destination === destination}
                  onClick={() => changeDestination(destination)}
                >
                  <Icon
                    name={
                      destination === "google"
                        ? "layers"
                        : destination === "meta"
                          ? "image"
                          : destination === "tiktok"
                            ? "file"
                            : "grid"
                    }
                  />
                  <strong>{handoffDestinationNames[destination]}</strong>
                  <small>
                    {destination === "google"
                      ? "PMax asset group"
                      : destination === "meta"
                        ? "Creative & ad drafts"
                        : destination === "tiktok"
                          ? "Video ad inputs"
                          : "Responsive hero package"}
                  </small>
                </button>
              ))}
            </div>
            <div className="handoff-target">
              <span className="status-pill">
                {preview.target?.accountName ?? "Demo account"}
              </span>
              <p>{preview.target?.context}</p>
              <label>
                Sample campaign target
                <select
                  value={selection.targetId}
                  onChange={(event) =>
                    setSelection({ ...selection, targetId: event.target.value })
                  }
                >
                  {handoffTargets
                    .filter(
                      (target) => target.destination === selection.destination,
                    )
                    .map((target) => (
                      <option key={target.id} value={target.id}>
                        {target.name}
                      </option>
                    ))}
                </select>
              </label>
              <small>
                Sample IDs begin with “demo”. No login, ad account, store theme
                or spend is connected.
              </small>
            </div>
          </section>
        )}
        {step === 1 && (
          <section aria-label="Map approved assets">
            <div className="handoff-fields">
              <label>
                Creative family
                <select
                  value={selection.familyId}
                  onChange={(event) => {
                    const familyId = event.target.value;
                    setSelection({
                      ...selection,
                      familyId,
                      assetIds: handoffCandidates(
                        campaign,
                        selection.destination,
                        familyId,
                      ).map((asset) => asset.id),
                    });
                  }}
                >
                  {campaign.plan.directions.map((direction) => (
                    <option key={direction.id} value={direction.id}>
                      {direction.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Destination URL
                <input
                  type="url"
                  value={selection.finalUrl}
                  onChange={(event) =>
                    setSelection({ ...selection, finalUrl: event.target.value })
                  }
                  placeholder="https://your-store.example/"
                />
              </label>
            </div>
            <p className="helper">
              Select the current versions to map. Unapproved, stale or invalid
              outputs remain excluded from downloads.
            </p>
            {candidates.length ? (
              <div className="handoff-asset-list">
                {candidates.map((asset) => {
                  const version = studioVersion(asset);
                  return (
                    <label key={asset.id} className="handoff-asset">
                      <input
                        type="checkbox"
                        checked={selection.assetIds.includes(asset.id)}
                        onChange={(event) =>
                          setSelection({
                            ...selection,
                            assetIds: event.target.checked
                              ? [...selection.assetIds, asset.id]
                              : selection.assetIds.filter(
                                  (id) => id !== asset.id,
                                ),
                          })
                        }
                      />
                      {version?.raster ? (
                        <img
                          src={
                            version.raster.previewDataUrl ??
                            version.raster.dataUrl
                          }
                          alt=""
                          width="56"
                          height="56"
                          loading="lazy"
                        />
                      ) : (
                        <span className="handoff-file-icon">
                          <Icon name="file" />
                        </span>
                      )}
                      <span>
                        <strong>{asset.title}</strong>
                        <small>
                          {version ? `Version ${version.number}` : "No version"}{" "}
                          ·{" "}
                          {studioStatus(asset) === "Approved"
                            ? "Approved version"
                            : studioStatus(asset)}
                          {asset.kind === "video" ? " · brief only" : ""}
                        </small>
                      </span>
                    </label>
                  );
                })}
              </div>
            ) : (
              <p className="handoff-warning">
                This campaign has no outputs for this destination. Add it in the
                brief, compose, and review the results.
              </p>
            )}
            {selection.destination === "google" && (
              <div className="handoff-brand">
                <h3>
                  {preview.target?.brandGuidelines
                    ? "Campaign-level"
                    : "Asset-group-level"}{" "}
                  brand assets
                </h3>
                {hasBundledHandoffLogo(campaign) ? (
                  <>
                    <div className="handoff-brand-preview">
                      <img
                        src={`${import.meta.env.BASE_URL}${handoffLogo.path.replace(/^\//, "")}`}
                        alt="Original Cosmic Cat Coffee Co. square logo"
                        width="88"
                        height="88"
                      />
                      <div>
                        <strong>{campaign.brand.name}</strong>
                        <p>
                          Original logo · {handoffLogo.width} ×{" "}
                          {handoffLogo.height} PNG
                        </p>
                        <small>
                          {logoBytes
                            ? "Source hash and file dimensions verified"
                            : logoError || "Checking bundled logo…"}
                        </small>
                      </div>
                    </div>
                    <label className="handoff-check">
                      <input
                        type="checkbox"
                        checked={selection.brandAssetsReviewed}
                        disabled={!logoBytes}
                        onChange={(event) =>
                          setSelection({
                            ...selection,
                            brandAssetsReviewed: event.target.checked,
                          })
                        }
                      />
                      I reviewed this local business name and logo
                    </label>
                    <small>
                      This records your local review. Advertiser verification,
                      account linkage and Google policy approval remain Not
                      checked.
                    </small>
                  </>
                ) : (
                  <p className="handoff-warning">
                    A reviewed business name and square logo are required. This
                    brand has no classified bundled logo; an incomplete asset
                    download is available.
                  </p>
                )}
                {preview.target?.retail && (
                  <p className="helper">
                    Demo retail context. Selecting a feed target does not waive
                    minimums for these supplied assets. Merchant Center and
                    listing groups are not connected.
                  </p>
                )}
              </div>
            )}
          </section>
        )}
        {step === 2 && (
          <section aria-label="Handoff readiness">
            <div className="handoff-readiness">
              <Icon name={preview.canComplete ? "check" : "alert"} />
              <div>
                <h3>
                  {preview.canComplete
                    ? "Ready for a local demo handoff"
                    : selection.destination === "tiktok"
                      ? "Video required"
                      : "Complete the required mapping"}
                </h3>
                <p>
                  {preview.assets.length} approved versions mapped ·{" "}
                  {blocked.length} blocking requirement
                  {blocked.length === 1 ? "" : "s"}
                </p>
              </div>
            </div>
            <div className="handoff-findings">
              {preview.findings.map((finding, index) => (
                <div
                  key={`${finding.code}-${index}`}
                  className={
                    finding.blocking ? "handoff-warning" : "handoff-note"
                  }
                >
                  <strong>{finding.status}</strong>
                  <p>{finding.message}</p>
                </div>
              ))}
            </div>
            <details className="handoff-mapping">
              <summary>
                Inspect destination structure and version references
              </summary>
              <pre>{JSON.stringify(preview.mapping, null, 2)}</pre>
            </details>
            <details className="handoff-rules">
              <summary>
                Rule sources · reviewed {handoffRules.reviewedAt}
              </summary>
              <p>
                Local file checks, human approval, authentication, platform
                policy and publication are separate states. Platform names
                identify the destination, not a partnership.
              </p>
              {handoffRules[selection.destination].sources.map((url) => (
                <a key={url} href={url} target="_blank" rel="noreferrer">
                  Official {handoffDestinationNames[selection.destination]}{" "}
                  reference <Icon name="arrow" size={12} />
                </a>
              ))}
            </details>
            {completed && (
              <div role="status" className="handoff-complete">
                <Icon name="check" />
                <div>
                  <strong>
                    Demo handoff created. Nothing was sent to{" "}
                    {selection.destination === "website"
                      ? "your website"
                      : handoffDestinationNames[selection.destination]}
                    .
                  </strong>
                  <p>{completed.id}</p>
                  <small>
                    The saved record retains these exact versions. Changes
                    require review and an explicit revised handoff.
                  </small>
                </div>
              </div>
            )}
            {!!historical.length && (
              <details className="handoff-history">
                <summary>Local handoff history ({historical.length})</summary>
                {historical.map((record) => (
                  <div key={record.id}>
                    <strong>{record.id}</strong>
                    <small>
                      {new Date(record.createdAt).toLocaleString()} ·{" "}
                      {record.assets.length} exact versions ·{" "}
                      {record.signature === preview.signature
                        ? "Current mapping"
                        : "Previous mapping; unchanged"}
                    </small>
                  </div>
                ))}
              </details>
            )}
          </section>
        )}
        {error && (
          <p role="alert" className="handoff-warning">
            {error}
          </p>
        )}
      </div>
      <footer className="handoff-footer">
        <button
          className="button"
          disabled={busy}
          onClick={() => (step ? setStep(step - 1) : onClose())}
        >
          {step ? "Back" : "Return to campaign"}
        </button>
        {step < 2 ? (
          <button className="button primary" onClick={() => setStep(step + 1)}>
            {step === 0 ? "Map assets" : "Review readiness"}
            <Icon name="arrow" size={16} />
          </button>
        ) : (
          <div className="handoff-final-actions">
            <button
              className="button"
              disabled={busy}
              onClick={() => void exportPackage()}
            >
              <Icon name="download" size={16} />
              {preview.canComplete
                ? "Download handoff package"
                : "Download incomplete assets"}
            </button>
            <button
              className="button primary"
              disabled={busy || !preview.canComplete || !!completed}
              onClick={() => void create()}
            >
              {busy
                ? "Preparing…"
                : completed
                  ? "Handoff saved"
                  : historical.length
                    ? "Create revised demo handoff"
                    : "Create local demo handoff"}
            </button>
          </div>
        )}
      </footer>
    </dialog>
  );
}
