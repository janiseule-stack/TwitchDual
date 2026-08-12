# PubSub-Spike Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Beweisen oder widerlegen, dass TwitchDual mit dem Web-Token denselben Ereignis-Strom abonnieren kann wie die Twitch-Webseite — und darüber angeheftete Nachrichten und fremde Kanalpunkt-Einlösungen empfängt.

**Architecture:** Zwei Stufen. Stufe 0 hängt sich mit dem DevTools-Protokoll (`webContents.debugger`, Domäne `Network`) an das bereits vorhandene Integrity-Ernte-Fenster und schreibt mit, welche WebSocket-Verbindungen die echte Seite öffnet und welche Rahmen darüber gehen. Stufe 1 baut mit diesem Wissen eine eigene Verbindung im Main-Prozess auf und abonniert drei Themen. Beides ist Wegwerf-Code hinter einer Umgebungsvariable.

**Tech Stack:** Electron 33 (`BrowserWindow`, `webContents.debugger`), Node `ws` ist NICHT vorhanden — für die eigene Verbindung wird die in Node 18+ eingebaute `WebSocket`-Klasse benutzt (in Electron 33 / Node 20 verfügbar). Protokoll über `updaterLog` nach `%APPDATA%\twitchdual\updater.log`.

## Global Constraints

- **Wegwerf-Code.** Alles hinter `TWITCHDUAL_PUBSUB_SPIKE=1`. Ohne die Variable passiert nichts. Nach Auswertung restlos entfernt.
- **Der Token bleibt im Main-Prozess.** Keine neue IPC-Brücke, kein Token im Renderer.
- **Keine Zugangsdaten im Protokoll.** Jeder Rahmen wird vor dem Schreiben durch `schwaerzen()` geschickt (Task 1, Schritt 1).
- **Die laufende App darf nicht leiden.** Jeder Spike-Pfad in `try/catch`; ein Fehlschlag darf Chat, Player und Punkte-Takt nicht beeinträchtigen.
- **Keine Tests für Wegwerf-Code.** Erst was bleibt, bekommt Tests. `npm test` muss trotzdem grün bleiben (212 Tests).
- **In `main.js` heißt der Logger `updaterLog`**, nicht `log`.
- Arbeitszweig: `spike/pubsub` (von master).

---

### Task 1: Stufe 0 — mitschreiben, was die echte Seite tut

**Files:**
- Create: `src/spike-pubsub-beobachten.js`
- Modify: `src/twitch-integrity.js` (Haken zum Anhängen des Beobachters)
- Modify: `main.js` (Aufruf hinter der Umgebungsvariable)

**Interfaces:**
- Produces: `beobachteWebSockets(webContents, log)` — hängt sich an ein
  vorhandenes `webContents`, schreibt über `log(ereignis, text)` mit und
  liefert nichts zurück. Wirft nie.

- [ ] **Step 1: Beobachter-Modul schreiben**

```js
// src/spike-pubsub-beobachten.js
// WEGWERF-CODE (Spike 2026-08-12). Schreibt mit, welche WebSocket-
// Verbindungen die echte Twitch-Seite oeffnet und welche Rahmen darueber
// gehen. Ueber webRequest waere nur der Handschlag sichtbar, nicht die
// Rahmen - deshalb das DevTools-Protokoll (Domaene Network).

// Zugangsdaten duerfen nie ins Protokoll. Twitch schickt den Token im
// LISTEN-Rahmen als "auth_token"; wir ersetzen den Wert vor dem Schreiben.
function schwaerzen(text) {
  return String(text || '')
    .replace(/("auth_token"\s*:\s*")[^"]*(")/g, '$1***$2')
    .replace(/(OAuth\s+)[A-Za-z0-9]+/g, '$1***');
}

function kuerzen(text, max = 600) {
  const s = String(text || '');
  return s.length > max ? s.slice(0, max) + ' …[' + s.length + ' Zeichen]' : s;
}

function beobachteWebSockets(webContents, log) {
  try {
    webContents.debugger.attach('1.3');
  } catch (e) {
    log('spike-ws-fehler', 'debugger.attach: ' + e.message);
    return;
  }

  const adressen = new Map(); // requestId -> URL

  webContents.debugger.on('message', (_ev, methode, p) => {
    try {
      if (methode === 'Network.webSocketCreated') {
        adressen.set(p.requestId, p.url);
        log('spike-ws-offen', p.url);
        return;
      }
      const richtung = methode === 'Network.webSocketFrameSent' ? 'raus'
        : methode === 'Network.webSocketFrameReceived' ? 'rein' : null;
      if (!richtung) return;
      const url = adressen.get(p.requestId) || '?';
      const nutzlast = p.response && p.response.payloadData;
      log('spike-ws-rahmen', richtung + ' ' + url + ' ' + kuerzen(schwaerzen(nutzlast)));
    } catch (e) {
      log('spike-ws-fehler', 'message: ' + e.message);
    }
  });

  webContents.debugger.sendCommand('Network.enable').catch((e) => {
    log('spike-ws-fehler', 'Network.enable: ' + e.message);
  });
}

module.exports = { beobachteWebSockets, schwaerzen, kuerzen };
```

- [ ] **Step 2: Haken in der Integrity-Ernte ergänzen**

In `src/twitch-integrity.js` bekommt `ernteIntegrity` einen optionalen
Parameter. Signatur ändern von

```js
function ernteIntegrity({ BrowserWindow, ses, timeoutMs = 30000 }) {
```

auf

```js
function ernteIntegrity({ BrowserWindow, ses, timeoutMs = 30000, beiFenster = null }) {
```

und direkt nach `win.webContents.setAudioMuted(true);` einfügen:

```js
      // SPIKE-HAKEN (2026-08-12, wieder entfernen): erlaubt dem Aufrufer,
      // sich an das Ernte-Fenster zu haengen. Fehler hier duerfen die Ernte
      // nicht kippen - sie ist der wichtigere Vorgang.
      if (beiFenster) {
        try { beiFenster(win.webContents); } catch { /* Spike darf nie stoeren */ }
      }
```

**Wichtig:** Das Ernte-Fenster schließt sich, sobald die erste
Integrity-Kopfzeile da ist — oft nach wenigen Sekunden. Für die Beobachtung
ist das zu kurz. Deshalb im Spike-Betrieb die Zeitüberschreitung hochsetzen
(Schritt 3) und das Fenster absichtlich stehen lassen.

- [ ] **Step 3: Aufruf in main.js hinter der Umgebungsvariable**

In `main.js` an der Stelle, an der `ernteIntegrity` bereits gerufen wird
(Funktion `kisteEinloesen`), NICHTS ändern. Stattdessen einen eigenen,
unabhängigen Spike-Start nach dem Erzeugen der Fenster einfügen — sonst
hängt die Beobachtung daran, dass gerade eine Kiste offen ist:

```js
// SPIKE 2026-08-12 (wieder entfernen): Beobachtet, welche WebSockets die
// echte Twitch-Seite oeffnet. Nur mit TWITCHDUAL_PUBSUB_SPIKE=1.
if (process.env.TWITCHDUAL_PUBSUB_SPIKE === '1') {
  const { beobachteWebSockets } = require('./src/spike-pubsub-beobachten');
  setTimeout(() => {
    integritySpike.ernteIntegrity({
      BrowserWindow,
      ses: session.defaultSession,
      timeoutMs: 300000, // 5 Minuten offen lassen, damit Rahmen auflaufen
      beiFenster: (wc) => beobachteWebSockets(wc, updaterLog)
    }).then((satz) => updaterLog('spike-ernte-fertig', satz ? 'Satz erhalten' : 'ohne Satz'));
  }, 5000);
}
```

Dabei ist `integritySpike` das bereits importierte Integrity-Modul; den
vorhandenen Import wiederverwenden, keinen zweiten anlegen. Falls der Import
in `main.js` destrukturiert ist, entsprechend anpassen.

- [ ] **Step 4: Syntax prüfen und Gesamtsuite**

Run: `node -c main.js; node -c src/spike-pubsub-beobachten.js; npm test`
Expected: kein Syntaxfehler, 212 Tests grün (Wegwerf-Code hat keine Tests,
darf aber auch keine bestehenden brechen).

- [ ] **Step 5: Spike laufen lassen**

Run: `$env:TWITCHDUAL_PUBSUB_SPIKE = '1'; npm start`

In der App einen Live-Kanal laden und zwei bis drei Minuten laufen lassen.
Danach:

Run: `Select-String -Path "$env:APPDATA\twitchdual\updater.log" -Pattern "spike-ws" | Select-Object -Last 40`

- [ ] **Step 6: Ergebnis festhalten**

Die Antwort auf drei Fragen ins Protokoll der Sitzung schreiben:
1. Welche WebSocket-Adressen öffnet die Seite? (Ist `pubsub-edge.twitch.tv`
   dabei, oder etwas anderes?)
2. Wie sieht ein Abo-Rahmen aus (Feldnamen, Themen-Schreibweise)?
3. Kommen Ereignisse an, und wie sind sie aufgebaut?

**Abbruchpunkt:** Öffnet die Seite gar keine erkennbare Ereignis-Verbindung,
ist Stufe 1 sinnlos → direkt zu Task 4 (Auswertung und Rückfall auf
Variante A).

- [ ] **Step 7: Commit**

```bash
git add src/spike-pubsub-beobachten.js src/twitch-integrity.js main.js
git commit -m "spike: WebSocket-Verkehr der echten Twitch-Seite mitschreiben"
```

---

### Task 2: Stufe 1 — selbst abonnieren

**Files:**
- Create: `src/spike-pubsub-abo.js`
- Modify: `main.js` (Aufruf hinter derselben Umgebungsvariable)

**Interfaces:**
- Consumes: die in Task 1 gemessene Adresse und Rahmen-Form.
- Produces: `starteAbo({ url, token, userId, channelId, themen, log })` —
  baut die Verbindung auf, abonniert die Themen, protokolliert Antworten und
  Ereignisse. Liefert eine Funktion zum Beenden.

- [ ] **Step 1: Abo-Modul schreiben**

Die Adresse und die Rahmen-Form aus Task 1 einsetzen. Das folgende Gerüst
geht von der aus der Dokumentation bekannten PubSub-Form aus; **weicht
Task 1 davon ab, gilt Task 1.**

```js
// src/spike-pubsub-abo.js
// WEGWERF-CODE (Spike 2026-08-12).

function starteAbo({ url, token, themen, log, pingMs = 240000 }) {
  let ws = null;
  let pingTimer = null;
  try {
    ws = new WebSocket(url); // in Electron 33 (Node 20) eingebaut
  } catch (e) {
    log('spike-abo-fehler', 'Verbindung: ' + e.message);
    return () => {};
  }

  ws.addEventListener('open', () => {
    log('spike-abo-offen', url + ' themen=' + themen.join(','));
    // Ein LISTEN-Rahmen pro Thema: so lässt sich jede Ablehnung eindeutig
    // einem Thema zuordnen. Ein Sammelabo würde nur einen Fehler liefern.
    themen.forEach((thema, i) => {
      ws.send(JSON.stringify({
        type: 'LISTEN',
        nonce: 'spike' + i,
        data: { topics: [thema], auth_token: token }
      }));
    });
    pingTimer = setInterval(() => {
      try { ws.send(JSON.stringify({ type: 'PING' })); } catch { /* zu */ }
    }, pingMs);
  });

  ws.addEventListener('message', (ev) => {
    // nonce verrät, welches Thema gemeint war; error:"" heißt angenommen.
    log('spike-abo-nachricht', String(ev.data).slice(0, 800));
  });
  ws.addEventListener('error', () => log('spike-abo-fehler', 'WebSocket-Fehler'));
  ws.addEventListener('close', (ev) => log('spike-abo-zu', 'code=' + ev.code));

  return () => {
    if (pingTimer) clearInterval(pingTimer);
    try { ws.close(); } catch { /* egal */ }
  };
}

module.exports = { starteAbo };
```

- [ ] **Step 2: Aufruf in main.js**

Direkt hinter den Spike-Block aus Task 1. Die eigene Benutzerkennung kommt
über die vorhandene GQL-Anbindung; der Kanal ist der geladene Live-Kanal:

```js
// SPIKE 2026-08-12 (wieder entfernen): eigenes Abo mit unserem Web-Token.
if (process.env.TWITCHDUAL_PUBSUB_SPIKE === '1') {
  const { starteAbo } = require('./src/spike-pubsub-abo');
  setTimeout(async () => {
    try {
      if (!webToken || !currentLiveChannel) {
        updaterLog('spike-abo-absage', 'kein Token oder kein Live-Kanal');
        return;
      }
      const ctx = await pointsApi.context(webToken, currentLiveChannel);
      const eigeneId = await eigeneBenutzerId(); // Schritt 3
      updaterLog('spike-abo-start', JSON.stringify({ kanal: ctx.channelID, ich: eigeneId }));
      starteAbo({
        url: 'wss://pubsub-edge.twitch.tv', // AUS TASK 1 ERSETZEN
        token: webToken,
        themen: [
          'community-points-user-v1.' + eigeneId,
          'community-points-channel-v1.' + ctx.channelID,
          'pinned-chat-updates-v1.' + ctx.channelID
        ],
        log: updaterLog
      });
    } catch (e) {
      updaterLog('spike-abo-fehler', e.message);
    }
  }, 30000); // erst nachdem ein Kanal geladen sein kann
}
```

- [ ] **Step 3: Eigene Benutzerkennung holen**

In `main.js`, direkt über dem Spike-Block:

```js
// SPIKE-Helfer (wieder entfernen): eigene Benutzerkennung ueber dieselbe
// GQL-Anbindung, mit der die Punkte laufen.
async function eigeneBenutzerId() {
  const res = await fetch('https://gql.twitch.tv/gql', {
    method: 'POST',
    headers: {
      'Client-ID': 'kimne78kx3ncx6brgo4mv6wki5h1ko',
      'Content-Type': 'application/json',
      'Authorization': 'OAuth ' + webToken
    },
    body: JSON.stringify({ query: '{ currentUser { id } }' })
  });
  const d = JSON.parse(await res.text());
  return d && d.data && d.data.currentUser ? d.data.currentUser.id : null;
}
```

- [ ] **Step 4: Syntax prüfen und Gesamtsuite**

Run: `node -c main.js; node -c src/spike-pubsub-abo.js; npm test`
Expected: kein Syntaxfehler, 212 Tests grün.

- [ ] **Step 5: Commit**

```bash
git add src/spike-pubsub-abo.js main.js
git commit -m "spike: eigenes PubSub-Abo mit dem Web-Token"
```

---

### Task 3: Der erzwungene Beweis

**Files:** keine Änderung — reiner Messlauf.

- [ ] **Step 1: Spike starten und Kanal laden**

Run: `$env:TWITCHDUAL_PUBSUB_SPIKE = '1'; npm start`

Einen Live-Kanal mit Kanalpunkten laden, Player spielen lassen, 40 Sekunden
warten (der Abo-Block startet nach 30 s).

- [ ] **Step 2: Abo-Antworten prüfen**

Run: `Select-String -Path "$env:APPDATA\twitchdual\updater.log" -Pattern "spike-abo" | Select-Object -Last 20`

Erwartet je Thema eine `RESPONSE` mit `"error":""` (angenommen) oder einem
Fehlertext (abgelehnt). Welches Thema gemeint ist, verrät die `nonce`.

- [ ] **Step 3: Ereignis erzwingen**

Über das 🎁-Panel eine billige Belohnung einlösen. **Das ist der eigentliche
Beweis:** taucht die eigene Einlösung als Ereignis auf dem Kanal-Thema auf,
funktioniert der Weg — ohne auf Zufall zu warten.

Run: `Select-String -Path "$env:APPDATA\twitchdual\updater.log" -Pattern "spike-abo-nachricht" | Select-Object -Last 10`

- [ ] **Step 4: Ergebnis bewerten**

- **Erfolg:** mindestens ein Thema angenommen UND das erzwungene Ereignis
  angekommen → Task 4 dokumentiert den Erfolg, danach eigener Entwurf für
  den Ausbau.
- **Teilerfolg:** angenommen, aber nichts angekommen → höchstens EIN zweiter
  Versuch mit korrigierten Themen-Namen aus Task 1. Danach Abbruch.
- **Abbruch:** alle Themen abgelehnt → der Weg ist tot.

---

### Task 4: Aufräumen und Erkenntnis sichern

**Files:**
- Delete: `src/spike-pubsub-beobachten.js`, `src/spike-pubsub-abo.js`
- Modify: `main.js` (alle Spike-Blöcke raus), `src/twitch-integrity.js`
  (Haken `beiFenster` raus), `docs/TODO.md`

- [ ] **Step 1: Ergebnis in docs/TODO.md festhalten**

Neuer Abschnitt `## Ereignis-Strom (Spike 2026-08-12)` mit: der gemessenen
Adresse, welche Themen angenommen bzw. abgelehnt wurden, ob das erzwungene
Ereignis ankam, und der Schlussfolgerung. **Auch ein Fehlschlag wird
festgehalten** — er ist das wertvollere Ergebnis, weil er verhindert, dass
jemand denselben Weg nochmal geht.

- [ ] **Step 2: Spike-Code restlos entfernen**

Beide Spike-Dateien löschen, alle `TWITCHDUAL_PUBSUB_SPIKE`-Blöcke aus
`main.js` entfernen, `eigeneBenutzerId` entfernen, den `beiFenster`-Haken aus
`src/twitch-integrity.js` zurückbauen.

- [ ] **Step 3: Prüfen, dass nichts übrig ist**

Run: `git diff master --stat; Select-String -Path main.js,src/*.js -Pattern "SPIKE|spike-"`
Expected: außer `docs/TODO.md` keine Änderung gegenüber master; keine
Spike-Treffer im Code.

- [ ] **Step 4: Gesamtsuite und Commit**

Run: `npm test`
Expected: 212 Tests grün.

```bash
git add -A
git commit -m "docs: Ergebnis des PubSub-Spikes, Spike-Code entfernt"
```

- [ ] **Step 5: Zweig zusammenführen**

Bei Erfolg wie bei Misserfolg gehört das Ergebnis nach master (es ist reine
Dokumentation):

```bash
git checkout master && git merge --ff-only spike/pubsub && git push origin master
```

**Kein Release** — der Spike ändert nichts an der App, also auch keine
Versionsnummer.

---

## Selbstprüfung (durchgeführt)

**Spec-Abdeckung:** Stufe 0 (beobachten) → Task 1. Stufe 1 (abonnieren) →
Task 2. Drei Themen → Task 2 Schritt 2. Erfolg/Teilerfolg/Abbruch → Task 3
Schritt 4. Erzwungenes Ereignis statt Warten → Task 3 Schritt 3. Schwärzen
der Zugangsdaten → Task 1 Schritt 1 (`schwaerzen`). Wegwerf-Code hinter
Umgebungsvariable → Global Constraints + jeder main.js-Block. Restloses
Entfernen → Task 4 Schritt 2+3 mit Prüfbefehl. Negativergebnis
dokumentieren → Task 4 Schritt 1.

**Platzhalter:** Eine bewusst offene Stelle: die Adresse in Task 2 Schritt 2
(`wss://pubsub-edge.twitch.tv`) und die Themen-Schreibweise stehen als
Vermutung drin und sind mit „AUS TASK 1 ERSETZEN" markiert — Task 1 misst
sie. Das ist der Zweck der Reihenfolge, kein fehlendes Detail.

**Typkonsistenz:** `beobachteWebSockets(webContents, log)` wird in Task 1
Schritt 3 mit genau diesen zwei Argumenten gerufen. `starteAbo({url, token,
themen, log})` wird in Task 2 Schritt 2 mit genau diesen Feldern gerufen
(`pingMs` bleibt auf Vorgabe). `ernteIntegrity` bekommt `beiFenster` als
Funktion mit einem `webContents`-Argument — so wird sie in Task 1 Schritt 2
gerufen und in Schritt 3 übergeben. `log` ist überall `updaterLog(ereignis,
text)`.
