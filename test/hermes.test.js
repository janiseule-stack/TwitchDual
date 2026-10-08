// test/hermes.test.js
const { test } = require('node:test');
const assert = require('node:assert');
const { createHermes } = require('../src/hermes');
const fix = require('./fixtures/kanal-ereignisse/hermes-rahmen.json');

function fakeWsKlasse() {
  const instanzen = [];
  class FakeWs {
    constructor(url, opts) { this.url = url; this.opts = opts; this.gesendet = []; this.zu = false; instanzen.push(this); }
    send(s) { this.gesendet.push(JSON.parse(s)); }
    close() { this.zu = true; if (this.onclose) this.onclose({}); }
    rein(obj) { this.onmessage({ data: typeof obj === 'string' ? obj : JSON.stringify(obj) }); }
  }
  FakeWs.instanzen = instanzen;
  return FakeWs;
}

function fakeTimer() {
  let n = 0; const offen = new Map();
  return {
    setTimeoutImpl: (fn, ms) => { const id = ++n; offen.set(id, { fn, ms }); return id; },
    clearTimeoutImpl: (id) => offen.delete(id),
    feuere(msGleich) { for (const [id, t] of [...offen]) if (msGleich === undefined || t.ms === msGleich) { offen.delete(id); t.fn(); } },
    offen
  };
}

function aufbau({ token = null } = {}) {
  const Ws = fakeWsKlasse();
  const timer = fakeTimer();
  const ereignisse = []; const status = []; const diags = [];
  const h = createHermes({
    WebSocketImpl: Ws, getToken: () => token,
    onEreignis: (t, n) => ereignisse.push([t, n]), onStatus: (s) => status.push(s),
    diag: (e, d) => diags.push([e, d]),
    setTimeoutImpl: timer.setTimeoutImpl, clearTimeoutImpl: timer.clearTimeoutImpl,
    jetzt: () => 0, delay: () => 1234
  });
  return { h, Ws, timer, ereignisse, status, diags };
}

test('ohne Themen keine Verbindung', () => {
  const a = aufbau();
  a.h.setzeThemen([]);
  assert.equal(a.Ws.instanzen.length, 0);
});

test('welcome -> subscribe je Thema, anonym ohne authenticate', () => {
  const a = aufbau();
  a.h.setzeThemen(['polls.1', 'predictions-channel-v1.1']);
  const ws = a.Ws.instanzen[0];
  assert.match(ws.url, /^wss:\/\/hermes\.twitch\.tv\/v1\?clientId=kimne78kx3ncx6brgo4mv6wki5h1ko$/);
  ws.rein(fix.welcome);
  assert.deepEqual(ws.gesendet.map((r) => r.type), ['subscribe', 'subscribe']);
  assert.deepEqual(ws.gesendet.map((r) => r.subscribe.pubsub.topic), ['polls.1', 'predictions-channel-v1.1']);
  assert.equal(ws.gesendet[0].subscribe.type, 'pubsub');
  assert.deepEqual(a.status, ['verbunden']);
});

test('mit Token: authenticate zuerst, Token nie im diag', () => {
  const a = aufbau({ token: 'GEHEIM123' });
  a.h.setzeThemen(['polls.1']);
  const ws = a.Ws.instanzen[0];
  ws.rein(fix.welcome);
  assert.equal(ws.gesendet[0].type, 'authenticate');
  assert.equal(ws.gesendet[0].authenticate.token, 'GEHEIM123');
  assert.equal(ws.gesendet[1].type, 'subscribe');
  ws.rein(fix.authenticateResponse);
  assert.ok(!JSON.stringify(a.diags).includes('GEHEIM123'));
});

test('notification wird doppelt geparst und dem Thema zugeordnet', () => {
  const a = aufbau();
  a.h.setzeThemen(['predictions-channel-v1.411377640']);
  const ws = a.Ws.instanzen[0];
  ws.rein(fix.welcome);
  const aboId = ws.gesendet[0].subscribe.id;
  const rahmen = JSON.parse(fix.eventUpdated);
  rahmen.notification.subscription.id = aboId;
  ws.rein(rahmen);
  assert.equal(a.ereignisse.length, 1);
  assert.equal(a.ereignisse[0][0], 'predictions-channel-v1.411377640');
  assert.equal(a.ereignisse[0][1].type, 'event-updated');
});

test('kaputte notification wird gemeldet, nicht geworfen', () => {
  const a = aufbau();
  a.h.setzeThemen(['polls.1']);
  const ws = a.Ws.instanzen[0];
  ws.rein(fix.welcome);
  ws.rein({ type: 'notification', notification: { subscription: { id: ws.gesendet[0].subscribe.id }, pubsub: '{kaputt' } });
  assert.equal(a.ereignisse.length, 0);
  assert.equal(a.diags.at(-1)[0], 'rahmen-kaputt');
});

test('keepalive-Ausfall: nach 2x keepaliveSec zu, dann Neuverbindung mit Neu-Abo', () => {
  const a = aufbau();
  a.h.setzeThemen(['polls.1']);
  const ws1 = a.Ws.instanzen[0];
  ws1.rein(fix.welcome); // keepaliveSec 15 -> Waechter 30000
  a.timer.feuere(30000);
  assert.equal(ws1.zu, true);
  a.timer.feuere(1234); // Backoff
  const ws2 = a.Ws.instanzen[1];
  assert.ok(ws2, 'neue Verbindung');
  ws2.rein(fix.welcome);
  assert.equal(ws2.gesendet[0].subscribe.pubsub.topic, 'polls.1');
  assert.deepEqual(a.status, ['verbunden', 'getrennt', 'wieder-da']);
});

test('keepalive setzt den Waechter zurueck', () => {
  const a = aufbau();
  a.h.setzeThemen(['polls.1']);
  const ws = a.Ws.instanzen[0];
  ws.rein(fix.welcome);
  ws.rein({ type: 'keepalive', id: 'k', timestamp: 'x' });
  assert.equal([...a.timer.offen.values()].filter((t) => t.ms === 30000).length, 1);
});

test('andere Themenliste: alte Verbindung zu ohne Neuverbindung, neue auf', () => {
  const a = aufbau();
  a.h.setzeThemen(['polls.1']);
  a.Ws.instanzen[0].rein(fix.welcome);
  a.h.setzeThemen(['polls.2']);
  assert.equal(a.Ws.instanzen[0].zu, true);
  assert.equal(a.Ws.instanzen.length, 2);
  a.timer.feuere(1234);
  assert.equal(a.Ws.instanzen.length, 2, 'kein Reconnect der alten');
  a.Ws.instanzen[1].rein(fix.welcome);
  assert.equal(a.Ws.instanzen[1].gesendet[0].subscribe.pubsub.topic, 'polls.2');
});

test('gleiche Themenliste: nichts passiert', () => {
  const a = aufbau();
  a.h.setzeThemen(['polls.1']);
  a.h.setzeThemen(['polls.1']);
  assert.equal(a.Ws.instanzen.length, 1);
});

test('schliesse: zu und keine Neuverbindung', () => {
  const a = aufbau();
  a.h.setzeThemen(['polls.1']);
  a.h.schliesse();
  a.timer.feuere();
  assert.equal(a.Ws.instanzen.length, 1);
  assert.equal(a.Ws.instanzen[0].zu, true);
});
