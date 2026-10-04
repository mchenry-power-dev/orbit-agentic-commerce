import {
  Children,
  cloneElement,
  isValidElement,
  useEffect,
  useRef,
  useState,
} from "react";
import { Icon } from "../components/Icon";
import { OrbitEngine } from "../orchestration";
import { IndexedDbPersistence } from "../persistence";
import {
  buildContext,
  createSampleBrief,
  getMerchant,
  presets,
} from "../fixtures";
import { currentVersion, initialState, isCurrent } from "../domain";
import type {
  AppState,
  AssetContent,
  AssetRecord,
  Campaign,
  CampaignBrief,
  CopyContent,
  ImageContent,
} from "../domain";
import { buildCampaignBrief, buildExport, exportGate } from "../export";

type View = "campaigns" | "brand" | "history";
type Tab = "brief" | "portfolio" | "landing" | "activity";
const filters = [
  "All assets",
  "Images",
  "Copy",
  "Landing page",
  "Video briefs",
  "Plan",
];
const kindFilter: Record<string, string> = {
  Images: "image",
  Copy: "copy",
  "Landing page": "landing",
  "Video briefs": "video",
  Plan: "blueprint",
};
const imageUrl = (content: ImageContent) =>
  `data:image/svg+xml;charset=utf-8,${encodeURIComponent(content.svg)}`;
const commaList = (value: string) =>
  value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
function download(bytes: Uint8Array | string, name: string, type: string) {
  const blob = new Blob(
    [typeof bytes === "string" ? bytes : new Uint8Array(bytes)],
    { type },
  );
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function assetStatus(campaign: Campaign, asset: AssetRecord) {
  const version = currentVersion(asset);
  if (!version) return "Missing";
  if (!isCurrent(campaign, version)) return "Stale";
  if (version.validation.some((item) => item.severity === "error"))
    return "Invalid";
  if (asset.approval?.versionId === version.id)
    return asset.approval.status === "approved" ? "Approved" : "Rejected";
  return "Needs review";
}
function textContent(content: AssetContent): string {
  switch (content.type) {
    case "image":
      return content.generationBrief;
    case "copy":
      return Object.entries(content)
        .filter(([key]) => key !== "type")
        .map(
          ([key, value]) =>
            `${key}\n${Array.isArray(value) ? value.join("\n") : value}`,
        )
        .join("\n\n");
    case "landing":
      return `${content.hero.title}\n${content.hero.body}\n\n${content.benefits.map((item) => `${item.title}\n${item.body}`).join("\n\n")}\n\n${content.story.title}\n${content.story.body}\n\n${content.supporting.title}\n${content.supporting.body}\n\n${content.faq.map((item) => `${item.question}\n${item.answer}`).join("\n\n")}\n\nCTA: ${content.hero.cta}`;
    case "video":
      return `${content.title} · ${content.durationSeconds}s concept\n\nSCRIPT\n${content.script}\n\nSHOT SEQUENCE\n${content.shots.map((shot, index) => `${index + 1}. ${shot.seconds}s · ${shot.visual}\nVoiceover: ${shot.voiceover}`).join("\n\n")}\n\nGENERATION INSTRUCTIONS\n${content.generationInstructions}`;
    case "blueprint":
      return `${content.summary}\n\nIMPLEMENTATION CHECKLIST\n${content.checklist.map((item) => `□ ${item}`).join("\n")}`;
  }
}

export default function App() {
  const [engine] = useState(
    () =>
      new OrbitEngine(new IndexedDbPersistence(), {
        delayMs: 90,
        timeoutMs: 1500,
        maxAttempts: 2,
      }),
  );
  const [state, setState] = useState<AppState>(initialState);
  const [ready, setReady] = useState(false);
  const [locked, setLocked] = useState(false);
  const [view, setView] = useState<View>("campaigns");
  const [campaignId, setCampaignId] = useState<string>();
  const [draft, setDraft] = useState<CampaignBrief>();
  const [excluded, setExcluded] = useState<string[]>([]);
  const [tab, setTab] = useState<Tab>("brief");
  const [filter, setFilter] = useState("All assets");
  const [scenario, setScenario] = useState("Normal");
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");
  const [busy, setBusy] = useState(false);
  const [reviewId, setReviewId] = useState<string>();
  const [revisionNote, setRevisionNote] = useState("");
  const [editing, setEditing] = useState(false);
  const [copyEdit, setCopyEdit] = useState<CopyContent>();
  const campaign = state.campaigns.find((item) => item.id === campaignId);
  const review = campaign?.assets.find((item) => item.spec.id === reviewId);
  const version = review && currentVersion(review);
  const merchant = getMerchant(
    draft?.merchantId ?? campaign?.brief.merchantId ?? presets[0].id,
  );
  const latestRun = campaign?.runs.at(-1);
  const running =
    latestRun?.status === "running" || latestRun?.status === "queued";
  const dirty =
    !!campaign &&
    ((!!draft && JSON.stringify(draft) !== JSON.stringify(campaign.brief)) ||
      JSON.stringify(excluded) !==
        JSON.stringify(campaign.context.excludedIds));
  const hasCurrentPortfolio =
    !!campaign &&
    campaign.assets.every((asset) => {
      const saved = currentVersion(asset);
      return !!saved && isCurrent(campaign, saved);
    });
  const workspaceRunning = state.campaigns.some((item) =>
    item.runs.some(
      (run) => run.status === "running" || run.status === "queued",
    ),
  );
  const dialogRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let disposed = false;
    let release: (() => void) | undefined;
    const initialize = async () => {
      await engine.initialize();
      if (disposed) return;
      setState(engine.getSnapshot());
      const requested = new URLSearchParams(location.search).get("campaign");
      const existing = engine.getSnapshot().campaigns.find(item => item.id === requested);
      if (existing) selectCampaign(existing);
      setReady(true);
    };
    const unsubscribe = engine.subscribe(() => {
      if (!disposed) setState(engine.getSnapshot());
    });
    if (!navigator.locks) {
      setLocked(true);
      setError(
        "This browser needs Web Locks support to protect local campaign state. Open Orbit in a current Chrome, Edge, Firefox, or Safari browser.",
      );
    } else
      void navigator.locks.request(
        "orbit-studio-session",
        { ifAvailable: true },
        async (lock) => {
          if (!lock) {
            if (!disposed) setLocked(true);
            return;
          }
          if (disposed) return;
          try {
            await initialize();
            if (disposed) return;
            await new Promise<void>((resolve) => {
              release = resolve;
            });
          } catch (err) {
            if (!disposed) {
              setLocked(true);
              setError(
                err instanceof Error
                  ? err.message
                  : "Local storage is unavailable.",
              );
            }
          }
        },
      );
    return () => {
      disposed = true;
      unsubscribe();
      release?.();
    };
  }, [engine]);
  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(""), 3500);
    return () => clearTimeout(id);
  }, [toast]);
  useEffect(() => {
    if (!reviewId) return;
    const previous = document.activeElement as HTMLElement;
    dialogRef.current?.focus();
    const trap = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setReviewId(undefined);
        return;
      }
      if (event.key !== "Tab") return;
      const elements = Array.from(
        dialogRef.current?.querySelectorAll<HTMLElement>(
          'button:not(:disabled), input, textarea, select, summary, [tabindex="0"]',
        ) ?? [],
      ).filter((el) => el.offsetParent !== null);
      const first = elements[0],
        last = elements.at(-1);
      if (!first || !last) return;
      if (
        event.shiftKey &&
        (document.activeElement === first ||
          document.activeElement === dialogRef.current)
      ) {
        event.preventDefault();
        last.focus();
      } else if (
        !event.shiftKey &&
        (document.activeElement === last ||
          document.activeElement === dialogRef.current)
      ) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", trap);
    return () => {
      document.removeEventListener("keydown", trap);
      previous?.focus();
    };
  }, [reviewId]);
  async function act(task: () => Promise<unknown>, message?: string) {
    setError("");
    setBusy(true);
    try {
      await task();
      if (message) setToast(message);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "The action failed. Your saved work remains available.",
      );
    } finally {
      setBusy(false);
    }
  }
  function selectCampaign(item: Campaign) {
    setCampaignId(item.id);
    setDraft(structuredClone(item.brief));
    setExcluded([...item.context.excludedIds]);
    setTab("portfolio");
    setView("campaigns");
    setError("");
  }
  function startSample(merchantId = presets[0].id, blank = false) {
    const brief = createSampleBrief(merchantId);
    setDraft(
      blank
        ? {
            ...brief,
            title: "",
            goal: "",
            productIds: [],
            audience: "",
            direction: "",
          }
        : brief,
    );
    setExcluded([]);
    setCampaignId(undefined);
    setView("campaigns");
    setTab("brief");
    setError("");
    setScenario("Normal");
  }
  function field<K extends keyof CampaignBrief>(
    key: K,
    value: CampaignBrief[K],
  ) {
    setDraft((previous) =>
      previous ? { ...previous, [key]: value } : previous,
    );
  }
  async function createPortfolio() {
    if (!draft) return;
    await act(async () => {
      let item = campaign;
      if (!item) {
        item = await engine.createCampaign(draft);
        setCampaignId(item.id);
      } else if (dirty) {
        await engine.updateBrief(item.id, draft);
      }
      await engine.setContextExcluded(item.id, excluded);
      setTab("portfolio");
      setFilter("All assets");
      const failure =
        scenario === "Normal"
          ? undefined
          : {
              assetId: "image-1",
              kind:
                scenario === "Timeout"
                  ? ("timeout" as const)
                  : ("definitive" as const),
              count: scenario === "Timeout" ? 2 : 1,
            };
      await engine.runCampaign(item.id, { failure });
    });
  }
  function openReview(asset: AssetRecord) {
    setReviewId(asset.spec.id);
    setRevisionNote("");
    setEditing(false);
    const value = currentVersion(asset)?.content;
    setCopyEdit(value?.type === "copy" ? structuredClone(value) : undefined);
  }
  async function copy(value: string) {
    try {
      await navigator.clipboard.writeText(value);
      setToast("Copied to clipboard.");
    } catch {
      setError(
        "Clipboard access was blocked. Select the text or download the brief instead.",
      );
    }
  }
  async function exportPortfolio() {
    if (!campaign || dirty) return;
    await act(async () => {
      const packet = await buildExport(campaign);
      download(packet.bytes, packet.filename, "application/zip");
    }, "Approved current versions exported.");
  }
  function downloadBrief() {
    if (campaign)
      download(
        buildCampaignBrief(campaign),
        "orbit-campaign-brief.md",
        "text/markdown;charset=utf-8",
      );
  }
  const completed =
    latestRun?.steps.filter((step) => step.status === "completed").length ?? 0;
  const approved =
    campaign?.assets.filter(
      (asset) => assetStatus(campaign, asset) === "Approved",
    ).length ?? 0;

  if (locked)
    return (
      <div className="lock-page">
        <Icon name="orbit" size={46} />
        <h1>One workspace at a time</h1>
        <p>
          {error ||
            "Orbit is already open in another tab. Close that tab, then reopen this one to continue safely. This prevents conflicting writes to your browser-local campaigns."}
        </p>
        <button className="button primary" onClick={() => location.reload()}>
          Retry workspace access
        </button>
      </div>
    );
  if (!ready)
    return (
      <div className="status-loading">
        <Icon name="orbit" size={30} />
        <span>Opening your local workspace…</span>
      </div>
    );
  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">
          <Icon name="orbit" size={38} />
          <div>
            <strong>
              Orbit<span style={{ fontSize: 9, verticalAlign: "top" }}>™</span>
            </strong>
            <small>Studio workspace</small>
          </div>
        </div>
        <a className="button" href={import.meta.env.BASE_URL}>Return to Orbit Home</a>
        <nav className="nav" aria-label="Primary navigation">
          <button
            className={view === "campaigns" ? "active" : ""}
            aria-label="Campaigns"
            onClick={() => setView("campaigns")}
          >
            <Icon name="grid" />
            Campaigns
          </button>
          <button
            className={view === "brand" ? "active" : ""}
            aria-label="Brand context"
            onClick={() => setView("brand")}
          >
            <Icon name="layers" />
            Brand context
          </button>
          <button
            className={view === "history" ? "active" : ""}
            aria-label="Run history"
            onClick={() => setView("history")}
          >
            <Icon name="clock" />
            Run history
          </button>
        </nav>
        <div className="sidebar-note">
          <strong>Agentic Commerce OS</strong>A public reference by McHenry
          Power.
          <br />
          Built to make the work inspectable.
        </div>
      </aside>
      <main
        className="main"
        aria-hidden={reviewId ? true : undefined}
        inert={reviewId ? true : undefined}
      >
        <header className="topbar">
          <div className="crumb">
            <span>Workspace</span>
            <span>/</span>
            <b>
              {view === "campaigns"
                ? "Campaigns"
                : view === "brand"
                  ? "Brand context"
                  : "Run history"}
            </b>
          </div>
          <span className="demo-badge">
            Demo mode · Sample data · Simulated providers
          </span>
        </header>
        <div className="content">
          {error && (
            <div className="notice error" role="alert">
              <Icon name="alert" size={18} />
              <p>{error}</p>
              <button
                className="button quiet"
                aria-label="Dismiss error"
                onClick={() => setError("")}
              >
                <Icon name="close" size={14} />
              </button>
            </div>
          )}
          {view === "campaigns" && !draft && (
            <>
              <div className="page-heading">
                <div>
                  <div className="eyebrow">Your creative operating space</div>
                  <h1>A campaign, in good company.</h1>
                  <p>
                    Bring the brief, brand context, and creative work into one
                    clear flow.
                  </p>
                </div>
                <button
                  className="button"
                  onClick={() => startSample(presets[0].id, true)}
                >
                  <Icon name="plus" size={16} />
                  New campaign
                </button>
              </div>
              <div className="welcome">
                <div className="welcome-copy">
                  <div className="eyebrow">Meet Orbit Studio</div>
                  <h1>
                    One brief.
                    <br />A coherent portfolio.
                  </h1>
                  <p>
                    Coordinate images, campaign copy, a landing page, and a
                    video concept. Review each piece before anything leaves your
                    workspace.
                  </p>
                  <button
                    className="button primary"
                    onClick={() => startSample()}
                  >
                    Try sample campaign
                    <Icon name="arrow" size={16} />
                  </button>
                  <div className="steps-line">
                    <span>Brief</span>
                    <i>→</i>
                    <span>Context</span>
                    <i>→</i>
                    <span>Create</span>
                    <i>→</i>
                    <span>Review</span>
                    <i>→</i>
                    <span>Export</span>
                  </div>
                </div>
                <div className="welcome-art" aria-hidden="true">
                  <svg viewBox="0 0 460 350">
                    <ellipse
                      cx="245"
                      cy="187"
                      rx="165"
                      ry="66"
                      transform="rotate(-28 245 187)"
                      fill="none"
                      stroke="#c6bddf"
                    />
                    <ellipse
                      cx="245"
                      cy="187"
                      rx="120"
                      ry="128"
                      transform="rotate(-28 245 187)"
                      fill="none"
                      stroke="#d1c9e3"
                    />
                    <circle cx="245" cy="187" r="83" fill="#e3ddee" />
                    <g transform="translate(164 107) rotate(-9 75 90)">
                      <rect
                        width="138"
                        height="172"
                        rx="9"
                        fill="#fbf6ec"
                        stroke="#c6bba9"
                      />
                      <path d="M0 20h138M0 150h138" stroke="#d8cfbd" />
                      <rect
                        x="16"
                        y="42"
                        width="107"
                        height="83"
                        rx="3"
                        fill="#c67c58"
                      />
                      <text
                        x="69"
                        y="67"
                        textAnchor="middle"
                        fontSize="13"
                        fill="#fff9ee"
                        fontFamily="system-ui"
                        letterSpacing="4"
                      >
                        ASTER
                      </text>
                      <text
                        x="69"
                        y="92"
                        textAnchor="middle"
                        fontSize="10"
                        fill="#fff9ee"
                        fontFamily="system-ui"
                        letterSpacing="1.4"
                      >
                        DAWN BLEND
                      </text>
                      <text
                        x="69"
                        y="111"
                        textAnchor="middle"
                        fontSize="6"
                        fill="#fff9ee"
                        fontFamily="system-ui"
                      >
                        WHOLE BEAN · MEDIUM ROAST
                      </text>
                      <text
                        x="69"
                        y="143"
                        textAnchor="middle"
                        fontSize="7"
                        fill="#95816d"
                        fontFamily="system-ui"
                      >
                        250 g
                      </text>
                    </g>
                    <circle cx="363" cy="104" r="7" fill="#8874b5" />
                    <circle cx="103" cy="250" r="5" fill="#bb9c78" />
                    <circle cx="324" cy="290" r="3" fill="#b6a8cc" />
                  </svg>
                </div>
              </div>
              <div className="section-heading">
                <h2>Start with a fictional merchant</h2>
                <small className="muted">
                  Two contexts. The same workflow.
                </small>
              </div>
              <div className="sample-grid">
                {presets.map((item) => (
                  <button
                    key={item.id}
                    className="sample-card"
                    onClick={() => startSample(item.id)}
                  >
                    <span className={`sample-icon ${item.category}`}>
                      <Icon
                        name={item.category === "coffee" ? "spark" : "layers"}
                        size={28}
                      />
                    </span>
                    <span>
                      <small>
                        {item.category === "coffee"
                          ? "Specialty coffee"
                          : "Household essentials"}
                      </small>
                      <strong>{item.name}</strong>
                      <p>{item.tagline}</p>
                    </span>
                    <Icon name="arrow" size={17} />
                  </button>
                ))}
              </div>
              {state.campaigns.length > 0 && (
                <>
                  <div className="section-heading" style={{ marginTop: 30 }}>
                    <h2>Your saved campaigns</h2>
                    <small className="muted">Local to this browser</small>
                  </div>
                  <div className="campaign-list">
                    {state.campaigns.map((item) => (
                      <button
                        key={item.id}
                        className="campaign-row"
                        onClick={() => selectCampaign(item)}
                      >
                        <Icon name="layers" />
                        <span>
                          <strong>{item.brief.title}</strong>
                          <small>
                            {getMerchant(item.brief.merchantId).name} ·{" "}
                            {item.assets.length} planned outputs
                          </small>
                        </span>
                        <span className="pill">
                          {item.runs.at(-1)?.status || "Draft"}
                        </span>
                        <Icon name="arrow" size={16} />
                      </button>
                    ))}
                  </div>
                </>
              )}
            </>
          )}
          {view === "campaigns" && draft && (
            <>
              <div className="page-heading">
                <div>
                  <div className="eyebrow">
                    {merchant.name} / Campaign workspace
                  </div>
                  <h1>{draft.title || "New campaign"}</h1>
                  <p>
                    {campaign
                      ? "A coordinated packet, with every decision and version in view."
                      : "Start with a clear brief. Orbit will assemble the selected sample context."}
                  </p>
                </div>
                <div className="actions">
                  <button
                    className="button quiet"
                    onClick={() => {
                      setDraft(undefined);
                      setCampaignId(undefined);
                    }}
                  >
                    All campaigns
                  </button>
                  <button
                    className="button"
                    disabled={running}
                    onClick={() => startSample(presets[0].id, true)}
                  >
                    <Icon name="plus" size={15} />
                    New campaign
                  </button>
                </div>
              </div>
              <nav className="tabs" aria-label="Campaign sections">
                {(
                  [
                    ["brief", "Brief", "file"],
                    ["portfolio", "Portfolio", "grid"],
                    ["landing", "Landing page", "layers"],
                    ["activity", "Activity", "clock"],
                  ] as const
                ).map(([key, label, icon]) => (
                  <button
                    key={key}
                    className={tab === key ? "active" : ""}
                    aria-current={tab === key ? "page" : undefined}
                    onClick={() => setTab(key)}
                  >
                    <Icon name={icon} size={16} />
                    {label}
                    {key === "portfolio" && campaign && (
                      <small>
                        {
                          campaign.assets.filter((asset) =>
                            currentVersion(asset),
                          ).length
                        }
                      </small>
                    )}
                  </button>
                ))}
              </nav>
              {dirty && (
                <div className="notice">
                  <Icon name="alert" size={17} />
                  <p>
                    Brief or context changes are unsaved. Save them to
                    invalidate the previous plan and approvals; export is
                    paused.
                  </p>
                </div>
              )}
              {running && latestRun && (
                <div className="run-progress" role="status">
                  <Icon name="orbit" size={23} />
                  <p>
                    Creating your portfolio
                    <small>
                      {completed} of {latestRun.steps.length} steps saved ·
                      simulated providers
                    </small>
                  </p>
                  <div className="progress-track">
                    <span
                      style={{
                        width: `${(completed / latestRun.steps.length) * 100}%`,
                      }}
                    />
                  </div>
                  <button
                    className="button quiet"
                    onClick={() =>
                      campaign &&
                      void act(() => engine.interruptCampaign(campaign.id))
                    }
                  >
                    Pause run
                  </button>
                </div>
              )}
              {(latestRun?.status === "failed" ||
                latestRun?.status === "interrupted") && (
                <div
                  className={`notice ${latestRun.status === "failed" ? "error" : ""}`}
                >
                  <Icon name="alert" size={18} />
                  <p>
                    {latestRun.status === "failed"
                      ? "A provider step failed."
                      : "The run was interrupted."}{" "}
                    Completed versions and approvals are saved. Resume retries
                    only unfinished work.
                  </p>
                  <div className="actions">
                    <button
                      className="button"
                      disabled={busy || dirty}
                      onClick={() =>
                        campaign &&
                        void act(() => engine.resumeCampaign(campaign.id))
                      }
                    >
                      Resume run
                    </button>
                    <button
                      className="button quiet"
                      disabled={busy || dirty}
                      onClick={() =>
                        campaign &&
                        void act(() => engine.runCampaign(campaign.id))
                      }
                    >
                      Restart unfinished steps
                    </button>
                  </div>
                </div>
              )}
              {tab === "brief" && (
                <div className="brief-layout">
                  <form
                    className="panel"
                    onSubmit={(event) => {
                      event.preventDefault();
                      void createPortfolio();
                    }}
                  >
                    <h2 className="form-title">Campaign brief</h2>
                    <div className="fields">
                      <Field label="Campaign name" full>
                        <input
                          value={draft.title}
                          onChange={(event) =>
                            field("title", event.target.value)
                          }
                          placeholder="Give this campaign a name"
                          required
                          disabled={running}
                        />
                      </Field>
                      <Field label="Goal">
                        <select
                          value={draft.goal}
                          onChange={(event) =>
                            field("goal", event.target.value)
                          }
                          required
                          disabled={running}
                        >
                          <option value="">Select a goal</option>
                          {[
                            "Introduce the collection",
                            "Seasonal campaign",
                            "Product spotlight",
                          ].map((goal) => (
                            <option key={goal}>{goal}</option>
                          ))}
                        </select>
                      </Field>
                      <Field label="Audience">
                        <input
                          value={draft.audience}
                          onChange={(event) =>
                            field("audience", event.target.value)
                          }
                          placeholder="Who is this campaign for?"
                          required
                          disabled={running}
                        />
                      </Field>
                      <Field label="Selected products" full>
                        <div className="product-options">
                          {merchant.products.map((product) => (
                            <label key={product.id} className="product-option">
                              <input
                                type="checkbox"
                                checked={draft.productIds.includes(product.id)}
                                disabled={running}
                                onChange={(event) =>
                                  field(
                                    "productIds",
                                    event.target.checked
                                      ? [...draft.productIds, product.id]
                                      : draft.productIds.filter(
                                          (id) => id !== product.id,
                                        ),
                                  )
                                }
                              />
                              <span>
                                <strong>{product.name}</strong>
                                <small>
                                  {product.category} · {product.size}
                                </small>
                              </span>
                            </label>
                          ))}
                        </div>
                      </Field>
                      <Field label="Campaign direction" full>
                        <textarea
                          value={draft.direction}
                          onChange={(event) =>
                            field("direction", event.target.value)
                          }
                          placeholder="Describe the creative direction"
                          required
                          disabled={running}
                        />
                        <span className="hint">
                          Free-text direction stays in the blueprint. The demo
                          adapts structured fields and supported style rules.
                        </span>
                      </Field>
                    </div>
                    <details className="advanced">
                      <summary>
                        Advanced settings · tone, phrases & output quantities
                      </summary>
                      <div className="fields">
                        <Field label="Tone">
                          <select
                            value={draft.tone || ""}
                            onChange={(event) =>
                              field("tone", event.target.value)
                            }
                            disabled={running}
                          >
                            <option value="">Use saved preference</option>
                            <option>Calm and inviting</option>
                            <option>Warm and conversational</option>
                            <option>Direct and concise</option>
                          </select>
                        </Field>
                        <Field label="Offer (draft instruction)">
                          <input
                            value={draft.offer || ""}
                            onChange={(event) =>
                              field("offer", event.target.value)
                            }
                            placeholder="Optional; no invented discount"
                            disabled={running}
                          />
                        </Field>
                        <Field label="Keywords, separated by commas" full>
                          <input
                            value={(draft.keywords || []).join(", ")}
                            onChange={(event) =>
                              field("keywords", commaList(event.target.value))
                            }
                            disabled={running}
                          />
                        </Field>
                        <Field
                          label="Required phrases, separated by commas"
                          full
                        >
                          <input
                            value={(draft.requiredPhrases || []).join(", ")}
                            onChange={(event) =>
                              field(
                                "requiredPhrases",
                                commaList(event.target.value),
                              )
                            }
                            disabled={running}
                          />
                        </Field>
                        <Field
                          label="Prohibited phrases, separated by commas"
                          full
                        >
                          <input
                            value={(draft.prohibitedPhrases || []).join(", ")}
                            onChange={(event) =>
                              field(
                                "prohibitedPhrases",
                                commaList(event.target.value),
                              )
                            }
                            disabled={running}
                          />
                        </Field>
                        {(
                          [
                            "headlines",
                            "longHeadlines",
                            "descriptions",
                            "ctas",
                          ] as const
                        ).map((key) => (
                          <Field
                            key={key}
                            label={
                              {
                                headlines: "Short headlines (3–15)",
                                longHeadlines: "Long headlines (1–5)",
                                descriptions: "Descriptions (3–5)",
                                ctas: "CTA options (1–5)",
                              }[key]
                            }
                          >
                            <input
                              type="number"
                              min={
                                key === "headlines" || key === "descriptions"
                                  ? 3
                                  : 1
                              }
                              max={key === "headlines" ? 15 : 5}
                              value={
                                draft.quantities?.[key] ??
                                {
                                  headlines: 5,
                                  longHeadlines: 1,
                                  descriptions: 4,
                                  ctas: 3,
                                }[key]
                              }
                              onChange={(event) =>
                                field("quantities", {
                                  ...(draft.quantities || {
                                    headlines: 5,
                                    longHeadlines: 1,
                                    descriptions: 4,
                                    ctas: 3,
                                  }),
                                  [key]: Number(event.target.value),
                                })
                              }
                              disabled={running}
                            />
                          </Field>
                        ))}
                        <Field label="Provider scenario" full>
                          <select
                            value={scenario}
                            onChange={(event) =>
                              setScenario(event.target.value)
                            }
                            disabled={running}
                          >
                            <option>Normal</option>
                            <option>Definitive failure</option>
                            <option>Timeout</option>
                          </select>
                          <span className="hint">
                            Local test fixtures for inspecting recovery; these
                            are simulated failures.
                          </span>
                        </Field>
                      </div>
                    </details>
                    <div className="form-footer">
                      <p>
                        6 image concepts · campaign copy · landing page
                        <br />1 video brief · blueprint & checklist
                        {hasCurrentPortfolio && !dirty && (
                          <>
                            <br />
                            Current portfolio created. Review or revise its
                            assets.
                          </>
                        )}
                      </p>
                      <div className="actions">
                        {campaign && dirty && (
                          <button
                            type="button"
                            className="button"
                            disabled={busy || running}
                            onClick={() =>
                              void act(async () => {
                                await engine.updateBrief(campaign.id, draft);
                                await engine.setContextExcluded(
                                  campaign.id,
                                  excluded,
                                );
                              }, "Brief saved. Previous assets now require regeneration.")
                            }
                          >
                            Save brief
                          </button>
                        )}
                        <button
                          type="submit"
                          className="button primary"
                          disabled={
                            busy || running || (hasCurrentPortfolio && !dirty)
                          }
                          title={
                            hasCurrentPortfolio && !dirty
                              ? "The current portfolio already exists. Open Portfolio to review or revise an asset."
                              : undefined
                          }
                        >
                          <Icon name="spark" size={16} />
                          Create portfolio
                        </button>
                      </div>
                    </div>
                  </form>
                  <ContextPanel
                    brief={draft}
                    excluded={excluded}
                    disabled={running}
                    onChange={setExcluded}
                  />
                </div>
              )}
              {tab === "portfolio" &&
                (!campaign ||
                !campaign.assets.some((asset) => currentVersion(asset)) ? (
                  <div className="empty">
                    <Icon name="layers" size={35} />
                    <h2>Your portfolio starts with the brief.</h2>
                    <p>
                      Orbit will coordinate six original image concepts and the
                      supporting copy, landing page, video brief, and plan.
                    </p>
                    <button
                      className="button primary"
                      onClick={() => setTab("brief")}
                    >
                      Open brief
                      <Icon name="arrow" size={15} />
                    </button>
                  </div>
                ) : (
                  <>
                    <div className="portfolio-toolbar">
                      <div
                        className="filter-group"
                        aria-label="Asset categories"
                      >
                        {filters.map((label) => (
                          <button
                            key={label}
                            className={filter === label ? "active" : ""}
                            aria-pressed={filter === label}
                            onClick={() => setFilter(label)}
                          >
                            {label}
                          </button>
                        ))}
                      </div>
                      <span className="portfolio-stats">
                        {approved} / {campaign.assets.length} approved ·
                        revision {campaign.revision}
                      </span>
                    </div>
                    <div className="asset-grid">
                      {campaign.assets
                        .filter(
                          (asset) =>
                            filter === "All assets" ||
                            asset.spec.kind === kindFilter[filter],
                        )
                        .map((asset) => (
                          <AssetCard
                            key={asset.spec.id}
                            campaign={campaign}
                            asset={asset}
                            onReview={() => openReview(asset)}
                          />
                        ))}
                    </div>
                    <ExportBar
                      campaign={campaign}
                      dirty={dirty}
                      disabled={busy || running}
                      onExport={() => void exportPortfolio()}
                    />
                  </>
                ))}
              {tab === "landing" && (
                <LandingPreview
                  campaign={campaign}
                  merchantName={merchant.name}
                  onReview={() =>
                    campaign &&
                    openReview(
                      campaign.assets.find(
                        (asset) => asset.spec.kind === "landing",
                      )!,
                    )
                  }
                  onDownload={downloadBrief}
                  onExport={() => void exportPortfolio()}
                  dirty={dirty}
                  busy={busy || running}
                />
              )}
              {tab === "activity" && (
                <Activity campaign={campaign} onDownload={downloadBrief} />
              )}
              <p className="footer-caption">
                Browser-local workspace · No publishing or ad spend ·
                PMax-oriented review drafts
              </p>
            </>
          )}
          {view === "brand" && (
            <>
              <div className="page-heading">
                <div>
                  <div className="eyebrow">Context before creation</div>
                  <h1>A brand is a set of constraints.</h1>
                  <p>
                    Bundled fictional records keep the demo factual. Select or
                    exclude references in each campaign brief.
                  </p>
                </div>
              </div>
              <div className="brand-page">
                {presets.map((item) => (
                  <section className="panel" key={item.id}>
                    <div className="eyebrow">{item.category}</div>
                    <h2>{item.name}</h2>
                    <p className="hint">{item.site} · invented address</p>
                    <ul>
                      {item.brandRules.map((rule) => (
                        <li key={rule}>{rule}</li>
                      ))}
                    </ul>
                    {item.products.map((product) => (
                      <div key={product.id} className="context-reference">
                        <Icon name="file" size={17} />
                        <div>
                          <strong>{product.name}</strong>
                          <p>{product.facts.join(" · ")}</p>
                        </div>
                      </div>
                    ))}
                    <button
                      className="button"
                      onClick={() => startSample(item.id)}
                    >
                      Try this sample
                      <Icon name="arrow" size={15} />
                    </button>
                  </section>
                ))}
              </div>
              <section className="panel" style={{ marginTop: 24 }}>
                <h2 style={{ fontSize: 17 }}>Preferences for the next plan</h2>
                <p className="hint">
                  Structured preference reuse, saved in this browser. This is
                  not model training or measured optimization.
                </p>
                <label className="product-option" style={{ margin: "18px 0" }}>
                  <input
                    type="checkbox"
                    checked={state.preferences.avoidCrowdedCompositions}
                    disabled={workspaceRunning || busy}
                    onChange={(event) =>
                      void act(
                        () =>
                          engine.setPreferences({
                            avoidCrowdedCompositions: event.target.checked,
                          }),
                        "Preference saved for future plans.",
                      )
                    }
                  />
                  <span>Avoid crowded compositions</span>
                </label>
                <Field label="Preferred tone">
                  <select
                    value={state.preferences.preferredTone}
                    disabled={workspaceRunning || busy}
                    onChange={(event) =>
                      void act(
                        () =>
                          engine.setPreferences({
                            preferredTone: event.target.value,
                          }),
                        "Tone preference saved.",
                      )
                    }
                  >
                    <option>Calm and inviting</option>
                    <option>Warm and conversational</option>
                    <option>Direct and concise</option>
                  </select>
                </Field>
                {workspaceRunning && (
                  <p className="hint">
                    Preferences can be edited once the active run finishes.
                  </p>
                )}
                <div className="reset-box">
                  <h3>Reset this local workspace</h3>
                  <p className="hint">
                    Remove sample campaigns, assets, approvals, events, and
                    preferences from this browser.
                  </p>
                  <button
                    className="button danger"
                    disabled={
                      busy ||
                      state.campaigns.some(
                        (item) => item.runs.at(-1)?.status === "running",
                      )
                    }
                    onClick={() => {
                      if (
                        window.confirm(
                          "Reset sample data? This removes all locally saved campaigns, assets, approvals, and preferences.",
                        )
                      )
                        void act(async () => {
                          await engine.reset();
                          setDraft(undefined);
                          setCampaignId(undefined);
                          setView("campaigns");
                        }, "Local sample data reset.");
                    }}
                  >
                    Reset sample data
                  </button>
                </div>
              </section>
            </>
          )}
          {view === "history" && (
            <>
              <div className="page-heading">
                <div>
                  <div className="eyebrow">Decisions you can inspect</div>
                  <h1>Run history</h1>
                  <p>
                    Concise events, provider attempts, and validation outcomes.
                    Stored locally with each campaign.
                  </p>
                </div>
              </div>
              {state.campaigns.length ? (
                state.campaigns.map((item) => (
                  <section className="panel history-card" key={item.id}>
                    <div className="section-heading">
                      <h2>{item.brief.title}</h2>
                      <button
                        className="button"
                        onClick={() => {
                          selectCampaign(item);
                          setTab("activity");
                        }}
                      >
                        Open activity
                        <Icon name="arrow" size={14} />
                      </button>
                    </div>
                    {item.runs.length ? (
                      item.runs.map((run) => (
                        <div className="context-reference" key={run.id}>
                          <Icon name="clock" size={17} />
                          <div>
                            <strong>
                              {run.targetAssetId
                                ? `Revision · ${run.targetAssetId}`
                                : "Portfolio run"}{" "}
                              <span className={`pill ${run.status}`}>
                                {run.status}
                              </span>
                            </strong>
                            <p>
                              {
                                run.steps.filter(
                                  (step) => step.status === "completed",
                                ).length
                              }{" "}
                              / {run.steps.length} steps saved ·{" "}
                              {run.events.length} events ·{" "}
                              {new Date(run.createdAt).toLocaleString()}
                            </p>
                          </div>
                        </div>
                      ))
                    ) : (
                      <p className="hint">Draft saved. No run yet.</p>
                    )}
                  </section>
                ))
              ) : (
                <div className="empty">
                  <Icon name="clock" size={33} />
                  <h2>No runs yet</h2>
                  <p>
                    Create a sample portfolio to inspect the orchestration
                    events.
                  </p>
                  <button
                    className="button primary"
                    onClick={() => startSample()}
                  >
                    Try sample campaign
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </main>
      {review && version && campaign && (
        <div
          className="modal-overlay"
          onClick={(event) => {
            if (event.target === event.currentTarget) setReviewId(undefined);
          }}
        >
          <div
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="review-title"
            ref={dialogRef}
            tabIndex={-1}
          >
            <header className="modal-header">
              <div>
                <div className="eyebrow">Asset review / {review.spec.kind}</div>
                <h2 id="review-title">{review.spec.title}</h2>
                <small data-testid="asset-version">
                  Version {version.number} · {review.spec.id} · {version.id}
                </small>
              </div>
              <button
                className="button quiet"
                aria-label="Close review"
                onClick={() => setReviewId(undefined)}
              >
                <Icon name="close" size={19} />
              </button>
            </header>
            <div className="modal-content">
              <div className="review-visual">
                {version.content.type === "image" ? (
                  <>
                    <img
                      src={imageUrl(version.content)}
                      alt={version.content.alt}
                    />
                    <p className="hint">
                      Original vector composition · {version.content.width} ×{" "}
                      {version.content.height} · SVG draft
                    </p>
                  </>
                ) : version.content.type === "copy" ? (
                  <CopyReview
                    content={version.content}
                    edit={editing ? copyEdit : undefined}
                    onEdit={setCopyEdit}
                    onCopy={(value) => void copy(value)}
                  />
                ) : (
                  <div className="content-text">
                    {textContent(version.content)}
                  </div>
                )}
              </div>
              <div className="review-info">
                <div className="review-section">
                  <h3>Purpose</h3>
                  <p>{review.spec.purpose}</p>
                  <span
                    className={`pill ${assetStatus(campaign, review).toLowerCase()}`}
                  >
                    {assetStatus(campaign, review)}
                  </span>
                </div>
                <div className="review-section">
                  <h3>Source context</h3>
                  <ul className="source-list">
                    {review.spec.sourceReferenceIds.map((id) => (
                      <li key={id}>
                        <Icon name="check" size={12} />
                        {campaign.context.references.find(
                          (reference) => reference.id === id,
                        )?.title || id}
                      </li>
                    ))}
                  </ul>
                </div>
                <div className="review-section">
                  <h3>Validation findings</h3>
                  {version.validation.map((finding, index) => (
                    <div
                      key={index}
                      className={`validation-item ${finding.severity}`}
                    >
                      {finding.message}
                    </div>
                  ))}
                  {!version.validation.length && (
                    <div className="validation-item">
                      No supported-rule errors found. Merchant review is still
                      required.
                    </div>
                  )}
                  <p>
                    Checks cover this reference’s supported rules. They do not
                    establish Google ad approval or full factual understanding.
                  </p>
                </div>
                {version.content.type === "image" && (
                  <details className="review-section">
                    <summary className="hint">
                      Generation brief & revision notes
                    </summary>
                    <p style={{ whiteSpace: "pre-wrap" }}>
                      {version.content.generationBrief}
                    </p>
                  </details>
                )}
                {version.content.type === "copy" && (
                  <div className="review-section">
                    <button
                      className="button"
                      disabled={
                        busy || running || !isCurrent(campaign, version)
                      }
                      onClick={() => setEditing(!editing)}
                    >
                      {editing ? "Cancel editing" : "Edit copy"}
                    </button>
                    {editing && copyEdit && (
                      <button
                        className="button primary"
                        style={{ marginLeft: 8 }}
                        disabled={busy}
                        onClick={() =>
                          void act(async () => {
                            await engine.editCopy(
                              campaign.id,
                              review.spec.id,
                              copyEdit,
                            );
                            setEditing(false);
                          }, "Copy saved as a new version. Previous approval cleared.")
                        }
                      >
                        Save copy
                      </button>
                    )}
                  </div>
                )}
                <div className="review-section">
                  <Field label="Revision request">
                    <textarea
                      className="revision-field"
                      value={revisionNote}
                      onChange={(event) => setRevisionNote(event.target.value)}
                      placeholder="For example: more space around the product"
                      disabled={busy || running}
                    />
                  </Field>
                  <p>
                    Supported style rules: more space, warmer tone. Other
                    instructions stay visible for human review.
                  </p>
                  <button
                    className="button"
                    disabled={
                      busy ||
                      running ||
                      dirty ||
                      !revisionNote.trim() ||
                      !isCurrent(campaign, version)
                    }
                    onClick={() =>
                      void act(
                        () =>
                          engine.reviseAsset(
                            campaign.id,
                            review.spec.id,
                            revisionNote,
                          ),
                        "Revised this asset. Review the new version before approving.",
                      )
                    }
                  >
                    <Icon name="refresh" size={14} />
                    Request revision
                  </button>
                </div>
                <details>
                  <summary className="hint">
                    Version history · {review.versions.length}
                  </summary>
                  {review.versions.map((previous) => (
                    <p key={previous.id} className="hint">
                      v{previous.number} ·{" "}
                      {previous.revisionNote || "Initial generation"} ·{" "}
                      {new Date(previous.createdAt).toLocaleTimeString()}
                    </p>
                  ))}
                </details>
              </div>
            </div>
            <footer className="modal-footer">
              <p>
                Approval applies to this exact version.
                <br />
                Changes require a new review.
              </p>
              <div className="actions">
                <button
                  className="button"
                  onClick={() => void copy(textContent(version.content))}
                >
                  <Icon name="copy" size={14} />
                  Copy {version.content.type === "image" ? "brief" : "content"}
                </button>
                <button
                  className="button"
                  disabled={
                    busy || running || dirty || !isCurrent(campaign, version)
                  }
                  onClick={() =>
                    void act(
                      () =>
                        engine.rejectAsset(
                          campaign.id,
                          review.spec.id,
                          revisionNote || "Merchant review requested changes.",
                        ),
                      "Asset marked for changes.",
                    )
                  }
                >
                  Reject
                </button>
                <button
                  className="button primary"
                  disabled={
                    busy ||
                    running ||
                    dirty ||
                    editing ||
                    !isCurrent(campaign, version) ||
                    version.validation.some(
                      (item) => item.severity === "error",
                    ) ||
                    assetStatus(campaign, review) === "Approved"
                  }
                  onClick={() =>
                    void act(
                      () => engine.approveAsset(campaign.id, review.spec.id),
                      "Version approved.",
                    )
                  }
                >
                  <Icon name="check" size={15} />
                  {assetStatus(campaign, review) === "Approved"
                    ? "Approved"
                    : "Approve"}
                </button>
              </div>
            </footer>
          </div>
        </div>
      )}
      {toast && (
        <div className="toast" role="status">
          {toast}
        </div>
      )}
    </div>
  );
}

function Field({
  label,
  children,
  full = false,
}: {
  label: string;
  children: React.ReactNode;
  full?: boolean;
}) {
  const id = label.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  return (
    <div className={`field ${full ? "full" : ""}`}>
      <label htmlFor={id}>{label}</label>
      {Children.map(children, (child) => cloneField(child, id))}
    </div>
  );
}
// Give each native form control the label's ID while keeping hint text separate.
function cloneField(child: React.ReactNode, id: string): React.ReactNode {
  return isValidElement(child) &&
    typeof child.type === "string" &&
    ["input", "select", "textarea"].includes(child.type)
    ? cloneElement(child as React.ReactElement<{ id?: string }>, { id })
    : child;
}
function ContextPanel({
  brief,
  excluded,
  disabled,
  onChange,
}: {
  brief: CampaignBrief;
  excluded: string[];
  disabled: boolean;
  onChange: (ids: string[]) => void;
}) {
  const context = buildContext(brief, excluded),
    merchant = getMerchant(brief.merchantId);
  const selectedProducts = merchant.products.filter((product) =>
    brief.productIds.includes(product.id),
  );
  return (
    <aside className="panel context-panel">
      <div className="context-head">
        <Icon name="layers" size={17} />
        <h2>Selected context</h2>
        <span className="pill" style={{ marginLeft: "auto" }}>
          Bundled fixtures
        </span>
      </div>
      <p className="context-intro">
        The plan draws from these records. Every output keeps its source
        references.
      </p>
      <div className="merchant-lockup">
        <Icon name="spark" size={26} />
        <span>
          <strong>{merchant.name}</strong>
          <small>Fictional merchant · {merchant.category}</small>
        </span>
      </div>
      <div className="context-stats">
        <span>
          <b>{selectedProducts.length}</b>products
        </span>
        <span>
          <b>
            {
              context.references.filter(
                (ref) => ref.type === "image" && !excluded.includes(ref.id),
              ).length
            }
          </b>
          references
        </span>
        <span>
          <b>{context.selectedIds.length}</b>included records
        </span>
      </div>
      {context.references.map((reference) => (
        <label className="context-reference" key={reference.id}>
          <input
            type="checkbox"
            checked={!excluded.includes(reference.id)}
            disabled={disabled}
            aria-label={`Include ${reference.title}`}
            onChange={(event) =>
              onChange(
                event.target.checked
                  ? excluded.filter((id) => id !== reference.id)
                  : [...excluded, reference.id],
              )
            }
          />
          <span>
            <strong>{reference.title}</strong>
            <p>{reference.reason}</p>
            {reference.required && <small>Required for selected product</small>}
          </span>
        </label>
      ))}
      {!selectedProducts.length && (
        <p className="hint">
          Choose a product to include its factual record and original package
          reference.
        </p>
      )}
      <details className="context-summary">
        <summary>Inspect factual records & rules</summary>
        {context.references
          .filter((reference) => context.selectedIds.includes(reference.id))
          .map((reference) => (
            <div key={reference.id} style={{ marginTop: 14 }}>
              <strong style={{ fontSize: 10 }}>{reference.title}</strong>
              <p className="hint" style={{ whiteSpace: "pre-wrap" }}>
                {reference.text}
              </p>
            </div>
          ))}
      </details>
      <p className="hint" style={{ fontSize: 10, marginTop: 18 }}>
        Excluding a required product record or package reference blocks creation
        until it is restored.
      </p>
    </aside>
  );
}
function AssetCard({
  campaign,
  asset,
  onReview,
}: {
  campaign: Campaign;
  asset: AssetRecord;
  onReview: () => void;
}) {
  const version = currentVersion(asset),
    status = assetStatus(campaign, asset),
    content = version?.content;
  return (
    <article className="asset-card" data-testid={`asset-${asset.spec.id}`}>
      {content?.type === "image" ? (
        <div className="asset-preview">
          <img src={imageUrl(content)} alt={content.alt} />
          <span className="pill">
            {content.width === content.height
              ? "1:1"
              : content.width > content.height
                ? "1.91:1"
                : "4:5"}{" "}
            · SVG
          </span>
        </div>
      ) : (
        <div className={`text-preview ${content?.type || asset.spec.kind}`}>
          <Icon
            name={
              asset.spec.kind === "video"
                ? "layers"
                : asset.spec.kind === "copy"
                  ? "copy"
                  : "file"
            }
            size={24}
          />
          <small>
            {asset.spec.kind === "video"
              ? "Concept & shot sequence"
              : asset.spec.kind === "blueprint"
                ? "Plan & implementation"
                : asset.spec.kind === "landing"
                  ? "Responsive page content"
                  : asset.spec.kind === "copy"
                    ? "PMax-oriented text"
                    : "Pending provider step"}
          </small>
          <p>
            {content?.type === "copy"
              ? content.headlines[0]
              : content?.type === "landing"
                ? content.hero.title
                : content?.type === "video"
                  ? content.title
                  : content?.type === "blueprint"
                    ? "From brief to a coordinated campaign."
                    : "This asset has not been generated yet."}
          </p>
        </div>
      )}
      <div className="asset-meta">
        <strong>{asset.spec.title}</strong>
        <p>
          {version
            ? `Version ${version.number} · ${asset.spec.kind === "image" ? "Original vector composition" : "Review draft"}`
            : "Awaiting a successful provider step"}
        </p>
        <div className="asset-meta-footer">
          <span className={`pill ${status.toLowerCase()}`}>{status}</span>
          <button
            className="button"
            disabled={!version}
            title={
              !version
                ? "Resume the failed run to generate this asset"
                : undefined
            }
            onClick={onReview}
          >
            Review asset
            <Icon name="arrow" size={12} />
          </button>
        </div>
      </div>
    </article>
  );
}
function ExportBar({
  campaign,
  dirty,
  disabled,
  onExport,
}: {
  campaign: Campaign;
  dirty: boolean;
  disabled: boolean;
  onExport: () => void;
}) {
  const gate = exportGate(campaign);
  return (
    <section className="export-bar">
      <div>
        <h3>
          {gate.allowed && !dirty
            ? "Your reviewed portfolio is ready."
            : "Review every required asset before export."}
        </h3>
        <p>
          ZIP with current approved assets, source references, and a version
          manifest.
        </p>
        {(!gate.allowed || dirty) && (
          <details>
            <summary>
              {dirty ? "Save brief changes before export." : gate.reasons[0]}{" "}
              {gate.reasons.length > 1
                ? `(+${gate.reasons.length - 1} more)`
                : ""}
            </summary>
            <ul>
              {gate.reasons.map((reason) => (
                <li key={reason}>{reason}</li>
              ))}
            </ul>
          </details>
        )}
      </div>
      <button
        className="button primary"
        disabled={!gate.allowed || dirty || disabled}
        onClick={onExport}
      >
        <Icon name="download" size={15} />
        Export approved portfolio
      </button>
    </section>
  );
}
function LandingPreview({
  campaign,
  merchantName,
  onReview,
  onDownload,
  onExport,
  dirty,
  busy,
}: {
  campaign?: Campaign;
  merchantName: string;
  onReview: () => void;
  onDownload: () => void;
  onExport: () => void;
  dirty: boolean;
  busy: boolean;
}) {
  const asset = campaign?.assets.find((item) => item.spec.kind === "landing"),
    content = asset && currentVersion(asset)?.content;
  const landing = content?.type === "landing" ? content : undefined;
  const heroAsset = campaign?.assets.find(
      (item) => item.spec.id === landing?.hero.imageAssetId,
    ),
    image = heroAsset && currentVersion(heroAsset)?.content;
  if (!landing)
    return (
      <div className="empty">
        <Icon name="layers" size={35} />
        <h2>A landing page that belongs to the campaign.</h2>
        <p>
          Create the portfolio to preview the generated content and original
          image concepts together.
        </p>
      </div>
    );
  return (
    <>
      {campaign && asset && !isCurrent(campaign, currentVersion(asset)!) && (
        <div className="notice">
          <Icon name="alert" size={17} />
          <p>
            This preview uses a stale version. Create the current portfolio
            before review or export.
          </p>
        </div>
      )}
      <div className="portfolio-toolbar">
        <div>
          <h2 style={{ fontSize: 16, marginBottom: 4 }}>
            Campaign landing page
          </h2>
          <p className="hint" style={{ margin: 0 }}>
            Responsive draft · Same portfolio imagery & messages · No live
            storefront changes
          </p>
        </div>
        <div className="actions">
          <button className="button" onClick={onReview}>
            Review asset
          </button>
          <button className="button" onClick={onDownload}>
            <Icon name="download" size={14} />
            Download brief
          </button>
        </div>
      </div>
      <div className="landing-preview">
        <div className="landing-brand">
          <span>{merchantName.toUpperCase()}</span>
          <small>Fictional merchant / Page preview</small>
        </div>
        <div className="landing-hero">
          <div className="landing-hero-copy">
            <div className="eyebrow">{landing.hero.eyebrow}</div>
            <h2>{landing.hero.title}</h2>
            <p>{landing.hero.body}</p>
            <a className="button" href="#preview-story">
              {landing.hero.cta}
              <Icon name="arrow" size={14} />
            </a>
          </div>
          {image?.type === "image" && (
            <img src={imageUrl(image)} alt={image.alt} />
          )}
        </div>
        <div className="landing-benefits">
          {landing.benefits.map((item) => (
            <div key={item.title}>
              <h3>{item.title}</h3>
              <p>{item.body}</p>
            </div>
          ))}
        </div>
        <div className="landing-story" id="preview-story">
          <h2>{landing.story.title}</h2>
          <p>{landing.story.body}</p>
        </div>
        <div className="landing-support">
          <h3>{landing.supporting.title}</h3>
          <p>{landing.supporting.body}</p>
          {landing.faq.map((item) => (
            <details key={item.question}>
              <summary>{item.question}</summary>
              <p>{item.answer}</p>
            </details>
          ))}
        </div>
        <footer className="landing-footer">
          Sample page content · Merchant review required · No commerce actions
        </footer>
      </div>
      {campaign && (
        <ExportBar
          campaign={campaign}
          dirty={dirty}
          disabled={busy}
          onExport={onExport}
        />
      )}
    </>
  );
}
function Activity({
  campaign,
  onDownload,
}: {
  campaign?: Campaign;
  onDownload: () => void;
}) {
  if (!campaign)
    return (
      <div className="empty">
        <Icon name="clock" size={35} />
        <h2>The campaign’s decisions will appear here.</h2>
        <p>
          Create a portfolio to inspect the plan, source context, provider
          attempts, and review events.
        </p>
      </div>
    );
  return (
    <>
      <div className="portfolio-toolbar">
        <div>
          <h2 style={{ fontSize: 17, marginBottom: 4 }}>
            Blueprint & activity
          </h2>
          <p className="hint">{campaign.blueprint.summary}</p>
        </div>
        <button className="button" onClick={onDownload}>
          <Icon name="download" size={14} />
          Download campaign brief
        </button>
      </div>
      <section className="panel" style={{ marginBottom: 20 }}>
        <h3>Plan instructions</h3>
        {campaign.blueprint.instructions.map((item) => (
          <p key={item} className="hint">
            {item}
          </p>
        ))}
        {campaign.blueprint.preferenceNotes.map((item) => (
          <p key={item} className="hint">
            {item}
          </p>
        ))}
        <div className="context-reference">
          <Icon name="layers" size={17} />
          <span>
            <strong>10 finite output specifications</strong>
            <p>
              Stable IDs · six compositions · copy · landing page · video brief
              · implementation checklist
            </p>
          </span>
        </div>
      </section>
      {campaign.runs
        .slice()
        .reverse()
        .map((run) => (
          <section className="panel history-card" key={run.id}>
            <div className="section-heading">
              <h2>
                {run.targetAssetId
                  ? `Revision · ${run.targetAssetId}`
                  : "Portfolio run"}
              </h2>
              <span className={`pill ${run.status}`}>{run.status}</span>
            </div>
            <ul className="activity-list">
              {run.events
                .slice()
                .reverse()
                .map((event) => (
                  <li key={event.id}>
                    <span className="event-dot" />
                    <div>
                      <p>{event.message}</p>
                      <small>
                        {event.type} · {new Date(event.at).toLocaleTimeString()}
                        {event.assetId ? ` · ${event.assetId}` : ""}
                      </small>
                    </div>
                  </li>
                ))}
            </ul>
          </section>
        ))}
    </>
  );
}
function CopyReview({
  content,
  edit,
  onEdit,
  onCopy,
}: {
  content: CopyContent;
  edit?: CopyContent;
  onEdit: (content: CopyContent) => void;
  onCopy: (value: string) => void;
}) {
  const arrays = [
    ["headlines", "Short headlines"],
    ["longHeadlines", "Long headlines"],
    ["descriptions", "Descriptions"],
    ["ctas", "CTA options"],
  ] as const;
  const singles = [
    ["productTitle", "Product title suggestion"],
    ["productDescription", "Product description suggestion"],
    ["collectionTitle", "Collection title suggestion"],
    ["collectionDescription", "Collection description suggestion"],
  ] as const;
  return (
    <div className="content-text">
      <p className="hint">
        Review artifact · Storefront suggestions are drafts
      </p>
      {arrays.map(([key, title]) => (
        <section key={key} className="copy-section">
          <h3>{title}</h3>
          {(edit || content)[key].map((line, index) =>
            edit ? (
              <textarea
                key={index}
                aria-label={`${title} ${index + 1}`}
                className="copy-edit"
                value={line}
                onChange={(event) =>
                  onEdit({
                    ...edit,
                    [key]: edit[key].map((value, i) =>
                      i === index ? event.target.value : value,
                    ),
                  })
                }
              />
            ) : (
              <div className="copy-line" key={index}>
                <span>{line}</span>
                <small>{line.length}</small>
                <button
                  className="button quiet"
                  aria-label={`Copy ${title.toLowerCase()} ${index + 1}`}
                  onClick={() => onCopy(line)}
                >
                  <Icon name="copy" size={13} />
                </button>
              </div>
            ),
          )}
        </section>
      ))}
      {singles.map(([key, title]) => (
        <section className="copy-section" key={key}>
          <h3>{title}</h3>
          {edit ? (
            <textarea
              className="copy-edit"
              aria-label={title}
              value={edit[key]}
              onChange={(event) =>
                onEdit({ ...edit, [key]: event.target.value })
              }
            />
          ) : (
            <p style={{ fontSize: 12 }}>{content[key]}</p>
          )}
        </section>
      ))}
    </div>
  );
}
