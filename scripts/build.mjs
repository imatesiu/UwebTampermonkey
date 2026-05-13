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

function assertString(value, fieldName) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${fieldName} deve essere una stringa non vuota`);
  }
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function getDevOrigin(config) {
  const explicitOrigin = process.env.DEV_PUBLIC_ORIGIN?.trim();
  if (explicitOrigin) {
    return explicitOrigin.replace(/\/$/, "");
  }

  const scheme = process.env.DEV_PUBLIC_SCHEME?.trim() || "http";
  const host = process.env.DEV_PUBLIC_HOST?.trim() || "127.0.0.1";
  const port = process.env.DEV_PUBLIC_PORT?.trim() || String(config.port);
  return `${scheme}://${host}:${port}`;
}

function buildMetadata({
  name,
  description,
  namespace,
  version,
  matches,
  grants,
  connect = []
}) {
  return [
    "// ==UserScript==",
    `// @name        ${name}`,
    `// @description ${description}`,
    `// @namespace   ${namespace}`,
    `// @version     ${version}`,
    ...matches.map((match) => `// @match       ${match}`),
    ...grants.map((grant) => `// @grant       ${grant}`),
    ...connect.map((host) => `// @connect     ${host}`),
    "// @run-at      document-idle",
    "// ==/UserScript=="
  ].join("\n");
}

function buildLoaderSource(config) {
  const devOrigin = getDevOrigin(config);
  const devUrl = new URL(devOrigin);
  const metadata = buildMetadata({
    name: config.dev.name,
    description: config.dev.description,
    namespace: config.namespace,
    version: config.version,
    matches: config.matches,
    grants: [
      "GM_xmlhttpRequest",
      "GM_registerMenuCommand",
      "GM_notification"
    ],
    connect: unique([devUrl.hostname, "127.0.0.1", "localhost"])
  });

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

function buildStandaloneSource(config, payloadSource) {
  return [
    buildMetadata({
      name: config.production.name,
      description: config.production.description,
      namespace: config.namespace,
      version: config.version,
      matches: config.matches,
      grants: ["none"]
    }),
    "",
    "(function () {",
    '  "use strict";',
    "",
    ...payloadSource.split("\n"),
    "})();",
    ""
  ].join("\n");
}

export async function buildArtifacts() {
  const [configRaw, payloadSource] = await Promise.all([
    fs.readFile(configPath, "utf8"),
    fs.readFile(payloadPath, "utf8")
  ]);

  const config = JSON.parse(configRaw);

  assertString(config.namespace, "namespace");
  assertString(config.version, "version");
  assertStringArray(config.matches, "matches");
  if (typeof config.port !== "number") {
    throw new Error("tampermonkey.config.json deve contenere port come numero");
  }
  if (!config.dev || typeof config.dev !== "object") {
    throw new Error("tampermonkey.config.json deve contenere dev come oggetto");
  }
  if (!config.production || typeof config.production !== "object") {
    throw new Error("tampermonkey.config.json deve contenere production come oggetto");
  }
  assertString(config.dev.name, "dev.name");
  assertString(config.dev.description, "dev.description");
  assertString(config.production.name, "production.name");
  assertString(config.production.description, "production.description");
  assertString(config.production.filename, "production.filename");

  await fs.mkdir(distDir, { recursive: true });

  const banner = [
    "/*",
    ` * Built at: ${new Date().toISOString()}`,
    " * Edit src/payload.js and keep npm run dev active.",
    " */",
    ""
  ].join("\n");
  const standaloneBanner = [
    "/*",
    ` * Built at: ${new Date().toISOString()}`,
    " * Standalone distribution build for Tampermonkey.",
    " */",
    ""
  ].join("\n");

  const payloadOutput = `const { window, document, console } = context;\nconst SCRIPT_VERSION = ${JSON.stringify(config.version)};\n${banner}${payloadSource}\n`;
  const loaderOutput = buildLoaderSource(config);
  const standaloneOutput = buildStandaloneSource(
    config,
    `${standaloneBanner}const SCRIPT_VERSION = ${JSON.stringify(config.version)};\n${payloadSource}\n`
  );
  const standalonePath = path.join(distDir, config.production.filename);

  await Promise.all([
    fs.writeFile(path.join(distDir, "dev-payload.js"), payloadOutput, "utf8"),
    fs.writeFile(path.join(distDir, "tampermonkey-loader.user.js"), loaderOutput, "utf8"),
    fs.writeFile(standalonePath, standaloneOutput, "utf8")
  ]);

  return {
    loaderPath: path.join(distDir, "tampermonkey-loader.user.js"),
    payloadPath: path.join(distDir, "dev-payload.js"),
    standalonePath,
    port: config.port,
    version: config.version,
    standaloneFileName: config.production.filename,
    devOrigin: getDevOrigin(config)
  };
}

if (process.argv[1] === __filename) {
  const result = await buildArtifacts();
  console.log(`Loader pronto: ${result.loaderPath}`);
  console.log(`Payload pronto: ${result.payloadPath}`);
  console.log(`Standalone pronto: ${result.standalonePath}`);
}
