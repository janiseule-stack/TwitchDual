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
  assert.deepEqual(r, { channelID: '78874179', displayName: 'krokoboss', balance: 34724, claimID: 'kiste-1',
    punkteName: null, iconUrl: null });
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

// Die Antworten unten sind alle von Hand gebaut. Faellt das Feld aus der
// Abfrage, blieben sie gruen, waehrend Ebene 1 in echt fuer JEDEN Kanal stirbt.
// Nur diese beiden Zusicherungen haengen am tatsaechlich abgeschickten Text.
test('context fragt Name und Bild der Kanalpunkte mit ab', async () => {
  const f = fakeFetch({ data: { community: null } });
  const api = createPointsApi({ fetchImpl: f });
  await api.context('geheim', 'krokoboss');
  assert.ok(f.aufrufe[0].body.query.includes('communityPointsSettings'));
  assert.ok(f.aufrufe[0].body.query.includes('image'));
});

test('claim fragt den Stand nach dem Einloesen mit ab', async () => {
  const f = fakeFetch({ data: { claimCommunityPoints: { claim: { id: 'kiste-1' } } } });
  const api = createPointsApi({ fetchImpl: f });
  await api.claim('geheim', '1', 'kiste-1');
  assert.ok(f.aufrufe[0].body.query.includes('currentPoints'));
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
  assert.deepEqual(await api.claim('geheim', '1', 'kiste-1'), { ok: true, error: null, currentPoints: 34774 });
});

test('claim meldet Twitchs Fehlercode weiter', async () => {
  const f = fakeFetch({ data: { claimCommunityPoints: { currentPoints: null, error: { code: 'ALREADY_CLAIMED' } } } });
  const api = createPointsApi({ fetchImpl: f });
  assert.deepEqual(await api.claim('geheim', '1', 'k'), { ok: false, error: 'ALREADY_CLAIMED', currentPoints: null });
});

test('rewards liefert nur aktive Belohnungen', async () => {
  const f = fakeFetch({ data: { community: { id: '1', channel: { communityPointsSettings: { customRewards: [
    { id: 'a', title: 'Hydrate', cost: 100, prompt: 'Trink was', isEnabled: true, isPaused: false },
    { id: 'b', title: 'Aus', cost: 50, prompt: '', isEnabled: false, isPaused: false },
    { id: 'c', title: 'Pausiert', cost: 50, prompt: '', isEnabled: true, isPaused: true }
  ] } } } } });
  const api = createPointsApi({ fetchImpl: f });
  assert.deepEqual(await api.rewards('geheim', 'x'),
    [{ id: 'a', title: 'Hydrate', cost: 100, prompt: 'Trink was', enabled: true }]);
});

// Ohne prompt im Abfrage-Ergebnis kann redeem ihn nicht mitschicken - und
// genau daran scheiterte das Einloesen live mit PROPERTIES_MISMATCH.
test('rewards gibt den prompt weiter, auch wenn Twitch null liefert', async () => {
  const f = fakeFetch({ data: { community: { id: '1', channel: { communityPointsSettings: { customRewards: [
    { id: 'a', title: 'Ohne Text', cost: 10, prompt: null, isEnabled: true, isPaused: false }
  ] } } } } });
  const api = createPointsApi({ fetchImpl: f });
  assert.deepEqual(await api.rewards('geheim', 'x'),
    [{ id: 'a', title: 'Ohne Text', cost: 10, prompt: '', enabled: true }]);
});

// Korrektur aus dem Spike (Task 1): redeem braucht cost, title und eine
// selbst erzeugte transactionID -- die urspruengliche Plan-Form wurde von
// Twitch mit einem Schema-Fehler abgelehnt.

test('redeem schickt cost, title, prompt und eine transactionID mit', async () => {
  const f = fakeFetch({ data: { redeemCommunityPointsCustomReward: { error: null } } });
  const api = createPointsApi({ fetchImpl: f });
  const r = await api.redeem('geheim', '78874179', { id: 'r1', title: 'Brot', cost: 200, prompt: 'Mit Butter' }, '');
  assert.deepEqual(r, { ok: true, error: null });
  const input = f.aufrufe[0].body.variables.input;
  assert.equal(input.rewardID, 'r1');
  assert.equal(input.cost, 200);          // Twitch verlangt Int! - im Spike gemessen
  assert.equal(input.title, 'Brot');      // Twitch verlangt String!
  assert.equal(input.prompt, 'Mit Butter');
  assert.ok(input.transactionID && input.transactionID.length >= 16);
});

// Live belegt (2026-08-12, Kanal tolkin): mit cost+title allein antwortet
// Twitch PROPERTIES_MISMATCH. Der Server vergleicht die sichtbaren
// Eigenschaften der Belohnung - der prompt gehoert dazu.
test('redeem schickt auch einen leeren prompt als String', async () => {
  const f = fakeFetch({ data: { redeemCommunityPointsCustomReward: { error: null } } });
  const api = createPointsApi({ fetchImpl: f });
  await api.redeem('geheim', '1', { id: 'r1', title: 'Brot', cost: 200 }, '');
  assert.equal(f.aufrufe[0].body.variables.input.prompt, '');
});

// Review-Fund: claim hatte diesen Test, redeem nicht - dabei ist redeem der
// einzige Aufruf, der echte Punkte ausgibt. Twitchs Begruendung muss beim
// Aufrufer ankommen, sonst scheitert die Einloesung still.
test('redeem meldet Twitchs Fehlercode weiter', async () => {
  const f = fakeFetch({ data: { redeemCommunityPointsCustomReward: { error: { code: 'NOT_ENOUGH_POINTS' } } } });
  const api = createPointsApi({ fetchImpl: f });
  const r = await api.redeem('geheim', '1', { id: 'r1', title: 'Brot', cost: 200 }, '');
  assert.deepEqual(r, { ok: false, error: 'NOT_ENOUGH_POINTS' });
});

test('jede Einloesung bekommt eine eigene transactionID', async () => {
  const f = fakeFetch({ data: { redeemCommunityPointsCustomReward: { error: null } } });
  const api = createPointsApi({ fetchImpl: f });
  const b = { id: 'r1', title: 'Brot', cost: 200 };
  await api.redeem('geheim', '1', b, '');
  await api.redeem('geheim', '1', b, '');
  assert.notEqual(f.aufrufe[0].body.variables.input.transactionID,
                  f.aufrufe[1].body.variables.input.transactionID);
});

test('claim schickt die Integrity-Kopfzeilen mit', async () => {
  const f = fakeFetch({ data: { claimCommunityPoints: { currentPoints: 1, error: null } } });
  const api = createPointsApi({ fetchImpl: f });
  await api.claim('geheim', '1', 'k1', {
    'Client-Integrity': 'v4.local.abc', 'X-Device-Id': 'geraet1'
  });
  const h = f.aufrufe[0].opts.headers;
  assert.equal(h['Client-Integrity'], 'v4.local.abc');
  assert.equal(h['X-Device-Id'], 'geraet1');
  assert.equal(h['Client-ID'], 'kimne78kx3ncx6brgo4mv6wki5h1ko');  // Grundkopfzeilen bleiben
});

test('claim ohne Zusatzkopfzeilen verhaelt sich wie bisher', async () => {
  const f = fakeFetch({ data: { claimCommunityPoints: { currentPoints: 1, error: null } } });
  const api = createPointsApi({ fetchImpl: f });
  assert.deepEqual(await api.claim('geheim', '1', 'k1'), { ok: true, error: null, currentPoints: 1 });
  assert.equal(f.aufrufe[0].opts.headers['Client-Integrity'], undefined);
});

test('IntegrityCheckFailed ist als eigener Fehlertyp erkennbar', async () => {
  const f = fakeFetch({ errors: [{ message: 'failed integrity check',
    extensions: { code: 'IntegrityCheckFailed' } }], data: null });
  const api = createPointsApi({ fetchImpl: f });
  await assert.rejects(() => api.claim('geheim', '1', 'k1'), (e) => e.integrity === true);
});

// Review-Fund: extraHeaders duerfen die Grundkopfzeilen niemals ersetzen,
// auch nicht durch Zufall oder boesen Willen eines kuenftigen Aufrufers.
test('extraHeaders koennen Client-ID und Authorization nicht ueberschreiben', async () => {
  const f = fakeFetch({ data: { claimCommunityPoints: { currentPoints: 1, error: null } } });
  const api = createPointsApi({ fetchImpl: f });
  await api.claim('geheim', '1', 'k1', {
    'Client-ID': 'boesewicht', 'Authorization': 'OAuth boesewicht'
  });
  const h = f.aufrufe[0].opts.headers;
  assert.equal(h['Client-ID'], 'kimne78kx3ncx6brgo4mv6wki5h1ko');
  assert.equal(h['Authorization'], 'OAuth geheim');
});

// Task 1: main.js meldete nach einem Kisten-Claim bisher den Stand von
// VOR dem Claim, weil claim() das Feld currentPoints wegwarf. Spaetere
// Aufgaben brauchen den Stand NACH dem Einloesen, um den Kistenbetrag als
// Differenz zu berechnen.
test('claim reicht currentPoints durch', async () => {
  const f = fakeFetch({ data: { claimCommunityPoints: { currentPoints: 1250, error: null } } });
  const api = createPointsApi({ fetchImpl: f });
  const r = await api.claim('tok', '123', 'claim-1', {});
  assert.equal(r.ok, true);
  assert.equal(r.currentPoints, 1250);
});

test('claim ohne currentPoints liefert null statt zu werfen', async () => {
  const f = fakeFetch({ data: { claimCommunityPoints: { error: null } } });
  const api = createPointsApi({ fetchImpl: f });
  const r = await api.claim('tok', '123', 'claim-1', {});
  assert.equal(r.ok, true);
  assert.equal(r.currentPoints, null);
});

test('claim mit Fehler liefert ok=false und keinen Stand', async () => {
  const f = fakeFetch({ data: { claimCommunityPoints: { error: { code: 'ALREADY_CLAIMED' } } } });
  const api = createPointsApi({ fetchImpl: f });
  const r = await api.claim('tok', '123', 'claim-1', {});
  assert.equal(r.ok, false);
  assert.equal(r.error, 'ALREADY_CLAIMED');
  assert.equal(r.currentPoints, null);
});

// Task 2: der Punkte-Chip im Renderer soll das kanaleigene Punktesymbol
// zeigen statt eines starren Muenz-Emojis. Twitch liefert Name und Icon-URL
// unauthentifiziert in derselben Kontext-Abfrage mit (belegt 2026-08-12,
// Kanal Papaplatte) - kostet also keinen zusaetzlichen Netzverkehr.
test('context liefert Name und Symbol der Kanalpunkte', async () => {
  const f = fakeFetch({ data: { community: {
    id: '50985620', displayName: 'Papaplatte',
    channel: {
      communityPointsSettings: { name: 'Papapoints', image: { url: 'https://cdn/icon-1.png' } },
      self: { communityPoints: { balance: 4200, availableClaim: null } }
    }
  } } });
  const api = createPointsApi({ fetchImpl: f });
  const c = await api.context('tok', 'papaplatte');
  assert.equal(c.balance, 4200);
  assert.equal(c.punkteName, 'Papapoints');
  assert.equal(c.iconUrl, 'https://cdn/icon-1.png');
});

// Rund die Haelfte der Kanaele setzt beides nicht (belegt 2026-08-12 gegen
// die echte API an xQc/shroud/Knossi) - der Rueckfall ist hier Pflicht.
test('context ohne communityPointsSettings liefert beide Felder als null', async () => {
  const f = fakeFetch({ data: { community: {
    id: '1', displayName: 'xQc',
    channel: {
      communityPointsSettings: null,
      self: { communityPoints: { balance: 10, availableClaim: null } }
    }
  } } });
  const api = createPointsApi({ fetchImpl: f });
  const c = await api.context('tok', 'xqc');
  assert.equal(c.punkteName, null);
  assert.equal(c.iconUrl, null);
});

test('context mit Name aber ohne Bild liefert nur den Namen', async () => {
  const f = fakeFetch({ data: { community: {
    id: '1', displayName: 'Kanal',
    channel: {
      communityPointsSettings: { name: 'Sternchen', image: null },
      self: { communityPoints: { balance: 10, availableClaim: null } }
    }
  } } });
  const api = createPointsApi({ fetchImpl: f });
  const c = await api.context('tok', 'kanal');
  assert.equal(c.punkteName, 'Sternchen');
  assert.equal(c.iconUrl, null);
});

test('context ohne community liefert weiterhin lauter null', async () => {
  const f = fakeFetch({ data: { community: null } });
  const api = createPointsApi({ fetchImpl: f });
  const c = await api.context('tok', 'gibtsnicht');
  assert.equal(c.channelID, null);
  assert.equal(c.balance, null);
  assert.equal(c.punkteName, null);
  assert.equal(c.iconUrl, null);
});
