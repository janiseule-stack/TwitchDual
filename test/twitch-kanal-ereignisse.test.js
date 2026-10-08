// test/twitch-kanal-ereignisse.test.js
const { test } = require('node:test');
const assert = require('node:assert');
const { createKanalEreignisseApi, fehlerText } = require('../src/twitch-kanal-ereignisse');
const batch = require('./fixtures/kanal-ereignisse/start-batch.json');

function fakeFetch(antworten, status = 200) {
  const aufrufe = [];
  const f = async (url, opts) => {
    aufrufe.push({ url, headers: opts.headers, body: JSON.parse(opts.body) });
    const a = antworten.shift();
    return { status, text: async () => JSON.stringify(a) };
  };
  f.aufrufe = aufrufe;
  return f;
}

test('startzustand: ein Batch mit drei persisted queries, anonym', async () => {
  const f = fakeFetch([batch]);
  const api = createKanalEreignisseApi({ fetchImpl: f });
  const r = await api.startzustand({ channelID: '238813810', login: 'eliasn97', token: null });
  const b = f.aufrufe[0].body;
  assert.deepEqual(b.map((x) => x.operationName), ['GetPinnedChat', 'ChannelPollContext_GetViewablePoll', 'ChannelPointsPredictionContext']);
  assert.deepEqual(b[0].variables, { channelID: '238813810', count: 1 });
  assert.deepEqual(b[1].variables, { login: 'eliasn97' });
  assert.deepEqual(b[2].variables, { count: 1, channelLogin: 'eliasn97' });
  assert.equal(b[0].extensions.persistedQuery.sha256Hash, '450320a012e0f1704586e55755307ca3f8a4c611d678687cc3e202471a33e615');
  assert.equal(f.aufrufe[0].headers['Client-ID'], 'kimne78kx3ncx6brgo4mv6wki5h1ko');
  assert.equal(f.aufrufe[0].headers.Authorization, undefined);
  assert.ok(r.pin && r.pin.pinnedMessage);
  assert.equal(r.vorhersage.status, 'LOCKED');
  assert.deepEqual(r.fehler, []);
});

test('startzustand mit Token schickt OAuth', async () => {
  const f = fakeFetch([batch]);
  await createKanalEreignisseApi({ fetchImpl: f }).startzustand({ channelID: '1', login: 'x', token: 'tok' });
  assert.equal(f.aufrufe[0].headers.Authorization, 'OAuth tok');
});

test('startzustand: kaputter Teil wird null, andere bleiben', async () => {
  const kaputt = JSON.parse(JSON.stringify(batch));
  kaputt[0] = { errors: [{ message: 'PersistedQueryNotFound' }], extensions: { operationName: 'GetPinnedChat' } };
  const r = await createKanalEreignisseApi({ fetchImpl: fakeFetch([kaputt]) }).startzustand({ channelID: '1', login: 'x' });
  assert.equal(r.pin, null);
  assert.ok(r.vorhersage);
  assert.deepEqual(r.fehler, ['pin: PersistedQueryNotFound']);
});

test('startzustand: Netzfehler -> alles null, Fehler benannt', async () => {
  const f = async () => { throw new Error('offline'); };
  const r = await createKanalEreignisseApi({ fetchImpl: f }).startzustand({ channelID: '1', login: 'x' });
  assert.deepEqual(r, { pin: null, umfrage: null, vorhersage: null, fehler: ['netz: offline'] });
});

test('vorhersage: aktiv vor gesperrt vor aufgeloest', async () => {
  const b = JSON.parse(JSON.stringify(batch));
  const c = b[2].data.community.channel;
  c.activePredictionEvents = [{ ...c.lockedPredictionEvents[0], id: 'aktiv', status: 'ACTIVE' }];
  const r = await createKanalEreignisseApi({ fetchImpl: fakeFetch([b]) }).startzustand({ channelID: '1', login: 'x' });
  assert.equal(r.vorhersage.id, 'aktiv');
});

test('meineId fragt currentUser roh ab', async () => {
  const f = fakeFetch([{ data: { currentUser: { id: '999' } } }]);
  assert.equal(await createKanalEreignisseApi({ fetchImpl: f }).meineId('tok'), '999');
  assert.match(f.aufrufe[0].body.query, /currentUser\s*\{\s*id\s*\}/);
});

test('setze: erst Restriction, dann MakePrediction mit Integrity-Kopf', async () => {
  const f = fakeFetch([
    [{ data: {}, extensions: { operationName: 'UserPredictionEventRestriction' } }],
    [{ data: { makePrediction: { error: null } }, extensions: { operationName: 'MakePrediction' } }]
  ]);
  const api = createKanalEreignisseApi({ fetchImpl: f, neueTransaktionsId: () => 'abc123' });
  const r = await api.setze({ token: 'tok', eventID: 'e', outcomeID: 'o', points: 10500, kopf: { 'Client-Integrity': 'INT' } });
  assert.deepEqual(r, { ok: true, code: null });
  assert.equal(f.aufrufe[0].body[0].operationName, 'UserPredictionEventRestriction');
  assert.deepEqual(f.aufrufe[0].body[0].variables, { eventID: 'e' });
  const m = f.aufrufe[1];
  assert.equal(m.body[0].operationName, 'MakePrediction');
  assert.deepEqual(m.body[0].variables, { input: { eventID: 'e', outcomeID: 'o', points: 10500, transactionID: 'abc123' } });
  assert.equal(m.body[0].extensions.persistedQuery.sha256Hash, 'b44682ecc88358817009f20e69d75081b1e58825bb40aa53d5dbadcc17c881d8');
  assert.equal(m.headers['Client-Integrity'], 'INT');
  assert.equal(m.headers.Authorization, 'OAuth tok');
});

test('setze: Twitch-Fehlercode', async () => {
  const f = fakeFetch([[{ data: {} }], [{ data: { makePrediction: { error: { code: 'NOT_ENOUGH_POINTS' } } } }]]);
  const r = await createKanalEreignisseApi({ fetchImpl: f }).setze({ token: 't', eventID: 'e', outcomeID: 'o', points: 10, kopf: {} });
  assert.deepEqual(r, { ok: false, code: 'NOT_ENOUGH_POINTS' });
});

test('setze: Integrity-Ablehnung wirft mit .integrity', async () => {
  const f = fakeFetch([[{ data: {} }], [{ errors: [{ message: 'failed integrity check' }] }]]);
  await assert.rejects(
    createKanalEreignisseApi({ fetchImpl: f }).setze({ token: 't', eventID: 'e', outcomeID: 'o', points: 10, kopf: {} }),
    (e) => e.integrity === true);
});

test('setze: 401 heisst Anmeldung abgelaufen', async () => {
  const f = fakeFetch([[{}]], 401);
  await assert.rejects(
    createKanalEreignisseApi({ fetchImpl: f }).setze({ token: 't', eventID: 'e', outcomeID: 'o', points: 10, kopf: {} }),
    /Anmeldung abgelaufen/);
});

test('fehlerText: bekannt deutsch, unbekannt roh', () => {
  assert.equal(fehlerText('NOT_ENOUGH_POINTS'), 'Nicht genug Punkte');
  assert.equal(fehlerText('IRGENDWAS'), 'Twitch lehnt ab: IRGENDWAS');
});

test('startzustand liefert eigene Tipps aus self.recentPredictions', async () => {
  const b = JSON.parse(JSON.stringify(batch));
  b[2].data.community.channel.self = { recentPredictions: [{ event: { id: 'e' }, outcome: { id: 'o' }, points: 10500 }] };
  const r = await createKanalEreignisseApi({ fetchImpl: fakeFetch([b]) }).startzustand({ channelID: '1', login: 'x', token: 't' });
  assert.deepEqual(r.meineTipps, [{ event: { id: 'e' }, outcome: { id: 'o' }, points: 10500 }]);
});

test('startzustand anonym: meineTipps leer', async () => {
  const r = await createKanalEreignisseApi({ fetchImpl: fakeFetch([batch]) }).startzustand({ channelID: '1', login: 'x' });
  assert.deepEqual(r.meineTipps, []);
});
