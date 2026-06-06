import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");
const configPath = path.join(rootDir, "tampermonkey.config.json");
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

function buildLoaderSource(config, scriptConfig) {
  const devOrigin = getDevOrigin(config);
  const devUrl = new URL(devOrigin);
  const payloadFilename = scriptConfig.dev.payloadFilename;
  const metadata = buildMetadata({
    name: scriptConfig.dev.name,
    description: scriptConfig.dev.description,
    namespace: config.namespace,
    version: config.version,
    matches: scriptConfig.matches,
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

  const payloadUrl = "${devOrigin}/${payloadFilename}";
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
    GM_registerMenuCommand("Reload local dev script (${scriptConfig.id})", function () {
      loadPayload("menu");
    });
  }

  loadPayload("startup");
})();
`;
}

function buildStandaloneSource(config, scriptConfig, payloadSource) {
  return [
    buildMetadata({
      name: scriptConfig.production.name,
      description: scriptConfig.production.description,
      namespace: config.namespace,
      version: config.version,
      matches: scriptConfig.matches,
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

function normalizeScriptConfigs(config) {
  if (Array.isArray(config.scripts) && config.scripts.length) {
    return config.scripts;
  }

  return [
    {
      id: "main",
      source: "src/payload.js",
      matches: config.matches,
      dev: {
        ...config.dev,
        filename: "tampermonkey-loader.user.js",
        payloadFilename: "dev-payload.js"
      },
      production: config.production
    }
  ];
}

function assertScriptConfig(scriptConfig, index) {
  const prefix = `scripts[${index}]`;
  assertString(scriptConfig.id, `${prefix}.id`);
  assertString(scriptConfig.source, `${prefix}.source`);
  assertStringArray(scriptConfig.matches, `${prefix}.matches`);
  if (!scriptConfig.dev || typeof scriptConfig.dev !== "object") {
    throw new Error(`${prefix}.dev deve essere un oggetto`);
  }
  if (!scriptConfig.production || typeof scriptConfig.production !== "object") {
    throw new Error(`${prefix}.production deve essere un oggetto`);
  }
  assertString(scriptConfig.dev.name, `${prefix}.dev.name`);
  assertString(scriptConfig.dev.description, `${prefix}.dev.description`);
  assertString(scriptConfig.dev.filename, `${prefix}.dev.filename`);
  assertString(scriptConfig.dev.payloadFilename, `${prefix}.dev.payloadFilename`);
  assertString(scriptConfig.production.name, `${prefix}.production.name`);
  assertString(scriptConfig.production.description, `${prefix}.production.description`);
  assertString(scriptConfig.production.filename, `${prefix}.production.filename`);
}

export async function buildArtifacts() {
  const configRaw = await fs.readFile(configPath, "utf8");
  const config = JSON.parse(configRaw);
  const scriptConfigs = normalizeScriptConfigs(config);

  assertString(config.namespace, "namespace");
  assertString(config.version, "version");
  if (typeof config.port !== "number") {
    throw new Error("tampermonkey.config.json deve contenere port come numero");
  }
  scriptConfigs.forEach(assertScriptConfig);

  await fs.mkdir(distDir, { recursive: true });

  const builtAt = new Date().toISOString();
  const standaloneBanner = [
    "/*",
    ` * Built at: ${builtAt}`,
    " * Standalone distribution build for Tampermonkey.",
    " */",
    ""
  ].join("\n");

  const scripts = [];
  const writeTasks = [];

  for (const scriptConfig of scriptConfigs) {
    const sourcePath = path.resolve(rootDir, scriptConfig.source);
    const payloadSource = await fs.readFile(sourcePath, "utf8");
    const banner = [
      "/*",
      ` * Built at: ${builtAt}`,
      ` * Edit ${scriptConfig.source} and keep npm run dev active.`,
      " */",
      ""
    ].join("\n");
    const payloadOutput = `const { window, document, console } = context;\nconst SCRIPT_VERSION = ${JSON.stringify(config.version)};\n${banner}${payloadSource}\n`;
    const loaderOutput = buildLoaderSource(config, scriptConfig);
    const standaloneOutput = buildStandaloneSource(
      config,
      scriptConfig,
      `${standaloneBanner}const SCRIPT_VERSION = ${JSON.stringify(config.version)};\n${payloadSource}\n`
    );
    const payloadPath = path.join(distDir, scriptConfig.dev.payloadFilename);
    const loaderPath = path.join(distDir, scriptConfig.dev.filename);
    const standalonePath = path.join(distDir, scriptConfig.production.filename);

    writeTasks.push(
      fs.writeFile(payloadPath, payloadOutput, "utf8"),
      fs.writeFile(loaderPath, loaderOutput, "utf8"),
      fs.writeFile(standalonePath, standaloneOutput, "utf8")
    );

    scripts.push({
      id: scriptConfig.id,
      name: scriptConfig.production.name,
      loaderPath,
      loaderFileName: scriptConfig.dev.filename,
      payloadPath,
      payloadFileName: scriptConfig.dev.payloadFilename,
      standalonePath,
      standaloneFileName: scriptConfig.production.filename
    });
  }

  await Promise.all(writeTasks);
  const primary = scripts[0];

  return {
    loaderPath: primary.loaderPath,
    payloadPath: primary.payloadPath,
    standalonePath: primary.standalonePath,
    port: config.port,
    version: config.version,
    standaloneFileName: primary.standaloneFileName,
    scripts,
    devOrigin: getDevOrigin(config)
  };
}

if (process.argv[1] === __filename) {
  const result = await buildArtifacts();
  for (const script of result.scripts) {
    console.log(`Loader pronto (${script.id}): ${script.loaderPath}`);
    console.log(`Payload pronto (${script.id}): ${script.payloadPath}`);
    console.log(`Standalone pronto (${script.id}): ${script.standalonePath}`);
  }
}
