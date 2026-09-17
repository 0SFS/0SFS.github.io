import path from "node:path";
import { stat } from "node:fs/promises";

/** Map a request pathname to a file under a Vite `dist`, including directory indexes. */
export async function resolvePagesDistFile(dist, pathname) {
  const rel = decodeURIComponent(pathname);
  const root = path.resolve(dist);
  let file = rel === "/" ? path.join(root, "index.html") : path.resolve(root, `.${rel}`);
  if (file !== root && !file.startsWith(root + path.sep)) throw new Error("Unsafe application asset request");
  try {
    const st = await stat(file);
    if (st.isDirectory()) file = path.join(file, "index.html");
    await stat(file);
    return file;
  } catch (error) {
    if (!path.extname(path.basename(rel === "/" ? "/index.html" : rel))) {
      const indexed = path.join(file, "index.html");
      if (indexed.startsWith(root + path.sep)) {
        await stat(indexed);
        return indexed;
      }
    }
    throw error;
  }
}
