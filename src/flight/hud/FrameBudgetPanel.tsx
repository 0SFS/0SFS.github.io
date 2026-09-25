import { useEffect, useState } from "react";
import type { FrameProfileSummary } from "foss-earth/perf";
import { getActiveFrameProfile, setFrameProfilingEnabled } from "../diagnostics/frameProfile";
import "./frameBudget.css";

function ms(value: number): string {
  return value >= 10 ? value.toFixed(1) : value >= 1 ? value.toFixed(2) : value.toFixed(3);
}

function percent(share: number): string {
  return `${(share * 100).toFixed(share >= 0.1 ? 0 : 1)}%`;
}

/**
 * Debug → Frame budget: where each frame's time goes, section by section.
 * Measuring is session-only and off until switched on here or by `flightPerf=1`.
 */
export function FrameBudgetPanel() {
  const profile = getActiveFrameProfile();
  const [enabled, setEnabled] = useState(() => profile?.profiler.enabled ?? false);
  const [summary, setSummary] = useState<FrameProfileSummary | null>(null);
  useEffect(() => {
    if (!enabled || !profile) return;
    const refresh = (): void => setSummary(profile.profiler.summary());
    refresh();
    const interval = window.setInterval(refresh, 500);
    return () => window.clearInterval(interval);
  }, [enabled, profile]);

  if (!profile) return null;
  const toggle = (next: boolean): void => {
    setFrameProfilingEnabled(next);
    setEnabled(next);
    if (!next) setSummary(null);
  };
  const copy = (): void => {
    if (!navigator.clipboard) return;
    void navigator.clipboard.writeText(JSON.stringify(profile.profiler.summary(), null, 2));
  };
  const cpu = summary?.sections.filter(section => !section.section.startsWith("gpu")) ?? [];
  const gpu = summary?.sections.filter(section => section.section.startsWith("gpu/")) ?? [];
  const unmeasured = summary ? Math.max(0, summary.frame.meanMs - summary.measuredMeanMs) : 0;

  return (
    <fieldset className="flight-panel__fieldset">
      <legend>Frame budget</legend>
      <label className="flight-panel__field flight-panel__field--inline">
        <input type="checkbox" aria-label="Measure frame time" checked={enabled} onChange={event => toggle(event.target.checked)} />
        <span>Measure where frame time goes</span>
      </label>
      {enabled && summary && summary.frames > 0 && <>
        <p className="flight-panel__hint">
          {`Last ${summary.frames} frames: ${ms(summary.frame.meanMs)} ms apart on average (${(1000 / summary.frame.meanMs).toFixed(0)} fps), `}
          {`p95 ${ms(summary.frame.p95Ms)} ms. Measured work ${ms(summary.measuredMeanMs)} ms; the other ${ms(unmeasured)} ms is `}
          {"the globe's tile work, the browser, and waiting for the display."}
        </p>
        <table className="frame-budget" aria-label="Frame budget">
          <thead><tr><th>Section</th><th>Mean ms</th><th>p95 ms</th><th>Of frame</th></tr></thead>
          <tbody>
            {cpu.map(section => <tr key={section.section}>
              <th scope="row" style={{ paddingLeft: `${section.depth * 12 + 4}px` }}>{section.name}</th>
              <td>{ms(section.meanMs)}</td><td>{ms(section.p95Ms)}</td><td>{percent(section.shareOfFrame)}</td>
            </tr>)}
            {gpu.length > 0 && <tr className="frame-budget__group"><th scope="row" colSpan={4}>GPU, alongside the frame</th></tr>}
            {gpu.map(section => <tr key={section.section}>
              <th scope="row" style={{ paddingLeft: "16px" }}>{section.name}</th>
              <td>{ms(section.meanMs)}</td><td>{ms(section.p95Ms)}</td><td>{percent(section.shareOfFrame)}</td>
            </tr>)}
          </tbody>
        </table>
        {!profile.gpuTimed() && <p className="flight-panel__hint">
          This renderer cannot time GPU work: that needs WebGPU with timestamp queries.
        </p>}
        <p className="flight-panel__hint">
          CPU sections are JavaScript on the page. Canvas 2D drawing is finished in the browser's GPU process,
          which the page cannot time, so a Canvas 2D instrument shows less here than it costs.
        </p>
        <button className="flight-panel__command" type="button" onClick={copy}>Copy frame budget</button>
      </>}
      {enabled && (!summary || summary.frames === 0) && <p className="flight-panel__hint">Collecting frames…</p>}
    </fieldset>
  );
}
