const { test } = require('node:test');
const assert = require('node:assert');
const D = require('../src/andocken');

const video = { x: 100, y: 100, width: 800, height: 450 };

test('erkenneSeite: rechts, links, unten innerhalb der Schwelle', () => {
  assert.equal(D.erkenneSeite(video, { x: 912, y: 150, width: 300, height: 400 }), 'rechts');
  assert.equal(D.erkenneSeite(video, { x: -205, y: 120, width: 300, height: 400 }), 'links');
  assert.equal(D.erkenneSeite(video, { x: 150, y: 560, width: 600, height: 300 }), 'unten');
});

test('erkenneSeite: zu weit weg oder ohne Ueberlappung -> null', () => {
  assert.equal(D.erkenneSeite(video, { x: 960, y: 150, width: 300, height: 400 }), null, '60 px Abstand');
  assert.equal(D.erkenneSeite(video, { x: 905, y: 700, width: 300, height: 400 }), null, 'rechts, aber ganz unterhalb');
  assert.equal(D.erkenneSeite(video, { x: 1500, y: 560, width: 300, height: 300 }), null, 'unten, aber seitlich daneben');
});

test('erkenneSeite: ueberlappende Fenster docken nicht', () => {
  assert.equal(D.erkenneSeite(video, { x: 500, y: 200, width: 300, height: 300 }), null);
});

test('position: rechts/links mit Videohoehe, unten mit Videobreite; eigene Breite/Hoehe bleibt', () => {
  const chat = { x: 0, y: 0, width: 320, height: 999 };
  assert.deepEqual(D.position(video, chat, 'rechts'), { x: 900, y: 100, width: 320, height: 450 });
  assert.deepEqual(D.position(video, chat, 'links'), { x: -220, y: 100, width: 320, height: 450 });
  assert.deepEqual(D.position(video, { ...chat, height: 250 }, 'unten'), { x: 100, y: 550, width: 800, height: 250 });
});

test('istGeloest: erst ab mehr als der Schwelle vom Sollplatz weg', () => {
  const soll = { x: 900, y: 100, width: 320, height: 450 };
  assert.equal(D.istGeloest(soll, { ...soll, x: 915 }), false);
  assert.equal(D.istGeloest(soll, { ...soll, x: 950 }), true);
  assert.equal(D.istGeloest(soll, { ...soll, y: 160 }), true);
});

test('liesSeite: nur gueltige Seiten, sonst null', () => {
  assert.equal(D.liesSeite('rechts'), 'rechts');
  assert.equal(D.liesSeite('oben'), null);
  assert.equal(D.liesSeite(undefined), null);
});
