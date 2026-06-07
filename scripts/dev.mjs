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
  const scripts = lastBuild?.scripts?.length ? lastBuild.scripts : [
    {
      id: "export-missioni",
      name: "U-Web Export Missioni",
      loaderFileName: "tampermonkey-loader.user.js",
      payloadFileName: "dev-payload.js",
      standaloneFileName: "uweb-export-missioni.user.js"
    }
  ];
  const installCards = scripts.map((script) => `
      <div class="card">
        <h2>${script.name}</h2>
        <p><strong>Standalone:</strong> installazione consigliata per uso normale.</p>
        <a class="button" href="/${script.standaloneFileName}">Installa standalone</a>
        <p><strong>Sviluppo:</strong> loader che ricarica <code>${script.payloadFileName}</code> dal server.</p>
        <a class="button secondary" href="/${script.loaderFileName}">Installa sviluppo</a>
      </div>`).join("");
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
      .links {
        display: flex;
        flex-wrap: wrap;
        gap: 12px;
        margin-top: 12px;
      }
      .alert {
        border-left: 4px solid #dc2626;
        padding-left: 12px;
      }
      a {
        color: #0f766e;
      }
    </style>
  </head>
  <body>
    <main>
      <h1>Installazione Script U-Web Missioni <span class="badge">v${version}</span></h1>
      <p class="lead">Questa pagina ti permette di installare gli script Tampermonkey per U-Web Missioni. Ogni script resta indipendente in Tampermonkey e puo essere attivato o disattivato separatamente.</p>
      <div class="card">
        <h2>Prima di iniziare</h2>
        <p class="alert"><strong>Importante:</strong> in Chrome o Edge devi aprire <code>chrome://extensions/</code>, entrare nei dettagli di Tampermonkey e abilitare <code>User Scripts</code>, cioe gli script di terze parti.</p>
        <p class="hint">Se questa opzione non e abilitata, lo script puo risultare installato ma non partire sulla pagina U-Web anche se Tampermonkey sembra configurato correttamente.</p>
      </div>
      ${installCards}
      <div class="card">
        <h2>Differenza tra le due versioni</h2>
        <p><strong>Standalone:</strong> piu semplice, nessun server richiesto dopo l'installazione.</p>
        <p><strong>Sviluppo:</strong> richiede che questo servizio web resti attivo, ma ti permette di aggiornare il JavaScript molto velocemente anche da remoto.</p>
        <p><strong>Origin pubblico usato dai loader:</strong> <code>${origin}</code></p>
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
      <div class="card">
        <h2>Risorse utili</h2>
        <p>Se devi ancora installare Tampermonkey o vuoi una guida passo passo per la prima configurazione, usa questi link.</p>
        <div class="links">
          <a class="button secondary" href="https://www.tampermonkey.net/" target="_blank" rel="noreferrer">Scarica Tampermonkey</a>
          <a class="button" href="/guida-installazione.html">Guida installazione e prima configurazione</a>
        </div>
        <p class="hint">Nella guida trovi anche il promemoria per abilitare <code>User Scripts</code> o gli script di terze parti prima di usare U-Web.</p>
      </div>
    </main>
  </body>
</html>`;
}

function renderGuidePage() {
  return `<!doctype html>
<html lang="it">
  <head>
    <meta charset="utf-8">
    <title>Guida installazione Tampermonkey</title>
    <style>
      body {
        margin: 0;
        padding: 32px;
        font: 16px/1.6 ui-sans-serif, system-ui, sans-serif;
        background: linear-gradient(180deg, #f8fafc 0%, #eef6ff 100%);
        color: #0f172a;
      }
      main {
        max-width: 860px;
      }
      h1, h2 {
        margin-top: 0;
      }
      .card {
        margin: 20px 0;
        padding: 22px 24px;
        border-radius: 16px;
        background: white;
        box-shadow: 0 12px 30px rgba(15, 23, 42, 0.08);
      }
      .alert {
        border-left: 4px solid #dc2626;
        padding-left: 12px;
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
      a {
        color: #0f766e;
      }
    </style>
  </head>
  <body>
    <main>
      <h1>Guida installazione e prima configurazione</h1>
      <div class="card">
        <h2>1. Installa Tampermonkey</h2>
        <p>Apri il sito ufficiale di Tampermonkey e installa l'estensione nel browser che usi per U-Web.</p>
        <a class="button secondary" href="https://www.tampermonkey.net/" target="_blank" rel="noreferrer">Apri il sito ufficiale</a>
      </div>
      <div class="card">
        <h2>2. Abilita gli script di terze parti</h2>
        <p class="alert"><strong>Passaggio obbligatorio:</strong> in Chrome o Edge apri <code>chrome://extensions/</code>, entra nei dettagli di Tampermonkey e abilita <code>User Scripts</code>. Questa opzione consente l'esecuzione degli script di terze parti.</p>
        <p>Se non abiliti questa opzione, lo script puo risultare installato ma non verra eseguito dentro U-Web.</p>
      </div>
      <div class="card">
        <h2>3. Installa lo script</h2>
        <p>Torna alla pagina principale di distribuzione e scegli la versione standalone oppure la versione sviluppo, a seconda di cosa ti serve.</p>
        <a class="button" href="/">Torna alla pagina di installazione</a>
      </div>
      <div class="card">
        <h2>4. Prima verifica</h2>
        <p>Apri U-Web Missioni, entra nella pagina interessata e controlla che Tampermonkey mostri lo script come attivo.</p>
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

  if (route === "/guida-installazione.html") {
    response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    response.end(renderGuidePage());
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
  for (const script of lastBuild?.scripts ?? []) {
    console.log(`[dev] installa ${script.id}: ${getPublicOrigin()}/${script.loaderFileName}`);
  }
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
