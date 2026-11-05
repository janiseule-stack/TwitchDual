const { test } = require('node:test');
const assert = require('node:assert');
const { createWerbeZaehler } = require('../src/werbe-zaehler');

function fakeStore(start = {}) {
  const daten = { ...start };
  return { daten, get: (k, d) => (k in daten ? daten[k] : d), set: (k, v) => { daten[k] = v; } };
}

test('Werbe-Zaehler: startet bei 0 und zaehlt hoch', () => {
  const s = fakeStore();
  const z = createWerbeZaehler(s);
  assert.equal(z.gesamt(), 0);
  assert.equal(z.plusEins(), 1);
  assert.equal(z.plusEins(), 2);
  assert.equal(s.daten.werbungGeblockt, 2, 'im Store gespeichert');
});

test('Werbe-Zaehler: ueberlebt Neustart (neuer Zaehler, gleicher Store)', () => {
  const s = fakeStore();
  createWerbeZaehler(s).plusEins();
  createWerbeZaehler(s).plusEins();
  assert.equal(createWerbeZaehler(s).gesamt(), 2);
});

test('Werbe-Zaehler: kaputter Store-Wert zaehlt als 0', () => {
  for (const kaputt of ['abc', -3, NaN, null, 2.5]) {
    const z = createWerbeZaehler(fakeStore({ werbungGeblockt: kaputt }));
    assert.equal(z.gesamt(), kaputt === 2.5 ? 2 : 0, String(kaputt));
  }
});
