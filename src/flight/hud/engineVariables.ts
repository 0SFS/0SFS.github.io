import {
  ENGINE_SECTIONS, discoverThermalBalanceRows, enginePropertyApplies, tankRows,
  type EngineMonitorDefinition, type EngineReader, type EngineRow,
} from "./engineMonitorModel";

/** 0sfs owns these definitions: the observations and their identities require an aircraft engine. */
export type EngineVariableFamily = "rotation" | "gas" | "fuel" | "controls" | "numerics" | "environment";
export type EngineVariableNumericalType = "continuous" | "counter" | "flag" | "enumeration" | "text";
export type EngineExpectedRange =
  | { kind: "known" | "provisional"; minimum: number; maximum: number; source: string; conditions?: string }
  | { kind: "unknown"; source: string };
/** Affine native-to-display conversion, including offsets for absolute temperatures. */
export interface EngineVariableUnit { unit: string; scale: number; offset?: number }
export interface EngineVariable extends EngineRow {
  id: string;
  engineIndex: number;
  title: string;
  family: EngineVariableFamily;
  nativeUnit: string;
  displayUnit: string;
  dimension: string;
  units: readonly EngineVariableUnit[];
  /** Explicitly equivalent published property names, including the selected source. */
  aliases: readonly string[];
  availabilityDependencies: readonly string[];
  unavailableReason?: string;
  /** Published flags that say a finite physical getter is retained from the last accepted state. */
  staleProperties?: readonly string[];
  /** Requested solver settings have one existing parameter-control home, rather than a live duplicate. */
  settingId?: string;
  numericalType: EngineVariableNumericalType;
  expectedRange: EngineExpectedRange;
  defaultPresentation: "plot" | "compact";
  defaultGroup: string | null;
  historyEligible: boolean;
  recordByDefault: boolean;
  thermalAccounting: boolean;
  costCategory: "native-cached";
}

const sectionFamilies: Readonly<Record<string, EngineVariableFamily>> = {
  spools: "rotation", temperatures: "gas", fuel: "fuel", controls: "controls", plant: "numerics", air: "environment",
};
const solverSettingIds: Readonly<Record<string, string>> = {
  "algorithm": "osfs.enginePlant.algorithm",
  "iteration-cap": "osfs.enginePlant.iterationCap",
  "subdivision-cap": "osfs.enginePlant.subdivisionCap",
  "tolerance": "osfs.enginePlant.tolerance",
  "closure-budget-bytes": "osfs.enginePlant.closureBudgetKiB",
};
const extraRows: readonly EngineRow[] = [
  { label: "Nozzle opening", path: "propulsion/engine/nozzle-pos-norm", unit: "%", scale: 100, digits: 1,
    description: "Actual modeled nozzle position, separately from its control command." },
  { label: "Afterburner", path: "propulsion/engine/augmentation", flag: true,
    description: "Actual native augmentation state, independently of the throttle command." },
  { label: "Burned afterburner fuel", path: "propulsion/engine/thermal/afterburner-burned-fuel-flow-kg-sec", unit: "kg/s", digits: 4,
    validityProperties: ["propulsion/engine/thermal/valid"],
    description: "Actual burned reheat fuel mass flow, separately from metered and sprayed fuel." },
];
// Recording defaults belong to the same definitions used for compact readings and plots.
const defaultRecorded = new Set([
  "propulsion/engine/n1", "propulsion/engine/n2", "propulsion/engine/engine-rpm",
  "propulsion/engine/thrust-lbs", "propulsion/engine/fuel-flow-rate-pps", "propulsion/engine/fuel-flow-rate-gph",
  "propulsion/engine/egt-degc", "propulsion/engine/cht-degF", "propulsion/engine/thermal/nozzle-gas-temperature-k",
  "propulsion/engine/thermal/metal-temperature-k", "propulsion/engine/thermal/core/metal-temperature-k",
  "propulsion/engine/nozzle-pos-norm", "propulsion/engine/augmentation", "propulsion/engine/set-running",
  "propulsion/engine/thermal/afterburner-burned-fuel-flow-kg-sec", "fcs/throttle-cmd-norm",
]);

const engineIndex = (path: string): number => Number(/^propulsion\/engine(?:\[(\d+)\])?\//.exec(path)?.[1]
  ?? /^fcs\/(?:throttle|mixture)-(?:cmd|pos)-norm\[(\d+)\]$/.exec(path)?.[1] ?? 0);
const unindexed = (path: string): string => path.replace(/^propulsion\/engine\[\d+\]\//, "propulsion/engine/")
  .replace(/^(fcs\/(?:throttle|mixture)-(?:cmd|pos)-norm)\[\d+\]$/, "$1");
const indexed = (path: string, index: number): string => index === 0 ? path
  : path.startsWith("propulsion/engine/") ? path.replace("propulsion/engine/", `propulsion/engine[${index}]/`)
    : /^fcs\/(?:throttle|mixture)-(?:cmd|pos)-norm$/.test(path) ? `${path}[${index}]` : path;

/** Alias declarations follow FGTurbine::BindPlant/StorePlant; spelling similarity alone is insufficient. */
const equivalentPaths: Readonly<Record<string, string>> = {
  "propulsion/engine/egt-degF": "propulsion/engine/egt-degc",
  "propulsion/engine/plant/combustion/egt-gauge-k": "propulsion/engine/egt-degc",
  "propulsion/engine/plant/shaft/n1-percent": "propulsion/engine/n1",
  "propulsion/engine/plant/shaft/n2-percent": "propulsion/engine/n2",
  "propulsion/engine/plant/nozzle/position-norm": "propulsion/engine/nozzle-pos-norm",
  "propulsion/engine/plant/running": "propulsion/engine/set-running",
  "propulsion/engine/plant/fuel/ab-spray-kg-sec": "propulsion/engine/thermal/afterburner-fuel-flow-kg-sec",
  "propulsion/engine/plant/fuel/ab-burned-kg-sec": "propulsion/engine/thermal/afterburner-burned-fuel-flow-kg-sec",
  "propulsion/engine/plant/station/st7/total-temperature-k": "propulsion/engine/thermal/nozzle-gas-temperature-k",
  "propulsion/engine/plant/nozzle/gross-thrust-n": "propulsion/engine/plant/nozzle/gross-thrust-lbs",
};
function canonicalPath(path: string, definition?: EngineMonitorDefinition): string {
  const base = unindexed(path);
  // Each native thermal getter publishes this exact read/write alias for the same solid.
  let temperature = base.replace(/^propulsion\/engine\/plant\/solid\/([^/]+)\/temperature-k$/,
    "propulsion/engine/thermal/$1/metal-temperature-k")
    .replace(/^(propulsion\/engine\/thermal\/(?:[^/]+\/)?metal-temperature)-state-k$/, "$1-k");
  const solid = definition?.primaryThermalSolid;
  if (solid && temperature === `propulsion/engine/thermal/${solid}/metal-temperature-k`) temperature = "propulsion/engine/thermal/metal-temperature-k";
  return indexed(equivalentPaths[temperature] ?? temperature, engineIndex(path));
}

interface UnitDefinition { dimension: string; scale: number; offset?: number }
const unitDefinitions: Readonly<Record<string, UnitDefinition>> = {
  K: { dimension: "temperature", scale: 1 }, "°C": { dimension: "temperature", scale: 1, offset: 273.15 },
  "°F": { dimension: "temperature", scale: 5 / 9, offset: 273.15 - 32 * 5 / 9 },
  kg: { dimension: "mass", scale: 1 }, lb: { dimension: "mass", scale: .45359237 },
  "kg/s": { dimension: "mass-flow", scale: 1 }, "lb/s": { dimension: "mass-flow", scale: .45359237 },
  "lb/h": { dimension: "mass-flow", scale: .45359237 / 3600 },
  N: { dimension: "force", scale: 1 }, lbf: { dimension: "force", scale: 4.4482216152605 },
  W: { dimension: "power", scale: 1 }, hp: { dimension: "power", scale: 745.6998715822702 },
  Pa: { dimension: "pressure", scale: 1 }, psf: { dimension: "pressure", scale: 47.88025898033584 },
  psi: { dimension: "pressure", scale: 6894.757293168 }, inHg: { dimension: "pressure", scale: 3386.389 },
  "1": { dimension: "ratio", scale: 1 }, "%": { dimension: "ratio", scale: .01 },
  B: { dimension: "memory", scale: 1 }, KiB: { dimension: "memory", scale: 1024 }, MiB: { dimension: "memory", scale: 1024 ** 2 },
  "rad/s": { dimension: "angular-speed", scale: 1 }, rpm: { dimension: "angular-speed", scale: Math.PI / 30 },
  s: { dimension: "time", scale: 1 }, J: { dimension: "energy", scale: 1 },
  "J/K": { dimension: "heat-capacity", scale: 1 }, "N·m": { dimension: "torque", scale: 1 },
  "m²": { dimension: "area", scale: 1 }, "m/s": { dimension: "speed", scale: 1 },
  kt: { dimension: "speed", scale: .5144444444444445 },
  count: { dimension: "count", scale: 1 }, gph: { dimension: "volume-flow", scale: 1 },
};
function unitChoices(native: string): EngineVariableUnit[] {
  const source = unitDefinitions[native];
  if (!source) return [{ unit: native, scale: 1 }];
  return Object.entries(unitDefinitions).filter(([, target]) => target.dimension === source.dimension)
    .map(([unit, target]) => ({ unit, scale: source.scale / target.scale,
      offset: ((source.offset ?? 0) - (target.offset ?? 0)) / target.scale }));
}

function nativeUnit(path: string, row: EngineRow): string {
  path = unindexed(path);
  if (row.flag || row.labels) return "1";
  if (/\/n[12]$|\/MaxN[12]$|-percent$|\/pct-full$/.test(path)) return "%";
  if (/-norm$/.test(path)) return "1";
  const suffixes: readonly [RegExp, string][] = [
    [/-degc$|-c$/, "°C"], [/-degF$/, "°F"], [/-j-k$/, "J/K"], [/-kg-sec$/, "kg/s"],
    [/-pps$/, "lb/s"], [/-gph$/, "gph"], [/-rad-sec$/, "rad/s"], [/-n-m$/, "N·m"],
    [/-sq-m$/, "m²"], [/-k$/, "K"], [/-kg$/, "kg"], [/-lbs$/, row.unit === "lbf" || /thrust|drag/.test(path) ? "lbf" : "lb"],
    [/-pa$/, "Pa"], [/-psi$/, "psi"], [/-psf$|-lbs_sqft$/, "psf"], [/-inhg$/, "inHg"],
    [/-hp$/, "hp"], [/-rpm$/, "rpm"], [/-kts$/, "kt"], [/-mps$/, "m/s"],
    [/-w$/, "W"], [/-j$/, "J"], [/-seconds$|-time-sec$|-time-s$|-s$/, "s"], [/-bytes$/, "B"],
  ];
  return suffixes.find(([suffix]) => suffix.test(path))?.[1] ?? row.unit
    ?? (/\/(?:iterations|residual-evaluations|substeps|domain-clamps|sequence|epoch|count)$/.test(path) ? "count"
      : /(?:-relative|-ratio|-fraction|-efficiency|-mach)$|\/(?:AFR|bleed-factor|max-residual|nozzle-backoff)$/.test(path) ? "1" : "unknown");
}

function familyFor(path: string): EngineVariableFamily {
  if (/\/plant\/(?:numerics|ledger|events|settings|state)\//.test(path)) return "numerics";
  if (/\/thermal\/.*(?:heat|energy|step-seconds)/.test(path)) return "numerics";
  if (/\/fuel\/|fuel|\/tank(?:\[|\/)/.test(path)) return "fuel";
  if (/^fcs\/|_cmd$|\/(?:control|combustion)\/|\/(?:augmentation|set-running|starter|seized|stalled)/.test(path)) return "controls";
  if (/temperature|\/station\/|\/solid\/|\/thermal\//.test(path)) return "gas";
  if (/^velocities\/|^aero\/|^simulation\/|^propulsion\/(?:tat|pt)-/.test(path)) return "environment";
  return "rotation";
}
function diagnosticLabels(path: string): readonly string[] | undefined {
  if (/\/events\/last-code$/.test(path)) return ["none", "core lit", "core out", "AB lit", "AB out", "running", "stopped", "AB selected", "AB deselected", "starved", "numerical failure"];
  if (/\/nozzle\/regime$/.test(path)) return ["no flow", "subsonic", "choked internal shock", "overexpanded attached", "overexpanded separated", "underexpanded or ideal"];
  if (/\/(?:control|state)\/limiter$|\/state\/control-limiter$/.test(path)) return ["N1", "acceleration", "deceleration", "N2 maximum", "T5 maximum", "idle", "start", "off"];
  if (/\/(?:numerics|settings)\/algorithm$/.test(path)) return ["component", "reduced"];
  if (/\/numerics\/fallback-reason$/.test(path)) return ["none", "iteration cap", "out of domain", "non-finite value", "memory budget", "no steady point"];
  return undefined;
}
function thermalValidity(path: string): readonly string[] | undefined {
  const thermal = /^(propulsion\/engine(?:\[\d+\])?\/thermal\/)/.exec(path)?.[1];
  if (!thermal || /\/(?:valid|initialized|heat-balance-valid)$/.test(path)) return undefined;
  const region = path.slice(0, path.lastIndexOf("/") + 1);
  if (/metal-temperature(?:-state)?-k$|initialization-energy-j$/.test(path)) return [thermal + "valid", region + "initialized"];
  if (/(?:heat-flow-w|heat-capacity-j-k|bath-temperature-k|step-seconds|step-.*-j)$/.test(path)) return [region + "heat-balance-valid"];
  return [thermal + "valid"];
}
function expectedRange(row: EngineRow, id: string, available: ReadonlySet<string>, definition?: EngineMonitorDefinition, reader?: EngineReader): EngineExpectedRange {
  if (/\/n[12]$/.test(id)) {
    const maxPath = id.replace(/\/n([12])$/, "/MaxN$1");
    const maximum = available.has(maxPath) ? reader?.getPropertyValue(maxPath) : undefined;
    if (maximum !== undefined && Number.isFinite(maximum) && maximum > 0) return {
      kind: "known", minimum: 0, maximum, source: `Native configured ${maxPath}; plotting reference, not an operational limit.`,
    };
    return { kind: "provisional", minimum: 0, maximum: 120,
      source: "Provisional 0–120% spool plotting envelope; not an F135 operating or safe range." };
  }
  if (/\/engine-rpm$/.test(id) && definition?.maxRpm) return {
    kind: "known", minimum: 0, maximum: definition.maxRpm,
    source: "Aircraft native engine XML maxrpm; configured plotting reference, not a governor or physical clamp.",
  };
  if (row.flag) return { kind: "known", minimum: 0, maximum: 1, source: "Native Boolean encoding: off = 0, on = 1." };
  if (row.labels) return { kind: "known", minimum: 0, maximum: row.labels.length - 1,
    source: "Native labeled discrete states; codes describe events/states, not a continuous physical scale." };
  if (/^fcs\/(?:throttle|mixture)-(?:cmd|pos)-norm|\/nozzle-pos-norm$/.test(id)) return {
    kind: "known", minimum: 0, maximum: 100, source: "Published normalized command/position, displayed as percent; not an operational limit.",
  };
  return { kind: "unknown", source: "No expected physical display range is published in the loaded profile; standalone automatic scaling." };
}

/** One catalog feeds current readings, plot choices, grouping and recording/export. */
export function discoverEngineVariables(
  available: ReadonlySet<string>, definition?: EngineMonitorDefinition, reader?: EngineReader,
): EngineVariable[] {
  const indices = new Set<number>();
  for (const path of available) if (/^propulsion\/engine(?:\[\d+\])?\/|^fcs\/(?:throttle|mixture)-/.test(path)) indices.add(engineIndex(path));
  const seeds: { row: EngineRow; family: EngineVariableFamily; thermalAccounting?: boolean }[] = [];
  for (const section of ENGINE_SECTIONS) for (const row of section.rows) {
    const perEngine = row.path.startsWith("propulsion/engine/") || row.path.startsWith("fcs/");
    for (const index of perEngine ? [...indices].sort((a, b) => a - b) : [0]) seeds.push({
      row: { ...row, path: indexed(row.path, index), validityProperties: row.validityProperties?.map(path => indexed(path, index)) },
      family: sectionFamilies[section.id],
    });
  }
  for (const row of extraRows) for (const index of [...indices].sort((a, b) => a - b)) seeds.push({
    row: { ...row, path: indexed(row.path, index), validityProperties: row.validityProperties?.map(path => indexed(path, index)) },
    family: familyFor(row.path),
  });
  for (const row of tankRows([...available].sort())) seeds.push({ row, family: "fuel" });
  for (const row of discoverThermalBalanceRows(available, definition)) seeds.push({ row, family: "numerics", thermalAccounting: true });
  for (const path of [...available].sort()) {
    const labels = diagnosticLabels(path);
    const flag = /\/(?:valid|initialized|heat-balance-valid|choked|core-lit|ab-lit|ab-selected|igniter|running|starter-engaged|converged|failure|bypass-blocked|control-ab-selected|control-igniter|starter|warm-start-\d+)$/.test(path);
    const plant = /^(propulsion\/engine(?:\[\d+\])?\/plant\/)/.exec(path)?.[1];
    const validity = plant && !/\/(?:settings|state|events|numerics)\/|\/valid$/.test(path)
      ? /\/ledger\//.test(path) && available.has(plant + "ledger/valid") ? plant + "ledger/valid" : plant + "numerics/valid"
      : undefined;
    seeds.push({ row: { path, label: path.replace(/^propulsion\/engine(?:\[\d+\])?\//, "").replaceAll("/", " · ").replaceAll("-", " "),
      labels, flag, validityProperties: validity ? [validity] : thermalValidity(path),
      description: `Native observation ${path}. Station, total/static, command/measured and solid/gas distinctions follow the published path; no undocumented physical limit is inferred.` },
    family: familyFor(path) });
  }
  const variables = new Map<string, EngineVariable>();
  for (const { row, family, thermalAccounting = false } of seeds) {
    if (!available.has(row.path) || !enginePropertyApplies(unindexed(row.path), definition)) continue;
    const id = canonicalPath(row.path, definition);
    const previous = variables.get(id);
    if (previous) {
      if (!previous.aliases.includes(row.path)) previous.aliases = [...previous.aliases, row.path];
      continue;
    }
    const index = engineIndex(row.path);
    const native = nativeUnit(row.path, row);
    const units: EngineVariableUnit[] = row.flag || row.labels ? [{ unit: "", scale: 1 }] : unitChoices(native);
    const displayUnit = row.unit ?? (row.flag || row.labels ? "" : native);
    const conversion = units.find(choice => choice.unit === displayUnit);
    const numericalType: EngineVariableNumericalType = /\/state\/(?:config-digest|schema-version|commit)$/.test(row.path) ? "text"
      : row.flag ? "flag" : row.labels ? "enumeration" : /(?:fuel-used-lbs|fuel\/used-kg|\/events\/count|\/numerics\/(?:sequence|epoch))$/.test(row.path) ? "counter" : "continuous";
    const recordByDefault = defaultRecorded.has(unindexed(id));
    const plantPrefix = /^(propulsion\/engine(?:\[\d+\])?\/plant\/)/.exec(row.path)?.[1];
    const numericalObservation = Boolean(plantPrefix && /\/plant\/numerics\//.test(row.path));
    const ledgerObservation = Boolean(plantPrefix && /\/plant\/ledger\//.test(row.path));
    const ledgerMeasurement = ledgerObservation && !row.path.endsWith("/valid");
    const stagedRecord = Boolean(plantPrefix && /\/plant\/state\//.test(row.path));
    const settingName = /^propulsion\/engine\/plant\/settings\/([^/]+)$/.exec(unindexed(row.path))?.[1];
    const settingId = settingName ? solverSettingIds[settingName] : undefined;
    const validityProperties = numericalObservation ? undefined
      : ledgerMeasurement && available.has(plantPrefix + "ledger/valid") ? [plantPrefix + "ledger/valid"] : row.validityProperties;
    const failurePath = indexed("propulsion/engine/plant/numerics/failure", index);
    const staleProperties = ["rotation", "gas", "fuel"].includes(family)
      && (numericalType === "continuous" || numericalType === "counter")
      && /^propulsion\/engine(?:\[\d+\])?\//.test(row.path)
      && !/\/Max|\/(?:config|settings|numerics|ledger)\//.test(row.path) && available.has(failurePath) ? [failurePath] : undefined;
    const description = row.description ?? `Native ${row.label.toLowerCase()} at ${row.path}.`;
    const actualRow = { ...row, validityProperties, unit: displayUnit || undefined,
      scale: conversion?.scale ?? row.scale, offset: conversion?.offset ?? row.offset };
    const range = expectedRange(actualRow, id, available, definition, reader);
    const availabilityDependencies = [row.path, ...(validityProperties ?? [])];
    const missing = availabilityDependencies.filter(path => !available.has(path));
    // Canonical values discovered only through aliases still carry the declared default identity.
    variables.set(id, { ...actualRow, id, engineIndex: index, title: /^propulsion\/engine(?:\[\d+\])?\//.test(row.path) || /^fcs\//.test(row.path)
      ? `Engine ${index + 1} · ${row.label}` : row.label,
    family, nativeUnit: native, displayUnit, dimension: unitDefinitions[native]?.dimension ?? (native === "unknown" ? "unknown" : native),
    units, aliases: [row.path], availabilityDependencies,
    unavailableReason: missing.length ? `Unpublished dependency: ${missing.join(", ")}` : undefined,
    numericalType, expectedRange: range, staleProperties, settingId,
    description: numericalObservation
      ? `${description.replaceAll("last accepted step", "latest native solve attempt").replaceAll("last step", "latest native solve attempt")} Native solver diagnostics stay readable after a failed attempt; physical-state validity does not conceal the failure, algorithm or work counters.`
      : `${description}${staleProperties ? " A native solve failure marks this finite physical observation stale: it may retain the last accepted state and is not a new valid history sample." : ""}${ledgerMeasurement ? " Native mass/energy accounting is available only while its published ledger validity flag is true." : ""}${stagedRecord ? " Staged native restore record: values may change before state/commit and do not describe the current accepted physical state until committed." : ""}${/\/plant\/fuel\/total-metered-kg-sec$/.test(row.path) ? " Metered fuel mass flow; distinct from the native per-step fuel-flow-rate-pps accounting observation." : ""}${/\/fuel-flow-rate-pps$/.test(row.path) ? " Native per-step fuel-flow accounting; distinct from the plant's metered fuel mass flow." : ""}${settingId ? ` Readback of a requested solver setting, homed in Engine Settings as ${settingId}; distinct from the actual solver observations in Live data.` : ""}`,
    defaultPresentation: recordByDefault && numericalType === "continuous" ? "plot" : "compact",
    defaultGroup: /\/n[12]$/.test(id) ? `engine:${index}:spools` : null,
    historyEligible: numericalType !== "text" && !settingId, recordByDefault, thermalAccounting, costCategory: "native-cached" });
  }
  return [...variables.values()];
}

/** Unit choices transform both observations and the declared display envelope; never clamp. */
export function engineVariableInUnit(variable: EngineVariable, unit: string): EngineVariable {
  const conversion = variable.units.find(choice => choice.unit === unit);
  if (!conversion) return variable;
  const oldScale = variable.scale ?? 1;
  const oldOffset = variable.offset ?? 0;
  const convert = (value: number): number => (value - oldOffset) / oldScale * conversion.scale + (conversion.offset ?? 0);
  const range = variable.expectedRange;
  return { ...variable, unit, displayUnit: unit, scale: conversion.scale, offset: conversion.offset,
    expectedRange: range.kind === "unknown" ? range : { ...range, minimum: convert(range.minimum), maximum: convert(range.maximum) } };
}
