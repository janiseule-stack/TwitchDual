const { test } = require('node:test');
const assert = require('node:assert');
const { tokenAusCookies, createWebAuthStore } = require('../src/twitch-web-auth');

test('findet den auth-token in der Cookie-Liste', () => {
  assert.equal(tokenAusCookies([
    { name: 'unique_id', value: 'abc' },
    { name: 'auth-token', value: 'geheim123' }
  ]), 'geheim123');
});

test('liefert null wenn kein auth-token dabei ist', () => {
  assert.equal(tokenAusCookies([{ name: 'unique_id', value: 'abc' }]), null);
  assert.equal(tokenAusCookies([]), null);
  assert.equal(tokenAusCookies(null), null);
});

test('leerer Token-Wert zaehlt nicht als Token', () => {
  assert.equal(tokenAusCookies([{ name: 'auth-token', value: '' }]), null);
});

function fakeSafeStorage() {
  return {
    isEncryptionAvailable: () => true,
    encryptString: (s) => Buffer.from('ENC:' + s),
    decryptString: (b) => b.toString().replace(/^ENC:/, '')
  };
}
function fakeStore() {
  // Wie electron-store: alles geht durch JSON. Ein Fake, der Objekte identisch
  // zurueckgibt, wuerde den Buffer-Bug nicht zeigen.
  const daten = new Map();
  return {
    get: (k) => (daten.has(k) ? JSON.parse(daten.get(k)) : undefined),
    set: (k, v) => daten.set(k, JSON.stringify(v)),
    delete: (k) => daten.delete(k)
  };
}

test('speichert verschluesselt und liest zurueck', () => {
  const store = fakeStore();
  const s = createWebAuthStore({ safeStorage: fakeSafeStorage(), store });
  s.speichern('geheim123');
  assert.notEqual(String(store.get('webAuthToken')), 'geheim123');  // nicht im Klartext
  assert.equal(s.lesen(), 'geheim123');
});

test('lesen ohne gespeicherten Token ergibt null', () => {
  const s = createWebAuthStore({ safeStorage: fakeSafeStorage(), store: fakeStore() });
  assert.equal(s.lesen(), null);
});

test('loeschen entfernt den Token', () => {
  const store = fakeStore();
  const s = createWebAuthStore({ safeStorage: fakeSafeStorage(), store });
  s.speichern('geheim123');
  s.loeschen();
  assert.equal(s.lesen(), null);
});

test('ohne Verschluesselung wird NICHT im Klartext gespeichert', () => {
  const store = fakeStore();
  const ss = { ...fakeSafeStorage(), isEncryptionAvailable: () => false };
  const s = createWebAuthStore({ safeStorage: ss, store });
  assert.throws(() => s.speichern('geheim123'), /Verschluesselung/);
  assert.equal(store.get('webAuthToken'), undefined);
});

test('Token ueberlebt eine JSON-Runde wie in electron-store', () => {
  const store = fakeStore();
  const s = createWebAuthStore({ safeStorage: fakeSafeStorage(), store });
  s.speichern('geheim123');
  // Zweiter Store-Zugriff mit frischem Wrapper = wie nach App-Neustart.
  const s2 = createWebAuthStore({ safeStorage: fakeSafeStorage(), store });
  assert.equal(s2.lesen(), 'geheim123');
});
