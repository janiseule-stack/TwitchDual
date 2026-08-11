const { test } = require('node:test');
const assert = require('node:assert');
const { kopfzeilenAusAnfrage, createIntegrityStore } = require('../src/twitch-integrity');

test('liest die vier zusammengehoerenden Kopfzeilen', () => {
  const s = kopfzeilenAusAnfrage({
    'Client-Integrity': 'v4.local.abc',
    'X-Device-Id': 'geraet1',
    'Client-Session-Id': 'sitzung1',
    'Client-Version': 'version1'
  });
  assert.deepEqual(s, { integrity: 'v4.local.abc', deviceId: 'geraet1', sessionId: 'sitzung1', version: 'version1' });
});

test('Kopfzeilennamen werden unabhaengig von Gross- und Kleinschreibung gefunden', () => {
  const s = kopfzeilenAusAnfrage({
    'client-integrity': 'v4.local.abc',
    'x-device-id': 'geraet1'
  });
  assert.equal(s.integrity, 'v4.local.abc');
  assert.equal(s.deviceId, 'geraet1');
});

test('ohne Integrity-Kopfzeile gibt es keinen Satz', () => {
  assert.equal(kopfzeilenAusAnfrage({ 'X-Device-Id': 'geraet1' }), null);
  assert.equal(kopfzeilenAusAnfrage({}), null);
  assert.equal(kopfzeilenAusAnfrage(null), null);
});

test('frisch gesetzter Satz wird zurueckgegeben', () => {
  const s = createIntegrityStore({ haltbarkeitMs: 1000 });
  s.setzen({ integrity: 'a' }, 0);
  assert.deepEqual(s.holen(500), { integrity: 'a' });
});

test('abgelaufener Satz wird nicht mehr zurueckgegeben', () => {
  const s = createIntegrityStore({ haltbarkeitMs: 1000 });
  s.setzen({ integrity: 'a' }, 0);
  assert.equal(s.holen(1001), null);
});

test('verwerfen macht den Satz sofort ungueltig', () => {
  const s = createIntegrityStore({ haltbarkeitMs: 100000 });
  s.setzen({ integrity: 'a' }, 0);
  s.verwerfen();
  assert.equal(s.holen(1), null);
});
