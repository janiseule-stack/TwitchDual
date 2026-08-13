# Diagnose-Schalter Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ein Schalter, der ein bereits mitlaufendes Ringpuffer-Protokoll (10000 Zeilen) als Vorgeschichte nach `userData/diagnose.log` schreibt und ab dann weiterprotokolliert — fuer die Bereiche Punkte, Video/Werbung/Ton, Chat und App.

**Architecture:** Zwei DOM- und Electron-freie Module in `src/` (`diag-redact.js` schwaerzt, `diag-log.js` puffert/formatiert/schreibt), verdrahtet im Main-Prozess. Alle Meldungen — auch die aus den Renderern — laufen ueber genau einen Punkt (`diagLog.melde()`) und werden **dort** geschwaerzt, bevor sie in den Ringpuffer gehen. Der Puffer laeuft immer, der Schalter entscheidet nur ueber die Datei.

**Tech Stack:** Node/CommonJS, Electron 33, `node --test` (kein Framework), `electron-store`.

**Spec:** `docs/superpowers/specs/2026-08-13-diagnose-schalter-design.md` — der Entwurf ist von Janis abgenommen und reist mit diesem Plan. Wer den Plan ausfuehrt, liest beide.

## Global Constraints

- **Sprache:** Die Codebase ist durchgehend deutsch — Bezeichner *und* Kommentare. So bleibt es. Auch Commit-Nachrichten sind deutsch.
- **Der Logger in `main.js` heisst `updaterLog`, NICHT `log`.**
- **Preload ist sandboxed.** In `preload.js` darf `require()` nur `electron`, `events`, `timers`, `url` (siehe `test/preload-sandbox.test.js`). Kein `fs`, kein `path`. Dateien liest der Main-Prozess und liefert sie per IPC.
- **Tests:** `npm test` (`node --test`). Baseline **242 gruen** (gemessen 2026-08-13 auf `master`). Nach jeder Aufgabe muss die Gesamtsuite gruen sein — bestehende Tests werden nicht angepasst, ausser es steht ausdruecklich hier.
- **Animationen bleiben immer an.** `prefers-reduced-motion` wird in diesem Projekt bewusst ignoriert (Janis' Windows hat Animationseffekte aus). Keine Media-Query dafuer einbauen.
- **Protokollieren wirft nie.** Jeder Pfad in `melde()`/`setAktiv()` ist so gebaut, dass ein Fehler (Datei nicht schreibbar, zirkulaeres Detail) still verschluckt wird. Ein Diagnose-Werkzeug, das die App abschiesst, ist schlimmer als keins.
- **Standard ist aus, und aus heisst: nichts auf der Platte.** `diagEnabled` hat die Vorgabe `false`.
- **Kein Versand irgendwohin.** Keine Telemetrie, kein Hochladen, kein neuer Netzwerkpfad.
- **`npm run dist` nur aus dem Haupt-Checkout** (`C:\Users\janis\TwitchDual`), nicht aus einem Worktree.
- Arbeit direkt auf `master` (sauberer Baum, Stand `b319a3b`). Die beiden Entwurfs-Commits `1b38159` und `b319a3b` liegen noch lokal — ein `git push` am Ende nimmt sie mit.

## Zwei nicht verhandelbare Punkte

Beide stehen im Entwurf; sie sind hier wiederholt, weil sie den Wert der ganzen Sache tragen.

**1. Die Schwaerzung wird gegen ECHT geformte Rahmen getestet, nicht gegen geratene.** Beim PubSub-Spike (`docs/superpowers/plans/2026-08-12-pubsub-spike.md`, Task 1 Schritt 1) stand Janis' Token im Klartext im Protokoll, weil die Schwaerzung nur `auth_token` und `OAuth ` kannte — Hermes nutzt `"token"`, IRC `PASS oauth:` klein. Jedes Muster in Task 1 wird deshalb gegen einen Rahmen getestet, der **in dieser Codebase nachweisbar so verschickt wird** (Quellenangabe je Muster in der Tabelle unten). Dazu kommt der strukturelle 30-Zeichen-Auffang — plus die **Gegenprobe**, dass deutscher Fliesstext, Kanalnamen, 7TV-ULIDs und VOD-IDs nicht zerschossen werden.

**2. Die Vorgeschichte geht als EIN Schreibvorgang raus.** `schreiben` bekommt einen fertigen Block, nie eine Schleife ueber Einzelzeilen. Bei 10000 synchronen `appendFileSync`-Aufrufen friert die App beim Umlegen des Schalters sichtbar ein. Der Test in Task 2 zaehlt die Aufrufe und ist die Absicherung dagegen.

## Abweichungen vom Entwurf (bewusst, begruendet)

Drei Stellen, an denen die Umsetzung praeziser ist als der Entwurf. Alle drei sind additiv, keine aendert eine Entscheidung.

1. **Das Cookie heisst wirklich `auth-token` (Bindestrich).** Der Entwurf listet `auth_token=` (Unterstrich, aus dem alten PubSub-Rahmen). Twitchs Web-Cookie heisst `auth-token` — belegt in `src/twitch-web-auth.js:12` und `:52`. Das Muster deckt **beide** Schreibweisen ab. Genau diese Art Luecke war der Grund fuer den Leak.
2. **`punkte:takt-aus` wird flankengetriggert.** `punkteTick()` laeuft jede Sekunde (`main.js:743`). Ein Ereignis pro Absage waere 1 Zeile/Sekunde — der 10000er-Ringpuffer reichte dann keine drei Stunden zurueck und die Vorgeschichte waere wertlos. Gemeldet wird nur, wenn sich der Grund **aendert** (Task 6).
3. **`renderer/lib/vod-replay.js` bekommt einen optionalen `onLuecke`-Rueckruf.** Der Entwurf listet die Datei nicht unter „Betroffene Dateien", verlangt im Ereignis-Katalog aber `chat:vod-luecke (von/bis)`. Das Ueberspringen passiert ausschliesslich in `ensureCoverage()` — von aussen ist es nicht sichtbar. Der Rueckruf hat eine leere Vorgabe, aendert also kein bestehendes Verhalten. **Wichtig:** eine Seitengrenzen-Kollision ist *keine* Luecke (siehe Kommentar `vod-replay.js:100`) und wird nicht gemeldet.

---

## Dateistruktur

| Datei | Verantwortung |
|---|---|
| `src/diag-redact.js` | **neu** — `schwaerze(text)`, sonst nichts. Eigene Datei, weil das der Teil ist, der bei einem Fehler wirklich schadet. |
| `src/diag-log.js` | **neu** — Ringpuffer, Zeilenformat, Groessengrenze, Ein/Aus. Kennt kein `fs`. |
| `test/diag-redact.test.js` | **neu** — Muster einzeln + Gegenprobe. |
| `test/diag-log.test.js` | **neu** — Puffer, Vorgeschichte-als-ein-Aufruf, Umlegen. |
| `main.js` | `diagLog` anlegen (fs-Anbindung), Store-Vorgabe, vier IPC-Kanaele, `updaterLog` daraufsetzen, Punkte- und Werbe-Meldungen. |
| `preload.js` | Bruecke `diag`/`getDiagEnabled`/`setDiagEnabled`/`openDiagFolder` + Relais aus dem Twitch-iframe. |
| `renderer/chat/index.html` | Diagnose-Gruppe im ⚙-Popup. |
| `renderer/chat/chat.css` | Knopf `#opt-diag-open` an den bestehenden Stil anschliessen. |
| `renderer/chat/chat.js` | Schalter verdrahten, Chat-Meldungen. |
| `renderer/video/video.js` | Watchdog- und Qualitaets-Meldungen. |
| `renderer/lib/volume-guard.js` | `melde`-Option fuer den Verdachtsmoment. |
| `renderer/lib/vod-replay.js` | optionaler `onLuecke`-Rueckruf. |
| `docs/TODO.md` | Abschnitt „Diagnose-Schalter" + Release-Eintrag. |
| `package.json` | Versionssprung auf 1.11.0. |

---

### Task 1: `src/diag-redact.js` — die Schwaerzung

**Files:**
- Create: `src/diag-redact.js`
- Test: `test/diag-redact.test.js`

**Interfaces:**
- Produces: `schwaerze(text) -> string`. Modul exportiert `{ schwaerze }`. Nimmt alles entgegen (auch `null`/`undefined`/Zahlen) und liefert immer einen String. Wirft nie.

**Herkunft jedes Musters** — keins ist geraten:

| Muster | Belegt in |
|---|---|
| `auth-token=` / `auth_token=` | `src/twitch-web-auth.js:12` (`name === 'auth-token'`), `:52` |
| `OAuth <wert>` | `src/twitch-points.js:54` (`'Authorization': 'OAuth ' + token`) |
| `"token":"<wert>"` | Hermes-Anmelderahmen, gemessen und festgehalten in `docs/TODO.md:270` |
| `PASS oauth:<wert>` (klein) | `src/chat-send.js:72` (`ws.send('PASS oauth:' + this.creds.accessToken)`) |
| `Client-Integrity: <wert>` | `main.js:442` (`'Client-Integrity': satz.integrity`) |
| `Cookie:` / `Set-Cookie:` | HTTP-Kopfzeilen |
| `\b[a-z0-9]{30}\b` | struktureller Auffang: Twitchs OAuth-Token ist durchgaengig 30 Zeichen `[a-z0-9]` |

- [ ] **Step 1: Den fehlschlagenden Test schreiben**

Datei `test/diag-redact.test.js`:

```js
const { test } = require('node:test');
const assert = require('node:assert');
const { schwaerze } = require('../src/diag-redact');

// Die Rahmen unten sind NICHT erfunden. Jeder stammt aus einer Stelle, die
// diese App wirklich verschickt - Quelle jeweils im Kommentar. Beim
// PubSub-Spike (2026-08-12) stand Janis' Token im Klartext im Protokoll, weil
// die Schwaerzung gegen geratene Rahmen gebaut war und die echten (Hermes
// "token", IRC "PASS oauth:" klein) nicht kannte.

// Ein echt geformter Twitch-Token: 30 Zeichen [a-z0-9].
const TOKEN = 'k9x2p7mq4wz8vn3jb6hy5td1rc0slf';

test('Web-Cookie mit Bindestrich (so heisst es wirklich)', () => {
  // src/twitch-web-auth.js:12 - das Cookie heisst 'auth-token', nicht 'auth_token'.
  const roh = 'auth-token=' + TOKEN + '; unique_id=abc; Path=/';
  const s = schwaerze(roh);
  assert.ok(!s.includes(TOKEN), 'Token steht noch drin: ' + s);
  assert.ok(s.includes('auth-token=***'));
});

test('Web-Cookie mit Unterstrich (alte PubSub-Schreibweise)', () => {
  const s = schwaerze('{"auth_token":"' + TOKEN + '"}');
  assert.ok(!s.includes(TOKEN));
  assert.ok(s.includes('***'));
});

test('GQL-Authorization', () => {
  // src/twitch-points.js:54
  const s = schwaerze('{"Authorization":"OAuth ' + TOKEN + '","Client-ID":"kimne78kx3ncx6brgo4mv6wki5h1ko"}');
  assert.ok(!s.includes(TOKEN));
  assert.ok(s.includes('OAuth ***'));
});

test('Hermes-Anmelderahmen (docs/TODO.md:270)', () => {
  // Genau die Form, die im Spike gemessen wurde.
  const rahmen = '{"id":"n1","type":"authenticate","authenticate":{"token":"' +
    TOKEN + '"},"timestamp":"2026-08-12T18:04:11.000Z"}';
  const s = schwaerze(rahmen);
  assert.ok(!s.includes(TOKEN), 'Hermes-Token steht noch drin: ' + s);
  assert.ok(s.includes('"token":"***"'));
  // Der Rest des Rahmens bleibt lesbar - sonst ist das Protokoll wertlos.
  assert.ok(s.includes('"type":"authenticate"'));
});

test('IRC-Anmeldung, klein geschrieben (src/chat-send.js:72)', () => {
  const s = schwaerze('PASS oauth:' + TOKEN);
  assert.ok(!s.includes(TOKEN));
  assert.equal(s, 'PASS oauth:***');
});

test('Client-Integrity (main.js:442)', () => {
  // Echter Integrity-Satz: ein JWT, nicht 30 Zeichen - der Auffang greift hier
  // NICHT, deshalb braucht es das eigene Muster.
  const jwt = 'eyJhbGciOiJIUzI1NiJ9.eyJleHAiOjE3NTUxMDAwMDB9.Qk1sVGhpc0lzTm90UmVhbA';
  const s = schwaerze('Client-Integrity: ' + jwt);
  assert.ok(!s.includes(jwt), 'Integrity-Token steht noch drin: ' + s);
  assert.ok(s.includes('Client-Integrity: ***'));
});

test('Cookie-Kopfzeilen werden komplett unkenntlich', () => {
  const a = schwaerze('Cookie: auth-token=' + TOKEN + '; unique_id=xyz');
  const b = schwaerze('Set-Cookie: auth-token=' + TOKEN + '; Secure; HttpOnly');
  assert.ok(!a.includes(TOKEN) && !a.includes('unique_id'));
  assert.ok(!b.includes(TOKEN) && !b.includes('HttpOnly'));
});

test('Auffangnetz: freistehender Token in einem unbekannten Rahmen', () => {
  // Der eigentliche Zweck: ein Rahmen, den wir HEUTE nicht kennen.
  const s = schwaerze('{"irgendwas":{"geheim":"' + TOKEN + '"}}');
  assert.ok(!s.includes(TOKEN), 'Auffangnetz hat nicht gegriffen: ' + s);
});

test('mehrere Treffer in einer Zeile werden alle ersetzt', () => {
  const zwei = 'a2b4c6d8e0f2g4h6j8k0m2n4p6q8r0';
  const s = schwaerze('OAuth ' + TOKEN + ' und PASS oauth:' + zwei);
  assert.ok(!s.includes(TOKEN) && !s.includes(zwei), s);
});

// --- Gegenprobe: ein zu gieriges Netz ist genauso wertlos wie ein leckendes ---

test('Gegenprobe: deutscher Fliesstext bleibt unveraendert', () => {
  const text = 'Kanalwechsel waehrend laufender Abfrage - Basislinie vergessen, ' +
    'der naechste Takt meldet sonst den vollen Kontostand als Zuwachs.';
  assert.equal(schwaerze(text), text);
});

test('Gegenprobe: Kanal-Logins bleiben unveraendert', () => {
  // Twitch-Logins sind hoechstens 25 Zeichen (main.js:658) - nie 30.
  const zeile = 'punkte:kanalwechsel {"von":"tolkin","nach":"papaplatte","lang":"abcdefghijklmnopqrstuvwxy"}';
  assert.equal(schwaerze(zeile), zeile);
});

test('Gegenprobe: 7TV-ULID bleibt unveraendert', () => {
  // 26-stellige Grossbuchstaben-ULID, echtes Beispiel aus renderer/chat/index.html:56.
  const zeile = 'chat:emote 01FHPG3BCR00093JSPCMYFBG0E';
  assert.equal(schwaerze(zeile), zeile);
});

test('Gegenprobe: VOD-ID bleibt unveraendert', () => {
  const zeile = 'chat:vod-luecke {"videoId":"2467910019","von":120,"bis":150}';
  assert.equal(schwaerze(zeile), zeile);
});

test('Gegenprobe: 64-stelliger Persisted-Query-Hash bleibt unveraendert', () => {
  // src/twitch-gql.js:25 - laenger als 30, also kein Token. Die Wortgrenzen im
  // Auffangnetz sorgen dafuer, dass er nicht mittendrin zerschnitten wird.
  const hash = 'b70a3591ff0f4e0313d126c6a1502d79a1c02baebb288227c582044aa76adf6a';
  assert.equal(schwaerze('gql:hash ' + hash), 'gql:hash ' + hash);
});

test('nimmt alles entgegen und wirft nie', () => {
  assert.equal(schwaerze(undefined), '');
  assert.equal(schwaerze(null), '');
  assert.equal(schwaerze(42), '42');
});
```

- [ ] **Step 2: Test laufen lassen, Fehlschlag bestaetigen**

Run: `node --test test/diag-redact.test.js`
Expected: FAIL — `Cannot find module '../src/diag-redact'`.

- [ ] **Step 3: Das Modul schreiben**

Datei `src/diag-redact.js`:

```js
// src/diag-redact.js
// Schwaerzt Zugangsdaten aus Protokollzeilen. Bewusst eine eigene Datei: das
// ist der Teil, der bei einem Fehler wirklich schadet, und er gehoert isoliert
// gegen echte Beispiele geprueft (test/diag-redact.test.js).
//
// LEHRE AUS DEM PUBSUB-SPIKE (2026-08-12): dort stand Janis' Token im Klartext
// im Protokoll, weil die Schwaerzung nur 'auth_token' und 'OAuth ' kannte -
// Hermes nutzt "token", IRC "PASS oauth:" klein geschrieben. Die Lehre war
// nicht "mehr Muster raten", sondern dass zusaetzlich ein STRUKTURELLES Netz
// noetig ist. Jedes benannte Muster unten stammt aus einem Rahmen, den diese
// App nachweislich verschickt; die Quelle steht jeweils dahinter.

// Twitchs OAuth-Token ist durchgaengig 30 Zeichen [a-z0-9]. Die Wortgrenzen
// sind Absicht: sie treffen NUR Laeufe von exakt 30 Zeichen. Ein 64-stelliger
// Persisted-Query-Hash (src/twitch-gql.js:25) und 26-stellige 7TV-ULIDs
// bleiben damit unangetastet, Kanal-Logins (hoechstens 25 Zeichen, main.js:658)
// und numerische VOD-IDs ebenso.
const AUFFANGNETZ = /\b[a-z0-9]{30}\b/g;

function schwaerze(text) {
  if (text === null || text === undefined) return '';
  let s = String(text);

  // Zuerst die Kopfzeilen, die als GANZES weg muessen: in einem Cookie-Kopf
  // steht mehr als nur der Token. Ab dem Doppelpunkt bis zum Zeilenende.
  s = s.replace(/\b(Set-Cookie|Cookie)\s*:[^\n]*/gi, '$1: ***');

  // Web-Cookie. ACHTUNG: es heisst wirklich 'auth-token' mit Bindestrich
  // (src/twitch-web-auth.js:12) - der Unterstrich ist die alte
  // PubSub-Schreibweise. Beide abdecken, genau solche Luecken haben geleckt.
  s = s.replace(/(["']?auth[-_]token["']?\s*[=:]\s*["']?)[^"'&;,\s}]+/gi, '$1***');

  // Hermes-Anmelderahmen: {"authenticate":{"token":"<Web-Token>"}}
  // (gemessen im Spike, docs/TODO.md:270).
  s = s.replace(/(["']token["']\s*:\s*["'])[^"']*/gi, '$1***');

  // GQL-Authorization (src/twitch-points.js:54).
  s = s.replace(/(OAuth\s+)[A-Za-z0-9._-]+/gi, '$1***');

  // IRC-Anmeldung, klein geschrieben (src/chat-send.js:72).
  s = s.replace(/(PASS\s+oauth:)[A-Za-z0-9._-]+/gi, '$1***');

  // Kisten-Claim (main.js:442). Der Integrity-Satz ist ein JWT - laenger als
  // 30 Zeichen und mit Punkten, das Auffangnetz greift dort nicht.
  s = s.replace(/(Client-Integrity["']?\s*[:=]\s*["']?)[A-Za-z0-9._-]+/gi, '$1***');

  // Zuletzt das strukturelle Netz - es faengt den Token auch in einem Rahmen,
  // den wir heute nicht kennen.
  s = s.replace(AUFFANGNETZ, '***');

  return s;
}

module.exports = { schwaerze };
```

- [ ] **Step 4: Test laufen lassen, gruen bestaetigen**

Run: `node --test test/diag-redact.test.js`
Expected: PASS — 15 Tests gruen.

Falls die Gegenprobe „deutscher Fliesstext" fehlschlaegt: das Auffangnetz ist zu gierig geworden. **Nicht den Test aufweichen** — das Muster reparieren. Ein Netz, das das Protokoll unlesbar macht, ist genauso wertlos wie ein leckendes.

- [ ] **Step 5: Gesamtsuite**

Run: `npm test`
Expected: 257 gruen (242 + 15).

- [ ] **Step 6: Commit**

```bash
git add src/diag-redact.js test/diag-redact.test.js
git commit -m "feat: Schwaerzung fuer das Diagnose-Protokoll"
```

---

### Task 2: `src/diag-log.js` — Ringpuffer, Format, Schalter

**Files:**
- Create: `src/diag-log.js`
- Test: `test/diag-log.test.js`

**Interfaces:**
- Consumes: `schwaerze(text)` aus Task 1 (`require('./diag-redact')`).
- Produces:
  ```js
  createDiagLog({ schreiben, groesse, umlegen, jetzt = Date.now,
                  maxPuffer = 10000, maxBytes = 10 * 1024 * 1024 })
    .melde(bereich, ereignis, detail)   // detail optional; wirft nie
    .setAktiv(an)                       // an -> Vorgeschichte, dann mitschreiben
    .istAktiv()                         // -> boolean
    .puffer()                           // -> string[] (Kopie; nur fuer Tests)
  ```
  Modul exportiert die Fabrik direkt (`module.exports = createDiagLog`), wie `src/twitch-points.js`.
  `schreiben(block)` bekommt **einen fertigen Textblock** inklusive abschliessendem `\n`, niemals eine Einzelzeile in einer Schleife. `groesse()` liefert die aktuelle Dateigroesse in Byte, `umlegen()` benennt die Datei um.

**Zeilenformat** (wie das heutige `updater.log`, damit es durchsuchbar bleibt):

```
[2026-08-13T00:28:39.980Z] punkte:kiste-ok {"davor":436360,"danach":436410,"betrag":50}
```

- [ ] **Step 1: Den fehlschlagenden Test schreiben**

Datei `test/diag-log.test.js`:

```js
const { test } = require('node:test');
const assert = require('node:assert');
const createDiagLog = require('../src/diag-log');

// Testdoppel fuer die Dateianbindung. Das Modul kennt kein fs - alles kommt
// von aussen, genau wie bei src/twitch-points.js.
function bau(opts = {}) {
  const bloecke = [];
  let dateiGroesse = opts.groesse || 0;
  const umlegungen = [];
  const log = createDiagLog({
    schreiben: (block) => { bloecke.push(block); },
    groesse: () => dateiGroesse,
    umlegen: () => { umlegungen.push(dateiGroesse); dateiGroesse = 0; },
    jetzt: () => 1755043719980,   // fest -> Zeilen sind vergleichbar
    ...opts.ueberschreiben
  });
  return { log, bloecke, umlegungen, setzeGroesse: (g) => { dateiGroesse = g; } };
}

test('aus: nichts geschrieben, Puffer fuellt sich trotzdem', () => {
  const { log, bloecke } = bau();
  log.melde('punkte', 'takt-aus', { grund: 'kein Live-Kanal' });
  log.melde('chat', 'irc-verbunden');
  assert.equal(bloecke.length, 0, 'Schalter aus -> nichts auf der Platte');
  assert.equal(log.puffer().length, 2, 'der Puffer laeuft trotzdem - das ist der Zweck');
  assert.equal(log.istAktiv(), false);
});

test('Zeilenformat wie updater.log', () => {
  const { log } = bau();
  log.melde('punkte', 'kiste-ok', { davor: 436360, danach: 436410, betrag: 50 });
  assert.equal(log.puffer()[0],
    '[2026-08-13T00:08:39.980Z] punkte:kiste-ok {"davor":436360,"danach":436410,"betrag":50}');
});

test('detail ist undefined -> Zeile ohne Detail (wie heute bei updaterLog)', () => {
  const { log } = bau();
  log.melde('app', 'start');
  assert.equal(log.puffer()[0], '[2026-08-13T00:08:39.980Z] app:start');
});

test('Puffer deckelt bei maxPuffer, aeltestes faellt raus', () => {
  const { log } = bau({ ueberschreiben: { maxPuffer: 3 } });
  for (const n of [1, 2, 3, 4, 5]) log.melde('app', 'n' + n);
  const p = log.puffer();
  assert.equal(p.length, 3);
  assert.ok(p[0].endsWith('app:n3'), p[0]);
  assert.ok(p[2].endsWith('app:n5'), p[2]);
});

test('setAktiv(true) schreibt die Vorgeschichte genau einmal', () => {
  const { log, bloecke } = bau();
  log.melde('app', 'a');
  log.melde('app', 'b');
  log.setAktiv(true);
  assert.equal(bloecke.length, 1);
  assert.ok(bloecke[0].includes('app:a') && bloecke[0].includes('app:b'));
  assert.equal(log.istAktiv(), true);
});

// DER Test gegen das Einfrieren beim Umlegen des Schalters.
test('die Vorgeschichte geht als EIN schreiben-Aufruf raus, nicht als Schleife', () => {
  const { log, bloecke } = bau();
  for (let i = 0; i < 10000; i++) log.melde('app', 'e' + i);
  assert.equal(log.puffer().length, 10000);
  log.setAktiv(true);
  assert.equal(bloecke.length, 1,
    '10000 einzelne appendFileSync-Aufrufe frieren die App sichtbar ein');
  // Und der Block enthaelt wirklich alles.
  assert.equal(bloecke[0].split('\n').filter(Boolean).length, 10001); // 10000 + Kopfzeile
});

test('zweites setAktiv(true) schreibt die Vorgeschichte nicht erneut', () => {
  const { log, bloecke } = bau();
  log.melde('app', 'a');
  log.setAktiv(true);
  log.setAktiv(true);
  assert.equal(bloecke.length, 1);
});

test('nach dem Einschalten laeuft jede Meldung direkt mit', () => {
  const { log, bloecke } = bau();
  log.setAktiv(true);          // leere Vorgeschichte
  log.melde('app', 'a');
  log.melde('app', 'b');
  assert.equal(bloecke.length, 3);   // Vorgeschichte + 2
  assert.ok(bloecke[2].endsWith('app:b\n'));
});

test('setAktiv(false) stoppt das Schreiben, der Puffer laeuft weiter', () => {
  const { log, bloecke } = bau();
  log.setAktiv(true);
  log.melde('app', 'a');
  const vorher = bloecke.length;
  log.setAktiv(false);
  log.melde('app', 'b');
  assert.equal(bloecke.length, vorher, 'aus heisst: nichts mehr auf die Platte');
  assert.ok(log.puffer().some((z) => z.endsWith('app:b')));
  assert.equal(log.istAktiv(), false);
});

test('erneutes Einschalten hat wieder Vorgeschichte', () => {
  const { log, bloecke } = bau();
  log.setAktiv(true);
  log.setAktiv(false);
  log.melde('app', 'dazwischen');
  log.setAktiv(true);
  assert.ok(bloecke[bloecke.length - 1].includes('app:dazwischen'));
});

test('Einschalten ohne Vorgeschichte (frischer Start) ist kein Fehler', () => {
  const { log, bloecke } = bau();
  log.setAktiv(true);
  assert.equal(bloecke.length, 1);
  assert.ok(bloecke[0].includes('diagnose-an'));
});

test('Ueberschreiten von maxBytes ruft umlegen()', () => {
  const { log, umlegungen, setzeGroesse } = bau({ ueberschreiben: { maxBytes: 1000 } });
  log.setAktiv(true);
  setzeGroesse(1500);
  log.melde('app', 'a');
  assert.equal(umlegungen.length, 1);
});

test('Umlegen schlaegt fehl -> weiterschreiben statt Protokollverlust', () => {
  const bloecke = [];
  const log = createDiagLog({
    schreiben: (b) => bloecke.push(b),
    groesse: () => 99999999,
    umlegen: () => { throw new Error('EPERM'); },
    maxBytes: 1000
  });
  log.setAktiv(true);
  log.melde('app', 'a');
  assert.ok(bloecke.length >= 2, 'Datei waechst ueber die Grenze - besser als nichts');
});

test('Datei nicht schreibbar -> still ignoriert, App laeuft weiter', () => {
  const log = createDiagLog({
    schreiben: () => { throw new Error('ENOSPC'); },
    groesse: () => 0,
    umlegen: () => {}
  });
  log.setAktiv(true);
  log.melde('app', 'a');       // darf nicht werfen
  assert.equal(log.puffer().length, 1);
});

test('zirkulaeres detail wirft nicht', () => {
  const { log } = bau();
  const a = { name: 'a' };
  a.selbst = a;
  log.melde('app', 'zirkulaer', a);   // darf nicht werfen
  assert.equal(log.puffer().length, 1);
  assert.ok(log.puffer()[0].includes('app:zirkulaer'));
});

test('BigInt im detail wirft nicht', () => {
  const { log } = bau();
  log.melde('app', 'bigint', { n: 10n });
  assert.equal(log.puffer().length, 1);
});

// Die Zusicherung "im Diagnose-System existiert nichts Ungeschwaerztes" gilt
// auch fuer den Ringpuffer - sonst liefe die Vorgeschichte beim Einschalten
// roh in die Datei.
test('ein Token im detail steht AUCH im Puffer nur geschwaerzt', () => {
  const { log, bloecke } = bau();
  const token = 'k9x2p7mq4wz8vn3jb6hy5td1rc0slf';
  log.melde('punkte', 'kontext', { authorization: 'OAuth ' + token });
  assert.ok(!log.puffer()[0].includes(token), 'roher Token im Ringpuffer: ' + log.puffer()[0]);
  log.setAktiv(true);
  assert.ok(!bloecke[0].includes(token), 'roher Token in der Vorgeschichte');
});
```

- [ ] **Step 2: Test laufen lassen, Fehlschlag bestaetigen**

Run: `node --test test/diag-log.test.js`
Expected: FAIL — `Cannot find module '../src/diag-log'`.

- [ ] **Step 3: Das Modul schreiben**

Datei `src/diag-log.js`:

```js
// src/diag-log.js
// Ringpuffer + Datei-Protokoll fuer den Diagnose-Schalter.
//
// Die entscheidende Eigenschaft: der Puffer laeuft IMMER mit, unabhaengig vom
// Schalter. Wird eingeschaltet, landet er als Vorgeschichte in der Datei. Ein
// Schalter, den man erst nach dem Symptom umlegt, haette bei keinem der
// letzten drei Fehler geholfen ("Ton weg nach Werbung" trat alle paar Tage
// einmal auf).
//
// Dateizugriff kommt von aussen (schreiben/groesse/umlegen) - das Modul kennt
// kein fs und ist damit unit-testbar wie points-state.js.

const { schwaerze } = require('./diag-redact');

function createDiagLog({
  schreiben,
  groesse,
  umlegen,
  jetzt = Date.now,
  maxPuffer = 10000,
  maxBytes = 10 * 1024 * 1024
} = {}) {
  // Gespeichert werden nur fertige Textzeilen, kein Objektgeflecht: bei ~150
  // Byte je Zeile sind 10000 Zeilen rund 1,5 MB - in einer Electron-App nicht
  // messbar.
  const puffer = [];
  let aktiv = false;

  // JSON.stringify kann werfen (zirkulaer, BigInt) und undefined liefern
  // (Funktion, undefined). Beides faellt auf String(detail) zurueck.
  function detailText(detail) {
    if (detail === undefined) return '';
    try {
      const s = JSON.stringify(detail);
      return ' ' + (s === undefined ? String(detail) : s);
    } catch {
      return ' ' + String(detail);
    }
  }

  // Geschwaerzt wird beim EINTRITT, nicht beim Schreiben. Damit gilt die
  // Zusicherung "im Diagnose-System existiert nichts Ungeschwaerztes" auch
  // fuer den Ringpuffer im Speicher.
  function baueZeile(bereich, ereignis, detail) {
    const stempel = new Date(jetzt()).toISOString();
    return schwaerze(`[${stempel}] ${bereich}:${ereignis}${detailText(detail)}`);
  }

  // Ein Block, ein Schreibvorgang. Wirft nie: eine nicht schreibbare Datei
  // (Rechte, Platte voll) darf die App nicht stoeren.
  function schreibeBlock(block) {
    try {
      let gross = 0;
      try { gross = groesse ? groesse() : 0; } catch { gross = 0; }
      if (gross > maxBytes) {
        // Schlaegt das Umlegen fehl, wird weitergeschrieben und die Datei
        // waechst ueber die Grenze - besser als Protokollverlust.
        try { umlegen(); } catch { /* siehe Kommentar */ }
      }
      schreiben(block);
    } catch { /* Protokollieren wirft nie */ }
  }

  return {
    melde(bereich, ereignis, detail) {
      try {
        const zeile = baueZeile(bereich, ereignis, detail);
        puffer.push(zeile);
        // Wanderndes Fenster: der Puffer ist nie "voll" im Sinne von
        // Aufhoeren, er haelt immer die LETZTEN maxPuffer Ereignisse.
        if (puffer.length > maxPuffer) puffer.splice(0, puffer.length - maxPuffer);
        if (aktiv) schreibeBlock(zeile + '\n');
      } catch { /* Protokollieren wirft nie */ }
    },

    setAktiv(an) {
      const neu = !!an;
      if (neu === aktiv) return;   // zweites setAktiv(true) schreibt nichts erneut
      aktiv = neu;
      if (!aktiv) return;          // aus: Schreiben stoppt, der Puffer laeuft weiter
      try {
        const kopf = schwaerze(
          `[${new Date(jetzt()).toISOString()}] app:diagnose-an ` +
          `{"vorgeschichte":${puffer.length}}`);
        // EIN Schreibvorgang. Bei 10000 einzelnen synchronen Anhaengen friert
        // die App beim Umlegen des Schalters sichtbar ein.
        schreibeBlock([kopf, ...puffer].join('\n') + '\n');
      } catch { /* Protokollieren wirft nie */ }
    },

    istAktiv() { return aktiv; },

    // Kopie, damit ein Aufrufer den Ringpuffer nicht von aussen umbauen kann.
    puffer() { return puffer.slice(); }
  };
}

module.exports = createDiagLog;
```

- [ ] **Step 4: Test laufen lassen, gruen bestaetigen**

Run: `node --test test/diag-log.test.js`
Expected: PASS — 17 Tests gruen.

Hinweis zum Zeitstempel: `jetzt: () => 1755043719980` ergibt `2026-08-13T00:08:39.980Z`. Weicht die tatsaechliche Ausgabe ab, **den erwarteten String im Test an die Ausgabe anpassen** (der Wert ist beliebig gewaehlt), nicht das Modul.

- [ ] **Step 5: Gesamtsuite**

Run: `npm test`
Expected: 274 gruen (257 + 17).

- [ ] **Step 6: Commit**

```bash
git add src/diag-log.js test/diag-log.test.js
git commit -m "feat: Ringpuffer und Datei-Protokoll fuer den Diagnose-Schalter"
```

---

### Task 3: Verdrahtung im Main-Prozess

**Files:**
- Modify: `main.js` (Store-Vorgabe bei `:21-32`, `diagLog` anlegen, IPC, `updaterLog` bei `:715`, `whenReady` bei `:732`)

**Interfaces:**
- Consumes: `createDiagLog(...)` aus Task 2.
- Produces: modulweite Konstante `diagLog` in `main.js` mit `.melde(bereich, ereignis, detail)`, `.setAktiv(an)`, `.istAktiv()`. Vier IPC-Kanaele:

| Kanal | Richtung | Zweck |
|---|---|---|
| `diag-melde` | Renderer → Main (`send`) | Ereignis melden |
| `get-diag-enabled` | `invoke` | Schalterstand fuer die Oberflaeche |
| `set-diag-enabled` | `send` | Schalter umlegen, im Store merken |
| `open-diag-folder` | `send` | Ordner im Explorer zeigen |

- [ ] **Step 1: Store-Vorgabe ergaenzen**

In `main.js` in den `defaults` (`:22-31`) nach der Zeile mit `themePrefs` eine Zeile anhaengen (Komma nicht vergessen):

```js
    themePrefs: { videoAccent: '#35e0ff', chatAccent: '#ff4fa3', chatAlpha: 100 },
    diagEnabled: false   // Diagnose-Protokoll: Standard aus = nichts auf der Platte
```

- [ ] **Step 2: `diagLog` anlegen**

In `main.js` direkt **vor** der Funktion `updaterLog` (also vor `:713`, hinter dem Kommentarblock „Auto-Update") einfuegen:

```js
// --- Diagnose-Protokoll ----------------------------------------------------
// Der Ringpuffer laeuft immer mit; der Schalter entscheidet nur ueber die
// Datei. Beim Einschalten geht der Puffer als Vorgeschichte raus - genau das
// ist der Zweck (siehe docs/superpowers/specs/2026-08-13-diagnose-schalter-design.md).
// Die Pfade werden bei jedem Zugriff frisch geholt, damit auf Modulebene kein
// app.getPath() vor whenReady faellig wird.
const createDiagLog = require('./src/diag-log');

const diagPfad = () => path.join(app.getPath('userData'), 'diagnose.log');
const diagAltPfad = () => path.join(app.getPath('userData'), 'diagnose.1.log');

const diagLog = createDiagLog({
  schreiben: (block) => fs.appendFileSync(diagPfad(), block),
  groesse: () => { try { return fs.statSync(diagPfad()).size; } catch { return 0; } },
  // Hoechstens zwei Dateien, hoechstens ~20 MB - es kann nie die Platte
  // volllaufen. Eine vorhandene diagnose.1.log wird ueberschrieben.
  umlegen: () => fs.renameSync(diagPfad(), diagAltPfad())
});

// Renderer melden IMMER, auch bei ausgeschaltetem Schalter - nur so fuellt sich
// der Ringpuffer, und der ist der ganze Punkt. Vertretbar, weil der
// Ereignis-Katalog bewusst duenn ist: einzelne Meldungen pro Minute, keine pro
// Chat-Nachricht.
ipcMain.on('diag-melde', (_evt, m) => {
  if (!m) return;
  diagLog.melde(String(m.bereich || 'app'), String(m.ereignis || '?'), m.detail);
});

ipcMain.handle('get-diag-enabled', () => diagLog.istAktiv());

ipcMain.on('set-diag-enabled', (_evt, an) => {
  const ein = !!an;
  store.set('diagEnabled', ein);
  if (ein) {
    diagLog.setAktiv(true);          // schreibt die Vorgeschichte
  } else {
    diagLog.melde('app', 'diagnose-aus');   // noch in die Datei, dann Schluss
    diagLog.setAktiv(false);
  }
});

// Ordner statt Datei: beim ersten Einschalten existiert diagnose.log noch
// nicht, showItemInFolder taete dann nichts.
ipcMain.on('open-diag-folder', () => {
  shell.openPath(app.getPath('userData')).catch(() => { /* Komfort, kein Muss */ });
});
```

`shell` ist bereits importiert (`main.js:1`), `fs` und `path` ebenso (`:2-3`), `store` ist bereits angelegt (`:21`).

- [ ] **Step 3: `updaterLog` auf den neuen Weg mitnehmen**

`updater.log` bleibt **unveraendert** bestehen: Updater-Ereignisse sollen weiter *immer* in eine Datei gehen, auch bei ausgeschaltetem Schalter — sie sind selten, kosten nichts und haben schon zweimal eine Fehlersuche getragen. Die Dopplung ist der Preis dafuer und bleibt auf diese eine Funktion begrenzt.

In `main.js:715-722` den Rumpf ergaenzen (nur die letzte `try`-Zeile ist neu):

```js
function updaterLog(event, detail) {
  const line = `[${new Date().toISOString()}] update:${event}` +
    (detail !== undefined ? ` ${detail}` : '');
  console.log(line);
  try {
    fs.appendFileSync(path.join(app.getPath('userData'), 'updater.log'), line + '\n');
  } catch { /* Logging ist best-effort */ }
  // Zusaetzlich in die Diagnose. Der Ereignisname bleibt roh, damit
  // 'gpu-status' und 'unhandled-rejection' im Diagnose-Protokoll so heissen,
  // wie der Katalog es vorsieht - in updater.log behalten sie ihr 'update:'.
  try { diagLog.melde('app', event, detail); } catch { /* nie stoeren */ }
}
```

- [ ] **Step 4: Start und Fenster melden**

In `main.js` in `app.whenReady()` (`:732`) direkt nach `serverPort = port;` einfuegen:

```js
  // Gemerkten Schalterstand anwenden, BEVOR das erste Ereignis faellt.
  diagLog.setAktiv(store.get('diagEnabled', false));
  diagLog.melde('app', 'start', { version: app.getVersion(), gepackt: app.isPackaged });
```

Fuer `app:fenster` die beiden **bereits vorhandenen** `closed`-Handler nutzen (kein neuer Lauscher in der `for`-Schleife bei `:123-126` — die ist fuer die Bounds zustaendig). In `main.js:135-141`:

```js
  videoWin.on('closed', () => {
    diagLog.melde('app', 'fenster', { welches: 'video', was: 'zu' });
    videoWin = null;
    if (chatWin && !chatWin.isDestroyed()) chatWin.close();
  });
  chatWin.on('closed', () => {
    diagLog.melde('app', 'fenster', { welches: 'chat', was: 'zu' });
    chatWin = null;
  });
```

Und direkt nach `chatWin.loadURL(...)` (`:116`):

```js
  diagLog.melde('app', 'fenster', { welches: 'beide', was: 'auf' });
```

- [ ] **Step 5: Syntax pruefen und Gesamtsuite**

Run: `node -c main.js && npm test`
Expected: kein Syntaxfehler, 274 gruen.

- [ ] **Step 6: Commit**

```bash
git add main.js
git commit -m "feat: Diagnose-Protokoll im Main verdrahtet (IPC, Store, updaterLog)"
```

---

### Task 4: Bruecke im Preload

**Files:**
- Modify: `preload.js` (Bruecke bei `:101`, iframe-Relais bei `:116`, Bootstrap bei `:137`)
- Test: `test/preload-sandbox.test.js` (nur ausfuehren, nicht aendern — es muss gruen bleiben)

**Interfaces:**
- Consumes: die IPC-Kanaele aus Task 3.
- Produces: auf `window.twitchDual`:
  ```js
  diag(bereich, ereignis, detail) -> void          // feuert und vergisst
  getDiagEnabled() -> Promise<boolean>
  setDiagEnabled(an) -> void
  openDiagFolder() -> void
  ```
  Im Twitch-iframe zusaetzlich in der Main World: `window.__twitchDualDiag(bereich, ereignis, detail)`.

**Warum der Umweg im iframe:** Die Bruecke `window.twitchDual` wird in Twitch-iframes bewusst **nicht** exponiert (`preload.js:14`) — sonst koennte Twitch-/Werbe-Code Verlauf und Favoriten lesen. Der Lautstaerke-Waechter laeuft aber genau dort. Seine Meldungen nehmen deshalb denselben Weg wie die Werbe-Signale: `postMessage` aus der Main World → Lauscher im Preload → `ipcRenderer.send`. Der Weg ist erprobt (Adblock seit v1.8.4).

- [ ] **Step 1: Bruecke ergaenzen**

In `preload.js` in `exposeInMainWorld` nach `onPointsUpdate` (`:101`) — Komma an die Vorzeile:

```js
    onPointsUpdate: (cb) => { ipcRenderer.on('points-update', (_e, p) => cb(p)); },

    // Diagnose: melden geht IMMER (fuellt den Ringpuffer im Main), der
    // Schalter entscheidet nur ueber die Datei. Feuert und vergisst - ein
    // Protokollaufruf darf nie einen Renderer-Pfad blockieren.
    diag: (bereich, ereignis, detail) =>
      ipcRenderer.send('diag-melde', { bereich, ereignis, detail }),
    getDiagEnabled: () => ipcRenderer.invoke('get-diag-enabled'),
    setDiagEnabled: (an) => ipcRenderer.send('set-diag-enabled', !!an),
    openDiagFolder: () => ipcRenderer.send('open-diag-folder')
```

- [ ] **Step 2: Relais im Twitch-iframe ergaenzen**

In `preload.js` im vorhandenen `message`-Lauscher (`:116-122`) einen zweiten Zweig anhaengen:

```js
    window.addEventListener('message', (e) => {
      const d = e && e.data;
      if (d && d.source === 'twitchdual-adblock' &&
          (d.phase === 'start' || d.phase === 'end')) {
        ipcRenderer.send('adblock-state', { phase: d.phase });
      }
      // Diagnose aus der Main World des Players (dort gibt es kein
      // window.twitchDual - siehe Kommentar oben bei isTwitchFrame).
      if (d && d.source === 'twitchdual-diag' && d.ereignis) {
        ipcRenderer.send('diag-melde', {
          bereich: d.bereich || 'video', ereignis: d.ereignis, detail: d.detail
        });
      }
    });
```

- [ ] **Step 3: `__twitchDualDiag` im Bootstrap bereitstellen**

In `preload.js` im injizierten `bootstrap`-String (`:137`) direkt nach der Definition von `window.__twitchDualAd` einfuegen:

```js
        window.__twitchDualDiag = function(bereich, ereignis, detail){
          try {
            window.postMessage({ source: 'twitchdual-diag',
              bereich: bereich, ereignis: ereignis, detail: detail }, '*');
          } catch(e){}
        };
```

- [ ] **Step 4: Sandbox-Test und Gesamtsuite**

Run: `node -c preload.js && npm test`
Expected: kein Syntaxfehler, 274 gruen. Insbesondere muss `preload.js benutzt nur sandbox-faehige requires` gruen bleiben — es wurde kein neues `require` hinzugefuegt.

- [ ] **Step 5: Commit**

```bash
git add preload.js
git commit -m "feat: Diagnose-Bruecke im Preload samt Relais aus dem Player-iframe"
```

---

### Task 5: Der Schalter im ⚙-Popup

**Files:**
- Modify: `renderer/chat/index.html` (nach `:48`)
- Modify: `renderer/chat/chat.css` (`:364`)
- Modify: `renderer/chat/chat.js` (bei den uebrigen ⚙-Verdrahtungen, nach `:638`)

**Interfaces:**
- Consumes: `window.twitchDual.getDiagEnabled()`, `.setDiagEnabled(an)`, `.openDiagFolder()` aus Task 4.
- Produces: nichts fuer spaetere Aufgaben.

Ein Schalter, kein zweiter Knopf zum Sichern: **Einschalten ist das Sichern**, weil die Vorgeschichte mitgeht. Der Ordner-Knopf spart das Wuehlen im AppData.

- [ ] **Step 1: Gruppe im Popup ergaenzen**

In `renderer/chat/index.html` **nach** dem Knopf `opt-color-reset` (`:48`) und vor `</div>` (`:49`) einfuegen. Bewusst nach dem Knopf: „Farben zuruecksetzen" gehoert sichtbar zu „Darstellung".

```html
    <div class="opt-group">
      <div class="opt-group-title">Diagnose</div>
      <label class="opt-check"><input type="checkbox" id="opt-diag" /> Protokoll mitschreiben</label>
      <button id="opt-diag-open" type="button">Diagnose-Ordner öffnen</button>
    </div>
```

- [ ] **Step 2: Knopf an den bestehenden Stil anschliessen**

In `renderer/chat/chat.css` die beiden Regeln bei `:364` und `:369` um den neuen Knopf erweitern:

```css
#opt-color-reset, #opt-diag-open {
  margin: 6px 6px 4px; align-self: stretch; text-align: center;
  background: var(--hover); border: 1px solid var(--accent-border); border-radius: 6px;
  color: var(--accent-title); font-size: 12px; padding: 6px 8px; cursor: pointer;
}
#opt-color-reset:hover, #opt-diag-open:hover { color: var(--text); border-color: var(--accent-dim); }
```

- [ ] **Step 3: Schalter verdrahten**

In `renderer/chat/chat.js` direkt nach der `$optFont`-Verdrahtung (`:638`) einfuegen:

```js
// ---------------------------------------------------------------------------
// Diagnose-Schalter. Einschalten IST das Sichern: der Ringpuffer im Main geht
// dabei als Vorgeschichte in userData/diagnose.log.
// ---------------------------------------------------------------------------
const $optDiag = document.getElementById('opt-diag');
const $optDiagOpen = document.getElementById('opt-diag-open');

// Stand kommt aus dem Main (Store), nicht aus chatPrefs - der Schalter gilt
// fuer die ganze App, nicht nur fuers Chat-Fenster.
window.twitchDual.getDiagEnabled()
  .then((an) => { $optDiag.checked = !!an; })
  .catch(() => {}); // Diagnose ist Komfort - ohne Antwort bleibt der Haken aus

$optDiag.addEventListener('change', () => {
  window.twitchDual.setDiagEnabled($optDiag.checked);
});
$optDiagOpen.addEventListener('click', () => window.twitchDual.openDiagFolder());
```

- [ ] **Step 4: Gesamtsuite**

Run: `npm test`
Expected: 274 gruen (die Oberflaeche hat keine Unit-Tests; der Schritt sichert nur ab, dass nichts kaputtging).

- [ ] **Step 5: Am laufenden Programm pruefen**

Run: `npm start`

Pruefen:
1. ⚙ im Chat-Fenster oeffnen → Gruppe „Diagnose" ist unten sichtbar, Haken **aus**.
2. `%APPDATA%\twitchdual\diagnose.log` existiert **nicht** (Standard aus = nichts auf der Platte).
3. Haken setzen → Datei entsteht, erste Zeile `app:diagnose-an {"vorgeschichte":N}`, danach die gepufferten Zeilen.
4. „Diagnose-Ordner öffnen" → Explorer zeigt `%APPDATA%\twitchdual`.
5. App beenden, neu starten, ⚙ oeffnen → Haken ist **noch gesetzt** (Store).

Run: `Get-Content "$env:APPDATA\twitchdual\diagnose.log" -TotalCount 5`

- [ ] **Step 6: Commit**

```bash
git add renderer/chat/index.html renderer/chat/chat.css renderer/chat/chat.js
git commit -m "feat: Diagnose-Schalter im Einstellungs-Popup"
```

---

### Task 6: Ereignis-Katalog `punkte`

**Files:**
- Modify: `main.js` (`punkteTick` ab `:471`, `kisteEinloesen` ab `:434`, `submit-load` bei `:196-212` und `:235-243`, `points-redeem` bei `:416`, `web-login-*` bei `:375-402`)

**Interfaces:**
- Consumes: `diagLog.melde(bereich, ereignis, detail)` aus Task 3.
- Produces: keine neue Signatur; eine modulweite Variable `let letzterTaktGrund = null;` in `main.js`.

**Ereignisse:** `takt-aus` (mit Grund), `kontext`, `kiste-versuch`, `kiste-ok`, `kiste-fehler`, `integrity-ernte`, `einloesen`, `kanal-gesperrt`, `token-abgelaufen`, `kanalwechsel`.

Diese Aufgabe ist der eigentliche Anlass: ob das Einsammeln der Kanalpunkte in v1.10.0 live funktioniert, ist ungeprueft — in v1.9.0 war es bewiesen, die Claim-Logik ist unveraendert. `kiste-versuch`/`kiste-ok`/`kiste-fehler` beantworten genau diese Frage.

- [ ] **Step 1: Flankentriggerung fuer `takt-aus` vorbereiten**

`punkteTick()` laeuft jede Sekunde (`main.js:743`). Ein Ereignis pro Absage waere eine Zeile pro Sekunde — der Ringpuffer reichte dann keine drei Stunden zurueck und die Vorgeschichte waere wertlos. Gemeldet wird deshalb nur die **Aenderung**.

In `main.js` direkt nach `let punkteChannelId = null;` (`:358`) einfuegen:

```js
// Zuletzt gemeldeter Grund, warum der Takt ruht. Der Tick laeuft jede Sekunde;
// ohne diese Flanke waere 'takt-aus' eine Zeile pro Sekunde und der
// 10000er-Ringpuffer reichte keine drei Stunden zurueck.
let letzterTaktGrund = null;

// Meldet nur, wenn sich der Grund geaendert hat. null = Takt laeuft.
function meldeTaktGrund(grund) {
  if (grund === letzterTaktGrund) return;
  letzterTaktGrund = grund;
  if (grund) diagLog.melde('punkte', 'takt-aus', { grund });
  else diagLog.melde('punkte', 'takt-an');
}
```

- [ ] **Step 2: `punkteTick` mit Meldungen versehen**

In `main.js` den Block ab `:479` (`const zustand = {...}` bis `if (!pointsState.sollAbfragen(...)) return;`) ersetzen durch:

```js
    const zustand = {
      live: !!kanal && !punkteHomeOffen,
      playing: punkteSpielt,
      hatToken: webTokenNutzbar(),
      channelLogin: kanal
    };
    if (!pointsState.sollAbfragen(zustand, Date.now())) {
      // Genauer Grund statt Sammelbegriff - die Reihenfolge entspricht der
      // Pruefreihenfolge in points-state.js sollAbfragen().
      meldeTaktGrund(
        !webToken ? 'kein Token'
        : webTokenAbgelaufen ? 'Token abgelaufen'
        : !kanal ? 'kein Live-Kanal'
        : punkteHomeOffen ? 'Home offen'
        : !punkteSpielt ? 'pausiert'
        : pointsState.istKanalGesperrt(kanal) ? 'Kanal gesperrt'
        : 'Abstand');
      return;
    }
    meldeTaktGrund(null);
```

- [ ] **Step 3: Kontext, Kiste und Sperre melden**

In `main.js` nach `punkteChannelId = ctx.channelID;` (`:489`) einfuegen:

```js
      diagLog.melde('punkte', 'kontext', {
        kanal, channelID: ctx.channelID, stand: ctx.balance,
        claimID: ctx.claimID, punkteName: ctx.punkteName
      });
```

Im Zweig „Kanal hat keine Kanalpunkte" nach `pointsState.kanalGesperrt(kanal);` (`:494`):

```js
          diagLog.melde('punkte', 'kanal-gesperrt', { kanal });
```

Den Kisten-Block (`:512-532`) so ergaenzen — nur die `diagLog`-Zeilen sind neu:

```js
      if (ctx.claimID && pointsState.darfClaimen(ctx.claimID)) {
        diagLog.melde('punkte', 'kiste-versuch', { kanal, claimID: ctx.claimID });
        try {
          const r = await kisteEinloesen(ctx.channelID, ctx.claimID);
          if (!r.ok) {
            diagLog.melde('punkte', 'kiste-fehler', { claimID: ctx.claimID, code: r.error });
            pointsState.claimFehlgeschlagen(ctx.claimID);
          } else if (r.currentPoints != null) {
            kistenBetrag = Math.max(0, r.currentPoints - ctx.balance);
            stand = r.currentPoints;
            diagLog.melde('punkte', 'kiste-ok', {
              davor: ctx.balance, danach: r.currentPoints, betrag: kistenBetrag
            });
          } else {
            // r.ok ohne currentPoints - der Zuwachs faellt beim naechsten Takt
            // als "passiv" auf. Trotzdem festhalten, sonst sieht es aus, als
            // waere die Kiste nie eingeloest worden.
            diagLog.melde('punkte', 'kiste-ok', { davor: ctx.balance, danach: null, betrag: null });
          }
        } catch (e) {
          diagLog.melde('punkte', 'kiste-fehler', {
            claimID: ctx.claimID, code: e && e.message, integrity: !!(e && e.integrity)
          });
          pointsState.claimFehlgeschlagen(ctx.claimID);
          throw e;
        }
      }
```

Im `catch` des Takts (`:548-555`) nach der `webTokenAbgelaufen`-Zeile:

```js
      if (/abgelaufen/i.test(e.message)) {
        webTokenAbgelaufen = true;
        diagLog.melde('punkte', 'token-abgelaufen', { kanal });
      }
      diagLog.melde('punkte', 'abfrage-fehler', { kanal, fehler: e.message });
```

- [ ] **Step 4: Integrity-Ernte melden**

In `main.js` in `kisteEinloesen` (`:434-463`) an den drei Ernte-Stellen:

Nach `satz = await ernteIntegrity({ BrowserWindow, ses: session.defaultSession });` (`:437`):

```js
    diagLog.melde('punkte', 'integrity-ernte', { ergebnis: satz ? 'ok' : 'fehlgeschlagen', grund: 'kein Satz im Speicher' });
```

Nach `const neu = await ernteIntegrity({ BrowserWindow, ses: session.defaultSession });` (`:453`):

```js
    diagLog.melde('punkte', 'integrity-ernte', { ergebnis: neu ? 'ok' : 'fehlgeschlagen', grund: 'Satz abgelehnt, zweiter Versuch' });
```

- [ ] **Step 5: Kanalwechsel, Einloesen und Anmeldung melden**

In `main.js` im Live-Zweig von `submit-load` nach `currentLiveChannel = user.login;` (`:209`):

```js
      diagLog.melde('punkte', 'kanalwechsel', { modus: 'live', nach: user.login, userId: user.id });
```

Im VOD-Zweig nach `currentLiveChannel = null;` (`:242`):

```js
    diagLog.melde('punkte', 'kanalwechsel', { modus: 'vod', nach: null, videoId: parsed.value });
```

In `points-redeem` (`:416-429`) den `try`-Block ergaenzen — die Rueckgabe wird zwischengespeichert, um sie melden zu koennen:

```js
ipcMain.handle('points-redeem', async (_e, { reward, textInput }) => {
  const absage = punkteAbsage();
  if (absage) return { ok: false, error: absage };
  try {
    let channelID = punkteChannelId;
    if (!channelID) {
      const ctx = await pointsApi.context(webToken, currentLiveChannel);
      channelID = ctx.channelID;
    }
    const r = await pointsApi.redeem(webToken, channelID, reward, textInput);
    diagLog.melde('punkte', 'einloesen', {
      belohnung: reward && reward.title, kosten: reward && reward.cost,
      ok: r.ok, code: r.error
    });
    return r;
  } catch (e) {
    diagLog.melde('punkte', 'einloesen', {
      belohnung: reward && reward.title, ok: false, code: e.message
    });
    return { ok: false, error: e.message };
  }
});
```

In `web-login-start` nach `webTokenAbgelaufen = false;` (`:382`) und in `web-login-logout` nach `webToken = null;` (`:399`):

```js
        diagLog.melde('punkte', 'anmeldung', { was: 'eingeloggt' });
```
```js
  diagLog.melde('punkte', 'anmeldung', { was: 'abgemeldet' });
```

- [ ] **Step 6: Syntax pruefen und Gesamtsuite**

Run: `node -c main.js && npm test`
Expected: kein Syntaxfehler, 274 gruen.

**Wichtig:** Danach `Select-String` gegen die eigene Aenderung — kein Token darf in ein `detail` geraten. `webToken` selbst wird nirgends gemeldet (nur abgeleitete Werte); die Schwaerzung ist die zweite Verteidigungslinie, nicht die erste.

Run: `Select-String -Path main.js -Pattern "diagLog.melde.*webToken|diagLog.melde.*satz\.integrity|diagLog.melde.*accessToken"`
Expected: **keine Treffer.**

- [ ] **Step 7: Commit**

```bash
git add main.js
git commit -m "feat: Punkte-Ereignisse im Diagnose-Protokoll"
```

---

### Task 7: Ereignis-Katalog `video` (Werbung und Ton)

**Files:**
- Modify: `main.js` (`adblock-state` bei `:586`, `player-state` bei `:701`)
- Modify: `renderer/video/video.js` (Watchdog bei `:40`, Qualitaet bei `:153`)
- Modify: `renderer/lib/volume-guard.js` (`melde`-Option)
- Modify: `preload.js` (Bootstrap-Block bei `:160`)
- Test: `test/volume-guard.test.js` (zwei Tests anhaengen)

**Interfaces:**
- Consumes: `window.twitchDual.diag(...)` (Renderer), `window.__twitchDualDiag(...)` (Player-iframe), `diagLog.melde(...)` (Main) — alle aus Task 3/4.
- Produces: `createVolumeGuard({ graceMs = 1500, melde = () => {} })` — `melde(ereignis, detail)` wird beim Beginn eines Verdachts genau einmal gerufen (`'volume-guard-verdacht'`). Die Wiederherstellung meldet der Aufrufer selbst, weil er sie ohnehin am Rueckgabewert erkennt.

**Ereignisse:** `werbung-start`, `werbung-ende`, `watchdog`, `volume-guard-verdacht`, `volume-guard-wiederhergestellt`, `player-zustand`, `qualitaet`.

- [ ] **Step 1: Den fehlschlagenden Test fuer den Waechter schreiben**

An `test/volume-guard.test.js` anhaengen:

```js
test('meldet den Verdacht genau einmal, nicht bei jedem Messwert', () => {
  const meldungen = [];
  const g = createVolumeGuard({ graceMs: 1500, melde: (e, d) => meldungen.push([e, d]) });
  g.observe({ muted: false, volume: 0.11 }, 0);
  g.observe({ muted: false, volume: 0 }, 100);   // Verdacht beginnt
  g.observe({ muted: false, volume: 0 }, 200);   // gleicher Verdacht
  g.observe({ muted: false, volume: 0 }, 300);
  assert.equal(meldungen.length, 1, 'sonst 3 Meldungen pro Sekunde im Ringpuffer');
  assert.equal(meldungen[0][0], 'volume-guard-verdacht');
  assert.equal(meldungen[0][1].lastGoodVolume, 0.11);
});

test('gesunder Reload meldet auch: kurzer Verdacht ist eine echte Beobachtung', () => {
  const meldungen = [];
  const g = createVolumeGuard({ graceMs: 1500, melde: (e) => meldungen.push(e) });
  g.observe({ muted: false, volume: 0.11 }, 0);
  g.observe({ muted: false, volume: 0 }, 618);
  g.observe({ muted: false, volume: 0.11 }, 897);   // Verdacht vorbei
  g.observe({ muted: false, volume: 0 }, 2000);     // neuer Verdacht
  assert.deepEqual(meldungen, ['volume-guard-verdacht', 'volume-guard-verdacht']);
});
```

- [ ] **Step 2: Test laufen lassen, Fehlschlag bestaetigen**

Run: `node --test test/volume-guard.test.js`
Expected: FAIL — `meldungen.length` ist 0, weil `melde` noch nicht existiert.

- [ ] **Step 3: Den Waechter erweitern**

In `renderer/lib/volume-guard.js` die Signatur (`:34`) und den Verdachts-Beginn (`:56`) aendern:

```js
  function createVolumeGuard({ graceMs = 1500, melde = () => {} } = {}) {
```

```js
        if (suspectSince === null) {
          suspectSince = nowMs;
          // Genau EINMAL je Verdacht melden. Der Waechter wird alle 300 ms
          // befragt - eine Meldung pro Messwert waere Dauerfeuer im
          // Ringpuffer. Auch der kurze, gesunde Verdacht beim Reload wird
          // gemeldet: erst der Vergleich "kurz vs. anhaltend" macht ein
          // Protokoll auswertbar.
          try { melde('volume-guard-verdacht', { lastGoodVolume }); } catch (e) {}
          return null;
        }
```

- [ ] **Step 4: Test laufen lassen, gruen bestaetigen**

Run: `node --test test/volume-guard.test.js`
Expected: PASS — 12 Tests gruen (10 bestehende + 2 neue).

- [ ] **Step 5: Den Waechter im Bootstrap anschliessen**

In `preload.js` im injizierten Bootstrap (`:160-173`) den Waechter-Block ersetzen:

```js
        (function(){
          if (!window.createVolumeGuard) return;
          var guard = window.createVolumeGuard({
            melde: function(ereignis, detail){
              try { window.__twitchDualDiag('video', ereignis, detail); } catch(e){}
            }
          });
          setInterval(function(){
            try {
              var v = document.querySelector('video');
              var act = guard.observe(v ? { muted: v.muted, volume: v.volume } : null, Date.now());
              if (act && v) {
                v.volume = act.restoreTo;
                try { window.__twitchDualDiag('video', 'volume-guard-wiederhergestellt', { auf: act.restoreTo }); } catch(e){}
                console.log('[TwitchDual] Lautstaerke nach Player-Neustart wiederhergestellt: ' + act.restoreTo);
              }
            } catch(e){}
          }, 300);
        })();
```

- [ ] **Step 6: Werbung und Player-Zustand im Main melden**

In `main.js` den `adblock-state`-Handler (`:586-591`) ersetzen:

```js
ipcMain.on('adblock-state', (_evt, payload) => {
  const phase = payload && payload.phase;
  if (phase === 'start' || phase === 'end') {
    diagLog.melde('video', phase === 'start' ? 'werbung-start' : 'werbung-ende');
    if (videoWin && !videoWin.isDestroyed()) {
      videoWin.webContents.send('adblock-state', { phase });
    }
  }
});
```

Und im `player-state`-Handler (`:701`) nach der `punkteSpielt`-Zeile:

```js
  diagLog.melde('video', 'player-zustand', { zustand: state });
```

- [ ] **Step 7: Watchdog und Qualitaet im Video-Fenster melden**

In `renderer/video/video.js` im Watchdog-Intervall (`:40-45`):

```js
setInterval(() => {
  if (!adState) return;
  const wasActive = adState.overlayVisible;
  adState.tick(Date.now());
  if (wasActive && !adState.overlayVisible) {
    // Kein 'end'-Signal gekommen, der 120-s-Watchdog hat aufgeraeumt. Genau
    // dieser Fall ist der Verdaechtige bei "Ton weg nach Werbung".
    window.twitchDual.diag('video', 'watchdog', { was: 'Overlay nach Zeitablauf geraeumt' });
    renderAdOverlay();
  }
}, 1000);
```

Und in `startTimeBroadcast` im `if (vChanged || qChanged)`-Block (`:153-159`) — vor dem `savePlayerPrefs`:

```js
        if (vChanged || qChanged) {
          if (qChanged) {
            window.twitchDual.diag('video', 'qualitaet', { von: playerPrefs.quality, nach: q });
          }
          playerPrefs = {
            volume: typeof v === 'number' ? v : playerPrefs.volume,
            quality: q || playerPrefs.quality
          };
          window.twitchDual.savePlayerPrefs(playerPrefs);
        }
```

Die Lautstaerke wird bewusst **nicht** gemeldet: sie aendert sich beim Ziehen des Reglers viele Male pro Sekunde. Der Waechter deckt den Fall ab, um den es geht.

- [ ] **Step 8: Syntax pruefen und Gesamtsuite**

Run: `node -c main.js && node -c preload.js && npm test`
Expected: kein Syntaxfehler, 276 gruen (274 + 2).

- [ ] **Step 9: Commit**

```bash
git add main.js preload.js renderer/video/video.js renderer/lib/volume-guard.js test/volume-guard.test.js
git commit -m "feat: Video-, Werbe- und Ton-Ereignisse im Diagnose-Protokoll"
```

---

### Task 8: Ereignis-Katalog `chat`

**Files:**
- Modify: `renderer/chat/chat.js` (IRC bei `:408-469`, Badges bei `:201-204`, Senden bei `:807`, VOD bei `:489-502`)
- Modify: `renderer/lib/vod-replay.js` (optionaler `onLuecke`-Rueckruf)
- Test: `test/vod-replay.test.js` (zwei Tests anhaengen)

**Interfaces:**
- Consumes: `window.twitchDual.diag(...)` aus Task 4.
- Produces: `new VodReplayCore({ …, onLuecke })` — `onLuecke({ von, bis })` wird gerufen, wenn `ensureCoverage()` eine Strecke ueberspringt. Vorgabe: leere Funktion, damit bestehende Aufrufer unveraendert bleiben.

**Ereignisse:** `irc-verbunden`, `irc-getrennt` (Grund), `irc-reconnect` (Versuch, Wartezeit), `senden-fehler` (msg-id), `emotes-fehler` (Quelle), `badges-fehler` (Quelle), `vod-luecke` (von/bis).

**Ausdruecklich nicht: einzelne Chat-Nachrichten.** Bei einem Mega-Chat waeren das Tausende Zeilen pro Minute; der gesuchte Fehler ginge darin unter und die Groessengrenze waere in Minuten erreicht. Der Chat-Bereich protokolliert Verbindungs- und Fehlerereignisse, keine Inhalte.

- [ ] **Step 1: Den fehlschlagenden Test fuer `onLuecke` schreiben**

An `test/vod-replay.test.js` anhaengen:

```js
test('leere Antwort -> Luecke wird gemeldet (von/bis)', async () => {
  const luecken = [];
  const core = new VodReplayCore({
    videoId: '2467910019',
    lengthSeconds: 3600,
    fetchPage: async () => ({ ok: true, comments: [] }),   // hinter VOD-Ende / keine Daten
    onMessage: () => {},
    onClear: () => {},
    onError: () => {},
    onLuecke: (l) => luecken.push(l)
  });
  await core.onTime(100);          // erster Aufruf positioniert (seekTo)
  assert.equal(luecken.length, 1);
  assert.equal(luecken[0].von, 100);
  assert.equal(luecken[0].bis, 100 + VodReplayCore.VOD_GAP_STEP);
});

test('ohne onLuecke laeuft alles wie bisher', async () => {
  const core = new VodReplayCore({
    videoId: '2467910019',
    lengthSeconds: 3600,
    fetchPage: async () => ({ ok: true, comments: [] }),
    onMessage: () => {},
    onClear: () => {},
    onError: () => {}
  });
  await core.onTime(100);          // darf nicht werfen
  assert.ok(true);
});
```

**Hinweis:** `test/vod-replay.test.js` existiert bereits. Zuerst dessen Kopf lesen — die Art, wie `VodReplayCore` dort geladen und wie `fetchPage` dort geformt wird (Feldnamen der Antwort), ist massgeblich. Weicht die Antwortform ab, den Test daran anpassen, **nicht** das Modul.

- [ ] **Step 2: Test laufen lassen, Fehlschlag bestaetigen**

Run: `node --test test/vod-replay.test.js`
Expected: FAIL — `luecken.length` ist 0.

- [ ] **Step 3: `onLuecke` im Kern ergaenzen**

In `renderer/lib/vod-replay.js` im `constructor` (`:55`) den Rueckruf mit leerer Vorgabe aufnehmen — analog zu den bestehenden `onMessage`/`onClear`/`onError`:

```js
      this.onLuecke = opts.onLuecke || function () {};
```

Und im `else`-Zweig von `ensureCoverage()` (`:160-164`):

```js
      } else {
        // Komplett leere Antwort (hinter VOD-Ende / keine Daten) ->
        // grosszuegig ueberspringen, damit die Wiedergabe nicht haengt.
        // ACHTUNG: eine Seitengrenzen-Kollision ist KEINE Luecke (siehe
        // Kommentar bei fetchAtOffset) und wird hier bewusst nicht gemeldet.
        const von = this.coveredUntil;
        this.coveredUntil = reqOffset + VOD_GAP_STEP;
        try { this.onLuecke({ von: reqOffset, bis: this.coveredUntil, vorher: von }); } catch (e) {}
      }
```

- [ ] **Step 4: Test laufen lassen, gruen bestaetigen**

Run: `node --test test/vod-replay.test.js`
Expected: PASS — alle bisherigen plus die 2 neuen.

- [ ] **Step 5: Chat-Ereignisse verdrahten**

In `renderer/chat/chat.js`:

`scheduleIrcReconnect` (`:408-416`) — nach der `setConn`-Zeile:

```js
  window.twitchDual.diag('chat', 'irc-reconnect', {
    versuch: ircAttempts, wartezeitMs: Math.round(wait), kanal: ircChannel
  });
```

Hinweis: `ircAttempts` wird in der Zeile darueber mit `ircAttempts++` bereits erhoeht — der gemeldete Wert ist also der Zaehler **nach** diesem Versuch. Das ist gewollt und im Detail benannt.

Im `366`-Zweig (`:451-453`) nach `setConn('verbunden ✓', 'ok');`:

```js
        window.twitchDual.diag('chat', 'irc-verbunden', { kanal: ircChannel });
```

`ws.onclose` (`:463-467`) — der Grund kommt aus dem Ereignis, deshalb bekommt der Handler ein Argument:

```js
  ws.onclose = (ev) => {
    if (ircSocket !== ws) return; // gewollt geschlossen/ersetzt
    ircSocket = null;
    window.twitchDual.diag('chat', 'irc-getrennt', {
      kanal: ircChannel, code: ev && ev.code, grund: (ev && ev.reason) || null
    });
    scheduleIrcReconnect();
  };
```

Badges (`:201-204`):

```js
      window.twitchDual.fetchUserBadges(opts.userId)
        .then((r) => userBadgeCache.set(opts.userId, (r && r.badges) || []))
        .catch((e) => {
          window.twitchDual.diag('chat', 'badges-fehler', {
            quelle: '7tv/bttv/ffz', fehler: e && e.message
          });
          userBadgeCache.set(opts.userId, []);
        });
```

Eigene Emotes (`:781`):

```js
  if (canChat) ensureUserEmotes().catch((e) => {
    window.twitchDual.diag('chat', 'emotes-fehler', { quelle: 'helix-user', fehler: e && e.message });
  });
```

Senden (`:807-808`):

```js
  const r = await window.twitchDual.chatSend(text);
  if (!r.ok) {
    // Inhalt der Nachricht wird NICHT protokolliert - nur, dass und warum es
    // schiefging.
    window.twitchDual.diag('chat', 'senden-fehler', { grund: r.error, laenge: text.length });
    showChatError(r.error);
    return;
  }
```

NOTICE mit `msg-id`: den vorhandenen Aufruf `window.twitchDual.onChatNotice((n) => {` in `chat.js` suchen und als **erste** Zeile im Rumpf einfuegen:

```js
  window.twitchDual.diag('chat', 'senden-fehler', { msgId: n && n.id });
```

VOD-Luecke — in `createVodReplay` (`:490-501`) den neuen Rueckruf anhaengen (Komma an die `onError`-Zeile):

```js
    onError: (msg) => {
      window.twitchDual.diag('chat', 'vod-fehler', { fehler: msg });
      setConn('VOD-Fehler: ' + msg, 'err');
    },
    onLuecke: (l) => window.twitchDual.diag('chat', 'vod-luecke', {
      videoId: payload.videoId, von: l.von, bis: l.bis
    })
```

- [ ] **Step 6: Gesamtsuite**

Run: `npm test`
Expected: 278 gruen (276 + 2).

- [ ] **Step 7: Am laufenden Programm pruefen**

Run: `npm start`

Diagnose einschalten, einen Live-Kanal laden, den Player spielen lassen, dann:

Run: `Select-String -Path "$env:APPDATA\twitchdual\diagnose.log" -Pattern "chat:|video:|punkte:" | Select-Object -Last 30`

Erwartet: `chat:irc-verbunden`, `video:player-zustand`, `punkte:kontext`. **Und dann die eigentliche Frage:** einmal warten, bis eine Kiste faellig ist, und pruefen, ob `punkte:kiste-versuch` von `punkte:kiste-ok` gefolgt wird — das beantwortet, ob das Einsammeln der Kanalpunkte in v1.10.0 live funktioniert.

Run: `Select-String -Path "$env:APPDATA\twitchdual\diagnose.log" -Pattern "kiste-"`

- [ ] **Step 8: Der Beweis, dass nichts leckt**

Run: `Select-String -Path "$env:APPDATA\twitchdual\diagnose.log" -Pattern "[a-z0-9]{30}"`
Expected: **keine Treffer.** Jeder Treffer ist ein Leck und muss vor dem Release mit einem Test in `test/diag-redact.test.js` geschlossen werden.

- [ ] **Step 9: Commit**

```bash
git add renderer/chat/chat.js renderer/lib/vod-replay.js test/vod-replay.test.js
git commit -m "feat: Chat-Ereignisse im Diagnose-Protokoll"
```

---

### Task 9: Doku, Version, Release

**Files:**
- Modify: `docs/TODO.md`
- Modify: `package.json` (`version`)

Ablauf nach `docs/TODO.md:399-408`. `npm run dist` **nur aus dem Haupt-Checkout** (`C:\Users\janis\TwitchDual`), nicht aus einem Worktree.

- [ ] **Step 1: Abschnitt in `docs/TODO.md`**

Vor dem Abschnitt `## Releases / Auto-Update (seit v1.0.0)` einfuegen:

```markdown
## Diagnose-Schalter (v1.11.0)

Ein Schalter im ⚙-Popup des Chat-Fensters schreibt ein Protokoll nach
`%APPDATA%\twitchdual\diagnose.log`. Standard ist **aus**, und aus heisst:
nichts auf der Platte.

- **Ringpuffer:** Die letzten 10000 Ereignisse liegen immer im Speicher (~1,5 MB),
  unabhaengig vom Schalter. Einschalten schreibt sie als **Vorgeschichte** in
  einem einzigen Schreibvorgang in die Datei. Das ist der ganze Punkt: ein
  Schalter, den man erst nach dem Symptom umlegt, haette bei keinem der letzten
  drei Fehler geholfen.
- **Bereiche:** `punkte`, `video`, `chat`, `app`. Einzelne Chat-Nachrichten
  werden bewusst NICHT protokolliert.
- **Schwaerzung:** `src/diag-redact.js`, geprueft gegen echt geformte Rahmen
  (`test/diag-redact.test.js`) — Web-Cookie `auth-token`, GQL-`OAuth`,
  Hermes-`"token"`, IRC-`PASS oauth:` (klein), `Client-Integrity`,
  Cookie-Kopfzeilen, plus struktureller 30-Zeichen-Auffang. Die Gegenprobe
  haelt fest, dass Fliesstext, Kanal-Logins, 7TV-ULIDs und VOD-IDs unberuehrt
  bleiben.
- **Groessengrenze:** ueber 10 MB wird nach `diagnose.1.log` umgelegt. Hoechstens
  zwei Dateien, hoechstens ~20 MB.
- **`updater.log` bleibt daneben bestehen**: Updater-Ereignisse gehen weiter
  IMMER in eine Datei, auch bei ausgeschaltetem Schalter. Sie sind selten,
  kosten nichts und haben schon zweimal eine Fehlersuche getragen.
- Entwurf und Plan: `docs/superpowers/{specs,plans}/2026-08-13-diagnose-schalter*`.
```

- [ ] **Step 2: Version erhoehen**

In `package.json` `"version": "1.10.0"` → `"version": "1.11.0"`.

- [ ] **Step 3: Letzter Gesamtlauf**

Run: `npm test`
Expected: 278 gruen.

- [ ] **Step 4: Commit und Push**

Der Push nimmt die beiden noch lokalen Entwurfs-Commits (`1b38159`, `b319a3b`) mit.

```bash
git add docs/TODO.md package.json
git commit -m "chore: v1.11.0 - Diagnose-Schalter"
git push origin master
```

- [ ] **Step 5: Installer bauen**

Run: `npm run dist`
Expected: `dist/installer/TwitchDual Setup 1.11.0.exe` + `.blockmap` + `latest.yml`.

- [ ] **Step 6: Release veroeffentlichen**

GitHub ersetzt Leerzeichen; `latest.yml` erwartet Bindestrich-Namen. Deshalb erst kopieren:

```powershell
Copy-Item "dist/installer/TwitchDual Setup 1.11.0.exe" "dist/installer/TwitchDual-Setup-1.11.0.exe"
Copy-Item "dist/installer/TwitchDual Setup 1.11.0.exe.blockmap" "dist/installer/TwitchDual-Setup-1.11.0.exe.blockmap"
gh release create v1.11.0 "dist/installer/TwitchDual-Setup-1.11.0.exe" "dist/installer/TwitchDual-Setup-1.11.0.exe.blockmap" "dist/installer/latest.yml" --title "v1.11.0 - Diagnose-Schalter" --notes "Diagnose-Schalter im Chat-Einstellungs-Popup: Ringpuffer mit Vorgeschichte, Bereiche Punkte/Video/Chat/App, geschwaerzte Zugangsdaten."
```

- [ ] **Step 7: Release-Assets kontrollieren (Pflicht)**

Die Blockmap hat schon **zweimal** gefehlt, und der Release blieb schon einmal als Entwurf haengen. Ohne Blockmap laedt der Auto-Updater die komplette EXE statt eines Differenz-Downloads; als Entwurf sieht ihn gar niemand.

Run: `gh release view v1.11.0 --json isDraft,assets`

Erwartet: `"isDraft": false` und **drei** Assets — `TwitchDual-Setup-1.11.0.exe`, `TwitchDual-Setup-1.11.0.exe.blockmap`, `latest.yml`.

Fehlt etwas: `gh release upload v1.11.0 <datei>` nachreichen. Ist es ein Entwurf: `gh release edit v1.11.0 --draft=false`. Danach **erneut pruefen**.

---

## Selbstpruefung (durchgefuehrt)

**Spec-Abdeckung**, Abschnitt fuer Abschnitt:

| Entwurf | Aufgabe |
|---|---|
| 1. Aufbau (zwei Module, Datenfluss, Schwaerzen beim Eintritt) | Task 1, 2 (`baueZeile` schwaerzt vor `puffer.push`) |
| 1. `updaterLog` behaelt `updater.log` und ruft zusaetzlich `melde` | Task 3 Schritt 3 |
| 2. `diag-redact.js`, sieben Muster + Auffangnetz + Gegenprobe | Task 1 Schritt 1/3 |
| 3. `diag-log.js`, ganze API, Zeilenformat, Ringpuffer, Ein/Aus, Groessengrenze | Task 2 |
| 3. Vorgeschichte als EIN Schreibvorgang | Task 2 Schritt 1 (Test) + Schritt 3 (`[kopf, ...puffer].join`) |
| 4. Verdrahtung Main: `diagLog` mit fs, Store lesen, vier IPC-Kanaele | Task 3 |
| 4. Preload: `diag`, `getDiagEnabled`, `setDiagEnabled`, `openDiagFolder` | Task 4 |
| 4. Renderer melden immer | Task 3 Schritt 2 (Kommentar am IPC-Handler), Task 4 Schritt 1 |
| 4. Store `diagEnabled`, Vorgabe `false` | Task 3 Schritt 1 |
| 5. Bedienung: Gruppe im ⚙-Popup, ein Schalter + Ordner-Knopf | Task 5 |
| 6. Katalog `punkte` (10 Ereignisse) | Task 6 |
| 6. Katalog `video` (7 Ereignisse) | Task 7 |
| 6. Katalog `chat` (7 Ereignisse) | Task 8 |
| 6. Katalog `app` (`start`, `update:*`, `gpu-status`, `unhandled-rejection`, `fenster`) | Task 3 Schritt 3/4 |
| 6. Keine einzelnen Chat-Nachrichten | Task 8, Vorbemerkung |
| 7. Tests `diag-redact` (4 Punkte) | Task 1 Schritt 1 |
| 7. Tests `diag-log` (9 Punkte) | Task 2 Schritt 1 |
| 8. Randfaelle (7 Zeilen) | Schalter aus → T2/T1; leere Vorgeschichte → T2/T11; Datei nicht schreibbar → T2/T14; Renderer meldet zu frueh → T3 Schritt 2 (`if (!m) return` + `melde` wirft nie; vor `whenReady` gibt es noch kein Fenster, das senden koennte); `detail` undefined → T2/T3; Umlegen schlaegt fehl → T2/T13; Diagnose an beim Beenden → T3 Schritt 1/4 (Store) |
| 9. Betroffene Dateien | Dateistruktur-Tabelle; drei begruendete Ergaenzungen unter „Abweichungen" |
| 9. Version bumpen + Release | Task 9 |

**Platzhalter:** keine. Drei Stellen verlangen ein Nachschauen statt eines vorgegebenen Textes, jeweils mit klarer Anweisung, was gilt: der Zeitstempel-Erwartungswert in Task 2 Schritt 4 (Wert beliebig gewaehlt, an die Ausgabe anpassen), die Antwortform von `fetchPage` in Task 8 Schritt 1 (bestehende Testdatei ist massgeblich), und der `onChatNotice`-Rumpf in Task 8 Schritt 5 (eine Zeile an den Anfang, Rumpf unangetastet).

**Typkonsistenz:** `schwaerze(text) -> string` wird in Task 2 als `schwaerze(...)` aus `{ schwaerze }` importiert — Task 1 exportiert genau so. `createDiagLog` wird in Task 2 als Vorgabe-Export erzeugt (`module.exports = createDiagLog`) und in Task 3 als `require('./src/diag-log')` ohne Destrukturierung geladen — passt. `melde(bereich, ereignis, detail)` hat in Task 3 (Main), Task 4 (`diag`), Task 6, 7, 8 durchgehend dieselben drei Argumente in derselben Reihenfolge. Der IPC-Nutzlast-Schluessel heisst in Task 4 `{ bereich, ereignis, detail }` und wird in Task 3 mit genau diesen Feldern gelesen. `createVolumeGuard({ graceMs, melde })` wird in Task 7 Schritt 5 mit `melde` gerufen und in Schritt 3 mit `melde` deklariert. `onLuecke({ von, bis, vorher })` wird in Task 8 Schritt 3 mit genau diesen Feldern gerufen und in Schritt 5 mit `l.von`/`l.bis` gelesen; der Test in Schritt 1 prueft `von`/`bis`. Die vier IPC-Kanalnamen (`diag-melde`, `get-diag-enabled`, `set-diag-enabled`, `open-diag-folder`) sind in Task 3 und Task 4 zeichengleich.
