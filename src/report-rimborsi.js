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
    <p class="tm-title">Report rimborsi CSV <span class="tm-version">v${getScriptVersion()}</span></p>
    <p class="tm-subtitle">Confronta spese a consuntivo e spese rimborsate delle missioni in stato Emesso ordinativo o Pagato.</p>
  </div>
  <div class="tm-body">
    <div class="tm-actions">
      <button class="tm-primary" type="button">Scarica report CSV</button>
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
  const date = normalizeText(expense?.dataSostenimento);
  const amount = formatAmount(expense?.importoEuro);

  if (role === "requested") {
    pushUnique(keys, nrRiga ? `nr:${nrRiga}` : "");
    pushUnique(keys, idSpesa ? `id:${idSpesa}` : "");
    pushUnique(keys, (code && date && amount) ? `sig:${code}|${date}|${amount}` : "");
  } else {
    pushUnique(keys, nrRigaRef ? `nr:${nrRigaRef}` : "");
    pushUnique(keys, nrRiga ? `nr:${nrRiga}` : "");
    pushUnique(keys, idDgRef ? `id:${idDgRef}` : "");
    pushUnique(keys, (code && date && amount) ? `sig:${code}|${date}|${amount}` : "");
  }

  return keys;
}

function buildFallbackSignature(expense) {
  return [
    normalizeText(expense?.codiceSpesa),
    normalizeText(expense?.tipoSpesa),
    normalizeText(expense?.dataSostenimento),
    formatAmount(expense?.importoEuro)
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

function triggerDownload(blob, fileName) {
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.click();
  window.setTimeout(() => window.URL.revokeObjectURL(url), 2000);
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

    const csv = buildCsv(rows);
    const blob = new Blob([encoder.encode(csv)], { type: "text/csv;charset=utf-8" });
    const fileName = `report-rimborsi-missioni-${formatStamp()}.csv`;
    triggerDownload(blob, fileName);

    setStatus(
      `CSV pronto: ${fileName}\n` +
      `Missioni visibili: ${visibleMissionIds.length}\n` +
      `Missioni considerate: ${eligibleMissions.length} su ${totalMissionCount ?? missions.length}\n` +
      `Righe esportate: ${rows.length}`
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
