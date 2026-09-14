import { describe, expect, it } from "vitest";
import {
  createFallbackController, formatAudioStats, quantumMilliseconds, resolveRequestedTier,
  tierAvailability, type AudioCapabilities, type FallbackAction, type QualifiedProfile,
} from "./audioQuality";

const CAPABLE: AudioCapabilities = {
  audioWorklet: true, webAssembly: true, bankReady: false, loadObservable: false,
};

/** SYNTHETIC FIXTURE. Not a qualification record: no device ran anything. */
const fixtureProfile = (tier: "med" | "high"): QualifiedProfile => ({
  device: "fixture", browserBuild: "fixture", osBuild: "fixture", outputRoute: "fixture",
  sampleRateHz: 48_000, transport: "port", tier, evidence: "unit-test fixture",
});

describe("tier admission", () => {
  it("admits Low on any browser with AudioWorklet and WebAssembly", () => {
    expect(tierAvailability("low", CAPABLE).state).toBe("available");
  });

  it("names the missing capability", () => {
    expect(tierAvailability("low", { ...CAPABLE, audioWorklet: false }).state).toBe("unsupported");
    expect(tierAvailability("low", { ...CAPABLE, webAssembly: false }).state).toBe("unsupported");
  });

  it("reports Med as not yet validated, never as failed, while no profile exists", () => {
    expect(tierAvailability("med", CAPABLE).state).toBe("unvalidated");
    expect(tierAvailability("med", CAPABLE, [fixtureProfile("high")]).state).toBe("unvalidated");
    expect(tierAvailability("med", CAPABLE, [fixtureProfile("med")]).state).toBe("available");
  });

  it("keeps High unavailable without a cleared bank, whatever the profiles say", () => {
    expect(tierAvailability("high", CAPABLE, [fixtureProfile("high")]).state).toBe("pack-unavailable");
    expect(tierAvailability("high", { ...CAPABLE, bankReady: true }).state).toBe("unvalidated");
    expect(tierAvailability("high", { ...CAPABLE, bankReady: true }, [fixtureProfile("high")]).state)
      .toBe("available");
  });

  it("resolves Auto to the best available tier, which with no evidence is Low", () => {
    expect(resolveRequestedTier("auto", CAPABLE)).toEqual({ tier: "low", reason: null });
    expect(resolveRequestedTier("auto", CAPABLE, [fixtureProfile("med")]).tier).toBe("med");
    expect(resolveRequestedTier("off", CAPABLE)).toEqual({ tier: "off", reason: null });
  });

  it("runs an unvalidated explicit request only under the session testing override", () => {
    const allow = { allowUnvalidated: true };
    expect(resolveRequestedTier("med", CAPABLE, undefined, allow))
      .toMatchObject({ tier: "med", reason: expect.stringMatching(/testing/) });
    // Auto still picks only what is qualified, and a missing bank still blocks High.
    expect(resolveRequestedTier("auto", CAPABLE, undefined, allow).tier).toBe("low");
    expect(resolveRequestedTier("high", CAPABLE, undefined, allow).tier).toBe("low");
    expect(resolveRequestedTier("high", { ...CAPABLE, bankReady: true }, undefined, allow).tier).toBe("high");
    expect(resolveRequestedTier("med", { ...CAPABLE, audioWorklet: false }, undefined, allow).tier).toBe("off");
  });

  it("falls back below an unavailable request and says why", () => {
    const med = resolveRequestedTier("med", CAPABLE);
    expect(med.tier).toBe("low");
    expect(med.reason).toMatch(/qualification/);
    const high = resolveRequestedTier("high", CAPABLE);
    expect(high.tier).toBe("low");
    expect(high.reason).toMatch(/sample bank/);
    expect(resolveRequestedTier("low", { ...CAPABLE, audioWorklet: false }).tier).toBe("off");
  });
});

describe("fallback controller", () => {
  it("never sheds on a measurement that does not exist", () => {
    const controller = createFallbackController({ tier: "med", sampleRate: 48_000 });
    for (let t = 0; t <= 20_000; t += 100) {
      expect(controller.observe({ timeMs: t, dspMs: null, underruns: null })).toBeNull();
    }
    expect(controller.lastP95Ms).toBeNull();
    expect(controller.observedUnderruns).toBeNull();
  });

  it("sheds one stage after two consecutive over-budget windows, not one", () => {
    const controller = createFallbackController({ tier: "med", sampleRate: 48_000 });
    const actions: { t: number; action: FallbackAction }[] = [];
    for (let t = 0; t <= 4_000; t += 100) {
      const action = controller.observe({ timeMs: t, dspMs: 0.4, underruns: null });
      if (action) actions.push({ t, action });
    }
    expect(actions).toEqual([{ t: 4_000, action: expect.objectContaining({ kind: "shed", level: 1 }) }]);
    expect(controller.tier).toBe("med");
    expect(controller.lastP95Ms).toBeCloseTo(0.4);
  });

  it("restarts the count when a window comes in under budget", () => {
    const controller = createFallbackController({ tier: "med", sampleRate: 48_000 });
    for (let t = 0; t <= 6_000; t += 100) {
      const dspMs = t > 2_000 && t <= 4_000 ? 0.1 : 0.4;
      expect(controller.observe({ timeMs: t, dspMs, underruns: null })).toBeNull();
    }
  });

  it("drops a tier at once on a render longer than the quantum", () => {
    const controller = createFallbackController({ tier: "med", sampleRate: 48_000 });
    expect(controller.observe({ timeMs: 500, dspMs: 3.1, underruns: null }))
      .toMatchObject({ kind: "drop", tier: "low" });
    expect(controller.lockoutRemainingMs(500)).toBe(60_000);
    // The upgrade lockout never delays a further downgrade.
    expect(controller.observe({ timeMs: 600, dspMs: 3.1, underruns: null }))
      .toMatchObject({ kind: "drop", tier: "off" });
  });

  it("treats a counted underrun as a missed deadline", () => {
    const controller = createFallbackController({ tier: "low", sampleRate: 44_100 });
    expect(controller.observe({ timeMs: 0, dspMs: null, underruns: 7 })).toBeNull();
    // A real counter with nothing new is a measured zero, not "unknown".
    expect(controller.observedUnderruns).toBe(0);
    expect(controller.observe({ timeMs: 1_000, dspMs: null, underruns: 8 }))
      .toEqual({ kind: "drop", tier: "off", reason: "1 output underrun was counted." });
    expect(controller.observedUnderruns).toBe(1);
  });

  it("walks the whole shed ladder before dropping the tier", () => {
    const controller = createFallbackController({ tier: "med", sampleRate: 48_000 });
    const steps: (number | string)[] = [];
    for (let t = 0; t <= 30_000; t += 100) {
      const action = controller.observe({ timeMs: t, dspMs: 0.4, underruns: null });
      if (!action) continue;
      steps.push(action.kind === "shed" ? action.level : action.tier);
      if (action.kind === "drop") break;
    }
    expect(steps).toEqual([1, 2, 3, 4, 5, 6, "low"]);
  });

  it("clears the lockout and shed level only on an explicit re-test", () => {
    const controller = createFallbackController({ tier: "med", sampleRate: 48_000 });
    controller.observe({ timeMs: 0, dspMs: 5, underruns: null });
    expect(controller.tier).toBe("low");
    expect(controller.lockoutRemainingMs(30_000)).toBe(30_000);
    controller.retest("med", 30_000);
    expect(controller.tier).toBe("med");
    expect(controller.shed).toBe(0);
    expect(controller.lockoutRemainingMs(30_000)).toBe(0);
  });
});

describe("stats line", () => {
  it("derives the quantum from the real rate and block length", () => {
    expect(quantumMilliseconds(48_000)).toBeCloseTo(2.6667, 4);
    expect(quantumMilliseconds(44_100, 256)).toBeCloseTo(5.805, 3);
    expect(quantumMilliseconds(0)).toBeNaN();
  });

  it("prints unmeasured values as n/a and unknown, never as zero", () => {
    expect(formatAudioStats({
      effective: "low", requested: "auto", sampleRate: 48_000, dspP95Ms: null, dspMaxMs: null,
      underruns: null, residentMiB: null, transport: "port", reason: "nominal",
    })).toBe("Audio: low (requested auto) | DSP p95 n/a/2.667 ms (n/a%) | max n/a ms | "
      + "underruns unknown | RAM n/a | Fs 48000 | bridge port | nominal");
  });

  it("prints measured values in the same fixed format", () => {
    expect(formatAudioStats({
      effective: "med", requested: "med", sampleRate: 44_100, dspP95Ms: 0.2, dspMaxMs: 0.5,
      underruns: 0, residentMiB: 3.2, transport: "sab", reason: "held",
    })).toBe("Audio: med (requested med) | DSP p95 0.20/2.902 ms (6.9%) | max 0.50 ms | "
      + "underruns 0 | RAM 3.2 | Fs 44100 | bridge SAB | held");
  });
});
