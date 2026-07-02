const { test } = require('node:test');
const assert = require('node:assert');
const Backoff = require('../renderer/lib/backoff');

test('delay: verdoppelt sich pro Versuch (ohne Jitter = Maximalwert)', () => {
  const noJitter = { random: () => 1 };
  assert.equal(Backoff.delay(0, noJitter), 1000);
  assert.equal(Backoff.delay(1, noJitter), 2000);
  assert.equal(Backoff.delay(2, noJitter), 4000);
});

test('delay: gedeckelt bei max', () => {
  const noJitter = { random: () => 1 };
  assert.equal(Backoff.delay(10, noJitter), 30000);
  assert.equal(Backoff.delay(100, { ...noJitter, max: 5000 }), 5000);
});

test('delay: Jitter streut auf 50-100 % des Werts', () => {
  assert.equal(Backoff.delay(0, { random: () => 0 }), 500);
  assert.equal(Backoff.delay(0, { random: () => 0.5 }), 750);
  for (let i = 0; i < 20; i++) {
    const d = Backoff.delay(3); // echter Math.random
    assert.ok(d >= 4000 && d <= 8000, `ausserhalb: ${d}`);
  }
});

test('delay: negative Versuche wie Versuch 0', () => {
  assert.equal(Backoff.delay(-5, { random: () => 1 }), 1000);
});
