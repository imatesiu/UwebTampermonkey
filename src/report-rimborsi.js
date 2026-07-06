const API_BASE = `${window.location.origin}/appautmis/api`;
const LIST_ENDPOINT_FRAGMENT = "/estrailistaautmissionipercipienteconstatopagamento";
const TOKEN_KEY = "appU-Web-token";
const ROOT_ID = "__tm-rimborsi-report";
const STYLE_ID = "__tm-rimborsi-report-style";
const POSITION_STORAGE_KEY = "tm-report-rimborsi-position";
const ELIGIBLE_STATUSES = ["emesso ordinativo", "pagato"];

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
    width: min(320px, calc(100vw - 32px));
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
    cursor: move;
    touch-action: none;
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
    background: linear-gradient(135deg, #0ea5e9, #2563eb);
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
    min-height: 68px;
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
    <p class="tm-title">Report rimborsi CSV + PDF <span class="tm-version">v${getScriptVersion()}</span></p>
    <p class="tm-subtitle">Confronta spese a consuntivo e spese rimborsate e genera anche un PDF leggibile per missione.</p>
  </div>
  <div class="tm-body">
    <div class="tm-actions">
      <button class="tm-primary" type="button">Scarica report CSV + PDF</button>
      <button class="tm-secondary" type="button">Aggiorna stato</button>
      <button class="tm-stop" type="button" disabled>Stop</button>
    </div>
    <label class="tm-option">
      <input class="tm-export-all-missions" type="checkbox" />
      <span>
        <strong>Scarica tutto l'archivio missioni</strong>
        Se attivato, ignora i filtri della pagina e scarica tutte le missioni accessibili all'utente.
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
const stopButton = root.querySelector(".tm-stop");
const exportAllMissionsCheckbox = root.querySelector(".tm-export-all-missions");
const statusBox = root.querySelector(".tm-status");
const progressBar = root.querySelector(".tm-progress-bar");
const headerBox = root.querySelector(".tm-head");

exportAllMissionsCheckbox.checked = false;

let activeExportRun = null;
let dragState = null;

function setStatus(message) {
  statusBox.textContent = message;
  console.log("[TM Report Rimborsi]", message);
}

function setProgress(current, total) {
  const safeTotal = total > 0 ? total : 1;
  const percent = Math.max(0, Math.min(100, Math.round((current / safeTotal) * 100)));
  progressBar.style.width = `${percent}%`;
}

function formatStamp(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${year}${month}${day}-${hours}${minutes}`;
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function loadSavedPosition() {
  try {
    const raw = window.localStorage.getItem(POSITION_STORAGE_KEY);
    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw);
    if (typeof parsed?.left !== "number" || typeof parsed?.top !== "number") {
      return null;
    }

    return parsed;
  } catch (_error) {
    return null;
  }
}

function savePosition(position) {
  try {
    window.localStorage.setItem(POSITION_STORAGE_KEY, JSON.stringify(position));
  } catch (_error) {
    // Ignore storage failures.
  }
}

function applyPanelPosition(position) {
  const maxLeft = Math.max(0, window.innerWidth - root.offsetWidth);
  const maxTop = Math.max(0, window.innerHeight - root.offsetHeight);
  const left = clamp(position.left, 0, maxLeft);
  const top = clamp(position.top, 0, maxTop);

  root.style.left = `${left}px`;
  root.style.top = `${top}px`;
  root.style.right = "auto";
  root.style.bottom = "auto";

  savePosition({ left, top });
}

function applyInitialPosition() {
  const savedPosition = loadSavedPosition();
  if (savedPosition) {
    applyPanelPosition(savedPosition);
    return;
  }

  const defaultTop = Math.max(16, window.innerHeight - root.offsetHeight - 16);
  applyPanelPosition({ left: 16, top: defaultTop });
}

function handlePointerMove(event) {
  if (!dragState) {
    return;
  }

  applyPanelPosition({
    left: event.clientX - dragState.offsetX,
    top: event.clientY - dragState.offsetY
  });
}

function stopDragging() {
  if (!dragState) {
    return;
  }

  headerBox.releasePointerCapture?.(dragState.pointerId);
  dragState = null;
}

function startDragging(event) {
  if (event.button !== 0) {
    return;
  }

  const rect = root.getBoundingClientRect();
  dragState = {
    pointerId: event.pointerId,
    offsetX: event.clientX - rect.left,
    offsetY: event.clientY - rect.top
  };

  headerBox.setPointerCapture?.(event.pointerId);
  event.preventDefault();
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

function getLatestListUrlSafe() {
  try {
    return getLatestListUrl();
  } catch (_error) {
    return null;
  }
}

function delay(ms) {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

function createExportRun() {
  return {
    cancelled: false,
    controllers: new Set()
  };
}

function beginAbortableRequest(run) {
  if (!run || run.cancelled) {
    throw new Error("Export interrotto dall'utente.");
  }

  const controller = new AbortController();
  run.controllers.add(controller);
  return controller;
}

function endAbortableRequest(run, controller) {
  if (run && controller) {
    run.controllers.delete(controller);
  }
}

function cancelActiveExport() {
  if (!activeExportRun) {
    return false;
  }

  activeExportRun.cancelled = true;
  for (const controller of activeExportRun.controllers) {
    controller.abort();
  }
  activeExportRun.controllers.clear();
  return true;
}

function ensureExportNotCancelled(run) {
  if (run?.cancelled) {
    throw new Error("Export interrotto dall'utente.");
  }
}

async function apiFetch(url, options = {}) {
  const exportRun = options.exportRun ?? null;
  const requestController = beginAbortableRequest(exportRun);
  const token = getToken();
  try {
    const response = await window.fetch(url, {
      credentials: "include",
      ...options,
      signal: requestController.signal,
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
  } catch (error) {
    if (requestController.signal.aborted || error?.name === "AbortError") {
      throw new Error("Export interrotto dall'utente.");
    }
    throw error;
  } finally {
    endAbortableRequest(exportRun, requestController);
  }
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

async function fetchMissionList(exportRun = null) {
  const url = getLatestListUrl();
  const response = await apiFetch(url, { exportRun });
  const data = await response.json();

  if (!Array.isArray(data)) {
    throw new Error("La lista missioni non e un array.");
  }

  return data;
}

function buildArchiveListUrl() {
  const currentUrl = getLatestListUrlSafe();
  const fallbackEndDate = "Sat, 02 Feb 2222 00:00:00 GMT";
  let dtFinMis = fallbackEndDate;

  if (currentUrl) {
    try {
      const parsed = new URL(currentUrl);
      dtFinMis = parsed.searchParams.get("dtFinMis") || fallbackEndDate;
    } catch (_error) {
      dtFinMis = fallbackEndDate;
    }
  }

  const archiveUrl = new URL(`${API_BASE}${LIST_ENDPOINT_FRAGMENT}`);
  archiveUrl.searchParams.set("dtIniMis", new Date(Date.UTC(1970, 0, 1, 0, 0, 0)).toUTCString());
  archiveUrl.searchParams.set("dtFinMis", dtFinMis);
  return archiveUrl.toString();
}

async function fetchMissionArchiveList(exportRun = null) {
  const url = buildArchiveListUrl();
  const response = await apiFetch(url, { exportRun });
  const data = await response.json();

  if (!Array.isArray(data)) {
    throw new Error("La lista archivio missioni non e un array.");
  }

  return {
    url,
    missions: data
  };
}

function findMissionListTable() {
  return Array.from(document.querySelectorAll("table[nz-table-content]")).find((table) => {
    const headerText = table.querySelector("thead")?.innerText ?? "";
    return /Numero richiesta/i.test(headerText) && /Motivazione/i.test(headerText);
  }) ?? null;
}

function getMissionTableColumnIndexes(table) {
  const headers = Array.from(table.querySelectorAll("thead th")).map((cell) =>
    (cell.innerText || "").replace(/\s+/g, " ").trim()
  );

  return {
    id: headers.findIndex((text) => /numero richiesta/i.test(text)),
    stato: headers.findIndex((text) => /^stato$/i.test(text))
  };
}

function getVisibleMissionIds() {
  const table = findMissionListTable();
  if (!table) {
    throw new Error("Non trovo la tabella missioni visibile nella pagina.");
  }

  const columnIndexes = getMissionTableColumnIndexes(table);
  const idColumnIndex = columnIndexes.id >= 0 ? columnIndexes.id : 0;

  const rows = Array.from(table.querySelectorAll("tbody tr"));
  const ids = rows
    .map((row) => row.querySelectorAll("td")[idColumnIndex]?.innerText ?? "")
    .map((value) => value.replace(/\s+/g, " ").trim())
    .map((value) => value.match(/\d+/)?.[0] ?? "")
    .filter(Boolean);

  return [...new Set(ids)];
}

function getVisibleMissionStatuses() {
  const table = findMissionListTable();
  if (!table) {
    throw new Error("Non trovo la tabella missioni visibile nella pagina.");
  }

  const columnIndexes = getMissionTableColumnIndexes(table);
  const idColumnIndex = columnIndexes.id >= 0 ? columnIndexes.id : 0;
  const statusColumnIndex = columnIndexes.stato;

  if (statusColumnIndex < 0) {
    throw new Error("Non trovo la colonna Stato nella tabella missioni.");
  }

  const rows = Array.from(table.querySelectorAll("tbody tr"));
  const statusById = new Map();

  for (const row of rows) {
    const cells = Array.from(row.querySelectorAll("td"));
    const idCellText = cells[idColumnIndex]?.innerText ?? "";
    const statusCellText = cells[statusColumnIndex]?.innerText ?? "";
    const missionId = idCellText.replace(/\s+/g, " ").trim().match(/\d+/)?.[0] ?? "";
    const statusText = statusCellText.replace(/\s+/g, " ").trim();

    if (missionId && statusText) {
      statusById.set(missionId, statusText);
    }
  }

  return statusById;
}

function findMissionPagination() {
  return Array.from(document.querySelectorAll("ul, ol")).find((list) => {
    const text = (list.innerText || "").replace(/\s+/g, " ").trim();
    return /\bSchede\b/i.test(text) && /\/\s*pagina/i.test(text);
  }) ?? null;
}

function getMissionPaginationInfo() {
  const pagination = findMissionPagination();
  if (!pagination) {
    return null;
  }

  const text = (pagination.innerText || "").replace(/\s+/g, " ").trim();
  const match = text.match(/(\d+)\s+di\s+(\d+)\s+Schede/i);
  if (!match) {
    return null;
  }

  return {
    visibleCount: Number.parseInt(match[1], 10),
    totalCount: Number.parseInt(match[2], 10)
  };
}

function findPaginationButton(kind) {
  const pagination = findMissionPagination();
  if (!pagination) {
    return null;
  }

  const titlePattern = kind === "next" ? /successiva/i : /precedente/i;
  const ariaPattern = kind === "next" ? /^next$/i : /^previous$/i;

  return Array.from(pagination.querySelectorAll("button, a, li, span, div")).find((element) => {
    const title = element.getAttribute?.("title") ?? "";
    const ariaLabel = element.getAttribute?.("aria-label") ?? "";
    const text = (element.textContent || "").replace(/\s+/g, " ").trim();
    return titlePattern.test(title) || ariaPattern.test(ariaLabel) || ariaPattern.test(text);
  }) ?? null;
}

function isPaginationButtonDisabled(element) {
  if (!element) {
    return true;
  }

  if (element instanceof HTMLButtonElement && element.disabled) {
    return true;
  }

  const host = element.closest?.("li, button, a, span, div") ?? element;
  const className = typeof host.className === "string" ? host.className : "";
  const ariaDisabled = host.getAttribute?.("aria-disabled");
  return /\bdisabled\b/i.test(className) || ariaDisabled === "true";
}

function getVisibleMissionEntries() {
  const table = findMissionListTable();
  if (!table) {
    throw new Error("Non trovo la tabella missioni visibile nella pagina.");
  }

  const columnIndexes = getMissionTableColumnIndexes(table);
  const idColumnIndex = columnIndexes.id >= 0 ? columnIndexes.id : 0;
  const statusColumnIndex = columnIndexes.stato;

  if (statusColumnIndex < 0) {
    throw new Error("Non trovo la colonna Stato nella tabella missioni.");
  }

  return Array.from(table.querySelectorAll("tbody tr"))
    .map((row) => Array.from(row.querySelectorAll("td")))
    .map((cells) => {
      const idText = cells[idColumnIndex]?.innerText ?? "";
      const statusText = cells[statusColumnIndex]?.innerText ?? "";
      const missionId = idText.replace(/\s+/g, " ").trim().match(/\d+/)?.[0] ?? "";
      const statoVisibile = statusText.replace(/\s+/g, " ").trim();
      return {
        idAutMiss: missionId,
        statoVisibile
      };
    })
    .filter((entry) => entry.idAutMiss);
}

function getVisibleMissionSignature() {
  return getVisibleMissionEntries()
    .map((entry) => `${entry.idAutMiss}:${entry.statoVisibile}`)
    .join("|");
}

async function waitForVisibleMissionSignatureChange(previousSignature, timeoutMs = 15000) {
  const startedAt = Date.now();

  while ((Date.now() - startedAt) < timeoutMs) {
    await delay(200);
    try {
      const currentSignature = getVisibleMissionSignature();
      if (currentSignature && currentSignature !== previousSignature) {
        return currentSignature;
      }
    } catch (_error) {
      // Wait until the table becomes stable again.
    }
  }

  throw new Error("La tabella missioni non si aggiorna dopo il cambio pagina.");
}

async function clickPaginationButton(kind, previousSignature) {
  const button = findPaginationButton(kind);
  if (!button || isPaginationButtonDisabled(button)) {
    return false;
  }

  button.click();
  await waitForVisibleMissionSignatureChange(previousSignature);
  await delay(250);
  return true;
}

async function collectVisibleMissionEntriesAcrossPages() {
  const initialSignature = getVisibleMissionSignature();
  const seenPageSignatures = new Set();
  const entriesById = new Map();
  let currentSignature = initialSignature;

  while (currentSignature && !seenPageSignatures.has(currentSignature)) {
    seenPageSignatures.add(currentSignature);

    for (const entry of getVisibleMissionEntries()) {
      if (!entriesById.has(entry.idAutMiss)) {
        entriesById.set(entry.idAutMiss, entry);
      }
    }

    const moved = await clickPaginationButton("next", currentSignature);
    if (!moved) {
      break;
    }

    currentSignature = getVisibleMissionSignature();
  }

  while (getVisibleMissionSignature() !== initialSignature) {
    const signatureBeforeBack = getVisibleMissionSignature();
    const movedBack = await clickPaginationButton("previous", signatureBeforeBack);
    if (!movedBack) {
      break;
    }
  }

  return [...entriesById.values()];
}

function dedupeMissionsById(missions) {
  const map = new Map();
  for (const mission of missions) {
    const id = String(mission?.idAutMiss ?? "").trim();
    if (!id) {
      continue;
    }

    if (!map.has(id)) {
      map.set(id, mission);
    }
  }

  return [...map.values()];
}

async function resolveMissionsForExport(includeAllMissions, exportRun) {
  const visibleMissionIds = getVisibleMissionIds();
  const visibleStatuses = getVisibleMissionStatuses();
  const apiMissions = dedupeMissionsById(await fetchMissionList(exportRun).catch(() => []));
  const paginationInfo = getMissionPaginationInfo();

  if (includeAllMissions) {
    const archiveResult = await fetchMissionArchiveList(exportRun);
    const allVisibleEntries = await collectVisibleMissionEntriesAcrossPages();
    const visibleEntriesById = new Map(
      allVisibleEntries.map((entry) => [String(entry.idAutMiss), entry])
    );
    const allMissions = dedupeMissionsById(archiveResult.missions).map((mission) => {
      const missionId = String(mission.idAutMiss ?? "");
      const statoVisibile = visibleEntriesById.get(missionId)?.statoVisibile ?? null;
      return statoVisibile
        ? { ...mission, statoVisibile }
        : mission;
    });
    const missionIdsFromApi = new Set(allMissions.map((mission) => String(mission.idAutMiss ?? "")));

    for (const entry of allVisibleEntries) {
      if (!missionIdsFromApi.has(String(entry.idAutMiss))) {
        allMissions.push({
          idAutMiss: entry.idAutMiss,
          statoVisibile: entry.statoVisibile
        });
      }
    }

    return {
      missions: allMissions,
      source: "archive",
      visibleMissionIds: allVisibleEntries.map((entry) => entry.idAutMiss),
      totalMissionCount: Math.max(paginationInfo?.totalCount ?? 0, allMissions.length),
      listUrlUsed: archiveResult.url
    };
  }

  if (!visibleMissionIds.length) {
    throw new Error("Non trovo missioni visibili nella tabella corrente.");
  }

  const visibleMissionIdSet = new Set(visibleMissionIds);
  const filteredMissions = apiMissions
    .filter((mission) => visibleMissionIdSet.has(String(mission.idAutMiss ?? "")))
    .map((mission) => {
      const missionId = String(mission.idAutMiss ?? "");
      const statoVisibile = visibleStatuses.get(missionId) ?? null;
      return statoVisibile
        ? { ...mission, statoVisibile }
        : mission;
    });

  if (!filteredMissions.length) {
    throw new Error("Non riesco a leggere le missioni visibili nella tabella corrente.");
  }

  return {
    missions: filteredMissions,
    source: "visible",
    visibleMissionIds,
    totalMissionCount: paginationInfo?.totalCount ?? filteredMissions.length,
    listUrlUsed: getLatestListUrlSafe()
  };
}

function buildMissionDetailUrl(idAutMiss) {
  return `${API_BASE}/listaautmis/${encodeURIComponent(idAutMiss)}`;
}

async function fetchMissionDetails(idAutMiss, exportRun = null) {
  const response = await apiFetch(buildMissionDetailUrl(idAutMiss), { exportRun });
  return response.json();
}

function buildPaidMissionDetailUrl(idAutMiss) {
  return `${API_BASE}/getmisfromautmis?idDg=${encodeURIComponent(idAutMiss)}`;
}

async function fetchPaidMissionDetails(idAutMiss, exportRun = null) {
  const response = await apiFetch(buildPaidMissionDetailUrl(idAutMiss), { exportRun });
  return response.json();
}

function normalizeText(value) {
  return String(value ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function derivePaymentStatusLabel(statoPagamento) {
  if (!statoPagamento || typeof statoPagamento !== "object" || Array.isArray(statoPagamento)) {
    return null;
  }

  if (statoPagamento.pagataCedolino === true || statoPagamento.dtRiscontro) {
    return "Pagato";
  }

  if (statoPagamento.dtEmissioneOrdinativo || statoPagamento.dtTrasmissioneOrdinativo) {
    return "Emesso ordinativo";
  }

  return null;
}

function extractMissionStatuses(mission, missionDetail = null, paidMissionDetail = null) {
  const dg = missionDetail?.dg02Dg ?? {};
  const paidDg = paidMissionDetail?.dg02Dg ?? {};

  return [
    mission?.statoVisibile,
    derivePaymentStatusLabel(mission?.statoPagamento),
    mission?.statoPagamento,
    mission?.stato,
    dg.statoDg,
    dg.stato,
    dg.dg16XMissione?.stato,
    dg.dg16XMissione?.statoMissione,
    paidDg.statoDg,
    paidDg.stato,
    paidDg.dg16XMissione?.stato,
    paidDg.dg16XMissione?.statoMissione
  ]
    .map(normalizeText)
    .filter(Boolean);
}

function isEligibleMissionStatus(mission, missionDetail = null, paidMissionDetail = null) {
  return extractMissionStatuses(mission, missionDetail, paidMissionDetail)
    .some((status) => ELIGIBLE_STATUSES.includes(status));
}

async function inspectMissionForReport(mission, exportRun, cache = new Map(), options = {}) {
  const deepInspection = options.deepInspection === true;
  const missionId = String(mission?.idAutMiss ?? "").trim();
  if (!missionId) {
    return {
      eligible: false,
      missionDetail: null,
      paidMissionDetail: null
    };
  }

  if (cache.has(missionId)) {
    return cache.get(missionId);
  }

  let missionDetail = null;
  let paidMissionDetail = null;
  let eligible = isEligibleMissionStatus(mission);

  if (deepInspection || !eligible) {
    missionDetail = await fetchMissionDetails(missionId, exportRun);

    try {
      paidMissionDetail = await fetchPaidMissionDetails(missionId, exportRun);
    } catch (_error) {
      paidMissionDetail = null;
    }

    eligible = isEligibleMissionStatus(mission, missionDetail, paidMissionDetail);
  }

  const result = {
    eligible,
    missionDetail,
    paidMissionDetail
  };
  cache.set(missionId, result);
  return result;
}

async function countEligibleMissions(missions, exportRun, options = {}) {
  const deepInspection = options.deepInspection === true;
  const cache = options.cache ?? new Map();

  if (!deepInspection) {
    return missions.filter((mission) => isEligibleMissionStatus(mission)).length;
  }

  let count = 0;
  for (const mission of missions) {
    ensureExportNotCancelled(exportRun);
    const inspection = await inspectMissionForReport(mission, exportRun, cache, { deepInspection: true });
    if (inspection.eligible) {
      count += 1;
    }
  }
  return count;
}

function parseAmount(value) {
  if (value == null || value === "") {
    return null;
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  const normalized = String(value)
    .trim()
    .replace(/\s+/g, "")
    .replace(/\.(?=\d{3}(?:\D|$))/g, "")
    .replace(",", ".");

  const parsed = Number.parseFloat(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function formatAmount(value) {
  const parsed = parseAmount(value);
  return parsed == null ? "" : parsed.toFixed(2);
}

function computeDelta(left, right) {
  const leftAmount = parseAmount(left);
  const rightAmount = parseAmount(right);
  if (leftAmount == null || rightAmount == null) {
    return "";
  }

  return (rightAmount - leftAmount).toFixed(2);
}

function simplifyExpense(expense, source) {
  return {
    origine: source,
    idSpesa: expense?.idXSpesa ?? expense?.idXPrevSpesa ?? null,
    idDgRef: expense?.idDgRef ?? null,
    nrRiga: expense?.nrRiga ?? null,
    nrRigaRef: expense?.nrRigaRef ?? null,
    codiceSpesa: expense?.cdSpesa ?? null,
    tipoSpesa: expense?.dsTipoSpesa ?? null,
    notaSpesa: expense?.dsSpesa ?? null,
    quantita: expense?.quantita ?? null,
    dataSostenimento: expense?.dtSostenimento ?? null,
    importoEuro: expense?.importoEuro ?? null,
    importoValuta: expense?.importoValuta ?? null,
    valuta: expense?.cdValuta ?? null,
    rimborsoEffettivo: expense?.rimborsoEffettivo ?? null,
    rimborsoAutorizzato: expense?.rimborsoAutorizzato ?? null,
    rimborsoEffettivoManuale: expense?.rimborsoEffManuale ?? null,
    notaUfficioRimborso: expense?.noteUffRimborso ?? null
  };
}

function sumExpenseField(expenses, fieldName) {
  return expenses.reduce((sum, expense) => {
    const value = parseAmount(expense?.[fieldName]);
    return value == null ? sum : sum + value;
  }, 0);
}

function pushUnique(list, value) {
  if (value && !list.includes(value)) {
    list.push(value);
  }
}

function buildExpenseKeys(expense, role) {
  const keys = [];
  const nrRiga = expense?.nrRiga != null ? String(expense.nrRiga) : "";
  const nrRigaRef = expense?.nrRigaRef != null ? String(expense.nrRigaRef) : "";
  const idSpesa = expense?.idSpesa != null ? String(expense.idSpesa) : "";
  const idDgRef = expense?.idDgRef != null ? String(expense.idDgRef) : "";
  const code = normalizeText(expense?.codiceSpesa);
  const type = normalizeText(expense?.tipoSpesa);
  const date = normalizeText(expense?.dataSostenimento);
  const amount = formatAmount(expense?.importoEuro);
  const note = normalizeText(expense?.notaSpesa);

  if (role === "requested") {
    pushUnique(keys, (code && type && date && amount && note) ? `sig:${code}|${type}|${date}|${amount}|${note}` : "");
    pushUnique(keys, (code && type && date && amount) ? `sig:${code}|${type}|${date}|${amount}` : "");
    pushUnique(keys, (code && date && amount) ? `sig:${code}|${date}|${amount}` : "");
    pushUnique(keys, idSpesa ? `id:${idSpesa}` : "");
    pushUnique(keys, nrRiga ? `nr:${nrRiga}` : "");
  } else {
    pushUnique(keys, (code && type && date && amount && note) ? `sig:${code}|${type}|${date}|${amount}|${note}` : "");
    pushUnique(keys, (code && type && date && amount) ? `sig:${code}|${type}|${date}|${amount}` : "");
    pushUnique(keys, (code && date && amount) ? `sig:${code}|${date}|${amount}` : "");
    pushUnique(keys, nrRigaRef ? `nr:${nrRigaRef}` : "");
    pushUnique(keys, idDgRef ? `id:${idDgRef}` : "");
    pushUnique(keys, nrRiga ? `nr:${nrRiga}` : "");
  }

  return keys;
}

function buildFallbackSignature(expense) {
  return [
    normalizeText(expense?.codiceSpesa),
    normalizeText(expense?.tipoSpesa),
    normalizeText(expense?.dataSostenimento),
    formatAmount(expense?.importoEuro),
    normalizeText(expense?.notaSpesa)
  ].join("|");
}

function matchExpenses(requestedExpenses, reimbursedExpenses) {
  const lookup = new Map();
  const reimbursedEntries = reimbursedExpenses.map((expense, index) => ({ expense, index }));
  const usedReimbursedIndexes = new Set();

  for (const entry of reimbursedEntries) {
    for (const key of buildExpenseKeys(entry.expense, "reimbursed")) {
      if (!lookup.has(key)) {
        lookup.set(key, []);
      }
      lookup.get(key).push(entry);
    }
  }

  const pairs = [];

  for (const requested of requestedExpenses) {
    let matched = null;

    for (const key of buildExpenseKeys(requested, "requested")) {
      const candidates = lookup.get(key) ?? [];
      matched = candidates.find((candidate) => !usedReimbursedIndexes.has(candidate.index)) ?? null;
      if (matched) {
        break;
      }
    }

    if (!matched) {
      const requestedSignature = buildFallbackSignature(requested);
      matched = reimbursedEntries.find((candidate) => (
        !usedReimbursedIndexes.has(candidate.index) &&
        buildFallbackSignature(candidate.expense) === requestedSignature
      )) ?? null;
    }

    if (matched) {
      usedReimbursedIndexes.add(matched.index);
    }

    pairs.push({
      requested,
      reimbursed: matched?.expense ?? null
    });
  }

  const remainingReimbursed = reimbursedEntries
    .filter((entry) => !usedReimbursedIndexes.has(entry.index))
    .map((entry) => ({
      requested: null,
      reimbursed: entry.expense
    }));

  return [...pairs, ...remainingReimbursed];
}

function csvEscape(value) {
  const text = String(value ?? "");
  if (/[;"\n\r]/.test(text)) {
    return `"${text.replace(/"/g, "\"\"")}"`;
  }
  return text;
}

function buildCsv(rows) {
  const columns = [
    "idMissione",
    "titoloMissione",
    "statoMissione",
    "statoPagamento",
    "fonteEstrazione",
    "percipiente",
    "progetto",
    "destinazione",
    "dataInizioMissione",
    "dataFineMissione",
    "totaleConsuntivoImportoEuro",
    "totaleConsuntivoRimborsoEffettivo",
    "totaleRimborsatoImportoEuro",
    "totaleRimborsatoRimborsoEffettivo",
    "tipoRigaReport",
    "consultivo_nrRiga",
    "consultivo_codiceSpesa",
    "consultivo_tipoSpesa",
    "consultivo_dataSostenimento",
    "consultivo_notaSpesa",
    "consultivo_importoEuro",
    "consultivo_rimborsoAutorizzato",
    "consultivo_rimborsoEffettivo",
    "consultivo_notaUfficioRimborso",
    "rimborsato_nrRiga",
    "rimborsato_nrRigaRef",
    "rimborsato_codiceSpesa",
    "rimborsato_tipoSpesa",
    "rimborsato_dataSostenimento",
    "rimborsato_notaSpesa",
    "rimborsato_importoEuro",
    "rimborsato_rimborsoAutorizzato",
    "rimborsato_rimborsoEffettivo",
    "rimborsato_notaUfficioRimborso",
    "deltaImportoEuro",
    "deltaRimborsoEffettivo"
  ];

  const lines = [
    columns.join(";"),
    ...rows.map((row) => columns.map((column) => csvEscape(row[column] ?? "")).join(";"))
  ];

  return `\ufeff${lines.join("\r\n")}\r\n`;
}

function blobToBytes(blob) {
  return blob.arrayBuffer().then((buffer) => new Uint8Array(buffer));
}

function triggerDownload(blob, fileName) {
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.click();
  window.setTimeout(() => window.URL.revokeObjectURL(url), 2000);
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

function formatCurrencyDisplay(value) {
  const parsed = parseAmount(value);
  return parsed == null ? "-" : `${parsed.toFixed(2)} EUR`;
}

function formatDateDisplay(value) {
  if (!value) {
    return "-";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return String(value).replace(/\s+/g, " ").trim() || "-";
  }

  return new Intl.DateTimeFormat("it-IT", {
    timeZone: "Europe/Rome",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).format(date);
}

function formatDateOnlyDisplay(value) {
  if (!value) {
    return "-";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return String(value).replace(/\s+/g, " ").trim() || "-";
  }

  return new Intl.DateTimeFormat("it-IT", {
    timeZone: "Europe/Rome",
    day: "2-digit",
    month: "2-digit",
    year: "numeric"
  }).format(date);
}

function computeExpenseOutcome(row) {
  const requestedAmount = parseAmount(row.consultivo_rimborsoEffettivo) ?? parseAmount(row.consultivo_importoEuro);
  const reimbursedAmount = parseAmount(row.rimborsato_rimborsoEffettivo) ?? parseAmount(row.rimborsato_importoEuro);
  const note = row.rimborsato_notaUfficioRimborso || row.consultivo_notaUfficioRimborso || "-";

  if (requestedAmount == null && reimbursedAmount != null) {
    return {
      label: "Rimborsata senza riga consultivo",
      fillColor: [0.86, 0.95, 1.0],
      textColor: [0.04, 0.29, 0.44],
      note
    };
  }

  if (reimbursedAmount == null || reimbursedAmount <= 0) {
    return {
      label: "Rifiutata o non rimborsata",
      fillColor: [1.0, 0.91, 0.91],
      textColor: [0.56, 0.11, 0.11],
      note
    };
  }

  if (requestedAmount != null && reimbursedAmount + 0.009 >= requestedAmount) {
    return {
      label: "Completamente pagata",
      fillColor: [0.89, 0.98, 0.91],
      textColor: [0.09, 0.39, 0.16],
      note
    };
  }

  return {
    label: "Parzialmente pagata",
    fillColor: [1.0, 0.96, 0.84],
    textColor: [0.56, 0.34, 0.03],
    note
  };
}

function groupRowsByMission(rows) {
  const groups = new Map();

  for (const row of rows) {
    const missionId = String(row.idMissione ?? "");
    if (!groups.has(missionId)) {
      groups.set(missionId, {
        missionId,
        titoloMissione: row.titoloMissione,
        statoPagamento: row.statoPagamento,
        percipiente: row.percipiente,
        progetto: row.progetto,
        destinazione: row.destinazione,
        dataInizioMissione: row.dataInizioMissione,
        dataFineMissione: row.dataFineMissione,
        totaleConsuntivoImportoEuro: row.totaleConsuntivoImportoEuro,
        totaleRimborsatoImportoEuro: row.totaleRimborsatoImportoEuro,
        rows: []
      });
    }

    groups.get(missionId).rows.push({
      ...row,
      outcome: computeExpenseOutcome(row)
    });
  }

  return [...groups.values()];
}

function escapePdfText(value) {
  return String(value ?? "")
    .replace(/\\/g, "\\\\")
    .replace(/\(/g, "\\(")
    .replace(/\)/g, "\\)");
}

function wrapPdfText(text, maxWidth, fontSize) {
  const words = String(text ?? "").split(/\s+/).filter(Boolean);
  if (!words.length) {
    return [""];
  }

  const lines = [];
  const averageCharWidth = fontSize * 0.48;
  let currentLine = words[0];

  for (const word of words.slice(1)) {
    const nextLine = `${currentLine} ${word}`;
    if ((nextLine.length * averageCharWidth) <= maxWidth) {
      currentLine = nextLine;
    } else {
      lines.push(currentLine);
      currentLine = word;
    }
  }

  lines.push(currentLine);
  return lines;
}

function measureWrappedTextHeight(text, maxWidth, fontSize = 10, lineGap = 4) {
  const lines = wrapPdfText(text, maxWidth, fontSize);
  return lines.length ? (lines.length * (fontSize + lineGap)) - lineGap : fontSize;
}

class SimplePdfBuilder {
  constructor() {
    this.pageWidth = 595;
    this.pageHeight = 842;
    this.margin = 42;
    this.pages = [];
    this.addPage();
  }

  addPage() {
    const page = {
      ops: [],
      cursorY: this.margin
    };
    this.pages.push(page);
    this.currentPage = page;

    this.drawRect(0, 0, this.pageWidth, 42, [0.08, 0.18, 0.32]);
    this.drawText("Report rimborsi missioni", this.margin, 10, 18, true, [1, 1, 1]);
    this.currentPage.cursorY = 56;
  }

  ensureSpace(heightNeeded) {
    if ((this.currentPage.cursorY + heightNeeded) > (this.pageHeight - this.margin)) {
      this.addPage();
    }
  }

  yFromTop(topY) {
    return this.pageHeight - topY;
  }

  push(op) {
    this.currentPage.ops.push(op);
  }

  drawRect(x, topY, width, height, rgb) {
    const bottomY = this.pageHeight - topY - height;
    this.push(`${rgb[0].toFixed(3)} ${rgb[1].toFixed(3)} ${rgb[2].toFixed(3)} rg ${x.toFixed(2)} ${bottomY.toFixed(2)} ${width.toFixed(2)} ${height.toFixed(2)} re f`);
  }

  drawText(text, x, topY, fontSize = 10, bold = false, rgb = [0.1, 0.16, 0.26]) {
    const y = this.pageHeight - topY - fontSize;
    const font = bold ? "F2" : "F1";
    this.push(`BT /${font} ${fontSize} Tf ${rgb[0].toFixed(3)} ${rgb[1].toFixed(3)} ${rgb[2].toFixed(3)} rg 1 0 0 1 ${x.toFixed(2)} ${y.toFixed(2)} Tm (${escapePdfText(text)}) Tj ET`);
  }

  drawWrappedText(text, x, topY, maxWidth, fontSize = 10, bold = false, rgb = [0.1, 0.16, 0.26], lineGap = 4) {
    const lines = wrapPdfText(text, maxWidth, fontSize);
    let y = topY;
    for (const line of lines) {
      this.drawText(line, x, y, fontSize, bold, rgb);
      y += fontSize + lineGap;
    }
    return lines.length ? (lines.length * (fontSize + lineGap)) - lineGap : fontSize;
  }

  build() {
    const objects = [];
    const addObject = (value) => {
      objects.push(value);
      return objects.length;
    };

    const fontRegularRef = addObject("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");
    const fontBoldRef = addObject("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>");

    const pageRefs = [];
    for (const page of this.pages) {
      const content = `${page.ops.join("\n")}\n`;
      const contentRef = addObject(`<< /Length ${encoder.encode(content).length} >>\nstream\n${content}endstream`);
      const pageRef = addObject(`<< /Type /Page /Parent PAGES_REF 0 R /MediaBox [0 0 ${this.pageWidth} ${this.pageHeight}] /Resources << /Font << /F1 ${fontRegularRef} 0 R /F2 ${fontBoldRef} 0 R >> >> /Contents ${contentRef} 0 R >>`);
      pageRefs.push(pageRef);
    }

    const pagesRef = addObject(`<< /Type /Pages /Count ${pageRefs.length} /Kids [${pageRefs.map((ref) => `${ref} 0 R`).join(" ")}] >>`);
    const catalogRef = addObject(`<< /Type /Catalog /Pages ${pagesRef} 0 R >>`);

    objects.forEach((object, index) => {
      if ((index + 1) === pagesRef) {
        return;
      }
      objects[index] = object.replace("PAGES_REF", String(pagesRef));
    });

    const chunks = ["%PDF-1.4\n"];
    const offsets = [0];
    let runningLength = chunks[0].length;

    for (let index = 0; index < objects.length; index += 1) {
      offsets.push(runningLength);
      const objectChunk = `${index + 1} 0 obj\n${objects[index]}\nendobj\n`;
      chunks.push(objectChunk);
      runningLength += objectChunk.length;
    }

    const xrefOffset = runningLength;
    const xref = [
      `xref\n0 ${objects.length + 1}\n`,
      "0000000000 65535 f \n",
      ...offsets.slice(1).map((offset) => `${String(offset).padStart(10, "0")} 00000 n \n`)
    ].join("");
    const trailer = `trailer\n<< /Size ${objects.length + 1} /Root ${catalogRef} 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;

    return encoder.encode(`${chunks.join("")}${xref}${trailer}`);
  }
}

function buildMissionPdfBytes(rows) {
  const pdf = new SimplePdfBuilder();
  const groups = groupRowsByMission(rows);

  pdf.drawWrappedText(
    "Sintesi visuale delle missioni con confronto tra richiesto e rimborsato. Verde = completa, giallo = parziale, rosso = rifiutata/non rimborsata.",
    pdf.margin,
    42,
    pdf.pageWidth - (pdf.margin * 2),
    10,
    false,
    [0.23, 0.31, 0.4]
  );
  pdf.currentPage.cursorY = 104;

  for (const group of groups) {
    const boxWidth = pdf.pageWidth - (pdf.margin * 2);
    const leftX = pdf.margin + 12;
    const gutter = 20;
    const leftWidth = 300;
    const rightX = leftX + leftWidth + gutter;
    const rightWidth = boxWidth - (rightX - pdf.margin) - 12;
    const titleText = group.titoloMissione || "-";
    const titleWidth = boxWidth - 24;
    const titleHeight = measureWrappedTextHeight(titleText, titleWidth, 11, 2);
    const percipienteText = `Percipiente: ${group.percipiente || "-"}`;
    const periodoText = `Periodo: ${formatDateDisplay(group.dataInizioMissione)} -> ${formatDateDisplay(group.dataFineMissione)}`;
    const destinazioneText = `Destinazione: ${group.destinazione || "-"}`;
    const statoText = `Stato: ${group.statoPagamento || "-"}`;
    const percipienteHeight = measureWrappedTextHeight(percipienteText, leftWidth, 9, 2);
    const periodoHeight = measureWrappedTextHeight(periodoText, leftWidth, 9, 2);
    const destinazioneHeight = measureWrappedTextHeight(destinazioneText, rightWidth, 9, 2);
    const statoHeight = measureWrappedTextHeight(statoText, rightWidth, 9, 2);
    const bodyTopOffset = 32 + titleHeight + 10;
    const leftColumnHeight = percipienteHeight + 6 + periodoHeight;
    const rightColumnHeight = destinazioneHeight + 6 + statoHeight;
    const totalsTopOffset = bodyTopOffset + Math.max(leftColumnHeight, rightColumnHeight) + 10;
    const headerHeight = totalsTopOffset + 16;
    const missionBlockHeight = headerHeight + 18 + (group.rows.length * 78);

    pdf.ensureSpace(missionBlockHeight);

    const top = pdf.currentPage.cursorY;
    pdf.drawRect(pdf.margin, top, boxWidth, headerHeight, [0.94, 0.97, 1.0]);
    pdf.drawText(`Missione ${group.missionId}`, leftX, top + 12, 12, true, [0.05, 0.16, 0.29]);
    pdf.drawWrappedText(titleText, leftX, top + 29, titleWidth, 11, true, [0.05, 0.16, 0.29], 2);

    const bodyTop = top + bodyTopOffset;
    const leftBodyHeight = pdf.drawWrappedText(percipienteText, leftX, bodyTop, leftWidth, 9, false, [0.23, 0.31, 0.4], 2);
    pdf.drawWrappedText(periodoText, leftX, bodyTop + leftBodyHeight + 6, leftWidth, 9, false, [0.23, 0.31, 0.4], 2);
    const rightBodyHeight = pdf.drawWrappedText(destinazioneText, rightX, bodyTop, rightWidth, 9, false, [0.23, 0.31, 0.4], 2);
    pdf.drawWrappedText(statoText, rightX, bodyTop + rightBodyHeight + 6, rightWidth, 9, true, [0.05, 0.16, 0.29], 2);
    pdf.drawText(`Richiesto: ${formatCurrencyDisplay(group.totaleConsuntivoImportoEuro)} | Rimborsato: ${formatCurrencyDisplay(group.totaleRimborsatoImportoEuro)}`, leftX, top + totalsTopOffset, 9, true, [0.05, 0.16, 0.29]);

    pdf.currentPage.cursorY += headerHeight + 12;

    for (const row of group.rows) {
      pdf.ensureSpace(72);
      const expenseTop = pdf.currentPage.cursorY;
      const outcome = row.outcome;
      pdf.drawRect(pdf.margin, expenseTop, pdf.pageWidth - (pdf.margin * 2), 66, outcome.fillColor);
      pdf.drawRect(pdf.pageWidth - pdf.margin - 140, expenseTop + 10, 120, 18, outcome.textColor);
      pdf.drawText(outcome.label, pdf.pageWidth - pdf.margin - 132, expenseTop + 14, 8, true, [1, 1, 1]);
      pdf.drawText(
        `${row.consultivo_tipoSpesa || row.rimborsato_tipoSpesa || "Spesa"} - ${formatDateOnlyDisplay(row.consultivo_dataSostenimento || row.rimborsato_dataSostenimento || "-")}`,
        pdf.margin + 12,
        expenseTop + 12,
        9,
        true,
        [0.05, 0.16, 0.29]
      );
      pdf.drawText(
        `Richiesto: ${formatCurrencyDisplay(row.consultivo_rimborsoEffettivo || row.consultivo_importoEuro)} | Rimborsato: ${formatCurrencyDisplay(row.rimborsato_rimborsoEffettivo || row.rimborsato_importoEuro)}`,
        pdf.margin + 12,
        expenseTop + 26,
        9,
        false,
        [0.18, 0.24, 0.33]
      );
      pdf.drawWrappedText(
        `Nota spesa: ${row.consultivo_notaSpesa || row.rimborsato_notaSpesa || "-"}`,
        pdf.margin + 12,
        expenseTop + 39,
        pdf.pageWidth - (pdf.margin * 2) - 24,
        8,
        false,
        [0.18, 0.24, 0.33],
        2
      );
      pdf.drawWrappedText(
        `Nota ufficio: ${outcome.note}`,
        pdf.margin + 12,
        expenseTop + 51,
        pdf.pageWidth - (pdf.margin * 2) - 24,
        8,
        true,
        outcome.textColor,
        2
      );
      pdf.currentPage.cursorY += 74;
    }

    pdf.currentPage.cursorY += 10;
  }

  return pdf.build();
}

function buildMissionRows(mission, sourceLabel, missionDetail, paidMissionDetail) {
  const dg = missionDetail?.dg02Dg ?? {};
  const paidDg = paidMissionDetail?.dg02Dg ?? {};
  const requestedExpenses = asArray(dg.dg16XSpesa).map((expense) => simplifyExpense(expense, "consultivo"));
  const reimbursedExpenses = asArray(paidDg.dg16XSpesa).map((expense) => simplifyExpense(expense, "rimborsato"));
  const pairs = matchExpenses(requestedExpenses, reimbursedExpenses);
  const percipiente = [dg.dg09XPercipiente?.cognome, dg.dg09XPercipiente?.nome].filter(Boolean).join(" ");
  const project = dg.dsProgetto ?? dg.cdProgetto ?? "";
  const destination = dg.dg16XMissione?.dsLuogoDestinazione ?? mission?.luoghi?.join(" | ") ?? "";
  const totalRequestedImport = sumExpenseField(requestedExpenses, "importoEuro");
  const totalRequestedRefund = sumExpenseField(requestedExpenses, "rimborsoEffettivo");
  const totalReimbursedImport = sumExpenseField(reimbursedExpenses, "importoEuro");
  const totalReimbursedRefund = sumExpenseField(reimbursedExpenses, "rimborsoEffettivo");

  return pairs.map(({ requested, reimbursed }) => {
    const type =
      requested && reimbursed ? "abbinata" :
      requested ? "solo_consuntivo" :
      "solo_rimborsata";

    return {
      idMissione: mission?.idAutMiss ?? "",
      titoloMissione: mission?.dsAutMis ?? dg.dsDg ?? "",
      statoMissione: mission?.stato ?? "",
      statoPagamento: derivePaymentStatusLabel(mission?.statoPagamento) ?? mission?.statoVisibile ?? "",
      statoMissioneVisibile: mission?.statoVisibile ?? "",
      fonteEstrazione: sourceLabel,
      percipiente,
      progetto: project,
      destinazione: destination,
      dataInizioMissione: mission?.dtIniMis ?? dg.dg16XMissione?.dtInizioMis ?? "",
      dataFineMissione: mission?.dtFineMis ?? dg.dg16XMissione?.dtFineMis ?? "",
      totaleConsuntivoImportoEuro: totalRequestedImport.toFixed(2),
      totaleConsuntivoRimborsoEffettivo: totalRequestedRefund.toFixed(2),
      totaleRimborsatoImportoEuro: totalReimbursedImport.toFixed(2),
      totaleRimborsatoRimborsoEffettivo: totalReimbursedRefund.toFixed(2),
      tipoRigaReport: type,
      consultivo_nrRiga: requested?.nrRiga ?? "",
      consultivo_codiceSpesa: requested?.codiceSpesa ?? "",
      consultivo_tipoSpesa: requested?.tipoSpesa ?? "",
      consultivo_dataSostenimento: requested?.dataSostenimento ?? "",
      consultivo_notaSpesa: requested?.notaSpesa ?? "",
      consultivo_importoEuro: formatAmount(requested?.importoEuro),
      consultivo_rimborsoAutorizzato: formatAmount(requested?.rimborsoAutorizzato),
      consultivo_rimborsoEffettivo: formatAmount(requested?.rimborsoEffettivo),
      consultivo_notaUfficioRimborso: requested?.notaUfficioRimborso ?? "",
      rimborsato_nrRiga: reimbursed?.nrRiga ?? "",
      rimborsato_nrRigaRef: reimbursed?.nrRigaRef ?? "",
      rimborsato_codiceSpesa: reimbursed?.codiceSpesa ?? "",
      rimborsato_tipoSpesa: reimbursed?.tipoSpesa ?? "",
      rimborsato_dataSostenimento: reimbursed?.dataSostenimento ?? "",
      rimborsato_notaSpesa: reimbursed?.notaSpesa ?? "",
      rimborsato_importoEuro: formatAmount(reimbursed?.importoEuro),
      rimborsato_rimborsoAutorizzato: formatAmount(reimbursed?.rimborsoAutorizzato),
      rimborsato_rimborsoEffettivo: formatAmount(reimbursed?.rimborsoEffettivo),
      rimborsato_notaUfficioRimborso: reimbursed?.notaUfficioRimborso ?? "",
      deltaImportoEuro: computeDelta(requested?.importoEuro, reimbursed?.importoEuro),
      deltaRimborsoEffettivo: computeDelta(requested?.rimborsoEffettivo, reimbursed?.rimborsoEffettivo)
    };
  });
}

async function exportRefundReport() {
  const exportRun = createExportRun();
  activeExportRun = exportRun;
  downloadButton.disabled = true;
  refreshButton.disabled = true;
  stopButton.disabled = false;

  try {
    const includeAllMissions = exportAllMissionsCheckbox.checked;
    const detailCache = new Map();
    setProgress(0, 1);
    setStatus("Recupero lista missioni...");

    const { missions, source, visibleMissionIds, totalMissionCount } = await resolveMissionsForExport(includeAllMissions, exportRun);
    const deepInspection = source === "archive";
    let eligibleMissions = [];

    if (deepInspection) {
      const precheckTotal = missions.length || 1;
      let prechecked = 0;

      for (const mission of missions) {
        ensureExportNotCancelled(exportRun);
        setStatus(`Verifico stato missione ${mission.idAutMiss} nell'archivio... (${prechecked + 1}/${precheckTotal})`);
        const inspection = await inspectMissionForReport(mission, exportRun, detailCache, { deepInspection: true });
        if (inspection.eligible) {
          eligibleMissions.push(mission);
        }
        prechecked += 1;
        setProgress(prechecked, precheckTotal);
      }
    } else {
      eligibleMissions = missions.filter((mission) => isEligibleMissionStatus(mission));
    }

    if (!eligibleMissions.length) {
      throw new Error("Nessuna missione in stato Emesso ordinativo o Pagato trovata nell'insieme selezionato.");
    }

    setStatus(
      source === "archive"
        ? `Analizzo ${eligibleMissions.length} missioni archivio in stato utile.`
        : `Analizzo ${eligibleMissions.length} missioni visibili in stato utile su ${missions.length} lette dalla pagina.`
    );

    const rows = [];
    const totalSteps = eligibleMissions.length;
    let currentStep = 0;

    for (const mission of eligibleMissions) {
      ensureExportNotCancelled(exportRun);
      setStatus(`Leggo spese missione ${mission.idAutMiss}... (${currentStep + 1}/${totalSteps})`);

      const inspection = await inspectMissionForReport(mission, exportRun, detailCache, {
        deepInspection: source === "archive"
      });
      const missionDetail = inspection.missionDetail ?? await fetchMissionDetails(mission.idAutMiss, exportRun);
      let paidMissionDetail = inspection.paidMissionDetail ?? null;
      if (!paidMissionDetail) {
        try {
          paidMissionDetail = await fetchPaidMissionDetails(mission.idAutMiss, exportRun);
        } catch (_error) {
          paidMissionDetail = null;
        }
      }

      rows.push(...buildMissionRows(
        mission,
        source === "archive" ? "archivio" : "filtri_pagina",
        missionDetail,
        paidMissionDetail
      ));

      currentStep += 1;
      setProgress(currentStep, totalSteps);
    }

    ensureExportNotCancelled(exportRun);

    if (!rows.length) {
      throw new Error("Nessuna riga di report prodotta per le missioni selezionate.");
    }

    const stamp = formatStamp();
    const csv = buildCsv(rows);
    const csvBytes = encoder.encode(csv);
    const pdfBytes = buildMissionPdfBytes(rows);
    const zip = new ZipBuilder();
    zip.addFile(`report-rimborsi-missioni-${stamp}.csv`, csvBytes);
    zip.addFile(`report-rimborsi-missioni-${stamp}.pdf`, pdfBytes);
    const zipBlob = zip.build();
    const fileName = `report-rimborsi-missioni-${stamp}.zip`;
    triggerDownload(zipBlob, fileName);

    setStatus(
      `ZIP pronto: ${fileName}\n` +
      `Missioni visibili: ${visibleMissionIds.length}\n` +
      `Missioni considerate: ${eligibleMissions.length} su ${totalMissionCount ?? missions.length}\n` +
      `Righe esportate: ${rows.length}\n` +
      `Contenuto: CSV dati + PDF sintetico`
    );
  } finally {
    if (activeExportRun === exportRun) {
      activeExportRun = null;
    }
    downloadButton.disabled = false;
    refreshButton.disabled = false;
    stopButton.disabled = true;
  }
}

function refreshStatus() {
  const exportRun = createExportRun();
  activeExportRun = exportRun;
  refreshButton.disabled = true;
  downloadButton.disabled = true;
  stopButton.disabled = false;

  (async () => {
    try {
      const includeAllMissions = exportAllMissionsCheckbox.checked;
      const detailCache = new Map();
      setProgress(0, 1);
      setStatus("Aggiorno conteggi missioni...");

      const { missions, source, visibleMissionIds, totalMissionCount } = await resolveMissionsForExport(includeAllMissions, exportRun);
      const deepInspection = source === "archive";
      const eligibleMissionCount = await countEligibleMissions(missions, exportRun, {
        deepInspection,
        cache: detailCache
      });
      const scopeLine = source === "archive"
        ? `Missioni lette in archivio: ${missions.length}`
        : `Missioni lette nella selezione corrente: ${missions.length}`;
      const totalLine = totalMissionCount ? `\nMissioni totali disponibili: ${totalMissionCount}` : "";

      setProgress(1, 1);
      setStatus(
        `Pronto.\nMissioni visibili in pagina: ${visibleMissionIds.length}${totalLine}\n` +
        `${scopeLine}\n` +
        `Missioni in stato utile: ${eligibleMissionCount}\n` +
        `Stati inclusi dal report: Emesso ordinativo, Pagato`
      );
    } catch (error) {
      setStatus(String(error.message || error));
    } finally {
      if (activeExportRun === exportRun) {
        activeExportRun = null;
      }
      refreshButton.disabled = false;
      downloadButton.disabled = false;
      stopButton.disabled = true;
    }
  })();
}

downloadButton.addEventListener("click", () => {
  exportRefundReport().catch((error) => {
    console.error(error);
    setStatus(`Errore:\n${error.message || error}`);
  });
});

refreshButton.addEventListener("click", refreshStatus);
stopButton.addEventListener("click", () => {
  if (cancelActiveExport()) {
    setStatus("Interruzione export in corso...");
    stopButton.disabled = true;
  }
});

headerBox.addEventListener("pointerdown", startDragging);
headerBox.addEventListener("pointermove", handlePointerMove);
headerBox.addEventListener("pointerup", stopDragging);
headerBox.addEventListener("pointercancel", stopDragging);
window.addEventListener("resize", () => {
  const currentRect = root.getBoundingClientRect();
  applyPanelPosition({ left: currentRect.left, top: currentRect.top });
});

applyInitialPosition();
refreshStatus();

return {
  dispose(reason = "reload") {
    console.log(`[TM Report Rimborsi] dispose (${reason})`);
    stopDragging();
    root.remove();
    style.remove();
  }
};
