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
const serverHost = process.env.HOST || "127.0.0.1";
const publicHost = process.env.PUBLIC_HOST || "127.0.0.1";

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
  const origin = `http://${publicHost}:${port}`;
  const version = lastBuild?.version ?? "dev";
  const standaloneFileName = lastBuild?.standaloneFileName ?? "uweb-export-missioni.user.js";
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
      .card {
        margin: 20px 0;
        padding: 18px 20px;
        border-radius: 16px;
        background: white;
        box-shadow: 0 12px 30px rgba(15, 23, 42, 0.08);
      }
      .card h2 {
        margin: 0 0 8px;
        font-size: 20px;
      }
      .badge {
        display: inline-block;
        margin-left: 8px;
        padding: 2px 8px;
        border-radius: 999px;
        background: #dbeafe;
        color: #1d4ed8;
        font-size: 12px;
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
      <h1>Tampermonkey Dev Server <span class="badge">v${version}</span></h1>
      <p><strong>Chrome:</strong> in <code>chrome://extensions/</code> abilita <code>User Scripts</code> per Tampermonkey, altrimenti il loader puo essere installato ma non eseguito sulla pagina.</p>
      <div class="card">
        <h2>Installazione sviluppo</h2>
        <p>Installa il loader da <a href="/tampermonkey-loader.user.js">/tampermonkey-loader.user.js</a>.</p>
        <p><strong>Quando usarlo:</strong> se vuoi modificare spesso <code>src/payload.js</code> e vedere subito le modifiche.</p>
        <p><strong>Come funziona:</strong> Tampermonkey installa un loader leggero che scarica il codice aggiornato da <a href="/dev-payload.js">/dev-payload.js</a>.</p>
        <p><strong>Richiede:</strong> dev server attivo con <code>npm run dev</code> o Docker attivo.</p>
      </div>
      <div class="card">
        <h2>Installazione standalone</h2>
        <p>Installa direttamente lo script finale da <a href="/${standaloneFileName}">/${standaloneFileName}</a>.</p>
        <p><strong>Quando usarlo:</strong> se vuoi usare lo script normalmente senza dev server locale.</p>
        <p><strong>Come funziona:</strong> Tampermonkey installa tutto il codice in uno userscript unico e indipendente.</p>
        <p><strong>Richiede:</strong> nessun server locale dopo l'installazione.</p>
      </div>
      <p>Tieni aperto <code>npm run dev</code>, modifica <code>src/payload.js</code> e poi ricarica la pagina oppure usa il menu Tampermonkey <code>Reload local dev script</code>.</p>
      <p>Server in ascolto su <code>${origin}</code>.</p>
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

server.listen(port, serverHost, () => {
  console.log(`[dev] server pronto su http://${serverHost}:${port}`);
  console.log(`[dev] installa http://${publicHost}:${port}/tampermonkey-loader.user.js`);
});

fs.watch(srcDir, { recursive: true }, (_eventType, filename) => {
  scheduleRebuild(`src/${filename ?? "unknown"}`);
});

fs.watch(configPath, () => {
  scheduleRebuild("tampermonkey.config.json");
});
