// Serves dist/ at http://127.0.0.1:4175/ the way GitHub Pages serves the site:
// a folder's index.html at its slash address, a redirect to that address
// without the slash, and no fallback page.
import { createServer } from "node:http";
import { readFile, realpath, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const contentTypes = new Map([
  [".html", "text/html; charset=utf-8"], [".css", "text/css; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"], [".mjs", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"], [".webmanifest", "application/manifest+json; charset=utf-8"],
  [".xml", "application/xml; charset=utf-8"], [".txt", "text/plain; charset=utf-8"], [".md", "text/markdown; charset=utf-8"],
  [".png", "image/png"], [".jpg", "image/jpeg"], [".jpeg", "image/jpeg"], [".webp", "image/webp"],
  [".svg", "image/svg+xml"], [".ico", "image/x-icon"], [".wasm", "application/wasm"],
  [".glb", "model/gltf-binary"], [".gltf", "model/gltf+json"], [".bin", "application/octet-stream"],
  [".woff", "font/woff"], [".woff2", "font/woff2"], [".ktx2", "image/ktx2"],
  [".mp3", "audio/mpeg"], [".ogg", "audio/ogg"], [".wav", "audio/wav"],
]);

export async function startSiteServer({ root, port = 4175, host = "127.0.0.1" }) {
  if (host !== "127.0.0.1") throw new Error("The preview server binds only to 127.0.0.1");
  if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error("Invalid local port");
  root = await realpath(root).catch(() => {
    throw new Error("No site in dist/: run npm run build first");
  });
  const server = createServer(async (request, response) => {
    response.setHeader("X-Content-Type-Options", "nosniff");
    response.setHeader("Cache-Control", "no-cache");
    try {
      if (request.method !== "GET" && request.method !== "HEAD") {
        response.writeHead(405, { Allow: "GET, HEAD" });
        response.end("Method not allowed");
        return;
      }
      const url = new URL(request.url ?? "/", "http://localhost");
      let pathname;
      try {
        pathname = decodeURIComponent(url.pathname);
      } catch {
        response.writeHead(400);
        response.end("Invalid path");
        return;
      }
      if (pathname.includes("\\") || pathname.includes("\0") || pathname.split("/").some((part) => part === "." || part === ".." || part.startsWith("."))) {
        response.writeHead(400);
        response.end("Invalid path");
        return;
      }
      let filename = path.join(root, pathname.slice(1));
      let info = await stat(filename).catch(() => null);
      if (info?.isDirectory()) {
        if (!pathname.endsWith("/")) {
          response.writeHead(301, { Location: `${url.pathname}/${url.search}` });
          response.end();
          return;
        }
        filename = path.join(filename, "index.html");
        info = await stat(filename).catch(() => null);
      }
      if (!info?.isFile()) {
        response.writeHead(404);
        response.end("Not found");
        return;
      }
      const actual = await realpath(filename);
      if (!actual.startsWith(root + path.sep)) {
        response.writeHead(403);
        response.end("Forbidden");
        return;
      }
      response.setHeader("Content-Type", contentTypes.get(path.extname(filename).toLowerCase()) ?? "application/octet-stream");
      response.setHeader("Content-Length", info.size);
      response.writeHead(200);
      response.end(request.method === "HEAD" ? undefined : await readFile(actual));
    } catch {
      if (!response.headersSent) response.writeHead(500);
      response.end("Unable to serve file");
    }
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, host, resolve);
  });
  return { server, url: `http://${host}:${server.address().port}/` };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  let port = 4175;
  for (let index = 0; index < args.length; index++) {
    if (args[index] !== "--port" || index + 1 === args.length || !/^\d+$/.test(args[index + 1])) throw new Error("Usage: node scripts/serve.mjs [--port 4175]");
    port = Number(args[++index]);
  }
  if (port === 0) throw new Error("Choose an explicit nonzero local port");
  const { server, url } = await startSiteServer({ root: fileURLToPath(new URL("../dist/", import.meta.url)), port });
  console.log(`Serving dist/ at ${url}`);
  for (const signal of ["SIGINT", "SIGTERM"]) process.once(signal, () => server.close(() => process.exit(0)));
}
