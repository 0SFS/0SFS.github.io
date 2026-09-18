import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
/** Where Playwright lives when it is installed for these benchmarks: gitignored, beside the code. */
export const PLAYWRIGHT_TOOLS = path.join(root, "build", "tools", "playwright");
const installed = path.join(PLAYWRIGHT_TOOLS, "node_modules", "playwright", "index.mjs");

/**
 * Playwright is not a dependency of this project. The benchmarks that drive a
 * browser with it look, in order, at `PLAYWRIGHT_MODULE`, the copy under
 * `build/tools/playwright/`, then this project's own `node_modules`.
 */
export async function importPlaywright() {
  const moduleName = process.env.PLAYWRIGHT_MODULE ?? (existsSync(installed) ? installed : undefined);
  try {
    return await import(moduleName ? pathToFileURL(path.resolve(moduleName)).href : "playwright");
  } catch (error) {
    throw new Error("Playwright is not installed. From the repository root run:\n"
      + "  npm install --prefix build/tools/playwright --no-audit --no-fund playwright\n"
      + "or set PLAYWRIGHT_MODULE to another copy's index.mjs.", { cause: error });
  }
}
