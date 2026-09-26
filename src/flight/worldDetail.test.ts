import { describe, expect, it } from "vitest";
import { createMapDetailController, MAP_DETAIL_STORAGE_KEY, type MapDetailController } from "foss-earth/shell";
import { flightParameterDefaults, type FlightParameterValues } from "./settings/flightParameters";
import {
  createFlightDetailRequirements,
  importLegacyWorldDetail,
  LEGACY_WORLD_DETAIL_KEY,
  WORLD_DETAIL_IMPORT_KEY,
} from "./worldDetail";

function storage(initial: Record<string, string> = {}, denyWrites = false) {
  const values = new Map(Object.entries(initial));
  return {
    values,
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      if (denyWrites) throw new DOMException("denied", "QuotaExceededError");
      values.set(key, value);
    },
  };
}

const context = { rendererMode: "webgl2", deviceHints: { hardwareConcurrency: 8, deviceMemory: 8 }, flightMinimum: 4096 };

function googleController(store: ReturnType<typeof storage>): MapDetailController {
  const controller = createMapDetailController({ storage: store, googleRecommendation: "device-hints" });
  controller.setRecommendationContext({ rendererDefaultErrorPx: 20, rendererMode: "webgl2" });
  return controller;
}

describe("legacy World detail import", () => {
  it("makes a saved target the default and keeps the old reachable range", () => {
    const store = storage({ [LEGACY_WORLD_DETAIL_KEY]: "16" });
    const controller = googleController(store);
    expect(importLegacyWorldDetail(controller, store, context)).toBe("imported");
    expect(controller.getPolicy("google")).toEqual({ kind: "google", finestErrorPx: 16, coarsestErrorPx: 4096, defaultValue: 16 });
    expect(store.values.get(WORLD_DETAIL_IMPORT_KEY)).toBe("1");
    // The legacy keys remain for rollback.
    expect(store.values.get(LEGACY_WORLD_DETAIL_KEY)).toBe("16");
  });

  it("keeps an automatic target as the device-hint recommendation", () => {
    const store = storage({ [LEGACY_WORLD_DETAIL_KEY]: "auto" });
    const controller = googleController(store);
    importLegacyWorldDetail(controller, store, context);
    // Eight cores with room recommend 32 px; the flight minimum defaults to 4,096.
    expect(controller.getPolicy("google")).toEqual({
      kind: "google", finestErrorPx: 32, coarsestErrorPx: 4096,
      defaultValue: { mode: "recommended", policy: "device-hints" },
    });
  });

  it("treats a first run like automatic detail", () => {
    const store = storage();
    const controller = googleController(store);
    expect(importLegacyWorldDetail(controller, store, context)).toBe("imported");
    expect(controller.getPolicy("google")).toMatchObject({ finestErrorPx: 32, coarsestErrorPx: 4096 });
  });

  it("never imports over a valid new policy", () => {
    const saved = { kind: "google", finestErrorPx: 2, coarsestErrorPx: 8, defaultValue: 4 };
    const store = storage({
      [LEGACY_WORLD_DETAIL_KEY]: "64",
      [MAP_DETAIL_STORAGE_KEY]: JSON.stringify({ version: 1, policies: { google: saved } }),
    });
    const controller = googleController(store);
    expect(importLegacyWorldDetail(controller, store, context)).toBe("skipped");
    expect(controller.getPolicy("google")).toEqual(saved);
  });

  it("imports only once, so a later reset does not bring the old target back", () => {
    const store = storage({ [LEGACY_WORLD_DETAIL_KEY]: "64" });
    importLegacyWorldDetail(googleController(store), store, context);
    const later = googleController(store);
    later.setActiveSource({ key: "google", availability: "ready" });
    later.resetPolicy();
    const reloaded = googleController(store);
    expect(importLegacyWorldDetail(reloaded, store, context)).toBe("skipped");
    expect(reloaded.hasSavedPolicy("google")).toBe(false);
  });

  it("works in memory and stays retryable when storage refuses writes", () => {
    const store = storage({ [LEGACY_WORLD_DETAIL_KEY]: "64" }, true);
    const controller = googleController(store);
    expect(importLegacyWorldDetail(controller, store, context)).toBe("retry");
    expect(controller.getPolicy("google")).toMatchObject({ defaultValue: 64 });
    expect(store.values.has(WORLD_DETAIL_IMPORT_KEY)).toBe(false);
  });

  it("ignores an invalid legacy target", () => {
    const store = storage({ [LEGACY_WORLD_DETAIL_KEY]: "-3" });
    const controller = googleController(store);
    importLegacyWorldDetail(controller, store, context);
    expect(controller.getPolicy("google")?.defaultValue).toEqual({ mode: "recommended", policy: "device-hints" });
  });
});

describe("low-spawn detail requirement", () => {
  function setup(saved = 16384, parameters: Partial<FlightParameterValues> = {}) {
    const controller = createMapDetailController({ storage: null });
    controller.setRecommendationContext({ rendererDefaultErrorPx: 20, rendererMode: "webgl2" });
    controller.setActiveSource({ key: "google", availability: "ready" });
    controller.updatePolicy({ kind: "google", finestErrorPx: 4096, coarsestErrorPx: 16384, defaultValue: saved });
    return { controller, requirements: createFlightDetailRequirements(controller, flightParameterDefaults(parameters)) };
  }
  const effective = (controller: MapDetailController) => controller.getState()?.effectiveTarget;
  const fly = (requirements: ReturnType<typeof setup>["requirements"], seconds: number, aboveGroundMeters: number | null, paused = false) => {
    for (let t = 0; t < seconds - 1e-9; t += 0.1) requirements.observe({ deltaSeconds: 0.1, paused, aboveGroundMeters });
  };

  it("holds the flight minimum through preparation and leaves the saved policy alone", () => {
    const { controller, requirements } = setup();
    const lease = requirements.begin(4096);
    expect(effective(controller)).toBe(4096);
    lease.complete();
    expect(effective(controller)).toBe(4096);
    expect(controller.getPolicy("google")?.defaultValue).toBe(16384);
    // Completing preparation and taking off does not release it.
    fly(requirements, 0.5, 20);
    expect(effective(controller)).toBe(4096);
  });

  it("releases after one continuous second at least 100 m up, counting only simulated time", () => {
    const { controller, requirements } = setup();
    requirements.begin(4096).complete();
    fly(requirements, 0.6, 150);
    fly(requirements, 5, 150, true);
    expect(effective(controller)).toBe(4096);
    fly(requirements, 0.5, 150);
    expect(effective(controller)).toBe(16384);
    expect(requirements.isHeld()).toBe(false);
  });

  it("restarts the interval when the sample is missing, non-finite or too low", () => {
    const { controller, requirements } = setup();
    requirements.begin(4096).complete();
    for (const bad of [null, Number.NaN, 99]) {
      fly(requirements, 0.9, 150);
      fly(requirements, 0.1, bad);
    }
    fly(requirements, 0.9, 150);
    expect(effective(controller)).toBe(4096);
    fly(requirements, 0.2, 150);
    expect(effective(controller)).toBe(16384);
  });

  it("follows the hold height and release time parameters", () => {
    const { controller, requirements } = setup(16384, { "osfs.flight.holdBelow": 400, "osfs.flight.holdReleaseAfter": 3 });
    requirements.begin(4096).complete();
    fly(requirements, 5, 300);
    expect(effective(controller)).toBe(4096);
    fly(requirements, 2.9, 500);
    expect(effective(controller)).toBe(4096);
    fly(requirements, 0.2, 500);
    expect(effective(controller)).toBe(16384);
  });

  it("does not come back when a later flight descends", () => {
    const { controller, requirements } = setup();
    requirements.begin(4096).complete();
    fly(requirements, 1.1, 300);
    fly(requirements, 3, 10);
    expect(effective(controller)).toBe(16384);
  });

  it("is not cleared by restoring the saved HUD target", () => {
    const { controller, requirements } = setup();
    requirements.begin(4096).complete();
    controller.setSessionOverride(8192);
    controller.clearSessionOverride();
    expect(effective(controller)).toBe(4096);
  });

  it("lets a new preparation supersede the old lease without a coarse frame", () => {
    const { controller, requirements } = setup();
    requirements.begin(4096).complete();
    const seen: Array<number | null | undefined> = [];
    const unsubscribe = controller.subscribe(state => seen.push(state?.effectiveTarget));
    const next = requirements.begin(4096);
    next.complete();
    unsubscribe();
    expect(seen.every(value => value === 4096)).toBe(true);
    expect(requirements.isHeld()).toBe(true);
  });

  it("releases only its own lease when a preparation fails or is cancelled", () => {
    const { controller, requirements } = setup();
    requirements.begin(4096).complete();
    requirements.begin(2048).cancel();
    expect(effective(controller)).toBe(4096);
    requirements.supersede();
    expect(effective(controller)).toBe(16384);
  });

  it("follows a Flight minimum edit at once, and ends with the waiver or on disposal", () => {
    const { controller, requirements } = setup();
    requirements.begin(4096).complete();
    requirements.setRequirement(2048);
    expect(effective(controller)).toBe(2048);
    requirements.releaseAll();
    expect(effective(controller)).toBe(16384);
    requirements.begin(4096).complete();
    controller.dispose();
    expect(requirements.isHeld()).toBe(false);
  });

  it("ends when the map leaves Google", () => {
    const { controller, requirements } = setup();
    requirements.begin(4096).complete();
    controller.setActiveSource({ key: "raster:usgs-imagery", availability: "ready" });
    controller.setActiveSource({ key: "google", availability: "ready" });
    expect(effective(controller)).toBe(16384);
    expect(requirements.isHeld()).toBe(false);
  });
});
