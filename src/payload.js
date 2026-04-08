const API_BASE = `${window.location.origin}/appautmis/api`;
const LIST_ENDPOINT_FRAGMENT = "/estrailistaautmissionipercipienteconstatopagamento";
const TOKEN_KEY = "appU-Web-token";
const ROOT_ID = "__tm-dev-exporter";
const STYLE_ID = "__tm-dev-exporter-style";
const INCLUDE_RAW_DETAIL_KEY = "__tm-export-include-raw-detail";

if (!window.location.pathname.startsWith("/appautmis/listaautmis")) {
  return {
    dispose() {}
  };
}

const encoder = new TextEncoder();

document.getElementById(ROOT_ID)?.remove();
document.getElementById(STYLE_ID)?.remove();

const style = document.createElement("style");
style.id = STYLE_ID;
style.textContent = `
  #${ROOT_ID} {
    position: fixed;
    left: 16px;
    bottom: 16px;
    z-index: 2147483647;
    width: min(270px, calc(100vw - 32px));
    border-radius: 18px;
    background: rgba(15, 23, 42, 0.96);
    color: #f8fafc;
    box-shadow: 0 22px 60px rgba(15, 23, 42, 0.45);
    backdrop-filter: blur(10px);
    overflow: hidden;
    font: 13px/1.45 ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  }

  #${ROOT_ID} * {
    box-sizing: border-box;
  }

  #${ROOT_ID} .tm-head {
    padding: 14px 16px 8px;
    border-bottom: 1px solid rgba(148, 163, 184, 0.2);
  }

  #${ROOT_ID} .tm-title {
    font-weight: 700;
    font-size: 14px;
    margin: 0;
  }

  #${ROOT_ID} .tm-version {
    display: inline-block;
    margin-left: 6px;
    padding: 2px 8px;
    border-radius: 999px;
    background: rgba(56, 189, 248, 0.18);
    color: #bae6fd;
    font-size: 11px;
    vertical-align: middle;
  }

  #${ROOT_ID} .tm-subtitle {
    margin: 6px 0 0;
    color: #cbd5e1;
  }

  #${ROOT_ID} .tm-body {
    padding: 12px 16px 16px;
    display: grid;
    gap: 10px;
  }

  #${ROOT_ID} .tm-actions {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
  }

  #${ROOT_ID} .tm-option {
    display: grid;
    grid-template-columns: 16px 1fr;
    gap: 10px;
    align-items: start;
    padding: 10px 12px;
    border-radius: 12px;
    background: rgba(15, 23, 42, 0.55);
    color: #cbd5e1;
  }

  #${ROOT_ID} .tm-option input {
    margin: 2px 0 0;
  }

  #${ROOT_ID} .tm-option strong {
    display: block;
    color: #f8fafc;
  }

  #${ROOT_ID} button {
    appearance: none;
    border: 0;
    border-radius: 999px;
    padding: 10px 14px;
    font: inherit;
    font-weight: 700;
    cursor: pointer;
  }

  #${ROOT_ID} .tm-primary {
    background: linear-gradient(135deg, #22c55e, #16a34a);
    color: white;
  }

  #${ROOT_ID} .tm-secondary {
    background: rgba(51, 65, 85, 0.95);
    color: #e2e8f0;
  }

  #${ROOT_ID} button[disabled] {
    cursor: progress;
    opacity: 0.65;
  }

  #${ROOT_ID} .tm-status {
    min-height: 52px;
    padding: 10px 12px;
    border-radius: 12px;
    background: rgba(15, 23, 42, 0.55);
    color: #cbd5e1;
    white-space: pre-wrap;
  }

  #${ROOT_ID} .tm-progress {
    height: 8px;
    border-radius: 999px;
    background: rgba(148, 163, 184, 0.18);
    overflow: hidden;
  }

  #${ROOT_ID} .tm-progress-bar {
    height: 100%;
    width: 0%;
    background: linear-gradient(90deg, #38bdf8, #22c55e);
    transition: width 180ms ease;
  }
`;

const root = document.createElement("section");
root.id = ROOT_ID;
root.innerHTML = `
  <div class="tm-head">
    <p class="tm-title">Export missioni in ZIP <span class="tm-version">v${getScriptVersion()}</span></p>
    <p class="tm-subtitle">Usa i filtri correnti della pagina e scarica richiesta + allegati per ogni missione.</p>
  </div>
  <div class="tm-body">
    <div class="tm-actions">
      <button class="tm-primary" type="button">Scarica ZIP missioni</button>
      <button class="tm-secondary" type="button">Aggiorna stato</button>
    </div>
    <label class="tm-option">
      <input class="tm-include-raw-detail" type="checkbox" />
      <span>
        <strong>Includi dettaglio API originale</strong>
        Aggiunge a ogni <code>missione.json</code> il raw API con il path usato per estrarlo.
      </span>
    </label>
    <div class="tm-progress" aria-hidden="true">
      <div class="tm-progress-bar"></div>
    </div>
    <div class="tm-status">Pronto.</div>
  </div>
`;

document.documentElement.append(style, root);

const downloadButton = root.querySelector(".tm-primary");
const refreshButton = root.querySelector(".tm-secondary");
const includeRawDetailCheckbox = root.querySelector(".tm-include-raw-detail");
const statusBox = root.querySelector(".tm-status");
const progressBar = root.querySelector(".tm-progress-bar");

includeRawDetailCheckbox.checked = window.localStorage.getItem(INCLUDE_RAW_DETAIL_KEY) === "1";
includeRawDetailCheckbox.addEventListener("change", () => {
  window.localStorage.setItem(INCLUDE_RAW_DETAIL_KEY, includeRawDetailCheckbox.checked ? "1" : "0");
});

function setStatus(message) {
  statusBox.textContent = message;
  console.log("[TM Export]", message);
}

function setProgress(current, total) {
  const safeTotal = total > 0 ? total : 1;
  const percent = Math.max(0, Math.min(100, Math.round((current / safeTotal) * 100)));
  progressBar.style.width = `${percent}%`;
}

function sanitizeSegment(value, fallback = "senza-nome") {
  const cleaned = String(value ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return cleaned || fallback;
}

function formatStamp(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${year}${month}${day}-${hours}${minutes}`;
}

function normalizeBase64Payload(payload) {
  let value = payload;

  if (typeof value === "string") {
    const trimmed = value.trim();

    if (trimmed.startsWith("\"") || trimmed.startsWith("{") || trimmed.startsWith("[")) {
      try {
        value = JSON.parse(trimmed);
      } catch (_error) {
        value = trimmed;
      }
    } else {
      value = trimmed;
    }
  }

  if (value && typeof value === "object") {
    if (typeof value.base64 === "string") {
      value = value.base64;
    } else if (typeof value.file === "string") {
      value = value.file;
    } else if (typeof value.content === "string") {
      value = value.content;
    } else if (typeof value.b64file === "string") {
      value = value.b64file;
    }
  }

  if (typeof value !== "string") {
    throw new Error("Risposta file non riconosciuta: base64 assente.");
  }

  return value
    .trim()
    .replace(/^data:.*;base64,/, "")
    .replace(/\s+/g, "");
}

function base64ToBytes(base64) {
  const normalized = normalizeBase64Payload(base64);
  const binary = window.atob(normalized);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

function jsonToBytes(value) {
  return encoder.encode(JSON.stringify(value, null, 2));
}

function getScriptVersion() {
  return typeof SCRIPT_VERSION !== "undefined" ? SCRIPT_VERSION : "dev";
}

function getToken() {
  const token = window.localStorage.getItem(TOKEN_KEY);
  if (!token) {
    throw new Error("Token applicativo non trovato in localStorage.");
  }
  return token;
}

function getLatestListUrl() {
  const entries = performance
    .getEntriesByType("resource")
    .filter((entry) => entry.name.includes(LIST_ENDPOINT_FRAGMENT));

  if (!entries.length) {
    throw new Error("Non trovo la chiamata di lista missioni nelle richieste della pagina.");
  }

  return entries[entries.length - 1].name;
}

async function apiFetch(url, options = {}) {
  const token = getToken();
  const response = await window.fetch(url, {
    credentials: "include",
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json, text/plain, */*",
      "X-Requested-With": "XMLHttpRequest",
      ...(options.headers ?? {})
    }
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => "");
    throw new Error(`HTTP ${response.status} su ${url}\n${errorText.slice(0, 200)}`);
  }

  return response;
}

async function fetchMissionList() {
  const url = getLatestListUrl();
  const response = await apiFetch(url);
  const data = await response.json();

  if (!Array.isArray(data)) {
    throw new Error("La lista missioni non e un array.");
  }

  return data;
}

async function fetchMissionRequestPdf(idAutMiss) {
  const response = await apiFetch(`${API_BASE}/stampaautorizzazionemissione?id=${encodeURIComponent(idAutMiss)}`);
  return base64ToBytes(await response.text());
}

async function fetchMissionAttachments(idAutMiss) {
  const response = await apiFetch(`${API_BASE}/allegati/${encodeURIComponent(idAutMiss)}`);
  const data = await response.json();
  return Array.isArray(data) ? data : [];
}

function buildMissionDetailUrl(idAutMiss) {
  return `${API_BASE}/listaautmis/${encodeURIComponent(idAutMiss)}`;
}

async function fetchMissionDetails(idAutMiss) {
  const response = await apiFetch(buildMissionDetailUrl(idAutMiss));
  return response.json();
}

async function fetchAttachmentBytes(idAutMiss, idDgAllegato) {
  const response = await apiFetch(`${API_BASE}/allegati/${encodeURIComponent(idAutMiss)}/${encodeURIComponent(idDgAllegato)}`);
  return base64ToBytes(await response.text());
}

function missionFolderName(mission) {
  const id = sanitizeSegment(mission.idAutMiss, "missione");
  const title = sanitizeSegment(mission.dsAutMis, "missione");
  return `${id} - ${title}`.slice(0, 140);
}

function uniqueFilePath(folder, originalName, usedNames) {
  const safeName = sanitizeSegment(originalName, "file.bin");
  const dotIndex = safeName.lastIndexOf(".");
  const baseName = dotIndex > 0 ? safeName.slice(0, dotIndex) : safeName;
  const extension = dotIndex > 0 ? safeName.slice(dotIndex) : "";

  let candidate = `${folder}/${safeName}`;
  let counter = 2;

  while (usedNames.has(candidate.toLowerCase())) {
    candidate = `${folder}/${baseName} (${counter})${extension}`;
    counter += 1;
  }

  usedNames.add(candidate.toLowerCase());
  return candidate;
}

function createCrcTable() {
  const table = new Uint32Array(256);
  for (let index = 0; index < 256; index += 1) {
    let current = index;
    for (let shift = 0; shift < 8; shift += 1) {
      current = (current & 1) ? (0xedb88320 ^ (current >>> 1)) : (current >>> 1);
    }
    table[index] = current >>> 0;
  }
  return table;
}

let crcTable = null;

function crc32(bytes) {
  crcTable ??= createCrcTable();
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function toDosDateTime(date = new Date()) {
  const dosTime =
    ((date.getHours() & 0x1f) << 11) |
    ((date.getMinutes() & 0x3f) << 5) |
    Math.floor(date.getSeconds() / 2);
  const dosDate =
    (((date.getFullYear() - 1980) & 0x7f) << 9) |
    (((date.getMonth() + 1) & 0x0f) << 5) |
    (date.getDate() & 0x1f);

  return { dosDate, dosTime };
}

function concatUint8Arrays(chunks) {
  const totalLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const output = new Uint8Array(totalLength);
  let offset = 0;

  for (const chunk of chunks) {
    output.set(chunk, offset);
    offset += chunk.length;
  }

  return output;
}

class ZipBuilder {
  constructor() {
    this.entries = [];
    this.offset = 0;
    this.date = new Date();
  }

  addFile(path, bytes) {
    const nameBytes = encoder.encode(path);
    const { dosDate, dosTime } = toDosDateTime(this.date);
    const checksum = crc32(bytes);
    const localHeader = new Uint8Array(30 + nameBytes.length);
    const localView = new DataView(localHeader.buffer);

    localView.setUint32(0, 0x04034b50, true);
    localView.setUint16(4, 20, true);
    localView.setUint16(6, 0x0800, true);
    localView.setUint16(8, 0, true);
    localView.setUint16(10, dosTime, true);
    localView.setUint16(12, dosDate, true);
    localView.setUint32(14, checksum, true);
    localView.setUint32(18, bytes.length, true);
    localView.setUint32(22, bytes.length, true);
    localView.setUint16(26, nameBytes.length, true);
    localView.setUint16(28, 0, true);
    localHeader.set(nameBytes, 30);

    const centralHeader = new Uint8Array(46 + nameBytes.length);
    const centralView = new DataView(centralHeader.buffer);

    centralView.setUint32(0, 0x02014b50, true);
    centralView.setUint16(4, 20, true);
    centralView.setUint16(6, 20, true);
    centralView.setUint16(8, 0x0800, true);
    centralView.setUint16(10, 0, true);
    centralView.setUint16(12, dosTime, true);
    centralView.setUint16(14, dosDate, true);
    centralView.setUint32(16, checksum, true);
    centralView.setUint32(20, bytes.length, true);
    centralView.setUint32(24, bytes.length, true);
    centralView.setUint16(28, nameBytes.length, true);
    centralView.setUint16(30, 0, true);
    centralView.setUint16(32, 0, true);
    centralView.setUint16(34, 0, true);
    centralView.setUint16(36, 0, true);
    centralView.setUint32(38, 0, true);
    centralView.setUint32(42, this.offset, true);
    centralHeader.set(nameBytes, 46);

    this.entries.push({ localHeader, bytes, centralHeader });
    this.offset += localHeader.length + bytes.length;
  }

  build() {
    const localChunks = [];
    const centralChunks = [];

    for (const entry of this.entries) {
      localChunks.push(entry.localHeader, entry.bytes);
      centralChunks.push(entry.centralHeader);
    }

    const locals = concatUint8Arrays(localChunks);
    const centrals = concatUint8Arrays(centralChunks);
    const end = new Uint8Array(22);
    const endView = new DataView(end.buffer);

    endView.setUint32(0, 0x06054b50, true);
    endView.setUint16(4, 0, true);
    endView.setUint16(6, 0, true);
    endView.setUint16(8, this.entries.length, true);
    endView.setUint16(10, this.entries.length, true);
    endView.setUint32(12, centrals.length, true);
    endView.setUint32(16, locals.length, true);
    endView.setUint16(20, 0, true);

    return new Blob([locals, centrals, end], { type: "application/zip" });
  }
}

function triggerDownload(blob, fileName) {
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.click();
  window.setTimeout(() => window.URL.revokeObjectURL(url), 2000);
}

function asArray(value) {
  if (Array.isArray(value)) {
    return value;
  }

  if (value == null) {
    return [];
  }

  return [value];
}

function simplifyAttachmentReference(attachment) {
  return {
    idDgAllegato: attachment.idDgAllegato ?? null,
    nomeFile: attachment.nomeFile ?? null,
    percorsoZip: attachment.percorsoZip ?? null,
    tipo: attachment.tipo ?? null,
    notaFile: attachment.notaFile ?? null,
    cdAltKey: attachment.cdAltKey ?? null
  };
}

function buildAttachmentsByKey(downloadedAttachments) {
  const attachmentsByKey = new Map();

  for (const attachment of downloadedAttachments) {
    const key = String(attachment.cdAltKey ?? "").trim();
    if (!key) {
      continue;
    }

    if (!attachmentsByKey.has(key)) {
      attachmentsByKey.set(key, []);
    }

    attachmentsByKey.get(key).push(simplifyAttachmentReference(attachment));
  }

  return attachmentsByKey;
}

function simplifyExpense(expense, source, attachmentsByKey = new Map()) {
  const attachmentKey = String(expense.cdAllegato ?? "").trim();
  const linkedAttachments = attachmentKey ? (attachmentsByKey.get(attachmentKey) ?? []) : [];

  return {
    origine: source,
    idSpesa: expense.idXSpesa ?? expense.idXPrevSpesa ?? null,
    nrRiga: expense.nrRiga ?? null,
    codiceSpesa: expense.cdSpesa ?? null,
    tipoSpesa: expense.dsTipoSpesa ?? null,
    notaSpesa: expense.dsSpesa ?? null,
    motivazioneMezzo: expense.dsMotivazMezzo ?? null,
    codiceMotivazioneMezzo: expense.cdMotivazMezzo ?? null,
    mezzoTrasporto: expense.cdMezzoTrasp ?? null,
    dataSostenimento: expense.dtSostenimento ?? null,
    importoEuro: expense.importoEuro ?? null,
    importoValuta: expense.importoValuta ?? null,
    valuta: expense.cdValuta ?? null,
    nomeValuta: expense.nomeValuta ?? null,
    chiaveAllegato: expense.cdAllegato ?? null,
    allegatiAssociati: linkedAttachments
  };
}

function indexExpensesByAttachmentKey(detail) {
  const dg = detail?.dg02Dg ?? {};
  const expensesByAttachmentKey = new Map();
  const sources = [
    { list: asArray(dg.dg16XSpesa), source: "spesa_rimborso" },
    { list: asArray(dg.dg16XPrevSpesa), source: "spesa_presunta" }
  ];

  for (const { list, source } of sources) {
    for (const expense of list) {
      const key = String(expense?.cdAllegato ?? "").trim();
      if (!key) {
        continue;
      }

      if (!expensesByAttachmentKey.has(key)) {
        expensesByAttachmentKey.set(key, []);
      }

      expensesByAttachmentKey.get(key).push(simplifyExpense(expense, source));
    }
  }

  return expensesByAttachmentKey;
}

function summarizeAttachmentDownload(attachment, filePath, detail, expensesByAttachmentKey) {
  const attachmentKey = String(attachment.cdAltKey ?? "").trim();
  const associatedExpenses = attachmentKey ? (expensesByAttachmentKey.get(attachmentKey) ?? []) : [];

  return {
    scaricato: true,
    percorsoZip: filePath,
    idDgAllegato: attachment.idDgAllegato,
    nomeFile: attachment.nomeFile,
    notaFile: attachment.dsAllegato ?? null,
    tipo: attachment.cdTipoAllegato ?? null,
    cdAltKey: attachment.cdAltKey ?? null,
    associazione: {
      livello: associatedExpenses.length ? "spesa" : "missione",
      chiave: attachmentKey || null,
      spese: associatedExpenses
    },
    sorgenteDettaglio: {
      presenteNelDettaglioMissione: asArray(detail?.dg02Dg?.dg02DgAllegati)
        .some((detailAttachment) => detailAttachment?.idDgAllegato === attachment.idDgAllegato)
    }
  };
}

function buildRouteSummary(route) {
  return {
    nrRiga: route.nrRiga ?? null,
    dataInizio: route.dataInizioTratta ?? null,
    dataFine: route.dataFineTratta ?? null,
    tipoTratta: route.cdTipoTratta ?? null,
    luogo: route.dsLuogo ?? null,
    luogoCompleto: route.dsLuogoCountryName ?? null,
    areaGeografica: route.dsAreaGeog ?? null,
    paese: route.countryCode ?? null
  };
}

function buildActorSummary(actor) {
  return {
    idDgAttore: actor.idDgAttore ?? null,
    utente: actor.userName ?? null,
    tipoAttore: actor.tipoAttoreName ?? null,
    descrizione: actor.descrizione ?? null,
    label: actor.label ?? null
  };
}

function buildAuthorizationSummary(detailRow) {
  const authorization = detailRow?.dg16XAutorizzazione ?? {};

  return {
    nrRiga: detailRow?.nrRiga ?? null,
    progetto: detailRow?.dsProgetto ?? null,
    codiceProgetto: detailRow?.cdProgetto ?? null,
    cup: detailRow?.cdCup ?? null,
    autorizzazione: {
      data: authorization.dtAutoriz ?? null,
      autorizzato: authorization.flAutorizzato ?? null,
      tipo: authorization.dsTipoAutoriz ?? null,
      codiceTipo: authorization.cdTipoAutoriz ?? null,
      nome: authorization.nome ?? null,
      cognome: authorization.cognome ?? null
    }
  };
}

function buildMissionSummary(mission, attachments, detail, downloadedAttachments, options = {}) {
  const dg = detail?.dg02Dg ?? {};
  const attachmentsByKey = buildAttachmentsByKey(downloadedAttachments);
  const missionLevelAttachments = downloadedAttachments.filter(
    (attachment) => attachment.associazione?.livello === "missione"
  );

  const missionSections = {
    intestazione: {
      idAutMiss: mission.idAutMiss,
      titolo: mission.dsAutMis,
      stato: mission.stato,
      statoPagamento: mission.statoPagamento ?? null,
      dataInizio: mission.dtIniMis,
      dataFine: mission.dtFineMis,
      costoPresunto: mission.costoPresunto ?? null,
      luoghi: mission.luoghi ?? []
    },
    missione: {
      idDg: dg.idDg ?? null,
      annoRiferimento: dg.annoRif ?? null,
      numeroRegistrazione: dg.numeroRegistrazione ?? null,
      dataRegistrazione: dg.dtRegistrazione ?? null,
      titoloDettaglio: dg.dsDg ?? null,
      notaMissione: dg.note ?? null,
      statoDg: dg.statoDg ?? null,
      progetto: {
        codice: dg.cdProgetto ?? null,
        descrizione: dg.dsProgetto ?? null,
        cup: dg.cup ?? null,
        descrizioneCup: dg.dsCup ?? null
      }
    },
    percipiente: {
      matricola: dg.dg09XPercipiente?.matricola ?? null,
      nome: dg.dg09XPercipiente?.nome ?? null,
      cognome: dg.dg09XPercipiente?.cognome ?? null,
      ruolo: dg.dg09XPercipiente?.ruolo ?? null,
      descrizioneRuolo: dg.dg09XPercipiente?.descrRuolo ?? null
    },
    richiestaAutorizzazione: {
      tipo: dg.dg16XRichiestaAut?.dsTipoRichiesta ?? null,
      codiceTipo: dg.dg16XRichiestaAut?.cdTipoRichiesta ?? null,
      macroTipo: dg.dg16XRichiestaAut?.macroTipoRichiesta ?? null,
      dataInizio: dg.dg16XRichiestaAut?.dtInizio ?? null,
      dataFine: dg.dg16XRichiestaAut?.dtFine ?? null,
      costoPresunto: dg.dg16XRichiestaAut?.costoPresunto ?? null,
      costoPresuntoSpese: dg.dg16XRichiestaAut?.costoPresSpese ?? null,
      responsabileProgetto: [
        dg.dg16XRichiestaAut?.nomeRespPj,
        dg.dg16XRichiestaAut?.cognomeRespPj
      ].filter(Boolean).join(" ") || null
    },
    dettaglioMissione: {
      dataInizio: dg.dg16XMissione?.dtInizioMis ?? null,
      dataFine: dg.dg16XMissione?.dtFineMis ?? null,
      durataGiorni: dg.dg16XMissione?.durataGg ?? null,
      destinazione: dg.dg16XMissione?.dsLuogoDestinazione ?? null,
      partenza: dg.dg16XMissione?.dsLuogoPartenza ?? null,
      oggetto: dg.dg16XMissione?.dsOggetto ?? null,
      regolamento: dg.dg16XMissione?.dsRegolamento ?? null,
      tipoMissione: dg.dg16XMissione?.dsTipoMis ?? null,
      capitolo: dg.dg16XMissione?.descrCapitolo ?? null,
      gruppo: dg.dg16XMissione?.dsGruppo ?? null
    },
    tratte: asArray(dg.dg16XTratta).map(buildRouteSummary),
    autorizzazioni: asArray(dg.dg02DgDett).map(buildAuthorizationSummary),
    speseRimborso: asArray(dg.dg16XSpesa).map((expense) =>
      simplifyExpense(expense, "spesa_rimborso", attachmentsByKey)
    )
  };

  const summary = {
    idAutMiss: mission.idAutMiss,
    dettaglioMissione: {
      disponibile: Boolean(detail),
      numeroAllegatiDettaglio: asArray(dg.dg02DgAllegati).length,
      numeroSpeseRimborso: asArray(dg.dg16XSpesa).length,
      numeroSpesePresunte: asArray(dg.dg16XPrevSpesa).length
    },
    allegatiTotaliTrovati: attachments.length,
    allegatiScaricati: downloadedAttachments.length,
    note: {
      missione: dg.note ?? null
    },
    allegatiMissione: missionLevelAttachments,
    allegati: downloadedAttachments,
    sezioni: missionSections
  };

  if (options.includeRawDetailApiOriginale) {
    summary.dettaglioApiOriginale = {
      path: options.detailApiPath ?? null,
      data: detail
    };
  }

  return summary;
}

async function exportMissionZip() {
  downloadButton.disabled = true;
  refreshButton.disabled = true;

  try {
    const includeRawDetailApiOriginale = includeRawDetailCheckbox.checked;
    setProgress(0, 1);
    setStatus("Recupero lista missioni dai filtri correnti...");

    const missions = await fetchMissionList();
    if (!missions.length) {
      throw new Error("Nessuna missione trovata con i filtri correnti.");
    }

    const zip = new ZipBuilder();
    const usedNames = new Set();
    const totalSteps = missions.length * 2 + 1;
    let currentStep = 0;

    for (const mission of missions) {
      const folder = missionFolderName(mission);

      setStatus(`Scarico richiesta PDF per missione ${mission.idAutMiss}...`);
      const requestBytes = await fetchMissionRequestPdf(mission.idAutMiss);
      zip.addFile(`${folder}/Stampa_Richiesta_Missione_${sanitizeSegment(mission.idAutMiss, "missione")}.pdf`, requestBytes);
      currentStep += 1;
      setProgress(currentStep, totalSteps);

      setStatus(`Leggo allegati missione ${mission.idAutMiss}...`);
      const detailApiPath = buildMissionDetailUrl(mission.idAutMiss);
      const missionDetail = await fetchMissionDetails(mission.idAutMiss);
      const attachments = await fetchMissionAttachments(mission.idAutMiss);
      const expensesByAttachmentKey = indexExpensesByAttachmentKey(missionDetail);
      const downloadedAttachments = [];

      for (const attachment of attachments) {
        const filePath = uniqueFilePath(folder, attachment.nomeFile, usedNames);
        const attachmentBytes = await fetchAttachmentBytes(mission.idAutMiss, attachment.idDgAllegato);
        zip.addFile(filePath, attachmentBytes);
        downloadedAttachments.push(
          summarizeAttachmentDownload(attachment, filePath, missionDetail, expensesByAttachmentKey)
        );
      }

      zip.addFile(
        `${folder}/missione.json`,
        jsonToBytes(buildMissionSummary(mission, attachments, missionDetail, downloadedAttachments, {
          includeRawDetailApiOriginale,
          detailApiPath
        }))
      );

      currentStep += 1;
      setProgress(currentStep, totalSteps);
      setStatus(`Missione ${mission.idAutMiss} completata: ${attachments.length} allegati.`);
    }

    zip.addFile("export-info.json", jsonToBytes({
      exportedAt: new Date().toISOString(),
      scriptVersion: getScriptVersion(),
      sourceUrl: window.location.href,
      listUrl: getLatestListUrl(),
      includeRawDetailApiOriginale,
      totalMissions: missions.length
    }));

    currentStep += 1;
    setProgress(currentStep, totalSteps);
    setStatus("Genero il file ZIP...");

    const blob = zip.build();
    const fileName = `missioni-${formatStamp()}.zip`;
    triggerDownload(blob, fileName);

    setStatus(`ZIP pronto: ${fileName}`);
  } finally {
    downloadButton.disabled = false;
    refreshButton.disabled = false;
  }
}

function refreshStatus() {
  try {
    const listUrl = getLatestListUrl();
    setStatus(`API lista pronta.\n${listUrl}`);
  } catch (error) {
    setStatus(String(error.message || error));
  }
}

downloadButton.addEventListener("click", () => {
  exportMissionZip().catch((error) => {
    console.error(error);
    setStatus(`Errore:\n${error.message || error}`);
  });
});

refreshButton.addEventListener("click", refreshStatus);
refreshStatus();

return {
  dispose(reason = "reload") {
    console.log(`[TM Export] dispose (${reason})`);
    root.remove();
    style.remove();
  }
};
