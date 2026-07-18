# Glass-Transparenz + Akzent-Kontrast-Fix (v1.6.0) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ein Transparenz-Slider pro Fenster (Video/Chat) macht den Hintergrund
regelbar durchsichtig; dazu ein Bug-Fix, damit Akzent-Buttons bei jeder
Akzentfarbe (auch Schwarz) lesbar bleiben.

**Architecture:** Der sichtbare Fenstergrund kommt schon heute aus CSS-Variablen
(`--bg`, `--panel`, `--hover`), die `applyTheme()` pro Fenster aus
`ThemeLib.accentVars()` setzt. Wir erweitern `accentVars` so, dass diese
Flächen-Variablen als `rgba()` mit einem Alpha-Wert herauskommen, und erstellen
beide `BrowserWindow`s mit `transparent: true`. Der Kontrast-Fix ist eine neue
reine Funktion `accentContrast()`, die pro Fenster `--accent-contrast` setzt.

**Tech Stack:** Electron 33, reines JS/CSS, `node:test` (DOM-freie Unit-Tests),
UMD-Lib `renderer/lib/theme.js`.

## Global Constraints

- Node/Electron-Bordmittel, keine neuen Abhängigkeiten.
- `renderer/lib/theme.js` bleibt DOM-frei und UMD (läuft im Browser via
  `window.ThemeLib` und unter Node via `require`).
- Default-Deckkraft 100 % ⇒ Optik pixelidentisch zu v1.5.0.
- Alpha wird als ganze Prozent 0–100 gespeichert; kaputte/fehlende Werte → 100.
- Bestehende Tests (`npm test`, aktuell 106) bleiben grün.
- Preload ist sandboxed (kein `fs`), wird hier nicht angefasst.
- Deutsche UI-Texte, `ß`/Umlaute erlaubt in HTML/JS-Strings (nicht in
  Commit-Messages).

---

### Task 1: ThemeLib — clampAlpha + accentContrast + alphafähiges accentVars

**Files:**
- Modify: `renderer/lib/theme.js`
- Test: `test/theme.test.js`

**Interfaces:**
- Produces:
  - `clampAlpha(input) -> number` — ganze Prozent 0..100; Nicht-Zahl/NaN/fehlt
    → 100; unter 0 → 0; über 100 → 100; sonst `Math.round`.
  - `accentContrast(hex) -> '#041018' | '#f2f6ff'` — wählt den Textton mit dem
    höheren WCAG-Kontrastverhältnis zur (normalisierten) Akzentfarbe.
  - `accentVars(hex, alphaPct)` — `alphaPct` optional (Default 100). Zusätzlich
    zu den bisherigen Keys jetzt: `--bg`, `--hover` als `rgba(...)`, `--panel`
    als `rgba(...)` (statt Hex), plus `--accent-contrast`. `--accent`,
    `--accent-title`, `--accent-border`, `--accent-glow`, `--accent-dim`
    bleiben unverändert.

- [ ] **Step 1: Failing Tests schreiben**

In `test/theme.test.js` — die bestehende `accentVars`-Zusicherung für `--panel`
anpassen (jetzt rgba) und neue Blöcke anhängen. Ersetze in dem Test
`'accentVars: liefert alle Variablen mit korrekten Ableitungen'` die Zeile

```js
  assert.equal(v['--panel'], '#1c101b');
```

durch

```js
  assert.equal(v['--panel'], 'rgba(28, 16, 27, 1)'); // Default-Alpha 100 % = opak
  assert.equal(v['--bg'], 'rgba(11, 11, 17, 1)');
  assert.equal(v['--hover'], 'rgba(20, 20, 28, 1)');
```

Und ans Dateiende anfügen:

```js
// --- clampAlpha ---------------------------------------------------------------
test('clampAlpha: gueltige Prozente bleiben, gerundet', () => {
  assert.equal(ThemeLib.clampAlpha(100), 100);
  assert.equal(ThemeLib.clampAlpha(0), 0);
  assert.equal(ThemeLib.clampAlpha(55), 55);
  assert.equal(ThemeLib.clampAlpha(42.6), 43);
  assert.equal(ThemeLib.clampAlpha('80'), 80); // numerischer String
});

test('clampAlpha: Grenzen werden geklemmt', () => {
  assert.equal(ThemeLib.clampAlpha(140), 100);
  assert.equal(ThemeLib.clampAlpha(-20), 0);
});

test('clampAlpha: Muell/fehlend faellt auf 100 (nie unsichtbar)', () => {
  assert.equal(ThemeLib.clampAlpha(undefined), 100);
  assert.equal(ThemeLib.clampAlpha(null), 100);
  assert.equal(ThemeLib.clampAlpha('viel'), 100);
  assert.equal(ThemeLib.clampAlpha(NaN), 100);
  assert.equal(ThemeLib.clampAlpha({}), 100);
});

// --- accentContrast -----------------------------------------------------------
test('accentContrast: helle Akzentfarben bekommen dunklen Text', () => {
  assert.equal(ThemeLib.accentContrast('#35e0ff'), '#041018'); // Cyan-Default
  assert.equal(ThemeLib.accentContrast('#ff4fa3'), '#041018'); // Magenta-Default
  assert.equal(ThemeLib.accentContrast('#ffffff'), '#041018'); // Weiss
});

test('accentContrast: dunkle Akzentfarben bekommen hellen Text (Bug-Fix)', () => {
  assert.equal(ThemeLib.accentContrast('#000000'), '#f2f6ff'); // Schwarz
  assert.equal(ThemeLib.accentContrast('#1a1a1a'), '#f2f6ff'); // dunkelgrau
  assert.equal(ThemeLib.accentContrast('#3b0a2a'), '#f2f6ff'); // dunkles Magenta
});

test('accentContrast: kaputte Eingabe wie der Video-Default (hell -> dunkler Text)', () => {
  assert.equal(ThemeLib.accentContrast('kaputt'), '#041018');
});

// --- accentVars mit Alpha -----------------------------------------------------
test('accentVars: Alpha faerbt nur die Flaechen, nicht die Akzente', () => {
  const v = ThemeLib.accentVars('#ff4fa3', 40);
  assert.equal(v['--bg'], 'rgba(11, 11, 17, 0.4)');
  assert.equal(v['--panel'], 'rgba(28, 16, 27, 0.4)');
  assert.equal(v['--hover'], 'rgba(20, 20, 28, 0.4)');
  assert.equal(v['--accent'], '#ff4fa3');            // Akzent bleibt voll
  assert.equal(v['--accent-border'], 'rgba(255, 79, 163, 0.4)');
});

test('accentVars: 0 % ergibt vollkommen durchsichtige Flaechen', () => {
  const v = ThemeLib.accentVars('#35e0ff', 0);
  assert.equal(v['--bg'], 'rgba(11, 11, 17, 0)');
});

test('accentVars: kaputtes Alpha faellt auf 100 % (opak) zurueck', () => {
  const v = ThemeLib.accentVars('#35e0ff', 'kaputt');
  assert.equal(v['--bg'], 'rgba(11, 11, 17, 1)');
});

test('accentVars: setzt --accent-contrast passend zur Akzentfarbe', () => {
  assert.equal(ThemeLib.accentVars('#35e0ff')['--accent-contrast'], '#041018');
  assert.equal(ThemeLib.accentVars('#000000')['--accent-contrast'], '#f2f6ff');
});
```

- [ ] **Step 2: Tests laufen lassen — müssen fehlschlagen**

Run: `npm test`
Expected: FAIL — `clampAlpha`/`accentContrast` sind keine Funktionen, und
`--panel`/`--bg`/`--hover`/`--accent-contrast` fehlen bzw. sind noch Hex.

- [ ] **Step 3: Implementierung in `renderer/lib/theme.js`**

Grundton- und Hover-Konstanten sind schon bzw. neu oben in der Factory. Ergänze
`const HOVER = { r: 20, g: 20, b: 28 };` direkt unter `const BG = …`.

Neue Helfer (vor `accentVars` einfügen):

```js
  // Prozent-Deckkraft 0..100. Kaputt/fehlend -> 100 (nie versehentlich
  // unsichtbar durch alte/kaputte Store-Werte).
  function clampAlpha(input) {
    const n = Number(input);
    if (!Number.isFinite(n)) return 100;
    return Math.round(Math.min(100, Math.max(0, n)));
  }

  // Relative Luminanz (WCAG) einer 0..255-Komponente linearisieren.
  function relLuminance({ r, g, b }) {
    const lin = (c) => {
      const s = c / 255;
      return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
    };
    return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
  }

  // Textton (dunkel #041018 oder hell #f2f6ff) mit dem hoeheren
  // WCAG-Kontrastverhaeltnis zur Akzentfarbe. Kein magischer Schwellwert -
  // fuer Cyan/Magenta ergibt das wie bisher dunklen Text, fuer Schwarz hellen.
  function accentContrast(hex) {
    const rgb = hexToRgb(normalizeHex(hex, DEFAULTS.videoAccent));
    const la = relLuminance(rgb);
    const ratio = (other) => {
      const hi = Math.max(la, other) + 0.05;
      const lo = Math.min(la, other) + 0.05;
      return hi / lo;
    };
    const DARK = relLuminance({ r: 4, g: 16, b: 24 });    // #041018
    const LIGHT = relLuminance({ r: 242, g: 246, b: 255 }); // #f2f6ff
    return ratio(DARK) >= ratio(LIGHT) ? '#041018' : '#f2f6ff';
  }
```

`accentVars` ersetzen durch die alphafähige Fassung:

```js
  // Aus Akzentfarbe + Deckkraft alle CSS-Variablen ableiten. Flaechen
  // (--bg/--panel/--hover) tragen das Alpha; Akzente bleiben voll. Kaputte
  // Eingabe faellt auf den Video-Default zurueck - App startet nie ohne Farben.
  function accentVars(hex, alphaPct) {
    const clean = normalizeHex(hex, DEFAULTS.videoAccent);
    const rgb = hexToRgb(clean);
    const a = clampAlpha(alphaPct) / 100;
    const rgba = (c) => `rgba(${c.r}, ${c.g}, ${c.b}, 0.__)`; // placeholder, s.u.
    const accentRgba = (al) => `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${al})`;
    const surface = (c) => `rgba(${c.r}, ${c.g}, ${c.b}, ${a})`;
    return {
      '--accent': clean,
      '--accent-title': rgbToHex(mixWhite(rgb, 0.45)),
      '--accent-border': accentRgba(0.4),
      '--accent-glow': accentRgba(0.2),
      '--accent-dim': accentRgba(0.3),
      '--accent-contrast': accentContrast(clean),
      '--bg': surface(BG),
      '--panel': surface(tintPanel(rgb)),
      '--hover': surface(HOVER)
    };
  }
```

Hinweis: Die Platzhalterzeile `const rgba = …` aus dem Snippet NICHT
übernehmen — sie ist nur ein Kopierstopper. Nutze `accentRgba` und `surface`
wie gezeigt.

Export-Zeile am Ende erweitern:

```js
  return { DEFAULTS, normalizeHex, accentVars, accentContrast, clampAlpha, onAirState };
```

- [ ] **Step 4: Tests laufen lassen — müssen grün sein**

Run: `npm test`
Expected: PASS (alle bisherigen + die neuen Theme-Tests).

- [ ] **Step 5: Commit**

```bash
git add renderer/lib/theme.js test/theme.test.js
git commit -m "feat(theme): clampAlpha, accentContrast, alphafaehige Flaechen-Variablen"
```

---

### Task 2: Store + IPC — themePrefs um videoAlpha/chatAlpha erweitern

**Files:**
- Modify: `main.js:25` (DEFAULTS-Objekt der Store-Definition),
  `main.js:190-197` (`cleanThemePrefs`)
- Modify: `main.js:53-73` (beide `new BrowserWindow`)

**Interfaces:**
- Consumes: `ThemeLib.clampAlpha` (Task 1).
- Produces: `themePrefs = { videoAccent, chatAccent, videoAlpha, chatAlpha }`
  fließt unverändert über die bestehenden Kanäle `get-ui-prefs`,
  `save-theme-prefs`, `preview-theme-prefs`, `theme-changed`.

- [ ] **Step 1: Store-Default ergänzen**

In `main.js` das themePrefs-Default (Zeile ~25):

```js
    themePrefs: { videoAccent: '#35e0ff', chatAccent: '#ff4fa3', videoAlpha: 100, chatAlpha: 100 }
```

- [ ] **Step 2: cleanThemePrefs erweitern**

`cleanThemePrefs` (Zeile ~191) so:

```js
function cleanThemePrefs(prefs) {
  const d = ThemeLib.DEFAULTS;
  return {
    videoAccent: ThemeLib.normalizeHex(prefs && prefs.videoAccent, d.videoAccent),
    chatAccent: ThemeLib.normalizeHex(prefs && prefs.chatAccent, d.chatAccent),
    videoAlpha: ThemeLib.clampAlpha(prefs && prefs.videoAlpha),
    chatAlpha: ThemeLib.clampAlpha(prefs && prefs.chatAlpha)
  };
}
```

- [ ] **Step 3: ThemeLib.DEFAULTS ergänzen (renderer/lib/theme.js)**

Damit `clampAlpha(undefined)` → 100 die Defaults trifft und die Renderer die
Defaults kennen, DEFAULTS in `renderer/lib/theme.js` erweitern:

```js
  const DEFAULTS = { videoAccent: '#35e0ff', chatAccent: '#ff4fa3', videoAlpha: 100, chatAlpha: 100 };
```

- [ ] **Step 4: Fenster transparent erstellen**

Beide `new BrowserWindow` (Video ~53, Chat ~66): `backgroundColor: '#0b0b11'`
ersetzen durch:

```js
    backgroundColor: '#00000000',
    transparent: true,
```

(`frame: false` und der Rest bleiben.)

- [ ] **Step 5: Startprobe**

Run: `npm start`
Expected: Beide Fenster starten wie gewohnt (Default 100 % ⇒ voll deckender
fast-schwarzer Grund). Kurz Fenster ziehen/maximieren — keine Abstürze.
Danach schließen.

- [ ] **Step 6: Commit**

```bash
git add main.js renderer/lib/theme.js
git commit -m "feat(theme): videoAlpha/chatAlpha im Store + transparente Fenster"
```

---

### Task 3: Renderer — applyTheme wendet Alpha + Kontrast an (beide Fenster)

**Files:**
- Modify: `renderer/chat/chat.js:594-607` (`applyTheme`, `currentPickerPrefs`,
  Reset)
- Modify: `renderer/video/video.js:265-275` (`applyTheme`)

**Interfaces:**
- Consumes: `accentVars(hex, alphaPct)`, `clampAlpha`, `DEFAULTS` (Task 1/2).
- Produces: Sliders in Task 4 lesen/schreiben `videoAlpha`/`chatAlpha` über die
  hier erweiterten `currentPickerPrefs()` und `applyTheme()`.

- [ ] **Step 1: chat.js — applyTheme mit chatAlpha**

In `renderer/chat/chat.js` in `applyTheme` die accentVars-Zeile ändern:

```js
  const vars = ThemeLib.accentVars(themePrefs.chatAccent, themePrefs.chatAlpha);
```

(Die `for`-Schleife setzt `--bg/--panel/--hover/--accent-contrast` jetzt
automatisch mit, weil sie in `vars` stehen.)

- [ ] **Step 2: video.js — applyTheme mit videoAlpha**

In `renderer/video/video.js` in `applyTheme`:

```js
  const vars = ThemeLib.accentVars(t.videoAccent, t.videoAlpha);
```

- [ ] **Step 3: chat.js — Picker-Prefs tragen Alpha mit**

`currentPickerPrefs()` erweitern, damit Speichern/Vorschau die Alpha-Werte
nicht verliert (Slider-Elemente kommen in Task 4, hier defensiv über den
aktuellen `themePrefs`-Stand):

```js
function currentPickerPrefs() {
  return {
    videoAccent: $colorVideo.value,
    chatAccent: $colorChat.value,
    videoAlpha: ThemeLib.clampAlpha($alphaVideo ? $alphaVideo.value : themePrefs.videoAlpha),
    chatAlpha: ThemeLib.clampAlpha($alphaChat ? $alphaChat.value : themePrefs.chatAlpha)
  };
}
```

Direkt bei den anderen `$color*`-Konstanten (≈ Zeile 588) die Slider-Handles
schon deklarieren (Markup folgt in Task 4):

```js
const $alphaVideo = document.getElementById('opt-alpha-video');
const $alphaChat = document.getElementById('opt-alpha-chat');
const $alphaVideoVal = document.getElementById('opt-alpha-video-val');
const $alphaChatVal = document.getElementById('opt-alpha-chat-val');
```

- [ ] **Step 4: chat.js — applyTheme spiegelt Slider-Stand**

Am Ende von `applyTheme` (nach den `$colorChat`-Zeilen) die Slider + %-Anzeige
spiegeln, defensiv (Elemente evtl. noch nicht im DOM bei ganz frühem Aufruf):

```js
  const va = ThemeLib.clampAlpha(themePrefs.videoAlpha);
  const ca = ThemeLib.clampAlpha(themePrefs.chatAlpha);
  if ($alphaVideo) $alphaVideo.value = va;
  if ($alphaChat) $alphaChat.value = ca;
  if ($alphaVideoVal) $alphaVideoVal.textContent = va + '%';
  if ($alphaChatVal) $alphaChatVal.textContent = ca + '%';
```

- [ ] **Step 5: Verifizieren (bestehende Tests unberührt)**

Run: `npm test`
Expected: PASS (Renderer-JS ist nicht unit-getestet; die Suite bleibt grün).

- [ ] **Step 6: Commit**

```bash
git add renderer/chat/chat.js renderer/video/video.js
git commit -m "feat(theme): applyTheme wendet Deckkraft an und spiegelt Slider"
```

---

### Task 4: UI — zwei Deckkraft-Slider im ⚙-Popup + Verdrahtung

**Files:**
- Modify: `renderer/chat/index.html:28-35` (settings-pop)
- Modify: `renderer/chat/chat.css` (Slider-Styling anhängen)
- Modify: `renderer/chat/chat.js:619-625` (Slider-Events, Reset)

**Interfaces:**
- Consumes: `previewThemePrefs`/`saveThemePrefs` (bestehende Preload-Brücke),
  `currentPickerPrefs()` (Task 3), `ThemeLib.DEFAULTS` (Task 2).

- [ ] **Step 1: Markup — Slider unter den Farbwählern**

In `renderer/chat/index.html` direkt vor `<button id="opt-color-reset" …>`:

```html
    <label class="opt-alpha-row">Deckkraft Video
      <input type="range" id="opt-alpha-video" min="0" max="100" step="5" value="100" />
      <span id="opt-alpha-video-val" class="opt-alpha-val">100%</span>
    </label>
    <label class="opt-alpha-row">Deckkraft Chat
      <input type="range" id="opt-alpha-chat" min="0" max="100" step="5" value="100" />
      <span id="opt-alpha-chat-val" class="opt-alpha-val">100%</span>
    </label>
```

- [ ] **Step 2: Styling — an chat.css anhängen**

Ans Ende von `renderer/chat/chat.css`:

```css
/* ⚙-Popup: Deckkraft-Slider (Glass-Transparenz). */
.opt-alpha-row { display: flex; align-items: center; gap: 8px; }
.opt-alpha-row input[type="range"] { flex: 1; min-width: 90px; }
.opt-alpha-val {
  font-family: var(--mono); color: var(--muted);
  min-width: 42px; text-align: right;
}
```

- [ ] **Step 3: Verdrahtung — Live-Vorschau, Speichern, Reset**

In `renderer/chat/chat.js` den bestehenden Slider-Block der Farbwähler
(`for (const el of [$colorVideo, $colorChat]) { … }`) um die Alpha-Slider
erweitern. Direkt darunter einfügen:

```js
for (const el of [$alphaVideo, $alphaChat]) {
  el.addEventListener('input', () => {
    // %-Anzeige sofort, Live-Vorschau in beide Fenster (kein Store-Write).
    $alphaVideoVal.textContent = ThemeLib.clampAlpha($alphaVideo.value) + '%';
    $alphaChatVal.textContent = ThemeLib.clampAlpha($alphaChat.value) + '%';
    window.twitchDual.previewThemePrefs(currentPickerPrefs());
  });
  el.addEventListener('change', () => window.twitchDual.saveThemePrefs(currentPickerPrefs()));
}
```

Der bestehende Reset-Handler nutzt bereits `{ ...ThemeLib.DEFAULTS }`; da
DEFAULTS jetzt `videoAlpha:100`/`chatAlpha:100` enthält, setzt Reset die
Deckkraft automatisch mit zurück — keine Änderung nötig.

- [ ] **Step 4: Startprobe**

Run: `npm start`
Expected: ⚙ öffnen → zwei „Deckkraft"-Slider stehen auf 100%. Video-Slider
ziehen → Video-Fenster wird durchsichtig, %-Anzeige läuft mit; Chat-Slider
wirkt aufs Chat-Fenster. Loslassen → bleibt nach Neustart erhalten. „Farben
zurücksetzen" stellt Farben **und** 100% wieder her. Danach schließen.

- [ ] **Step 5: Commit**

```bash
git add renderer/chat/index.html renderer/chat/chat.css renderer/chat/chat.js
git commit -m "feat(ui): Deckkraft-Slider fuer Video und Chat im Einstellungs-Popup"
```

---

### Task 5: Bug-Fix — Akzent-Buttons nutzen --accent-contrast + neutraler Rand

**Files:**
- Modify: `renderer/video/index.html:47-53` (`#load`)
- Modify: `renderer/video/home.css:47-51` (`#add-btn, #refresh-btn`)

**Interfaces:**
- Consumes: `--accent-contrast` (setzt `applyTheme` im Video-Fenster, Task 3).

- [ ] **Step 1: #load lesbar machen**

In `renderer/video/index.html` die `#load`-Regel:

```css
    #load {
      padding: 8px 16px; border: 1px solid rgba(255, 255, 255, .14); border-radius: 6px;
      background: var(--accent); color: var(--accent-contrast); font-weight: 600; cursor: pointer;
      font-size: 14px;
    }
```

- [ ] **Step 2: Add-Button lesbar machen**

In `renderer/video/home.css` die Regel `#add-btn, #refresh-btn`:

```css
#add-btn, #refresh-btn {
  padding: 8px 14px; border: 1px solid rgba(255, 255, 255, .14); border-radius: 6px;
  background: var(--accent); color: var(--accent-contrast); font-weight: 600; cursor: pointer;
  font-size: 14px;
}
```

(Die Folgezeile `#refresh-btn { background: var(--hover); color: var(--text); }`
überschreibt den Refresh-Button wie bisher — der bleibt neutral.)

- [ ] **Step 3: Manuell prüfen**

Run: `npm start`
Expected: ⚙ → Video-Farbe auf Schwarz (`#000000`) stellen. „Laden" im
Video-Fenster und „+ Hinzufügen" in Home zeigen jetzt hellen, gut lesbaren
Text auf schwarzem Grund mit dünnem hellen Rand. Zurück auf Cyan → dunkler
Text wie zuvor. Schließen.

- [ ] **Step 4: Commit**

```bash
git add renderer/video/index.html renderer/video/home.css
git commit -m "fix(theme): Akzent-Buttons bleiben bei jeder Farbe lesbar (--accent-contrast)"
```

---

### Task 6: Version 1.6.0, Doku, Release

**Files:**
- Modify: `package.json` (version)
- Modify: `docs/TODO.md` (Changelog-Eintrag)

- Produces: Release v1.6.0 (Auto-Update verteilt es an installierte Apps).

- [ ] **Step 1: Version bumpen**

In `package.json` `"version": "1.5.0"` → `"version": "1.6.0"`.

- [ ] **Step 2: TODO.md ergänzen**

Unter dem v1.5.0-Block in `docs/TODO.md` einfügen:

```markdown
**Glass-Transparenz + Kontrast-Fix (v1.6.0)**
- Deckkraft-Slider pro Fenster (Video/Chat) im ⚙-Popup: Hintergrund 0–100 %
  durchsichtig, Text/Emotes/Glow/On-Air-Leiste bleiben voll. Fenster mit
  `transparent:true`; Flächen über `--bg/--panel/--hover` als rgba mit einem
  Alpha pro Fenster (`themePrefs.videoAlpha/chatAlpha`, Default 100 %).
- Bug-Fix: Akzent-Buttons („Laden", „+ Hinzufügen") wählen ihren Textton per
  `ThemeLib.accentContrast` (höheres WCAG-Kontrastverhältnis) + dünner
  neutraler Rand → auch Schwarz als Akzentfarbe bleibt lesbar.
```

- [ ] **Step 3: Voller Testlauf + Smoke-Test**

Run: `npm test`
Expected: PASS (alle Tests grün).

Run: `npm start` — Endkontrolle: beide Slider live, 0 % zeigt scharfen Text
über dem Desktop, Schwarz-Akzent lesbar, Ziehen/Resize/Maximieren/Snap ok.
Schließen.

- [ ] **Step 4: Commit**

```bash
git add package.json docs/TODO.md
git commit -m "release: v1.6.0 - Glass-Transparenz + Akzent-Kontrast-Fix"
```

- [ ] **Step 5: Release bauen und veröffentlichen (mit Nutzer abstimmen!)**

Erst PR mergen, dann Release-Ablauf exakt wie in `docs/TODO.md`
§„Neue Version veröffentlichen":

```bash
npm run dist
# in dist/installer: EXE + Blockmap auf Bindestrich-Namen kopieren
gh release create v1.6.0 TwitchDual-Setup-1.6.0.exe TwitchDual-Setup-1.6.0.exe.blockmap latest.yml
```

Expected: GitHub-Release v1.6.0 sichtbar; installierte Apps updaten sich beim
nächsten Start selbst.

---

## Self-Review

- **Spec-Abdeckung:** Transparenz-Fenster (Task 2), Alpha in Flächen (Task 1/3),
  getrennte Regler (Task 4), 0–100 % Default 100 (Task 1/2), Reset inkl. Alpha
  (Task 4), accentContrast-Bug-Fix (Task 1/5), Fehlerfälle clampAlpha (Task 1),
  Tests (Task 1), Release (Task 6). Alle Spec-Punkte haben eine Task.
- **Platzhalter:** Der einzige „placeholder"-Kommentar in Task 1/Step 3 ist
  ausdrücklich als NICHT-zu-übernehmen markiert und erklärt.
- **Typkonsistenz:** `accentVars(hex, alphaPct)`, `clampAlpha`,
  `accentContrast` identisch in Task 1 definiert und in Task 2–5 verwendet;
  `--accent-contrast` in Task 1 erzeugt, in Task 5 konsumiert; Slider-IDs
  (`opt-alpha-video/chat` + `-val`) identisch in Task 3 (Handles) und Task 4
  (Markup).
