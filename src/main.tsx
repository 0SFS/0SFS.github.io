import "./styles/globe.css";

import { createGlobeApp } from "./app/createGlobeApp";
import { createFlightSimApp } from "./flight/createFlightSimApp";

function isFlightMode(): boolean {
  const params = new URLSearchParams(window.location.search);
  return params.get("mode") === "flight";
}

const rootElement = document.getElementById("root");

if (!rootElement) {
  throw new Error('Expected to find a root element with id "root".');
}

const boot = isFlightMode() ? createFlightSimApp(rootElement) : createGlobeApp(rootElement);

void boot.catch((error: unknown) => {
  console.error("Failed to bootstrap application.", error);
  rootElement.innerHTML = '<div class="boot-error">Failed to initialize the application.</div>';
});
