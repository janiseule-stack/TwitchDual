# Cozy-Raum Etappe 1a (Abriss + feste Farben) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Alle alten Themes samt Bedienung entfernen und beide Fenster auf eine feste Farbpalette aus dem Raum-Bild stellen, ohne dass eine heutige Funktion verloren geht.

**Architecture:** Der Variablen-Vertrag der Stylesheets (`--accent`, `--bg`, `--panel` …) bleibt, nur die Quelle wechselt: statt der Theme-Runtime setzt eine feste Datei `renderer/themes/cozy/farben.css` die Werte. Die gespeicherten Einstellungen schrumpfen auf `{ chatAlpha, animationen }`, gesäubert in `renderer/lib/theme.js`. Danach werden Runtime, Engine, Katalog und die fünf Theme-Ordner gelöscht.

**Tech Stack:** Electron (Hauptprozess `main.js`, sandboxed `preload.js`), Renderer als einfache `<script>`-Dateien im UMD-Stil, Tests mit `node --test` (`npm test`).

**Spec:** `docs/superpowers/specs/2026-11-10-cozy-raum-design.md` (Etappe 1, dort Nachtrag „Etappe 1 geteilt“).

**Nicht in diesem Plan (Etappe 1b, eigener Plan, braucht Bilder und Janis' Wahl):** Szenen-Streifen im Chat, Leisten als Pixel-Bilder, TV-Gehäuse-Leiste im Video, Pixel-Schrift, harte Kanten statt runder Ecken, Entfernen der Verläufe in `chat.css`.

## Global Constraints

- **Alle Zeilennummern in diesem Plan sind der Stand vor Task 1** (Commit `00f182d`). Sie verschieben sich mit jedem Task. Maßgeblich sind immer die genannten Namen (IDs, Selektoren, Funktionen); die Nummern helfen nur beim Finden.
- Der Nachtrag im Entwurf (Teilung in 1a/1b, Kiste fest „pixel“, „Ausprobieren“ bleibt, Deckkraft zeigt weiter den Desktop) ist ein Vorschlag. Vor Task 1 braucht es Janis' Ja dazu.
- Zwischen Task 1 und Task 4 ist die App nicht zum Anschauen gedacht (die alte Galerie sendet ins Leere). Alte Theme-Einstellungen im Store gehen ab dem ersten Speichern nach Task 1 verloren; das ist gewollt.
- Der Schalter „Animationen“ wirkt in 1a nur auf die Home-Bühne; im Chat liest ihn noch keine Regel (kommt mit Etappe 3). Gewollt.
- Die Ausnahme zur `preload.js`-Regel unten: der Kommentar in Zeile 170 darf angepasst werden.
- Branch `feat/cozy-raum`. Kein Merge, kein Release, kein Versions-Bump.
- `npm test` ist nach jedem Task grün. Ausgangsstand (gemessen 10.11.2026): 693 Tests, 0 Fehler.
- Dateien nur mit den Werkzeugen Write/Edit anlegen und ändern, nie per Shell-Heredoc (auch keine leeren oder temporären Dateien). Die Shell nur für `git`, `npm test` und `git rm`.
- Keine Zugangsdaten in Code, Tests, Commits.
- `preload.js` ist sandboxed: kein `require` eigener Dateien, kein `fs`.
- Der Eingriff in `preload.js` „Player gilt nie als verdeckt“ (`isVisible`, Zeilen 153–166) bleibt unverändert; `test/player-verdeckt.test.js` bleibt.
- `renderer/lib/chat-ereignisse.js`, `renderer/lib/kiste.js` und ihre Tests bleiben unverändert.
- Home bleibt die CD-Bühne aus `feat/home-cd`. An `renderer/video/home.css` und `home-buehne-dom.js` wird nur geändert, was dieser Plan nennt (Verläufe und CD-Optik bleiben bis Etappe 2).
- IPC-Kanäle `save-theme-prefs`, `preview-theme-prefs`, `theme-changed` und der Store-Schlüssel `themePrefs` behalten ihre Namen.
- Die App nicht selbst zum Anschauen starten, keine Screenshots: Anschauen macht Janis.
- Commit-Nachrichten enden mit `Co-Authored-By: Claude Fable 5.2 <noreply@anthropic.com>`.

## Feste Werte (gelten in allen Tasks)

Farben gemessen aus `renderer/themes/cozy/raum.png` (38 Farben), außer `--text` (Creme, nicht im Bild, für Lesbarkeit gewählt):

| Variable | Wert |
|---|---|
| `--chat-alpha` | `1` |
| `--accent` | `#f9a650` |
| `--accent-title` | `#fdc173` |
| `--accent-border` | `rgba(249, 166, 80, .4)` |
| `--accent-glow` | `rgba(249, 166, 80, .2)` |
| `--accent-dim` | `rgba(249, 166, 80, .3)` |
| `--accent-contrast` | `#120505` |
| `--bg` | `rgb(18 5 5 / var(--chat-alpha))` |
| `--panel` | `rgb(46 22 18 / var(--chat-alpha))` |
| `--hover` | `rgb(70 32 25 / var(--chat-alpha))` |
| `--line` | `#552719` |
| `--text` | `#f4e4c9` |
| `--muted` | `#cc915a` |
| `--ts` | `#915a35` |
| `--onair-from` | `#f9a650` |
| `--onair-to` | `#de732a` |
| `--mono` | `"Cascadia Code", Consolas, monospace` |

## Review Focus

1. Alter Store-Inhalt (`theme: 'koi'`, `anpassungen`, `saat`, `gastHaeufigkeit`, `videoAccent`): App startet, alte Felder verschwinden still. → Task 1, Test „alte Felder“.
2. Wer `effekte: 'aus'` gespeichert hatte, hat danach Animationen aus (nicht plötzlich an). → Task 1, Test „Umzug effekte“.
3. Teil-Update beim Ziehen des Deckkraft-Reglers (`{ chatAlpha: 60 }`) setzt `animationen` nicht zurück, und umgekehrt. → Task 1, Test „mergeThemePrefs“.
4. Gespeicherte Deckkraft unter 100 % wirkt weiter (Desktop scheint durch), obwohl die Runtime weg ist. → Task 2, Test „Flächen tragen --chat-alpha“.
5. `chatPrefs.kisteStil: 'geschenk'` aus altem Store: Kiste erscheint trotzdem, im Stil `pixel`. → Task 3, Schritt 4 und statischer Test.

---

### Task 1: Feste Werte und neue Einstellungen in ThemeLib, main.js stellt um

**Files:**
- Modify: `renderer/lib/theme.js` (nur ergänzen, nichts entfernen)
- Modify: `main.js:22-23`, `main.js:41`, `main.js:473-476`, `main.js:527-533`
- Modify: `test/theme.test.js` (Tests ergänzen), `test/balken-farbe.test.js`

**Interfaces:**
- Produces (in `ThemeLib`, zusätzlich zu allem Bestehenden):
  - `STANDARD_PREFS = { chatAlpha: 100, animationen: true }` (eingefroren; `main.js:41` benutzt es als Store-Standard)
  - `AKZENT = '#f9a650'`, `BALKEN = '#120505'`
  - `SICHERE_FARBE = /^(#[0-9a-f]{3,8}|rgba?\([\d\s.,%]+\))$/i` (zeichengleich mit `preload.js:172`)
  - `cleanThemePrefs(roh: any) -> { chatAlpha: number, animationen: boolean }`
  - `mergeThemePrefs(gespeichert: any, update: any) -> { chatAlpha: number, animationen: boolean }`

- [ ] **Step 1: Tests schreiben** (ans Ende von `test/theme.test.js`; die Datei bindet die Lib bereits ein, den dort benutzten Variablennamen übernehmen)

```js
test('cleanThemePrefs: leer/Muell -> Standard', () => {
  for (const roh of [null, undefined, 'x', 7, [], {}]) {
    assert.deepStrictEqual(T.cleanThemePrefs(roh), { chatAlpha: 100, animationen: true });
  }
});
test('cleanThemePrefs: alte Felder verschwinden, chatAlpha bleibt', () => {
  const alt = { videoAccent: '#35e0ff', chatAccent: '#ff4fa3', chatAlpha: 60, theme: 'koi', effekte: 'normal',
    anpassungen: { 'koi:tusche': { akzent: '#112233' } }, variante: { koi: 'tusche' }, saat: { koi: 5 },
    gastHaeufigkeit: 'oft', gastAnzahl: 'schwarm' };
  assert.deepStrictEqual(T.cleanThemePrefs(alt), { chatAlpha: 60, animationen: true });
});
test('cleanThemePrefs: Umzug effekte aus -> animationen false', () => {
  assert.strictEqual(T.cleanThemePrefs({ effekte: 'aus' }).animationen, false);
  assert.strictEqual(T.cleanThemePrefs({ effekte: 'wenig' }).animationen, true);
  // ein echtes animationen-Feld schlaegt das alte effekte-Feld
  assert.strictEqual(T.cleanThemePrefs({ effekte: 'aus', animationen: true }).animationen, true);
  // nur echte Booleans zaehlen
  assert.strictEqual(T.cleanThemePrefs({ animationen: 'aus' }).animationen, true);
  assert.strictEqual(T.cleanThemePrefs({ animationen: false }).animationen, false);
});
test('cleanThemePrefs: kaputte Deckkraft -> 100', () => {
  assert.strictEqual(T.cleanThemePrefs({ chatAlpha: 'viel' }).chatAlpha, 100);
  assert.strictEqual(T.cleanThemePrefs({ chatAlpha: -5 }).chatAlpha, 0);
});
test('mergeThemePrefs: Teil-Update laesst das andere Feld stehen', () => {
  const g = { chatAlpha: 60, animationen: false };
  assert.deepStrictEqual(T.mergeThemePrefs(g, { chatAlpha: 80 }), { chatAlpha: 80, animationen: false });
  assert.deepStrictEqual(T.mergeThemePrefs(g, { animationen: true }), { chatAlpha: 60, animationen: true });
  assert.deepStrictEqual(T.mergeThemePrefs(g, null), g);
  assert.deepStrictEqual(T.mergeThemePrefs(null, null), { chatAlpha: 100, animationen: true });
});
test('mergeThemePrefs: alter Store mit effekte aus + Update ohne animationen bleibt aus', () => {
  assert.strictEqual(T.mergeThemePrefs({ effekte: 'aus', chatAlpha: 100 }, { chatAlpha: 90 }).animationen, false);
});
test('feste Werte: Akzent, Balken, Farbfilter', () => {
  assert.strictEqual(T.AKZENT, '#f9a650');
  assert.strictEqual(T.BALKEN, '#120505');
  assert.ok(T.SICHERE_FARBE.test(T.BALKEN));
  assert.ok(!T.SICHERE_FARBE.test('red; } body { display: none'));
});
```

In `test/balken-farbe.test.js` die Quelle tauschen: `require('../renderer/lib/theme')` statt `'../renderer/lib/themes'`; die Zusicherungen bleiben.

- [ ] **Step 2: Tests laufen lassen, Fehlschlag sehen**

Run: `npm test`
Expected: FAIL in den neuen Tests („T.cleanThemePrefs is not a function“) und in `balken-farbe`.

- [ ] **Step 3: `renderer/lib/theme.js` ergänzen**

Die fünf Namen aus „Produces“ in der Factory anlegen und im `return` mit ausgeben. `cleanThemePrefs` nutzt das vorhandene `clampAlpha`. `mergeThemePrefs` säubert zuerst `gespeichert` (damit der Umzug `effekte: 'aus'` greift), legt dann nur die im Update vorhandenen Felder `chatAlpha`/`animationen` darüber und säubert erneut. Bestehende Exporte bleiben alle erhalten (sie fallen in Task 5).

- [ ] **Step 4: `main.js` umstellen**

- `require('./renderer/lib/themes')` (Zeile 23) entfernen.
- Store-Standard Zeile 41: `themePrefs: { ...ThemeLib.STANDARD_PREFS }`.
- `cleanThemePrefs` (473–476) ruft `ThemeLib.cleanThemePrefs`; den Kommentar darüber auf `renderer/lib/theme.js` ändern. In `test/balken-farbe.test.js:10` den Testnamen auf „wie theme.js“ ändern.
- `save-theme-prefs` und `preview-theme-prefs` (527–533) rufen `ThemeLib.mergeThemePrefs`.

- [ ] **Step 5: Prüfen**

Run: `npm test`
Expected: 0 Fehler. Run: `git grep -n "ThemeKatalog" main.js` → keine Treffer.

- [ ] **Step 6: Commit**

```bash
git add renderer/lib/theme.js main.js test/theme.test.js test/balken-farbe.test.js
git commit -m "feat: feste Raum-Werte und geschrumpfte Einstellungen in ThemeLib"
```

---

### Task 2: Feste Farbdatei

**Files:**
- Create: `renderer/themes/cozy/farben.css`
- Create: `test/cozy-farben.test.js`
- Modify: `renderer/chat/index.html:6` (Link davor einfügen), `renderer/chat/chat.css:4-20` (`:root`-Block entfernen)
- Modify: `renderer/video/index.html:6` (Link davor einfügen), `renderer/video/index.html:8-25` (`:root`-Block entfernen)

**Interfaces:**
- Produces: `renderer/themes/cozy/farben.css` mit genau einem `:root`-Block, der alle 17 Variablen aus „Feste Werte“ setzt. Eingebunden mit `<link rel="stylesheet" href="../themes/cozy/farben.css" />` als erstes Stylesheet in beiden Fenstern.

- [ ] **Step 1: Test schreiben** (`test/cozy-farben.test.js`)

Dateikopf: `test`, `assert`, `fs`, `path`; `const wurzel = path.join(__dirname, '..')`; `const lies = (p) => fs.readFileSync(path.join(wurzel, p), 'utf8')`; `const T = require('../renderer/lib/theme')`; `const css = lies('renderer/themes/cozy/farben.css')`; `vars` entsteht aus allen Treffern von `/(--[a-z-]+)\s*:\s*([^;]+);/g` in `css` (Name → getrimmter Wert), `anzahl` zählt die Treffer je Name. Derselbe Kopf (`wurzel`, `lies`) gilt für `test/cozy-abriss.test.js`. Der Test prüft:

```js
const VERTRAG = ['--chat-alpha', '--accent', '--accent-title', '--accent-border', '--accent-glow', '--accent-dim',
  '--accent-contrast', '--bg', '--panel', '--hover', '--line', '--text', '--muted', '--ts',
  '--onair-from', '--onair-to', '--mono'];

test('farben.css setzt jede Variable des Vertrags genau einmal', () => {
  for (const k of VERTRAG) assert.strictEqual(anzahl[k], 1, k);
  assert.strictEqual((css.match(/:root/g) || []).length, 1);
});
test('Flaechen tragen --chat-alpha, Schrift und Akzent nicht', () => {
  for (const k of ['--bg', '--panel', '--hover']) assert.ok(vars[k].includes('var(--chat-alpha)'));
  for (const k of ['--text', '--muted', '--accent', '--line']) assert.ok(!vars[k].includes('--chat-alpha'));
});
test('--accent entspricht ThemeLib.AKZENT, --bg entspricht ThemeLib.BALKEN', () => {
  assert.strictEqual(vars['--accent'], T.AKZENT);
  assert.strictEqual(rgbZuHex(vars['--bg']), T.BALKEN);   // rgb(18 5 5 / …) -> #120505
});
test('Lesbarkeit: Kontrast gegen den Grund', () => {
  assert.ok(kontrast(vars['--text'], '#120505') >= 10);
  assert.ok(kontrast(vars['--muted'], '#120505') >= 4.5);
  assert.ok(kontrast(vars['--ts'], '#120505') >= 3);
  assert.ok(kontrast(vars['--accent-contrast'], vars['--accent']) >= 7);
});
test('beide Fenster binden farben.css vor ihrem eigenen Stylesheet ein und haben keinen eigenen :root-Farbblock', () => {
  for (const [datei, eigenes] of [['renderer/chat/index.html', 'href="chat.css"'], ['renderer/video/index.html', 'href="home.css"']]) {
    const html = lies(datei);
    const i = html.indexOf('../themes/cozy/farben.css');
    assert.ok(i > -1 && i < html.indexOf(eigenes), datei);
  }
  for (const datei of ['renderer/chat/chat.css', 'renderer/video/index.html']) {
    assert.ok(!/--(accent|bg)\s*:/.test(lies(datei)), datei);
  }
});
```

`kontrast(a, b)` ist das WCAG-Verhältnis (relative Leuchtdichte, `(hell + 0.05) / (dunkel + 0.05)`), `rgbZuHex` wandelt `rgb(r g b / …)`; beide als kleine Helfer in der Testdatei.

- [ ] **Step 2: Test laufen lassen, Fehlschlag sehen**

Run: `node --test test/cozy-farben.test.js`
Expected: FAIL (Datei fehlt).

- [ ] **Step 3: `farben.css` anlegen, in beide Fenster einbinden, alte `:root`-Blöcke entfernen**

Werte exakt aus der Tabelle „Feste Werte“. In `renderer/video/index.html` bleibt der Rest des `<style>`-Blocks unverändert.

- [ ] **Step 4: Prüfen**

Run: `npm test`
Expected: 0 Fehler.

Hinweis: Solange die Runtime noch läuft (bis Task 3/4), überschreibt sie die Akzent- und Flächenwerte inline. Sichtbar wird die Palette erst nach Task 3 und 4.

- [ ] **Step 5: Commit**

```bash
git add renderer/themes/cozy/farben.css test/cozy-farben.test.js renderer/chat/index.html renderer/chat/chat.css renderer/video/index.html
git commit -m "feat: feste Farbpalette aus dem Raum-Bild fuer beide Fenster"
```

---

### Task 3: Chat-Fenster ohne Theme-Runtime, Einstellungen gekürzt

**Files:**
- Modify: `renderer/chat/index.html` (Zeilen 9–12, 20–21, 29–146, 219–224)
- Modify: `renderer/chat/chat.js` (Zeilen 158–171, 680–717, 793–1060, 1522, 1591–1596, 1604–1612, 1616–1626, 1787–1792)
- Modify: `renderer/chat/chat.css` (tote Regeln)
- Create: `test/cozy-abriss.test.js`

**Interfaces:**
- Consumes: `ThemeLib.cleanThemePrefs`, `ThemeLib.clampAlpha`, `ThemeLib.AKZENT` (Task 1); `window.twitchDual.saveThemePrefs / previewThemePrefs / onThemeChanged / getUiPrefs / fxTest / onFxTest` (unverändert).
- Produces: im Chat `<html data-animationen="an|aus">` und `--chat-alpha` als Inline-Variable (0…1) auf `documentElement`.

- [ ] **Step 1: Statischen Test schreiben** (`test/cozy-abriss.test.js`)

```js
const chatHtml = lies('renderer/chat/index.html');
const chatJs = lies('renderer/chat/chat.js');

test('Chat: Bedienung der alten Themes ist weg', () => {
  for (const id of ['theme-galerie', 'theme-btn', 'welt-wuerfel', 'galerie-liste', 'opt-presets', 'opt-color-video',
    'opt-color-chat', 'opt-color-reset', 'opt-tf-akzent', 'opt-kiste', 'opt-gast-oft', 'opt-gast-viele', 'opt-effekte',
    'fx-hinten', 'fx-vorn', 'theme-deko']) {
    assert.ok(!chatHtml.includes('id="' + id + '"'), id);
  }
  assert.ok(!chatHtml.includes('data-art="gast"'));
});
test('Chat: gebliebene Einstellungen sind da', () => {
  for (const id of ['opt-ts', 'opt-badges', 'opt-font', 'opt-diag', 'opt-diag-open', 'opt-alpha-chat', 'opt-animationen', 'opt-fx-test']) {
    assert.ok(chatHtml.includes('id="' + id + '"'), id);
  }
});
test('Chat: laedt keine Theme-Bausteine mehr', () => {
  for (const s of ['lib/themes.js', 'lib/fx-engine.js', 'lib/theme-runtime.js']) assert.ok(!chatHtml.includes(s), s);
  for (const s of ['lib/theme.js', 'lib/kiste.js', 'lib/chat-ereignisse.js']) assert.ok(chatHtml.includes(s), s);
  for (const wort of ['ThemeRuntime', 'ThemeKatalog', 'FxEngine', 'themeRuntime', 'kisteStil', 'PRESETS', 'ereignisFilter', 'punkteUrsprung']) {
    assert.ok(!chatJs.includes(wort), wort);
  }
});
```

- [ ] **Step 2: Test laufen lassen, Fehlschlag sehen**

Run: `node --test test/cozy-abriss.test.js`
Expected: FAIL.

- [ ] **Step 3: `renderer/chat/index.html` umbauen**

- Entfernen: `#fx-hinten`, `#fx-vorn`, `#theme-deko` (9–12), `#welt-wuerfel`, `#theme-btn` (20–21), das ganze `#theme-galerie` (58–146), die Script-Zeilen für `themes.js`, `fx-engine.js`, `theme-runtime.js`.
- `#settings-btn` rückt an den Platz rechts: in `chat.css` die Zeilen 194–197 durch die eine Regel `#settings-btn { margin-left: auto; }` ersetzen (Zeile 197 setzt heute `margin-left: 8px` und würde sonst gewinnen); in den Sammelregeln 187 und 198 `#welt-wuerfel, #theme-btn,` streichen.
- ⚙-Reiter „Chat“ (`data-seite="chat"`), nach der Schriftgröße eine zweite `opt-group`: die Zeile Chat-Deckkraft unverändert übernommen (`#opt-alpha-chat`, `#opt-alpha-chat-val`, Text „weniger = Desktop scheint durch“) und darunter
  `<label class="opt-check"><input type="checkbox" id="opt-animationen" checked /><span class="opt-text">Animationen<small>Bewegung im Hintergrund</small></span></label>`.
- ⚙-Reiter „Mehr“ (`data-seite="mehr"`), nach Diagnose eine `opt-group` „Ausprobieren“ mit `#opt-fx-test` und den vier Knöpfen `kiste`, `punkte`, `raid`, `abo` (Text und Symbole wie bisher, ohne `gast`), Hinweis: „Spielt das Ereignis mit Beispieldaten ab.“

- [ ] **Step 4: `renderer/chat/chat.js` umbauen**

- `chatPrefs`-Standard (680): `kisteStil` entfällt. `$optKiste` samt Schleife (681, 693–705) entfällt. `zeigeZuwachs` ruft `KistenFx.spieleKiste({ doc: document, wirt: $wrap, stil: 'pixel' })`.
- Abschnitt 793–1060 ersetzen durch: die drei Element-Konstanten `$alphaChat` (`#opt-alpha-chat`), `$alphaChatVal` (`#opt-alpha-chat-val`), `$optAnimationen` (`#opt-animationen`), dann `let themePrefs = ThemeLib.cleanThemePrefs(null);` und

```js
function applyTheme(prefs) {
  themePrefs = ThemeLib.cleanThemePrefs(prefs);
  const r = document.documentElement;
  r.style.setProperty('--chat-alpha', String(themePrefs.chatAlpha / 100));
  r.dataset.animationen = themePrefs.animationen ? 'an' : 'aus';
  $alphaChat.value = themePrefs.chatAlpha;
  $alphaChatVal.textContent = themePrefs.chatAlpha + '%';
  $optAnimationen.checked = themePrefs.animationen;
}
```

  dazu: Laden über `getUiPrefs()` und `onThemeChanged(applyTheme)` wie bisher (863–866); Deckkraft-Regler `input` → `previewThemePrefs({ chatAlpha })` plus Prozentanzeige, `change` → `saveThemePrefs({ chatAlpha })`; `#opt-animationen` `change` → `saveThemePrefs({ animationen: checked })`. `reiterLeiste` und `optReiter` (719–739) bleiben; `schliesseGalerie()` im Klick auf ⚙ (715) entfällt.
- `updateOnAir` (ab 1062) bleibt unverändert.
- `zeigeChatEreignis` (158–171): `ereignisFilter` (160) und alles mit `fx` (164–170) entfallen. Die Funktion besteht danach nur noch aus:

```js
function zeigeChatEreignis(ev) {
  if (!ev) return;
  appendEreignis(ChatEreignisse.zeile(ev), ev.nachricht);
  window.twitchDual.diag('chat', 'ereignis', { art: ev.art, effekt: false });
}
```

  (Den Diagnose-Aufruf so schreiben, wie er heute in Zeile 171 steht, nur mit `effekt: false`.)
- `setzePunkteSymbol` (1522): `const akzent = ThemeLib.AKZENT;`. Der Aufruf aus `applyTheme` (alte Zeile 859) entfällt.
- `zeigeZuwachs` (1616–1626): der Aufruf `themeRuntime.ereignis` entfällt; `let $kiste` entfällt (der Rückgabewert von `spieleKiste` wird nicht mehr gebraucht).
- `effekt` der Ereignis-Karten (1788–1792): `effekt: (s) => { if (s.art === 'tipp-gewonnen') zeigeZuwachs({ quelle: 'kiste', betrag: s.betrag }); }`.
- `punkteUrsprung` (1598–1604) hat danach keinen Aufrufer mehr: löschen.
- Die Schleife über `#opt-fx-test button` (1594–1596) und `onFxTest` (1605–1612) bleiben unverändert; im Kommentar 1591–1593 den Satz zum Gast streichen.

- [ ] **Step 5: `renderer/chat/chat.css` aufräumen**

Vorsicht an zwei Stellen: Im Block „Effekt-Ebenen“ (519–526) entfallen nur 519–525; Zeile 526 (`#head, #messages, #composer, #footer { position: relative; z-index: 1; }`) bleibt. In der Sammelregel 597 nur `.galerie-kopf` streichen, `#title, .opt-group-title` bleiben. Kommentare über entfernten Regeln mit entfernen (auch 396).

Regeln entfernen, deren Ziel es nicht mehr gibt: `#welt-wuerfel…`, `#theme-btn…`, `.opt-presets*`, `.preset-chip*`, `.opt-color-row…`, `#opt-color-reset`, `#opt-tf-reset` (in den Sammelregeln 401/406 bleibt `#opt-diag-open`), `.fx-ebene`, `#theme-galerie*`, `.galerie-*`, `.theme-deko`, `:root[data-hell="1"] …`, `#opt-neon-farben*`, `.opt-segment*`, `.opt-stapel*` (kein Skript nutzt die beiden letzten, geprüft 10.11.2026), dazu `#fx-hinten`/`#fx-vorn` (524–525), `#theme-reiter`/`#theme-seiten` (558–560), `#opt-theme-farben` (601–602) und der Kommentar 396.

Fest eingetragene kalte Farben, die mit der Palette brechen oder unlesbar werden, auf Variablen stellen (nur diese Stellen, sonst keine Optik-Änderung):
- `chat.css:92` und `:377` (weiße Schrift auf `--accent`, auf Bernstein nur etwa 2:1): `color: var(--accent-contrast)`; `chat.css:750` (`#0b0b11` auf Akzent) ebenso.
- `chat.css:479`, `:483`, `:508` (Emote-Auswahl, ihr Suchfeld, Vorschlagsleiste, fest `#14141c`): `var(--panel)` für die Fläche, `var(--hover)` für das Suchfeld. In den Sammelregeln 217–218 den Teil `#theme-galerie …` streichen. Die `kfx-*`-Regeln, `.opt-fx-test`, `.opt-hinweis`, `.opt-alpha-*` bleiben.

- [ ] **Step 6: Prüfen**

Run: `npm test`
Expected: 0 Fehler.
Run: `git grep -n -E "theme-galerie|welt-wuerfel|galerie-|preset-chip|data-hell" -- renderer/chat` → keine Treffer.

- [ ] **Step 7: Commit**

```bash
git add renderer/chat test/cozy-abriss.test.js
git commit -m "feat: Chat ohne Theme-Runtime, Einstellungen gekuerzt, feste Farben"
```

---

### Task 4: Video-Fenster ohne Theme-Runtime

**Files:**
- Modify: `renderer/video/index.html` (Zeilen 176–189, 215–216, 255–256, 307–309)
- Modify: `renderer/video/video.js` (Zeilen 319–362, 395–413)
- Modify: `renderer/video/home.js:189`, `renderer/video/home.js:310`
- Modify: `renderer/video/home.css:174-179`
- Modify: `main.js:491`
- Modify: `test/cozy-abriss.test.js`

**Interfaces:**
- Consumes: `ThemeLib.cleanThemePrefs`, `ThemeLib.BALKEN`, `ThemeLib.AKZENT` (Task 1).
- Produces: im Video `<html data-animationen="an|aus">`; an jedes neue Player-iframe geht `{ source: 'twitchdual-theme', balken: ThemeLib.BALKEN }`.

- [ ] **Step 1: Statischen Test ergänzen**

```js
const videoHtml = lies('renderer/video/index.html');
const videoJs = lies('renderer/video/video.js');
test('Video: keine Theme-Ebenen und Theme-Bausteine mehr', () => {
  for (const s of ['id="fx-gast"', 'id="fx-hinten"', 'class="theme-deko"', 'lib/themes.js', 'lib/fx-engine.js', 'lib/theme-runtime.js']) {
    assert.ok(!videoHtml.includes(s), s);
  }
  assert.ok(videoHtml.includes('lib/theme.js'));
  for (const wort of ['ThemeRuntime', 'ThemeKatalog', 'themeRuntime', 'onFxTest', 'gastJetzt']) assert.ok(!videoJs.includes(wort), wort);
  assert.ok(videoJs.includes('ThemeLib.BALKEN'));
});
test('Home liest data-animationen statt data-effekte', () => {
  assert.ok(!lies('renderer/video/home.css').includes('data-effekte'));
  assert.ok(!lies('renderer/video/home.js').includes('dataset.effekte'));
});
test('Effekte testen kennt keinen Gast mehr', () => {
  assert.ok(!/FX_TEST_ARTEN = \[[^\]]*'gast'/.test(lies('main.js')));
});
```

- [ ] **Step 2: Test laufen lassen, Fehlschlag sehen**

Run: `node --test test/cozy-abriss.test.js`
Expected: FAIL in den drei neuen Tests.

- [ ] **Step 3: Umbauen**

- `renderer/video/index.html`: Elemente `#fx-gast`, `#fx-hinten`, `.theme-deko` entfernen. Im CSS-Bereich 176–189 bleiben genau drei Regeln: 185 als `#home > :not(#home-version):not(#home-namen) { position: relative; z-index: 1; }`, 186 (`#home > #home-namen`) und 188 (Schrift); es entfallen 176–184, 187, 189. Drei Script-Zeilen entfernen.
- `renderer/video/video.js`: `themeRuntime`, `const $homeFx`, `aktualisiereFxPause` samt beiden `MutationObserver`, `onFxTest`, `setzeGastBedingung` und der `onPointsUpdate`-Block für den Gast entfallen. `meldeNutzerEingabe` (332–338) liegt mitten im Bereich und bleibt (Aufrufer in Zeile 230).
- `main.js:109`: `backgroundColor: '#120505'` (Fenstergrund des Video-Fensters, gleicher Wert wie `ThemeLib.BALKEN`). `balkenFarbe` wird die Konstante `ThemeLib.BALKEN`; `sendeBalken()` und sein Aufruf beim neuen iframe (138) bleiben. Neues `applyTheme`:

```js
function applyTheme(prefs) {
  document.documentElement.dataset.animationen = ThemeLib.cleanThemePrefs(prefs).animationen ? 'an' : 'aus';
  sendeBalken();
}
```

- `renderer/video/home.js:189`: `dataset.animationen === 'aus'`. `home.js:310`: Rückfall `ThemeLib.AKZENT` statt `ThemeLib.DEFAULTS.videoAccent`.
- `renderer/video/home.css:174-179`: `:root[data-animationen="aus"]` statt `:root[data-effekte="aus"]`.
- `main.js:491`: `FX_TEST_ARTEN = ['kiste', 'punkte', 'raid', 'abo']`.

- [ ] **Step 4: Prüfen**

Run: `npm test`
Expected: 0 Fehler.

- [ ] **Step 5: Commit**

```bash
git add renderer/video main.js test/cozy-abriss.test.js
git commit -m "feat: Video-Fenster ohne Theme-Runtime, Balken in fester Raum-Farbe"
```

---

### Task 5: Alte Themes löschen, ThemeLib schrumpfen

**Files:**
- Delete: `renderer/themes/sakura/`, `renderer/themes/koi/`, `renderer/themes/wald/`, `renderer/themes/blasen/`, `renderer/themes/neon-dual/`
- Delete: `renderer/lib/themes.js`, `renderer/lib/theme-runtime.js`, `renderer/lib/fx-engine.js`
- Delete: `test/themes.test.js`, `test/theme-runtime.test.js`, `test/fx-engine.test.js`, `test/welten.test.js`
- Modify: `renderer/lib/theme.js`, `test/theme.test.js`, `test/cozy-abriss.test.js`
- Modify (nur Kommentare und toter Rest): `renderer/chat/chat.css`, `renderer/video/video.js`, `renderer/video/home.js`, `tools/ui-shots.js`, `preload.js:170`
- Modify: `docs/TODO.md`

**Interfaces:**
- Produces: `ThemeLib` exportiert danach genau: `STANDARD_PREFS, AKZENT, BALKEN, SICHERE_FARBE, normalizeHex, clampAlpha, onAirState, onAirLabel, cleanThemePrefs, mergeThemePrefs`.

- [ ] **Step 1: Test ergänzen** (`test/cozy-abriss.test.js`)

```js
test('alte Themes und ihre Bausteine sind geloescht', () => {
  for (const p of ['renderer/themes/sakura', 'renderer/themes/koi', 'renderer/themes/wald', 'renderer/themes/blasen',
    'renderer/themes/neon-dual', 'renderer/lib/themes.js', 'renderer/lib/theme-runtime.js', 'renderer/lib/fx-engine.js']) {
    assert.ok(!fs.existsSync(path.join(wurzel, p)), p);
  }
  assert.ok(fs.existsSync(path.join(wurzel, 'renderer/themes/cozy/raum.png')));
});
test('ThemeLib exportiert nur noch den Rest', () => {
  assert.deepStrictEqual(Object.keys(require('../renderer/lib/theme')).sort(),
    ['AKZENT', 'BALKEN', 'SICHERE_FARBE', 'STANDARD_PREFS', 'clampAlpha', 'cleanThemePrefs', 'mergeThemePrefs',
      'normalizeHex', 'onAirLabel', 'onAirState'].sort());
});
test('kein Quelltext nennt die alten Themes', () => {
  // Dateien: rekursiv alle .js/.css/.html unter renderer/ (fs.readdirSync mit { recursive: true }),
  // dazu main.js, preload.js und tools/*.js. Je Datei:
  // assert.ok(!/sakura|\bkoi\b|neon.dual|TwitchDualWelten|accentVars|flaechenVars/i.test(text), datei)
});
```

- [ ] **Step 2: Test laufen lassen, Fehlschlag sehen**

Run: `node --test test/cozy-abriss.test.js`
Expected: FAIL in den drei neuen Tests.

- [ ] **Step 3: Löschen und schrumpfen**

- Zuerst zählen, wie viele Tests wegfallen: `node --test test/themes.test.js test/theme-runtime.test.js test/fx-engine.test.js test/welten.test.js` (Zahl für den Abschlussbericht notieren).
- Ordner und Dateien mit `git rm -r` entfernen.
- `renderer/lib/theme.js`: `DEFAULTS`, `PRESETS`, `BG`, `HOVER`, `hexToRgb`, `rgbToHex`, `mixWhite`, `tintPanel`, `relLuminance`, `accentContrast`, `accentVars`, `activePreset`, `HELL_GRENZE`, `istHell`, `mische`, `flaechenVars` entfernen; Kopfkommentar anpassen.
- `test/theme.test.js`: die Tests zu `accentVars`, `accentContrast`, `PRESETS`, `activePreset`, `istHell`, `flaechenVars` entfernen. Es bleiben die Tests zu `normalizeHex` (2), `clampAlpha` (3), `onAirState` (1), `onAirLabel` (3) und die sieben aus Task 1.
- Der dritte Test trifft heute Kommentare in `renderer/chat/chat.css:1`, `:316`, `renderer/video/video.js:316`, `renderer/video/home.js:609`, `tools/ui-shots.js:17` (geprüft 10.11.2026). Diese Kommentare neu fassen, nicht den Test lockern.
- `renderer/video/home.js:605-618` (Riesen-Namen nach Theme-Wechsel neu bauen, `window.homeNamenNeu`) hat keinen Aufrufer mehr: die Funktion `namenSchluessel`, die Zuweisung `window.homeNamenNeu` und die Variable `namenTheme` (`home.js:41`, `:146`) entfernen. Der übrige Aufbau der Riesen-Namen bleibt.

- [ ] **Step 4: Prüfen**

Run: `npm test`
Expected: 0 Fehler. Die Testzahl im Abschlussbericht nennen, zusammen mit der in Schritt 3 notierten Zahl der weggefallenen Tests.
Run: `git grep -n -i -E "sakura|koi-teich|neon-dual|ThemeKatalog|ThemeRuntime|FxEngine" -- renderer main.js preload.js tools` → keine Treffer (dazu den Kommentar `preload.js:170` neu fassen: der Farbfilter ist jetzt die Kopie von `ThemeLib.SICHERE_FARBE`).

- [ ] **Step 5: `docs/TODO.md` ergänzen**

Oben ein Abschnitt „Cozy-Raum Etappe 1a (ungemergt, Branch feat/cozy-raum)“: alte Themes entfernt; feste Palette `renderer/themes/cozy/farben.css`; `themePrefs` = `{ chatAlpha, animationen }`; ⚙ enthält Deckkraft, Animationen, Ausprobieren; Kiste fest im Stil `pixel` (der Geschenk-Stil bleibt als ungenutzter Rest in `kiste.js` bis Etappe 3); Abo/Raid nur als Zeile; Vorhersage-Start und „Tipp verloren“ ohne Effekt bis Etappe 3; der Schalter „Animationen“ wirkt bis Etappe 3 nur auf die Home-Bühne; nächster Schritt Etappe 1b (Bilder + Optik-Runde).

- [ ] **Step 6: Commit**

```bash
git add -A renderer test tools preload.js docs/TODO.md
git commit -m "feat: alte Themes, Runtime und Effekt-Engine entfernt"
```

---

## Abnahme Etappe 1a

- `npm test` grün; Testzahl vorher/nachher im Bericht.
- Die drei statischen Tests in `test/cozy-abriss.test.js` und `test/cozy-farben.test.js` sind grün.
- Janis schaut an: beide Fenster in Raum-Farben, ⚙ mit Zeitstempel, Abzeichen, Schriftgröße, Deckkraft, Animationen, Diagnose, Ausprobieren; Home-Bühne benutzbar; Kiste, Abo-/Raid-Zeile erscheinen.
