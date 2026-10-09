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

// --- Ein Fenster fuer beide Logins ------------------------------------------
const { oeffneAnmeldeFenster } = require('../src/twitch-web-auth');

function fakeFensterKlasse(cookies) {
  const fenster = [];
  class W {
    constructor() { this.urls = []; this.titel = null; this.zu = false; this.handler = {}; fenster.push(this);
      this.webContents = { session: { cookies: { get: async () => cookies.liste } } }; }
    loadURL(u) { this.urls.push(u); }
    setTitle(t) { this.titel = t; }
    on(ev, fn) { this.handler[ev] = fn; }
    close() { this.zu = true; if (this.handler.closed) this.handler.closed(); }
  }
  W.fenster = fenster;
  return W;
}
function fakeTakt() {
  const t = { fn: null };
  return { setIntervalImpl: (fn) => { t.fn = fn; return 1; }, clearIntervalImpl: () => { t.fn = null; }, tick: async () => { if (t.fn) await t.fn(); }, t };
}

test('Anmeldefenster: erst Twitch-Login, dann im selben Fenster die Aktivierung, dann zu', async () => {
  const cookies = { liste: [] };
  const W = fakeFensterKlasse(cookies);
  const takt = fakeTakt();
  const log = [];
  let geraetFertig = false;
  oeffneAnmeldeFenster({
    BrowserWindow: W, brauchtWeb: true, brauchtGeraet: true,
    onWebToken: (tok) => log.push('web:' + tok),
    starteGeraet: async () => { log.push('geraet-start'); return { verification_uri: 'https://www.twitch.tv/activate?device-code=ABCD', user_code: 'ABCD' }; },
    istGeraetFertig: () => geraetFertig,
    onFertig: () => log.push('fertig'), onAbbruch: () => log.push('abbruch'),
    setIntervalImpl: takt.setIntervalImpl, clearIntervalImpl: takt.clearIntervalImpl
  });
  const w = W.fenster[0];
  assert.deepEqual(w.urls, ['https://www.twitch.tv/login']);
  await takt.tick();
  cookies.liste = [{ name: 'auth-token', value: 'TOK' }];
  await takt.tick();
  assert.deepEqual(log, ['web:TOK', 'geraet-start']);
  assert.equal(w.urls[1], 'https://www.twitch.tv/activate?device-code=ABCD');
  assert.match(w.titel, /ABCD/);
  assert.equal(w.zu, false);
  geraetFertig = true;
  await takt.tick();
  assert.deepEqual(log, ['web:TOK', 'geraet-start', 'fertig']);
  assert.equal(w.zu, true);
});

test('Anmeldefenster: nur Chat fehlt -> direkt zur Aktivierung', async () => {
  const W = fakeFensterKlasse({ liste: [] });
  const takt = fakeTakt();
  oeffneAnmeldeFenster({
    BrowserWindow: W, brauchtWeb: false, brauchtGeraet: true, onWebToken: () => {},
    starteGeraet: async () => ({ verification_uri: 'https://www.twitch.tv/activate?device-code=Q', user_code: 'Q' }),
    istGeraetFertig: () => false, onFertig: () => {}, onAbbruch: () => {},
    setIntervalImpl: takt.setIntervalImpl, clearIntervalImpl: takt.clearIntervalImpl
  });
  await new Promise((r) => setImmediate(r));
  assert.deepEqual(W.fenster[0].urls, ['https://www.twitch.tv/activate?device-code=Q']);
});

test('Anmeldefenster: vorzeitig geschlossen -> Abbruch', async () => {
  const W = fakeFensterKlasse({ liste: [] });
  const takt = fakeTakt();
  const log = [];
  oeffneAnmeldeFenster({
    BrowserWindow: W, brauchtWeb: true, brauchtGeraet: true, onWebToken: () => {},
    starteGeraet: async () => ({}), istGeraetFertig: () => false,
    onFertig: () => log.push('fertig'), onAbbruch: () => log.push('abbruch'),
    setIntervalImpl: takt.setIntervalImpl, clearIntervalImpl: takt.clearIntervalImpl
  });
  W.fenster[0].close();
  assert.deepEqual(log, ['abbruch']);
  assert.equal(takt.t.fn, null);
});
