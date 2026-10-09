const { test } = require('node:test');
const assert = require('node:assert');
const A = require('../renderer/lib/ads-emotes');

test('Liste: die ausgesuchten 7TV-Emotes', () => {
  assert.deepEqual(A.EMOTES.map((e) => e.name), ['Adge', 'block', 'roadblock', 'Stop', 'WARNING']);
  for (const e of A.EMOTES) assert.match(A.url(e), /^https:\/\/cdn\.7tv\.app\/emote\/[0-9A-Z]{26}\/2x\.webp$/);
});

test('naechstes: nie dasselbe wie vorher, immer gueltig', () => {
  for (let i = 0; i < 200; i++) {
    const vorher = i % A.EMOTES.length;
    const n = A.naechstes(vorher, Math.random);
    assert.notEqual(n, vorher);
    assert.ok(n >= 0 && n < A.EMOTES.length);
  }
  assert.equal(A.naechstes(-1, () => 0), 0, 'Start ohne vorheriges');
});
