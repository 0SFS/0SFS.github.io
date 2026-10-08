import { createHelpTooltip } from 'foss-earth/shell';
import { createEngineHistory, engineHistoryCsv, engineHistoryPlot, type EngineHistory, type EngineHistoryFrame } from './engineHistory';
import { engineVariableInUnit, type EngineVariable } from './engineVariables';
import { enginePlotGroups, engineVariablePresentation, setEngineVariablePresentation, separateEngineVariable,
  groupCompatibleEngineVariables, type EngineMonitorLayout } from './engineMonitorLayout';
import type { EngineReader } from './engineMonitorModel';
import { createEnginePlotRangeControl, changeEngineVariableUnit } from './enginePlotRangeControl';
import type { FlightParameterStore } from '../settings/flightParameters';

/** 0sfs owns this view: its stations, validity and recording policy describe aircraft engines. */
const FAMILIES = { rotation: 'Rotation/propulsion', gas: 'Gas and solids', fuel: 'Fuel', controls: 'Controls', numerics: 'Numerics', environment: 'Environment' } as const;
const SVG_NS = 'http://www.w3.org/2000/svg';
function node<K extends keyof HTMLElementTagNameMap>(tag: K, className = '', text = ''): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag); el.className = className; el.textContent = text; return el;
}
function text(el: Element, value: string): void { if (el.textContent !== value) el.textContent = value; }
function actionButton(label: string, action: () => void): HTMLButtonElement {
  const el = node('button', 'flight-engine__button', label); el.type = 'button'; el.addEventListener('click', action); return el;
}
function rangeDescription(variable: EngineVariable): string {
  const range = variable.expectedRange;
  return range.kind === 'unknown' ? `Expected range unknown; automatic scaling. ${range.source}`
    : `${range.kind === 'provisional' ? 'Provisional plotting envelope' : 'Expected configured range'} ${range.minimum}–${range.maximum} ${variable.unit ?? ''}. ${range.source}${range.conditions ? ` ${range.conditions}` : ''} Not an operational limit.`;
}
function format(variable: EngineVariable, value: number | null): string {
  if (value === null) return 'n/a';
  if (variable.numericalType === 'text') return String(value);
  if (variable.flag) return value > .5 ? 'on' : 'off';
  if (variable.labels) return variable.labels[Math.round(value)] ?? `unknown (${value})`;
  return `${variable.exponential ? value.toExponential(variable.digits ?? 1) : value.toFixed(variable.digits ?? 2)}${variable.unit ? ` ${variable.unit}` : ''}`;
}
interface Sample { value: number | null; state: 'available' | 'invalid' | 'unavailable' | 'stale' }
interface PlotCard { el: HTMLElement; members: EngineVariable[]; paths: SVGPathElement[]; values: HTMLElement[]; ranges: HTMLElement[]; axis: HTMLElement; times: HTMLElement; signature: string; visible: boolean }
export interface EngineLiveData {
  element: HTMLElement;
  capture(reader: EngineReader, time: number | null, held: boolean): void;
  render(reader: EngineReader, held: boolean): void;
  configure(): void;
  closeHelp(): void;
  destroy(): void;
}

export function createEngineLiveData(catalog: readonly EngineVariable[], parameters: FlightParameterStore,
  layout: EngineMonitorLayout, save: () => void, isOpen: () => boolean, refresh: () => void,
  selectSetting?: (id: string) => void): EngineLiveData {
  const variables = catalog.filter(v => !v.settingId);
  const element = node('div');
  const statusRow = node('div', 'flight-engine__status-row');
  const status = node('span', 'flight-engine__muted'); status.setAttribute('role', 'status');
  const actions = node('div', 'flight-engine__grid');
  const flow = node('div', 'flight-engine__live-grid flight-engine__plots');
  const histories = new Map<string, EngineHistory>();
  const byId = new Map(variables.map(v => [v.id, v]));
  const visibleIds = new Set<string>();
  const admitted = new Set<string>();
  const suppressed = new Set<string>();
  const states = new Map<string, HTMLElement>();
  const values = new Map<string, HTMLElement>();
  const cards: PlotCard[] = [];
  const controls: { destroy(): void; close?(): void }[] = [];
  let held = false, latestTime: number | null = null, disposed = false;
  let observer: IntersectionObserver | null = null;
  const button = (label: string, action: () => void) => actionButton(label, () => { if (!disposed) action(); });
  const settings = () => ({ seconds: parameters.get('osfs.engineMonitor.historySeconds'), hz: parameters.get('osfs.engineMonitor.historyHz'), columns: 1 });
  const display = (v: EngineVariable) => engineVariableInUnit(v, layout.variables[v.id]?.unit ?? v.unit ?? '');
  const read = (reader: EngineReader, v: EngineVariable): Sample => {
    if (v.unavailableReason) return { value: null, state: 'unavailable' };
    if (v.staleProperties?.some(path => reader.getPropertyValue(path) > .5)) {
      const native = reader.getPropertyValue(v.path);
      const value = native * (v.scale ?? 1) + (v.offset ?? 0);
      return Number.isFinite(value) ? { value, state: 'stale' } : { value: null, state: 'invalid' };
    }
    for (const path of v.validityProperties ?? []) {
      const flag = reader.getPropertyValue(path);
      if (!Number.isFinite(flag) || flag <= .5) return { value: null, state: 'unavailable' };
    }
    const native = reader.getPropertyValue(v.path);
    if (!Number.isFinite(native)) return { value: null, state: 'invalid' };
    const value = v.flag ? (native > .5 ? 1 : 0) : native * (v.scale ?? 1) + (v.offset ?? 0);
    return Number.isFinite(value) ? { value, state: 'available' } : { value: null, state: 'invalid' };
  };
  const bytesPerHistory = () => (Math.ceil(settings().seconds * settings().hz) + 1) * 17;
  const allocated = () => [...histories.values()].reduce((sum, h) => sum + h.allocatedBytes(), 0);
  const wants = (v: EngineVariable) => v.historyEligible && (engineVariablePresentation(layout, v) === 'plot'
    || (v.recordByDefault && (!v.thermalAccounting || parameters.get('osfs.engineMonitor.thermalHistory')))
    || (v.thermalAccounting && parameters.get('osfs.engineMonitor.thermalHistory')));
  const admit = () => {
    // Already admitted buffers retain their slot. New plots enter in stable registry order; never evict silently.
    const candidates = [...variables.filter(v => engineVariablePresentation(layout, v) === 'plot'), ...variables.filter(v => engineVariablePresentation(layout, v) === 'compact')];
    for (const v of candidates) {
      if (suppressed.has(v.id) || !wants(v) || histories.has(v.id) || settings().hz === 0) continue;
      if (histories.size >= parameters.get('osfs.engineMonitor.historyMetrics')
        || allocated() + bytesPerHistory() > parameters.get('osfs.engineMonitor.historyMemoryKiB') * 1024) continue;
      histories.set(v.id, createEngineHistory(settings())); admitted.add(v.id);
    }
  };
  const saveAndBuild = (focusId?: string) => { if (disposed) return; for (const id of suppressed) if (engineVariablePresentation(layout, byId.get(id)!) === 'plot') suppressed.delete(id); save(); build(focusId); refresh(); };
  const help = (v: EngineVariable): HTMLElement => {
    const content = node('div');
    content.append(node('p', '', v.description ?? 'Published native engine observation.'),
      node('p', '', rangeDescription(v)),
      node('p', '', `Native: ${v.path}; ${v.nativeUnit || 'unit unknown'}. Type: ${v.numericalType}.`),
      node('p', '', `${v.validityProperties?.length ? `Valid when ${v.validityProperties.join(', ')} are true.` : 'No native validity flag published.'}${v.unavailableReason ? ` ${v.unavailableReason}` : ''}${v.staleProperties?.length ? ` A native failure marks retained values stale; stale values are not recorded.` : ''}`));
    if (v.historyEligible) content.append(node('p', '', 'Plots use simulation time. Min and max summarize retained observations; missing or stale values leave gaps. Traces share one axis only when their units and ranges are compatible.'));
    if (v.historyEligible && v.numericalType !== 'flag' && v.numericalType !== 'enumeration') content.append(node('p', '', 'Plot options changes the display envelope. Observations outside it stay visible; it is not an operational limit. Auto uses the expected envelope or observed values. The editor span bounds the two thumbs; Expand doubles it. Before samples arrive, an unknown range has a neutral editor span, not an assumed physical range.'));
    if (v.labels) content.append(node('p', '', `Event states: ${v.labels.map((label, index) => `${index}: ${label}`).join('; ')}`));
    const tooltip = createHelpTooltip({ label: `Details for ${v.title}`, content });
    tooltip.element.classList.add('flight-engine__help'); tooltip.element.dataset.helpVariable = v.id;
    controls.push(tooltip);
    return tooltip.element;
  };
  const plotOptions = (v: EngineVariable): HTMLElement | null => {
    const hasRange = v.historyEligible && v.numericalType !== 'flag' && v.numericalType !== 'enumeration';
    if (v.units.length < 2 && !hasRange) return null;
    const details = node('details', 'flight-engine__plot-options'); details.dataset.optionsVariable = v.id;
    const summary = node('summary', '', 'Plot options'); summary.setAttribute('aria-label', `Plot options for ${v.title}`);
    details.append(summary);
    if (v.units.length > 1) {
      const label = node('label', '', 'Display unit '), select = node('select'); select.setAttribute('aria-label', `${v.title} display unit`);
      for (const unit of v.units) { const option = node('option', '', unit.unit); option.value = unit.unit; select.append(option); }
      select.value = v.unit ?? '';
      select.addEventListener('change', () => {
        if (disposed) return;
        changeEngineVariableUnit(layout, v, select.value); saveAndBuild(v.id);
        const replacement = [...flow.querySelectorAll<HTMLDetailsElement>('[data-options-variable]')].find(el => el.dataset.optionsVariable === v.id);
        if (replacement) { replacement.open = true; replacement.querySelector<HTMLSelectElement>('select')?.focus(); }
      });
      label.append(select); details.append(label);
    }
    if (hasRange) {
      let rangeControl: ReturnType<typeof createEnginePlotRangeControl> | null = null;
      details.addEventListener('toggle', () => {
        if (!details.open || rangeControl || disposed) return;
        rangeControl = createEnginePlotRangeControl(v, layout, { save: () => { if (!disposed) save(); }, onChange: () => { cards.filter(c => c.members.some(member => member.id === v.id)).forEach(c => c.signature = ''); refresh(); },
          observedRange: () => {
            let minimum = Infinity, maximum = -Infinity;
            const original = byId.get(v.id)!;
            for (const frame of histories.get(v.id)?.frames() ?? []) {
              const value = frame.values[0]; if (value === null) continue;
              const shown = (value - (original.offset ?? 0)) / (original.scale ?? 1) * (v.scale ?? 1) + (v.offset ?? 0);
              minimum = Math.min(minimum, shown); maximum = Math.max(maximum, shown);
            }
            return Number.isFinite(minimum) ? { minimum, maximum } : null;
          } });
        controls.push(rangeControl); details.append(rangeControl.element);
      });
    }
    return details;
  };
  const pair = (v: EngineVariable): HTMLElement => {
    const el = node('span', 'flight-engine__pair'); const label = node('span', 'flight-engine__label', v.label);
    const value = node('span', 'flight-engine__value', '—'), state = node('span', 'flight-engine__validity'); states.set(v.id, state); el.append(label, value, state); values.set(v.id, value); return el;
  };
  const build = (focusId?: string) => {
    if (disposed) return;
    observer?.disconnect(); for (const control of controls.splice(0)) control.destroy(); visibleIds.clear(); values.clear(); states.clear(); cards.length = 0; flow.replaceChildren(); admit();
    const groups = enginePlotGroups(variables.map(display), layout);
    for (const band of ['plots', 'values'] as const) for (const family of Object.keys(FAMILIES) as (keyof typeof FAMILIES)[]) {
      const items = band === 'plots' ? groups.filter(g => g[0].family === family)
        : variables.filter(v => v.family === family && engineVariablePresentation(layout, v) === 'compact').map(v => [display(v)]);
      if (!items.length) continue;
      const key = `${band}:${family}` as keyof typeof layout.families;
      const open = layout.families[key] ?? true;
      const marker = button(`${open ? '⌄' : '›'} ${FAMILIES[family]}`, () => { layout.families[key] = !open; saveAndBuild(); flow.querySelector<HTMLButtonElement>(`[data-family="${key}"]`)?.focus(); });
      marker.classList.add('flight-engine__family'); if (open) marker.classList.add('flight-engine__family--open');
      marker.dataset.family = key; marker.setAttribute('aria-label', `${FAMILIES[family]} ${band}`); marker.setAttribute('aria-expanded', String(open)); flow.append(marker);
      if (!open) continue;
      for (const members of items) {
        if (band === 'values') {
          const v = members[0], item = node('span', 'flight-engine__compact'); item.dataset.variable = v.id; item.dataset.property = v.path;
          if (v.historyEligible) {
            const expand = button('', () => { setEngineVariablePresentation(layout, v.id, 'plot'); saveAndBuild(v.id); });
            expand.dataset.focusVariable = v.id; expand.setAttribute('aria-label', `Plot ${v.title}`); expand.setAttribute('aria-expanded', 'false'); expand.append(pair(v)); item.append(expand);
          } else item.append(pair(v));
          item.append(help(v)); flow.append(item); continue;
        }
        const figure = node('figure', 'flight-engine__plot'); figure.dataset.band = 'plots';
        const prefix = members[0].title.endsWith(members[0].label) ? members[0].title.slice(0, -members[0].label.length) : '';
        const caption = node('figcaption', '', members.length === 1 ? members[0].title : `${prefix}${members.map(v => v.label).join(' + ')}`);
        const svg = document.createElementNS(SVG_NS, 'svg'); svg.setAttribute('viewBox', '0 0 300 64'); svg.setAttribute('role', 'img'); svg.setAttribute('aria-label', `${caption.textContent} history in ${members[0].unit || 'native units'}`);
        const card: PlotCard = { el: figure, members, paths: [], values: [], ranges: [], axis: node('p', 'flight-engine__plot-axis'), times: node('p', 'flight-engine__plot-times'), signature: '', visible: true };
        figure.append(caption, svg, card.axis);
        members.forEach((v, i) => {
          const path = document.createElementNS(SVG_NS, 'path'); path.setAttribute('fill', 'none'); path.setAttribute('stroke', ['#86c6ef', '#e8b647', '#b8e58c'][i % 3]); path.setAttribute('stroke-width', '1.5'); path.setAttribute('stroke-dasharray', i % 2 ? '5 3' : 'none'); path.setAttribute('vector-effect', 'non-scaling-stroke'); path.dataset.trace = v.id; svg.append(path); card.paths.push(path);
          const member = node('div', 'flight-engine__trace'); member.dataset.variable = v.id; member.dataset.property = v.path;
          const legend = node('div', 'flight-engine__trace-heading');
          const swatch = node('span', 'flight-engine__trace-swatch'); swatch.style.borderTopColor = path.getAttribute('stroke')!; swatch.style.borderTopStyle = i % 2 ? 'dashed' : 'solid'; swatch.setAttribute('aria-label', `${i % 2 ? 'Dashed' : 'Solid'} trace`);
          legend.append(swatch, pair(v), help(v)); member.append(legend);
          const range = node('p', 'flight-engine__plot-range'); card.ranges.push(range); card.values.push(values.get(v.id)!);
          member.append(range);
          const collapse = button(`Collapse ${v.label}`, () => { setEngineVariablePresentation(layout, v.id, 'compact'); saveAndBuild(v.id); });
          collapse.dataset.focusVariable = v.id; collapse.setAttribute('aria-expanded', 'true'); member.append(collapse);
          if (members.length > 1) member.append(button(`Separate ${v.label}`, () => { separateEngineVariable(layout, v.id); saveAndBuild(v.id); }));
          const options = plotOptions(v); if (options) member.append(options);
          figure.append(member);
        });
        figure.append(card.times, button('Group compatible traces', () => { groupCompatibleEngineVariables(layout, variables.map(display), members[0].id); saveAndBuild(members[0].id); }));
        if (members.length > 1) figure.append(button('Collapse plot', () => { for (const v of members) setEngineVariablePresentation(layout, v.id, 'compact'); saveAndBuild(members[0].id); }));
        flow.append(figure); cards.push(card);
      }
    }
    if (typeof IntersectionObserver !== 'undefined') {
      observer = new IntersectionObserver(entries => { let changed = false; for (const entry of entries) { const card = cards.find(c => c.el === entry.target); if (card && card.visible !== entry.isIntersecting) { card.visible = entry.isIntersecting; for (const v of card.members) { if (entry.isIntersecting) visibleIds.add(v.id); else visibleIds.delete(v.id); } changed ||= entry.isIntersecting; } } if (changed) refresh(); });
      cards.forEach(c => { c.visible = false; observer!.observe(c.el); });
    } else cards.forEach(c => c.members.forEach(v => visibleIds.add(v.id)));
    if (focusId) [...flow.querySelectorAll<HTMLElement>('[data-focus-variable]')].find(el => el.dataset.focusVariable === focusId)?.focus();
  };
  const clear = button('Clear history', () => { histories.forEach(h => h.clear()); refresh(); });
  const release = button('Release compact histories', () => { for (const v of variables) if (engineVariablePresentation(layout, v) === 'compact') { histories.delete(v.id); admitted.delete(v.id); suppressed.add(v.id); } admit(); refresh(); });
  const download = button('Download CSV', () => {
    if (disposed) return;
    const recorded = variables.filter(v => histories.has(v.id)).map(display);
    const timeline = new Map<number, (number | null)[]>();
    const gaps = new Set<number>();
    recorded.forEach((v, index) => { for (const frame of histories.get(v.id)!.frames()) { if (frame.breakBefore) gaps.add(frame.time); if (!timeline.has(frame.time)) timeline.set(frame.time, recorded.map(() => null)); const original = byId.get(v.id)!; const val = frame.values[0]; timeline.get(frame.time)![index] = val == null ? null : ((val - (original.offset ?? 0)) / (original.scale ?? 1)) * (v.scale ?? 1) + (v.offset ?? 0); } });
    const frames = [...timeline].sort(([a], [b]) => a - b).map(([time, samples]) => ({ time, values: samples, ...(gaps.has(time) ? { breakBefore: true } : {}) }));
    const url = URL.createObjectURL(new Blob([engineHistoryCsv(recorded, frames)], { type: 'text/csv;charset=utf-8' }));
    const link = node('a'); link.href = url; link.download = 'engine-history.csv'; try { link.click(); } finally { URL.revokeObjectURL(url); }
  });
  actions.append(clear, release, download);
  const searchLabel = node('label', '', 'Find native property '), search = node('input'); search.type = 'search'; search.setAttribute('aria-label', 'Find native engine property');
  const results = node('div', 'flight-engine__grid');
  search.addEventListener('input', () => {
    if (disposed) return;
    results.replaceChildren();
    const query = search.value.trim().toLowerCase();
    if (!query) return;
    for (const v of catalog) {
      if (!`${v.path} ${v.title} ${v.aliases.join(' ')}`.toLowerCase().includes(query)) continue;
      results.append(button(`${v.title}${v.settingId ? ' → Settings' : ''}`, () => {
        if (v.settingId) { selectSetting?.(v.settingId); return; }
        if (v.historyEligible) setEngineVariablePresentation(layout, v.id, 'plot');
        layout.families[`${v.historyEligible ? 'plots' : 'values'}:${v.family}`] = true;
        saveAndBuild(v.id);
        [...flow.querySelectorAll<HTMLElement>('[data-variable]')].find(el => el.dataset.variable === v.id)
          ?.scrollIntoView?.({ block: 'nearest' });
      }));
    }
  });
  const recordingContent = node('div');
  const recordingHelp = createHelpTooltip({ label: 'History recording help', content: recordingContent, onOpen: () => {
    recordingContent.replaceChildren(node('p', '', `Captures real native samples at up to ${settings().hz} Hz for ${settings().seconds} seconds of simulation time. Pausing holds the history; it does not create repeated samples.`),
      node('p', '', `Buffers use ${(allocated() / 1024).toFixed(1)} of ${parameters.get('osfs.engineMonitor.historyMemoryKiB')} KiB; ${histories.size} of ${parameters.get('osfs.engineMonitor.historyMetrics')} metric slots. Plotted variables enter first. Existing recordings keep their slots until you release them or lower the budget.`),
      node('p', '', parameters.get('osfs.engineMonitor.hiddenHistory') ? 'Admitted hidden variables continue capture.' : 'Compact and hidden capture is suspended; explicit thermal recording continues.'),
      node('p', '', 'Release compact histories frees their buffers and retained samples. Expand a variable to resume recording. If a plot is waiting for budget, release compact histories or raise the limits in Settings. Clear history keeps the allocated buffers. CSV includes each recorded quantity and unit; gaps remain empty.'));
  } });
  statusRow.append(status, recordingHelp.element);
  searchLabel.append(search); element.append(statusRow, actions, searchLabel, results, flow); build();
  return {
    element,
    capture(reader, time, nextHeld) {
      if (disposed) return;
      held = nextHeld; latestTime = time;
      const keepHidden = parameters.get('osfs.engineMonitor.hiddenHistory');
      const thermal = parameters.get('osfs.engineMonitor.thermalHistory');
      const captureHz = settings().hz;
      const shown = isOpen() && element.isConnected && !document.hidden;
      for (const [id, h] of histories) {
        const v = byId.get(id)!;
        const visible = shown && visibleIds.has(id);
        const capturing = keepHidden || visible || (v.thermalAccounting && thermal);
        if ((!capturing || captureHz === 0 || time === null) && !nextHeld) h.breakBeforeNextSample();
        h.observe(time, nextHeld || !capturing, () => { const sample = read(reader, v); return [sample.state === 'stale' ? null : sample.value]; });
      }
    },
    render(reader, nextHeld) {
      if (disposed || !element.isConnected || !isOpen() || document.hidden) return;
      held = nextHeld;
      for (const original of variables) {
        const el = values.get(original.id); if (!el) continue;
        const v = display(original), sample = read(reader, v);
        text(el, format(v, sample.value));
        if (el.dataset.validity !== sample.state) el.dataset.validity = sample.state;
        const stateText = `${sample.state !== 'available' ? sample.state : ''}${held ? ' held' : latestTime === null ? ' time unavailable' : ''}`.trim();
        text(states.get(v.id)!, stateText);
        const label = `${format(v, sample.value)}; ${sample.state}${held ? '; held' : ''}${latestTime === null ? '; time unavailable' : `; t=${latestTime} s`}`;
        if (el.getAttribute('aria-label') !== label) el.setAttribute('aria-label', label);
      }
      const blocked = settings().hz === 0 ? 0 : variables.filter(v => wants(v) && !admitted.has(v.id) && !suppressed.has(v.id)).length;
      const count = Math.max(0, ...[...histories.values()].map(h => h.size()));
      const active = [...histories.keys()].some(id => parameters.get('osfs.engineMonitor.hiddenHistory') || visibleIds.has(id)
        || (byId.get(id)!.thermalAccounting && parameters.get('osfs.engineMonitor.thermalHistory')));
      text(status, `${settings().hz === 0 ? 'Recording off' : held ? 'Recording held' : latestTime === null ? 'Time unavailable' : !active ? 'Recording suspended' : 'Recording'} · ${count} samples · ${histories.size}/${parameters.get('osfs.engineMonitor.historyMetrics')} metrics · ${(allocated() / 1024).toFixed(1)}/${parameters.get('osfs.engineMonitor.historyMemoryKiB')} KiB${suppressed.size ? ` · ${suppressed.size} released` : ''}${blocked ? ` · ${blocked} waiting for budget` : ''}`);
      download.disabled = count === 0;
      for (const card of cards) {
        if (!card.visible) continue;
        const signature = card.members.map(v => `${v.id}:${histories.get(v.id)?.revision() ?? -1}`).join('|');
        if (signature === card.signature) continue;
        card.signature = signature;
        const frames = card.members.map(v => {
          const original = byId.get(v.id)!;
          return (histories.get(v.id)?.frames() ?? []).map(frame => ({ time: frame.time, breakBefore: frame.breakBefore, values: frame.values.map(value => value == null ? null : ((value - (original.offset ?? 0)) / (original.scale ?? 1)) * (v.scale ?? 1) + (v.offset ?? 0)) }));
        });
        let low = Infinity, high = -Infinity, first = Infinity, last = -Infinity;
        let hasBounds = false;
        for (const member of card.members) {
          const envelope = layout.variables[member.id]?.range ?? (member.expectedRange.kind !== 'unknown' ? member.expectedRange : null);
          if (envelope) { hasBounds = true; low = Math.min(low, envelope.minimum); high = Math.max(high, envelope.maximum); }
        }
        for (const trace of frames) for (const frame of trace) {
          first = Math.min(first, frame.time); last = Math.max(last, frame.time);
          const value = frame.values[0]; if (value !== null) { low = Math.min(low, value); high = Math.max(high, value); }
        }
        if (!Number.isFinite(low) || !Number.isFinite(high)) { low = 0; high = 1; }
        if (low === high) { low -= Math.abs(low) * .05 || 1; high += Math.abs(high) * .05 || 1; }
        text(card.axis, `Axis ${format(card.members[0], low)}–${format(card.members[0], high)}${hasBounds ? '' : ' · auto'}`);
        text(card.times, Number.isFinite(first) ? `t=${first.toFixed(2)}–${last.toFixed(2)} s` : 'Waiting for samples');
        card.members.forEach((v, i) => {
          const padded: EngineHistoryFrame[] = [...(frames[i][0]?.time > first ? [{ time: first, values: [null] }] : []), ...frames[i], ...(frames[i].at(-1) && frames[i].at(-1)!.time < last ? [{ time: last, values: [null] }] : [])];
          const plot = engineHistoryPlot(padded, 0, Boolean(v.flag || v.labels), [low, high]);
          if (card.paths[i].getAttribute('d') !== plot.path) card.paths[i].setAttribute('d', plot.path);
          text(card.ranges[i], `min ${format(v, plot.minimum)} · max ${format(v, plot.maximum)} · ${histories.has(v.id) ? `${frames[i].length} samples` : settings().hz === 0 ? 'recording off' : suppressed.has(v.id) ? 'released' : 'budget full'}${latestTime === null ? ' · time unavailable' : ''}`);
        });
      }
    },
    configure() {
      if (disposed) return;
      // Reallocate in stable admission order; buffers that no longer fit are visibly refused.
      let used = 0, count = 0;
      for (const [id, h] of histories) {
        const bytes = settings().hz === 0 ? h.allocatedBytes() : bytesPerHistory();
        if (count >= parameters.get('osfs.engineMonitor.historyMetrics') || used + bytes > parameters.get('osfs.engineMonitor.historyMemoryKiB') * 1024) { histories.delete(id); admitted.delete(id); continue; }
        h.configure(settings()); used += h.allocatedBytes(); count++;
      }
      admit(); cards.forEach(c => c.signature = ''); refresh();
    },
    closeHelp() { recordingHelp.close(); for (const control of controls) control.close?.(); },
    destroy() { disposed = true; observer?.disconnect(); recordingHelp.destroy(); for (const control of controls.splice(0)) control.destroy(); histories.clear(); states.clear(); element.remove(); },
  };
}
