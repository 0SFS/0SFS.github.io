(() => {
"use strict";
const SETTINGS_STORAGE_KEY = "foss-earth.settings.v1";
const URL_PARAMETER_PREFIX = "set.";
const RECOVERY_QUERY = "resetBrowserData";
const BOOT_TERMINAL_GLOBAL = "__fossEarthBoot";
const HOOK = "__fossEarthIsolation";
const ATTEMPT_KEY = "foss-earth.isolation.v1";
const REFUSED_KEY = "foss-earth.isolation-refused.v1";
const REFUSED_FOR_MS = 7 * 24 * 3600 * 1000;
const WAIT_MS = 4000;
const RELOAD_WAIT_MS = 10_000;
const START_CAP_MS = 20_000;
const POLL_MS = 50;
const LOADED_CHANNEL = "foss-earth.isolation";
const ISOLATION_SETTING = "app.isolation";
const KEEP_FILES_SETTING = "app.keepFiles";
function isolationWorkerAddress(worker, keep, isolate) {
    return `${worker}?keep=${keep ? 1 : 0}&isolate=${isolate ? 1 : 0}`;
}
function savedSwitch(view, id, fallback) {
    try {
        const raw = new URL(view.location.href).searchParams.get(URL_PARAMETER_PREFIX + id)?.toLowerCase();
        if (raw === "1" || raw === "true" || raw === "on" || raw === "yes")
            return true;
        if (raw === "0" || raw === "false" || raw === "off" || raw === "no")
            return false;
    }
    catch {
    }
    try {
        const record = JSON.parse(view.localStorage.getItem(SETTINGS_STORAGE_KEY) ?? "null");
        const value = record?.version === 1 ? record.values?.[id] : undefined;
        if (typeof value === "boolean")
            return value;
    }
    catch {
    }
    return fallback;
}
function framed(view) {
    try {
        return view.top !== view;
    }
    catch {
        return true;
    }
}
function bootStep(view, text) {
    try {
        view[BOOT_TERMINAL_GLOBAL]?.step?.("isolation", text);
    }
    catch {
    }
}
function refused(view) {
    try {
        const record = JSON.parse(view.localStorage.getItem(REFUSED_KEY) ?? "null");
        return record?.userAgent === view.navigator.userAgent && typeof record.at === "number" && Date.now() - record.at < REFUSED_FOR_MS;
    }
    catch {
        return false;
    }
}
function remember(view, key, value, storage) {
    try {
        if (value === null)
            view[storage].removeItem(key);
        else
            view[storage].setItem(key, value);
    }
    catch {
    }
}
function nextChange(view, registration, ms) {
    return new Promise(resolve => {
        const workers = [registration.installing, registration.waiting, registration.active].filter((worker) => worker !== null);
        const done = () => {
            view.clearTimeout(timer);
            registration.removeEventListener("updatefound", done);
            for (const worker of workers)
                worker.removeEventListener("statechange", done);
            resolve();
        };
        const timer = view.setTimeout(done, ms);
        registration.addEventListener("updatefound", done);
        for (const worker of workers)
            worker.addEventListener("statechange", done);
    });
}
async function change(view, container, options, address, remove, waitMs) {
    const ours = (url) => {
        try {
            return Boolean(url) && new URL(url).pathname === new URL(address).pathname && new URL(url).origin === new URL(address).origin;
        }
        catch {
            return false;
        }
    };
    if (remove) {
        const registration = await container.getRegistration(options.scope);
        const script = registration?.active ?? registration?.waiting ?? registration?.installing;
        if (registration && ours(script?.scriptURL))
            await registration.unregister();
        return null;
    }
    const registration = await container.register(address, { scope: options.scope, updateViaCache: "none" });
    const deadline = Date.now() + waitMs;
    while (Date.now() < deadline) {
        const pending = registration.installing ?? registration.waiting;
        if (registration.active?.scriptURL === address && (!pending || pending.scriptURL !== address))
            return null;
        if (pending?.state === "redundant")
            return "The app's worker failed to install.";
        await nextChange(view, registration, POLL_MS);
    }
    return `The app's worker did not take over within ${Math.round(waitMs / 1000)} s.`;
}
function installIsolation(document, options) {
    const view = document.defaultView;
    if (!view)
        return null;
    const isolated = view.crossOriginIsolated === true;
    const wanted = savedSwitch(view, ISOLATION_SETTING, true);
    const keep = options.keep !== false && savedSwitch(view, KEEP_FILES_SETTING, true);
    let worker = isolationWorkerAddress(options.worker, keep, wanted);
    try {
        worker = new URL(worker, view.location.href).href;
    }
    catch { }
    let attempt = null;
    let sessionReadable = true;
    try {
        attempt = view.sessionStorage.getItem(ATTEMPT_KEY);
    }
    catch {
        sessionReadable = false;
    }
    const status = { state: "off", reason: null, mode: options.mode, wanted, worker, crossOriginIsolated: isolated, reloaded: attempt !== null, ready: Promise.resolve() };
    view[HOOK] = status;
    let channel = null;
    try {
        channel = new view.BroadcastChannel(LOADED_CHANNEL);
        channel.postMessage("loaded");
    }
    catch {
        channel = null;
    }
    const settle = (state, reason) => {
        status.state = state;
        status.reason = reason;
        if (state !== "pending") {
            channel?.close();
            channel = null;
        }
        return status;
    };
    if (options.mode === "report-only") {
        return settle("report-only", wanted ? "This release's worker only reports what isolation would block." : "Off in Settings → App files.");
    }
    if (isolated === wanted) {
        remember(view, ATTEMPT_KEY, null, "sessionStorage");
        return wanted ? settle("isolated", null) : settle("off", "Off in Settings → App files.");
    }
    const direction = wanted ? "isolate" : "release";
    let recovery = false;
    try {
        recovery = new URL(view.location.href).searchParams.get(RECOVERY_QUERY) === "1";
    }
    catch { }
    if (recovery)
        return settle("unavailable", "The browser-data review page is not isolated.");
    if (framed(view))
        return settle("unavailable", wanted ? "The page is inside a frame, which only an isolated page that allows it can isolate." : "The page is inside a frame.");
    if (!view.isSecureContext)
        return settle("unavailable", "Only a secure page (HTTPS or localhost) can be isolated, and this one is not: open it over HTTPS.");
    const container = "serviceWorker" in view.navigator ? view.navigator.serviceWorker : null;
    if (!container)
        return settle("unavailable", "This browser gives this page no service worker, which a private window can turn off; without one nothing can isolate it.");
    const controlled = () => container.controller?.scriptURL === worker;
    if (attempt === direction) {
        if (wanted && controlled())
            remember(view, REFUSED_KEY, JSON.stringify({ userAgent: view.navigator.userAgent, at: Date.now() }), "localStorage");
        return settle("unavailable", wanted ? `A reload did not isolate the page${controlled() ? " although the app's worker answered it" : ": the app's worker did not answer it, as after a Shift-reload"}; this tab does not try again.` : "A reload did not end the page's isolation; this tab does not try again.");
    }
    if (wanted && refused(view))
        return settle("unavailable", "This browser did not isolate the page when the app's worker answered it; it is asked again after a week, or a browser update.");
    if (!sessionReadable)
        return settle("unavailable", "Browser storage could not hold the reload's once-only flag, so the page does not reload to isolate itself.");
    try {
        view.sessionStorage.setItem(ATTEMPT_KEY, direction);
    }
    catch {
        return settle("unavailable", "Browser storage could not hold the reload's once-only flag, so the page does not reload to isolate itself.");
    }
    settle("pending", wanted ? "Waiting for the app's worker, then reloading once to isolate the page." : "Waiting for the app's worker, then reloading once to end the page's isolation.");
    if (channel)
        channel.onmessage = () => { };
    status.ready = new Promise(resolve => {
        const waitMs = typeof options.waitMs === "number" && options.waitMs >= 0 ? options.waitMs : WAIT_MS;
        let released = false, reloads = 0;
        let reloadTimer;
        const release = (reason) => { if (released)
            return; released = true; view.clearTimeout(timer); view.clearTimeout(reloadTimer); settle("unavailable", reason); resolve(); };
        const timer = view.setTimeout(() => release(`The app's worker did not take over within ${Math.round(waitMs / 1000)} s.`), waitMs);
        const reload = () => {
            reloads += 1;
            view.clearTimeout(reloadTimer);
            reloadTimer = view.setTimeout(() => release("The page did not reload."), RELOAD_WAIT_MS);
            const address = view.location.href;
            if (address.includes("#"))
                view.location.reload();
            else
                view.location.replace(address);
        };
        view.addEventListener("pageshow", event => {
            if (!event.persisted || released || reloads === 0)
                return;
            if (reloads > 1) {
                release("The browser showed this page again from its back/forward cache instead of reloading it.");
                return;
            }
            remember(view, ATTEMPT_KEY, direction, "sessionStorage");
            console.info("Reloading again: the browser showed this page from its back/forward cache instead of reloading it. (Settings → App files → Cross-origin isolation)");
            view.setTimeout(reload, 0);
        });
        change(view, container, options, worker, !wanted && !keep, waitMs).then(failure => {
            if (released)
                return;
            if (failure) {
                release(failure);
                return;
            }
            view.clearTimeout(timer);
            status.reason = wanted ? "Reloading once, so the app's worker isolates the page." : "Reloading once to end the page's isolation.";
            bootStep(view, wanted ? "Reloading once, so the app's worker can isolate the page for shared memory" : "Reloading once to end the page's isolation");
            console.info(`${status.reason} (Settings → App files → Cross-origin isolation)`);
            reload();
        }, (error) => release(`The app's worker could not be registered: ${error instanceof Error ? error.message : String(error)}`));
    });
    return status;
}
async function prepareIsolation(document, options) {
    const view = document.defaultView;
    if (!view || options.mode !== "enforce" || view.crossOriginIsolated === true || !view.isSecureContext || framed(view))
        return null;
    if (!savedSwitch(view, ISOLATION_SETTING, true) || refused(view))
        return null;
    const container = "serviceWorker" in view.navigator ? view.navigator.serviceWorker : null;
    if (!container)
        return null;
    const keep = options.keep !== false && savedSwitch(view, KEEP_FILES_SETTING, true);
    try {
        const worker = new URL(isolationWorkerAddress(options.worker, keep, true), view.location.href).href;
        const registration = await container.getRegistration(options.scope);
        if ((registration?.installing ?? registration?.waiting ?? registration?.active)?.scriptURL === worker)
            return worker;
        await container.register(worker, { scope: options.scope, updateViaCache: "none" });
        return worker;
    }
    catch {
        return null;
    }
}
function isolationStatus(view) {
    const status = view[HOOK];
    return status && typeof status === "object" ? status : null;
}
function whenIsolationSettled(view, capMs = START_CAP_MS) {
    const ready = isolationStatus(view)?.ready;
    if (!ready)
        return Promise.resolve();
    return Promise.race([ready, new Promise(resolve => { view.setTimeout(resolve, capMs); })]);
}
function describeIsolation(view) {
    const status = isolationStatus(view);
    const isolated = view.crossOriginIsolated === true;
    if (!status)
        return `${isolated ? "isolated" : "not isolated"} (crossOriginIsolated ${isolated}); no isolation script in this page, as in a development build, where the server's headers decide.`;
    const parts = [`${status.state} (crossOriginIsolated ${isolated}, ${status.mode}, setting ${status.wanted ? "on" : "off"}${status.reloaded ? ", after one reload" : ""})`];
    if (status.reason)
        parts.push(status.reason);
    parts.push(`worker ${status.worker}`);
    return parts.join("; ");
}

void prepareIsolation(document, {"worker":"/foss-earth-sw.js","scope":"/","mode":"enforce","keep":false});
})();
