# Uweb Tampermonkey

Setup per sviluppare e distribuire uno script Tampermonkey per U-Web Missioni. Il progetto genera sia un loader locale per iterare rapidamente sia uno userscript standalone pronto da installare dagli utenti finali.

## Sviluppo locale

1. Avvia il server locale:

```bash
npm run dev
```

2. Apri Tampermonkey e installa una sola volta:

[http://127.0.0.1:8123/tampermonkey-loader.user.js](http://127.0.0.1:8123/tampermonkey-loader.user.js)

In alternativa, dalla stessa pagina del dev server puoi installare anche:

[http://127.0.0.1:8123/uweb-export-missioni.user.js](http://127.0.0.1:8123/uweb-export-missioni.user.js)

Differenza:

- `tampermonkey-loader.user.js`: versione sviluppo, ricarica il payload locale e richiede il dev server attivo
- `uweb-export-missioni.user.js`: versione standalone, indipendente dal dev server dopo l'installazione

3. In Chrome apri `chrome://extensions/`, entra nei dettagli di Tampermonkey e abilita `User Scripts`.

4. Lascia aperta la pagina su cui vuoi lavorare.

5. Modifica il file [src/payload.js](/Users/spagnolo/github/UwebTampermonkey/src/payload.js).

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

4. Modifica [src/payload.js](/Users/spagnolo/github/UwebTampermonkey/src/payload.js) nel repo locale.

5. Il container monta la cartella del progetto e il watcher ricompila automaticamente. Per vedere il nuovo codice:

- ricarica la pagina, oppure
- usa il menu Tampermonkey `Reload local dev script`

File Docker principali:

- [Dockerfile](/Users/spagnolo/github/UwebTampermonkey/Dockerfile)
- [docker-compose.yml](/Users/spagnolo/github/UwebTampermonkey/docker-compose.yml)

Per fermare il servizio:

```bash
docker compose down
```

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
- `dev-payload.js`: payload servito dal dev server
- `uweb-export-missioni.user.js`: script standalone pronto per Tampermonkey

Per distribuire agli altri utenti, fai installare direttamente:

- [`dist/uweb-export-missioni.user.js`](/Users/spagnolo/github/UwebTampermonkey/dist/uweb-export-missioni.user.js)

## File principali

- [src/payload.js](/Users/spagnolo/github/UwebTampermonkey/src/payload.js): logica dello script che vuoi iterare
- [scripts/dev.mjs](/Users/spagnolo/github/UwebTampermonkey/scripts/dev.mjs): build + watch + server locale
- [scripts/build.mjs](/Users/spagnolo/github/UwebTampermonkey/scripts/build.mjs): genera loader e payload serviti da `dist/`
- [EXPORT-MISSIONI.md](/Users/spagnolo/github/UwebTampermonkey/docs/EXPORT-MISSIONI.md): guida completa per installare, usare e distribuire lo script di export missioni

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
