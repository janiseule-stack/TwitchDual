const test = require('node:test');
const assert = require('node:assert');
const R = require('../renderer/lib/raum.js');

test('Konstanten: Bildgroesse, Reihenfolge und Namen der Flaechen', () => {
  assert.deepStrictEqual(R.BILD, { breite: 344, hoehe: 192 });
  assert.deepStrictEqual(R.FLAECHEN.map((f) => f.id), ['plattenspieler', 'fernseher', 'bild', 'lampe', 'regal']);
  assert.deepStrictEqual(R.FLAECHEN.map((f) => f.name), ['Plattenspieler', 'Fernseher', 'Konto', 'Licht', 'Platten']);
  assert.deepStrictEqual(R.HUELLE, { kante: 40, abstand: 4 });
  assert.deepStrictEqual(R.TELLER, { x: 284, y: 113 });
  assert.deepStrictEqual(R.FACH.live, { x: 114, y: 19, b: 175, h: 46 });
  assert.deepStrictEqual(R.FACH.offline, { x: 114, y: 80, b: 175, h: 43 });
  assert.deepStrictEqual(R.FACH.vorn, { x: 114, y: 138, b: 175, h: 52 });
});

test('TV_ECKEN: vier Ecken im Bildschirmbereich', () => {
  assert.strictEqual(R.TV_ECKEN.length, 4);
  for (const e of R.TV_ECKEN) {
    assert.ok(e.x >= 206 && e.x <= 233, 'x ' + e.x);
    assert.ok(e.y >= 52 && e.y <= 90, 'y ' + e.y);
  }
});

test('TV_RECHTECK: Fernseher-Bildschirm, eingefroren', () => {
  assert.deepStrictEqual(R.TV_RECHTECK, { x: 206, y: 52, b: 27, h: 38 });
  assert.ok(Object.isFrozen(R.TV_RECHTECK));
});

test('skalierung: groesster ganzer Faktor, zentriert', () => {
  assert.deepStrictEqual(R.skalierung(1400, 800), { faktor: 4, links: 12, oben: 16 });
  assert.deepStrictEqual(R.skalierung(700, 400), { faktor: 2, links: 6, oben: 8 });
  assert.strictEqual(R.skalierung(300, 150).faktor, 1);
  for (const [b, h] of [[0, 0], [NaN, 5], [-1, -1], ['x', {}]]) assert.strictEqual(R.skalierung(b, h).faktor, 1);
});

test('passtAlsRaum: erst ab Faktor 2', () => {
  assert.strictEqual(R.passtAlsRaum(688, 384), true);
  assert.strictEqual(R.passtAlsRaum(687, 384), false);
});

test('treffer: jede Flaeche in ihrer Mitte, Ueberlappung nach Reihenfolge, daneben null', () => {
  for (const f of R.FLAECHEN) assert.strictEqual(R.treffer(f.x + f.b / 2, f.y + f.h / 2) !== null, true, f.id);
  assert.strictEqual(R.treffer(130, 60), 'regal');
  assert.strictEqual(R.treffer(265, 100), 'plattenspieler');   // liegt auch im Fernseher-Rechteck
  assert.strictEqual(R.treffer(20, 180), null);
  assert.strictEqual(R.treffer(NaN, 3), null);
});

test('treffer: halboffene Raender', () => {
  assert.strictEqual(R.treffer(164, 60), null);
  assert.strictEqual(R.treffer(165, 60), 'lampe');
});

test('zuBild: rechnet Fenster- in Bildkoordinaten', () => {
  assert.deepStrictEqual(R.zuBild(12 + 4 * 100, 16 + 4 * 50, { faktor: 4, links: 12, oben: 16 }), { x: 100, y: 50 });
  assert.deepStrictEqual(R.zuBild(12 + 4 * 100 + 3, 16 + 4 * 50 + 3, { faktor: 4, links: 12, oben: 16 }), { x: 100, y: 50 });
});

test('kameraZiel: Rechteck fuellt das Fenster deckend', () => {
  const z = R.kameraZiel({ x: 206, y: 52, b: 27, h: 38 }, 1400, 800);
  assert.deepStrictEqual(z, { faktor: 52, x: -10714, y: -3292 });
  assert.ok(z.faktor * 27 >= 1400 && z.faktor * 38 >= 800);
  assert.ok(Math.abs(z.x + (206 + 13.5) * z.faktor - 700) < 1);
  assert.ok(Math.abs(z.y + (52 + 19) * z.faktor - 400) < 1);
});

test('fachFenster: gewaehlte Huelle ist immer sichtbar', () => {
  assert.deepStrictEqual(R.fachFenster(30, 0, 175, 0), { start: 0, sichtbar: 4 });
  assert.deepStrictEqual(R.fachFenster(30, 9, 175, 0), { start: 6, sichtbar: 4 });
  assert.deepStrictEqual(R.fachFenster(30, 2, 175, 6), { start: 2, sichtbar: 4 });
  assert.deepStrictEqual(R.fachFenster(3, -1, 175, 5), { start: 0, sichtbar: 4 });
  assert.strictEqual(R.fachFenster(5, 0, 10, 0).sichtbar, 1);
  assert.deepStrictEqual(R.fachFenster(0, -1, 175, 3), { start: 0, sichtbar: 4 });
  assert.deepStrictEqual(R.fachFenster(5, 9, 175, 0), { start: 1, sichtbar: 4 });
});
