export interface PoiSpriteSizeParams {
  maxSize: number;
  minSize: number;
  minRefZoom: number;
  maxRefZoom: number;
}

export const DEFAULT_POI_SPRITE_SIZE_PARAMS: PoiSpriteSizeParams = {
  maxSize: 40_000,
  minSize: 200,
  minRefZoom: 100,
  maxRefZoom: 1_000_000,
};

const POI_SPRITE_SIZE_DEFAULTS_STORAGE_KEY = "foss-earth.poi-sprite-size-defaults";
const POI_SPRITE_SIZE_PARAM_KEYS = ["maxSize", "minSize", "minRefZoom", "maxRefZoom"] as const;
type PoiSpriteSizeParamKey = typeof POI_SPRITE_SIZE_PARAM_KEYS[number];

function normalizePoiSpriteSizeParams(value: unknown): PoiSpriteSizeParams | null {
  const record = (value || {}) as Partial<Record<PoiSpriteSizeParamKey, unknown>>;
  const params = {} as PoiSpriteSizeParams;

  for (const key of POI_SPRITE_SIZE_PARAM_KEYS) {
    const parsed = Number(record[key]);
    if (!Number.isFinite(parsed)) return null;
    params[key] = parsed;
  }

  return params;
}

function loadSavedPoiSpriteSizeDefaults(): PoiSpriteSizeParams | null {
  try {
    const raw = window.localStorage.getItem(POI_SPRITE_SIZE_DEFAULTS_STORAGE_KEY);
    if (!raw) return null;
    return normalizePoiSpriteSizeParams(JSON.parse(raw));
  } catch { return null; }
}

function savePoiSpriteSizeDefaults(params: PoiSpriteSizeParams): void {
  try {
    window.localStorage.setItem(POI_SPRITE_SIZE_DEFAULTS_STORAGE_KEY, JSON.stringify(params));
  } catch { /* ignore */ }
}

function paramsToCommitted(params: PoiSpriteSizeParams): Record<PoiSpriteSizeParamKey, string> {
  return {
    maxSize: String(params.maxSize),
    minSize: String(params.minSize),
    minRefZoom: String(params.minRefZoom),
    maxRefZoom: String(params.maxRefZoom),
  };
}

function paramsEqual(a: PoiSpriteSizeParams, b: PoiSpriteSizeParams): boolean {
  return POI_SPRITE_SIZE_PARAM_KEYS.every((key) => a[key] === b[key]);
}

export interface PoiSpriteSizeTunerHandle {
  show(): void;
  hide(): void;
  destroy(): void;
}

export function createPoiSpriteSizeTuner(
  container: HTMLElement,
  onApply: (params: PoiSpriteSizeParams) => void,
): PoiSpriteSizeTunerHandle {
  const savedDefaultParams = loadSavedPoiSpriteSizeDefaults();
  let defaultParams = savedDefaultParams ?? DEFAULT_POI_SPRITE_SIZE_PARAMS;
  let appliedParams = defaultParams;

  const panel = document.createElement("div");
  panel.className = "poi-sprite-tuner";
  panel.hidden = true;
  panel.innerHTML = `
    <div class="poi-sprite-tuner-title">Sprite Size</div>
    <div class="poi-sprite-tuner-grid">
      <label class="poi-sprite-tuner-field">
        <span>Max size (m)</span>
        <input type="number" data-field="maxSize" value="${defaultParams.maxSize}">
      </label>
      <label class="poi-sprite-tuner-field">
        <span>Min size (m)</span>
        <input type="number" data-field="minSize" value="${defaultParams.minSize}">
      </label>
      <label class="poi-sprite-tuner-field">
        <span>Min zoom (m)</span>
        <input type="number" data-field="minRefZoom" value="${defaultParams.minRefZoom}">
      </label>
      <label class="poi-sprite-tuner-field">
        <span>Max zoom (m)</span>
        <input type="number" data-field="maxRefZoom" value="${defaultParams.maxRefZoom}">
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
    return inputs.some((input) => input.value !== committed[input.dataset.field as PoiSpriteSizeParamKey]);
  }

  function readInputParams(): PoiSpriteSizeParams | null {
    const vals: Partial<Record<PoiSpriteSizeParamKey, number>> = {};
    for (const input of inputs) {
      const key = input.dataset.field as PoiSpriteSizeParamKey | undefined;
      if (!key) return null;
      const value = Number(input.value);
      if (!Number.isFinite(value)) return null;
      vals[key] = value;
    }

    return normalizePoiSpriteSizeParams(vals);
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
      committed[input.dataset.field as PoiSpriteSizeParamKey] = input.value;
    }
    updateApplyVisibility();
    onApply(vals);
  }

  function onSaveDefaultsClick(): void {
    if (isDirty()) return;
    defaultParams = appliedParams;
    savePoiSpriteSizeDefaults(defaultParams);
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
