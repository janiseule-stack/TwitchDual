# Twitch-Login + Chatten Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** TwitchDual bekommt Twitch-Login (Device Code Flow), das Chatten von Nachrichten (Emote-Picker, Sende-Fehler, Raum-Status) und eine „Gefolgt"-Liste im Home-Overlay — ohne die bestehende anonyme Lese-/7TV-Identität anzutasten.

**Architecture:** Der Access-Token lebt ausschließlich im Main-Prozess (verschlüsselt via `safeStorage`). Neue Main-Module kapseln Device-Flow, Token-Speicher, Helix-Abfragen und einen authentifizierten IRC-Sende-Socket. Der Renderer spricht sie nur über eine erweiterte IPC-Whitelist an; der Lese-Pfad (anonymer IRC-Socket im Chat-Renderer) und der Player-Embed bleiben unverändert.

**Tech Stack:** Electron 33 (Main = Node, Renderer sandboxed, contextIsolation), reines `node --test` mit injizierbarem `fetch`/`WebSocket`, Twitch OAuth Device Grant + Helix + IRC-over-WebSocket.

## Global Constraints

- Node-Testrunner: `node --test` (kein Jest). Tests sind **netz- und datenstand-unabhängig** — Netz immer über injiziertes `fetch`/`WebSocket` mocken.
- **Der Access-Token verlässt nie den Main-Prozess.** Renderer bekommt nur `{ loggedIn, login, displayName }` und Ergebnisdaten.
- **Preload bleibt sandboxed** (kein `fs`/`path`): jeder neue IPC-Kanal wird in `preload.js` explizit auf der `twitchDual`-Bridge freigegeben; kein Kanal wird in Twitch-iframes exponiert (`isTwitchFrame`-Guard bleibt).
- OAuth-Scopes exakt: `chat:read chat:edit user:read:follows user:read:emotes`.
- OAuth-Client-Typ: **Public** (Refresh ohne Secret). Client-Secret wird nirgends verwendet.
- OAuth-Endpunkte: Device `https://id.twitch.tv/oauth2/device`, Token `https://id.twitch.tv/oauth2/token`, Validate `https://id.twitch.tv/oauth2/validate`. Helix-Basis `https://api.twitch.tv/helix`. IRC `wss://irc-ws.chat.twitch.tv:443`.
- Sende-Rate-Limit: **max. 20 Nachrichten pro 30 s** (gleitendes Fenster), clientseitig geprüft bevor gesendet wird.
- Nur im **Live-Modus** senden; im VOD-Modus ist der Sende-Socket getrennt.
- Alle neuen Nutzertexte auf Deutsch, Stil wie bestehende UI. Neue Kommentare im Codestil des Repos (deutsch, erklärend).
- Nach Abschluss: Version-Bump **1.8.0**, `docs/TODO.md` pflegen.

## File Structure

**Neu (Main, testbar):**
- `src/twitch-auth.js` — Device-Flow-Funktionen (start/poll/refresh/validate), reine Netz-Logik mit injizierbarem `fetch`.
- `src/twitch-tokens.js` — `TokenStore`: verschlüsseltes Laden/Speichern/Löschen des Token-Bündels (injizierbares Crypto + Dateipfad).
- `src/twitch-helix.js` — `getFollowedChannels`, `getUserEmotes` (Helix, paginiert, injizierbares `fetch`).
- `src/chat-send-core.js` — reine Helfer: `formatPrivmsg`, `RateLimiter`, `noticeText`, `parseRoomstate`.

**Neu (Main, Integration, manuell verifiziert):**
- `src/chat-send.js` — `ChatSender`-Klasse: authentifizierter IRC-WebSocket, nutzt `chat-send-core`.
- `src/auth-manager.js` — orchestriert Flow + TokenStore + Auto-Refresh, hält Session-Status, wird von `main.js` verdrahtet.

**Neu (Tests):**
- `test/twitch-auth.test.js`, `test/twitch-tokens.test.js`, `test/twitch-helix.test.js`, `test/chat-send-core.test.js`.

**Geändert:**
- `main.js` — IPC-Handler + Verdrahtung der neuen Module, Sende-Socket an `load`/Modus koppeln.
- `preload.js` — neue Kanäle auf der Bridge.
- `renderer/video/index.html`, `renderer/video/home.js`, `renderer/video/home.css` — Login-UI + „Gefolgt"-Sektion.
- `renderer/chat/index.html`, `renderer/chat/chat.js`, `renderer/chat/chat.css` — Eingabefeld, Emote-Picker, Sende-Fehler, Raum-Status.
- `package.json`, `docs/TODO.md` — Version + Changelog.

---

### Task 1: Device-Flow-Kern `src/twitch-auth.js`

**Files:**
- Create: `src/twitch-auth.js`
- Test: `test/twitch-auth.test.js`

**Interfaces:**
- Consumes: nichts (injizierbares `fetch`).
- Produces:
  - `CLIENT_ID: string`, `SCOPES: string` (Space-getrennt).
  - `startDeviceAuth({ fetchImpl }) → Promise<{ device_code, user_code, verification_uri, expires_in, interval }>`
  - `pollTokenOnce({ deviceCode, fetchImpl }) → Promise<{ status: 'pending'|'slow_down'|'authorized'|'error', tokens?, error? }>` wobei `tokens = { access_token, refresh_token, expires_in, scope }`
  - `refreshTokens({ refreshToken, fetchImpl }) → Promise<{ access_token, refresh_token, expires_in, scope }>`
  - `validateToken({ accessToken, fetchImpl }) → Promise<{ login, userId, expiresIn, scopes }>`

- [ ] **Step 1: Write the failing tests**

```javascript
// test/twitch-auth.test.js
const test = require('node:test');
const assert = require('node:assert');
const auth = require('../src/twitch-auth');

// Ein Mini-fetch-Mock: gibt pro URL eine vorbereitete Antwort zurueck.
function mockFetch(handler) {
  return async (url, opts) => {
    const { status, body } = handler(url, opts);
    return {
      status,
      ok: status >= 200 && status < 300,
      async json() { return body; },
      async text() { return JSON.stringify(body); }
    };
  };
}

test('startDeviceAuth liefert user_code und verification_uri', async () => {
  const fetchImpl = mockFetch((url, opts) => {
    assert.ok(url.startsWith('https://id.twitch.tv/oauth2/device'));
    assert.match(opts.body, /client_id=/);
    assert.match(opts.body, /scopes=chat%3Aread\+chat%3Aedit/);
    return { status: 200, body: {
      device_code: 'DEV', user_code: 'ABCD-EFGH',
      verification_uri: 'https://www.twitch.tv/activate', expires_in: 1800, interval: 5
    } };
  });
  const r = await auth.startDeviceAuth({ fetchImpl });
  assert.equal(r.user_code, 'ABCD-EFGH');
  assert.equal(r.interval, 5);
});

test('pollTokenOnce: authorization_pending -> pending', async () => {
  const fetchImpl = mockFetch(() => ({ status: 400, body: { message: 'authorization_pending' } }));
  const r = await auth.pollTokenOnce({ deviceCode: 'DEV', fetchImpl });
  assert.equal(r.status, 'pending');
});

test('pollTokenOnce: Erfolg -> authorized mit Tokens', async () => {
  const fetchImpl = mockFetch(() => ({ status: 200, body: {
    access_token: 'AT', refresh_token: 'RT', expires_in: 14400, scope: ['chat:read']
  } }));
  const r = await auth.pollTokenOnce({ deviceCode: 'DEV', fetchImpl });
  assert.equal(r.status, 'authorized');
  assert.equal(r.tokens.access_token, 'AT');
});

test('pollTokenOnce: slow_down -> slow_down', async () => {
  const fetchImpl = mockFetch(() => ({ status: 400, body: { message: 'slow_down' } }));
  const r = await auth.pollTokenOnce({ deviceCode: 'DEV', fetchImpl });
  assert.equal(r.status, 'slow_down');
});

test('refreshTokens gibt neues Token-Paar zurueck', async () => {
  const fetchImpl = mockFetch((url, opts) => {
    assert.match(opts.body, /grant_type=refresh_token/);
    assert.ok(!/client_secret/.test(opts.body)); // Public Client: kein Secret
    return { status: 200, body: { access_token: 'AT2', refresh_token: 'RT2', expires_in: 14400, scope: [] } };
  });
  const r = await auth.refreshTokens({ refreshToken: 'RT', fetchImpl });
  assert.equal(r.access_token, 'AT2');
  assert.equal(r.refresh_token, 'RT2');
});

test('validateToken parst login und user_id', async () => {
  const fetchImpl = mockFetch((url, opts) => {
    assert.equal(opts.headers.Authorization, 'OAuth AT');
    return { status: 200, body: { login: 'janis', user_id: '123', expires_in: 14000, scopes: ['chat:edit'] } };
  });
  const r = await auth.validateToken({ accessToken: 'AT', fetchImpl });
  assert.equal(r.login, 'janis');
  assert.equal(r.userId, '123');
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test`
Expected: FAIL (`Cannot find module '../src/twitch-auth'`).

- [ ] **Step 3: Write the implementation**

```javascript
// src/twitch-auth.js
// Twitch OAuth Device Code Grant Flow (Public Client, kein Secret).
// Reine Netz-Logik mit injizierbarem fetch -> in test/twitch-auth.test.js
// vollstaendig ohne echtes Netz getestet.

// Client-ID der registrierten Twitch-App (Public). NICHT geheim.
// TODO(einmalig): echte Client-ID aus dev.twitch.tv/console/apps eintragen.
const CLIENT_ID = 'REPLACE_WITH_TWITCH_CLIENT_ID';
const SCOPES = 'chat:read chat:edit user:read:follows user:read:emotes';

const DEVICE_URL = 'https://id.twitch.tv/oauth2/device';
const TOKEN_URL = 'https://id.twitch.tv/oauth2/token';
const VALIDATE_URL = 'https://id.twitch.tv/oauth2/validate';
const DEVICE_GRANT = 'urn:ietf:params:oauth:grant-type:device_code';

function form(params) {
  return Object.entries(params)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join('&');
}

async function startDeviceAuth({ fetchImpl = fetch } = {}) {
  const res = await fetchImpl(DEVICE_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: form({ client_id: CLIENT_ID, scopes: SCOPES })
  });
  if (!res.ok) throw new Error('Device-Start fehlgeschlagen (' + res.status + ')');
  return res.json();
}

// Ein einzelner Poll-Versuch. Der Aufrufer wiederholt im 'interval'.
async function pollTokenOnce({ deviceCode, fetchImpl = fetch }) {
  const res = await fetchImpl(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: form({ client_id: CLIENT_ID, device_code: deviceCode, grant_type: DEVICE_GRANT })
  });
  const body = await res.json().catch(() => ({}));
  if (res.ok && body.access_token) return { status: 'authorized', tokens: body };
  const msg = String(body.message || '');
  if (/authorization_pending/i.test(msg)) return { status: 'pending' };
  if (/slow_down/i.test(msg)) return { status: 'slow_down' };
  return { status: 'error', error: msg || ('HTTP ' + res.status) };
}

async function refreshTokens({ refreshToken, fetchImpl = fetch }) {
  const res = await fetchImpl(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: form({ client_id: CLIENT_ID, grant_type: 'refresh_token', refresh_token: refreshToken })
  });
  if (!res.ok) throw new Error('Token-Refresh fehlgeschlagen (' + res.status + ')');
  return res.json();
}

async function validateToken({ accessToken, fetchImpl = fetch }) {
  const res = await fetchImpl(VALIDATE_URL, { headers: { Authorization: 'OAuth ' + accessToken } });
  if (!res.ok) throw new Error('Token ungueltig (' + res.status + ')');
  const b = await res.json();
  return { login: b.login, userId: b.user_id, expiresIn: b.expires_in, scopes: b.scopes || [] };
}

module.exports = {
  CLIENT_ID, SCOPES,
  startDeviceAuth, pollTokenOnce, refreshTokens, validateToken
};
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: PASS (alle 6 neuen Tests grün, bestehende Suite unverändert grün).

- [ ] **Step 5: Commit**

```bash
git add src/twitch-auth.js test/twitch-auth.test.js
git commit -m "feat(auth): Twitch Device Code Flow-Kern (start/poll/refresh/validate)"
```

---

### Task 2: Verschlüsselter Token-Speicher `src/twitch-tokens.js`

**Files:**
- Create: `src/twitch-tokens.js`
- Test: `test/twitch-tokens.test.js`

**Interfaces:**
- Consumes: injizierbares `crypto = { isAvailable(): bool, encrypt(str): Buffer, decrypt(buf): str }` (in Produktion Electron `safeStorage`) und `filePath: string`, plus injizierbares `fsImpl` (Default `require('fs')`).
- Produces: `class TokenStore(filePath, crypto, fsImpl?)` mit
  - `available(): boolean`
  - `save(bundle): void` — `bundle = { access, refresh, userId, login, expiresAt }`
  - `load(): bundle | null`
  - `clear(): void`

- [ ] **Step 1: Write the failing tests**

```javascript
// test/twitch-tokens.test.js
const test = require('node:test');
const assert = require('node:assert');
const os = require('os');
const path = require('path');
const fs = require('fs');
const { TokenStore } = require('../src/twitch-tokens');

// Fake-Crypto: "verschluesselt" per base64 (reicht, um die JSON-Logik zu pruefen).
const fakeCrypto = {
  isAvailable: () => true,
  encrypt: (s) => Buffer.from(s, 'utf8').toString('base64'),
  decrypt: (b) => Buffer.from(String(b), 'base64').toString('utf8')
};

function tmpFile() {
  return path.join(os.tmpdir(), 'tw-tokens-' + Math.random().toString(36).slice(2) + '.enc');
}

test('save dann load ergibt dasselbe Buendel', () => {
  const fp = tmpFile();
  const store = new TokenStore(fp, fakeCrypto);
  const bundle = { access: 'AT', refresh: 'RT', userId: '1', login: 'janis', expiresAt: 999 };
  store.save(bundle);
  assert.deepEqual(store.load(), bundle);
  fs.unlinkSync(fp);
});

test('load ohne Datei gibt null', () => {
  const store = new TokenStore(tmpFile(), fakeCrypto);
  assert.equal(store.load(), null);
});

test('Datei enthaelt keinen Klartext-Token', () => {
  const fp = tmpFile();
  new TokenStore(fp, fakeCrypto).save({ access: 'SECRET', refresh: 'R', userId: '1', login: 'j', expiresAt: 0 });
  const raw = fs.readFileSync(fp, 'utf8');
  assert.ok(!raw.includes('SECRET'));
  fs.unlinkSync(fp);
});

test('clear entfernt die Datei', () => {
  const fp = tmpFile();
  const store = new TokenStore(fp, fakeCrypto);
  store.save({ access: 'A', refresh: 'R', userId: '1', login: 'j', expiresAt: 0 });
  store.clear();
  assert.equal(store.load(), null);
});

test('available spiegelt crypto.isAvailable', () => {
  const store = new TokenStore(tmpFile(), { ...fakeCrypto, isAvailable: () => false });
  assert.equal(store.available(), false);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test`
Expected: FAIL (`Cannot find module '../src/twitch-tokens'`).

- [ ] **Step 3: Write the implementation**

```javascript
// src/twitch-tokens.js
// Verschluesselter Speicher fuers Twitch-Token-Buendel. Crypto ist injizierbar
// (Produktion: Electron safeStorage), damit die Datei-/JSON-Logik ohne Electron
// testbar ist. Die verschluesselten Bytes werden base64-kodiert als Textdatei
// abgelegt.

const realFs = require('fs');

class TokenStore {
  constructor(filePath, crypto, fsImpl = realFs) {
    this.filePath = filePath;
    this.crypto = crypto;
    this.fs = fsImpl;
  }

  available() {
    try { return !!this.crypto.isAvailable(); } catch { return false; }
  }

  save(bundle) {
    const json = JSON.stringify(bundle);
    const enc = this.crypto.encrypt(json);            // Buffer|string
    const b64 = Buffer.isBuffer(enc) ? enc.toString('base64') : String(enc);
    this.fs.writeFileSync(this.filePath, b64, 'utf8');
  }

  load() {
    let b64;
    try { b64 = this.fs.readFileSync(this.filePath, 'utf8'); }
    catch { return null; }                            // keine Datei -> nicht eingeloggt
    try {
      const dec = this.crypto.decrypt(Buffer.from(b64, 'base64'));
      return JSON.parse(dec);
    } catch { return null; }                          // korrupt -> wie ausgeloggt
  }

  clear() {
    try { this.fs.unlinkSync(this.filePath); } catch { /* schon weg */ }
  }
}

module.exports = { TokenStore };
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: PASS (5 neue Tests grün).

- [ ] **Step 5: Commit**

```bash
git add src/twitch-tokens.js test/twitch-tokens.test.js
git commit -m "feat(auth): verschluesselter TokenStore (safeStorage-injizierbar)"
```

---

### Task 3: Helix-Helfer `src/twitch-helix.js`

**Files:**
- Create: `src/twitch-helix.js`
- Test: `test/twitch-helix.test.js`

**Interfaces:**
- Consumes: `CLIENT_ID` aus `./twitch-auth`; injizierbares `fetch`.
- Produces:
  - `getFollowedChannels({ userId, accessToken, fetchImpl }) → Promise<Array<{ login, displayName, id }>>` (alle Seiten zusammengeführt)
  - `getUserEmotes({ userId, accessToken, fetchImpl }) → Promise<Array<{ id, name, url }>>` (alle Seiten; `url` aus `template`, Format `static`, Scale `2.0`, Theme `dark`)

- [ ] **Step 1: Write the failing tests**

```javascript
// test/twitch-helix.test.js
const test = require('node:test');
const assert = require('node:assert');
const helix = require('../src/twitch-helix');

// fetch-Mock, der eine Sequenz von Antworten pro Aufruf zurueckgibt.
function seqFetch(responses) {
  let i = 0;
  return async (url, opts) => {
    const body = responses[i++];
    return { ok: true, status: 200, async json() { return body; } };
  };
}

test('getFollowedChannels fuehrt mehrere Seiten zusammen', async () => {
  const fetchImpl = seqFetch([
    { data: [{ broadcaster_login: 'a', broadcaster_name: 'A', broadcaster_id: '1' }], pagination: { cursor: 'C' } },
    { data: [{ broadcaster_login: 'b', broadcaster_name: 'B', broadcaster_id: '2' }], pagination: {} }
  ]);
  const r = await helix.getFollowedChannels({ userId: '9', accessToken: 'AT', fetchImpl });
  assert.deepEqual(r.map((c) => c.login), ['a', 'b']);
  assert.equal(r[1].displayName, 'B');
});

test('getUserEmotes baut die Bild-URL aus dem Template', async () => {
  const fetchImpl = seqFetch([
    { data: [{ id: '007', name: 'Kappa' }], template: 'https://cdn/{{id}}/{{format}}/{{theme_mode}}/{{scale}}', pagination: {} }
  ]);
  const r = await helix.getUserEmotes({ userId: '9', accessToken: 'AT', fetchImpl });
  assert.equal(r[0].name, 'Kappa');
  assert.equal(r[0].url, 'https://cdn/007/static/dark/2.0');
});

test('getFollowedChannels sendet Client-Id und Bearer-Header', async () => {
  let seen = null;
  const fetchImpl = async (url, opts) => { seen = opts; return { ok: true, status: 200, async json() { return { data: [], pagination: {} }; } }; };
  await helix.getFollowedChannels({ userId: '9', accessToken: 'AT', fetchImpl });
  assert.ok(seen.headers['Client-Id']);
  assert.equal(seen.headers.Authorization, 'Bearer AT');
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test`
Expected: FAIL (`Cannot find module '../src/twitch-helix'`).

- [ ] **Step 3: Write the implementation**

```javascript
// src/twitch-helix.js
// Helix-Abfragen mit User-Token: gefolgte Channels + eigene Emotes.
// Laeuft im Main-Prozess. Paginierung wird intern aufgeloest.

const { CLIENT_ID } = require('./twitch-auth');
const BASE = 'https://api.twitch.tv/helix';

function headers(accessToken) {
  return { 'Client-Id': CLIENT_ID, Authorization: 'Bearer ' + accessToken };
}

// Alle Seiten einer Helix-Liste holen (cursor-basiert).
async function fetchAllPages(url, accessToken, fetchImpl) {
  const out = [];
  let template = null;
  let cursor = null;
  do {
    const full = url + (cursor ? (url.includes('?') ? '&' : '?') + 'after=' + encodeURIComponent(cursor) : '');
    const res = await fetchImpl(full, { headers: headers(accessToken) });
    if (!res.ok) throw new Error('Helix ' + res.status);
    const body = await res.json();
    if (body.template) template = body.template;
    for (const row of body.data || []) out.push(row);
    cursor = body.pagination && body.pagination.cursor;
  } while (cursor);
  return { rows: out, template };
}

async function getFollowedChannels({ userId, accessToken, fetchImpl = fetch }) {
  const { rows } = await fetchAllPages(
    `${BASE}/channels/followed?user_id=${encodeURIComponent(userId)}&first=100`,
    accessToken, fetchImpl
  );
  return rows.map((r) => ({ login: r.broadcaster_login, displayName: r.broadcaster_name, id: r.broadcaster_id }));
}

async function getUserEmotes({ userId, accessToken, fetchImpl = fetch }) {
  const { rows, template } = await fetchAllPages(
    `${BASE}/chat/emotes/user?user_id=${encodeURIComponent(userId)}`,
    accessToken, fetchImpl
  );
  const tpl = template || 'https://static-cdn.jtvnw.net/emoticons/v2/{{id}}/{{format}}/{{theme_mode}}/{{scale}}';
  const url = (id) => tpl
    .replace('{{id}}', id).replace('{{format}}', 'static')
    .replace('{{theme_mode}}', 'dark').replace('{{scale}}', '2.0');
  return rows.map((r) => ({ id: r.id, name: r.name, url: url(r.id) }));
}

module.exports = { getFollowedChannels, getUserEmotes };
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: PASS (3 neue Tests grün).

- [ ] **Step 5: Commit**

```bash
git add src/twitch-helix.js test/twitch-helix.test.js
git commit -m "feat(helix): gefolgte Channels + eigene Emotes (paginiert)"
```

---

### Task 4: Sende-Kern `src/chat-send-core.js`

**Files:**
- Create: `src/chat-send-core.js`
- Test: `test/chat-send-core.test.js`

**Interfaces:**
- Consumes: nichts.
- Produces:
  - `formatPrivmsg(channel, text) → string` (z. B. `PRIVMSG #chan :hallo`)
  - `class RateLimiter(max, windowMs)` mit `tryAcquire(now) → boolean`
  - `noticeText(msgId, rawParams) → string` — deutscher Text für bekannte `msg-id`s, sonst `rawParams`
  - `parseRoomstate(tags) → { followersOnly, subsOnly, slowSeconds, emoteOnly }` (Werte aus IRC-Tags; fehlende Tags → `null`)

- [ ] **Step 1: Write the failing tests**

```javascript
// test/chat-send-core.test.js
const test = require('node:test');
const assert = require('node:assert');
const core = require('../src/chat-send-core');

test('formatPrivmsg baut die IRC-Zeile', () => {
  assert.equal(core.formatPrivmsg('Janis', 'hallo welt'), 'PRIVMSG #janis :hallo welt');
});

test('formatPrivmsg entfernt CR/LF (kein IRC-Injection)', () => {
  assert.equal(core.formatPrivmsg('c', 'a\r\nJOIN #evil'), 'PRIVMSG #c :a JOIN #evil');
});

test('RateLimiter erlaubt max Nachrichten pro Fenster', () => {
  const rl = new core.RateLimiter(2, 1000);
  assert.equal(rl.tryAcquire(0), true);
  assert.equal(rl.tryAcquire(100), true);
  assert.equal(rl.tryAcquire(200), false);   // 3. im Fenster -> blockiert
  assert.equal(rl.tryAcquire(1200), true);   // Fenster weiter -> wieder frei
});

test('noticeText uebersetzt bekannte msg-id', () => {
  assert.match(core.noticeText('msg_slowmode', 'x'), /Slow-Mode/i);
  assert.match(core.noticeText('msg_followersonly', 'x'), /Follower/i);
  assert.match(core.noticeText('msg_banned', 'x'), /gebannt|gesperrt/i);
});

test('noticeText faellt auf Rohtext zurueck', () => {
  assert.equal(core.noticeText('unbekannt_xyz', 'Roh-Meldung'), 'Roh-Meldung');
});

test('parseRoomstate liest Tags', () => {
  const r = core.parseRoomstate({ 'followers-only': '10', 'subs-only': '0', slow: '30', 'emote-only': '1' });
  assert.equal(r.followersOnly, 10);
  assert.equal(r.subsOnly, false);
  assert.equal(r.slowSeconds, 30);
  assert.equal(r.emoteOnly, true);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test`
Expected: FAIL (`Cannot find module '../src/chat-send-core'`).

- [ ] **Step 3: Write the implementation**

```javascript
// src/chat-send-core.js
// Reine Helfer fuer den Sende-Pfad: IRC-Zeilenbau, Rate-Limit, NOTICE-Texte,
// ROOMSTATE-Parsing. Kein Netz, kein DOM -> voll unit-testbar.

function formatPrivmsg(channel, text) {
  const chan = String(channel).trim().toLowerCase().replace(/^#/, '');
  const clean = String(text).replace(/[\r\n]+/g, ' '); // keine IRC-Injection
  return `PRIVMSG #${chan} :${clean}`;
}

class RateLimiter {
  constructor(max, windowMs) { this.max = max; this.windowMs = windowMs; this.hits = []; }
  tryAcquire(now = Date.now()) {
    this.hits = this.hits.filter((t) => now - t < this.windowMs);
    if (this.hits.length >= this.max) return false;
    this.hits.push(now);
    return true;
  }
}

// Bekannte Twitch-NOTICE-msg-ids -> verstaendlicher deutscher Text.
const NOTICE_MAP = {
  msg_ratelimit: 'Zu viele Nachrichten — kurz warten.',
  msg_duplicate: 'Identische Nachricht — Twitch blockt Wiederholungen.',
  msg_slowmode: 'Slow-Mode aktiv — bitte warten.',
  msg_followersonly: 'Nur Follower dürfen schreiben.',
  msg_followersonly_zero: 'Nur Follower dürfen schreiben.',
  msg_subsonly: 'Nur Abonnenten dürfen schreiben.',
  msg_emoteonly: 'Nur-Emote-Modus — nur Emotes erlaubt.',
  msg_r9k: 'R9K-Modus — Nachricht muss einzigartig sein.',
  msg_banned: 'Du bist in diesem Channel gebannt.',
  msg_timedout: 'Du bist aktuell getimed out.',
  msg_channel_suspended: 'Dieser Channel ist gesperrt.',
  msg_verified_email: 'Zum Chatten ist eine verifizierte E-Mail nötig.'
};

function noticeText(msgId, rawParams) {
  return NOTICE_MAP[msgId] || String(rawParams || '');
}

function parseRoomstate(tags) {
  const num = (k) => (tags && tags[k] !== undefined && tags[k] !== '' ? Number(tags[k]) : null);
  const bool = (k) => (tags && tags[k] !== undefined && tags[k] !== '' ? tags[k] === '1' : null);
  return {
    followersOnly: num('followers-only'), // -1 aus, 0 jeder Follower, >0 Minuten
    subsOnly: bool('subs-only'),
    slowSeconds: num('slow'),
    emoteOnly: bool('emote-only')
  };
}

module.exports = { formatPrivmsg, RateLimiter, noticeText, parseRoomstate };
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: PASS (6 neue Tests grün).

- [ ] **Step 5: Commit**

```bash
git add src/chat-send-core.js test/chat-send-core.test.js
git commit -m "feat(chat): Sende-Kern (PRIVMSG, Rate-Limit, NOTICE, ROOMSTATE)"
```

---

### Task 5: Sende-Socket `src/chat-send.js`

**Files:**
- Create: `src/chat-send.js`

**Interfaces:**
- Consumes: `formatPrivmsg`, `RateLimiter`, `noticeText`, `parseRoomstate` aus `./chat-send-core`; `IrcParse` aus `../renderer/lib/irc`; injizierbare `WebSocket`-Klasse (Default `require('ws')`? Electron-Main hat kein globales `WebSocket` — siehe Step-Hinweis).
- Produces: `class ChatSender({ WebSocketImpl, onNotice, onRoom, onStatus })` mit
  - `login({ login, accessToken })` — merkt Credentials, verbindet (falls Channel gesetzt)
  - `setChannel(channel | null)` — JOIN/PART; `null` trennt
  - `send(text) → { ok, error? }` — nutzt aktuellen Channel + Rate-Limit
  - `logout()` — trennt, vergisst Credentials

- [ ] **Step 1: Hinweis zur WebSocket-Abhängigkeit (kein Test-Step — Integration)**

Der Renderer nutzt das Browser-`WebSocket`. Im Main-Prozess gibt es das nicht global. Zwei Optionen — **Option A wählen** (keine neue Laufzeit-Abhängigkeit):

- **Option A (gewählt):** `ChatSender` bekommt die WebSocket-Klasse injiziert. `main.js` reicht Electrons `require('electron').net`-basierte Lösung **nicht** — stattdessen nutzt `main.js` das in Electron 33 vorhandene globale `WebSocket` des Main-Prozesses (Node 20+ hat `globalThis.WebSocket` experimentell; falls nicht verfügbar, siehe Option B).
- **Option B (Fallback, nur falls `globalThis.WebSocket` im Main fehlt):** `npm install ws` und `WebSocketImpl = require('ws')`. In diesem Task zuerst prüfen:

Run: `node -e "console.log(typeof WebSocket)"`
- Ist die Ausgabe `function` → Option A, `WebSocketImpl` default `globalThis.WebSocket`.
- Ist sie `undefined` → Option B: `npm install ws` und in `package.json` dependencies aufnehmen.

- [ ] **Step 2: Write the implementation**

```javascript
// src/chat-send.js
// Authentifizierter IRC-Sende-Socket im Main-Prozess. Haelt EINE Verbindung
// mit dem eingeloggten Nutzer, joint den aktuell geladenen (Live-)Channel und
// sendet PRIVMSG. Eingehende NOTICE/ROOMSTATE werden ausgewertet und ueber
// Callbacks ans Chat-Fenster gemeldet. Reine Logik liegt in chat-send-core.js.

const { formatPrivmsg, RateLimiter, noticeText, parseRoomstate } = require('./chat-send-core');
const IrcParse = require('../renderer/lib/irc');

const IRC_URL = 'wss://irc-ws.chat.twitch.tv:443';

class ChatSender {
  constructor({ WebSocketImpl = globalThis.WebSocket, onNotice = () => {}, onRoom = () => {}, onStatus = () => {} } = {}) {
    this.WebSocketImpl = WebSocketImpl;
    this.onNotice = onNotice;
    this.onRoom = onRoom;
    this.onStatus = onStatus;
    this.ws = null;
    this.creds = null;      // { login, accessToken }
    this.channel = null;    // aktueller Live-Channel (lowercase, ohne #)
    this.ready = false;
    this.limiter = new RateLimiter(20, 30000);
  }

  login({ login, accessToken }) {
    this.creds = { login: String(login).toLowerCase(), accessToken };
    if (this.channel) this._connect();
  }

  logout() {
    this.creds = null;
    this._close();
  }

  setChannel(channel) {
    const chan = channel ? String(channel).toLowerCase().replace(/^#/, '') : null;
    if (chan === this.channel) return;
    // alten Channel verlassen
    if (this.ws && this.ready && this.channel) {
      try { this.ws.send('PART #' + this.channel); } catch {}
    }
    this.channel = chan;
    if (!chan) { this._close(); return; }
    if (!this.creds) return;                 // nicht eingeloggt -> nichts tun
    if (this.ready) { try { this.ws.send('JOIN #' + chan); } catch {} }
    else this._connect();
  }

  send(text) {
    if (!this.creds) return { ok: false, error: 'Nicht angemeldet.' };
    if (!this.channel) return { ok: false, error: 'Kein Live-Channel geladen.' };
    if (!this.ready || !this.ws) return { ok: false, error: 'Chat verbindet noch …' };
    if (!this.limiter.tryAcquire()) return { ok: false, error: 'Zu schnell — kurz warten.' };
    try { this.ws.send(formatPrivmsg(this.channel, text)); return { ok: true }; }
    catch (e) { return { ok: false, error: 'Senden fehlgeschlagen.' }; }
  }

  _connect() {
    this._close();
    if (!this.creds || !this.channel) return;
    const ws = new this.WebSocketImpl(IRC_URL);
    this.ws = ws;
    this.ready = false;

    ws.onopen = () => {
      ws.send('CAP REQ :twitch.tv/tags twitch.tv/commands');
      ws.send('PASS oauth:' + this.creds.accessToken);
      ws.send('NICK ' + this.creds.login);
    };
    ws.onmessage = (evt) => this._onData(String(evt.data));
    ws.onclose = () => { if (this.ws === ws) { this.ws = null; this.ready = false; } };
    ws.onerror = () => this.onStatus('error');
  }

  _onData(data) {
    for (const line of data.split('\r\n')) {
      if (!line) continue;
      if (line.startsWith('PING')) { try { this.ws.send('PONG :tmi.twitch.tv'); } catch {} continue; }
      const msg = IrcParse.parseIrc(line);
      if (msg.command === '001') {            // Login akzeptiert -> Channel joinen
        this.ready = true;
        this.onStatus('ready');
        if (this.channel) { try { this.ws.send('JOIN #' + this.channel); } catch {} }
      } else if (msg.command === 'NOTICE') {
        const id = msg.tags && msg.tags['msg-id'];
        this.onNotice({ text: noticeText(id, IrcParse.privmsgText(msg.params)), id: id || null });
      } else if (msg.command === 'ROOMSTATE') {
        this.onRoom(parseRoomstate(msg.tags || {}));
      }
    }
  }

  _close() {
    if (this.ws) { const ws = this.ws; this.ws = null; this.ready = false; try { ws.close(); } catch {} }
  }
}

module.exports = { ChatSender };
```

- [ ] **Step 3: Smoke-Check (Modul lädt, keine Syntaxfehler)**

Run: `node -e "require('./src/chat-send.js'); console.log('ok')"`
Expected: `ok`

- [ ] **Step 4: Bestehende Tests bleiben grün**

Run: `npm test`
Expected: PASS (unverändert; `chat-send-core` deckt die Logik ab).

- [ ] **Step 5: Commit**

```bash
git add src/chat-send.js package.json package-lock.json
git commit -m "feat(chat): authentifizierter IRC-Sende-Socket (ChatSender)"
```

---

### Task 6: Auth-Manager + IPC-Verdrahtung (`src/auth-manager.js`, `main.js`, `preload.js`)

**Files:**
- Create: `src/auth-manager.js`
- Modify: `main.js` (Imports oben; IPC-Block bei den anderen `ipcMain`-Handlern; Sende-Socket an den `load`-Broadcast koppeln in `ipcMain.handle('submit-load', …)`)
- Modify: `preload.js` (neue Bridge-Methoden im `exposeInMainWorld`-Objekt)

**Interfaces:**
- Consumes: `twitch-auth`, `TokenStore`, `twitch-helix`, `ChatSender`.
- Produces (auth-manager): `class AuthManager({ tokenStore, onChanged })` mit
  - `status() → { loggedIn, login, displayName }`
  - `startDeviceFlow() → { user_code, verification_uri }` (startet Hintergrund-Polling; ruft `onChanged` bei Erfolg)
  - `logout()`
  - `getAccess() → Promise<{ accessToken, userId, login } | null>` (auto-refresh bei Ablauf)
- Produces (preload/IPC-Vertrag): siehe Step 3.

- [ ] **Step 1: Write `src/auth-manager.js`**

```javascript
// src/auth-manager.js
// Orchestriert Device-Flow + TokenStore + Auto-Refresh und haelt den
// Session-Status. Netz-Details liegen in twitch-auth.js (getestet); hier ist
// die Zustands-/Timing-Logik, die im Main-Prozess mit echtem Netz laeuft.

const auth = require('./twitch-auth');

class AuthManager {
  constructor({ tokenStore, onChanged = () => {} }) {
    this.store = tokenStore;
    this.onChanged = onChanged;
    this.bundle = this.store.available() ? this.store.load() : null; // {access,refresh,userId,login,expiresAt}
    this.polling = false;
  }

  status() {
    return this.bundle
      ? { loggedIn: true, login: this.bundle.login, displayName: this.bundle.login }
      : { loggedIn: false, login: null, displayName: null };
  }

  async startDeviceFlow() {
    if (!this.store.available()) throw new Error('Sicherer Speicher auf diesem System nicht verfügbar.');
    const d = await auth.startDeviceAuth({});
    this._poll(d.device_code, (d.interval || 5) * 1000, Date.now() + (d.expires_in || 1800) * 1000);
    return { user_code: d.user_code, verification_uri: d.verification_uri };
  }

  _poll(deviceCode, intervalMs, deadline) {
    this.polling = true;
    const tick = async () => {
      if (!this.polling) return;
      if (Date.now() > deadline) { this.polling = false; return; }
      let r;
      try { r = await auth.pollTokenOnce({ deviceCode }); }
      catch { r = { status: 'pending' }; }
      if (r.status === 'authorized') {
        this.polling = false;
        await this._acceptTokens(r.tokens);
        return;
      }
      if (r.status === 'error') { this.polling = false; return; }
      if (r.status === 'slow_down') intervalMs += 5000;
      setTimeout(tick, intervalMs);
    };
    setTimeout(tick, intervalMs);
  }

  async _acceptTokens(tokens) {
    const v = await auth.validateToken({ accessToken: tokens.access_token });
    this.bundle = {
      access: tokens.access_token,
      refresh: tokens.refresh_token,
      userId: v.userId,
      login: v.login,
      expiresAt: Date.now() + (tokens.expires_in || 14400) * 1000
    };
    this.store.save(this.bundle);
    this.onChanged(this.status());
  }

  async getAccess() {
    if (!this.bundle) return null;
    // Frueh genug erneuern (60 s Puffer).
    if (Date.now() > this.bundle.expiresAt - 60000) {
      try {
        const t = await auth.refreshTokens({ refreshToken: this.bundle.refresh });
        this.bundle = { ...this.bundle, access: t.access_token, refresh: t.refresh_token,
          expiresAt: Date.now() + (t.expires_in || 14400) * 1000 };
        this.store.save(this.bundle);
      } catch {
        this.logout();          // Refresh tot (30 Tage) -> sauber ausloggen
        return null;
      }
    }
    return { accessToken: this.bundle.access, userId: this.bundle.userId, login: this.bundle.login };
  }

  logout() {
    this.bundle = null;
    this.polling = false;
    this.store.clear();
    this.onChanged(this.status());
  }
}

module.exports = { AuthManager };
```

- [ ] **Step 2: Verdrahtung in `main.js`**

Oben bei den Imports (nach Zeile 13, `const ThemeLib = ...`) ergänzen:

```javascript
const { TokenStore } = require('./src/twitch-tokens');
const { AuthManager } = require('./src/auth-manager');
const helix = require('./src/twitch-helix');
const { ChatSender } = require('./src/chat-send');
const { safeStorage } = require('electron');
```

Nach der `store`-Definition (nach Zeile 28) die Session-Objekte anlegen:

```javascript
// --- Twitch-Login + Sende-Chat (v1.8.0) ------------------------------------
let authManager = null;
let chatSender = null;
let currentLiveChannel = null; // aktuell geladener Live-Channel (fuer Sende-Socket)

function initAuth() {
  const cryptoBridge = {
    isAvailable: () => safeStorage.isEncryptionAvailable(),
    encrypt: (s) => safeStorage.encryptString(s),
    decrypt: (buf) => safeStorage.decryptString(Buffer.from(buf))
  };
  const tokenStore = new TokenStore(path.join(app.getPath('userData'), 'twitch-auth.enc'), cryptoBridge);
  authManager = new AuthManager({
    tokenStore,
    onChanged: async (st) => {
      broadcast('auth-changed', st);
      // Sende-Socket an den neuen Login-Zustand anpassen.
      if (st.loggedIn) {
        const acc = await authManager.getAccess();
        if (acc) chatSender.login({ login: acc.login, accessToken: acc.accessToken });
      } else {
        chatSender.logout();
      }
    }
  });
  chatSender = new ChatSender({
    onNotice: (n) => { if (chatWin && !chatWin.isDestroyed()) chatWin.webContents.send('chat-notice', n); },
    onRoom: (r) => { if (chatWin && !chatWin.isDestroyed()) chatWin.webContents.send('chat-room', r); }
  });
}
```

In `app.whenReady().then(...)` (Zeile ~389) **vor** `createWindows()` ein `initAuth();` einfügen, und nach `createWindows()` — falls schon eingeloggt — den Sender vorbereiten:

```javascript
  initAuth();
  createWindows();
  if (authManager.status().loggedIn) {
    const acc = await authManager.getAccess();
    if (acc) chatSender.login({ login: acc.login, accessToken: acc.accessToken });
  }
```

Im `submit-load`-Handler den Sende-Channel koppeln. Im `live`-Zweig (nach `broadcast('load', payload);`, Zeile ~154) ergänzen:

```javascript
      currentLiveChannel = user.login;
      if (chatSender) chatSender.setChannel(user.login);
```

Im `vod`-Zweig (nach `broadcast('load', payload);`, Zeile ~179) ergänzen:

```javascript
      currentLiveChannel = null;
      if (chatSender) chatSender.setChannel(null);
```

Und im `home-open`-Handler (Zeile ~213) den Sender trennen (wie der Lese-Chat):

```javascript
ipcMain.on('home-open', () => { if (chatSender) chatSender.setChannel(null); broadcast('home-open'); });
```

Neue IPC-Handler im Block bei den anderen (z. B. nach dem `user-badges`-Handler, Zeile ~307):

```javascript
// --- Login (Device Flow) ---------------------------------------------------
ipcMain.handle('auth-status', () => authManager.status());
ipcMain.handle('auth-start', async () => {
  try { return { ok: true, ...(await authManager.startDeviceFlow()) }; }
  catch (e) { return { ok: false, error: e.message || String(e) }; }
});
ipcMain.handle('auth-logout', () => { authManager.logout(); return { ok: true }; });

// Gefolgte Channels (mit Live-Status, live-first via browse.getLiveStatus).
ipcMain.handle('get-followed', async () => {
  try {
    const acc = await authManager.getAccess();
    if (!acc) return { ok: false, error: 'Nicht angemeldet.' };
    const followed = await helix.getFollowedChannels({ userId: acc.userId, accessToken: acc.accessToken });
    const channels = await browse.getLiveStatus(followed.map((f) => f.login));
    return { ok: true, channels };
  } catch (e) { return { ok: false, error: e.message || String(e) }; }
});

// Eigene Twitch-Emotes fuer den Picker.
ipcMain.handle('get-user-emotes', async () => {
  try {
    const acc = await authManager.getAccess();
    if (!acc) return { ok: false, error: 'Nicht angemeldet.' };
    const emotes = await helix.getUserEmotes({ userId: acc.userId, accessToken: acc.accessToken });
    return { ok: true, emotes };
  } catch (e) { return { ok: false, error: e.message || String(e) }; }
});

// Nachricht senden (nur Live + eingeloggt; Guards im ChatSender).
ipcMain.handle('chat-send', (_evt, args) => {
  const { text } = args || {};
  if (!chatSender) return { ok: false, error: 'Chat nicht bereit.' };
  return chatSender.send(String(text || ''));
});
```

- [ ] **Step 3: Bridge in `preload.js`**

Im `twitchDual`-Objekt (vor der schließenden `});` bei Zeile ~83) ergänzen:

```javascript
    // Login (Device Flow) + Sende-Chat (v1.8.0).
    authStatus: () => ipcRenderer.invoke('auth-status'),
    authStart: () => ipcRenderer.invoke('auth-start'),
    authLogout: () => ipcRenderer.invoke('auth-logout'),
    onAuthChanged: (cb) => { ipcRenderer.on('auth-changed', (_e, st) => cb(st)); },
    getFollowed: () => ipcRenderer.invoke('get-followed'),
    getUserEmotes: () => ipcRenderer.invoke('get-user-emotes'),
    chatSend: (text) => ipcRenderer.invoke('chat-send', { text }),
    onChatNotice: (cb) => { ipcRenderer.on('chat-notice', (_e, n) => cb(n)); },
    onChatRoom: (cb) => { ipcRenderer.on('chat-room', (_e, r) => cb(r)); },
```

- [ ] **Step 4: Manuelle Verifikation**

Run: `npm test` → Expected: PASS (bestehende + neue Unit-Tests grün).
Run: `npm start` → App startet ohne Fehler; DevTools-Konsole beider Fenster ohne rote IPC-Fehler. (Login-UI kommt in Task 7 — hier nur: kein Crash, `authStatus()` liefert `{loggedIn:false}`.)

- [ ] **Step 5: Commit**

```bash
git add src/auth-manager.js main.js preload.js
git commit -m "feat(auth): AuthManager + IPC-Verdrahtung (Login, Followed, Emotes, Senden)"
```

---

### Task 7: Login-UI im Home-Overlay

**Files:**
- Modify: `renderer/video/index.html` (Login-Zeile + Code-Panel ins Home-Overlay, in den `#home-fav-view`-Kopf bzw. eine eigene Kopfzeile)
- Modify: `renderer/video/home.js` (Login-Logik)
- Modify: `renderer/video/home.css` (Stil)

**Interfaces:**
- Consumes: `window.twitchDual.authStatus/authStart/authLogout/onAuthChanged` (Task 6).
- Produces: globalen Renderer-Zustand `loggedIn` + Funktion `refreshFollowed()` (in Task 8 genutzt).

- [ ] **Step 1: HTML einfügen**

In `renderer/video/index.html` im Home-Overlay oberhalb von `#home-fav-view` (bzw. in die Overlay-Kopfzeile) einfügen:

```html
<div id="auth-bar">
  <span id="auth-state">Nicht angemeldet</span>
  <button id="auth-login" type="button">Mit Twitch anmelden</button>
  <button id="auth-logout" type="button" class="hidden">Abmelden</button>
</div>
<div id="auth-code" class="hidden">
  <p>Gehe auf <b id="auth-uri">twitch.tv/activate</b> und gib diesen Code ein:</p>
  <div id="auth-code-val">————</div>
  <div class="auth-code-actions">
    <button id="auth-copy" type="button">Code kopieren</button>
    <button id="auth-open" type="button">Seite öffnen</button>
  </div>
  <span id="auth-wait">Warte auf Bestätigung …</span>
</div>
```

- [ ] **Step 2: Login-Logik in `home.js`**

Am Ende von `renderer/video/home.js` (vor `openHome();`) einfügen:

```javascript
// --- Login (Device Flow) ---------------------------------------------------
const $authState = document.getElementById('auth-state');
const $authLogin = document.getElementById('auth-login');
const $authLogout = document.getElementById('auth-logout');
const $authCode = document.getElementById('auth-code');
const $authUri = document.getElementById('auth-uri');
const $authCodeVal = document.getElementById('auth-code-val');
const $authCopy = document.getElementById('auth-copy');
const $authOpen = document.getElementById('auth-open');

let loggedIn = false;

function renderAuth(st) {
  loggedIn = !!(st && st.loggedIn);
  $authState.textContent = loggedIn ? ('Angemeldet als ' + st.displayName) : 'Nicht angemeldet';
  $authLogin.classList.toggle('hidden', loggedIn);
  $authLogout.classList.toggle('hidden', !loggedIn);
  if (loggedIn) $authCode.classList.add('hidden');
  if (typeof refreshFollowed === 'function') refreshFollowed(); // Task 8
}

window.twitchDual.authStatus().then(renderAuth).catch(() => {});
window.twitchDual.onAuthChanged(renderAuth);

$authLogin.addEventListener('click', async () => {
  $authLogin.disabled = true;
  const r = await window.twitchDual.authStart();
  $authLogin.disabled = false;
  if (!r.ok) { $authState.textContent = 'Fehler: ' + r.error; return; }
  $authUri.textContent = (r.verification_uri || 'https://www.twitch.tv/activate').replace(/^https?:\/\//, '');
  $authUri.dataset.href = r.verification_uri;
  $authCodeVal.textContent = r.user_code;
  $authCode.classList.remove('hidden');
});
$authCopy.addEventListener('click', () => {
  navigator.clipboard && navigator.clipboard.writeText($authCodeVal.textContent).catch(() => {});
});
$authOpen.addEventListener('click', () => {
  // Externer Browser via Standard-Link (Main öffnet http/https extern nicht
  // automatisch -> window.open mit _blank, das Electron an die Shell gibt).
  window.open($authUri.dataset.href || 'https://www.twitch.tv/activate', '_blank');
});
$authLogout.addEventListener('click', () => window.twitchDual.authLogout());
```

**Hinweis für externen Browser:** Falls `window.open` das Ziel nicht im Systembrowser öffnet, in `main.js` `initAuth`/`createWindows` einen `setWindowOpenHandler` am `videoWin.webContents` ergänzen, der `http(s)`-URLs via `shell.openExternal(url)` öffnet und `{ action: 'deny' }` zurückgibt. `const { shell } = require('electron')` oben importieren.

- [ ] **Step 3: CSS in `home.css`**

```css
#auth-bar { display: flex; align-items: center; gap: 8px; padding: 6px 10px; }
#auth-state { color: var(--muted, #8b8b9c); font-size: 13px; margin-right: auto; }
#auth-bar button { cursor: pointer; }
#auth-code { padding: 10px; text-align: center; }
#auth-code-val { font: 700 22px/1.4 monospace; letter-spacing: 3px; margin: 6px 0; }
.auth-code-actions { display: flex; gap: 8px; justify-content: center; margin-bottom: 4px; }
#auth-wait { color: var(--muted, #8b8b9c); font-size: 12px; }
.hidden { display: none !important; }
```

- [ ] **Step 4: Manuelle Verifikation**

Run: `npm start`
- Home-Overlay zeigt „Nicht angemeldet" + Button.
- Klick „Mit Twitch anmelden" → Code-Panel erscheint mit Code + URL. „Seite öffnen" öffnet den Systembrowser auf twitch.tv/activate. Nach echtem Aktivieren wechselt der Status (via `auth-changed`) auf „Angemeldet als …".
- „Abmelden" setzt zurück.

- [ ] **Step 5: Commit**

```bash
git add renderer/video/index.html renderer/video/home.js renderer/video/home.css main.js
git commit -m "feat(ui): Login-UI (Device-Code-Panel) im Home-Overlay"
```

---

### Task 8: „Gefolgt"-Sektion im Home-Overlay

**Files:**
- Modify: `renderer/video/index.html` (Container `#followed-view` + Umschalt-Tab)
- Modify: `renderer/video/home.js` (`refreshFollowed`, Rendering via bestehender Karten)
- Modify: `renderer/video/home.css` (Tab-Stil)

**Interfaces:**
- Consumes: `window.twitchDual.getFollowed()` (Task 6); `buildLiveCard`, `buildFavCard` (bestehend in `home.js`); `loggedIn`, `renderAuth`/`refreshFollowed`-Hook (Task 7).
- Produces: nichts Neues.

- [ ] **Step 1: HTML**

In `renderer/video/index.html` neben der Favoriten-Ansicht einen Bereich einfügen:

```html
<div id="followed-view" class="hidden">
  <div id="followed-empty" class="empty hidden">Keine gefolgten Live-Channels.</div>
  <div id="followed-list"></div>
</div>
```
Und im Overlay-Kopf einen Umschalter (nur sichtbar wenn eingeloggt):

```html
<button id="tab-followed" type="button" class="hidden">Gefolgt</button>
<button id="tab-favorites" type="button" class="hidden">Favoriten</button>
```

- [ ] **Step 2: Logik in `home.js`**

Nach dem Login-Block einfügen:

```javascript
// --- Gefolgte Channels -----------------------------------------------------
const $followedView = document.getElementById('followed-view');
const $followedList = document.getElementById('followed-list');
const $followedEmpty = document.getElementById('followed-empty');
const $tabFollowed = document.getElementById('tab-followed');
const $tabFavorites = document.getElementById('tab-favorites');

async function refreshFollowed() {
  $tabFollowed.classList.toggle('hidden', !loggedIn);
  $tabFavorites.classList.toggle('hidden', !loggedIn);
  if (!loggedIn) { showFavView(); return; }
  const res = await window.twitchDual.getFollowed();
  if (!res.ok) { $followedList.innerHTML = ''; $followedEmpty.classList.remove('hidden'); return; }
  // getLiveStatus liefert live-first sortiert (browse-map.sortByLive).
  const live = res.channels.filter((c) => c.live);
  const off = res.channels.filter((c) => !c.live);
  $followedList.innerHTML = '';
  $followedEmpty.classList.toggle('hidden', res.channels.length > 0);
  if (live.length) {
    const grid = document.createElement('div');
    grid.id = 'live-grid';
    for (const ch of live) grid.appendChild(buildLiveCard(ch)); // bestehende Karte
    $followedList.appendChild(grid);
  }
  for (const ch of off) $followedList.appendChild(buildFavCard(ch));
}

function showFollowedView() {
  $favView.classList.add('hidden');
  $vodView.classList.add('hidden');
  $followedView.classList.remove('hidden');
  $tabFollowed.classList.add('active');
  $tabFavorites.classList.remove('active');
  refreshFollowed();
}
function showFavoritesTab() {
  $followedView.classList.add('hidden');
  showFavView();
  $tabFavorites.classList.add('active');
  $tabFollowed.classList.remove('active');
}
$tabFollowed.addEventListener('click', showFollowedView);
$tabFavorites.addEventListener('click', showFavoritesTab);
```

`showFavView()` in `home.js` um das Ausblenden von `#followed-view` ergänzen (Zeile ~34): `$followedView && $followedView.classList.add('hidden');` (Guard, da `showFavView` vor der Definition laufen kann → stattdessen Referenz per `document.getElementById` innerhalb der Funktion holen oder die Konstante nach oben ziehen).

- [ ] **Step 3: CSS**

```css
#tab-followed, #tab-favorites { cursor: pointer; opacity: .7; }
#tab-followed.active, #tab-favorites.active { opacity: 1; font-weight: 700; }
#followed-view { padding: 8px; }
```

- [ ] **Step 4: Manuelle Verifikation**

Run: `npm start` (eingeloggt aus Task 7)
- Tab „Gefolgt" erscheint nur eingeloggt; Klick zeigt gefolgte Channels, **Live oben** als große Karten (mit Zuschauerzahl/Spiel), offline darunter. Klick auf eine Karte lädt den Channel und schließt das Overlay.

- [ ] **Step 5: Commit**

```bash
git add renderer/video/index.html renderer/video/home.js renderer/video/home.css
git commit -m "feat(ui): Gefolgt-Sektion im Home-Overlay (live-first)"
```

---

### Task 9: Chat-Eingabefeld + Senden

**Files:**
- Modify: `renderer/chat/index.html` (Eingabezeile im Fuß)
- Modify: `renderer/chat/chat.js` (Sende-Logik, Enable/Disable nach Login+Modus)
- Modify: `renderer/chat/chat.css` (Eingabe-Stil)

**Interfaces:**
- Consumes: `window.twitchDual.chatSend`, `authStatus`, `onAuthChanged` (Task 6); bestehende `applySource`/`onHomeOpen` für den Modus.
- Produces: Renderer-Zustand `chatLoggedIn`, `chatMode` ('live'|'vod'|null) und `updateComposerState()` (Task 10/11 nutzen ihn).

- [ ] **Step 1: HTML**

In `renderer/chat/index.html` unten (nach `#messages`, vor Schließen des Chat-Containers) einfügen:

```html
<div id="composer">
  <button id="emote-btn" type="button" title="Emotes" disabled>😀</button>
  <input id="chat-input" type="text" maxlength="500" placeholder="Zum Chatten anmelden" disabled />
  <button id="chat-send" type="button" disabled>Senden</button>
  <div id="chat-error" class="hidden"></div>
</div>
```

- [ ] **Step 2: Logik in `chat.js`**

Am Ende von `renderer/chat/chat.js` einfügen:

```javascript
// ---------------------------------------------------------------------------
// Senden (v1.8.0): Eingabefeld ist nur eingeloggt + im Live-Modus aktiv.
// ---------------------------------------------------------------------------
const $composerInput = document.getElementById('chat-input');
const $composerSend = document.getElementById('chat-send');
const $emoteBtn = document.getElementById('emote-btn');
const $chatError = document.getElementById('chat-error');

let chatLoggedIn = false;
let chatMode = null; // 'live' | 'vod' | null

function updateComposerState() {
  const canChat = chatLoggedIn && chatMode === 'live';
  $composerInput.disabled = !canChat;
  $composerSend.disabled = !canChat;
  $emoteBtn.disabled = !canChat;
  $composerInput.placeholder = !chatLoggedIn ? 'Zum Chatten anmelden'
    : chatMode !== 'live' ? 'Chatten nur im Live-Modus'
    : 'Nachricht senden …';
}

async function doSend() {
  const text = $composerInput.value.trim();
  if (!text) return;
  $composerInput.value = '';
  const r = await window.twitchDual.chatSend(text);
  if (!r.ok) showChatError(r.error);
}

function showChatError(text) {
  $chatError.textContent = text;
  $chatError.classList.remove('hidden');
  clearTimeout(showChatError._t);
  showChatError._t = setTimeout(() => $chatError.classList.add('hidden'), 4000);
}

$composerSend.addEventListener('click', doSend);
$composerInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') doSend(); });

window.twitchDual.authStatus().then((st) => { chatLoggedIn = !!(st && st.loggedIn); updateComposerState(); }).catch(() => {});
window.twitchDual.onAuthChanged((st) => { chatLoggedIn = !!(st && st.loggedIn); updateComposerState(); });
```

Den Modus an `applySource` koppeln — in `applySource(payload)` am Ende ergänzen:
```javascript
  chatMode = payload.mode; updateComposerState();
```
Und in `onHomeOpen` (wo der Chat getrennt wird) ergänzen:
```javascript
  chatMode = null; updateComposerState();
```

- [ ] **Step 3: CSS**

```css
#composer { display: flex; gap: 6px; padding: 6px; align-items: center; position: relative; }
#chat-input { flex: 1; min-width: 0; padding: 6px 8px; border-radius: 6px;
  background: rgba(255,255,255,.06); color: var(--text, #ededf4); border: 1px solid var(--accent-border, #333); }
#chat-input:disabled { opacity: .6; }
#chat-send, #emote-btn { cursor: pointer; }
#chat-send:disabled, #emote-btn:disabled { cursor: default; opacity: .5; }
#chat-error { position: absolute; bottom: 100%; left: 6px; right: 6px; margin-bottom: 4px;
  background: #4a1220; color: #ffb3c4; padding: 4px 8px; border-radius: 6px; font-size: 12px; }
```

- [ ] **Step 4: Manuelle Verifikation**

Run: `npm start`
- Ausgeloggt: Feld deaktiviert, Platzhalter „Zum Chatten anmelden".
- Eingeloggt + Live geladen: Feld aktiv. Nachricht tippen + Enter → erscheint kurz darauf im Chat (über den Lese-Pfad). VOD geladen: Feld deaktiviert („Chatten nur im Live-Modus").

- [ ] **Step 5: Commit**

```bash
git add renderer/chat/index.html renderer/chat/chat.js renderer/chat/chat.css
git commit -m "feat(ui): Chat-Eingabefeld + Senden (Live + eingeloggt)"
```

---

### Task 10: Emote-Picker

**Files:**
- Modify: `renderer/chat/index.html` (Picker-Panel-Container)
- Modify: `renderer/chat/chat.js` (Panel füllen aus `emoteMap` + `getUserEmotes`, Code einfügen)
- Modify: `renderer/chat/chat.css` (Panel-Grid)

**Interfaces:**
- Consumes: `emoteMap` (bestehend, `name → url` für 7TV/BTTV/FFZ), `window.twitchDual.getUserEmotes` (Task 6), `$emoteBtn`/`$composerInput`/`updateComposerState` (Task 9).
- Produces: nichts Neues.

- [ ] **Step 1: HTML**

In `renderer/chat/index.html` in `#composer` (nach `#chat-error`) einfügen:

```html
<div id="emote-panel" class="hidden">
  <div class="ep-section">Channel</div>
  <div id="ep-channel" class="ep-grid"></div>
  <div class="ep-section">Deine Emotes</div>
  <div id="ep-user" class="ep-grid"></div>
</div>
```

- [ ] **Step 2: Logik in `chat.js`**

```javascript
// --- Emote-Picker ----------------------------------------------------------
const $emotePanel = document.getElementById('emote-panel');
const $epChannel = document.getElementById('ep-channel');
const $epUser = document.getElementById('ep-user');
let userEmotesLoaded = false;

function insertEmote(code) {
  const el = $composerInput;
  const start = el.selectionStart || el.value.length;
  const end = el.selectionEnd || el.value.length;
  const pad = (start > 0 && el.value[start - 1] !== ' ') ? ' ' : '';
  el.value = el.value.slice(0, start) + pad + code + ' ' + el.value.slice(end);
  el.focus();
}

function fillEmoteGrid(container, entries) {
  container.innerHTML = '';
  for (const e of entries) {
    const img = document.createElement('img');
    img.className = 'ep-emote';
    img.src = e.url;
    img.alt = e.name;
    img.title = e.name;
    img.loading = 'lazy';
    img.addEventListener('click', () => insertEmote(e.name));
    container.appendChild(img);
  }
}

async function openEmotePanel() {
  // Channel-Emotes aus der bereits geladenen emoteMap (name -> url).
  fillEmoteGrid($epChannel, Object.entries(emoteMap).map(([name, url]) => ({ name, url })).slice(0, 200));
  if (!userEmotesLoaded) {
    const res = await window.twitchDual.getUserEmotes();
    if (res.ok) fillEmoteGrid($epUser, res.emotes);
    userEmotesLoaded = true;
  }
  $emotePanel.classList.remove('hidden');
}

$emoteBtn.addEventListener('click', () => {
  if ($emotePanel.classList.contains('hidden')) openEmotePanel();
  else $emotePanel.classList.add('hidden');
});
// Klick außerhalb schließt das Panel.
document.addEventListener('mousedown', (e) => {
  if ($emotePanel.classList.contains('hidden')) return;
  if ($emotePanel.contains(e.target) || e.target === $emoteBtn) return;
  $emotePanel.classList.add('hidden');
});
```

Beim Quellwechsel den User-Emote-Cache **nicht** verwerfen (deine Emotes hängen am Konto, nicht am Channel) — aber die Channel-Emotes aktualisieren sich automatisch über `emoteMap`.

- [ ] **Step 3: CSS**

```css
#emote-panel { position: absolute; bottom: 100%; left: 6px; right: 6px; margin-bottom: 6px;
  max-height: 260px; overflow-y: auto; background: #14141c; border: 1px solid var(--accent-border, #333);
  border-radius: 8px; padding: 6px; }
.ep-section { font-size: 11px; color: var(--muted, #8b8b9c); margin: 4px 2px; }
.ep-grid { display: flex; flex-wrap: wrap; gap: 4px; }
.ep-emote { width: 28px; height: 28px; object-fit: contain; cursor: pointer; border-radius: 4px; }
.ep-emote:hover { background: rgba(255,255,255,.1); }
```

- [ ] **Step 4: Manuelle Verifikation**

Run: `npm start` (eingeloggt, Live geladen)
- Klick auf 😀 öffnet das Panel: Channel-Emotes (7TV/BTTV/FFZ) + „Deine Emotes" (Twitch-Sub-Emotes). Klick fügt den Code ins Feld ein (mit sauberem Leerzeichen). Senden zeigt das Emote im Chat als Bild.

- [ ] **Step 5: Commit**

```bash
git add renderer/chat/index.html renderer/chat/chat.js renderer/chat/chat.css
git commit -m "feat(ui): Emote-Picker (Channel- + eigene Twitch-Emotes)"
```

---

### Task 11: Sende-Fehler + Raum-Status-Anzeige

**Files:**
- Modify: `renderer/chat/index.html` (Raum-Status-Chip)
- Modify: `renderer/chat/chat.js` (`onChatNotice`, `onChatRoom`)
- Modify: `renderer/chat/chat.css` (Chip-Stil)

**Interfaces:**
- Consumes: `window.twitchDual.onChatNotice`, `onChatRoom` (Task 6); `showChatError` (Task 9).
- Produces: nichts Neues.

- [ ] **Step 1: HTML**

In `#composer` (vor `#chat-input`) einen Status-Chip:

```html
<span id="room-state" class="hidden"></span>
```

- [ ] **Step 2: Logik in `chat.js`**

```javascript
// --- Sende-Fehler (NOTICE) + Raum-Status (ROOMSTATE) -----------------------
window.twitchDual.onChatNotice((n) => { showChatError(n.text); });

const $roomState = document.getElementById('room-state');
window.twitchDual.onChatRoom((r) => {
  const parts = [];
  if (r.slowSeconds && r.slowSeconds > 0) parts.push('🐌 ' + r.slowSeconds + 's');
  if (r.followersOnly !== null && r.followersOnly >= 0) parts.push('Nur Follower');
  if (r.subsOnly) parts.push('Nur Subs');
  if (r.emoteOnly) parts.push('Nur Emotes');
  $roomState.textContent = parts.join(' · ');
  $roomState.classList.toggle('hidden', parts.length === 0);
});
```

- [ ] **Step 3: CSS**

```css
#room-state { font-size: 11px; color: var(--muted, #8b8b9c); background: rgba(255,255,255,.06);
  padding: 2px 6px; border-radius: 6px; white-space: nowrap; }
```

- [ ] **Step 4: Manuelle Verifikation**

Run: `npm start` (Live-Channel mit Slow-/Follower-/Sub-Mode zum Testen)
- In einem Slow-Mode-Channel erscheint der Chip „🐌 30s". Zu schnelles Senden / gesperrt → Fehlermeldung über dem Feld (z. B. „Slow-Mode aktiv — bitte warten." oder „Nur Follower dürfen schreiben.").

- [ ] **Step 5: Commit**

```bash
git add renderer/chat/index.html renderer/chat/chat.js renderer/chat/chat.css
git commit -m "feat(ui): Sende-Fehler + Raum-Status-Anzeige im Chat"
```

---

### Task 12: Version-Bump, Doku, Release-Vorbereitung

**Files:**
- Modify: `package.json` (`version`)
- Modify: `docs/TODO.md` (Changelog-Zeile)

- [ ] **Step 1: Version bumpen**

In `package.json` `"version": "1.7.0"` → `"version": "1.8.0"`.

- [ ] **Step 2: `docs/TODO.md` ergänzen**

Changelog-Eintrag für v1.8.0 hinzufügen:
```
## v1.8.0 — Login + Chatten
- Twitch-Login per Device Code Flow (Public Client, Token verschlüsselt via safeStorage)
- Gefolgte Channels im Home-Overlay (live zuerst)
- Chatten senden (IRC, Rate-Limit-Schutz), Emote-Picker (Channel + eigene Emotes)
- Sende-Fehler sichtbar (NOTICE) + Raum-Status (ROOMSTATE)
- Voraussetzung: einmalige Twitch-App-Registrierung (Client-ID in src/twitch-auth.js)
```

- [ ] **Step 3: Gesamttest + Smoke**

Run: `npm test` → Expected: PASS (alle Unit-Tests grün).
Run: `npm start` → Expected: App startet; End-to-End-Login + Senden funktioniert (mit eingetragener echter Client-ID).

- [ ] **Step 4: Commit**

```bash
git add package.json docs/TODO.md
git commit -m "release: v1.8.0 — Twitch-Login, Gefolgt, Chatten, Emote-Picker"
```

- [ ] **Step 5: Release (durch Janis, nach Test)**

Voraussetzung: echte Client-ID ist in `src/twitch-auth.js` eingetragen. Dann:
Run: `npm run release` (electron-builder, GitHub Releases; Auto-Update greift bei Nutzern).

---

## Self-Review

**Spec coverage:**
- Device Flow (start/poll/refresh/validate) → Task 1 ✓
- Token via safeStorage → Task 2 (+ Verdrahtung Task 6) ✓
- Gefolgte Channels (Helix + live-first) → Task 3 + Task 8 ✓
- Sende-Kern (PRIVMSG, Rate-Limit, NOTICE, ROOMSTATE) → Task 4 ✓
- Auth-IRC-Sende-Socket → Task 5 ✓
- IPC-Vertrag + Token bleibt im Main → Task 6 ✓
- Login-UI (Code-Panel) → Task 7 ✓
- Chat-Eingabe + Live/Login-Gating → Task 9 ✓
- Emote-Picker (geladene + eigene Emotes) → Task 10 ✓
- Sende-Fehler + Raum-Status → Task 11 ✓
- Version/Doku/Release → Task 12 ✓
- Scopes `chat:read chat:edit user:read:follows user:read:emotes` → Task 1 (`SCOPES`) ✓
- Preload-Whitelist, kein Token im Renderer → Task 6 ✓

**Placeholder scan:** Einziger bewusster Platzhalter: `CLIENT_ID = 'REPLACE_WITH_TWITCH_CLIENT_ID'` in Task 1 — muss von Janis mit der echten (nicht geheimen) Client-ID ersetzt werden; als `TODO(einmalig)` markiert und in Task 12/Release referenziert. Kein Code-Platzhalter sonst.

**Type consistency:** `startDeviceAuth`, `pollTokenOnce`, `refreshTokens`, `validateToken` (Task 1) werden in Task 6 (`auth-manager`) exakt so genutzt. `TokenStore(filePath, crypto, fsImpl?)` (Task 2) ↔ Verdrahtung Task 6. `ChatSender({WebSocketImpl,onNotice,onRoom,onStatus})` mit `login/logout/setChannel/send` (Task 5) ↔ Nutzung Task 6. `getFollowedChannels`/`getUserEmotes` Rückgabeform (Task 3) ↔ Konsum Task 8/10. `chatSend`/`onChatNotice`/`onChatRoom`/`getFollowed`/`getUserEmotes`/`auth*`-Bridge (Task 6) ↔ Renderer Tasks 7–11. Konsistent.
