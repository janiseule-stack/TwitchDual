// ChatSender mit nachgebautem WebSocket: holt das Token bei JEDEM Aufbau frisch
// (sonst nach >4 h abgelaufen -> Senden scheitert still) und verbindet nach
// unerwartetem Abbruch neu.
const { test } = require('node:test');
const assert = require('node:assert');
const { ChatSender } = require('../src/chat-send');

function fakeWs() {
  const offen = [];
  class FakeWs {
    constructor(url) { this.url = url; this.gesendet = []; this.zu = false; offen.push(this); }
    send(z) { this.gesendet.push(z); }
    close() { this.zu = true; }
    oeffnen() { this.onopen(); }
    login() { this.onmessage({ data: ':tmi.twitch.tv 001 nutzer :Welcome' }); }
    abbruch() { this.onclose(); }
  }
  return { FakeWs, offen };
}
const warte = () => new Promise((r) => setImmediate(r));

test('Token wird bei jedem Verbindungsaufbau frisch geholt', async () => {
  const { FakeWs, offen } = fakeWs();
  let token = 'alt';
  const s = new ChatSender({ WebSocketImpl: FakeWs, tokenQuelle: async () => ({ login: 'Nutzer', accessToken: token }), wartezeit: (fn) => fn() });
  s.login({ login: 'Nutzer', accessToken: 'alt' });
  s.setChannel('kanal');
  await warte();
  offen[0].oeffnen();
  assert.ok(offen[0].gesendet.includes('PASS oauth:alt'));
  token = 'neu';                       // Auth-Manager hat erneuert
  s.setChannel('anderer');             // nicht bereit -> Neuaufbau
  await warte();
  const letzter = offen[offen.length - 1];
  letzter.oeffnen();
  assert.ok(letzter.gesendet.includes('PASS oauth:neu'), 'neues Token: ' + letzter.gesendet.join(' | '));
});

test('Unerwarteter Abbruch: verbindet neu, mit frischem Token', async () => {
  const { FakeWs, offen } = fakeWs();
  let token = 't1';
  const geplant = [];
  const s = new ChatSender({ WebSocketImpl: FakeWs, tokenQuelle: async () => ({ login: 'nutzer', accessToken: token }),
    wartezeit: (fn, ms) => geplant.push({ fn, ms }) });
  s.login({ login: 'nutzer', accessToken: 't1' });
  s.setChannel('kanal');
  await warte();
  offen[0].oeffnen(); offen[0].login();
  assert.equal(s.ready, true);
  token = 't2';
  offen[0].abbruch();
  assert.equal(s.ready, false);
  assert.equal(geplant.length, 1, 'Neuverbindung geplant');
  geplant[0].fn();
  await warte();
  const neu = offen[offen.length - 1];
  assert.notEqual(neu, offen[0]);
  neu.oeffnen();
  assert.ok(neu.gesendet.includes('PASS oauth:t2'));
});

test('Gewollt geschlossen (Kanal weg / Logout): keine Neuverbindung', async () => {
  const { FakeWs, offen } = fakeWs();
  const geplant = [];
  const s = new ChatSender({ WebSocketImpl: FakeWs, tokenQuelle: async () => ({ login: 'n', accessToken: 't' }),
    wartezeit: (fn, ms) => geplant.push({ fn, ms }) });
  s.login({ login: 'n', accessToken: 't' });
  s.setChannel('kanal');
  await warte();
  s.setChannel(null);
  offen[0].abbruch && offen[0].onclose && offen[0].onclose();
  s.logout();
  assert.equal(geplant.length, 0);
});

test('Token weg (abgemeldet): kein Aufbau', async () => {
  const { FakeWs, offen } = fakeWs();
  const s = new ChatSender({ WebSocketImpl: FakeWs, tokenQuelle: async () => null, wartezeit: () => {} });
  s.login({ login: 'n', accessToken: 't' });
  s.setChannel('kanal');
  await warte();
  assert.equal(offen.length, 0);
  assert.equal(s.send('hi').ok, false);
});
