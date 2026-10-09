const { test } = require('node:test');
const assert = require('node:assert');
const H = require('../renderer/lib/home-abschnitte');

test('Standard: nur Offline zu', () => {
  assert.deepEqual(H.STANDARD, { favoriten: false, live: false, offline: true, twitch: false });
});

test('umschalten liefert neuen Zustand, Standard unveraendert', () => {
  const z = H.umschalten(H.STANDARD, 'offline');
  assert.equal(z.offline, false);
  assert.equal(H.STANDARD.offline, true);
  assert.equal(H.umschalten(z, 'favoriten').favoriten, true);
});

test('lies: Muell faellt auf Standard, alter Zustand {live, offline} bleibt lesbar', () => {
  for (const roh of [null, undefined, '', 'kaputt{', '42', '"x"', '[]']) assert.deepEqual(H.lies(roh), H.STANDARD, String(roh));
  assert.deepEqual(H.lies(JSON.stringify({ live: true, offline: false })), { favoriten: false, live: true, offline: false, twitch: false });
  assert.deepEqual(H.lies(JSON.stringify({ live: 'ja' })), H.STANDARD);
});
