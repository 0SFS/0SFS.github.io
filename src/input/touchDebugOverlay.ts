/**
 * On-screen touch debug overlay.
 *
 * Built specifically to diagnose mobile gesture mis-classification (e.g.
 * Android Firefox interpreting two-finger orbit as pinch) when the user
 * has no access to remote DevTools. Logs every pointer event with its
 * coords + per-pointer move counts and shows the live inputs and output
 * of the gesture classifier.
 *
 * Auto-enabled when ANY of these are true:
 *  - URL contains `?touchDebug=1` or `?touchDebug` (or `&touchDebug...`)
 *  - URL hash contains `#touchDebug`
 *  - `window.__fossEarthTouchDebug === true`
 *  - `localStorage.getItem("foss-earth.touchDebug") === "1"`
 */

export type TouchDebugEventType =
  | "down"
  | "move"
  | "up"
  | "cancel"
  | "classify"
  | "session";

export interface TouchDebugEvent {
  type: TouchDebugEventType;
  timestamp: number;
  pointerId?: number;
  pointerType?: string;
  clientX?: number;
  clientY?: number;
  activePointerIds?: number[];
  sessionKind?: "none" | "single" | "multi";
  intent?: "swipe" | "pinch" | null;
  /** Total centroid translation from the (re-baselined) session start. */
  centroidTranslationPx?: number;
  /** Total distance change from the (re-baselined) session start. */
  distanceDeltaPx?: number;
  hasTwoMovingTouches?: boolean;
  touchesMovingTogether?: boolean;
  /** Number of pointermove events seen for each pointer in the current session. */
  perPointerMoveCount?: Record<number, number>;
  /** Free-form note attached to a `session` or `classify` event. */
  note?: string;
}

export interface TouchDebugOverlayHandle {
  onDebug: (event: TouchDebugEvent) => void;
  destroy: () => void;
}

export function isTouchDebugEnabled(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const w = window as unknown as { __fossEarthTouchDebug?: boolean };
    if (w.__fossEarthTouchDebug === true) return true;
    const search = window.location?.search ?? "";
    if (/[?&]touchDebug(=1)?(?:&|$)/.test(search)) return true;
    const hash = window.location?.hash ?? "";
    if (/touchDebug/i.test(hash)) return true;
    if (window.localStorage?.getItem("foss-earth.touchDebug") === "1") return true;
  } catch {
    // localStorage / location can throw in sandboxed iframes — ignore.
  }
  return false;
}

const MAX_LOG_ENTRIES = 28;

interface FormattedEntry {
  text: string;
  color: string;
}

function formatEvent(event: TouchDebugEvent, baseTimestamp: number): FormattedEntry {
  const t = ((event.timestamp - baseTimestamp) / 1000).toFixed(2).padStart(6, " ");
  switch (event.type) {
    case "down":
      return {
        text: `${t}s DOWN  pid=${event.pointerId} (${event.clientX},${event.clientY}) active=[${(event.activePointerIds ?? []).join(",")}]`,
        color: "#4ade80",
      };
    case "move":
      return {
        text: `${t}s move  pid=${event.pointerId} (${event.clientX},${event.clientY}) #moves=${JSON.stringify(event.perPointerMoveCount ?? {})}`,
        color: "#94a3b8",
      };
    case "up":
      return {
        text: `${t}s UP    pid=${event.pointerId} active=[${(event.activePointerIds ?? []).join(",")}]`,
        color: "#f87171",
      };
    case "cancel":
      return {
        text: `${t}s CANCEL pid=${event.pointerId}`,
        color: "#fb923c",
      };
    case "session":
      return {
        text: `${t}s session=${event.sessionKind} ${event.note ?? ""}`,
        color: "#a78bfa",
      };
    case "classify": {
      const intentColor =
        event.intent === "pinch" ? "#fb7185" : event.intent === "swipe" ? "#34d399" : "#fbbf24";
      const ct = event.centroidTranslationPx?.toFixed(1) ?? "?";
      const dd = event.distanceDeltaPx?.toFixed(1) ?? "?";
      return {
        text: `${t}s CLASSIFY intent=${event.intent ?? "null"} centΔ=${ct} distΔ=${dd} twoMoving=${event.hasTwoMovingTouches} together=${event.touchesMovingTogether}${event.note ? " " + event.note : ""}`,
        color: intentColor,
      };
    }
  }
}

export function attachTouchDebugOverlay(): TouchDebugOverlayHandle {
  const root = document.createElement("div");
  root.setAttribute("data-foss-earth-touch-debug", "1");
  Object.assign(root.style, {
    position: "fixed",
    top: "0",
    left: "0",
    right: "0",
    maxHeight: "55vh",
    overflowY: "auto",
    zIndex: "2147483647",
    background: "rgba(0,0,0,0.82)",
    color: "#e2e8f0",
    font: "11px/1.35 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
    padding: "6px 8px",
    pointerEvents: "none",
    whiteSpace: "pre",
    borderBottom: "1px solid rgba(255,255,255,0.15)",
  } as Partial<CSSStyleDeclaration>);

  const header = document.createElement("div");
  Object.assign(header.style, {
    display: "flex",
    gap: "8px",
    alignItems: "center",
    marginBottom: "4px",
    pointerEvents: "auto",
  } as Partial<CSSStyleDeclaration>);

  const title = document.createElement("strong");
  title.textContent = "touch debug";
  title.style.color = "#fbbf24";

  const buttonStyle: Partial<CSSStyleDeclaration> = {
    font: "11px ui-monospace, monospace",
    padding: "2px 8px",
    background: "#1e293b",
    color: "#e2e8f0",
    border: "1px solid #475569",
    borderRadius: "4px",
    cursor: "pointer",
  };

  function makeButton(label: string): HTMLButtonElement {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.textContent = label;
    // NOTE: don't `Object.assign(btn.style, otherEl.style)` — CSSStyleDeclaration
    // exposes numeric indexed properties (Firefox treats them as read-only and
    // throws "CSSStyleProperties doesn't have an indexed property setter for 0").
    Object.assign(btn.style, buttonStyle);
    return btn;
  }

  const copyBtn = makeButton("copy");
  const pauseBtn = makeButton("pause");
  const clearBtn = makeButton("clear");
  const closeBtn = makeButton("x");

  header.append(title, copyBtn, pauseBtn, clearBtn, closeBtn);
  root.append(header);

  const stateLine = document.createElement("div");
  stateLine.style.marginBottom = "4px";
  stateLine.style.color = "#fde68a";
  root.append(stateLine);

  const logBox = document.createElement("div");
  root.append(logBox);

  document.body.append(root);

  let baseTimestamp = performance.now();
  const entries: { event: TouchDebugEvent; formatted: FormattedEntry }[] = [];
  let latestState: TouchDebugEvent | null = null;
  let paused = false;

  function render(): void {
    if (latestState) {
      const active = latestState.activePointerIds ?? [];
      const moves = latestState.perPointerMoveCount ?? {};
      stateLine.textContent = `active=[${active.join(",")}] session=${latestState.sessionKind ?? "?"} intent=${latestState.intent ?? "null"} moves=${JSON.stringify(moves)}`;
    }
    logBox.innerHTML = entries
      .slice(-MAX_LOG_ENTRIES)
      .map((e) => `<div style="color:${e.formatted.color}">${escapeHtml(e.formatted.text)}</div>`)
      .join("");
    // Auto-scroll to bottom of the log so the most recent line is visible.
    root.scrollTop = root.scrollHeight;
  }

  function escapeHtml(s: string): string {
    return s
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }

  copyBtn.addEventListener("click", () => {
    const text = entries.map((e) => e.formatted.text).join("\n");

    function flashBtn(label: string): void {
      copyBtn.textContent = label;
      setTimeout(() => (copyBtn.textContent = "copy"), 1500);
    }

    // Try modern async clipboard API first.
    try {
      const clip = (navigator as Navigator & { clipboard?: { writeText?: (s: string) => Promise<void> } }).clipboard;
      const writeText = clip?.writeText?.bind(clip);
      if (writeText) {
        const promise = writeText(text);
        if (promise && typeof promise.then === "function") {
          promise.then(
            () => flashBtn("copied!"),
            () => execCommandCopy(text, flashBtn),
          );
          return;
        }
      }
    } catch {
      // fall through
    }
    execCommandCopy(text, flashBtn);
  });

  function execCommandCopy(text: string, flash: (label: string) => void): void {
    // Create a temporary off-screen textarea — never visible to the user.
    const ta = document.createElement("textarea");
    ta.value = text;
    Object.assign(ta.style, {
      position: "fixed",
      top: "-9999px",
      left: "-9999px",
      opacity: "0",
      pointerEvents: "none",
    } as Partial<CSSStyleDeclaration>);
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    try {
      const ok = document.execCommand("copy");
      flash(ok ? "copied!" : "copy failed");
    } catch {
      flash("copy failed");
    } finally {
      document.body.removeChild(ta);
    }
  }

  pauseBtn.addEventListener("click", () => {
    paused = !paused;
    pauseBtn.textContent = paused ? "play" : "pause";
    pauseBtn.style.background = paused ? "#7f1d1d" : "#1e293b";
  });

  clearBtn.addEventListener("click", () => {
    entries.length = 0;
    baseTimestamp = performance.now();
    render();
  });

  closeBtn.addEventListener("click", () => {
    root.remove();
  });

  function onDebug(event: TouchDebugEvent): void {
    if (paused) return;
    if (entries.length === 0) baseTimestamp = event.timestamp;
    const formatted = formatEvent(event, baseTimestamp);
    entries.push({ event, formatted });
    if (entries.length > MAX_LOG_ENTRIES * 4) entries.splice(0, entries.length - MAX_LOG_ENTRIES * 2);
    latestState = event;
    render();
  }

  return {
    onDebug,
    destroy(): void {
      root.remove();
    },
  };
}
