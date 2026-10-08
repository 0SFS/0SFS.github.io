// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { controlTakesKey } from "@felipegalind0/gamepad-tools/browser";
import { flightParameterDefaults } from "../settings/flightParameters";
import { createEngineLiveData, type EngineLiveData } from "./engineLiveData";
import * as engineHistory from "./engineHistory";
import { discoverEngineVariables, type EngineVariable } from "./engineVariables";
import { engineLayoutScope, readEngineMonitorLayout, setEngineVariablePresentation, writeEngineMonitorLayout,
  type EngineMonitorLayout } from "./engineMonitorLayout";
import type { EngineReader } from "./engineMonitorModel";

const N1 = "propulsion/engine/n1";
const N2 = "propulsion/engine/n2";
const GAS = "propulsion/engine/thermal/nozzle-gas-temperature-k";
const GAS_VALID = "propulsion/engine/thermal/valid";
const DIAGNOSTIC = "propulsion/engine/plant/numerics/iterations";
const baseValues = () => ({ [N1]: 40, [N2]: 70, "propulsion/engine/MaxN1": 110,
  "propulsion/engine/MaxN2": 105, [GAS]: 1000, [GAS_VALID]: 1,
  [DIAGNOSTIC]: 8, "propulsion/engine/plant/numerics/valid": 1 });
const storage = (initial: Record<string, string> = {}) => {
  const saved = new Map(Object.entries(initial));
  return { getItem: (id: string) => saved.get(id) ?? null,
    setItem: (id: string, value: string) => { saved.set(id, value); } };
};
const views: EngineLiveData[] = [];

function visibleText(element: HTMLElement): string {
  if (element.hidden) return "";
  if (element instanceof HTMLDetailsElement && !element.open) {
    const summary = element.querySelector<HTMLElement>(":scope > summary");
    return summary ? visibleText(summary) : "";
  }
  return [...element.childNodes].map(child => child instanceof HTMLElement ? visibleText(child)
    : child.nodeType === Node.TEXT_NODE ? child.textContent ?? "" : "").join(" ");
}

beforeEach(() => { vi.spyOn(document, "hidden", "get").mockReturnValue(false); });
afterEach(() => {
  for (const view of views.splice(0)) view.destroy();
  document.body.replaceChildren();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function mount(options: { values?: Record<string, number>; layout?: EngineMonitorLayout;
  variables?: readonly EngineVariable[]; saved?: ReturnType<typeof storage>; selectSetting?: (id: string) => void } = {}) {
  const values = options.values ?? baseValues();
  const reader: EngineReader = { getPropertyValue: path => values[path] ?? Number.NaN };
  const variables = options.variables ?? discoverEngineVariables(new Set(Object.keys(values)), { kind: "turbine" }, reader);
  const saved = options.saved ?? storage();
  const scope = engineLayoutScope("f-35b", "plant", "turbine");
  const layout = options.layout ?? readEngineMonitorLayout(saved, scope);
  const parameters = flightParameterDefaults();
  let open = true, time = 10, held = false;
  const refresh = () => view.render(reader, held);
  const view = createEngineLiveData(variables, parameters, layout,
    () => writeEngineMonitorLayout(saved, scope, layout), () => open, refresh, options.selectSetting);
  views.push(view);
  document.body.append(view.element);
  const update = (nextTime = time, nextHeld = false) => {
    time = nextTime; held = nextHeld;
    view!.capture(reader, time, held); view!.render(reader, held);
  };
  const item = (id: string) => view!.element.querySelector<HTMLElement>(`[data-variable="${id}"]`);
  const button = (label: string) => [...view!.element.querySelectorAll<HTMLButtonElement>("button")]
    .find(node => node.textContent === label)!;
  update();
  return { view, values, reader, variables, saved, scope, layout, parameters, update, item, button,
    setOpen(value: boolean) { open = value; } };
}

describe("variable-driven engine Live data", () => {
  it("keeps explanations behind click help and plot controls closed without changing the variable presentation", () => {
    const h = mount();
    const beforeLayout = JSON.stringify(h.layout);
    const beforePaths = [...h.view.element.querySelectorAll("path")].map(path => path.getAttribute("d"));
    const defaultText = visibleText(h.view.element);
    expect(defaultText).not.toMatch(/Expected configured range|Provisional plotting envelope|Native:|Not an operational limit|missing values break trace/i);
    expect(defaultText).toContain("40.0 %");
    expect(defaultText).toContain("min");
    const options = h.item(N1)!.querySelector<HTMLDetailsElement>("details")!;
    expect(options.open).toBe(false);
    expect(options.querySelector("summary")?.textContent).toBe("Plot options");
    expect(h.item(N1)?.querySelector(".flight-engine__plot-envelope")).toBeNull();
    const help = h.item(N1)!.querySelector<HTMLButtonElement>('button[aria-label="Details for Engine 1 · N1"]')!;
    const tooltip = document.getElementById(help.getAttribute("aria-controls")!)!;
    expect(help.textContent).toBe("?");
    expect(tooltip.hidden).toBe(true);
    expect(controlTakesKey(help, "Enter")).toBe(true);
    expect(controlTakesKey(help, "w")).toBe(false);
    help.click();
    expect(tooltip.hidden).toBe(false);
    expect(tooltip.textContent).toContain("Native configured");
    expect(tooltip.textContent).toContain(N1);
    expect(help.getAttribute("aria-expanded")).toBe("true");
    help.click();
    expect(tooltip.hidden).toBe(true);
    expect(options.open).toBe(false);
    expect(JSON.stringify(h.layout)).toBe(beforeLayout);
    expect([...h.view.element.querySelectorAll("path")].map(path => path.getAttribute("d"))).toEqual(beforePaths);
  });

  it("finds a requested solver setting at its existing control without duplicating or sampling it in Live data", () => {
    const requested = "propulsion/engine/plant/settings/iteration-cap";
    const selectSetting = vi.fn();
    const h = mount({ values: { [requested]: 24, [DIAGNOSTIC]: 8 }, selectSetting });
    expect(h.variables.find(variable => variable.path === requested)?.settingId).toBe("osfs.enginePlant.iterationCap");
    expect(h.item(requested)).toBeNull();
    expect(h.item(DIAGNOSTIC)?.textContent).toContain("8");
    const read = vi.spyOn(h.reader, "getPropertyValue");
    h.update(11);
    expect(read).not.toHaveBeenCalledWith(requested);
    const search = h.view.element.querySelector<HTMLInputElement>('input[type="search"]')!;
    search.value = requested; search.dispatchEvent(new Event("input", { bubbles: true }));
    const result = [...h.view.element.querySelectorAll<HTMLButtonElement>("button")]
      .find(button => button.textContent?.endsWith("→ Settings"))!;
    expect(result).toBeDefined(); result.click();
    expect(selectSetting).toHaveBeenCalledExactlyOnceWith("osfs.enginePlant.iterationCap");
    expect(h.item(requested)).toBeNull();
    expect(h.view.element.querySelectorAll(`[data-variable="${DIAGNOSTIC}"]`)).toHaveLength(1);
  });

  it("keeps aircraft-wide plot captions independent of an engine number", () => {
    const totalFuel = "propulsion/total-fuel-lbs";
    const h = mount({ values: { [totalFuel]: 300 } });
    h.item(totalFuel)!.querySelector<HTMLButtonElement>('button[aria-label="Plot Total fuel"]')!.click();
    const plot = h.item(totalFuel)!.closest("figure")!;
    expect(plot.querySelector("figcaption")?.textContent).toBe("Total fuel");
    expect(plot.querySelector("svg")?.getAttribute("aria-label")).toBe("Total fuel history in lb");
  });

  it("separates and regroups one shared spool axis, retaining manual choices across samples and reload", () => {
    const h = mount();
    const groups = () => [...h.view.element.querySelectorAll("figure")]
      .map(figure => [...figure.querySelectorAll<HTMLElement>("[data-variable]")].map(member => member.dataset.variable));
    expect(groups()).toContainEqual([N1, N2]);
    expect(h.item(N1)?.closest("figure")?.querySelectorAll(".flight-engine__plot-axis")).toHaveLength(1);
    expect(h.item(N1)?.closest("figure")?.querySelectorAll("svg")).toHaveLength(1);
    h.button("Separate N2").click();
    expect(groups()).toContainEqual([N1]);
    expect(groups()).toContainEqual([N2]);
    expect(document.activeElement?.getAttribute("data-focus-variable")).toBe(N2);
    h.values[N1] = 125;
    h.update(10.2);
    expect(groups()).not.toContainEqual([N1, N2]);
    expect(h.item(N1)?.closest("figure")?.querySelector(".flight-engine__plot-axis")?.textContent).toContain("125");
    const reloadedLayout = readEngineMonitorLayout(h.saved, h.scope);
    expect(reloadedLayout.variables[N2].group).toBeNull();
    h.view.destroy();
    const again = mount({ values: h.values, layout: reloadedLayout, saved: h.saved });
    expect(again.item(N1)?.closest("figure")).not.toBe(again.item(N2)?.closest("figure"));
    const group = again.item(N1)!.closest("figure")!;
    [...group.querySelectorAll<HTMLButtonElement>("button")].find(node => node.textContent === "Group compatible traces")!.click();
    expect(again.item(N1)?.closest("figure")).toBe(again.item(N2)?.closest("figure"));
    for (const id of [N1, N2]) expect(again.view.element.querySelectorAll(`[data-variable="${id}"]`)).toHaveLength(1);
  });

  it("expands one compact member, preserves focus and exposes only the control's own activation keys", () => {
    const layout = readEngineMonitorLayout(null, "test");
    setEngineVariablePresentation(layout, N1, "compact");
    setEngineVariablePresentation(layout, N2, "compact");
    const h = mount({ layout });
    const expand = h.item(N1)!.querySelector<HTMLButtonElement>("button")!;
    expect(expand.getAttribute("aria-expanded")).toBe("false");
    expect(controlTakesKey(expand, "Enter")).toBe(true);
    expect(controlTakesKey(expand, " ")).toBe(true);
    expect(controlTakesKey(expand, "w")).toBe(false);
    const key = new KeyboardEvent("keydown", { key: "w", bubbles: true, cancelable: true });
    expand.dispatchEvent(key);
    expect(key.defaultPrevented).toBe(false);
    expand.focus(); expand.click();
    expect(h.item(N1)?.closest("figure")).not.toBeNull();
    expect(h.item(N2)?.classList.contains("flight-engine__compact")).toBe(true);
    expect(document.activeElement?.getAttribute("data-focus-variable")).toBe(N1);
    h.button("Collapse N1").click();
    expect(h.item(N1)?.classList.contains("flight-engine__compact")).toBe(true);
    expect(document.activeElement?.getAttribute("aria-label")).toBe("Plot Engine 1 · N1");
    const help = h.item(N1)!.querySelector<HTMLButtonElement>('button[aria-label="Details for Engine 1 · N1"]')!;
    expect(help.getAttribute("aria-label")).toBe("Details for Engine 1 · N1");
    const helpContent = document.getElementById(help.getAttribute("aria-controls")!)!;
    expect(helpContent.hidden).toBe(true);
    help.click();
    expect(helpContent.hidden).toBe(false);
    expect(helpContent.textContent).toContain("Native configured");
    help.click();
    expect(helpContent.hidden).toBe(true);
    const search = h.view.element.querySelector<HTMLInputElement>('input[type="search"]')!;
    expect(controlTakesKey(search, "w")).toBe(true);
  });

  it("orders every plot before compact readings, and collapses only the selected family band", () => {
    const layout = readEngineMonitorLayout(null, "test");
    setEngineVariablePresentation(layout, N1, "compact");
    const h = mount({ layout });
    const flow = h.view.element.querySelector(".flight-engine__live-grid")!;
    const plottedAndCompact = [...flow.children].filter(el => el.matches("figure, .flight-engine__compact"));
    const firstCompact = plottedAndCompact.findIndex(el => el.classList.contains("flight-engine__compact"));
    expect(firstCompact).toBeGreaterThan(0);
    expect(plottedAndCompact.slice(firstCompact).every(el => el.classList.contains("flight-engine__compact"))).toBe(true);
    const toggle = flow.querySelector<HTMLButtonElement>('[data-family="plots:rotation"]')!;
    toggle.focus(); toggle.click();
    expect(flow.querySelector('[data-family="plots:rotation"]')?.getAttribute("aria-expanded")).toBe("false");
    expect(h.item(N2)).toBeNull();
    expect(h.item(N1)).not.toBeNull();
    expect(layout.variables[N2]?.presentation).toBeUndefined();
    expect(document.activeElement?.getAttribute("data-family")).toBe("plots:rotation");
    expect([...flow.children].some(el => el.hasAttribute("data-family") && el.tagName !== "BUTTON")).toBe(false);
    flow.querySelector<HTMLButtonElement>('[data-family="plots:rotation"]')!.click();
    expect(h.item(N2)?.closest("figure")).not.toBeNull();
    expect(h.item(N1)?.classList.contains("flight-engine__compact")).toBe(true);
  });

  it("shows current invalid, unavailable and zero observations while capture is off", () => {
    const h = mount();
    const retainedPaths = [...h.view.element.querySelectorAll("path")].map(path => path.getAttribute("d"));
    h.parameters.set("osfs.engineMonitor.historyHz", 0);
    h.view.configure();
    h.values[N1] = 0; h.values[GAS] = Number.NaN;
    h.update(12, true);
    expect(h.item(N1)?.querySelector(".flight-engine__value")?.textContent).toBe("0.0 %");
    expect(h.item(N1)?.querySelector(".flight-engine__value")?.getAttribute("aria-label")).toContain("held");
    expect(h.item(GAS)?.querySelector<HTMLElement>(".flight-engine__value")?.dataset.validity).toBe("invalid");
    expect(h.item(GAS)?.querySelector(".flight-engine__value")?.textContent).toBe("n/a");
    h.values[GAS_VALID] = 0; h.values[GAS] = 900;
    h.update(13);
    expect(h.item(GAS)?.querySelector<HTMLElement>(".flight-engine__value")?.dataset.validity).toBe("unavailable");
    expect(h.view.element.querySelector('[role="status"]')?.textContent).toContain("Recording off");
    expect([...h.view.element.querySelectorAll("path")].map(path => path.getAttribute("d"))).toEqual(retainedPaths);
    expect(h.view.element.textContent).not.toContain("Latest");
  });

  it("marks retained physical values stale after native failure and keeps attempted-solve diagnostics readable", () => {
    const failure = "propulsion/engine/plant/numerics/failure";
    const numericalValid = "propulsion/engine/plant/numerics/valid";
    const ledgerValid = "propulsion/engine/plant/ledger/valid";
    const ledgerEnergy = "propulsion/engine/plant/ledger/energy-relative";
    const h = mount({ values: { ...baseValues(), [failure]: 0, [ledgerValid]: 1, [ledgerEnergy]: 1e-8 } });
    const current = (id: string) => h.item(id)?.querySelector<HTMLElement>(".flight-engine__value");
    h.values[failure] = 1; h.values[numericalValid] = 0;
    h.values[N1] = 65; h.values[DIAGNOSTIC] = 24;
    h.values[ledgerValid] = 0;
    h.update(10.2);
    expect(current(N1)?.textContent).toBe("65.0 %");
    expect(current(N1)?.dataset.validity).toBe("stale");
    expect(h.item(N1)?.querySelector(".flight-engine__validity")?.textContent).toBe("stale");
    expect(h.item(N1)?.querySelector(".flight-engine__plot-range")?.textContent).toContain("min 40.0 % · max 40.0 %");
    expect(current(DIAGNOSTIC)?.textContent).toMatch(/^24(?:\s|$)/);
    expect(current(DIAGNOSTIC)?.dataset.validity).toBe("available");
    expect(current(ledgerEnergy)?.dataset.validity).toBe("unavailable");
    h.values[N1] = Number.NaN; h.update(10.4);
    expect(current(N1)?.textContent).toBe("n/a");
    expect(current(N1)?.dataset.validity).toBe("invalid");
    h.values[failure] = 0; h.values[N1] = 0; h.values[GAS_VALID] = 0;
    h.update(10.6, true);
    expect(current(N1)?.textContent).toBe("0.0 %");
    expect(current(N1)?.dataset.validity).toBe("available");
    expect(current(N1)?.getAttribute("aria-label")).toContain("held");
    expect(current(GAS)?.dataset.validity).toBe("unavailable");
    h.update(10.8);
    const trace = h.item(N1)?.closest("figure")?.querySelector(`path[data-trace="${N1}"]`);
    expect((trace?.getAttribute("d") ?? "").match(/M/g)).toHaveLength(2);
  });

  it("keeps offscreen paths untouched and draws retained native samples immediately when shown", () => {
    const plotted = vi.spyOn(engineHistory, "engineHistoryPlot");
    let callback: IntersectionObserverCallback;
    const observed = new Set<Element>();
    vi.stubGlobal("IntersectionObserver", class {
      constructor(cb: IntersectionObserverCallback) { callback = cb; }
      observe(target: Element) { observed.add(target); }
      disconnect() { observed.clear(); }
    });
    const h = mount();
    const paths = [...h.view.element.querySelectorAll("path")];
    expect(paths.every(path => !path.hasAttribute("d"))).toBe(true);
    h.values[N1] = 50; h.update(10.2);
    expect(paths.every(path => !path.hasAttribute("d"))).toBe(true);
    const entries = [...observed].map(target => ({ target, isIntersecting: true })) as IntersectionObserverEntry[];
    callback!(entries, {} as IntersectionObserver);
    expect(paths.some(path => (path.getAttribute("d") ?? "").includes("L"))).toBe(true);
    const changes = new MutationObserver(() => {});
    changes.observe(h.view.element, { subtree: true, attributes: true, characterData: true, childList: true });
    for (let i = 0; i < 3; i++) h.update(10.2, true);
    changes.takeRecords(); // A changed held label is a current observation, not plot generation.
    const drawingCount = plotted.mock.calls.length;
    for (let i = 0; i < 3; i++) h.update(10.2, true);
    expect(changes.takeRecords()).toEqual([]);
    expect(plotted).toHaveBeenCalledTimes(drawingCount);
    callback!(entries.map(entry => ({ ...entry, isIntersecting: false })), {} as IntersectionObserver);
    const before = paths.map(path => path.getAttribute("d"));
    h.values[N1] = 60; h.update(10.4);
    expect(paths.map(path => path.getAttribute("d"))).toEqual(before);
    expect(plotted).toHaveBeenCalledTimes(drawingCount);
    changes.disconnect();
  });

  it("suspends explicitly disabled hidden capture while preserving retained samples and current values", () => {
    const values = baseValues();
    const reader: EngineReader = { getPropertyValue: path => values[path] ?? Number.NaN };
    const onlyN1 = discoverEngineVariables(new Set(Object.keys(values)), { kind: "turbine" }, reader)
      .filter(variable => variable.id === N1);
    const h = mount({ values, variables: onlyN1 });
    h.parameters.set("osfs.engineMonitor.hiddenHistory", false);
    h.view.configure();
    h.setOpen(false);
    h.values[N1] = 60; h.update(10.2);
    h.setOpen(true); h.update(10.2, true);
    expect(h.item(N1)?.querySelector(".flight-engine__value")?.textContent).toBe("60.0 %");
    expect(h.item(N1)?.querySelector(".flight-engine__plot-range")?.textContent).toContain("1 samples");
    h.view.element.querySelector<HTMLButtonElement>('[data-family="plots:rotation"]')!.click();
    h.values[N1] = 65; h.update(10.4);
    expect(h.view.element.querySelector('[role="status"]')?.textContent).toMatch(/^Recording suspended ·/);
    h.view.element.querySelector<HTMLButtonElement>('[data-family="plots:rotation"]')!.click();
    h.update(10.4, true);
    expect(h.item(N1)?.querySelector(".flight-engine__plot-range")?.textContent).toContain("1 samples");
    h.parameters.set("osfs.engineMonitor.hiddenHistory", true);
    h.view.configure(); h.setOpen(false); h.update(10.6);
    h.setOpen(true); h.update(10.6, true);
    expect(h.item(N1)?.querySelector(".flight-engine__plot-range")?.textContent).toContain("2 samples");
    expect((h.item(N1)?.closest("figure")?.querySelector("path")?.getAttribute("d") ?? "").match(/M/g))
      .toHaveLength(2);
  });

  it("admits a waiting plot when the user releases a compact buffer without inventing its past", () => {
    const values = baseValues();
    const reader: EngineReader = { getPropertyValue: path => values[path] ?? Number.NaN };
    const variables = discoverEngineVariables(new Set(Object.keys(values)), { kind: "turbine" }, reader)
      .filter(variable => variable.id === N1 || variable.id === DIAGNOSTIC);
    const h = mount({ values, variables });
    h.parameters.set("osfs.engineMonitor.historyMetrics", 1); h.view.configure();
    h.button("Collapse N1").click();
    h.item(DIAGNOSTIC)!.querySelector<HTMLButtonElement>("button")!.click();
    expect(h.item(DIAGNOSTIC)?.textContent).toContain("budget full");
    h.button("Release compact histories").click();
    h.values[DIAGNOSTIC] = 9; h.update(10.2);
    expect(h.item(DIAGNOSTIC)?.querySelector(".flight-engine__plot-range")?.textContent).toContain("1 samples");
    expect(h.item(DIAGNOSTIC)?.closest("figure")?.querySelector(".flight-engine__plot-times")?.textContent)
      .toContain("t=10.20–10.20 s");
    expect(h.view.element.querySelector('[role="status"]')?.textContent).toContain("1/1 metrics");
  });

  it("refuses histories that exceed the visible byte budget without hiding current observations", () => {
    const values = baseValues();
    const reader: EngineReader = { getPropertyValue: path => values[path] ?? Number.NaN };
    const variables = discoverEngineVariables(new Set(Object.keys(values)), { kind: "turbine" }, reader)
      .filter(variable => variable.id === N1 || variable.id === N2);
    const h = mount({ values, variables });
    h.parameters.set("osfs.engineMonitor.historySeconds", 600);
    h.parameters.set("osfs.engineMonitor.historyHz", 30);
    h.parameters.set("osfs.engineMonitor.historyMemoryKiB", 64);
    h.view.configure(); h.values[N1] = 51; h.update(11);
    const status = h.view.element.querySelector('[role="status"]')!;
    expect(status.textContent).toContain("0.0/64 KiB");
    expect(status.textContent).toContain("waiting for budget");
    expect(h.item(N1)?.querySelector(".flight-engine__value")?.textContent).toBe("51.0 %");
    expect(h.item(N1)?.querySelector(".flight-engine__plot-range")?.textContent).toContain("budget full");
    h.parameters.set("osfs.engineMonitor.historySeconds", 1);
    h.parameters.set("osfs.engineMonitor.historyHz", 5);
    h.view.configure(); h.update(11.2);
    expect(status.textContent).toContain("2/32 metrics");
    expect(status.textContent).not.toContain("waiting for budget");
    expect(h.item(N1)?.querySelector(".flight-engine__plot-range")?.textContent).toContain("1 samples");
  });

  it("disposes capture and detached presentation controls without saving or rebuilding", () => {
    const h = mount();
    const detachedCollapse = h.button("Collapse N1");
    const read = vi.spyOn(h.reader, "getPropertyValue");
    const save = vi.spyOn(h.saved, "setItem");
    h.view.destroy();
    detachedCollapse.click(); h.view.capture(h.reader, 11, false); h.view.render(h.reader, false);
    expect(read).not.toHaveBeenCalled();
    expect(save).not.toHaveBeenCalled();
    expect(h.view.element.isConnected).toBe(false);
  });
});
