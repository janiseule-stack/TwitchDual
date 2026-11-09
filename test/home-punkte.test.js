const test = require('node:test');
const assert = require('node:assert');
const { createPunkteAbruf } = require('../renderer/lib/home-punkte.js');

// Aufbau mit Fake-Uhr und manueller Timerliste; Abfragen bleiben offen,
// bis der Test sie beantwortet.
function baue(opts = {}) {
  const z = { zeit: 0, timer: [], abfragen: [], cbs: [] };
  let nextId = 1;
  const api = createPunkteAbruf({
    abfrage: (login) => new Promise((resolve) => { z.abfragen.push({ login, resolve }); }),
    darf: opts.darf || (() => true),
    jetzt: () => z.zeit,
    setzeTimer: (fn, ms) => { const id = nextId++; z.timer.push({ id, fn, ms }); return id; },
    loescheTimer: (id) => { z.timer = z.timer.filter((t) => t.id !== id); },
  });
  api.beiStand((login, stand) => z.cbs.push({ login, stand }));
  z.api = api;
  z.feuere = () => { const l = z.timer; z.timer = []; l.forEach((t) => t.fn()); };
  return z;
}
const tick = () => new Promise((r) => setImmediate(r));

test('fragt erst nach 400 ms', () => {
  const z = baue();
  z.api.vorne('kanal_a');
  assert.strictEqual(z.abfragen.length, 0);
  assert.strictEqual(z.timer[0].ms, 400);
  z.feuere();
  assert.strictEqual(z.abfragen.length, 1);
});

test('schnelles Blaettern: nur letzte', () => {
  const z = baue();
  z.api.vorne('kanal_a');
  z.api.vorne('kanal_b');
  z.api.vorne('kanal_c');
  z.feuere();
  assert.strictEqual(z.abfragen.length, 1);
  assert.strictEqual(z.abfragen[0].login, 'kanal_c');
});

test('veraltete Antwort verworfen', async () => {
  const z = baue();
  z.api.vorne('kanal_a');
  z.feuere();
  z.api.vorne('kanal_b');
  z.abfragen[0].resolve({ ok: true, balance: 5 });
  await tick();
  assert.strictEqual(z.cbs.length, 0);
});

test('gueltige Antwort ruft cb', async () => {
  const z = baue();
  z.api.vorne('kanal_a');
  z.feuere();
  z.abfragen[0].resolve({ ok: true, balance: 0, iconUrl: 'u' });
  await tick();
  assert.deepStrictEqual(z.cbs, [{ login: 'kanal_a', stand: { balance: 0, iconUrl: 'u' } }]);
});

test('Speicher 5 min', async () => {
  const z = baue();
  z.api.vorne('kanal_a');
  z.feuere();
  z.abfragen[0].resolve({ ok: true, balance: 7, iconUrl: 'u' });
  await tick();
  z.cbs.length = 0;
  z.zeit = 4 * 60000;
  z.api.vorne('kanal_a');
  assert.strictEqual(z.cbs.length, 1);
  assert.strictEqual(z.cbs[0].stand.balance, 7);
  assert.strictEqual(z.timer.length, 0);
  assert.strictEqual(z.abfragen.length, 1);
  z.zeit = 6 * 60000;
  z.api.vorne('kanal_a');
  z.feuere();
  assert.strictEqual(z.abfragen.length, 2);
});

test('abgelaufen sperrt bis oeffnen', async () => {
  const z = baue();
  z.api.vorne('kanal_a');
  z.feuere();
  z.abfragen[0].resolve({ ok: false, abgelaufen: true });
  await tick();
  z.api.vorne('kanal_b');
  z.feuere();
  assert.strictEqual(z.abfragen.length, 1);
  z.api.oeffnen();
  z.api.vorne('kanal_b');
  z.feuere();
  assert.strictEqual(z.abfragen.length, 2);
});

test('gesperrt sperrt ebenso', async () => {
  const z = baue();
  z.api.vorne('kanal_a');
  z.feuere();
  z.abfragen[0].resolve({ ok: false, gesperrt: true });
  await tick();
  z.api.vorne('kanal_b');
  z.feuere();
  assert.strictEqual(z.abfragen.length, 1);
  z.api.oeffnen();
  z.api.vorne('kanal_b');
  z.feuere();
  assert.strictEqual(z.abfragen.length, 2);
});

test('ohne Anmeldung keine Abfrage', () => {
  const z = baue({ darf: () => false });
  z.api.vorne('kanal_a');
  z.feuere();
  assert.strictEqual(z.abfragen.length, 0);
  assert.strictEqual(z.timer.length, 0);
});

test('login null -> nichts', () => {
  const z = baue();
  z.api.vorne(null);
  z.feuere();
  assert.strictEqual(z.abfragen.length, 0);
});

test('balance null -> kein cb', async () => {
  const z = baue();
  z.api.vorne('kanal_a');
  z.feuere();
  z.abfragen[0].resolve({ ok: true, balance: null });
  await tick();
  assert.strictEqual(z.cbs.length, 0);
});

test('leeren: Speicher weg, vorne fragt neu', async () => {
  const z = baue();
  z.api.vorne('kanal_a');
  z.feuere();
  z.abfragen[0].resolve({ ok: true, balance: 7, iconUrl: 'u' });
  await tick();
  z.cbs.length = 0;
  z.api.leeren();
  z.api.vorne('kanal_a');
  assert.strictEqual(z.cbs.length, 0);
  assert.strictEqual(z.timer.length, 1);
  z.feuere();
  assert.strictEqual(z.abfragen.length, 2);
});

test('leeren: laufender Timer weg, Sperre zurueck, spaete Antwort verworfen', async () => {
  const z = baue();
  z.api.vorne('kanal_a');
  z.feuere();
  z.abfragen[0].resolve({ ok: false, gesperrt: true });
  await tick();
  z.api.oeffnen();
  z.api.vorne('kanal_b');
  z.feuere();
  z.api.vorne('kanal_c');           // Timer laeuft
  z.api.leeren();
  assert.strictEqual(z.timer.length, 0);
  z.abfragen[1].resolve({ ok: true, balance: 3 }); // kanal_b, nach leeren
  await tick();
  assert.strictEqual(z.cbs.length, 0);
  // Sperre zurueck: wieder gesperrt setzen, leeren hebt sie auf
  z.api.vorne('kanal_d');
  z.feuere();
  z.abfragen[2].resolve({ ok: false, abgelaufen: true });
  await tick();
  z.api.leeren();
  z.api.vorne('kanal_d');
  z.feuere();
  assert.strictEqual(z.abfragen.length, 4);
});

test('leeren: Antwort des alten Kontos fuer denselben Kanal wird verworfen', async () => {
  const z = baue();
  z.api.vorne('kanal_a');
  z.feuere();                         // Abfrage 0 (altes Konto) laeuft
  z.api.leeren();                     // Konto-Wechsel
  z.api.vorne('kanal_a');             // gleicher Kanal sofort wieder vorne
  z.abfragen[0].resolve({ ok: true, balance: 999 });
  await tick();
  assert.strictEqual(z.cbs.length, 0, 'alte Generation darf nicht durchrutschen');
  z.feuere();
  z.abfragen[1].resolve({ ok: true, balance: 5 });
  await tick();
  assert.deepStrictEqual(z.cbs.map((c) => c.stand.balance), [5]);
});

test('anderer Fehler -> kein cb, keine Sperre', async () => {
  const z = baue();
  z.api.vorne('kanal_a');
  z.feuere();
  z.abfragen[0].resolve({ ok: false, error: 'netz' });
  await tick();
  assert.strictEqual(z.cbs.length, 0);
  z.api.vorne('kanal_b');
  z.feuere();
  assert.strictEqual(z.abfragen.length, 2);
});
