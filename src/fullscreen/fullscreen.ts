import {
  canRequestFullscreen, enterFullscreen, isFullscreen, isStandaloneDisplay, onFullscreenChange,
  prefersHomeScreenInstall, readFullscreenEveryVisit, writeFullscreenEveryVisit,
  type GameLog,
} from "foss-earth/shell";

/**
 * Offers to hide the browser bars in the log. Nothing happens without the
 * pilot's choice: "Every visit" enters fullscreen on their first tap or key
 * press, because browsers refuse fullscreen that is not started by one.
 *
 * An iPhone has no fullscreen to offer, and this page is where the screen
 * matters most, so it gets the controller's notice — asked once per device, the
 * same dismissal the controller remembers — and the log line opens it again.
 * The notice is React and loads only here, so no other browser downloads it.
 *
 * The capability itself, the browser differences and the two remembered choices
 * are FOSS Earth's; this is the flight page's own wording and composition.
 */
export function offerFullscreen(log: GameLog): () => void {
  if (isStandaloneDisplay()) return () => {};
  if (!canRequestFullscreen()) {
    if (!prefersHomeScreenInstall()) return () => {};
    let destroyed = false;
    const notice = import("./createFullscreenNotice")
      .then(({ createFullscreenNotice }) => destroyed ? null : createFullscreenNotice(document.body))
      // Without its chunk the log line below still says what to do.
      .catch(() => null);
    log.print({
      text: "To hide the browser bars, add OSFS to your Home Screen (Share → Add to Home Screen).",
      actions: [{ label: "Why?", onClick: () => { void notice.then(current => current?.open()); } }],
    });
    return () => {
      destroyed = true;
      void notice.then(current => current?.destroy());
    };
  }

  let everyVisit = readFullscreenEveryVisit();
  let armed = false;
  const line = log.print({ text: "" });
  const enter = (): void => {
    void enterFullscreen().catch(() => {
      log.print({ text: "The browser declined fullscreen. Try ⛶ in the toolbar.", tone: "warning" });
    });
  };
  const onGesture = (event: Event): void => {
    if (event instanceof KeyboardEvent && event.key === "Escape") return;
    // The log's own buttons make their own choice.
    if (event.target instanceof Node && log.element.contains(event.target)) return;
    disarm();
    if (!isFullscreen()) enter();
    render();
  };
  const arm = (): void => {
    armed = true;
    window.addEventListener("pointerup", onGesture, true);
    window.addEventListener("keydown", onGesture, true);
  };
  const disarm = (): void => {
    armed = false;
    window.removeEventListener("pointerup", onGesture, true);
    window.removeEventListener("keydown", onGesture, true);
  };
  function render(): void {
    const everyVisitToggle = {
      label: "Every visit",
      pressed: everyVisit,
      onClick: () => {
        everyVisit = !everyVisit;
        writeFullscreenEveryVisit(everyVisit);
        if (!everyVisit) disarm();
        render();
      },
    };
    if (isFullscreen()) {
      line.update({ text: "Fullscreen. Use ⛶ in the toolbar or Esc to leave.", tone: "success", actions: [everyVisitToggle] });
    } else if (armed) {
      line.update({ text: "Fullscreen starts with your first tap or key press.", actions: [everyVisitToggle] });
    } else {
      line.update({ text: "Hide the browser bars for a bigger view.", actions: [{ label: "Fullscreen", onClick: enter }, everyVisitToggle] });
    }
  }

  if (everyVisit) arm();
  const detach = onFullscreenChange(render);
  render();
  return () => { disarm(); detach(); };
}
