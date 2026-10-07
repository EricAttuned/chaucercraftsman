// Local preview without the Netlify CLI: serves public/ and routes /api/* to
// the function handlers, with an in-memory booking store.
//   node scripts/local-server.mjs            (port 8888)
// Set AIRBNB_ICAL_URL / SQUARE_* in your shell to talk to the real services.
import { createServer } from "node:http";
import { readFile, readdir } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { pathToFileURL } from "node:url";

process.env.LOCAL_MEMORY_STORE = "1";
const PORT = Number(process.env.PORT || 8888);
const root = new URL("..", import.meta.url).pathname;
process.env.URL ||= `http://localhost:${PORT}`;

const routes = {};
for (const f of await readdir(join(root, "netlify/functions"))) {
  const mod = await import(pathToFileURL(join(root, "netlify/functions", f)));
  routes[mod.config.path] = mod.default;
}

const types = { ".html": "text/html", ".css": "text/css", ".js": "text/javascript", ".json": "application/json", ".jpg": "image/jpeg" };

createServer(async (req, res) => {
  const url = new URL(req.url, process.env.URL);
  const handler = routes[url.pathname];
  if (handler) {
    const chunks = [];
    for await (const c of req) chunks.push(c);
    const request = new Request(url, { method: req.method, headers: req.headers, body: chunks.length ? Buffer.concat(chunks) : undefined });
    const response = await handler(request).catch((e) => (console.error(e), new Response("error", { status: 500 })));
    res.writeHead(response.status, Object.fromEntries(response.headers));
    return res.end(Buffer.from(await response.arrayBuffer()));
  }
  const path = normalize(join(root, "public", url.pathname.endsWith("/") ? url.pathname + "index.html" : url.pathname));
  if (!path.startsWith(join(root, "public"))) return res.writeHead(403).end();
  try {
    const body = await readFile(path);
    res.writeHead(200, { "Content-Type": types[extname(path)] || "application/octet-stream" }).end(body);
  } catch {
    res.writeHead(404).end("Not found");
  }
}).listen(PORT, () => console.log(`Preview on http://localhost:${PORT}`));
