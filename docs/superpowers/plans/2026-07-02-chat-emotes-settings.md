# Native Twitch-Emotes + Chat-Einstellungen (v1.1.0) — Implementierungsplan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Offizielle Twitch-Emotes als Bild im Live-Chat und VOD-Replay rendern, plus ⚙-Menü zum Ausblenden von Zeitstempeln/Badges — Release als v1.1.0.

**Architecture:** Zwei neue, DOM-freie Parser-Funktionen erzeugen Token-Listen (`text`|`emote`) aus dem IRC-`emotes=`-Tag bzw. den VOD-Kommentar-Fragmenten; `appendMessage` in `chat.js` rendert künftig Tokens statt Rohtext (Text-Tokens laufen weiterhin durch die 7TV-Ersetzung). Die Einstellungen wirken über CSS-Klassen am Nachrichten-Container und werden via electron-store persistiert.

**Tech Stack:** Electron 33, Vanilla JS (UMD-Module in `renderer/lib/`), `node --test` + `node:assert`.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-07-02-chat-emotes-settings-design.md`.
- Kein `innerHTML` für Nachrichteninhalte (XSS) — DOM nur über `createElement`/`textContent`.
- Neue lib-Funktionen als UMD wie bestehende (`renderer/lib/*.js`), damit Browser + Node-Tests funktionieren.
- Emote-Bild-URL nur an EINER Stelle ableiten: `EmoteText.twitchEmoteUrl`.
- IRC-Emote-Ranges zählen **Codepoints** → immer `Array.from(text)`, nie `text[i]`.
- Parser dürfen nie werfen; kaputte Eingaben → Text-Fallback.
- Projektsprache Deutsch (Kommentare/Commits), ASCII-nahe Kommentare wie im Bestand (ue/oe/ae).
- Vor und nach jeder Änderung: `npm test` (Arbeitsverzeichnis `C:\Users\janis\TwitchDual`) — alle Tests müssen grün sein.
- Commits enden mit `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.

---

### Task 1: `EmoteText.twitchEmoteUrl` — zentrale CDN-URL-Ableitung

**Files:**
- Modify: `renderer/lib/emote-text.js` (37 Zeilen, UMD-Factory am Ende erweitern)
- Test: `test/emote-text.test.js` (anhängen)

**Interfaces:**
- Produces: `EmoteText.twitchEmoteUrl(id: string|number) => string` — URL
  `https://static-cdn.jtvnw.net/emoticons/v2/<id>/default/dark/1.0`.
  Wird von Task 4 (Rendering) benutzt; Tasks 2/3 liefern nur Emote-**IDs**.

- [ ] **Step 1: Fehlschlagenden Test schreiben** — in `test/emote-text.test.js` anhängen:

```js
test('twitchEmoteUrl: baut CDN-URL aus der Emote-ID', () => {
  assert.equal(
    EmoteText.twitchEmoteUrl('25'),
    'https://static-cdn.jtvnw.net/emoticons/v2/25/default/dark/1.0'
  );
  assert.equal(
    EmoteText.twitchEmoteUrl(305954156),
    'https://static-cdn.jtvnw.net/emoticons/v2/305954156/default/dark/1.0'
  );
  // emotesv2-IDs enthalten Unterstriche -> unveraendert durchreichen
  assert.equal(
    EmoteText.twitchEmoteUrl('emotesv2_abc123'),
    'https://static-cdn.jtvnw.net/emoticons/v2/emotesv2_abc123/default/dark/1.0'
  );
});
```

Hinweis: Prüfen, wie `test/emote-text.test.js` importiert — falls dort `const { tokenize } = require(...)` steht, stattdessen das ganze Modul als `EmoteText` requiren oder `twitchEmoteUrl` zusätzlich destrukturieren.

- [ ] **Step 2: Test laufen lassen — muss fehlschlagen**

Run: `npm test`
Expected: FAIL (`twitchEmoteUrl is not a function`)

- [ ] **Step 3: Minimal implementieren** — in `renderer/lib/emote-text.js` vor `return { tokenize };`:

```js
  // Offizielle Twitch-Emotes: Bild-URL ist rein aus der ID ableitbar
  // (statischer CDN, kein API-Call). Einzige Stelle fuer dieses URL-Schema.
  function twitchEmoteUrl(id) {
    return 'https://static-cdn.jtvnw.net/emoticons/v2/' +
      encodeURIComponent(String(id)) + '/default/dark/1.0';
  }

  return { tokenize, twitchEmoteUrl };
```

(Die bisherige Zeile `return { tokenize };` ersetzen.)

- [ ] **Step 4: Test laufen lassen — muss bestehen**

Run: `npm test`
Expected: PASS (alle Tests grün)

- [ ] **Step 5: Commit**

```bash
git add renderer/lib/emote-text.js test/emote-text.test.js
git commit -m "Emotes: twitchEmoteUrl als zentrale CDN-URL-Ableitung"
```

---

### Task 2: `IrcParse.emoteTokens` — IRC-`emotes=`-Tag in Tokens zerlegen

**Files:**
- Modify: `renderer/lib/irc.js` (vor `return { parseIrc, badgeTypes, privmsgText };`)
- Test: `test/irc.test.js` (anhängen)

**Interfaces:**
- Produces: `IrcParse.emoteTokens(text: string, emotesTag: string) =>`
  `Array<{ type: 'text', value: string } | { type: 'emote', name: string, id: string }>`
  — `name` ist der Emote-Text (z. B. `Kappa`), `id` die Twitch-Emote-ID als String.
  Tag-Format: `25:0-4,12-16/1902:6-10` (ID, dann Codepoint-Ranges inkl. Ende).
  Leerer/kaputter Tag → alles als Text-Token. Leerer Text → `[]`.

- [ ] **Step 1: Fehlschlagende Tests schreiben** — in `test/irc.test.js` anhängen (Import oben um `emoteTokens` erweitern):

```js
test('emoteTokens: ein Emote mitten im Text', () => {
  assert.deepEqual(emoteTokens('hi Kappa hi', '25:3-7'), [
    { type: 'text', value: 'hi ' },
    { type: 'emote', name: 'Kappa', id: '25' },
    { type: 'text', value: ' hi' }
  ]);
});

test('emoteTokens: mehrere Emotes, mehrfaches Vorkommen', () => {
  // "Kappa hi Kappa VoHiYo" -> 25 an 0-4 und 9-13, 81274 an 15-20
  assert.deepEqual(emoteTokens('Kappa hi Kappa VoHiYo', '25:0-4,9-13/81274:15-20'), [
    { type: 'emote', name: 'Kappa', id: '25' },
    { type: 'text', value: ' hi ' },
    { type: 'emote', name: 'Kappa', id: '25' },
    { type: 'text', value: ' ' },
    { type: 'emote', name: 'VoHiYo', id: '81274' }
  ]);
});

test('emoteTokens: Ranges zaehlen Codepoints (Emoji davor)', () => {
  // Das Herz ist EIN Codepoint mit 2 UTF-16-Einheiten; Twitch zaehlt Codepoints.
  assert.deepEqual(emoteTokens('💜 Kappa', '25:2-6'), [
    { type: 'text', value: '💜 ' },
    { type: 'emote', name: 'Kappa', id: '25' }
  ]);
});

test('emoteTokens: leerer/kaputter Tag -> reiner Text, wirft nie', () => {
  assert.deepEqual(emoteTokens('nur text', ''), [{ type: 'text', value: 'nur text' }]);
  assert.deepEqual(emoteTokens('nur text', null), [{ type: 'text', value: 'nur text' }]);
  // Range ausserhalb des Texts / verkehrt herum -> ignorieren
  assert.deepEqual(emoteTokens('kurz', '25:0-99'), [{ type: 'text', value: 'kurz' }]);
  assert.deepEqual(emoteTokens('kurz', '25:3-1'), [{ type: 'text', value: 'kurz' }]);
  assert.deepEqual(emoteTokens('kurz', 'kaputt'), [{ type: 'text', value: 'kurz' }]);
  assert.deepEqual(emoteTokens('', '25:0-4'), []);
});
```

- [ ] **Step 2: Tests laufen lassen — müssen fehlschlagen**

Run: `npm test`
Expected: FAIL (`emoteTokens is not a function` bzw. nicht exportiert)

- [ ] **Step 3: Implementieren** — in `renderer/lib/irc.js` vor dem `return`:

```js
  // emotes-Tag ("25:0-4,12-16/1902:6-10") + Text -> Token-Liste fuer das
  // Rendering. Die Ranges zaehlen CODEPOINTS (nicht UTF-16-Einheiten!),
  // deshalb Array.from. Kaputte/ueberlappende Ranges werden ignoriert,
  // die Funktion wirft nie (Fallback: alles Text).
  function emoteTokens(text, emotesTag) {
    const cps = Array.from(String(text || ''));
    const ranges = [];
    for (const part of String(emotesTag || '').split('/')) {
      const colon = part.indexOf(':');
      if (colon <= 0) continue;
      const id = part.slice(0, colon);
      for (const r of part.slice(colon + 1).split(',')) {
        const m = /^(\d+)-(\d+)$/.exec(r);
        if (!m) continue;
        const start = Number(m[1]);
        const end = Number(m[2]);
        if (start > end || end >= cps.length) continue;
        ranges.push({ start, end, id });
      }
    }
    ranges.sort((a, b) => a.start - b.start);

    const tokens = [];
    let pos = 0;
    for (const r of ranges) {
      if (r.start < pos) continue; // Ueberlappung -> ignorieren
      if (r.start > pos) {
        tokens.push({ type: 'text', value: cps.slice(pos, r.start).join('') });
      }
      tokens.push({
        type: 'emote',
        name: cps.slice(r.start, r.end + 1).join(''),
        id: r.id
      });
      pos = r.end + 1;
    }
    if (pos < cps.length) {
      tokens.push({ type: 'text', value: cps.slice(pos).join('') });
    }
    return tokens;
  }
```

Und den Export erweitern:

```js
  return { parseIrc, badgeTypes, privmsgText, emoteTokens };
```

- [ ] **Step 4: Tests laufen lassen — müssen bestehen**

Run: `npm test`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add renderer/lib/irc.js test/irc.test.js
git commit -m "Emotes: IRC-emotes-Tag -> Token-Liste (Codepoint-korrekt, wirft nie)"
```

---

### Task 3: `VodReplayCore.fragmentsToTokens` — VOD-Fragmente in Tokens

**Files:**
- Modify: `renderer/lib/vod-replay.js` (neben `fragmentsToText`, Zeile ~25)
- Test: `test/vod-replay.test.js` (anhängen)

**Interfaces:**
- Consumes: Fragment-Form aus `src/twitch-api.js`: `{ text: string, emote: object|null }`;
  das `emote`-Objekt der GQL-Antwort kann die ID als `emoteID` oder `id` tragen
  (beide Varianten defensiv unterstützen).
- Produces: `VodReplayCore.fragmentsToTokens(fragments) =>` gleiche Token-Form
  wie Task 2: `{ type: 'text', value }` | `{ type: 'emote', name, id }`.
  `fragmentsToText` bleibt unverändert bestehen (wird von `keyOf` fürs Dedupe genutzt).

- [ ] **Step 1: Fehlschlagende Tests schreiben** — in `test/vod-replay.test.js` anhängen (Zugriff wie bestehende Tests über das requirte `VodReplayCore`):

```js
test('fragmentsToTokens: Text-, Emote- und Misch-Fragmente', () => {
  assert.deepEqual(
    VodReplayCore.fragmentsToTokens([
      { text: 'hi ', emote: null },
      { text: 'Kappa', emote: { emoteID: '25' } },
      { text: ' cool', emote: null }
    ]),
    [
      { type: 'text', value: 'hi ' },
      { type: 'emote', name: 'Kappa', id: '25' },
      { type: 'text', value: ' cool' }
    ]
  );
});

test('fragmentsToTokens: emote.id-Variante, leere/kaputte Fragmente', () => {
  assert.deepEqual(
    VodReplayCore.fragmentsToTokens([
      { text: 'PogChamp', emote: { id: '305954156' } },
      { text: '', emote: null },
      { text: '', emote: { emoteID: '25' } } // Emote ohne Text -> ueberspringen
    ]),
    [{ type: 'emote', name: 'PogChamp', id: '305954156' }]
  );
  assert.deepEqual(VodReplayCore.fragmentsToTokens(null), []);
  assert.deepEqual(VodReplayCore.fragmentsToTokens([]), []);
});
```

- [ ] **Step 2: Tests laufen lassen — müssen fehlschlagen**

Run: `npm test`
Expected: FAIL (`fragmentsToTokens is not a function`)

- [ ] **Step 3: Implementieren** — in `renderer/lib/vod-replay.js` direkt nach `fragmentsToText`:

```js
  // Fragmente -> Token-Liste (gleiche Form wie IrcParse.emoteTokens).
  // Twitch liefert die Emote-ID je nach Query-Variante als emoteID oder id.
  function fragmentsToTokens(fragments) {
    const tokens = [];
    for (const f of fragments || []) {
      if (!f || !f.text) continue;
      const id = f.emote && (f.emote.emoteID || f.emote.id);
      if (id) tokens.push({ type: 'emote', name: f.text, id: String(id) });
      else tokens.push({ type: 'text', value: f.text });
    }
    return tokens;
  }
```

Und bei den statischen Exports (neben `VodReplayCore.fragmentsToText = …`):

```js
  VodReplayCore.fragmentsToTokens = fragmentsToTokens;
```

- [ ] **Step 4: Tests laufen lassen — müssen bestehen**

Run: `npm test`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add renderer/lib/vod-replay.js test/vod-replay.test.js
git commit -m "Emotes: VOD-Fragmente -> Token-Liste (emoteID/id defensiv)"
```

---

### Task 4: Token-Rendering in `chat.js` (Live + VOD)

**Files:**
- Modify: `renderer/chat/chat.js` — `appendMessage` (Zeile ~88), Live-PRIVMSG-Aufrufer (Zeile ~207), VOD-`onMessage` (Zeile ~252)

**Interfaces:**
- Consumes: `IrcParse.emoteTokens` (Task 2), `VodReplayCore.fragmentsToTokens`
  (Task 3), `EmoteText.twitchEmoteUrl` (Task 1), bestehendes
  `EmoteText.tokenize(text, emoteMap)` für 7TV.
- Produces: `appendMessage(name, color, tokens, opts)` — drittes Argument ist
  jetzt eine **Token-Liste** statt eines Strings. 7TV-Tokens tragen `url`,
  native Twitch-Tokens tragen `id`; das Rendering unterscheidet daran.

- [ ] **Step 1a: `appendEmote`-Helfer einfügen** — in `renderer/chat/chat.js` direkt VOR `appendMessage` (nach dem `KNOWN_BADGES`-Block):

```js
// Ein Emote-Bild XSS-sicher anhaengen (7TV liefert url, natives Twitch die id).
function appendEmote(parent, name, url) {
  const img = document.createElement('img');
  img.className = 'emote';
  img.src = url;
  img.alt = name;
  img.title = name;
  img.loading = 'lazy';
  parent.appendChild(img);
}
```

- [ ] **Step 1b: Signatur + Kommentar von `appendMessage` ändern** — Alt:

```js
// name: string, color: string|null, text: string,
// opts: { replay?: bool, timeSeconds?: number, badges?: string[] }
function appendMessage(name, color, text, opts = {}) {
```

Neu:

```js
// name: string, color: string|null,
// tokens: [{type:'text',value}|{type:'emote',name,id|url}] – aus
// IrcParse.emoteTokens (live) bzw. VodReplayCore.fragmentsToTokens (VOD).
// opts: { replay?: bool, timeSeconds?: number, badges?: string[] }
function appendMessage(name, color, tokens, opts = {}) {
```

- [ ] **Step 1c: Token-Schleife ersetzen** — Alt (der komplette Block vom Kommentar `// Text -> Tokens …` bis zum Ende seiner for-Schleife, direkt vor `$messages.appendChild(div);`):

```js
  // Text -> Tokens -> sichere DOM-Knoten (kein innerHTML == kein XSS).
  const tokens = EmoteText.tokenize(text, emoteMap);
  for (const tok of tokens) {
    if (tok.type === 'emote') {
      const img = document.createElement('img');
      img.className = 'emote';
      img.src = tok.url;
      img.alt = tok.name;
      img.title = tok.name;
      img.loading = 'lazy';
      div.appendChild(img);
    } else {
      div.appendChild(document.createTextNode(tok.value));
    }
  }
```

Neu:

```js
  // Tokens -> sichere DOM-Knoten (kein innerHTML == kein XSS). Text-Tokens
  // laufen zusaetzlich durch die 7TV-Ersetzung; native Twitch-Emote-Tokens
  // (id statt url) werden direkt via twitchEmoteUrl gerendert.
  for (const tok of tokens || []) {
    if (tok.type === 'emote') {
      appendEmote(div, tok.name, tok.url || EmoteText.twitchEmoteUrl(tok.id));
    } else {
      for (const sub of EmoteText.tokenize(tok.value, emoteMap)) {
        if (sub.type === 'emote') appendEmote(div, sub.name, sub.url);
        else div.appendChild(document.createTextNode(sub.value));
      }
    }
  }
```

Alles andere in `appendMessage` (Zeitstempel, Badges, User, stick/scroll/trim) bleibt unverändert. `appendSystem` bleibt unberührt (nutzt `textContent`, keine Tokens).

- [ ] **Step 2: Live-Aufrufer umstellen** — im PRIVMSG-Zweig (`ws.onmessage`):

Alt:
```js
appendMessage(name, color, text, { badges: IrcParse.badgeTypes(msg.tags) });
```

Neu:
```js
appendMessage(name, color, IrcParse.emoteTokens(text, msg.tags['emotes']), {
  badges: IrcParse.badgeTypes(msg.tags)
});
```

- [ ] **Step 3: VOD-Aufrufer umstellen** — in `createVodReplay`:

Alt:
```js
onMessage: (c) => appendMessage(
  c.name, c.color, VodReplayCore.fragmentsToText(c.fragments),
  { replay: true, timeSeconds: c.offset, badges: c.badges }
),
```

Neu:
```js
onMessage: (c) => appendMessage(
  c.name, c.color, VodReplayCore.fragmentsToTokens(c.fragments),
  { replay: true, timeSeconds: c.offset, badges: c.badges }
),
```

- [ ] **Step 4: Tests + manueller Smoke-Test**

Run: `npm test` → Expected: PASS (chat.js hat keine Unit-Tests, Regressionen zeigen sich in den lib-Tests).
Dann: `npm start` → einen Live-Channel laden (Chat mit Sub-/Global-Emotes, z. B. Kappa im Text tippen lassen bzw. beobachten) und ein VOD laden → offizielle Twitch-Emotes erscheinen als Bild in beiden Modi, 7TV-Emotes weiterhin auch, keine Konsolen-Fehler (DevTools).

- [ ] **Step 5: Commit**

```bash
git add renderer/chat/chat.js
git commit -m "Chat: Token-Rendering -> native Twitch-Emotes live + im VOD-Replay"
```

---

### Task 5: ⚙ Chat-Einstellungen (Zeitstempel/Badges an/aus, persistent)

**Files:**
- Modify: `renderer/chat/index.html` (Head-Zeile + Popover)
- Modify: `renderer/chat/chat.css` (Button, Popover, hide-Klassen)
- Modify: `renderer/chat/chat.js` (Wiring, Prefs laden/speichern)
- Modify: `preload.js` (`saveChatPrefs`)
- Modify: `main.js` (Store-Default `chatPrefs`, `get-ui-prefs`, `save-chat-prefs`)

**Interfaces:**
- Produces: Store-Schlüssel `chatPrefs = { showTimestamps: boolean, showBadges: boolean }`
  (Default beides `true`); IPC `save-chat-prefs` (send) und `chatPrefs` als
  neues Feld in der `get-ui-prefs`-Antwort; `window.twitchDual.saveChatPrefs(prefs)`.

- [ ] **Step 1: `main.js`** — Store-Defaults erweitern (im `defaults`-Objekt):

```js
    playerPrefs: { volume: null, quality: null },
    chatPrefs: { showTimestamps: true, showBadges: true }
```

`get-ui-prefs` erweitern:

```js
ipcMain.handle('get-ui-prefs', () => ({
  history: store.get('history', []),
  lastSource: store.get('lastSource', ''),
  playerPrefs: store.get('playerPrefs', { volume: null, quality: null }),
  chatPrefs: store.get('chatPrefs', { showTimestamps: true, showBadges: true })
}));
```

Neuer Handler direkt unter `save-player-prefs`:

```js
ipcMain.on('save-chat-prefs', (_evt, prefs) => {
  const cur = store.get('chatPrefs', { showTimestamps: true, showBadges: true });
  store.set('chatPrefs', { ...cur, ...(prefs || {}) });
});
```

- [ ] **Step 2: `preload.js`** — unter `savePlayerPrefs`:

```js
  saveChatPrefs: (prefs) => ipcRenderer.send('save-chat-prefs', prefs),
```

- [ ] **Step 3: `index.html`** — im `#head` nach `<span id="mode">…`:

```html
    <button id="settings-btn" title="Chat-Einstellungen">⚙</button>
```

Direkt nach dem `</div>` von `#head`:

```html
  <div id="settings-pop" class="hidden">
    <label><input type="checkbox" id="opt-ts" checked /> Zeitstempel anzeigen</label>
    <label><input type="checkbox" id="opt-badges" checked /> Badges anzeigen</label>
  </div>
```

- [ ] **Step 4: `chat.css`** — anhängen:

```css
/* ⚙-Menue: Kopfzeile ist drag-Region -> Button explizit klickbar machen. */
#settings-btn {
  -webkit-app-region: no-drag;
  background: none; border: none; color: #adadb8;
  font-size: 14px; cursor: pointer; padding: 0 2px; line-height: 1;
}
#settings-btn:hover { color: #efeff1; }

#settings-pop {
  position: absolute; top: 34px; right: 8px; z-index: 10;
  background: #1f1f23; border: 1px solid #2a2a2d; border-radius: 6px;
  padding: 8px 10px; font-size: 12px; display: flex;
  flex-direction: column; gap: 6px;
  box-shadow: 0 4px 12px rgba(0,0,0,.5);
}
#settings-pop.hidden { display: none; }
#settings-pop label { display: flex; align-items: center; gap: 6px; cursor: pointer; }

/* Einstellungen wirken per Klasse am Container sofort auf alle Nachrichten. */
#messages.hide-ts .ts { display: none; }
#messages.hide-badges .chip { display: none; }
```

- [ ] **Step 5: `chat.js`** — am Dateianfang bei den anderen `getElementById`-Zeilen:

```js
const $settingsBtn = document.getElementById('settings-btn');
const $settingsPop = document.getElementById('settings-pop');
const $optTs = document.getElementById('opt-ts');
const $optBadges = document.getElementById('opt-badges');
```

Ans Dateiende (vor `formatTime` oder dahinter, Hauptsache Top-Level):

```js
// ---------------------------------------------------------------------------
// ⚙ Chat-Einstellungen: wirken als CSS-Klassen sofort, ueberleben per Store.
// ---------------------------------------------------------------------------
let chatPrefs = { showTimestamps: true, showBadges: true };

function applyChatPrefs() {
  $messages.classList.toggle('hide-ts', !chatPrefs.showTimestamps);
  $messages.classList.toggle('hide-badges', !chatPrefs.showBadges);
  $optTs.checked = !!chatPrefs.showTimestamps;
  $optBadges.checked = !!chatPrefs.showBadges;
}

window.twitchDual.getUiPrefs().then((prefs) => {
  chatPrefs = { ...chatPrefs, ...((prefs && prefs.chatPrefs) || {}) };
  applyChatPrefs();
}).catch(() => {}); // Prefs sind Komfort – ohne sie gelten die Defaults

$settingsBtn.addEventListener('click', () => {
  $settingsPop.classList.toggle('hidden');
});

for (const [el, key] of [[$optTs, 'showTimestamps'], [$optBadges, 'showBadges']]) {
  el.addEventListener('change', () => {
    chatPrefs[key] = el.checked;
    applyChatPrefs();
    window.twitchDual.saveChatPrefs(chatPrefs);
  });
}
```

- [ ] **Step 6: Tests + manueller Smoke-Test**

Run: `npm test` → Expected: PASS.
Dann `npm start`: ⚙ klicken → Popover; Zeitstempel-Haken raus → Zeitstempel verschwinden sofort (VOD laden, dort gibt es welche); Badges-Haken raus → Chips verschwinden; App beenden + neu starten → Haken/Wirkung wiederhergestellt.

- [ ] **Step 7: Commit**

```bash
git add renderer/chat/index.html renderer/chat/chat.css renderer/chat/chat.js preload.js main.js
git commit -m "Chat: ⚙-Einstellungen – Zeitstempel/Badges abschaltbar, persistent"
```

---

### Task 6: Verifikation, Doku, Release v1.1.0

**Files:**
- Modify: `package.json` (`"version": "1.1.0"`)
- Modify: `docs/TODO.md` (zwei Ideen als erledigt verschieben)

**Interfaces:**
- Consumes: Release-Ablauf aus `docs/TODO.md`, Abschnitt „Releases / Auto-Update".

- [ ] **Step 1: Gesamtverifikation**

Run: `npm test` → PASS. `npm start` → Live-Channel UND VOD einmal komplett durchspielen (Emotes beider Welten sichtbar, ⚙-Schalter wirken, Reconnect-Statuszeile normal).

- [ ] **Step 2: TODO.md aktualisieren** — „Native Twitch-Emotes im VOD" und „Chat-Einstellungen" aus „Ideen für später" in den „Erledigt"-Block (UX) verschieben; Formulierung an Bestand anlehnen, z. B.:

```markdown
- Native Twitch-Emotes als Bild in Live-Chat UND VOD-Replay
  (Token-Rendering; IRC-emotes-Tag + Fragment-emote-Feld, CDN-URL zentral).
- ⚙-Chat-Einstellungen: Zeitstempel/Badges an/aus, persistent (chatPrefs).
```

- [ ] **Step 3: Version bump + Commit + Push**

```bash
# package.json: "version": "1.0.0" -> "1.1.0"
git add package.json docs/TODO.md
git commit -m "release: v1.1.0 – native Twitch-Emotes + Chat-Einstellungen"
git push
```

- [ ] **Step 4: Installer bauen**

Run (PowerShell, in `C:\Users\janis\TwitchDual`): `npm run dist`
Expected: `dist/installer/TwitchDual Setup 1.1.0.exe` + `latest.yml` entstehen.

- [ ] **Step 5: Release veröffentlichen** (Bash; gh liegt evtl. nicht im PATH → voller Pfad):

```bash
cd /c/Users/janis/TwitchDual/dist/installer
cp "TwitchDual Setup 1.1.0.exe" "TwitchDual-Setup-1.1.0.exe"
cp "TwitchDual Setup 1.1.0.exe.blockmap" "TwitchDual-Setup-1.1.0.exe.blockmap"
"/c/Program Files/GitHub CLI/gh.exe" release create v1.1.0 \
  --title "TwitchDual 1.1.0" \
  --notes "Native Twitch-Emotes im Live-Chat und VOD-Replay; ⚙-Chat-Einstellungen (Zeitstempel/Badges abschaltbar). Installierte Apps aktualisieren sich automatisch." \
  "TwitchDual-Setup-1.1.0.exe" "TwitchDual-Setup-1.1.0.exe.blockmap" "latest.yml"
```

Expected: Release-URL wird ausgegeben; installierte Apps (Janis + Bruder) ziehen das Update beim nächsten Start automatisch.
