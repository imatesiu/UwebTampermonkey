import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildArtifacts } from "./build.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");
const configPath = path.join(rootDir, "tampermonkey.config.json");
const srcDir = path.join(rootDir, "src");
const distDir = path.join(rootDir, "dist");

let lastBuild = null;
let buildTimer = null;

async function rebuild(trigger) {
  try {
    lastBuild = await buildArtifacts();
    console.log(`[dev] build ok (${trigger})`);
  } catch (error) {
    console.error(`[dev] build failed (${trigger})`);
    console.error(error);
  }
}

function scheduleRebuild(trigger) {
  clearTimeout(buildTimer);
  buildTimer = setTimeout(() => {
    rebuild(trigger);
  }, 120);
}

function contentTypeFor(filePath) {
  if (filePath.endsWith(".js")) {
    return "text/javascript; charset=utf-8";
  }

  if (filePath.endsWith(".html")) {
    return "text/html; charset=utf-8";
  }

  return "text/plain; charset=utf-8";
}

function renderIndex() {
  const port = lastBuild?.port ?? 8123;
  return `<!doctype html>
<html lang="it">
  <head>
    <meta charset="utf-8">
    <title>Tampermonkey Dev Server</title>
    <style>
      body {
        margin: 0;
        padding: 32px;
        font: 16px/1.5 ui-sans-serif, system-ui, sans-serif;
        background: #f8fafc;
        color: #0f172a;
      }
      main {
        max-width: 720px;
      }
      code {
        background: #e2e8f0;
        padding: 2px 6px;
        border-radius: 6px;
      }
      a {
        color: #0f766e;
      }
    </style>
  </head>
  <body>
    <main>
      <h1>Tampermonkey Dev Server</h1>
      <p>Installa il loader una volta sola da <a href="/tampermonkey-loader.user.js">/tampermonkey-loader.user.js</a>.</p>
      <p>Il payload locale attivo e servito da <a href="/dev-payload.js">/dev-payload.js</a>.</p>
      <p>Tieni aperto <code>npm run dev</code>, modifica <code>src/payload.js</code> e poi ricarica la pagina oppure usa il menu Tampermonkey <code>Reload local dev script</code>.</p>
      <p>Server in ascolto su <code>http://127.0.0.1:${port}</code>.</p>
    </main>
  </body>
</html>`;
}

const server = http.createServer((request, response) => {
  const url = new URL(request.url ?? "/", "http://127.0.0.1");
  const route = url.pathname === "/" ? "/index.html" : url.pathname;
  const filePath = path.join(distDir, route === "/index.html" ? "index.html" : route.slice(1));

  if (route === "/index.html") {
    response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    response.end(renderIndex());
    return;
  }

  fs.readFile(filePath, (error, buffer) => {
    if (error) {
      response.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
      response.end("Not found");
      return;
    }

    response.writeHead(200, { "content-type": contentTypeFor(filePath), "cache-control": "no-store" });
    response.end(buffer);
  });
});

await rebuild("startup");

const port = lastBuild?.port ?? 8123;

server.listen(port, "127.0.0.1", () => {
  console.log(`[dev] server pronto su http://127.0.0.1:${port}`);
  console.log(`[dev] installa http://127.0.0.1:${port}/tampermonkey-loader.user.js`);
});

fs.watch(srcDir, { recursive: true }, (_eventType, filename) => {
  scheduleRebuild(`src/${filename ?? "unknown"}`);
});

fs.watch(configPath, () => {
  scheduleRebuild("tampermonkey.config.json");
});
