import { trackViewportInsets } from "foss-earth/shell";
import { appRouteFrom, canonicalAppLocation, FOSS_EARTH_URL, type AppRoute } from "./appRoute";
import { offerFullscreen } from "./fullscreen/fullscreen";
import { createFlightLoadingScreen, type FlightLoadingScreen } from "./loading/createFlightLoadingScreen";
import { createGameLog, type GameLog } from "./log/createGameLog";

function appRoute(): AppRoute {
  return appRouteFrom(new URL(window.location.href));
}

function canonicalizeLocation(): void {
  const here = new URL(window.location.href);
  if (appRouteFrom(here) === "globe") {
    window.location.replace(FOSS_EARTH_URL);
    return;
  }
  const next = canonicalAppLocation(here);
  if (next) window.history.replaceState(window.history.state, "", next);
}

function isFlightMode(): boolean {
  return appRoute() === "flight";
}

function clearBootShell(): void {
  document.getElementById("app-log")?.remove();
  document.getElementById("info-first-paint")?.remove();
}

async function bootApp(rootElement: HTMLElement, loading: FlightLoadingScreen | null, log: GameLog | null): Promise<void> {
  const route = appRoute();

  if (route === "remote") {
    const { createPhoneControllerApp } = await import("./remote/createPhoneControllerApp");
    await createPhoneControllerApp(rootElement);
    clearBootShell();
    return;
  }

  if (route === "flight") {
    const { createFlightSimApp } = await import("./flight/createFlightSimApp");
    loading?.setPhase("app", { state: "ready" });
    await createFlightSimApp(rootElement, { loadingScreen: loading ?? undefined, log: log ?? undefined });
    document.getElementById("info-first-paint")?.remove();
    return;
  }

  if (route === "globe") {
    window.location.replace(FOSS_EARTH_URL);
    return;
  }

  const { createInfoPage } = await import("./info/createInfoPage");
  clearBootShell();
  createInfoPage(rootElement);
}

const rootElement = document.getElementById("root");

if (!rootElement) {
  throw new Error('Expected to find a root element with id "root".');
}

canonicalizeLocation();

// Lift the fixed HUD clear of any browser toolbar overlaying the page bottom
// (Firefox Android's URL bar, Chrome's dynamic toolbar).
trackViewportInsets();

const log = isFlightMode() ? createGameLog() : null;
const loading = log ? createFlightLoadingScreen(log) : null;
loading?.setPhase("app", { state: "loading", detail: "Downloading application code" });
if (log) offerFullscreen(log);

void bootApp(rootElement, loading, log).catch((error: unknown) => {
  console.error("Failed to bootstrap application.", error);
  if (loading) {
    loading.fail("The application could not initialize. Check your connection and reload to try again.");
    return;
  }
  clearBootShell();
  rootElement.innerHTML = '<div class="boot-error">Failed to initialize the application.</div>';
});
