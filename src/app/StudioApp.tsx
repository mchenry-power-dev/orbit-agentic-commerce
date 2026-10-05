import { useEffect, useRef, useState } from "react";
import { Icon } from "../components/Icon";
import type { AppState } from "../domain";
import type { ServiceCapabilities } from "../domain/service";
import type {
  Channel,
  StudioAsset,
  StudioBrand,
  StudioBrief,
  StudioCampaign,
  StudioPlan,
  StudioState,
} from "../domain/studio";
import {
  freshStudioState,
  studioStatus,
  studioVersion,
} from "../domain/studio";
import {
  cosmicBrand,
  christmasSampleBrief,
  freshBrief,
  interpretLocalBrief,
} from "../fixtures/studio";
import {
  StudioEngine,
  campaignStatus,
  studioScenePrompt,
} from "../orchestration/studio";
import {
  readVisualReferences,
  imageReferenceInputs,
} from "../providers/visual-references";
import { StudioIndexedDbPersistence } from "../persistence/studio";
import { buildStudioExport, studioExportGate } from "../export/studio";
import {
  fromSemanticPlan,
  importedBrand,
  semanticRequest,
  StudioServiceClient,
} from "../providers/service-client";
import {
  getPlacement,
  placementSpecs,
  validateStudioBrief,
  studioAdsCharacterCount,
} from "../validation/placements";
import { BriefForm, channelNames, photoUrl } from "./StudioForms";
import BrandLibrary from "./BrandLibrary";
import { localDevelopmentServiceUrl } from "../providers/service-access";
import "./studio.css";
import VariantEditor from "./VariantEditor";
import ChannelHandoff from "./ChannelHandoff";
import CatalogPicker from "./CatalogPicker";
import { cosmicCatalog } from "../fixtures/catalog";
import { catalogSelectionBrand } from "../domain/catalog";

function defaultCatalogBrand() {
  const store = cosmicCatalog(),
    product = store.products[0];
  return catalogSelectionBrand(
    store,
    [{ productId: product.id, variantId: product.defaultVariantId }],
    cosmicBrand(),
  );
}

type Route = {
  view: "home" | "campaigns" | "brand" | "create" | "campaign";
  id?: string;
  tab?: string;
};
function readRoute(): Route {
  const [view, id, tab] = location.hash.replace(/^#\/?/, "").split("/");
  return view === "campaign"
    ? { view, id, tab: tab || "family" }
    : ["campaigns", "brand", "create"].includes(view)
      ? { view: view as Route["view"], tab: id || "brief" }
      : { view: "home" };
}
function download(bytes: Uint8Array | string, filename: string, type: string) {
  const url = URL.createObjectURL(
    new Blob([typeof bytes === "string" ? bytes : new Uint8Array(bytes)], {
      type,
    }),
  );
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
const firstRaster = (campaign?: StudioCampaign) => {
  const raster = campaign?.assets
    .map(studioVersion)
    .find((v) => v?.raster)?.raster;
  return raster?.previewDataUrl ?? raster?.dataUrl;
};
const modeText = (mode?: string) =>
  mode === "live-generation"
    ? "Live-generation mode · unavailable in hosted demo"
    : mode === "prebuilt-sample"
      ? "Prebuilt example · photo compositions"
      : "Local photo composition · no model calls";

export default function StudioApp() {
  const [service] = useState(() => {
    const url = localDevelopmentServiceUrl(
      import.meta.env.VITE_ORBIT_SERVICE_URL,
      import.meta.env.DEV,
      location.hostname,
    );
    return url ? new StudioServiceClient(url) : undefined;
  });
  const [storage] = useState(() => new StudioIndexedDbPersistence());
  const [engine] = useState(
    () =>
      new StudioEngine(storage, {
        scene: async (campaign, familyId, signal, revisionNote) => {
          if (!service)
            throw new Error(
              "Live image generation is unavailable in this no-key release. Use a local composition plan; no result was substituted.",
            );
          const prompt = studioScenePrompt(campaign, familyId, revisionNote);
          const referenceImages = imageReferenceInputs(
            await readVisualReferences(campaign.brand, signal),
          );
          const digest = await crypto.subtle.digest(
            "SHA-256",
            new TextEncoder().encode(
              JSON.stringify({
                campaignId: campaign.id,
                familyId,
                prompt,
                referenceImages,
                size: "1536x1024",
              }),
            ),
          );
          const requestId = `scene-${[...new Uint8Array(digest)].map((n) => n.toString(16).padStart(2, "0")).join("")}`;
          const image = await service.image(
            {
              requestId,
              prompt,
              size: "1536x1024",
              referenceImages,
              backgroundOnly: true,
            },
            signal,
          );
          return {
            dataUrl: `data:${image.image.mimeType};base64,${image.image.base64}`,
            provenance: image.provenance,
          };
        },
      }),
  );
  const [state, setState] = useState<StudioState>(freshStudioState);
  const [legacy, setLegacy] = useState<AppState>();
  const [route, setRoute] = useState<Route>(readRoute);
  const [ready, setReady] = useState(false),
    [locked, setLocked] = useState(false);
  const [storageFailed, setStorageFailed] = useState(false);
  const [temporaryWorkspace, setTemporaryWorkspace] = useState(false);
  const [brief, setBrief] = useState<StudioBrief>(() =>
    freshBrief(defaultCatalogBrand()),
  );
  const [brand, setBrand] = useState<StudioBrand>(defaultCatalogBrand);
  const [plan, setPlan] = useState<StudioPlan>();
  const [sample, setSample] = useState<StudioCampaign>();
  const [busy, setBusy] = useState(false),
    [saving, setSaving] = useState(false);
  const [error, setError] = useState(""),
    [toast, setToast] = useState("");
  const [mode, setMode] = useState<"local-composition" | "live-generation">(
    "local-composition",
  );
  const [capabilities, setCapabilities] = useState<ServiceCapabilities>();
  const [reviewId, setReviewId] = useState<string>(),
    [revisionNote, setRevisionNote] = useState("");
  const [copyEdit, setCopyEdit] = useState<StudioPlan["copy"]>();
  const [handoffOpen, setHandoffOpen] = useState(false);
  const handoffTrigger = useRef<HTMLButtonElement>(null);
  const [selected, setSelected] = useState<string[]>([]),
    [family, setFamily] = useState("all");
  const [destination, setDestination] = useState<Channel | "all">("all");
  const [previewDevice, setPreviewDevice] = useState<"desktop" | "mobile">(
    "desktop",
  );
  const [developerFailure, setDeveloperFailure] = useState(false);
  const [brandReturn, setBrandReturn] = useState("#/create/brief");
  const briefRef = useRef(brief),
    brandRef = useRef(brand),
    planRef = useRef(plan),
    saveCount = useRef(0);
  const loadedCampaignId = useRef(route.id);
  const editingCampaignId = useRef(route.id);
  const dialogRef = useRef<HTMLDivElement>(null),
    headingRef = useRef<HTMLDivElement>(null);
  const campaign = state.campaigns.find((c) => c.id === route.id);
  const asset = campaign?.assets.find((a) => a.id === reviewId);
  const version = asset && studioVersion(asset);
  const running = !!campaign?.runs.some((r) => r.status === "running");
  const dirty =
    !!campaign &&
    (JSON.stringify(brief) !== JSON.stringify(campaign.brief) ||
      JSON.stringify(brand) !== JSON.stringify(campaign.brand) ||
      (!!plan && JSON.stringify(plan) !== JSON.stringify(campaign.plan)));
  const gate =
    campaign &&
    studioExportGate(campaign, destination === "all" ? undefined : destination);

  function go(hash: string) {
    setHandoffOpen(false);
    setReviewId(undefined);
    location.hash = hash;
  }
  async function action(operation: () => Promise<unknown>, message?: string) {
    setBusy(true);
    setError("");
    try {
      await operation();
      if (message) setToast(message);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "The action failed. Saved work remains available.",
      );
    } finally {
      setBusy(false);
    }
  }
  function autosave(
    nextBrief: StudioBrief,
    nextBrand: StudioBrand,
    nextPlan?: StudioPlan,
  ) {
    saveCount.current++;
    setSaving(true);
    void engine
      .saveDraft(nextBrief, nextBrand, nextPlan, editingCampaignId.current)
      .catch((err) =>
        setError(
          err instanceof Error
            ? err.message
            : "Autosave failed; keep this page open.",
        ),
      )
      .finally(() => {
        saveCount.current--;
        if (!saveCount.current) setSaving(false);
      });
  }
  function changeBrief(next: StudioBrief) {
    briefRef.current = next;
    setBrief(next);
    planRef.current = undefined;
    setPlan(undefined);
    autosave(next, brandRef.current);
  }
  function changeBrand(next: StudioBrand) {
    brandRef.current = next;
    setBrand(next);
    planRef.current = undefined;
    setPlan(undefined);
    autosave(briefRef.current, next);
  }
  async function selectCatalogProducts(
    nextBrand: StudioBrand,
    productIds: string[],
  ) {
    const nextBrief = { ...briefRef.current, productIds };
    loadBrief(nextBrief, nextBrand);
    await engine.saveDraft(
      nextBrief,
      nextBrand,
      undefined,
      editingCampaignId.current,
    );
  }
  function changePlan(next: StudioPlan) {
    planRef.current = next;
    setPlan(next);
    autosave(briefRef.current, brandRef.current, next);
  }
  function loadBrief(
    nextBrief: StudioBrief,
    nextBrand: StudioBrand,
    nextPlan?: StudioPlan,
  ) {
    briefRef.current = structuredClone(nextBrief);
    brandRef.current = structuredClone(nextBrand);
    planRef.current = nextPlan && structuredClone(nextPlan);
    setBrief(briefRef.current);
    setBrand(brandRef.current);
    setPlan(planRef.current);
  }

  useEffect(() => {
    let disposed = false,
      release: (() => void) | undefined;
    const unsubscribe = engine.subscribe(() => {
      if (!disposed) setState(engine.getSnapshot());
    });
    if (!navigator.locks) {
      setLocked(true);
      setError(
        "Use a current browser with Web Locks to protect local campaign writes.",
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
            await engine.initialize();
            const previous = await storage.legacy();
            if (disposed) return;
            setLegacy(previous);
            setState(engine.getSnapshot());
            const snapshot = engine.getSnapshot();
            const draft =
              readRoute().view === "campaign"
                ? snapshot.drafts?.[readRoute().id ?? ""]
                : (snapshot.newDraft ?? snapshot.draft);
            const currentRoute = readRoute();
            const current = engine
              .getSnapshot()
              .campaigns.find((c) => c.id === currentRoute.id);
            if (draft && (!current || draft.campaignId === current.id))
              loadBrief(draft.brief, draft.brand, draft.plan);
            else if (current)
              loadBrief(current.brief, current.brand, current.plan);
            editingCampaignId.current = current?.id ?? draft?.campaignId;
            setReady(true);
            await new Promise<void>((resolve) => {
              release = resolve;
            });
          } catch (err) {
            if (!disposed) {
              setStorageFailed(true);
              setError(
                err instanceof Error
                  ? err.message
                  : "Local storage unavailable.",
              );
              setLocked(true);
            }
          }
        },
      );
    return () => {
      disposed = true;
      unsubscribe();
      release?.();
    };
  }, [engine, storage, temporaryWorkspace]);
  useEffect(() => {
    const update = () => {
      const next = readRoute();
      if (next.view === "campaign" && next.id !== loadedCampaignId.current) {
        const snapshot = engine.getSnapshot();
        const item = snapshot.campaigns.find((c) => c.id === next.id);
        const draft = snapshot.drafts?.[next.id ?? ""];
        if (item)
          loadBrief(
            draft?.brief ?? item.brief,
            draft?.brand ?? item.brand,
            draft?.plan ?? item.plan,
          );
        loadedCampaignId.current = next.id;
        editingCampaignId.current = next.id;
      }
      if (next.view === "create" && loadedCampaignId.current) {
        const draft = engine.getSnapshot().newDraft;
        if (draft) loadBrief(draft.brief, draft.brand, draft.plan);
        else {
          const nextBrand = defaultCatalogBrand();
          loadBrief(freshBrief(nextBrand), nextBrand);
        }
        loadedCampaignId.current = undefined;
        editingCampaignId.current = undefined;
      }
      setRoute(next);
      setSelected([]);
      setReviewId(undefined);
      setHandoffOpen(false);
      setError("");
    };
    const unload = (e: BeforeUnloadEvent) => {
      if (saveCount.current) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("hashchange", update);
    window.addEventListener("beforeunload", unload);
    return () => {
      window.removeEventListener("hashchange", update);
      window.removeEventListener("beforeunload", unload);
    };
  }, []);
  useEffect(() => {
    if (ready) headingRef.current?.focus();
  }, [route.view, route.id, route.tab, ready]);
  useEffect(() => {
    const controller = new AbortController();
    fetch(`${import.meta.env.BASE_URL}samples/cosmic-christmas.json`, {
      signal: controller.signal,
    })
      .then((response) => {
        if (!response.ok)
          throw new Error(
            "The prebuilt example is unavailable; use the Christmas preset to compose it locally.",
          );
        return response.json();
      })
      .then((data: StudioCampaign) => setSample(data))
      .catch((err) => {
        if (!controller.signal.aborted)
          setError(err instanceof Error ? err.message : "Sample unavailable");
      });
    if (service)
      void service
        .capabilities(controller.signal)
        .then(setCapabilities)
        .catch(() => setCapabilities(undefined));
    return () => controller.abort();
  }, [service]);
  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(""), 3500);
      return () => clearTimeout(timer);
    }
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
      const items = [
        ...(dialogRef.current?.querySelectorAll<HTMLElement>(
          'button:not(:disabled),input,textarea,select,summary,[tabindex="0"]',
        ) ?? []),
      ].filter((el) => el.offsetParent !== null);
      const first = items[0],
        last = items.at(-1);
      if (!first) return;
      if (
        event.shiftKey &&
        (document.activeElement === first ||
          document.activeElement === dialogRef.current)
      ) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
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

  function startNew(preset = false) {
    editingCampaignId.current = undefined;
    loadedCampaignId.current = undefined;
    const nextBrand = defaultCatalogBrand(),
      nextBrief = preset
        ? christmasSampleBrief(nextBrand)
        : freshBrief(nextBrand);
    loadBrief(nextBrief, nextBrand);
    autosave(nextBrief, nextBrand);
    go("/create/brief");
  }
  async function explore() {
    if (!sample) {
      setError(
        "The finished example is not available yet. Use the preset to create local photo compositions.",
      );
      return;
    }
    await action(async () => {
      const item = await engine.importSample(sample);
      loadBrief(item.brief, item.brand, item.plan);
      editingCampaignId.current = item.id;
      loadedCampaignId.current = item.id;
      go(`/campaign/${item.id}/family`);
    });
  }
  async function makePlan() {
    await action(async () => {
      const currentBrief = structuredClone(briefRef.current),
        currentBrand = structuredClone(brandRef.current);
      const findings = validateStudioBrief(currentBrief, currentBrand).filter(
        (f) => f.severity === "error",
      );
      if (findings.length)
        throw new Error(findings.map((f) => f.message).join(" "));
      let next: StudioPlan;
      if (mode === "live-generation") {
        if (
          currentBrand.sources.filter(
            (s) => s.included && s.role === "visual-inspiration" && s.image,
          ).length > 2
        )
          throw new Error(
            "Select at most two visual image references for live generation.",
          );
        if (!service || !capabilities?.semanticPlanning)
          throw new Error(
            "Live semantic planning is unavailable in this no-key release. Use local photo composition; no result was substituted.",
          );
        next = fromSemanticPlan(
          await service.plan(
            semanticRequest(currentBrief, currentBrand, state.preferences),
          ),
          currentBrief,
          state.preferences.generousSpace,
        );
      } else
        next = interpretLocalBrief(
          currentBrief,
          currentBrand,
          state.preferences,
        );
      changePlan(next);
      go(campaign ? `/campaign/${campaign.id}/plan` : "/create/plan");
    });
  }
  async function create() {
    const latestPlan = planRef.current;
    if (!latestPlan?.confirmed) {
      setError("Confirm Orbit’s interpretation before creation.");
      return;
    }
    await action(async () => {
      let item = campaign;
      if (item)
        await engine.update(
          item.id,
          briefRef.current,
          brandRef.current,
          latestPlan,
        );
      else
        item = await engine.create(
          briefRef.current,
          brandRef.current,
          latestPlan,
        );
      editingCampaignId.current = item.id;
      loadedCampaignId.current = item.id;
      go(`/campaign/${item.id}/family`);
      await engine.run(
        item.id,
        undefined,
        undefined,
        developerFailure
          ? engine
              .getSnapshot()
              .campaigns.find((c) => c.id === item!.id)
              ?.assets.find((a) => a.kind === "image")?.id
          : undefined,
      );
    });
  }
  function openCampaign(item: StudioCampaign) {
    const draft =
      state.drafts?.[item.id] ??
      (state.draft?.campaignId === item.id ? state.draft : undefined);
    loadBrief(
      draft?.brief ?? item.brief,
      draft?.brand ?? item.brand,
      draft?.plan ?? item.plan,
    );
    loadedCampaignId.current = item.id;
    editingCampaignId.current = item.id;
    setFamily("all");
    go(`/campaign/${item.id}/family`);
  }
  function openReview(item: StudioAsset) {
    setReviewId(item.id);
    setRevisionNote("");
    setCopyEdit(
      item.kind === "copy" ? structuredClone(campaign!.plan.copy) : undefined,
    );
  }
  async function importPages(urls: string[]) {
    await action(async () => {
      if (!service || !capabilities?.publicImport)
        throw new Error(
          "Local service required. Website import is unavailable in the hosted demo. Use bundled brand context, paste confirmed facts, or upload an owned PNG/JPEG.",
        );
      const result = await service.import({ urls });
      const next = importedBrand(result, urls[0]);
      changeBrand(next);
      changeBrief({
        ...briefRef.current,
        productIds: [],
        title: briefRef.current.title,
      });
      if (result.failures.length)
        setError(
          result.failures.map((f) => `${f.url}: ${f.message}`).join(" "),
        );
      setToast(
        `${result.sources.length} pages and ${result.images.length} photos imported. Confirm facts and photo associations.`,
      );
    });
  }
  async function exportPacket() {
    if (dirty) {
      setError("Confirm and apply the saved brief changes before export.");
      return;
    }
    if (campaign)
      await action(async () => {
        const packet = buildStudioExport(
          campaign,
          destination === "all" ? undefined : destination,
        );
        download(packet.bytes, packet.filename, "application/zip");
      }, "Approved current files exported.");
  }
  async function revise() {
    if (!campaign || !asset) return;
    if (!revisionNote.trim()) {
      setError("Describe the supported change before requesting a revision.");
      return;
    }
    if (
      campaign.mode !== "live-generation" &&
      !/space|crowd|center/i.test(revisionNote)
    ) {
      setError(
        "Local photo revisions support more space or centered framing. Edit the family’s festive, cool, or editorial theme and palette in its plan. Arbitrary scene generation is unavailable in this no-key release.",
      );
      return;
    }
    await action(() => engine.run(campaign.id, [asset.id], revisionNote));
  }
  const tab = route.tab || "family";
  const visibleAssets =
    campaign?.assets
      .filter(
        (a) =>
          family === "all" ||
          a.familyId === family ||
          a.familyId === "campaign",
      )
      .sort(
        (a, b) =>
          Number(b.placementId === "website-desktop") -
          Number(a.placementId === "website-desktop"),
      ) ?? [];
  if (locked)
    return (
      <div className="studio locked-page">
        <Icon name="orbit" size={45} />
        <h1>One workspace at a time</h1>
        <p>
          {error ||
            "Another Orbit tab is editing local campaigns. Close it and retry to prevent conflicting writes."}
        </p>
        <button className="button primary" onClick={() => location.reload()}>
          Retry workspace access
        </button>
        {storageFailed && (
          <>
            <p>
              Existing saved work has not been changed. You can also compose in
              a temporary session and download before closing.
            </p>
            <button
              className="button"
              onClick={() => {
                storage.useTemporaryWorkspace();
                setStorageFailed(false);
                setLocked(false);
                setError("");
                setTemporaryWorkspace(true);
              }}
            >
              Use a temporary workspace
            </button>
          </>
        )}
      </div>
    );
  if (!ready)
    return (
      <div className="studio locked-page">
        <Icon name="orbit" size={36} />
        <p>Opening your creative workspace…</p>
      </div>
    );
  return (
    <div className="studio">
      <div
        className="studio-shell"
        aria-hidden={reviewId || handoffOpen ? true : undefined}
        inert={reviewId || handoffOpen ? true : undefined}
      >
        <aside className="studio-sidebar">
          <button
            className="studio-logo"
            aria-label="Orbit Home"
            onClick={() => go("/")}
          >
            <Icon name="orbit" size={37} />
            <span>
              Orbit<sup>™</sup>
              <small>STUDIO</small>
            </span>
          </button>
          <nav aria-label="Primary navigation">
            {(
              [
                ["home", "Home", "orbit"],
                ["campaigns", "Campaigns", "grid"],
                ["brand", "Brand library", "layers"],
              ] as const
            ).map(([view, label, icon]) => (
              <button
                key={view}
                className={route.view === view ? "active" : ""}
                onClick={() => {
                  if (view === "brand") setBrandReturn(location.hash || "#/");
                  go(`/${view}`);
                }}
              >
                <Icon name={icon} />
                {label}
              </button>
            ))}
          </nav>
          <div className="studio-sidebar-foot">
            <strong>Agentic Commerce OS</strong>
            <span>Creative production & handoff</span>
            <small>Product direction by McHenry Power</small>
          </div>
        </aside>
        <main className="studio-main">
          <header className="studio-topbar">
            <div className="studio-breadcrumb">
              <button onClick={() => go("/")}>Home</button>
              {route.view !== "home" && (
                <>
                  <span>/</span>
                  <button onClick={() => go("/campaigns")}>Campaigns</button>
                  <span>/</span>
                  <b>
                    {campaign?.brief.title ||
                      (route.view === "brand" ? "Brand library" : "Create")}
                  </b>
                </>
              )}
            </div>
            <span className="capability-mode">
              <span title={modeText(campaign?.mode)}>
                Demo mode · Photo composition · Simulated publishing
              </span>
              <i /> {saving ? "Saving…" : "Browser-local work"}
            </span>
          </header>
          <div className="studio-content" ref={headingRef} tabIndex={-1}>
            {temporaryWorkspace && (
              <div className="studio-notice">
                <p>
                  Temporary workspace · refresh or closing this tab will discard
                  this session. Download your approved work first. Previously
                  saved campaigns remain untouched.
                </p>
              </div>
            )}
            {error && (
              <div className="studio-notice error" role="alert">
                <p>{error}</p>
                <button
                  className="button quiet"
                  aria-label="Dismiss error"
                  onClick={() => setError("")}
                >
                  <Icon name="close" size={16} />
                </button>
              </div>
            )}
            {route.view === "home" && (
              <>
                <section className="home-hero">
                  <div className="home-copy">
                    <span className="eyebrow">
                      Store → products → campaign → handoff
                    </span>
                    <h1>
                      Choose your products.
                      <br />
                      Prepare every placement.
                    </h1>
                    <p>
                      Build a coordinated campaign from your catalog. Review
                      each creative, then download or preview a channel handoff.
                    </p>
                    <div className="home-actions">
                      <button
                        className="button primary"
                        disabled={!sample || busy}
                        onClick={() => void explore()}
                      >
                        Explore a finished campaign{" "}
                        <Icon name="arrow" size={17} />
                      </button>
                      <button className="button" onClick={() => startNew()}>
                        Create a campaign
                      </button>
                    </div>
                    <span className="helper">
                      Cosmic Cat product photography · prebuilt example · no
                      model calls
                    </span>
                  </div>
                  <div className="outcome-collage">
                    {sample ? (
                      <>
                        <img
                          className="outcome-main"
                          src={firstRaster(sample)}
                          alt="Finished Cosmic Cat Christmas creative family"
                        />
                        <div className="outcome-mobile">
                          <img
                            src={
                              studioVersion(
                                sample.assets.find(
                                  (a) => a.placementId === "website-mobile",
                                )!,
                              )?.raster?.dataUrl || firstRaster(sample)
                            }
                            alt="Related mobile website hero"
                          />
                          <span>Mobile hero</span>
                        </div>
                        <div className="outcome-copy">
                          <small>Campaign copy</small>
                          <strong>{sample.plan.copy.headlines[0]}</strong>
                          <span>{sample.plan.copy.descriptions[0]}</span>
                        </div>
                        <span className="outcome-label">
                          Two products · two directions · purpose-built formats
                        </span>
                      </>
                    ) : (
                      <img
                        src={photoUrl(cosmicBrand().products[0].photo)}
                        alt="Original Cosmic Cat product photograph"
                      />
                    )}
                  </div>
                </section>
                <section className="home-workflow">
                  <span>Store & products</span>
                  <Icon name="arrow" size={17} />
                  <span>Creative plan</span>
                  <Icon name="arrow" size={17} />
                  <span>Placement variants</span>
                  <Icon name="arrow" size={17} />
                  <span>Review & handoff</span>
                </section>
                <div className="section-title recent-title">
                  <div>
                    <span className="eyebrow">Keep the work together</span>
                    <h2>Your campaigns</h2>
                  </div>
                  <button
                    className="button quiet"
                    onClick={() => go("/campaigns")}
                  >
                    All campaigns <Icon name="arrow" size={15} />
                  </button>
                </div>
                <CampaignCards
                  campaigns={state.campaigns.slice(0, 3)}
                  onOpen={openCampaign}
                />
                {!state.campaigns.length && (
                  <p className="helper">
                    Your own saved campaigns appear here. Exploring the example
                    creates a separate local copy with no approvals.
                  </p>
                )}
              </>
            )}
            {route.view === "campaigns" && (
              <>
                <div className="page-title">
                  <div>
                    <span className="eyebrow">Your creative workspace</span>
                    <h1>Campaigns</h1>
                    <p>Ideas, families, and reviewed handoffs in one place.</p>
                  </div>
                  <button className="button primary" onClick={() => startNew()}>
                    Create a campaign <Icon name="plus" size={16} />
                  </button>
                </div>
                <CampaignCards
                  campaigns={state.campaigns}
                  onOpen={openCampaign}
                />
                {!state.campaigns.length && (
                  <div className="surface empty-state">
                    <h2>A good brief starts the next family.</h2>
                    <p>
                      Explore the finished Cosmic Cat example, or start with
                      your own idea.
                    </p>
                    <button
                      className="button"
                      disabled={!sample}
                      onClick={() => void explore()}
                    >
                      Explore a finished campaign
                    </button>
                  </div>
                )}
                {state.draft && (
                  <div className="surface saved-draft">
                    <div>
                      <strong>Saved brief in progress</strong>
                      <p>{state.draft.brief.title || "Untitled campaign"}</p>
                    </div>
                    <button
                      className="button"
                      onClick={() => {
                        loadBrief(
                          state.draft!.brief,
                          state.draft!.brand,
                          state.draft!.plan,
                        );
                        go(
                          state.draft!.campaignId
                            ? `/campaign/${state.draft!.campaignId}/brief`
                            : "/create/brief",
                        );
                      }}
                    >
                      Continue brief
                    </button>
                  </div>
                )}
                {!!legacy?.campaigns.length && (
                  <details className="advanced">
                    <summary>
                      Preserved V1 campaigns ({legacy.campaigns.length})
                    </summary>
                    <p className="helper">
                      Original campaign records remain unchanged. Open the V1
                      workspace to inspect its SVG drafts and original
                      approvals.
                    </p>
                    {legacy.campaigns.map((c) => (
                      <a
                        className="legacy-link"
                        key={c.id}
                        href={`${import.meta.env.BASE_URL}?legacy=1&campaign=${encodeURIComponent(c.id)}`}
                      >
                        {c.brief.title} ·{" "}
                        {c.assets.filter((a) => a.currentVersionId).length}{" "}
                        generated outputs
                      </a>
                    ))}
                  </details>
                )}
              </>
            )}
            {route.view === "brand" && (
              <>
                <div className="page-title">
                  <div>
                    <span className="eyebrow">Context, with provenance</span>
                    <h1>Brand library</h1>
                    <p>
                      Facts constrain the work. References guide its visual
                      direction.
                    </p>
                  </div>
                  <button
                    className="button"
                    onClick={() => {
                      changeBrand({
                        id: crypto.randomUUID(),
                        name: "",
                        website: "",
                        tagline: "",
                        palette: ["#30233d", "#f0b661", "#fff8ec"],
                        tone: "",
                        products: [],
                        sources: [],
                        ownership: "visitor-confirmed",
                      });
                      changeBrief({ ...briefRef.current, productIds: [] });
                    }}
                  >
                    Use your brand
                  </button>
                </div>
                {state.brands.length > 0 && (
                  <div className="saved-brand-picker">
                    {state.brands.map((b) => (
                      <button
                        className="button"
                        key={b.id}
                        onClick={() => changeBrand(b)}
                      >
                        {b.name}
                      </button>
                    ))}
                  </div>
                )}
                <BrandLibrary
                  brand={brand}
                  onChange={changeBrand}
                  busy={busy}
                  importEnabled={!!capabilities?.publicImport}
                  onImport={importPages}
                  onError={setError}
                  onDelete={() =>
                    void action(async () => {
                      if (
                        !confirm(
                          "Delete this local brand and its draft uploads? Delete campaigns using it first.",
                        )
                      )
                        return;
                      await engine.deleteBrand(brandRef.current.id);
                      editingCampaignId.current = undefined;
                      loadedCampaignId.current = undefined;
                      loadBrief(freshBrief(), cosmicBrand());
                      go("/brand");
                    }, "Local brand deleted.")
                  }
                  onSave={() =>
                    void action(async () => {
                      await engine.saveBrand(brandRef.current);
                      go(brandReturn.replace(/^#/, ""));
                    }, "Brand saved locally.")
                  }
                />
              </>
            )}
            {(route.view === "create" ||
              (route.view === "campaign" &&
                (tab === "brief" || tab === "plan"))) && (
              <>
                <div className="page-title">
                  <div>
                    <span className="eyebrow">
                      {campaign ? "Campaign iteration" : "Create a campaign"}
                    </span>
                    <h1>
                      {campaign?.brief.title || "Make the idea tangible."}
                    </h1>
                    <p>
                      One brief. Two directions. Only the placements you choose.
                    </p>
                  </div>
                  <button
                    className="button quiet"
                    onClick={() => go("/campaigns")}
                  >
                    All campaigns
                  </button>
                </div>
                <div className="stage-nav" aria-label="Creation stages">
                  <button
                    className={tab === "brief" ? "active" : ""}
                    onClick={() =>
                      go(
                        campaign
                          ? `/campaign/${campaign.id}/brief`
                          : "/create/brief",
                      )
                    }
                  >
                    1. Brief & brand
                  </button>
                  <button
                    className={tab === "plan" ? "active" : ""}
                    disabled={!plan}
                    onClick={() =>
                      go(
                        campaign
                          ? `/campaign/${campaign.id}/plan`
                          : "/create/plan",
                      )
                    }
                  >
                    2. Creative plan
                  </button>
                  <span>3. Create, review & export</span>
                </div>
                {tab === "brief" && (
                  <BriefForm
                    catalog={
                      <CatalogPicker
                        catalogs={state.catalogs ?? [cosmicCatalog()]}
                        brand={brand}
                        selectedProductIds={brief.productIds}
                        onCatalogsChange={(catalogs) =>
                          engine.saveCatalogs(catalogs)
                        }
                        busy={busy}
                        onSelection={selectCatalogProducts}
                        onError={setError}
                      />
                    }
                    brief={brief}
                    brand={brand}
                    onChange={changeBrief}
                    busy={busy}
                    onPlan={() => void makePlan()}
                    onPreset={() => {
                      const next = christmasSampleBrief(brandRef.current);
                      changeBrief(next);
                    }}
                    onBrand={() => {
                      setBrandReturn(location.hash);
                      go("/brand");
                    }}
                  />
                )}
                {tab === "plan" && plan && (
                  <section className="surface interpretation">
                    <div className="section-title">
                      <div>
                        <span className="eyebrow">
                          02 · Orbit’s interpretation
                        </span>
                        <h2>Confirm the direction before creation.</h2>
                      </div>
                      <span className="pill">{modeText(plan.mode)}</span>
                    </div>
                    <p>{plan.interpretation}</p>
                    <div className="interpretation-facts">
                      <div>
                        <small>Audience</small>
                        <strong>{plan.audience}</strong>
                      </div>
                      <div>
                        <small>Confirmed products</small>
                        <strong>
                          {brand.products
                            .filter((p) => brief.productIds.includes(p.id))
                            .map((p) => p.name)
                            .join(", ")}
                        </strong>
                      </div>
                      <div>
                        <small>Offer</small>
                        <strong>{plan.offer || "No offer supplied"}</strong>
                      </div>
                      <div>
                        <small>Output plan</small>
                        <strong>
                          2 directions ·{" "}
                          {
                            brief.placementIds.filter(
                              (id) => getPlacement(id, brief).media === "image",
                            ).length
                          }{" "}
                          image targets each
                        </strong>
                      </div>
                    </div>
                    {plan.conflicts.length > 0 && (
                      <div className="studio-notice error" role="alert">
                        <div>
                          <strong>Resolve these conflicts</strong>
                          <ul>
                            {plan.conflicts.map((message) => (
                              <li key={message}>{message}</li>
                            ))}
                          </ul>
                          <button
                            className="button"
                            onClick={() =>
                              go(
                                campaign
                                  ? `/campaign/${campaign.id}/brief`
                                  : "/create/brief",
                              )
                            }
                          >
                            Edit brief & sources
                          </button>
                        </div>
                      </div>
                    )}
                    <div className="direction-plan-grid">
                      {plan.directions.map((direction, index) => (
                        <article key={direction.id} className="direction-plan">
                          <div
                            className="direction-swatch"
                            style={{ background: direction.palette[0] }}
                          >
                            <img
                              src={photoUrl(
                                brand.products.find((p) =>
                                  brief.productIds.includes(p.id),
                                )?.photo || "",
                              )}
                              alt="Protected product reference"
                            />
                            <div className="palette">
                              {direction.palette.map((color) => (
                                <span
                                  key={color}
                                  style={{ background: color }}
                                />
                              ))}
                            </div>
                          </div>
                          <div>
                            <label>
                              Creative layout
                              <select
                                value={direction.artDirection ?? "scene-led"}
                                onChange={(e) =>
                                  changePlan({
                                    ...plan,
                                    confirmed: false,
                                    directions: plan.directions.map((d, i) =>
                                      i === index
                                        ? {
                                            ...d,
                                            artDirection: e.target.value as
                                              "scene-led" | "editorial",
                                          }
                                        : d,
                                    ),
                                  })
                                }
                              >
                                <option value="scene-led">
                                  Scene-led photography
                                </option>
                                <option value="editorial">
                                  Editorial split
                                </option>
                              </select>
                            </label>
                            <label>
                              Family product
                              <select
                                value={direction.productIds?.[0] ?? "all"}
                                onChange={(e) =>
                                  changePlan({
                                    ...plan,
                                    confirmed: false,
                                    directions: plan.directions.map((d, i) =>
                                      i === index
                                        ? {
                                            ...d,
                                            productIds:
                                              e.target.value === "all"
                                                ? undefined
                                                : [e.target.value],
                                          }
                                        : d,
                                    ),
                                  })
                                }
                              >
                                <option value="all">
                                  All selected products
                                </option>
                                {brand.products
                                  .filter((p) =>
                                    brief.productIds.includes(p.id),
                                  )
                                  .map((p) => (
                                    <option key={p.id} value={p.id}>
                                      {p.name} · {p.size}
                                    </option>
                                  ))}
                              </select>
                            </label>
                            <label>
                              Direction name
                              <input
                                value={direction.name}
                                onChange={(e) =>
                                  changePlan({
                                    ...plan,
                                    confirmed: false,
                                    directions: plan.directions.map((d, i) =>
                                      i === index
                                        ? { ...d, name: e.target.value }
                                        : d,
                                    ),
                                  })
                                }
                              />
                            </label>
                            <label>
                              Scene & composition direction
                              <textarea
                                rows={3}
                                value={direction.scene}
                                onChange={(e) =>
                                  changePlan({
                                    ...plan,
                                    confirmed: false,
                                    directions: plan.directions.map((d, i) =>
                                      i === index
                                        ? {
                                            ...d,
                                            scene: e.target.value,
                                            imagePrompt:
                                              plan.mode === "live-generation"
                                                ? e.target.value
                                                : d.imagePrompt,
                                          }
                                        : d,
                                    ),
                                  })
                                }
                              />
                            </label>
                            <label>
                              Direction palette
                              <div className="palette-editor">
                                {direction.palette.map((color, colorIndex) =>
                                  (direction.artDirection === "editorial"
                                    ? [2, 3]
                                    : [0]
                                  ).includes(colorIndex) ? (
                                    <input
                                      key={colorIndex}
                                      type="color"
                                      aria-label={`Direction ${index + 1} ${colorIndex === 0 ? "scene background" : colorIndex === 2 ? "editorial accent" : "paper"}`}
                                      value={color}
                                      onChange={(e) =>
                                        changePlan({
                                          ...plan,
                                          confirmed: false,
                                          directions: plan.directions.map(
                                            (d, i) =>
                                              i === index
                                                ? {
                                                    ...d,
                                                    palette: d.palette.map(
                                                      (c, n) =>
                                                        n === colorIndex
                                                          ? e.target.value
                                                          : c,
                                                    ),
                                                  }
                                                : d,
                                          ),
                                        })
                                      }
                                    />
                                  ) : null,
                                )}
                              </div>
                            </label>
                            <label>
                              Visual mode
                              <select
                                value={direction.mood}
                                onChange={(e) =>
                                  changePlan({
                                    ...plan,
                                    confirmed: false,
                                    directions: plan.directions.map((d, i) =>
                                      i === index
                                        ? {
                                            ...d,
                                            mood: e.target
                                              .value as typeof d.mood,
                                            palette:
                                              e.target.value === "festive"
                                                ? [
                                                    "#361b20",
                                                    "#d3ad81",
                                                    "#b88b69",
                                                    "#f8f1e6",
                                                  ]
                                                : e.target.value === "cool"
                                                  ? [
                                                      "#e6f0ee",
                                                      "#17463e",
                                                      "#c9e1d5",
                                                      "#f7faf5",
                                                    ]
                                                  : [
                                                      "#153c32",
                                                      "#17483c",
                                                      "#c8ddce",
                                                      "#f5f1e8",
                                                    ],
                                          }
                                        : d,
                                    ),
                                  })
                                }
                              >
                                <option value="festive">
                                  Warm festive palette
                                </option>
                                <option value="cool">
                                  Cool daytime palette
                                </option>
                                <option value="editorial">
                                  Editorial palette
                                </option>
                              </select>
                            </label>
                            <label>
                              Product framing
                              <select
                                value={direction.composition}
                                onChange={(e) =>
                                  changePlan({
                                    ...plan,
                                    confirmed: false,
                                    directions: plan.directions.map((d, i) =>
                                      i === index
                                        ? {
                                            ...d,
                                            composition: e.target
                                              .value as typeof d.composition,
                                            placementComposition:
                                              d.placementComposition?.map(
                                                (p) => ({
                                                  ...p,
                                                  composition: e.target
                                                    .value as typeof d.composition,
                                                }),
                                              ),
                                          }
                                        : d,
                                    ),
                                  })
                                }
                              >
                                <option value="product-right">
                                  Offset within the photo frame
                                </option>
                                <option value="product-center">
                                  Centered within the photo frame
                                </option>
                              </select>
                            </label>
                            {direction.placementComposition && (
                              <details>
                                <summary>Placement compositions</summary>
                                {direction.placementComposition.map((p) => (
                                  <p key={p.placementId}>
                                    {getPlacement(p.placementId, brief).name}:{" "}
                                    {p.composition === "product-right"
                                      ? "product to the right"
                                      : "centered product"}
                                    , {Math.round(p.spacing * 100)}% composition
                                    margin.
                                  </p>
                                ))}
                              </details>
                            )}
                            <label>
                              Placement headline
                              <input
                                value={direction.headline}
                                onChange={(e) =>
                                  changePlan({
                                    ...plan,
                                    confirmed: false,
                                    directions: plan.directions.map((d, i) =>
                                      i === index
                                        ? { ...d, headline: e.target.value }
                                        : d,
                                    ),
                                  })
                                }
                              />
                            </label>
                          </div>
                        </article>
                      ))}
                    </div>
                    <details className="advanced">
                      <summary>
                        Expected formats & actual capability limits
                      </summary>
                      <ul>
                        {brief.placementIds.map((id) => (
                          <li key={id}>
                            {getPlacement(id, brief).name} ·{" "}
                            {getPlacement(id, brief).media === "video"
                              ? "Production brief, not rendered video"
                              : `${getPlacement(id, brief).width} × ${getPlacement(id, brief).height}`}
                          </li>
                        ))}
                      </ul>
                      <p>
                        Local composition supports festive, cool, and editorial
                        directions with confirmed palette, framing, spacing, and
                        copy around protected photos. The written scene is a
                        human review note; arbitrary natural-language
                        instructions are not interpreted by a live model.
                        Generative images and video are unavailable in the
                        hosted demo.
                      </p>
                    </details>
                    <div className="preview-copy surface">
                      <small>Copy preview</small>
                      <h3>{plan.copy.headlines[0]}</h3>
                      <p>{plan.copy.longHeadlines[0]}</p>
                      <p>{plan.landing.body}</p>
                    </div>
                    <label className="check-line confirm-plan">
                      <input
                        type="checkbox"
                        checked={plan.confirmed}
                        disabled={!!plan.conflicts.length}
                        onChange={(e) =>
                          changePlan({ ...plan, confirmed: e.target.checked })
                        }
                      />
                      I confirm these facts, directions, selected placements,
                      and capability limits.
                    </label>
                    <div className="step-action">
                      <span className="helper">
                        Creation never copies sample approvals.
                      </span>
                      <button
                        className="button primary"
                        disabled={
                          busy || !plan.confirmed || !!plan.conflicts.length
                        }
                        onClick={() => void create()}
                      >
                        Create creative family <Icon name="arrow" size={16} />
                      </button>
                    </div>
                  </section>
                )}
                <details className="advanced service-settings">
                  <summary>Capability mode & developer tools</summary>
                  <label>
                    Creation capability
                    <select
                      value={mode}
                      onChange={(e) => {
                        setMode(e.target.value as typeof mode);
                        setPlan(undefined);
                        planRef.current = undefined;
                      }}
                    >
                      <option value="local-composition">
                        Local photo composition · no model calls
                      </option>
                      <option
                        value="live-generation"
                        disabled={
                          !capabilities?.semanticPlanning ||
                          !capabilities?.imageGeneration
                        }
                      >
                        {service
                          ? "Live semantic planning & scenes · configured service required"
                          : "Live AI · deferred in hosted demo"}
                      </option>
                    </select>
                  </label>
                  <p className="helper">
                    {service
                      ? capabilities?.generationBlocker ||
                        "Live planning and generated scenes require a separately configured, approved provider. No live provider is connected unless the service reports those capabilities."
                      : "Live semantic planning and generative images/video are deferred in this hosted demo. No provider is connected. Use festive, cool, or editorial compositions with editable palette, framing, spacing, and copy."}
                  </p>
                  <label className="check-line">
                    <input
                      type="checkbox"
                      checked={developerFailure}
                      onChange={(e) => setDeveloperFailure(e.target.checked)}
                    />
                    Developer test: fail one image step
                  </label>
                </details>
              </>
            )}
            {route.view === "campaign" &&
              campaign &&
              !["brief", "plan"].includes(tab) && (
                <>
                  <div className="page-title">
                    <div>
                      <span className="eyebrow">
                        {campaign.brand.name} · {modeText(campaign.mode)}
                      </span>
                      <h1>{campaign.brief.title}</h1>
                      <p>
                        {campaignStatus(campaign)} ·{" "}
                        {
                          campaign.assets.filter(
                            (a) => studioStatus(a) === "Approved",
                          ).length
                        }{" "}
                        / {campaign.assets.length} merchant-reviewed assets
                      </p>
                    </div>
                    <button
                      className="button quiet"
                      onClick={() => go("/campaigns")}
                    >
                      All campaigns
                    </button>
                  </div>
                  <nav className="campaign-tabs" aria-label="Campaign sections">
                    {(
                      [
                        ["brief", "Brief"],
                        ["family", "Creative family"],
                        ["landing", "Landing page"],
                        ["activity", "Activity"],
                      ] as const
                    ).map(([value, label]) => (
                      <button
                        key={value}
                        className={tab === value ? "active" : ""}
                        onClick={() => {
                          if (value === "brief" && !dirty)
                            loadBrief(
                              campaign.brief,
                              campaign.brand,
                              campaign.plan,
                            );
                          go(`/campaign/${campaign.id}/${value}`);
                        }}
                      >
                        {label}
                      </button>
                    ))}
                  </nav>
                  {tab === "family" && (
                    <>
                      <div className="family-toolbar">
                        <div className="segmented">
                          <button
                            className={family === "all" ? "active" : ""}
                            onClick={() => setFamily("all")}
                          >
                            All directions
                          </button>
                          {campaign.plan.directions.map((d) => (
                            <button
                              className={family === d.id ? "active" : ""}
                              key={d.id}
                              onClick={() => setFamily(d.id)}
                            >
                              {d.name}
                            </button>
                          ))}
                        </div>
                        <button
                          className="button"
                          onClick={() => {
                            if (!dirty)
                              loadBrief(
                                campaign.brief,
                                campaign.brand,
                                campaign.plan,
                              );
                            go(
                              `/campaign/${campaign.id}/${plan ? "plan" : "brief"}`,
                            );
                          }}
                        >
                          Edit family direction
                        </button>
                      </div>
                      {dirty && (
                        <div className="studio-notice">
                          <p>
                            Saved brief or direction changes need a confirmed
                            interpretation before handoff. Earlier outputs
                            remain visible.
                          </p>
                          <button
                            className="button"
                            onClick={() => go(`/campaign/${campaign.id}/brief`)}
                          >
                            Apply brief changes
                          </button>
                        </div>
                      )}
                      <div className="coverage-strip">
                        <strong>Selected placements</strong>
                        <span>
                          {
                            campaign.brief.placementIds.filter(
                              (id) =>
                                getPlacement(id, campaign.brief)
                                  .verification === "design-goal",
                            ).length
                          }{" "}
                          design targets
                        </span>
                        <span>
                          {
                            campaign.brief.placementIds.filter(
                              (id) =>
                                getPlacement(id, campaign.brief)
                                  .verification === "verified-measurements" &&
                                getPlacement(id, campaign.brief).media ===
                                  "image",
                            ).length
                          }{" "}
                          measured targets
                        </span>
                        <span>
                          {
                            campaign.brief.placementIds.filter(
                              (id) =>
                                getPlacement(id, campaign.brief)
                                  .verification === "not-checked",
                            ).length
                          }{" "}
                          not checked
                        </span>
                        <span>
                          {
                            campaign.brief.placementIds.filter(
                              (id) =>
                                getPlacement(id, campaign.brief).media ===
                                "video",
                            ).length
                          }{" "}
                          need a video
                        </span>
                        <small>
                          No authenticated advertising accounts · policy
                          approval separate
                        </small>
                      </div>
                      {campaign.runs.at(-1)?.status === "failed" ||
                      campaign.runs.at(-1)?.status === "interrupted" ? (
                        <div className="studio-notice">
                          <p>
                            {campaign.runs.at(-1)?.error ||
                              "Creation was interrupted. Completed versions remain available."}
                          </p>
                          <button
                            className="button"
                            disabled={busy}
                            onClick={() =>
                              void action(() => engine.resume(campaign.id))
                            }
                          >
                            Resume missing outputs
                          </button>
                        </div>
                      ) : null}
                      {running && (
                        <div className="studio-notice">
                          <p>
                            Creating current outputs ·{" "}
                            {campaign.runs.at(-1)?.completedIds.length} /{" "}
                            {campaign.runs.at(-1)?.assetIds.length} persisted
                          </p>
                          <button
                            className="button"
                            onClick={() => void engine.pause()}
                          >
                            Pause creation
                          </button>
                        </div>
                      )}
                      {!running &&
                        !dirty &&
                        campaign.runs.at(-1)?.status !== "failed" &&
                        campaign.runs.at(-1)?.status !== "interrupted" &&
                        campaign.assets.some(
                          (a) => a.stale || !studioVersion(a),
                        ) && (
                          <div className="studio-notice">
                            <p>
                              Changed outputs need a new version and review.
                              Current unrelated approvals remain valid.
                            </p>
                            <button
                              className="button"
                              disabled={busy}
                              onClick={() =>
                                void action(() => engine.run(campaign.id))
                              }
                            >
                              Recreate changed outputs
                            </button>
                          </div>
                        )}
                      <div
                        className={`asset-grid ${family === "all" ? "" : "single-family"}`}
                      >
                        {visibleAssets.map((item) => (
                          <article
                            className={`asset-card ${item.kind !== "image" ? "text-asset" : ""} ${item.placementId === "website-desktop" ? "hero-asset" : ""}`}
                            key={item.id}
                          >
                            <div className="asset-preview">
                              {studioVersion(item)?.raster ? (
                                <img
                                  src={
                                    studioVersion(item)!.raster!
                                      .previewDataUrl ??
                                    studioVersion(item)!.raster!.dataUrl
                                  }
                                  loading="lazy"
                                  width={studioVersion(item)!.raster!.width}
                                  height={studioVersion(item)!.raster!.height}
                                  alt={item.title}
                                />
                              ) : (
                                <div className="asset-text-preview">
                                  <Icon
                                    name={
                                      item.kind === "video"
                                        ? "file"
                                        : item.kind === "copy"
                                          ? "copy"
                                          : "layers"
                                    }
                                    size={28}
                                  />
                                  <h3>
                                    {item.kind === "copy"
                                      ? campaign.plan.copy.headlines[0]
                                      : item.kind === "landing"
                                        ? campaign.plan.landing.title
                                        : item.kind === "video"
                                          ? "A shot plan, not a finished video"
                                          : "One campaign. Coordinated decisions."}
                                  </h3>
                                  <p>
                                    {item.kind === "copy"
                                      ? campaign.plan.copy.descriptions[0]
                                      : item.kind === "landing"
                                        ? campaign.plan.landing.body
                                        : item.kind === "video"
                                          ? campaign.plan.video.script.slice(
                                              0,
                                              150,
                                            )
                                          : campaign.plan.theme}
                                  </p>
                                </div>
                              )}
                            </div>
                            <div className="asset-card-body">
                              <div className="asset-meta">
                                <small>
                                  {item.kind === "image"
                                    ? (
                                        item.compatiblePlacementIds ?? [
                                          item.placementId,
                                        ]
                                      )
                                        .map(
                                          (id) =>
                                            getPlacement(id, campaign.brief)
                                              .name,
                                        )
                                        .join(" + ")
                                    : item.kind === "video"
                                      ? "Video brief · motion checks missing"
                                      : "Campaign handoff"}
                                </small>
                                <label className="selection-box">
                                  <input
                                    type="checkbox"
                                    aria-label={`Select ${item.title} for approval`}
                                    checked={selected.includes(item.id)}
                                    disabled={
                                      !studioVersion(item) ||
                                      item.stale ||
                                      !!studioVersion(item)?.findings.some(
                                        (f) => f.severity === "error",
                                      )
                                    }
                                    onChange={(e) =>
                                      setSelected(
                                        e.target.checked
                                          ? [...selected, item.id]
                                          : selected.filter(
                                              (id) => id !== item.id,
                                            ),
                                      )
                                    }
                                  />
                                </label>
                              </div>
                              <h3>{item.title}</h3>
                              <div className="asset-card-actions">
                                <span
                                  className={`status-pill ${studioStatus(item).toLowerCase().replaceAll(" ", "-")}`}
                                >
                                  {studioStatus(item)}
                                </span>
                                <button
                                  className="button quiet"
                                  disabled={!studioVersion(item)}
                                  onClick={() => openReview(item)}
                                >
                                  Review asset <Icon name="arrow" size={14} />
                                </button>
                              </div>
                              <small>
                                Version {studioVersion(item)?.number ?? "—"} ·{" "}
                                {item.kind === "image"
                                  ? `${studioVersion(item)?.raster?.width ?? "—"} × ${studioVersion(item)?.raster?.height ?? "—"} · ${studioVersion(item)?.raster?.mime === "image/jpeg" ? "JPEG" : "PNG"}`
                                  : "Draft content"}
                              </small>
                            </div>
                          </article>
                        ))}
                      </div>
                      <div className="review-export surface">
                        <div>
                          <h3>Review the exact files before handoff.</h3>
                          <p>
                            Selected assets: {selected.length}. Bulk approval
                            uses only your intentional selections.
                          </p>
                          {!gate?.allowed && (
                            <details>
                              <summary>
                                Why export is unavailable (
                                {gate?.reasons.length})
                              </summary>
                              <ul>
                                {gate?.reasons.map((reason, i) => (
                                  <li key={i}>{reason}</li>
                                ))}
                              </ul>
                            </details>
                          )}
                        </div>
                        <div className="export-actions">
                          <button
                            className="button"
                            disabled={!selected.length || busy || running}
                            onClick={() =>
                              void action(async () => {
                                await engine.approve(campaign.id, selected);
                                setSelected([]);
                              })
                            }
                          >
                            Approve selected ({selected.length})
                          </button>
                          <label>
                            Export destination
                            <select
                              value={destination}
                              onChange={(e) =>
                                setDestination(
                                  e.target.value as typeof destination,
                                )
                              }
                            >
                              <option value="all">Selected destinations</option>
                              {campaign.brief.channels.map((channel) => (
                                <option key={channel} value={channel}>
                                  {channelNames[channel]}
                                </option>
                              ))}
                            </select>
                          </label>
                          <button
                            className="button primary"
                            disabled={
                              !gate?.allowed || busy || running || dirty
                            }
                            onClick={() => void exportPacket()}
                          >
                            <Icon name="download" size={17} />
                            Download assets
                          </button>
                          <button
                            className="button"
                            disabled={busy || running || dirty}
                            ref={handoffTrigger}
                            onClick={() => setHandoffOpen(true)}
                          >
                            Preview channel publishing
                          </button>
                        </div>
                      </div>
                    </>
                  )}
                  {tab === "landing" && (
                    <section className="surface landing-workspace">
                      <div className="section-title">
                        <div>
                          <span className="eyebrow">
                            Same campaign, intentional framing
                          </span>
                          <h2>Landing-page preview</h2>
                        </div>
                        <div className="segmented">
                          <button
                            className={
                              previewDevice === "desktop" ? "active" : ""
                            }
                            onClick={() => setPreviewDevice("desktop")}
                          >
                            Desktop
                          </button>
                          <button
                            className={
                              previewDevice === "mobile" ? "active" : ""
                            }
                            onClick={() => setPreviewDevice("mobile")}
                          >
                            Mobile
                          </button>
                        </div>
                      </div>
                      <div className={`landing-preview ${previewDevice}`}>
                        <div className="landing-brand">
                          {campaign.brand.name}
                        </div>
                        <LandingHero
                          campaign={campaign}
                          device={previewDevice}
                        />
                        <div className="landing-sections">
                          {campaign.plan.landing.sections.map((s) => (
                            <section key={s.title}>
                              <h3>{s.title}</h3>
                              <p>{s.body}</p>
                            </section>
                          ))}
                        </div>
                        <span className="helper">
                          Preview only · browser-local content · no published
                          storefront
                        </span>
                      </div>
                      <button
                        className="button"
                        onClick={() =>
                          download(
                            JSON.stringify(campaign.plan.landing, null, 2),
                            "landing-content.json",
                            "application/json",
                          )
                        }
                      >
                        Download landing brief
                      </button>
                    </section>
                  )}
                  {tab === "activity" && (
                    <section className="surface">
                      <h2>Activity & the next iteration</h2>
                      <p>
                        Review → revise → review. Later measured performance can
                        inform another creative, page, or budget hypothesis.
                      </p>
                      <label>
                        Merchant feedback / next-iteration notes
                        <textarea
                          rows={4}
                          value={brief.feedback}
                          onChange={(e) =>
                            changeBrief({
                              ...briefRef.current,
                              feedback: e.target.value,
                            })
                          }
                          placeholder="A specific observation or question to test next; no live metrics are imported."
                        />
                      </label>
                      <button
                        className="button"
                        onClick={() => {
                          loadBrief(
                            {
                              ...campaign.brief,
                              feedback: briefRef.current.feedback,
                            },
                            campaign.brand,
                          );
                          go(`/campaign/${campaign.id}/brief`);
                        }}
                      >
                        Use notes in a new interpretation
                      </button>
                      <ol className="activity-list">
                        {campaign.events
                          .slice()
                          .reverse()
                          .map((event) => (
                            <li key={event.id}>
                              <time>
                                {new Date(event.at).toLocaleTimeString([], {
                                  hour: "2-digit",
                                  minute: "2-digit",
                                })}
                              </time>
                              <span>{event.message}</span>
                              {event.assetId && <small>{event.assetId}</small>}
                            </li>
                          ))}
                      </ol>
                      <details className="advanced">
                        <summary>Local deletion & recovery limits</summary>
                        <p>
                          Deleting this campaign removes its local brief,
                          uploads, versions, approvals and events. V1 records
                          and other campaigns remain unchanged. Browser work
                          stops when the tab closes; storage does not
                          synchronize across devices.
                        </p>
                        <button
                          className="button danger"
                          onClick={() => {
                            if (
                              confirm(
                                "Delete this local campaign and its versions?",
                              )
                            )
                              void action(async () => {
                                await engine.deleteCampaign(campaign.id);
                                go("/campaigns");
                              });
                          }}
                        >
                          Delete local campaign
                        </button>
                      </details>
                    </section>
                  )}
                </>
              )}
            {route.view === "campaign" && !campaign && (
              <div className="surface empty-state">
                <h1>This campaign is not in this browser.</h1>
                <p>
                  Local campaigns belong to one browser and origin. Your other
                  saved work is preserved.
                </p>
                <button
                  className="button primary"
                  onClick={() => go("/campaigns")}
                >
                  All campaigns
                </button>
              </div>
            )}
          </div>
        </main>
      </div>
      {reviewId && campaign && asset && version && (
        <div className="studio-modal-backdrop">
          <div
            className="studio-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="review-title"
            tabIndex={-1}
            ref={dialogRef}
          >
            <header>
              <div>
                <span className="eyebrow">
                  Exact asset review · {asset.kind}
                </span>
                <h2 id="review-title">{asset.title}</h2>
                <small>
                  Version {version.number} · {version.id}
                </small>
              </div>
              <button
                className="button quiet"
                aria-label="Close asset review"
                onClick={() => setReviewId(undefined)}
              >
                <Icon name="close" />
              </button>
            </header>
            <div className="studio-modal-body">
              <div className="review-art">
                {version.raster ? (
                  <img src={version.raster.dataUrl} alt={asset.title} />
                ) : (
                  <div className="review-text">
                    {asset.kind === "copy" && copyEdit ? (
                      <>
                        {(
                          [
                            "headlines",
                            "longHeadlines",
                            "descriptions",
                            "ctas",
                          ] as const
                        ).map((field) => (
                          <label key={field}>
                            {field}
                            <textarea
                              rows={field === "headlines" ? 5 : 3}
                              value={copyEdit[field].join("\n")}
                              onChange={(e) =>
                                setCopyEdit({
                                  ...copyEdit,
                                  [field]: e.target.value.split("\n"),
                                })
                              }
                            />
                          </label>
                        ))}
                        {copyEdit.headlines.some(
                          (text) => studioAdsCharacterCount(text) > 30,
                        ) && (
                          <div className="studio-notice">
                            <p>
                              A Google short headline exceeds 30 characters.
                              Review a shorter draft before saving; required
                              phrases still need to pass their checks.
                            </p>
                            <button
                              className="button"
                              onClick={() =>
                                setCopyEdit({
                                  ...copyEdit,
                                  headlines: copyEdit.headlines.map(
                                    (text, i) =>
                                      studioAdsCharacterCount(text) <= 30
                                        ? text
                                        : [
                                            "Explore the collection",
                                            "Discover the details",
                                            "A moment for you",
                                            "Meet the collection",
                                            "Find your next favorite",
                                          ][i % 5],
                                  ),
                                })
                              }
                            >
                              Suggest shorter headlines
                            </button>
                          </div>
                        )}
                        <button
                          className="button"
                          disabled={busy || running}
                          onClick={() =>
                            void action(async () => {
                              await engine.editCopy(campaign.id, copyEdit);
                              const current = engine
                                .getSnapshot()
                                .campaigns.find((c) => c.id === campaign.id)!;
                              loadBrief(
                                current.brief,
                                current.brand,
                                current.plan,
                              );
                            }, "Copy version saved; previous approval removed.")
                          }
                        >
                          Save edited copy
                        </button>
                      </>
                    ) : (
                      <pre>{JSON.stringify(version.content, null, 2)}</pre>
                    )}
                  </div>
                )}
              </div>
              <div className="review-details">
                <span className="pill">{modeText(version.mode)}</span>
                <h3>Placement checks</h3>
                {version.findings.map((finding, i) => (
                  <div className={`finding ${finding.severity}`} key={i}>
                    <strong>
                      {finding.severity === "error"
                        ? "Needs repair"
                        : finding.code.includes("not-checked")
                          ? "Not checked"
                          : finding.severity === "warning"
                            ? "Review needed"
                            : "File check"}
                    </strong>
                    <p>{finding.message}</p>
                  </div>
                ))}
                <h3>Product & source fidelity</h3>
                <p>
                  Original product photo layers stay intact. Merchant approval
                  does not establish platform policy approval.
                </p>
                <details>
                  <summary>Included source provenance</summary>
                  {campaign.brand.sources
                    .filter((s) => version.sourceIds.includes(s.id))
                    .map((s) => (
                      <p key={s.id}>
                        {s.title} · {s.role}
                        {s.url && (
                          <>
                            {" "}
                            ·{" "}
                            <a href={s.url} target="_blank" rel="noreferrer">
                              Source
                            </a>
                          </>
                        )}
                      </p>
                    ))}
                </details>
                {asset.kind === "image" && (
                  <>
                    {version.recipe && (
                      <VariantEditor
                        key={version.id}
                        campaign={campaign}
                        asset={asset}
                        version={version}
                        busy={busy || running || dirty}
                        onRecompose={(overrides) =>
                          void action(() =>
                            engine.recomposeAsset(
                              campaign.id,
                              asset.id,
                              overrides,
                            ),
                          )
                        }
                      />
                    )}
                    <label>
                      Request a specific revision
                      <textarea
                        rows={3}
                        value={revisionNote}
                        onChange={(e) => setRevisionNote(e.target.value)}
                        placeholder="More space around the product, or centered framing"
                      />
                    </label>
                    <p className="helper">
                      Local revisions support spacing or center framing. Edit
                      the plan for festive, cool, or editorial themes and
                      palette changes. Arbitrary scene generation is deferred.
                    </p>
                    <button
                      className="button"
                      disabled={busy || running}
                      onClick={() => void revise()}
                    >
                      Request revision
                    </button>
                  </>
                )}
                <details>
                  <summary>Version history ({asset.versions.length})</summary>
                  {asset.versions.map((v) => (
                    <p key={v.id}>
                      Version {v.number} · {v.id} ·{" "}
                      {v.revisionNote || "Created from confirmed plan"}
                    </p>
                  ))}
                </details>
              </div>
            </div>
            <footer>
              <span>Approval is tied to this exact current version.</span>
              <div>
                <button
                  className="button"
                  disabled={busy || running}
                  onClick={() =>
                    void action(() => engine.reject(campaign.id, asset.id))
                  }
                >
                  Reject
                </button>
                <button
                  className="button primary"
                  disabled={
                    busy ||
                    running ||
                    asset.stale ||
                    version.findings.some((f) => f.severity === "error")
                  }
                  onClick={() =>
                    void action(async () => {
                      await engine.approve(campaign.id, [asset.id]);
                      setReviewId(undefined);
                    })
                  }
                >
                  Approve
                </button>
              </div>
            </footer>
          </div>
        </div>
      )}
      {handoffOpen && campaign && (
        <ChannelHandoff
          campaign={campaign}
          onCreate={(selection) => engine.addHandoff(campaign.id, selection)}
          onClose={() => setHandoffOpen(false)}
          returnFocus={handoffTrigger.current}
        />
      )}
      {toast && (
        <div className="studio-toast" role="status">
          {toast}
        </div>
      )}
    </div>
  );
}

function CampaignCards({
  campaigns,
  onOpen,
}: {
  campaigns: StudioCampaign[];
  onOpen: (campaign: StudioCampaign) => void;
}) {
  return (
    <div className="campaign-grid">
      {campaigns.map((campaign) => (
        <button
          className="campaign-card"
          key={campaign.id}
          onClick={() => onOpen(campaign)}
        >
          {firstRaster(campaign) ? (
            <img src={firstRaster(campaign)} alt={campaign.brief.title} />
          ) : (
            <div className="campaign-empty-preview">
              <Icon name="layers" size={35} />
              <span>Outputs needed</span>
            </div>
          )}
          <div>
            <small>
              {campaign.brand.name} · {modeText(campaign.mode)}
            </small>
            <h3>{campaign.brief.title}</h3>
            <span className="status-pill">{campaignStatus(campaign)}</span>
          </div>
        </button>
      ))}
    </div>
  );
}
function LandingHero({
  campaign,
  device,
}: {
  campaign: StudioCampaign;
  device: "desktop" | "mobile";
}) {
  const asset = campaign.assets.find(
    (a) => a.placementId === `website-${device}`,
  );
  const version = asset && studioVersion(asset);
  return (
    <>
      <div className="landing-hero">
        {version?.raster ? (
          <img
            src={version.raster.dataUrl}
            alt={`Intended ${device} website hero`}
          />
        ) : (
          <div>
            <h2>{campaign.plan.landing.title}</h2>
            <p>
              The intended {device} hero is missing; create this selected
              placement.
            </p>
          </div>
        )}
      </div>
      <div className="landing-intro">
        <h2>{campaign.plan.landing.title}</h2>
        <p>{campaign.plan.landing.body}</p>
        <button
          className="button"
          type="button"
          onClick={() =>
            document.getElementById("landing-products")?.scrollIntoView({
              behavior: matchMedia("(prefers-reduced-motion: reduce)").matches
                ? "auto"
                : "smooth",
            })
          }
        >
          {campaign.plan.landing.cta}
        </button>
      </div>
      <div className="landing-products" id="landing-products">
        {campaign.brand.products
          .filter((p) => campaign.brief.productIds.includes(p.id))
          .map((p) => (
            <article key={p.id}>
              <img src={photoUrl(p.photo)} alt={p.name} />
              <h3>{p.name}</h3>
              <p>{p.description}</p>
              <small>{p.size}</small>
            </article>
          ))}
      </div>
    </>
  );
}
