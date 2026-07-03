# Chat-Badges als echte Bilder — Implementation Plan (v1.3.0)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Die B/M/V/S-Farbchips im Chat durch echte Badge-Bilder ersetzen — Twitch-Global-Katalog (alle Sets inkl. Wahl-Badges), Kanal-Sub/Bits-Badges, 7TV/BTTV/FFZ-User-Badges — in Live-Chat UND VOD-Replay.

**Architecture:** Badge-Kataloge werden im Main-Prozess beim `submit-load` geholt (Muster der 7TV-Emotes) und als fertige Map im `load`-Payload gebroadcastet. Die DOM-freie Auflösungslogik lebt als UMD-Modul in `renderer/lib/badges.js`. Third-Party-Badges (7TV/BTTV/FFZ, pro User) laufen über ein neues IPC-Handle `user-badges` mit Session-Cache im Main.

**Tech Stack:** Electron (Main/Renderer/Preload), inoffizielle Twitch-GQL (`src/twitch-gql.js`), 7TV/BTTV/FFZ-REST, `node --test`.

**Spec:** `docs/superpowers/specs/2026-07-03-chat-badges-design.md`

## Global Constraints

- Alle 67 Bestandstests bleiben grün (`npm test`); neue Tests ohne Netz (injizierter `fetchImpl`, Vorbild `test/twitch-gql.test.js`).
- Keine Exception aus der Badge-Schiene darf je eine Chat-Nachricht verhindern — jede Quelle einzeln fail-soft.
- Katalog komplett fehlgeschlagen → Kürzel-Fallback (B/M/V/S); Katalog da, Set unbekannt → Badge still weglassen.
- ⚙-Schalter „Badges anzeigen" (`chatPrefs.showBadges`, CSS-Klasse `hide-badges`) muss weiter wirken.
- GQL-Aufrufe NUR über `src/twitch-gql.js` (`gql`, `fetchWithRetry`); kein Helix-OAuth.
- Kommentare/Strings im Projektstil: Deutsch, ASCII-Umlaute in JS-Kommentaren vermeiden wo die Datei das so hält (Bestandsdateien nutzen `ue`/`oe` — beibehalten).
- Commits im Stil der Historie: `feat:`/`fix:`/`docs:`/`test:` + deutsche Zusammenfassung.

---

### Task 1: `renderer/lib/badges.js` — Tag-Parsing (parseBadgeTag, subMonths)

**Files:**
- Create: `renderer/lib/badges.js`
- Test: `test/badges.test.js`

**Interfaces:**
- Produces: UMD-Modul `Badges` (Browser-Global) / `module.exports` (Node) mit
  `parseBadgeTag(tags) -> [{set: string, version: string}]` und
  `subMonths(tags) -> number|null`.

- [ ] **Step 1: Failing Tests schreiben**

`test/badges.test.js`:

```js
const { test } = require('node:test');
const assert = require('node:assert');
const Badges = require('../renderer/lib/badges');

test('parseBadgeTag: Set/Version-Paare inkl. Wahl-Badges', () => {
  assert.deepEqual(
    Badges.parseBadgeTag({ badges: 'subscriber/24,premium/1,game-developer/1' }),
    [
      { set: 'subscriber', version: '24' },
      { set: 'premium', version: '1' },
      { set: 'game-developer', version: '1' }
    ]
  );
});

test('parseBadgeTag: kaputte/leere Tags werfen nie', () => {
  assert.deepEqual(Badges.parseBadgeTag({ badges: '' }), []);
  assert.deepEqual(Badges.parseBadgeTag({}), []);
  assert.deepEqual(Badges.parseBadgeTag(null), []);
  // fehlende Version -> '1'; leere Teile fliegen raus
  assert.deepEqual(
    Badges.parseBadgeTag({ badges: 'vip,,broadcaster/' }),
    [{ set: 'vip', version: '1' }, { set: 'broadcaster', version: '1' }]
  );
});

test('subMonths: Abo-Monate aus badge-info (subscriber und founder)', () => {
  assert.equal(Badges.subMonths({ 'badge-info': 'subscriber/26' }), 26);
  assert.equal(Badges.subMonths({ 'badge-info': 'founder/14' }), 14);
  assert.equal(Badges.subMonths({ 'badge-info': 'predictions/blue-1' }), null);
  assert.equal(Badges.subMonths({}), null);
  assert.equal(Badges.subMonths(null), null);
});
```

- [ ] **Step 2: Tests laufen lassen — müssen fehlschlagen**

Run: `node --test test/badges.test.js`
Expected: FAIL („Cannot find module '../renderer/lib/badges'")

- [ ] **Step 3: Implementierung**

`renderer/lib/badges.js` (UMD-Kopf wie `renderer/lib/irc.js`):

```js
// Badge-Aufloesung: IRC-Tags/VOD-Badges + Kataloge (Twitch global/Kanal)
// -> Render-Liste mit Bild-URLs. UMD wie irc.js: Browser (<script>) und
// Node (Tests). DOM-frei, wirft nie.

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.Badges = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  // badges-Tag ("subscriber/24,premium/1") -> [{set, version}].
  // Fehlende Version -> '1' (Twitch schickt praktisch immer eine).
  function parseBadgeTag(tags) {
    return String((tags && tags['badges']) || '')
      .split(',')
      .map(function (part) {
        var slash = part.indexOf('/');
        if (slash === -1) return { set: part.trim(), version: '1' };
        return {
          set: part.slice(0, slash).trim(),
          version: part.slice(slash + 1).trim() || '1'
        };
      })
      .filter(function (b) { return b.set; });
  }

  // badge-info-Tag ("subscriber/26") -> Abo-Monate fuer den Tooltip.
  // Gilt fuer subscriber und founder; alles andere (z.B. predictions) null.
  function subMonths(tags) {
    var parts = String((tags && tags['badge-info']) || '').split(',');
    for (var i = 0; i < parts.length; i++) {
      var slash = parts[i].indexOf('/');
      if (slash === -1) continue;
      var set = parts[i].slice(0, slash).trim();
      if (set === 'subscriber' || set === 'founder') {
        var n = parseInt(parts[i].slice(slash + 1), 10);
        if (!isNaN(n) && n > 0) return n;
      }
    }
    return null;
  }

  return { parseBadgeTag: parseBadgeTag, subMonths: subMonths };
});
```

- [ ] **Step 4: Tests laufen lassen — müssen bestehen**

Run: `node --test test/badges.test.js`
Expected: PASS (3 Tests)

- [ ] **Step 5: Gesamte Suite + Commit**

Run: `npm test` — Expected: 70 Tests grün (67 + 3).

```bash
git add renderer/lib/badges.js test/badges.test.js
git commit -m "feat: Badge-Tag-Parsing (badges= + badge-info=) als UMD-Modul"
```

---

### Task 2: `renderer/lib/badges.js` — buildCatalog + resolve

**Files:**
- Modify: `renderer/lib/badges.js`
- Test: `test/badges.test.js`

**Interfaces:**
- Consumes: Task-1-Modulgerüst.
- Produces:
  `buildCatalog(globalList, channelList) -> { "set/version": {url, title}, "set/*": … }`
  (Listen: Arrays von `{setID, version, title, imageURL}`, wie die GQL-Fetcher
  aus Task 3 sie liefern; Kanal überschreibt global);
  `resolve(pairs, catalog, opts) -> [{url, title} | {fallback, color, title}]`
  (`opts.months` für den Subscriber-Tooltip); `FALLBACK` (Kürzel-Map).

- [ ] **Step 1: Failing Tests ergänzen**

An `test/badges.test.js` anhängen:

```js
const GLOBAL = [
  { setID: 'moderator', version: '1', title: 'Moderator', imageURL: 'https://cdn/mod/2' },
  { setID: 'subscriber', version: '0', title: 'Subscriber', imageURL: 'https://cdn/sub0/2' },
  { setID: 'premium', version: '1', title: 'Prime Gaming', imageURL: 'https://cdn/prime/2' }
];
const CHANNEL = [
  { setID: 'subscriber', version: '0', title: 'Sub', imageURL: 'https://cdn/ch-sub0/2' },
  { setID: 'subscriber', version: '24', title: '2-Year Sub', imageURL: 'https://cdn/ch-sub24/2' },
  { setID: 'bits', version: '1000', title: 'cheer 1000', imageURL: 'https://cdn/ch-bits1k/2' }
];

test('buildCatalog: Kanal ueberschreibt global, set/* als Versions-Fallback', () => {
  const cat = Badges.buildCatalog(GLOBAL, CHANNEL);
  assert.equal(cat['moderator/1'].url, 'https://cdn/mod/2');
  assert.equal(cat['subscriber/0'].url, 'https://cdn/ch-sub0/2');   // Kanal gewinnt
  assert.equal(cat['subscriber/24'].url, 'https://cdn/ch-sub24/2');
  assert.equal(cat['bits/1000'].url, 'https://cdn/ch-bits1k/2');
  assert.equal(cat['subscriber/*'].url, 'https://cdn/ch-sub0/2');   // erste Kanal-Version
  assert.equal(cat['moderator/*'].url, 'https://cdn/mod/2');
});

test('buildCatalog: kaputte Eintraege/Listen werfen nie', () => {
  assert.deepEqual(Badges.buildCatalog(null, undefined), {});
  const cat = Badges.buildCatalog([null, {}, { setID: 'x', version: '1' }], []);
  assert.deepEqual(cat, {}); // ohne imageURL kein Eintrag
});

test('resolve: bekannte Badges -> Bilder, unbekanntes Set -> weglassen', () => {
  const cat = Badges.buildCatalog(GLOBAL, CHANNEL);
  const out = Badges.resolve(
    [
      { set: 'moderator', version: '1' },
      { set: 'subscriber', version: '24' },
      { set: 'voellig-unbekannt', version: '1' },
      { set: 'subscriber', version: '99' } // unbekannte Version -> set/*
    ],
    cat
  );
  assert.deepEqual(out.map((b) => b.url), [
    'https://cdn/mod/2', 'https://cdn/ch-sub24/2', 'https://cdn/ch-sub0/2'
  ]);
});

test('resolve: months landet im Subscriber-Tooltip', () => {
  const cat = Badges.buildCatalog(GLOBAL, CHANNEL);
  const out = Badges.resolve([{ set: 'subscriber', version: '24' }], cat, { months: 26 });
  assert.equal(out[0].title, '2-Year Sub (26 Monate)');
});

test('resolve: leerer Katalog -> Kuerzel-Fallback fuer bekannte Typen', () => {
  const out = Badges.resolve(
    [{ set: 'broadcaster', version: '1' }, { set: 'premium', version: '1' }],
    {}
  );
  assert.deepEqual(out, [
    { fallback: 'B', color: '#eb0400', title: 'broadcaster' }
  ]);
});

test('resolve: kaputte Eingaben werfen nie', () => {
  assert.deepEqual(Badges.resolve(null, null), []);
  assert.deepEqual(Badges.resolve([null, {}], undefined), []);
});
```

- [ ] **Step 2: Tests laufen lassen — müssen fehlschlagen**

Run: `node --test test/badges.test.js`
Expected: FAIL („Badges.buildCatalog is not a function")

- [ ] **Step 3: Implementierung**

In `renderer/lib/badges.js` vor dem `return` einfügen und Export erweitern:

```js
  // Kuerzel-Fallback (ehemals KNOWN_BADGES in chat.js), wenn der Katalog
  // komplett fehlt (Netz-/GQL-Ausfall). Farben wie bisher.
  var FALLBACK = {
    broadcaster: ['B', '#eb0400'],
    moderator: ['M', '#00ad03'],
    vip: ['V', '#e005b9'],
    subscriber: ['S', '#9147ff']
  };

  // GQL-Listen -> flache Map "set/version" -> {url, title}. Kanal-Liste
  // ueberschreibt die globale. "set/*" zeigt je Liste auf die erste Version
  // des Sets (Fallback fuer unbekannte Versionen), Kanal gewinnt auch hier.
  function buildCatalog(globalList, channelList) {
    var catalog = {};
    [globalList, channelList].forEach(function (list) {
      var seenSets = {};
      (Array.isArray(list) ? list : []).forEach(function (b) {
        if (!b || !b.setID || b.version == null || !b.imageURL) return;
        var entry = { url: String(b.imageURL), title: b.title || b.setID };
        catalog[b.setID + '/' + b.version] = entry;
        if (!seenSets[b.setID]) {
          seenSets[b.setID] = true;
          catalog[b.setID + '/*'] = entry;
        }
      });
    });
    return catalog;
  }

  // Paare + Katalog -> Render-Liste. Katalog leer -> Kuerzel-Fallback,
  // unbekanntes Set bei vorhandenem Katalog -> weglassen. Wirft nie.
  function resolve(pairs, catalog, opts) {
    var months = (opts && opts.months) || null;
    var cat = (catalog && typeof catalog === 'object') ? catalog : {};
    var empty = Object.keys(cat).length === 0;
    var out = [];
    (Array.isArray(pairs) ? pairs : []).forEach(function (p) {
      if (!p || !p.set) return;
      if (empty) {
        var fb = FALLBACK[p.set];
        if (fb) out.push({ fallback: fb[0], color: fb[1], title: p.set });
        return;
      }
      var entry = cat[p.set + '/' + p.version] || cat[p.set + '/*'];
      if (!entry) return;
      var title = entry.title;
      if (months && (p.set === 'subscriber' || p.set === 'founder')) {
        title += ' (' + months + ' Monate)';
      }
      out.push({ url: entry.url, title: title });
    });
    return out;
  }
```

Export: `return { parseBadgeTag: parseBadgeTag, subMonths: subMonths, buildCatalog: buildCatalog, resolve: resolve, FALLBACK: FALLBACK };`

- [ ] **Step 4: Tests laufen lassen — müssen bestehen**

Run: `npm test` — Expected: alle grün (67 + 9 neue).

- [ ] **Step 5: Commit**

```bash
git add renderer/lib/badges.js test/badges.test.js
git commit -m "feat: Badge-Katalog (Merge global/Kanal) + Aufloesung mit Kuerzel-Fallback"
```

---

### Task 3: `src/badge-sources.js` — Twitch-GQL-Kataloge

**Files:**
- Create: `src/badge-sources.js`
- Test: `test/badge-sources.test.js`

**Interfaces:**
- Consumes: `gql`, `fetchWithRetry` aus `src/twitch-gql.js`; `fakeFetch`-Muster aus `test/twitch-gql.test.js`.
- Produces: `fetchGlobalBadges(opts) -> Promise<[{setID,version,title,imageURL}]>`,
  `fetchChannelBadges(channelId, opts) -> Promise<[…]>`.
  Beide fail-soft: Fehler jeder Art -> `[]`.

- [ ] **Step 1: Failing Tests schreiben**

`test/badge-sources.test.js` (Helfer `res`/`fakeFetch` aus `test/twitch-gql.test.js` kopieren — bewusst dupliziert, die Testdateien sind hier eigenständig):

```js
const { test } = require('node:test');
const assert = require('node:assert');
const {
  fetchGlobalBadges, fetchChannelBadges
} = require('../src/badge-sources');

function res(status, body = {}) {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
}

function fakeFetch(script) {
  const calls = [];
  const fn = async (url, init) => {
    calls.push({ url, init });
    const next = script.shift();
    if (next instanceof Error) throw next;
    return next;
  };
  return { fn, calls };
}

const fast = { delayFn: async () => {} };

test('fetchGlobalBadges: liefert die GQL-Badge-Liste', async () => {
  const { fn } = fakeFetch([res(200, {
    data: { badges: [
      { setID: 'moderator', version: '1', title: 'Moderator', imageURL: 'https://cdn/m' },
      null
    ] }
  })]);
  const list = await fetchGlobalBadges({ ...fast, fetchImpl: fn });
  assert.deepEqual(list, [
    { setID: 'moderator', version: '1', title: 'Moderator', imageURL: 'https://cdn/m' }
  ]);
});

test('fetchGlobalBadges: Fehler -> leere Liste (fail-soft)', async () => {
  const { fn } = fakeFetch([res(400)]);
  assert.deepEqual(await fetchGlobalBadges({ ...fast, fetchImpl: fn }), []);
  const { fn: fn2 } = fakeFetch([new Error('offline'), new Error('offline'), new Error('offline')]);
  assert.deepEqual(await fetchGlobalBadges({ ...fast, fetchImpl: fn2 }), []);
});

test('fetchChannelBadges: broadcastBadges des Kanals, ohne ID leer', async () => {
  const { fn, calls } = fakeFetch([res(200, {
    data: { user: { broadcastBadges: [
      { setID: 'subscriber', version: '3', title: '3-Month Sub', imageURL: 'https://cdn/s3' }
    ] } }
  })]);
  const list = await fetchChannelBadges('123', { ...fast, fetchImpl: fn });
  assert.equal(list[0].setID, 'subscriber');
  assert.match(calls[0].init.body, /broadcastBadges/);
  assert.deepEqual(await fetchChannelBadges(null, { ...fast, fetchImpl: fn }), []);
});

test('fetchChannelBadges: user=null / Fehler -> leere Liste', async () => {
  const { fn } = fakeFetch([res(200, { data: { user: null } })]);
  assert.deepEqual(await fetchChannelBadges('123', { ...fast, fetchImpl: fn }), []);
});
```

- [ ] **Step 2: Tests laufen lassen — müssen fehlschlagen**

Run: `node --test test/badge-sources.test.js`
Expected: FAIL („Cannot find module '../src/badge-sources'")

- [ ] **Step 3: Implementierung**

`src/badge-sources.js`:

```js
// Badge-Datenquellen: Twitch-GQL-Kataloge (global + Kanal) und
// Third-Party-Badges (BTTV/FFZ/7TV) pro User.
//
// ALLE Funktionen sind fail-soft: jeder Fehler -> leeres Ergebnis. Badges
// sind Komfort; ohne sie laeuft der Chat normal weiter (Kuerzel-Fallback
// uebernimmt renderer/lib/badges.js). opts (fetchImpl, timeoutMs, retries,
// delayFn) wie ueberall -> ohne Netz unit-testbar.

const { gql, fetchWithRetry } = require('./twitch-gql');

// Globaler Twitch-Badge-Katalog: ALLE Sets inkl. Wahl-Badges (Turbo, Prime,
// Sub-Gifter, OG, Spiele-/Event-Badges, ...). Keine hartkodierte Auswahl.
async function fetchGlobalBadges(opts = {}) {
  try {
    const data = await gql({
      query: 'query{ badges { setID version title imageURL(size: DOUBLE) } }'
    }, opts);
    return ((data && data.data && data.data.badges) || []).filter(Boolean);
  } catch (e) {
    return [];
  }
}

// Kanal-Badges (Sub-Monatsstufen + Bits) -> ueberschreiben beim Katalog-Bau
// die globalen Eintraege (renderer/lib/badges.js buildCatalog).
async function fetchChannelBadges(channelId, opts = {}) {
  if (!channelId) return [];
  try {
    const data = await gql({
      query: 'query($id:ID!){ user(id:$id){ broadcastBadges { setID version title imageURL(size: DOUBLE) } } }',
      variables: { id: String(channelId) }
    }, opts);
    const user = data && data.data && data.data.user;
    return ((user && user.broadcastBadges) || []).filter(Boolean);
  } catch (e) {
    return [];
  }
}

module.exports = { fetchGlobalBadges, fetchChannelBadges };
```

- [ ] **Step 4: Tests laufen lassen — müssen bestehen**

Run: `npm test` — Expected: alle grün.

- [ ] **Step 5: Live-Smoke der GQL-Queries (einmalig, kein Test)**

Die Feldnamen (`badges`, `broadcastBadges`, `imageURL(size: DOUBLE)`) gegen die echte API prüfen:

```bash
node -e "const b=require('./src/badge-sources'); b.fetchGlobalBadges().then(l=>{console.log(l.length,'global,', l.slice(0,3));}); require('./src/twitch-api').resolveUserId('twitch').then(u=>b.fetchChannelBadges(u.id)).then(l=>console.log(l.length,'channel,', l.slice(0,2)))"
```

Expected: beide Listen nicht leer, Einträge mit `setID`/`version`/`imageURL`. Wenn ein Feld anders heißt: Query UND Fixtures in den Tests anpassen (Vertrag `{setID,version,title,imageURL}` beibehalten), Step 4 wiederholen.

- [ ] **Step 6: Commit**

```bash
git add src/badge-sources.js test/badge-sources.test.js
git commit -m "feat: Twitch-Badge-Kataloge (global + Kanal) per GQL, fail-soft"
```

---

### Task 4: `src/badge-sources.js` — BTTV- und FFZ-Badges

**Files:**
- Modify: `src/badge-sources.js`
- Test: `test/badge-sources.test.js`

**Interfaces:**
- Produces: `fetchBttvBadges(opts) -> Promise<{ [twitchUserId]: [{url,title}] }>`,
  `fetchFfzBadges(opts) -> Promise<{ [twitchUserId]: [{url,title}] }>`.
  Fail-soft: Fehler -> `{}`. Schlüssel immer Strings.

- [ ] **Step 1: Failing Tests ergänzen**

An `test/badge-sources.test.js` anhängen (Import um `fetchBttvBadges, fetchFfzBadges` erweitern):

```js
test('fetchBttvBadges: providerId -> Badge-Liste', async () => {
  const { fn } = fakeFetch([res(200, [
    { providerId: '111', badge: { svg: 'https://cdn.bttv/dev.svg', description: 'BTTV Developer' } },
    { providerId: '111', badge: { svg: 'https://cdn.bttv/pro.svg', description: 'BTTV Pro' } },
    { providerId: '', badge: { svg: 'x' } },
    { providerId: '222' } // ohne badge -> ignorieren
  ])]);
  const map = await fetchBttvBadges({ ...fast, fetchImpl: fn });
  assert.deepEqual(map, {
    '111': [
      { url: 'https://cdn.bttv/dev.svg', title: 'BTTV Developer' },
      { url: 'https://cdn.bttv/pro.svg', title: 'BTTV Pro' }
    ]
  });
});

test('fetchBttvBadges: Fehler/kein Array -> leere Map', async () => {
  const { fn } = fakeFetch([res(500), res(500), res(500)]);
  assert.deepEqual(await fetchBttvBadges({ ...fast, fetchImpl: fn }), {});
  const { fn: fn2 } = fakeFetch([res(200, { not: 'array' })]);
  assert.deepEqual(await fetchBttvBadges({ ...fast, fetchImpl: fn2 }), {});
});

test('fetchFfzBadges: users-Map (badgeId -> [userId]) wird aufgeloest', async () => {
  const { fn } = fakeFetch([res(200, {
    badges: [
      { id: 2, title: 'FFZ Supporter', urls: { '1': '//cdn.ffz/1', '2': '//cdn.ffz/2' } },
      { id: 9, title: 'kaputt' } // ohne urls -> ignorieren
    ],
    users: { '2': [333, 444], '9': [555] }
  })]);
  const map = await fetchFfzBadges({ ...fast, fetchImpl: fn });
  assert.deepEqual(map, {
    '333': [{ url: 'https://cdn.ffz/2', title: 'FFZ Supporter' }],
    '444': [{ url: 'https://cdn.ffz/2', title: 'FFZ Supporter' }]
  });
});

test('fetchFfzBadges: Fehler -> leere Map', async () => {
  const { fn } = fakeFetch([new Error('offline'), new Error('offline'), new Error('offline')]);
  assert.deepEqual(await fetchFfzBadges({ ...fast, fetchImpl: fn }), {});
});
```

- [ ] **Step 2: Tests laufen lassen — müssen fehlschlagen**

Run: `node --test test/badge-sources.test.js`
Expected: FAIL („fetchBttvBadges is not a function")

- [ ] **Step 3: Implementierung**

In `src/badge-sources.js` ergänzen (Export erweitern):

```js
// BTTV: eine gecachte Gesamtliste "wer traegt welches Badge" (Dev/Pro/...).
// providerId ist die Twitch-User-ID.
async function fetchBttvBadges(opts = {}) {
  const map = {};
  try {
    const res = await fetchWithRetry(
      'https://api.betterttv.net/3/cached/badges/twitch', {}, opts
    );
    if (!res.ok) return map;
    const list = await res.json();
    for (const u of Array.isArray(list) ? list : []) {
      const id = u && u.providerId ? String(u.providerId) : '';
      const badge = u && u.badge;
      if (!id || !badge || !badge.svg) continue;
      (map[id] = map[id] || []).push({
        url: badge.svg,
        title: badge.description || 'BTTV'
      });
    }
  } catch (e) {
    // fail-soft
  }
  return map;
}

// FFZ: badges-Liste + users-Map (badgeId -> [twitchUserId]).
async function fetchFfzBadges(opts = {}) {
  const map = {};
  try {
    const res = await fetchWithRetry(
      'https://api.frankerfacez.com/v1/badges/ids', {}, opts
    );
    if (!res.ok) return map;
    const data = await res.json();
    const users = (data && data.users) || {};
    for (const b of (data && data.badges) || []) {
      if (!b || b.id == null || !b.urls) continue;
      const raw = b.urls['2'] || b.urls['1'];
      if (!raw) continue;
      const url = raw.startsWith('//') ? 'https:' + raw : raw;
      for (const uid of users[String(b.id)] || []) {
        const id = String(uid);
        (map[id] = map[id] || []).push({ url, title: b.title || 'FFZ' });
      }
    }
  } catch (e) {
    // fail-soft
  }
  return map;
}
```

- [ ] **Step 4: Tests laufen lassen — müssen bestehen**

Run: `npm test` — Expected: alle grün.

- [ ] **Step 5: Live-Smoke (einmalig)**

```bash
node -e "const b=require('./src/badge-sources'); b.fetchBttvBadges().then(m=>console.log('bttv users:',Object.keys(m).length)); b.fetchFfzBadges().then(m=>console.log('ffz users:',Object.keys(m).length))"
```

Expected: beide Zahlen > 0. Weicht die echte Response-Form ab (Feldnamen), Implementierung UND Test-Fixtures anpassen (Map-Vertrag beibehalten), Step 4 wiederholen.

- [ ] **Step 6: Commit**

```bash
git add src/badge-sources.js test/badge-sources.test.js
git commit -m "feat: BTTV-/FFZ-User-Badges als gecachte Gesamtlisten"
```

---

### Task 5: `src/badge-sources.js` — 7TV-User-Badge (mit Live-Verifikation)

**Files:**
- Modify: `src/badge-sources.js`
- Test: `test/badge-sources.test.js`

**Interfaces:**
- Produces: `fetch7tvUserBadge(twitchUserId, opts) -> Promise<[{url,title}]>`.
  Fail-soft: Fehler/kein Badge -> `[]`. Der Aufrufer (Task 6) cacht pro Session.

**⚠️ Der exakte 7TV-Endpoint ist vorab NICHT sicher** (7TV hat v2 abgeschaltet und migriert Richtung v4). Der Vertrag oben ist fix; die interne Strategie richtet sich nach dem, was Step 1 ergibt.

- [ ] **Step 1: Live-Verifikation — welcher Endpoint liefert User-Badges?**

Kandidaten in dieser Reihenfolge probieren (User-ID eines Streamers mit bekanntem 7TV-Badge einsetzen, z. B. via `require('./src/twitch-api').resolveUserId('forsen')`):

```bash
# Kandidat A: v3-REST-User -> style/badge-Felder inspizieren
node -e "fetch('https://7tv.io/v3/users/twitch/22484632').then(r=>r.json()).then(d=>console.log(JSON.stringify(d.user && d.user.style), Object.keys(d.user||{})))"

# Kandidat B: v4-GQL (userByConnection -> style.activeBadge)
node -e "fetch('https://7tv.io/v4/gql',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({query:'query{users{userByConnection(platform:TWITCH,platformId:\"22484632\"){style{activeBadge{id name description images{url width}}}}}}'})}).then(r=>r.json()).then(d=>console.log(JSON.stringify(d)))"
```

Das Ergebnis (funktionierender Endpoint + Response-Form) als Kommentar über `fetch7tvUserBadge` dokumentieren.

- [ ] **Step 2: Failing Test ergänzen** (Fixture an die in Step 1 gefundene Form anpassen — hier die Variante für Kandidat B):

```js
test('fetch7tvUserBadge: aktives Badge des Users', async () => {
  const { fn } = fakeFetch([res(200, {
    data: { users: { userByConnection: { style: { activeBadge: {
      id: 'x', name: 'Subscriber', description: '7TV Subscriber',
      images: [{ url: 'https://cdn.7tv.app/badge/x/1x', width: 18 },
               { url: 'https://cdn.7tv.app/badge/x/2x', width: 36 }]
    } } } } }
  })]);
  const list = await fetch7tvUserBadge('22484632', { ...fast, fetchImpl: fn });
  assert.deepEqual(list, [{ url: 'https://cdn.7tv.app/badge/x/2x', title: '7TV Subscriber' }]);
});

test('fetch7tvUserBadge: kein 7TV-User / Fehler -> leer', async () => {
  const { fn } = fakeFetch([res(404)]);
  assert.deepEqual(await fetch7tvUserBadge('1', { ...fast, fetchImpl: fn }), []);
  const { fn: fn2 } = fakeFetch([new Error('x'), new Error('x'), new Error('x')]);
  assert.deepEqual(await fetch7tvUserBadge('1', { ...fast, fetchImpl: fn2 }), []);
  assert.deepEqual(await fetch7tvUserBadge('', {}), []);
});
```

- [ ] **Step 3: Implementierung** (Variante für Kandidat B; bei Kandidat A analog auf die REST-Form mappen — Vertrag identisch):

```js
// 7TV: aktives Badge eines Users (per Twitch-User-ID). Endpoint/Form live
// verifiziert (Datum der Verifikation hier eintragen) — bei Ausfall zuerst
// hier pruefen (siehe docs/superpowers/specs/2026-07-03-chat-badges-design.md).
async function fetch7tvUserBadge(twitchUserId, opts = {}) {
  if (!twitchUserId) return [];
  try {
    const res = await fetchWithRetry('https://7tv.io/v4/gql', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        query: 'query($id:String!){users{userByConnection(platform:TWITCH,platformId:$id){style{activeBadge{name description images{url width}}}}}}',
        variables: { id: String(twitchUserId) }
      })
    }, opts);
    if (!res.ok) return [];
    const data = await res.json();
    const badge = data && data.data && data.data.users &&
      data.data.users.userByConnection &&
      data.data.users.userByConnection.style &&
      data.data.users.userByConnection.style.activeBadge;
    if (!badge || !Array.isArray(badge.images) || !badge.images.length) return [];
    const img = badge.images.find((i) => i && i.width >= 30) || badge.images[badge.images.length - 1];
    if (!img || !img.url) return [];
    return [{ url: img.url, title: badge.description || badge.name || '7TV' }];
  } catch (e) {
    return [];
  }
}
```

- [ ] **Step 4: Tests + Live-Smoke**

Run: `npm test` — Expected: alle grün.
Run: `node -e "require('./src/badge-sources').fetch7tvUserBadge('22484632').then(console.log)"` — Expected: `[{ url: 'https://…', title: '…' }]` (oder `[]` falls der User gerade kein Badge trägt — dann mit anderer ID gegenprüfen).

- [ ] **Step 5: Commit**

```bash
git add src/badge-sources.js test/badge-sources.test.js
git commit -m "feat: 7TV-User-Badge-Lookup (Endpoint live verifiziert)"
```

---

### Task 6: VOD-Mapping — Versionen + userId durchreichen

**Files:**
- Modify: `src/twitch-api.js:158` (badges-Mapping in `fetchVodComments`)
- Modify: `test/twitch-gql.test.js:88-100` (bestehender Mapping-Test)

**Interfaces:**
- Produces: Kommentar-Objekte mit `badges: [{set, version}]` (statt `string[]`)
  und neu `userId: string|null` (aus `commenter.id`, für Third-Party-Lookup).
  `renderer/lib/vod-replay.js` reicht Kommentare unverändert durch — keine Änderung dort.

- [ ] **Step 1: Bestehenden Test anpassen (failing)**

In `test/twitch-gql.test.js` im Test „Mapping (id, offset, name, color, fragments)":
- Fixture-`commenter` um `id: 'u77'` ergänzen.
- Fixture-`userBadges` ändern zu `[{ setID: 'moderator', version: '1' }, { setID: 'vip' }, { setID: '', version: '' }]` (Eintrag ohne Version prüft den `'1'`-Default).
- Erwartung ändern zu:

```js
  assert.deepEqual(r.comments, [{
    id: 'c1', offset: 42, name: 'Max', color: '#f00',
    userId: 'u77',
    badges: [
      { set: 'moderator', version: '1' },
      { set: 'vip', version: '1' }
    ],
    fragments: [{ text: 'hi ', emote: null }, { text: 'OMEGALUL', emote: null }]
  }]);
```

- [ ] **Step 2: Test laufen lassen — muss fehlschlagen**

Run: `node --test test/twitch-gql.test.js`
Expected: FAIL (deepEqual: `badges: ['moderator']` vs. Objektform)

- [ ] **Step 3: Mapping ändern**

In `src/twitch-api.js` (`fetchVodComments`, return-Objekt der edges.map):

```js
    return {
      id: n.id || null,
      offset: n.contentOffsetSeconds || 0,
      name: commenter.displayName || commenter.login || 'anon',
      userId: commenter.id || null,
      color: (msg.userColor) || null,
      // userBadges: [{ setID, version }] -> Paare fuer Badges.resolve;
      // fehlende Version -> '1' (wie beim IRC-Tag-Parsing).
      badges: (msg.userBadges || [])
        .map((b) => ({
          set: (b && b.setID) || '',
          version: b && b.version != null && b.version !== '' ? String(b.version) : '1'
        }))
        .filter((b) => b.set),
      fragments
    };
```

- [ ] **Step 4: Tests laufen lassen — müssen bestehen**

Run: `npm test` — Expected: alle grün.

- [ ] **Step 5: Commit**

```bash
git add src/twitch-api.js test/twitch-gql.test.js
git commit -m "feat: VOD-Kommentare liefern Badge-Versionen + commenter-userId"
```

---

### Task 7: Main-Prozess + Preload — Kataloge laden, `user-badges`-IPC

**Files:**
- Modify: `main.js` (submit-load, neues IPC-Handle)
- Modify: `preload.js` (Bridge-Methode)

**Interfaces:**
- Consumes: `fetchGlobalBadges/fetchChannelBadges/fetchBttvBadges/fetchFfzBadges/fetch7tvUserBadge` (Tasks 3-5), `Badges.buildCatalog` (Task 2).
- Produces: `load`-Payload-Feld `badgeCatalog` (plain object);
  IPC `user-badges` (invoke, `userId`) -> `{ ok: true, badges: [{url,title}] }`;
  Preload `window.twitchDual.fetchUserBadges(userId)`.
- Kein Unit-Test (main.js/preload.js sind Electron-verdrahtet und im Projekt bewusst testfrei); Verifikation über den Smoke-Test in Task 8.

- [ ] **Step 1: main.js — Requires + Badge-Laden**

Nach `const twitch = require('./src/twitch-api');` einfügen:

```js
const badgeSources = require('./src/badge-sources');
const BadgesLib = require('./renderer/lib/badges');
```

Vor `ipcMain.handle('submit-load', …)` einfügen:

```js
// --- Badges: Kataloge pro Load, Third-Party pro User (Session-Cache) -------
// BTTV/FFZ liefern Gesamtlisten (userId -> Badges) einmal pro Load; 7TV wird
// pro User beim ersten Auftauchen nachgeschlagen. Negative Treffer werden
// mitgecacht. Alles fail-soft: ohne Badge-Daten laeuft der Chat normal.
let thirdPartyBadges = {};        // twitchUserId -> [{url, title}] (BTTV+FFZ)
const sevenTvCache = new Map();   // twitchUserId -> Promise<[{url, title}]>

async function loadBadgeData(channelId) {
  const [globalBadges, channelBadges, bttv, ffz] = await Promise.all([
    badgeSources.fetchGlobalBadges(),
    badgeSources.fetchChannelBadges(channelId),
    badgeSources.fetchBttvBadges(),
    badgeSources.fetchFfzBadges()
  ]);
  thirdPartyBadges = { ...bttv };
  for (const [id, list] of Object.entries(ffz)) {
    thirdPartyBadges[id] = (thirdPartyBadges[id] || []).concat(list);
  }
  return BadgesLib.buildCatalog(globalBadges, channelBadges);
}
```

- [ ] **Step 2: main.js — submit-load erweitert**

Im live-Zweig (nach `const channelEmotes = …`):

```js
      const badgeCatalog = await loadBadgeData(user.id);
```
und `badgeCatalog` ins `payload`-Objekt aufnehmen (`emotes,` → `emotes, badgeCatalog`).

Im VOD-Zweig analog nach `const channelEmotes = …`:

```js
    const badgeCatalog = await loadBadgeData(owner.id);
```
und ebenfalls ins `payload`-Objekt.

- [ ] **Step 3: main.js — user-badges-IPC**

Nach dem `vod-comments`-Handler einfügen:

```js
// Third-Party-Badges (7TV/BTTV/FFZ) eines Users, gecacht pro Session.
ipcMain.handle('user-badges', async (_evt, userId) => {
  const id = String(userId || '');
  if (!id) return { ok: true, badges: [] };
  if (!sevenTvCache.has(id)) {
    sevenTvCache.set(id, badgeSources.fetch7tvUserBadge(id).catch(() => []));
  }
  const sevenTv = await sevenTvCache.get(id);
  return { ok: true, badges: [...(thirdPartyBadges[id] || []), ...sevenTv] };
});
```

- [ ] **Step 4: preload.js — Bridge**

Nach `fetchVodComments: …` einfügen:

```js
    // Third-Party-Badges (7TV/BTTV/FFZ) eines Users (Chat-Fenster).
    fetchUserBadges: (userId) => ipcRenderer.invoke('user-badges', userId),
```

- [ ] **Step 5: Suite + App-Start-Check + Commit**

Run: `npm test` — Expected: alle grün.
Run: `npm start` — App startet ohne Konsolen-Fehler (Badges noch unsichtbar, Renderer folgt in Task 8). Fenster schließen.

```bash
git add main.js preload.js
git commit -m "feat: Badge-Kataloge beim Laden + user-badges-IPC mit Session-Cache"
```

---

### Task 8: Renderer — Bilder rendern (chat.js, index.html, chat.css)

**Files:**
- Modify: `renderer/chat/chat.js` (KNOWN_BADGES raus, Badge-Rendering, Call-Sites)
- Modify: `renderer/chat/index.html` (Script-Include)
- Modify: `renderer/chat/chat.css` (.badge-Stil, hide-badges)

**Interfaces:**
- Consumes: `Badges.parseBadgeTag/subMonths/resolve` (Tasks 1-2), Payload `badgeCatalog` + `window.twitchDual.fetchUserBadges` (Task 7), VOD-`badges`/`userId` (Task 6).
- Kein Unit-Test (DOM-Code; die Logik ist in badges.js getestet). Verifikation: Smoke-Test Step 6.

- [ ] **Step 1: index.html — badges.js einbinden**

Nach `<script src="../lib/irc.js"></script>`:

```html
  <script src="../lib/badges.js"></script>
```

- [ ] **Step 2: chat.js — Zustand + KNOWN_BADGES ersetzen**

Bei den Modul-Variablen (`let emoteMap = {};`) ergänzen:

```js
let badgeCatalog = {};
// Third-Party-Badges pro User: userId -> [{url,title}] (fertig) | true (laeuft).
// Badge erscheint ab der Nachricht, zu der der Lookup fertig ist.
let userBadgeCache = new Map();
```

Den Block `const KNOWN_BADGES = { … };` (Zeilen 82-88) komplett LÖSCHEN (Fallback lebt jetzt in `Badges.FALLBACK`).

- [ ] **Step 3: chat.js — Badge-Rendering in appendMessage**

Die bisherige Badge-Schleife (`for (const b of opts.badges || []) { … }`) ersetzen durch:

```js
  // Badges: Katalog-Aufloesung (DOM-frei getestet in ../lib/badges.js).
  // Wirft nie; leerer Katalog -> Kuerzel-Chips wie frueher.
  for (const b of Badges.resolve(opts.badges, badgeCatalog, { months: opts.months })) {
    appendBadge(div, b);
  }
  // Third-Party (7TV/BTTV/FFZ) aus dem Session-Cache; erster Treffer eines
  // Users stoesst den Lookup an, gerendert wird ab der naechsten Nachricht.
  if (opts.userId) {
    const cached = userBadgeCache.get(opts.userId);
    if (Array.isArray(cached)) {
      for (const b of cached) appendBadge(div, b);
    } else if (!cached) {
      userBadgeCache.set(opts.userId, true);
      window.twitchDual.fetchUserBadges(opts.userId)
        .then((r) => userBadgeCache.set(opts.userId, (r && r.badges) || []))
        .catch(() => userBadgeCache.set(opts.userId, []));
    }
  }
```

Vor `appendMessage` die Helfer-Funktion einfügen:

```js
// Ein aufgeloestes Badge anhaengen: Bild oder Kuerzel-Chip (Fallback).
function appendBadge(parent, b) {
  if (b.url) {
    const img = document.createElement('img');
    img.className = 'badge';
    img.src = b.url;
    img.alt = b.title;
    img.title = b.title;
    img.loading = 'lazy';
    parent.appendChild(img);
  } else {
    const chip = document.createElement('span');
    chip.className = 'chip';
    chip.textContent = b.fallback;
    chip.style.background = b.color;
    chip.title = b.title;
    parent.appendChild(chip);
  }
}
```

- [ ] **Step 4: chat.js — Call-Sites + Reset**

Live (PRIVMSG-Zweig), die `appendMessage`-Optionen ersetzen:

```js
        appendMessage(name, color, IrcParse.emoteTokens(text, msg.tags['emotes']), {
          badges: Badges.parseBadgeTag(msg.tags),
          months: Badges.subMonths(msg.tags),
          userId: msg.tags['user-id'] || null
        });
```

VOD (`createVodReplay`, onMessage-Optionen):

```js
      { replay: true, timeSeconds: c.offset, badges: c.badges, userId: c.userId }
```

In `onLoad` (nach `emoteMap = payload.emotes || {};`):

```js
  badgeCatalog = payload.badgeCatalog || {};
  userBadgeCache = new Map(); // neue Quelle -> Cache der alten verwerfen
```

Kommentar über `appendMessage` aktualisieren: `opts: { replay?, timeSeconds?, badges?: [{set,version}], months?, userId? }`.

- [ ] **Step 5: chat.css — Badge-Stil + Schalter**

Nach der `.msg .chip`-Regel:

```css
.msg .badge {
  height: 18px; width: 18px;
  vertical-align: -3px; margin-right: 4px; border-radius: 3px;
}
```

Die Schalter-Regel am Dateiende erweitern:

```css
#messages.hide-badges .chip,
#messages.hide-badges .badge { display: none; }
```

- [ ] **Step 6: Smoke-Test (manuell, `npm start`)**

1. Live-Kanal mit aktivem Chat laden → Mod-/Sub-/Wahl-Badges (Prime, Sub-Gifter, …) erscheinen als Bilder; Sub-Badges zeigen die KANAL-Version (Tooltip mit Monaten).
2. Bei einem User mit 7TV-Badge: Badge erscheint ab dessen zweiter Nachricht.
3. VOD laden → Replay-Nachrichten zeigen Badges.
4. ⚙ → „Badges anzeigen" aus/an → Badges verschwinden/erscheinen sofort.
5. DevTools-Konsole: keine Fehler aus der Badge-Schiene.

- [ ] **Step 7: Suite + Commit**

Run: `npm test` — Expected: alle grün.

```bash
git add renderer/chat/chat.js renderer/chat/index.html renderer/chat/chat.css
git commit -m "feat: echte Badge-Bilder im Chat (Live + VOD), Kuerzel nur noch als Fallback"
```

---

### Task 9: Docs, Version 1.3.0, Release

**Files:**
- Modify: `package.json` (version), `docs/TODO.md` (Erledigt-Eintrag)

**Interfaces:**
- Consumes: fertige Tasks 1-8, Release-Ablauf aus `docs/TODO.md` (Zeilen 59-68).

- [ ] **Step 1: docs/TODO.md — unter „Erledigt" ergänzen**

```markdown
**Chat-Badges als Bilder (v1.3.0)**
- Twitch-Global-Katalog (ALLE Sets inkl. Wahl-Badges) + Kanal-Sub/Bits-Badges
  per GQL (`src/badge-sources.js`), Merge/Aufloesung DOM-frei in
  `renderer/lib/badges.js` (unit-getestet). Kuerzel B/M/V/S nur noch als
  Fallback bei Katalog-Ausfall.
- 7TV-Badge pro User (Session-Cache, `user-badges`-IPC) + BTTV/FFZ-Listen.
- Live (IRC `badges=`/`badge-info=`, Tooltip mit Abo-Monaten) UND VOD-Replay
  (`userBadges` mit Versionen).
```

- [ ] **Step 2: Version bumpen + committen + pushen**

`package.json`: `"version": "1.3.0"`.

```bash
git add package.json docs/TODO.md
git commit -m "release: v1.3.0 – Chat-Badges als echte Bilder"
git push
```

- [ ] **Step 3: Installer bauen**

Run: `npm run dist`
Expected: `dist/installer/TwitchDual Setup 1.3.0.exe` + `.blockmap` + `latest.yml`.

- [ ] **Step 4: GitHub-Release (Ablauf aus docs/TODO.md — Bindestrich-Namen!)**

```bash
cd dist/installer
cp "TwitchDual Setup 1.3.0.exe" TwitchDual-Setup-1.3.0.exe
cp "TwitchDual Setup 1.3.0.exe.blockmap" TwitchDual-Setup-1.3.0.exe.blockmap
gh release create v1.3.0 TwitchDual-Setup-1.3.0.exe TwitchDual-Setup-1.3.0.exe.blockmap latest.yml \
  --title "v1.3.0 – Chat-Badges als echte Bilder" \
  --notes "Twitch-Badges (globaler Katalog inkl. Wahl-Badges, Kanal-Sub/Bits) + 7TV/BTTV/FFZ-User-Badges als Bilder in Live-Chat und VOD-Replay. Fallback-Kuerzel bei Katalog-Ausfall."
```

Expected: Release v1.3.0 auf https://github.com/janiseule-stack/TwitchDual mit 3 Assets.
