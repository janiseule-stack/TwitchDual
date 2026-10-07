// Der Preload ist sandboxed (kein require) und traegt eine Kopie des
// Farbfilters. Dieser Test haelt beide gleich und prueft den Einbau.
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const K = require('../renderer/lib/themes');
const preload = fs.readFileSync(path.join(__dirname, '..', 'preload.js'), 'utf8');

test('preload nutzt denselben Farbfilter wie themes.js', () => {
  assert.ok(preload.includes(K.SICHERE_FARBE.source), 'Regex-Kopie fehlt oder weicht ab');
});

test('preload pflegt das Balken-Style-Element', () => {
  assert.ok(preload.includes("'twitchdual-theme'"));
  assert.ok(preload.includes('twitchdual-balken'));
});
