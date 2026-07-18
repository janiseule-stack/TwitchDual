# Status-/Info-Elemente aufräumen — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Die kleinen Status-/Info-Elemente in TwitchDual konsistent zwischen Video- und Chat-Fenster anordnen und ins Neon-Dual-Theme einpassen (On-Air, Status-Punkt, Footer-Puls, ⚙, Settings-Popup, Ads-Button).

**Architecture:** Fast alles ist CSS/HTML in den beiden Renderer-Fenstern. Einzige neue Logik ist eine reine, testbare Funktion `rateHeat` in `chat-ui.js`, die die Puls-Intensität aus der msg/min-Rate ableitet. Der On-Air-Zustand bleibt CSS-getrieben über das bestehende `body.onair` — `theme.js`/`onAirState()` wird **nicht** angefasst.

**Tech Stack:** Electron 33, Vanilla JS (UMD-Libs), CSS-Variablen. Node test runner (`node:test`) für die Unit-Tests.

## Global Constraints

- **Keine neuen Dependencies.** Vanilla only.
- **`renderer/lib/theme.js` bleibt unverändert** — `test/theme.test.js` muss grün bleiben.
- **Alle Farben über Akzent-Variablen** (`--accent`, `--accent-title`, `--accent-glow`, `--accent-border`, `--accent-dim`) — keine fest verdrahteten Farben (außer Rot `#eb0400`/`#eb4034` für Fehler). Der Farbwähler muss live durchschlagen.
- **On-Air-Leiste feste Höhe (16px) in jedem Zustand** — kein Layout-Sprung beim Live-Gehen.
- **Animationen immer an** (kein `prefers-reduced-motion`-Handling — bewusste Projekt-Entscheidung).
- **Deutsche UI-Texte exakt** wie in der Umbenennungs-Tabelle.
- `npm test` komplett grün vor jedem Commit.
- Präzise Umbenennungen (verbatim): Gruppe **Darstellung**; **Zeitstempel**, **Badges**, **Schriftgröße**, **Video-Akzent**, **Chat-Akzent**, **Deckkraft (Chat)**, **Farben zurücksetzen**.

---

### Task 1: `rateHeat` — Puls-Intensität aus der Rate (TDD)

**Files:**
- Modify: `renderer/lib/chat-ui.js` (Funktion + Export)
- Test: `test/chat-ui.test.js`

**Interfaces:**
- Produces: `ChatUi.rateHeat(n: number, max = 120): number` → 0..1, geclampt.

- [ ] **Step 1: Failing test schreiben**

In `test/chat-ui.test.js` ans Ende (vor evtl. schließender Klammer, als eigener Block) ergänzen:

```js
const { test } = require('node:test');
const assert = require('node:assert');
const ChatUi = require('../renderer/lib/chat-ui.js');

test('rateHeat: 0 msg/min -> 0', () => {
  assert.strictEqual(ChatUi.rateHeat(0), 0);
});
test('rateHeat: an der Obergrenze -> 1', () => {
  assert.strictEqual(ChatUi.rateHeat(120), 1);
});
test('rateHeat: darueber wird geclampt auf 1', () => {
  assert.strictEqual(ChatUi.rateHeat(500), 1);
});
test('rateHeat: negativ -> 0', () => {
  assert.strictEqual(ChatUi.rateHeat(-5), 0);
});
test('rateHeat: Mitte -> 0.5', () => {
  assert.strictEqual(ChatUi.rateHeat(60), 0.5);
});
test('rateHeat: eigener max-Wert', () => {
  assert.strictEqual(ChatUi.rateHeat(30, 60), 0.5);
});
```

> Hinweis: Falls `test/chat-ui.test.js` `require`/`test`/`assert` schon oben importiert, die doppelten `const`-Zeilen weglassen und nur die `test(...)`-Blöcke einfügen.

- [ ] **Step 2: Test laufen lassen, Fehlschlag prüfen**

Run: `npm test`
Expected: FAIL — `ChatUi.rateHeat is not a function`.

- [ ] **Step 3: Funktion implementieren**

In `renderer/lib/chat-ui.js` neben `createRateMeter` (vor dem `return { ... }`-Block) einfügen:

```js
  // 0..1: wie „heiss" der Chat gerade ist (msg/min gegen eine Obergrenze).
  // Treibt Glow/Groesse des Puls-Punkts im Footer. Rein, damit testbar.
  function rateHeat(n, max = 120) {
    if (!(max > 0)) return 0;
    return Math.max(0, Math.min(1, n / max));
  }
```

Und den Export erweitern — aus:

```js
  return {
    clampFontSize, emoteProvider, lastMessagesOf, createRateMeter,
    FONT_MIN, FONT_MAX, FONT_DEFAULT, ANIM_MAX_RATE
  };
```

wird:

```js
  return {
    clampFontSize, emoteProvider, lastMessagesOf, createRateMeter, rateHeat,
    FONT_MIN, FONT_MAX, FONT_DEFAULT, ANIM_MAX_RATE
  };
```

- [ ] **Step 4: Test laufen lassen, grün prüfen**

Run: `npm test`
Expected: PASS (alle, inkl. der 6 neuen `rateHeat`-Tests und der bestehenden theme/chat-ui-Tests).

- [ ] **Step 5: Commit**

```bash
git add renderer/lib/chat-ui.js test/chat-ui.test.js
git commit -m "feat(chat): rateHeat — Puls-Intensitaet aus der msg/min-Rate"
```

---

### Task 2: On-Air als ein Objekt auf der Leiste (beide Fenster)

**Files:**
- Modify: `renderer/video/index.html` (HTML `#onair-bar`, `#onair-tag` entfernen; inline `<style>`)
- Modify: `renderer/chat/index.html` (HTML `#onair-bar`, `#onair-tag` entfernen)
- Modify: `renderer/chat/chat.css` (onair-bar-CSS)

**Interfaces:**
- Produces: `body.onair` steuert Linie + Label (bereits von `updateOnAir()` gesetzt — keine JS-Änderung).

- [ ] **Step 1: Video-HTML — onair-bar umbauen, Tag entfernen**

In `renderer/video/index.html`: die Zeile

```html
  <div id="onair-bar"></div>
```

ersetzen durch:

```html
  <div id="onair-bar">
    <span class="oa-line"></span>
    <span id="oa-label">● ON AIR</span>
  </div>
```

Und im `.bar-right` die Zeile entfernen:

```html
      <span id="onair-tag">● ON AIR</span>
```

- [ ] **Step 2: Video-CSS — onair-bar-Block ersetzen**

In `renderer/video/index.html` im inline `<style>` den Block

```css
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
```

ersetzen durch:

```css
    #onair-bar {
      display: flex; align-items: center; gap: 10px; height: 16px;
      padding: 0 12px; flex-shrink: 0;
    }
    #onair-bar .oa-line {
      flex: 1; height: 2px; border-radius: 2px;
      background: linear-gradient(90deg, var(--onair-from), var(--onair-to));
      opacity: .22;
    }
    body.onair #onair-bar .oa-line {
      opacity: 1; box-shadow: 0 0 8px var(--accent-glow);
      animation: onair-pulse 1.6s ease-in-out infinite;
    }
    @keyframes onair-pulse { 50% { opacity: .55; } }
    #oa-label {
      font-family: var(--mono); font-size: 10px; font-weight: 700;
      letter-spacing: .14em; white-space: nowrap;
      background: linear-gradient(90deg, var(--onair-from), var(--onair-to));
      -webkit-background-clip: text; background-clip: text; color: transparent;
      opacity: 0; transition: opacity .25s;
    }
    body.onair #oa-label { opacity: 1; }
```

> Die separate `#status { font-family: var(--mono); }`-Zeile darunter bleibt stehen.

- [ ] **Step 3: Chat-HTML — onair-bar umbauen, Tag entfernen**

In `renderer/chat/index.html`: die Zeile

```html
  <div id="onair-bar"></div>
```

ersetzen durch:

```html
  <div id="onair-bar">
    <span class="oa-line"></span>
    <span id="oa-label">● ON AIR</span>
  </div>
```

Und im `#head` die Zeile entfernen:

```html
    <span id="onair-tag">● ON AIR</span>
```

- [ ] **Step 4: Chat-CSS — onair-bar-Block ersetzen**

In `renderer/chat/chat.css` den Block (im Abschnitt „Neon Dual – On Air")

```css
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
```

ersetzen durch:

```css
#onair-bar {
  display: flex; align-items: center; gap: 10px; height: 16px;
  padding: 0 12px; flex-shrink: 0;
}
#onair-bar .oa-line {
  flex: 1; height: 2px; border-radius: 2px;
  background: linear-gradient(90deg, var(--onair-from), var(--onair-to));
  opacity: .22;
}
body.onair #onair-bar .oa-line {
  opacity: 1; box-shadow: 0 0 8px var(--accent-glow);
  animation: onair-pulse 1.6s ease-in-out infinite;
}
@keyframes onair-pulse { 50% { opacity: .55; } }

/* ON-AIR-Schriftzug: Verlaufs-Text am rechten Ende der Leiste, nur wenn on air. */
#oa-label {
  font-family: var(--mono); font-size: 10px; font-weight: 700;
  letter-spacing: .14em; white-space: nowrap;
  background: linear-gradient(90deg, var(--onair-from), var(--onair-to));
  -webkit-background-clip: text; background-clip: text; color: transparent;
  opacity: 0; transition: opacity .25s;
}
body.onair #oa-label { opacity: 1; }
```

- [ ] **Step 5: Verifizieren (Test grün + visuell)**

Run: `npm test` → Expected: PASS (unverändert).
Visuell: Video- und Chat-Fenster starten bzw. per Screenshot-Harness rendern; live = `● ON AIR` rechts auf glühender Leiste, dimmed = nur dünne Linie, **keine Höhenänderung** zwischen den Zuständen. Kein `#onair-tag` mehr in den Köpfen.

- [ ] **Step 6: Commit**

```bash
git add renderer/video/index.html renderer/chat/index.html renderer/chat/chat.css
git commit -m "feat(ui): On-Air als ein Objekt auf der Leiste (beide Fenster, feste Hoehe)"
```

---

### Task 3: Video-Status-Punkt + Ads-Button akzentgebunden

**Files:**
- Modify: `renderer/video/index.html` (inline `<style>` — `#status`, `#adblock-toggle.on`)

**Interfaces:**
- Consumes: `body.onair` (Task 2), `#status.err` (bereits von `setStatus(text, true)` gesetzt).

- [ ] **Step 1: `#status`-Punkt ergänzen**

In `renderer/video/index.html` die Zeile

```css
    #status { font-size: 12px; color: var(--muted); white-space: nowrap; }
    #status.err { color: #eb4034; }
```

ersetzen durch:

```css
    #status {
      font-size: 12px; color: var(--muted); white-space: nowrap;
      display: inline-flex; align-items: center; gap: 6px;
    }
    #status::before {
      content: ''; width: 8px; height: 8px; border-radius: 50%;
      background: var(--ts); flex-shrink: 0;
    }
    body.onair #status::before { background: var(--accent); box-shadow: 0 0 6px var(--accent-dim); }
    #status.err { color: #eb4034; }
    #status.err::before { background: #eb4034; box-shadow: none; }
```

- [ ] **Step 2: Ads-Button `.on` auf Akzent umstellen**

In `renderer/video/index.html` die Zeile

```css
    #adblock-toggle.on { background: #1f3d1f; border-color: #3fa34d; color: #eafbea; }
```

ersetzen durch:

```css
    #adblock-toggle.on {
      background: var(--accent-glow); border-color: var(--accent-border);
      color: var(--accent-title); box-shadow: 0 0 10px -3px var(--accent);
    }
```

- [ ] **Step 3: Verifizieren**

Run: `npm test` → PASS (unverändert).
Visuell: Video live = Cyan Status-Punkt + Glow; „bereit" = grauer Punkt; Fehler = roter Punkt. `🛡 Ads` aktiv = Cyan-getönt statt Grün. Video-Akzent im ⚙ ändern → Punkt + Ads-Ton ziehen mit.

- [ ] **Step 4: Commit**

```bash
git add renderer/video/index.html
git commit -m "feat(video): Status-Punkt-Muster + Ads-Button akzentgebunden statt gruen"
```

---

### Task 4: Chat-Footer — conn links, Aktivität rechts, Puls-Punkt

**Files:**
- Modify: `renderer/chat/chat.css` (`#footer`, `#rate`)
- Modify: `renderer/chat/chat.js` (`tickRateDisplay`, `appendMessage`, `pingRate`)

**Interfaces:**
- Consumes: `ChatUi.rateHeat` (Task 1), `ChatUi.ANIM_MAX_RATE`, `msgRate`, `minuteRate` (bestehend).

- [ ] **Step 1: Footer-Layout + Puls-Punkt-CSS**

In `renderer/chat/chat.css` den Block

```css
#footer {
  padding: 5px 12px; background: var(--panel);
  border-top: 1px solid var(--line); font-size: 11px; color: var(--muted);
}
```

ersetzen durch:

```css
#footer {
  padding: 5px 12px; background: var(--panel);
  border-top: 1px solid var(--line); font-size: 11px; color: var(--muted);
  display: flex; align-items: center; justify-content: space-between;
}
```

Und die Zeile

```css
#rate { margin-left: 8px; color: var(--ts); }
```

ersetzen durch:

```css
#rate {
  display: inline-flex; align-items: center; gap: 6px; margin-left: 0;
  color: var(--muted);
}
#rate:empty::before { display: none; }
#rate::before {
  content: ''; width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0;
  background: var(--accent);
  box-shadow: 0 0 var(--rate-glow, 6px) var(--accent-dim);
  transform: scale(1);
}
#rate.ping::before { animation: rate-ping 320ms ease-out; }
@keyframes rate-ping {
  0% { transform: scale(1.7); box-shadow: 0 0 14px var(--accent); }
  100% { transform: scale(1); }
}
```

- [ ] **Step 2: `tickRateDisplay` — Glow aus `rateHeat` setzen**

In `renderer/chat/chat.js` die Funktion

```js
function tickRateDisplay(now) {
  const n = minuteRate.tick(now);
  if (n !== rateShown) { rateShown = n; $rate.textContent = n + ' msg/min'; }
}
```

ersetzen durch:

```js
function tickRateDisplay(now) {
  const n = minuteRate.tick(now);
  if (n !== rateShown) {
    rateShown = n;
    $rate.textContent = n + ' msg/min';
    // Glow waechst mit der Rate (rein aus ChatUi.rateHeat, 0..1).
    $rate.style.setProperty('--rate-glow', (6 + ChatUi.rateHeat(n) * 12) + 'px');
  }
}

// Puls-Punkt kurz aufblitzen (Animation via Reflow neu starten).
function pingRate() {
  $rate.classList.remove('ping');
  void $rate.offsetWidth;
  $rate.classList.add('ping');
}
```

- [ ] **Step 3: `appendMessage` — pro Nachricht pulsen (gedrosselt)**

In `renderer/chat/chat.js` die zwei Zeilen

```js
  $messages.classList.toggle('no-anim', msgRate.tick(Date.now()) > ChatUi.ANIM_MAX_RATE);
  tickRateDisplay(Date.now());
```

ersetzen durch:

```js
  const rateNow = Date.now();
  const busy = msgRate.tick(rateNow) > ChatUi.ANIM_MAX_RATE;
  $messages.classList.toggle('no-anim', busy);
  tickRateDisplay(rateNow);
  // Diskreter Blitz nur in ruhigen Chats; bei Mega-Chats/Seeks bleibt es beim
  // stetigen Glow (kein Flackern) — gleiche Schwelle wie die Einblende-Drossel.
  if (!busy) pingRate();
```

- [ ] **Step 4: Verifizieren**

Run: `npm test` → PASS.
Visuell: Footer breit = `● verbunden` links, `● 42 msg/min` rechts; Punkt blitzt je Nachricht und glüht bei hoher Rate stärker; leerer `#rate` (idle) zeigt **keinen** Punkt.

- [ ] **Step 5: Commit**

```bash
git add renderer/chat/chat.css renderer/chat/chat.js
git commit -m "feat(chat): Footer conn/Rate ausbalanciert + Puls-Punkt (rateHeat)"
```

---

### Task 5: Chat-Kopf ⚙ rechts + Settings-Popup Theme & Namen

**Files:**
- Modify: `renderer/chat/chat.css` (`#settings-btn`, `#settings-pop`, `.opt-group-title`, Popup-Inputs)
- Modify: `renderer/chat/index.html` (Popup-Umbenennungen)

**Interfaces:** keine (rein CSS/HTML).

- [ ] **Step 1: ⚙ fest zur rechten Gruppe**

In `renderer/chat/chat.css` beim `#settings-btn`-Block die `margin-left: auto;`-Regel ergänzen. Aus

```css
#settings-btn {
  -webkit-app-region: no-drag;
  background: none; border: none; color: var(--muted);
  font-size: 14px; cursor: pointer; padding: 0 2px; line-height: 1;
}
```

wird:

```css
#settings-btn {
  -webkit-app-region: no-drag;
  background: none; border: none; color: var(--muted);
  font-size: 14px; cursor: pointer; padding: 0 2px; line-height: 1;
  margin-left: auto; /* ⚙ + Fenster-Buttons rechts buendeln, Titel bleibt links */
}
```

- [ ] **Step 2: Popup-Styling aufs Theme**

In `renderer/chat/chat.css` den `#settings-pop`-Block

```css
#settings-pop {
  position: absolute; top: 34px; right: 8px; z-index: 10;
  background: var(--hover); border: 1px solid var(--line); border-radius: 8px;
  padding: 4px; font-size: 12px; min-width: 236px;
  display: flex; flex-direction: column;
  box-shadow: 0 6px 16px rgba(0,0,0,.5);
}
```

ersetzen durch:

```css
#settings-pop {
  position: absolute; top: 34px; right: 8px; z-index: 10;
  background: var(--panel); border: 1px solid var(--accent-border); border-radius: 8px;
  padding: 4px; font-size: 12px; min-width: 236px;
  display: flex; flex-direction: column;
  box-shadow: 0 10px 28px rgba(0,0,0,.6), inset 0 0 30px -16px var(--accent-glow);
}
#settings-pop input[type="checkbox"] { accent-color: var(--accent); width: 14px; height: 14px; }
#settings-pop input[type="range"] { accent-color: var(--accent); }
```

Und die `.opt-group-title`-Regel — aus

```css
.opt-group-title {
  font-size: 10px; text-transform: uppercase; letter-spacing: .08em;
  color: var(--muted); margin-bottom: 1px;
}
```

wird (nur `color` ändern):

```css
.opt-group-title {
  font-size: 10px; text-transform: uppercase; letter-spacing: .08em;
  color: var(--accent-title); opacity: .9; margin-bottom: 1px;
}
```

Und beim `#opt-color-reset` die Farb-/Rahmenwerte auf Akzent ziehen — aus

```css
#opt-color-reset {
  margin: 6px 6px 4px; align-self: stretch; text-align: center;
  background: var(--panel); border: 1px solid var(--line); border-radius: 6px;
  color: var(--muted); font-size: 12px; padding: 6px 8px; cursor: pointer;
}
```

wird:

```css
#opt-color-reset {
  margin: 6px 6px 4px; align-self: stretch; text-align: center;
  background: var(--hover); border: 1px solid var(--accent-border); border-radius: 6px;
  color: var(--accent-title); font-size: 12px; padding: 6px 8px; cursor: pointer;
}
```

- [ ] **Step 3: Popup-Umbenennungen (HTML)**

In `renderer/chat/index.html` im `#settings-pop` ersetzen:

- `<label class="opt-check"><input type="checkbox" id="opt-ts" checked /> Zeitstempel anzeigen</label>`
  → `<label class="opt-check"><input type="checkbox" id="opt-ts" checked /> Zeitstempel</label>`
- `<label class="opt-check"><input type="checkbox" id="opt-badges" checked /> Badges anzeigen</label>`
  → `<label class="opt-check"><input type="checkbox" id="opt-badges" checked /> Badges</label>`
- `<label id="opt-font-row" class="opt-row">Schrift` → `<label id="opt-font-row" class="opt-row">Schriftgröße`
- `<div class="opt-group-title">Fenster</div>` → `<div class="opt-group-title">Darstellung</div>`
- `<label class="opt-color-row opt-row">Video-Farbe` → `<label class="opt-color-row opt-row">Video-Akzent`
- `<label class="opt-color-row opt-row">Chat-Farbe` → `<label class="opt-color-row opt-row">Chat-Akzent`
- `<label class="opt-alpha-row opt-row">Deckkraft` → `<label class="opt-alpha-row opt-row">Deckkraft (Chat)`
- `<button id="opt-color-reset" type="button">Zurücksetzen</button>` → `<button id="opt-color-reset" type="button">Farben zurücksetzen</button>`

> Die erste Gruppen-Überschrift `<div class="opt-group-title">Chat</div>` bleibt unverändert.

- [ ] **Step 4: Verifizieren**

Run: `npm test` → PASS.
Visuell: ⚙ sitzt rechts neben den Fenster-Buttons; Popup mit Akzent-Rahmen + Glow, Checkboxen/Slider in Chat-Akzentfarbe, lesbare Überschriften, neue Namen. Chat-Akzent im ⚙ ändern → Popup-Chrome zieht mit.

- [ ] **Step 5: Commit**

```bash
git add renderer/chat/index.html renderer/chat/chat.css
git commit -m "feat(chat): ⚙ rechts + Settings-Popup Theme & praezisere Namen"
```

---

### Task 6: Integrierte visuelle Verifikation (echte Dateien)

**Files:** keine (nur Verifikation).

- [ ] **Step 1: Screenshots der echten (geänderten) Dateien**

Den Screenshot-Harness `scratchpad/shot.js` **ohne** die `PROPOSED_JS`/`POLISH_JS`-Injektion auf die echten Dateien anwenden (nur Zustände setzen: `onair`, Status-Text, Messages, conn/rate, Popup öffnen, adblock `.on`) und nach `design-screens/final/` rendern. Zustände live + idle für Video und Chat, plus Popup und Ads-Button.

- [ ] **Step 2: Sichtprüfung gegen `design-screens/proposed/`**

Vergleichen: On-Air-Leiste (feste Höhe, Label rechts), Status-Punkte, Footer-Balance + Puls, ⚙ rechts, Popup-Theme/Namen, Ads-Ton. Bei breitem Fenster prüfen (3-Spalten-Grid im Video nicht gebrochen).

- [ ] **Step 3: Volle Test-Suite**

Run: `npm test`
Expected: PASS (inkl. `test/theme.test.js` unverändert grün, neue `rateHeat`-Tests grün).

- [ ] **Step 4: Final-Screenshot dem Nutzer vorlegen**

Breite Live-Screenshots (Video + Chat) an den Nutzer zur **finalen Bestätigung**. Erst danach folgt (separat, gated) Version-Bump 1.6.0 → 1.7.0 + Release nach `docs/TODO.md` + Memory-Update `twitchdual-project`.

---

## Self-Review

**Spec coverage:**
- On-Air auf Leiste → Task 2 ✓
- Status-Punkt-Muster (Video) → Task 3 ✓ (Chat `#conn` hat es bereits)
- Footer conn/Rate + Puls → Task 1 (rateHeat) + Task 4 ✓
- ⚙ rechts → Task 5 Step 1 ✓
- Popup Theme + Namen → Task 5 ✓
- Ads-Button akzentgebunden → Task 3 Step 2 ✓
- Akzent-Binding durchgängig → Tasks 3/4/5 nutzen `var(--accent*)` ✓
- `theme.js` unverändert → keine Task fasst es an ✓
- Feste On-Air-Höhe → Task 2 (`height: 16px`) ✓
- Tests grün / neue Tests → Task 1 + Task 6 ✓

**Placeholder-Scan:** keine TBD/TODO; jeder Code-Schritt zeigt vollständigen Code. ✓

**Type-Konsistenz:** `rateHeat(n, max)` in Task 1 definiert, in Task 4 als `ChatUi.rateHeat(n)` genutzt (max default) ✓. `pingRate`/`tickRateDisplay` konsistent benannt ✓. CSS-Variablen `--rate-glow`/`--rate-scale`: nur `--rate-glow` wird genutzt (JS setzt es, CSS liest es); `rate-ping`-Keyframe nutzt `transform` direkt — keine ungenutzte Variable referenziert ✓.
