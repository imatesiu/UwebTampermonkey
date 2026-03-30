# Export missioni U-Web

Questo documento spiega come installare, usare e distribuire lo script Tampermonkey che esporta le missioni U-Web in un file ZIP.

## Cosa fa lo script

Lo script aggiunge un pannello flottante nella pagina:

[https://cnr.u-web.cineca.it/appautmis/listaautmis#!/listaautmis](https://cnr.u-web.cineca.it/appautmis/listaautmis#!/listaautmis)

Dal pannello e possibile avviare un export che:

- legge le missioni visibili in base ai filtri correnti della pagina
- scarica per ogni missione la richiesta PDF
- scarica tutti gli allegati associati alla missione
- crea uno ZIP unico
- crea una cartella separata per ogni missione
- salva dentro ogni cartella:
  `Stampa_Richiesta_Missione_<numero missione>.pdf`
- salva dentro ogni cartella anche:
  `missione.json`
- salva nella radice dello ZIP anche:
  `export-info.json`

## Come lavora

Lo script usa le API interne gia chiamate dall'applicazione U-Web, riutilizzando la sessione autenticata del browser.

Le API principali usate sono:

- `GET /appautmis/api/estrailistaautmissionipercipienteconstatopagamento`
- `GET /appautmis/api/stampaautorizzazionemissione?id=<idAutMiss>`
- `GET /appautmis/api/allegati/<idAutMiss>`
- `GET /appautmis/api/allegati/<idAutMiss>/<idDgAllegato>`

Non richiede login aggiuntivi, perche usa:

- i cookie della sessione gia aperta
- il token applicativo presente in `localStorage`

## Prerequisiti

Prima dell'uso servono:

- Chrome o Edge con Tampermonkey installato
- accesso autenticato a U-Web Missioni
- Node.js installato
- il repo locale con questo progetto
- il server locale di sviluppo avviato con `npm run dev`

## Installazione passo passo

1. Aprire il terminale nella cartella del progetto:

```bash
cd /Users/spagnolo/github/UwebTampermonkey
```

2. Avviare il server locale:

```bash
npm run dev
```

3. Lasciare il terminale aperto.

4. Nel browser aprire questo URL:

[http://127.0.0.1:8123/tampermonkey-loader.user.js](http://127.0.0.1:8123/tampermonkey-loader.user.js)

5. Quando Tampermonkey apre la schermata di installazione, cliccare `Install`.

6. Aprire la pagina U-Web Missioni:

[https://cnr.u-web.cineca.it/appautmis/listaautmis#!/listaautmis](https://cnr.u-web.cineca.it/appautmis/listaautmis#!/listaautmis)

7. Effettuare il login se necessario.

8. Ricaricare la pagina.

Nota:
lo script e limitato alle pagine `https://cnr.u-web.cineca.it/appautmis/*` e il pannello di export viene creato solo nella vista lista missioni.

## Come usarlo

1. Aprire la pagina `Le Mie Missioni`.

2. Impostare i filtri desiderati nella pagina.

Importante:
lo script esporta le missioni restituite dai filtri correnti.

3. Attendere la comparsa del pannello flottante `Export missioni in ZIP` in basso a destra.

4. Cliccare `Scarica ZIP missioni`.

5. Attendere il completamento del download.

## Struttura dello ZIP

Lo ZIP generato ha una struttura simile a questa:

```text
missioni-20260330-2332.zip
├── export-info.json
├── 618190 - SPAGNOLO LECCE 03 02 26 - Visita ispettiva ...
│   ├── Stampa_Richiesta_Missione_618190.pdf
│   ├── missione.json
│   ├── BRN_PSN_Itinerario di Viaggio Ryanair.pdf
│   ├── 33625_RYANAIR_33625-2026_ITR.pdf
│   └── ...
└── 654254 - SPAGNOLO LODI 25 02 26 - Attivita relativa ...
    ├── Stampa_Richiesta_Missione_654254.pdf
    ├── missione.json
    └── ...
```

## File generati

### `Stampa_Richiesta_Missione_<numero>.pdf`

E il PDF della richiesta missione scaricato dall'API di stampa.

### `missione.json`

Contiene un riepilogo utile della missione, ad esempio:

- id missione
- titolo
- stato
- costo presunto
- date
- luoghi
- elenco allegati

### `export-info.json`

Contiene metadati tecnici dell'export, ad esempio:

- data e ora export
- URL sorgente
- endpoint lista usato
- numero totale missioni esportate

## Aggiornare lo script dopo modifiche

Se il codice viene modificato, non serve reinstallare tutto da zero.

Basta:

1. lasciare attivo `npm run dev`
2. modificare il file [src/payload.js](/Users/spagnolo/github/UwebTampermonkey/src/payload.js)
3. ricaricare la pagina oppure usare in Tampermonkey:
   `Reload local dev script`

## Distribuzione ad altri utenti

Per distribuire questo script ad altri colleghi ci sono due possibilita.

### Modalita sviluppo locale

Utile se anche l'altro utente deve modificarlo.

Passi:

1. clonare il repo
2. avviare `npm run dev`
3. installare `http://127.0.0.1:8123/tampermonkey-loader.user.js`
4. usare la pagina normalmente

### Modalita pacchettizzata

Utile se vuoi consegnare una versione stabile.

Passi suggeriti:

1. generare una versione finale dello script
2. pubblicare un `.user.js` statico
3. far installare quel file direttamente in Tampermonkey

Nota:
al momento il repo e impostato soprattutto per il workflow locale di sviluppo rapido.

## Limitazioni note

- Lo script esporta solo le missioni che la pagina rende disponibili con i filtri correnti.
- Se la pagina non ha ancora caricato la lista missioni, il pannello segnala errore.
- Se la sessione scade, le API non rispondono correttamente.
- Il contenuto dei file dipende dai permessi dell'utente loggato.
- Se un allegato ha un nome duplicato nella stessa cartella missione, lo script rinomina automaticamente il file aggiungendo un contatore.

## Risoluzione problemi

### Il pannello non compare

Controllare che:

- `npm run dev` sia attivo
- Tampermonkey sia abilitato
- lo script loader sia installato
- la pagina sia stata ricaricata

### Errore sul base64 o su `atob`

Questo problema e stato gestito nello script normalizzando le risposte delle API file, che a volte tornano come stringa JSON e non come base64 puro.

### Il download ZIP non parte

Controllare:

- popup/download del browser non bloccati
- sessione U-Web ancora valida
- presenza del token `appU-Web-token` nel browser

## File del progetto coinvolti

- [src/payload.js](/Users/spagnolo/github/UwebTampermonkey/src/payload.js)
- [scripts/build.mjs](/Users/spagnolo/github/UwebTampermonkey/scripts/build.mjs)
- [scripts/dev.mjs](/Users/spagnolo/github/UwebTampermonkey/scripts/dev.mjs)
- [tampermonkey.config.json](/Users/spagnolo/github/UwebTampermonkey/tampermonkey.config.json)

## Nota sicurezza

Lo script usa API interne dell'applicazione dentro una sessione autenticata reale. Va quindi distribuito solo a utenti autorizzati ad accedere ai dati esportati.
