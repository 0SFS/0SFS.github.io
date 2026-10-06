/** Native semantic fields; a schema selects paths without aircraft-specific code. */
export type EngineTelemetryField = "n1Pct" | "n2Pct" | "thrustLbf" | "fuelFlowPps" | "running" | "augmentation" | "starter" | "cutoff" | "throttleNorm";
export interface NativeEngineTelemetrySchema {
  readonly id: string;
  readonly required: readonly EngineTelemetryField[];
  /** {engineIndex} is expanded by the native adapter; unavailable is never zero. */
  readonly paths: Readonly<Partial<Record<EngineTelemetryField, string>>>;
  /** Native global commands describe the selected engine(s), not each engine. */
  readonly commandScope?: { readonly selectionPath: string; readonly allEnginesValue: number };
  readonly combustion: { readonly rule: "fuel-flow-or-running"; readonly minimumFuelFlowPps: number };
}

export const JSBSIM_TURBINE_TELEMETRY: NativeEngineTelemetrySchema = Object.freeze({
  id: "jsbsim-turbine-v1",
  required: ["n1Pct", "n2Pct", "thrustLbf", "fuelFlowPps"] as const,
  commandScope: { selectionPath: "propulsion/active_engine", allEnginesValue: -1 },
  combustion: { rule: "fuel-flow-or-running" as const, minimumFuelFlowPps: 1e-4 },
  paths: Object.freeze({
    n1Pct: "propulsion/engine[{engineIndex}]/n1", n2Pct: "propulsion/engine[{engineIndex}]/n2",
    thrustLbf: "propulsion/engine[{engineIndex}]/thrust-lbs", fuelFlowPps: "propulsion/engine[{engineIndex}]/fuel-flow-rate-pps",
    running: "propulsion/engine[{engineIndex}]/set-running", augmentation: "propulsion/engine[{engineIndex}]/augmentation",
    starter: "propulsion/starter_cmd", cutoff: "propulsion/cutoff_cmd",
    throttleNorm: "fcs/throttle-cmd-norm[{engineIndex}]",
  }),
});

/**
 * 0sfs owns aircraft acoustic setup for the shared procedural voice.
 * The field order is the setup ABI in dsp/acoustic_profile.h. Frequencies and
 * gains are synthesis controls, not measured blade orders or acoustic power.
 */
export const ACOUSTIC_PROFILE_FIELDS = [
  "idleN1Pct", "idleN1SpanPct", "thrustReferenceLbf", "fuelReferencePps",
  "n1ReferenceHz", "n2ReferenceHz", "fanMix", "fanToneGain", "coreToneGain",
  "fanNoiseBaseGain", "fanNoisePowerGain", "bypassCenterHz", "bypassPowerHz", "bypassGain",
  "jetBaseHz", "jetPowerHz", "jetGain", "combustorHz", "combustorHighHz", "combustorGain",
  "outputGain", "afterburnerJetGain", "afterburnerJetHz",
  "highFineMixGain", "highFineMixHz", "highShockGain", "highShockHz",
  "highRearMixDirectivity", "highShockDirectivity",
  "highCockpitGain", "highCockpitHz",
] as const;

export type EngineAcousticProfile = Readonly<Record<typeof ACOUSTIC_PROFILE_FIELDS[number], number>>;

export interface EngineAcousticDefinition {
  /** Open hardware metadata; renderer compatibility is an independent gate. */
  readonly engineClass: string;
  readonly manufacturerFamily: string;
  readonly rendererId: string;
  readonly telemetry: NativeEngineTelemetrySchema;
  readonly id: string;
  readonly label: string;
  readonly approximation: string;
  readonly parameters: unknown;
}

/** Original FJ33 reference parameters; continuous sub-idle envelopes live in the renderer. */
export const FJ33_ACOUSTICS: EngineAcousticProfile = Object.freeze({
  idleN1Pct: 24.3, idleN1SpanPct: 75.7, thrustReferenceLbf: 1846, fuelReferencePps: 0.25,
  n1ReferenceHz: 2500, n2ReferenceHz: 6000, fanMix: 3.3 / (1 + 3.3),
  fanToneGain: 0.30, coreToneGain: 0.30, fanNoiseBaseGain: 0.10, fanNoisePowerGain: 0.55,
  bypassCenterHz: 900, bypassPowerHz: 1800, bypassGain: 0.28,
  jetBaseHz: 800, jetPowerHz: 5200, jetGain: 0.42,
  combustorHz: 90, combustorHighHz: 400, combustorGain: 0.55,
  outputGain: 0.9, afterburnerJetGain: 0, afterburnerJetHz: 6000,
  // High synthesis controls, not measured FJ33 transfer functions or spectra.
  // No shock-associated component is asserted for this installation.
  highFineMixGain: 0.16, highFineMixHz: 4200, highShockGain: 0, highShockHz: 1500,
  highRearMixDirectivity: 0.25, highShockDirectivity: 0,
  highCockpitGain: 0.12589254117941673, highCockpitHz: 1400,
});

export const FJ33_DEFINITION: EngineAcousticDefinition = Object.freeze({
  id: "fj33-reference",
  engineClass: "turbofan", manufacturerFamily: "Williams FJ33/FJ44", rendererId: "procedural-jet-v1",
  telemetry: JSBSIM_TURBINE_TELEMETRY,
  label: "Williams FJ33 procedural sound",
  approximation: "Synthetic engine tones; acoustic calibration pending.",
  parameters: FJ33_ACOUSTICS,
});

export const F135_DEFINITION: EngineAcousticDefinition = Object.freeze({
  id: "f135-approximation",
  engineClass: "turbofan", manufacturerFamily: "Pratt & Whitney F135", rendererId: "procedural-jet-v1",
  telemetry: JSBSIM_TURBINE_TELEMETRY,
  label: "Approximate F135 procedural sound",
  approximation: "One main-engine source with exhaust-dominant broadband roar and native afterburner state. Timbre and loudness are uncalibrated; separate lift-fan sound is not modeled.",
  parameters: Object.freeze({
    // Idle and dry thrust come from the installed trial FDM. Everything else
    // is an artistic starting point. F-35B measurements show angle/power-
    // dependent BROADBAND peaks, not rotor tones (DOI 10.2514/1.J057992).
    idleN1Pct: 30, idleN1SpanPct: 70, thrustReferenceLbf: 28_000, fuelReferencePps: 8,
    n1ReferenceHz: 1800, n2ReferenceHz: 3800, fanMix: 0.18,
    fanToneGain: 0.10, coreToneGain: 0.07, fanNoiseBaseGain: 0.04, fanNoisePowerGain: 0.20,
    bypassCenterHz: 450, bypassPowerHz: 1000, bypassGain: 0.08,
    jetBaseHz: 180, jetPowerHz: 2200, jetGain: 2.4,
    combustorHz: 90, combustorHighHz: 550, combustorGain: 0.85,
    outputGain: 1.1, afterburnerJetGain: 2.5, afterburnerJetHz: 4200,
    // Direction-dependent component decomposition is evidence-led; these
    // numeric shapes are explicit surrogates pending measured calibration.
    highFineMixGain: 0.85, highFineMixHz: 2600, highShockGain: 0.8, highShockHz: 1600,
    highRearMixDirectivity: 0.65, highShockDirectivity: 0.65,
    highCockpitGain: 0.1, highCockpitHz: 1000,
  }),
});

/** Open definition keys; renderer assignment is independent of engine class/family. */
const DEFINITIONS: Readonly<Record<string, EngineAcousticDefinition>> = {
  [FJ33_DEFINITION.id]: FJ33_DEFINITION, [F135_DEFINITION.id]: F135_DEFINITION,
};
export function getEngineAcousticDefinition(id: string): EngineAcousticDefinition | undefined {
  return Object.hasOwn(DEFINITIONS, id) ? DEFINITIONS[id] : undefined;
}

/** Encoder for the current reference renderer; absent setup is allowed only in low-level legacy fixtures. */
export function acousticProfileValues(definition?: EngineAcousticDefinition): number[] {
  const parameters = definition === undefined ? FJ33_ACOUSTICS : definition.parameters;
  if (!parameters || typeof parameters !== "object") throw new Error("Missing procedural jet parameters");
  const values = parameters as Record<string, unknown>;
  const encoded = ACOUSTIC_PROFILE_FIELDS.map(field => {
    const value = values[field];
    if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 100_000) throw new Error(`Invalid procedural jet parameter ${field}`);
    return value;
  });
  const at = (field: keyof EngineAcousticProfile): number => encoded[ACOUSTIC_PROFILE_FIELDS.indexOf(field)];
  if (at("idleN1Pct") >= 100 || at("idleN1SpanPct") <= 0 || at("idleN1SpanPct") > 100
    || at("thrustReferenceLbf") < 1 || at("fuelReferencePps") <= 0 || at("fanMix") > 1) {
    throw new Error("Invalid procedural jet reference range");
  }
  const gains: (keyof EngineAcousticProfile)[] = ["fanToneGain", "coreToneGain", "fanNoiseBaseGain",
    "fanNoisePowerGain", "bypassGain", "jetGain", "combustorGain", "outputGain", "afterburnerJetGain",
    "highFineMixGain", "highShockGain"];
  if (gains.some(field => at(field) > 16)) throw new Error("Invalid procedural jet gain range");
  const bounded: (keyof EngineAcousticProfile)[] = ["highRearMixDirectivity", "highShockDirectivity", "highCockpitGain"];
  if (bounded.some(field => at(field) > 1)) throw new Error("Invalid High acoustic shape range");
  const frequencies: (keyof EngineAcousticProfile)[] = ["highFineMixHz", "highShockHz", "highCockpitHz"];
  if (frequencies.some(field => at(field) < 20 || at(field) > 20_000)) throw new Error("Invalid High acoustic frequency range");
  return encoded;
}
