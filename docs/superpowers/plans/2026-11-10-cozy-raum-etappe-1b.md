# Cozy-Raum Etappe 1b (Chat- und Video-Optik mit Pixel-Bildern) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Die gewählten Pixel-Bilder in Chat- und Video-Fenster einbauen: Szenen-Streifen mit LIVE-Schild im Chat, Leisten und Eingabefeld als Pixel-Rahmen, TV-Gehäuse-Leiste im Video, Pixel-Schrift für Leisten und Schilder, harte Kanten, keine Verläufe.

**Architecture:** Reines Aussehen. Eine neue gemeinsame Datei `renderer/themes/cozy/raum.css` bringt Pixel-Schrift und die Rahmen-Klassen (9-Slice über `border-image`, ganzzahlig vergrößert). Der Szenen-Streifen ist ein neues Element im Chat; sein Vergrößerungsfaktor kommt aus einer kleinen DOM-freien Lib `renderer/lib/szene.js`. Vorhandene IDs und alle Logik bleiben.

**Tech Stack:** Electron, Renderer als `<script>`-Dateien im UMD-Stil, CSS, Tests mit `node --test` (`npm test`).

**Spec:** `docs/superpowers/specs/2026-11-10-cozy-raum-design.md` (Etappe 1, Nachtrag „Etappe 1 geteilt“, Zeile „Chat-Fenster“ und „Video-Fenster“ der Entscheidungstabelle).

**Stand der Freigabe:** Janis hat die Vorab-Fragen übersprungen („ich sag dann am Schluss, was mir nicht gefällt“, 10.11.2026). Alle Optik-Festlegungen unten sind Claudes Vorschlag und stehen nach dem Bau zur Korrektur.

## Global Constraints

- Branch `feat/cozy-raum`. Kein Merge, kein Release, kein Versions-Bump.
- `npm test` ist nach jedem Task grün. Ausgangsstand: 596 Tests, 0 Fehler.
- Dateien nur mit Write/Edit anlegen und ändern, nie per Shell-Heredoc. Ausnahme: Bilddateien und die Schriftdatei (Binärdateien) entstehen per Skript bzw. Download.
- Keine Zugangsdaten in Code, Tests, Commits.
- Pixel-Bilder nur ganzzahlig vergrößern, immer mit `image-rendering: pixelated`.
- Keine Verläufe (`gradient`) und kein `backdrop-filter` in `renderer/chat/chat.css`, im `<style>` von `renderer/video/index.html` für Leiste/On-Air und in `raum.css`.
- Chat-Text (Nachrichten) bleibt in der heutigen Schrift. Die Pixel-Schrift gilt nur für Leisten, Schilder und Überschriften.
- Home (CD-Bühne, `home.css`, `home-buehne-dom.js`) wird nicht angefasst; `--schrift-titel` bleibt ungesetzt, die Pixel-Schrift läuft über die neue Variable `--schrift-pixel`.
- Vorhandene IDs bleiben (`oa-label`, `onair-bar`, `head`, `footer`, `composer`, `chat-feld`, `bar`, `stream-info`, `ads-indicator` …); `chat.js`/`video.js` werden nur dort geändert, wo dieser Plan es nennt.
- `preload.js`, `main.js`, `renderer/lib/chat-ereignisse.js`, `renderer/lib/kiste.js` bleiben unverändert.
- Die App nicht selbst anschauen, keine Screenshots: Anschauen macht Janis.
- Commit-Nachrichten enden mit `Co-Authored-By: Claude Fable 5.2 <noreply@anthropic.com>`.

## Feste Werte

| Was | Wert |
|---|---|
| Bilder (vorhanden in `renderer/themes/cozy/`) | `streifen.png` 344×72, `leiste-chat.png` 334×42, `leiste-video.png` 334×39, `feld.png` 334×39, `lampe-rot.png` / `lampe-gruen.png` / `knopf.png` 32×32, `tapete.png` 30×30 |
| Rahmen-Faktor (Leisten, Feld) | 2 |
| Lampen, Knopf | Faktor 1 (32 px) |
| Tapete | Faktor 2 (60 px Kachel) |
| Pixel-Schrift | Pixelify Sans (variable TTF), SIL OFL 1.1, Quelle `https://raw.githubusercontent.com/google/fonts/main/ofl/pixelifysans/` (Lizenz geprüft 10.11.2026) |
| `--schrift-pixel` | `'Pixelify Sans', 'Cascadia Code', Consolas, monospace` |
| Szenen-Faktor | größte ganze Zahl f mit `344·f ≤ Breite` und `72·f ≤ 0,2·Höhe`, mindestens 1, höchstens 6 |

Die Schnittmaße der 9-Slice-Rahmen (wie viele Bildpixel Rand oben/rechts/unten/links) sind **ungeprüft** und werden in Task 1 am Bild gemessen und in `raum.css` als Kommentar festgehalten.

## Review Focus

1. Sehr schmales Chat-Fenster (angedockt, unter 344 px): der Streifen wird mittig beschnitten statt gestaucht, Faktor bleibt 1. → Task 2, Test „schmal“.
2. Kaputte Fenstermaße (0, NaN, negativ) beim ersten Zeichnen: Faktor 1, kein Absturz. → Task 2, Test „Müll“.
3. Chat-Deckkraft unter 100 %: Streifen, Leisten und Feld bleiben deckend sichtbar (Bilder tragen kein `--chat-alpha`); nur die Nachrichtenfläche wird durchsichtig. → Task 3, statischer Test.
4. LIVE-Schild zeigt weiter „LIVE“/„VOD“ und verschwindet ohne laufenden Stream (`body.onair`, `#oa-label` bleiben die Schnittstelle). → Task 3, statischer Test.
5. Nur-Video-Modus: die TV-Leiste ist weg wie bisher (`body.video-only #bar`), der Player füllt das Fenster. → Task 4, statischer Test.

---

### Task 1: Gemeinsame Raum-Datei, Pixel-Schrift, Rahmen-Klassen

**Files:**
- Create: `renderer/themes/cozy/raum.css`
- Create: `renderer/themes/cozy/schrift/PixelifySans.ttf`, `renderer/themes/cozy/schrift/OFL.txt` (Download aus der Quelle oben)
- Create: `renderer/themes/cozy/leiste-video-links.png` (waagrecht gespiegelte `leiste-video.png`, damit der Lautsprecher links sitzt und die Fensterknöpfe rechts in der Ecke bleiben)
- Create: `test/cozy-raum.test.js`
- Modify: `renderer/chat/index.html`, `renderer/video/index.html` (Link nach `farben.css`)

**Interfaces:**
- Produces (`raum.css`):
  - `@font-face` „Pixelify Sans“ aus `schrift/PixelifySans.ttf`; `:root { --schrift-pixel: … }`
  - Klassen `.rahmen-leiste-chat`, `.rahmen-leiste-video`, `.rahmen-feld`: `border-image` mit `fill`, Faktor 2, `image-rendering: pixelated`, `border-radius: 0`, `background: none`
  - Klasse `.pixel-knopf`: 32×32, `knopf.png` als Hintergrund, Zeichen mittig in `var(--text)`, ohne Rahmen und Rundung
  - Klasse `.lampe` mit `.lampe.rot` / `.lampe.gruen`: 32×32-Bild, `display: inline-block`
  - Klasse `.tapete`: `tapete.png` gekachelt, `background-size: 60px 60px`

- [ ] **Step 1: Test schreiben** (`test/cozy-raum.test.js`; Kopf `wurzel`/`lies` wie in `test/cozy-abriss.test.js`)

```js
const raum = lies('renderer/themes/cozy/raum.css');
test('raum.css: Pixel-Schrift lokal, keine Netz-Adresse', () => {
  assert.ok(/@font-face[^}]*Pixelify Sans[^}]*schrift\/PixelifySans\.ttf/s.test(raum));
  assert.ok(!/https?:/.test(raum));
  assert.ok(fs.existsSync(path.join(wurzel, 'renderer/themes/cozy/schrift/PixelifySans.ttf')));
  assert.ok(lies('renderer/themes/cozy/schrift/OFL.txt').includes('SIL Open Font License'));
  assert.ok(/--schrift-pixel\s*:\s*'Pixelify Sans'/.test(raum));
});
test('raum.css: Rahmen-Klassen nutzen die Bilder, pixelgenau und eckig', () => {
  for (const [klasse, bild] of [['.rahmen-leiste-chat', 'leiste-chat.png'], ['.rahmen-leiste-video', 'leiste-video-links.png'], ['.rahmen-feld', 'feld.png']]) {
    const regel = raum.slice(raum.indexOf(klasse + ' {'), raum.indexOf('}', raum.indexOf(klasse + ' {')));
    assert.ok(regel.includes(bild), klasse);
    assert.ok(/border-image:[^;]*fill/.test(regel), klasse + ' fill');
    assert.ok(regel.includes('image-rendering: pixelated'), klasse);
    assert.ok(fs.existsSync(path.join(wurzel, 'renderer/themes/cozy', bild)), bild);
  }
  assert.ok(!/gradient|backdrop-filter/.test(raum));
});
test('raum.css: Knopf, Lampen, Tapete', () => {
  for (const s of ['.pixel-knopf', '.lampe.rot', '.lampe.gruen', '.tapete', 'knopf.png', 'lampe-rot.png', 'lampe-gruen.png', 'tapete.png']) assert.ok(raum.includes(s), s);
});
test('beide Fenster binden raum.css direkt nach farben.css ein', () => {
  for (const datei of ['renderer/chat/index.html', 'renderer/video/index.html']) {
    const html = lies(datei);
    const f = html.indexOf('../themes/cozy/farben.css');
    const r = html.indexOf('../themes/cozy/raum.css');
    assert.ok(f > -1 && r > f, datei);
  }
});
```

- [ ] **Step 2: Test laufen lassen, Fehlschlag sehen** — `node --test test/cozy-raum.test.js` → FAIL (Datei fehlt).
- [ ] **Step 3: Schrift und Lizenz laden, gespiegeltes Leistenbild erzeugen, Schnittmaße messen** (Pillow: je Bild die Randbreite bestimmen, bis zu der sich Zeilen/Spalten vom Mittelstück unterscheiden; Ergebnis vergrößert ansehen). Maße als Kommentar in `raum.css`.
- [ ] **Step 4: `raum.css` schreiben und in beide Fenster einbinden.**
- [ ] **Step 5: Prüfen** — `npm test` → 0 Fehler.
- [ ] **Step 6: Commit** — `git add renderer/themes/cozy/raum.css renderer/themes/cozy/schrift renderer/themes/cozy/leiste-video-links.png renderer/chat/index.html renderer/video/index.html test/cozy-raum.test.js`, Nachricht `feat: Raum-Datei mit Pixel-Schrift und Rahmen-Klassen`.

---

### Task 2: Szenen-Faktor (Lib)

**Files:**
- Create: `renderer/lib/szene.js`, `test/szene.test.js`

**Interfaces:**
- Produces: `Szene.BILD = { breite: 344, hoehe: 72 }`, `Szene.faktor(fensterBreite: number, fensterHoehe: number) -> number` (ganze Zahl 1…6), `Szene.masse(fensterBreite, fensterHoehe) -> { faktor, breite, hoehe }` (Bildmaße mal Faktor). UMD wie `renderer/lib/teiler.js` (`root.Szene`).

- [ ] **Step 1: Test schreiben**

```js
const S = require('../renderer/lib/szene');
test('faktor: Breite und 20 % der Hoehe begrenzen', () => {
  assert.strictEqual(S.faktor(1397, 1332), 3);   // Breite erlaubt 4, Hoehe 3
  assert.strictEqual(S.faktor(700, 2000), 2);
  assert.strictEqual(S.faktor(5000, 5000), 6);   // Deckel
});
test('faktor: schmal oder niedrig -> 1', () => {
  assert.strictEqual(S.faktor(300, 900), 1);
  assert.strictEqual(S.faktor(1400, 300), 1);
});
test('faktor: Muell -> 1', () => {
  for (const [b, h] of [[0, 0], [NaN, 500], [-5, 800], [undefined, undefined], ['x', {}]]) assert.strictEqual(S.faktor(b, h), 1);
});
test('masse: Bild mal Faktor', () => {
  assert.deepStrictEqual(S.masse(1397, 1332), { faktor: 3, breite: 1032, hoehe: 216 });
});
```

- [ ] **Step 2: Fehlschlag sehen** — `node --test test/szene.test.js` → FAIL (Modul fehlt).
- [ ] **Step 3: `renderer/lib/szene.js` schreiben.**
- [ ] **Step 4: Prüfen** — `npm test` → 0 Fehler.
- [ ] **Step 5: Commit** — `git add renderer/lib/szene.js test/szene.test.js`, Nachricht `feat: Szenen-Faktor fuer den Chat-Streifen`.

---

### Task 3: Chat-Fenster mit Streifen, Schild, Rahmen, harten Kanten

**Files:**
- Modify: `renderer/chat/index.html`, `renderer/chat/chat.css`, `renderer/chat/chat.js`
- Modify: `test/cozy-raum.test.js`

**Interfaces:**
- Consumes: Klassen aus Task 1, `Szene.masse` aus Task 2.
- Produces: `<div id="szene">` zwischen `#head` und `#chat-mitte`; darin `#onair-bar` als Schild (`.lampe.rot` + `#oa-label`). `chat.js` setzt auf `#szene` die Inline-Variablen `--szene-f` (Faktor) und `--szene-h` (Höhe in px) bei Start und bei `resize`.

Aufbau (Claudes Vorschlag): oben `#head` als Holzleiste (`.rahmen-leiste-chat`) mit Titel in Pixel-Schrift, ⚙ und Fensterknöpfen als `.pixel-knopf`. Darunter `#szene`: `tapete` gekachelt als Grund, darauf mittig `streifen.png` in `--szene-f`-facher Größe; links oben das Schild. Darunter Nachrichten auf `var(--bg)`. `#composer` und `#footer` auf `var(--panel-fest)` mit harter Linie; `#chat-feld` als `.rahmen-feld`.

- [ ] **Step 1: Statischen Test ergänzen** (`test/cozy-raum.test.js`)

```js
const chatHtml = lies('renderer/chat/index.html');
const chatCss = lies('renderer/chat/chat.css');
const chatJs = lies('renderer/chat/chat.js');
test('Chat: Szenen-Streifen sitzt zwischen Kopf und Nachrichten und traegt das Schild', () => {
  const kopf = chatHtml.indexOf('id="head"'), szene = chatHtml.indexOf('id="szene"'), mitte = chatHtml.indexOf('id="chat-mitte"');
  assert.ok(kopf > -1 && kopf < szene && szene < mitte);
  const block = chatHtml.slice(szene, mitte);
  assert.ok(block.includes('id="onair-bar"') && block.includes('id="oa-label"') && block.includes('lampe rot'));
  assert.ok(!chatHtml.includes('class="oa-line"'));
  assert.ok(chatHtml.includes('lib/szene.js'));
});
test('Chat: Schild haengt weiter an body.onair und #oa-label', () => {
  assert.ok(/body\.onair #onair-bar/.test(chatCss));
  assert.ok(chatJs.includes("getElementById('oa-label')") && chatJs.includes("classList.toggle('onair'"));
  assert.ok(chatJs.includes('Szene.masse') && chatJs.includes('--szene-f'));
});
test('Chat: Rahmen-Klassen an Kopf und Feld, Knoepfe als Pixel-Knopf', () => {
  assert.ok(/id="head" class="[^"]*rahmen-leiste-chat/.test(chatHtml));
  assert.ok(/id="chat-feld" class="[^"]*rahmen-feld/.test(chatHtml));
  for (const id of ['settings-btn', 'win-min', 'win-max', 'win-close']) {
    assert.ok(new RegExp('id="' + id + '" class="[^"]*pixel-knopf').test(chatHtml), id);
  }
});
test('Chat: keine Verlaeufe, kein Blur, Streifen und Leisten ohne Deckkraft-Variable', () => {
  assert.ok(!/gradient|backdrop-filter/.test(chatCss));
  for (const sel of ['#szene {', '#composer {', '#footer {']) {
    const regel = chatCss.slice(chatCss.indexOf(sel), chatCss.indexOf('}', chatCss.indexOf(sel)));
    assert.ok(chatCss.indexOf(sel) > -1, sel);
    assert.ok(!/var\(--(bg|panel|hover)\)/.test(regel), sel + ' traegt Deckkraft');
  }
});
test('Chat: harte Kanten an Tafeln, Feldern und Nachrichten', () => {
  const block = chatCss.slice(chatCss.indexOf('/* --- Cozy: harte Kanten'));
  assert.ok(block.length > 50);
  for (const sel of ['#settings-pop', '.opt-reiter button', '#opt-diag-open', '.opt-fx-test button', '#emote-panel', '#rewards-panel', '#ac-bar', '.msg', '#new-msgs', '#user-card', '#emote-tip']) {
    assert.ok(block.includes(sel), sel);
  }
  assert.ok(/border-radius:\s*0/.test(block));
});
```

- [ ] **Step 2: Fehlschlag sehen** — `node --test test/cozy-raum.test.js` → FAIL in den fünf neuen Tests.
- [ ] **Step 3: `index.html` umbauen** — `#onair-bar` in das neue `#szene` verschieben, `.oa-line` entfernen, `<span class="lampe rot"></span>` vor `#oa-label`; Klassen an `#head`, `#chat-feld`, ⚙ und Fensterknöpfe; `<script src="../lib/szene.js">` vor `chat.js`.
- [ ] **Step 4: `chat.css` umbauen**
  - `#head`: eigener Hintergrund und Rahmenlinie entfallen (kommt aus der Klasse); `#title` in `var(--schrift-pixel)`.
  - `#szene`: `position: relative; flex-shrink: 0; height: var(--szene-h, 72px); overflow: hidden;` Tapete als Grund, Streifen als zweites Hintergrundbild mittig, `background-size` aus `--szene-f`, `image-rendering: pixelated`.
  - Schild `#onair-bar`: `position: absolute; left: 8px; top: 8px;` Fläche `var(--panel-fest)`, 2 px Rand `var(--line)`, Lampe + Text in Pixel-Schrift; ohne `body.onair` unsichtbar (`visibility: hidden`), mit sichtbar. `#oa-label` in `var(--accent-title)`, ohne Verlauf.
  - `#composer`, `#footer`: `background: var(--panel-fest)`.
  - `#chat-feld`: Rundung, Fläche und Rahmenlinie entfallen (Klasse); Fokus als `outline: 2px solid var(--accent)`.
  - `body`: das weiche `box-shadow`-Leuchten entfällt. `#settings-pop`: harter Schatten `4px 4px 0 rgba(0,0,0,.5)` statt weichem.
  - Vorhersage-Karte: die drei Verläufe (`.vk-tau-seg`, `.vk-tau-seg.rechts`, `.vk-glanz`) werden flach (`var(--vk-farbe)` bzw. `.vk-glanz { display: none; }`).
  - Neuer Schlussblock `/* --- Cozy: harte Kanten --- */` mit `border-radius: 0` für die Selektoren aus dem Test, dazu `.msg.ereignis`, `#ep-suche`, `#win-controls button`, `.ac-item`, `.reward`.
- [ ] **Step 5: `chat.js`** — Funktion `setzeSzene()`: `Szene.masse(window.innerWidth, window.innerHeight)` → `--szene-f`, `--szene-h` auf `#szene`; Aufruf beim Start und in einem `resize`-Listener. Sonst nichts.
- [ ] **Step 6: Prüfen** — `npm test` → 0 Fehler; `node --check renderer/chat/chat.js`.
- [ ] **Step 7: Commit** — `git add renderer/chat test/cozy-raum.test.js`, Nachricht `feat: Chat mit Szenen-Streifen, LIVE-Schild, Pixel-Rahmen und harten Kanten`.

---

### Task 4: Video-Fenster mit TV-Gehäuse-Leiste

**Files:**
- Modify: `renderer/video/index.html` (Elemente der Leiste und der `<style>`-Block)
- Modify: `test/cozy-raum.test.js`

**Interfaces:**
- Consumes: Klassen aus Task 1.

Aufbau (Claudes Vorschlag): `#bar` als `.rahmen-leiste-video` (Lautsprecher links, dank gespiegeltem Bild). Links ☰ als `.pixel-knopf`, daneben grüne Lampe + „Ads blocked“. Mitte `#stream-info`: bei Live eine rote Lampe vor dem Profilbild, Kanalname in Pixel-Schrift. Rechts Status, ◫, ⛶ und Fensterknöpfe als `.pixel-knopf`. Die alte 2-px-On-Air-Linie über der Leiste entfällt (`#onair-bar` im Video unsichtbar; `#oa-label` bleibt im DOM für `video.js`). Der leere Player (`#hint` sichtbar) zeigt die Tapete.

- [ ] **Step 1: Statischen Test ergänzen**

```js
const videoHtml = lies('renderer/video/index.html');
test('Video: Leiste ist das TV-Gehaeuse, Knoepfe sind Pixel-Knoepfe', () => {
  assert.ok(/id="bar" class="[^"]*rahmen-leiste-video/.test(videoHtml));
  for (const id of ['home-btn', 'vollbild-btn', 'video-only-btn', 'win-min', 'win-max', 'win-close']) {
    assert.ok(new RegExp('id="' + id + '" class="[^"]*pixel-knopf').test(videoHtml), id);
  }
});
test('Video: Lampen fuer Ads blocked (gruen) und Live (rot)', () => {
  const ads = videoHtml.slice(videoHtml.indexOf('id="ads-indicator"'), videoHtml.indexOf('</span></span>', videoHtml.indexOf('id="ads-indicator"')));
  assert.ok(ads.includes('lampe gruen'));
  assert.ok(/id="si-lampe" class="lampe rot"/.test(videoHtml));
  assert.ok(/#stream-info\.live #si-lampe/.test(videoHtml));
});
test('Video: keine On-Air-Linie mehr, Nur-Video blendet die Leiste weiter aus', () => {
  assert.ok(!videoHtml.includes('class="oa-line"'));
  assert.ok(videoHtml.includes('id="oa-label"'));
  assert.ok(/body\.video-only #bar\s*\{[^}]*display:\s*none/.test(videoHtml));
  const stil = videoHtml.slice(videoHtml.indexOf('<style>'), videoHtml.indexOf('</style>'));
  assert.ok(!/#onair-bar[^{]*\{[^}]*gradient/.test(stil) && !/#oa-label\s*\{[^}]*gradient/.test(stil));
});
test('Video: leerer Player zeigt die Tapete', () => {
  assert.ok(/id="player" class="[^"]*tapete/.test(videoHtml));
});
```

Vor Step 3 prüfen, wie `body.video-only` die Leiste heute ausblendet (Selektor im `<style>`); weicht er vom Test ab, den Test an den vorhandenen Selektor anpassen, nicht das Verhalten.

- [ ] **Step 2: Fehlschlag sehen** — `node --test test/cozy-raum.test.js` → FAIL in den vier neuen Tests.
- [ ] **Step 3: Umbauen** — Klassen setzen; `<span class="lampe gruen"></span>` als erstes Kind von `#ads-indicator`; `<span id="si-lampe" class="lampe rot"></span>` als erstes Kind von `#stream-info`, sichtbar nur mit `#stream-info.live`; `.oa-line` entfernen; im `<style>`: eigener Hintergrund/Rahmenlinie von `#bar` entfallen, `#onair-bar { display: none; }`, Verlaufs-Regeln zu `#onair-bar`/`#oa-label` entfernen, `#si-oben` und `#status` in `var(--schrift-pixel)`, Rundungen an `#stream-info`, `#update-chip`, den Leisten-Knöpfen auf 0; `#player` bekommt die Klasse `tapete` (der Player-iframe deckt sie, sobald ein Stream läuft; `background: #000` an `#player` entfällt).
- [ ] **Step 4: Prüfen** — `npm test` → 0 Fehler.
- [ ] **Step 5: `docs/TODO.md`** — im Abschnitt „Cozy-Raum“ die Zeile zu 1b auf „eingebaut, wartet auf Janis' Urteil“ ändern und die Festlegungen dieses Plans in drei Stichpunkten nennen.
- [ ] **Step 6: Commit** — `git add renderer/video/index.html test/cozy-raum.test.js docs/TODO.md docs/superpowers/plans/2026-11-10-cozy-raum-etappe-1b.md`, Nachricht `feat: Video-Leiste als TV-Gehaeuse mit Lampen und Pixel-Knoepfen`.

---

## Abnahme Etappe 1b

- `npm test` grün; Testzahl vorher/nachher im Bericht.
- Janis schaut an und sagt, was nicht gefällt: Streifen-Größe, Schild, Leisten, Feld, Knöpfe, Lampen, Schrift, Tapete.
