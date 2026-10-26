// Two recorded versions of one flight; only the selected video's sources are live.
import { flightHref } from "./landing-links.js";

const video = document.querySelector(".feature__scenery");
const toggle = document.querySelector(".feature__video-toggle");
const selector = document.querySelector(".feature__map-select");
const credit = document.querySelector(".feature__map-credit");
const helpCredit = document.querySelector("[data-preview-credit]");
const fly = document.querySelector(".info-page__start");
const variants = new Map([...document.querySelectorAll("template[data-preview-map]")]
  .map(template => [template.dataset.previewMap, template]));
const storageKey = "foss-earth.settings.v1";
const setting = "map.source.basemap";
const motion = matchMedia("(prefers-reduced-motion: reduce)");
let wantsPlayback = !motion.matches && !navigator.connection?.saveData;
let inView = true;
let selected = "google";
let seekTo = 0;
let sourcesChanged = false;
let hasLoadedVideo = false;

function savedSettings() {
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey));
    if (saved?.version === 1 && saved.values && typeof saved.values === "object" && !Array.isArray(saved.values)) return saved;
  } catch { /* Storage may be unavailable; this visit's selector still works. */ }
  return { version: 1, values: {} };
}

function showState() {
  const action = video.paused ? "Play" : "Pause";
  toggle.setAttribute("aria-label", action + " flight preview");
  toggle.title = action + " flight preview";
  toggle.firstElementChild.textContent = video.paused ? "▶" : "⏸";
}

function updatePlayback() {
  // load() itself can fetch media even with preload=none. Leave a still,
  // unplayed preview entirely unloaded until the visitor asks it to play.
  if (sourcesChanged && ((wantsPlayback && inView && !document.hidden) || hasLoadedVideo)) {
    sourcesChanged = false;
    video.load();
  }
  if (wantsPlayback && inView && !document.hidden) video.play().catch(showState);
  else video.pause();
  showState();
}

function selectMap(id, persist = false) {
  const template = variants.get(id);
  if (!template) return;
  if (id !== selected) {
    seekTo = video.currentTime;
    video.pause();
    video.poster = template.dataset.poster;
    video.replaceChildren(template.content.cloneNode(true));
    // A paused comparison keeps its frame. An unplayed reduced-motion preview
    // keeps preload=none and changes only the poster until explicitly played.
    video.preload = hasLoadedVideo ? "auto" : "none";
    sourcesChanged = true;
  }
  selected = id;
  selector.value = id;
  video.dataset.basemap = id;
  video.setAttribute("aria-label", `F-35B climbing west over the Mississippi beside UMN at sunset, with ${template.dataset.label}, captured in 0SFS`);
  credit.href = helpCredit.href = template.dataset.credit;
  credit.title = template.dataset.label + " attribution";
  credit.setAttribute("aria-label", template.dataset.label + " attribution, opens in a new tab");
  helpCredit.textContent = template.dataset.label + " ↗";
  // Preserve existing settings and test fragments when entering the simulator.
  fly.href = flightHref(location.href, id);
  if (persist) {
    const saved = savedSettings();
    saved.values[setting] = id;
    try { localStorage.setItem(storageKey, JSON.stringify(saved)); } catch { /* Keep the current choice and Fly link. */ }
  }
  updatePlayback();
}

video.muted = true;
video.addEventListener("loadedmetadata", () => {
  hasLoadedVideo = true;
});
video.addEventListener("loadeddata", () => {
  // Decode the first keyframe before restoring the comparison point.
  const time = seekTo;
  seekTo = 0;
  if (time > 0 && Number.isFinite(video.duration)) video.currentTime = Math.min(time, Math.max(0, video.duration - .01));
});
video.addEventListener("playing", showState);
video.addEventListener("pause", showState);
toggle.addEventListener("click", () => {
  wantsPlayback = video.paused;
  updatePlayback();
});
selector.addEventListener("change", () => selectMap(selector.value, true));
motion.addEventListener("change", () => {
  wantsPlayback = !motion.matches && !navigator.connection?.saveData;
  updatePlayback();
});
document.addEventListener("visibilitychange", updatePlayback);
if ("IntersectionObserver" in window) new IntersectionObserver(entries => {
  inView = entries[0].isIntersecting;
  updatePlayback();
}).observe(video);

const requested = new URLSearchParams(location.search).get("set." + setting);
const saved = savedSettings().values[setting];
selectMap(variants.has(requested) ? requested : variants.has(saved) ? saved : "google");
toggle.hidden = false;
document.querySelector(".feature__map").hidden = false;
