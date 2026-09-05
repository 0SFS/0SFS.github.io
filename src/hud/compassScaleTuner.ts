import { DEFAULT_ORBIT_COMPASS_SCALE_PARAMS } from "../visualization/orbitCompass";
import type { OrbitCompassScaleParams } from "../visualization/orbitCompass";

const COMPASS_SCALE_DEFAULTS_STORAGE_KEY = "foss-earth.compass-scale-defaults";
const COMPASS_SCALE_PARAM_KEYS = ["radiusScale", "minRadius", "maxRadius", "labelSizeScale"] as const;
type CompassScaleParamKey = typeof COMPASS_SCALE_PARAM_KEYS[number];

function normalizeCompassScaleParams(value: unknown): OrbitCompassScaleParams | null {
  const record = (value || {}) as Partial<Record<CompassScaleParamKey, unknown>>;
  const params = {} as OrbitCompassScaleParams;

  for (const key of COMPASS_SCALE_PARAM_KEYS) {
    const parsed = Number(record[key]);
    if (!Number.isFinite(parsed) || parsed <= 0) return null;
    params[key] = parsed;
  }

  if (params.maxRadius < params.minRadius) return null;
  return params;
}

function loadSavedCompassScaleDefaults(): OrbitCompassScaleParams | null {
  try {
    const raw = window.localStorage.getItem(COMPASS_SCALE_DEFAULTS_STORAGE_KEY);
    if (!raw) return null;
    return normalizeCompassScaleParams(JSON.parse(raw));
  } catch { return null; }
}

function saveCompassScaleDefaults(params: OrbitCompassScaleParams): void {
  try {
    window.localStorage.setItem(COMPASS_SCALE_DEFAULTS_STORAGE_KEY, JSON.stringify(params));
  } catch { /* ignore */ }
}

function paramsToCommitted(params: OrbitCompassScaleParams): Record<CompassScaleParamKey, string> {
  return {
    radiusScale: String(params.radiusScale),
    minRadius: String(params.minRadius),
    maxRadius: String(params.maxRadius),
    labelSizeScale: String(params.labelSizeScale),
  };
}

function paramsEqual(a: OrbitCompassScaleParams, b: OrbitCompassScaleParams): boolean {
  return COMPASS_SCALE_PARAM_KEYS.every((key) => a[key] === b[key]);
}

export interface CompassScaleTunerHandle {
  show(): void;
  hide(): void;
  destroy(): void;
}

export function createCompassScaleTuner(
  container: HTMLElement,
  onApply: (params: OrbitCompassScaleParams) => void,
): CompassScaleTunerHandle {
  const savedDefaultParams = loadSavedCompassScaleDefaults();
  let defaultParams = savedDefaultParams ?? DEFAULT_ORBIT_COMPASS_SCALE_PARAMS;
  let appliedParams = defaultParams;

  const panel = document.createElement("div");
  panel.className = "poi-sprite-tuner compass-scale-tuner";
  panel.hidden = true;
  panel.innerHTML = `
    <div class="poi-sprite-tuner-title">Compass Scale</div>
    <div class="poi-sprite-tuner-grid">
      <label class="poi-sprite-tuner-field">
        <span>Radius scale</span>
        <input type="number" data-field="radiusScale" step="0.001" value="${defaultParams.radiusScale}">
      </label>
      <label class="poi-sprite-tuner-field">
        <span>Min radius (m)</span>
        <input type="number" data-field="minRadius" step="100" value="${defaultParams.minRadius}">
      </label>
      <label class="poi-sprite-tuner-field">
        <span>Max radius (m)</span>
        <input type="number" data-field="maxRadius" step="1000" value="${defaultParams.maxRadius}">
      </label>
      <label class="poi-sprite-tuner-field">
        <span>Label size</span>
        <input type="number" data-field="labelSizeScale" step="0.01" value="${defaultParams.labelSizeScale}">
      </label>
    </div>
    <div class="poi-sprite-tuner-actions">
      <button class="poi-sprite-tuner-apply" type="button" hidden>Apply</button>
      <button class="poi-sprite-tuner-save-defaults" type="button" hidden>Save defaults</button>
    </div>
  `;
  container.appendChild(panel);

  const inputs = Array.from(panel.querySelectorAll<HTMLInputElement>("input[data-field]"));
  const applyBtn = panel.querySelector<HTMLButtonElement>(".poi-sprite-tuner-apply");
  const saveDefaultsBtn = panel.querySelector<HTMLButtonElement>(".poi-sprite-tuner-save-defaults");

  const committed = paramsToCommitted(appliedParams);

  function isDirty(): boolean {
    return inputs.some((input) => input.value !== committed[input.dataset.field as CompassScaleParamKey]);
  }

  function readInputParams(): OrbitCompassScaleParams | null {
    const vals: Partial<Record<CompassScaleParamKey, number>> = {};
    for (const input of inputs) {
      const key = input.dataset.field as CompassScaleParamKey | undefined;
      if (!key) return null;
      const value = Number(input.value);
      if (!Number.isFinite(value)) return null;
      vals[key] = value;
    }

    return normalizeCompassScaleParams(vals);
  }

  function updateApplyVisibility(): void {
    const dirty = isDirty();
    if (applyBtn) applyBtn.hidden = !dirty;
    if (saveDefaultsBtn) saveDefaultsBtn.hidden = dirty || paramsEqual(appliedParams, defaultParams);
  }

  function onApplyClick(): void {
    const vals = readInputParams();
    if (!vals) return;

    appliedParams = vals;
    for (const input of inputs) {
      committed[input.dataset.field as CompassScaleParamKey] = input.value;
    }
    updateApplyVisibility();
    onApply(vals);
  }

  function onSaveDefaultsClick(): void {
    if (isDirty()) return;
    defaultParams = appliedParams;
    saveCompassScaleDefaults(defaultParams);
    updateApplyVisibility();
  }

  inputs.forEach((input) => input.addEventListener("input", updateApplyVisibility));
  applyBtn?.addEventListener("click", onApplyClick);
  saveDefaultsBtn?.addEventListener("click", onSaveDefaultsClick);
  if (savedDefaultParams) onApply(savedDefaultParams);

  return {
    show(): void { panel.hidden = false; },
    hide(): void { panel.hidden = true; },
    destroy(): void {
      inputs.forEach((input) => input.removeEventListener("input", updateApplyVisibility));
      applyBtn?.removeEventListener("click", onApplyClick);
      saveDefaultsBtn?.removeEventListener("click", onSaveDefaultsClick);
      panel.remove();
    },
  };
}