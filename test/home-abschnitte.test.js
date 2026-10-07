const { test } = require('node:test');
const assert = require('node:assert');
const H = require('../renderer/lib/home-abschnitte');

const kanaele = [
  { login: 'a', live: true }, { login: 'b', live: false }, { login: 'c', live: true }, { login: 'd', live: false }
];

test('teile: Live vor Offline, Reihenfolge bleibt, leere fallen weg', () => {
  const t = H.teile(kanaele, H.STANDARD, false);
  assert.deepEqual(t.map((a) => a.art), ['live', 'offline']);
  assert.deepEqual(t[0].kanaele.map((k) => k.login), ['a', 'c']);
  assert.deepEqual(t[1].kanaele.map((k) => k.login), ['b', 'd']);
  assert.deepEqual(H.teile([{ login: 'x', live: false }], H.STANDARD, false).map((a) => a.art), ['offline']);
  assert.deepEqual(H.teile([], H.STANDARD, false), []);
});

test('Standard: Live offen, Offline zu', () => {
  const t = H.teile(kanaele, H.STANDARD, false);
  assert.equal(t[0].offen, true);
  assert.equal(t[1].offen, false);
  assert.equal(t[0].titel, 'Live');
  assert.equal(t[1].titel, 'Offline');
});

test('Filter aktiv: alles offen, Zustand bleibt unangetastet', () => {
  const zu = { live: true, offline: true };
  const t = H.teile(kanaele, zu, true);
  assert.ok(t.every((a) => a.offen));
  assert.deepEqual(zu, { live: true, offline: true });
});

test('umschalten liefert neuen Zustand', () => {
  const z = H.umschalten(H.STANDARD, 'offline');
  assert.deepEqual(z, { live: false, offline: false });
  assert.deepEqual(H.STANDARD, { live: false, offline: true }, 'Standard unveraendert');
  assert.deepEqual(H.umschalten(z, 'live'), { live: true, offline: false });
});

test('lies: Muell faellt auf Standard, gueltiges bleibt', () => {
  for (const roh of [null, undefined, '', 'kaputt{', '42', '"x"', '[]']) assert.deepEqual(H.lies(roh), H.STANDARD, String(roh));
  assert.deepEqual(H.lies(JSON.stringify({ live: true, offline: false })), { live: true, offline: false });
  assert.deepEqual(H.lies(JSON.stringify({ live: 'ja' })), H.STANDARD);
});
