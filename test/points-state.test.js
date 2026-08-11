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

// Review-Fund: nach einem abgelaufenen Token steht der Abstand auf bis zu
// 5 Minuten. Ohne zuruecksetzen() bliebe ein Neuanmelden so lange ohne jede
// sichtbare Wirkung.
test('zuruecksetzen laesst den Takt sofort wieder greifen', () => {
  const s = createPointsState({ intervalMs: 15000, maxBackoffMs: 300000 });
  const an = { live: true, playing: true, hatToken: true, channelLogin: 'x' };
  for (let i = 0; i < 20; i++) s.abfrageFehler(i * 1000);
  assert.equal(s.aktuellerAbstandMs, 300000);
  assert.equal(s.sollAbfragen(an, 20000), false); // Rueckfahren wuerde 5 Min blockieren
  s.zuruecksetzen();
  assert.equal(s.aktuellerAbstandMs, 15000);
  assert.equal(s.sollAbfragen(an, 20000), true);  // sofort, nicht erst in 5 Min
});

test('zuruecksetzen laesst Kanalsperre und Kisten-Zaehler stehen', () => {
  const s = createPointsState({ maxClaimVersuche: 1 });
  s.kanalGesperrt('x');
  s.claimFehlgeschlagen('k1');
  s.zuruecksetzen();
  // Beides haengt am Kanal bzw. an der Kiste, nicht an der Anmeldung - ein
  // Neuanmelden darf nicht wieder gegen dieselbe Wand laufen lassen.
  assert.equal(s.istKanalGesperrt('x'), true);
  assert.equal(s.darfClaimen('k1'), false);
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
