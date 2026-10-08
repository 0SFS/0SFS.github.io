// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { WindowOverlayProps } from "foss-earth/shell";
import { createSettingsRegistry, FOSS_EARTH_PARAMETERS } from "foss-earth/settings";
import type { AircraftId } from "../aircraft/aircraftCatalog";
import type { EngineModelId } from "../jsbsim/fdmProfiles";
import { JSBSIM_PACKAGE_VERSION } from "../jsbsim/jsbsimBuildIdentity";
import { registerFlightSettings } from "../settings/registerFlightSettings";
import { FlightControlPanel, type FlightControlPanelSnapshot, type FlightPanelTab } from "./FlightControlPanel";
import { createEngineMonitor, type EngineMonitorHandle } from "./engineMonitor";

// The flight's Engine tab with the registry's real controls; the shared window
// behaviour is FOSS Earth's, tested there.
vi.mock("foss-earth/shell", async importOriginal => {
  const actual = await importOriginal<typeof import("foss-earth/shell")>();
  return {
    ...actual,
    WindowOverlay: ({ additionalTabs = [], renderAdditionalTab }: WindowOverlayProps<FlightPanelTab>) => <>
      {additionalTabs.filter(tab => tab.id === "engine").map(tab =>
        <section key={tab.id} data-flight-tab={tab.id}>{renderAdditionalTab?.(tab.id)}</section>)}
    </>,
  };
});

const roots: Root[] = [];
const monitors: EngineMonitorHandle[] = [];
beforeEach(() => { vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true); });
afterEach(async () => {
  await act(async () => { for (const root of roots.splice(0)) root.unmount(); });
  for (const monitor of monitors.splice(0)) monitor.destroy();
  document.body.replaceChildren();
  vi.unstubAllGlobals();
});

const PLANT_SETTINGS = ["osfs.enginePlant.algorithm", "osfs.enginePlant.iterationCap", "osfs.enginePlant.subdivisionCap",
  "osfs.enginePlant.tolerance", "osfs.enginePlant.closureBudgetKiB"];

async function mount(aircraftId: AircraftId, engineModel: EngineModelId | null) {
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  roots.push(root);
  const settings = createSettingsRegistry({ storage: null });
  settings.register(FOSS_EARTH_PARAMETERS);
  const parameters = registerFlightSettings(settings);
  const monitor = createEngineMonitor(document.createElement("div"), { parameters, storage: null });
  monitors.push(monitor);
  const onReloadFlight = vi.fn();
  // The mocked workspace renders only the Engine tab; unrelated callbacks are not consumed.
  const props = {
    settings, parameters, engineModel, onReloadFlight,
    attachEngineDetails: (host: HTMLElement, content?: HTMLElement) => monitor.attachDetails(host, content),
    snapshot: { aircraftId, lodId: "auto" } as FlightControlPanelSnapshot,
    overlayApiRef: { current: null },
  } as Parameters<typeof FlightControlPanel>[0];
  await act(async () => root.render(<FlightControlPanel {...props} />));
  const tab = host.querySelector('[data-flight-tab="engine"]')!;
  const sections = () => [...tab.querySelectorAll<HTMLElement>("[data-settings-section]")].map(section => section.dataset.settingsSection);
  const shown = (id: string) => tab.querySelector(`[data-parameter="${id}"]`) !== null;
  return { tab, settings, onReloadFlight, sections, shown };
}

describe("Engine tab", () => {
  it("has exactly Settings and Live data, with all registry controls homed once inside Settings", async () => {
    const { tab } = await mount("f-35b", "plant");
    const top = [...tab.querySelectorAll<HTMLDetailsElement>("[data-engine-top-section]")];
    expect(top.map(section => section.querySelector("summary")?.textContent)).toEqual(["Settings", "Live data"]);
    expect(top.map(section => section.open)).toEqual([false, true]);
    const controls = [...tab.querySelectorAll<HTMLElement>("[data-parameter]")];
    expect(controls.length).toBeGreaterThan(5);
    expect(new Set(controls.map(control => control.dataset.parameter)).size).toBe(controls.length);
    for (const control of controls) expect(control.closest("[data-engine-top-section]")).toBe(top[0]);
    expect(tab.querySelector('[data-parameter="osfs.engineMonitor.historyMetrics"]')).not.toBeNull();
    expect(tab.querySelector('[data-parameter="osfs.engineMonitor.historyMemoryKiB"]')).not.toBeNull();
    expect(tab.querySelector('[data-parameter="osfs.engineMonitor.hiddenHistory"]')).not.toBeNull();
  });

  it.each(["cessna-172", "cirrus-vision-jet-g2"] as const)("has no Simulation section on %s, which has one engine model", async aircraftId => {
    const { tab, sections } = await mount(aircraftId, null);
    expect(sections()).toEqual(["engine/engine", "engine/history", "engine/test"]);
    expect(tab.textContent).not.toContain("Flying:");
  });

  it("opens with Simulation on the F-35B: the engine model flying, the choice, and the plant's settings", async () => {
    const { tab, sections, shown } = await mount("f-35b", "plant");
    expect(sections()).toEqual(["engine/simulation", "engine/engine", "engine/history", "engine/test"]);
    expect(tab.querySelector("legend")?.textContent).toBe("Simulation");
    expect(tab.textContent).toContain("Flying: Coupled engine plant");
    expect(tab.textContent).toContain(`JSBSim ${JSBSIM_PACKAGE_VERSION}`);
    expect(tab.querySelector<HTMLInputElement>('[data-parameter="osfs.engine.model"] input[value="plant"]')?.checked).toBe(true);
    for (const id of PLANT_SETTINGS) expect(shown(id)).toBe(true);
    expect([...tab.querySelectorAll("button")].some(button => button.textContent === "Reload now")).toBe(false);
  });

  it("saves another engine model, hides the plant's settings, and offers the reload that flies it", async () => {
    const { tab, settings, onReloadFlight, shown } = await mount("f-35b", "plant");
    const empirical = tab.querySelector<HTMLInputElement>('[data-parameter="osfs.engine.model"] input[value="empirical"]')!;
    await act(async () => {
      empirical.checked = true;
      empirical.dispatchEvent(new Event("change", { bubbles: true }));
    });
    expect(settings.get("osfs.engine.model")).toBe("empirical");
    for (const id of PLANT_SETTINGS) expect(shown(id)).toBe(false);
    // The running engine is still the plant until the reload.
    expect(tab.textContent).toContain("Flying: Coupled engine plant");
    expect(tab.textContent).toContain("Empirical tables (before the plant) flies after the flight reloads.");
    const reload = [...tab.querySelectorAll("button")].find(button => button.textContent === "Reload now")!;
    await act(async () => reload.click());
    expect(onReloadFlight).toHaveBeenCalledOnce();
  });

  it("names the empirical engine model when that is the one flying", async () => {
    const { tab, settings } = await mount("f-35b", "empirical");
    expect(tab.textContent).toContain("Flying: Empirical tables (before the plant)");
    // The saved choice is still the default: the plant flies after a reload.
    expect(tab.textContent).toContain("Coupled engine plant flies after the flight reloads.");
    await act(async () => { settings.set("osfs.engine.model", "empirical"); });
    expect(tab.textContent).not.toContain("flies after the flight reloads");
    expect([...tab.querySelectorAll("button")].some(button => button.textContent === "Reload now")).toBe(false);
  });
});
