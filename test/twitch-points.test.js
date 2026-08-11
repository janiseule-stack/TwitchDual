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

// Korrektur aus dem Spike (Task 1): redeem braucht cost, title und eine
// selbst erzeugte transactionID -- die urspruengliche Plan-Form wurde von
// Twitch mit einem Schema-Fehler abgelehnt.

test('redeem schickt cost, title und eine transactionID mit', async () => {
  const f = fakeFetch({ data: { redeemCommunityPointsCustomReward: { error: null } } });
  const api = createPointsApi({ fetchImpl: f });
  const r = await api.redeem('geheim', '78874179', { id: 'r1', title: 'Brot', cost: 200 }, '');
  assert.deepEqual(r, { ok: true, error: null });
  const input = f.aufrufe[0].body.variables.input;
  assert.equal(input.rewardID, 'r1');
  assert.equal(input.cost, 200);          // Twitch verlangt Int! - im Spike gemessen
  assert.equal(input.title, 'Brot');      // Twitch verlangt String!
  assert.ok(input.transactionID && input.transactionID.length >= 16);
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
  assert.deepEqual(await api.claim('geheim', '1', 'k1'), { ok: true, error: null });
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
