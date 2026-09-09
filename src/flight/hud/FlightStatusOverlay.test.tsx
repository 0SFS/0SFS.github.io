// @vitest-environment jsdom
import { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createFlightStatusOverlay } from "./createFlightStatusOverlay";

function mount() {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const host = document.createElement("div");
  document.body.append(host);
  const onResume = vi.fn();
  const overlay = createFlightStatusOverlay(host, { onResume });
  return { host, overlay, onResume };
}

afterEach(() => { document.body.replaceChildren(); vi.unstubAllGlobals(); });

describe("flight status overlay", () => {
  it("shows nothing while the simulation is healthy", async () => {
    const t = mount();
    await act(async () => t.overlay.update(null));
    expect(t.host.querySelector(".flight-status-overlay")).toBeNull();
    t.overlay.destroy();
  });

  it("states the fault and every reason behind it, and offers recovery", async () => {
    const t = mount();
    await act(async () => t.overlay.update({
      kind: "fault",
      message: "Physics stopped after an unstable contact.",
      failed: ["moved 4210.5 m in one 120 Hz step (limit 100)", "airspeedKts is NaN"],
    }));
    const card = t.host.querySelector(".flight-status-overlay")!;
    expect(card.getAttribute("data-kind")).toBe("fault");
    expect(card.getAttribute("role")).toBe("alert");
    expect(card.textContent).toContain("moved 4210.5 m");
    expect(card.textContent).toContain("airspeedKts is NaN");

    await act(async () => t.host.querySelector<HTMLButtonElement>(".flight-panel__command")!.click());
    expect(t.onResume).toHaveBeenCalledOnce();
    t.overlay.destroy();
  });

  it("explains a terrain hold without calling it a failure", async () => {
    const t = mount();
    await act(async () => t.overlay.update({
      kind: "waiting", message: "Waiting for terrain height data", heldSeconds: 1,
    }));
    const card = t.host.querySelector(".flight-status-overlay")!;
    expect(card.getAttribute("data-kind")).toBe("waiting");
    expect(card.getAttribute("role")).toBe("status");
    expect(card.textContent).toContain("Waiting for terrain height data");
    expect(card.querySelector("button")).toBeNull();
    expect(card.textContent).not.toContain("repositioning");

    // Only suggest repositioning once it has clearly stopped being transient.
    await act(async () => t.overlay.update({
      kind: "waiting", message: "Waiting for terrain height data", heldSeconds: 7,
    }));
    expect(t.host.querySelector(".flight-status-overlay")!.textContent).toContain("repositioning");
    t.overlay.destroy();
  });

  it("re-renders only when the message changes, since it is driven every tick", async () => {
    const t = mount();
    const state = { kind: "fault", message: "Boom", failed: ["a"] } as const;
    await act(async () => t.overlay.update(state));
    const first = t.host.querySelector(".flight-status-overlay")!;
    await act(async () => t.overlay.update({ ...state }));
    expect(t.host.querySelector(".flight-status-overlay")).toBe(first);
    t.overlay.destroy();
  });
});
