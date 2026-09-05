function isFlightMode(): boolean {
  const params = new URLSearchParams(window.location.search);
  return params.get("mode") === "flight";
}

async function bootApp(rootElement: HTMLElement): Promise<void> {
  if (isFlightMode()) {
    const { createFlightSimApp } = await import("./flight/createFlightSimApp");
    await createFlightSimApp(rootElement);
    return;
  }

  const { createGlobeApp } = await import("foss-earth");
  await createGlobeApp(rootElement);
}

const rootElement = document.getElementById("root");

if (!rootElement) {
  throw new Error('Expected to find a root element with id "root".');
}

void bootApp(rootElement).catch((error: unknown) => {
  console.error("Failed to bootstrap application.", error);
  rootElement.innerHTML = '<div class="boot-error">Failed to initialize the application.</div>';
});
