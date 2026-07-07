# TwitchDual v1.4.0 „Komfort & Design" — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Chat-Komfort (Schriftgrößen-Slider, Emote-Tooltips, User-Karte) plus visueller Feinschliff (Home-Facelift mit Live-Karten-Grid, Chat-Feinschliff, Micro-Animationen) als Release v1.4.0.

**Architecture:** Alle neue Logik, die testbar ist, lebt DOM-frei in einer neuen UMD-Bibliothek `renderer/lib/chat-ui.js` (Muster wie `backoff.js`). Die Renderer (`chat.js`, `home.js`) hängen nur DOM/CSS daran auf. Persistenz läuft über den vorhandenen `chatPrefs`-Weg (electron-store, Merge in `main.js` — **keine** Main-/Preload-Änderungen nötig).

**Tech Stack:** Electron 33 (Chromium 130), Vanilla JS/CSS, `node --test` für Unit-Tests.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-07-07-komfort-design-v1.4-design.md`
- **Nicht anfassen:** VOD-Paginierung (`renderer/lib/vod-replay.js`), Autoscroll-Logik in `chat.js` (Zeilen um `autoScroll`/`scrollbarDrag`), IPC-Protokoll, `main.js`, `preload.js`, Adblock, Badge-Auflösung (`renderer/lib/badges.js`).
- Kommentare und UI-Texte auf **Deutsch**, Stil wie Bestand.
- **Kein `innerHTML` mit Fremddaten** (XSS) — nur `textContent`/`createElement`; `innerHTML = ''` zum Leeren ist ok (Bestandsmuster).
- Neue Lib-Dateien im **UMD-Muster** wie `renderer/lib/backoff.js` (Browser `<script>` + Node `require`).
- Tests: `node --test` (Ordner `test/`, Stil wie `test/backoff.test.js`). Nach jedem Task muss `npm test` komplett grün sein.
- Schriftgröße: **11–22 px, Default 14**. Einblende-Animation nur bei ≤ **5 Nachrichten/s**. Thumbnail-URL: `https://static-cdn.jtvnw.net/previews-ttv/live_user_<login>-440x248.jpg`.
- Alle Animationen respektieren `@media (prefers-reduced-motion: reduce)`.

---

### Task 1: DOM-freie Bibliothek `ChatUi` (clampFontSize, emoteProvider, lastMessagesOf, createRateMeter)

**Files:**
- Create: `renderer/lib/chat-ui.js`
- Test: `test/chat-ui.test.js`

**Interfaces:**
- Consumes: nichts (reine Funktionen).
- Produces (von späteren Tasks benutzt):
  - `ChatUi.clampFontSize(v: any) => number` (11–22, ganzzahlig, Fallback 14)
  - `ChatUi.emoteProvider(url: any) => string` („Twitch" | „7TV" | „BTTV" | „FFZ" | `''`)
  - `ChatUi.lastMessagesOf(entries: {name,text}[], name: string, limit=5) => string[]` (chronologisch)
  - `ChatUi.createRateMeter({windowMs=1000}) => { tick(nowMs)=>count, reset() }`
  - Konstanten: `FONT_MIN=11`, `FONT_MAX=22`, `FONT_DEFAULT=14`, `ANIM_MAX_RATE=5`

- [ ] **Step 1: Failing Tests schreiben**

`test/chat-ui.test.js`:

```js
const { test } = require('node:test');
const assert = require('node:assert');
const ChatUi = require('../renderer/lib/chat-ui');

// --- clampFontSize ---------------------------------------------------------
test('clampFontSize: gueltige Werte bleiben, Grenzen gelten', () => {
  assert.equal(ChatUi.clampFontSize(14), 14);
  assert.equal(ChatUi.clampFontSize(11), 11);
  assert.equal(ChatUi.clampFontSize(22), 22);
  assert.equal(ChatUi.clampFontSize(10), 11);
  assert.equal(ChatUi.clampFontSize(99), 22);
});

test('clampFontSize: Strings/Muell -> Zahl oder Default 14', () => {
  assert.equal(ChatUi.clampFontSize('16'), 16);
  assert.equal(ChatUi.clampFontSize(14.6), 15); // rundet
  assert.equal(ChatUi.clampFontSize('abc'), 14);
  assert.equal(ChatUi.clampFontSize(undefined), 14);
  assert.equal(ChatUi.clampFontSize(null), 14);
  assert.equal(ChatUi.clampFontSize(NaN), 14);
});

// --- emoteProvider ---------------------------------------------------------
test('emoteProvider: erkennt die vier Anbieter am Hostname', () => {
  assert.equal(ChatUi.emoteProvider('https://static-cdn.jtvnw.net/emoticons/v2/25/default/dark/2.0'), 'Twitch');
  assert.equal(ChatUi.emoteProvider('https://cdn.7tv.app/emote/01ABC/2x.webp'), '7TV');
  assert.equal(ChatUi.emoteProvider('https://cdn.7tv.io/emote/01ABC/2x.webp'), '7TV');
  assert.equal(ChatUi.emoteProvider('https://cdn.betterttv.net/emote/5f1b0186cf6d2144653d2970/2x'), 'BTTV');
  assert.equal(ChatUi.emoteProvider('https://cdn.frankerfacez.com/emote/128054/2'), 'FFZ');
});

test('emoteProvider: unbekannt/kaputt -> leerer String', () => {
  assert.equal(ChatUi.emoteProvider('https://example.com/emote.png'), '');
  assert.equal(ChatUi.emoteProvider('kein-url'), '');
  assert.equal(ChatUi.emoteProvider(null), '');
  assert.equal(ChatUi.emoteProvider(undefined), '');
});

// --- lastMessagesOf --------------------------------------------------------
test('lastMessagesOf: letzte N des Users, chronologisch', () => {
  const entries = [
    { name: 'anna', text: 'eins' },
    { name: 'bob', text: 'zwei' },
    { name: 'anna', text: 'drei' },
    { name: 'anna', text: 'vier' }
  ];
  assert.deepEqual(ChatUi.lastMessagesOf(entries, 'anna', 2), ['drei', 'vier']);
  assert.deepEqual(ChatUi.lastMessagesOf(entries, 'anna'), ['eins', 'drei', 'vier']);
});

test('lastMessagesOf: kein Treffer / kaputte Eintraege -> leer bzw. uebersprungen', () => {
  assert.deepEqual(ChatUi.lastMessagesOf([], 'anna'), []);
  assert.deepEqual(ChatUi.lastMessagesOf([{ name: 'bob', text: 'x' }], 'anna'), []);
  assert.deepEqual(
    ChatUi.lastMessagesOf([null, { name: 'anna' }, { name: 'anna', text: 'ok' }], 'anna'),
    ['ok']
  );
});

// --- createRateMeter -------------------------------------------------------
test('createRateMeter: zaehlt Ereignisse im Fenster, alte fallen raus', () => {
  const m = ChatUi.createRateMeter({ windowMs: 1000 });
  assert.equal(m.tick(1000), 1);
  assert.equal(m.tick(1100), 2);
  assert.equal(m.tick(1900), 3);
  assert.equal(m.tick(2150), 2); // 1000 und 1100 sind aelter als 2150-1000 -> raus
});

test('createRateMeter: Fenstergrenze exakt', () => {
  const m = ChatUi.createRateMeter({ windowMs: 1000 });
  m.tick(0);
  assert.equal(m.tick(1000), 2);  // 0 ist genau am Rand -> zaehlt noch
  assert.equal(m.tick(1001), 2);  // jetzt ist 0 raus: 1000, 1001
});

test('createRateMeter: reset leert das Fenster', () => {
  const m = ChatUi.createRateMeter();
  m.tick(1); m.tick(2);
  m.reset();
  assert.equal(m.tick(3), 1);
});
```

(Fenster-Semantik: ein Ereignis zählt, solange `time >= now - windowMs`; exakt am Rand zählt es noch, siehe zweiter Test.)

- [ ] **Step 2: Tests laufen lassen — müssen fehlschlagen**

Run: `npm test`
Expected: FAIL, `Cannot find module '../renderer/lib/chat-ui'`

- [ ] **Step 3: Implementierung**

`renderer/lib/chat-ui.js`:

```js
// DOM-freie Helfer fuer die Chat-UI (Schriftgroesse, Emote-Tooltip,
// User-Karte, Einblende-Drossel). UMD wie backoff.js: laeuft im Browser
// (<script>) und unter Node -> testbar.

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.ChatUi = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  const FONT_MIN = 11;
  const FONT_MAX = 22;
  const FONT_DEFAULT = 14;
  // Ab dieser Nachrichtenrate (pro Fenster) wird die Einblende-Animation
  // abgeschaltet - in Mega-Chats wuerde sie nur flackern.
  const ANIM_MAX_RATE = 5;

  // Schriftgroesse aus dem Store kann Muell sein (alte Version, Handedit).
  function clampFontSize(v) {
    const n = Number(v);
    if (!Number.isFinite(n)) return FONT_DEFAULT;
    return Math.min(FONT_MAX, Math.max(FONT_MIN, Math.round(n)));
  }

  // Anbieter eines Emotes anhand der Bild-URL (fuer den Tooltip).
  // Unbekannt/kaputt -> '' (Tooltip zeigt dann nur Name + Vorschau).
  function emoteProvider(url) {
    if (typeof url !== 'string') return '';
    let host;
    try { host = new URL(url).hostname; } catch (e) { return ''; }
    if (host === 'static-cdn.jtvnw.net') return 'Twitch';
    if (host === '7tv.io' || host === '7tv.app' ||
        host.endsWith('.7tv.io') || host.endsWith('.7tv.app')) return '7TV';
    if (host.includes('betterttv')) return 'BTTV';
    if (host.includes('frankerfacez')) return 'FFZ';
    return '';
  }

  // Letzte `limit` Nachrichten eines Users, chronologisch (fuer die
  // User-Karte). entries: [{name, text}] in Chat-Reihenfolge.
  function lastMessagesOf(entries, name, limit = 5) {
    const out = [];
    for (let i = entries.length - 1; i >= 0 && out.length < limit; i--) {
      const e = entries[i];
      if (e && e.name === name && typeof e.text === 'string') out.push(e.text);
    }
    return out.reverse();
  }

  // Gleitendes Zaehlfenster: tick(now) traegt ein Ereignis ein und liefert,
  // wie viele im Fenster liegen. Ereignis am exakten Fensterrand zaehlt noch.
  function createRateMeter({ windowMs = 1000 } = {}) {
    let times = [];
    return {
      tick(now) {
        times.push(now);
        const cutoff = now - windowMs;
        while (times.length && times[0] < cutoff) times.shift();
        return times.length;
      },
      reset() { times = []; }
    };
  }

  return {
    clampFontSize, emoteProvider, lastMessagesOf, createRateMeter,
    FONT_MIN, FONT_MAX, FONT_DEFAULT, ANIM_MAX_RATE
  };
});
```

- [ ] **Step 4: Tests laufen lassen — müssen bestehen**

Run: `npm test`
Expected: PASS (alle Dateien, auch die Bestandstests)

- [ ] **Step 5: Commit**

```bash
git add renderer/lib/chat-ui.js test/chat-ui.test.js
git commit -m "feat: ChatUi-Lib (Font-Clamp, Emote-Provider, User-Verlauf, Raten-Zaehler)"
```

---

### Task 2: Schriftgrößen-Slider + em-Umstellung (Spec 1.1 + Emote-Zeilenmetrik aus 2.2)

**Files:**
- Modify: `renderer/chat/index.html` (⚙-Popup + Script-Tag)
- Modify: `renderer/chat/chat.js` (chatPrefs, applyChatPrefs, Slider-Events)
- Modify: `renderer/chat/chat.css` (CSS-Variable, em-Größen, negative Emote-Margins)

**Interfaces:**
- Consumes: `ChatUi.clampFontSize`, `ChatUi.FONT_MIN/MAX/DEFAULT` (Task 1).
- Produces: CSS-Variable `--chat-font-size` auf `#messages` (Task 5 verlässt sich darauf, dass Emote/Badge in `em` skaliert sind).

- [ ] **Step 1: Script-Tag + Slider-Markup in `renderer/chat/index.html`**

`<script src="../lib/chat-ui.js"></script>` **vor** `chat.js` einfügen (nach `vod-replay.js`). Im `#settings-pop` unter den beiden Checkboxen:

```html
  <div id="settings-pop" class="hidden">
    <label><input type="checkbox" id="opt-ts" checked /> Zeitstempel anzeigen</label>
    <label><input type="checkbox" id="opt-badges" checked /> Badges anzeigen</label>
    <label id="opt-font-row">Schrift
      <input type="range" id="opt-font" min="11" max="22" step="1" />
      <span id="opt-font-val"></span>
    </label>
  </div>
```

- [ ] **Step 2: `chat.js` erweitern**

Oben bei den Element-Refs:

```js
const $optFont = document.getElementById('opt-font');
const $optFontVal = document.getElementById('opt-font-val');
```

`chatPrefs`-Default und `applyChatPrefs()` ersetzen durch:

```js
let chatPrefs = { showTimestamps: true, showBadges: true, fontSize: ChatUi.FONT_DEFAULT };

function applyChatPrefs() {
  $messages.classList.toggle('hide-ts', !chatPrefs.showTimestamps);
  $messages.classList.toggle('hide-badges', !chatPrefs.showBadges);
  $optTs.checked = !!chatPrefs.showTimestamps;
  $optBadges.checked = !!chatPrefs.showBadges;
  // Schriftgroesse: kaputte Store-Werte werden geclampt (11-22, Default 14).
  const px = ChatUi.clampFontSize(chatPrefs.fontSize);
  $messages.style.setProperty('--chat-font-size', px + 'px');
  $optFont.value = String(px);
  $optFontVal.textContent = px + ' px';
}
```

Nach der bestehenden Checkbox-Schleife die Slider-Events (live anwenden beim Ziehen, speichern beim Loslassen — kein Store-Spam):

```js
$optFont.addEventListener('input', () => {
  chatPrefs.fontSize = ChatUi.clampFontSize($optFont.value);
  applyChatPrefs();
});
$optFont.addEventListener('change', () => window.twitchDual.saveChatPrefs(chatPrefs));
```

- [ ] **Step 3: `chat.css` umstellen**

`#messages`-Regel: `font-size: 14px;` → `font-size: var(--chat-font-size, 14px);`

Größen relativ zur Schrift (14 px = 1em Basis; Emote bisher 28 px = 2em, Badge 18 px ≈ 1.3em, Zeitstempel 11 px ≈ 0.8em). Die negativen Emote-Margins verhindern, dass 2em-Emotes die 1.45-Zeilen aufreißen (Twitch-Ansatz):

```css
.msg .badge {
  height: 1.3em; width: 1.3em;
  vertical-align: -0.22em; margin-right: 4px; border-radius: 3px;
}
.msg .emote {
  height: 2em; vertical-align: middle;
  margin: -0.35em 1px; /* Zeilenhoehe bleibt konstant trotz 2em-Bild */
}
.msg .ts {
  color: #6e6e76; font-size: 0.8em; margin-right: 5px;
  font-variant-numeric: tabular-nums;
}
```

(Die bestehenden `.badge`/`.emote`/`.ts`-Regeln ersetzen, Rest unverändert.)

Für den Slider im Popup:

```css
#opt-font-row { display: flex; align-items: center; gap: 6px; }
#opt-font { flex: 1; min-width: 90px; }
#opt-font-val { color: #adadb8; min-width: 38px; text-align: right; }
```

- [ ] **Step 4: Manuell verifizieren**

Run: `npm start` → Live-Kanal laden (z. B. `papaplatte`), ⚙ öffnen, Slider ziehen.
Expected: Schrift, Emotes, Badges, Zeitstempel skalieren gemeinsam und sofort; Zeilen bleiben gleichmäßig (keine „aufgerissenen" Zeilen durch Emotes). App neu starten → Größe bleibt erhalten.

- [ ] **Step 5: `npm test` (Bestand grün) + Commit**

```bash
git add renderer/chat/index.html renderer/chat/chat.js renderer/chat/chat.css
git commit -m "feat: Schriftgroessen-Slider im Chat + ruhige Emote-Zeilen (em-Skalierung)"
```

---

### Task 3: Emote-Tooltips (Spec 1.2)

**Files:**
- Modify: `renderer/chat/index.html` (Tooltip-Element)
- Modify: `renderer/chat/chat.js` (Delegation, `title` entfernen)
- Modify: `renderer/chat/chat.css` (Tooltip-Styling)

**Interfaces:**
- Consumes: `ChatUi.emoteProvider(url)` (Task 1).
- Produces: nichts, das spätere Tasks brauchen.

- [ ] **Step 1: Tooltip-Markup in `index.html`** (vor `#footer`):

```html
  <div id="emote-tip" class="hidden">
    <img id="emote-tip-img" alt="" />
    <div id="emote-tip-name"></div>
    <div id="emote-tip-src"></div>
  </div>
```

- [ ] **Step 2: `chat.css` — Tooltip als fixes Overlay** (außerhalb des Scroll-Pfads, keine Pointer-Events → stört Autoscroll und Hover nicht):

```css
#emote-tip {
  position: fixed; z-index: 20; pointer-events: none;
  background: #1f1f23; border: 1px solid #3a3a3d; border-radius: 8px;
  padding: 8px 12px; text-align: center; max-width: 220px;
  box-shadow: 0 4px 12px rgba(0,0,0,.5);
}
#emote-tip img { max-height: 84px; max-width: 196px; display: block; margin: 0 auto 4px; }
#emote-tip-name { font-weight: 700; font-size: 13px; word-break: break-all; }
#emote-tip-src { font-size: 11px; color: #adadb8; }
```

- [ ] **Step 3: `chat.js` — Delegation + `title` weg**

In `appendEmote()` die Zeile `img.title = name;` **entfernen** (sonst konkurrieren zwei Tooltips).

Neuer Block (z. B. nach `trimMessages`, Kommentar-Sektion „Emote-Tooltip"):

```js
// ---------------------------------------------------------------------------
// Emote-Tooltip: EIN wiederverwendetes fixed-Overlay, Delegation auf
// #messages (kein Listener pro Emote - wichtig bei Mega-Chats).
// ---------------------------------------------------------------------------
const $emoteTip = document.getElementById('emote-tip');
const $emoteTipImg = document.getElementById('emote-tip-img');
const $emoteTipName = document.getElementById('emote-tip-name');
const $emoteTipSrc = document.getElementById('emote-tip-src');

function showEmoteTip(img) {
  $emoteTipImg.src = img.src;
  $emoteTipName.textContent = img.alt;
  $emoteTipSrc.textContent = ChatUi.emoteProvider(img.src);
  $emoteTip.classList.remove('hidden');
  // Erst einblenden, dann messen - sonst sind offsetWidth/Height 0.
  const r = img.getBoundingClientRect();
  const w = $emoteTip.offsetWidth, h = $emoteTip.offsetHeight;
  const left = Math.min(Math.max(4, r.left + r.width / 2 - w / 2), window.innerWidth - w - 4);
  let top = r.top - h - 6;
  if (top < 4) top = r.bottom + 6; // oben kein Platz -> unter das Emote
  $emoteTip.style.left = left + 'px';
  $emoteTip.style.top = top + 'px';
}

function hideEmoteTip() { $emoteTip.classList.add('hidden'); }

$messages.addEventListener('mouseover', (e) => {
  if (e.target.classList && e.target.classList.contains('emote')) showEmoteTip(e.target);
});
$messages.addEventListener('mouseout', (e) => {
  if (e.target.classList && e.target.classList.contains('emote')) hideEmoteTip();
});
```

Zusätzlich im `window.twitchDual.onLoad(...)`-Handler (neue Quelle) `hideEmoteTip();` ergänzen (direkt nach `$messages.innerHTML = '';`).

- [ ] **Step 4: Manuell verifizieren**

Run: `npm start` → Kanal mit 7TV-Emotes laden, über Emotes hovern (auch am oberen Fensterrand und ganz links/rechts).
Expected: Tooltip mit großer Vorschau, Name, Quelle (7TV/Twitch/…); klappt an Rändern ein statt abgeschnitten zu werden; verschwindet beim Verlassen; Chat scrollt normal weiter.

- [ ] **Step 5: `npm test` + Commit**

```bash
git add renderer/chat/index.html renderer/chat/chat.js renderer/chat/chat.css
git commit -m "feat: Emote-Tooltip mit Vorschau und Anbieter-Quelle"
```

---

### Task 4: User-Karte mit Verlauf (Spec 1.3)

**Files:**
- Modify: `renderer/chat/index.html` (Karten-Element)
- Modify: `renderer/chat/chat.js` (Klick-Handler ersetzt Kopieren, Karte, Verlauf-Sammlung)
- Modify: `renderer/chat/chat.css` (Karten-Styling)

**Interfaces:**
- Consumes: `ChatUi.lastMessagesOf(entries, name, limit)` (Task 1).
- Produces: nichts, das spätere Tasks brauchen.

- [ ] **Step 1: Markup in `index.html`** (direkt nach `#emote-tip`):

```html
  <div id="user-card" class="hidden">
    <div id="uc-head">
      <span id="uc-badges"></span>
      <span id="uc-name"></span>
      <button id="uc-copy" title="Name kopieren">📋</button>
    </div>
    <div id="uc-msgs"></div>
  </div>
```

- [ ] **Step 2: `chat.css`**:

```css
#user-card {
  position: fixed; z-index: 30;
  background: #1f1f23; border: 1px solid #3a3a3d; border-radius: 8px;
  min-width: 200px; max-width: 280px;
  box-shadow: 0 4px 12px rgba(0,0,0,.5);
}
#uc-head {
  display: flex; align-items: center; gap: 6px;
  padding: 8px 10px; border-bottom: 1px solid #2a2a2d;
}
#uc-badges img.badge { height: 18px; width: 18px; vertical-align: -3px; margin-right: 2px; }
#uc-name { font-weight: 700; flex: 1; word-break: break-all; }
#uc-copy {
  background: none; border: none; cursor: pointer; font-size: 13px;
  color: #adadb8; padding: 2px 4px;
}
#uc-copy:hover { color: #efeff1; }
#uc-msgs { padding: 6px 10px; max-height: 180px; overflow-y: auto; }
.uc-msg {
  font-size: 12px; color: #d0d0d5; padding: 3px 0;
  border-top: 1px solid #232327; word-wrap: break-word;
}
.uc-msg:first-child { border-top: none; }
#uc-msgs .empty-hint { font-size: 12px; color: #7a7a82; font-style: italic; }
```

- [ ] **Step 3: `chat.js` — Karte + Verlauf**

In `appendMessage()` den User-Klick-Handler ersetzen (Kopieren wandert in die Karte):

```js
  user.title = 'Klick: User-Info';
  user.addEventListener('click', (e) => openUserCard(e, name, color || '#bf94ff', div));
```

Neuer Block (nach dem Emote-Tooltip-Block):

```js
// ---------------------------------------------------------------------------
// User-Karte: Klick auf einen Namen -> Name, Badges der Nachricht,
// Kopieren-Button und die letzten Nachrichten des Users aus dem DOM-Puffer.
// Kein eigenes Datenmodell: gesammelt wird beim Oeffnen aus den .msg-Knoten.
// ---------------------------------------------------------------------------
const $userCard = document.getElementById('user-card');
const $ucBadges = document.getElementById('uc-badges');
const $ucName = document.getElementById('uc-name');
const $ucCopy = document.getElementById('uc-copy');
const $ucMsgs = document.getElementById('uc-msgs');

// Nachrichtentext eines .msg-Knotens: alles nach dem ': '-Separator;
// Emote-Bilder zaehlen mit ihrem alt-Namen als Text.
function collectMsgText(msgDiv) {
  let text = '';
  let afterSep = false;
  for (const node of msgDiv.childNodes) {
    if (!afterSep) {
      if (node.classList && node.classList.contains('sep')) afterSep = true;
      continue;
    }
    if (node.nodeType === Node.TEXT_NODE) text += node.textContent;
    else if (node.classList && node.classList.contains('emote')) text += node.alt;
  }
  return text.trim();
}

function collectEntries() {
  const entries = [];
  for (const div of $messages.querySelectorAll('.msg:not(.system)')) {
    const u = div.querySelector('.user');
    if (u) entries.push({ name: u.textContent, text: collectMsgText(div) });
  }
  return entries;
}

function closeUserCard() { $userCard.classList.add('hidden'); }

function openUserCard(evt, name, color, msgDiv) {
  $ucName.textContent = name;
  $ucName.style.color = color;
  $ucBadges.innerHTML = '';
  for (const b of msgDiv.querySelectorAll('.badge, .chip')) {
    $ucBadges.appendChild(b.cloneNode(true));
  }
  $ucMsgs.innerHTML = '';
  const history = ChatUi.lastMessagesOf(collectEntries(), name, 5);
  if (!history.length) {
    const d = document.createElement('div');
    d.className = 'empty-hint';
    d.textContent = 'keine weiteren Nachrichten im Puffer';
    $ucMsgs.appendChild(d);
  }
  for (const t of history) {
    const d = document.createElement('div');
    d.className = 'uc-msg';
    d.textContent = t;
    $ucMsgs.appendChild(d);
  }
  $userCard.classList.remove('hidden');
  // Nahe am Klick positionieren, im Fenster clampen (erst zeigen, dann messen).
  const w = $userCard.offsetWidth, h = $userCard.offsetHeight;
  const left = Math.min(Math.max(4, evt.clientX - 20), window.innerWidth - w - 4);
  const top = Math.min(evt.clientY + 10, window.innerHeight - h - 4);
  $userCard.style.left = left + 'px';
  $userCard.style.top = top + 'px';
}

$ucCopy.addEventListener('click', () => {
  navigator.clipboard && navigator.clipboard.writeText($ucName.textContent).catch(() => {});
});

// Schliessen: Klick ausserhalb (mousedown, damit auch Scrollbar-Klicks zaehlen)
// oder Esc. Klick auf einen anderen Namen oeffnet direkt die neue Karte.
document.addEventListener('mousedown', (e) => {
  if ($userCard.classList.contains('hidden')) return;
  if ($userCard.contains(e.target)) return;
  if (e.target.classList && e.target.classList.contains('user')) return;
  closeUserCard();
});
window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') closeUserCard();
});
```

Im `window.twitchDual.onLoad(...)`-Handler zusätzlich `closeUserCard();` ergänzen (neben `hideEmoteTip();` — alte Quelle, alte Karte).

- [ ] **Step 4: Manuell verifizieren**

Run: `npm start` → Live-Kanal, auf mehrere Namen klicken (auch Vielschreiber), 📋 testen, mit Esc/Außenklick schließen; dasselbe im VOD-Replay.
Expected: Karte erscheint nahe der Nachricht, zeigt Name in Farbe + Badges + bis zu 5 letzte Nachrichten (Emotes als Text), Kopieren funktioniert, nur eine Karte gleichzeitig.

- [ ] **Step 5: `npm test` + Commit**

```bash
git add renderer/chat/index.html renderer/chat/chat.js renderer/chat/chat.css
git commit -m "feat: User-Karte mit Badges, Kopieren und letzten Nachrichten"
```

---

### Task 5: Status-Punkt + gedrosseltes Einblenden (Rest von Spec 2.2)

**Files:**
- Modify: `renderer/chat/chat.js` (Verbindungszustände, RateMeter-Integration)
- Modify: `renderer/chat/chat.css` (Punkt, Einblende-Animation)

**Interfaces:**
- Consumes: `ChatUi.createRateMeter`, `ChatUi.ANIM_MAX_RATE` (Task 1); em-Skalierung (Task 2).
- Produces: Container-Klasse `#messages.no-anim` (Task 7 lässt sie in Ruhe).

- [ ] **Step 1: `chat.css` — Status-Punkt + Nachricht-Einblenden**

```css
/* Verbindungsstatus: farbiger Punkt vor dem Text. Grau = neutral,
   gruen = verbunden, gelb pulsierend = verbinde, rot = Fehler. */
#conn { display: inline-flex; align-items: center; gap: 6px; }
#conn::before {
  content: ''; width: 8px; height: 8px; border-radius: 50%;
  background: #6e6e76; flex-shrink: 0;
}
#conn.ok::before { background: #00b16a; }
#conn.err::before { background: #eb0400; }
#conn.connecting::before {
  background: #f5a623;
  animation: conn-pulse 1.2s ease-in-out infinite;
}
@keyframes conn-pulse { 50% { opacity: .25; } }

/* Neue Nachrichten faden kurz ein - ausser der Raten-Zaehler hat bei
   Mega-Chats/VOD-Seeks .no-anim gesetzt (sonst Dauerflackern). */
.msg { animation: msg-in 150ms ease-out; }
@keyframes msg-in { from { opacity: 0; } }
#messages.no-anim .msg { animation: none; }
```

Die bestehenden Regeln `#conn.ok { color: … }` / `#conn.err { color: … }` bleiben unverändert (Text bleibt farbig). Für `.connecting` **keine** Textfarbe nötig.

- [ ] **Step 2: `chat.js` — Zustände + Drossel**

„Verbinde"-Zustände bekommen die neue Klasse:
- In `connectIrc()`: `setConn('verbinde …');` → `setConn('verbinde …', 'connecting');`
- Im `onLoad`-Handler (VOD-Zweig): `setConn('warte auf Player-Zeit …');` → `setConn('warte auf Player-Zeit …', 'connecting');`
- In `scheduleIrcReconnect()` bleibt `'err'` (rot ist hier richtig).

RateMeter: bei den Modul-Variablen oben ergänzen:

```js
const msgRate = ChatUi.createRateMeter({ windowMs: 1000 });
```

In `appendMessage()` direkt **vor** `$messages.appendChild(div);`:

```js
  // Einblende-Animation nur in ruhigen Chats; Seek-Bursts im VOD treiben
  // die Rate sofort ueber die Schwelle -> Animation ist dann automatisch aus.
  $messages.classList.toggle('no-anim', msgRate.tick(Date.now()) > ChatUi.ANIM_MAX_RATE);
```

In `createVodReplay()` im `onClear`-Callback ergänzen (Seek: erst mal ohne Animation nachfüllen):

```js
    onClear: () => { $messages.innerHTML = ''; $messages.classList.add('no-anim'); },
```

- [ ] **Step 3: Manuell verifizieren**

Run: `npm start` → kleinen Kanal laden (Einblenden sichtbar), großen Kanal laden (kein Flackern, Animation aus), VOD laden + springen (Nachfüllen ohne Animation), Netzwerk kurz trennen (gelber Puls beim Reconnect-Versuch, rot bei Fehler).
Expected: wie beschrieben; Autoscroll klebt unverändert unten.

- [ ] **Step 4: `npm test` + Commit**

```bash
git add renderer/chat/chat.js renderer/chat/chat.css
git commit -m "feat: Status-Punkt im Footer + gedrosseltes Einblenden neuer Nachrichten"
```

---

### Task 6: Home-Facelift — Live-Karten-Grid, Thumbnails, Skeleton, Hover (Spec 2.1)

**Files:**
- Modify: `renderer/video/home.js` (Grid-Rendering, `buildLiveCard`, Skeleton)
- Modify: `renderer/video/home.css` (Grid, Karten, Skeleton-Shimmer, Hover)

**Interfaces:**
- Consumes: bestehende Channel-Objekte `ch` aus `liveStatus` (`login`, `displayName`, `avatar`, `live`, `viewersLabel`, `game`, `title`, `error`) — unverändert.
- Produces: nichts, das spätere Tasks brauchen.

- [ ] **Step 1: `home.js` — Grid-Split in `renderFavorites()`**

`renderFavorites()` ersetzen durch:

```js
function renderFavorites() {
  const needle = $filterInput.value.trim().toLowerCase();
  const filtered = lastChannels.filter((ch) => matchesFilter(ch, needle));
  $favList.innerHTML = '';
  // Live-Kanaele als grosse Vorschau-Karten im Grid, offline kompakt darunter.
  const live = filtered.filter((ch) => ch.live);
  const off = filtered.filter((ch) => !ch.live);
  if (live.length) {
    const grid = document.createElement('div');
    grid.id = 'live-grid';
    for (const ch of live) grid.appendChild(buildLiveCard(ch));
    $favList.appendChild(grid);
  }
  for (const ch of off) $favList.appendChild(buildFavCard(ch));
  $favNoMatch.classList.toggle('hidden', !(lastChannels.length && !filtered.length));
}
```

- [ ] **Step 2: `home.js` — `buildLiveCard()` + Preview-URL** (nach `buildFavCard` einfügen):

```js
// Stream-Vorschau ohne API: Twitch liefert Live-Thumbnails ueber eine
// vorhersagbare CDN-URL. Cache-Buster wechselt mit dem 60-s-Refresh.
function previewUrl(login) {
  const bust = Math.floor(Date.now() / 60000);
  return `https://static-cdn.jtvnw.net/previews-ttv/live_user_${encodeURIComponent(login)}-440x248.jpg?t=${bust}`;
}

function buildLiveCard(ch) {
  const card = document.createElement('div');
  card.className = 'live-card';
  card.title = 'Klick: Stream laden';
  card.addEventListener('click', () => {
    window.twitchDual.submitLoad(ch.login);
    closeHome();
  });

  const wrap = document.createElement('div');
  wrap.className = 'lc-thumbwrap';
  const thumb = document.createElement('img');
  thumb.className = 'lc-thumb';
  thumb.src = previewUrl(ch.login);
  thumb.alt = '';
  thumb.loading = 'lazy';
  thumb.onerror = () => { thumb.style.visibility = 'hidden'; };
  wrap.appendChild(thumb);
  const liveTag = document.createElement('span');
  liveTag.className = 'lc-live';
  liveTag.textContent = 'LIVE';
  wrap.appendChild(liveTag);
  if (ch.viewersLabel) {
    const v = document.createElement('span');
    v.className = 'lc-viewers';
    v.textContent = ch.viewersLabel + ' Zuschauer';
    wrap.appendChild(v);
  }
  card.appendChild(wrap);

  const body = document.createElement('div');
  body.className = 'lc-body';
  const avatar = document.createElement('img');
  avatar.className = 'avatar';
  if (ch.avatar) avatar.src = ch.avatar;
  avatar.alt = '';
  avatar.onerror = () => { avatar.style.visibility = 'hidden'; };
  body.appendChild(avatar);
  const info = document.createElement('div');
  info.className = 'lc-info';
  const name = document.createElement('div');
  name.className = 'lc-name';
  name.textContent = ch.displayName || ch.login;
  info.appendChild(name);
  const meta = document.createElement('div');
  meta.className = 'lc-meta';
  meta.textContent = (ch.game ? ch.game : '') + (ch.title ? (ch.game ? ' — ' : '') + ch.title : '');
  info.appendChild(meta);
  body.appendChild(info);
  card.appendChild(body);

  const actions = document.createElement('div');
  actions.className = 'lc-actions';
  const vods = document.createElement('button');
  vods.className = 'vods';
  vods.textContent = 'VODs';
  vods.addEventListener('click', (e) => {
    e.stopPropagation(); // nicht den Karten-Klick (Stream laden) ausloesen
    openVods(ch.login, ch.displayName);
  });
  actions.appendChild(vods);
  const remove = document.createElement('button');
  remove.className = 'remove';
  remove.textContent = '✕';
  remove.title = 'Aus Favoriten entfernen';
  remove.addEventListener('click', async (e) => {
    e.stopPropagation();
    const r = await window.twitchDual.removeFavorite(ch.login);
    if (r.ok) { favorites = r.favorites; renderFavoritesSkeleton(); refreshLive(); }
  });
  actions.appendChild(remove);
  card.appendChild(actions);

  return card;
}
```

- [ ] **Step 3: `home.js` — Skeleton beim ersten Laden**

`renderFavoritesSkeleton()` ersetzen durch:

```js
function renderFavoritesSkeleton() {
  $favList.innerHTML = '';
  $favNoMatch.classList.add('hidden');
  if (!favorites.length) {
    lastChannels = [];
    $favEmpty.classList.remove('hidden');
    return;
  }
  $favEmpty.classList.add('hidden');
  // Nur beim allerersten Laden (noch kein Live-Status da) schimmernde
  // Platzhalter zeigen; spaetere Refreshes ersetzen die Daten in place.
  if (!lastChannels.length) {
    const grid = document.createElement('div');
    grid.id = 'live-grid';
    const n = Math.min(favorites.length, 3);
    for (let i = 0; i < n; i++) {
      const sk = document.createElement('div');
      sk.className = 'live-card skeleton';
      sk.innerHTML = '<div class="lc-thumbwrap"></div><div class="lc-body">' +
        '<div class="sk-line w60"></div></div>'; // statisches Markup, keine Fremddaten
      grid.appendChild(sk);
    }
    $favList.appendChild(grid);
  }
}
```

- [ ] **Step 4: `home.css` — Grid, Karte, Skeleton, Hover** (ans Dateiende):

```css
/* Live-Favoriten als Vorschau-Karten im Grid */
#live-grid {
  display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: 10px; margin-bottom: 12px;
}
.live-card {
  background: #18181b; border: 1px solid #202024; border-radius: 8px;
  overflow: hidden; cursor: pointer;
  transition: transform 120ms ease, box-shadow 120ms ease, border-color 120ms ease;
}
.live-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 6px 16px rgba(0,0,0,.45);
  border-color: #9147ff;
}
.lc-thumbwrap {
  position: relative; aspect-ratio: 16 / 9; background: #2a2a2d; overflow: hidden;
}
.lc-thumb {
  width: 100%; height: 100%; object-fit: cover; display: block;
  transition: transform 160ms ease;
}
.live-card:hover .lc-thumb { transform: scale(1.03); }
.lc-live {
  position: absolute; top: 6px; left: 6px;
  display: inline-flex; align-items: center; gap: 5px;
  background: rgba(0,0,0,.75); color: #fff; font-size: 11px; font-weight: 700;
  padding: 2px 7px; border-radius: 4px; text-transform: uppercase;
}
.lc-live::before {
  content: ''; width: 7px; height: 7px; border-radius: 50%;
  background: #eb0400; animation: live-pulse 1.6s ease-in-out infinite;
}
@keyframes live-pulse { 50% { opacity: .35; } }
.lc-viewers {
  position: absolute; right: 6px; bottom: 6px;
  background: rgba(0,0,0,.75); color: #fff; font-size: 11px;
  padding: 2px 6px; border-radius: 4px;
}
.lc-body { display: flex; gap: 8px; padding: 8px; align-items: center; }
.lc-body .avatar { width: 32px; height: 32px; }
.lc-info { flex: 1; min-width: 0; }
.lc-name { font-weight: 700; font-size: 13px; }
.lc-meta {
  font-size: 12px; color: #adadb8; margin-top: 2px;
  display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical;
  overflow: hidden;
}
.lc-actions {
  display: flex; gap: 6px; padding: 0 8px 8px; justify-content: flex-end;
}
.lc-actions button {
  padding: 5px 10px; border: none; border-radius: 6px; cursor: pointer;
  font-size: 12px; font-weight: 600;
}
.lc-actions .vods { background: #2a2a2d; color: #efeff1; }
.lc-actions .vods:hover { background: #3a3a3d; }
.lc-actions .remove { background: transparent; color: #7a7a82; }
.lc-actions .remove:hover { color: #eb0400; }

/* Skeleton-Platzhalter beim ersten Laden */
.live-card.skeleton { pointer-events: none; }
.live-card.skeleton .lc-thumbwrap,
.live-card.skeleton .sk-line {
  background: linear-gradient(90deg, #202024 25%, #2a2a2d 50%, #202024 75%);
  background-size: 200% 100%;
  animation: shimmer 1.2s linear infinite;
}
.sk-line { height: 12px; border-radius: 4px; }
.sk-line.w60 { width: 60%; }
@keyframes shimmer { to { background-position: -200% 0; } }
```

- [ ] **Step 5: Manuell verifizieren**

Run: `npm start` → Home öffnet automatisch. Mit ≥1 Live-Favorit: Grid-Karten mit Thumbnail, LIVE-Puls, Zuschauer-Chip; Klick auf Karte lädt Stream; VODs/✕ funktionieren ohne die Karte auszulösen; Offline-Kanäle als kompakte Zeilen darunter; Filter wirkt auf beide Gruppen; erster Aufruf zeigt kurz Skeletons.
Expected: wie beschrieben, 60-s-Refresh tauscht Thumbnails ohne Flackern.

- [ ] **Step 6: `npm test` + Commit**

```bash
git add renderer/video/home.js renderer/video/home.css
git commit -m "feat: Home-Facelift - Live-Karten-Grid mit Thumbnails, Skeleton, Hover"
```

---

### Task 7: Micro-Animationen + prefers-reduced-motion (Spec 2.3)

**Files:**
- Modify: `renderer/video/home.css` (Overlay-Einblenden, Button-Feedback, reduced-motion)
- Modify: `renderer/video/index.html` (Button-Feedback im `<style>`-Block)
- Modify: `renderer/chat/chat.css` (⚙-Popup-Animation, Button-Feedback, reduced-motion)

**Interfaces:**
- Consumes: `#messages.no-anim` (Task 5), Skeleton/Puls-Keyframes (Task 6) — reduced-motion muss auch diese abdecken.
- Produces: nichts.

- [ ] **Step 1: `home.css`** (ans Ende):

```css
/* Overlay gleitet ein. .hidden nutzt display:none - die Animation startet
   jedes Mal neu, wenn das Element sichtbar wird (Chromium-Verhalten). */
#home { animation: overlay-in 160ms ease-out; }
@keyframes overlay-in {
  from { opacity: 0; transform: translateY(8px); }
}

/* Dezentes Druck-Feedback fuer alle Buttons im Overlay */
#home button:active, #home-btn:active { transform: scale(.96); }

@media (prefers-reduced-motion: reduce) {
  #home, .lc-live::before, .live-card.skeleton .lc-thumbwrap,
  .live-card.skeleton .sk-line { animation: none; }
  .live-card, .lc-thumb { transition: none; }
  .live-card:hover { transform: none; }
  .live-card:hover .lc-thumb { transform: none; }
}
```

- [ ] **Step 2: `renderer/video/index.html`** — im `<style>`-Block ergänzen:

```css
    #bar button:active { transform: scale(.96); }
    @media (prefers-reduced-motion: reduce) {
      #bar button:active { transform: none; }
    }
```

- [ ] **Step 3: `chat.css`** (ans Ende):

```css
/* ⚙-Popup oeffnet mit Fade/Scale (display-Wechsel startet die Animation) */
#settings-pop { animation: pop-in 120ms ease-out; transform-origin: top right; }
@keyframes pop-in {
  from { opacity: 0; transform: scale(.96); }
}

button:active { transform: scale(.96); }

@media (prefers-reduced-motion: reduce) {
  #settings-pop, .msg, #conn.connecting::before { animation: none; }
  button:active { transform: none; }
}
```

- [ ] **Step 4: Manuell verifizieren**

Run: `npm start` → Home öffnen/schließen (gleitet ein), ⚙-Popup (Fade/Scale), Buttons drücken (Feedback). Dann Windows-Einstellung „Animationseffekte" aus (Einstellungen → Barrierefreiheit → visuelle Effekte) und App neu starten → alles erscheint sofort ohne Animation.
Expected: wie beschrieben.

- [ ] **Step 5: `npm test` + Commit**

```bash
git add renderer/video/home.css renderer/video/index.html renderer/chat/chat.css
git commit -m "feat: Micro-Animationen (Overlay, Popup, Buttons) mit reduced-motion-Fallback"
```

---

### Task 8: Abschluss — Version 1.4.0, TODO.md, Smoke-Test

**Files:**
- Modify: `package.json` (`"version": "1.4.0"`)
- Modify: `docs/TODO.md` (Erledigt-Eintrag v1.4.0, „Ideen für später" bereinigen)

**Interfaces:**
- Consumes: alle vorigen Tasks.
- Produces: release-fertiger Stand `master`.

- [ ] **Step 1: Voller Testlauf**

Run: `npm test`
Expected: PASS, alle Testdateien (inkl. `chat-ui.test.js`), 0 Failures.

- [ ] **Step 2: Smoke-Test laut Spec**

Run: `npm start` und durchklicken:
1. Live-Chat großer Kanal (Emotes, Badges, Tooltip, User-Karte, Autoscroll)
2. VOD laden + mehrfach springen (Chat synchron, kein Animations-Flackern)
3. Home-Overlay mit ≥1 Live-Favorit (Grid, Thumbnail, Klick lädt)
4. Schriftgrößen-Slider + Neustart (persistent)

Expected: alles funktioniert; besonders Autoscroll klebt unten wie in v1.3.3.

- [ ] **Step 3: Version + Doku**

`package.json`: `"version": "1.3.3"` → `"version": "1.4.0"`.

`docs/TODO.md`: Unter „Erledigt" neuen Abschnitt einfügen:

```markdown
**Komfort & Design (v1.4.0)**
- Chat: Schriftgroessen-Slider (11-22px, chatPrefs.fontSize, em-Skalierung
  fuer Emotes/Badges/Zeitstempel + negative Emote-Margins = ruhige Zeilen).
- Emote-Tooltip (Delegation, ein fixed-Overlay): Vorschau, Name, Quelle
  (Twitch/7TV/BTTV/FFZ aus URL, ChatUi.emoteProvider).
- User-Karte bei Namensklick: Badges, Kopieren, letzte 5 Nachrichten aus
  dem DOM-Puffer (ChatUi.lastMessagesOf). Kopieren-Klick entfaellt direkt.
- Status-Punkt im Footer (ok/err/connecting), Einblende-Animation neuer
  Nachrichten mit Raten-Drossel (ChatUi.createRateMeter, >5/s aus).
- Home: Live-Favoriten als Karten-Grid mit CDN-Thumbnails
  (previews-ttv, 60s-Cache-Buster), LIVE-Puls, Skeleton-Loader, Hover.
- Micro-Animationen (Overlay/Popup/Buttons), prefers-reduced-motion.
- Neue DOM-freie Lib renderer/lib/chat-ui.js (unit-getestet).
```

Außerdem in „Ideen für später" die Zeile zu „Chat-Einstellungen: Schriftgröße, …" streichen (jetzt umgesetzt).

- [ ] **Step 4: Commit**

```bash
git add package.json docs/TODO.md
git commit -m "chore: Version 1.4.0 + Roadmap-Eintrag Komfort & Design"
```

- [ ] **Step 5: Release (nach Nutzer-Freigabe)**

Ablauf laut `docs/TODO.md` („Neue Version veröffentlichen"): push, `npm run dist`, EXE/Blockmap auf Bindestrich-Namen kopieren, `gh release create v1.4.0 …`. **Vorher beim Nutzer rückfragen**, ob released werden soll.
