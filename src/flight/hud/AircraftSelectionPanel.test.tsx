// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AircraftSelectionPanel } from "./AircraftSelectionPanel";
import type { FlightControlPanelSnapshot } from "./FlightControlPanel";
import { normalizeAircraftSelection, type AircraftSelection } from "../aircraft/aircraftCatalog";

const roots: Root[] = [];
beforeEach(() => { vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true); });
afterEach(async () => {
  await act(async () => { for (const root of roots.splice(0)) root.unmount(); });
  document.body.replaceChildren();
  vi.unstubAllGlobals();
});

function activeSnapshot(overrides: Partial<FlightControlPanelSnapshot> = {}): FlightControlPanelSnapshot {
  // Only the aircraft selector's snapshot fields are consumed by this component.
  return {
    aircraftId: "cirrus-vision-jet-g2", generationId: "g2", lodId: "auto",
    modelStatus: "ready", modelActiveLodId: "lod3",
    modelTriangles: 1654, modelError: null, ...overrides,
  } as FlightControlPanelSnapshot;
}

async function mount(snapshot: FlightControlPanelSnapshot, selection = normalizeAircraftSelection(snapshot)) {
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  roots.push(root);
  const onSelectionChange = vi.fn<(selection: AircraftSelection) => void>();
  const onFamilyChange = vi.fn();
  const onApply = vi.fn<(selection: AircraftSelection) => string | null>(() => null);
  await act(async () => root.render(<AircraftSelectionPanel
    snapshot={snapshot} selection={selection}
    onSelectionChange={onSelectionChange} onFamilyChange={onFamilyChange} onApply={onApply}
  />));
  return { host, onSelectionChange, onFamilyChange, onApply };
}

describe("aircraft selection panel", () => {
  it("keeps labeled native family radios in the gallery and generation/model controls below it", async () => {
    const t = await mount(activeSnapshot());
    const gallery = t.host.querySelector(".flight-panel__aircraft-gallery")!;
    const controls = t.host.querySelector(".flight-panel__aircraft-controls")!;
    expect(gallery.contains(controls)).toBe(false);
    expect(gallery.compareDocumentPosition(controls) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    const radios = Array.from(gallery.querySelectorAll<HTMLInputElement>('input[type="radio"]'));
    expect(radios.map(radio => [radio.name, radio.value])).toEqual([
      ["flight-aircraft", "cessna-172"], ["flight-aircraft", "cirrus-vision-jet"],
      ["flight-aircraft", "f-35b"],
    ]);
    expect(radios.map(radio => document.getElementById(radio.getAttribute("aria-labelledby")!)?.textContent))
      .toEqual(["Cessna 172 Skyhawk", "Cirrus Vision Jet", "Lockheed Martin F-35B Lightning II"]);
    expect(gallery.querySelectorAll("select")).toHaveLength(0);
    expect(controls.querySelectorAll("select")).toHaveLength(2);
    const scroll = vi.fn();
    Object.defineProperty(radios[0].closest("label")!, "scrollIntoView", { value: scroll });
    await act(async () => radios[0].focus());
    expect(scroll).toHaveBeenCalledWith({ block: "nearest", inline: "nearest" });
    expect(t.onApply).not.toHaveBeenCalled();
    expect(t.host.textContent).toContain("hilos run — Sketchfab model");
  });

  it.each([
    ["placeholder", "Placeholder blocks"],
    ["loading", "Loading mesh…"],
    ["ready", "Mesh loaded"],
    ["error", "Load failed"],
  ] as const)("associates the %s model state with the exact active runtime", async (modelStatus, label) => {
    const t = await mount(activeSnapshot({ modelStatus, modelError: modelStatus === "error" ? "Active package error" : null }));
    const status = t.host.querySelector('[aria-label="Current model for Cirrus Vision Jet G2"]')!;
    expect(status.textContent).toContain(label);
    expect(t.host.querySelector<HTMLButtonElement>(".flight-panel__aircraft-controls > button")!.disabled).toBe(true);
    expect(t.host.textContent).toContain("Cirrus Vision Jet G2 is active. No pending changes.");
    if (modelStatus === "error") expect(status.textContent).toContain("Active package error");
  });

  it("retains the active licensed model's attribution while another package is staged", async () => {
    const snapshot = activeSnapshot({
      modelStatus: "error", modelError: "Active G2 diagnostic", modelActiveLodId: "hd",
    });
    const t = await mount(snapshot, {
      aircraftId: "cirrus-vision-jet-g3", generationId: "g3", lodId: "auto",
    });
    expect(t.host.querySelector(".flight-panel__model-status")).toBeNull();
    expect(t.host.textContent).not.toContain("Active G2 diagnostic");
    expect(t.host.textContent).toContain("Currently flying Cirrus Vision Jet G2 until you apply.");
    expect(t.host.textContent).toContain("Currently flying Cirrus Vision Jet G2: hilos run");
    const credit = Array.from(t.host.querySelectorAll("p")).find(p => p.textContent?.startsWith("Currently flying Cirrus Vision Jet G2:"));
    expect(credit?.textContent).toContain("CC Attribution");
    expect(credit?.querySelector("a")?.getAttribute("href")).toContain("sketchfab.com");
    expect(t.host.textContent).toContain("Model loading status will appear after this aircraft is activated.");
  });

  it("keeps the C172 selectable when its thumbnail fails and shows no generation or HD controls", async () => {
    const t = await mount(activeSnapshot(), {
      aircraftId: "cessna-172", generationId: "cessna-172", lodId: "auto",
    });
    const card = t.host.querySelector<HTMLInputElement>('input[value="cessna-172"]')!.closest("label")!;
    await act(async () => card.querySelector("img")!.dispatchEvent(new Event("error")));
    expect(card.querySelector("img")).toBeNull();
    expect(card.textContent).toContain("Image unavailable");
    expect(card.textContent).toContain("Cessna 172 Skyhawk");
    expect(t.host.querySelector(".flight-panel__generation-field")).toBeNull();
    expect(t.host.querySelector('.flight-panel__model-controls input[type="checkbox"]')).toBeNull();
    const levels = Array.from(t.host.querySelectorAll<HTMLOptionElement>(".flight-panel__model-controls option"));
    expect(levels.map(option => option.value)).toEqual(["auto", "lod3", "lod2", "lod1", "lod0"]);
    const jet = t.host.querySelector<HTMLInputElement>('input[value="cirrus-vision-jet"]')!;
    await act(async () => jet.click());
    expect(t.onFamilyChange).toHaveBeenCalledWith("cirrus-vision-jet");
    expect(t.onApply).not.toHaveBeenCalled();
  });

  it("offers the HD model in the level list itself, with its credit, and no switch to unlock it", async () => {
    const t = await mount(activeSnapshot());
    expect(t.host.querySelector('.flight-panel__model-controls input[type="checkbox"]')).toBeNull();
    const select = t.host.querySelector<HTMLSelectElement>(".flight-panel__model-controls select")!;
    expect(Array.from(select.options).map(option => option.value)).toEqual(["auto", "hd", "lod3", "lod2", "lod1"]);
    // Offered, so its licence is shown with the others.
    expect(t.host.textContent).toContain("hilos run");
    expect(t.host.textContent).toContain("CC Attribution");
    await act(async () => {
      select.value = "hd";
      select.dispatchEvent(new Event("change", { bubbles: true }));
    });
    expect(t.onSelectionChange).toHaveBeenCalledWith({
      aircraftId: "cirrus-vision-jet-g2", generationId: "g2", lodId: "hd",
    });
  });

  it("stages the experimental F-35B with its exterior and attribution before applying", async () => {
    const selection = normalizeAircraftSelection({ aircraftId: "f-35b", lodId: "auto" });
    const t = await mount(activeSnapshot(), selection);
    expect(t.host.querySelector<HTMLInputElement>('input[value="f-35b"]')!.checked).toBe(true);
    expect(t.host.querySelector(".flight-panel__generation-field")).toBeNull();
    expect(t.host.textContent).toContain("Experimental F-16/Aeromatic-derived");
    expect(t.host.textContent).toContain("AF267");
    expect(t.host.textContent).toContain("CC BY 4.0");
    const source = t.host.querySelector<HTMLAnchorElement>('a[href*="5d54a6af45974ad386ae74d42b33374a"]');
    expect(source?.textContent).toBe("Source");
    const levels = t.host.querySelector<HTMLSelectElement>(".flight-panel__model-controls select")!;
    expect(levels.disabled).toBe(false);
    expect(Array.from(levels.options).map(option => option.value)).toEqual(["auto", "hd"]);
    expect(t.host.textContent).not.toContain("No mesh exists for this airframe");
    expect(t.onApply).not.toHaveBeenCalled();
    const apply = t.host.querySelector<HTMLButtonElement>(".flight-panel__aircraft-controls > button")!;
    expect(apply.textContent).toBe("Apply & fly Lockheed Martin F-35B Lightning II");
    await act(async () => apply.click());
    expect(t.onApply).toHaveBeenCalledWith(selection);
  });

  it("shows the F-35B's active mesh state and preserves its credit while another aircraft is staged", async () => {
    const snapshot = activeSnapshot({
      aircraftId: "f-35b", generationId: "f-35b", modelActiveLodId: "hd", modelTriangles: 12259,
    });
    const active = await mount(snapshot);
    expect(active.host.querySelector('[aria-label="Current model for Lockheed Martin F-35B Lightning II"]')?.textContent)
      .toContain("Mesh loaded");
    expect(active.host.textContent).toContain("Auto selected HD — reconstructed engine");
    const staged = await mount(snapshot, normalizeAircraftSelection({ aircraftId: "cessna-172", lodId: "auto" }));
    const credit = Array.from(staged.host.querySelectorAll("p"))
      .find(p => p.textContent?.startsWith("Currently flying Lockheed Martin F-35B Lightning II: AF267"));
    expect(credit?.textContent).toContain("CC BY 4.0");
    expect(credit?.querySelector("a")?.getAttribute("href")).toContain("5d54a6af45974ad386ae74d42b33374a");
  });

  it("presents Apply errors and clears them when the staged generation is edited", async () => {
    const t = await mount(activeSnapshot(), {
      aircraftId: "cirrus-vision-jet-g3", generationId: "g3", lodId: "lod2",
    });
    t.onApply.mockReturnValue("Could not save your aircraft choice.");
    await act(async () => t.host.querySelector<HTMLButtonElement>(".flight-panel__aircraft-controls > button")!.click());
    expect(t.host.querySelector('[role="alert"]')?.textContent).toBe("Could not save your aircraft choice.");
    const generation = t.host.querySelector<HTMLSelectElement>(".flight-panel__generation-field select")!;
    await act(async () => {
      generation.value = "g2+";
      generation.dispatchEvent(new Event("change", { bubbles: true }));
    });
    expect(t.onSelectionChange).toHaveBeenCalledWith({
      aircraftId: "cirrus-vision-jet-g2", generationId: "g2+", lodId: "lod2",
    });
    expect(t.host.querySelector('[role="alert"]')).toBeNull();
    expect(t.onApply).toHaveBeenCalledOnce();
  });
});
