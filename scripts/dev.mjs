import fs from "node:fs";
import http from "node:http";
import https from "node:https";
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
const tlsEnabled = process.env.HTTPS === "1";
const letsencryptRoot = process.env.LETSENCRYPT_ROOT || "/etc/letsencrypt/live";

function getTlsPaths() {
  const keyPath = process.env.TLS_KEY_PATH;
  const certPath = process.env.TLS_CERT_PATH;

  if (keyPath && certPath) {
    return { keyPath, certPath };
  }

  const site = process.env.LETSENCRYPT_SITE;
  if (!site) {
    return null;
  }

  const siteDir = path.join(letsencryptRoot, site);
  return {
    keyPath: path.join(siteDir, "privkey.pem"),
    certPath: path.join(siteDir, "fullchain.pem")
  };
}

function getPublicOrigin() {
  if (lastBuild?.devOrigin) {
    return lastBuild.devOrigin;
  }

  const scheme = tlsEnabled ? "https" : "http";
  return `${scheme}://${publicHost}:8123`;
}

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
  const origin = getPublicOrigin();
  const version = lastBuild?.version ?? "dev";
  const standaloneFileName = lastBuild?.standaloneFileName ?? "uweb-export-missioni.user.js";
  return `<!doctype html>
<html lang="it">
  <head>
    <meta charset="utf-8">
    <title>Installazione Script U-Web Missioni</title>
    <style>
      body {
        margin: 0;
        padding: 32px;
        font: 16px/1.5 ui-sans-serif, system-ui, sans-serif;
        background: linear-gradient(180deg, #f8fafc 0%, #eef6ff 100%);
        color: #0f172a;
      }
      main {
        max-width: 820px;
      }
      h1 {
        margin: 0 0 10px;
        font-size: 34px;
      }
      .lead {
        margin: 0 0 20px;
        max-width: 68ch;
        color: #334155;
      }
      .card {
        margin: 20px 0;
        padding: 22px 24px;
        border-radius: 16px;
        background: white;
        box-shadow: 0 12px 30px rgba(15, 23, 42, 0.08);
      }
      .card h2 {
        margin: 0 0 8px;
        font-size: 20px;
      }
      .card p {
        margin: 8px 0;
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
      .button {
        display: inline-block;
        margin-top: 10px;
        padding: 12px 16px;
        border-radius: 12px;
        background: #0f766e;
        color: white;
        text-decoration: none;
        font-weight: 700;
      }
      .button.secondary {
        background: #1d4ed8;
      }
      .hint {
        color: #475569;
        font-size: 14px;
      }
      .steps {
        margin: 12px 0 0;
        padding-left: 20px;
      }
      a {
        color: #0f766e;
      }
    </style>
  </head>
  <body>
    <main>
      <h1>Installazione Script U-Web Missioni <span class="badge">v${version}</span></h1>
      <p class="lead">Questa pagina ti permette di installare lo script Tampermonkey per U-Web Missioni. Se vuoi usare semplicemente lo script, scegli la versione standalone. Se invece vuoi svilupparlo e aggiornarlo spesso, usa la versione sviluppo.</p>
      <div class="card">
        <h2>Prima di iniziare</h2>
        <p><strong>Chrome:</strong> apri <code>chrome://extensions/</code>, entra nei dettagli di Tampermonkey e abilita <code>User Scripts</code>.</p>
        <p class="hint">Se questa opzione non e abilitata, lo script puo risultare installato ma non partire sulla pagina U-Web.</p>
      </div>
      <div class="card">
        <h2>Installazione consigliata</h2>
        <p><strong>Versione standalone:</strong> tutto lo script viene installato direttamente in Tampermonkey e continua a funzionare anche senza server locale.</p>
        <a class="button" href="/${standaloneFileName}">Installa versione standalone</a>
        <p class="hint">Ideale per uso normale o per distribuirlo ad altri utenti.</p>
      </div>
      <div class="card">
        <h2>Installazione sviluppo</h2>
        <p><strong>Versione sviluppo:</strong> installa un loader leggero che scarica il codice aggiornato dal server, anche se il servizio e pubblicato su un dominio remoto in HTTPS.</p>
        <a class="button secondary" href="/tampermonkey-loader.user.js">Installa versione sviluppo</a>
        <p class="hint">Usala se vuoi aggiornare spesso <code>src/payload.js</code> e vedere subito i cambiamenti, sia in locale sia da un server remoto.</p>
        <p><strong>Origin pubblico usato dal loader:</strong> <code>${origin}</code></p>
        <p><strong>Payload servito da:</strong> <code>${origin}/dev-payload.js</code></p>
      </div>
      <div class="card">
        <h2>Differenza tra le due versioni</h2>
        <p><strong>Standalone:</strong> piu semplice, nessun server richiesto dopo l'installazione.</p>
        <p><strong>Sviluppo:</strong> richiede che questo servizio web resti attivo, ma ti permette di aggiornare il JavaScript molto velocemente anche da remoto.</p>
      </div>
      <div class="card">
        <h2>Passi rapidi</h2>
        <ol class="steps">
          <li>Installa la versione che ti serve.</li>
          <li>Apri <code>https://cnr.u-web.cineca.it/appautmis/listaautmis</code>.</li>
          <li>Ricarica la pagina se necessario.</li>
          <li>Se usi la versione sviluppo, lascia attivo questo servizio web.</li>
        </ol>
      </div>
    </main>
  </body>
</html>`;
}

const requestHandler = (request, response) => {
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
};

function createServer() {
  if (!tlsEnabled) {
    return http.createServer(requestHandler);
  }

  const tlsPaths = getTlsPaths();
  if (!tlsPaths) {
    throw new Error("HTTPS abilitato ma non trovo TLS_KEY_PATH/TLS_CERT_PATH ne LETSENCRYPT_SITE.");
  }

  const key = fs.readFileSync(tlsPaths.keyPath);
  const cert = fs.readFileSync(tlsPaths.certPath);
  return https.createServer({ key, cert }, requestHandler);
}

const server = createServer();

await rebuild("startup");

const port = lastBuild?.port ?? 8123;

server.listen(port, serverHost, () => {
  console.log(`[dev] server pronto su ${getPublicOrigin()}`);
  console.log(`[dev] installa ${getPublicOrigin()}/tampermonkey-loader.user.js`);
  if (tlsEnabled) {
    const tlsPaths = getTlsPaths();
    console.log(`[dev] HTTPS attivo con certificati: ${tlsPaths.certPath}`);
  }
});

fs.watch(srcDir, { recursive: true }, (_eventType, filename) => {
  scheduleRebuild(`src/${filename ?? "unknown"}`);
});

fs.watch(configPath, () => {
  scheduleRebuild("tampermonkey.config.json");
});
