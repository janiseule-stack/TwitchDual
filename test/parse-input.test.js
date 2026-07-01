const { test } = require('node:test');
const assert = require('node:assert');
const { parseInput } = require('../src/parse-input');

test('Channel-Name -> live', () => {
  assert.deepEqual(parseInput('papaplatte'), { mode: 'live', value: 'papaplatte' });
});

test('Channel mit # -> live', () => {
  assert.deepEqual(parseInput('#Papaplatte'), { mode: 'live', value: 'papaplatte' });
});

test('Channel-URL -> live', () => {
  assert.deepEqual(parseInput('https://twitch.tv/PapaPlatte'), { mode: 'live', value: 'papaplatte' });
});

test('VOD-URL -> vod-id', () => {
  assert.deepEqual(
    parseInput('https://www.twitch.tv/videos/123456789'),
    { mode: 'vod', value: '123456789' }
  );
});

test('reine Ziffern -> vod', () => {
  assert.deepEqual(parseInput('123456789'), { mode: 'vod', value: '123456789' });
});

test('v-Praefix -> vod', () => {
  assert.deepEqual(parseInput('v123456789'), { mode: 'vod', value: '123456789' });
});

test('leere Eingabe -> Fehler', () => {
  assert.equal(parseInput('   ').mode, null);
});

test('Unsinn -> Fehler', () => {
  assert.equal(parseInput('!!!///').mode, null);
});
