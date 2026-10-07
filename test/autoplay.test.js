// main.js laesst sich ohne Electron nicht laden - daher Quelltext-Pruefung:
// der Autoplay-Schalter muss gesetzt sein, BEVOR die App bereit ist.
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

test('main.js erlaubt Autoplay vor app.whenReady', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'main.js'), 'utf8');
  const schalter = src.indexOf("app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required')");
  const bereit = src.indexOf('app.whenReady()');
  assert.ok(schalter > 0, 'Schalter fehlt');
  assert.ok(schalter < bereit, 'Schalter muss vor app.whenReady stehen');
});
