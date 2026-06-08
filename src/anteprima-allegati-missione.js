const API_BASE = `${window.location.origin}/appautmis/api`;
const TOKEN_KEY = "appU-Web-token";
const DETAIL_PATH_PATTERN = /^\/appautmis\/listaautmis\/(\d+)\/?$/;
const STYLE_ID = "__tm-attachment-preview-style";
const ENHANCED_ROW_ATTR = "data-tm-preview-enhanced";
const ENHANCED_TARGET_ATTR = "data-tm-preview-target-enhanced";

let missionId = "";
const objectUrls = new Set();
let attachmentsCache = [];
let expensesCache = [];
let generalAttachmentsCache = [];
let mutationObserver = null;
let mountedMissionId = "";
let routeCheckTimer = 0;
let historyPatched = false;
let bootNonce = 0;

document.getElementById(STYLE_ID)?.remove();
document.querySelectorAll(".tm-inline-preview").forEach((element) => element.remove());

const style = document.createElement("style");
style.id = STYLE_ID;
style.textContent = `
  .tm-preview-row {
    cursor: zoom-in;
  }

  .tm-preview-row:hover {
    background: rgba(15, 118, 110, 0.07) !important;
  }

  .tm-preview-target {
    outline: 1px solid rgba(15, 118, 110, 0.22);
    outline-offset: 2px;
  }

  .tm-preview-actions {
    display: inline-flex;
    flex-wrap: wrap;
    gap: 6px;
    align-items: center;
    margin-left: 8px;
    vertical-align: middle;
  }

  .tm-preview-button {
    appearance: none;
    border: 1px solid #0f766e;
    border-radius: 6px;
    min-height: 26px;
    padding: 4px 8px;
    background: #ecfdf5;
    color: #0f5132;
    font: 12px/1.2 ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    font-weight: 750;
    cursor: pointer;
  }

  .tm-preview-button:hover {
    background: #d1fae5;
  }

  .tm-preview-button[disabled] {
    cursor: progress;
    opacity: 0.62;
  }

  .tm-inline-preview {
    background: #ffffff;
  }

  .tm-inline-preview-cell {
    padding: 12px !important;
    border: 1px solid rgba(15, 118, 110, 0.22);
    background: #f8fafc;
    font: 13px/1.45 ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  }

  .tm-inline-preview-cell * {
    box-sizing: border-box;
  }

  .tm-inline-preview-head {
    display: grid;
    grid-template-columns: 1fr auto;
    gap: 12px;
    align-items: center;
    margin-bottom: 10px;
    color: #172033;
  }

  .tm-inline-preview-title {
    min-width: 0;
    margin: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 15px;
    font-weight: 800;
  }

  .tm-inline-preview-actions {
    display: flex;
    gap: 8px;
  }

  .tm-inline-preview button {
    appearance: none;
    border: 0;
    border-radius: 8px;
    min-height: 32px;
    padding: 7px 10px;
    font: inherit;
    font-weight: 750;
    cursor: pointer;
  }

  .tm-inline-preview .tm-primary {
    background: #0f766e;
    color: white;
  }

  .tm-inline-preview .tm-secondary {
    background: #e2e8f0;
    color: #172033;
  }

  .tm-inline-preview-body {
    height: min(520px, 62vh);
    border-radius: 10px;
    background: white;
    border: 1px solid #e2e8f0;
    overflow: hidden;
  }

  .tm-inline-preview-body iframe, .tm-inline-preview-body img, .tm-inline-preview-body pre {
    width: 100%;
    height: 100%;
    margin: 0;
    border: 0;
  }

  .tm-inline-preview-body img {
    display: block;
    object-fit: contain;
    background: #0f172a;
  }

  .tm-inline-preview-body pre {
    padding: 18px;
    overflow: auto;
    white-space: pre-wrap;
  }

  .tm-inline-preview-body .tm-empty {
    display: grid;
    min-height: 220px;
    place-items: center;
    padding: 24px;
    color: #475569;
    text-align: center;
  }
`;

document.documentElement.append(style);

function log(message, ...rest) {
  console.log("[TM Anteprima Allegati]", message, ...rest);
}

function readMissionIdFromLocation() {
  return window.location.pathname.match(DETAIL_PATH_PATTERN)?.[1] ?? "";
}

function getToken() {
  const token = window.localStorage.getItem(TOKEN_KEY);
  if (!token) {
    throw new Error("Token applicativo non trovato in localStorage.");
  }
  return token;
}

async function apiFetch(url, options = {}) {
  const response = await window.fetch(url, {
    credentials: "include",
    ...options,
    headers: {
      Authorization: `Bearer ${getToken()}`,
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
    value = value.base64 ?? value.file ?? value.content ?? value.b64file ?? value.data ?? value;
  }

  if (typeof value !== "string") {
    throw new Error("Risposta file non riconosciuta: contenuto base64 assente.");
  }

  return value.trim().replace(/^data:.*;base64,/, "").replace(/\s+/g, "");
}

function base64ToBytes(payload) {
  const binary = window.atob(normalizeBase64Payload(payload));
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

function pickFirst(object, names, fallback = null) {
  for (const name of names) {
    if (object?.[name] !== undefined && object[name] !== null && String(object[name]).trim() !== "") {
      return object[name];
    }
  }
  return fallback;
}

function normalizeText(value) {
  return String(value ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function normalizeNumber(value) {
  const cleaned = String(value ?? "")
    .replace(/\s+/g, "")
    .replace(/[€$]/g, "");
  const normalized = cleaned.includes(",")
    ? cleaned.replace(/\./g, "").replace(",", ".")
    : cleaned;
  const number = Number.parseFloat(normalized);
  return Number.isFinite(number) ? number : null;
}

function normalizeDateForUi(value) {
  const raw = String(value ?? "");
  const isoMatch = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoMatch) {
    return `${isoMatch[3]}/${isoMatch[2]}/${isoMatch[1]}`;
  }
  return raw.trim();
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

function normalizeAttachment(attachment, index) {
  const id = pickFirst(attachment, ["idDgAllegato", "idAllegato", "id", "idDg", "idDocumento"]);
  const name = String(pickFirst(
    attachment,
    ["nomeFile", "fileName", "filename", "nome", "nomeAllegato", "dsAllegato", "descrizione"],
    `allegato-${index + 1}`
  ));
  const note = String(pickFirst(attachment, ["notaFile", "dsAllegato", "descrizione", "tipo", "cdTipoAllegato"], ""));
  const rowKey = String(pickFirst(attachment, ["nrRiga", "nrRigaRef", "riga", "cdAltKey"], ""));

  return {
    raw: attachment,
    id,
    name,
    note,
    rowKey,
    searchable: [
      name,
      note,
      rowKey,
      pickFirst(attachment, ["cdTipoAllegato", "tipo", "percorsoZip"], "")
    ].map(normalizeText).filter((value) => value.length >= 3)
  };
}

function normalizeExpense(expense) {
  return {
    raw: expense,
    cdSpesa: String(expense?.cdSpesa ?? ""),
    dsSpesa: String(expense?.dsSpesa ?? ""),
    dtSostenimentoUi: normalizeDateForUi(expense?.dtSostenimento),
    importoEuro: normalizeNumber(expense?.importoEuro),
    importoValuta: normalizeNumber(expense?.importoValuta),
    cdAllegato: String(expense?.cdAllegato ?? "").trim(),
    nrRiga: String(expense?.nrRiga ?? "")
  };
}

async function fetchAttachments() {
  const response = await apiFetch(`${API_BASE}/allegati/${encodeURIComponent(missionId)}`);
  const data = await response.json();
  if (!Array.isArray(data)) {
    return [];
  }
  return data.map(normalizeAttachment).filter((attachment) => attachment.id !== null && attachment.id !== undefined);
}

async function fetchMissionDetails() {
  const response = await apiFetch(`${API_BASE}/listaautmis/${encodeURIComponent(missionId)}`);
  return response.json();
}

function resolveExpensesWithAttachments(detail, attachments) {
  const attachmentsByKey = new Map();
  for (const attachment of attachments) {
    const key = String(attachment.raw?.cdAltKey ?? "").trim();
    if (key) {
      const current = attachmentsByKey.get(key) ?? [];
      current.push(attachment);
      attachmentsByKey.set(key, current);
    }
  }

  return asArray(detail?.dg02Dg?.dg16XSpesa)
    .map(normalizeExpense)
    .map((expense) => ({
      ...expense,
      attachments: attachmentsByKey.get(expense.cdAllegato) ?? []
    }))
    .filter((expense) => expense.attachments.length);
}

function resolveGeneralAttachments(attachments) {
  return attachments.filter((attachment) => !String(attachment.raw?.cdAltKey ?? "").trim());
}

async function fetchAttachmentBlob(attachment) {
  const response = await apiFetch(
    `${API_BASE}/allegati/${encodeURIComponent(missionId)}/${encodeURIComponent(attachment.id)}`
  );
  const bytes = base64ToBytes(await response.text());
  const contentType = inferContentType(attachment.name, bytes);
  return new Blob([bytes], { type: contentType });
}

function inferContentType(fileName, bytes) {
  const lowerName = fileName.toLowerCase();
  if (bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46) {
    return "application/pdf";
  }
  if (bytes[0] === 0xff && bytes[1] === 0xd8) {
    return "image/jpeg";
  }
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) {
    return "image/png";
  }
  if (lowerName.endsWith(".gif")) {
    return "image/gif";
  }
  if (lowerName.endsWith(".webp")) {
    return "image/webp";
  }
  if (lowerName.endsWith(".txt") || lowerName.endsWith(".csv") || lowerName.endsWith(".log")) {
    return "text/plain";
  }
  if (lowerName.endsWith(".json")) {
    return "application/json";
  }
  return "application/octet-stream";
}

function makePreviewButton(attachment, previewAnchor) {
  const button = document.createElement("button");
  button.className = "tm-preview-button";
  button.type = "button";
  button.textContent = "Anteprima";
  button.title = `Anteprima ${attachment.name}`;
  button.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    previewAttachment(attachment, previewAnchor, button);
  });
  return button;
}

function getCellText(row, title) {
  const cell = row.querySelector(`td[title="${title}"], [role="cell"][title="${title}"]`);
  return (cell?.innerText || cell?.textContent || "").replace(/\s+/g, " ").trim();
}

function findCell(row, title) {
  return row.querySelector(`td[title="${title}"], [role="cell"][title="${title}"]`);
}

function rowMatchesExpense(row, expense) {
  const tipo = normalizeText(getCellText(row, "Tipo"));
  const date = normalizeText(getCellText(row, "Sost. Il"));
  const note = normalizeText(getCellText(row, "Note"));
  const euro = normalizeNumber(getCellText(row, "Euro"));
  const importo = normalizeNumber(getCellText(row, "Importo"));

  const codeMatches = tipo === normalizeText(expense.cdSpesa);
  const dateMatches = date === normalizeText(expense.dtSostenimentoUi);
  const noteMatches = note === normalizeText(expense.dsSpesa);
  const amountMatches =
    (euro !== null && expense.importoEuro !== null && Math.abs(euro - expense.importoEuro) < 0.001) ||
    (importo !== null && expense.importoValuta !== null && Math.abs(importo - expense.importoValuta) < 0.001);

  return codeMatches && dateMatches && noteMatches && amountMatches;
}

function enhanceExpenseRow(row, expense) {
  if (row.getAttribute(ENHANCED_ROW_ATTR) === "1") {
    return false;
  }

  const allegatiCell = findCell(row, "Allegati");
  if (!allegatiCell) {
    return false;
  }

  const actions = document.createElement("span");
  actions.className = "tm-preview-actions";
  for (const attachment of expense.attachments) {
    actions.append(makePreviewButton(attachment, row));
  }
  allegatiCell.append(actions);

  row.classList.add("tm-preview-row");
  row.setAttribute(ENHANCED_ROW_ATTR, "1");
  if (expense.attachments.length === 1) {
    row.addEventListener("click", (event) => {
      const target = event.target;
      if (target instanceof Element && target.closest("button, a, input, select, textarea, .tm-preview-actions")) {
        return;
      }
      previewAttachment(expense.attachments[0], row, actions.querySelector(".tm-preview-button"));
    });
  }

  return true;
}

function enhanceExpenseRows() {
  let enhancedCount = 0;
  const rows = Array.from(document.querySelectorAll("tr.ant-table-row, tr"));
  const usedRows = new Set();

  for (const expense of expensesCache) {
    const matchingRow = rows.find((row) =>
      !usedRows.has(row) &&
      !row.classList.contains("tm-inline-preview") &&
      findCell(row, "Allegati") &&
      rowMatchesExpense(row, expense)
    );

    if (matchingRow && enhanceExpenseRow(matchingRow, expense)) {
      usedRows.add(matchingRow);
      enhancedCount += 1;
    }
  }

  return enhancedCount;
}

function enhanceGeneralAttachmentsButton() {
  if (!generalAttachmentsCache.length) {
    return 0;
  }

  const toolbarButton = document.querySelector("#button-open-allegati");
  if (!toolbarButton || toolbarButton.getAttribute(ENHANCED_ROW_ATTR) === "1") {
    return 0;
  }

  const host = toolbarButton.parentElement || toolbarButton;
  const actions = document.createElement("span");
  actions.className = "tm-preview-actions";

  for (const attachment of generalAttachmentsCache) {
    actions.append(makePreviewButton(attachment, toolbarButton));
  }

  host.append(actions);
  toolbarButton.setAttribute(ENHANCED_ROW_ATTR, "1");
  return generalAttachmentsCache.length;
}

function renderUnsupportedPreview(previewBody, fileName, contentType) {
  const box = document.createElement("div");
  box.className = "tm-empty";
  box.innerHTML = `
    <div>
      <strong>Anteprima non disponibile per questo formato.</strong>
      <p>File: ${escapeHtml(fileName)}</p>
      <p>Tipo rilevato: ${escapeHtml(contentType || "sconosciuto")}</p>
      <p>Puoi provare con "Apri scheda"; se il browser non supporta il formato, proporra il download.</p>
    </div>
  `;
  previewBody.replaceChildren(box);
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function removeExistingInlinePreview(row) {
  const next = row.nextElementSibling;
  if (next?.classList.contains("tm-inline-preview")) {
    next.remove();
    return true;
  }
  return false;
}

function createInlinePreview(row, attachment, url) {
  removeExistingInlinePreview(row);

  const isTableRow = row.tagName.toLowerCase() === "tr";
  const previewRow = document.createElement(isTableRow ? "tr" : "div");
  previewRow.className = "tm-inline-preview";
  previewRow.dataset.attachmentId = String(attachment.id);

  const cell = document.createElement(isTableRow ? "td" : "div");
  cell.className = "tm-inline-preview-cell";

  if (isTableRow) {
    const columnCount = Math.max(1, row.querySelectorAll("td, th, [role='cell'], [role='columnheader']").length);
    cell.colSpan = columnCount;
  }

  cell.innerHTML = `
    <div class="tm-inline-preview-head">
      <p class="tm-inline-preview-title"></p>
      <div class="tm-inline-preview-actions">
        <button class="tm-secondary tm-open-tab" type="button">Apri scheda</button>
        <button class="tm-primary tm-close" type="button">Chiudi</button>
      </div>
    </div>
    <div class="tm-inline-preview-body"></div>
  `;

  cell.querySelector(".tm-inline-preview-title").textContent = attachment.name;
  cell.querySelector(".tm-open-tab").addEventListener("click", () => {
    window.open(url, "_blank", "noopener");
  });
  cell.querySelector(".tm-close").addEventListener("click", () => {
    previewRow.remove();
  });

  previewRow.append(cell);
  if (isTableRow) {
    row.after(previewRow);
  } else {
    row.insertAdjacentElement("afterend", previewRow);
  }
  return cell.querySelector(".tm-inline-preview-body");
}

async function previewAttachment(attachment, row, button) {
  const existingPreview = row.nextElementSibling;
  if (existingPreview?.classList.contains("tm-inline-preview")) {
    if (existingPreview.dataset.attachmentId === String(attachment.id)) {
      existingPreview.remove();
      return;
    }
    existingPreview.remove();
  }

  if (button) {
    button.disabled = true;
    button.textContent = "Apro...";
  }

  try {
    const blob = await fetchAttachmentBlob(attachment);
    const url = window.URL.createObjectURL(blob);
    objectUrls.add(url);
    const previewBody = createInlinePreview(row, attachment, url);

    if (blob.type === "application/pdf") {
      const frame = document.createElement("iframe");
      frame.title = attachment.name;
      frame.src = url;
      previewBody.replaceChildren(frame);
    } else if (blob.type.startsWith("image/")) {
      const image = document.createElement("img");
      image.alt = attachment.name;
      image.src = url;
      previewBody.replaceChildren(image);
    } else if (blob.type.startsWith("text/") || blob.type === "application/json") {
      const pre = document.createElement("pre");
      pre.textContent = await blob.text();
      previewBody.replaceChildren(pre);
    } else {
      renderUnsupportedPreview(previewBody, attachment.name, blob.type);
    }
  } catch (error) {
    log(error.message || String(error));
  } finally {
    if (button) {
      button.disabled = false;
      button.textContent = "Anteprima";
    }
  }
}

function scheduleEnhance() {
  window.clearTimeout(scheduleEnhance.timer);
  scheduleEnhance.timer = window.setTimeout(() => {
    const enhancedCount = enhanceExpenseRows() + enhanceGeneralAttachmentsButton();
    if (enhancedCount) {
      log(`Punti anteprima aggiornati: ${enhancedCount}`);
    }
  }, 150);
}
scheduleEnhance.timer = 0;

async function boot() {
  const activeMissionId = missionId;
  const activeBootNonce = ++bootNonce;
  try {
    const [attachments, detail] = await Promise.all([
      fetchAttachments(),
      fetchMissionDetails()
    ]);
    if (activeBootNonce !== bootNonce || activeMissionId !== mountedMissionId) {
      return;
    }
    attachmentsCache = attachments;
    expensesCache = resolveExpensesWithAttachments(detail, attachments);
    generalAttachmentsCache = resolveGeneralAttachments(attachments);
    log(`Allegati trovati per missione ${missionId}: ${attachmentsCache.length}`);
    log(`Spese con allegati associati: ${expensesCache.length}`);
    log(`Allegati generali di missione: ${generalAttachmentsCache.length}`);
    scheduleEnhance();
    mutationObserver = new MutationObserver(scheduleEnhance);
    mutationObserver.observe(document.body, { childList: true, subtree: true });
  } catch (error) {
    log(error.message || String(error));
  }
}

function clearEnhancedUi() {
  document.querySelectorAll(".tm-inline-preview").forEach((element) => element.remove());
  document.querySelectorAll(".tm-preview-actions").forEach((element) => element.remove());
  document.querySelectorAll(`[${ENHANCED_ROW_ATTR}]`).forEach((element) => {
    element.removeAttribute(ENHANCED_ROW_ATTR);
    element.classList.remove("tm-preview-row");
  });
  document.querySelectorAll(`[${ENHANCED_TARGET_ATTR}]`).forEach((element) => {
    element.removeAttribute(ENHANCED_TARGET_ATTR);
    element.classList.remove("tm-preview-target");
  });
}

function unmountMissionPreview() {
  bootNonce += 1;
  missionId = "";
  mountedMissionId = "";
  attachmentsCache = [];
  expensesCache = [];
  generalAttachmentsCache = [];
  mutationObserver?.disconnect();
  mutationObserver = null;
  clearEnhancedUi();
  for (const url of objectUrls) {
    window.URL.revokeObjectURL(url);
  }
  objectUrls.clear();
}

function syncRouteLifecycle() {
  const nextMissionId = readMissionIdFromLocation();

  if (!nextMissionId) {
    if (mountedMissionId) {
      log("Uscita dalla singola missione, pulizia anteprime.");
      unmountMissionPreview();
    }
    return;
  }

  if (mountedMissionId === nextMissionId) {
    return;
  }

  if (mountedMissionId && mountedMissionId !== nextMissionId) {
    unmountMissionPreview();
  }

  missionId = nextMissionId;
  mountedMissionId = nextMissionId;
  log(`Aggancio anteprima alla missione ${missionId}.`);
  void boot();
}

function scheduleRouteSync() {
  window.clearTimeout(routeCheckTimer);
  routeCheckTimer = window.setTimeout(syncRouteLifecycle, 80);
}

function patchHistoryForRouteChanges() {
  if (historyPatched) {
    return;
  }

  const wrapHistoryMethod = (methodName) => {
    const original = window.history[methodName];
    window.history[methodName] = function patchedHistoryMethod(...args) {
      const result = original.apply(this, args);
      scheduleRouteSync();
      return result;
    };
  };

  wrapHistoryMethod("pushState");
  wrapHistoryMethod("replaceState");
  historyPatched = true;
}

document.addEventListener("keydown", handleKeydown);
window.addEventListener("popstate", scheduleRouteSync);
window.addEventListener("hashchange", scheduleRouteSync);
patchHistoryForRouteChanges();

function handleKeydown(event) {
  if (event.key === "Escape") {
    document.querySelectorAll(".tm-inline-preview").forEach((element) => element.remove());
  }
}

syncRouteLifecycle();

return {
  dispose() {
    document.removeEventListener("keydown", handleKeydown);
    window.removeEventListener("popstate", scheduleRouteSync);
    window.removeEventListener("hashchange", scheduleRouteSync);
    window.clearTimeout(routeCheckTimer);
    unmountMissionPreview();
    style.remove();
  }
};
