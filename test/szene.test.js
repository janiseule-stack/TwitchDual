// Szenen-Streifen im Chat (Cozy-Raum Etappe 1b): das Bild fuellt immer die
// ganze Fensterbreite (Janis 10.11.2026: keine Holzwand daneben). Der Faktor
// ist ganzzahlig; ist das vergroesserte Bild hoeher als ein Fuenftel des
// Fensters, wird oben beschnitten.
const { test } = require('node:test');
const assert = require('node:assert');
const S = require('../renderer/lib/szene');

test('faktor: kleinste ganze Zahl, bei der das Bild die Breite fuellt', () => {
  assert.strictEqual(S.faktor(1397), 5);   // 4 x 344 = 1376 reicht nicht
  assert.strictEqual(S.faktor(344), 1);
  assert.strictEqual(S.faktor(345), 2);
  assert.strictEqual(S.faktor(700), 3);
  assert.strictEqual(S.faktor(99999), 8);  // Deckel
});
test('faktor: schmal oder Muell -> 1', () => {
  for (const b of [300, 0, NaN, -5, undefined, 'x', {}]) assert.strictEqual(S.faktor(b), 1);
});
test('masse: Hoehe hoechstens ein Fuenftel des Fensters, sonst die Bildhoehe', () => {
  assert.deepStrictEqual(S.masse(1397, 1332), { faktor: 5, breite: 1720, hoehe: 266 });
  assert.deepStrictEqual(S.masse(700, 2000), { faktor: 3, breite: 1032, hoehe: 216 });
  assert.deepStrictEqual(S.masse(300, 900), { faktor: 1, breite: 344, hoehe: 72 });
});
test('masse: niedriges Fenster behaelt eine Mindesthoehe, Muell -> Bildhoehe', () => {
  assert.strictEqual(S.masse(1400, 200).hoehe, 48);          // 20 % waeren 40
  assert.deepStrictEqual(S.masse(NaN, undefined), { faktor: 1, breite: 344, hoehe: 72 });
});
