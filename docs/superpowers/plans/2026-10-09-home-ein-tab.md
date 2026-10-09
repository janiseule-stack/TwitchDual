# Home: ein Tab mit Stern-Favoriten und Suche — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Die Tabs „Gefolgt“/„Favoriten“ durch eine Home-Ansicht ersetzen: Suchfeld oben, ★-Favoriten, gefolgte Kanäle Live/Offline, Twitch-Treffer beim Suchen; Vorschlagsliste im Kanal-Feld wieder raus.

**Architecture:** Main liefert über eine IPC `home-kanaele` die Vereinigung aus Favoriten und gefolgten Kanälen mit Live-Status (gebündelt per GQL `users(logins:)`). Die Abschnittsbildung steckt DOM-frei in `renderer/lib/home-liste.js`; `home.js` zeichnet nur. Twitch-Treffer kommen aus der bestehenden IPC `kanal-suche`.

**Tech Stack:** Electron, Vanilla-JS (UMD-Libs im Renderer), `node --test`, Twitch-GQL (anonym), Helix (gefolgte Kanäle).

**Spec:** `docs/superpowers/specs/2026-10-09-home-ein-tab-design.md`

## Global Constraints

- Ansichtstitel exakt `Home`; Abschnittstitel `★ Favoriten`, `Live`, `Offline`, `Auf Twitch`.
- Favoriten-Speicher bleibt `store.favorites` (Logins, klein geschrieben), keine Migration.
- Twitch-Abschnitt erst ab 2 Zeichen Suchtext.
- Live-Status in Blöcken zu höchstens 100 Logins pro GQL-Abfrage.
- Renderer-Libs DOM-frei im UMD-Muster wie `renderer/lib/home-abschnitte.js`.
- Keine Kanalnamen aus Gesprächen als Beispiele in Code/Tests; neutrale Namen (`streamer`, `zweiter` …).
- Animationen bleiben an (kein `prefers-reduced-motion`).
- Nach jeder Task: `npm test` komplett grün.

## Review Focus

1. Stern-Klick auf einer Live-Vorschaukarte darf den Stream nicht laden (Klick-Propagation) – Karte bleibt offen, nur ★ wechselt.
2. Stern bei einem Twitch-Treffer, dem man nicht folgt: wandert sofort in „★ Favoriten“; Stern weg bei einem nicht gefolgten Kanal: verschwindet ganz.
3. Abmelden/Anmelden während Home offen ist: Liste lädt neu, gefolgte Kanäle verschwinden/erscheinen, Favoriten bleiben.
4. Schnelles Tippen: eine verspätete Twitch-Antwort für einen alten Suchtext darf neuere Treffer nicht überschreiben.
5. Ein Block der Live-Abfrage scheitert: nur diese Kanäle als Platzhalter mit `error`, der Rest normal.

---

## Dateien

- Modify: `src/twitch-browse.js` – `getLiveStatus` gebündelt
- Create: `src/home-kanaele.js` – Favoriten + Gefolgt + Live-Status zusammenführen (injizierbar, testbar)
- Create: `renderer/lib/home-liste.js` – Abschnittsbildung, `mitExaktTreffer`
- Modify: `renderer/lib/home-abschnitte.js` – nur noch Klapp-Zustand, neue Arten
- Delete: `renderer/lib/kanal-vorschlaege.js`, `test/kanal-vorschlaege.test.js`
- Modify: `main.js`, `preload.js` – IPC `home-kanaele`, alte IPCs raus
- Modify: `renderer/video/video.js`, `renderer/video/index.html` – Kanal-Feld zurück auf Datalist
- Modify: `renderer/video/home.js`, `renderer/video/home.css`, `renderer/themes/{blasen,koi,sakura,wald}/theme.css` – Home-UI
- Test: `test/twitch-browse.test.js`, `test/home-kanaele.test.js`, `test/home-liste.test.js`, `test/home-abschnitte.test.js`

---

### Task 1: Live-Status gebündelt abfragen

**Files:**
- Modify: `src/twitch-browse.js` (`getLiveStatus`)
- Test: `test/twitch-browse.test.js`

**Interfaces:**
- Produces: `getLiveStatus(logins: string[], opts?) → Promise<Kanal[]>` (Signatur unverändert; `Kanal` = `mapLiveUser`-Modell bzw. Platzhalter `{login, displayName, avatar:null, live:false[, error:true]}`), sortiert per `sortByLive`.

- [ ] **Step 1: Failing tests anhängen** (`test/twitch-browse.test.js`)

```js
// GQL-Fake: beantwortet users(logins:) mit den uebergebenen Nutzern, merkt Bloecke.
function usersFake(bekannt, { scheitertBlock = -1 } = {}) {
  const bloecke = [];
  const fetchImpl = async (_url, init) => {
    const { variables } = JSON.parse(init.body);
    const nr = bloecke.push(variables.logins) - 1;
    if (nr === scheitertBlock) return { ok: false, status: 400, async json() { return {}; } };
    const users = variables.logins.map((l) => bekannt[l] || null);
    return { ok: true, status: 200, async json() { return { data: { users } }; } };
  };
  return { fetchImpl, bloecke };
}
const nutzer = (login, live) => ({ login, displayName: login.toUpperCase(), profileImageURL: login + '.png', stream: live ? { id: 's', title: 't', viewersCount: 5, game: { displayName: 'G' } } : null });

test('getLiveStatus: Bloecke zu 100, eine Abfrage pro Block', async () => {
  const logins = Array.from({ length: 250 }, (_, i) => 'k' + i);
  const { fetchImpl, bloecke } = usersFake({});
  const r = await browse.getLiveStatus(logins, { fetchImpl, retries: 0 });
  assert.deepEqual(bloecke.map((b) => b.length), [100, 100, 50]);
  assert.equal(r.length, 250);
});

test('getLiveStatus: unbekannte als Platzhalter, live zuerst, Duplikate einmal', async () => {
  const { fetchImpl } = usersFake({ streamer: nutzer('streamer', false), zweiter: nutzer('zweiter', true) });
  const r = await browse.getLiveStatus(['Streamer', 'gibtsnicht', 'zweiter', 'streamer'], { fetchImpl, retries: 0 });
  assert.deepEqual(r.map((k) => k.login), ['zweiter', 'gibtsnicht', 'streamer']);
  assert.equal(r[0].live, true);
  assert.deepEqual(r[1], { login: 'gibtsnicht', displayName: 'gibtsnicht', avatar: null, live: false });
});

test('getLiveStatus: gescheiterter Block -> nur dessen Kanaele mit error', async () => {
  const logins = Array.from({ length: 150 }, (_, i) => 'k' + i);
  const { fetchImpl } = usersFake({ k120: nutzer('k120', true) }, { scheitertBlock: 0 });
  const r = await browse.getLiveStatus(logins, { fetchImpl, retries: 0 });
  assert.equal(r.find((k) => k.login === 'k5').error, true);
  assert.equal(r.find((k) => k.login === 'k120').live, true);
  assert.equal(r.find((k) => k.login === 'k130').error, undefined);
});
```

- [ ] **Step 2: Laufen lassen, Fehlschlag prüfen**

Run: `node --test test/twitch-browse.test.js`
Expected: die drei neuen Tests FAIL (heute eine Abfrage pro Login mit `variables.login` → `variables.logins` undefined).

- [ ] **Step 3: Implementieren** – in `src/twitch-browse.js` `getLiveStatus` ersetzen:

```js
const LIVE_BATCH_QUERY =
  `query($logins:[String!]){ users(logins:$logins){ id login displayName ` +
  `profileImageURL(width:70) stream{ id title type viewersCount ` +
  `game{ displayName } previewImageURL(width:320,height:180) } } }`;
const LIVE_BLOCK = 100; // gemessen 09.10.2026: 100 Logins pro Abfrage ok

// Live-Status fuer viele Logins, gebuendelt (300 Kanaele = 3 Abfragen).
// Scheitert ein Block, werden nur dessen Kanaele zu Platzhaltern mit error.
async function getLiveStatus(logins, opts = {}) {
  const clean = [...new Set((logins || [])
    .map((l) => String(l).trim().toLowerCase().replace(/^#/, ''))
    .filter(Boolean))];
  const bloecke = [];
  for (let i = 0; i < clean.length; i += LIVE_BLOCK) bloecke.push(clean.slice(i, i + LIVE_BLOCK));
  const teile = await Promise.all(bloecke.map(async (block) => {
    try {
      const data = await gql({ query: LIVE_BATCH_QUERY, variables: { logins: block } }, opts);
      const users = (data && data.data && data.data.users) || [];
      const nachLogin = new Map(users.filter(Boolean).map((u) => [String(u.login).toLowerCase(), u]));
      // Kanal existiert nicht -> Platzhalter, damit die UI ihn zeigt.
      return block.map((login) => mapLiveUser(nachLogin.get(login)) || { login, displayName: login, avatar: null, live: false });
    } catch (e) {
      return block.map((login) => ({ login, displayName: login, avatar: null, live: false, error: true }));
    }
  }));
  // Live zuerst (nach Zuschauern), offline alphabetisch - zentral hier.
  return sortByLive(teile.flat());
}
```

`LIVE_QUERY` bleibt (wird von `findChannel` genutzt); den alten Kopfkommentar „Live-Status fuer mehrere Logins (parallel)…“ entfernen.

- [ ] **Step 4: Tests grün**

Run: `node --test test/twitch-browse.test.js` → PASS; `npm test` → alle PASS.

- [ ] **Step 5: Commit**

```bash
git add src/twitch-browse.js test/twitch-browse.test.js
git commit -m "perf: Live-Status gebuendelt per users(logins:) in 100er-Bloecken"
```

---

### Task 2: Home-Kanäle im Main zusammenführen + IPC

**Files:**
- Create: `src/home-kanaele.js`
- Test: `test/home-kanaele.test.js`
- Modify: `main.js` (IPCs `get-followed`, `live-status`, `vorschlag-quellen`, `gefolgtCache`), `preload.js`

**Interfaces:**
- Consumes: `browse.getLiveStatus` (Task 1), `helix.getFollowedChannels({userId, accessToken}) → [{login, displayName, id}]`.
- Produces: `ladeHomeKanaele({ favoriten: string[], holeGefolgt: () => Promise<{login}[] | null>, liveStatus: (logins) => Promise<Kanal[]> }) → Promise<{ angemeldet: boolean, gefolgtFehler: string|null, kanaele: (Kanal & {favorit: boolean, gefolgt: boolean})[] }>`; IPC `home-kanaele` → `{ ok: true, ...dasselbe }` bzw. `{ ok: false, error }`; preload `homeKanaele()`.

- [ ] **Step 1: Failing test** (`test/home-kanaele.test.js`)

```js
const { test } = require('node:test');
const assert = require('node:assert');
const { ladeHomeKanaele } = require('../src/home-kanaele');

const status = async (logins) => logins.map((login) => ({ login, displayName: login, live: login === 'zweiter' }));

test('Favoriten + Gefolgt vereinigt, Flags gesetzt, jeder Login einmal abgefragt', async () => {
  let gefragt;
  const r = await ladeHomeKanaele({
    favoriten: ['streamer', 'nurfav'],
    holeGefolgt: async () => [{ login: 'streamer' }, { login: 'zweiter' }],
    liveStatus: async (l) => { gefragt = l; return status(l); }
  });
  assert.deepEqual(gefragt.sort(), ['nurfav', 'streamer', 'zweiter']);
  assert.equal(r.angemeldet, true);
  assert.equal(r.gefolgtFehler, null);
  const by = Object.fromEntries(r.kanaele.map((k) => [k.login, k]));
  assert.deepEqual([by.streamer.favorit, by.streamer.gefolgt], [true, true]);
  assert.deepEqual([by.nurfav.favorit, by.nurfav.gefolgt], [true, false]);
  assert.deepEqual([by.zweiter.favorit, by.zweiter.gefolgt], [false, true]);
});

test('nicht angemeldet: nur Favoriten', async () => {
  const r = await ladeHomeKanaele({ favoriten: ['streamer'], holeGefolgt: async () => null, liveStatus: status });
  assert.equal(r.angemeldet, false);
  assert.deepEqual(r.kanaele.map((k) => k.login), ['streamer']);
});

test('Gefolgt scheitert: Favoriten trotzdem, Fehler gemeldet', async () => {
  const r = await ladeHomeKanaele({ favoriten: ['streamer'], holeGefolgt: async () => { throw new Error('Helix 500'); }, liveStatus: status });
  assert.equal(r.angemeldet, true);
  assert.equal(r.gefolgtFehler, 'Helix 500');
  assert.deepEqual(r.kanaele.map((k) => k.login), ['streamer']);
});

test('nichts da: keine Live-Abfrage', async () => {
  let gefragt = false;
  const r = await ladeHomeKanaele({ favoriten: [], holeGefolgt: async () => [], liveStatus: async () => { gefragt = true; return []; } });
  assert.deepEqual(r.kanaele, []);
  assert.equal(gefragt, false);
});
```

- [ ] **Step 2: Fehlschlag prüfen**

Run: `node --test test/home-kanaele.test.js` → FAIL „Cannot find module '../src/home-kanaele'“.

- [ ] **Step 3: Implementieren** (`src/home-kanaele.js`)

```js
// Home: Favoriten (lokal) + gefolgte Kanaele (Helix) zu einer Liste mit
// Live-Status. Abhaengigkeiten injiziert -> ohne Netz testbar.
// Spec: docs/superpowers/specs/2026-10-09-home-ein-tab-design.md

// holeGefolgt: null = nicht angemeldet; wirft = Helix-Fehler.
async function ladeHomeKanaele({ favoriten, holeGefolgt, liveStatus }) {
  let angemeldet = false;
  let gefolgtFehler = null;
  let gefolgt = [];
  try {
    const g = await holeGefolgt();
    if (g) { angemeldet = true; gefolgt = g; }
  } catch (e) {
    angemeldet = true;
    gefolgtFehler = e.message || String(e);
  }
  const fav = new Set(favoriten || []);
  const gef = new Set(gefolgt.map((g) => g.login));
  const logins = [...new Set([...fav, ...gef])];
  const kanaele = logins.length ? await liveStatus(logins) : [];
  return {
    angemeldet,
    gefolgtFehler,
    kanaele: kanaele.map((k) => ({ ...k, favorit: fav.has(k.login), gefolgt: gef.has(k.login) }))
  };
}

module.exports = { ladeHomeKanaele };
```

- [ ] **Step 4: Main/preload umstellen**

In `main.js`:
- oben bei den anderen `require`s: `const { ladeHomeKanaele } = require('./src/home-kanaele');`
- `gefolgtCache` komplett entfernen: die Deklaration samt Kommentar unter `HISTORY_MAX` und die Zeile `gefolgtCache = null; // anderer/kein Account …` in `onChanged`.
- Die Handler `get-followed` und `vorschlag-quellen` ersetzen durch:

```js
// Home: Favoriten + gefolgte Kanaele mit Live-Status (live nach Zuschauern,
// offline alphabetisch). Ohne Login nur Favoriten.
ipcMain.handle('home-kanaele', async () => {
  try {
    const r = await ladeHomeKanaele({
      favoriten: store.get('favorites', []),
      holeGefolgt: async () => {
        const acc = await authManager.getAccess();
        return acc ? helix.getFollowedChannels({ userId: acc.userId, accessToken: acc.accessToken }) : null;
      },
      liveStatus: (logins) => browse.getLiveStatus(logins)
    });
    return { ok: true, ...r };
  } catch (e) { return { ok: false, error: e.message || String(e) }; }
});
```

- Handler `live-status` löschen.

In `preload.js`: Zeilen `liveStatus: …`, `getFollowed: …`, `vorschlagQuellen: …` löschen; bei „Home-Overlay“ ergänzen:

```js
    homeKanaele: () => ipcRenderer.invoke('home-kanaele'),
```

- [ ] **Step 5: Prüfen + Commit**

Run: `node --check main.js && node --check preload.js && npm test` → alle PASS (inkl. `preload-sandbox.test.js`).

```bash
git add src/home-kanaele.js test/home-kanaele.test.js main.js preload.js
git commit -m "feat: IPC home-kanaele (Favoriten + Gefolgt mit Live-Status)"
```

(Der Renderer ruft bis Task 4 noch alte IPCs auf – Home ist zwischen Task 2 und 4 kaputt; nicht starten.)

---

### Task 3: Abschnittsbildung `home-liste.js` + Klapp-Zustand

**Files:**
- Create: `renderer/lib/home-liste.js`, `test/home-liste.test.js`
- Modify: `renderer/lib/home-abschnitte.js`, `test/home-abschnitte.test.js`
- Delete: `renderer/lib/kanal-vorschlaege.js`, `test/kanal-vorschlaege.test.js`

**Interfaces:**
- Produces (global `HomeListe` im Browser):
  - `abschnitte({ kanaele, nadel, twitch, exakt, zu }) → { keineEigenen: boolean, abschnitte: [{ art: 'favoriten'|'live'|'offline'|'twitch', titel: string, kanaele: Kanal[], offen: boolean }] }`
  - `mitExaktTreffer(liste, exakt) → Kanal[]`
  - `sternAnwenden(kanaele, ch, favoriten: string[]) → Kanal[]` (neue Liste nach Stern-Klick)
  - `MIN_TWITCH = 2`
- Produces (global `HomeAbschnitte`): `STANDARD = {favoriten:false, live:false, offline:true, twitch:false}`, `umschalten(zu, art)`, `lies(roh)`. `teile` entfällt.

- [ ] **Step 1: Failing tests** (`test/home-liste.test.js`)

```js
const { test } = require('node:test');
const assert = require('node:assert');
const L = require('../renderer/lib/home-liste');

const k = (login, o = {}) => ({ login, displayName: login, live: false, favorit: false, gefolgt: true, ...o });
const kanaele = [
  k('favlive', { favorit: true, live: true }),
  k('favaus', { favorit: true, gefolgt: false }),
  k('gefolgtlive', { live: true, game: 'Valorant' }),
  k('gefolgtaus')
];

test('ohne Suche: Favoriten, Live, Offline; kein Twitch', () => {
  const r = L.abschnitte({ kanaele, nadel: '', twitch: [k('fremd')], zu: {} });
  assert.deepEqual(r.abschnitte.map((a) => a.art), ['favoriten', 'live', 'offline']);
  assert.deepEqual(r.abschnitte[0].kanaele.map((x) => x.login), ['favlive', 'favaus']);
  assert.deepEqual(r.abschnitte[1].kanaele.map((x) => x.login), ['gefolgtlive']);
  assert.deepEqual(r.abschnitte[2].kanaele.map((x) => x.login), ['gefolgtaus']);
  assert.equal(r.keineEigenen, false);
  assert.equal(r.abschnitte[0].titel, '★ Favoriten');
});

test('Favorit erscheint nicht zusaetzlich in Live/Offline', () => {
  const r = L.abschnitte({ kanaele, nadel: '', zu: {} });
  const alle = r.abschnitte.flatMap((a) => a.kanaele.map((x) => x.login));
  assert.equal(alle.length, new Set(alle).size);
});

test('Suche filtert ueber Name und Spiel und klappt alles auf', () => {
  const r = L.abschnitte({ kanaele, nadel: 'VALO', zu: { live: true, offline: true } });
  assert.deepEqual(r.abschnitte.map((a) => a.art), ['live']);
  assert.equal(r.abschnitte[0].offen, true);
});

test('Klapp-Zustand ohne Suche', () => {
  const r = L.abschnitte({ kanaele, nadel: '', zu: { offline: true } });
  assert.deepEqual(r.abschnitte.map((a) => a.offen), [true, true, false]);
});

test('Twitch erst ab 2 Zeichen, ohne bekannte Kanaele, Flags aus', () => {
  const twitch = [k('gefolgtaus', { gefolgt: undefined }), k('fremd', { gefolgt: undefined, verifiziert: true })];
  assert.equal(L.abschnitte({ kanaele, nadel: 'f', twitch, zu: {} }).abschnitte.some((a) => a.art === 'twitch'), false);
  const r = L.abschnitte({ kanaele, nadel: 'fr', twitch, zu: {} });
  const tw = r.abschnitte.find((a) => a.art === 'twitch');
  assert.equal(tw.titel, 'Auf Twitch');
  assert.deepEqual(tw.kanaele.map((x) => x.login), ['fremd']);
  assert.deepEqual([tw.kanaele[0].favorit, tw.kanaele[0].gefolgt], [false, false]);
});

test('keineEigenen nur bei Suche ohne eigenen Treffer', () => {
  assert.equal(L.abschnitte({ kanaele, nadel: 'xyz', zu: {} }).keineEigenen, true);
  assert.equal(L.abschnitte({ kanaele: [], nadel: 'xyz', zu: {} }).keineEigenen, false);
});

test('exakter Treffer: eingereiht, aber nicht wenn schon bekannt', () => {
  const twitch = [k('streamertv', { verifiziert: true }), k('streamerfan')];
  const r = L.abschnitte({ kanaele, nadel: 'streamer', twitch, exakt: k('streamer'), zu: {} });
  assert.deepEqual(r.abschnitte.find((a) => a.art === 'twitch').kanaele.map((x) => x.login), ['streamertv', 'streamer', 'streamerfan']);
  const r2 = L.abschnitte({ kanaele, nadel: 'gefolgtaus', twitch: [], exakt: k('gefolgtaus'), zu: {} });
  assert.equal(r2.abschnitte.some((a) => a.art === 'twitch'), false);
});

test('mitExaktTreffer: hinter fuehrenden verifizierten, ohne Duplikat', () => {
  const liste = [{ login: 'a', verifiziert: true }, { login: 'b' }, { login: 'e' }];
  assert.deepEqual(L.mitExaktTreffer(liste, { login: 'e' }).map((x) => x.login), ['a', 'e', 'b']);
  assert.deepEqual(L.mitExaktTreffer(liste, null).map((x) => x.login), ['a', 'b', 'e']);
  assert.deepEqual(L.mitExaktTreffer([], { login: 'e' }).map((x) => x.login), ['e']);
});
```

Ebenfalls in `test/home-liste.test.js`:

```js
test('sternAnwenden: Twitch-Treffer mit Stern kommt dazu', () => {
  const r = L.sternAnwenden(kanaele, k('fremd', { gefolgt: false }), ['favlive', 'favaus', 'fremd']);
  assert.deepEqual(r.find((x) => x.login === 'fremd'), k('fremd', { favorit: true, gefolgt: false }));
});

test('sternAnwenden: Stern weg - nicht gefolgt verschwindet, gefolgt bleibt', () => {
  const r = L.sternAnwenden(kanaele, kanaele[1], ['favlive']);
  assert.equal(r.some((x) => x.login === 'favaus'), false);
  const r2 = L.sternAnwenden(kanaele, kanaele[0], ['favaus']);
  assert.deepEqual([r2.find((x) => x.login === 'favlive').favorit, r2.find((x) => x.login === 'favlive').gefolgt], [false, true]);
});
```

`test/home-abschnitte.test.js` komplett ersetzen:

```js
const { test } = require('node:test');
const assert = require('node:assert');
const H = require('../renderer/lib/home-abschnitte');

test('Standard: nur Offline zu', () => {
  assert.deepEqual(H.STANDARD, { favoriten: false, live: false, offline: true, twitch: false });
});

test('umschalten liefert neuen Zustand, Standard unveraendert', () => {
  const z = H.umschalten(H.STANDARD, 'offline');
  assert.equal(z.offline, false);
  assert.equal(H.STANDARD.offline, true);
  assert.equal(H.umschalten(z, 'favoriten').favoriten, true);
});

test('lies: Muell faellt auf Standard, alter Zustand {live, offline} bleibt lesbar', () => {
  for (const roh of [null, undefined, '', 'kaputt{', '42', '"x"', '[]']) assert.deepEqual(H.lies(roh), H.STANDARD, String(roh));
  assert.deepEqual(H.lies(JSON.stringify({ live: true, offline: false })), { favoriten: false, live: true, offline: false, twitch: false });
  assert.deepEqual(H.lies(JSON.stringify({ live: 'ja' })), H.STANDARD);
});
```

- [ ] **Step 2: Fehlschlag prüfen**

Run: `node --test test/home-liste.test.js test/home-abschnitte.test.js` → FAIL (Modul fehlt; STANDARD hat keine `favoriten`).

- [ ] **Step 3: Implementieren**

`renderer/lib/home-liste.js`:

```js
// Home: Kanaele in Abschnitte ★ Favoriten / Live / Offline / Auf Twitch
// teilen. DOM-frei, UMD wie die anderen Libs -> unter Node testbar.
// Spec: docs/superpowers/specs/2026-10-09-home-ein-tab-design.md
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.HomeListe = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  const MIN_TWITCH = 2;
  const ARTEN = ['favoriten', 'live', 'offline', 'twitch'];
  const TITEL = { favoriten: '★ Favoriten', live: 'Live', offline: 'Offline', twitch: 'Auf Twitch' };

  // Filter ueber Name, Spiel und Stream-Titel (case-insensitiv).
  function passt(k, nadel) {
    if (!nadel) return true;
    return `${k.login} ${k.displayName || ''} ${k.game || ''} ${k.title || ''}`.toLowerCase().includes(nadel);
  }

  // Exakt getippten Kanal hinter die fuehrenden verifizierten Treffer
  // einreihen (Twitchs Vorschlaege lassen ihn oft aus).
  function mitExaktTreffer(liste, exakt) {
    const rest = (liste || []).filter((k) => !exakt || k.login !== exakt.login);
    if (!exakt) return rest;
    let i = rest.findIndex((k) => !k.verifiziert);
    if (i < 0) i = rest.length;
    return [...rest.slice(0, i), exakt, ...rest.slice(i)];
  }

  function abschnitte({ kanaele = [], nadel = '', twitch = [], exakt = null, zu = {} } = {}) {
    const n = String(nadel || '').trim().toLowerCase().replace(/^#/, '');
    const eigene = kanaele.filter((k) => passt(k, n));
    const gruppen = {
      favoriten: eigene.filter((k) => k.favorit),
      live: eigene.filter((k) => !k.favorit && k.live),
      offline: eigene.filter((k) => !k.favorit && !k.live),
      twitch: []
    };
    if (n.length >= MIN_TWITCH) {
      const bekannt = new Set(kanaele.map((k) => k.login));
      const neu = (twitch || []).filter((k) => !bekannt.has(k.login));
      const ex = exakt && !bekannt.has(exakt.login) ? exakt : null;
      gruppen.twitch = mitExaktTreffer(neu, ex).map((k) => ({ ...k, favorit: false, gefolgt: false }));
    }
    return {
      keineEigenen: !!n && kanaele.length > 0 && eigene.length === 0,
      abschnitte: ARTEN
        .filter((art) => gruppen[art].length)
        .map((art) => ({ art, titel: TITEL[art], kanaele: gruppen[art], offen: !!n || !zu[art] }))
    };
  }

  // Nach Stern-Klick: Flags aus der neuen Favoritenliste; nicht gefolgte
  // ohne Stern fliegen raus, neu gesternte Twitch-Treffer kommen dazu.
  function sternAnwenden(kanaele, ch, favoriten) {
    const fav = new Set(favoriten || []);
    const out = (kanaele || [])
      .map((k) => ({ ...k, favorit: fav.has(k.login) }))
      .filter((k) => k.favorit || k.gefolgt);
    if (fav.has(ch.login) && !out.some((k) => k.login === ch.login)) {
      out.push({ ...ch, favorit: true, gefolgt: false });
    }
    return out;
  }

  return { MIN_TWITCH, abschnitte, mitExaktTreffer, sternAnwenden };
});
```

`renderer/lib/home-abschnitte.js` ersetzen:

```js
// Home: welche Abschnitte ZU sind (gemerkt in localStorage). DOM-frei,
// UMD wie die anderen Libs -> unter Node testbar. Abschnittsbildung: home-liste.js.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.HomeAbschnitte = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  const STANDARD = Object.freeze({ favoriten: false, live: false, offline: true, twitch: false });

  function umschalten(zu, art) {
    const z = { ...STANDARD, ...(zu || {}) };
    return { ...z, [art]: !z[art] };
  }

  // Unbekannte/kaputte Werte -> Standard; fehlende Arten (alter Stand
  // {live, offline}) bekommen ihren Standard.
  function lies(roh) {
    try {
      const o = JSON.parse(roh);
      if (o && typeof o === 'object' && !Array.isArray(o)) {
        const out = { ...STANDARD };
        for (const art of Object.keys(STANDARD)) if (typeof o[art] === 'boolean') out[art] = o[art];
        return out;
      }
    } catch (e) { /* Muell -> Standard */ }
    return { ...STANDARD };
  }

  return { STANDARD, umschalten, lies };
});
```

Löschen: `git rm renderer/lib/kanal-vorschlaege.js test/kanal-vorschlaege.test.js` (das `<script>`-Tag dafür entfernt Task 4).

- [ ] **Step 4: Tests grün**

Run: `node --test test/home-liste.test.js test/home-abschnitte.test.js` → PASS; `npm test` → alle PASS.

- [ ] **Step 5: Commit**

```bash
git add renderer/lib/home-liste.js renderer/lib/home-abschnitte.js test/home-liste.test.js test/home-abschnitte.test.js
git commit -m "feat: home-liste.js bildet Abschnitte Favoriten/Live/Offline/Auf Twitch"
```

---

### Task 4: Kanal-Feld oben zurück auf die Verlaufs-Datalist

**Files:**
- Modify: `renderer/video/video.js`, `renderer/video/index.html`

**Interfaces:**
- Consumes/Produces: nichts Neues; `refreshHistory()` füllt wieder `<datalist id="history">`.

- [ ] **Step 1: video.js zurücksetzen** – seit `caf86d7^` hat sich in `video.js` nur das Vorschlags-Dropdown geändert:

```bash
git diff caf86d7^ -- renderer/video/video.js | grep '^[-+]' | grep -v -i 'vorschl\|vsAuswahl\|vsTimer\|vsNr\|KanalVorschlaege\|QUELLE_LABEL\|\$vorschlaege\|^---\|^+++' | head
git checkout caf86d7^ -- renderer/video/video.js
```

Erwartet: Die `grep`-Ausgabe zeigt nur Zeilen des Dropdowns (Verlaufs-Datalist, `keydown`-Umbau, Kommentare) – sonst stoppen und von Hand zurückbauen.

- [ ] **Step 2: index.html zurückbauen**

Kanal-Feld wieder:

```html
      <input id="channel" type="text" placeholder="Channel (live) oder VOD-Link/ID …" autocomplete="off" list="history" />
      <datalist id="history"></datalist>
```

Entfernen: `<div id="vorschlaege" class="hidden" role="listbox"></div>`, der CSS-Block ab `/* Vorschlaege unter dem Kanal-Feld …` bis einschließlich `.vs-quelle { … }` (inkl. `.vs-haken`), und `<script src="../lib/kanal-vorschlaege.js"></script>`.

- [ ] **Step 3: Prüfen**

Run: `node --check renderer/video/video.js && grep -c "vorschl\|vs-" renderer/video/index.html renderer/video/video.js` → Zählung `0` für beide Dateien; `npm test` → PASS.

- [ ] **Step 4: Commit**

```bash
git add renderer/video/video.js renderer/video/index.html
git commit -m "revert: Vorschlagsliste im Kanal-Feld raus, wieder Verlaufs-Datalist"
```

---

### Task 5: Home-Oberfläche: eine Ansicht mit Suche und Sternen

**Files:**
- Modify: `renderer/video/index.html` (Home-Markup, Script-Tag), `renderer/video/home.js`, `renderer/video/home.css`, `renderer/themes/{blasen,koi,sakura,wald}/theme.css`

**Interfaces:**
- Consumes: `window.twitchDual.homeKanaele()` (Task 2), `window.twitchDual.kanalSuche(q) → {ok, channels, exakt}` (besteht), `addFavorite/removeFavorite(login) → {ok, favorites}` (besteht), `HomeListe.abschnitte`, `HomeAbschnitte.{lies, umschalten}` (Task 3).

- [ ] **Step 1: Markup** – in `renderer/video/index.html` den Block von `<div id="home-head">` bis zum Ende von `<div id="followed-view" …>…</div>` ersetzen (Auth-Leiste/-Code unverändert übernehmen):

```html
    <div id="home-head">
      <button id="home-back" class="hidden">← Zurück</button>
      <span id="home-title">Home</span>
      <button id="home-close" title="Schließen">✕</button>
    </div>

    <!-- #auth-bar und #auth-code: unveraendert wie bisher -->

    <div id="home-kanaele">
      <div id="home-such-zeile">
        <input id="home-suche" type="text" placeholder="Kanäle suchen (Name, Spiel, Titel) …" autocomplete="off" />
        <button id="refresh-btn" title="Aktualisieren">⟳</button>
      </div>
      <div id="home-hinweis" class="empty hidden"></div>
      <div id="home-liste"></div>
    </div>

    <div id="home-vod-view" class="hidden">
      <div id="vod-list"></div>
    </div>
```

Script-Tags: nach `home-abschnitte.js` einfügen `<script src="../lib/home-liste.js"></script>`.

- [ ] **Step 2: home.js** – den Teil von Dateianfang bis einschließlich `renderFavorites()` sowie `doAdd`, `buildFavCard`, `buildLiveCard` ersetzen; VOD-Teil (`openVods`, `emptyMsg`, `buildVodCard`, `previewUrl`) und Login-Teil bleiben. Neuer Kopf:

```js
// Home-Overlay: eine Ansicht mit Suche, ★-Favoriten, gefolgten Kanaelen
// (Live/Offline) und Twitch-Treffern beim Suchen + VOD-Browser.
// Spec: docs/superpowers/specs/2026-10-09-home-ein-tab-design.md
// Auswahl ruft window.twitchDual.submitLoad(...) auf -> laedt beide Fenster.

const $home = document.getElementById('home');
const $homeBtn = document.getElementById('home-btn');
const $homeClose = document.getElementById('home-close');
const $homeBack = document.getElementById('home-back');
const $homeTitle = document.getElementById('home-title');
const $kanaeleView = document.getElementById('home-kanaele');
const $vodView = document.getElementById('home-vod-view');
const $vodList = document.getElementById('vod-list');
const $suche = document.getElementById('home-suche');
const $refreshBtn = document.getElementById('refresh-btn');
const $hinweis = document.getElementById('home-hinweis');
const $liste = document.getElementById('home-liste');

// Welche Abschnitte zu sind, gemerkt.
let abschnitteZu = { ...HomeAbschnitte.STANDARD };
try { abschnitteZu = HomeAbschnitte.lies(localStorage.getItem('homeAbschnitteZu')); } catch { /* egal */ }

let kanaele = [];          // aus home-kanaele: Kanal + {favorit, gefolgt}
let gefolgtFehler = null;
let geladen = false;       // erster Stand da? (sonst Platzhalter)
let twitch = { channels: [], exakt: null }; // letzte Twitch-Treffer zur Suche
let suchNr = 0;            // verwirft verspaetete Suchantworten
let suchTimer = null;
let refreshTimer = null;

function nadel() { return $suche.value.trim().toLowerCase().replace(/^#/, ''); }

// --- Sichtbarkeit / Navigation --------------------------------------------
function showKanaeleView() {
  $vodView.classList.add('hidden');
  $kanaeleView.classList.remove('hidden');
  $homeBack.classList.add('hidden');
  $homeTitle.textContent = 'Home';
}

function showVodView(login, displayName) {
  $kanaeleView.classList.add('hidden');
  $vodView.classList.remove('hidden');
  $homeBack.classList.remove('hidden');
  $homeTitle.textContent = 'VODs · ' + (displayName || login);
}

function openHome() {
  window.twitchDual.notifyHomeOpen(); // Chat trennt die laufende Quelle
  $home.classList.remove('hidden');
  showKanaeleView();
  $suche.focus(); // direkt lostippen
  ladeKanaele();
  if (!refreshTimer) {
    refreshTimer = setInterval(() => {
      if (!$home.classList.contains('hidden') && !$kanaeleView.classList.contains('hidden')) ladeKanaele();
    }, 60000);
  }
}

function closeHome() {
  $home.classList.add('hidden');
}

// Home schliessen und zur bereits laufenden Quelle zurueck -> Chat wieder
// verbinden (der Player lief unter dem Overlay weiter). NICHT benutzen, wenn
// gerade eine neue Quelle geladen wird - das erledigt onLoad im Chat selbst.
function closeHomeResume() {
  closeHome();
  window.twitchDual.notifyHomeClose();
}

// --- Laden / Zeichnen -------------------------------------------------------
async function ladeKanaele() {
  if (!geladen) zeichnePlatzhalter();
  let res;
  try { res = await window.twitchDual.homeKanaele(); } catch (e) { res = { ok: false, error: e.message || String(e) }; }
  if (!res.ok) { gefolgtFehler = res.error || 'unbekannt'; geladen = true; renderHome(); return; }
  kanaele = res.kanaele;
  gefolgtFehler = res.gefolgtFehler;
  geladen = true;
  renderHome();
}

// Nur beim allerersten Laden schimmernde Platzhalter.
function zeichnePlatzhalter() {
  $liste.innerHTML = '';
  const grid = document.createElement('div');
  grid.id = 'live-grid';
  for (let i = 0; i < 3; i++) {
    const sk = document.createElement('div');
    sk.className = 'live-card skeleton';
    sk.innerHTML = '<div class="lc-thumbwrap"></div><div class="lc-body">' +
      '<div class="sk-line w60"></div></div>'; // statisches Markup, keine Fremddaten
    grid.appendChild(sk);
  }
  $liste.appendChild(grid);
}

function renderHome() {
  const r = HomeListe.abschnitte({ kanaele, nadel: nadel(), twitch: twitch.channels, exakt: twitch.exakt, zu: abschnitteZu });
  $liste.innerHTML = '';
  if (r.keineEigenen) $liste.appendChild(emptyMsg('Keine eigenen Kanäle passen.'));
  for (const a of r.abschnitte) $liste.appendChild(abschnittBox(a));
  renderHinweis();
}

function renderHinweis() {
  let text = '';
  if (gefolgtFehler) text = 'Gefolgte Kanäle nicht abrufbar: ' + gefolgtFehler;
  else if (geladen && !loggedIn) text = 'Mit Twitch anmelden, um deine gefolgten Kanäle zu sehen.';
  else if (geladen && !kanaele.length) text = 'Noch keine Kanäle – oben suchen und mit ☆ merken.';
  $hinweis.textContent = text;
  $hinweis.classList.toggle('hidden', !text);
}

// Kopf + Inhalt eines Abschnitts. Live-Kanaele (ausser bei „Auf Twitch“)
// als Vorschau-Karten im Grid, der Rest kompakt.
function abschnittBox(a) {
  const box = document.createElement('div');
  box.className = 'home-abschnitt' + (a.offen ? '' : ' zu');
  box.dataset.art = a.art;
  const kopf = document.createElement('button');
  kopf.type = 'button';
  kopf.className = 'abschnitt-kopf';
  const pfeil = document.createElement('span'); pfeil.className = 'abschnitt-pfeil'; pfeil.textContent = '▾';
  const titel = document.createElement('span'); titel.textContent = a.titel;
  const anzahl = document.createElement('span'); anzahl.className = 'abschnitt-anzahl'; anzahl.textContent = a.kanaele.length;
  kopf.append(pfeil, titel, anzahl);
  const inhalt = document.createElement('div');
  inhalt.className = 'abschnitt-inhalt';
  const gross = a.art !== 'twitch';
  const live = gross ? a.kanaele.filter((ch) => ch.live) : [];
  if (live.length) {
    const grid = document.createElement('div');
    grid.id = 'live-grid';
    for (const ch of live) grid.appendChild(buildLiveCard(ch));
    inhalt.appendChild(grid);
  }
  for (const ch of a.kanaele) if (!live.includes(ch)) inhalt.appendChild(buildFavCard(ch));
  // Umschalten toggelt nur die Klasse (Live-Vorschauen bleiben stehen).
  kopf.addEventListener('click', () => {
    abschnitteZu = HomeAbschnitte.umschalten(abschnitteZu, a.art);
    try { localStorage.setItem('homeAbschnitteZu', JSON.stringify(abschnitteZu)); } catch { /* egal */ }
    box.classList.toggle('zu', !(nadel() || !abschnitteZu[a.art]));
  });
  box.append(kopf, inhalt);
  return box;
}

// --- Suche -------------------------------------------------------------------
// Eigene Kanaele filtern sofort; Twitch-Treffer kommen entprellt nach.
function sucheGetippt() {
  renderHome();
  clearTimeout(suchTimer);
  const n = nadel();
  const nr = ++suchNr;
  if (n.length < HomeListe.MIN_TWITCH) return;
  suchTimer = setTimeout(async () => {
    let res = null;
    try { res = await window.twitchDual.kanalSuche(n); } catch { /* still */ }
    if (nr !== suchNr || !res || !res.ok) return; // veraltet oder Fehler
    twitch = { channels: res.channels || [], exakt: res.exakt || null };
    renderHome();
  }, 250);
}

// --- Stern ---------------------------------------------------------------------
function sternKnopf(ch) {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'stern' + (ch.favorit ? ' an' : '');
  b.textContent = ch.favorit ? '★' : '☆';
  b.title = ch.favorit ? 'Aus Favoriten entfernen' : 'Zu Favoriten';
  b.addEventListener('click', (e) => {
    e.stopPropagation(); // nicht den Karten-Klick (Stream laden) ausloesen
    sternUmschalten(ch);
  });
  return b;
}

// Ohne Netzabfrage: Flags lokal anpassen und neu zeichnen.
async function sternUmschalten(ch) {
  const r = ch.favorit
    ? await window.twitchDual.removeFavorite(ch.login)
    : await window.twitchDual.addFavorite(ch.login);
  if (!r.ok) return;
  kanaele = HomeListe.sternAnwenden(kanaele, ch, r.favorites);
  renderHome();
}

// --- Karten ----------------------------------------------------------------------
function nameMitHaken(ch) {
  const s = document.createElement('span');
  s.textContent = ch.displayName || ch.login;
  if (ch.verifiziert) {
    const h = document.createElement('span');
    h.className = 'haken';
    h.textContent = '✓';
    h.title = 'Verifiziert';
    s.appendChild(h);
  }
  return s;
}

function buildFavCard(ch) {
  const card = document.createElement('div');
  card.className = 'fav';

  const avatar = document.createElement('img');
  avatar.className = 'avatar' + (ch.live ? ' live' : '');
  if (ch.avatar) avatar.src = ch.avatar;
  avatar.alt = '';
  avatar.onerror = () => { avatar.style.visibility = 'hidden'; };
  card.appendChild(avatar);

  const info = document.createElement('div');
  info.className = 'info';
  const name = document.createElement('div');
  name.className = 'name';
  name.appendChild(nameMitHaken(ch));
  const badge = document.createElement('span');
  badge.className = 'badge' + (ch.live ? '' : ' off');
  badge.textContent = ch.live ? 'live' : 'offline';
  name.appendChild(badge);
  info.appendChild(name);

  const meta = document.createElement('div');
  meta.className = 'meta';
  if (ch.live) {
    const parts = [];
    if (ch.viewersLabel) parts.push(ch.viewersLabel + ' Zuschauer');
    if (ch.game) parts.push(ch.game);
    meta.textContent = parts.join(' · ') + (ch.title ? ' — ' + ch.title : '');
  } else {
    meta.textContent = ch.error ? 'Status nicht abrufbar' : 'offline';
  }
  info.appendChild(meta);
  card.appendChild(info);

  const actions = document.createElement('div');
  actions.className = 'actions';
  const watch = document.createElement('button');
  watch.className = 'watch';
  watch.textContent = '▶ Live';
  watch.disabled = !ch.live;
  watch.addEventListener('click', () => {
    window.twitchDual.submitLoad(ch.login);
    closeHome();
  });
  actions.appendChild(watch);
  const vods = document.createElement('button');
  vods.className = 'vods';
  vods.textContent = 'VODs';
  vods.addEventListener('click', () => openVods(ch.login, ch.displayName));
  actions.appendChild(vods);
  actions.appendChild(sternKnopf(ch));
  card.appendChild(actions);
  return card;
}

// Stream-Vorschau ohne API: Twitch liefert Live-Thumbnails ueber eine
// vorhersagbare CDN-URL. Cache-Buster wechselt mit dem 60-s-Refresh.
function previewUrl(login) {
  const bust = Math.floor(Date.now() / 60000);
  return `https://static-cdn.jtvnw.net/previews-ttv/live_user_${encodeURIComponent(login)}-440x248.jpg?t=${bust}`;
}

function buildLiveCard(ch) {
  // … bisheriger Rumpf von buildLiveCard unveraendert, mit zwei Aenderungen:
  // 1) name: `name.appendChild(nameMitHaken(ch));` statt `name.textContent = …`
  // 2) in lc-actions statt des Entfernen-Knopfs (`if (showRemove) {…}`):
  //    `actions.appendChild(sternKnopf(ch));`
}
```

Hinweis zu `buildLiveCard`: Den bestehenden Rumpf (Thumbnail, LIVE-Tag, Zuschauer, Avatar, Info, VODs-Knopf mit `stopPropagation`) wortgleich übernehmen; Parameter `{ showRemove }` entfällt; nur die zwei genannten Stellen ändern.

Events-Teil ersetzen durch:

```js
// --- Events ---------------------------------------------------------------
$homeBtn.addEventListener('click', () => {
  if ($home.classList.contains('hidden')) openHome();
  else closeHomeResume();
});
$homeClose.addEventListener('click', closeHomeResume);
$homeBack.addEventListener('click', showKanaeleView);
$refreshBtn.addEventListener('click', ladeKanaele);
$suche.addEventListener('input', sucheGetippt);

// Esc schliesst das Overlay (bzw. fuehrt aus der VOD-Ansicht zurueck).
document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape' || $home.classList.contains('hidden')) return;
  if (!$vodView.classList.contains('hidden')) showKanaeleView();
  else closeHomeResume();
});
```

In `renderAuth` die Zeile `if (typeof refreshFollowed === 'function') refreshFollowed(); // Task 8` ersetzen durch:

```js
  // Anmelden/Abmelden aendert die gefolgten Kanaele -> neu laden, falls offen.
  if (!$home.classList.contains('hidden')) ladeKanaele();
```

`loggedIn` wird in `renderHinweis` gelesen; die Deklaration `let loggedIn = false;` an den Dateianfang (zu den anderen `let`) verschieben, damit sie vor dem ersten `openHome()` existiert.

- [ ] **Step 3: CSS** (`renderer/video/home.css`)

Entfernen: Regeln für `#tab-followed`, `#tab-favorites`, `#fav-tools-toggle`, `#home-fav-view.tools-collapsed …`, `#add-row`, `#add-input`, `#add-btn`, `#filter-row`, `#filter-input`, `#followed-filter…`, `.fav .remove`, `.lc-actions .remove`. `#refresh-btn`-Regeln bleiben. Scroll-Container-Regeln auf `#home-kanaele, #home-vod-view` umstellen. Ergänzen:

```css
#home-such-zeile { display: flex; gap: 8px; margin-bottom: 12px; justify-content: center; }
#home-suche {
  flex: 0 1 460px; min-width: 0; padding: 8px 10px; border-radius: 6px;
  border: 1px solid var(--line); background: var(--bg); color: var(--text); font-size: 14px;
}
#home-suche:focus { outline: none; border-color: var(--accent); }
#home-hinweis { padding: 8px 12px; }

.stern {
  background: transparent; border: none; cursor: pointer; font-size: 17px; line-height: 1;
  color: var(--muted); padding: 4px 6px; transition: transform 120ms ease, color 120ms ease;
}
.stern:hover { color: #ffcf40; transform: scale(1.15); }
.stern.an { color: #ffcf40; }
.haken {
  display: inline-grid; place-items: center; width: 14px; height: 14px; margin-left: 5px;
  border-radius: 50%; background: #9147ff; color: #fff; font-size: 9px; font-weight: 700; vertical-align: 1px;
}
```

Themes (`renderer/themes/{blasen,koi,sakura,wald}/theme.css`): Selektor `#filter-input, … #add-input` → `:root[data-theme="…"] #home-suche`; in den Scrollbar-Regeln `#home-fav-view` und `#followed-view` → `#home-kanaele`.

- [ ] **Step 4: Prüfen**

Run:
```bash
node --check renderer/video/home.js
grep -rn "fav-list\|followed\|filter-input\|add-input\|tab-fav\|home-fav-view\|refreshFollowed\|liveStatus\|getFollowed" renderer/ src/ main.js preload.js
npm test
```
Expected: `node --check` ok; `grep` ohne Treffer; alle Tests PASS.

- [ ] **Step 5: Commit**

```bash
git add renderer/video/index.html renderer/video/home.js renderer/video/home.css renderer/themes
git commit -m "feat: Home als eine Ansicht mit Suche, Stern-Favoriten und Twitch-Treffern"
```

---

### Task 6: Doku + App neu starten

**Files:**
- Modify: `docs/TODO.md`

- [ ] **Step 1:** In `docs/TODO.md` den Eintrag „Kanal-Suche (Branch `feat/kanal-suche`) …“ ersetzen durch:

```markdown
- Home als eine Ansicht (Branch `feat/kanal-suche`): Suche oben (eigene
  Kanäle sofort, „Auf Twitch“ per GQL `searchSuggestions` + exakter Login),
  ★-Favoriten ganz oben, gefolgte Live/Offline (offline alphabetisch);
  Tabs Gefolgt/Favoriten und Kanal-Feld-Vorschläge entfernt; Live-Status
  gebündelt (100 pro Abfrage). Pin ✕ → 📌-Knopf zum Zurückholen.
```

- [ ] **Step 2:** `npm test` → alle PASS.

- [ ] **Step 3: Commit**

```bash
git add docs/TODO.md
git commit -m "docs: TODO Home-Umbau"
```

- [ ] **Step 4:** Laufende Electron-Prozesse beenden, `npm start` im Hintergrund, Janis zum Anschauen Bescheid geben (keine eigenen Screenshots).
