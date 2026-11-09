const { test } = require('node:test');
const assert = require('node:assert');
const P = require('../renderer/lib/scroll-pille');
const T = require('../renderer/lib/teiler');

test('mass: ohne Ueberlauf keine Pille', () => {
  assert.equal(P.mass({ scrollTop: 0, scrollHeight: 500, clientHeight: 500, spur: 500 }), null);
});

test('mass: Hoehe anteilig, oben bei 0, unten am Ende der Spur', () => {
  const oben = P.mass({ scrollTop: 0, scrollHeight: 2000, clientHeight: 500, spur: 500 });
  assert.deepEqual(oben, { top: 0, hoehe: 125 });
  const unten = P.mass({ scrollTop: 1500, scrollHeight: 2000, clientHeight: 500, spur: 500 });
  assert.deepEqual(unten, { top: 375, hoehe: 125 });
});

test('mass: sehr langer Inhalt -> Mindesthoehe, damit man sie noch greifen kann', () => {
  const m = P.mass({ scrollTop: 0, scrollHeight: 100000, clientHeight: 500, spur: 500 });
  assert.equal(m.hoehe, P.MIN_HOEHE);
});

test('scrollTopAus: Umkehrung von mass, auf den gueltigen Bereich begrenzt', () => {
  const g = { scrollHeight: 2000, clientHeight: 500, spur: 500 };
  assert.equal(P.scrollTopAus({ ...g, pillenTop: 375 }), 1500);
  assert.equal(P.scrollTopAus({ ...g, pillenTop: 187.5 }), 750);
  assert.equal(P.scrollTopAus({ ...g, pillenTop: -50 }), 0);
  assert.equal(P.scrollTopAus({ ...g, pillenTop: 9999 }), 1500);
});

test('sichtbar: nur mit Ueberlauf und nur bei Scrollen, Ziehen oder hochgescrollt', () => {
  assert.equal(P.sichtbar({ ueberlauf: false, unten: false, kuerzlich: true, zieht: true }), false);
  assert.equal(P.sichtbar({ ueberlauf: true, unten: true, kuerzlich: false, zieht: false }), false, 'Live-Chat unten: weg');
  assert.equal(P.sichtbar({ ueberlauf: true, unten: true, kuerzlich: true, zieht: false }), true);
  assert.equal(P.sichtbar({ ueberlauf: true, unten: false, kuerzlich: false, zieht: false }), true, 'hochgescrollt');
  assert.equal(P.sichtbar({ ueberlauf: true, unten: true, kuerzlich: false, zieht: true }), true);
});

test('Teiler.istKlick: kaum bewegt = Klick, gezogen = kein Klick', () => {
  assert.equal(T.istKlick({ x: 10, y: 10 }, { x: 12, y: 11 }), true);
  assert.equal(T.istKlick({ x: 10, y: 10 }, { x: 30, y: 10 }), false);
  assert.equal(T.istKlick({ x: 10, y: 10 }, { x: 10, y: 40 }), false);
});
