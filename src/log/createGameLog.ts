import "./gameLog.css";

export type GameLogTone = "info" | "progress" | "success" | "warning" | "error";

export interface GameLogAction {
  label: string;
  onClick(): void;
  /** Set for toggles; exposed as aria-pressed. */
  pressed?: boolean;
  disabled?: boolean;
}

export interface GameLogEntry {
  text: string;
  tone?: GameLogTone;
  /** Omit for no bar, null when the total is unknown, else completion from 0 to 1. */
  progress?: number | null;
  actions?: readonly GameLogAction[];
}

export interface GameLogLine {
  update(entry: GameLogEntry): void;
  focusAction(): void;
  remove(): void;
}

export interface GameLog {
  readonly element: HTMLElement;
  print(entry: GameLogEntry): GameLogLine;
  /** While busy, lines offering an action (such as fullscreen) stay on screen. */
  setBusy(busy: boolean): void;
  /** Shows the whole scrollable history, including lines that have faded. */
  setOpen(open: boolean): void;
  isOpen(): boolean;
  destroy(): void;
}

/** How long a finished line stays on screen after its last change. */
export const GAME_LOG_LINE_MS = 8000;
export const GAME_LOG_FADE_MS = 500;
const MAX_LINES = 40;
const ICONS: Record<GameLogTone, string> = { info: "›", progress: "›", success: "✓", warning: "!", error: "✕" };

function span(className: string): HTMLSpanElement {
  const element = document.createElement("span");
  element.className = className;
  return element;
}

/**
 * A chat-style log beside #root, so mounting the renderer cannot erase it.
 * Newest first. Each line fades on its own once finished, so a new message
 * appears alone rather than bringing the whole history back over the world.
 */
export function createGameLog(): GameLog {
  const element = document.getElementById("app-log") ?? document.createElement("div");
  element.id = "app-log";
  element.className = "game-log";
  element.setAttribute("role", "log");
  element.setAttribute("aria-label", "Game log");
  // Progress lines update in place; only new lines are announced.
  element.setAttribute("aria-relevant", "additions");
  element.replaceChildren();
  element.hidden = false;
  if (!element.isConnected) document.body.append(element);

  let busy = false;
  let open = false;
  let destroyed = false;
  const timers = new Map<Element, ReturnType<typeof setTimeout>>();

  // An overflowing log must take wheel and touch input to scroll; otherwise
  // the world under it keeps them.
  const syncScrollable = (): void => {
    element.toggleAttribute("data-scrollable", element.scrollHeight > element.clientHeight + 1);
  };

  // Work in progress and unanswered errors never fade. An offer (fullscreen)
  // waits out the loading it was shown during.
  const canFade = (row: HTMLElement): boolean => {
    if (row.dataset.tone === "progress") return false;
    if (!row.querySelector("button:not(:disabled)")) return true;
    return !busy && row.dataset.tone !== "error";
  };

  const schedule = (row: HTMLElement): void => {
    clearTimeout(timers.get(row));
    timers.delete(row);
    row.removeAttribute("data-fading");
    if (destroyed || row.hasAttribute("data-expired") || !canFade(row)) return;
    timers.set(row, setTimeout(() => {
      row.setAttribute("data-fading", "");
      timers.set(row, setTimeout(() => {
        timers.delete(row);
        row.removeAttribute("data-fading");
        row.setAttribute("data-expired", "");
        syncScrollable();
      }, GAME_LOG_FADE_MS));
    }, GAME_LOG_LINE_MS));
  };

  const print = (entry: GameLogEntry): GameLogLine => {
    const row = document.createElement("div");
    row.className = "game-log__line";
    const icon = span("game-log__icon");
    icon.setAttribute("aria-hidden", "true");
    const text = span("game-log__text");
    const value = span("game-log__value");
    const actions = span("game-log__actions");
    const bar = span("game-log__bar");
    row.append(icon, text, value, actions, bar);

    const update = (next: GameLogEntry): void => {
      if (destroyed) return;
      const tone = next.tone ?? "info";
      row.dataset.tone = tone;
      icon.textContent = ICONS[tone];
      text.textContent = next.text;

      const measured = typeof next.progress === "number" && Number.isFinite(next.progress)
        ? Math.max(0, Math.min(1, next.progress)) : null;
      bar.hidden = next.progress === undefined;
      if (bar.hidden) {
        bar.removeAttribute("role");
      } else {
        bar.setAttribute("role", "progressbar");
        bar.setAttribute("aria-label", next.text);
        bar.setAttribute("aria-valuemin", "0");
        bar.setAttribute("aria-valuemax", "100");
        if (measured === null) bar.removeAttribute("aria-valuenow");
        else bar.setAttribute("aria-valuenow", String(Math.round(measured * 100)));
        bar.style.setProperty("--game-log-progress", `${(measured ?? 0) * 100}%`);
      }
      value.textContent = !bar.hidden && measured !== null ? `${Math.round(measured * 100)}%` : "";
      value.hidden = !value.textContent;

      actions.replaceChildren(...(next.actions ?? []).map(action => {
        const button = document.createElement("button");
        button.type = "button";
        button.textContent = action.label;
        button.disabled = Boolean(action.disabled);
        if (action.pressed !== undefined) button.setAttribute("aria-pressed", String(action.pressed));
        button.addEventListener("click", () => action.onClick());
        return button;
      }));
      actions.hidden = actions.childElementCount === 0;

      // A changed line is news again.
      row.removeAttribute("data-expired");
      schedule(row);
      syncScrollable();
    };

    if (!destroyed) {
      const readingHistory = element.scrollTop > 0;
      const previousHeight = element.scrollHeight;
      element.prepend(row);
      update(entry);
      // A reader scrolled into older lines keeps their place; otherwise the
      // newest line shows at the top.
      if (readingHistory) element.scrollTop += element.scrollHeight - previousHeight;
      while (element.childElementCount > MAX_LINES) {
        const oldest = element.lastElementChild!;
        clearTimeout(timers.get(oldest));
        timers.delete(oldest);
        oldest.remove();
      }
      syncScrollable();
    }
    return {
      update,
      focusAction: () => actions.querySelector("button")?.focus({ preventScroll: true }),
      remove: () => {
        clearTimeout(timers.get(row));
        timers.delete(row);
        row.remove();
        syncScrollable();
      },
    };
  };

  return {
    element,
    print,
    setBusy(next) {
      busy = next;
      for (const row of element.children) schedule(row as HTMLElement);
    },
    setOpen(next) {
      open = next;
      element.toggleAttribute("data-open", open);
      if (open) element.scrollTop = 0;
      syncScrollable();
    },
    isOpen: () => open,
    destroy() {
      destroyed = true;
      for (const timer of timers.values()) clearTimeout(timer);
      timers.clear();
      element.remove();
    },
  };
}
