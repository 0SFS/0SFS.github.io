import { spawn } from "node:child_process";
import { access } from "node:fs/promises";

/** Bounded headless Chrome control through inherited pipes; no HTTP server/listener. */
export async function openHeadlessChrome(profileDirectory, explicitBinary = process.env.CHROME_BIN) {
  const candidates = explicitBinary ? [explicitBinary] : [
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/usr/bin/google-chrome", "/usr/bin/chromium",
  ];
  let executable;
  for (const candidate of candidates) {
    try { await access(candidate); executable = candidate; break; } catch { /* Try the next installed binary. */ }
  }
  if (!executable) throw new Error("No installed Chrome found; set CHROME_BIN to an existing executable.");
  const child = spawn(executable, [
    "--headless=new", "--remote-debugging-pipe", "--no-first-run", "--no-default-browser-check",
    "--disable-background-networking", "--disable-component-update", "--disable-extensions",
    "--disable-sync", "--mute-audio", "--user-data-dir=" + profileDirectory, "about:blank",
  ], { stdio: ["ignore", "ignore", "pipe", "pipe", "pipe"] });
  const pending = new Map();
  const listeners = new Set();
  let nextId = 1, buffer = "", stderr = "", closed = false;
  child.stderr.on("data", bytes => { stderr = (stderr + bytes).slice(-16000); });
  const rejectAll = error => {
    for (const item of pending.values()) { clearTimeout(item.timer); item.reject(error); }
    pending.clear();
  };
  child.on("error", rejectAll);
  child.on("exit", code => {
    closed = true;
    rejectAll(new Error("Headless Chrome exited (" + code + "): " + stderr));
  });
  child.stdio[4].on("data", bytes => {
    buffer += bytes.toString();
    let separator;
    while ((separator = buffer.indexOf("\0")) >= 0) {
      const message = JSON.parse(buffer.slice(0, separator));
      buffer = buffer.slice(separator + 1);
      if (message.id) {
        const item = pending.get(message.id);
        if (!item) continue;
        pending.delete(message.id); clearTimeout(item.timer);
        if (message.error) item.reject(new Error(message.error.message));
        else item.resolve(message.result);
      } else for (const listener of listeners) listener(message);
    }
  });
  const send = (method, params = {}, sessionId) => new Promise((resolve, reject) => {
    if (closed) { reject(new Error("Headless Chrome is closed")); return; }
    const id = nextId++;
    const timer = setTimeout(() => {
      pending.delete(id);
      reject(new Error("Timed out waiting for Chrome " + method));
    }, 15000);
    pending.set(id, { resolve, reject, timer });
    child.stdio[3].write(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }) + "\0");
  });
  try { await send("Browser.getVersion"); } catch (error) { child.kill(); throw error; }
  return {
    send,
    onEvent(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    async close() {
      if (closed) return;
      try { await send("Browser.close"); } catch { /* Chrome may close its pipe first. */ }
      if (!closed) child.kill();
    },
  };
}

export async function evaluate(chrome, sessionId, expression) {
  const result = await chrome.send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true }, sessionId);
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description ?? result.exceptionDetails.text);
  return result.result.value;
}

export async function waitForExpression(chrome, sessionId, expression, timeoutMs = 10000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await evaluate(chrome, sessionId, expression)) return;
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error("Headless condition did not become true: " + expression);
}
