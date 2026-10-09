const { test } = require('node:test');
const assert = require('node:assert');
const SI = require('../renderer/lib/stream-info');

const T = Date.parse('2026-10-09T20:00:00Z');

test('laufzeit: Minuten unter einer Stunde, sonst h:mm', () => {
  assert.equal(SI.laufzeit('2026-10-09T19:15:00Z', T), 'seit 45 min');
  assert.equal(SI.laufzeit('2026-10-09T16:48:00Z', T), 'seit 3:12 h');
  assert.equal(SI.laufzeit(null, T), '');
  assert.equal(SI.laufzeit('2026-10-09T20:05:00Z', T), 'seit 0 min', 'Uhr leicht versetzt');
});

test('zeilen live: Name · Titel oben, Spiel · Zuschauer · Laufzeit unten', () => {
  const z = SI.zeilen({ art: 'live', name: 'ohnePixel', titel: 'ESL Pro League', spiel: 'Counter-Strike', zuschauer: 15870, start: '2026-10-09T16:48:00Z' }, T);
  assert.deepEqual(z, { oben: 'ohnePixel · ESL Pro League', unten: 'Counter-Strike · 15.870 Zuschauer · seit 3:12 h', live: true });
});

test('zeilen offline und VOD', () => {
  assert.deepEqual(SI.zeilen({ art: 'offline', name: 'Streamer' }, T), { oben: 'Streamer', unten: 'offline', live: false });
  const v = SI.zeilen({ art: 'vod', name: 'Streamer', titel: 'Langer Stream', spiel: 'Just Chatting', laenge: 9000, datum: '2026-10-07T18:00:00Z' }, T);
  assert.deepEqual(v, { oben: 'Streamer · Langer Stream', unten: 'VOD · Just Chatting · 2:30 h · vom 07.10.', live: false });
});

test('zeilen: fehlende Teile fallen weg statt "undefined"', () => {
  const z = SI.zeilen({ art: 'live', name: 'x', titel: '', spiel: '', zuschauer: 0, start: null }, T);
  assert.deepEqual(z, { oben: 'x', unten: '0 Zuschauer', live: true });
});
