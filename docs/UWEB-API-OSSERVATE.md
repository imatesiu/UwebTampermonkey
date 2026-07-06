# API U-Web Missioni Osservate

Questo documento descrive solo le API `appautmis` effettivamente osservate o usate nel progetto corrente.
Non e un catalogo completo dell'applicazione U-Web.

## Ambito

Pagine analizzate:

- lista missioni: `/appautmis/listaautmis#!/listaautmis`
- dettaglio missione: `/appautmis/listaautmis/{id}`

Fonti usate:

- traffico di pagina osservato nel browser
- codice degli userscript in [src/payload.js](/Users/spagnolo/github/UwebTampermonkey/src/payload.js) e [src/anteprima-allegati-missione.js](/Users/spagnolo/github/UwebTampermonkey/src/anteprima-allegati-missione.js)
- ispezioni salvate in:
  [uweb-observed-api-urls.json](/Users/spagnolo/github/UwebTampermonkey/uweb-observed-api-urls.json),
  [uweb-api-inspection.json](/Users/spagnolo/github/UwebTampermonkey/uweb-api-inspection.json),
  [uweb-general-attachments-analysis.json](/Users/spagnolo/github/UwebTampermonkey/uweb-general-attachments-analysis.json)

Autenticazione osservata:

- `Authorization: Bearer <token>`
- `X-Requested-With: XMLHttpRequest`
- cookie di sessione del browser

## Endpoint osservati

### Bootstrap e configurazione app

- `GET /appautmis/api/customLogo`
  Osservato nella pagina lista missioni.
- `GET /appautmis/api/v1/apps/min`
  Osservato nella pagina lista missioni.
- `GET /appautmis/api/atenei`
  Osservato nella pagina lista missioni.
- `GET /appautmis/api/manuals`
  Osservato nella pagina lista missioni.
- `GET /appautmis/api/estraiparametrointegrazgestdresse3`
  Osservato nella pagina lista missioni.
- `GET /appautmis/api/estrairuoliintegrazgestesse3`
  Osservato nella pagina lista missioni.
- `GET /appautmis/api/estraiparametrosuperamlimitealloggio`
  Osservato nella pagina lista missioni.
- `GET /appautmis/api/estraiparametrolistaruolirichiestastraordinari`
  Osservato nella pagina lista missioni.
- `GET /appautmis/api/estraiparametrorichiestastraordinari`
  Osservato nella pagina lista missioni.
- `GET /appautmis/api/estraiparametrolistaruoligestoreconsuntivo`
  Osservato nella pagina lista missioni.
- `GET /appautmis/api/estraiparametroflmissgestoreconsuntivo`
  Osservato nella pagina lista missioni.
- `GET /appautmis/api/estraiparametroflmisssolocedolino`
  Osservato nella pagina lista missioni.
- `GET /appautmis/api/estraiparametrocambiomissdtsost`
  Osservato nella pagina lista missioni.
- `GET /appautmis/api/estraiParametriConfMissioni?cdParametro=DATA_ATTIV_DEMAT_MISS`
  Osservato nella pagina lista missioni.
- `GET /appautmis/api/estraiparametrolistauoprenotazioni`
  Osservato nella pagina lista missioni.
- `GET /appautmis/api/estraiparametrotestodichsostattonotorieta`
  Osservato nella pagina lista missioni.
- `GET /appautmis/api/estraiparametri?parametro=UWEB_SOSTITUTO_DIDATTICA`
  Osservato nella pagina lista missioni.
- `GET /appautmis/api/estrailabeltipiautorizzazioni?cd=tipiAut`
  Osservato nella pagina lista missioni.
- `GET /appautmis/api/estraiparametrodematerializgiustificativimiss`
  Osservato nella pagina lista missioni.

Per questi endpoint di bootstrap non e stata ricostruita una struttura di risposta precisa oltre al fatto che sono risposte JSON o comunque consumate dall'app Angular.

### Lista missioni

- `GET /appautmis/api/estrailistaautmissionipercipienteconstatopagamento`
  Endpoint usato per la lista missioni filtrata.
  Osservato con query string, ad esempio:
  `dtIniMis=...&dtFinMis=...`

Uso nel progetto:

- il downloader in [src/payload.js](/Users/spagnolo/github/UwebTampermonkey/src/payload.js) recupera l'ultima URL lista osservata nel browser e la richiama per esportare le missioni dei filtri correnti

Risposta osservata:

- array JSON di missioni
- campi usati nel progetto: `idAutMiss`, `dsAutMis`, `stato`, `statoPagamento`, `dtIniMis`, `dtFineMis`, `costoPresunto`, `luoghi`

### Dettaglio missione

- `GET /appautmis/api/listaautmis/{idAutMiss}`
  Restituisce il dettaglio completo della missione.

Uso nel progetto:

- export missione
- mappatura spese/allegati
- anteprima allegati nella pagina dettaglio

Strutture osservate nel progetto:

- radice `dg02Dg`
- allegati missione: `dg02Dg.dg02DgAllegati`
- spese a consuntivo: `dg02Dg.dg16XSpesa`
- spese a preventivo: `dg02Dg.dg16XPrevSpesa`
- dettagli/iter autorizzativo: `dg02Dg.dg02DgDett`

Campi spesa osservati e usati:

- `nrRiga`
- `cdSpesa`
- `dsSpesa`
- `dtSostenimento`
- `importoEuro`
- `importoValuta`
- `cdAllegato`

Campi allegato osservati e usati:

- `idDgAllegato`
- `nomeFile`
- `cdAltKey`
- `cdTipoAllegato`

### Dettaglio missione pagata

- `GET /appautmis/api/getmisfromautmis?idDg={idAutMiss}`

Uso nel progetto:

- export missione, per recuperare il dettaglio collegato alla missione pagata/rimborsata quando disponibile

Risposta osservata:

- JSON compatibile con una struttura `dg02Dg`
- il progetto usa in particolare `dg16XSpesa`

### PDF autorizzazione missione

- `GET /appautmis/api/stampaautorizzazionemissione?id={idAutMiss}`

Uso nel progetto:

- export della richiesta/autorizzazione missione

Risposta osservata:

- payload testuale base64
- decodificato come PDF

### Elenco allegati missione

- `GET /appautmis/api/allegati/{idAutMiss}`

Uso nel progetto:

- elenco allegati per export
- anteprima allegati di riga
- anteprima allegati generali di missione

Risposta osservata:

- array JSON
- campi osservati:
  `idDgAllegato`, `idDgRef`, `nomeFile`, `cdAltKey`, `cdTipoAllegato`, `dsAllegato`, `flPubblicabile`

Regola osservata:

- `cdAltKey` valorizzato: allegato associato a una spesa/riga
- `cdAltKey` vuoto: allegato generale di missione

Esempio verificato sulla missione `773112`:

- allegato generale: `DITECFER_delega_Spagnolo_maggio 2026_signed.pdf`
- allegati di riga: file immagine associati alle spese tramite `spesa.cdAllegato == allegato.cdAltKey`

### Download allegato singolo

- `GET /appautmis/api/allegati/{idAutMiss}/{idDgAllegato}`

Uso nel progetto:

- download binario per export
- anteprima file direttamente nel browser

Risposta osservata:

- payload testuale base64
- il progetto riconosce almeno:
  PDF, PNG, JPEG, GIF, WEBP, TXT, CSV, LOG, JSON

## Relazioni dati osservate

### Spese e allegati

Relazione verificata:

- `dg02Dg.dg16XSpesa[].cdAllegato == allegati[].cdAltKey`

Questo consente di agganciare l'anteprima nella colonna `Allegati` delle righe spesa.

### Allegati generali di missione

Relazione verificata:

- `dg02Dg.dg02DgAllegati[]` contiene anche allegati senza `cdAltKey`
- questi file non appartengono a una singola riga spesa
- l'anteprima puo essere agganciata alla toolbar missione, vicino al bottone `Allegati`

## Limiti di questo catalogo

- descrive solo endpoint osservati nel progetto e nelle pagine analizzate
- non deduce endpoint non visti
- per molti endpoint di bootstrap l'applicazione li usa, ma in questo repo non ne interpretiamo ancora il payload

## File OpenAPI

La versione OpenAPI corrispondente e in:

- [uweb-missioni-observed.openapi.yaml](/Users/spagnolo/github/UwebTampermonkey/docs/uweb-missioni-observed.openapi.yaml)
