#!/usr/bin/env node
/**
 * Serves the app to other devices on this network, so a phone can load the
 * controller without a deploy.
 *
 * Three things have to line up, which is why this is a script and not a flag:
 *
 * 1. **The address.** The phone needs this machine's LAN address, so the one on
 *    the interface carrying the default route is chosen rather than the first
 *    one listed.
 * 2. **HTTPS.** Flight control works over plain HTTP, but a secure context does
 *    not come free on a LAN address, and the screen wake lock and the clipboard
 *    button are secure-only. A self-signed certificate covering the LAN address
 *    is generated here and reused until it expires.
 * 3. **The QR target.** The pairing URL follows the desktop's own origin, which
 *    is the LAN address here. `VITE_PHONE_CONTROLLER_URL` is still set so that a
 *    desktop opened at `localhost` gets the HTTPS LAN form rather than the plain
 *    HTTP one `vite.config.ts` injects.
 *
 * Plain `npm run dev -- --host` also serves the LAN and produces a working QR,
 * over HTTP. Use this when something needs a secure context — the screen wake
 * lock and the clipboard button are secure-only.
 *
 * Usage: npm run dev:lan  [-- --port 5173]
 *        npm run dev:lan -- --print   (show the address and command, start nothing)
 */
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { networkInterfaces } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CERT_DIR = path.join(ROOT, "build", "dev-certs");
const CERT = path.join(CERT_DIR, "lan.crt");
const KEY = path.join(CERT_DIR, "lan.key");
const META = path.join(CERT_DIR, "lan.json");
/** Apple's ceiling for a TLS server certificate on iOS 13 and macOS 10.15 onwards. */
const CERT_DAYS = 825;
/** Bumped when what goes into the certificate changes, so an older one is replaced once. */
const CERT_PROFILE = 2;

function argValue(name, fallback) {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 && process.argv[index + 1] ? process.argv[index + 1] : fallback;
}

/** The address a phone can actually reach: the default route's interface. */
export function findLanAddress(interfaces = networkInterfaces(), preferred = defaultRouteInterface()) {
  const candidates = [];
  for (const [name, addresses] of Object.entries(interfaces)) {
    for (const address of addresses ?? []) {
      // Node <18 reports `family` as a number on some platforms.
      const isIpv4 = address.family === "IPv4" || address.family === 4;
      if (!isIpv4 || address.internal) continue;
      // Link-local addresses are what a machine picks when DHCP failed; a
      // phone on the real network cannot route to them.
      if (address.address.startsWith("169.254.")) continue;
      candidates.push({ name, address: address.address });
    }
  }
  if (candidates.length === 0) return null;
  return candidates.find(entry => entry.name === preferred) ?? candidates[0];
}

function defaultRouteInterface() {
  // macOS and BSD.
  const darwin = spawnSync("route", ["-n", "get", "default"], { encoding: "utf8" });
  const fromRoute = darwin.stdout?.match(/interface:\s*(\S+)/)?.[1];
  if (fromRoute) return fromRoute;
  // Linux.
  const linux = spawnSync("ip", ["route", "show", "default"], { encoding: "utf8" });
  return linux.stdout?.match(/\sdev\s+(\S+)/)?.[1] ?? null;
}

/** Reused until it expires or the address changes; regenerating invalidates the phone's trust. */
function ensureCertificate(address) {
  mkdirSync(CERT_DIR, { recursive: true });
  if (existsSync(CERT) && existsSync(KEY) && existsSync(META)) {
    try {
      const meta = JSON.parse(readFileSync(META, "utf8"));
      if (meta.address === address && meta.profile === CERT_PROFILE
        && Date.parse(meta.expires) > Date.now() + 86_400_000) return false;
    } catch { /* Regenerate on an unreadable record. */ }
  }
  const result = spawnSync("openssl", [
    "req", "-x509", "-newkey", "rsa:2048", "-sha256", "-nodes",
    "-days", String(CERT_DAYS),
    "-keyout", KEY, "-out", CERT,
    "-subj", "/CN=OSFS LAN dev",
    "-addext", `subjectAltName=IP:${address},IP:127.0.0.1,DNS:localhost`,
    // Apple requires it of every TLS server certificate, self-signed included.
    "-addext", "extendedKeyUsage=serverAuth",
  ], { encoding: "utf8" });
  if (result.status !== 0) {
    throw new Error(`Could not create a development certificate with openssl:\n${result.stderr ?? ""}`);
  }
  writeFileSync(META, JSON.stringify({
    address, profile: CERT_PROFILE, expires: new Date(Date.now() + CERT_DAYS * 86_400_000).toISOString(),
  }, null, 2) + "\n");
  return true;
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  const found = findLanAddress();
  if (!found) {
    console.error("No LAN address found. Connect this machine to Wi-Fi or Ethernet and try again.");
    process.exit(1);
  }
  const port = argValue("port", "5173");
  const origin = `https://${found.address}:${port}/`;
  const created = ensureCertificate(found.address);

  console.log(`LAN address  ${found.address}  (interface ${found.name})`);
  console.log(`Open on the phone  ${origin}`);
  console.log(`Certificate  ${created ? "created" : "reused"} at build/dev-certs/lan.crt`);
  console.log("");
  console.log("It is self-signed, so the first visit warns. On the phone, open the address above");
  console.log("once and accept it BEFORE scanning a QR — a camera-launched tab cannot show the");
  console.log("warning and will look like a failed pairing. iOS: Show Details → visit this website.");
  console.log("Android Chrome: Advanced → Proceed.");
  console.log("");

  if (process.argv.includes("--print")) {
    console.log("Start it with:");
    console.log(`  VITE_PHONE_CONTROLLER_URL=${origin} DEV_TLS_CERT=${CERT} DEV_TLS_KEY=${KEY} \\`);
    console.log(`    npx vite --host 0.0.0.0 --port ${port}`);
    process.exit(0);
  }

  // Every interface, not only the LAN address: the phone comes in on that, and
  // the computer on localhost, which the certificate covers too. Bound to the
  // LAN address alone, localhost was refused — while Vite still listed it,
  // because it prints every name the certificate carries.
  const vite = spawnSync("npx", ["vite", "--host", "0.0.0.0", "--port", port], {
    cwd: ROOT,
    stdio: "inherit",
    env: { ...process.env, VITE_PHONE_CONTROLLER_URL: origin, DEV_TLS_CERT: CERT, DEV_TLS_KEY: KEY },
  });
  process.exit(vite.status ?? 1);
}
