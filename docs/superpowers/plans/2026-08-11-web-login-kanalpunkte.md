# Web-Login + Kanalpunkte Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Kanalpunkte des aktuell geschauten Kanals anzeigen, Kisten automatisch einsammeln und Belohnungen einlösen — über einen zweiten, eng begrenzten Web-Login-Token.

**Architecture:** Reine Logik in DOM-freie, testbare Module (`src/twitch-points.js`, `renderer/lib/points-state.js`); Nebenwirkungen im Main-Prozess. Der Web-Token wird per `safeStorage` verschlüsselt abgelegt und verlässt den Main-Prozess nie — der Renderer bekommt ausschließlich fertige Zahlen über IPC. Der 15-Sekunden-Takt läuft im Main.

**Tech Stack:** Electron 33, CommonJS, `node --test` (kein Test-Framework), Twitchs inoffizielle GraphQL-API (`gql.twitch.tv/gql`) mit rohen Queries.

**Spec:** `docs/superpowers/specs/2026-08-11-web-login-kanalpunkte-design.md`

## Global Constraints

- **Der Token verlässt den Main-Prozess nie.** Kein IPC-Kanal gibt ihn heraus, kein Renderer-Code sieht ihn. Verstoß = Sicherheitsfehler, nicht Geschmacksfrage.
- **Preload ist sandboxed — kein `fs`, kein `require` von Projektdateien.** Alles, was der Preload braucht, kommt per IPC aus dem Main. (Regressionstest existiert: `test/preload-sandbox.test.js`)
- **Header für jeden GQL-Aufruf:** `Client-ID: kimne78kx3ncx6brgo4mv6wki5h1ko` und `Authorization: OAuth <token>`.
- **Rohe GraphQL-Queries, niemals Persisted-Query-Hashes.** Hashes veralten und brechen bei Twitch-Deploys.
- **`community` ist ein Alias für `user(login:)`** — ein Wurzelfeld `community` existiert nicht.
- **Device-Flow-Token bleibt unangetastet** und weiterhin zuständig für Gefolgt-Liste und Chat-Senden. Der neue Token macht ausschließlich Punkte und Belohnungen.
- **Auto-Claim ist fest an**, kein Schalter, keine Einstellung.
- **Abgefragt wird nur bei Live-Kanal UND spielendem Player.** Nicht bei VOD, nicht bei Pause, nicht im Home-Overlay.
- **Nichts scheitert still.** Jeder Fehlerpfad endet in einer sichtbaren Meldung oder einem sichtbaren Zustand.
- **Die bestehenden 169 Tests bleiben grün.** `npm test` nach jeder Aufgabe.
- **Modulstil:** `src/*.js` CommonJS mit `module.exports`. `renderer/lib/*.js` im UMD-Muster von `ad-overlay-state.js` (läuft im Browser und unter Node).
- **Kommentare und Oberflächentexte auf Deutsch**, ohne Umlaute in Quelltext-Kommentaren (Projektkonvention: `Lautstaerke`, `naechste`).

## File Structure

| Datei | Verantwortung |
|---|---|
| `src/twitch-points.js` (neu) | Die vier GQL-Aufrufe. Bekommt `token` und `fetch` übergeben, kennt kein Electron. |
| `renderer/lib/points-state.js` (neu) | Wann abfragen, wann Kiste einlösen, wie zurückfahren. Reine Zeitstempel-Logik. |
| `src/twitch-web-auth.js` (neu) | Cookie holen, Token verschlüsselt ablegen/lesen. |
| `main.js` (ändern) | IPC-Kanäle, 15-s-Takt, Broadcast an das Chat-Fenster. |
| `preload.js` (ändern) | Brücke: `startWebLogin`, `onPointsUpdate`, `getRewards`, `redeemReward`. |
| `renderer/chat/chat.js` + `chat.css` (ändern) | Punktestand-Chip, Belohnungs-Panel. |
| `test/twitch-points.test.js`, `test/points-state.test.js`, `test/twitch-web-auth.test.js` (neu) | Unit-Tests. |

---

### Task 1: Spike — beweisen, dass Einlösen überhaupt geht

**Diese Aufgabe erzeugt keinen Produktivcode.** Sie ist ein Tor: Nur das *Lesen* der Punkte ist bewiesen (`balance: 34724`), das *Einlösen* nicht. Scheitert dieser Spike, ändert sich der Zuschnitt des ganzen Projekts.

**Files:**
- Create (Wegwerf, nicht committen): `<scratchpad>/mutation-spike.js`

**Interfaces:**
- Consumes: nichts
- Produces: die bestätigten Mutations-Formen für Task 2. Bis dieser Spike gelaufen ist, sind die Formen in Task 2 **Kandidaten, keine Wahrheit**.

- [ ] **Step 1: Spike-Skript schreiben**

```javascript
const { app, BrowserWindow, session } = require('electron');
const WEB = 'kimne78kx3ncx6brgo4mv6wki5h1ko';
const KANAL = process.argv[2] || 'krokoboss';
const log = (...a) => console.log('[MUT]', ...a);

async function gql(token, query, variables) {
  const r = await fetch('https://gql.twitch.tv/gql', {
    method: 'POST',
    headers: { 'Client-ID': WEB, 'Content-Type': 'application/json', 'Authorization': 'OAuth ' + token },
    body: JSON.stringify({ query, variables: variables || {} })
  });
  return { status: r.status, text: await r.text() };
}

app.on('ready', async () => {
  const win = new BrowserWindow({ width: 1100, height: 900, show: true });
  await win.loadURL('https://www.twitch.tv/login');
  let token = null;
  for (let i = 0; i < 96 && !token; i++) {
    await new Promise(r => setTimeout(r, 5000));
    const c = await win.webContents.session.cookies.get({ domain: '.twitch.tv', name: 'auth-token' });
    if (c.length) token = c[0].value;
  }
  if (!token) { log('kein Token'); app.quit(); return; }

  // 1) Kontext lesen (BEWIESEN) - liefert channelID und ggf. eine offene Kiste
  const ctx = await gql(token, `query($channelLogin: String!) {
    community: user(login: $channelLogin) {
      id displayName
      channel { self { communityPoints { balance availableClaim { id } } } }
    }
  }`, { channelLogin: KANAL });
  log('Kontext:', ctx.text.slice(0, 300));
  const j = JSON.parse(ctx.text);
  const channelID = j?.data?.community?.id;
  const claimID = j?.data?.community?.channel?.self?.communityPoints?.availableClaim?.id;

  // 2) Kiste einloesen - KANDIDAT, hier faellt die Entscheidung
  if (claimID) {
    const claim = await gql(token, `mutation($input: ClaimCommunityPointsInput!) {
      claimCommunityPoints(input: $input) { currentPoints error { code } }
    }`, { input: { channelID, claimID } });
    log('CLAIM:', claim.status, claim.text.slice(0, 300));
  } else {
    log('CLAIM: gerade keine Kiste offen - spaeter erneut laufen lassen!');
  }

  // 3) Belohnungsliste - KANDIDAT
  const rew = await gql(token, `query($channelLogin: String!) {
    community: user(login: $channelLogin) {
      id
      channel { communityPointsSettings {
        customRewards { id title cost isEnabled isPaused isUserInputRequired backgroundColor }
      } }
    }
  }`, { channelLogin: KANAL });
  log('BELOHNUNGEN:', rew.status, rew.text.slice(0, 500));

  log('=== Formen notieren, die 200 OHNE "errors" geliefert haben ===');
  app.quit();
});
```

- [ ] **Step 2: Spike laufen lassen**

Run: `./node_modules/.bin/electron <scratchpad>/mutation-spike.js krokoboss --user-data-dir=<scratchpad>/mut-profile`

Anmelden, Ausgabe abwarten.

**Wichtig:** Ist gerade keine Kiste offen, meldet das Skript das. Dann später erneut laufen lassen — der Claim-Pfad MUSS einmal echt bestätigt sein, bevor Task 5 gebaut wird.

- [ ] **Step 3: Ergebnis festhalten und über den Zuschnitt entscheiden**

Erwartet: HTTP 200 **ohne** `errors`-Feld.

- Claim UND Belohnungen gehen → Plan bleibt wie geschrieben.
- Nur Claim geht → **Task 7 streichen**, Spec-Abschnitt „Belohnungen" auf „verworfen, Grund: …" ändern.
- Beides scheitert → Projekt schrumpft auf reine Anzeige. Plan neu schneiden, Janis fragen.

Die tatsächlich funktionierenden Query-Formen wörtlich in diese Plandatei unter Task 2 eintragen, falls sie von den Kandidaten abweichen.

- [ ] **Step 4: Aufräumen**

```bash
rm -rf <scratchpad>/mut-profile <scratchpad>/mutation-spike.js
```

Das Profil enthält einen echten Twitch-Login-Token. Es darf nicht liegen bleiben.

---

### Task 2: `src/twitch-points.js` — die GQL-Aufrufe

**Files:**
- Create: `src/twitch-points.js`
- Test: `test/twitch-points.test.js`

**Interfaces:**
- Consumes: die in Task 1 bestätigten Query-Formen
- Produces:
  - `createPointsApi({ fetchImpl }) -> { context, claim, rewards, redeem }`
  - `context(token, channelLogin) -> { channelID, displayName, balance, claimID }` — `balance: null` heißt „Kanal hat keine Punkte"
  - `claim(token, channelID, claimID) -> { ok: boolean, error: string|null }`
  - `rewards(token, channelLogin) -> Array<{ id, title, cost, enabled }>`
  - `redeem(token, channelID, rewardID, textInput) -> { ok: boolean, error: string|null }`

- [ ] **Step 1: Failing test schreiben**

```javascript
const { test } = require('node:test');
const assert = require('node:assert');
const createPointsApi = require('../src/twitch-points');

function fakeFetch(antwort, status = 200) {
  const aufrufe = [];
  const f = async (url, opts) => {
    aufrufe.push({ url, opts, body: JSON.parse(opts.body) });
    return { status, text: async () => JSON.stringify(antwort) };
  };
  f.aufrufe = aufrufe;
  return f;
}

test('context liefert Punktestand und Kisten-ID', async () => {
  const f = fakeFetch({ data: { community: {
    id: '78874179', displayName: 'krokoboss',
    channel: { self: { communityPoints: { balance: 34724, availableClaim: { id: 'kiste-1' } } } }
  } } });
  const api = createPointsApi({ fetchImpl: f });
  const r = await api.context('geheim', 'krokoboss');
  assert.deepEqual(r, { channelID: '78874179', displayName: 'krokoboss', balance: 34724, claimID: 'kiste-1' });
});

test('context schickt die richtigen Header', async () => {
  const f = fakeFetch({ data: { community: null } });
  const api = createPointsApi({ fetchImpl: f });
  await api.context('geheim', 'krokoboss');
  const h = f.aufrufe[0].opts.headers;
  assert.equal(h['Client-ID'], 'kimne78kx3ncx6brgo4mv6wki5h1ko');
  assert.equal(h['Authorization'], 'OAuth geheim');
});

test('context nutzt eine rohe Query, keinen Persisted-Hash', async () => {
  const f = fakeFetch({ data: { community: null } });
  const api = createPointsApi({ fetchImpl: f });
  await api.context('geheim', 'krokoboss');
  assert.ok(f.aufrufe[0].body.query.includes('user(login:'));
  assert.equal(f.aufrufe[0].body.extensions, undefined);
});

test('Kanal ohne Punkte ergibt balance null statt Absturz', async () => {
  const f = fakeFetch({ data: { community: { id: '1', displayName: 'x', channel: { self: { communityPoints: null } } } } });
  const api = createPointsApi({ fetchImpl: f });
  const r = await api.context('geheim', 'x');
  assert.equal(r.balance, null);
  assert.equal(r.claimID, null);
});

test('service error wird als eigener Fehlertyp gemeldet', async () => {
  const f = fakeFetch({ errors: [{ message: 'service error' }], data: null });
  const api = createPointsApi({ fetchImpl: f });
  await assert.rejects(() => api.context('geheim', 'x'), /gesperrt/);
});

test('HTTP 401 wird als abgelaufener Token gemeldet', async () => {
  const f = fakeFetch({}, 401);
  const api = createPointsApi({ fetchImpl: f });
  await assert.rejects(() => api.context('geheim', 'x'), /abgelaufen/);
});

test('claim meldet Erfolg', async () => {
  const f = fakeFetch({ data: { claimCommunityPoints: { currentPoints: 34774, error: null } } });
  const api = createPointsApi({ fetchImpl: f });
  assert.deepEqual(await api.claim('geheim', '1', 'kiste-1'), { ok: true, error: null });
});

test('claim meldet Twitchs Fehlercode weiter', async () => {
  const f = fakeFetch({ data: { claimCommunityPoints: { currentPoints: null, error: { code: 'ALREADY_CLAIMED' } } } });
  const api = createPointsApi({ fetchImpl: f });
  assert.deepEqual(await api.claim('geheim', '1', 'k'), { ok: false, error: 'ALREADY_CLAIMED' });
});

test('rewards liefert nur aktive Belohnungen', async () => {
  const f = fakeFetch({ data: { community: { id: '1', channel: { communityPointsSettings: { customRewards: [
    { id: 'a', title: 'Hydrate', cost: 100, isEnabled: true, isPaused: false },
    { id: 'b', title: 'Aus', cost: 50, isEnabled: false, isPaused: false },
    { id: 'c', title: 'Pausiert', cost: 50, isEnabled: true, isPaused: true }
  ] } } } } });
  const api = createPointsApi({ fetchImpl: f });
  assert.deepEqual(await api.rewards('geheim', 'x'), [{ id: 'a', title: 'Hydrate', cost: 100, enabled: true }]);
});
```

- [ ] **Step 2: Test laufen lassen, Fehlschlag bestätigen**

Run: `node --test test/twitch-points.test.js`
Expected: FAIL, `Cannot find module '../src/twitch-points'`

- [ ] **Step 3: Modul schreiben**

```javascript
// Kanalpunkte ueber Twitchs inoffizielle GraphQL-API.
// Bekommt Token und fetch uebergeben -> kein Electron, voll testbar.
// Bewiesen 2026-08-11: nur ein echter Web-Login-Token wird akzeptiert,
// der Device-Flow-Token liefert 401. Siehe Spec.

const WEB_CLIENT_ID = 'kimne78kx3ncx6brgo4mv6wki5h1ko';
const ENDPUNKT = 'https://gql.twitch.tv/gql';

const Q_CONTEXT = `query($channelLogin: String!) {
  community: user(login: $channelLogin) {
    id displayName
    channel { self { communityPoints { balance availableClaim { id } } } }
  }
}`;

const M_CLAIM = `mutation($input: ClaimCommunityPointsInput!) {
  claimCommunityPoints(input: $input) { currentPoints error { code } }
}`;

const Q_REWARDS = `query($channelLogin: String!) {
  community: user(login: $channelLogin) {
    id
    channel { communityPointsSettings {
      customRewards { id title cost isEnabled isPaused }
    } }
  }
}`;

const M_REDEEM = `mutation($input: RedeemCommunityPointsCustomRewardInput!) {
  redeemCommunityPointsCustomReward(input: $input) { error { code } }
}`;

function createPointsApi({ fetchImpl = fetch } = {}) {
  async function ruf(token, query, variables) {
    const res = await fetchImpl(ENDPUNKT, {
      method: 'POST',
      headers: {
        'Client-ID': WEB_CLIENT_ID,
        'Content-Type': 'application/json',
        'Authorization': 'OAuth ' + token
      },
      body: JSON.stringify({ query, variables })
    });
    if (res.status === 401 || res.status === 403) {
      throw new Error('Anmeldung abgelaufen (HTTP ' + res.status + ')');
    }
    const daten = JSON.parse(await res.text());
    if (daten.errors && daten.errors.length) {
      const m = daten.errors[0].message || 'unbekannt';
      // "service error" = Feld existiert, Dienst verweigert (Client-Integrity).
      if (/service error/i.test(m)) throw new Error('Von Twitch gesperrt: ' + m);
      throw new Error('Twitch-Fehler: ' + m);
    }
    return daten.data;
  }

  return {
    async context(token, channelLogin) {
      const d = await ruf(token, Q_CONTEXT, { channelLogin });
      const c = d && d.community;
      if (!c) return { channelID: null, displayName: null, balance: null, claimID: null };
      const cp = c.channel && c.channel.self && c.channel.self.communityPoints;
      return {
        channelID: c.id,
        displayName: c.displayName,
        balance: cp ? cp.balance : null,
        claimID: cp && cp.availableClaim ? cp.availableClaim.id : null
      };
    },

    async claim(token, channelID, claimID) {
      const d = await ruf(token, M_CLAIM, { input: { channelID, claimID } });
      const r = d && d.claimCommunityPoints;
      const fehler = r && r.error ? r.error.code : null;
      return { ok: !fehler, error: fehler };
    },

    async rewards(token, channelLogin) {
      const d = await ruf(token, Q_REWARDS, { channelLogin });
      const s = d && d.community && d.community.channel && d.community.channel.communityPointsSettings;
      const liste = (s && s.customRewards) || [];
      return liste
        .filter(r => r.isEnabled && !r.isPaused)
        .map(r => ({ id: r.id, title: r.title, cost: r.cost, enabled: true }));
    },

    async redeem(token, channelID, rewardID, textInput) {
      const d = await ruf(token, M_REDEEM, {
        input: { channelID, rewardID, textInput: textInput || '' }
      });
      const r = d && d.redeemCommunityPointsCustomReward;
      const fehler = r && r.error ? r.error.code : null;
      return { ok: !fehler, error: fehler };
    }
  };
}

module.exports = createPointsApi;
```

- [ ] **Step 4: Tests laufen lassen**

Run: `node --test test/twitch-points.test.js`
Expected: PASS, 9 Tests

- [ ] **Step 5: Gesamtsuite prüfen**

Run: `npm test`
Expected: 178 Tests grün (169 alt + 9 neu)

- [ ] **Step 6: Commit**

```bash
git add src/twitch-points.js test/twitch-points.test.js
git commit -m "feat: Kanalpunkte-API (lesen, einloesen, Belohnungen)"
```

---

### Task 3: `renderer/lib/points-state.js` — Takt- und Fehlerlogik

**Files:**
- Create: `renderer/lib/points-state.js`
- Test: `test/points-state.test.js`

**Interfaces:**
- Consumes: nichts
- Produces:
  - `createPointsState({ intervalMs = 15000, maxBackoffMs = 300000, maxClaimVersuche = 3 })`
  - `sollAbfragen({ live, playing, hatToken }, nowMs) -> boolean`
  - `abfrageOk(nowMs)` / `abfrageFehler(nowMs)` — steuert das Zurückfahren
  - `darfClaimen(claimID) -> boolean` / `claimFehlgeschlagen(claimID)`
  - `kanalGesperrt(channelLogin)` / `istKanalGesperrt(channelLogin) -> boolean`
  - `get aktuellerAbstandMs`

- [ ] **Step 1: Failing test schreiben**

```javascript
const { test } = require('node:test');
const assert = require('node:assert');
const createPointsState = require('../renderer/lib/points-state');

test('fragt nicht ohne Token', () => {
  const s = createPointsState();
  assert.equal(s.sollAbfragen({ live: true, playing: true, hatToken: false }, 0), false);
});

test('fragt nicht bei VOD', () => {
  const s = createPointsState();
  assert.equal(s.sollAbfragen({ live: false, playing: true, hatToken: true }, 0), false);
});

test('fragt nicht bei pausiertem Player', () => {
  const s = createPointsState();
  assert.equal(s.sollAbfragen({ live: true, playing: false, hatToken: true }, 0), false);
});

test('erste Abfrage sofort, danach erst nach 15 s', () => {
  const s = createPointsState({ intervalMs: 15000 });
  const an = { live: true, playing: true, hatToken: true };
  assert.equal(s.sollAbfragen(an, 0), true);
  s.abfrageOk(0);
  assert.equal(s.sollAbfragen(an, 14000), false);
  assert.equal(s.sollAbfragen(an, 15000), true);
});

test('Fehler verdoppeln den Abstand, Erfolg setzt zurueck', () => {
  const s = createPointsState({ intervalMs: 15000 });
  s.abfrageFehler(0);
  assert.equal(s.aktuellerAbstandMs, 30000);
  s.abfrageFehler(30000);
  assert.equal(s.aktuellerAbstandMs, 60000);
  s.abfrageOk(90000);
  assert.equal(s.aktuellerAbstandMs, 15000);
});

test('Abstand ist bei 5 Minuten gedeckelt', () => {
  const s = createPointsState({ intervalMs: 15000, maxBackoffMs: 300000 });
  for (let i = 0; i < 20; i++) s.abfrageFehler(i * 1000);
  assert.equal(s.aktuellerAbstandMs, 300000);
});

test('dieselbe Kiste wird hoechstens 3 mal versucht', () => {
  const s = createPointsState({ maxClaimVersuche: 3 });
  assert.equal(s.darfClaimen('k1'), true);
  s.claimFehlgeschlagen('k1');
  s.claimFehlgeschlagen('k1');
  assert.equal(s.darfClaimen('k1'), true);
  s.claimFehlgeschlagen('k1');
  assert.equal(s.darfClaimen('k1'), false);
});

test('eine neue Kiste ist von der Sperre der alten unbetroffen', () => {
  const s = createPointsState({ maxClaimVersuche: 1 });
  s.claimFehlgeschlagen('k1');
  assert.equal(s.darfClaimen('k1'), false);
  assert.equal(s.darfClaimen('k2'), true);
});

test('gesperrter Kanal wird nicht mehr abgefragt', () => {
  const s = createPointsState();
  const an = { live: true, playing: true, hatToken: true, channelLogin: 'x' };
  assert.equal(s.sollAbfragen(an, 0), true);
  s.kanalGesperrt('x');
  assert.equal(s.istKanalGesperrt('x'), true);
  assert.equal(s.sollAbfragen(an, 100000), false);
  assert.equal(s.sollAbfragen({ ...an, channelLogin: 'y' }, 100000), true);
});
```

- [ ] **Step 2: Test laufen lassen, Fehlschlag bestätigen**

Run: `node --test test/points-state.test.js`
Expected: FAIL, `Cannot find module '../renderer/lib/points-state'`

- [ ] **Step 3: Modul schreiben**

```javascript
// DOM-freie Takt- und Fehlerlogik fuer die Kanalpunkte-Abfrage.
// UMD wie ad-overlay-state.js: laeuft im Browser und unter Node -> testbar.
//
// Regeln:
//   - abgefragt wird nur bei Live-Kanal, spielendem Player und vorhandenem Token
//   - nach Fehlern verdoppelt sich der Abstand bis maxBackoffMs, Erfolg setzt zurueck
//   - dieselbe Kiste hoechstens maxClaimVersuche mal (sonst Dauerfeuer gegen Twitch)
//   - ein Kanal ohne Punkte wird dauerhaft gesperrt statt endlos angefragt

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.createPointsState = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  function createPointsState({ intervalMs = 15000, maxBackoffMs = 300000, maxClaimVersuche = 3 } = {}) {
    let abstand = intervalMs;
    let letzteAbfrage = null;
    const claimVersuche = new Map();
    const gesperrteKanaele = new Set();

    return {
      sollAbfragen(zustand, nowMs) {
        if (!zustand || !zustand.hatToken) return false;
        if (!zustand.live || !zustand.playing) return false;
        if (zustand.channelLogin && gesperrteKanaele.has(zustand.channelLogin)) return false;
        if (letzteAbfrage === null) return true;
        return nowMs - letzteAbfrage >= abstand;
      },
      abfrageOk(nowMs) {
        letzteAbfrage = nowMs;
        abstand = intervalMs;
      },
      abfrageFehler(nowMs) {
        letzteAbfrage = nowMs;
        abstand = Math.min(abstand * 2, maxBackoffMs);
      },
      darfClaimen(claimID) {
        return (claimVersuche.get(claimID) || 0) < maxClaimVersuche;
      },
      claimFehlgeschlagen(claimID) {
        claimVersuche.set(claimID, (claimVersuche.get(claimID) || 0) + 1);
      },
      kanalGesperrt(channelLogin) {
        gesperrteKanaele.add(channelLogin);
      },
      istKanalGesperrt(channelLogin) {
        return gesperrteKanaele.has(channelLogin);
      },
      get aktuellerAbstandMs() { return abstand; }
    };
  }
  return createPointsState;
});
```

- [ ] **Step 4: Tests laufen lassen**

Run: `node --test test/points-state.test.js`
Expected: PASS, 9 Tests

- [ ] **Step 5: Commit**

```bash
git add renderer/lib/points-state.js test/points-state.test.js
git commit -m "feat: Takt- und Fehlerlogik fuer Kanalpunkte"
```

---

### Task 4: `src/twitch-web-auth.js` — Token holen und ablegen

**Files:**
- Create: `src/twitch-web-auth.js`
- Test: `test/twitch-web-auth.test.js`

**Interfaces:**
- Consumes: nichts
- Produces:
  - `tokenAusCookies(cookies) -> string|null` — rein, testbar
  - `createWebAuthStore({ safeStorage, store }) -> { speichern(token), lesen() -> string|null, loeschen() }`
  - `oeffneLoginFenster({ BrowserWindow, onToken })` — nicht unit-getestet

- [ ] **Step 1: Failing test schreiben**

```javascript
const { test } = require('node:test');
const assert = require('node:assert');
const { tokenAusCookies, createWebAuthStore } = require('../src/twitch-web-auth');

test('findet den auth-token in der Cookie-Liste', () => {
  assert.equal(tokenAusCookies([
    { name: 'unique_id', value: 'abc' },
    { name: 'auth-token', value: 'geheim123' }
  ]), 'geheim123');
});

test('liefert null wenn kein auth-token dabei ist', () => {
  assert.equal(tokenAusCookies([{ name: 'unique_id', value: 'abc' }]), null);
  assert.equal(tokenAusCookies([]), null);
  assert.equal(tokenAusCookies(null), null);
});

test('leerer Token-Wert zaehlt nicht als Token', () => {
  assert.equal(tokenAusCookies([{ name: 'auth-token', value: '' }]), null);
});

function fakeSafeStorage() {
  return {
    isEncryptionAvailable: () => true,
    encryptString: (s) => Buffer.from('ENC:' + s),
    decryptString: (b) => b.toString().replace(/^ENC:/, '')
  };
}
function fakeStore() {
  const daten = new Map();
  return {
    get: (k) => daten.get(k),
    set: (k, v) => daten.set(k, v),
    delete: (k) => daten.delete(k)
  };
}

test('speichert verschluesselt und liest zurueck', () => {
  const store = fakeStore();
  const s = createWebAuthStore({ safeStorage: fakeSafeStorage(), store });
  s.speichern('geheim123');
  assert.notEqual(String(store.get('webAuthToken')), 'geheim123');  // nicht im Klartext
  assert.equal(s.lesen(), 'geheim123');
});

test('lesen ohne gespeicherten Token ergibt null', () => {
  const s = createWebAuthStore({ safeStorage: fakeSafeStorage(), store: fakeStore() });
  assert.equal(s.lesen(), null);
});

test('loeschen entfernt den Token', () => {
  const store = fakeStore();
  const s = createWebAuthStore({ safeStorage: fakeSafeStorage(), store });
  s.speichern('geheim123');
  s.loeschen();
  assert.equal(s.lesen(), null);
});

test('ohne Verschluesselung wird NICHT im Klartext gespeichert', () => {
  const store = fakeStore();
  const ss = { ...fakeSafeStorage(), isEncryptionAvailable: () => false };
  const s = createWebAuthStore({ safeStorage: ss, store });
  assert.throws(() => s.speichern('geheim123'), /Verschluesselung/);
  assert.equal(store.get('webAuthToken'), undefined);
});
```

- [ ] **Step 2: Test laufen lassen, Fehlschlag bestätigen**

Run: `node --test test/twitch-web-auth.test.js`
Expected: FAIL, `Cannot find module '../src/twitch-web-auth'`

- [ ] **Step 3: Modul schreiben**

```javascript
// Web-Login: echter Twitch-Browser-Login in einem Fenster, danach liegt das
// auth-token-Cookie in der Session. Nur dieser Token-Typ wird von der
// Kanalpunkte-API akzeptiert (Device-Flow-Token -> 401, siehe Spec).
//
// Der Token bleibt IMMER im Main-Prozess und wird verschluesselt abgelegt.

const SCHLUESSEL = 'webAuthToken';

function tokenAusCookies(cookies) {
  if (!Array.isArray(cookies)) return null;
  const c = cookies.find(x => x && x.name === 'auth-token' && x.value);
  return c ? c.value : null;
}

function createWebAuthStore({ safeStorage, store }) {
  return {
    speichern(token) {
      if (!safeStorage.isEncryptionAvailable()) {
        // Lieber gar nicht speichern als im Klartext.
        throw new Error('Verschluesselung nicht verfuegbar - Token wird nicht gespeichert');
      }
      store.set(SCHLUESSEL, safeStorage.encryptString(token));
    },
    lesen() {
      const roh = store.get(SCHLUESSEL);
      if (!roh) return null;
      try {
        return safeStorage.decryptString(Buffer.from(roh));
      } catch {
        return null;   // z.B. nach Nutzerwechsel nicht mehr entschluesselbar
      }
    },
    loeschen() {
      store.delete(SCHLUESSEL);
    }
  };
}

// Nicht unit-getestet (echtes Fenster). Oeffnet den Twitch-Login und meldet
// den Token, sobald das Cookie auftaucht.
function oeffneLoginFenster({ BrowserWindow, onToken, onAbbruch }) {
  const win = new BrowserWindow({
    width: 1000, height: 800, autoHideMenuBar: true,
    webPreferences: { nodeIntegration: false, contextIsolation: true }
  });
  let fertig = false;
  const pruefen = async () => {
    if (fertig) return;
    const cookies = await win.webContents.session.cookies.get({ domain: '.twitch.tv', name: 'auth-token' });
    const token = tokenAusCookies(cookies);
    if (token) {
      fertig = true;
      clearInterval(timer);
      onToken(token);
      try { win.close(); } catch { /* schon zu */ }
    }
  };
  const timer = setInterval(pruefen, 1000);
  win.on('closed', () => {
    clearInterval(timer);
    if (!fertig && onAbbruch) onAbbruch();
  });
  win.loadURL('https://www.twitch.tv/login');
  return win;
}

module.exports = { tokenAusCookies, createWebAuthStore, oeffneLoginFenster };
```

- [ ] **Step 4: Tests laufen lassen**

Run: `node --test test/twitch-web-auth.test.js`
Expected: PASS, 7 Tests

- [ ] **Step 5: Gesamtsuite prüfen**

Run: `npm test`
Expected: 194 Tests grün

- [ ] **Step 6: Commit**

```bash
git add src/twitch-web-auth.js test/twitch-web-auth.test.js
git commit -m "feat: Web-Login-Token holen und verschluesselt ablegen"
```

---

### Task 5: Main-Verdrahtung — Login, Takt, Broadcast

**Files:**
- Modify: `main.js` (neue IPC-Kanäle + Takt-Schleife, nach dem `get-volume-guard-source`-Handler einfügen)
- Modify: `preload.js` (Brücke im `if (!isTwitchFrame)`-Zweig, neben `onChatRoom`)

**Interfaces:**
- Consumes: `createPointsApi` (Task 2), `createPointsState` (Task 3), `createWebAuthStore`/`oeffneLoginFenster` (Task 4)
- Produces:
  - IPC `web-login-start` → `{ ok, login }` | `{ ok: false, error }`
  - IPC `web-login-status` → `{ angemeldet: boolean }`
  - IPC `web-login-logout` → `{ ok: true }`
  - Broadcast `points-update` → `{ balance, displayName, fehler }` ans Chat-Fenster
  - Preload-Brücke: `startWebLogin()`, `webLoginStatus()`, `webLogout()`, `onPointsUpdate(cb)`

- [ ] **Step 1: Main-Verdrahtung schreiben**

```javascript
// --- Kanalpunkte -----------------------------------------------------------
// Der Web-Token bleibt hier im Main. Kein IPC-Kanal gibt ihn heraus.
const createPointsApi = require('./src/twitch-points');
const createPointsState = require('./renderer/lib/points-state');
const { createWebAuthStore, oeffneLoginFenster } = require('./src/twitch-web-auth');

const pointsApi = createPointsApi({});
const pointsState = createPointsState({ intervalMs: 15000 });
const webAuth = createWebAuthStore({ safeStorage, store });

let punkteKanal = null;      // aktueller Live-Kanal (null = VOD/nichts)
let punkteSpielt = false;    // Player-Zustand

ipcMain.handle('web-login-start', () => new Promise((resolve) => {
  oeffneLoginFenster({
    BrowserWindow,
    onToken: async (token) => {
      try {
        webAuth.speichern(token);
        resolve({ ok: true });
      } catch (e) {
        resolve({ ok: false, error: e.message });
      }
    },
    onAbbruch: () => resolve({ ok: false, error: 'Anmeldung abgebrochen' })
  });
}));

ipcMain.handle('web-login-status', () => ({ angemeldet: !!webAuth.lesen() }));
ipcMain.handle('web-login-logout', () => { webAuth.loeschen(); return { ok: true }; });

ipcMain.handle('points-rewards', async () => {
  const token = webAuth.lesen();
  if (!token || !punkteKanal) return { ok: false, error: 'nicht angemeldet' };
  try {
    return { ok: true, rewards: await pointsApi.rewards(token, punkteKanal) };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

ipcMain.handle('points-redeem', async (_e, { rewardID, textInput }) => {
  const token = webAuth.lesen();
  if (!token || !punkteKanal) return { ok: false, error: 'nicht angemeldet' };
  try {
    const ctx = await pointsApi.context(token, punkteKanal);
    return await pointsApi.redeem(token, ctx.channelID, rewardID, textInput);
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

// 15-s-Takt: fragt nur bei Live-Kanal + spielendem Player + Token.
setInterval(async () => {
  const token = webAuth.lesen();
  const zustand = {
    live: !!punkteKanal, playing: punkteSpielt,
    hatToken: !!token, channelLogin: punkteKanal
  };
  if (!pointsState.sollAbfragen(zustand, Date.now())) return;
  try {
    const ctx = await pointsApi.context(token, punkteKanal);
    pointsState.abfrageOk(Date.now());
    if (ctx.balance === null) {
      // Kanal hat Kanalpunkte aus -> einmal melden, dann ruhen.
      pointsState.kanalGesperrt(punkteKanal);
      broadcast('points-update', { balance: null, fehler: 'Kanal hat keine Kanalpunkte' });
      return;
    }
    if (ctx.claimID && pointsState.darfClaimen(ctx.claimID)) {
      const r = await pointsApi.claim(token, ctx.channelID, ctx.claimID);
      if (!r.ok) pointsState.claimFehlgeschlagen(ctx.claimID);
    }
    broadcast('points-update', { balance: ctx.balance, displayName: ctx.displayName, fehler: null });
  } catch (e) {
    pointsState.abfrageFehler(Date.now());
    broadcast('points-update', { balance: null, fehler: e.message });
  }
}, 1000);
```

**Wichtig:** Die Schleife tickt jede Sekunde, aber `sollAbfragen` lässt sie nur alle 15 s (bzw. nach Zurückfahren seltener) wirklich durch. So wirkt das Zurückfahren, ohne den Timer neu setzen zu müssen.

- [ ] **Step 2: `punkteKanal`/`punkteSpielt` an die bestehenden Signale hängen**

Im vorhandenen `submitLoad`-Pfad (dort wird Live vs. VOD schon unterschieden) ergänzen:

```javascript
punkteKanal = (modus === 'live') ? kanalName : null;
```

Im vorhandenen `player-state`-Handler ergänzen:

```javascript
punkteSpielt = (zustand === 'playing');
```

Die exakten Variablennamen aus dem umgebenden Code übernehmen — nicht raten, nachlesen.

- [ ] **Step 3: Preload-Brücke ergänzen**

In `preload.js` im `if (!isTwitchFrame)`-Zweig, direkt nach `onChatRoom`:

```javascript
    startWebLogin: () => ipcRenderer.invoke('web-login-start'),
    webLoginStatus: () => ipcRenderer.invoke('web-login-status'),
    webLogout: () => ipcRenderer.invoke('web-login-logout'),
    getRewards: () => ipcRenderer.invoke('points-rewards'),
    redeemReward: (rewardID, textInput) => ipcRenderer.invoke('points-redeem', { rewardID, textInput }),
    onPointsUpdate: (cb) => { ipcRenderer.on('points-update', (_e, p) => cb(p)); }
```

- [ ] **Step 4: Prüfen, dass der Token nirgends nach außen geht**

Run: `grep -n "webAuth.lesen()" main.js`
Expected: Treffer **nur** innerhalb von Main-Funktionen — **kein** Treffer in einem `resolve(...)`, `return`-Wert eines IPC-Handlers oder `broadcast(...)`.

Run: `grep -rn "auth-token\|webAuthToken" preload.js renderer/`
Expected: **keine Treffer**

- [ ] **Step 5: Syntax und Gesamtsuite prüfen**

Run: `node --check main.js && node --check preload.js && npm test`
Expected: 194 Tests grün

- [ ] **Step 6: Commit**

```bash
git add main.js preload.js
git commit -m "feat: Web-Login und Kanalpunkte-Takt im Main verdrahtet"
```

---

### Task 6: Punktestand-Chip in der Chat-Fußzeile

**Files:**
- Modify: `renderer/chat/chat.js` (Anmelde-Knopf + Chip, beim Raum-Status-Chip einfügen)
- Modify: `renderer/chat/chat.css`
- Modify: `renderer/chat/index.html`

**Interfaces:**
- Consumes: `window.twitchDual.onPointsUpdate`, `startWebLogin`, `webLoginStatus`
- Produces: DOM-Element `#points-chip`

- [ ] **Step 1: Markup ergänzen**

In `renderer/chat/index.html`, neben dem bestehenden Raum-Status-Chip:

```html
<span id="points-chip" class="chip hidden" title="Kanalpunkte"></span>
```

- [ ] **Step 2: Verhalten schreiben**

```javascript
// Kanalpunkte-Chip. Zeigt Stand, Fehler oder den Anmelde-Knopf.
const $pointsChip = document.getElementById('points-chip');

function zeigePunkte(p) {
  if (!$pointsChip) return;
  $pointsChip.classList.remove('hidden', 'err', 'stale');
  if (p && p.fehler) {
    // Nichts scheitert still: Fehler steht im Chip, nicht nur in der Konsole.
    $pointsChip.classList.add(/abgelaufen/i.test(p.fehler) ? 'err' : 'stale');
    $pointsChip.textContent = /abgelaufen/i.test(p.fehler) ? '⚠ Anmeldung abgelaufen' : '⚠ ' + p.fehler;
    $pointsChip.onclick = /abgelaufen/i.test(p.fehler) ? starteWebLogin : null;
    return;
  }
  if (!p || p.balance == null) { $pointsChip.classList.add('hidden'); return; }
  $pointsChip.textContent = '🪙 ' + p.balance.toLocaleString('de-DE');
  $pointsChip.onclick = null;
}

async function starteWebLogin() {
  const r = await window.twitchDual.startWebLogin();
  if (!r.ok) {
    $pointsChip.classList.remove('hidden');
    $pointsChip.classList.add('err');
    $pointsChip.textContent = '⚠ ' + r.error;
    return;
  }
  $pointsChip.textContent = '🪙 …';
}

window.twitchDual.onPointsUpdate(zeigePunkte);

// Beim Start: nicht angemeldet -> Anmelde-Knopf statt leerer Flaeche.
(async () => {
  const s = await window.twitchDual.webLoginStatus();
  if (!s.angemeldet) {
    $pointsChip.classList.remove('hidden');
    $pointsChip.textContent = '🪙 Für Kanalpunkte anmelden';
    $pointsChip.onclick = starteWebLogin;
  }
})();
```

- [ ] **Step 3: Stil ergänzen**

```css
#points-chip { cursor: default; }
#points-chip[onclick] { cursor: pointer; }
#points-chip.err { color: #ff6b6b; cursor: pointer; }
#points-chip.stale { opacity: 0.55; }
```

- [ ] **Step 4: In der echten App prüfen**

Run: `npm start`

Prüfen: Ohne Anmeldung steht „Für Kanalpunkte anmelden" im Chip. Nach Klick öffnet sich der Login. Nach der Anmeldung erscheint binnen 15 s der Punktestand. Danach den Player pausieren — der Stand darf stehenbleiben, ohne dass Fehler auftauchen.

- [ ] **Step 5: Commit**

```bash
git add renderer/chat/chat.js renderer/chat/chat.css renderer/chat/index.html
git commit -m "feat: Kanalpunkte-Chip in der Chat-Fusszeile"
```

---

### Task 7: Belohnungs-Panel

**Nur bauen, wenn Task 1 die Belohnungs- und Einlöse-Aufrufe bestätigt hat.** Sonst diese Aufgabe streichen und die Spec entsprechend korrigieren.

**Files:**
- Modify: `renderer/chat/chat.js`, `renderer/chat/chat.css`, `renderer/chat/index.html`

**Interfaces:**
- Consumes: `window.twitchDual.getRewards()`, `redeemReward(rewardID, textInput)`
- Produces: DOM-Element `#rewards-panel`

- [ ] **Step 1: Markup ergänzen**

```html
<button id="rewards-btn" class="icon-btn" title="Belohnungen">🎁</button>
<div id="rewards-panel" class="panel hidden"></div>
```

- [ ] **Step 2: Verhalten schreiben**

```javascript
const $rewardsBtn = document.getElementById('rewards-btn');
const $rewardsPanel = document.getElementById('rewards-panel');

async function oeffneBelohnungen() {
  $rewardsPanel.classList.toggle('hidden');
  if ($rewardsPanel.classList.contains('hidden')) return;
  $rewardsPanel.textContent = 'lädt …';
  const r = await window.twitchDual.getRewards();
  if (!r.ok) { $rewardsPanel.textContent = '⚠ ' + r.error; return; }
  if (!r.rewards.length) { $rewardsPanel.textContent = 'Keine Belohnungen verfügbar.'; return; }
  $rewardsPanel.innerHTML = '';
  for (const b of r.rewards) {
    const el = document.createElement('button');
    el.className = 'reward';
    el.textContent = b.title + ' · ' + b.cost.toLocaleString('de-DE');
    // Punkte ausgeben ist nicht umkehrbar -> immer nachfragen.
    el.onclick = async () => {
      if (!confirm('„' + b.title + '" für ' + b.cost.toLocaleString('de-DE') + ' Punkte einlösen?')) return;
      el.disabled = true;
      const res = await window.twitchDual.redeemReward(b.id, '');
      el.textContent = res.ok ? '✓ ' + b.title : '⚠ ' + (res.error || 'fehlgeschlagen');
      if (!res.ok) el.disabled = false;
    };
    $rewardsPanel.appendChild(el);
  }
}

$rewardsBtn.addEventListener('click', oeffneBelohnungen);
```

- [ ] **Step 3: Stil ergänzen**

```css
#rewards-panel { position: absolute; bottom: 100%; right: 0; max-height: 40vh;
  overflow-y: auto; background: var(--panel); border-radius: 8px; padding: 6px; }
#rewards-panel .reward { display: block; width: 100%; text-align: left;
  padding: 6px 8px; background: none; border: none; color: inherit; cursor: pointer; }
#rewards-panel .reward:hover:not(:disabled) { background: var(--hover); }
#rewards-panel .reward:disabled { opacity: 0.5; cursor: default; }
```

- [ ] **Step 4: In der echten App prüfen**

Run: `npm start`

Prüfen: Panel öffnet, Liste erscheint. **Eine billige Belohnung testweise einlösen** und bestätigen, dass der Punktestand im Chip binnen 15 s sinkt. Abbrechen in der Rückfrage darf nichts auslösen.

- [ ] **Step 5: Commit**

```bash
git add renderer/chat/
git commit -m "feat: Belohnungen einloesen mit Rueckfrage"
```

---

### Task 8: Dokumentation, Version, Release

**Files:**
- Modify: `docs/TODO.md`, `package.json`

- [ ] **Step 1: `docs/TODO.md` ergänzen**

Neuer Abschnitt `## Kanalpunkte (v1.9.0)` mit: Messergebnissen aus der Spec (Device-Flow 401 vs. Web-Token 200), der Token-Zuständigkeit, dem Grund gegen den Vollersatz (Gefolgt-Liste gesperrt), und dem Hinweis, dass rohe Queries statt Persisted-Hashes verwendet werden.

- [ ] **Step 2: Version bumpen**

`package.json`: `"version": "1.9.0"` (neues Feature → Minor).

- [ ] **Step 3: Gesamtsuite**

Run: `npm test`
Expected: alle grün

- [ ] **Step 4: Commit, Merge, Release**

```bash
git add docs/TODO.md package.json
git commit -m "release: v1.9.0 - Kanalpunkte mit Web-Login"
git checkout master && git merge --ff-only feat/web-login-kanalpunkte
git push origin master
```

Dann:

```bash
$env:GH_TOKEN = (gh auth token)
npm run release
```

- [ ] **Step 5: Release-Assets prüfen — nicht überspringen**

Run: `gh release view v1.9.0 --json isDraft,assets`

Erwartet: `isDraft: false` und **drei** Assets (`TwitchDual-Setup-1.9.0.exe`, `.exe.blockmap`, `latest.yml`).

`electron-builder` 26.15.3 hat in diesem Projekt schon zweimal unvollständig veröffentlicht — einmal fehlte die `.exe`, einmal die `.blockmap`, und beide Male war es ein Draft mit untagged-URL. Fehlendes nachreichen:

```bash
cp "dist/installer/TwitchDual Setup 1.9.0.exe.blockmap" "dist/installer/TwitchDual-Setup-1.9.0.exe.blockmap"
gh release upload v1.9.0 "dist/installer/TwitchDual-Setup-1.9.0.exe.blockmap" --clobber
gh release edit v1.9.0 --draft=false
```

---

## Selbstprüfung (durchgeführt)

**Spec-Abdeckung:** Punktestand → Task 2+5+6. Auto-Claim fest an → Task 5 (kein Schalter vorgesehen). Belohnungen mit Rückfrage → Task 7. Nur aktueller Kanal → Task 5 (`punkteKanal`). 15-s-Takt → Task 3+5. Token nur im Main → Global Constraints + Task 5 Step 4 als expliziter Prüfschritt. Zwei Token getrennt → Device-Flow-Code wird nirgends angefasst. Fehlerbehandlung (5 Fälle) → Task 3 (Zurückfahren, Claim-Deckel, Kanalsperre) + Task 2 (Token abgelaufen, service error) + Task 6 (sichtbare Meldung). Tests → Tasks 2, 3, 4. Risiko „Einlösen unbewiesen" → Task 1 als Tor mit Abbruchkriterien.

**Platzhalter:** keine. Jeder Code-Schritt enthält lauffähigen Code; die einzigen bewusst offenen Stellen sind Task 5 Step 2 (Variablennamen aus dem umgebenden Code übernehmen) und die Kandidaten-Formen in Task 2, die Task 1 bestätigt oder korrigiert — beides ausdrücklich als solches markiert.

**Typkonsistenz:** `context()` liefert überall `{ channelID, displayName, balance, claimID }`; Task 5 nutzt genau diese Namen. `claim()`/`redeem()` liefern beide `{ ok, error }`; Task 5 und 7 lesen genau das. `rewards()` liefert `{ id, title, cost, enabled }`; Task 7 nutzt `id`, `title`, `cost`. `sollAbfragen` bekommt in Task 3 und Task 5 dieselben vier Felder.
