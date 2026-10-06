// test/session-cache.test.js
const test = require('node:test');
const assert = require('node:assert');
const { cachedLoader } = require('../src/session-cache');

function zaehler(werte) {
  let n = 0;
  const fn = async () => werte[Math.min(n++, werte.length - 1)];
  fn.aufrufe = () => n;
  return fn;
}

test('zweiter Aufruf innerhalb der TTL kommt aus dem Speicher', async () => {
  const quelle = zaehler([{ a: 1 }]);
  let jetzt = 0;
  const lade = cachedLoader(quelle, { ttlMs: 1000, now: () => jetzt });
  assert.deepEqual(await lade(), { a: 1 });
  jetzt = 999;
  assert.deepEqual(await lade(), { a: 1 });
  assert.equal(quelle.aufrufe(), 1);
});

test('nach Ablauf der TTL wird neu geladen', async () => {
  const quelle = zaehler([{ a: 1 }, { a: 2 }]);
  let jetzt = 0;
  const lade = cachedLoader(quelle, { ttlMs: 1000, now: () => jetzt });
  await lade();
  jetzt = 1001;
  assert.deepEqual(await lade(), { a: 2 });
  assert.equal(quelle.aufrufe(), 2);
});

// Die Quellen sind fail-soft und liefern bei Fehlern {} oder [] - das darf
// nicht eine Stunde lang festkleben, sonst fehlen nach einem FFZ-Haenger
// alle FFZ-Badges bis zum Ablauf.
test('leeres Ergebnis wird nicht gemerkt', async () => {
  const quelle = zaehler([{}, [], { a: 1 }]);
  const lade = cachedLoader(quelle, { ttlMs: 1000, now: () => 0 });
  assert.deepEqual(await lade(), {});
  assert.deepEqual(await lade(), []);
  assert.deepEqual(await lade(), { a: 1 });
  assert.equal(quelle.aufrufe(), 3);
});

test('Fehler wird weitergereicht und nicht gemerkt', async () => {
  let n = 0;
  const lade = cachedLoader(async () => { if (n++ === 0) throw new Error('weg'); return [1]; },
    { ttlMs: 1000, now: () => 0 });
  await assert.rejects(lade(), /weg/);
  assert.deepEqual(await lade(), [1]);
});

test('gleichzeitige Aufrufe teilen sich eine laufende Abfrage', async () => {
  let n = 0;
  let loese;
  const lade = cachedLoader(() => { n++; return new Promise((r) => { loese = r; }); },
    { ttlMs: 1000, now: () => 0 });
  const p1 = lade();
  const p2 = lade();
  loese({ a: 1 });
  assert.deepEqual(await p1, { a: 1 });
  assert.deepEqual(await p2, { a: 1 });
  assert.equal(n, 1);
});
