import { useEffect, useRef } from "react";
import { createFrameBudgetPanel } from "foss-earth/shell";
import { getActiveFrameProfile } from "../diagnostics/frameProfile";
import "./frameBudget.css";

/**
 * Debug → Frame budget: where each frame's time goes, section by section.
 * FOSS Earth's shared panel, with the flight's words. Measuring is
 * session-only and off until switched on here or by `flightPerf=1`.
 */
export function FrameBudgetPanel() {
  const profile = getActiveFrameProfile();
  const host = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!profile || !host.current) return;
    const panel = createFrameBudgetPanel({
      session: profile.session,
      className: "flight-frame-budget",
      unmeasured: "the browser's own work and waiting for the display",
      notes: [
        "CPU sections are JavaScript on the page. Canvas 2D drawing is finished in the browser's GPU process, "
          + "which the page cannot time, so a Canvas 2D instrument shows less here than it costs.",
      ],
      traceFileName: "0sfs-frame-trace",
    });
    host.current.append(panel.element);
    return () => panel.destroy();
  }, [profile]);

  if (!profile) return null;
  return (
    <fieldset className="flight-panel__fieldset">
      <legend>Frame budget</legend>
      <div ref={host} />
    </fieldset>
  );
}
