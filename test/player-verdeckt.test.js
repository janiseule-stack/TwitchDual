// Preload laeuft nur in Electron - daher Quelltext-Pruefung: der Eingriff
// gegen "Player verdeckt -> Pause" muss VOR dem ersten await im Player stehen.
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

test('preload ueberschreibt isVisible im Player, bevor etwas abgewartet wird', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'preload.js'), 'utf8');
  const start = src.indexOf('(async function setupAdblock()');
  const eingriff = src.indexOf("Object.defineProperty(P, 'isVisible'", start);
  const erstesAwait = src.indexOf('await ', start);
  assert.ok(eingriff > start, 'Eingriff fehlt');
  assert.ok(eingriff < erstesAwait, 'Eingriff muss vor dem ersten await stehen');
  assert.ok(!/defineProperty\(P, 'isIntersecting'/.test(src), 'isIntersecting bleibt echt');
});
