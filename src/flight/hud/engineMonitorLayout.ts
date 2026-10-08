/** 0sfs owns engine-specific presentation and capability-scoped preferences. */
export const ENGINE_MONITOR_LAYOUT_KEY = "osfs.engineMonitor.v2";
const LEGACY_KEY = "osfs.engineMonitor.v1";

export type EnginePresentation = "plot" | "compact";
export type EnginePresentationBand = "plots" | "values";
export interface EnginePlotRange { minimum: number; maximum: number }
export interface EngineVariableLayout {
  presentation?: EnginePresentation;
  /** null is an explicit separation; absence uses the reviewed default group. */
  group?: string | null;
  unit?: string;
  /** An explicit display envelope, never an engine limit or a value clamp. */
  range?: EnginePlotRange;
}
export interface EngineMonitorLayout {
  top: { settings: boolean; live: boolean };
  families: Record<string, boolean>;
  supplementary: Record<string, boolean>;
  variables: Record<string, EngineVariableLayout>;
}
export type EngineLayoutStorage = Pick<Storage, "getItem" | "setItem"> | null;

/** Structural slice of the authoritative engine registry, without another list. */
export interface EngineLayoutVariable {
  id: string;
  engineIndex: number;
  family: string;
  unit?: string;
  defaultPresentation: EnginePresentation;
  defaultGroup: string | null;
  historyEligible: boolean;
  expectedRange: ({ kind: "known" | "provisional" } & EnginePlotRange) | { kind: "unknown" };
  units: readonly { unit: string; scale: number; offset?: number }[];
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function validId(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && ![...value].some(character => character.charCodeAt(0) < 32)
    && value !== "__proto__" && value !== "constructor" && value !== "prototype";
}
function booleans(value: unknown): Record<string, boolean> {
  const result: Record<string, boolean> = {};
  if (record(value)) for (const [id, open] of Object.entries(value)) {
    if (validId(id) && typeof open === "boolean") result[id] = open;
  }
  return result;
}
function validRange(value: unknown): value is EnginePlotRange {
  return record(value) && typeof value.minimum === "number" && Number.isFinite(value.minimum)
    && typeof value.maximum === "number" && Number.isFinite(value.maximum) && value.minimum < value.maximum;
}
function parseLayout(value: unknown): EngineMonitorLayout {
  const result: EngineMonitorLayout = { top: { settings: false, live: true }, families: {}, supplementary: {}, variables: {} };
  if (!record(value)) return result;
  if (record(value.top)) {
    if (typeof value.top.settings === "boolean") result.top.settings = value.top.settings;
    if (typeof value.top.live === "boolean") result.top.live = value.top.live;
  }
  result.families = Object.fromEntries(Object.entries(booleans(value.families)).filter(([key]) => /^(plots|values):[^:]+$/.test(key)));
  result.supplementary = booleans(value.supplementary);
  if (record(value.variables)) for (const [id, saved] of Object.entries(value.variables)) {
    if (!validId(id) || !record(saved)) continue;
    const variable: EngineVariableLayout = {};
    if (saved.presentation === "plot" || saved.presentation === "compact") variable.presentation = saved.presentation;
    if (saved.group === null || validId(saved.group)) variable.group = saved.group;
    if (validId(saved.unit)) variable.unit = saved.unit;
    if (validRange(saved.range)) variable.range = { minimum: saved.range.minimum, maximum: saved.range.maximum };
    result.variables[id] = variable;
  }
  return result;
}
function parse(storage: EngineLayoutStorage, key: string): unknown {
  try { return JSON.parse(storage?.getItem(key) ?? "null") as unknown; } catch { return null; }
}

/** The running model is part of identity; a transient missing property is not. */
export function engineLayoutScope(aircraftId: string, modelId = "default", capability = ""): string {
  return JSON.stringify([aircraftId, modelId, capability]);
}

export function readEngineMonitorLayout(storage: EngineLayoutStorage, scope: string): EngineMonitorLayout {
  const saved = parse(storage, ENGINE_MONITOR_LAYOUT_KEY);
  if (record(saved) && saved.version === 2 && record(saved.scopes) && Object.hasOwn(saved.scopes, scope)) {
    return parseLayout(saved.scopes[scope]);
  }
  const migrated = parseLayout(null);
  const legacy = parse(storage, LEGACY_KEY);
  if (!record(legacy)) return migrated;
  const open = booleans(legacy.open);
  // The old text dashboards are gone. Their family choices still apply to
  // compact values, while plots get their independent collapse preference.
  for (const [old, family] of [["spools", "rotation"], ["temperatures", "gas"], ["fuel", "fuel"],
    ["controls", "controls"], ["plant", "numerics"], ["air", "environment"], ["heat-balance", "gas"]]) {
    if (typeof open[old] === "boolean") migrated.families[`values:${family}`] = open[old];
  }
  if (typeof open.history === "boolean") for (const family of ["rotation", "gas", "fuel", "controls", "numerics", "environment"]) {
    migrated.families[`plots:${family}`] = open.history;
  }
  for (const id of ["log", "sound", "all", "test-stand"]) if (typeof open[id] === "boolean") migrated.supplementary[id] = open[id];
  return migrated;
}

export function writeEngineMonitorLayout(storage: EngineLayoutStorage, scope: string, layout: EngineMonitorLayout): void {
  try {
    const saved = parse(storage, ENGINE_MONITOR_LAYOUT_KEY);
    const scopes = record(saved) && saved.version === 2 && record(saved.scopes)
      ? Object.fromEntries(Object.entries(saved.scopes).filter(([id]) => validId(id)).map(([id, value]) => [id, parseLayout(value)])) : {};
    scopes[scope] = parseLayout(layout);
    storage?.setItem(ENGINE_MONITOR_LAYOUT_KEY, JSON.stringify({ version: 2, scopes }));
  } catch { /* Layout is a convenience; blocked or full storage cannot stop flight. */ }
}

export function engineVariablePresentation(layout: EngineMonitorLayout, variable: EngineLayoutVariable): EnginePresentation {
  return variable.historyEligible ? layout.variables[variable.id]?.presentation ?? variable.defaultPresentation : "compact";
}
export function setEngineVariablePresentation(layout: EngineMonitorLayout, id: string, presentation: EnginePresentation): void {
  layout.variables[id] = { ...layout.variables[id], presentation };
}
export function separateEngineVariable(layout: EngineMonitorLayout, id: string): void {
  layout.variables[id] = { ...layout.variables[id], group: null };
}

export function engineVariableUnit(variable: EngineLayoutVariable, layout: EngineMonitorLayout): { unit: string; scale: number; offset?: number } {
  const selected = layout.variables[variable.id]?.unit;
  return variable.units.find(unit => unit.unit === selected)
    ?? variable.units.find(unit => unit.unit === variable.unit)
    ?? { unit: variable.unit ?? "", scale: 1 };
}

/** Expected envelopes are expressed in the registry's default display unit. */
export function engineVariableExpectedRange(variable: EngineLayoutVariable, layout: EngineMonitorLayout): EnginePlotRange | null {
  if (variable.expectedRange.kind === "unknown") return null;
  const current = engineVariableUnit(variable, layout);
  const original = variable.units.find(unit => unit.unit === variable.unit) ?? { scale: 1, offset: 0 };
  if (!Number.isFinite(original.scale) || original.scale === 0) return null;
  const convert = (value: number): number => (value - (original.offset ?? 0)) / original.scale * current.scale + (current.offset ?? 0);
  const a = convert(variable.expectedRange.minimum), b = convert(variable.expectedRange.maximum);
  return { minimum: Math.min(a, b), maximum: Math.max(a, b) };
}

/** UI heuristic: same engine/family/unit, overlapping known envelopes, spans ≤2×. */
export function compatibleEngineVariables(a: EngineLayoutVariable, b: EngineLayoutVariable, layout: EngineMonitorLayout): boolean {
  if (!a.historyEligible || !b.historyEligible || a.engineIndex !== b.engineIndex || a.family !== b.family
    || engineVariableUnit(a, layout).unit !== engineVariableUnit(b, layout).unit) return false;
  const ar = engineVariableExpectedRange(a, layout), br = engineVariableExpectedRange(b, layout);
  if (!ar || !br) return false;
  const as = ar.maximum - ar.minimum, bs = br.maximum - br.minimum;
  return as > 0 && bs > 0 && Math.max(as, bs) <= 2 * Math.min(as, bs)
    && Math.max(ar.minimum, br.minimum) <= Math.min(ar.maximum, br.maximum);
}

function groupId(variable: EngineLayoutVariable, layout: EngineMonitorLayout): string | null {
  const saved = layout.variables[variable.id];
  return saved && Object.hasOwn(saved, "group") ? saved.group ?? null : variable.defaultGroup;
}

/** Only already plotted members join; compact companions never expand implicitly. */
export function enginePlotGroups<T extends EngineLayoutVariable>(variables: readonly T[], layout: EngineMonitorLayout): T[][] {
  const groups: T[][] = [];
  for (const variable of variables) {
    if (engineVariablePresentation(layout, variable) !== "plot") continue;
    const id = groupId(variable, layout);
    const compatible = id === null ? undefined : groups.find(group => groupId(group[0], layout) === id
      && group.every(member => compatibleEngineVariables(member, variable, layout)));
    if (compatible) compatible.push(variable); else groups.push([variable]);
  }
  return groups;
}

/** Explicit group action expands compatible companions, unlike one compact click. */
export function groupCompatibleEngineVariables<T extends EngineLayoutVariable>(layout: EngineMonitorLayout, variables: readonly T[], id: string): void {
  const anchor = variables.find(variable => variable.id === id);
  if (!anchor?.historyEligible) return;
  const members: T[] = [anchor];
  for (const candidate of variables) if (candidate.id !== id && members.every(member => compatibleEngineVariables(member, candidate, layout))) members.push(candidate);
  const group = anchor.defaultGroup ?? `manual:${anchor.id}`;
  for (const member of members) layout.variables[member.id] = { ...layout.variables[member.id], presentation: "plot", group };
}
