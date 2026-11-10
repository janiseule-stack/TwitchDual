// Vergroesserungsfaktor des Szenen-Streifens im Chat (Cozy-Raum Etappe 1b).
const { test } = require('node:test');
const assert = require('node:assert');
const S = require('../renderer/lib/szene');

test('faktor: Breite und 20 % der Hoehe begrenzen', () => {
  assert.strictEqual(S.faktor(1397, 1332), 3);   // Breite erlaubt 4, Hoehe 3
  assert.strictEqual(S.faktor(700, 2000), 2);
  assert.strictEqual(S.faktor(5000, 5000), 6);   // Deckel
});
test('faktor: schmal oder niedrig -> 1', () => {
  assert.strictEqual(S.faktor(300, 900), 1);
  assert.strictEqual(S.faktor(1400, 300), 1);
});
test('faktor: Muell -> 1', () => {
  for (const [b, h] of [[0, 0], [NaN, 500], [-5, 800], [undefined, undefined], ['x', {}]]) assert.strictEqual(S.faktor(b, h), 1);
});
test('masse: Bild mal Faktor', () => {
  assert.deepStrictEqual(S.masse(1397, 1332), { faktor: 3, breite: 1032, hoehe: 216 });
});
