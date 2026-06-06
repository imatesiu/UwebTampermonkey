import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildArtifacts } from "./build.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");
const packageJsonPath = path.join(rootDir, "package.json");
const configPath = path.join(rootDir, "tampermonkey.config.json");
const buildScriptPath = path.join(rootDir, "scripts", "build.mjs");
const distDir = path.join(rootDir, "dist");

const minimumNodeMajor = 18;

function logCheck(message) {
  console.log(`[compile] ${message}`);
}

function fail(message) {
  throw new Error(message);
}

async function assertFileExists(filePath) {
  try {
    const stats = await fs.stat(filePath);
    if (!stats.isFile()) {
      fail(`Atteso un file: ${filePath}`);
    }
  } catch (error) {
    if (error?.code === "ENOENT") {
      fail(`File mancante: ${filePath}`);
    }
    throw error;
  }
}

async function assertDistWritable() {
  await fs.mkdir(distDir, { recursive: true });
  const probePath = path.join(distDir, ".compile-write-test");
  await fs.writeFile(probePath, "ok", "utf8");
  await fs.unlink(probePath);
}

function assertNodeVersion() {
  const major = Number.parseInt(process.versions.node.split(".")[0], 10);
  if (Number.isNaN(major) || major < minimumNodeMajor) {
    fail(`Node ${minimumNodeMajor}+ richiesto. Versione corrente: ${process.versions.node}`);
  }
}

function normalizeScriptConfigs(config) {
  if (Array.isArray(config.scripts) && config.scripts.length) {
    return config.scripts;
  }

  return [
    {
      source: "src/payload.js",
      matches: config.matches,
      dev: config.dev,
      production: config.production
    }
  ];
}

async function assertConfigLooksValid() {
  const packageJsonRaw = await fs.readFile(packageJsonPath, "utf8");
  const packageJson = JSON.parse(packageJsonRaw);
  const configRaw = await fs.readFile(configPath, "utf8");
  const config = JSON.parse(configRaw);
  const scriptConfigs = normalizeScriptConfigs(config);

  if (typeof packageJson.version !== "string" || packageJson.version.trim() === "") {
    fail("package.json deve contenere una version valida.");
  }

  if (typeof config.version !== "string" || config.version.trim() === "") {
    fail("tampermonkey.config.json deve contenere una version valida.");
  }

  if (packageJson.version !== config.version) {
    fail(`Versione non allineata: package.json=${packageJson.version}, tampermonkey.config.json=${config.version}`);
  }

  if (!scriptConfigs.length) {
    fail("tampermonkey.config.json deve contenere almeno uno script.");
  }

  for (const [index, scriptConfig] of scriptConfigs.entries()) {
    if (typeof scriptConfig.source !== "string" || scriptConfig.source.trim() === "") {
      fail(`scripts[${index}].source deve essere una stringa non vuota.`);
    }

    if (!Array.isArray(scriptConfig.matches) || scriptConfig.matches.length === 0) {
      fail(`scripts[${index}].matches deve contenere almeno un @match.`);
    }

    if (!scriptConfig.dev?.filename || !scriptConfig.dev?.payloadFilename) {
      fail(`scripts[${index}].dev deve contenere filename e payloadFilename.`);
    }

    if (!scriptConfig.production?.filename) {
      fail(`scripts[${index}].production deve contenere filename.`);
    }

    await assertFileExists(path.join(rootDir, scriptConfig.source));
  }

  if (typeof config.port !== "number") {
    fail("tampermonkey.config.json deve contenere una porta numerica.");
  }

  const dependencyCount =
    Object.keys(packageJson.dependencies ?? {}).length +
    Object.keys(packageJson.devDependencies ?? {}).length;

  if (dependencyCount === 0) {
    logCheck("Nessuna dipendenza npm esterna richiesta per generare dist/.");
  } else {
    logCheck(`Dipendenze dichiarate rilevate: ${dependencyCount}.`);
  }
}

async function runChecks() {
  logCheck(`Node rilevato: ${process.versions.node}`);
  assertNodeVersion();

  await assertFileExists(packageJsonPath);
  await assertFileExists(configPath);
  await assertFileExists(buildScriptPath);
  logCheck("File sorgente richiesti presenti.");

  await assertConfigLooksValid();
  await assertDistWritable();
  logCheck("Cartella dist/ scrivibile.");
}

try {
  await runChecks();
  const result = await buildArtifacts();
  for (const script of result.scripts) {
    logCheck(`Loader pronto (${script.id}): ${script.loaderPath}`);
    logCheck(`Payload pronto (${script.id}): ${script.payloadPath}`);
    logCheck(`Standalone pronto (${script.id}): ${script.standalonePath}`);
  }
} catch (error) {
  console.error(`[compile] errore: ${error.message || error}`);
  process.exitCode = 1;
}
