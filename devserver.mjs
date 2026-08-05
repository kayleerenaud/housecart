/* Local stand-in for Vercel: serves prototype/ AND runs api/*.js as functions,
   so the barcode path can be exercised exactly as it will be in production.
   node devserver.mjs [port] */
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { extname, join } from "node:path";

const require = createRequire(import.meta.url);
const PORT = +(process.argv[2] || 8123);
const ROOT = new URL("./prototype/", import.meta.url).pathname;
const TYPES = { ".html":"text/html", ".js":"text/javascript", ".json":"application/json",
  ".svg":"image/svg+xml", ".png":"image/png", ".webmanifest":"application/manifest+json" };

createServer(async (req, res) => {
  const u = new URL(req.url, `http://127.0.0.1:${PORT}`);
  if (u.pathname.startsWith("/api/")) {
    const name = u.pathname.slice(5).replace(/[^a-z0-9_-]/gi, "");
    try {
      const mod = require(join(new URL("./api/", import.meta.url).pathname, name + ".js"));
      const shim = {
        _h: {}, setHeader(k, v) { this._h[k] = v; },
        status(s) { this._s = s; return this; },
        json(j) { res.writeHead(this._s || 200, { ...this._h, "Content-Type": "application/json" }); res.end(JSON.stringify(j)); },
      };
      await mod({ query: Object.fromEntries(u.searchParams), url: req.url }, shim);
    } catch (e) { res.writeHead(500).end(String(e)); }
    return;
  }
  const path = u.pathname === "/" ? "/index.html" : u.pathname;
  try {
    const body = await readFile(join(ROOT, path));
    res.writeHead(200, { "Content-Type": TYPES[extname(path)] || "application/octet-stream" });
    res.end(body);
  } catch (e) { res.writeHead(404).end("not found"); }
}).listen(PORT, () => console.log("dev server on http://127.0.0.1:" + PORT));
