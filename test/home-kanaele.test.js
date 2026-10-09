const { test } = require('node:test');
const assert = require('node:assert');
const { ladeHomeKanaele } = require('../src/home-kanaele');

const status = async (logins) => logins.map((login) => ({ login, displayName: login, live: login === 'zweiter' }));

test('Favoriten + Gefolgt vereinigt, Flags gesetzt, jeder Login einmal abgefragt', async () => {
  let gefragt;
  const r = await ladeHomeKanaele({
    favoriten: ['streamer', 'nurfav'],
    holeGefolgt: async () => [{ login: 'streamer' }, { login: 'zweiter' }],
    liveStatus: async (l) => { gefragt = l; return status(l); }
  });
  assert.deepEqual(gefragt.sort(), ['nurfav', 'streamer', 'zweiter']);
  assert.equal(r.angemeldet, true);
  assert.equal(r.gefolgtFehler, null);
  const by = Object.fromEntries(r.kanaele.map((k) => [k.login, k]));
  assert.deepEqual([by.streamer.favorit, by.streamer.gefolgt], [true, true]);
  assert.deepEqual([by.nurfav.favorit, by.nurfav.gefolgt], [true, false]);
  assert.deepEqual([by.zweiter.favorit, by.zweiter.gefolgt], [false, true]);
});

test('nicht angemeldet: nur Favoriten', async () => {
  const r = await ladeHomeKanaele({ favoriten: ['streamer'], holeGefolgt: async () => null, liveStatus: status });
  assert.equal(r.angemeldet, false);
  assert.deepEqual(r.kanaele.map((k) => k.login), ['streamer']);
});

test('Gefolgt scheitert: Favoriten trotzdem, Fehler gemeldet', async () => {
  const r = await ladeHomeKanaele({ favoriten: ['streamer'], holeGefolgt: async () => { throw new Error('Helix 500'); }, liveStatus: status });
  assert.equal(r.angemeldet, true);
  assert.equal(r.gefolgtFehler, 'Helix 500');
  assert.deepEqual(r.kanaele.map((k) => k.login), ['streamer']);
});

test('nichts da: keine Live-Abfrage', async () => {
  let gefragt = false;
  const r = await ladeHomeKanaele({ favoriten: [], holeGefolgt: async () => [], liveStatus: async () => { gefragt = true; return []; } });
  assert.deepEqual(r.kanaele, []);
  assert.equal(gefragt, false);
});
