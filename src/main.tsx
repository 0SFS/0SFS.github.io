import { createFlightLoadingScreen, type FlightLoadingScreen } from "./loading/createFlightLoadingScreen";

function isFlightMode(): boolean {
  const params = new URLSearchParams(window.location.search);
  return params.get("mode") === "flight";
}

async function bootApp(rootElement: HTMLElement, loading: FlightLoadingScreen | null): Promise<void> {
  if (new URLSearchParams(window.location.search).get("mode") === "remote") {
    const { createPhoneControllerApp } = await import("./remote/createPhoneControllerApp");
    await createPhoneControllerApp(rootElement);
    document.getElementById("app-loading")?.remove();
    return;
  }

  if (isFlightMode()) {
    const { createFlightSimApp } = await import("./flight/createFlightSimApp");
    loading?.setPhase("app", { state: "ready" });
    await createFlightSimApp(rootElement, { loadingScreen: loading ?? undefined });
    return;
  }

  const { createGlobeModeApp } = await import("./compat/createGlobeModeApp");
  await createGlobeModeApp(rootElement);
  document.getElementById("app-loading")?.remove();
}

const rootElement = document.getElementById("root");

if (!rootElement) {
  throw new Error('Expected to find a root element with id "root".');
}

const loading = isFlightMode() ? createFlightLoadingScreen() : null;
loading?.setPhase("app", { state: "loading", detail: "Downloading application code" });

void bootApp(rootElement, loading).catch((error: unknown) => {
  console.error("Failed to bootstrap application.", error);
  if (loading) {
    loading.fail("The application could not initialize. Check your connection and reload to try again.");
    return;
  }
  document.getElementById("app-loading")?.remove();
  rootElement.innerHTML = '<div class="boot-error">Failed to initialize the application.</div>';
});
