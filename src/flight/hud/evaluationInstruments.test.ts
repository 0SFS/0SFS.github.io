// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { createEvaluationInstruments } from "./evaluationInstruments";
import type { FlightRecorderPropertyReader } from "../diagnostics/flightRecorder";

function reader(values: Record<string, number>): FlightRecorderPropertyReader {
  return {
    getPropertyValue: (property) => values[property] ?? 0,
    queryPropertyCatalog: (check) => {
      const hits = Object.keys(values).map((p) => p.replace(/\[0\]/g, "")).filter((p) => p.includes(check));
      return hits.length ? hits.map((p) => `${p} (R)`).join("\n") + "\n" : "No matches found\n";
    },
  };
}

const SF50 = {
  "simulation/sim-time-sec": 12,
  "propulsion/engine[0]/n1": 97.24,
  "aero/alpha-deg": 3.14,
  "fcs/stall-warning": 0,
  "fcs/stick-pusher": 0,
};

describe("evaluation instruments", () => {
  let root: HTMLElement;
  afterEach(() => {
    root?.remove();
  });
  const mount = () => {
    root = document.createElement("div");
    document.body.appendChild(root);
    return createEvaluationInstruments(root);
  };
  const text = (selector: string) => root.querySelector(selector)?.textContent?.trim();

  it("shows AoA and no N1, fuel-flow, or recorder UI", () => {
    const handle = mount();
    handle.update(reader(SF50));
    expect(text('[data-value="aoa"]')).toBe("3.1");
    expect((root.querySelector('[data-readout="aoa"]') as HTMLElement).hidden).toBe(false);
    expect(root.querySelector('[data-readout="n1"]')).toBeNull();
    expect(root.querySelector('[data-readout="ff"]')).toBeNull();
    expect(root.querySelector(".flight-eval__recorder")).toBeNull();
    expect(root.querySelector(".flight-eval__cas")?.classList.contains("is-active")).toBe(false);
  });

  it("hides AoA and never shows a CAS warning on an aircraft without them", () => {
    const handle = mount();
    handle.update(reader({ "propulsion/engine[0]/n1": 40 }));
    expect((root.querySelector('[data-readout="aoa"]') as HTMLElement).hidden).toBe(true);
    expect(text(".flight-eval__cas")).toBe("");
  });

  it("places AoA in the left tape row when a HUD slot exists", () => {
    root = document.createElement("div");
    root.innerHTML = `<div class="flight-hud"><div class="flight-hud__eval"></div><div class="flight-hud__aoa"></div></div>`;
    document.body.appendChild(root);
    const handle = createEvaluationInstruments(root.querySelector(".flight-hud__eval")!);
    handle.update(reader(SF50));
    expect(root.querySelector(".flight-hud__aoa [data-readout='aoa']")).not.toBeNull();
    expect(root.querySelector(".flight-eval [data-readout='aoa']")).toBeNull();
    handle.destroy();
  });

  it("announces the stick pusher ahead of the stall warning", () => {
    const handle = mount();
    handle.update(reader({ ...SF50, "fcs/stall-warning": 1 }));
    expect(text(".flight-eval__cas")).toBe("STALL WARNING");
    handle.update(reader({ ...SF50, "fcs/stall-warning": 1, "fcs/stick-pusher": 1 }));
    expect(text(".flight-eval__cas")).toBe("STICK PUSHER");
    handle.update(reader(SF50));
    expect(root.querySelector(".flight-eval__cas")?.classList.contains("is-active")).toBe(false);
  });

  it("removes its markup on destroy", () => {
    const handle = mount();
    handle.destroy();
    expect(root.querySelector(".flight-eval")).toBeNull();
  });
});
