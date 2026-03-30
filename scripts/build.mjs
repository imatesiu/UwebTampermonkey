import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");
const configPath = path.join(rootDir, "tampermonkey.config.json");
const payloadPath = path.join(rootDir, "src", "payload.js");
const distDir = path.join(rootDir, "dist");

function assertStringArray(value, fieldName) {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    throw new Error(`${fieldName} deve essere un array di stringhe`);
  }
}

function buildLoaderSource(config) {
  const metadata = [
    "// ==UserScript==",
    `// @name        ${config.name}`,
    `// @description ${config.description}`,
    "// @namespace   codex/uweb-tampermonkey",
    "// @version     0.1.0",
    ...config.matches.map((match) => `// @match       ${match}`),
    "// @grant       GM_xmlhttpRequest",
    "// @grant       GM_registerMenuCommand",
    "// @grant       GM_notification",
    "// @connect     127.0.0.1",
    "// @connect     localhost",
    "// @run-at      document-idle",
    "// ==/UserScript=="
  ].join("\n");

  const devOrigin = `http://127.0.0.1:${config.port}`;

  return `${metadata}

(function () {
  "use strict";

  const payloadUrl = "${devOrigin}/dev-payload.js";
  let currentRuntime = null;

  function notify(text) {
    if (typeof GM_notification === "function") {
      GM_notification({ text, title: "TM Dev", timeout: 1500 });
    }
  }

  function loadPayload(reason) {
    GM_xmlhttpRequest({
      method: "GET",
      url: payloadUrl + "?t=" + Date.now(),
      headers: {
        "Cache-Control": "no-cache"
      },
      onload(response) {
        if (response.status < 200 || response.status >= 300) {
          console.error("[TM Dev] impossibile caricare il payload", response.status, response.responseText);
          notify("Errore nel caricamento del payload locale");
          return;
        }

        try {
          const nextRuntime = new Function(
            "context",
            response.responseText + "\\n//# sourceURL=" + payloadUrl
          )({
            window,
            document,
            console,
            GM_info,
            setTimeout,
            clearTimeout
          });

          if (currentRuntime && typeof currentRuntime.dispose === "function") {
            currentRuntime.dispose("reload");
          }

          currentRuntime = nextRuntime ?? null;
          console.info("[TM Dev] payload aggiornato (" + reason + ")");
        } catch (error) {
          console.error("[TM Dev] esecuzione fallita", error);
          notify("Payload locale con errore JavaScript");
        }
      },
      onerror(error) {
        console.error("[TM Dev] rete locale non raggiungibile", error);
        notify("Server dev non raggiungibile su ${devOrigin}");
      }
    });
  }

  if (typeof GM_registerMenuCommand === "function") {
    GM_registerMenuCommand("Reload local dev script", function () {
      loadPayload("menu");
    });
  }

  loadPayload("startup");
})();
`;
}

export async function buildArtifacts() {
  const [configRaw, payloadSource] = await Promise.all([
    fs.readFile(configPath, "utf8"),
    fs.readFile(payloadPath, "utf8")
  ]);

  const config = JSON.parse(configRaw);

  if (typeof config.name !== "string" || typeof config.description !== "string") {
    throw new Error("tampermonkey.config.json deve contenere name e description come stringhe");
  }

  assertStringArray(config.matches, "matches");

  if (typeof config.port !== "number") {
    throw new Error("tampermonkey.config.json deve contenere port come numero");
  }

  await fs.mkdir(distDir, { recursive: true });

  const banner = [
    "/*",
    ` * Built at: ${new Date().toISOString()}`,
    " * Edit src/payload.js and keep npm run dev active.",
    " */",
    ""
  ].join("\n");

  const payloadOutput = `const { window, document, console } = context;\n${banner}${payloadSource}\n`;
  const loaderOutput = buildLoaderSource(config);

  await Promise.all([
    fs.writeFile(path.join(distDir, "dev-payload.js"), payloadOutput, "utf8"),
    fs.writeFile(path.join(distDir, "tampermonkey-loader.user.js"), loaderOutput, "utf8")
  ]);

  return {
    loaderPath: path.join(distDir, "tampermonkey-loader.user.js"),
    payloadPath: path.join(distDir, "dev-payload.js"),
    port: config.port
  };
}

if (process.argv[1] === __filename) {
  const result = await buildArtifacts();
  console.log(`Loader pronto: ${result.loaderPath}`);
  console.log(`Payload pronto: ${result.payloadPath}`);
}
