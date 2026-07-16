# Neon Dual — On Air (v1.5.0) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** TwitchDual bekommt den „Neon Dual — On Air“-Look: Video-Fenster Cyan, Chat-Fenster Magenta (beide Farben in den Einstellungen änderbar), Glow, fast schwarzer Grund, On-Air-Leiste als Live-Signal — Twitch-Lila verschwindet vollständig.

**Architecture:** Alle Akzentfarben laufen über CSS-Variablen auf `:root`, gesetzt von einer neuen DOM-freien Lib `renderer/lib/theme.js` (UMD wie `chat-ui.js`, unit-getestet). Persistenz `themePrefs` in electron-store nach dem `chatPrefs`-Muster; `theme-changed`-Broadcast aktualisiert beide Fenster live. Die On-Air-Leiste nutzt die vorhandenen Signale `load` (`mode: 'live'|'vod'`) und `player-state`.

**Tech Stack:** Electron 33, Vanilla JS/CSS, electron-store, node:test.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-07-16-neon-dual-on-air-design.md` — bei Widerspruch gewinnt die Spec.
- Defaults: Video-Akzent `#35E0FF`, Chat-Akzent `#FF4FA3`, Grund `#0B0B11`, Text `#EDEDF4`, gedämpft `#8B8B9C`, Zeitstempel `#565666`.
- Twitch-Lila `#9147ff`/`#772ce8` darf nach Abschluss **nirgends** mehr im Repo-Quellcode vorkommen (außer in docs/).
- Monospace-Stack überall identisch: `"Cascadia Code", Consolas, monospace`.
- Animationen laufen IMMER — **kein** `prefers-reduced-motion`-Media-Query einbauen (bewusste v1.4.0-Entscheidung).
- Semantik-Farben bleiben: Fehler-Rot `#eb0400`, Verbinden-Gelb `#f5a623`. Das Erfolgs-Grün des Statuspunkts wird durch die Akzentfarbe ersetzt (Spec 1.3).
- Keine Änderungen an: VOD-Paginierung, Autoscroll-Logik, Adblock, Badge-/Emote-Auflösung, `submit-load`-Protokoll.
- Alle bestehenden Tests müssen nach jedem Task grün sein: `npm test`.
- Commit-Messages auf Deutsch im Stil der Git-Historie (`feat: …`, `docs: …`), jeweils mit `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.
- Preload ist sandboxed: dort **kein** `require` außer `electron` (nur IPC-Durchreichen, keine Logik).

---

### Task 1: Theme-Lib `renderer/lib/theme.js` (TDD)

**Files:**
- Create: `renderer/lib/theme.js`
- Test: `test/theme.test.js`

**Interfaces:**
- Consumes: nichts (Blatt-Lib, keine Abhängigkeiten).
- Produces (UMD-Export `ThemeLib`, unter Node `require('../renderer/lib/theme')`):
  - `DEFAULTS` = `{ videoAccent: '#35e0ff', chatAccent: '#ff4fa3' }`
  - `normalizeHex(input, fallback)` → `'#rrggbb'` (klein) oder `fallback`
  - `accentVars(hex)` → Objekt mit Keys `--accent`, `--accent-title`, `--accent-border`, `--accent-glow`, `--accent-dim`, `--panel`
  - `onAirState(mode, playerState)` → `'onair' | 'dimmed'`

- [ ] **Step 1: Failing Test schreiben**

`test/theme.test.js` (Stil wie `test/chat-ui.test.js`):

```js
const { test } = require('node:test');
const assert = require('node:assert');
const ThemeLib = require('../renderer/lib/theme');

// --- normalizeHex ------------------------------------------------------------
test('normalizeHex: gueltige Hex-Formen werden normalisiert', () => {
  assert.equal(ThemeLib.normalizeHex('#35E0FF', '#000000'), '#35e0ff');
  assert.equal(ThemeLib.normalizeHex('35e0ff', '#000000'), '#35e0ff');
  assert.equal(ThemeLib.normalizeHex('#F4A', '#000000'), '#ff44aa'); // #RGB expandiert
  assert.equal(ThemeLib.normalizeHex('  #ff4fa3  ', '#000000'), '#ff4fa3');
});

test('normalizeHex: Muell faellt auf den Fallback zurueck', () => {
  assert.equal(ThemeLib.normalizeHex('#12345', '#ff4fa3'), '#ff4fa3');
  assert.equal(ThemeLib.normalizeHex('rot', '#ff4fa3'), '#ff4fa3');
  assert.equal(ThemeLib.normalizeHex('', '#ff4fa3'), '#ff4fa3');
  assert.equal(ThemeLib.normalizeHex(undefined, '#ff4fa3'), '#ff4fa3');
  assert.equal(ThemeLib.normalizeHex(null, '#ff4fa3'), '#ff4fa3');
  assert.equal(ThemeLib.normalizeHex(42, '#ff4fa3'), '#ff4fa3');
});

// --- accentVars ---------------------------------------------------------------
test('accentVars: liefert alle Variablen mit korrekten Ableitungen', () => {
  const v = ThemeLib.accentVars('#ff4fa3'); // rgb(255, 79, 163)
  assert.equal(v['--accent'], '#ff4fa3');
  assert.equal(v['--accent-border'], 'rgba(255, 79, 163, 0.4)');
  assert.equal(v['--accent-glow'], 'rgba(255, 79, 163, 0.2)');
  assert.equal(v['--accent-dim'], 'rgba(255, 79, 163, 0.3)');
  // Titeltext: 45 % Richtung Weiss gemischt -> heller als die Akzentfarbe.
  // g: 79+(255-79)*0.45 = 158 (0x9e), b: 163+(255-163)*0.45 = 204 (0xcc)
  assert.equal(v['--accent-title'], '#ff9ecc');
  // Panel: 7 % Akzent in den Grundton #0b0b11 gemischt.
  assert.equal(v['--panel'], '#1c101b');
});

test('accentVars: dunkle Nutzerfarbe ergibt trotzdem hellen Titelton', () => {
  const v = ThemeLib.accentVars('#220011'); // fast schwarz
  // mixWhite(0.45): 0x22=34 -> 34+(255-34)*.45 = 133 (0x85); 0x00 -> 115 (0x73); 0x11=17 -> 124 (0x7c)
  assert.equal(v['--accent-title'], '#85737c');
});

test('accentVars: kaputte Eingabe faellt auf den Video-Default zurueck', () => {
  const v = ThemeLib.accentVars('kaputt');
  assert.equal(v['--accent'], '#35e0ff');
});

// --- onAirState ----------------------------------------------------------------
test('onAirState: nur live + spielt ist on air', () => {
  assert.equal(ThemeLib.onAirState('live', 'playing'), 'onair');
  assert.equal(ThemeLib.onAirState('live', 'paused'), 'dimmed');
  assert.equal(ThemeLib.onAirState('live', 'ended'), 'dimmed');
  assert.equal(ThemeLib.onAirState('live', null), 'dimmed');     // Player noch nicht bereit
  assert.equal(ThemeLib.onAirState('vod', 'playing'), 'dimmed');
  assert.equal(ThemeLib.onAirState(null, 'playing'), 'dimmed');  // nichts geladen
  assert.equal(ThemeLib.onAirState(undefined, undefined), 'dimmed');
});
```

- [ ] **Step 2: Test laufen lassen — muss fehlschlagen**

Run: `node --test test/theme.test.js`
Expected: FAIL mit `Cannot find module '../renderer/lib/theme'`

- [ ] **Step 3: Implementierung schreiben**

`renderer/lib/theme.js` (UMD-Muster exakt wie `renderer/lib/chat-ui.js`):

```js
// DOM-freie Theme-Helfer fuer "Neon Dual - On Air" (v1.5.0): Hex-Validierung,
// Ableitung der CSS-Akzentvariablen und On-Air-Zustand. UMD wie chat-ui.js:
// laeuft im Browser (<script> -> window.ThemeLib) und unter Node -> testbar.

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.ThemeLib = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  const DEFAULTS = { videoAccent: '#35e0ff', chatAccent: '#ff4fa3' };
  const BG = { r: 11, g: 11, b: 17 }; // Grundton #0b0b11 (fuer die Panel-Toenung)

  // Nutzerfarben aus dem Store koennen Muell sein (Handedit, alte Version).
  // Akzeptiert #RGB und #RRGGBB, mit/ohne '#', beliebige Gross-/Kleinschreibung.
  function normalizeHex(input, fallback) {
    if (typeof input !== 'string') return fallback;
    let s = input.trim().toLowerCase();
    if (s[0] === '#') s = s.slice(1);
    if (/^[0-9a-f]{3}$/.test(s)) s = s.replace(/./g, (c) => c + c);
    if (!/^[0-9a-f]{6}$/.test(s)) return fallback;
    return '#' + s;
  }

  function hexToRgb(hex) {
    return {
      r: parseInt(hex.slice(1, 3), 16),
      g: parseInt(hex.slice(3, 5), 16),
      b: parseInt(hex.slice(5, 7), 16)
    };
  }

  function rgbToHex({ r, g, b }) {
    const p = (n) => n.toString(16).padStart(2, '0');
    return '#' + p(r) + p(g) + p(b);
  }

  // amount Richtung Weiss mischen (0..1) - Titeltext bleibt auch bei dunklen
  // Nutzerfarben auf den dunklen Leisten lesbar.
  function mixWhite(rgb, amount) {
    const m = (c) => Math.round(c + (255 - c) * amount);
    return { r: m(rgb.r), g: m(rgb.g), b: m(rgb.b) };
  }

  // Leisten-/Panelfarbe: 7 % Akzent in den Grundton gemischt, damit jedes
  // Fenster leicht zur eigenen Farbe toent (Spec 1.1).
  function tintPanel(rgb) {
    const m = (b, a) => Math.round(b + (a - b) * 0.07);
    return { r: m(BG.r, rgb.r), g: m(BG.g, rgb.g), b: m(BG.b, rgb.b) };
  }

  // Aus einer Akzentfarbe alle CSS-Variablen ableiten. Kaputte Eingabe faellt
  // auf den Video-Default zurueck - die App startet nie ohne gueltige Farben.
  function accentVars(hex) {
    const clean = normalizeHex(hex, DEFAULTS.videoAccent);
    const rgb = hexToRgb(clean);
    const rgba = (a) => `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${a})`;
    return {
      '--accent': clean,
      '--accent-title': rgbToHex(mixWhite(rgb, 0.45)),
      '--accent-border': rgba(0.4),
      '--accent-glow': rgba(0.2),
      '--accent-dim': rgba(0.3),
      '--panel': rgbToHex(tintPanel(rgb))
    };
  }

  // On Air = Live-Kanal geladen UND Player spielt. Alles andere (VOD, Pause,
  // Ende, nichts geladen, Player noch nicht bereit) ist gedimmt - nie
  // faelschlich "on air" (Spec Paket 3 / Fehlerfaelle).
  function onAirState(mode, playerState) {
    return mode === 'live' && playerState === 'playing' ? 'onair' : 'dimmed';
  }

  return { DEFAULTS, normalizeHex, accentVars, onAirState };
});
```

- [ ] **Step 4: Tests laufen lassen — müssen grün sein**

Run: `node --test test/theme.test.js`
Expected: PASS (7 Tests). Danach `npm test` — alle bestehenden Tests weiter grün.

- [ ] **Step 5: Commit**

```bash
git add renderer/lib/theme.js test/theme.test.js
git commit -m "feat: ThemeLib (normalizeHex, accentVars, onAirState) mit Tests"
```

---

### Task 2: `themePrefs` — Store, IPC und Preload-Brücke

**Files:**
- Modify: `main.js` (Store-Defaults Z. 14–25, `get-ui-prefs` Z. 189–194, neue Handler nach `save-chat-prefs` Z. 201–205, `backgroundColor` beider Fenster Z. 54/67)
- Modify: `preload.js` (twitchDual-Brücke Z. 47–50)

**Interfaces:**
- Consumes: `ThemeLib.DEFAULTS`, `ThemeLib.normalizeHex` aus Task 1; vorhandenes `broadcast(channel, payload)` (`main.js:98`).
- Produces:
  - `get-ui-prefs` liefert zusätzlich `themePrefs: { videoAccent, chatAccent }` (immer gesäubert).
  - IPC `save-theme-prefs` (send): säubert, persistiert, broadcastet `theme-changed` mit `{ videoAccent, chatAccent }` an beide Fenster.
  - IPC `preview-theme-prefs` (send): broadcastet nur (Live-Vorschau, kein Store-Write).
  - Preload: `saveThemePrefs(prefs)`, `previewThemePrefs(prefs)`, `onThemeChanged(cb)`.

- [ ] **Step 1: main.js — ThemeLib einbinden und Store-Default ergänzen**

Nach `const BadgesLib = require('./renderer/lib/badges');` (Z. 12):

```js
const ThemeLib = require('./renderer/lib/theme');
```

In den Store-Defaults nach `adblockEnabled: true`:

```js
    adblockEnabled: true,
    themePrefs: { videoAccent: '#35e0ff', chatAccent: '#ff4fa3' }
```

- [ ] **Step 2: main.js — Säubern, get-ui-prefs erweitern, neue IPC-Handler**

Direkt vor `ipcMain.handle('get-ui-prefs', …)`:

```js
// Theme-Farben aus dem Store koennen Muell sein -> immer saeubern (ThemeLib).
function cleanThemePrefs(prefs) {
  const d = ThemeLib.DEFAULTS;
  return {
    videoAccent: ThemeLib.normalizeHex(prefs && prefs.videoAccent, d.videoAccent),
    chatAccent: ThemeLib.normalizeHex(prefs && prefs.chatAccent, d.chatAccent)
  };
}
```

`get-ui-prefs` um eine Zeile erweitern:

```js
ipcMain.handle('get-ui-prefs', () => ({
  history: store.get('history', []),
  lastSource: store.get('lastSource', ''),
  playerPrefs: store.get('playerPrefs', { volume: null, quality: null }),
  chatPrefs: store.get('chatPrefs', { showTimestamps: true, showBadges: true }),
  themePrefs: cleanThemePrefs(store.get('themePrefs'))
}));
```

Nach dem `save-chat-prefs`-Handler:

```js
// Fensterfarben: speichern broadcastet an BEIDE Fenster (Wirkung sofort);
// preview broadcastet nur (Live-Vorschau beim Ziehen im Farbwaehler).
ipcMain.on('save-theme-prefs', (_evt, prefs) => {
  const clean = cleanThemePrefs(prefs);
  store.set('themePrefs', clean);
  broadcast('theme-changed', clean);
});
ipcMain.on('preview-theme-prefs', (_evt, prefs) => {
  broadcast('theme-changed', cleanThemePrefs(prefs));
});
```

- [ ] **Step 3: main.js — Fenster-Hintergrundfarben auf den Neon-Grund**

`backgroundColor: '#0e0e10'` (videoWin) und `backgroundColor: '#18181b'` (chatWin) beide ersetzen durch:

```js
    backgroundColor: '#0b0b11',
```

- [ ] **Step 4: preload.js — Brücke erweitern**

Nach `saveChatPrefs: …` (Z. 50) einfügen:

```js
    saveThemePrefs: (prefs) => ipcRenderer.send('save-theme-prefs', prefs),
    previewThemePrefs: (prefs) => ipcRenderer.send('preview-theme-prefs', prefs),
    onThemeChanged: (cb) => {
      ipcRenderer.on('theme-changed', (_e, prefs) => cb(prefs));
    },
```

- [ ] **Step 5: Tests + Startprobe**

Run: `npm test` — alles grün (keine bestehende Datei testet `get-ui-prefs` direkt).
Run: `npm start` — App startet, beide Fenster laden ohne Konsolen-Fehler (Look noch alt, das ist ok).

- [ ] **Step 6: Commit**

```bash
git add main.js preload.js
git commit -m "feat: themePrefs in Store + IPC (save/preview/theme-changed)"
```

---

### Task 3: Chat-Fenster — Neon-Retheme + On-Air-Leiste + msg/min

**Files:**
- Modify: `renderer/chat/index.html` (On-Air-Leiste, ON-AIR-Tag, msg/min-Span, theme.js-Script)
- Modify: `renderer/chat/chat.css` (Token-Block, Farb-Umbau, neue Regeln)
- Modify: `renderer/chat/chat.js` (applyTheme, On-Air-Zustand, msg/min)

**Interfaces:**
- Consumes: `window.ThemeLib` (Task 1), `getUiPrefs().themePrefs` + `onThemeChanged` (Task 2), vorhandene `onLoad`/`onPlayerState`-Callbacks (`chat.js:475ff`, `chat.js:493ff`), `ChatUi.createRateMeter` (`renderer/lib/chat-ui.js:54`).
- Produces: Body-Klasse `onair`, CSS-Variablen auf `:root`. Muster `applyTheme(prefs)` + `#onair-bar`/`#onair-tag`-Markup wird in Task 4 im Video-Fenster gespiegelt.

- [ ] **Step 1: index.html — Markup ergänzen**

Als erstes Element in `<body>` (vor `<div id="head">`):

```html
  <div id="onair-bar"></div>
```

In `#head` nach `<span id="mode"></span>`:

```html
    <span id="onair-tag">● ON AIR</span>
```

Im `#footer` nach `<span id="conn">…</span>`:

```html
    <span id="rate"></span>
```

Vor `<script src="chat.js">`:

```html
  <script src="../lib/theme.js"></script>
```

- [ ] **Step 2: chat.css — Token-Block voranstellen**

Ganz oben in `chat.css` (vor `* { box-sizing … }`):

```css
/* Neon Dual - On Air (v1.5.0): alle Akzente laufen ueber CSS-Variablen.
   --accent* und --panel setzt chat.js aus ThemeLib.accentVars(chatAccent);
   die Werte hier sind nur der Fallback bis zum ersten applyTheme(). */
:root {
  --accent: #ff4fa3;
  --accent-title: #ff9ecc;
  --accent-border: rgba(255, 79, 163, .4);
  --accent-glow: rgba(255, 79, 163, .2);
  --accent-dim: rgba(255, 79, 163, .3);
  --panel: #1c101b;
  --onair-from: #35e0ff;
  --onair-to: #ff4fa3;
  --bg: #0b0b11;
  --line: #1c1c26;
  --hover: #14141c;
  --text: #ededf4;
  --muted: #8b8b9c;
  --ts: #565666;
  --mono: "Cascadia Code", Consolas, monospace;
}
```

- [ ] **Step 3: chat.css — mechanischer Farb-Umbau**

Alle Vorkommen ersetzen (Datei-weit, exakt diese Paare):

| alt | neu |
|---|---|
| `background: #18181b; color: #efeff1;` (html, body) | `background: var(--bg); color: var(--text);` |
| `background: #0e0e10;` (#head, #footer) | `background: var(--panel);` |
| `border-bottom: 1px solid #2a2a2d;` (#head) | `border-bottom: 1px solid var(--accent-border);` |
| `border-top: 1px solid #2a2a2d;` (#footer) | `border-top: 1px solid var(--line);` |
| `scrollbar-color: #3a3a3d transparent;` | `scrollbar-color: #23232e transparent;` |
| `background: #3a3a3d;` (scrollbar-thumb) | `background: #23232e;` |
| `background: #1f1f23;` (.msg:hover) | `background: var(--hover);` |
| `color: #adadb8;` (alle: #mode, .sep, .system, #footer, #settings-btn, #win-controls button, #uc-copy, #emote-tip-src) | `color: var(--muted);` |
| `color: #6e6e76;` (.msg .ts) | `color: var(--ts);` |
| `background: #9147ff;` (#new-msgs) | `background: var(--accent);` |
| `background: #772ce8;` (#new-msgs:hover) | `filter: brightness(1.15);` (Property-Wechsel!) |
| `color: #00b16a;` (#conn.ok) | `color: var(--muted);` |
| `background: #00b16a;` (#conn.ok::before) | `background: var(--accent); box-shadow: 0 0 6px var(--accent-dim);` |
| `background: #6e6e76;` (#conn::before) | `background: var(--ts);` |
| `background: #1f1f23; border: 1px solid #2a2a2d;` (#settings-pop) | `background: var(--hover); border: 1px solid var(--line);` |
| `background: #1f1f23; border: 1px solid #3a3a3d;` (#emote-tip, #user-card) | `background: var(--hover); border: 1px solid var(--line);` |
| `border-bottom: 1px solid #2a2a2d;` (#uc-head) | `border-bottom: 1px solid var(--line);` |
| `border-top: 1px solid #232327;` (.uc-msg) | `border-top: 1px solid var(--line);` |
| `color: #d0d0d5;` (.uc-msg) | `color: var(--text);` |
| `color: #7a7a82;` (.empty-hint) | `color: var(--muted);` |
| `background: #2a2a2d; color: #efeff1;` (#win-controls button:hover) | `background: var(--hover); color: var(--text);` |
| `color: #efeff1;` (übrige Hover: #settings-btn:hover, #uc-copy:hover) | `color: var(--text);` |

Unverändert lassen: `#eb0400` (Fehler + ✕-Hover), `#f5a623` (connecting).

- [ ] **Step 4: chat.css — neue Regeln anhängen**

```css
/* --- Neon Dual - On Air (v1.5.0) ------------------------------------------ */

/* Fensterrahmen in der Fensterfarbe (randloses Fenster). */
body {
  border: 1px solid var(--accent-border);
  box-shadow: inset 0 0 24px -12px var(--accent-glow);
}

/* Titelzeile traegt die Fensterfarbe. */
#title { color: var(--accent-title); }

/* On-Air-Leiste: 2px ueber der Titelzeile. Gedimmt sichtbar, live = volle
   Leuchtkraft + langsamer Puls. Kein display-Wechsel -> kein Layout-Sprung. */
#onair-bar {
  height: 2px; flex-shrink: 0;
  background: linear-gradient(90deg, var(--onair-from), var(--onair-to));
  opacity: .25;
}
body.onair #onair-bar {
  opacity: 1;
  box-shadow: 0 0 10px var(--accent-glow);
  animation: onair-pulse 1.6s ease-in-out infinite;
}
@keyframes onair-pulse { 50% { opacity: .55; } }

/* ON-AIR-Schriftzug: Verlaufs-Text, nur sichtbar wenn on air. */
#onair-tag {
  font-family: var(--mono); font-size: 10px; font-weight: 700;
  letter-spacing: .08em;
  background: linear-gradient(90deg, var(--onair-from), var(--onair-to));
  -webkit-background-clip: text; background-clip: text; color: transparent;
}
body:not(.onair) #onair-tag { display: none; }

/* Monospace fuer den technischen Puls: Zeitstempel, Status, msg/min. */
.msg .ts, #footer, #mode { font-family: var(--mono); }
#rate { margin-left: 8px; color: var(--ts); }

/* Fokus/Interaktion in der Fensterfarbe. */
button:focus-visible, input:focus-visible {
  outline: 2px solid var(--accent-dim); outline-offset: 1px;
}
#new-msgs { color: #fff; }
```

- [ ] **Step 5: chat.js — applyTheme + On-Air + msg/min**

Am Dateiende (nach dem window-control-Block) anhängen:

```js
// ---------------------------------------------------------------------------
// Neon Dual - On Air (v1.5.0): Fensterfarbe (Chat = chatAccent) als CSS-
// Variablen; On-Air-Leiste haengt an load-Modus + player-state.
// ---------------------------------------------------------------------------
let themePrefs = { ...ThemeLib.DEFAULTS };

function applyTheme(prefs) {
  themePrefs = { ...ThemeLib.DEFAULTS, ...(prefs || {}) };
  const vars = ThemeLib.accentVars(themePrefs.chatAccent);
  for (const [k, v] of Object.entries(vars)) {
    document.documentElement.style.setProperty(k, v);
  }
  document.documentElement.style.setProperty('--onair-from',
    ThemeLib.normalizeHex(themePrefs.videoAccent, ThemeLib.DEFAULTS.videoAccent));
  document.documentElement.style.setProperty('--onair-to',
    ThemeLib.normalizeHex(themePrefs.chatAccent, ThemeLib.DEFAULTS.chatAccent));
}

window.twitchDual.getUiPrefs()
  .then((prefs) => applyTheme(prefs && prefs.themePrefs))
  .catch(() => applyTheme(null)); // Defaults, App startet nie ohne Farben
window.twitchDual.onThemeChanged(applyTheme);

// On Air: live + spielt. Bis zum ersten 'playing' nach einem Load gilt
// gedimmt - nie faelschlich on air (Spec Fehlerfaelle).
let onAirMode = null;        // 'live' | 'vod' | null (aus dem load-Broadcast)
let onAirPlayerState = null; // letzter player-state nach dem Load

function updateOnAir() {
  const on = ThemeLib.onAirState(onAirMode, onAirPlayerState) === 'onair';
  document.body.classList.toggle('onair', on);
}
```

Im bestehenden `onLoad`-Callback (`chat.js:475ff`, dort wo `$title`/`$mode` gesetzt werden) am Anfang ergänzen:

```js
  onAirMode = payload.mode;
  onAirPlayerState = null;
  updateOnAir();
```

Im bestehenden `onPlayerState`-Callback (`chat.js:493`, `playerState = state;`) direkt danach ergänzen:

```js
  onAirPlayerState = state;
  updateOnAir();
```

msg/min: nach der bestehenden Zeile `const msgRate = ChatUi.createRateMeter({ windowMs: 1000 });` (`chat.js:39`) ergänzen:

```js
// Nachrichten pro Minute fuers Footer-Display (Monospace-Detail).
const $rate = document.getElementById('rate');
const minuteRate = ChatUi.createRateMeter({ windowMs: 60000 });
let rateShown = -1;
function tickRateDisplay(now) {
  const n = minuteRate.tick(now);
  if (n !== rateShown) { rateShown = n; $rate.textContent = n + ' msg/min'; }
}
```

In der zentralen Nachricht-Anfüge-Funktion (dort, wo bereits `msgRate.tick(…)` aufgerufen wird) direkt daneben ergänzen:

```js
  tickRateDisplay(Date.now());
```

- [ ] **Step 6: Prüfen**

Run: `npm test` — grün.
Run: `npm start` — Sichtprüfung Chat-Fenster:
- Grund fast schwarz, Leisten magenta-getönt, Titel „Chat“ in hellem Magenta, Rahmen-Glow sichtbar.
- On-Air-Leiste oben gedimmt; Live-Kanal laden (z. B. einen gerade live Favoriten) → Leiste leuchtet + pulsiert, „● ON AIR“ erscheint; VOD laden → gedimmt, kein Tag.
- Footer: Statuspunkt magenta bei Verbindung, `NN msg/min` zählt hoch, Monospace.
- Kein Lila mehr: `#new-msgs`-Button magenta.

- [ ] **Step 7: Commit**

```bash
git add renderer/chat/index.html renderer/chat/chat.css renderer/chat/chat.js
git commit -m "feat: Chat-Fenster im Neon-Dual-Look + On-Air-Leiste + msg/min"
```

---

### Task 4: Video-Fenster — Neon-Retheme + On-Air-Leiste

**Files:**
- Modify: `renderer/video/index.html` (Inline-CSS Z. 7–72, Markup, theme.js-Script)
- Modify: `renderer/video/home.css` (Farb-Umbau, LIVE-Pill)
- Modify: `renderer/video/video.js` (applyTheme, On-Air, PLAYING-Relay)

**Interfaces:**
- Consumes: `window.ThemeLib`, `getUiPrefs().themePrefs`, `onThemeChanged` (Tasks 1–2); Muster `applyTheme`/`updateOnAir` aus Task 3 (hier mit `videoAccent`).
- Produces: `sendPlayerState('playing')` zusätzlich beim `Twitch.Player.PLAYING`-Event — davon profitiert auch die Chat-On-Air-Logik aus Task 3.

- [ ] **Step 1: index.html — Token-Block + Farb-Umbau im Inline-CSS**

Denselben `:root`-Block wie in Task 3 Step 2 an den Anfang des `<style>`-Blocks setzen, aber mit Cyan-Fallbacks:

```css
    :root {
      --accent: #35e0ff;
      --accent-title: #90eeff;
      --accent-border: rgba(53, 224, 255, .4);
      --accent-glow: rgba(53, 224, 255, .2);
      --accent-dim: rgba(53, 224, 255, .3);
      --panel: #0e1a22;
      --onair-from: #35e0ff;
      --onair-to: #ff4fa3;
      --bg: #0b0b11;
      --line: #1c1c26;
      --hover: #14141c;
      --text: #ededf4;
      --muted: #8b8b9c;
      --ts: #565666;
      --mono: "Cascadia Code", Consolas, monospace;
    }
```

Dann im Inline-CSS ersetzen:

| alt | neu |
|---|---|
| `background: #0e0e10; color: #efeff1;` (html, body) | `background: var(--bg); color: var(--text);` |
| `background: #18181b;` (#bar) | `background: var(--panel);` |
| `border-bottom: 1px solid #2a2a2d;` (#bar) | `border-bottom: 1px solid var(--accent-border);` |
| `border: 1px solid #3a3a3d; background: #0e0e10; color: #efeff1;` (#channel) | `border: 1px solid var(--line); background: var(--bg); color: var(--text);` |
| `border-color: #9147ff;` (#channel:focus) | `border-color: var(--accent);` |
| `background: #9147ff;` (#load) | `background: var(--accent); color: #041018;` (dunkle Schrift auf Cyan!) |
| `background: #772ce8;` (#load:hover) | `filter: brightness(1.15);` |
| `border: 1px solid #3a3a3d; background: #0e0e10; color: #adadb8;` (#adblock-toggle) | `border: 1px solid var(--line); background: var(--bg); color: var(--muted);` |
| `color: #adadb8;` (#status, #win-controls button, #ad-overlay-sub) | `color: var(--muted);` |
| `background: #0e0e10; color: #efeff1;` (#ad-overlay) | `background: var(--bg); color: var(--text);` |
| `background: #2a2a2d; color: #efeff1;` (#win-controls button:hover) | `background: var(--hover); color: var(--text);` |
| `color: #7a7a82;` (#hint) | `color: var(--muted);` |

Unverändert: `#eb0400`/`#eb4034` (Fehler/✕), Adblock-Grün `#1f3d1f`/`#3fa34d`/`#eafbea`.

Neue Regeln ans Ende des `<style>`-Blocks (identisch zu Task 3 Step 4, nur ohne die Chat-spezifischen `.msg .ts`/`#rate`-Zeilen):

```css
    body {
      border: 1px solid var(--accent-border);
      box-shadow: inset 0 0 24px -12px var(--accent-glow);
    }
    #onair-bar {
      height: 2px; flex-shrink: 0;
      background: linear-gradient(90deg, var(--onair-from), var(--onair-to));
      opacity: .25;
    }
    body.onair #onair-bar {
      opacity: 1;
      box-shadow: 0 0 10px var(--accent-glow);
      animation: onair-pulse 1.6s ease-in-out infinite;
    }
    @keyframes onair-pulse { 50% { opacity: .55; } }
    #onair-tag {
      font-family: var(--mono); font-size: 10px; font-weight: 700;
      letter-spacing: .08em; white-space: nowrap;
      background: linear-gradient(90deg, var(--onair-from), var(--onair-to));
      -webkit-background-clip: text; background-clip: text; color: transparent;
    }
    body:not(.onair) #onair-tag { display: none; }
    #status { font-family: var(--mono); }
    button:focus-visible, input:focus-visible {
      outline: 2px solid var(--accent-dim); outline-offset: 1px;
    }
```

- [ ] **Step 2: index.html — Markup**

Als erstes Element in `<body>` (vor `<div id="bar">`):

```html
  <div id="onair-bar"></div>
```

In `#bar` direkt vor `<span id="status">bereit</span>`:

```html
    <span id="onair-tag">● ON AIR</span>
```

Vor `<script src="video.js">`:

```html
  <script src="../lib/theme.js"></script>
```

- [ ] **Step 3: home.css — Farb-Umbau**

Ersetzen (Datei-weit):

| alt | neu |
|---|---|
| `background: #2a2a2d; color: #efeff1;` (#home-btn, #home-head button) | `background: var(--hover); color: var(--text);` |
| `background: #3a3a3d;` (Hover davon) | `background: var(--line);` |
| `background: #0e0e10;` (#home) | `background: var(--bg);` |
| `background: #18181b;` (#home-head) | `background: var(--panel);` |
| `border-bottom: 1px solid #2a2a2d;` (#home-head) | `border-bottom: 1px solid var(--line);` |
| `scrollbar-color: #3a3a3d transparent;` / `background: #3a3a3d;` (Scrollbars) | `#23232e` wie in Task 3 |
| `border: 1px solid #3a3a3d; background: #0e0e10; color: #efeff1;` (#add-input, #filter-input) | `border: 1px solid var(--line); background: var(--bg); color: var(--text);` |
| `border-color: #9147ff;` (:focus) | `border-color: var(--accent);` |
| `background: #9147ff;` (#add-btn) | `background: var(--accent); color: #041018;` |
| `background: #772ce8;` (Hover) | `filter: brightness(1.15);` |
| `color: #7a7a82;` (.empty) | `color: var(--muted);` |
| `background: #18181b; border: 1px solid #202024;` (.fav) | `background: var(--panel); border: 1px solid var(--line);` |
| `background: #2a2a2d;` (.avatar) | `background: var(--hover);` |
| `box-shadow: 0 0 0 2px #eb0400;` (.avatar.live) | `box-shadow: 0 0 0 2px var(--onair-to), 0 0 8px var(--onair-to);` |
| `background: #eb0400;` (.badge LIVE) | `background: var(--onair-to); box-shadow: 0 0 8px var(--onair-to);` |

Danach den Rest von `home.css` (Karten-Grid, Skeleton, VOD-Liste — Bereich ab Z. 80) nach demselben Muster durchgehen: jede der obigen Alt-Farben (`#18181b`, `#0e0e10`, `#2a2a2d`, `#3a3a3d`, `#1f1f23`, `#adadb8`, `#7a7a82`, `#efeff1`, `#9147ff`, `#772ce8`, `#eb0400` als LIVE-Signal) durch die zugehörige Variable aus derselben Tabelle ersetzen. Zuschauerzahlen-Chips auf Karten bekommen `font-family: var(--mono);`.

- [ ] **Step 4: video.js — applyTheme + On-Air + PLAYING-Relay**

Am Dateiende anhängen:

```js
// ---------------------------------------------------------------------------
// Neon Dual - On Air (v1.5.0): Fensterfarbe (Video = videoAccent) als CSS-
// Variablen; On-Air-Leiste haengt an load-Modus + eigenem Player-Zustand.
// ---------------------------------------------------------------------------
function applyTheme(prefs) {
  const t = { ...ThemeLib.DEFAULTS, ...(prefs || {}) };
  const vars = ThemeLib.accentVars(t.videoAccent);
  for (const [k, v] of Object.entries(vars)) {
    document.documentElement.style.setProperty(k, v);
  }
  document.documentElement.style.setProperty('--onair-from',
    ThemeLib.normalizeHex(t.videoAccent, ThemeLib.DEFAULTS.videoAccent));
  document.documentElement.style.setProperty('--onair-to',
    ThemeLib.normalizeHex(t.chatAccent, ThemeLib.DEFAULTS.chatAccent));
}

window.twitchDual.getUiPrefs()
  .then((prefs) => applyTheme(prefs && prefs.themePrefs))
  .catch(() => applyTheme(null));
window.twitchDual.onThemeChanged(applyTheme);

let onAirMode = null;
let onAirPlayerState = null;
function updateOnAir() {
  const on = ThemeLib.onAirState(onAirMode, onAirPlayerState) === 'onair';
  document.body.classList.toggle('onair', on);
}
```

Im bestehenden `onLoad`-Callback (`video.js:207ff`) am Anfang ergänzen:

```js
  onAirMode = payload.mode;
  onAirPlayerState = null;
  updateOnAir();
```

In `mountPlayer()` die Player-Event-Listener so erweitern (PLAYING meldet jetzt auch — Live-Streams feuern zuverlässig PLAYING):

```js
  player.addEventListener(Twitch.Player.PLAYING, () => {
    startTimeBroadcast();
    window.twitchDual.sendPlayerState('playing');
    onAirPlayerState = 'playing'; updateOnAir();
  });
  player.addEventListener(Twitch.Player.PAUSE, () => {
    window.twitchDual.sendPlayerState('paused');
    onAirPlayerState = 'paused'; updateOnAir();
  });
  player.addEventListener(Twitch.Player.PLAY, () => {
    window.twitchDual.sendPlayerState('playing');
    onAirPlayerState = 'playing'; updateOnAir();
  });
  player.addEventListener(Twitch.Player.ENDED, () => {
    window.twitchDual.sendPlayerState('ended');
    onAirPlayerState = 'ended'; updateOnAir();
  });
```

(Hinweis: `updateOnAir`/`onAirPlayerState` sind durch Hoisting der `function`-Deklaration und `let`-Top-Level-Variablen verfügbar, weil `mountPlayer` erst nach Skript-Auswertung aufgerufen wird.)

- [ ] **Step 5: Prüfen**

Run: `npm test` — grün.
Run: `npm start` — Sichtprüfung Video-Fenster:
- Leiste cyan-getönt, „Laden“-Button cyan mit dunkler Schrift, Eingabefeld-Fokus cyan.
- Home-Overlay: Karten im Neon-Look, LIVE-Pill magenta mit Glow, Zuschauerzahl Monospace.
- Live-Kanal spielt → On-Air-Leiste leuchtet in BEIDEN Fenstern, „● ON AIR“ in beiden Titelzeilen; Pause → beide gedimmt; VOD → beide gedimmt.
- Grep-Kontrolle: `git grep -n "9147ff\|772ce8" -- renderer/ main.js` → keine Treffer.

- [ ] **Step 6: Commit**

```bash
git add renderer/video/index.html renderer/video/home.css renderer/video/video.js
git commit -m "feat: Video-Fenster im Neon-Dual-Look + On-Air-Leiste (PLAYING-Relay)"
```

---

### Task 5: Farbwähler im ⚙-Popup (Live-Vorschau + Reset)

**Files:**
- Modify: `renderer/chat/index.html` (⚙-Popup Z. 19–26)
- Modify: `renderer/chat/chat.js` (Wiring nach dem applyTheme-Block aus Task 3)
- Modify: `renderer/chat/chat.css` (Styling der neuen Zeilen)

**Interfaces:**
- Consumes: `applyTheme(prefs)` + `themePrefs`-Variable (Task 3), `previewThemePrefs`/`saveThemePrefs` (Task 2), `ThemeLib.DEFAULTS`.
- Produces: nichts für spätere Tasks (letztes Feature-Stück).

- [ ] **Step 1: index.html — Popup erweitern**

In `#settings-pop` nach dem `#opt-font-row`-Label:

```html
    <div id="opt-color-head">Farben</div>
    <label class="opt-color-row">Video
      <input type="color" id="opt-color-video" value="#35e0ff" />
    </label>
    <label class="opt-color-row">Chat
      <input type="color" id="opt-color-chat" value="#ff4fa3" />
    </label>
    <button id="opt-color-reset" type="button">Farben zurücksetzen</button>
```

- [ ] **Step 2: chat.css — Styling anhängen**

```css
/* ⚙-Popup: Farbwaehler (Neon Dual). */
#opt-color-head {
  margin-top: 4px; padding-top: 6px; border-top: 1px solid var(--line);
  font-size: 11px; text-transform: uppercase; letter-spacing: .08em;
  color: var(--muted);
}
.opt-color-row { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
.opt-color-row input[type="color"] {
  width: 44px; height: 24px; padding: 0; border: 1px solid var(--line);
  border-radius: 4px; background: none; cursor: pointer;
}
#opt-color-reset {
  background: var(--hover); border: 1px solid var(--line); border-radius: 6px;
  color: var(--muted); font-size: 12px; padding: 4px 8px; cursor: pointer;
}
#opt-color-reset:hover { color: var(--text); }
```

- [ ] **Step 3: chat.js — Wiring**

Nach dem applyTheme-Block aus Task 3 anhängen; zusätzlich in `applyTheme()` die zwei Picker-Werte synchron halten (Zeilen am Ende von `applyTheme` ergänzen):

```js
  // Farbwaehler im ⚙-Popup spiegeln den aktiven Zustand.
  if ($colorVideo) $colorVideo.value = ThemeLib.normalizeHex(themePrefs.videoAccent, ThemeLib.DEFAULTS.videoAccent);
  if ($colorChat) $colorChat.value = ThemeLib.normalizeHex(themePrefs.chatAccent, ThemeLib.DEFAULTS.chatAccent);
```

Neuer Block (vor dem applyTheme-Block deklarieren, damit `$colorVideo`/`$colorChat` dort sichtbar sind — Reihenfolge: erst die drei `const`-Zeilen, dann der applyTheme-Block aus Task 3, dann das Wiring):

```js
const $colorVideo = document.getElementById('opt-color-video');
const $colorChat = document.getElementById('opt-color-chat');
const $colorReset = document.getElementById('opt-color-reset');

// input = Live-Vorschau in BEIDEN Fenstern (Broadcast ohne Store-Write),
// change = speichern. Muster wie beim Schriftgroessen-Slider.
function currentPickerPrefs() {
  return { videoAccent: $colorVideo.value, chatAccent: $colorChat.value };
}
for (const el of [$colorVideo, $colorChat]) {
  el.addEventListener('input', () => window.twitchDual.previewThemePrefs(currentPickerPrefs()));
  el.addEventListener('change', () => window.twitchDual.saveThemePrefs(currentPickerPrefs()));
}
$colorReset.addEventListener('click', () => {
  window.twitchDual.saveThemePrefs({ ...ThemeLib.DEFAULTS });
});
```

(Der `theme-changed`-Broadcast ruft in beiden Fenstern `applyTheme` auf — das Chat-Fenster braucht nach `preview`/`save` keine lokale Extra-Anwendung.)

- [ ] **Step 4: Prüfen**

Run: `npm test` — grün.
Run: `npm start` — Sichtprüfung:
- ⚙ öffnen → Sektion „Farben“ mit zwei Pickern (zeigen aktuelle Farben) + Reset.
- Am Video-Picker ziehen → Video-Fenster (Rahmen, Leiste, Laden-Button) UND On-Air-Verlauf in beiden Fenstern folgen live.
- Am Chat-Picker ziehen → Chat-Fenster folgt live.
- App schließen + neu starten → gewählte Farben bleiben.
- Reset → beide Fenster sofort wieder Cyan/Magenta.

- [ ] **Step 5: Commit**

```bash
git add renderer/chat/index.html renderer/chat/chat.css renderer/chat/chat.js
git commit -m "feat: Fensterfarben-Waehler im Chat-Popup (Live-Vorschau, Reset)"
```

---

### Task 6: Version 1.5.0, Doku, Release

**Files:**
- Modify: `package.json` (Z. 3: `"version": "1.4.0"`)
- Modify: `docs/TODO.md` (neuer Erledigt-Abschnitt)

**Interfaces:**
- Consumes: alle vorigen Tasks abgeschlossen und committed.
- Produces: Release v1.5.0 (Auto-Update verteilt es an installierte Apps).

- [ ] **Step 1: Version bumpen**

`package.json`: `"version": "1.5.0"`.

- [ ] **Step 2: TODO.md ergänzen**

In `docs/TODO.md` unter „Erledigt“ (nach dem Komfort-&-Design-Block) einfügen:

```markdown
**Neon Dual - On Air (v1.5.0)**
- Eigene visuelle Identitaet statt Twitch-Look: fast schwarzer Grund,
  Video-Fenster Cyan, Chat-Fenster Magenta (Glow an Rahmen/Titel/Status),
  Twitch-Lila komplett entfernt. Alle Akzente als CSS-Variablen.
- Fensterfarben im ⚙-Popup einstellbar (zwei Color-Picker + Reset,
  Live-Vorschau in beiden Fenstern; themePrefs in electron-store,
  save/preview-theme-prefs-IPC + theme-changed-Broadcast).
- On-Air-Leiste (2px-Verlauf Video->Chat-Farbe) ueber beiden Fenstern:
  leuchtet + pulsiert nur bei Live-Kanal der spielt (load-mode +
  player-state-Relay; PLAYING sendet jetzt auch 'playing'), sonst gedimmt.
- Monospace-Details (Zeitstempel, msg/min-Anzeige im Chat-Footer, Status).
- Neue DOM-freie Lib renderer/lib/theme.js (normalizeHex, accentVars,
  onAirState; unit-getestet).
```

- [ ] **Step 3: Voller Testlauf + manueller Smoke-Test**

Run: `npm test` — alles grün.
Run: `npm start` — Smoke-Test laut Spec: Live-Chat großer Kanal (Glow/Puls, msg/min), VOD inkl. Seek (Leiste gedimmt, Replay läuft normal), Farbwechsel wirkt sofort in beiden Fenstern, Reset, Neustart behält Farben, Adblock-Schalter + Home-Overlay funktionieren unverändert.

- [ ] **Step 4: Commit**

```bash
git add package.json docs/TODO.md
git commit -m "release: v1.5.0 - Neon Dual: On Air (eigene Identitaet, Farbwaehler, On-Air-Leiste)"
```

- [ ] **Step 5: Release bauen und veröffentlichen (mit Nutzer abstimmen!)**

Erst pushen, dann Release-Ablauf exakt wie in `docs/TODO.md` §„Neue Version veröffentlichen“:

```bash
git push
npm run dist
# in dist/installer: EXE + Blockmap auf Bindestrich-Namen kopieren, dann
gh release create v1.5.0 TwitchDual-Setup-1.5.0.exe TwitchDual-Setup-1.5.0.exe.blockmap latest.yml
```

Expected: GitHub-Release v1.5.0 sichtbar unter https://github.com/janiseule-stack/TwitchDual/releases; installierte Apps updaten sich beim nächsten Start selbst.
