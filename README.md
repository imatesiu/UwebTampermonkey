# Uweb Tampermonkey

Setup per sviluppare e distribuire script Tampermonkey per U-Web Missioni. Il progetto genera sia loader locali per iterare rapidamente sia userscript standalone pronti da installare dagli utenti finali.

Script attuali:

- `U-Web Export Missioni`: esporta le missioni in uno ZIP
- `U-Web Anteprima Allegati Missione`: si attiva solo nella pagina della singola missione, ad esempio `/appautmis/listaautmis/773112`, e apre l'anteprima sotto la riga dell'allegato selezionato

## Sviluppo locale

1. Avvia il server locale:

```bash
npm run dev
```

2. Apri Tampermonkey e installa una sola volta:

[http://127.0.0.1:8123/tampermonkey-loader.user.js](http://127.0.0.1:8123/tampermonkey-loader.user.js)

In alternativa, dalla stessa pagina del dev server puoi installare anche:

[http://127.0.0.1:8123/uweb-export-missioni.user.js](http://127.0.0.1:8123/uweb-export-missioni.user.js)

Per lo script di anteprima allegati:

- sviluppo: [http://127.0.0.1:8123/tampermonkey-loader-anteprima-allegati.user.js](http://127.0.0.1:8123/tampermonkey-loader-anteprima-allegati.user.js)
- standalone: [http://127.0.0.1:8123/uweb-anteprima-allegati-missione.user.js](http://127.0.0.1:8123/uweb-anteprima-allegati-missione.user.js)

Differenza:

- `tampermonkey-loader.user.js`: versione sviluppo export, ricarica il payload locale e richiede il dev server attivo
- `tampermonkey-loader-anteprima-allegati.user.js`: versione sviluppo anteprima allegati
- `uweb-export-missioni.user.js`: versione standalone, indipendente dal dev server dopo l'installazione
- `uweb-anteprima-allegati-missione.user.js`: versione standalone anteprima allegati

3. In Chrome apri `chrome://extensions/`, entra nei dettagli di Tampermonkey e abilita `User Scripts`.

4. Lascia aperta la pagina su cui vuoi lavorare.

5. Modifica il file [src/payload.js](/Users/spagnolo/github/UwebTampermonkey/src/payload.js) per l'export missioni o [src/anteprima-allegati-missione.js](/Users/spagnolo/github/UwebTampermonkey/src/anteprima-allegati-missione.js) per l'anteprima allegati.

6. Per ricaricare il codice:

- ricarica la pagina, oppure
- usa il menu Tampermonkey `Reload local dev script`

Il file [tampermonkey.config.json](/Users/spagnolo/github/UwebTampermonkey/tampermonkey.config.json) ti permette di cambiare:

- metadata dev e produzione
- `@match`
- porta del server locale

## Sviluppo con Docker

Se preferisci non installare o usare Node direttamente sul Mac, puoi avviare lo stesso dev server dentro Docker.

1. Avvia il servizio:

```bash
docker compose up --build
```

2. Lascia il container attivo e installa una sola volta in Tampermonkey:

[http://127.0.0.1:8123/tampermonkey-loader.user.js](http://127.0.0.1:8123/tampermonkey-loader.user.js)

3. In Chrome apri `chrome://extensions/`, entra nei dettagli di Tampermonkey e abilita `User Scripts`.

4. Modifica [src/payload.js](/Users/spagnolo/github/UwebTampermonkey/src/payload.js) o [src/anteprima-allegati-missione.js](/Users/spagnolo/github/UwebTampermonkey/src/anteprima-allegati-missione.js) nel repo locale.

5. Il container monta la cartella del progetto e il watcher ricompila automaticamente. Per vedere il nuovo codice:

- ricarica la pagina, oppure
- usa il menu Tampermonkey `Reload local dev script`

File Docker principali:

- [Dockerfile](/Users/spagnolo/github/UwebTampermonkey/Dockerfile)
- [docker-compose.yml](/Users/spagnolo/github/UwebTampermonkey/docker-compose.yml)

Porte:

- dentro il container il servizio ascolta sempre su `8123`
- in locale `docker-compose.yml` espone `8123:8123`
- quindi apri `http://127.0.0.1:8123`

Per fermare il servizio:

```bash
docker compose down
```

## Deploy su server con dominio e HTTPS

Il progetto supporta anche un deployment su server con dominio pubblico e HTTPS, usando i certificati Let's Encrypt gia presenti sulla macchina.

Configurazione prevista:

- il loader Tampermonkey punta a un origin pubblico configurabile, ad esempio `https://tm.example.com`
- il server Node dentro Docker puo servire direttamente HTTPS
- i certificati vengono letti dalla macchina host, in un path del tipo:
  `/etc/letsencrypt/live/${LETSENCRYPT_SITE}/`

File utili:

- [docker-compose.server.yml](/Users/spagnolo/github/UwebTampermonkey/docker-compose.server.yml)
- [.env.server.example](/Users/spagnolo/github/UwebTampermonkey/.env.server.example)

Passi tipici:

1. Crea un file `.env.server` partendo da `.env.server.example`
2. imposta:
   - `PUBLIC_HOST=tm.example.com`
   - `LETSENCRYPT_SITE=tm.example.com`
3. avvia:

```bash
docker compose --env-file .env.server -f docker-compose.server.yml up --build -d
```

Se vuoi avviare direttamente il server Node senza passare da Docker, puoi usare anche:

```bash
PUBLIC_HOST=tm.example.com npm run dev:server
```

Il comando imposta automaticamente il loader in modalita server, quindi `payloadUrl` viene generato con `https://tm.example.com` senza modificare il codice.

In questo scenario:

- il container monta `/etc/letsencrypt` in sola lettura
- il server usa automaticamente:
  - `/etc/letsencrypt/live/${LETSENCRYPT_SITE}/fullchain.pem`
  - `/etc/letsencrypt/live/${LETSENCRYPT_SITE}/privkey.pem`
- il loader viene generato con origin pubblico `https://${PUBLIC_HOST}`

Porte:

- dentro il container il servizio ascolta su `8123`
- `docker-compose.server.yml` espone `443:8123`
- dall'esterno usi quindi direttamente `https://${PUBLIC_HOST}`

Nota:
per evitare problemi con i link simbolici di Let's Encrypt, il compose server monta tutta la directory `/etc/letsencrypt`, non solo `live/`.

## Distribuzione

Per generare anche la versione distribuibile:

```bash
npm run build:dist
```

Il comando di build ora esegue prima alcuni controlli minimi:

- verifica che Node sia disponibile in una versione supportata
- verifica che i file richiesti per la build esistano
- verifica che `package.json` e `tampermonkey.config.json` abbiano la stessa versione
- verifica che `dist/` sia scrivibile
- segnala se non ci sono dipendenze npm esterne richieste

Se vuoi lanciare esplicitamente questa pipeline di compilazione, puoi usare anche:

```bash
npm run compile
```

Output principali in `dist/`:

- `tampermonkey-loader.user.js`: loader per sviluppo locale
- `tampermonkey-loader-anteprima-allegati.user.js`: loader per sviluppo locale dello script anteprima allegati
- `dev-payload.js`: payload servito dal dev server
- `dev-payload-anteprima-allegati.js`: payload anteprima allegati servito dal dev server
- `uweb-export-missioni.user.js`: script standalone pronto per Tampermonkey
- `uweb-anteprima-allegati-missione.user.js`: script standalone per anteprima allegati

Per distribuire agli altri utenti, fai installare direttamente:

- [`dist/uweb-export-missioni.user.js`](/Users/spagnolo/github/UwebTampermonkey/dist/uweb-export-missioni.user.js)
- [`dist/uweb-anteprima-allegati-missione.user.js`](/Users/spagnolo/github/UwebTampermonkey/dist/uweb-anteprima-allegati-missione.user.js)

## File principali

- [src/payload.js](/Users/spagnolo/github/UwebTampermonkey/src/payload.js): logica dello script che vuoi iterare
- [src/anteprima-allegati-missione.js](/Users/spagnolo/github/UwebTampermonkey/src/anteprima-allegati-missione.js): logica dello script di anteprima allegati nella singola missione
- [scripts/dev.mjs](/Users/spagnolo/github/UwebTampermonkey/scripts/dev.mjs): build + watch + server locale
- [scripts/build.mjs](/Users/spagnolo/github/UwebTampermonkey/scripts/build.mjs): genera loader e payload serviti da `dist/`
- [EXPORT-MISSIONI.md](/Users/spagnolo/github/UwebTampermonkey/docs/EXPORT-MISSIONI.md): guida completa per installare, usare e distribuire lo script di export missioni
- [DISCLAIMER-USO-PRIVACY.md](/Users/spagnolo/github/UwebTampermonkey/docs/DISCLAIMER-USO-PRIVACY.md): bozza di disclaimer per uso dati, condivisione, privacy e limiti di utilizzo

## Playwright MCP con browser extension

Per lavorare sulla pagina gia aperta invece di farne aprire una nuova a Playwright MCP, conviene usare la modalita extension. La configurazione Codex locale da allineare e questa:

```toml
[mcp_servers.playwright]
command = "npx"
args = ["@playwright/mcp@latest", "--extension"]
```

Note pratiche:

- al primo avvio `npx` puo richiedere rete per scaricare `@playwright/mcp`
- con `--extension`, Playwright MCP si collega al browser Chrome/Edge dove hai installato la Playwright MCP Bridge extension
- una volta attivo, puoi chiedere a Codex di usare Playwright MCP per leggere DOM, cliccare elementi e verificare l’effetto del tuo userscript nella stessa sessione del browser

Riferimenti ufficiali:

- [Playwright MCP browser automation](https://playwright.dev/agents/playwright-mcp-browser-automation)
- [Playwright MCP registry / README](https://github.com/mcp/microsoft/playwright-mcp)
