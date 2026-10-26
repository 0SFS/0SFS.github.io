import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { runInNewContext } from "node:vm";

// Run the deploy's control flow with every command and filesystem operation
// stubbed. No test can build, fetch, commit, push, or change a real worktree.
const source = readFileSync(new URL("./deploy.mjs", import.meta.url), "utf8")
  .replace(/^import .*;\n/gm, "")
  .replaceAll("import.meta.url", "scriptUrl")
  .replace(/await import\([^\n]+\)/g, "await loadBuildInputs()");
const COMMIT = "0123456789abcdef";
const FILES = ["index.html", "landing.css", "robots.txt"];

async function deploy({
  args = [], flight = {}, siteStatus = "", landingStatus = "", previousDirty = false,
  rebuild = true, flightInputsAvailable = true, checkFails = false, calls = [], answer = "yes", tty = true, stdoutTTY = true, promptEvent,
} = {}) {
  const warnings = [];
  const writes = new Map();
  const published = { commit: COMMIT, dirty: previousDirty, files: FILES };
  const exit = Symbol("exit");
  let exited = false;
  const context = {
    scriptUrl: "file:///deploy-fixture/site/scripts/deploy.mjs",
    URL,
    fileURLToPath,
    AbortController,
    process: {
      argv: ["node", "deploy.mjs", ...args], stdin: { isTTY: tty }, stdout: { isTTY: stdoutTTY },
      exit: (code) => { assert.equal(code, 0); throw exit; },
    },
    console: { log() {}, warn: (message) => { warnings.push(message); calls.push({ warning: message }); } },
    createInterface({ input, output }) {
      assert.equal(input, context.process.stdin);
      assert.equal(output, context.process.stdout);
      calls.push({ createInterface: true });
      const rl = new EventEmitter();
      rl.close = () => {
        if (rl.closed) return;
        rl.closed = true;
        calls.push({ closeInterface: true });
        rl.emit("close");
      };
      rl.question = async (question, { signal }) => {
        calls.push({ question });
        if (promptEvent === "closed") {
          rl.close();
          throw Object.assign(new Error("readline closed"), { code: "ERR_USE_AFTER_CLOSE" });
        }
        if (!promptEvent) return answer;
        return new Promise((resolve, reject) => {
          const abort = () => reject(Object.assign(new Error("prompt aborted"), { name: "AbortError" }));
          if (signal.aborted) return abort();
          signal.addEventListener("abort", abort, { once: true });
          queueMicrotask(() => promptEvent === "close" ? rl.close() : rl.emit(promptEvent));
        });
      };
      return rl;
    },
    execFileSync(command, args, { cwd }) {
      args = Array.from(args);
      calls.push({ command, args, cwd });
      if (command === "npm" && args[0] === "run" && ["build", "check"].includes(args[1])) {
        if (args[1] === "check" && checkFails) throw new Error("site check failed");
        return "";
      }
      assert.equal(command, "git", `Unexpected command: ${command}`);
      if (args[0] === "show") return args[1].endsWith(".landing.json") ? JSON.stringify(published) : "published flight";
      if (args[0] === "status") {
        if (cwd.endsWith("build/gh-pages")) return " M index.html";
        return args.includes("--") ? landingStatus : siteStatus;
      }
      if (args[0] === "rev-parse") return COMMIT;
      if (["fetch", "diff", "worktree", "add", "commit", "push"].includes(args[0])) return "";
      assert.fail(`Unexpected git operation: ${args.join(" ")}`);
    },
    existsSync: () => false,
    readFile: async () => JSON.stringify(published),
    readdir: async () => { calls.push({ readdir: true }); return [".git"]; },
    rm: async () => {},
    cp: async () => { calls.push({ copy: true }); },
    writeFile: async (file, text) => { calls.push({ writeFile: file }); writes.set(file, text); },
    landingFiles: async () => FILES.map((name) => [name, name]),
    buildSite: async (options) => {
      calls.push({ buildSite: options });
      return { out: "/deploy-fixture/site/dist", flight: { commit: COMMIT, dirty: false, unpushed: false, ...flight }, landing: FILES };
    },
    loadBuildInputs: async () => {
      calls.push({ loadBuildInputs: true });
      if (!flightInputsAvailable) throw new Error("No local flight build dependencies");
      return { recordBuildInputs: () => ({}), rebuildReason: () => rebuild ? "local inputs changed" : null };
    },
  };
  try {
    await runInNewContext(`(async () => {\n${source}\n})()`, context, { filename: "deploy.mjs" });
  } catch (error) {
    if (error !== exit) throw error;
    exited = true;
  }
  const record = [...writes].find(([file]) => file.endsWith("/.landing.json"))?.[1];
  return { calls, warnings, exited, record: record && JSON.parse(record) };
}

function checkedAndPushed({ calls }) {
  const check = calls.findIndex(({ command, args }) => command === "npm" && args[1] === "check");
  const push = calls.findIndex(({ command, args }) => command === "git" && args[0] === "push");
  assert.ok(check >= 0, "runs the site check");
  assert.ok(push > check, "continues to the stubbed push after checking");
}

function promptedOnce({ calls }) {
  const questions = calls.filter((call) => call.question);
  assert.equal(questions.length, 1);
  assert.match(questions[0].question, /\[y\/N\]/);
  const check = calls.findIndex(({ command, args }) => command === "npm" && args[1] === "check");
  const prompt = calls.findIndex((call) => call.question);
  const copy = calls.findIndex((call) => call.copy);
  assert.ok(prompt > check, "asks after checking the build");
  assert.ok(copy === -1 || copy > prompt, "asks before replacing deployment files");
  assert.equal(calls.filter((call) => call.closeInterface).length, 1);
}

function cancelled({ calls, exited, record }) {
  assert.equal(exited, true);
  assert.equal(record, undefined);
  assert.ok(calls.some(({ command, args }) => command === "git" && args[0] === "worktree" && args[1] === "remove" && args.includes("--force")));
  assert.equal(calls.some((call) => call.readdir || call.copy || call.writeFile), false);
  assert.equal(calls.some(({ command, args }) => command === "git" && ["add", "commit", "push"].includes(args[0])), false);
}

describe("deploy", () => {
  for (const args of [[], ["--force"], ["landing"], ["landing", "--force"]]) {
    it(`publishes only the landing page for ${JSON.stringify(args)}, preserving a dirty published flight`, async () => {
      const result = await deploy({ args, previousDirty: true, flightInputsAvailable: false, flight: { dirty: true, unpushed: true } });
      checkedAndPushed(result);
      assert.equal(result.calls.some((call) => call.loadBuildInputs), false);
      assert.equal(result.calls.some(({ command, args }) => command === "npm" && args[1] === "build"), false);
      const options = result.calls.find((call) => call.buildSite)?.buildSite;
      assert.equal(options.fly, "/deploy-fixture/site/build/gh-pages");
      assert.equal(options.landing, undefined);
      assert.deepEqual(result.warnings, []);
      assert.equal(result.calls.some((call) => call.createInterface), false);
    });
  }

  it("publishes both parts only when all is explicitly selected", async () => {
    const result = await deploy({ args: ["all"], previousDirty: true });
    checkedAndPushed(result);
    assert.ok(result.calls.some((call) => call.loadBuildInputs));
    assert.ok(result.calls.some(({ command, args }) => command === "npm" && args[1] === "build"));
    const options = result.calls.find((call) => call.buildSite)?.buildSite;
    assert.equal(options.fly, undefined);
    assert.equal(options.landing, undefined);
  });

  it("ignores local landing page changes when publishing only the flight", async () => {
    const result = await deploy({ args: ["flight"], siteStatus: " M landing.css", landingStatus: " M landing.css" });
    checkedAndPushed(result);
    assert.deepEqual(result.warnings, []);
    assert.equal(result.record.dirty, false);
    const options = result.calls.find((call) => call.buildSite)?.buildSite;
    assert.equal(options.fly, undefined);
    assert.deepEqual(Array.from(options.landing, ([from, to]) => [from, to]), FILES.map((name) => [`/deploy-fixture/site/build/gh-pages/${name}`, name]));
  });

  for (const [flight, changes] of [
    [{ dirty: true }, "uncommitted"],
    [{ unpushed: true }, "unpushed"],
    [{ dirty: true, unpushed: true }, "uncommitted and unpushed"],
  ]) {
    it(`warns and continues for a flight with ${changes} changes`, async () => {
      const result = await deploy({ args: ["flight"], flight });
      assert.equal(result.warnings.length, 1);
      assert.match(result.warnings[0], new RegExp(`with ${changes} changes`));
      promptedOnce(result);
      checkedAndPushed(result);
    });
  }

  for (const landingStatus of [" M landing.css", "?? public/new.txt"]) {
    it(`publishes local landing changes (${landingStatus.trim()}) even at the published commit`, async () => {
      const result = await deploy({ args: ["landing"], siteStatus: landingStatus, landingStatus });
      assert.match(result.warnings[0], /uncommitted changes/);
      promptedOnce(result);
      checkedAndPushed(result);
      assert.equal(result.record.dirty, true);
      assert.equal(result.calls.some(({ command, args }) => command === "git" && args[0] === "diff"), false);
    });
  }

  it("replaces a previously dirty landing page with the clean commit's files", async () => {
    const result = await deploy({ args: ["landing"], previousDirty: true });
    checkedAndPushed(result);
    assert.equal(result.record.dirty, false);
    assert.equal(result.record.commit, COMMIT);
    assert.equal(result.calls.some((call) => call.createInterface), false);
  });

  it("preserves the landing page's dirty record when publishing only the flight", async () => {
    const result = await deploy({ args: ["flight"], previousDirty: true });
    checkedAndPushed(result);
    assert.equal(result.record.dirty, true);
    assert.equal(result.record.commit, COMMIT);
    assert.ok(result.calls.find((call) => call.buildSite)?.buildSite.landing);
  });

  it("exits without building or publishing when both parts are clean and unchanged", async () => {
    const result = await deploy({ args: ["all"], rebuild: false });
    assert.equal(result.exited, true);
    assert.equal(result.record, undefined);
    assert.equal(result.calls.some((call) => call.buildSite || call.command === "npm"), false);
    assert.equal(result.calls.some(({ command, args }) => command === "git" && ["worktree", "push"].includes(args[0])), false);
    assert.equal(result.calls.some((call) => call.createInterface), false);
  });

  it("still refuses a flight without its source commit", async () => {
    const calls = [];
    await assert.rejects(deploy({ args: ["flight"], flight: { commit: null }, calls }), /does not say which fly commit/);
    assert.equal(calls.some(({ command, args }) => command === "npm" && args[1] === "check"), false);
    assert.equal(calls.some(({ command, args }) => command === "git" && args[0] === "push"), false);
    assert.equal(calls.some((call) => call.createInterface), false);
  });

  it("still stops before pushing when the site check fails", async () => {
    const calls = [];
    await assert.rejects(deploy({ args: ["flight"], flight: { dirty: true }, checkFails: true, calls }), /site check failed/);
    assert.equal(calls.some(({ command, args }) => command === "git" && args[0] === "push"), false);
    assert.equal(calls.some((call) => call.createInterface), false);
  });

  for (const answer of ["y", " YES "]) {
    it(`publishes after explicit confirmation (${JSON.stringify(answer)})`, async () => {
      const result = await deploy({ args: ["all", "--force"], flight: { dirty: true }, siteStatus: " M landing.css", answer });
      assert.equal(result.warnings.length, 2);
      promptedOnce(result);
      checkedAndPushed(result);
    });
  }

  for (const answer of ["n", "", "sure"]) {
    it(`cancels and cleans the landing worktree for ${JSON.stringify(answer)}`, async () => {
      const result = await deploy({ args: ["landing", "--force"], siteStatus: " M landing.css", landingStatus: " M landing.css", answer });
      promptedOnce(result);
      cancelled(result);
    });
  }

  for (const promptEvent of ["close", "SIGINT", "closed"]) {
    it(`cancels and cleans up when the prompt receives ${promptEvent}`, async () => {
      const result = await deploy({ args: ["flight"], flight: { dirty: true }, promptEvent });
      promptedOnce(result);
      cancelled(result);
    });
  }

  for (const [stream, options] of [["stdin", { tty: false }], ["stdout", { stdoutTTY: false }]]) {
    it(`cancels without opening readline when ${stream} is not a TTY`, async () => {
      const result = await deploy({ args: ["flight"], flight: { dirty: true }, ...options });
      cancelled(result);
      assert.equal(result.calls.some((call) => call.createInterface), false);
      assert.ok(result.warnings.some((warning) => /terminal|interactive|TTY/i.test(warning)));
    });
  }
});
