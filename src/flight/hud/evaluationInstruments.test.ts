// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { createFlightRecorder, type FlightRecorderPropertyReader } from "../diagnostics/flightRecorder";
import { createEvaluationInstruments } from "./evaluationInstruments";

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
  "propulsion/engine[0]/fuel-flow-rate-gph": 58.4,
  "aero/alpha-deg": 3.14,
  "fcs/stall-warning": 0,
  "fcs/stick-pusher": 0,
};

describe("evaluation instruments", () => {
  let root: HTMLElement;
  afterEach(() => {
    root?.remove();
    vi.useRealTimers();
  });
  const mount = (saveRecording = vi.fn()) => {
    root = document.createElement("div");
    document.body.appendChild(root);
    const recorder = createFlightRecorder({ now: () => 0 });
    const handle = createEvaluationInstruments(root, { recorder, recordingName: () => "0sfs-test", saveRecording });
    return { handle, recorder, saveRecording };
  };
  const text = (selector: string) => root.querySelector(selector)?.textContent?.trim();

  it("shows N1, fuel flow and AoA for an aircraft that has them", () => {
    const { handle } = mount();
    handle.update(reader(SF50));
    expect(text('[data-value="n1"]')).toBe("97.2");
    expect(text('[data-value="ff"]')).toBe("58");
    expect(text('[data-value="aoa"]')).toBe("3.1");
    expect((root.querySelector('[data-readout="n1"]') as HTMLElement).hidden).toBe(false);
    expect(root.querySelector(".flight-eval__cas")?.classList.contains("is-active")).toBe(false);
  });

  it("hides N1 and never shows a CAS warning on an aircraft without them", () => {
    const { handle } = mount();
    handle.update(reader({ "aero/alpha-deg": 5, "propulsion/engine[0]/fuel-flow-rate-gph": 9 }));
    expect((root.querySelector('[data-readout="n1"]') as HTMLElement).hidden).toBe(true);
    expect((root.querySelector('[data-readout="ff"]') as HTMLElement).hidden).toBe(false);
    expect(text(".flight-eval__cas")).toBe("");
  });

  it("announces the stick pusher ahead of the stall warning", () => {
    const { handle } = mount();
    handle.update(reader({ ...SF50, "fcs/stall-warning": 1 }));
    expect(text(".flight-eval__cas")).toBe("STALL WARNING");
    handle.update(reader({ ...SF50, "fcs/stall-warning": 1, "fcs/stick-pusher": 1 }));
    expect(text(".flight-eval__cas")).toBe("STICK PUSHER");
    handle.update(reader(SF50));
    expect(root.querySelector(".flight-eval__cas")?.classList.contains("is-active")).toBe(false);
  });

  it("marks the recording from the M key but not while typing", () => {
    const { handle, recorder } = mount();
    recorder.sample(reader(SF50));
    handle.update(reader(SF50));
    window.dispatchEvent(new KeyboardEvent("keydown", { code: "KeyM" }));
    expect(recorder.getMarks()).toHaveLength(1);
    expect(text('[data-value="status"]')).toBe("MARK 1 · 00:12");
    const input = document.createElement("input");
    root.appendChild(input);
    input.dispatchEvent(new KeyboardEvent("keydown", { code: "KeyM", bubbles: true }));
    expect(recorder.getMarks()).toHaveLength(1);
  });

  it("saves the recording as CSV under the given name", () => {
    const { handle, recorder, saveRecording } = mount();
    (root.querySelector('[data-control="save"]') as HTMLButtonElement).click();
    expect(saveRecording).not.toHaveBeenCalled();
    expect(text('[data-value="status"]')).toBe("Nothing recorded yet");
    recorder.sample(reader(SF50));
    handle.update(reader(SF50));
    (root.querySelector('[data-control="save"]') as HTMLButtonElement).click();
    expect(saveRecording).toHaveBeenCalledWith("0sfs-test.csv", expect.stringContaining("sim_time_sec,"));
  });

  it("removes its markup and key listener on destroy", () => {
    const { handle, recorder } = mount();
    recorder.sample(reader(SF50));
    handle.destroy();
    window.dispatchEvent(new KeyboardEvent("keydown", { code: "KeyM" }));
    expect(recorder.getMarks()).toHaveLength(0);
    expect(root.querySelector(".flight-eval")).toBeNull();
  });
});
