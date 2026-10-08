# Zuschauer-Fenster Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ein unsichtbares, stummes 160p-Fenster auf `twitch.tv/<kanal>` laesst Twitch den Nutzer als Zuschauer zaehlen, damit beim Schauen in TwitchDual Kanalpunkte und Kisten fallen.

**Architecture:** Reine, getestete Logik in `src/zuschauer-fenster.js` (wann laeuft welches Fenster, Waechter-Entscheidungen). Ein duenner Treiber in `main.js` oeffnet/zerstoert das echte `BrowserWindow` auf `session.defaultSession` (dort liegt das Web-Login-Cookie) und misst per `executeJavaScript`, ob das Video laeuft. Ein Ereignis `zuschauer-status` zeigt ein 👁 am Punkte-Chip im Chat-Fenster.

**Tech Stack:** Electron (main/preload/renderer), Node `node:test` (`npm test`), Vanilla-JS-Renderer.

**Spec:** `docs/superpowers/specs/2026-10-08-zuschauer-fenster-design.md`

## Global Constraints

- Branch: `feat/zuschauer-fenster`. Kein Versions-Bump, kein Release (Janis gibt Releases an).
- Fenster nie sichtbar: `show:false`, `skipTaskbar:true`, niemals `show()`.
- Schliessen immer per `destroy()`, nie `close()`.
- `backgroundThrottling:false`, `setAudioMuted(true)`, Qualitaet `localStorage 'video-quality' = '{"default":"160p30"}'` + einmal `reload()`.
- Kein Preload, `contextIsolation:true`, `nodeIntegration:false`.
- Karenz bei Pause/Home: **60 s**. Waechter: erste Messung nach **45 s**, dann alle **30 s**; 2 Messungen ohne Fortschritt -> neu laden; nach **3** Neu-Ladungen ohne Fortschritt -> aufgeben.
- Kein Klick, kein erzwungenes Play, kein Nachbau von `sendSpadeEvents`.
- Kein `onBeforeSendHeaders`-Lauscher im Zuschauer-Fenster (die Integrity-Ernte belegt den einzigen).
- Diagnose-Bereich `zuschauer`, nur Flanken: `start`, `stopp`, `neu-laden`, `aufgegeben`, `zaehlt`.
- Logger in `main.js` heisst `diagLog.melde(bereich, ereignis, daten)` (NICHT `log`).
- Preload ist sandboxed: nur `require('electron')` (Test `test/preload-sandbox.test.js`).
- Code-Stil: deutsche Bezeichner und Kommentare ohne Umlaute im Code (`ae/oe/ue`), wie im Rest von `main.js`.

## Review Focus

1. **App beendet sich nicht**: Ein unsichtbares Fenster haelt `window-all-closed` auf. Erwartet: Schliessen des Video-Fensters zerstoert das Zuschauer-Fenster sofort, und der Steuerungs-Takt startet danach keins mehr (Task 2: `kanal` ist `null`, sobald `videoWin` fehlt; Test in Task 1 "kein Kanal -> sofortiger Stopp").
2. **Kanalwechsel waehrend der Karenz** (pausiert auf A, dann Kanal B geladen, Player noch nicht `playing`): Erwartet sofortiger Stopp von A, kein Weiterzaehlen auf dem falschen Kanal (Test in Task 1).
3. **Aufgeben-Schleife**: Nach `aufgegeben` darf derselbe Kanal nicht im 2-s-Takt sofort wieder starten; nach Wechsel zu B und zurueck zu A schon (Tests in Task 1).
4. **Reload-Schleife durch Qualitaets-Reload**: `did-finish-load` feuert nach dem eigenen `reload()` erneut; erwartet genau EIN Qualitaets-Reload pro Fenster (Flag in Task 2).
5. **Erste Messung nach (Neu-)Laden**: `currentTime` beginnt wieder bei ~0; erwartet, dass ein frisch laufendes Video als Fortschritt zaehlt und nicht mit der Zeit vor dem Reload verglichen wird (Test in Task 1).

---

## File Structure

- Create `src/zuschauer-fenster.js` - reine Logik: `zielKanal`, `createZuschauerSteuerung`, `createWaechter`.
- Create `test/zuschauer-fenster.test.js` - Unit-Tests dazu.
- Modify `main.js` - Treiber (Fenster oeffnen/zerstoeren, Waechter-Takt, Steuerungs-Takt, IPC `zuschauer-status-abfragen`, Aufraeumen beim Schliessen).
- Modify `preload.js` - `onZuschauerStatus`, `getZuschauerStatus`.
- Modify `renderer/chat/index.html`, `renderer/chat/chat.css`, `renderer/chat/chat.js` - 👁 im Punkte-Chip.
- Modify `docs/TODO.md` - Abschnitt "Zuschauer-Fenster (unveroeffentlicht)".

Entscheidung gegenueber der Spec: Statt `aktualisiere()` an sieben Ereignisstellen einzuhaengen, laeuft ein **2-s-Steuerungs-Takt** (wie der Punkte-Takt). Er liest dieselben Variablen (`currentLiveChannel`, `punkteSpielt`, `punkteHomeOffen`, `webTokenNutzbar()`), deckt damit alle Ereignisse ab und laesst die Karenz ohne Extra-Timer ablaufen. Hoechstens 2 s Verzug sind fuer Punkte bedeutungslos; die Spec-Funktion `waechterEntscheidung(verlauf)` wird als zustandsbehaftetes `createWaechter().messung(m)` gebaut.

---

### Task 1: Reine Logik `src/zuschauer-fenster.js`

**Files:**
- Create: `src/zuschauer-fenster.js`
- Test: `test/zuschauer-fenster.test.js`

**Interfaces:**
- Produces:
  - `zielKanal({ kanal, spielt, homeOffen, webAngemeldet }) -> string | null`
  - `createZuschauerSteuerung({ karenzMs = 60000 } = {})` mit
    - `aktualisiere(zustand, nowMs) -> null | { art: 'start', kanal } | { art: 'stopp', grund }`
      (`grund` ist einer von `'kein Live-Kanal'`, `'nicht angemeldet'`, `'Kanalwechsel'`, `'pausiert'`, `'Home offen'`)
    - `aufgegeben() -> void` (aktueller Kanal gesperrt, laufend = null)
    - `laufend() -> string | null`
  - `createWaechter({ stillstandBisNeuLaden = 2, maxNeuLaden = 3 } = {})` mit
    - `messung({ hatVideo, paused, currentTime }) -> 'ok' | 'warten' | 'neu-laden' | 'aufgeben'`
    - `neuLadungen() -> number`

- [ ] **Step 1: Failing Tests schreiben** - `test/zuschauer-fenster.test.js`:

```js
const { test } = require('node:test');
const assert = require('node:assert');
const { zielKanal, createZuschauerSteuerung, createWaechter } = require('../src/zuschauer-fenster');

const AN = { kanal: 'papaplatte', spielt: true, homeOffen: false, webAngemeldet: true };

test('zielKanal: alles erfuellt -> Kanal', () => {
  assert.equal(zielKanal(AN), 'papaplatte');
});

test('zielKanal: jede Bedingung einzeln verhindert', () => {
  assert.equal(zielKanal({ ...AN, kanal: null }), null);
  assert.equal(zielKanal({ ...AN, spielt: false }), null);
  assert.equal(zielKanal({ ...AN, homeOffen: true }), null);
  assert.equal(zielKanal({ ...AN, webAngemeldet: false }), null);
});

test('Steuerung: startet, danach Ruhe', () => {
  const s = createZuschauerSteuerung();
  assert.deepEqual(s.aktualisiere(AN, 0), { art: 'start', kanal: 'papaplatte' });
  assert.equal(s.laufend(), 'papaplatte');
  assert.equal(s.aktualisiere(AN, 2000), null);
});

test('Steuerung: ohne Ziel und ohne laufendes Fenster -> nichts', () => {
  const s = createZuschauerSteuerung();
  assert.equal(s.aktualisiere({ ...AN, spielt: false }, 0), null);
});

test('Steuerung: Kanalwechsel startet den neuen Kanal', () => {
  const s = createZuschauerSteuerung();
  s.aktualisiere(AN, 0);
  assert.deepEqual(s.aktualisiere({ ...AN, kanal: 'trymacs' }, 1000), { art: 'start', kanal: 'trymacs' });
  assert.equal(s.laufend(), 'trymacs');
});

test('Steuerung: Pause stoppt erst nach Ablauf der Karenz', () => {
  const s = createZuschauerSteuerung({ karenzMs: 60000 });
  s.aktualisiere(AN, 0);
  const pause = { ...AN, spielt: false };
  assert.equal(s.aktualisiere(pause, 1000), null);
  assert.equal(s.aktualisiere(pause, 60999), null);
  assert.deepEqual(s.aktualisiere(pause, 61000), { art: 'stopp', grund: 'pausiert' });
  assert.equal(s.laufend(), null);
});

test('Steuerung: Home offen stoppt nach Karenz mit Grund', () => {
  const s = createZuschauerSteuerung({ karenzMs: 60000 });
  s.aktualisiere(AN, 0);
  const home = { ...AN, homeOffen: true };
  assert.equal(s.aktualisiere(home, 0), null);
  assert.deepEqual(s.aktualisiere(home, 60000), { art: 'stopp', grund: 'Home offen' });
});

test('Steuerung: Rueckkehr in der Karenz bricht sie ab', () => {
  const s = createZuschauerSteuerung({ karenzMs: 60000 });
  s.aktualisiere(AN, 0);
  s.aktualisiere({ ...AN, spielt: false }, 1000);
  assert.equal(s.aktualisiere(AN, 30000), null);
  // neue Pause beginnt die Karenz von vorn
  assert.equal(s.aktualisiere({ ...AN, spielt: false }, 70000), null);
  assert.equal(s.aktualisiere({ ...AN, spielt: false }, 129999), null);
  assert.deepEqual(s.aktualisiere({ ...AN, spielt: false }, 130000), { art: 'stopp', grund: 'pausiert' });
});

test('Steuerung: kein Kanal / VOD / App zu -> sofortiger Stopp', () => {
  const s = createZuschauerSteuerung();
  s.aktualisiere(AN, 0);
  assert.deepEqual(s.aktualisiere({ ...AN, kanal: null }, 1000), { art: 'stopp', grund: 'kein Live-Kanal' });
});

test('Steuerung: Abmeldung -> sofortiger Stopp', () => {
  const s = createZuschauerSteuerung();
  s.aktualisiere(AN, 0);
  assert.deepEqual(s.aktualisiere({ ...AN, webAngemeldet: false }, 1000), { art: 'stopp', grund: 'nicht angemeldet' });
});

test('Steuerung: Kanalwechsel waehrend Pause -> sofortiger Stopp des alten', () => {
  const s = createZuschauerSteuerung({ karenzMs: 60000 });
  s.aktualisiere(AN, 0);
  s.aktualisiere({ ...AN, spielt: false }, 1000);
  assert.deepEqual(
    s.aktualisiere({ ...AN, kanal: 'trymacs', spielt: false }, 2000),
    { art: 'stopp', grund: 'Kanalwechsel' }
  );
  assert.deepEqual(s.aktualisiere({ ...AN, kanal: 'trymacs' }, 3000), { art: 'start', kanal: 'trymacs' });
});

test('Steuerung: nach aufgegeben kein Neustart desselben Kanals', () => {
  const s = createZuschauerSteuerung();
  s.aktualisiere(AN, 0);
  s.aufgegeben();
  assert.equal(s.laufend(), null);
  assert.equal(s.aktualisiere(AN, 2000), null);
  assert.equal(s.aktualisiere(AN, 600000), null);
});

test('Steuerung: nach aufgegeben startet ein anderer Kanal und spaeter wieder der alte', () => {
  const s = createZuschauerSteuerung();
  s.aktualisiere(AN, 0);
  s.aufgegeben();
  assert.deepEqual(s.aktualisiere({ ...AN, kanal: 'trymacs' }, 1000), { art: 'start', kanal: 'trymacs' });
  assert.deepEqual(s.aktualisiere(AN, 2000), { art: 'start', kanal: 'papaplatte' });
});

test('Steuerung: Sperre faellt auch, wenn zwischendurch kein Kanal geladen war', () => {
  const s = createZuschauerSteuerung();
  s.aktualisiere(AN, 0);
  s.aufgegeben();
  s.aktualisiere({ ...AN, kanal: null }, 1000);
  assert.deepEqual(s.aktualisiere(AN, 2000), { art: 'start', kanal: 'papaplatte' });
});

const laeuft = (t) => ({ hatVideo: true, paused: false, currentTime: t });
const steht = (t) => ({ hatVideo: true, paused: false, currentTime: t });

test('Waechter: laufendes Video ist ok, auch bei erster Messung', () => {
  const w = createWaechter();
  assert.equal(w.messung(laeuft(40)), 'ok');
  assert.equal(w.messung(laeuft(70)), 'ok');
});

test('Waechter: erste Messung bei 0 oder pausiert ist kein Fortschritt', () => {
  const w = createWaechter();
  assert.equal(w.messung(laeuft(0)), 'warten');
  const w2 = createWaechter();
  assert.equal(w2.messung({ hatVideo: true, paused: true, currentTime: 50 }), 'warten');
});

test('Waechter: zwei Messungen ohne Fortschritt -> neu laden', () => {
  const w = createWaechter();
  w.messung(laeuft(40));
  assert.equal(w.messung(steht(40)), 'warten');
  assert.equal(w.messung(steht(40)), 'neu-laden');
  assert.equal(w.neuLadungen(), 1);
});

test('Waechter: kein Video zaehlt als Stillstand', () => {
  const w = createWaechter();
  assert.equal(w.messung({ hatVideo: false, paused: true, currentTime: 0 }), 'warten');
  assert.equal(w.messung({ hatVideo: false, paused: true, currentTime: 0 }), 'neu-laden');
});

test('Waechter: nach Neu-Laden zaehlt die neue Zeitachse (kein Vergleich mit vorher)', () => {
  const w = createWaechter();
  w.messung(laeuft(500));
  w.messung(steht(500));
  assert.equal(w.messung(steht(500)), 'neu-laden');
  // nach dem Reload beginnt currentTime klein - das ist Fortschritt, kein Rueckschritt
  assert.equal(w.messung(laeuft(12)), 'ok');
  assert.equal(w.neuLadungen(), 0);
});

test('Waechter: nach drei erfolglosen Neu-Ladungen aufgeben', () => {
  const w = createWaechter();
  const tot = { hatVideo: false, paused: true, currentTime: 0 };
  const ergebnisse = [];
  for (let i = 0; i < 8; i++) ergebnisse.push(w.messung(tot));
  assert.deepEqual(ergebnisse, [
    'warten', 'neu-laden',
    'warten', 'neu-laden',
    'warten', 'neu-laden',
    'warten', 'aufgeben'
  ]);
});

test('Waechter: Fortschritt setzt den Neu-Lade-Zaehler zurueck', () => {
  const w = createWaechter();
  const tot = { hatVideo: false, paused: true, currentTime: 0 };
  w.messung(tot); w.messung(tot); // neu-laden 1
  w.messung(tot); w.messung(tot); // neu-laden 2
  assert.equal(w.messung(laeuft(20)), 'ok');
  assert.equal(w.neuLadungen(), 0);
});
```

- [ ] **Step 2: Test laufen lassen, muss scheitern**

Run: `node --test test/zuschauer-fenster.test.js`
Expected: FAIL mit `Cannot find module '../src/zuschauer-fenster'`.

- [ ] **Step 3: Implementierung** - `src/zuschauer-fenster.js`:

```js
// Zuschauer-Fenster: reine Logik, DOM- und Electron-frei (voll testbar).
// Der eingebettete Player zaehlt bei Twitch nicht als Zuschauen (gemessen
// 13.08.2026: 20 min = 0 Punkte, keine Kiste). Ein unsichtbares Fenster auf
// twitch.tv/<kanal> schon. Hier steht nur, WANN es fuer WELCHEN Kanal laeuft
// und wie der Waechter Messungen bewertet; das echte Fenster lebt in main.js.

// Kanal, den das Fenster schauen soll, oder null.
function zielKanal({ kanal, spielt, homeOffen, webAngemeldet }) {
  if (!kanal || !webAngemeldet || !spielt || homeOffen) return null;
  return kanal;
}

// Harte Gruende wirken sofort, weiche (Pause, Home) erst nach der Karenz -
// wer kurz pausiert, soll keine Zaehlzeit verlieren.
function stoppGrund(zustand, laufend) {
  if (!zustand.kanal) return { grund: 'kein Live-Kanal', hart: true };
  if (!zustand.webAngemeldet) return { grund: 'nicht angemeldet', hart: true };
  if (zustand.kanal !== laufend) return { grund: 'Kanalwechsel', hart: true };
  if (zustand.homeOffen) return { grund: 'Home offen', hart: false };
  return { grund: 'pausiert', hart: false };
}

function createZuschauerSteuerung({ karenzMs = 60000 } = {}) {
  let laufend = null;
  let karenzSeit = null;
  // Kanal, fuer den der Waechter aufgegeben hat. Faellt, sobald ein anderer
  // (oder gar kein) Kanal geladen ist - sonst startete der 2-s-Takt dasselbe
  // kaputte Fenster sofort wieder.
  let gesperrt = null;

  function aktualisiere(zustand, nowMs) {
    if (gesperrt && zustand.kanal !== gesperrt) gesperrt = null;
    const ziel = zielKanal(zustand);

    if (ziel && ziel === laufend) {
      karenzSeit = null;
      return null;
    }
    if (ziel && ziel !== gesperrt) {
      laufend = ziel;
      karenzSeit = null;
      return { art: 'start', kanal: ziel };
    }
    if (!laufend) return null;

    const { grund, hart } = stoppGrund(zustand, laufend);
    if (!hart) {
      if (karenzSeit === null) karenzSeit = nowMs;
      if (nowMs - karenzSeit < karenzMs) return null;
    }
    laufend = null;
    karenzSeit = null;
    return { art: 'stopp', grund };
  }

  function aufgegeben() {
    gesperrt = laufend;
    laufend = null;
    karenzSeit = null;
  }

  return { aktualisiere, aufgegeben, laufend: () => laufend };
}

// Bewertet die Waechter-Messungen eines Fensters. Fortschritt = Video da,
// nicht pausiert und currentTime gestiegen. Nach (Neu-)Laden gibt es keine
// alte Zeit; dann zaehlt jedes laufende Video mit currentTime > 0.
function createWaechter({ stillstandBisNeuLaden = 2, maxNeuLaden = 3 } = {}) {
  let letzteZeit = null;
  let stillstand = 0;
  let neuLadungen = 0;

  function messung(m) {
    const laeuft = !!(m && m.hatVideo && !m.paused);
    const zeit = m && typeof m.currentTime === 'number' ? m.currentTime : 0;
    const fortschritt = laeuft && (letzteZeit === null ? zeit > 0 : zeit > letzteZeit);
    if (laeuft) letzteZeit = zeit;

    if (fortschritt) {
      stillstand = 0;
      neuLadungen = 0;
      return 'ok';
    }
    stillstand += 1;
    if (stillstand < stillstandBisNeuLaden) return 'warten';
    stillstand = 0;
    letzteZeit = null;
    if (neuLadungen >= maxNeuLaden) return 'aufgeben';
    neuLadungen += 1;
    return 'neu-laden';
  }

  return { messung, neuLadungen: () => neuLadungen };
}

module.exports = { zielKanal, createZuschauerSteuerung, createWaechter };
```

- [ ] **Step 4: Tests laufen lassen, muessen bestehen**

Run: `node --test test/zuschauer-fenster.test.js`
Expected: alle PASS. Danach `npm test` - gesamte Suite gruen.

- [ ] **Step 5: Commit**

```bash
git add src/zuschauer-fenster.js test/zuschauer-fenster.test.js
git commit -m "feat: Logik fuer das unsichtbare Zuschauer-Fenster"
```

---

### Task 2: Treiber in `main.js`

**Files:**
- Modify: `main.js` (neuer Abschnitt direkt nach `punkteTick()` und vor `app.whenReady()`; Ergaenzungen in `videoWin.on('closed')` ~Z.148, `app.whenReady()` ~Z.940, neues `before-quit`)

**Interfaces:**
- Consumes: `zielKanal` nicht direkt; `createZuschauerSteuerung`, `createWaechter` aus Task 1. Vorhandene main.js-Bindungen: `BrowserWindow`, `session`, `videoWin`, `currentLiveChannel`, `punkteSpielt`, `punkteHomeOffen`, `webTokenNutzbar()`, `broadcast(channel, payload)`, `diagLog.melde`, `ipcMain`.
- Produces: IPC-Ereignis `zuschauer-status` mit `{ zaehlt: boolean }` (broadcast an beide Fenster); `ipcMain.handle('zuschauer-status-abfragen') -> { zaehlt: boolean }`.

Nicht unit-testbar (echtes Fenster). Pruefung: Suite gruen + Rauchtest in Step 4.

- [ ] **Step 1: Zuschauer-Abschnitt einfuegen** - direkt nach dem Ende von `async function punkteTick() { ... }` (vor `app.whenReady()`):

```js
// --- Zuschauer-Fenster -------------------------------------------------
// Der Embed zaehlt bei Twitch nicht als Zuschauen -> keine Punkte, keine
// Kisten (Messung 13.08.2026, Protokoll 07.10.2026). Ein unsichtbares,
// stummes 160p-Fenster auf twitch.tv/<kanal> schon. Es nutzt die
// Default-Session, dort liegt das Web-Login-Cookie. Logik (wann, welcher
// Kanal, Waechter) in src/zuschauer-fenster.js; hier nur das echte Fenster.
// Spec: docs/superpowers/specs/2026-10-08-zuschauer-fenster-design.md
const { createZuschauerSteuerung, createWaechter } = require('./src/zuschauer-fenster');

const zuschauerSteuerung = createZuschauerSteuerung({ karenzMs: 60000 });
let zuschauerWin = null;
let zuschauerKanal = null;
let zuschauerWaechter = null;
let zuschauerErstTimer = null;  // erste Messung 45 s nach Start
let zuschauerTakt = null;       // danach alle 30 s
let zuschauerZaehlt = false;

function zuschauerZustand() {
  return {
    // Ohne Video-Fenster gibt es keinen Kanal: sonst startete der Takt nach
    // dem Schliessen ein neues unsichtbares Fenster, und das haelt
    // window-all-closed (= App-Ende) fuer immer auf.
    kanal: videoWin && !videoWin.isDestroyed() ? currentLiveChannel : null,
    spielt: punkteSpielt,
    homeOffen: punkteHomeOffen,
    webAngemeldet: webTokenNutzbar()
  };
}

function setzeZuschauerZaehlt(zaehlt) {
  if (zaehlt === zuschauerZaehlt) return;
  zuschauerZaehlt = zaehlt;
  broadcast('zuschauer-status', { zaehlt });
  if (zaehlt) diagLog.melde('zuschauer', 'zaehlt', { kanal: zuschauerKanal });
}

function stoppeZuschauer(grund) {
  if (zuschauerErstTimer) clearTimeout(zuschauerErstTimer);
  if (zuschauerTakt) clearInterval(zuschauerTakt);
  zuschauerErstTimer = null;
  zuschauerTakt = null;
  const win = zuschauerWin;
  const kanal = zuschauerKanal;
  setzeZuschauerZaehlt(false);
  zuschauerWin = null;
  zuschauerKanal = null;
  zuschauerWaechter = null;
  if (win) {
    // destroy() statt close(): close() laesst die Seite beforeunload
    // ausfuehren; bei show:false bliebe ein abgelehntes Fenster unsichtbar
    // fuer immer offen (gleiche Lehre wie ernteIntegrity).
    try { win.destroy(); } catch { /* schon zu */ }
    diagLog.melde('zuschauer', 'stopp', { kanal, grund });
  }
}

const VIDEO_MESSUNG = `(() => {
  const v = document.querySelector('video');
  return v
    ? { hatVideo: true, paused: v.paused, currentTime: v.currentTime }
    : { hatVideo: false, paused: true, currentTime: 0 };
})()`;

async function pruefeZuschauer() {
  const win = zuschauerWin;
  const waechter = zuschauerWaechter;
  if (!win || win.isDestroyed() || !waechter) return;
  let m = { hatVideo: false, paused: true, currentTime: 0 };
  try {
    m = await win.webContents.executeJavaScript(VIDEO_MESSUNG);
  } catch { /* Seite haengt oder Renderer weg -> zaehlt als Stillstand */ }
  if (win !== zuschauerWin) return; // inzwischen gestoppt oder gewechselt
  const aktion = waechter.messung(m);
  if (aktion === 'ok') {
    setzeZuschauerZaehlt(true);
  } else if (aktion === 'neu-laden') {
    setzeZuschauerZaehlt(false);
    diagLog.melde('zuschauer', 'neu-laden', { kanal: zuschauerKanal, versuch: waechter.neuLadungen() });
    try { win.webContents.reload(); } catch { /* egal, naechste Messung */ }
  } else if (aktion === 'aufgeben') {
    diagLog.melde('zuschauer', 'aufgegeben', { kanal: zuschauerKanal });
    zuschauerSteuerung.aufgegeben();
    stoppeZuschauer('aufgegeben');
  }
}

function starteZuschauer(kanal) {
  const win = new BrowserWindow({
    show: false,
    skipTaskbar: true,
    webPreferences: {
      session: session.defaultSession,
      backgroundThrottling: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  });
  zuschauerWin = win;
  zuschauerKanal = kanal;
  zuschauerWaechter = createWaechter();
  win.webContents.setAudioMuted(true);
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));

  // 160p: Twitch liest die Qualitaet beim Laden aus localStorage. Also beim
  // ersten Laden setzen und EINMAL neu laden. Das Flag verhindert, dass das
  // did-finish-load des eigenen Reloads eine Endlosschleife ausloest.
  let qualitaetGesetzt = false;
  win.webContents.on('did-finish-load', () => {
    if (qualitaetGesetzt || win.isDestroyed()) return;
    qualitaetGesetzt = true;
    win.webContents
      .executeJavaScript(`localStorage.setItem('video-quality', '{"default":"160p30"}'); true`)
      .then(() => { if (!win.isDestroyed()) win.webContents.reload(); })
      .catch(() => { /* bleibt bei Twitchs Standardqualitaet, zaehlt trotzdem */ });
  });

  win.loadURL('https://www.twitch.tv/' + encodeURIComponent(kanal)).catch(() => {
    /* Netz weg: der Waechter sieht kein Video und laedt neu */
  });
  diagLog.melde('zuschauer', 'start', { kanal });

  zuschauerErstTimer = setTimeout(() => {
    zuschauerErstTimer = null;
    if (win !== zuschauerWin) return;
    pruefeZuschauer().catch(() => {});
    zuschauerTakt = setInterval(() => { pruefeZuschauer().catch(() => {}); }, 30000);
  }, 45000);
}

function aktualisiereZuschauer() {
  const aktion = zuschauerSteuerung.aktualisiere(zuschauerZustand(), Date.now());
  if (!aktion) return;
  if (aktion.art === 'stopp') {
    stoppeZuschauer(aktion.grund);
  } else if (aktion.art === 'start') {
    if (zuschauerWin) stoppeZuschauer('Kanalwechsel');
    starteZuschauer(aktion.kanal);
  }
}

// Ein neu geladenes Chat-Fenster fragt den aktuellen Stand selbst ab.
ipcMain.handle('zuschauer-status-abfragen', () => ({ zaehlt: zuschauerZaehlt }));
```

- [ ] **Step 2: Takt starten und aufraeumen**

In `app.whenReady()` direkt unter der Zeile `setInterval(() => { punkteTick().catch(...) }, 1000);`:

```js
  // Zuschauer-Fenster: liest dieselben Zustaende wie der Punkte-Takt
  // (Kanal, Play, Home, Login). Ein Takt statt Haken an jeder Ereignisstelle;
  // hoechstens 2 s Verzug, und die 60-s-Karenz laeuft ohne Extra-Timer ab.
  setInterval(aktualisiereZuschauer, 2000);
```

In `videoWin.on('closed', () => { ... })` als erste Zeile im Handler:

```js
    stoppeZuschauer('App-Ende'); // sonst haelt das unsichtbare Fenster das App-Ende auf
```

Direkt vor `app.on('window-all-closed', ...)`:

```js
app.on('before-quit', () => stoppeZuschauer('App-Ende'));
```

Hinweis: `stoppeZuschauer` ruft `broadcast`, das zerstoerte Fenster selbst ueberspringt (`isDestroyed()`), also gefahrlos waehrend des Schliessens. Die Funktionen sind `function`-Deklarationen bzw. werden erst nach Modul-Ende aufgerufen - die Reihenfolge im File ist unkritisch, `const zuschauerSteuerung` muss aber vor dem ersten Takt stehen (ist es, der Takt startet in `whenReady`).

- [ ] **Step 3: Suite laufen lassen**

Run: `npm test`
Expected: alles gruen (Anzahl = vorher + Tests aus Task 1).

- [ ] **Step 4: Rauchtest (nur Start/Stopp, kein Anschauen)**

Laeuft eine installierte TwitchDual, erst schliessen. Dann mit eingeschaltetem Diagnose-Schalter `npm start`, einen Live-Kanal laden (Web-Login vorausgesetzt), ~60 s warten, App schliessen. Pruefen:

Run (PowerShell): `Select-String -Path "$env:APPDATA\twitchdual\diagnose.log" -Pattern 'zuschauer:' | Select-Object -Last 10`
Expected: `zuschauer:start {"kanal":"..."}`, danach `zuschauer:zaehlt`, beim Schliessen `zuschauer:stopp {..."grund":"App-Ende"}`. Und kein haengender Prozess:
Run: `Get-CimInstance Win32_Process -Filter "Name='electron.exe'" | ? CommandLine -match TwitchDual | Measure-Object`
Expected: `Count : 0` wenige Sekunden nach dem Schliessen.

Wenn kein Web-Login vorhanden ist: Rauchtest ueberspringen und im Bericht sagen; Janis macht den Live-Lauf (Task 4).

- [ ] **Step 5: Commit**

```bash
git add main.js
git commit -m "feat: unsichtbares Zuschauer-Fenster laesst Twitch Punkte und Kisten zaehlen"
```

---

### Task 3: 👁 am Punkte-Chip

**Files:**
- Modify: `preload.js:111` (neben `onPointsUpdate`)
- Modify: `renderer/chat/index.html:184-185` (im `#points-chip`)
- Modify: `renderer/chat/chat.css:135` (nach den `#points-icon`-Regeln)
- Modify: `renderer/chat/chat.js:1624` (nach `window.twitchDual.onPointsUpdate(zeigePunkte);`)

**Interfaces:**
- Consumes: IPC `zuschauer-status` `{ zaehlt }` und `zuschauer-status-abfragen` aus Task 2.
- Produces: `window.twitchDual.onZuschauerStatus(cb)`, `window.twitchDual.getZuschauerStatus() -> Promise<{ zaehlt }>`.

- [ ] **Step 1: Preload** - in `preload.js` direkt unter der Zeile `onPointsUpdate: ...`:

```js
    // Zuschauer-Fenster: nur ein bool ("Twitch zaehlt dich"), sonst nichts.
    onZuschauerStatus: (cb) => { ipcRenderer.on('zuschauer-status', (_e, s) => cb(s)); },
    getZuschauerStatus: () => ipcRenderer.invoke('zuschauer-status-abfragen'),
```

- [ ] **Step 2: Markup** - in `renderer/chat/index.html` als erstes Kind von `<span id="points-chip" ...>` (vor `<img id="points-icon" ...>`):

```html
        <span id="zuschauer-auge" class="hidden" title="Twitch zählt dich als Zuschauer" aria-label="Twitch zählt dich als Zuschauer">👁</span>
```

- [ ] **Step 3: CSS** - in `renderer/chat/chat.css` nach der Zeile `#points-icon.hidden, #points-svg.hidden { display: none; }`:

```css
#zuschauer-auge { font-size: 0.85em; line-height: 1; opacity: 0.75; }
#zuschauer-auge.hidden { display: none; }
```

- [ ] **Step 4: JS** - in `renderer/chat/chat.js` direkt nach `window.twitchDual.onPointsUpdate(zeigePunkte);`:

```js
// 👁 = das unsichtbare Zuschauer-Fenster laeuft UND sein Video schreitet
// nachweislich fort (main meldet erst nach der ersten Waechter-Messung).
// Lebt im Chip und verschwindet mit ihm, wenn kein Stand gezeigt wird.
const $zuschauerAuge = document.getElementById('zuschauer-auge');
function zeigeZuschauer(s) {
  if ($zuschauerAuge) $zuschauerAuge.classList.toggle('hidden', !(s && s.zaehlt));
}
window.twitchDual.onZuschauerStatus(zeigeZuschauer);
// Neu geladenes Chat-Fenster: Stand einmal abholen statt auf die naechste Flanke zu warten.
window.twitchDual.getZuschauerStatus().then(zeigeZuschauer).catch(() => {});
```

- [ ] **Step 5: Pruefen**

Run: `npm test`
Expected: gruen, insbesondere `preload-sandbox.test.js` (keine neuen requires).
Run: `grep -n "points-value\|textContent" renderer/chat/chat.js | sed -n 1,40p` und sicherstellen, dass `zeigePunkte` nirgends `$pointsChip.textContent`/`innerHTML` setzt (sonst wuerde das Auge geloescht). Erwartet: nur `$pointsValue.textContent`.

- [ ] **Step 6: Commit**

```bash
git add preload.js renderer/chat/index.html renderer/chat/chat.css renderer/chat/chat.js
git commit -m "feat: Auge am Punkte-Chip, solange Twitch dich als Zuschauer zaehlt"
```

---

### Task 4: Doku + Uebergabe an den Live-Lauf

**Files:**
- Modify: `docs/TODO.md` (neuer Abschnitt oberhalb von `## v1.13.0 - ...`)

- [ ] **Step 1: TODO-Abschnitt** einfuegen:

```markdown
## Zuschauer-Fenster (unveroeffentlicht, Branch feat/zuschauer-fenster)
- Problem: Embed zaehlt nicht als Zuschauen -> keine Punkte, keine Kisten
  (Protokoll 07.10.: papaplatte 3 h Stand fest, claimID immer null). Das
  Abholen selbst lief: 5/5 Kisten am 06./07.10. sofort geholt.
- Loesung: unsichtbares, stummes 160p-Fenster auf twitch.tv/<kanal>
  (Default-Session = Web-Login). Laeuft bei Live + spielt + Home zu +
  Web-Login; Pause/Home 60 s Karenz; Kanalwechsel/VOD/Abmeldung sofort.
- Logik `src/zuschauer-fenster.js` (getestet), Treiber in `main.js`
  (2-s-Takt), Waechter 45 s / 30 s, 2x Stillstand -> neu laden,
  3x erfolglos -> aufgeben bis Kanalwechsel.
- 👁 am Punkte-Chip, sobald das Video im Fenster nachweislich laeuft.
- Diagnose: `zuschauer:start/stopp/zaehlt/neu-laden/aufgegeben`.
- Offen: Live-Beweis (Janis): ~15 min Live ohne Browser -> Stand steigt,
  mindestens ein `kiste-ok`. Falls "Schaust du noch?"/Altersabfrage im
  Protokoll als `aufgegeben` auftaucht: eigens behandeln.
- Spec/Plan: `docs/superpowers/{specs,plans}/2026-10-08-zuschauer-fenster*`.
```

- [ ] **Step 2: Gesamte Suite**

Run: `npm test`
Expected: gruen.

- [ ] **Step 3: Commit**

```bash
git add docs/TODO.md
git commit -m "docs: Zuschauer-Fenster in TODO"
```

- [ ] **Step 4: Uebergabe** - Janis bitten (nicht selbst anschauen, keine Screenshots): installierte App schliessen, `npm start`, Diagnose an, Live-Kanal ~15 min laufen lassen, Browser zu. Danach wertet der Agent das Protokoll aus:
`Select-String -Path "$env:APPDATA\twitchdual\diagnose.log" -Pattern 'zuschauer:|kiste-|punkte:kontext' | Select-Object -Last 40`
Erfolg = `zuschauer:zaehlt`, steigender `stand` in `punkte:kontext`, mindestens ein `kiste-ok`.
