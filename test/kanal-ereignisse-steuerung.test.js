// test/kanal-ereignisse-steuerung.test.js
const { test } = require('node:test');
const assert = require('node:assert');
const { createSteuerung } = require('../src/kanal-ereignisse-steuerung');
const batch = require('./fixtures/kanal-ereignisse/start-batch.json');

const gesperrt = batch[2].data.community.channel.lockedPredictionEvents[0];
const aktiv = { ...gesperrt, status: 'ACTIVE' };
const pinNode = batch[0].data.channel.pinnedChatMessages.edges[0].node;

function aufbau({ token = null, start } = {}) {
  const gesendet = []; const themen = []; const diags = []; const intervalle = [];
  const api = {
    aufrufe: [],
    async startzustand(a) { api.aufrufe.push(a); return typeof start === 'function' ? start(a) : (start || { pin: pinNode, umfrage: null, vorhersage: aktiv, fehler: [] }); },
    async setze(a) { api.gesetzt = a; return api.setzErgebnis || { ok: true, code: null }; }
  };
  const s = createSteuerung({
    api,
    hermes: { setzeThemen: (t) => themen.push(t) },
    getToken: () => token,
    getUserId: async () => (token ? '999' : null),
    mitIntegrity: async (fn) => fn({ 'Client-Integrity': 'I' }),
    senden: (p) => gesendet.push(p),
    diag: (e, d) => diags.push([e, d]),
    jetzt: () => Date.parse('2026-10-08T23:00:00Z'),
    setIntervalImpl: (fn, ms) => { intervalle.push({ fn, ms, aktiv: true }); return intervalle.length; },
    clearIntervalImpl: (id) => { intervalle[id - 1].aktiv = false; }
  });
  return { s, api, gesendet, themen, diags, intervalle };
}

test('kanalGeladen: Start holen, senden, Themen anonym', async () => {
  const a = aufbau();
  await a.s.kanalGeladen({ login: 'jynxzi', channelID: '411377640' });
  assert.deepEqual(a.api.aufrufe[0], { channelID: '411377640', login: 'jynxzi', token: null });
  const letzte = a.gesendet.at(-1);
  assert.equal(letzte.stand.vorhersage.status, 'ACTIVE');
  assert.ok(letzte.stand.pin);
  assert.deepEqual(letzte.signale, []);
  assert.equal(letzte.angemeldet, false);
  assert.deepEqual(a.themen.at(-1), ['pinned-chat-updates-v1.411377640', 'polls.411377640', 'predictions-channel-v1.411377640']);
});

test('mit Login zusaetzlich Nutzer-Themen', async () => {
  const a = aufbau({ token: 'tok' });
  await a.s.kanalGeladen({ login: 'jynxzi', channelID: '411377640' });
  assert.ok(a.themen.at(-1).includes('predictions-user-v1.999'));
  assert.ok(a.themen.at(-1).includes('community-points-user-v1.999'));
  assert.equal(a.gesendet.at(-1).angemeldet, true);
});

test('veraltete Antwort wird verworfen', async () => {
  let loesen;
  const a = aufbau({ start: (arg) => arg.login === 'alt' ? new Promise((r) => { loesen = r; }) : { pin: null, umfrage: null, vorhersage: null, fehler: [] } });
  const altLauf = a.s.kanalGeladen({ login: 'alt', channelID: '1' });
  await a.s.kanalGeladen({ login: 'neu', channelID: '2' });
  loesen({ pin: pinNode, umfrage: null, vorhersage: aktiv, fehler: [] });
  await altLauf;
  assert.equal(a.gesendet.at(-1).stand.pin, null);
  assert.deepEqual(a.themen.at(-1), ['pinned-chat-updates-v1.2', 'polls.2', 'predictions-channel-v1.2']);
});

test('Rueckfall-Takt alle 10 s holt nur Pin und Umfrage', async () => {
  const a = aufbau();
  await a.s.kanalGeladen({ login: 'x', channelID: '1' });
  const takt = a.intervalle.find((i) => i.aktiv);
  assert.equal(takt.ms, 10000);
  a.api.aufrufe.length = 0;
  await takt.fn();
  assert.equal(a.api.aufrufe.length, 1);
  assert.ok(a.gesendet.at(-1).stand.vorhersage, 'Vorhersage bleibt aus dem Start');
});

test('aus: Themen leer, Takt weg, leerer Stand gesendet', async () => {
  const a = aufbau();
  await a.s.kanalGeladen({ login: 'x', channelID: '1' });
  a.s.aus();
  assert.deepEqual(a.themen.at(-1), []);
  assert.equal(a.intervalle.every((i) => !i.aktiv), true);
  assert.equal(a.gesendet.at(-1).stand, null);
});

test('Startfehler landen im diag', async () => {
  const a = aufbau({ start: { pin: null, umfrage: null, vorhersage: null, fehler: ['pin: PersistedQueryNotFound'] } });
  await a.s.kanalGeladen({ login: 'x', channelID: '1' });
  assert.ok(a.diags.some(([e, d]) => e === 'start-fehler' && d.fehler[0] === 'pin: PersistedQueryNotFound'));
});

test('unbekannter Hermes-Rahmen: hoechstens 3x je Typ protokolliert', async () => {
  const a = aufbau();
  await a.s.kanalGeladen({ login: 'x', channelID: '1' });
  for (let i = 0; i < 5; i++) a.s.hermesEreignis('polls.1', { type: 'POLL_UPDATE', data: { i } });
  assert.equal(a.diags.filter(([e]) => e === 'hermes-rahmen').length, 3);
});

test('wieder-da holt den kompletten Start neu', async () => {
  const a = aufbau();
  await a.s.kanalGeladen({ login: 'x', channelID: '1' });
  a.api.aufrufe.length = 0;
  await a.s.hermesStatus('wieder-da');
  assert.equal(a.api.aufrufe.length, 1);
});

test('setze ohne Login', async () => {
  const a = aufbau();
  await a.s.kanalGeladen({ login: 'x', channelID: '1' });
  assert.deepEqual(await a.s.setze({ outcomeID: aktiv.outcomes[0].id, points: 100 }), { ok: false, text: 'Zum Setzen anmelden' });
});

test('setze mit Login: ruft api.setze mit Integrity-Kopf, merkt eigenen Tipp', async () => {
  const a = aufbau({ token: 'tok' });
  await a.s.kanalGeladen({ login: 'x', channelID: '1' });
  const nein = aktiv.outcomes[1].id;
  const r = await a.s.setze({ outcomeID: nein, points: 10500 });
  assert.deepEqual(r, { ok: true, text: '10.500 gesetzt' });
  assert.deepEqual(a.api.gesetzt, { token: 'tok', eventID: aktiv.id, outcomeID: nein, points: 10500, kopf: { 'Client-Integrity': 'I' } });
  assert.deepEqual(a.gesendet.at(-1).stand.meinTipp, { eventId: aktiv.id, optionId: nein, punkte: 10500 });
});

test('setze auf gesperrte Gegen-Option wird lokal abgelehnt', async () => {
  const a = aufbau({ token: 'tok' });
  await a.s.kanalGeladen({ login: 'x', channelID: '1' });
  await a.s.setze({ outcomeID: aktiv.outcomes[1].id, points: 10 });
  const r = await a.s.setze({ outcomeID: aktiv.outcomes[0].id, points: 10 });
  assert.deepEqual(r, { ok: false, text: 'Nur noch auf deine Option möglich' });
});

test('setze: Twitch-Fehlercode wird uebersetzt', async () => {
  const a = aufbau({ token: 'tok' });
  await a.s.kanalGeladen({ login: 'x', channelID: '1' });
  a.api.setzErgebnis = { ok: false, code: 'NOT_ENOUGH_POINTS' };
  assert.deepEqual(await a.s.setze({ outcomeID: aktiv.outcomes[0].id, points: 10 }), { ok: false, text: 'Nicht genug Punkte' });
});

test('setze: ungueltiger Betrag', async () => {
  const a = aufbau({ token: 'tok' });
  await a.s.kanalGeladen({ login: 'x', channelID: '1' });
  assert.deepEqual(await a.s.setze({ outcomeID: aktiv.outcomes[0].id, points: 5 }), { ok: false, text: 'Mindestens 10 Punkte' });
});

test('guthaben aus dem Punkte-Takt landet im Stand', async () => {
  const a = aufbau({ token: 'tok' });
  await a.s.kanalGeladen({ login: 'x', channelID: '1' });
  a.s.guthaben(28446);
  assert.equal(a.gesendet.at(-1).stand.guthaben, 28446);
  a.s.guthaben(28446);
  assert.equal(a.gesendet.filter((g) => g.stand && g.stand.guthaben === 28446).length, 1, 'unveraendert -> nicht erneut senden');
});

// --- Review-Befunde (Final review) -------------------------------------------
const hermesFix = require('./fixtures/kanal-ereignisse/hermes-rahmen.json');
const hNutzlast = (r) => JSON.parse(JSON.parse(r).notification.pubsub);

test('Rahmen vom alten Kanal waehrend langsamer Startabfrage aendert nichts', async () => {
  let loesen;
  const a = aufbau({ start: (arg) => arg.channelID === '2' ? new Promise((r) => { loesen = r; }) : { pin: null, umfrage: null, vorhersage: null, fehler: [] } });
  await a.s.kanalGeladen({ login: 'alt', channelID: '1' });
  const lauf = a.s.kanalGeladen({ login: 'neu', channelID: '2' });
  const vorher = a.gesendet.length;
  a.s.hermesEreignis('predictions-channel-v1.1', hNutzlast(hermesFix.eventUpdated));
  assert.equal(a.gesendet.length, vorher, 'nichts gesendet');
  loesen({ pin: null, umfrage: null, vorhersage: null, fehler: [] });
  await lauf;
  assert.equal(a.gesendet.at(-1).stand.vorhersage, null);
});

test('Nutzer-Rahmen aus fremdem Kanal werden ignoriert', async () => {
  const a = aufbau({ token: 'tok' });
  await a.s.kanalGeladen({ login: 'x', channelID: '1' });
  a.s.hermesEreignis('community-points-user-v1.999', hNutzlast(hermesFix.pointsSpent)); // channel 411377640
  a.s.hermesEreignis('predictions-user-v1.999', hNutzlast(hermesFix.predictionMade));   // channel 411377640
  const st = a.gesendet.at(-1).stand;
  assert.equal(st.guthaben, null);
  assert.equal(st.meinTipp, null);
});

test('Nutzer-Rahmen aus dem eigenen Kanal kommen an', async () => {
  const a = aufbau({ token: 'tok' });
  await a.s.kanalGeladen({ login: 'jynxzi', channelID: '411377640' });
  a.s.hermesEreignis('community-points-user-v1.999', hNutzlast(hermesFix.pointsSpent));
  assert.equal(a.gesendet.at(-1).stand.guthaben, 17946);
});

test('zweites setze waehrend das erste laeuft wird abgelehnt', async () => {
  const a = aufbau({ token: 'tok' });
  await a.s.kanalGeladen({ login: 'x', channelID: '1' });
  let loesen;
  a.api.setze = () => new Promise((r) => { loesen = r; });
  const erstes = a.s.setze({ outcomeID: aktiv.outcomes[0].id, points: 100 });
  const zweites = await a.s.setze({ outcomeID: aktiv.outcomes[0].id, points: 100 });
  assert.deepEqual(zweites, { ok: false, text: 'Läuft schon …' });
  loesen({ ok: true, code: null });
  assert.equal((await erstes).ok, true);
  a.api.setze = async () => ({ ok: true, code: null });
  assert.equal((await a.s.setze({ outcomeID: aktiv.outcomes[0].id, points: 100 })).ok, true, 'danach wieder frei');
});

test('Home auf/zu auf demselben Kanal behaelt eigenen Tipp und Guthaben', async () => {
  const a = aufbau({ token: 'tok' });
  await a.s.kanalGeladen({ login: 'x', channelID: '1' });
  a.s.guthaben(5000);
  await a.s.setze({ outcomeID: aktiv.outcomes[0].id, points: 100 });
  a.s.aus();
  await a.s.kanalGeladen({ login: 'x', channelID: '1' });
  const st = a.gesendet.at(-1).stand;
  assert.deepEqual(st.meinTipp, { eventId: aktiv.id, optionId: aktiv.outcomes[0].id, punkte: 100 });
  assert.equal(st.guthaben, 5000);
});

test('anderer Kanal: kein Tipp und kein Guthaben uebernommen', async () => {
  const a = aufbau({ token: 'tok' });
  await a.s.kanalGeladen({ login: 'x', channelID: '1' });
  a.s.guthaben(5000);
  await a.s.setze({ outcomeID: aktiv.outcomes[0].id, points: 100 });
  await a.s.kanalGeladen({ login: 'y', channelID: '2' });
  const st = a.gesendet.at(-1).stand;
  assert.equal(st.meinTipp, null);
  assert.equal(st.guthaben, null);
});

test('meineTipps aus dem Start landen im Stand', async () => {
  const a = aufbau({ token: 'tok', start: { pin: null, umfrage: null, vorhersage: aktiv, fehler: [],
    meineTipps: [{ event: { id: aktiv.id }, outcome: { id: aktiv.outcomes[1].id }, points: 10500 }] } });
  await a.s.kanalGeladen({ login: 'x', channelID: '1' });
  assert.equal(a.gesendet.at(-1).stand.meinTipp.punkte, 10500);
});
