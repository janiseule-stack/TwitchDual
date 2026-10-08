// test/integrity-aufruf.test.js
const { test } = require('node:test');
const assert = require('node:assert');
const { createIntegrityAufruf } = require('../src/integrity-aufruf');

function store(start) {
  let satz = start;
  return { holen: () => satz, setzen: (s) => { satz = s; }, verwerfen: () => { satz = null; } };
}
const SATZ = { integrity: 'I1', deviceId: 'D', sessionId: 'S', version: 'V' };

test('vorhandener Satz wird als Kopfzeilen uebergeben', async () => {
  const m = createIntegrityAufruf({ store: store(SATZ), ernte: async () => null });
  const r = await m(async (kopf) => kopf);
  assert.deepEqual(r, { 'Client-Integrity': 'I1', 'X-Device-Id': 'D', 'Client-Session-Id': 'S', 'Client-Version': 'V' });
});

test('kein Satz: ernten, misslingt -> ok:false', async () => {
  const m = createIntegrityAufruf({ store: store(null), ernte: async () => null });
  assert.deepEqual(await m(async () => 'nie'), { ok: false, error: 'Integrity-Kopfzeilen nicht erhalten' });
});

test('Ablehnung: genau einmal neu ernten und wiederholen', async () => {
  let ernten = 0; const kopfe = [];
  const m = createIntegrityAufruf({ store: store(SATZ), ernte: async () => { ernten++; return { ...SATZ, integrity: 'I2' }; } });
  const r = await m(async (kopf) => {
    kopfe.push(kopf['Client-Integrity']);
    if (kopf['Client-Integrity'] === 'I1') { const e = new Error('x'); e.integrity = true; throw e; }
    return 'ok';
  });
  assert.equal(r, 'ok');
  assert.equal(ernten, 1);
  assert.deepEqual(kopfe, ['I1', 'I2']);
});

test('andere Fehler werden durchgereicht', async () => {
  const m = createIntegrityAufruf({ store: store(SATZ), ernte: async () => null });
  await assert.rejects(m(async () => { throw new Error('netz'); }), /netz/);
});
