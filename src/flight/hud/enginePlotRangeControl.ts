import { createTrack } from "foss-earth/shell";
import type { EngineVariable } from "./engineVariables";
import type { EngineMonitorLayout, EnginePlotRange } from "./engineMonitorLayout";

/** 0sfs owns the engine display envelope; FOSS Earth owns its continuous track. */
export interface EnginePlotRangeControl {
  element: HTMLElement;
  destroy(): void;
}

export function changeEngineVariableUnit(layout: EngineMonitorLayout, variable: EngineVariable, unit: string): void {
  const conversion = variable.units.find(candidate => candidate.unit === unit);
  if (!conversion) return;
  const saved = layout.variables[variable.id];
  let range = saved?.range;
  if (range) {
    const convert = (value: number) => (value - (variable.offset ?? 0)) / (variable.scale ?? 1)
      * conversion.scale + (conversion.offset ?? 0);
    const a = convert(range.minimum), b = convert(range.maximum);
    range = { minimum: Math.min(a, b), maximum: Math.max(a, b) };
  }
  layout.variables[variable.id] = { ...saved, unit, ...(range ? { range } : {}) };
}

export function createEnginePlotRangeControl(variable: EngineVariable, layout: EngineMonitorLayout, options: {
  save(): void;
  onChange(): void;
  /** Already observed display values; reading this never samples the model. */
  observedRange?: () => EnginePlotRange | null;
}): EnginePlotRangeControl {
  const element = document.createElement("div");
  element.className = "flight-engine__plot-envelope";
  const value = document.createElement("p");
  const spanLabel = document.createElement("p");
  spanLabel.className = "flight-engine__muted";
  const actions = document.createElement("div");
  actions.className = "flight-engine__grid";
  const unit = variable.unit ? ` ${variable.unit}` : "";
  const format = (number: number): string => variable.exponential ? number.toExponential(variable.digits ?? 2)
    : number.toFixed(variable.digits ?? 2);
  const automaticRange = (): EnginePlotRange => {
    const expected = variable.expectedRange;
    const range = expected.kind !== "unknown" ? expected : options.observedRange?.();
    if (range && Number.isFinite(range.minimum) && Number.isFinite(range.maximum)) {
      if (range.minimum < range.maximum) return { minimum: range.minimum, maximum: range.maximum };
      const radius = Math.abs(range.minimum) || 1;
      return { minimum: range.minimum - radius, maximum: range.maximum + radius };
    }
    // A declared neutral editor span is usable before any observation. It is
    // only a way to place thumbs, never an invented engine operating envelope.
    return { minimum: 0, maximum: 1 };
  };
  const envelope = (): EnginePlotRange => layout.variables[variable.id]?.range ?? automaticRange();
  let editor = { ...envelope() };
  const step = (): number => {
    const span = editor.maximum - editor.minimum;
    return variable.exponential ? span / 100 : Math.min(10 ** -(variable.digits ?? 2), span / 100);
  };
  const track = createTrack({
    ariaLabel: `${variable.title} display plot envelope`, ramp: "neutral",
    onInput(id, position) {
      if (!Number.isFinite(position)) return;
      const current = envelope();
      const quantum = step();
      const range = id === "minimum"
        ? { minimum: Math.min(position, current.maximum - quantum), maximum: current.maximum }
        : { minimum: current.minimum, maximum: Math.max(position, current.minimum + quantum) };
      layout.variables[variable.id] = { ...layout.variables[variable.id], range };
      options.save(); render(); options.onChange();
    },
  });
  const auto = document.createElement("button");
  auto.type = "button";
  auto.className = "flight-engine__button";
  auto.textContent = "Auto";
  auto.setAttribute("aria-label", `Automatic display plot envelope for ${variable.title}`);
  auto.addEventListener("click", () => {
    const saved = { ...layout.variables[variable.id] };
    delete saved.range;
    layout.variables[variable.id] = saved;
    editor = automaticRange();
    options.save(); render(); options.onChange();
  });
  const expand = document.createElement("button");
  expand.type = "button";
  expand.className = "flight-engine__button";
  expand.textContent = "Expand ×2";
  expand.setAttribute("aria-label", `Double plot envelope editor span for ${variable.title}`);
  expand.addEventListener("click", () => {
    const center = (editor.minimum + editor.maximum) / 2;
    const radius = editor.maximum - editor.minimum;
    if (!Number.isFinite(center - radius) || !Number.isFinite(center + radius)) return;
    editor = { minimum: center - radius, maximum: center + radius };
    render();
  });
  actions.append(auto, expand);
  element.append(value, track.element, spanLabel, actions);
  function render(): void {
    const range = envelope();
    const selection = `${format(range.minimum)}–${format(range.maximum)}${unit}`;
    const observed = variable.expectedRange.kind === "unknown" ? options.observedRange?.() : null;
    const hasObserved = observed && Number.isFinite(observed.minimum) && Number.isFinite(observed.maximum);
    value.textContent = layout.variables[variable.id]?.range ? `Plot range: ${selection} · Manual`
      : variable.expectedRange.kind === "unknown" && !hasObserved ? "Plot range: Auto · waiting for samples"
        : `Plot range: ${selection} · Auto (${variable.expectedRange.kind === "unknown" ? "observed" : variable.expectedRange.kind === "provisional" ? "provisional" : "expected"})`;
    spanLabel.textContent = `Editor: ${format(editor.minimum)}–${format(editor.maximum)}${unit}`;
    track.render({ min: editor.minimum, max: editor.maximum, step: step(), range: { low: range.minimum, high: range.maximum },
      thumbs: [{ id: "minimum", role: "end", position: range.minimum, ariaLabel: `${variable.title} plot envelope minimum`, ariaValueText: `${format(range.minimum)}${unit}` },
        { id: "maximum", role: "end", position: range.maximum, ariaLabel: `${variable.title} plot envelope maximum`, ariaValueText: `${format(range.maximum)}${unit}` }] });
  }
  render();
  return { element, destroy() { track.destroy(); element.remove(); } };
}
