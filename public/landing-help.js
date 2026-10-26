// Share the simulator's explanation behavior without loading its renderer or UI shell.
import { createHelpTooltip } from "./landing-help-core.js";

// Escape also returns focus when the reader has tabbed into a credit link.
document.addEventListener("keydown", (event) => {
  if (event.key !== "Escape") return;
  const button = document.querySelector('.info-page__help-button[aria-expanded="true"]');
  const content = button && document.getElementById(button.getAttribute("aria-controls"));
  if (content?.contains(document.activeElement)) button.focus({ preventScroll: true });
}, true);

for (const placeholder of document.querySelectorAll("button[data-help]")) {
  const id = placeholder.dataset.help;
  const content = document.getElementById(id);
  const help = createHelpTooltip({ label: placeholder.getAttribute("aria-label"), content });
  // Keep stable IDs for capture/review links and the surrounding static markup.
  content.id = id;
  help.button.setAttribute("aria-controls", id);
  help.button.className = placeholder.className;
  help.button.dataset.help = id;
  placeholder.replaceWith(help.element);
}
