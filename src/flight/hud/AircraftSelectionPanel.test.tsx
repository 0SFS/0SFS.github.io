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
    optInLodsEnabled: false, modelStatus: "ready", modelActiveLodId: "lod3",
    modelTriangles: 1514, modelError: null, ...overrides,
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
    ]);
    expect(radios.map(radio => document.getElementById(radio.getAttribute("aria-labelledby")!)?.textContent))
      .toEqual(["Cessna 172 Skyhawk", "Cirrus Vision Jet"]);
    expect(gallery.querySelectorAll("select")).toHaveLength(0);
    expect(controls.querySelectorAll("select")).toHaveLength(2);
    const scroll = vi.fn();
    Object.defineProperty(radios[0].closest("label")!, "scrollIntoView", { value: scroll });
    await act(async () => radios[0].focus());
    expect(scroll).toHaveBeenCalledWith({ block: "nearest", inline: "nearest" });
    expect(t.onApply).not.toHaveBeenCalled();
    expect(t.host.textContent).toContain("Optional model: hilos run");
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
      modelStatus: "error", modelError: "Active G2 diagnostic", modelActiveLodId: "hd", optInLodsEnabled: true,
    });
    const t = await mount(snapshot, {
      aircraftId: "cirrus-vision-jet-g3", generationId: "g3", lodId: "auto", optInLodsEnabled: false,
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
      aircraftId: "cessna-172", generationId: "cessna-172", lodId: "auto", optInLodsEnabled: true,
    });
    const card = t.host.querySelector<HTMLInputElement>('input[value="cessna-172"]')!.closest("label")!;
    await act(async () => card.querySelector("img")!.dispatchEvent(new Event("error")));
    expect(card.querySelector("img")).toBeNull();
    expect(card.textContent).toContain("Image unavailable");
    expect(card.textContent).toContain("Cessna 172 Skyhawk");
    expect(t.host.querySelector(".flight-panel__generation-field")).toBeNull();
    expect(t.host.querySelector('.flight-panel__model-controls input[type="checkbox"]')).toBeNull();
    const jet = t.host.querySelector<HTMLInputElement>('input[value="cirrus-vision-jet"]')!;
    await act(async () => jet.click());
    expect(t.onFamilyChange).toHaveBeenCalledWith("cirrus-vision-jet");
    expect(t.onApply).not.toHaveBeenCalled();
  });

  it("presents Apply errors and clears them when the staged generation is edited", async () => {
    const t = await mount(activeSnapshot(), {
      aircraftId: "cirrus-vision-jet-g3", generationId: "g3", lodId: "lod2", optInLodsEnabled: false,
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
      aircraftId: "cirrus-vision-jet-g2", generationId: "g2+", lodId: "lod2", optInLodsEnabled: false,
    });
    expect(t.host.querySelector('[role="alert"]')).toBeNull();
    expect(t.onApply).toHaveBeenCalledOnce();
  });
});
