const { test } = require('node:test');
const assert = require('node:assert');
const { createQuellenGedaechtnis } = require('../src/quellen-gedaechtnis');

test('liefert die geladene Quelle samt passenden Extras', () => {
  const g = createQuellenGedaechtnis();
  assert.equal(g.fuerNeustart(), null, 'noch nichts geladen');
  g.geladen({ mode: 'live', channel: 'papaplatte', ladeId: 3, emotes: {}, badgeCatalog: {} });
  assert.equal(g.fuerNeustart().channel, 'papaplatte');
  g.extrasDa({ ladeId: 2, emotes: { alt: 1 } });          // veraltet
  assert.deepEqual(g.fuerNeustart().emotes, {});
  g.extrasDa({ ladeId: 3, emotes: { KEKW: 'url' }, badgeCatalog: { b: 1 } });
  assert.deepEqual(g.fuerNeustart().emotes, { KEKW: 'url' });
  assert.deepEqual(g.fuerNeustart().badgeCatalog, { b: 1 });
});

test('Home offen: nichts; neuer Kanal verwirft alte Extras', () => {
  const g = createQuellenGedaechtnis();
  g.geladen({ mode: 'live', channel: 'a', ladeId: 1 });
  g.extrasDa({ ladeId: 1, emotes: { x: 1 } });
  g.home(true);
  assert.equal(g.fuerNeustart(), null);
  g.home(false);
  assert.equal(g.fuerNeustart().channel, 'a');
  g.geladen({ mode: 'vod', videoId: '9', ladeId: 2 });
  assert.equal(g.fuerNeustart().emotes, undefined, 'Extras vom alten Kanal weg');
});
