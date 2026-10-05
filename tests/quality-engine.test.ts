import { describe, expect, it } from "vitest";
import sharp from "sharp";
import { StudioEngine } from "../src/orchestration/studio";
import {
  StudioMemoryPersistence,
  StudioIndexedDbPersistence,
} from "../src/persistence/studio";
import {
  cosmicBrand,
  christmasSampleBrief,
  freshBrief,
  interpretLocalBrief,
} from "../src/fixtures/studio";
import { cosmicCatalog } from "../src/fixtures/catalog";
import { studioVersion } from "../src/domain/studio";
import type { CompositionRecipe, StudioState } from "../src/domain/studio";

async function setup() {
  const persistence = new StudioMemoryPersistence();
  const engine = new StudioEngine(persistence, {
    render: async (recipe: CompositionRecipe) => {
      const bytes = await sharp({
        create: {
          width: recipe.width,
          height: recipe.height,
          channels: 3,
          background: recipe.palette[0],
        },
      })
        .png()
        .toBuffer();
      return {
        dataUrl: `data:image/png;base64,${bytes.toString("base64")}`,
        mime: "image/png",
        width: recipe.width,
        height: recipe.height,
        bytes: bytes.length,
      };
    },
  });
  await engine.initialize();
  const brand = cosmicBrand(),
    brief = christmasSampleBrief(brand);
  brief.productIds = brand.products.map((p) => p.id);
  brief.channels = ["website"];
  brief.placementIds = ["website-desktop", "website-mobile"];
  const plan = interpretLocalBrief(brief, brand);
  plan.confirmed = true;
  plan.directions.forEach((d, i) => {
    d.productIds = [brand.products[i].id];
    d.artDirection = i === 0 ? "scene-led" : "editorial";
  });
  const created = await engine.create(brief, brand, plan);
  await engine.run(created.id);
  await engine.approve(
    created.id,
    engine.getSnapshot().campaigns[0].assets.map((a) => a.id),
  );
  return {
    engine,
    persistence,
    id: created.id,
    current: () => engine.getSnapshot().campaigns[0],
  };
}
describe("quality release campaign consistency", () => {
  it("generic composition copy preserves literal brand and product identities", () => {
    const brand = cosmicBrand();
    brand.name = "Coffee Cup Studio";
    brand.products = [
      {
        ...brand.products[0],
        name: "Cup Calendar",
        description: "A printed calendar",
        facts: ["12 printed pages"],
      },
    ];
    const brief = freshBrief(brand);
    brief.description = "An editorial campaign for the selected calendar.";
    const plan = interpretLocalBrief(brief, brand);
    expect(plan.landing.body).toContain("Coffee Cup Studio");
    expect(
      plan.copy.descriptions.some((text) => text.includes("Cup Calendar")),
    ).toBe(true);
    expect(JSON.stringify(plan)).not.toContain("Collection product Studio");
  });
  it("removing a product clears a variant override before rendering the replacement", async () => {
    const s = await setup(),
      before = structuredClone(s.current()),
      target = before.assets.find((a) => a.kind === "image")!;
    await s.engine.recomposeAsset(s.id, target.id, {
      productId: before.brand.products[0].id,
    });
    const brief = {
      ...before.brief,
      productIds: [before.brand.products[1].id],
    };
    const plan = interpretLocalBrief(brief, before.brand);
    plan.confirmed = true;
    await s.engine.update(s.id, brief, before.brand, plan);
    expect(
      s.current().assets.find((a) => a.id === target.id)?.recipeOverrides
        ?.productId,
    ).toBeUndefined();
    await s.engine.run(s.id);
    expect(
      studioVersion(s.current().assets.find((a) => a.id === target.id)!)?.recipe
        ?.productIds,
    ).toEqual(brief.productIds);
  });
  it("explicit variant edits change the rendered recipe and invalidate only that version", async () => {
    const s = await setup(),
      before = structuredClone(s.current());
    const target = before.assets.find((a) => a.kind === "image")!;
    await s.engine.recomposeAsset(s.id, target.id, {
      artDirection: "editorial",
      composition: "product-center",
      headline: "A deliberate new headline",
      cta: "Explore",
      textOverlay: false,
      productId: before.brand.products[1].id,
    });
    const next = s.current().assets.find((a) => a.id === target.id)!;
    expect(next.versions).toHaveLength(2);
    expect(next.approval).toBeUndefined();
    expect(next.stale).toBe(false);
    expect(studioVersion(next)?.recipe).toMatchObject({
      artDirection: "editorial",
      composition: "product-center",
      headline: "A deliberate new headline",
      textOverlay: false,
      productIds: [before.brand.products[1].id],
    });
    expect(next.versions[0]).toEqual(target.versions[0]);
    for (const a of before.assets.filter((a) => a.id !== target.id))
      expect(s.current().assets.find((n) => n.id === a.id)).toEqual(a);
  });
  it("updating one product snapshot invalidates its family while retaining the other family's approval", async () => {
    const s = await setup(),
      old = structuredClone(s.current()),
      brand = structuredClone(old.brand);
    brand.products[0].description = "Owner-confirmed corrected description";
    await s.engine.update(s.id, old.brief, brand, old.plan);
    const changed = s
      .current()
      .assets.filter((a) => a.kind === "image" && a.familyId === "direction-1");
    const retained = s
      .current()
      .assets.filter((a) => a.kind === "image" && a.familyId === "direction-2");
    expect(changed.every((a) => a.stale && !a.approval)).toBe(true);
    expect(
      retained.every(
        (a) => !a.stale && a.approval?.versionId === a.currentVersionId,
      ),
    ).toBe(true);
  });
  it("catalog refresh is separate state and cannot rewrite saved campaign snapshots or approvals", async () => {
    const s = await setup(),
      campaign = structuredClone(s.current());
    const catalog = cosmicCatalog();
    catalog.products[0].description = "Changed public catalog description";
    await s.engine.saveCatalogs([catalog]);
    expect(s.current()).toEqual(campaign);
    const reopened = new StudioEngine(s.persistence);
    await reopened.initialize();
    expect(reopened.getSnapshot().campaigns[0]).toEqual(campaign);
    expect(reopened.getSnapshot().catalogs?.[0].products[0].description).toBe(
      "Changed public catalog description",
    );
  });
  it("a rejected storage write preserves the previous campaign and queued writes can recover", async () => {
    const s = await setup(),
      before = structuredClone(s.current());
    const save = s.persistence.save.bind(s.persistence);
    s.persistence.save = async () => {
      throw new Error("Storage quota exceeded");
    };
    await expect(
      s.engine.recomposeAsset(s.id, before.assets[0].id, {
        composition: "product-center",
      }),
    ).rejects.toThrow("Storage quota");
    expect(s.current()).toEqual(before);
    s.persistence.save = save;
    await s.engine.saveCatalogs([cosmicCatalog()]);
    expect(s.current()).toEqual(before);
  });
  it("an explicit temporary workspace needs no IndexedDB and never removes existing records", async () => {
    const storage = new StudioIndexedDbPersistence();
    storage.useTemporaryWorkspace();
    const engine = new StudioEngine(storage);
    await engine.initialize();
    await engine.saveCatalogs([cosmicCatalog()]);
    expect((await storage.load())?.catalogs).toHaveLength(1);
    expect(await storage.legacy()).toBeUndefined();
  });
  it("older V2 state opens without catalog/handoff fields and retains every campaign byte", async () => {
    const s = await setup(),
      old = structuredClone(s.engine.getSnapshot());
    delete old.catalogs;
    old.campaigns.forEach((c) => delete c.handoffs);
    const reopened = new StudioEngine(
      new StudioMemoryPersistence(old as StudioState),
    );
    await reopened.initialize();
    expect(reopened.getSnapshot()).toEqual(old);
  });
});
