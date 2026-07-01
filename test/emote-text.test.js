const { test } = require('node:test');
const assert = require('node:assert');
const EmoteText = require('../renderer/lib/emote-text');

const emotes = { OMEGALUL: 'https://cdn/omegalul.webp', catJAM: 'https://cdn/catjam.webp' };

test('ersetzt bekanntes Emote-Wort', () => {
  const t = EmoteText.tokenize('haha OMEGALUL', emotes);
  assert.deepEqual(t, [
    { type: 'text', value: 'haha' },
    { type: 'text', value: ' ' },
    { type: 'emote', name: 'OMEGALUL', url: 'https://cdn/omegalul.webp' }
  ]);
});

test('nur exakte Woerter werden ersetzt (Teilstrings nicht)', () => {
  const t = EmoteText.tokenize('OMEGALULZ', emotes);
  assert.deepEqual(t, [{ type: 'text', value: 'OMEGALULZ' }]);
});

test('mehrere Emotes', () => {
  const t = EmoteText.tokenize('catJAM catJAM', emotes);
  const kinds = t.map((x) => x.type);
  assert.deepEqual(kinds, ['emote', 'text', 'emote']);
});

test('leerer Text -> keine Tokens', () => {
  assert.deepEqual(EmoteText.tokenize('', emotes), []);
});

test('ohne Emote-Map bleibt alles Text', () => {
  const t = EmoteText.tokenize('OMEGALUL', {});
  assert.deepEqual(t, [{ type: 'text', value: 'OMEGALUL' }]);
});
