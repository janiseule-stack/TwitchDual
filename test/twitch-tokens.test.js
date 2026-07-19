// test/twitch-tokens.test.js
const test = require('node:test');
const assert = require('node:assert');
const os = require('os');
const path = require('path');
const fs = require('fs');
const { TokenStore } = require('../src/twitch-tokens');

// Fake-Crypto: "verschluesselt" per base64 (reicht, um die JSON-Logik zu pruefen).
const fakeCrypto = {
  isAvailable: () => true,
  encrypt: (s) => Buffer.from(s, 'utf8').toString('base64'),
  decrypt: (b) => {
    assert.ok(Buffer.isBuffer(b), 'decrypt muss einen Buffer bekommen');
    return b.toString('utf8');
  }
};

function tmpFile() {
  return path.join(os.tmpdir(), 'tw-tokens-' + Math.random().toString(36).slice(2) + '.enc');
}

test('save dann load ergibt dasselbe Buendel', () => {
  const fp = tmpFile();
  const store = new TokenStore(fp, fakeCrypto);
  const bundle = { access: 'AT', refresh: 'RT', userId: '1', login: 'janis', expiresAt: 999 };
  store.save(bundle);
  assert.deepEqual(store.load(), bundle);
  fs.unlinkSync(fp);
});

test('load ohne Datei gibt null', () => {
  const store = new TokenStore(tmpFile(), fakeCrypto);
  assert.equal(store.load(), null);
});

test('Datei enthaelt keinen Klartext-Token', () => {
  const fp = tmpFile();
  new TokenStore(fp, fakeCrypto).save({ access: 'SECRET', refresh: 'R', userId: '1', login: 'j', expiresAt: 0 });
  const raw = fs.readFileSync(fp, 'utf8');
  assert.ok(!raw.includes('SECRET'));
  fs.unlinkSync(fp);
});

test('clear entfernt die Datei', () => {
  const fp = tmpFile();
  const store = new TokenStore(fp, fakeCrypto);
  store.save({ access: 'A', refresh: 'R', userId: '1', login: 'j', expiresAt: 0 });
  store.clear();
  assert.equal(store.load(), null);
});

test('available spiegelt crypto.isAvailable', () => {
  const store = new TokenStore(tmpFile(), { ...fakeCrypto, isAvailable: () => false });
  assert.equal(store.available(), false);
});

test('load bei korrupten/nicht entschluesselbaren Daten gibt null (kein Throw)', () => {
  const fp = tmpFile();
  fs.writeFileSync(fp, 'irgendein-kaputter-inhalt', 'utf8');
  const brokenCrypto = {
    ...fakeCrypto,
    decrypt: () => { throw new Error('decrypt fehlgeschlagen (z.B. safeStorage lehnt Eingabe ab)'); }
  };
  const store = new TokenStore(fp, brokenCrypto);
  assert.doesNotThrow(() => store.load());
  assert.equal(store.load(), null);
  fs.unlinkSync(fp);
});
