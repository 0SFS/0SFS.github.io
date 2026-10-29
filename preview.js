new Intl.NumberFormat("en-US", { maximumFractionDigits: 3 });
Object.freeze([]);
//#endregion
//#region ../../foss-earth/ui/src/shell/helpTooltip.ts
var helpCount = 0;
var openHelpByDocument = /* @__PURE__ */ new WeakMap();
/**
* A click/keyboard explanation that uses the top layer where available. The
* fallback leaves the panel while open, so clipping never hides its text. A
* caller may move button and content into separate row locations before opening;
* closing restores the content to that exact home without reflowing the panel.
*/
function createHelpTooltip(options) {
	const document = options.content.ownerDocument;
	const window = document.defaultView;
	const element = document.createElement("span");
	element.className = "foss-earth-help-tooltip";
	const button = document.createElement("button");
	button.type = "button";
	button.className = "foss-earth-choice foss-earth-parameter__action foss-earth-parameter__icon-action foss-earth-parameter__help-button";
	button.textContent = "?";
	button.setAttribute("aria-label", options.label);
	button.setAttribute("aria-expanded", "false");
	button.title = options.label;
	const content = options.content;
	content.classList.add("foss-earth-parameter__help");
	content.id = `foss-earth-parameter-help-${++helpCount}`;
	content.setAttribute("role", "tooltip");
	content.hidden = true;
	const nativePopover = typeof content.showPopover === "function" && typeof content.hidePopover === "function";
	if (nativePopover) content.setAttribute("popover", "manual");
	button.setAttribute("aria-controls", content.id);
	element.append(button, content);
	let home = null;
	let destroyed = false;
	let opened = false;
	const position = () => {
		if (!opened || !window) return;
		const anchor = button.getBoundingClientRect();
		const viewport = window.visualViewport;
		const left = viewport?.offsetLeft ?? 0;
		const top = viewport?.offsetTop ?? 0;
		const width = viewport?.width ?? window.innerWidth;
		const height = viewport?.height ?? window.innerHeight;
		content.style.maxWidth = `${Math.max(0, width - 16)}px`;
		content.style.maxHeight = `${Math.max(0, height - 16)}px`;
		const box = content.getBoundingClientRect();
		content.style.left = `${Math.max(left + 8, Math.min(anchor.left, left + width - box.width - 8))}px`;
		content.style.top = `${Math.max(top + 8, Math.min(anchor.bottom + 6, top + height - box.height - 8))}px`;
	};
	const close = () => {
		if (!opened) return;
		opened = false;
		if (nativePopover && content.isConnected && content.matches(":popover-open")) content.hidePopover();
		content.hidden = true;
		if (home?.parentNode) home.after(content);
		home?.remove();
		home = null;
		button.setAttribute("aria-expanded", "false");
		button.removeAttribute("aria-describedby");
		document.removeEventListener("pointerdown", onOutside);
		document.removeEventListener("keydown", onKey, true);
		document.removeEventListener("scroll", position, true);
		window?.removeEventListener("resize", position);
		window?.visualViewport?.removeEventListener("resize", position);
		window?.visualViewport?.removeEventListener("scroll", position);
		if (openHelpByDocument.get(document)?.close === close) openHelpByDocument.delete(document);
	};
	const open = () => {
		if (destroyed || opened || !window) return;
		openHelpByDocument.get(document)?.close();
		options.onOpen?.();
		home = document.createComment("help content home");
		content.before(home);
		if (!nativePopover || !content.isConnected) document.body.append(content);
		content.hidden = false;
		if (nativePopover) content.showPopover();
		opened = true;
		button.setAttribute("aria-expanded", "true");
		button.setAttribute("aria-describedby", content.id);
		openHelpByDocument.set(document, {
			close,
			button
		});
		position();
		document.addEventListener("pointerdown", onOutside);
		document.addEventListener("keydown", onKey, true);
		document.addEventListener("scroll", position, true);
		window.addEventListener("resize", position);
		window.visualViewport?.addEventListener("resize", position);
		window.visualViewport?.addEventListener("scroll", position);
	};
	const onHelp = () => {
		if (opened) close();
		else open();
	};
	const onOutside = (event) => {
		const target = event.target;
		if (target?.nodeType && !button.contains(target) && !content.contains(target)) close();
	};
	const onKey = (event) => {
		if (event.key === "Escape") {
			close();
			event.preventDefault();
			event.stopPropagation();
		}
	};
	const onPopoverToggle = () => {
		if (nativePopover && opened && !content.matches(":popover-open")) close();
	};
	button.addEventListener("click", onHelp);
	content.addEventListener("toggle", onPopoverToggle);
	return {
		element,
		button,
		content,
		open,
		close,
		destroy() {
			if (destroyed) return;
			close();
			destroyed = true;
			button.removeEventListener("click", onHelp);
			content.removeEventListener("toggle", onPopoverToggle);
			button.remove();
			content.remove();
			element.remove();
		}
	};
}
//#endregion
//#region ../../foss-earth/ui/src/shell/iconButton.ts
var SVG_NS = "http://www.w3.org/2000/svg";
/** Familiar action marks, drawn in the text colour on a 24 px grid. */
var ICON_PATHS = {
	copy: ["M9 9h10a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H9a1 1 0 0 1-1-1V10a1 1 0 0 1 1-1Z", "M5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1"],
	download: [
		"M12 3v12",
		"m7 10 5 5 5-5",
		"M4 20h16"
	],
	upload: [
		"M12 15V3",
		"m7 8 5-5 5 5",
		"M4 20h16"
	],
	trash: [
		"M4 7h16",
		"M9 7V4h6v3",
		"M6 7l1 13h10l1-13",
		"M10 11v6",
		"M14 11v6"
	],
	reset: ["M3 12a9 9 0 1 0 3-6.7", "M3 4v5h5"],
	refresh: ["M21 12a9 9 0 1 1-3-6.7", "M21 4v5h-5"],
	undo: ["M9 14 4 9l5-5", "M4 9h10a6 6 0 0 1 0 12h-3"],
	redo: ["m15 14 5-5-5-5", "M20 9H10a6 6 0 0 0 0 12h3"],
	pencil: ["M4 20h4L19 9l-4-4L4 16v4Z", "m13.5 6.5 4 4"],
	external: [
		"M11 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-5",
		"M14 4h6v6",
		"M20 4 10 14"
	],
	play: ["M7 4.5v15l12-7.5-12-7.5Z"],
	pause: ["M8 5v14", "M16 5v14"],
	plus: ["M12 5v14", "M5 12h14"],
	close: ["M6 6l12 12", "M18 6 6 18"],
	check: ["m5 12 5 5 9-10"],
	crosshair: [
		"M12 3v4",
		"M12 17v4",
		"M3 12h4",
		"M17 12h4",
		"M12 18a6 6 0 1 0 0-12 6 6 0 0 0 0 12Z"
	],
	target: [
		"M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z",
		"M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z",
		"M12 12h.01"
	],
	clock: ["M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z", "M12 7v5l3 2"],
	gear: ["M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z", "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z"],
	"collapse-all": ["m7 20 5-5 5 5", "m7 4 5 5 5-5"],
	"expand-all": ["m7 15 5 5 5-5", "m7 9 5-5 5 5"]
};
Object.keys(ICON_PATHS);
/** One familiar action mark, hidden from assistive technology: its button carries the name. */
function createActionIcon(document, icon) {
	const svg = document.createElementNS(SVG_NS, "svg");
	svg.setAttribute("class", "foss-earth-action-icon");
	svg.setAttribute("viewBox", "0 0 24 24");
	svg.setAttribute("fill", "none");
	svg.setAttribute("stroke", "currentColor");
	svg.setAttribute("stroke-width", "2");
	svg.setAttribute("stroke-linecap", "round");
	svg.setAttribute("stroke-linejoin", "round");
	svg.setAttribute("aria-hidden", "true");
	svg.setAttribute("focusable", "false");
	for (const d of ICON_PATHS[icon]) {
		const path = document.createElementNS(SVG_NS, "path");
		path.setAttribute("d", d);
		svg.append(path);
	}
	return svg;
}
function createIconButton(document, options) {
	const element = document.createElement(options.tag ?? "button");
	if (options.tag !== "a") element.type = "button";
	element.className = "foss-earth-choice foss-earth-parameter__action foss-earth-parameter__icon-action";
	element.dataset.icon = options.icon;
	setIconButtonLabel(element, options.label);
	element.append(createActionIcon(document, options.icon));
	return element;
}
/** Renames an icon action, as when it changes to a confirmation. */
function setIconButtonLabel(element, label) {
	element.setAttribute("aria-label", label);
	element.title = label;
}
({
	size: 140,
	trackRadius: 46,
	trackWidth: 10,
	knobRadius: 7,
	tickOuter: 39.5,
	tickInner: 37,
	majorTickInner: 34,
	markTickLength: 5,
	labelRadius: 61,
	/** A label's advance for each character at the labels' size, and the room kept either side of it, px. */
	labelCharPx: 5.3,
	labelGapPx: 6,
	labelHitWidth: 18,
	ringRadius: 3.5,
	/** How far inside and outside the track a press still takes the knob. */
	pressSlackPx: 9,
	/** Passes that push overlapping labels apart; a few settle the handful a dial has. */
	labelPasses: 12
}).size / 2;
Object.freeze({
	maxInsetPx: 200,
	maxInsetFraction: .25,
	scaleTolerance: .05
});
Object.freeze({
	x: 0,
	y: 0,
	width: 0,
	height: 0
});
//#endregion
//#region src/index.ts
var styles = `
.osfs-camera-preview{display:flex;flex-wrap:wrap;align-items:center;gap:.4rem;padding:.5rem;border:1px solid var(--foss-border,rgba(128,128,128,.3));border-radius:.65rem;min-width:0;width:100%;box-sizing:border-box}
.osfs-camera-preview__label{flex:1;min-width:5rem;font-size:.85rem}
.osfs-camera-preview__status{font-size:.75rem;opacity:.8}
.osfs-camera-preview__image{display:block;width:100%;height:auto;border-radius:.35rem;background:#080b10}
.osfs-camera-preview__image--interactive{touch-action:none;cursor:grab;user-select:none}
.osfs-camera-preview__image--interactive:active{cursor:grabbing}
.osfs-camera-preview__image--interactive[aria-disabled="true"]{cursor:default}
.osfs-camera-preview__error{width:100%;font-size:.8rem;overflow-wrap:anywhere;margin:0}
`;
/** A browser-only provider. It imports no renderer, aircraft, capture encoder or flight runtime. */
function createCameraPreview(options) {
	const { document } = options;
	const view = document.defaultView;
	if (!view) throw new Error("Camera preview requires a browser window.");
	const element = document.createElement("section");
	element.className = "osfs-camera-preview";
	element.setAttribute("aria-label", "Camera preview component");
	const style = document.createElement("style");
	style.textContent = styles;
	const label = document.createElement("strong");
	label.className = "osfs-camera-preview__label";
	label.textContent = options.label;
	const status = document.createElement("span");
	status.className = "osfs-camera-preview__status";
	status.setAttribute("role", "status");
	status.textContent = "Off";
	const retry = createIconButton(document, {
		icon: "reset",
		label: "Retry camera preview"
	});
	retry.hidden = true;
	const explanation = document.createElement("p");
	explanation.textContent = options.attachInteraction ? "Live view from the selected camera and gimbal. Drag or swipe with two fingers to aim the gimbal, using the same controls as the 360 image viewer. Pinch or use a mouse wheel to zoom this preview; still photos keep the camera's full field of view and resolution. Closing this tab stops preview rendering." : "Live view from the selected camera and gimbal. The preview preserves the sensor's field of view and aspect ratio. Closing this tab stops preview rendering; still photos retain the camera's full capture resolution.";
	const help = createHelpTooltip({
		label: "Explain camera preview",
		content: explanation
	});
	explanation.id = `osfs-camera-preview-help-${view.crypto.randomUUID()}`;
	help.button.setAttribute("aria-controls", explanation.id);
	const canvas = document.createElement("canvas");
	canvas.className = "osfs-camera-preview__image";
	canvas.setAttribute("aria-label", "Camera preview");
	canvas.setAttribute("role", "img");
	canvas.width = 4;
	canvas.height = 3;
	const context = canvas.getContext("2d", { alpha: false });
	if (!context) {
		help.destroy();
		throw new Error("Camera preview display is unavailable.");
	}
	const error = document.createElement("p");
	error.className = "osfs-camera-preview__error";
	error.setAttribute("role", "alert");
	error.hidden = true;
	element.append(style, label, status, retry, help.element, canvas, error);
	let interaction;
	try {
		interaction = options.attachInteraction?.(canvas);
	} catch (cause) {
		help.destroy();
		element.remove();
		throw cause;
	}
	if (interaction) {
		canvas.classList.add("osfs-camera-preview__image--interactive");
		canvas.title = "Drag or two-finger swipe to aim; pinch or mouse wheel to zoom preview.";
	}
	const requestedFps = options.maxFps ?? 15;
	const interval = 1e3 / Math.min(15, Math.max(1, Number.isFinite(requestedFps) ? requestedFps : 15));
	let active = false;
	let destroyed = false;
	let failed = false;
	let reading = false;
	let generation = 0;
	let timer = null;
	const clearTimer = () => {
		if (timer !== null) view.clearTimeout(timer);
		timer = null;
	};
	const schedule = (delay = 0) => {
		if (!active || destroyed || failed || reading || timer !== null) return;
		timer = view.setTimeout(() => {
			timer = null;
			draw();
		}, delay);
	};
	const draw = async () => {
		if (!active || destroyed || failed || reading) return;
		reading = true;
		const token = generation;
		const started = view.performance.now();
		try {
			const frame = await options.readFrame();
			if (destroyed || !active || token !== generation) return;
			if (!Number.isInteger(frame.width) || !Number.isInteger(frame.height) || frame.width <= 0 || frame.height <= 0 || frame.rgba.length !== frame.width * frame.height * 4) throw new Error("Camera preview received an invalid frame.");
			if (canvas.width !== frame.width || canvas.height !== frame.height) {
				canvas.width = frame.width;
				canvas.height = frame.height;
			}
			const image = context.createImageData(frame.width, frame.height);
			image.data.set(frame.rgba);
			context.putImageData(image, 0, 0);
			status.textContent = "Live";
		} catch (cause) {
			if (destroyed || !active || token !== generation) return;
			failed = true;
			status.textContent = "Unavailable";
			error.textContent = cause instanceof Error ? cause.message : String(cause);
			error.hidden = false;
			retry.hidden = false;
		} finally {
			reading = false;
			schedule(token === generation ? Math.max(0, interval - (view.performance.now() - started)) : 0);
		}
	};
	const restart = () => {
		if (destroyed || !active) return;
		generation++;
		failed = false;
		error.hidden = true;
		retry.hidden = true;
		status.textContent = "Loading";
		clearTimer();
		schedule();
	};
	retry.addEventListener("click", restart);
	return {
		element,
		setActive(on) {
			if (destroyed || active === on) return;
			active = on;
			interaction?.setActive(on);
			if (on) restart();
			else {
				generation++;
				clearTimer();
				help.close();
				status.textContent = "Paused";
			}
		},
		destroy() {
			if (destroyed) return;
			destroyed = true;
			active = false;
			generation++;
			clearTimer();
			retry.removeEventListener("click", restart);
			help.destroy();
			try {
				interaction?.destroy();
			} finally {
				canvas.width = canvas.height = 0;
				element.remove();
			}
		}
	};
}
//#endregion
export { createCameraPreview };
