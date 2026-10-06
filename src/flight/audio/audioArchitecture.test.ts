import { describe, expect, it } from "vitest";
import { getAircraftAudioInstallation, resolveAircraftAudioInstallation, type AircraftAudioInstallation } from "./aircraftAudioProfiles";
import { AUDIO_RENDERERS, getAudioRenderer, rendererAdmission } from "./audioRendererRegistry";
import { FJ33_ACOUSTICS, FJ33_DEFINITION, F135_DEFINITION, getEngineAcousticDefinition } from "./engineAcousticDefinitions";

const installation = (indices: number[], definitionId = FJ33_DEFINITION.id): AircraftAudioInstallation => ({
  engineSources: indices.map(index => ({ id: `exhaust-${index}`, engineIndex: index,
    engineDefinitionId: definitionId, position: { kind: "native-engine" } })),
});

describe("engine definition, aircraft installation and renderer admission", () => {
  it("keeps distinct manufacturer families and data while selecting the prototype renderer explicitly", () => {
    expect(FJ33_DEFINITION.manufacturerFamily).not.toBe(F135_DEFINITION.manufacturerFamily);
    expect(FJ33_DEFINITION.id).not.toBe(F135_DEFINITION.id);
    expect(FJ33_DEFINITION.parameters).not.toEqual(F135_DEFINITION.parameters);
    for (const id of ["cirrus-vision-jet", "f-35b"] as const) {
      const result = resolveAircraftAudioInstallation(getAircraftAudioInstallation(id));
      expect(result.supported).toBe(true);
      if (result.supported) {
        expect(result.renderer.id).toBe(result.source.definition.rendererId);
        expect(result.renderer.acousticStatus).toBe("approximate-unvalidated");
      }
    }
    expect(rendererAdmission({ ...F135_DEFINITION, rendererId: "unimplemented-f135-model" })).toMatchObject({ supported: false });
  });

  it("honors a declared nonzero engine index and refuses missing, invalid or multiple installations", () => {
    const accepted = resolveAircraftAudioInstallation(installation([2]));
    expect(accepted).toMatchObject({ supported: true, source: { installation: { engineIndex: 2 } } });
    for (const value of [undefined, installation([]), installation([-1]), installation([0, 1]), installation([0], "absent")]) {
      expect(resolveAircraftAudioInstallation(value).supported).toBe(false);
    }
    expect(resolveAircraftAudioInstallation(installation([0, 1]))).toMatchObject({ reason: expect.stringMatching(/multiple-source/) });
  });

  it("rejects unsupported classes, telemetry and transport without a turbofan fallback", () => {
    expect(rendererAdmission({ ...FJ33_DEFINITION, engineClass: "turboshaft" })).toMatchObject({ supported: false });
    expect(rendererAdmission({ ...FJ33_DEFINITION, telemetry: { ...FJ33_DEFINITION.telemetry, id: "future-schema" } })).toMatchObject({ supported: false });
    const current = AUDIO_RENDERERS[FJ33_DEFINITION.rendererId];
    for (const abi of [{ ...current.abi, snapshotVersion: 99 }, { ...current.abi, id: "other-binary-transport" }]) {
      expect(rendererAdmission(FJ33_DEFINITION, { [current.id]: { ...current, abi } })).toMatchObject({ supported: false, reason: expect.stringMatching(/ABI/) });
    }
    expect(getAudioRenderer("toString")).toBeUndefined();
    expect(getEngineAcousticDefinition("toString")).toBeUndefined();
  });

  it("rejects missing and out-of-range renderer parameters before a different engine can keep the reference setup", () => {
    expect(rendererAdmission({ ...F135_DEFINITION, parameters: undefined })).toMatchObject({ supported: false });
    const invalid = [
      { idleN1Pct: 100 }, { idleN1SpanPct: 0 }, { idleN1SpanPct: 101 },
      { thrustReferenceLbf: 0 }, { fuelReferencePps: 0 }, { fanMix: 1.1 },
      { jetGain: 17 }, { n1ReferenceHz: Number.NaN }, { n2ReferenceHz: 100_001 },
    ];
    for (const values of invalid) {
      expect(rendererAdmission({ ...FJ33_DEFINITION, parameters: { ...FJ33_ACOUSTICS, ...values } }).supported).toBe(false);
    }
  });
});
